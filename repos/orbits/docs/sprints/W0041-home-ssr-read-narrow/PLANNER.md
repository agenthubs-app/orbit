# Sprint W0041 — 首页服务端复合读取收窄（P2：窄联系人计数、旧活动按本人筛、已报名活动按 id 取）

**Plan revision:** 2（2026-10-02）。revision 1 经 Codex `gpt-5.6-sol` 方案 review（`~/orbit-sprint-evidence/web/sprint-W0041/plan-review.txt`：P0 2 条、P1 6 条、P2 5 条，结论「修正 P0 后再开工」）后修订，逐条处理见文末「修订记录」。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-03（线上流量核算）、RV-05（用户读取流量瘦身）。来源：用户 2026-10-01 决定 D40（W0040 之后开 W0041＝首页服务端其余读取收窄，即调查报告的 P2；W0042＝P1）。调查材料 `~/orbit-sprint-evidence/web/investigation-home-db-read/REPORT.md`（下称「调查报告」）。
**单一目标:** `loadAppHomeRouteViewModel` 每次只读首页实际显示所需的数据：
- 联系人：数据库内计数，替代完整联系人页模型。
- 旧活动表：在 SQL 里按本人筛选，替代整 workspace 读取后在 Node 过滤。
- 已报名活动：先取本人报名的活动 id，再按 id 取活动，替代整个目录加带资料的报名行。

单次首页 SSR 复合读取从 58,808 B／11 条降到「预算目标」的门槛内。首页各块显示、其他调用方的结果、示例期与开关关闭的读取次数都不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `4f0aa533`（W0040 已合并并 push）。下文行号都按 `4f0aa533`。工作树里另一会话的未提交改动（大目标 4：`README.md`、`REQUIREMENTS.md`、`RULES.md`、`W0043`～`W0055` 目录）与 RULES §4 列出的用户文件都不属于本 Sprint。
**进入条件:**
- 待定项 W41-1～W41-6 已由用户决定（或明确「全按推荐」）。缺 W41-1 不能写 SC-05 结论；缺 W41-2 不能定 SC-02 的边界口径。
- 与大目标 4 的执行顺序已由协调者排定：W0045／W0046 会改 `features/contacts/storage/contact-live-record-provider.ts`（`contactFromRecord` 加字段）。本 Sprint 不改该文件，但新计数 SQL 必须与它的有效性规则一致。两线不并行；后跑的一方重跑 SC-02 的并跑比对测试。
- 本机 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → localhost）可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 不需要云端授权，不读写生产／Preview，不调用付费 AI，不做迁移（只新增查询，不加索引；如需索引，停下登记为待定项）。

## 已查清的事实（按 `4f0aa533` 源码复核，不照抄调查报告）

1. **GitNexus 本次不可用作依据。**
   - 按 `CLAUDE.md` 跑过 `analyze --index-only`（增量，36 s），FTS 构建报 invalid UTF-8；`--repair-fts` 抛异常。
   - 之后名字与 uid 错位：`impact loadAppHomeRouteViewModel` 解析到 `harness/evidence.py`、`repos/orbit-app/tests/...`；`loadAppEventsRouteViewModel` 解析到 `harness/relationship_data_goal_runner.py`；`readConfiguredCanonicalParticipantEventJourneys` 的 `context` 指向 `orbit-app/tests/snapshot-policy.test.ts`。
   - 按文件或 uid 查，均报 not found。唯一正常解析的是 `createStorageEventStoreProvider`：CRITICAL，direct 2（`createConfiguredStorageEventStoreProvider`、`event-crud-and-import-live-store.test.ts`）。
   - 下文调用方以**文本搜索**为准。Generator 开工先做一次全量重建索引（非增量），重跑 impact 并记进 REPORT；重建后仍错位，就按 `UNKNOWN` 处理，坚持文本搜索复核，**不得把 0 读成安全**。
2. **首页链路。**
   - `app/(app)/app/agent/page.tsx:139–149` 的 `loadHomeModel()` 是请求内记忆化的，示例判定 `readRelationshipGoal`（第 151–161 行）与真实首页（第 187 行起）共用，同一请求只调一次 `loadAppHomeRouteViewModel`。
   - `home-route-view-model.tsx:244 loadAppHomeRouteViewModel` 在第 256–264 行 `Promise.all` 并行四项：
     - `loadAppEventsRouteViewModel(actor?.id)`
     - `loadAppContactsRouteViewModel(searchParams, actor?.id)`
     - `loadAppProfileRouteViewModel(actor, { suggestions: "skip" })`（W0040）
     - 有 `rawSubject` 时 `readConfiguredCanonicalParticipantEventJourneys(rawSubject)`
   - 第 265 行 `firstRouteState` 按 events → contacts → profile 的顺序取第一个失败。
3. **首页实际用到的字段（逐项）。**
   - `homeViewModel`（第 121–163 行）：
     - **资料**：`profile.profile.profile` 的 14 个字段拼 `account`。
     - **联系人**：只用 `contacts.payload.ledger.knownPeople`，即 `contacts.length`（`contacts-route-view-model.ts:351`）；以及 `inProgressCount`（第 69–77 行）＝`statusLabel` 不匹配 `/archived/i` 的条数。`statusLabel` 只由 `toContactStatus(contact)` 推出（`features/contacts/contact-graph-query.ts:195–207`：`captured`→needs_follow_up，`reviewing`→active，其他取 stage 本身）。卡片、证据、筛选、`listSummary` 一概不用。
     - **活动**：`events.workspace.eventChoices` 经 `eventChoiceToLandingEvent`（`events-view-model-adapter.ts:44`），用到 `relationshipValue`、`nextAction`、`readinessScore`（进 `agenda[2]`）、`venue`、`startsAt`／`endsAt`、`status`、`title`、`id`、`canonicalEventId`。
     - **参与活动**：分两层（按 id 取活动时**不得**收窄到只剩第一层）。
       - 直接影响显示：`description`（`evidenceSummary`）、`venue`、`startsAt`／`endsAt`、`title`、`publicCode`（作 `routeCode`，进 landing event 的 `code`，`home-route-view-model.tsx:79–95`；`publishedCanonicalEventToEventDTO` 本身不读它）、`eventId`。
       - 解析与契约仍要用：`organizerActorId`、`source_payload`（evidenceIds）、`eventVersion`（source／evidence 回退）、`lifecycleState`／phase（构成 `PublishedCanonicalEvent`）、`timezone`。做法：按 id 取活动沿用 `canonicalEventSelect()` 与 `recordFromRow` 整行映射，只改 `where`。
     - 失败映射（第 165–242 行）用各子模型的 `routeState.evidenceIds`／`failure.evidenceIds`。
   - 显示端：
     - `/app/agent` 由 `iorbit-home.tsx` 使用：`home.events` → 已报名栏、月历、活动小模组（`iorbitRegisteredEvents`），`home.stats.people` → 补人脉提示（第 949 行），`home.account.relationshipGoal`／`initial`。
     - `iorbit-chat-aside.tsx` 使用 `account.topics`、`targetRelationshipTypes`、`events`。
     - `/app/home/events` 由 `orbit-real-home.tsx`（`mode="events"`）使用 `stats.events`／`people`／`inProgress` 与 `events`（第 662–761 行）。
     - `agent/page.tsx:188–214` 再用 `home.events[].id` 查报名状态（不在本复合读取内）。
4. **逐语句清单与处理**（`measure-after.jsonl` 的 `ssr-home:user_verify_plan`，合计 58,808 B／72 行／11 条）：

   | # | 语句（来源） | 字节／行 | 首页用不用 | 处理 | 预计改后 |
   | --- | --- | --- | --- | --- | --- |
   | 1 | `orbit_records` 旧 `events` 集合，整 workspace、无 LIMIT（`storage-event-provider.ts:248–266` `listEvents`，Node 按 `userId === actor \|\| payload.accountId === actor` 过滤） | 17,613／13 | 只用本人拥有的；三账号字节相同，推断都不拥有（Generator 实测确认） | 过滤条件下推到 SQL（W41-4） | 0 B／1 条（拥有 k 场时约 1,355 B × k） |
   | 2 | evidence 有界读取（联系人页模型） | 14,081／15 | 不用 | 去掉 | 0 |
   | 3 | contacts 按 record id 白名单投影 | 9,321／5 | 只用条数与 stage | 改为数据库内计数 | 合并到新计数语句 |
   | 4 | connections 按 record id | 7,149／5 | 不用（只影响「重复规范关系」时整页失败，事实 6） | 并入计数语句的歧义判定 | 同上 |
   | 5 | `event_ops_events` 整目录，含 `description`、`source_payload`，无时间窗（`core/storage/postgres-repository.ts:129–138`，`order by starts_at desc nulls last, event_id`） | 5,507／6 | 只用本人已报名且已发布的 | 先取报名 id，再按 id 取 | 约 918 B × 已报名场数（`user_verify_plan` 1 场） |
   | 6 | `membership_head` 报名行，含 `profile_payload`（`canonical-registration-repository.ts:1067 listCanonicalRegistrationsForUser`） | 1,770／1 | 只用 `eventId`／`status`／`userId` | 改用只取状态的投影（同文件第 1080 行已有 `listCanonicalRegistrationStatusesForUser` 先例） | 约 100–200 B |
   | 7 | 联系人 scope 展开 CTE | 1,515／20 | 不用 | 去掉 | 0 |
   | 8 | direct profile（20 个 payload 字段） | 919／1 | 用 14 个 | **不改**（W0040 刚定的资料失败语义；W41-5） | 919 |
   | 9 | direct account | 503／1 | 间接（资料成败） | 不改 | 503 |
   | 10 | 联系人 scope 查找 | 430／5 | 不用 | 去掉 | 0 |
   | 11 | 联系人私有详情状态 | 0／0 | 不用 | 去掉 | 0 |
   | 新 | 联系人计数（`knownPeople`、`inProgress`、歧义标志，单行） | — | — | 新增 | 约 50–100 B |

   **中心估算 2,530 B（`user_verify_plan`，约 −95.7%），误差至少数百 B**（JSON 列名、valid 标志、driver 返回形状都会吃掉余量）。依据：
   - 资料 1,422 B；
   - 计数约 70 B；
   - 旧活动 0 B；
   - 报名状态约 120 B；
   - 1 场已报名活动约 918 B。

   语句数按账号分别判定：有报名为 6 条（资料 2、计数 1、旧活动 1、报名状态 1、按 id 活动 1）；无已报名活动时按 id 那条短路，为 5 条。`user_verify_new` 预计约 1.4 KB／5 条。以实测为准。
5. **旧活动的其他读者（文本搜索）。**
   - provider 直接调用方：只有 `live-service.ts:503`（`createLiveEventCrudAndImportService.listEvents`；无 actor 时在第 492 行先失败，不触发 provider）。
   - 经 `EventCrudAndImportService.listEvents` 的传递消费者：
   - `app/api/events/handler.ts`
   - `features/agent/signals/source-collector.ts`
   - `features/plans/bootstrap.ts`、`features/plans/reanalysis.ts`
   - `features/orbit-ai/**`（`live-command-service.ts`、`chat-known-workflow.ts`、`workflows/pre-event-brief-candidate-source.ts`）
   - `features/recommendations/live-event-value-service.ts`
   - `features/events/event-recommendation-tool.ts`
   - `app/(app)/app/canonical-event-detail-view.ts`
   - `/app/events`、管理台（`admin-platform-route-view-model.ts` 调 `loadAppEventsRouteViewModel`）

   归属判定是 JS 严格相等：`payload.accountId` 必须是**字符串**且等于 actor。SQL 必须写成 `payload->'accountId' = to_jsonb($actor::text)`，不能写 `payload->>'accountId' = $actor`：后者会把数字 `123` 与字符串 `"123"` 当成相等。
   - **不能复用通用 store**：`LiveRecordStoreLike.listRecords` 不支持「`user_id` 或 `accountId`」的 OR 条件（`shared/storage/live-record-store.ts:31–59`），现有 `payloadAccountId` 的 Postgres 实现正是 `payload ->> 'accountId'`（`postgres-live-record-store.ts:229–234`）。做法：给 `createStorageEventStoreProvider` 加可选注入点（如 `listOwnedEventRecords(actorId)`），只在 `createConfiguredStorageEventStoreProvider` 里用 `configured.client` 构造 Postgres 专用 reader（新文件），**一条** OR 查询；内存／测试注入 store 没有该 reader 时走原 `listRecords` + JS 过滤。不扩展通用 `LiveRecordListQuery`。
   - **顺序**：Postgres `listQuery` 没有 `ORDER BY`（`postgres-live-record-store.ts:221–290`），原顺序不是契约。新 reader 不加排序、用单条 OR 查询；并跑测试交错插入 `userId` 命中与 `accountId` 命中的行，比对同一快照下的实际行序，作为回归观测，不写成长期契约。
   - `getEvent`（第 268–285 行）已是单行读取，不动。
6. **联系人计数要复刻的规则**（全部在 `features/contacts/storage/contact-live-record-provider.ts` 与 `contact-graph-query.ts`，本 Sprint 只读不改）：
   - **归属**：`contactRecordOwnedByActor`（`contact-read-authorization.ts:5–11`），即 `user_id = actor` 且 `payload.accountId` 为空／`null`／等于 actor；SQL 版见同文件 `CONTACT_ACTOR_AUTHORIZATION_SQL` 与 `contact-scope-postgres-reader.ts`。行要求 `lifecycle_state <> 'deleted'`。
   - **有效性**：`contactFromRecord`（第 220 行起）。
     - 非法 `version` 直接**抛错**。
     - 要求 `id`、`displayName` 非空，`stage` 合法，`source` 形状合法，`evidenceIds` 合法，`createdAt`／`updatedAt` 非空；否则该行不计。
   - **关系的非法 version 也抛错**：`connectionFromRecord`（第 303–325 行）与 `contactFromRecord` 一样，先校验 `version` 再看其他字段。
   - **歧义**（第 459–485、667–678、694–703 行）：只看 ① actor 有权读的关系、② `connectionFromRecord` 解析成功、③ `contactId` 指向一条解析成功的有效联系人；同一联系人有多条这样的关系且其中有带 `version` 或 `lifecycleInitialization` 的，`deferAmbiguity` 为假（首页无 limit、无 query，正是这种情况）时**抛 `CONTACT_DETAIL_AMBIGUOUS_CONNECTION`**。不能按同 `contactId` 的原始关系行数判断。当前首页因此整页报错：`Promise.all` 拒绝。
   - **首页读的是本人全部联系人，没有「默认 30 条」**：首页调用不带 `limit`，`readFocusedContactGraph`（第 562–563 行）调用的分页读取器在 `limit` 缺省时直接返回 null（`contact-list-postgres-reader.ts:1906–1907`、`supportsBoundedContactPage` 第 1858–1868 行要求 limit），于是走 scope reader 读本人全部联系人；默认 30 只在 `createPostgresContactCardReader`（第 1176 行，卡片接口）里。W0036 PLANNER 事实 6 说「这一页、默认 30」与源码不符（计数结果对「<10」判断无影响）。SC-02 用 35 条联系人的数据锁住这一点。
   - **无筛选时的列表**：pending 联系人也算（`contact-graph-query.ts:369` 只在有 status 筛选时排除 pending）。
   - **失败形状**（新计数服务的结果类型必须与它一一对应）：
     - 无 actor、live provider 未配置 → contacts 服务返回结构化 failure（`features/contacts/live-service.ts:120–131、147–158`）→ 首页 route-state `source: "contacts"`，`evidenceIds` 为 `[error.code, firstEvidence]`（`contacts-route-view-model.ts:490–507`）。
     - live 服务解析失败 → `createAppContactsListSearchAndFilterService` 抛错；SQL 查询失败、本人数据异常 → 异常向上抛，整个 loader 拒绝。
     - 因此新服务返回 `{ success: true, knownPeople, inProgress } | { success: false, error: { code, evidenceIds } }`，结构化 failure 的 code／evidenceIds 与旧服务相同；会抛的情况照旧抛。首页从不传 `scenario`，mock 模式下按 mock 联系人服务默认场景算两个数。
   - **不要复用**：`features/guide/progress.ts:119 CONFIRMED_CONTACT_COUNT_SQL`。它排除 pending、不检查有效性，口径不同。
7. **已报名活动的现读法**（`features/events/canonical-participant-event-journeys.ts:36–81`）：
   - 先 `eventCoreService.listPublishedEvents(now)`：整目录（含未发布）→ `recordFromRow` → 只留 `lifecycleState === "published"`。
   - 再用这些 id 调 `listCanonicalRegistrationsForUser(rawSubject, ids)`，其中 `registrationFromRow` 校验完整报名资料。
   - 只留 `status === "rsvped" && userId === rawSubject` 的，按目录顺序去重返回。
   - **注意失败顺序**：完整报名读取会解析这些已发布活动下本人的**所有**报名行（含 cancelled、waitlist），任何一行无效就先抛错，之后才在 journey 层筛 `rsvped`（`canonical-registration-repository.ts:1067–1077`）。状态投影 `listCanonicalRegistrationStatusesForUser`（第 375–417、1080–1090 行）刻意保持了相同的行与失败语义。
   - 改法：一条 SQL 先 join `event_ops_events` 限定**已发布**（与 `listPublishedEvents` 的判定一致），取本人在这些活动下的**全部**报名行的 `{eventId, status, valid}`（`valid` 用 `REGISTRATION_ROW_VALID`）；reader 先检查全部行 `valid`，有无效行即按原错误抛出，再筛 `rsvped`；然后按 id 取活动，并**保持目录的 `starts_at desc nulls last, event_id` 顺序**。不得在 SQL 里先加 `status = 'rsvped'`（那样会吞掉已发布活动上的坏 cancelled 行）。
   - 「同场重复报名」在 `membership_head` 主键模型下可能无法构造；Generator 先核实，PG 构造不了就只在 mock／内存仓库测，并在 REPORT 分别写明覆盖方式。
   - 读者只有首页（`home-route-view-model.tsx:6、252`）与 `tests/services/canonical-participant-event-journeys.test.ts`。
   - `listPublishedEvents`、`listCanonicalRegistrationsForUser` 还被活动池、计划、报名、预览等多处使用，**只能新增方法，不改原方法**。
8. **数据异常时的失败面会变**（W41-2）。现读法读整目录，所以一条与本人无关的坏活动行（`recordFromRow` 抛错）会让首页失败。新读法只取本人报名的活动，这种失败自然消失。反过来要防的是新读法把**原来读不到**的坏行读进来：
   - 本人在未发布活动上的坏报名行（rsvped 或 cancelled），原来因 id 不在已发布目录里而不会被读到；
   - 新读法若先查本人全部报名再校验，就会抛错；若先筛 `rsvped` 再校验，又会吞掉已发布活动上的坏 cancelled 行。
   - 因此必须「先限定已发布 → 校验这些活动下本人全部报名行 → 再筛 rsvped」（事实 7）。
9. **测量与对照工具可复用。**
   - `~/orbit-sprint-evidence/web/sprint-W0040/run-01/probe.ts`：拦截 `pg.Client.prototype.query`，逐语句记返回行 JSON 字节，断言 localhost，有 `measure`／`noise` 两种模式；`noise` 只往五个资料集合灌数据，本 Sprint 要扩展到旧 `events`、`event_ops_events`、`membership_head`。
   - `matrix.ts`：mock 模式 33 组首页输出逐字节对照，`matrix-diff.txt`。
   - 数据库并跑测试先例：`tests/services/contact-scoped-read-postgres.test.ts`，每次新建随机 schema，只删自己的。
   - 无界读取审计：`tests/audits/unbounded-list-reads.test.ts`。

## 预算目标（先算门槛，再看能不能做到）

人群模型沿用 W0040 SC-05：真实期 1000 人 × 4 次／天 × 30 天 = 120,000 次／月；示例期 1000 位新用户 × 10 次 = 10,000 次／月。十进制，1.6 GB = 1,600 MB。开工时总账 ①（README D32，不含首页 SSR）三档为 1,222.78／1,282.63／1,761.38 MB。

| 档（无目标用户占比） | 剩余额度 1,600 − ① | 单次上限（去重口径：只算真实期） | 单次上限（直接相加，示例期按同单次） | 单次上限（直接相加，示例期按 1.4 KB） |
| --- | --- | --- | --- | --- |
| 10% | 377.22 MB | **3,143 B** | 2,901 B | 3,026 B |
| 20% | 317.37 MB | **2,644 B** | 2,441 B | 2,528 B |
| 100% | −161.38 MB | 不可达（① 已超） | 不可达 | 不可达 |

**结论：**
- 10%／20% 两档要求单次约 2.4～3.1 KB。本 Sprint 中心估算 2,530 B（`user_verify_plan`，误差至少数百 B），落在 10% 档内；相对 20% 档去重口径 2,644 B 只有约 114 B 余量，相对「直接相加、示例期按 1.4 KB」的 2,528 B 约超 2 B，**等于没有余量，20% 档能否过要看实测**。
- 按预计值，月总账去重口径三档约 1,523／1,583／2,062 MB，直接相加约 1,537／1,597／2,075 MB。
- 100% 档只靠首页做不到：差 161.38 MB 来自 W0036 无目标兜底读整个活动目录，后续选项是 D39 记的「服务端共享缓存活动目录」。
- 若实测超门槛，剩余后续选项按收益排：
  1. 资料两条读取收成首页投影（约省 0.3–0.6 KB，W41-5）；
  2. 已报名活动只取未结束 + 近期（W41-3，改显示，要产品决定）；
  3. P3：SSR 与 `loadHomeDashboardSnapshot` 重复读取合并。

**结构性风险（如实写进 REPORT）：**
- 单次字节随本人数据线性增长：每多 1 场已报名的已发布活动约 +0.9 KB，每多 1 场本人旧活动约 +1.35 KB；后者有旧活动时还会触发活动页模型的价值／参会人／准备度读取，验收账号没有覆盖。验收账号数据少，门槛只对它们成立。SC-05 ⑤ 要真的造数据实测（不是按单场字节线性外推）。
- 客户端挂载后的读取不在 ② 里：dashboard snapshot 7.9–9.8 KB、计划、ledger、会话、signals，以及 `agent/page.tsx` 在复合读取之外的报名状态、canonical id、社群读取。它们是否已在 ① 中，以 README 总账为准。本 Sprint 只把页面级那三项作为报告行测一次，不进门槛。

## 范围

- **做（P2，一个 Generator）：**
  - A. 首页联系人改用窄计数：数据库内一条语句返回本人**全部**联系人中的 `knownPeople`、`inProgress`，以及非法 version（联系人与关系）、歧义的判定（按事实 6 的有效性范围），异常照旧抛出。结果类型按事实 6「失败形状」。live 走 SQL；mock 模式由现有 mock 联系人服务算出同样两个数。`homeViewModel` 只吃这两个数。联系人页模型本身不改。
  - B. 旧活动表 `listEvents` 的归属过滤下推到 SQL（provider 层，所有调用方受益，W41-4）：provider 加可选注入点，只在 configured provider 里注入 Postgres 专用 reader（单条 OR 查询、jsonb 严格比较）；非 Postgres 的 store（内存／注入）保留原过滤路径。
  - C. 已报名活动改为「已发布 join → 校验本人这些活动下全部报名行 → 筛 rsvped → 按 id 取活动」（事实 7、8）。保持顺序、去重与失败语义。只新增 repository／service 方法，不改原方法。
  - D. 测量脚本（证据目录内）扩展噪声集合与页面级报告行；对照表（mock 33 组 + live 边界组合）改前改后各跑一次。
- **不做：**
  - 资料两条读取（W41-5）；
  - P1 `readSignalGraph` 收窄（W0042）；
  - P3 SSR 与 dashboard 合并；
  - P4 dashboard／活动池目录收窄（W0036 的 `eventPool`／`upcoming` 前 12 场契约不动）；
  - P5 cold-open 总账门禁脚本入库（W41-6）；
  - 活动页模型在「本人有旧活动」时的价值／参会人／准备度读取；
  - 已报名活动的显示范围（W41-3）；
  - 任何缓存（不能用缓存掩盖读取量）；
  - 迁移与索引、部署、生产读取、App 端。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`：全文 356 行。改第 69–77、121–163、185–242、244–312 行。
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts`：只读第 189–196、210–219、328–360、466–516 行，看计数与失败形状。
- `features/contacts/live-service.ts:145–196`（`runLiveContactsQuery`）；`features/contacts/storage/contact-live-record-provider.ts:220–260、455–540、560–735`（有效性、歧义、列表读取；只读，不改）；`contact-read-authorization.ts`；`contact-scope-postgres-reader.ts`（SQL 归属写法先例）；`features/contacts/contact-graph-query.ts:195–207、360–372`。
- `features/events/event-crud-and-import/providers/storage-event-provider.ts:237–350`；`live-service.ts:480–508`。
- `features/events/canonical-participant-event-journeys.ts`（全文 103 行）；`features/events/core/service.ts:105–140`；`core/repository.ts`；`core/storage/postgres-repository.ts:110–140`；`event-operations/repository.ts`（接口）；`event-operations/storage/canonical-registration-repository.ts:384–420、1067–1091`；`event-operations/storage/memory-repository.ts`（同名方法的内存实现要同步）。
- `app/(app)/app/agent/page.tsx:139–220`、`app/(app)/app/home/events/page.tsx`：只读，确认调用不变。
- 测试先例：
  - `tests/pages/app-home-profile-read-trim.test.ts`（W0040，首页路径计数写法）
  - `tests/pages/app-agent-guide-demo-page.test.tsx`（示例期 `home` 恰好 1 次、开关关闭各 1 次）
  - `tests/services/canonical-participant-event-journeys.test.ts`
  - `tests/capabilities/event-crud-and-import-live-store.test.ts`
  - `tests/services/contact-scoped-read-postgres.test.ts`（随机 schema 的 PG 并跑）
- 测量：复制 W0040 的 `probe.ts`、`matrix.ts` 到 `~/orbit-sprint-evidence/web/sprint-W0041/run-01/` 扩展，不放进仓库。

### 关键符号（原样）
- `export async function loadAppHomeRouteViewModel(searchParams?: AppHomeSearchParams, actor?: AppHomeActor | null, dependencies: AppHomeRouteDependencies = {}): Promise<AppHomeRouteViewModel>`
  - 签名不变，可在 `AppHomeRouteDependencies` 加可选注入点。
  - 调用方（文本）：`agent/page.tsx:141`、`home/events/page.tsx:33`，测试 `app-agent-registration-actor-id`、`app-agent-guide-demo-page`、`canonical-participant-event-journeys` 等。
  - 按 CRITICAL 处理。
- `export async function loadAppContactsRouteViewModel(searchParams?, actorId?, controls?)`：首页不再调用。联系人页、`contacts/[id]`、dashboard、pipeline 照旧调用，**不改**。
- `async listEvents(actorId)`（`storage-event-provider.ts:248`）：provider 方法，GitNexus CRITICAL（direct 2，见事实 1），实现改为 SQL 归属。
- `export async function readConfiguredCanonicalParticipantEventJourneys(rawSubject: string, options = {}): Promise<readonly PublishedCanonicalEvent[]>`：签名不变，内部换读法。
- `listPublishedEvents(now?: Date)`、`listCanonicalRegistrationsForUser(userId, eventIds)`：不改，只新增方法，例如 `listPublishedEventsByIds`、`listRsvpedCanonicalEventIdsForUser`，名字由 Generator 定。

### 前序交接要点
- W0017／W0021／W0029／W0036／W0040 的流量口径：每条语句返回行的 JSON 字节之和，不含协议开销；十进制 MB。
- W0036：snapshot `upcoming` 只带最早 12 场 + `upcomingTruncated`，计划点名补查 `resolveHomePlanEventsAction`。本 Sprint 不碰 dashboard／活动池代码。
- W0037：示例期社群读取 1 次。W0038：月历只用 `home.events`。
- W0040：`loadAppProfileRouteViewModel(actor, { suggestions: "skip" })` 不动；示例期 `home` 恰好 1 次、`home={null}`；开关关闭 home／events／registrations／community 各 1 次。

### 易错边界（都有对应 SC）
- **计数口径**（SC-02）：`knownPeople`、`inProgress` 与旧页面模型在同一批数据上逐项相等（本人有 35 条联系人时也相等，证明没有 30 条窗口），包括：
  - 归属：`accountId` 为空、`null`、等于、不等于、非字符串；
  - `deleted` 行、pending 联系人；
  - 有效性：缺 `displayName`、非法 `stage`／`source`／`evidenceIds`；
  - `archived`／`captured`／`reviewing`／`nurture` 各 stage。
- **异常照旧**（SC-02，按 W41-2）：本人数据的异常照旧让首页失败，错误码与改前一致：
  - 联系人或**关系**的非法 `version` 抛错；
  - 重复规范关系抛 `CONTACT_DETAIL_AMBIGUOUS_CONNECTION`；重复关系中一条结构无效、或重复关系指向无效／不存在的联系人时不算歧义（新旧一致）；
  - 本人在已发布活动上的坏报名行（rsvped **或 cancelled**）抛错。
  - 不得因为改成计数就吞掉。
- **不新增失败面**（SC-02）：本人在**未发布**活动上的坏报名行（rsvped 或 cancelled），改前读不到，改后也不能让首页失败。
- **结构化失败不变**（SC-02）：无 actor、live provider 未配置时首页 route-state 的 copy／evidenceIds／source 与改前相等；会抛的情况（服务解析失败、SQL 失败）照旧抛，不被包成 route-state。
- **旧活动归属**（SC-03）：SQL 与 JS 过滤逐条等价（`accountId` 用 jsonb 比较，不复用 `payloadAccountId`，事实 5）；单条 OR 查询，交错插入下同一快照行序与旧读取一致（回归观测）；无 actor 仍 0 查询返回 `[]`；内存 store 走原路径。
- **已报名活动**（SC-02、SC-03）：顺序按目录 `starts_at desc nulls last, event_id`；同一活动多条报名只出一次；只要 `rsvped`；只要已发布；`rawSubject` 为空不查。
- **其他调用方**（SC-03）：
  - 联系人页模型、`listPublishedEvents`、`listCanonicalRegistrationsForUser` 的 diff 为空（只新增）；
  - 不改 `contact-live-record-provider.ts`（W0045／W0046 会改）；
  - 不改 `features/profile/**`、`app/api/profile/**`、dashboard／活动池（`features/agent/home-event-pool*`、`home-dashboard-*`）。
- **读取量**（SC-01）：
  - 首页复合读取里**不再出现**任何「只按 workspace + collection、无 actor 条件」的 `orbit_records` 读取，也不再出现整目录 `event_ops_events` 读取；
  - 不新增 `limit: "unbounded"` 的整 workspace 读取（`tests/audits/unbounded-list-reads.test.ts` 通过）；
  - 不用缓存。
- **测量安全**：只连 localhost；噪声只写本机测试库的临时 workspace（W0040 做法：`ORBIT_WORKSPACE_ID` 指定，脚本开头打印 host 与 workspaceId 作证明），测完删除并证明剩余 0 行。

## 范围与文件

- **修改：**
  - `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`
  - `features/events/event-crud-and-import/providers/storage-event-provider.ts`（加可选注入点，configured provider 注入 PG reader）
  - `features/events/canonical-participant-event-journeys.ts`
  - `features/events/core/{repository,service}.ts`、`features/events/core/storage/postgres-repository.ts`（新增按 id 取已发布活动）
  - `features/events/event-operations/{repository.ts,storage/canonical-registration-repository.ts,storage/memory-repository.ts}`（新增本人 rsvped 状态投影）
  - 受影响的既有测试
- **新建：**
  - 旧活动本人归属 PG reader，建议 `features/events/event-crud-and-import/providers/owned-events-postgres-reader.ts`。
  - 联系人首页计数读取器与服务，建议 `features/contacts/storage/home-contacts-summary-postgres-reader.ts` + `features/contacts/home-contacts-summary.ts`（含 mock 实现），名字可调，在 REPORT 登记。
  - 测试：
    - `tests/pages/app-home-ssr-read-narrow.test.ts`：首页接线、mock 模式输出等价、失败映射；
    - `tests/services/home-contacts-summary-postgres.test.ts`：随机 schema，新计数与旧页面模型并跑比对；
    - 旧活动 SQL 归属并跑比对：扩展 `event-crud-and-import-live-store.test.ts` 或新建；
    - 扩展 `canonical-participant-event-journeys.test.ts`：新旧读法并跑比对（含 PG）。
- **证据（仓库外）：**`~/orbit-sprint-evidence/web/sprint-W0041/run-01/`，包括：
  - `probe.ts`／`matrix.ts`（扩展版）；
  - `measure-before/after.jsonl`、`noise-before/after.jsonl`；
  - `matrix-before/after.json`、`matrix-diff.txt`、`matrix-live-before/after.json`；
  - 截图、全量对照清单、impact 输出。
- **排除：**
  - `features/contacts/storage/contact-live-record-provider.ts`、联系人页模型及其页面；
  - `features/profile/**`、`app/api/profile/**`；
  - `iorbit-home.tsx` 等首页 UI；
  - dashboard／活动池；
  - `repos/orbit-app/**`；
  - 迁移；
  - README／REQUIREMENTS／RULES 及 W0043～W0055 目录。

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0041-01 | **单次读取实测与结构。**本机 W0017 口径、复用并扩展 `probe.ts`，测三账号（`user_verify_new`／`legacy`／`plan`）改前、改后的首页 SSR 复合读取字节／行／语句，warm-up 一次不计。**硬判据：**(a) 改后逐语句标签里没有任何「无 actor 条件的整 workspace `orbit_records` 读取」和整目录 `event_ops_events` 读取；(b) 噪声对照：临时 workspace 中其他 10 个账号往 contacts、connections、evidence、旧 events 各插 ≥100 条，并发布 ≥20 场**本人未报名**的活动、各有他人报名；本人首页字节与语句数改后**完全不变**（改前同条件应增长，作对照）；测完删除并证明剩余 0 行；(c) `user_verify_plan` 改后单次 ≤ W41-1 定的硬门槛（推荐 3,143 B）；语句数按账号判定（有报名 6、无报名 5，事实 4）。**报告指标：**三账号字节与降幅、相对目标线（推荐 2,644 B）的差额；页面级另外三项读取（报名状态、canonical id、社群）单次字节，不进门槛 | 测量输出（改前／改后／噪声，含 host 与 workspaceId 证明行）；`tests/audits/unbounded-list-reads.test.ts` 通过 |
| SC-W0041-02 | **首页各块显示逐项不变（含边界数据）。**(a) mock 对照：沿用 W0040 `matrix.ts` 的 33 组场景×actor，`loadAppHomeRouteViewModel` 输出改前改后逐字节相同。(b) live 对照：本机随机 schema／临时 workspace 造边界数据，固定时钟后整份 `home`（含 `account`、`events`、`stats`）或 route-state 改前改后深相等。边界数据为：易错边界的计数口径全组合；2 个本人旧活动（一个按 `userId`、一个按 `accountId`）；本人 35 条联系人（archived 与歧义记录落在第 30 条之后）；已报名 0／1／3 场、含 cancelled 与 waitlist 报名、草稿活动上的报名、同场重复报名（PG 构造不了则注明只在内存仓库测）。(c) 并跑比对：新计数与旧 `loadAppContactsRouteViewModel` 的 `knownPeople`／`inProgressCount` 相等；本人数据异常（联系人非法 version、**关系非法 version**、重复规范关系、已发布活动上的坏 rsvped 行、**已发布活动上的坏 cancelled 行**）新旧都失败且错误码一致；重复关系中一条结构无效、指向无效联系人时新旧都成功；本人在**未发布**活动上的坏 rsvped／cancelled 行新旧都成功；无 actor、provider 未配置的 route-state 逐项相等，服务解析失败、SQL 失败新旧都抛。(d) 真实页面 1440／375 看账户卡、补人脉提示、活动小模组、已报名栏、月历，与改前截图一致（时间戳除外） | `matrix-diff.txt`（两组 0 差异）；新测试 RED→GREEN、0 skip；PG 测试证明未 skip；截图 |
| SC-W0041-03 | **其他调用方不变。**(a) `/app/home/events`：与 SC-02 同一对照（同一 loader）通过，`app-home-live-route-services` 测试通过。(b) 旧活动：SQL 归属与原 JS 过滤并跑比对，逐条与顺序相等，覆盖 `userId` 命中、数字或非字符串 `accountId`、两者都不命中、`deleted`、其他 workspace、无 actor 0 查询；`/app/events`、`app/api/events`、计划与 AI 助手消费者的既有测试通过。(c) `git diff chat-agent..HEAD` 在联系人页模型、`contact-live-record-provider.ts`、`features/profile/**`、`app/api/profile/**`、dashboard／活动池、`repos/orbit-app/**` 为空；`listPublishedEvents`、`listCanonicalRegistrationsForUser` 实现不变 | 并跑测试；`app-events-live-route-services`、`app-contacts-live-route-services`、`event-crud-and-import-live-store`、`canonical-participant-event-journeys`、`app-canonical-agent-personal-scope` 通过；diff 输出 |
| SC-W0041-04 | **示例期与开关关闭读取不回退。**`app-agent-guide-demo-page.test.tsx` 既有断言不变：示例期首页复合读取恰好 1 次、`home={null}`、关系目标判定（空目标进示例，有目标且满足 D2 进真实首页）、W0036 活动池目录 1 + 报名 1、W0037 社群 1；开关关闭时 home／events／registrations／community 各 1 次；W0040 三例（建议 0 次）通过。新增一例：示例期那 1 次首页读取不再调用联系人页模型（计数服务调 1 次） | 测试全部通过；临时还原首页接线时新例 RED |
| SC-W0041-05 | **数据库月预算表重算（D39 1.6 GB）。**REPORT 一张表，沿用 W0040 SC-05 的人群模型与两种口径，列出以下各行，给三档两口径合计并按 W41-1 判定。达到目标线、只过硬门槛、都没过三种情况如实写；100% 档写明差额与后续选项（D39 共享缓存）；不得删行或降口径：① 开工时总账；② 首页 SSR 真实期（改后 `user_verify_plan` 实测 × 120,000）；③ 示例期（改后 `user_verify_new` 实测 × 10,000）；④ 被消除的项（改前 58,808 B 对照）；⑤ 参考行：页面级三项读取；本人数据增长的敏感度，**实际造数据测**（已报名 0／5／20 场，旧活动 0／5 场），不按单场字节外推 | REPORT 预算表；测量输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W41 待定项、与大目标 4 的顺序），记录基线 SHA、Planner SHA256；`git status --short` 确认他人未提交文件不动。
2. GitNexus 全量重建索引后，对 `loadAppHomeRouteViewModel`、`listEvents`（provider）、`readConfiguredCanonicalParticipantEventJourneys`、`createCanonicalParticipantEventJourneyReader`、新增方法所在接口跑 upstream impact，并记 REPORT。仍错位按 `UNKNOWN` 处理，并用文本搜索复核事实 5、7 的调用方。
3. 改前：跑测量（measure + noise）与两组对照（mock、live）存证据；写 RED：首页不调联系人页模型、并跑比对、失败语义。
4. 实现 A → B → C，每步跑定向集；再跑改后测量、噪声与对照。
5. 浏览器：复用 `http://localhost:3000`（或协调者指定端口），用 verify 账号看 1440／375，检查控制台错误。
6. H 档收口：全量对照（RULES §5.2），一次 Codex 代码 review。意见交回本 Generator 修，协调者裁决。
7. 暂存前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`（`partial`／`truncated` 重跑）；路径限定 commit；写 REPORT（短模板，含 SC-05 表）。交接分支 `sprint/W0041-home-ssr-read-narrow` 与固定最终 SHA，由协调者合并回 `chat-agent` 并验证合并树。

## 最小测试与检查

- **档位：H。**理由（任一即足够）：
  - 共享 provider：旧活动 provider 被十余个消费者共用。
  - 授权口径：SQL 复刻 JS 的归属与有效性规则。
  - `loadAppHomeRouteViewModel` 按 CRITICAL 处理（索引不可用）。
  - 收口做一次全量对照和一次 Codex 代码 review。
- **开发定向集（cwd `repos/orbits`）：**
  - 新测试三个；
  - `tests/pages/app-agent-guide-demo-page.test.tsx`
  - `tests/pages/app-home-profile-read-trim.test.ts`
  - `tests/services/canonical-participant-event-journeys.test.ts`
  - `tests/capabilities/event-crud-and-import-live-store.test.ts`
- **操作链收口集：**
  - 上述 + `tests/pages/app-home-live-route-services.test.ts`、`app-agent-registration-actor-id.test.tsx`、`app-canonical-agent-personal-scope.test.ts`、`app-agent-iorbit-home.test.tsx`、`app-events-live-route-services.test.ts`、`app-contacts-live-route-services.test.ts`、`tests/capabilities/event-crud-and-import.test.ts`、`tests/audits/unbounded-list-reads.test.ts`；
  - PG 测试先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip；
  - `npx tsc --noEmit -p .` 一次。
- **集成：**H 档收口一次 `npm test` 全量，按 RULES §5.2 对照新增失败（W0040 基线 10 项）；不 source `.env`。
- **不运行：**生产／Preview 读取、部署、App 端测试（App 端零改动，SC-03 以 diff 证明）。

## 待定项（需要用户决定，附推荐与对标）

| 编号 | 问题 | 推荐（对标成熟产品做法） |
| --- | --- | --- |
| W41-1 | 预算判定：门槛定在哪一档、哪种口径；没到怎么判 | **两级门槛**：硬门槛 3,143 B（10% 档去重口径），不过则 SC-01 fail；目标线 2,644 B（20% 档去重口径），只报告差额。100% 档写明不可达，后续走 D39 共享缓存。**对标**：Lighthouse CI／web.dev 性能预算的 assertion 分 `warn` 与 `error` 两级，error 阻断合并，warn 只提示；预算按实测账号定，不按理想值定 |
| W41-2 | 改成计数后，数据异常时首页还要不要和现在一样失败 | **本人数据的异常照旧失败，错误码不变**：联系人与关系的非法 version、重复规范关系、本人在已发布活动上的坏报名行（含 cancelled）。**与本人无关的行不再被读取，因此不再能拖垮首页**：别人的坏活动行、草稿活动行。这是收窄的直接结果，在 REPORT 列为「已知且接受的差异」。**对标**：GitHub Scientist 做读路径替换时，新旧并跑比对结果**和异常**，只有明确登记的差异才允许忽略（`ignore` 规则）；行为变化不夹带在性能改动里 |
| W41-3 | 已报名活动没有时间上限（含已结束的已发布活动），每场约 0.9 KB，随报名历史增长 | **W0041 不改显示**，保持现状，REPORT 给敏感度（SC-05 ⑤）；是否只取「未结束 + 近 N 天」另开产品决定。**对标**：Eventbrite／Meetup 首页与「我的活动」默认只列 Upcoming，Past 放到单独分页 |
| W41-4 | 旧活动表的过滤下推放 provider 层（所有调用方受益）还是只给首页另写读取 | **放 provider 层**，但限定实现：provider 加可选注入点，只在 configured provider 注入 Postgres 专用 reader（单条 OR、jsonb 严格比较），不复用 `payloadAccountId`、不扩展通用 `LiveRecordListQuery`；以并跑比对证明逐条等价；非 Postgres store 保留原路径。**对标**：Rails／Django 等 ORM 惯例是把筛选写成数据库 `where`（scope），不在应用层 `select`／filter 全表；同一归属规则只保留一份实现，避免首页与活动页口径分叉 |
| W41-5 | 资料两条读取（profile 919 B + account 503 B）要不要顺手收成首页投影 | **不在 W0041**：W0040 刚用开关保住资料失败语义，再改会让两个 Sprint 的证据交叉。只有实测超硬门槛时，才作为第一后续选项另开 L／H 档小 Sprint。**对标**：Google 工程实践的小 CL 惯例，一次改动只做一件事，便于 review 与回滚 |
| W41-6 | 客户端挂载后的读取（dashboard snapshot、计划、ledger、会话、signals）与页面级三项是否进本 Sprint 门槛 | **不进门槛**，本 Sprint 只把页面级三项作为 SC-05 ⑤ 报告行。完整 cold-open 总账门禁（调查报告 P5）排在 W0042（P1）之后，单独一个 Sprint，届时决定 P3 合并。**对标**：性能预算按「整页」设，但分阶段收紧，先把最大的单项降到预算内，再加整页门禁，避免一次改动面过大 |

## 失败与交接

外部条件缺失先不启动；run 已开始则按 RULES 产出 failed／blocked 报告，不自动重跑。

REPORT 必须写：
- SC 映射与 SHA；
- 索引重建与 impact 结果（或 `UNKNOWN` + 文本复核）；
- 新增方法名与位置；
- 三账号改前／改后／噪声测量摘要；
- 两组对照的 diff 结果；
- 已知且接受的差异清单（W41-2）；
- SC-05 预算表与门槛判定；
- 截图路径；
- 全量对照新增失败清单；
- Codex review 处理。

交接列：本线分支、固定最终 SHA、待合并目标 `chat-agent`；W0042（P1）起点；若未达目标线，列后续选项排序。未完成 commit 或合并树验证不能标 completed。

## 修订记录

| 修订 | 内容 |
| --- | --- |
| 1（2026-10-02） | 初稿。按 `4f0aa533` 源码逐语句复核 W0040 `measure-after.jsonl`。查明首页只用联系人两个计数、旧活动表整 workspace 读取后 Node 过滤、已报名活动先读整目录再筛。算出预算门槛（10% 档 3,143 B、20% 档 2,644 B，100% 档不可达）。发现 GitNexus 索引名字错位不可用，调用方以文本搜索为准 |
| 2（2026-10-02，Codex 方案 review 后） | 逐条处理见下表 |

### Codex 方案 review 处理（`~/orbit-sprint-evidence/web/sprint-W0041/plan-review.txt`）

| 意见 | 处理 |
| --- | --- |
| P0-1：首页联系人现在只是「默认第一页 30 条」，全量计数会改变显示 | **不接受结论，补证据和测试**。核对源码：30 的默认值在 `createPostgresContactCardReader`（`contact-list-postgres-reader.ts:1176`，卡片接口）；首页走的分页读取器在 `limit` 缺省时直接返回 null（第 1906–1907 行，`supportsBoundedContactPage` 第 1858–1868 行要求 limit），`readFocusedContactGraph` 转走 scope reader 读本人全部联系人；W0040 实测也只出现 scope 查找与按 record id 读取，没有分页 CTE。W0036 PLANNER 那句是误记。事实 6 写明此点；SC-02 加 35 条联系人（archived、歧义落在第 30 条之后）的数据，用新旧并跑比对锁住 |
| P0-2：报名「先筛 rsvped」会吞掉已发布活动上的坏 cancelled 行 | 接受。事实 7、8 与范围 C 改为「已发布 join → 校验本人这些活动下全部报名行 → 筛 rsvped → 按 id 取」，禁止 SQL 先加 `status='rsvped'`；SC-02 加已发布／未发布 × 坏 rsvped／坏 cancelled 四例；同场重复报名先核实能否在 PG 构造 |
| P1-1：漏了关系的非法 version；歧义范围要复刻有效性 | 接受。事实 6、易错边界、SC-02 补关系非法 version、歧义只算有效关系指向有效联系人，加「一条结构无效」「指向无效联系人」两例 |
| P1-2：B 的实现入口不闭合，通用 store 不支持 OR，`payloadAccountId` 用 `->>` | 接受。事实 5、范围 B、文件表、W41-4 改为可选注入点 + configured provider 注入 PG 专用 reader（新文件），不扩展通用查询 |
| P1-3：旧活动「保持顺序」没有契约依据 | 接受。改为单条 OR 查询、交错插入下同一快照行序一致作回归观测，不写成长期契约 |
| P1-4：联系人计数的失败形状未定义 | 接受。事实 6 规定新服务结果类型与结构化 failure／抛错的对应；易错边界与 SC-02 加无 actor、provider 未配置、服务解析失败、SQL 失败四类 |
| P1-5：参与活动字段表述不精确 | 接受。事实 3 拆成「直接影响显示」与「解析与契约仍要用」两层，按 id 取活动沿用整行映射只改 `where` |
| P1-6：噪声断言与本人数据增长混淆 | 接受。SC-01 噪声活动限定「本人未报名」；SC-05 ⑤ 改为实际造数据测；GOAL 对应句加限定 |
| P2-1：估算应写 2,530 B、余量 114 B、对 2,528 B 无余量 | 接受，事实 4 与「预算目标」结论改写 |
| P2-2：语句数依账号短路 | 接受，事实 4 与 SC-01 写明有报名 6、无报名 5 |
| P2-3：调用方分直接与传递 | 接受，事实 5 分层 |
| P2-4：H 档理由精简 | 接受 |
| P2-5：W41-4 需附实现约束；其余推荐合理 | 接受，W41-4 已加约束；W41-2 补 cancelled 行与关系 version |
