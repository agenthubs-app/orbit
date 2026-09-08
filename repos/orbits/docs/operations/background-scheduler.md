# 独立后台调度：维护通道与队列心跳

状态：代码、单元与真实 PostgreSQL 测试、本机单次运行已完成；提交 `aa2ef096` 已部署到 Preview `orbit-cbnyba82i`（固定地址已切换），云端心跳链已观察到启动与首个周期 tick（见「云端证据」）。

## 问题

队列 worker、重试和崩溃恢复都依赖某个唤醒消息存在。没有独立调度时，丢失的唤醒（发送失败、消息过期、消费者崩溃超过重试上限）不会被任何东西补回；原件过期回收、孤立衍生图清理、密码重置与通知补发也都只在别的工作顺带触发时执行。`web-readiness.md` 记录过：Vercel Preview 不运行原生 Cron，已有的 `/api/internal/business-card/dispatch`、`/api/internal/agent/dispatch` 与 `/api/auth/password-reset/worker` 入口都需要外部定时服务调用，而这个调用方一直没有。

## 实现

### 一次维护扫描（`features/operations/maintenance/pass.ts`）

`runMaintenancePass` 顺序执行一组幂等任务，每个任务单独捕获失败；总预算默认 240 秒，超过预算后剩余任务记为 `skipped: budget_exhausted`。返回只包含名称、状态、耗时、原因码和数字汇总；抛出的异常只保留错误类名，不把 provider 或数据库原文写进日志或响应。

生产任务列表（`configured-tasks.ts`）：

| 任务 | 做什么 | 未配置时 |
| --- | --- | --- |
| `business_card_redispatch` | 数据库仍有名片待办、到期原件或待清理时，每代补发一条队列唤醒 | 无队列（非 Vercel）或无数据库 → skipped |
| `agent_action_redispatch` | 补发超过 120 秒未领取或租约过期的 agent 动作 | 同上 |
| `password_reset_redelivery` | 最多投递 3 封持有租约的重置邮件 | 无邮件配置 → skipped |
| `raw_upload_reclaim` | 物理删除已消费或过期、且所有上传许可都已过期的原件（V1/V2） | 非私有 Blob → skipped |
| `derivative_image_reclaim` | 回收从未挂接到批次项目的 V2 衍生图；V1 衍生图由 V1 队列 tick 内部回收 | 文件系统存储 → skipped |
| `notification_redelivery` | 对全部开启推送的账号执行一轮信号物化与通知投递，受剩余预算限制 | 无推送数据库或 Event Core → skipped |

通知投递的一轮逻辑抽取到 `features/notifications/delivery-pass.ts`，常驻脚本 `scripts/run-notification-delivery-worker.ts` 改为循环调用同一函数，输出格式不变。

### 三种触发来源

1. **`GET /api/internal/maintenance`**：沿用 `CRON_SECRET` Bearer 恒定时间校验、最短 32 字符、禁止查询参数；执行一次扫描并确保队列心跳链存在。任一任务失败或心跳启动失败返回 503。`vercel.json` 新增 `crons`，每天 03:00 UTC 调用一次——这是 Vercel 各档套餐都允许的频率，用途是生产环境的兜底与心跳修复，不是主要节拍。
2. **队列心跳（`heartbeat.ts` + `POST /api/queues/maintenance`）**：`maintenance-heartbeat` 主题的消息带 `chainId` 与 `seq`。消费者在 `orbit_maintenance_heartbeat` 行上 `FOR UPDATE`：`seq` 与行一致才执行扫描并推进 `seq`，随后以 `ORBIT_MAINTENANCE_INTERVAL_SECONDS`（默认 600，限 60–3600）延迟发送下一条；上一条 `seq` 的重投只在其发送未确认时补发，不重复扫描；其他情况视为被替换的链，丢弃且不再入队。心跳自转不依赖 Cron，因此 Preview 也能持续运行。链启动或修复由 `ensureMaintenanceHeartbeat` 完成：无行则启动；`next_due_at` 逾期超过两个周期视为链已死，用新 `chainId` 重启。启动入口有三个：内部维护 GET、名片队列消费者、agent 动作队列消费者（后两者在各自工作完成后尽力调用，失败只记聚合日志，不影响原消息）。因此 Preview 上第一次名片或 agent 后台唤醒就会拉起心跳。`ORBIT_MAINTENANCE_HEARTBEAT=0` 可关闭。
3. **`npm run maintenance:scheduler` / `maintenance:once`**：无 Vercel 队列的环境（本机、VM、容器）在进程内按周期循环；`--once` 单次执行，任务失败时退出码非零，适合外部 cron。

表 `orbit_maintenance_heartbeat` 在首次使用时以 advisory lock 幂等创建，不依赖名片摄取模块的迁移。

## 验证

- `tests/services/maintenance-pass.test.ts`：任务隔离、部分失败计数、预算耗尽、日志异常不影响结果、错误原文不泄漏；HTTP 入口 401/400/200/503 与心跳失败的响应形状。
- `tests/services/maintenance-heartbeat.test.ts`：消息形状守卫、周期钳制；真实 PostgreSQL 隔离 schema 覆盖启动、活链不重复启动、跨工作区隔离、tick 执行与推进、重复投递丢弃、发送失败后重投只补发不重扫、逾期两个周期后重启并拒绝旧链、未知工作区、三路并发只执行一次。
- 关联回归 28 项通过（补发扫描、原件仓储与队列、通知投递账本、canonical 提醒源、通知路由）。类型检查保持 109 条既有诊断，无新增；生产构建结果见提交记录。
- 本机 `npm run maintenance:once`：队列任务在非 Vercel 环境按预期 skipped，其余任务对本机配置执行完成（结果见 `/tmp/orbit-maintenance-once.log`）。
- 本机开发服务器：`/api/internal/maintenance` 无凭证与错误凭证均 401；`/api/queues/maintenance` 非队列请求 401。

## 云端证据（2026-09-08，Preview `orbit-cbnyba82i-liqys-projects-33c8ddec.vercel.app`）

部署自干净 worktree（不含工作区其他未提交改动）。用全新空账号跑一遍名片旅程后，`vercel logs` 显示：

- 02:25:22Z `POST /api/queues/business-card` → `{"event":"maintenance_heartbeat_bootstrap","outcome":"started"}`：第一次名片队列唤醒即拉起心跳链，没有任何手工触发或 Cron。
- 02:35:43Z `POST /api/queues/maintenance` 200 → `{"event":"maintenance_heartbeat_tick","seq":0,"outcome":"ran"}`：延迟 600 秒的首条消息按期到达并执行了一次维护扫描（实际间隔 621 秒）。
- 02:45:54Z `POST /api/queues/maintenance` 200：第二次消费者调用，距首个 tick 611 秒，说明消费者自己发出的延迟消息也被队列按期投递；请求日志列表只保留了该请求的 pg SSL 告警行，seq 1 的 `outcome` 字段未在列表中捕获到，需要在后续周期或日志面板中确认。

日志只查看 `event` 聚合字段，未读取任何配置密钥。证据文件：`/tmp/orbit-heartbeat-logs-1.jsonl`、`/tmp/orbit-heartbeat-logs-2.jsonl`、`/tmp/orbit-heartbeat-logs-4.jsonl`。本机 `.env.local` 指向的数据库与 Preview 不同（表不存在），无法从本机核对 Preview 的心跳行。

## 验收缺口

- 已观察到启动、seq 0 执行与第二次调用；更长时间的自转（数小时、跨部署）与队列消息保留 7 天的实际行为仍需持续观察。
- 生产 Cron 的 03:00 UTC 触发需要在生产部署后核对一次。
- `CRON_SECRET` 已在 Preview 存在（仅核对名称），手工触发内部 GET 需要持有该密钥的人执行；本轮没有读取或使用它。
