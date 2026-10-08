# Sprint W0017 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 `git show 4a52e3ca`，这里不逐文件复述。（Generator 子代理无法写报告文件，正文由其交回、协调者落盘。）

## 结果

- 已验证能做到：
  - 3 个计划日任务（阶段、活动参加、活动报名对账）每个东京自然日最多真正执行一次；cron 和队列心跳同时触发、Serverless 多实例都只有一个执行（持久领取记录，不靠内存）。一天里后面的轮次只做一次很轻的状态读取（3 个任务合计 1 条查询，本机实测 228 字节）。东京午夜（UTC 15:00）后重新开始。（SC-01、SC-02、SC-03）
  - 一批到上限或到截止时间没做完，同一天下一轮从断点续批；执行中进程崩溃，租约（300 秒）过期后下一轮接手；运行抛错不记为完成，下一轮重试，当天最多 3 次，之后当天不再试（避免故障时每 10 分钟反复扫描）。（SC-01、SC-02）
  - 名片匹配补跑（`plan-match`）保留每轮执行；空闲时只有一条走 `plan_match_jobs_due` 索引的 due-claim 语句，返回 0 行（EXPLAIN 为 Index Scan）。（SC-03）
  - 改版新增读取路径的单次字节已本机实测，并估算了 100／1000 位活跃用户的月流量（见下表）。（SC-04）
  - 全量测试对照没有新增失败。（SC-05）
- 仍未实现或未验证：
  - 生产库还没有 `plan_maintenance_daily_runs` 表。部署前必须在生产执行 `scripts/migrate-web-runtime.ts`（plan-matching 迁移 v3），需要用户授权。没执行时把关自动放行：任务按旧行为每轮都跑，维护日志里带 `ungated: 1`。业务兜底不会丢，但省不下流量。
  - 活动归属候选里「报名状态读取」、报名对账里的 `readRegistrations`（活动报名运行时有多个提供者）没有实测，表里按每人约 0.5 KB 估算。

## 运行记录

- 结果：completed（合并 SHA 见 README 运行记录）
- Generator：Claude Opus 5.5／2026-09-28；Planner revision 2，SHA256 `3b63ce55efb3b8519cc7c4834f5f8ce6a1f2810cd71b310e9b8a9ff40a77a69e`（开工时已核对一致）
- 分支 `sprint/W0017-traffic-guard`（基线 `eddafe93`）；功能 SHA `4a52e3ca`
- 档位 H。全量对照：两次都导出本机 `ORBIT_EVENT_DATABASE_URL=…/orbit_test`（PG 测试不跳过，所以失败基线比「~30」高）。基线 5642 项，失败 60；改后 5653 项，失败 60；`comm -13` 新增失败 0。两次都有同一个文件 `tests/pages/event-registration-readback.test.tsx` 卡住不退出（与本 Sprint 无关，基线里也卡），都把它的进程结束后继续跑完。
- 定向集：97 项通过、0 skip（先跑了 `node scripts/assert-local-test-databases.mjs`）。`npx tsc --noEmit -p .` 通过。
- 付费 AI 调用：0（匹配 worker 不配模型）。push：未 push，未部署。
- 证据：`~/orbit-sprint-evidence/web/sprint-W0017/run-01/`，包括 `impact.txt`、`targeted-tests.txt`、`full-baseline.txt`／`full-after.txt`／`new-failures.txt`（空）、`traffic-measure.json`（含 EXPLAIN）、`production-schedule-readonly.txt`（只有环境变量名，没有值）、`detect-changes.txt`（13 files，risk low，0 affected processes）、`notes.txt`、`codex-review.txt`。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0017-01 | pass | `tests/services/plan-maintenance-daily-gate.test.ts`：UTC 03:00→14:59:59 多轮 pass，业务查询各 1 次；15:00 再执行 1 次；`hasMore` 续批从 cursor 接着跑。`tests/capabilities/plan-maintenance-daily-gate-postgres.test.ts`：报名扫描在 PG 上按固定顺序分页，一天能扫完全部 |
| SC-W0017-02 | pass | PG 测试（`orbit_test`）：两个独立把关实例并发，只有 1 次执行；8 个并发领取只有 1 个成功；领到后崩溃，租约没过期时别人拿不到，过期后能接手，并从保存的 cursor 继续；崩溃实例迟到的释放不会覆盖接手者的结果；抛错后记 `pending`，下一轮重试成功；当天满 3 次记 `failed` |
| SC-W0017-03 | pass | PG 测试用真实的 4 个任务和读取计量（`createPostgresReadMetricsRunner`）：当天完成后的一轮 pass 只有 2 条语句，一条是 plan-match 的 due-claim（返回 0 行），一条是日任务状态读取（3 行，小于 300 字节）；计划服务写入与报名读取都是 0 次。本机实测：状态读取 228 B，plan-match 空闲 0 B |
| SC-W0017-04 | pass | 下方流量表；`scripts/measure-plan-read-traffic.ts`（只在本机回环库的临时 schema 里造数据，测完删除） |
| SC-W0017-05 | pass | 定向集 97/97；typecheck；全量对照新增失败 0 |

## 每个任务的新运行规则

| 任务 | 规则 |
| --- | --- |
| `plan-phase` | 每个东京日最多真正执行一次。按 actor 排序分批，每批 50 人；到上限或截止时间就停，同一天从 cursor 续批。单个 actor 失败计入 `failed`，第二天再遇到 |
| `plan-event-attendance` | 同上。按 (actor, 活动) 排序分批，每批 50 |
| `plan-event-registration` | 同上。随机抽样改为按 (actor, 活动, 条目) 的固定顺序：每批扫 200 条、重放 ≤50 条，同一天续批直到扫完全部。原来靠每 10 分钟重新随机抽样来覆盖全部，一天一次就覆盖不全 |
| `plan-match` | 不变，每轮执行（补跑不能等一天）；空闲时一条有索引的 due-claim，返回 0 行 |

三个日任务共用一个把关：一轮 pass 里只读一次当日状态（按 pass 的 deadline 记住结果）。抛错或任务表缺失都记为一次失败，当天最多 3 次。领取表不存在（42P01）时放行、不把关。

## 持久记录位置

- 表 `plan_maintenance_daily_runs`：主键 (workspace_id, run_day, task_name)；列 status（pending／running／completed／failed）、lease_token、lease_expires_at、cursor、run_count、failure_count、completed_at。running 必须带租约（check 约束）。
- 迁移：`features/plans/matching-migrations.ts` 的 v3 `plan-maintenance-daily-runs`，已接入 `scripts/migrate-web-runtime.ts`（plan-matching 阶段），只在本机库执行过。
- 代码：`features/plans/maintenance-daily-gate.ts`（把关逻辑与 PG 存储），`PlanMatchingRuntime.dailyRuns`，接线在 `configured-tasks.ts`。
- 每天增加 3 行，一年约 1,100 行，没有做清理。

## 流量表（SC-04）

口径与生产 `ORBIT_PG_READ_METRICS` 相同：每条语句返回行的 JSON 字节之和，不含协议开销。本机测试账号有 30 位联系人、1 份计划（含 5 场活动）、5 场已发布活动，另有两批各 5 张名片。「每日次数」是每位活跃用户的假设，偏保守。

| 路径 | 单次字节（实测） | 语句数 | 每日次数假设 | 100 人／月 | 1000 人／月 |
| --- | --- | --- | --- | --- | --- |
| 计划 GET（`/api/agent/plans/current`，含阶段判定） | 7,526（当周第一次会写「进入新阶段」：12,241） | 9 | 4 | 90 MB | 903 MB |
| 周一小结 | 735 | 4 | 1 | 2.2 MB | 22 MB |
| 待确认名片读取（每个本机进行中批次一次，5 张） | 6,782 | 2 | 2（只在有进行中批次时） | 41 MB | 407 MB |
| 活动归属候选（批次 + 活动目录；报名状态另计，估 ~0.5 KB） | 9,970（其中活动目录 5 场 3,188） | 3 | 1 | 30 MB | 299 MB |
| 匹配候选（5 条待确认） | 3,755 | 3 | 4 | 45 MB | 451 MB |
| 用户路径合计 | | | | 约 208 MB | 约 2.08 GB |
| 维护：当天已完成的一轮（3 个日任务状态读取 + plan-match 空闲） | 228 + 0 | 2 | 144 轮／天（与人数无关） | 1 MB | 1 MB |
| 维护：`plan-event-attendance` 首次执行（1 条待对账） | 5,382 | 11 | 1 | 随待对账数 | 随待对账数 |
| 维护：`plan-phase` 首次执行（无人进入新阶段） | 15 | 3 | 1 | ≈0 | ≈0 |
| 维护：`plan-event-registration` 首次执行（4 个条目） | 532（约 90 B／条目）+ 报名读取估 0.5 KB／人 | 3 | 1 | ≈3 MB（每人 5 条目） | ≈29 MB |
| 对照：W0017 之前的 `plan-event-registration`（每轮扫 200 条 + 约 40 人的报名读取） | ≈38 KB／轮 | | 144 轮／天 | ≈164 MB | ≈164 MB |

结论：

- 3 个日任务从每 10 分钟一次改为每天一次后，报名对账这一项每月从约 164 MB 降到 3–29 MB。当天剩下的轮次合计每月约 1 MB。
- 改版新增的用户读取路径到 1000 位活跃用户时约 2 GB／月，占 5 GB 的 40%。大头是计划 GET 和匹配候选，因为每次打开首页／计划页都读。
- 活动归属候选每次读整个 workspace 的活动目录，包括草稿和已归档（`listEvents` 没有时间过滤），每场约 640 B，所以成本随活动总数增长，与用户本人无关。这是本 Sprint 范围外的发现，建议 W0019 或之后处理。

## 生产调度链路核实（只读）

- `vercel.json`：cron `/api/internal/maintenance` 每天 `0 3 * * *`（UTC）；`app/api/queues/maintenance/route.ts` 有 `maintenance-heartbeat` 的 queue/v2beta 触发器。
- 生产环境变量名（`vercel env ls production`，项目 `orbit-staging-20260917`，只看名字没看值）：没有 `ORBIT_MAINTENANCE_HEARTBEAT` 和 `ORBIT_MAINTENANCE_INTERVAL_SECONDS`。按代码（`maintenanceHeartbeatEnabled`：`VERCEL=1` 且不为 `"0"`），生产的队列心跳是开启的，间隔用默认 600 秒，也就是每天 cron 1 次加心跳约 144 次。这与 2026-09-25 审计里 Vercel 日志看到的约 602 秒间隔一致。`VERCEL=1` 是平台注入的系统变量，不在列表里；按平台约定推断为已设置。
- 当前生产部署的是较早的提交（见审计文档），本 Sprint 的代码没有上线。

## 交给 W0019：上线后在 Neon 控制台观察

1. Data transfer（出站）的日曲线：上线并执行迁移后，不应再有随 10 分钟轮次线性累积的维护读取；按上表，维护部分每月应在个位数 MB。
2. Monitoring／查询统计：`select … from plan_maintenance_daily_runs` 与 `update plan_match_jobs …` 每天各约 144 次，单次返回很小；`plan_items` 的报名扫描每天只出现一批（或少数几批续批）。
3. 表 `plan_maintenance_daily_runs`：每天 3 行，`status = completed`；出现 `failed` 或 `failure_count > 0` 要查维护日志。维护日志里出现 `ungated: 1`，说明迁移没有执行。
4. Compute 活跃时长：600 秒心跳每天唤醒计算约 144 次，会影响 autosuspend 和计算时长。本 Sprint 没有改变这一点，需要结合 Neon 计划的计算额度一起看。
5. 首页／计划页相关读取（计划 GET、匹配候选、活动目录）的出站占比：到 1000 位活跃用户约 2 GB／月。活动目录随活动总数增长。

## 假设与额外阅读

- 上下文包以外读过：`features/plans/match-worker.ts`（`runDueMatchJobs`，确认空闲时只领取一次）、`features/plans/matching-runtime.ts`、`scripts/migrate-web-runtime.ts`、`scripts/run-maintenance-scheduler.ts`、`app/api/internal/maintenance/route.ts`、`vercel.json`、`tests/support/plan-matching-harness.ts`／`plan-fixture.ts`、现有测试 `plan-matching`／`plans-repository`／`plan-phase-refinement`／`event-registration-plan-sync`／`configured-maintenance-reminder-wiring`。测量时还读了：`app/api/agent/plans/route-handlers.ts`（GET_CURRENT）、`app/api/agent/event-attribution/candidates/route-handlers.ts`、`features/plans/event-attribution-runtime.ts`、`features/events/core/{service,storage/postgres-repository}.ts`、`features/events/event-operations/storage/migrations.ts`、`features/plans/matching-service.ts`（listPending）、iOrbit 首页的读取客户端（`use-pending-cards.ts`、`iorbit-plan-client.ts`）。
- GitNexus：开工时索引停在 `267cb35`，W0010–W0015 的符号找不到，按 CLAUDE.md 刷新了索引。刷新后，被改的任务、factory、`createConfiguredMaintenanceTasks`、`runPlanMatchingMigrations`、`createPostgresPlanMatchRepository` 都是 LOW。`getConfiguredPlanMatchingRuntime` 是 MEDIUM（9 个受影响、5 个直接），本 Sprint 只给它的返回值新增一个字段 `dailyRuns`，没有任何地方自己构造这个对象。3 个仓库方法 `listActiveEventItems`／`listUnattendedAttributedEvents`／`listActorsEnteringPhase` 是 UNKNOWN（接口动态分发），用文本搜索补查了全部调用方（configured-tasks、3 个任务、两个测试夹具）。没有 HIGH／CRITICAL。
- 模糊点的选择：
  - 「运行失败」指任务抛错、超时或任务表缺失；单个 actor 的失败不阻挡当天进度，第二天再遇到（与原设计「每日维护兜底」一致）。
  - 失败上限 3 次／天，租约 300 秒（比 240 秒的 pass 预算长，比 600 秒的心跳间隔短）。
  - 迁移缺失时放行而不是跳过，宁可不省流量，也不丢业务兜底。
  - 领取表放在 plan-matching 迁移的 v3，而不是新开一套迁移：它和计划任务同属 plans 功能，也已经接入迁移脚本。
  - `listActiveEventItems` 的返回多了 `itemId`（续批排序用），`plans-repository.test.ts` 的断言相应加上了这个字段。
  - 测量脚本复用了 `tests/support` 的夹具（临时 schema 与造数据），只在本机回环库运行。
- TDD：测试是在实现之后写的，没有单独留下 RED 记录；验收靠 GREEN、边界用例与全量对照。

## Codex 代码 review 与处理

Codex `review --commit 4a52e3ca`（全文 `codex-review.txt`）：结论为把关、租约持久化、cursor 分页与生产接线一致，定向测试与 typecheck 通过，**无可操作的正确性问题**。注意 Codex 环境未设 `ORBIT_EVENT_DATABASE_URL`，其 5 个 PG 用例为 skip；这些用例已由 Generator 在 `orbit_test` 上 0 skip 通过。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 无 | — | 无需修改 |

## 交接

- 接口：`createPlanDailyRunGate({ resolveStore, taskNames, tokyoDate })`，`gate.run(taskName, ctx, execute(cursor) → { summary, hasMore, cursor })`；3 个任务 factory 都有可选参数 `gate`，不传时保持每次调用都执行（测试与直接调用用）。3 个仓库方法新增可选的续批参数：`afterActorId`／`after`。
- 需要用户决定或授权：(1) 在生产执行 `scripts/migrate-web-runtime.ts`，创建 `plan_maintenance_daily_runs`，必须在部署前或和部署一起做，否则把关放行、省不下流量；(2) 1000 位活跃用户时新增用户路径约 2 GB／月，另外活动目录按整个 workspace 读取，是否排进后续 Sprint。
- 回退：`git revert 4a52e3ca`。领取表留在库里无害；或者先不执行迁移，把关就自动放行，等于旧行为。
- 未完成项：报名状态读取的实测；活动目录全量读取的优化（范围外）。
