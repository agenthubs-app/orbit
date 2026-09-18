# Sprint 0072 — 域水位线与条件请求

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase B 第二项（0072）。
**单一目标:** 数据未变的重复 GET 不再触发业务读——服务端一条水位线 SQL 判定、回 304，客户端回放。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `d45474da8`（0071 completed）。
**进入条件:** 0071 completed。只用本机 Postgres，不连云端，不部署。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| 既有条件请求基建 | 服务端 **无** ETag／If-None-Match／304；App `client.ts` **无** 304 处理（grep 命中皆为 "tag" 字样） |
| 索引 | `orbit_records_workspace_collection_idx (workspace_id, collection_name, lifecycle_state, updated_at desc)`；私有记录 `orbit_records_private_owner_idx (workspace_id, collection_name, user_id, updated_at desc) where lifecycle_state <> 'deleted'` |
| App 端 GET 频次（route-domain-inventory） | events 38、contacts 12、schedule-items 11、contact-drafts 10、tasks 9、profile 9、connections 8、dashboard 7、notes 5 |
| 路由依赖集合（静态盘点） | tasks→`tasks`（user_id）；notes→`notes`（user_id）；schedule-items→`personal_schedule_items`,`personal_schedule_occurrence_exceptions`（user_id）；contacts→`contacts`,`connections`,`contact_detail_states`,`contact_introductions`,`contact_actor_links`,`evidence`（workspace）；connections→`connections`,`contacts`,`tasks`（workspace）；events→`events`,`event_registrations`,`contacts`,`profiles`,`accounts`,`human_encounters`,`notifications`,`tasks`,`event_confirmed_followups`（workspace） |
| 授权纪元 | `/api/sync/lease` 尚未实现（0075）。可用的替代键：账号授权相关集合 `accounts`,`auth_users`,`permissions` 的 workspace 级水位 |
| handler 注入点 | tasks／notes／schedule-items 已有 `dependencies` 参数；contacts／events 只注入 `resolveActor`；connections 无注入 |

**判断 1：ETag 必须覆盖"响应会因什么而变"的全部输入。** 指纹 = `sha256(routeKey, url.search, actorId, workspaceId, 依赖集合水位, 授权集合水位, 代码版本)`。
代码版本取 `ORBIT_READ_ETAG_VERSION ?? VERCEL_GIT_COMMIT_SHA ?? "dev"`：部署后序列化格式变了也不能让客户端回放旧体。
**判断 2：私有域按 `user_id` 分水位，workspace 域整体分水位。** 前者保证 B 的写入不使 A 失配（0070 拓扑负例）；后者粗但正确（联系人可见性经 connections.accountId 推导，无法按人分）。
**判断 3：水位线 = `max(updated_at)` + `count(*)`（非 deleted）。** count 抓硬删除；软删除本身会推 `updated_at`。
**判断 4：dashboard 与 profile 本 Sprint 不接。** dashboard 静态盘点不出依赖集合（聚合 provider 用 SQL 直读），接错等于返回陈旧数据；profile 走 `profile_mutations`，语义待查。宁可少接也不错接。
**判断 5：App 端缓存只放内存。** 不触碰离线读取策略（`readPersistence`）与快照层；304 回放上一次的 envelope。

## 范围与文件

- 新建（orbits）：`shared/storage/domain-watermark.ts`（`readDomainWatermark({client, workspaceId, collections, userId?})` 一条 SQL；`READ_AUTHORIZATION_COLLECTIONS`）、
  `app/api/_shared/conditional-read.ts`（`conditionalJsonRead(request, scope, produce)`：算 ETag、比对 `If-None-Match`、304 或执行 produce 并附 `ETag` + `Cache-Control: private, no-cache` + `Vary: Cookie`；mock 模式或无 SQL client 时直通）。
- 修改（orbits，6 路由）：`app/api/tasks/collection-handler.ts`、`app/api/notes/collection-handler.ts`、`app/api/schedule-items/handler.ts`、
  `app/api/contacts/handler.ts`、`app/api/connections/route.ts`、`app/api/events/handler.ts` 的 GET 各包一层；为无注入点的 handler 增加可选 `conditionalRead` 依赖（默认从 `createConfiguredPostgresLiveRecordStore()?.client` 组装）。
- 新建（orbits 测试）：`tests/services/domain-watermark-postgres.test.ts`（真实 PG：1 行、EXPLAIN 走索引、user_id 分水位、软删／硬删都变）、
  `tests/api/conditional-read.test.ts`（helper 纯逻辑：命中 304 不调 produce、失配调 produce 并带 ETag、版本变失配、search 不同失配）、
  `tests/api/conditional-routes-postgres.test.ts`（6 路由 200→304→写入→200；读指标证明 304 时仅 1 条 SQL／1 行；B 写待办 A 不失配；`permissions` 写入全部失配）。
- 修改（App）：`src/api/client.ts`（GET+JSON：内存 `Map<cacheKey,{etag, envelope}>`，发 `If-None-Match`，304 回放）；新建 `tests/api-client-conditional.test.ts`。
- 修改（App）：`src/data/offline-read/route-domain-inventory.ts` 若守卫要求登记新 header 行为则按既有约定登记（预计不需要）。
- 排除：dashboard／profile／ai／inbox 路由；持久化 ETag 缓存；服务端响应体缓存；epoch／lease 真实实现（0075）；搜索索引（0073）；部署；云端。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0072-01 | **水位线廉价且正确**：真实 PG 上 `readDomainWatermark` 返回 1 行；`set local enable_seqscan=off` 下 EXPLAIN 出现 `orbit_records_workspace_collection_idx` 或 `orbit_records_private_owner_idx`；插入／更新／软删／硬删任一都改变水位；带 `userId` 时另一用户的写入不改变水位 | `domain-watermark-postgres.test.ts` |
| SC-0072-02 | **未变即 304 且零业务读**：6 条路由各自——第一次 200 带 `ETag`，同 ETag 第二次 304 无 body；读指标证明第二次仅 1 条 SQL、1 行 | `conditional-routes-postgres.test.ts` |
| SC-0072-03 | **变了立刻失配**：写入本人一条记录后带旧 ETag → 200、新 ETag ≠ 旧；B 写自己的待办后 A 的 `/api/tasks` 仍 304（0070 拓扑夹具）；`permissions`／`accounts`／`auth_users` 任一 workspace 记录写入 → 6 路由全部 200；`ORBIT_READ_ETAG_VERSION` 变 → 200；`?status=open` 与无参数的 ETag 不同 | 同上 + `conditional-read.test.ts` |
| SC-0072-04 | **App 回放**：client 对 GET 第二次自动带 `If-None-Match`；fetch 回 304 时返回上一次的 envelope（`success/data` 逐字段相等）且 `status` 标为 200、`meta.fromCache=true`；非 GET／bytes／失败响应不进缓存；换 actorId（Cookie）不命中 | `tests/api-client-conditional.test.ts` |
| SC-0072-05 | **运行时**：Simulator 进入待办页两次，服务端日志第二次为 304；phoneweb 同；两端 typecheck 0；App 全量与 orbits 全量前后对照零新增失败（before 取 0071 收口：App 3483/3483，orbits 4212/3971/86） | 日志、截图、摘要 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. RED：`domain-watermark-postgres.test.ts` → 实现 `domain-watermark.ts` → GREEN。
3. RED：`conditional-read.test.ts` → 实现 `_shared/conditional-read.ts` → GREEN。
4. RED：`conditional-routes-postgres.test.ts`（6 路由）→ 逐路由接线 → GREEN。
5. RED：App `api-client-conditional.test.ts` → 改 `client.ts` → GREEN；跑 App 既有 `api-client.test.ts`。
6. 两端 typecheck；orbits 全量、App 全量（各一次，与 0071 收口对照）。
7. 重启 Web/API；重新导出 phoneweb（client.ts 变了）；Simulator + phoneweb 两次进入待办页，看服务端 304。
8. 路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` 回 `chat-agent` → REPORT、登记表。

## 最小测试与检查

- 档位：**H**（6 条 API 路由 + App 请求层）。
- 开发定向集：新增 4 个测试 + `tests/api/{notes-routes,tasks*,contacts*,events*}.test.ts` + App `tests/api-client.test.ts`。
- 收口集：两端全量 + typecheck。
- 不运行：真实设备、部署、云端。

## 失败与交接

若某路由的依赖集合无法静态确定（读路径经 SQL 直读多表），**不接该路由**并记录，不得用"全 workspace 任意变化"以外的猜测集合。
若 App 守卫（offline-read inventory）对新 header 报未登记项，按既有约定登记，不得豁免。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
