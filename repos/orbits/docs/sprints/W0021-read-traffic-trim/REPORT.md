# Sprint W0021 — 执行总结

改了哪些文件看 git diff，这里不逐文件复述。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 首页冷启动：计划（`plans/current?view=home`，不读进展记录）、匹配候选、每个进行中批次（`?view=cards`，只读分组与状态列）各只请求一次；计划页首屏计划只由服务端读取，客户端 0 次，候选 1 次（SC-03：组件测试 + 3001 浏览器，开发模式下也是各 1 次）。
  - 计划读取合成一个只读事务、只选界面用到的列；「进入新阶段」只在这一阶段还没记过时才进写事务，边界后第一次打开就看到补充的行动，之后同阶段读取 6 条语句（原 9 条）（SC-02）。
  - 活动归属只读开始时间窗口内已发布活动的三列；workspace 多 100 场大字段旧活动时单次读取的字节、行数、语句数不变（改前同场景从 10,687 B 涨到 224,232 B）（SC-01）。
  - 按 W0017 口径重测：1000 位活跃用户的用户路径数据库出站从约 2,103 MB／月降到约 884 MB／月（SC-04）。
  - 页面可见结果不变：首页今日要事与本周推进，计划页各阶段条目、本周行动、进展记录、人脉需求，名片审阅页的归属询问，改前改后逐字相同（SC-05）。
- 仍未实现或未验证：
  - 计划页每次仍读最多 50 条进展记录：满 50 条时计划页一次约 17.6 KB（首页已不读记录，3.7 KB）。再降需要界面分页（产品决定），本 Sprint 没做。
  - 调配后计划路径 524 MB（原预算 350）、匹配候选 222 MB（原预算 180），用名片与归属省下的额度补足，合计仍 ≤ 1.0 GB。
  - 全量测试里 `tests/pages/event-registration-readback.test.tsx` 在基线和改后都挂起（超过 20 分钟无输出），两次都手动结束该进程后继续；属于原有问题。

## 运行记录

- 结果：completed（等待协调者合并）
- Generator：Claude Opus 5.5／2026-09-29；Planner revision 2（PLANNER.md SHA256 `71aed47a30a6a609dc0fcb0438e80c49a011dfd96ad5ddfe1230c712002c5578`）
- 分支 `sprint/W0021-read-traffic-trim`（基线 `95e39adb`）；功能提交 `c7752eb9`（归属窗口）→ `9f88523d`（计划投影与阶段判定）→ `03125571`（匹配精简列）→ `52b6989f`（客户端共享读取／账号隔离／名片精简读）→ `a048bcf7`（测量脚本与等价测试）→ `3752402f`（全量对照发现的打包修复）→ `0d746c73`（Codex review P1 修复）；`chat-agent` 合并 SHA：等待协调者
- 档位 H；全量对照（`ORBIT_EVENT_DATABASE_URL` 指向本机 orbit_test，未 source .env）：基线 5,653 项 60 失败，改后 5,674 项 61 失败；按用例名对照新增 1 项（`contact-card-browser.test.ts`：新读取模块把 next-auth 客户端带进了纯浏览器打包），已在 `3752402f` 修复并单独重跑通过，修复后新增失败 0（修复后未重跑整套全量，跑了定向集 303/303、该文件单独重跑与 typecheck）。typecheck 通过。
- 付费 AI 调用 0；未 push、未部署、未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘（Generator 写 .md 被 harness 拦下）

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0021-01 活动窗口查询 | pass | `tests/services/event-attribution-window-postgres.test.ts`（orbit_test，4/4，0 skip）：与旧算法候选深相等；+100 场窗口外活动（四种状态、大字段）行数／字节／语句数不变；`== from` 含、`== to` 不含、`to − 1ms` 含、东京午夜、多卡跨日、无效 scannedAt 0 语句、改 session timezone 不变、平局不变；`enable_seqscan=off` 时走 `event_ops_events_public_catalogue_idx`（113 行时默认计划是顺序扫描；2 万行时默认就是 Index Scan，见 `explain-20000-events.txt`）。另 `event-attribution-candidates-route`、`event-attribution` 通过 |
| SC-W0021-02 阶段进入 | pass | `tests/capabilities/plan-current-view-postgres.test.ts`（4/4，0 skip）：边界前一刻（UTC 12/27 14:59:59）不进入；边界（UTC 12/27 15:00 = 东京 12/28 00:00）首次打开写入并看到补充行动；同阶段后续 6 条语句 0 写（旧路径 9 条、字节更多）；同周重新分析（新 plan id）照常首次进入；4 个并发读取结果相同只写一次；API 与计划页 SSR（`readCurrentPlan`）结果相同；`?view=home` 5 条语句不读记录。`agent-plans-routes`、`agent-plans-reanalyze-route`、`plans-repository`（含 W0012 PG 阶段进入）通过 |
| SC-W0021-03 请求上限 | pass | 组件测试（计数权威）：`app-agent-iorbit-home`（冷启动各 1；3 个连续事件合并为每批 1 次；接受匹配后只重读计划 1 次、候选不重读；失败不缓存）、`app-agent-iorbit-screens`（计划页客户端计划 0 次、候选 1 次；打勾 0 次重读；重新分析后计划 1 次）、`app-card-batch-host-agent-pill`（同一标签页 A→B 换账号不读 A 的批次；宿主事件状态相同不重读、变了只重读一次；宿主与读取器共存时读取器只读 1 次）、`app-plan-match-sheet`（手动关联后不再读）、`app-shared-read`（并发共享、一个 abort 不影响另一个、StrictMode 卸载重挂不重发、失败不缓存、写后不交旧值、换账号清空）。浏览器：3001、桌面 1440 与手机 375、控制台 0 错误（`browser-*.json`；开发模式 StrictMode 下各接口仍 1 次） |
| SC-W0021-04 出站对照 | pass | 下方表格；`scripts/measure-plan-read-traffic.ts` 输出 `measure-after-final.txt`；合计 884 MB ≤ 1,000 MB |
| SC-W0021-05 可见结果不变 | pass | 浏览器改前（95e39adb）／改后节点逐字对照 `browser-before-after-1440.json`、`browser-attribution-after.json`；投影快照与完整快照渲染同一计划页 HTML、同一本周推进与推荐理由（`app-agent-iorbit-screens`）；精简名片行与完整详情待确认数相同（`app-iorbit-pending-cards`）；定向集 25 个文件 303/303（`targeted.txt`）；typecheck；全量对照新增 0 |

证据目录：`~/orbit-sprint-evidence/web/sprint-W0021/run-01/`。

### 数据库出站（W0017 口径，本机回环库临时 schema，同一数据集改前／改后各测一次）

「改前」按 95e39adb 的实现逐字复现；计划 GET、待确认名片、匹配候选的改前值与 W0017 报告完全一致（7,526／6,782／3,755）。活动归属改前比 W0017 的 9,970 多，因为这次多了一场窗口内的活动、并实测计入报名读取。

| 路径 | 改前 DB 字节／语句 | 改后 DB 字节／语句 | 改前 HTTP | 改后 HTTP | 每日次数 | 改前 1000 人／月 | 改后 1000 人／月 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 计划：进入新阶段的第一次读取（每阶段一次） | 12,241 / 16 | 10,212 / 16 | — | 4,343 | 0 | — | — | 改前取 W0017 实测 |
| 计划 GET：计划页 SSR／API 默认（含进展记录） | 7,526 / 9 | 4,363 / 6 | 6,174 | 4,343 | 4 | 903 MB | 524 MB |  |
| 计划 GET：首页 ?view=home（不含进展记录） | 7,526 / 9 | 3,695 / 5 | 6,174 | 3,688 | 0 | — | — | 预算按保守口径把 4 次都记为计划页读取；本行只作对照 |
| 周一小结 | 735 / 4 | 735 / 4 | 292 | 292 | 1 | 22 MB | 22 MB | 未改动 |
| 待确认名片（每个进行中批次；改后 ?view=cards） | 6,782 / 2 | 1,198 / 2 | 5,939 | 1,191 | 2 | 407 MB | 72 MB |  |
| 活动归属候选（批次 + 活动 + 报名读取） | 10,687 / 6 | 1,473 / 6 | 117 | 117 | 1 | 321 MB | 44 MB |  |
| 匹配候选（待确认 5 条） | 3,755 / 3 | 1,851 / 3 | 1,931 | 1,931 | 4 | 451 MB | 222 MB | 响应形状未变 |
| 场景：活动归属，多 100 场窗口外活动 | 224,232 / 6 | 1,473 / 6 | — | — | 0 | — | — | 改后与上一行相同 |
| 场景：进展记录 50 条，计划页读取 | 27,859 / 9 | 17,602 / 6 | 25,979 | 17,294 | 0 | — | — | 剩余大头 |
| 场景：进展记录 50 条，首页读取 | 27,859 / 9 | 3,695 / 5 | 25,979 | 3,688 | 0 | — | — |  |
| 用户路径合计（每人每天 70,110 B → 29,460 B） | | | | | | 2,103 MB | 884 MB | 目标 ≤ 1,000 MB |

预算调配（1000 人／月）：计划路径 524 MB（原 350）、匹配候选 222 MB（原 180）、待确认名片 72 MB（原 180）、活动归属 44 MB（原 150）、周一小结 22 MB，余量 116 MB，合计 884 MB。每日次数沿用 W0017 的保守假设。

### 每次页面动作的请求次数

| 页面动作 | 改前 | 改后 |
| --- | --- | --- |
| 打开 iOrbit 首页（冷启动） | `plans/current` 1（完整快照含记录）、`plans/candidates` 1、每个进行中批次完整详情 2（冷启动 1 + 宿主首次广播后重读 1）；宿主另读完整详情 1 | `plans/current?view=home` 1、`plans/candidates` 1、每批 `?view=cards` 1；宿主另读完整详情 1（不在本 Sprint 预算内，未改） |
| 打开「我的计划」 | 客户端 `plans/current` 0（SSR 两个事务）、`plans/candidates` 1 | 客户端 0（SSR 一个只读事务）、`plans/candidates` 1 |
| 名片审阅页归属询问 | `event-attribution/candidates` 1（失败约 2 秒后重试 1 次） | 同左（逻辑未改） |
| 连续 N 个批次事件 | 每个事件每批 1 次 | 150 ms 内合并为每批 1 次；宿主事件状态与已读到的一致时 0 次 |

### 写后失效矩阵

「写后重读」= 写成功后界面主动发的读取；「失效」= `invalidateSharedRead`：写时正在进行的同一读取返回后自动再读一次，界面拿不到写之前的值。

| 写操作 | 写后重读（每种最多一次） | 失效 |
| --- | --- | --- |
| 计划行动打勾／取消（首页、计划页） | 无（用服务端返回的条目与记录合并） | `plans/current`（两种视图） |
| 手动记一笔进展（计划页） | 无（返回的记录放最前） | `plans/current` |
| 接受匹配 | 首页 `plans/current?view=home` 1 次；计划页 `plans/current` 1 次；候选本地移除 | `plans/current`、`plans/candidates` |
| 忽略匹配 | 无（本地移除） | `plans/current`、`plans/candidates` |
| 手动关联联系人（联系人详情） | 无（打开时读一次 home 视图） | `plans/current`、`plans/candidates` |
| 记一次互动（计划页） | `plans/current` 1 次 | `plans/current` |
| 重新分析（计划页） | `plans/current` 1 次 | `plans/current`、`plans/candidates` |
| 名片确认／跳过／取消批次、确认活动归属（随名片确认提交） | 宿主广播带状态与计数的事件，今日要事只在读到的状态不同时重读该批次 1 次 | 批次读取不缓存结果，无需失效 |

## 假设与额外阅读

- 上下文包之外读过（先查调用方）：`features/plans/{repository,contract,phase-refinement,reanalysis,contact-names,matching-repository,matching}.ts`；`features/acquisition/business-card-ingest-v2/{repository,contract}.ts`、`app/api/contact-drafts/business-card/batches/v2/handlers.ts`；`features/events/core/{repository,runtime}.ts`、`event-operations/storage/postgres-client.ts`、`registration/runtime.ts`；`app/(app)/app/agent/iorbit-0918/{iorbit-home,iorbit-plan,plan-match-client,plan-match-sheet,iorbit-plan-card-model}`、`agent/plan/plan-route-view-model.ts`、`contacts/card-batch-0918/{card-batch-host,card-batch-model,use-card-batch}`、`contacts/ingest-v2/ingest-v2-route-view-model.ts`、`app/(app)/app/layout.tsx`；相关测试与夹具。
- 新增路径：`features/events/core/start-window.ts`（`EventStartWindowRecord`，只供归属）、`app/(app)/app/orbit-shared-read.ts` 与 `orbit-shared-read-account.ts`（浏览器端 in-flight 共享与账号同步）、`app/(app)/app/agent/plan/read-current-plan.ts`（从 page.tsx 移出，便于与 API 对照测试）；测试 `event-attribution-window-postgres`、`plan-current-view-postgres`、`app-shared-read`。
- 计划投影去掉的列：计划 `previous_plan_id／source_session_id／archived_at／updated_at`；条目 `plan_id／created_at／updated_at／carried_from_item_id`；记录 `plan_id／author／target_item_id／from_status／idempotency_key`。`deferral_count` 保留（重新分析提示要用）。完整 `PlanSnapshot` 是投影超集，写接口返回的完整条目照常合并。
- 阶段进入的跳过判定 `phaseEntryPending(reader, plan, at)`：目标阶段按计划 `startsOn` 的东京日周次算，存在性查询幂等键 `phase-entered:<planId>:<phaseKey>`；API、SSR、`enterCurrentPhase`、每日维护共用。服务端没有任何跨请求缓存。
- 活动窗口只做粗筛；窗口内已发布活动标题为空时抛 `EventCoreDataError`（接口 503、客户端重试一次），窗口外的坏数据不再让归属失败（旧实现会）。
- 进行中批次登记表按账号分 key（`orbit.cardBatches.active.v1:<Auth.js 用户 id>`）；旧全局 key 在第一次知道账号时并入并删除，并错账号的批次读详情是 404、由宿主移出。没有 SessionProvider 的环境沿用旧 key。登出走整页跳转；换账号时也会 abort 并清空进行中读取。
- 宿主事件改为 `CustomEvent`，带 `{batchId, status, pending, confirmed}`；不带 detail 的事件（登记表增删、跨标签页 storage）照旧全量重读；合并窗口 150 ms。
- 报名读取的测量：运行时单例在模块加载时按环境变量装配、不能指向临时 schema，脚本按 `listRuntimeEventRegistrationsForUser` 同样的三路读取连临时 schema 实测。
- 浏览器验证时会话账号实际是 verify-event（浏览器里已有的 httpOnly 会话 cookie 优先），用的是该账号的计划与名片批次。
- GitNexus：开工时刷新索引（FTS 两张表构建失败，图分析完整）。upstream impact：`fetchCurrentPlan`、`usePendingCards`、`listActiveBatches`、`registerActiveBatch`、`buildPlanWeekSummary`、`buildMyPlanViewModel`、`createEventAttributionCandidateRouteHandlers`、`createIngestV2BatchDetailHandler` 为 CRITICAL；计划服务／仓储、匹配仓储、归属来源等为 UNKNOWN（同名多候选），已用文本搜索补查调用方。detect-changes：提交 1 medium、2 high、3 low、4 critical、5 low、6 low（均非 partial／truncated）。已按 H 档用定向集覆盖。
- 不需要新索引：`event_ops_events_public_catalogue_idx` 已覆盖窗口查询。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| [P1] 会话从 loading 变为 authenticated 后，按账号的批次读取器不重启，看不到 `orbit.cardBatches.active.v1:<user>` 下的批次（Codex `codex review --base chat-agent`，全文 `codex-review.txt`） | 成立 | `useSharedReadAccount` 返回会随会话更新的 `{account, ready}`：loading 时宿主和今日要事都不读登记表，会话已定或换账号时重新读；新增 loading→authenticated 用例（先 RED 后 GREEN，每批仍只读 1 次）；受影响 14 个文件 213/213、typecheck 通过；`0d746c73` |

## 交接

- 接口：`PlanService.getCurrentView({ includeLog })`；`GET /api/agent/plans/current?view=home`；`GET /api/contact-drafts/business-card/batches/v2/:id?view=cards` → `IngestBatchCardStates`；`BusinessCardIngestRepository.getBatchCardStates`；`EventStartWindowReader.listPublishedStartingBetween`；`PlanReader.hasLogIdempotencyKey／activePlanView／viewItems／viewLog`；浏览器端 `sharedRead／invalidateSharedRead`、`useSharedReadAccount`；`dispatchCardBatchChange` 事件 detail。
- 给 W0019（上线后在 Neon 控制台／`ORBIT_PG_READ_METRICS` 按 query fingerprint 对照）：① 投影版 `plans` 读取与 `select 1 as found from plan_log`；② `plan_items` 投影读取；③ `select event_id, title, starts_at from event_ops_events … starts_at >= $2::timestamptz`（每次只返回窗口内几行，不随活动总数增长）；④ `bc_ingest_items` 精简列（`?view=cards`）；⑤ `plan_match_candidates` 精简列。对照 W0017 的 `select * from bc_ingest_items`、`canonicalEventSelect` 全目录读取应明显减少。另盯 `plan_log … order by seq desc limit 50`（计划页）字节随记录增长——剩余大头。
- 需要用户决定：计划页进展记录是否分页／折叠（能把最大单项再降一大截）。
- 回退：`git revert` 这 7 个提交（无迁移、无数据改动）；回退后旧代码读旧全局登记表 key，进行中批次的首页提醒最多丢一次（批次本身不受影响）。
