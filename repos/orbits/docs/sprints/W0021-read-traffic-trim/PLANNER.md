# Sprint W0021 — 用户读取流量瘦身

**Plan revision:** 2（2026-09-29：revision 1 经 Codex 方案 review 后修订，review 全文 `~/orbit-sprint-evidence/web/sprint-W0021/plan-review.txt`，处理见 [REVIEW-2026-09-28.md](../REVIEW-2026-09-28.md) 末尾追加节）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-05。**单一目标:** 页面可见结果不变的前提下，把改版新增用户读取路径的数据库出站（W0017 口径）在 1000 位活跃用户时压到 ≤1.0 GB／月；活动归属候选改为数据库层时间窗口粗筛，不随 workspace 活动总数增长。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD。
**进入条件:** W0017 completed（已满足）。不需要云端授权。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读：
  - `docs/sprints/W0017-traffic-guard/REPORT.md` 的「流量表（SC-04）」与结论：改前每人每天约 69,388 B（计划 GET 7,526 B×4、周一小结 735、待确认名片 6,782×2、活动归属候选 9,970×1（活动目录占 3,188）、匹配候选 3,755×4），1000 人约 2.08 GB／月。**达到 1.0 GB 需把每人每天压到 ≤33,333 B（降约 52%）；只做客户端去重（计划、匹配各减半）约 1.4 GB，只做活动窗口约省 96 MB，都不够。**
  - `scripts/measure-plan-read-traffic.ts`：W0017 测量脚本（本机回环库临时 schema）。第 198 行起只测了 `getBatch + eventCore.listEvents()`，**没走** `resolveEventAttribution()` 与报名读取 `registeredEventIds()`；本 Sprint 要补成完整业务路径。
  - 计划读取两个入口：`app/api/agent/plans/route-handlers.ts` 第 113 行 `GET_CURRENT`（`enterCurrentPhase()` → `getCurrent()`）；`app/(app)/app/agent/plan/page.tsx` 第 45 行 `readCurrentPlan()`（SSR，同样先 `enterCurrentPhase()`，第 124 行把 `initialSnapshot` 传给客户端）。`features/plans/service.ts` 第 1072 行起 `enterCurrentPhase` 可能做 phase refinement（改、插计划项）；周次按计划自身 `startsOn` 的东京日计算（`features/plans/week.ts` 第 44 行），不是自然周。
  - 客户端：`app/(app)/app/agent/iorbit-0918/iorbit-plan-client.ts`（第 59 行 GET current、第 117 行 weekly-summary）；`iorbit-plan.tsx` 第 112 行首帧用 `initialSnapshot`，只在写后 `reloadPlan()`；`use-pending-cards.ts` 第 73 行**每个活动批次各请求一次**，第 109 行监听 `orbit-card-batches`／`storage` 事件重读；`app/(app)/app/contacts/card-batch-0918/card-batch-store.ts` 第 100 行活动批次登记 `ACTIVE_KEY` 是全局 localStorage key，**不分账号**；`use-card-batch.ts` 第 292 行活动归属失败后重试一次。
  - 匹配：`features/plans/matching-service.ts` 第 43、78 行 `listPending({ actorId, batchId })`。
  - 活动归属：`features/plans/event-attribution-runtime.ts` 第 14 行 `listEventsStartingBetween(fromIso, toIso)` 读 `core.listPublishedEvents()` 全目录后内存过滤；逐卡判定在 `features/plans/event-attribution.ts` 第 71 行（东京日比较、最近开始时间、`eventId` 平局），窗口是半开区间 `[from, to)`、from／to 为东京午夜换算的 UTC（同文件第 103 行）。
  - `features/events/core/service.ts` 第 83 行 `PublishedCanonicalEvent`（含 `endsAt`、`timezone` 等并做完整校验）、第 109／129 行 `listEvents`；`features/events/core/storage/postgres-repository.ts` 第 129 行 `listEvents()`。已有索引 `event_ops_events_public_catalogue_idx`（`workspace_id, lifecycle_state_v2, starts_at, event_id`）。
  - `shared/storage/postgres-read-metrics.ts`：读取计量。
- 前序交接要点：
  - W0017：维护任务已按东京日把关；本 Sprint 不碰维护任务与 `plan_maintenance_daily_runs`。
  - W0016：3001 验收 server（`preview_start {name:"orbits-verify"}`）、`verify-*` 账号与 `scripts/verify-session-cookie.ts`；浏览器用 `http://127.0.0.1:3001`；启动后 `next-env.d.ts` 会被改，不要提交，收尾 `git checkout -- next-env.d.ts`；typecheck 报 TS6053 时删 `tsconfig.tsbuildinfo` 重跑。
  - GitNexus 索引可能落后于 HEAD，开工先按根 `CLAUDE.md` 刷新。
- 预算（1000 位活跃用户、数据库出站、月）：计划路径（两个入口合计）≤350 MB；匹配候选 ≤180 MB；待确认名片 ≤180 MB；活动归属候选（含报名读取）≤150 MB；周一小结及余量 ≤140 MB。**开工先用脚本测各项可实现下限，可在各项之间调配，但总和 ≤1.0 GB；凡不做就超预算的方向都是必做项。**可用手段：客户端去重与 in-flight 共享、计划读取合并为单次快照读取并只选所需列、阶段进入的廉价跳过判定、匹配与名片只取渲染所需列（列表与详情分开，或批次摘要端点）、活动窗口查询只取三列。
- 易错边界（都对应到 SC）：
  - 数据库出站（W0017 口径）才是预算口径；HTTP 响应体变小不能替代数据库读取变小。
  - 阶段进入的跳过条件必须绑定 `actorId + planId／版本 + 目标阶段`，按计划 `startsOn` 的东京日计算；不能按星期、自然周或进程内「本周已检查」跳过；两个入口共用同一判定实现。
  - 客户端缓存：key 含账号；同一资源并发读取共享一个 in-flight 请求，一个消费者卸载／abort 不取消其他消费者；失败不缓存；换账号、登出时清除；服务端不得有跨请求、跨账号的模块级缓存；批次详情缓存不能只以 `batchId` 为 key。
  - 写后失效逐项定义（矩阵写进 REPORT）：计划打勾／取消、接受／忽略匹配、手动关联联系人、重新分析计划、名片确认／跳过／取消批次、确认活动归属。
  - 活动窗口：新增专用投影类型（例如 `EventStartWindowRecord`，只供归属使用），不伪装成 `PublishedCanonicalEvent`；SQL 半开区间，不用 `BETWEEN`，不依赖数据库 session timezone；数据库只做粗筛，逐卡判定与平局规则保持不变。
  - 不改 `listEvents`／`listPublishedEvents` 的既有语义；不接付费 AI。

## 范围与文件

- 修改：上面列出的计划路由与 `app/(app)/app/agent/plan/page.tsx`、计划服务／仓储的读取、匹配服务、活动归属来源、iOrbit 客户端读取与 `card-batch-store.ts`（如把活动批次登记改为按账号分 key）、对应测试；新增的时间窗口查询放在 `features/events/core/`。
- 新建：必要测试；扩展 `scripts/measure-plan-read-traffic.ts`（完整归属路径、窗口外大字段活动场景、改前／改后三列对照）。
- 排除：维护任务；审计文档里的历史问题（会话列表、bootstrap 等）；数据库迁移（确需新索引先停下记入 REPORT）；生产部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0021-01 | 活动归属窗口查询：同一固定数据集上，旧算法（全目录 + 内存过滤）与新查询的候选结果深相等；再加 100 场窗口外活动（published／draft／archived／cancelled，带大 description／source_payload）后，新查询返回行数、字节、语句数严格不变，EXPLAIN 走 `event_ops_events_public_catalogue_idx`；边界：`starts_at == from` 含、`== to` 不含、`to − 1ms` 含、东京 00:00（UTC 前一日 15:00）、多张名片跨多日、无效 `scannedAt` 不查、改 session timezone 结果不变；逐卡判定与平局不变 | PG 测试（`orbit_test`，0 skip） |
| SC-W0021-02 | 阶段进入：东京阶段边界前后各读一次；边界后首次打开立即看到 refinement；同一阶段后续读取不再执行进入（语句数下降）；同周新建／重新分析的计划仍执行首次进入；并发读取结果幂等；API 与计划页 SSR 两个入口结果一致 | 服务／路由测试 + PG 测试，断言语句数与结果 |
| SC-W0021-03 | 请求上限（成功冷启动）：首页 `plans/current` ≤1、`plans/candidates` ≤1、每个活动批次 ≤1；计划页 `plans/current` = 0（SSR 另计）、`plans/candidates` ≤1；连续批次事件合并；失败后按现有逻辑最多重试一次；每种写操作只刷新矩阵规定的端点一次、之后不读到旧值；A 登录→读取→登出→B 登录同一标签页不串数据；两组件并发读取只发一次、一个卸载不影响另一个 | 组件测试（计数的权威证据）+ 浏览器网络记录（3001，verify-plan／verify-event，桌面 1440 与手机 375；开发模式 StrictMode 重复 effect 需说明并区分） |
| SC-W0021-04 | 按 W0017 口径重测完整路径，出改前／改后对照表，三列分开：数据库返回字节／语句数、HTTP 响应体字节、每次页面动作请求次数；1000 人用户路径数据库出站合计 ≤1.0 GB／月，各项在（可调配后的）预算内。达不到时如实写差距与剩余大头，不降低目标 | REPORT 表格 + 测量脚本输出 |
| SC-W0021-05 | 页面可见结果不变（固定账号与时钟，比较稳定业务节点：今日要事、本周推进、计划各阶段条目、匹配提示、待确认名片数、归属询问文案），且无新回归 | 改前改后节点对照；定向集；typecheck；一次全量基线对照（RULES §5.2） |

## 最小测试与检查

- 档位：H（共享读取契约、写入路径上的阶段进入、客户端缓存与跨账号隔离）。收口做一次 Codex 代码 review，意见交回同一 Generator 修。
- 开发定向集：计划路由与计划页、计划服务阶段进入、匹配服务、归属来源与 `event-attribution`、iOrbit 首页／计划页与名片批次组件测试（复用 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`）；PG 测试显式导出 `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，先跑 `node scripts/assert-local-test-databases.mjs`。
- 浏览器：3001 验收 server，桌面与手机各一次，网络请求与控制台错误。
- 收口：typecheck；全量基线对照。

## 失败与交接

REPORT 写：各路径做了什么、预算分配与实测、三列对照表、写后失效矩阵、没做的方向及原因、是否需要索引迁移；把「上线后在 Neon 控制台对照哪几项」补给 W0019。
