# Sprint W0030 — 账号解析只读判定所需字段

**Plan revision:** 3（2026-09-29）。revision 2 按 Codex 方案 review（`scratchpad/w0030/codex-plan-review.txt`）修订，逐条处理见末尾「review 处理」；revision 3 并入用户决定 D23（W30-1～W30-4 全部按推荐默认）。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0027 REPORT 的 SC-04 流量 failed，以及用户决定 D22（2026-09-29）。

**单一目标:** 给账号会话 provider 新增一个轻量读取，只返回 `resolveAuthenticatedApiActorIdentity` 判定需要的字段；`resolveAuthenticatedApiActorFromSession` 改用它。要求：
- 全部调用方（口径见「调用方清单」：静态直接 23 个入口 24 处调用＋1 个包装函数，依赖注入 2 处，经 `resolveAuthenticatedApiActor` 间接 143 个接口文件 157 处引用）得到的 actor 与失败语义完全不变；
- 语句数不增加，读取闸门、进程内 in-flight 去重、写入后去重失效的行为不变；
- 活动详情页每次账号解析 ≤1,000 B，按 1000 人 × 每天 2 次 × 30 天 ≤60 MB／月；
- 同时给出全站受益估算。

`readAccountSessionGraph` 本身不改（账号会话服务要用它的完整字段，见事实 4）。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `a070c5b5`。开工时 W0028 应已合并，基线改为 W0028 合并后的 SHA；本文件的行号按 `a070c5b5` 核对，Generator 开工时用 `git diff a070c5b5 HEAD -- <修改白名单>` 核对，有变化以开工时为准，并在 REPORT 登记。

**进入条件:**
- W0028 已 completed 并合并进 `chat-agent`（D22 顺序：W0028 → W0030 → W0029）。W0028 若抽出了「闸门 + in-flight 去重」的读取封装，本 Sprint 复用它（见 W30-1）。
- W30-1～W30-4 已由用户决定（D23，2026-09-29，全部按推荐默认）。✔
- 本机 PG 测试库 `orbit_test` 可用；3001 验收 server 可用。
- 不需要云端授权，不调用付费 AI。

## 已定决定（D23，2026-09-29：W30-1～W30-4 全部按推荐默认）

| 编号 | 问题 | 选项 | 决定（D23：按推荐） |
| --- | --- | --- | --- |
| W30-1 | 轻量读取放在哪一层 | **A**：账号 provider 内专用 SQL，经闸门（带集合名）和与 configured store 共享的 in-flight 表；store 只增量导出读取入口。<br>**B**：给 `LiveRecordListQuery` 加可选「只取 payload 投影＋时间戳」选项，由 PG store 实现；闸门、去重、写入失效自动一致，但改 CRITICAL 共享契约（影响 2,104，partial），`rowToRecord` 要返回伪造的空元数据，还要抽公共查询构造才能不涨审计计数。 | **A**：改动面小、返回类型诚实、与 W0028 先例一致；共享 in-flight 表补上了专用 SQL 最容易漏掉的「写入失效」 |
| W30-2 | provider 接口上的新方法是否可选 | **A**：可选；解析入口在缺方法时退回完整图。5 份只实现 `readAccountSessionGraph` 的测试替身不用改；配置的 PG provider 一定实现，由 SC-03「轻量 1 次、完整图 0 次」证明生产走轻量。<br>**B**：必需；改全部替身。 | **A**：替身改动为 0，生产路径由测试锁定；代价是将来新 provider 漏实现时只会多读字节，不会出错 |
| W30-3 | 坏数据的失败语义 | **A**：与旧读取完全一致（无效 payload 跳过、无穷时间戳抛错、回退看原始行数），和 D20 的口径相同。<br>**B**：只保证「正常数据结果一致」，坏数据可以不同。 | **A**：代价是每行多一列布尔值（约 20 B）和 5 个 payload 字段里的两个时间戳，按估算约 24–30 MB／月，仍远低于 60 MB 上限 |
| W30-4 | 全站受益表的访问频次假设 | **A**：沿用 W0017／W0021 的每人每天口径：`/app/agent` 4 次、`/app/events` 1 次、`/app/events/[id]` 2 次；其他页面每人每天 1 次；轮询按「端点 × 每周期次数 × 周期数」逐端点计：收件箱每人每天停留 10 分钟（15 秒一个周期，共 40 个周期，每周期实际请求哪些端点以 SC-04 第 1 步实测为准）；名片批次每人每周 1 批、轮询 2 分钟（2.5–3 秒一个周期，批次结束即停，端点同样以实测为准）。1000 人都按日活计。<br>**B**：用户给出其他频次。 | **A**：只用于信息表，不作为本 Sprint 的通过条件；REPORT 同时给出「每次节省字节」，频次改了可以直接重算 |

## 已查清的事实（`a070c5b5`）

1. **解析入口**（`app/api/_shared/authenticated-actor.ts`）
   - 第 117–134 行 `resolveAuthenticatedApiActorFromSession(session)`：
     - 取 mode（`ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE`）和 workspaceId（未配置库时是 `"workspace:mock-auth"`）；
     - `createConfiguredStorageAccountSessionProvider()`，未配置库时为 null → graph 为 null；
     - `provider.readAccountSessionGraph({ userId: session.userId })`，然后交给 `resolveAuthenticatedApiActorIdentity`。
   - 第 59–101 行 `resolveAuthenticatedApiActorIdentity({ graph, mode, session, workspaceId })`，**只用到**：
     - `graph.profiles[].id`、`.accountId`、`.displayName`；
     - `graph.accounts[].id`。
     - 规则：先找 `profile.id === session.userId`，找不到再找 `profile.accountId === session.userId`（都按数组顺序取第一个）；`accountId = profile?.accountId ?? session.userId`；再找 `account.id === accountId`。profile 或 account 缺一个就返回 null。
     - mock 模式且 graph 为 null 时返回以 `session.userId` 为 id 的自有 actor。
   - 注意：`session.userId` 在这里**不 trim**，provider 查询时用的是 trim 后的值。
2. **会话图读取**（`features/account/storage/account-live-record-provider.ts`）
   - 第 44–48 行：payload 投影字段。账号 `id, name, createdAt, updatedAt`（已经是最小）；资料 12 个字段 `id, accountId, displayName, role, timezone, headline, homeMarket, preferredFollowUpWindow, preferredLanguage, relationshipGoal, createdAt, updatedAt`。
   - 第 158–198 行（有 subject 的分支）：
     - `subject = (profileId ?? userId ?? accountId)?.trim()`；为空且 `requireIdentity`（配置的 provider 为 true）→ 返回空图，0 条语句。
     - 语句 1：资料按 `payloadId = subject`；**原始行数为 0** 才发语句 2：资料按 `payloadAccountId = accountId ?? subject`。判断的是原始行数，不是有效资料数：id 命中了一条无效资料时不会回退，解析结果为 null。
     - 语句 3…：对全部原始资料行里去重后的非空 `payload.accountId`，逐个并行按 `payloadId` 读账号。
     - 每条语句都是 `store.listRecords({ limit: "unbounded", payloadFields, omitSearchText: true, ... })`，SQL 由 `shared/storage/postgres-live-record-store.ts:192` `listQuery` 生成：`where workspace_id … and payload ->> 'id' = … and collection_name = … and lifecycle_state <> 'deleted' order by coalesce(occurred_at, updated_at) desc, updated_at desc`，**选出全部 19 列记录元数据**（第 75–95 行 `recordColumns`），payload 用 `jsonb_object_agg` 投影。
   - 第 71–126 行：`accountFromRecord`／`profileFromRecord` 用 `nonEmptyString`（`typeof === "string" && value.trim().length > 0`）校验必需字段，不合格的行**跳过、不抛错**。账号必需 `id, name, createdAt, updatedAt`；资料必需 `id, accountId, displayName, createdAt, updatedAt`。
   - 第 128–146 行：`generatedAt`、`evidenceIds` 来自记录元数据 `updatedAt`、`evidenceIds`。
3. **会抛错的情况**（旧读取 reject 的条件，新读取必须一致）：
   - `rowToRecord`（`postgres-live-record-store.ts:129`）对 `created_at`、`updated_at` 调 `requiredTimestamp`（第 109–117 行）。列是 `timestamptz not null`（`shared/storage/migrations.ts:23–24`），但 PG 允许 `'infinity'`／`'-infinity'`，node-pg 解析成非 Date 值后 `timestampToString` 返回 null → 抛 `orbit_records.<列> is required`（W0028 revision 3 已用 node 验证同一机制）。`occurred_at`、`deleted_at` 的无穷值只会变 null，不抛错。
   - SQL／连接错误、读取闸门抛错（见事实 5，但 accounts／profiles 属于豁免集合）。
   - payload 是 `jsonb`，投影后总是对象，不会在解析时抛错。
4. **图的其他消费者**（本 Sprint **不切换**）：
   - `features/account/live-service.ts:208–250` `sessionPayload`：用资料的 `role`、`timezone`、`headline`、`relationshipGoal`、`homeMarket`、`preferredFollowUpWindow`、`preferredLanguage`，账号的 `name`，以及 `graph.generatedAt`、`graph.evidenceIds`（provenance）。改 `readAccountSessionGraph` 的返回会改变这个服务的可见输出，所以不改现有函数。
   - `features/guide/progress.ts:168–173` `configuredAccountCreatedAt`：读 `accounts[].createdAt`，只在老用户首次判定（`decideAndPersistGrandfathered`）时调用，频率低，登记为候选，不切。
   - 脚本 `migrate-contact-primary-industries.ts`、`seed-account-contact-fixtures.ts`、`seed-xiaoyu-three-month-planner.ts`：把完整图传给 `resolveAuthenticatedApiActorIdentity`。所以它的 `graph` 参数必须继续接受完整图（类型只能放宽，不能收窄）。
5. **store 包装**（`shared/storage/configured-live-record-store.ts`）
   - 第 144–190 行 `createConfiguredPostgresLiveRecordStore`：按连接串＋workspace＋poolMax 缓存；外层 `createReadBudgetGatedLiveRecordStore`（每次逻辑读先 `gate.assertAllowed({ collectionName })`），内层 `createReadDedupedLiveRecordStore`（第 68–138 行：键＝操作名＋规范化查询；Promise 结束就删键，失败不缓存；**任何写入（upsert、insertIfAbsent、updateIfCurrent、delete）前后都清空 in-flight 表**）。
   - `features/sync/read-budget-gate.ts:55` `READ_BUDGET_CRITICAL_COLLECTIONS = accounts, auth_users, permissions, profiles`：对这些集合 `assertAllowed` **从不抛错**，但仍会 `drain` 并触发状态切换日志。也就是说，现在闸门打开时登录解析照样放行。
   - 计量链路：`createConfiguredPostgresLiveRecordStore` 用 `createClient({ ..., readMetrics: configuredReadMetrics(env) })` 建 `configured.client`（第 167–172 行）。`configuredReadMetrics`（`shared/storage/transactional-postgres.ts:102–107`）在有共享闸门时返回 `{ observer: metric => { gate.observe(metric); console?.(metric) } }`。`createPgLiveRecordSqlClient` 用 `createPostgresReadMetricsRunner`（`shared/storage/postgres-read-metrics.ts:175–215`）包住每次 `pool.query`：按 SQL 开头关键字判定读类型（`select`／`with` 等），返回后算 `returnedRows` 和 `approximateSerializedRowBytes` 交给 observer。
   - 所以专用 SQL 必须走 `configured.client`（不能另开连接池，也不能在 provider 里另注入裸 client），SQL 文本要以 `select`／`with` 开头（前置注释可以），闸门才会 `observe` 到这些读取。
6. **W0027 实测**（`~/orbit-sprint-evidence/web/sprint-W0027/run-01/04-measure.txt`，脚本 `measure-detail-actor-bytes.ts`）：
   - A 会话 id = 账号 id：3 条语句，2 行，1,984 B；B 会话 id = 资料 id：2 条语句，2 行，1,959 B。
   - 资料行 1,123–1,148 B，其中 payload 450–461 B；账号行 836 B，其中 payload 157 B。其余是 `evidence_ids`(56)、`source_id`(45)、`record_id`、`user_id`、`provider_record_id`、`source_label`、`provider`、三个时间戳、`workspace_id` 等元数据列和 JSON 键名。
   - 60 MB／月 ÷ 60,000 次 ≈ 1,000 B／次。
   - 脚本用 `createStorageAccountSessionProvider` 包一个直连 PG store；轻量路径需要 client，测量时要按配置 provider 的方式构造（见 SC-04）。
7. **审计棘轮**：`tests/audits/unbounded-list-reads.baseline.json` 第 6 行，`account-live-record-provider.ts` 的 `limit: "unbounded"` 计数是 5，只许减少。
8. **测试替身**：5 份测试构造只有 `readAccountSessionGraph` 的 provider 替身（`tests/api/event-registration-account-scope.test.ts:174`、`tests/pages/app-agent-guide-demo-page.test.tsx:170`、`tests/pages/app-agent-home-dashboard-entry.test.ts:896`、`tests/capabilities/orbit-agent-conversation-readback.test.ts:61`、`tests/api/secondary-industry-search-route.test.ts:60`）；另有 `tests/performance/inbox-summary-request.test.ts`、`tests/pages/app-profile-onboarding-navigation.test.ts` 用真实 provider 直接调 `readAccountSessionGraph`。W0027 的 `tests/pages/app-event-detail-actor-id.test.tsx` 替换整个解析函数，内部用真实 `resolveAuthenticatedApiActorIdentity` 加完整图夹具。

## 调用方与字段（GitNexus，`a070c5b5` 全量重建索引）

索引注意：`analyze --index-only` 这次 FTS 构建失败，按名字查函数全部 not found；`analyze --force --index-only` 全量重建后恢复。同名符号多时加 `-f <文件>` 消歧。

| 符号（文件） | 等级 | 本 Sprint 动作 |
| --- | --- | --- |
| `resolveAuthenticatedApiActorFromSession`（`app/api/_shared/authenticated-actor.ts`） | **CRITICAL**，影响 89，直接 24，执行流 32 | 内部改调轻量读取，签名不变 |
| `resolveAuthenticatedApiActor`（同上） | **CRITICAL**，影响 61，直接 47（接口路由） | 不改，经上面一行间接受益 |
| `resolveAuthenticatedApiActorIdentity`（同上） | **CRITICAL**，影响 77 | `graph` 参数类型放宽为结构子集，逻辑不改 |
| `createConfiguredStorageAccountSessionProvider`（`account-live-record-provider.ts`） | **CRITICAL**，影响 86，直接 6 | PG 分支给 provider 传入专用 SQL 依赖 |
| `createStorageAccountSessionProvider`（同上） | **CRITICAL**，影响 34，直接 1 | 新增方法和可选参数 |
| `readAccountSessionGraph`（同上） | MEDIUM，影响 88（同名 2 个候选，另一个 UNKNOWN 0） | **不改** |
| `createConfiguredPostgresLiveRecordStore`（`configured-live-record-store.ts`） | **CRITICAL**，影响 477，直接 115 | 仅增量导出共享 in-flight 表的读取入口（W30-1 A） |
| `createReadDedupedLiveRecordStore`（同上） | **CRITICAL**，影响 277 | 仅在导出 `once` 时触及，行为不变 |
| `createPostgresLiveRecordStore`／`listQuery`／`rowToRecord` | CRITICAL（2,104，partial）／LOW／HIGH | **不改**（W30-1 选 A 时） |

GitNexus 的「直接 24」＝下表口径 A 的 23 个入口＋包装函数 `resolveAuthenticatedApiActor`；「47」只是索引能解析的那部分路由，比文本搜索少很多，所以数量以下面固定口径为准。

## 调用方清单与测试映射（口径固定，`56770528` 文本搜索＋GitNexus 核对）

统计口径（review P1-1）：
- **A 静态直接调用**：源码里直接写 `resolveAuthenticatedApiActorFromSession(` 的调用点，不含定义本身。复现：`git grep -n "resolveAuthenticatedApiActorFromSession(" -- app features shared`，去掉 import 与定义行。
- **B 依赖注入调用**：以 `dependencies.xxx ?? resolveAuthenticatedApiActorFromSession` 作为默认实现的调用点。
- **C 经包装函数间接调用**：引用 `resolveAuthenticatedApiActor`（`authenticated-actor.ts:103–115`，内部调 A 的函数）的调用点，多数是 `dependencies.resolveActor ?? resolveAuthenticatedApiActor` 的默认实现。复现：`git grep -nw resolveAuthenticatedApiActor -- app features shared`，去掉 import 与 `authenticated-actor.ts` 本身。
- 再往上一层（调用 B、C 的路由）不另计：它们拿到的都是同一个 actor。

**总数**：A＝23 个入口文件、24 处调用（`relationship-inbox/route.ts` 有 2 处），另加包装函数 1 处（`authenticated-actor.ts:110`）；B＝2 处；C＝143 个文件、157 处引用。README D22 里的「22 个」是 W0027 时的 GitNexus 直接数，应同步为本口径。

### A 静态直接调用（23 个入口）与现有覆盖测试

| # | 入口（文件:行） | 现有覆盖测试（`tests/` 下） | 覆盖方式 |
| --- | --- | --- | --- |
| 1 | `app/(app)/app/agent/page.tsx:182` | `pages/app-agent-registration-actor-id.test.tsx` 等 14 份 | 替换解析函数或读源码 |
| 2 | `app/(app)/app/agent/actions/page.tsx:33` | `capabilities/agent-actor-brief-boundaries.test.ts` | 读源码 |
| 3 | `app/(app)/app/agent/home-dashboard-actions.ts:89` | `pages/app-agent-home-dashboard-entry.test.ts` | 替身 provider（只有 `readAccountSessionGraph`） |
| 4 | `app/(app)/app/agent/plan/page.tsx:90` | `pages/app-agent-guide-demo-page.test.tsx` | 替身 provider |
| 5 | `app/(app)/app/agent/strategy/page.tsx:50` | 无 | 集中等价测试 |
| 6 | `app/(app)/app/contacts/[id]/page.tsx:136` | `pages/app-contact-detail-live-route-services.test.ts` 等 5 份 | 读源码 |
| 7 | `app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx:20` | `pages/app-contacts-live-route-services.test.ts`、`app-network-demo-pages.test.tsx` | 读源码 |
| 8 | `app/(app)/app/contacts/dashboard/page.tsx:39` | `pages/app-contacts-dashboard-account-scope.test.ts` 等 3 份 | 替换解析函数 |
| 9 | `app/(app)/app/contacts/page.tsx:79` | `pages/app-contacts-live-route-services.test.ts`、`app-network-demo-pages.test.tsx` | 读源码 |
| 10 | `app/(app)/app/contacts/pipeline/page.tsx:42` | `pages/app-contacts-subroutes-live-route-services.test.ts` 等 3 份 | 读源码 |
| 11 | `app/(app)/app/events/[id]/page.tsx:123` | `pages/app-event-detail-actor-id.test.tsx` 等 6 份 | 替换解析函数＋真实 `resolveAuthenticatedApiActorIdentity` |
| 12 | `app/(app)/app/events/[id]/register/page.tsx:72` | `pages/app-event-registration-account-scope.test.tsx` 等 4 份 | 真实 `resolveAuthenticatedApiActorIdentity`＋完整图夹具 |
| 13 | `app/(app)/app/events/page.tsx:78` | `pages/app-events-registration-actor-id.test.tsx` 等 3 份 | 替换解析函数 |
| 14 | `app/(app)/app/home/events/page.tsx:24` | `pages/app-home-events-source.test.ts`、`app-home-live-route-services.test.ts` | 读源码 |
| 15 | `app/(app)/app/profile/profile-0918/load-profile-editor-page.tsx:131` | `pages/app-profile-live-route-services.test.ts`、`app-profile-onboarding-navigation.test.ts` | 真实 provider |
| 16 | `app/(app)/app/profile/profile-onboarding-access.server.ts:52` | `pages/profile-onboarding-access.test.ts`、`app-profile-onboarding-navigation.test.ts`、`ui/profile-onboarding-proxy.test.ts` | 真实 provider／替身 |
| 17 | `app/(app)/app/start/page.tsx:112` | `pages/app-start-guide-page.test.tsx` | 替换解析函数 |
| 18 | `app/(app)/app/tasks/page.tsx:16` | 无 | 集中等价测试 |
| 19 | `app/(app)/app/tasks/personal/page.tsx:12` | `pages/personal-schedule-page-account-scope.test.ts` | 替换解析函数 |
| 20 | `app/api/chat/relationship-inbox/route.ts:31、45` | `api/authenticated-actor-context.test.ts`、`pages/app-relationship-inbox-threads.test.ts` | 读源码 |
| 21 | `app/api/integrations/[provider]/callback/route.ts:49` | `pages/app-network-route-retirement.test.ts` | 读源码 |
| 22 | `app/api/notifications/[id]/state/route.ts:10` | 无 | 集中等价测试 |
| 23 | `app/api/notifications/route.ts:17` | `api/authenticated-actor-context.test.ts`、`capabilities/reminder-schedule-and-notification-mock.test.ts` | 读源码 |

### B 依赖注入（2 处）

| 入口 | 现有覆盖测试 |
| --- | --- |
| `app/api/_shared/agent-request-context.ts:51` `resolveAgentRequestContext` | `capabilities/agent-actor-brief-boundaries.test.ts` |
| `app/api/_shared/agent-request-context.ts:117` `resolveAgentLedgerForServerPage` | 同上 |

### C 经 `resolveAuthenticatedApiActor` 间接（143 个文件）

按目录：`contact-drafts` 20、`events` 14、`contacts` 11、`chat` 11、`profile` 8、`dashboard` 7、`agent` 7、`ai` 6、`tasks` 5、`notifications` 5、`inbox` 5、`schedule-items` 4、`connections` 4、`relationship-communication` 3、`recommendations` 3、`appointments` 3、其余 19 个目录各 1–2 个（全部在 `app/api/` 下）。完整清单由上面的复现命令生成，Generator 写进 REPORT。

### 为什么集中等价测试足以覆盖所有入口

- 所有入口（A、B、C）拿到 actor 的唯一途径都是 `resolveAuthenticatedApiActorFromSession` 的返回值。本 Sprint 只改这个函数内部取图的方式，不改签名、不改 `resolveAuthenticatedApiActorIdentity` 的逻辑。所以只要证明「新旧取图方式经同一个判定函数得到的 actor（含 null 与 reject）完全一致」（SC-01），每个入口的输入就不变。
- 页面测试大多替换了整个解析函数或只读页面源码，它们本来就证明不了读取方式，只用作回归（证明本 Sprint 没碰页面接线）。
- 表中标「无」的 3 个入口（#5、#18、#22）与其他入口一样，只是把 session 三个字段原样传进解析函数，SC-03 用静态检查（调用参数只来自 session 的 `email/name/userId` 或 `request.auth.user`）加集中等价测试覆盖，不另写页面测试。

## 决定：新增轻量变体，不改现有函数

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| 改 `readAccountSessionGraph` 的返回列 | **不采用** | 账号会话服务要用 `evidenceIds`、`generatedAt` 和资料的 7 个展示字段（事实 4），改了会改变 `/app/account` 相关的可见输出 |
| 给 `LiveRecordListQuery` 加「只取 payload＋时间戳」选项（W30-1 B） | 备选 | 闸门、去重、写入失效、排序自动一致；但要改 CRITICAL 共享存储契约（`createPostgresLiveRecordStore` 影响 2,104，partial），`rowToRecord` 还得返回伪造的空元数据，并且会新增 `limit: "unbounded"` 计数（要抽公共查询构造才能不涨） |
| **新增** provider 方法 `readAccountSessionIdentity`，PG 下走专用 SQL，经闸门和与 store **共享**的 in-flight 表（W30-1 A） | **推荐** | 改动集中在账号 provider 和解析入口；返回自有行类型，不伪造元数据；与 W0028 的轻量读取做法一致；共享 in-flight 表保证「写入会清掉进行中的读取」和现在一样 |

下面的命名是建议，Generator 可以调整，要在 REPORT 登记。

- **类型**（`account-live-record-provider.ts`）：
  ```ts
  export interface LiveAccountSessionIdentity {
    accounts: readonly Pick<AccountDTO, "id">[];
    profiles: readonly Pick<LiveAccountProfileRecord, "id" | "accountId" | "displayName">[];
  }
  ```
  `LiveAccountSessionGraph` 在结构上满足它。`resolveAuthenticatedApiActorIdentity` 的 `graph` 参数改为 `LiveAccountSessionIdentity | null`，脚本和测试传完整图照样能编译。
- **provider 方法**：`readAccountSessionIdentity?(identity)`（可选，见 W30-2）。
  - 有 SQL 依赖时（配置的 PG provider）：
    1. subject 规则与现在一致（trim、`requireIdentity` 时空 subject 返回空结果、0 条语句）。
    2. 语句顺序与现在一致：资料按 id → **原始行数为 0** 才按 accountId → 对全部原始资料行里的非空 `accountId` 去重后并行读账号。
    3. 每条语句：先 `gate?.assertAllowed({ collectionName: "profiles" | "accounts" })`（带上集合名，保住豁免），再经共享 in-flight 表去重（键＝操作名＋workspaceId＋集合名＋查询条件），再执行 SQL。
    4. 只选投影后的 payload 和一列 `isfinite(created_at) and isfinite(updated_at)` 的布尔值；where 和 order by 与 `listQuery` 逐字等价。
    5. 布尔值为 false 时抛出与旧读取同类的错误（`orbit_records.created_at/updated_at is required`，文案不要求逐字一致，调用方只看是否 reject）。
    6. 资料 payload 只取 `id, accountId, displayName, createdAt, updatedAt`；账号 payload 取 `id, name, createdAt, updatedAt`。有效性过滤在 JS 里复用 `accountFromRecord`／`profileFromRecord` 的同一套 `nonEmptyString` 判断（不要搬到 SQL：PG 的 `btrim` 和 JS 的 `trim()` 对空白字符的定义不同）。
  - 没有 SQL 依赖时（内存 store、脚本、测试）：调用 `readAccountSessionGraph` 再映射，不新增 `limit: "unbounded"`。
- **共享 in-flight 表**：`createReadDedupedLiveRecordStore` 的 `once` 和 in-flight 表抽出或导出，`createConfiguredPostgresLiveRecordStore` 的返回值**增量**加一个读取入口（例如 `readOnce(key, read)`），和 `store` 共用同一张表，写入时照旧清空。W0028 若已抽出类似封装，优先复用并扩展，不另造一份。
- **解析入口**：`resolveAuthenticatedApiActorFromSession` 改为 `provider.readAccountSessionIdentity ? provider.readAccountSessionIdentity({ userId }) : provider.readAccountSessionGraph({ userId })`，其余不变。

预计改后单次：资料行约 200–250 B，账号行约 180–200 B，合计约 400–500 B（2–3 条语句不变），按 60,000 次约 24–30 MB／月。以实测为准。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件（行号按 `a070c5b5`）

- `app/api/_shared/authenticated-actor.ts`：全文（153 行）。
- `features/account/storage/account-live-record-provider.ts`：全文（252 行）。
- `shared/storage/configured-live-record-store.ts`：第 45–190 行（去重实现、写入清表、包装顺序、缓存）。
- `features/sync/read-budget-gate.ts`：第 45–60、90–166 行（豁免集合、`assertAllowed`、store 包装）。
- `shared/storage/postgres-live-record-store.ts`：第 53–140 行（行类型、`recordColumns`、`requiredTimestamp`、`rowToRecord`），第 192–278 行（`listQuery`：where、payload 投影、order by）。
- `features/account/live-service.ts`：第 208–280 行（只为确认完整图的消费者不受影响）。
- `app/api/_shared/agent-request-context.ts`：第 40–60、110–125 行（依赖注入的解析入口）。
- 测试：
  - `tests/api/authenticated-actor-context.test.ts`：解析规则的现有用例。
  - `tests/capabilities/account-identity-read-budget.test.ts`：「只按身份读、不扫工作区」的现有写法。
  - `tests/capabilities/account-live-store.test.ts`：完整图的现有断言（必须照旧通过）。
  - `tests/storage/configured-live-record-store.test.ts`：去重与写入清表测试的写法。
  - `tests/pages/app-event-detail-actor-id.test.tsx`（W0027）：只需跑通。
- 测量：把 `~/orbit-sprint-evidence/web/sprint-W0027/run-01/measure-detail-actor-bytes.ts` 复制到本 Sprint 证据目录再扩展（口径同 `scripts/measure-plan-read-traffic.ts`）。
- W0028 REPORT「交接」一节：只看它最终的读取封装名字和位置（开工时由协调者把路径补进 REPORT「假设与额外阅读」）。

### 前序交接要点

- W0027：详情页登录时先调 `resolveAuthenticatedApiActorFromSession`（1 次，在详情判定之前）；解析为 null 或抛错 → `unavailable`（`event-detail-account-unavailable`），不回退会话 id。单次 1,959–1,984 B，约 60% 是元数据列。
- W0028：本人报名轻量读取的做法（专用 SQL＋闸门＋in-flight 去重＋失败语义与旧读取一致，D20）是本 Sprint 的先例。
- W0017／W0021／W0024：流量口径是每条语句返回行的 JSON 字节之和（拦截 `pg.Client.prototype.query`）；临时 schema 里测，测完删除。
- W0016：3001 验收 server；verify 账号的会话 id 等于账号 id（走场景 A：3 条语句）。

### 易错边界（都有对应 SC）

- **查询顺序与回退条件（SC-01）**：资料先按 id 查，**原始行数**为 0 才按 accountId 查。不能改成「有效资料为 0 才回退」，也不能合并成一条 `or` 查询（会改变 `find` 取第一个的结果和语句数）。
- **排序（SC-01）**：保持 `order by coalesce(occurred_at, updated_at) desc, updated_at desc`，重复记录时解析函数取到的「第一个」必须和现在相同。
- **坏数据失败语义（SC-01，W30-3）**：payload 字段缺失、为空串、只有空白、不是字符串 → 跳过，不抛错；`created_at`／`updated_at` 为 ±infinity → 抛错。已删除记录、别的工作区不返回；**archived 记录照常返回**（旧条件是 `lifecycle_state <> 'deleted'`，不是 `= 'active'`），会参与原始行数判断和排序。
- **读取闸门（SC-02）**：每条语句都调用 `assertAllowed` 并带上 `profiles`／`accounts` 集合名，次数和现在一样；闸门打开时登录解析**照样放行**（豁免集合）。漏传集合名会让闸门打开时所有页面认不出账号。
- **in-flight 去重与写入失效（SC-02）**：并发的相同解析只发一次 SQL；失败不缓存；同一 configured store 上的写入会清掉进行中的轻量读取，写入之后发起的读取不能拿到写入前的结果。
- **计量（SC-02）**：专用 SQL 走 `configured.client`（创建时注入了 `configuredReadMetrics`），SQL 以 `select`／`with` 开头，闸门的 `observe` 照样收到这些读取的行数和字节；不能在 provider 里另建连接池或注入没有计量的 client。
- **调用方不可见（SC-03）**：解析函数签名和返回值不变；`readAccountSessionGraph` 输出不变；完整图的其他消费者（账号会话服务、引导进度、脚本）不切换。
- **不新增 `limit: "unbounded"`（SC-03）**；不改页面文件、`LiveRecordListQuery`、`createPostgresLiveRecordStore`。

## 范围与文件

- **修改：**
  - `features/account/storage/account-live-record-provider.ts`：新类型、新方法、可选的 SQL 依赖参数。
  - `app/api/_shared/authenticated-actor.ts`：解析入口改调轻量读取；`graph` 参数类型放宽。
  - `shared/storage/configured-live-record-store.ts`：增量导出共享 in-flight 表的读取入口，行为不变（W30-1 A）。
  - tsc 报出的接口替身（只加方法或类型，不改断言）。
- **新建：**
  - `tests/capabilities/account-session-identity-read.test.ts`：PG 等价矩阵、SQL 形状、闸门、去重、写入失效。
  - 测量脚本：只放证据目录。
- **排除：**
  - `readAccountSessionGraph` 的返回；`features/account/live-service.ts`；`features/guide/progress.ts`；脚本。
  - `shared/storage/postgres-live-record-store.ts`、`LiveRecordListQuery`（W30-1 选 B 时才改，届时在 REPORT 登记）。
  - 页面文件、接口路由文件。
  - 活动子页面（`events/[id]/operations`、`analytics`、`live`、`center`）仍用会话 id 的问题（W0027 观察项，另开）。
  - 迁移和索引：EXPLAIN 显示需要索引时先停下，记入 REPORT。
  - 部署。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0030-01 | **等价（含失败语义）**。本机 PG 临时 schema 造数据，对每个场景分别用旧路径（`readAccountSessionGraph` → `resolveAuthenticatedApiActorIdentity`）和新路径（`readAccountSessionIdentity` → 同一函数）解析，结果深相等：<br>- 会话 id＝资料 id；会话 id＝账号 id（回退）；两者都不是（null）；<br>- 资料 id 命中一条**无效**资料（缺 `displayName`、`createdAt` 为 `"  "`、`accountId` 为数字）→ 不回退，null；<br>- 资料有效、账号不存在或已删除或 `name` 为空 → null；<br>- 同一 payload id 两条资料，`occurred_at`／`updated_at` 不同 → 取到同一条；同一 accountId 两条资料（回退路径）→ 取到同一条；<br>- 已删除资料、别的工作区的同 id 资料 → 不返回；<br>- **archived**：按 id 命中一条 archived 且无效的资料 → 仍不回退，null；按 id 命中 archived 且有效的资料 → 照常解析；账号为 archived → 照常解析（新旧一致）；<br>- `session.name` 为 null 时用 `displayName`；会话 id 带首尾空格；会话 id 只有空白 → 0 条语句、null；<br>- 资料或账号行的 `created_at`／`updated_at` 为 `'infinity'`／`'-infinity'` → 新旧都 reject；`occurred_at` 为无穷 → 新旧都不 reject；<br>- mock 模式、未配置库 → 行为不变。<br>**SQL 形状**：不返回 `evidence_ids`、`source_id`、`record_id`、`user_id`、`provider*`、`search_text` 等元数据列；资料 payload 不含 `headline`、`relationshipGoal` 等展示字段和 W0027 夹具里的头像、导入文档；语句数与旧路径相同；生成的 SQL 含 `lifecycle_state <> 'deleted'`，不含 `lifecycle_state = 'active'`。 | 新测试先 RED 后 GREEN；PG 部分在 `orbit_test` 上 0 skip |
| SC-W0030-02 | **闸门、去重、写入失效、计量**（(a)～(d)、(f) 用计数替身 client＋计数闸门；(e) 用配置层集成测试）：<br>(a) 每次解析的 `assertAllowed` 调用次数和集合名序列与旧路径相同（场景 A：profiles, profiles, accounts；场景 B：profiles, accounts）；<br>(b) 闸门处于打开状态时，解析照样成功（豁免集合），SQL 照发；<br>(c) 两个并发、参数相同的解析：每条语句 SQL 各 1 次，结果相同；第一次失败后，下一次重新发 SQL；<br>(d) 轻量读取进行中时经同一 configured store 做一次写入，写入之后发起的解析重新发 SQL，不复用写入前的 Promise；<br>(e) **配置层计量集成测试**：设置闸门阈值环境变量，经 `createConfiguredStorageAccountSessionProvider({ env })` 构造 provider，底层用真实 `createPgLiveRecordSqlClient`（连本机 `orbit_test`），或通过 `createClient` 注入一个会原样执行传入 `readMetrics.observer` 的包装；解析前后各取一次共享闸门 `snapshot()`，rows、bytes 的增量等于轻量 SQL 实际返回的行数和字节（与测量脚本口径一致，且 >0）；同时断言轻量 SQL 发到的正是 `configured.client`（同一对象，或 `createClient` 只被调用一次），provider 没有另建 client；<br>(f) SQL 抛错时解析 reject，不变成 null。 | 新测试输出 |
| SC-W0030-03 | **调用方行为不变**：<br>- 配置的 PG provider 下，`resolveAuthenticatedApiActorFromSession` 调轻量读取 1 次、`readAccountSessionGraph` 0 次；<br>- `readAccountSessionGraph` 对同一数据的输出（含 `evidenceIds`、`generatedAt`、资料全部字段）与改前深相等；<br>- 以下测试断言不改、全部通过：`tests/api/authenticated-actor-context.test.ts`、`tests/capabilities/account-identity-read-budget.test.ts`、`account-live-store.test.ts`、`orbit-agent-conversation-readback.test.ts`、`tests/api/account-scoped-aggregate-isolation.test.ts`、`event-registration-account-scope.test.ts`、`secondary-industry-search-route.test.ts`、`tests/pages/app-event-registration-account-scope.test.tsx`、`app-event-detail-actor-id.test.tsx`、`app-agent-guide-demo-page.test.tsx`、`app-agent-home-dashboard-entry.test.ts`、`app-profile-onboarding-navigation.test.ts`、`app-events-registration-actor-id.test.tsx`、`app-agent-registration-actor-id.test.tsx`、`tests/performance/inbox-summary-request.test.ts`、`tests/storage/configured-live-record-store.test.ts`；<br>- `tests/audits/unbounded-list-reads.test.ts` 通过，`account-live-record-provider.ts` 计数不超过 5；<br>- **调用方映射**：REPORT 给出「调用方清单与测试映射」三张表的最终版（按开工时代码重新生成 A、B、C 清单，数量变化要说明）；映射表中每份现有测试都跑过且通过；标「无」的入口附静态检查结果（调用参数只来自 session 字段），由 SC-01 集中等价测试覆盖。 | 定向测试输出＋REPORT 映射表 |
| SC-W0030-04 | **流量**。按 W0027 的造数（真实注册路径建账号资料，补齐「引导已完成」，外加 60 KB 头像和导入文档），provider 按配置方式构造（PG store＋同一 client），出「改前（完整图）／改后（轻量）」对照表：场景 A、B 各列语句数、行数、字节，以及每行的列构成。<br>**要求**：<br>- 语句数改前改后相同；<br>- 单次 ≤1,000 B；<br>- 按「1000 人 × 每天 2 次详情页 × 30 天」估算 ≤60 MB／月（两个场景都要满足）。<br>**全站受益表**（信息项，不设上限；review P2-2）：<br>1. 先实测每个轮询周期实际请求的端点集合：在 3001 上打开收件箱各页签（`typed-notifications-tab`、`relationship-inbox-panel`、`bounded-contact-messages-tab`、`notification-source-page`）和名片批次页，用浏览器网络记录各看 1 分钟，列出每个周期实际发出的端点、每周期次数、周期长度，以及轮询的停止条件（切页签、`visibilitychange`、批次结束）；<br>2. 对每个端点用计数替身确认是否经过账号解析、每次请求解析几次（并发去重后的实际 SQL 次数）；<br>3. 每个端点单独一行：`端点 × 每周期次数 × 周期数 × 活跃用户数 × 每次节省字节`；再列合计；<br>4. 页面入口至少覆盖 `/app/agent`、`/app/events`、`/app/events/[id]`、`/app/contacts`、`/app/tasks`、`/app/start`；<br>5. 1000 人按**日活**计算（每人每天都来），假设见 W30-4，REPORT 写明。<br>超出上限时本项 failed，交用户裁决。 | 测量输出 + REPORT 两张表 |
| SC-W0030-05 | **回归**：<br>- `npx tsc --noEmit -p .` 通过；<br>- 3001 上用 verify-plan 看 `/app/events/[id]`（已报名）、`/app/events`、`/app/agent`、`/app/contacts`，用 verify-host 看详情页主办方入口，桌面 1440 与手机 375，控制台 0 错误；<br>- 一次全量基线对照，没有新增失败；<br>- 一次 Codex 代码 review（重点：查询顺序与回退、排序、失败语义、闸门集合名、共享 in-flight 表），由同一 Generator 修复。 | tsc、截图、RULES §5.2 对照、review 记录 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0028 已合并；W30-1～4 已由 D23 决定），保存基线和 Planner 哈希；`git diff a070c5b5 HEAD -- <修改白名单>` 核对行号；刷新 GitNexus 索引（FTS 失败时 `analyze --force --index-only`），逐个符号加 `-f` 做 upstream impact，UNKNOWN 用文本搜索补查，写出最终调用方清单。
2. 跑测量脚本拿改前数据（场景 A、B，以及全站表里各入口的解析次数）。
3. 写 RED：SC-01 等价矩阵与 SQL 形状、SC-02 封装行为、SC-03 的「轻量 1 次、完整图 0 次」。
4. 最小实现：类型 → 共享 in-flight 读取入口 → provider 新方法（SQL 与回退映射）→ 配置 provider 接线 → 解析入口切换 → 补齐 tsc 报出的替身。
5. 跑定向测试和 tsc；测改后数据；对三类语句做 EXPLAIN，结果记入 REPORT。
6. 浏览器验证；收尾执行 `git checkout -- next-env.d.ts`；暂存区 `detect-changes`，按路径提交。
7. 全量对照；Codex 代码 review，同一 Generator 修复；写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：改的是 24 个直接调用方共用的身份解析（CRITICAL），属于 RULES §5.1 的「身份／共享契约」；新增 SQL；触及进程内去重（CRITICAL）。
- **开发定向集：**
  - 新测试 `tests/capabilities/account-session-identity-read.test.ts`
  - `tests/api/authenticated-actor-context.test.ts`
  - `tests/capabilities/account-identity-read-budget.test.ts`、`account-live-store.test.ts`
  - `tests/storage/configured-live-record-store.test.ts`
  - `tests/audits/unbounded-list-reads.test.ts`
  - PG 测试先导出 `ORBIT_EVENT_DATABASE_URL`（指向本机 `orbit_test`），先跑 `node scripts/assert-local-test-databases.mjs`。**不要 source `.env`。**
- **收口：** SC-03 全部文件、SC-05（tsc、浏览器、一次全量对照、一次 Codex 代码 review）。
- **浏览器：** 3001 验收 server，账号 verify-plan、verify-host。verify-session-cookie 不接受 verify-host 时，按 W0027 做法在证据目录临时复制放开，不改仓库脚本。
- **不运行：** 付费 AI、Preview、生产库。

## 失败与交接

REPORT 需要写明：
- 最终命名（W30-1～4 按 D23 执行，如有偏差说明原因）；
- 最终调用方清单（GitNexus＋文本搜索）和每个调用方用到的 actor 字段；
- 改前改后对照表、月估算及假设；全站受益表；
- EXPLAIN 结果；
- 等价矩阵和失败矩阵的覆盖情况；
- 闸门、去重、写入失效、计量的证据；
- 给 W0029：详情页账号解析的实测单次字节和月流量，填 W0029 PLANNER「预算重算」表的 C 行；
- 给 W0019：上线后在 Neon 控制台对照账号解析语句的返回字节；
- 后续候选：`features/guide/progress.ts` 的 `configuredAccountCreatedAt`、账号会话服务是否也需要瘦身、活动子页面仍用会话 id。

交接内容：分支 `sprint/W0030-account-session-graph-trim`，固定最终 SHA，目标合并到 `chat-agent`。

回退：revert 本 Sprint 的提交即可。新方法和导出都是增量，解析入口退回到 `readAccountSessionGraph` 即恢复原行为。

## 开放问题

无。W30-1～W30-4 已由 D23 决定，见「已定决定」表。

## 观察项（不在本 Sprint 处理）

- 账号会话服务（`/app/account` 相关）仍读完整图；如果它也在高频路径上，另开 Sprint。
- 收件箱与名片批次的轮询频率本身是更大的流量来源，本 Sprint 只测是否经过解析、每次省多少，不改轮询。
- W0027 观察项：活动子页面（operations、analytics、live、center）仍用 `session.user.id` 做权限或身份判定。

## review 处理

| review 意见（`scratchpad/w0030/codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1-1 调用方数量与覆盖口径不闭合（24 个直接调用里是否含依赖注入入口；README 写 22；SC-03 没有逐调用方映射） | 接受。新增「调用方清单与测试映射」一节，固定三种口径（A 静态直接、B 依赖注入、C 经 `resolveAuthenticatedApiActor` 间接）和复现命令，给出带文件和行号的 A、B 清单与 C 的分目录统计：A＝23 个入口 24 处＋包装函数 1 处，B＝2 处，C＝143 个文件 157 处。说明 GitNexus「直接 24」＝A 的 23 个＋包装函数。A、B 逐项列出现有覆盖测试；3 个没有测试的入口写明为何由集中等价测试覆盖。SC-03 增加「REPORT 给出最终映射表、标无的入口附静态检查」。README D22 的数量由协调者同步 |
| P1-2 计量 SC 只用计数替身，证明不了生产计量链路 | 接受。事实 5 写清 `configuredReadMetrics` → `createPostgresReadMetricsRunner` → `gate.observe` 的链路和「SQL 需以 select／with 开头」；SC-02(e) 改为配置层集成测试：真实 `createPgLiveRecordSqlClient` 或捕获并执行 `createClient` 传入的 `readMetrics`，比较共享闸门 snapshot 前后的 rows／bytes 增量，并断言用的是 `configured.client`；易错边界同步 |
| P2-1 等价矩阵没有锁定 archived | 接受。易错边界写明旧条件是 `<> 'deleted'`，archived 会参与原始行数和排序；SC-01 加 archived 资料／账号场景（按 id 命中 archived 且无效的资料时仍不回退），并断言 SQL 用 `<> 'deleted'` |
| P2-2 轮询频次含义不明 | 接受。SC-04 全站受益表改为先实测每个轮询周期实际请求的端点集合和停止条件，再按「端点 × 每周期次数 × 周期数 × 活跃用户数」逐端点计算，REPORT 列单端点和合计；W30-4 同步改写，写明 1000 人按日活计 |

## 修订记录

- revision 1（2026-09-29）：初版。
- revision 2（2026-09-29）：按 Codex 方案 review 修订（见上表）；W30-1～W30-4 标「待用户确认」。
- revision 3（2026-09-29）：并入用户决定 D23（W30-1～W30-4 全部按推荐默认）；开放问题表移为「已定决定」表，进入条件与执行顺序同步；SC 不变。
