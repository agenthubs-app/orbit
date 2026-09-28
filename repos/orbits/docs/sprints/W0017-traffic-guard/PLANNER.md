# Sprint W0017 — 线上流量把关

**Plan revision:** 2（2026-09-28 按 Codex 方案 review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-03。**单一目标:** `plan-phase`、`plan-event-attendance`、`plan-event-registration` 改为每东京自然日最多真正执行一次（持久、跨实例）；`plan-match` 保留每轮执行但空闲时只做一次有索引的轻查询；新增读取路径逐一测量并估算月流量。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD。
**进入条件:** 大目标 1（W0001～W0015）全部 completed。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读文件：
  - `docs/operations/2026-09-25-neon-egress-audit.md` 前 60 行：流量模型与结论（出站 = 调用次数 × 每次 SQL 返回字节）。用户未提交的文件，只读不改。
  - `features/operations/maintenance/pass.ts`：`MaintenanceTask { name; run({deadline, now}) }`、结果结构。
  - `features/operations/maintenance/heartbeat.ts`：`DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 600`；看有没有可复用的持久「上次运行」记录。
  - `features/operations/maintenance/configured-tasks.ts`：第 120 行起注册 4 个计划任务。
  - 4 个任务：`features/plans/match-maintenance-task.ts`（`plan-match`，limit 20，领取到期匹配任务）、`features/plans/phase-refinement.ts`（`plan-phase`，limit 50）、`features/plans/event-attendance-reconcile.ts`（`plan-event-attendance`，limit 50）、`features/plans/event-registration-reconcile.ts`（`plan-event-registration`，扫描 200、重放 50，逐 actor 读报名）。
  - 它们用的 SQL：`features/plans/matching-repository.ts` 的 `listActorsEnteringPhase`、`listUnattendedAttributedEvents`、`listActiveEventItems`。
  - `shared/storage/postgres-read-metrics.ts`：`ORBIT_PG_READ_METRICS` 读取计量（测量工具）。
- 调度的真实链路（2026-09-28 核实）：
  - `vercel.json` 第 52 行：`/api/internal/maintenance` 由 Vercel cron **每天 03:00 UTC** 调用一次。
  - 600 秒是队列心跳：`heartbeat.ts` 第 14 行 `DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 600`，`configured.ts` 第 95 行起经 `/api/queues/maintenance` 触发；生产是否启用了这条队列心跳需开工时只读核实（`vercel.json` 的 queue 触发器、生产 env），并写进 REPORT。
  - 每次 pass 顺序运行全部注册任务（`pass.ts` 第 62 行）；4 个计划任务注册在 `configured-tasks.ts` 第 125 行起。
  - **没有逐任务的持久「上次运行」记录**：`heartbeat.ts` 第 40 行起只按 `workspace_id` 存整条心跳的 `last_run_at／last_result`，不能拿来判断单个任务今天是否跑过。需要新建逐任务、按东京日的持久领取记录（per-feature 迁移，写法照 W0007，只在本机库执行）。
- 前序交接要点：各任务已幂等，重复执行不会重复写；本 Sprint 只减少执行频率与读取量，不改业务结果。
- 已定的产品规则（协调者决定）：
  - `plan-match` 服务「用户关掉审阅页后的匹配补跑」，改成每天一次会让补跑最长延迟近 24 小时，所以**保留每轮执行**；但空闲时（没有到期任务）只允许一次有索引的 due-claim 轻查询，并实测其返回字节。
  - 其余 3 个任务每东京自然日最多真正执行一次；到达 limit 时同一天可续批。
- 易错边界：
  - 「每天一次」必须跨进程、跨实例成立（cron 与队列心跳可能同时触发、Serverless 多实例），不能用内存变量。
  - 领取记录要带租约：执行中进程崩溃，租约过期后能被重新领取；运行失败（抛错／超时）不记为完成。
  - 续批需要各任务返回明确的 `hasMore`（或等价的「已处理完」信号）；现有返回值没有统一信号，需要补上。
  - 当天已完成时，一轮 pass 对这 3 个任务的数据库读取合计 ≤1 次轻查询。
  - **PG 测试用独立测试库**：按 `AGENTS.md`「Free-Plan Cloud Budget」，真实 PG 测试的 `ORBIT_EVENT_DATABASE_URL` 应指向本机 `orbit_test`（不存在则创建），与开发库 `orbit_newui_events_20260922` 分开；本 Sprint 的 PG 命令显式覆盖该变量，不改 `.env.local`。

## 范围与文件

- 修改：上述 4 个任务文件、`configured-tasks.ts`、必要时 `heartbeat.ts` 或维护状态存储、对应测试。
- 新建：流量测量脚本放 `scripts/`（只读，本机库），测量结果写进 REPORT；若需要持久「今日已运行」记录的迁移，放在所属 feature 下并接入 `scripts/migrate-web-runtime.ts`。
- 排除：审计文档里的其他历史问题（会话列表、bootstrap 等）；生产配置与部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0017-01 | 同一东京自然日内连续多轮 pass：3 个日任务的业务查询各只执行一次（`hasMore` 续批除外）；跨东京午夜（UTC 15:00）后再次执行 | 维护测试（注入时钟，UTC 14:59／15:00 边界），断言查询次数 |
| SC-W0017-02 | 逐任务、按东京日的持久领取带租约：两个实例（cron 与队列心跳）同时触发只有一个执行；执行中崩溃，租约过期后可重新领取；运行失败不记为完成，下一轮重试 | 真实 PG 测试（`orbit_test`）：并发、租约过期、失败注入 |
| SC-W0017-03 | 当天已完成时，一轮 pass 对 3 个日任务的数据库读取合计 ≤1 次轻查询；`plan-match` 空闲时只有 1 次 due-claim 查询，返回字节实测 | 查询计数断言 + 读取计量 |
| SC-W0017-04 | 新增读取路径流量表：计划 GET（含阶段判定）、周一小结、待确认名片读取、活动归属候选、匹配候选、4 个任务，各自单次返回字节（本机实测：30 联系人、1 份计划、5 个活动的测试账号）、每日调用次数假设、100／1000 活跃用户月流量估算；生产调度链路核实结果 | REPORT 表格 + 只读测量脚本 |
| SC-W0017-05 | 不引入新的回归 | 维护与计划相关测试；typecheck；一次全量基线对照 |

## 最小测试与检查

- 档位：H（跨实例持久状态、并发）。
- 开发定向集：4 个任务的测试、`configured-maintenance-*` 测试、计划 PG 测试（导出本机 `ORBIT_EVENT_DATABASE_URL`，先跑 `node scripts/assert-local-test-databases.mjs`，0 skip）。
- 收口：typecheck；全量基线对照。
- 不运行：浏览器（无可见变化）；App 端。

## 失败与交接

REPORT 写明每个任务的新运行规则、持久记录位置、流量表；把「上线后在 Neon 控制台观察哪几项」交给 W0019。
