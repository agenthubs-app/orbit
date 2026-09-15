# Sprint 0030 — 收件箱 Ink & Signal 统一信息流执行报告

## 结果

Sprint 0030 的全部实现 epoch 已完成。App 默认收件箱现按批准的 `3a-收件箱` 设计显示单一时间流、四个筛选和经服务端回执确认的“全部已读”；现有会话详情、带参数起草、回复预览、隐私控制、投递卡片和关系信号确认入口继续保留。

run-01 在 `codex/e-line-sprint-0030` 上完成。集成基线为 `01bcceeb5c11113c8677ca9e89be39d9678fb0bc`，产品与测试固定 HEAD 为 `4d351f0a0eddc1479eebb3a6b6852a466cad322d`。本线没有自行合并 `chat-agent`。

根 `AGENTS.md`、`CLAUDE.md` 和未跟踪的 `repos/orbit-app/docs/designs/2026-09-15-notes-contact-picker/` 始终未暂存、未提交。

## 实现

| 能力 | 最终行为 | commit |
| --- | --- | --- |
| 统一投影 | 把真实 conversation、notification 和 relationship signal 转为稳定排序的 activity/task/contact/assistant 信息流；严格 actor、ID、时间、分类和安全地址解码 | `9ae2bbbed` |
| 30 天口径 | 仅对有可信发生时间的记录应用 `[now-30d, now]`；时间缺失的旧任务提醒仍可见，但不显示“最近 30 天”完成声明 | `9ae2bbbed`、`d591e935f` |
| 全部已读 | 只提交带可验证 read action 的未读项；去重、固定并发 4、逐项核对 ID/state/timestamp 回执，部分失败保持可重试 | `cd7cc6fd6` |
| 3a 默认界面 | 48 pt 工具栏、全部/活动/待办/人脉四筛选、20 pt gutter、8 pt 未读点、68 pt 行、15/12 pt 字体和 hairline 分隔；移除默认搜索、卡片和“写消息” | `4930c3383` |
| 旧提醒兼容 | 无时间但有 `followupTaskId` 的旧提醒进入待办流；无显式 href 时用安全编码的 canonical task 地址，显式但不安全的 href 继续 fail closed | `d591e935f`、`5b3b4e28f` |
| 全局测试迁移 | 旧工作区用例改为验证扁平空状态和带参数起草入口，不再等待已移除的搜索框或默认“写消息” | `4d351f0a0` |

`relationshipAlertsToView` 的 HIGH 风险实现没有修改。GitNexus 对新文件及 `inboxNotificationActions` 的当前索引返回 target not found / UNKNOWN；没有把该结果解释为低风险，实际范围通过定向、完整回归和原生链路核对。

## TDD 与自动化

| 阶段 | RED | GREEN |
| --- | --- | --- |
| feed adapter | 0/1，缺少实现 | 回归 80/80 |
| batch coordinator | 0/1，缺少实现 | 14/14 |
| 3a 界面 | 0/1，旧字号/结构不符 | 视觉状态 14/14 |
| 旧任务提醒投影 | 9/10，记录被丢弃 | 80/80 |
| 旧任务提醒导航 | 29/30，action 无 href | 导航与安全回归 50/50 |
| 全局工作区迁移 | 首轮完整回归 2825/2828，3 条旧入口断言失败 | 单文件 44/44；最终完整 App 2828/2828，0 fail、0 skip |

最终 inbox matrix 为 231/231；`npm run typecheck` 通过。完整日志和脱敏运行数据位于 `repos/orbit-app/build/harness-state/evidence/sprint-0030/run-01/`，其中最终全量日志为 `app-full-final-rerun.log`。

## 设计 QA

批准源图 [`assets/3a-inbox.png`](assets/3a-inbox.png) 与最终 RNW 实现图均为 780×1688 px。首轮 80 pt 行高和 14 pt 垂直 padding 明显偏松；测试先收紧后改为 68 pt / 12 pt，最终同视口比较无 P0、P1、P2 差异。详见 [`design-qa.md`](design-qa.md)，其结论为 `final result: passed`。

## 真实 Web / App 验收

- Web/API：实际 Next.js production server 持续运行在 `http://127.0.0.1:31019`，PID 76546，Web checkout `d37d6545dc2a588fe595cea25f1c5991c0e93a77`，`/api/health` 为 `live/ok`，数据源为 PostgreSQL。本 Sprint 没有修改 Web/API 源码，所以没有触发重建/重启条件。
- 同账号：用户确认已在本地 Web 登录；认证 API 同时确认 canonical account `user_orbit_primary_qa`、显示名 `Orbit QA`、语言 `zh` 和同一 live record store。浏览器自动化运行时没有暴露可控 browser，因此不伪造 DOM 截图。
- App：iPhone 17 Pro Simulator `9BF990F2-45B8-42CE-8543-E583B941DA17`，bundle `app.agenthubs.orbit`；当前源码原生构建成功，0 error、0 warning。
- 连接：诊断发现模拟器原先保存了 `RCT_jsLocation=127.0.0.1:8083`，因此曾加载旧 bundle。验收时改为当前分支 Metro `192.168.1.108:8081`，并用本地 TCP bridge `192.168.1.108:31020 → 127.0.0.1:31019` 访问同一 Web/API 进程；没有复制后端或数据库。
- 真实数据：0 个 conversation、40 条 task reminder、200 条 pending relationship signal；40 条提醒均有 `followupTaskId`，但没有可信 occurrence timestamp；200 条 signal 全部早于 30 天。
- 原生结果：默认显示 `全部 40`；活动 0、待办 40、人脉 0。单条打开先取得 read 回执，使计数 40→39，再进入 `/tasks/:id`。全部已读期间按钮禁用，最终服务端 `notificationInteractions` 为 40/40 read；下拉刷新和 Home→前台恢复后仍为 0 未读。

## 精确运行限制

QA payload 没有 30 天内的 activity/contact/IORBIT 项，也没有 conversation，因此这些真实行和 conversation detail 无法在该账号现场点击；对应投影、筛选、显式信号确认、详情和 seeded composer 已由确定性 UI/生命周期用例覆盖。为了不向 QA 数据制造假记录，没有人为插入这些类别。

`/api/tasks` 只有 1 个 canonical task，而 40 个历史提醒的 `followupTaskId` 与其交集为 0。原生已证明安全地址和路由生效，但详情正确显示“没有找到对应内容”；这属于现有 QA 数据引用缺口。live partial-failure 也未通过破坏服务或伪造回执制造，恢复语义由 batch 及界面测试覆盖。

这些限制登记在 BR-021，不阻塞 Sprint 0030 的实现完成；若要把 BR-021 提升为 `verified`，需提供包含当前 activity/contact/IORBIT/conversation 且目标仍存在的 QA 数据，并提供可控的单项 read 失败环境。

## 边界与交接

- 没有 Web/API 产品改动、Schema 变更、数据库迁移、provider 调用、外部消息、远程部署或生产数据写入；唯一运行写入是本地 QA 账号的 40 个 notification read 状态。
- source/test 提交顺序：`9ae2bbbed` → `cd7cc6fd6` → `4930c3383` → `d591e935f` → `5b3b4e28f` → `4d351f0a0`。规划提交为 `213a6681c`。
- 总控应在 `chat-agent` 上按提交顺序集成，并在精确合并树复跑 App typecheck、完整 suite 和原生 smoke；本线不并发合并主线。
