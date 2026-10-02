# Sprint W0056 — 读取瘦身收尾（W41-3 已报名活动按月窗口、W42-3 建议图坏行隔离、W42-10 建议图只读本人联系人）

**Plan revision:** 2（2026-10-02）。revision 1（SHA256 `cb97308e72acea9f7a67e6b60876285a9fff90a612b4d9412bacf6b714bb8c3d`）经 Codex `gpt-5.6-sol` 方案 review（`~/orbit-sprint-evidence/web/sprint-W0056/plan-review.txt`：P0 1、P1 4、P2 3，结论「修 P0 后再批准，窗口方案可保留」）后修订，逐条处理见文末。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-03（线上流量核算）、RV-05（用户读取流量瘦身）。来源：W0041 REPORT 交接的 W41-3，W0042 REPORT 交接的 W42-3、W42-10；用户 2026-10-02 同意合成一个 Sprint，做法由协调者按成熟产品惯例定。
**单一目标:**
- 首页 `/app/agent` 的服务端只读「东京当月起的已报名活动 + 当月之前最近 2 场」，首页上所有可见结果不变。
- 建议图只读本人图内的行：不再读他人的非对象 payload 行，他人坏行不再拖垮所有人；联系人、互动记忆、证据只取 `belongsToActor` 的行。
- 正常数据下建议接口的输出不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `b0ba69d2`（W0042 已合并）。下文行号都按 `b0ba69d2`。**W0056 在 W0055 之后执行，届时 HEAD 会前进很多**，Generator 开工时必须按符号重新定位行号，并重新核对「与大目标 4 的重叠」（D46⑦ 同一做法）。GitNexus 编制时已全量重建（`analyze --index-only --force`，144,245 节点，47 s），impact 输出在 `~/orbit-sprint-evidence/web/sprint-W0056/plan/`。
**进入条件:**
- W0055 已 completed，或协调者届时书面裁决可以开工。不与大目标 4 的任何 Sprint 并行。
- 协调者已在 README 登记 W0056 行，以及本页「已定做法」的决定项（新 D 编号）。
- 本机 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → localhost）可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 不需要云端授权：不读写生产或 Preview，不调用付费 AI，不做迁移，不加索引，不改环境变量。生产读取计量开关 `ORBIT_PG_READ_METRICS` 不在本 Sprint。

## 已查清的事实（按 `b0ba69d2` 源码与 GitNexus 复核）

### A. W41-3：已报名活动

1. **数据来源。**
   - `loadAppHomeRouteViewModel`（`home-route-view-model.tsx:293`）在 `Promise.all` 里并行读取：
     - 旧活动（`loadAppEventsRouteViewModel`）；
     - 联系人计数；
     - 资料；
     - `readConfiguredCanonicalParticipantEventJourneys(rawSubject)`。
   - `homeViewModel`（第 171 行起）用 `mergeHomeEventJourneys(owned, participant)` 合并，先放旧活动，再放参与活动；按 `id`／`code`／`canonicalEventId` 任一相同去重。合并结果就是 `home.events`，同时给出 `stats.events = events.length`。
   - 参与活动的读法（W0041，`canonical-participant-event-journeys.ts:44–85`）：
     1. `listPublishedCanonicalRegistrationStatusesForUser(rawSubject)` 取本人在**已发布**活动上的**全部**报名行，并逐行校验；
     2. 筛出 `rsvped`；
     3. 用 `listPublishedEventsByIds` 按 id 取整行（`core/storage/postgres-repository.ts:139`，`order by starts_at desc nulls last, event_id`；`recordFromRow` 遇坏行抛错；JS 再筛 `published`）。
2. **两个调用方，显示需求不同。**
   - `/app/agent`（`agent/page.tsx:139–149` 的 `loadHomeModel`，示例判定与真实首页共用一次）：只把 `home.events` 交给 iOrbit。
   - `/app/home/events`（`home/events/page.tsx:33`）：「我的活动」页，`OrbitRealHome mode="events"`。它用 `AccountEventsBlock` 列出**全部**活动，按 全部／进行中／未开始／已结束 分标签计数（`orbit-real-home.tsx:177–183、237、320`）。**这一页必须保持全量**，所以窗口只能由 `/app/agent` 主动开启，loader 默认行为不变。
   - `/app/home` 只做重定向，不读数据。
3. **`/app/agent` 上 `home.events` 的全部消费者**（文本搜索 `home.events`／`home?.events`，GitNexus：`iorbitRegisteredEvents` LOW，direct 2）：
   - `agent/page.tsx:188–214`：对 `home.events` 的每个 id，先 `resolveConfiguredActorEventCanonicalIds`，再用**账号 id（`actorId`）**调 `readRuntimeEventRegistrationStates`，得到 `registered` 并写进 `youRsvped`。这个报名读取是页面级的，按 id 逐个读 availability 和 enrollment，读取量随 id 数增长。
   - `iorbit-home.tsx:675` `registeredEvents = iorbitRegisteredEvents(home.events, now)`（`iorbit-model.ts:1496`）。它只保留 `youRsvped` 的活动，排序为：未开始（`startsAt >= now`）的按时间正序排前，已开始的按时间倒序排后。`Date.parse` 失败的视为未开始；比较器在 NaN 时不稳定。
     - 已报名栏：`registeredEvents.slice(0, 2)`（第 1923 行）。没有未开始的报名时，显示最近已开始的 2 场，**这 2 场可能在上个月或更早**（已核实）。
     - `scheduleRows`（第 680–732 行）：全部已报名活动的东京日期。月历点（`iorbitCalendarMarks`，`iorbit-model.ts:1338`）只计当月；时间线只看所选日，所选日只能在当月（第 406–437 行，`now` 来自客户端时钟，每分钟刷新一次）。
     - `iorbitNextEvent`（第 1389 行，`iorbit-model.ts:1389`）：只取 `startsAt > now` 的。
     - 活动池去重 `registeredEventIds`（第 1082 行）：池只收 `startsAt > now` 的活动（`features/agent/home-event-pool.ts:107`）。
   - `iorbit-chat-aside.tsx:48`：`iorbitRegisteredEvents(home.events, Date.now()).slice(0, 2)`，规则同上。
   - 其余只用 `home.stats.people`、`home.account`。`stats.events` 在 `/app/agent` 上没有显示。
4. **两个「已报名」口径不同，窗口不能只看参与活动读取。**
   - 参与活动 J：会话主体（`rawSubject = session.user.id`）在 canonical `membership_head` 上 `rsvped`，且活动已发布。
   - 显示用的 R：账号 id（`actor.id`），经 `listRuntimeEventRegistrationStatusesForUser`（`features/events/registration/runtime.ts:123–162`）得出；活动处于 `legacy_unenrolled`／`legacy_importing` 时改读旧投影。报名写入也用 `actor.id`（`app/api/events/[id]/registration/route-handlers.ts:514、520`）。
   - `rawSubject` 与 `actor.id` 可以不同：种子用户的会话主体是 profile id（`app/api/_shared/authenticated-actor.ts:55–100`）。
   - 本机开发库：`event_ops_membership_heads` 共 5 行，全是 `rsvped`，`actor_id` 都是账号 id；验收账号的会话主体就是账号 id。
   - **结论：**光用 J 选「当月之前最近 2 场」，在 J 与 R 不一致时不能保证已报名栏不变。另外，旧活动去重也可能吃掉被保留的那 2 场。所以需要页面级的核对与回退（见「已定做法」W56-1）。
5. **成本（W0041 REPORT SC-05 ⑤）。**
   - 复合读取里，每多 1 场已报名活动约 +720 B，人均每多 1 场约 +86.4 MB／月。
   - 页面级报名状态读取（`user_verify_plan` 1 场时 1,429 B／6 条）也按 id 增长。
   - 报名状态行（第 1 步）仍需全量读取并校验（D47② 本人数据异常照旧失败），每行约一百多 B，这是窗口之后剩下的增长项。

### B. W42-3／W42-10：建议图

6. **现读法**（`features/profile/storage/profile-signal-graph-postgres-reader.ts`，188 行；provider `profile-signal-live-record-provider.ts`，903 行）：
   - 三轮读取：profiles+connections → contacts+memories（按本人 connection 推出的 id）→ evidence（按被引用 id）。
   - 每轮 SQL 都带 `jsonb_typeof(payload) <> 'object'`，即**整 workspace 的非对象行全取**（第 98–104 行）。之后交给 JS 选择：`belongsToActor`（第 478 行）、`actorConnectionReferences`（第 531 行）、`selectActorRecordsBeforeEvidence`（第 559 行）、`selectActorEvidenceRecords`（第 602 行）。
   - 由于非对象行全取：他人一行非法 JSON 字符串，会在 `rowToRecord` 抛 SyntaxError；他人一行 jsonb `null`，会在 `belongsToActor` 访问 `.accountId` 时抛 TypeError。两种情况都让所有人的 GET／accept／dismiss reject，由 Next 转成 500。W0042 SC-02 ③ 共 70 例，其中他人坏行 35 例。
   - 内存 store 路径（第 723–770 行）读五个集合全量，再走同一个 `buildProfileSignalGraph`。他人 `null` payload 同样会抛错。
7. **间接共享**（第 569–581、602–612 行）：
   - contacts：`belongsToActor`，或者 `payload.id` 在本人 connection 的 `contactId` 里；
   - memories：`belongsToActor`，或者经 `contactId`／`connectionId` 命中；
   - evidence：`belongsToActor`，或者 id 被本人已选记录引用。
   - 所以他人的联系人、记忆、证据都可能进入本人图。建议摘录形如 `${displayName}: summary`（`live-signal-service.ts`）。
8. **本机统计（规划时只读事务，脚本 `~/orbit-sprint-evidence/web/sprint-W0056/plan/w42-10-indirect-stats.sql`，输出 `w42-10-indirect-stats.txt`）：**
   - 开发库 workspace 共 13 个 actor。按旧规则进入、但 `belongsToActor` 为假的行：contacts 0、memories 0、evidence 0；其中「无人拥有」的 evidence 与「被本人记录引用的他人 evidence」也都是 0。
   - 五个集合的非对象 payload 行为 0，无主行（`user_id` 为空且无 `accountId`）为 0。
   - 重账号 `user_orbit_primary_qa` 本人 contacts 83、memories 528、evidence 4,483，全部本人拥有。
   - 结论：正常数据下改后图与改前逐项相同。Generator 开工时按届时 HEAD 与数据**重跑**这份统计；大目标 4 会写入这些集合，可能产生新形状。
9. **规则收窄后读取可以合成一轮。**五个集合都只取本人行（W56-5 的「真属主」规则），不再需要按 id 推导，一条语句即可（SQL 是超集，最终由 JS 判定）：
   `user_id = $actor and (jsonb_typeof(payload) <> 'object' or payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($actor::text))`，沿用 W0042 的列、投影与 ORDER BY。
   - 本人 `user_id` 上的非对象行仍然取回，交给原 JS：双重编码字符串经 `rowToRecord` 解码后，再按同一规则判定；`null`／非法 JSON 照旧失败。所以「本人图内坏行按现有语义失败」不变。
   - 本机属主冲突统计（`plan/owner-conflict-stats.txt`）：五个集合 `user_id` 为空 0 行，`payload.accountId` 与 `user_id` 不同 0 行，`accountId` 非字符串 0 行。所以从 OR 收紧为 AND 在正常数据下不改变任何人的图。
10. **调用方**（GitNexus，开工时重跑）：
    - `createStorageProfileSignalProvider`：**HIGH**，direct 2、影响 4（transactional、configured、`saveSuggestionDecision`、`live` 工厂），按 H 档处理；
    - `createTransactionalStorageProfileSignalProvider`：LOW；
    - `createPostgresProfileSignalGraphRecordReader`：LOW，3；
    - `selectActorRecordsBeforeEvidence`、`actorConnectionReferences`：LOW，6；
    - `buildProfileSignalGraph`：LOW，1。
    - 文本搜索：这些导出只在 `features/profile/storage/` 两个文件和 `tests/services/profile-signal-graph-postgres.test.ts` 使用。
    - `readSignalGraph` 是对象字面量方法，GitNexus 报 UNKNOWN；W0042 文本复核调用点在 `live-signal-service.ts` 三处。
11. **W0042 的两份并跑测试编码了旧语义**（间接共享、他人坏行失败）：
    - `tests/services/profile-signal-graph-postgres.test.ts`
    - `tests/api/profile-suggestions-postgres-parity.test.ts`
    - 本 Sprint 要按新规则改写，旧语义只保留为冻结的 oracle（见 SC-04）。

### C. GitNexus 本次结果（`impact-*.txt`）

| 符号 | 结果 |
| --- | --- |
| `loadAppHomeRouteViewModel` | 歧义 3 候选，主候选 LOW／4；按 W0041 先例视为 CRITICAL |
| `readConfiguredCanonicalParticipantEventJourneys` | UNKNOWN，0；文本复核：只有首页 loader 与测试 |
| `listPublishedEventsByIds`、`listPublishedCanonicalRegistrationStatusesForUser` | 歧义，UNKNOWN；它们是可选接口方法，文本复核：只有 journeys 使用 |
| `createCanonicalParticipantEventJourneyReader` | LOW |
| `mergeHomeEventJourneys` | LOW |
| `iorbitRegisteredEvents` | LOW |
| `createStorageProfileSignalProvider` | **HIGH** |

UNKNOWN 不当作安全，均已用文本搜索复核。

## 已定做法（协调者按成熟产品惯例定，不再待用户决定）

| 编号 | 决定 | 对标 |
| --- | --- | --- |
| W56-1 窗口形状 | 只有 `/app/agent` 开启窗口；`/app/home/events` 与 loader 默认保持全量。窗口 = 参与活动里 `starts_at >= W`（`starts_at` 为空的也保留），加上 `starts_at < W` 中按 `starts_at desc, event_id` 排序的最近 2 场。**W = 「服务端 now − 24 小时」所在东京月份的 1 日 00:00（+09:00）**：24 小时余量覆盖客户端时钟落后服务端，以及月末最后一天渲染、次月打开的情形。页面级核对：loader 另外返回「被省略的参与活动里最新一场的 `startsAt`」，记为 D，没有省略时为 null。页面算出 R（`youRsvped`）后，若 D 不为 null，且满足「`home.events` 中 R 为真、`startsAt` 可解析、且严格晚于 D 的活动少于 2 场」或「有 R 为真但 `startsAt` 无法解析的活动」，就**回退到全量参与活动**，重新合并，并只为新增的 id 补读报名状态。之后的显示与改前逐项相同 | 过滤后结果不足一页就再取（Twitter／Instagram 时间线分页在客户端过滤后补拉）；时间窗加时钟偏差余量（JWT `leeway`／`clockTolerance`、日历同步按重叠窗口取数）；「我的活动」与首页「近期」分开读取（Eventbrite／Meetup 首页只列 Upcoming，Past 在单独页面） |
| W56-2 报名行校验不缩 | 第 1 步本人报名状态行照旧全量读取并校验（坏行照旧让首页失败，D47②）；只缩第 3 步按 id 取活动整行 | 授权与本人数据完整性检查不因性能优化放宽（W0041 W41-2 同一做法） |
| W56-3 被省略的坏活动行 | 当月之前、未被保留的已报名活动整行若损坏（`recordFromRow` 抛错），改前首页失败，改后不再读取，首页正常显示。这一项登记为**已知且接受的差异**：活动行属于主办方目录数据，不是本人记录；W0041 已把「与本人无关的坏活动行」列为同类差异。回退路径仍是全量读取，语义与改前相同 | 单行坏数据不拖垮整页（W0041 差异 1、D47②） |
| W56-4 只新增方法 | 新增可选的仓库／服务方法（例如 `listPublishedEventsByIdsWindowed`），返回 `{ events, omittedNewestStartsAt }`。`listPublishedEventsByIds`、`listPublishedEvents`、`listCanonicalRegistrationsForUser` 一字不改。依赖缺新方法时（内存仓库、测试注入）走全量原路径 | W0041 W41-4 同一做法：Repository 各后端各自下推 |
| W56-5 建议图规则 | profiles、connections、contacts、interactionMemories、evidence 五个集合**都只取真属主为本人的行**，沿用联系人域 `contactRecordOwnedByActor` 的规则：`actorId.trim()` 非空，且 `record.userId === actorId`，且 `payload.accountId` 缺失、为 `null` 或等于 actor。实现为**不会抛错的版本**：payload 不是非数组对象时，`accountId` 视为缺失。这样本人 `user_id` 上的非对象行进入后，照旧在解析器里按原语义失败；他人行不访问 payload。SQL 写法见事实 9（超集），最终由同一个 JS 函数判定。`actorContactIds`、`actorConnectionIds` 与被引用 evidence 不再参与选择。内存 store 与 Postgres 共用同一个选择函数。**这比用户口述的「只取 `belongsToActor` 为真的行」更严**（Codex P0-1：OR 规则会让 `user_id=B`、`accountId=A` 的行同时进入 A、B 两人的图）；正常数据下冲突行为 0（事实 9），用户可见结果不变 | OWASP 最小权限、单一权威属主；与联系人域 `contactRecordOwnedByActor`／`CONTACT_ACTOR_AUTHORIZATION_SQL` 同一规则，建议图不再比联系人域更宽 |
| W56-6 坏行隔离与告警 | 本人行（`user_id = actor`）的非对象 payload 照旧取回，失败语义不变。他人行不读。告警：Postgres 读取器在**每个进程、每个 workspace 每小时最多一次**跑一条计数探针（限频状态放在模块级、按 workspace 键控，并合并进行中的探针 promise；同进程多个 provider 实例共享；探针失败也占用本小时的名额，下一小时再试）：`select collection_name, jsonb_typeof(payload), count(*) … where jsonb_typeof(payload) <> 'object' group by 1,2`（只统计非对象行，不分属主；本人的坏行会让本人请求照旧失败，同时也计入告警）。探针只返回计数行，失败时吞掉并另记一条日志，不影响请求。计数大于 0 时 `console.warn` 一条结构化 JSON：`{ event: "profile_signal_graph.unattributed_rows_skipped", collection, payloadType, count }`，**不含**任何记录 id、用户 id、workspace id 或 payload。内存路径在 JS 里跳过这些行，并发同名告警（同样限频） | Kafka Connect `errors.tolerance=all` + `errors.log.enable`（跳过坏记录并记录）；日志限频（glog `LOG_EVERY_N_SEC`）；日志不含个人数据（GDPR 数据最小化） |
| W56-7 双重编码的他人行 | `user_id ≠ actor`、payload 是 JSON 字符串、解码后 `accountId = actor` 的行：改前会进入本人图，改后不读。SQL 无法在不解析的前提下归属这种行。正常数据为 0 行（事实 8），计数探针会把它记为告警。登记为**已知且接受的差异** | 归属以行级属主列和结构化字段为准，不解析畸形数据（Postgres RLS 按列判定） |

**需用户授权的点：无。**以上都不涉及付费 AI、生产写入／部署／环境变量；正常数据下用户可见结果不变，只在异常数据或间接引用时变化，并且有成熟惯例可循。用户 2026-10-02 已同意按惯例定。

## 范围

- **做：**
  - A. 首页窗口：loader 加可选参数；journeys 新增窗口读取；新增仓库方法与 PG 实现；`agent/page.tsx` 核对与回退。
  - B. 建议图：provider 选择函数改为只取真属主为本人的行（W56-5）；Postgres 读取器合成一轮，去掉非对象行全取；计数探针与告警；内存路径同规则、同告警。
  - C. 测试与测量：并跑对照、冻结 oracle、噪声对照；测量脚本放证据目录。
- **不做：**
  - 生产读取计量 `ORBIT_PG_READ_METRICS`（需单独授权）；
  - W42-1 B（建议只读所需行）、W42-7（Web 资料页 skip）；
  - App 端缓存、D39 共享缓存；
  - 报名状态行与旧活动读取的窗口；
  - `/app/home/events` 的显示范围；
  - 迁移与索引；
  - `features/profile/live-signal-service.ts` 的算法、`saveSuggestionDecision`；
  - App 端与 `shared/contract|api-schema|compute|domain`（不触发 D46①）。

## 与大目标 4 的重叠（W0056 在 W0055 之后执行）

- **同文件（按 revision 3 各 PLANNER 白名单复核）：**
  - W0043～W0055 都没有把 `profile-signal-*`、`canonical-participant-event-journeys.ts`、`core/storage/postgres-repository.ts`、`iorbit-model.ts` 列为修改。
  - W0054 改 `readDemoModeViewForActor` 的推导，调用方含 `agent/page.tsx`（只调用不改）；W0045／W0046 改联系人域的 `contactFromRecord`。
  - `agent/page.tsx`、`home-route-view-model.tsx`、`iorbit-home.tsx` 有被执行时补充文件改动的可能（RULES §0）。**开工时用 `git log b0ba69d2..HEAD -- <本 Sprint 文件>` 逐个核对**，并在 REPORT 登记差异。
- **数据形状：**
  - W0045：联系人 payload 加 `enrichment`；
  - W0046：时间线来源；
  - W0047：新集合 `relationship_strengths`，不写 `connections`；
  - W0053：导入写 contacts／connections／evidence，id 为 `contact:import:<sha>`；
  - W0055：回填脚本。
  - 本 Sprint 依赖的是这些写入的**属主**（`user_id`／`payload.accountId`）。开工时重跑事实 8 的统计。若出现「本人 connection 引用他人联系人」「无主 evidence 被本人记录引用」大于 0，就**停下登记**，因为那时 W56-5 会改变正常数据下的可见结果，需要协调者重裁。
  - `PROFILE_SIGNAL_PAYLOAD_FIELDS`：若大目标 4 让建议解析器多读了字段，字段表必须已同步。开工先跑 W0042 的两份并跑测试确认为绿，再动手。
- **必须重跑的前序测试（开工时为基线，收口时再跑）：**
  - W0041：`tests/services/canonical-participant-event-journeys.test.ts`、`tests/pages/app-home-ssr-read-narrow.test.ts`、`tests/services/home-contacts-summary-postgres.test.ts`；
  - W0042：`tests/services/profile-signal-graph-postgres.test.ts`、`tests/api/profile-suggestions-postgres-parity.test.ts`；
  - PG 用例要设 `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，否则会 skip。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件（行号按 `b0ba69d2`，开工按符号重定位）
- `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx`：第 30–40 行 `AppHomeRouteDependencies`；第 147–212 行合并与 `homeViewModel`；第 293–370 行 loader。
- `app/(app)/app/agent/page.tsx:120–270`：`loadHomeModel`、报名状态读取、`youRsvped` 注入。核对与回退放在这里，或放进它调用的一个新 helper。
- `app/(app)/app/home/events/page.tsx`：只读，确认不开窗口。
- `app/(app)/app/agent/iorbit-0918/iorbit-model.ts`：第 1338–1420 行月历与下一场，第 1490–1510 行 `iorbitRegisteredEvents`。只读，用来写等价证明。
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`：第 395–440、670–740、1075–1090、1380–1392、1920–1930 行；`iorbit-chat-aside.tsx:40–60`。只读。
- `features/agent/home-event-pool.ts:90–120`：只读，池只收未开始的活动。
- `features/events/canonical-participant-event-journeys.ts`（全文 149 行）。
- `features/events/core/{repository.ts,service.ts:105–160}`、`core/storage/postgres-repository.ts:110–155`：新增窗口方法。
- `features/events/event-operations/storage/canonical-registration-repository.ts` 中 `listPublishedCanonicalRegistrationStatusesForUser`：已发布判定的 SQL 写法，窗口排名要用同一判定。
- `features/events/registration/runtime.ts:123–255`：R 的口径。
- `features/profile/storage/profile-signal-live-record-provider.ts`：第 128–232 行（工具函数与字段表）、第 466–680 行（选择与组装）、第 685–775 行（`readSignalGraph` 两条路径）、第 815–860 行（transactional 注入）。
- `features/profile/storage/profile-signal-graph-postgres-reader.ts`（全文）。
- `shared/storage/postgres-live-record-store.ts`：`rowToRecord`。
- 测试先例：上文「必须重跑的前序测试」五个文件；`tests/pages/app-agent-guide-demo-page.test.tsx`；`tests/pages/app-agent-registration-actor-id.test.tsx`；`tests/capabilities/profile-signal-review-live-store.test.ts`；`tests/api/profile-suggestion-decisions.test.ts`；`tests/audits/unbounded-list-reads.test.ts`。
- 测量：W0041、W0042 的 `probe.ts`、`matrix*.ts`（`~/orbit-sprint-evidence/web/sprint-W0041/run-01/`、`sprint-W0042/run-01/`），复制到 `~/orbit-sprint-evidence/web/sprint-W0056/run-01/` 扩展，不放进仓库。规划统计 SQL 在 `~/orbit-sprint-evidence/web/sprint-W0056/plan/`。

### 关键符号（原样）
- `export async function loadAppHomeRouteViewModel(searchParams?: AppHomeSearchParams, actor?: AppHomeActor | null, dependencies: AppHomeRouteDependencies = {}): Promise<AppHomeRouteViewModel>`
  - 签名不变；窗口经 `dependencies` 的新可选字段传入，例如 `participantEventsWindow?: { now: Date }`。
  - 返回值可以加**仅服务端使用**的字段 `participantEventsOmittedNewestStartsAt?: string | null`，不能进 `home`（`home` 会序列化给客户端）。
- `export function mergeHomeEventJourneys(ownedEvents, participantEvents): OrbitLandingEventView[]`：不改，回退时复用。
- `listRegisteredPublishedEvents(rawSubject: string): Promise<readonly PublishedCanonicalEvent[]>`：不改；新增窗口版方法。
- `listPublishedEventsByIds?(eventIds, now?)`：不改。
- `function iorbitRegisteredEvents<T …>(events, nowMs): readonly T[]`：不改。
- `function belongsToActor(record, actorId): boolean`：改为 W56-5 的真属主规则（不抛错版本）；不直接复用 `contactRecordOwnedByActor`，因为它在 payload 为 `null` 时会抛错。
- `export function selectActorSignalRecords(raw, actorId)`、`buildProfileSignalGraph(raw, decisions, actorId)`：签名不变，规则按 W56-5。
- `export function createPostgresProfileSignalGraphRecordReader(input: { client; workspaceId }): ProfileSignalGraphRecordReader`：签名不变，改为一轮，并加计数探针（限频器可注入，便于测试）。

### 前序交接要点
- 流量口径（W0017／W0040～W0042）：每条语句返回行的 JSON 字节之和，十进制，1 MB = 1,000,000 B。
- W0041：首页单次 2,378 B（`user_verify_plan`）；有报名 6 条、无报名 5 条；每多 1 场报名约 +720 B；全量对照基线 9 项失败。
- W0042：建议图普通账号 31,079 B、4 条（3 轮 + decisions）；重账号 7,316,011 B；f_max 10% 档 0.0985、20% 档 0.0343。
- D32（W0042 后）：去重口径三档总账 1,508.14／1,567.99／2,046.74 MB。另外还要加 W0043～W0055 各 SC-05 新增的行：以开工时 README D32 的最新数为准，不要用本页的旧数。

### 易错边界（都有对应 SC）
- **窗口只在 `/app/agent`**：`/app/home/events` 的读取与输出逐字节不变（SC-01）。
- **月界与时钟**：W 用东京时区；「now − 24 h」跨月时取上个月 1 日。客户端时钟落后不超过 24 小时，月历仍完整（SC-01）。
- **当月之前最近 2 场的排序**与目录顺序一致（`starts_at desc, event_id`）；同一开始时间的平局，就是核对条件取「严格晚于 D」的原因（SC-01）。
- **J≠R 与旧活动去重时必须回退**；回退后与全量完全相同；正常数据下回退 0 次，要计数证明（SC-01、SC-02）。
- **不新增失败面、不吞本人报名坏行**：报名状态第 1 步不缩（SC-01）。
- **建议图**：
  - 他人坏行不再失败；本人坏行（`user_id = actor` 的非法 JSON、`null`、数组、数字）与改前同成败；
  - 间接引用不再进入；
  - 正常数据逐项相同；
  - 两条路径规则一致；
  - 日志不含个人数据，限频生效，探针失败不影响请求（SC-03、SC-04）。
- **不用缓存**掩盖读取量。计数探针不是缓存：它不返回数据行（SC-05）。

## 范围与文件

- **修改：**
  - `home-route-view-model.tsx`
  - `app/(app)/app/agent/page.tsx`
  - `features/events/canonical-participant-event-journeys.ts`
  - `features/events/core/{repository.ts,service.ts}`
  - `features/events/core/storage/postgres-repository.ts`
  - `features/profile/storage/profile-signal-live-record-provider.ts`
  - `features/profile/storage/profile-signal-graph-postgres-reader.ts`
  - W0042 两份并跑测试（改写为新规则 + 冻结 oracle）
  - 受影响的既有测试
- **新建：**
  - `tests/pages/app-agent-registered-window.test.ts`（窗口等价、回退、`/app/home/events` 不变）
  - `tests/services/participant-events-window-postgres.test.ts`（窗口 SQL 与全量并跑）
  - `tests/services/legacy-profile-signal-selection.ts`（从 `b0ba69d2` 原样冻结的旧选择函数，只供测试作 oracle）
  - 名字可调，在 REPORT 登记。
- **证据（仓库外）：**`~/orbit-sprint-evidence/web/sprint-W0056/run-01/`
- **排除：**
  - `iorbit-home.tsx`、`iorbit-model.ts`、`iorbit-chat-aside.tsx`（只读，可见逻辑不改）
  - `home/events/page.tsx`、`orbit-real-home.tsx`
  - `features/profile/live-signal-service.ts`、`app/api/profile/**`
  - `features/contacts/**`
  - `shared/**`
  - `repos/orbit-app/**`
  - 迁移
  - README／REQUIREMENTS／RULES 与其他 Sprint 目录

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0056-01 | **首页窗口下可见结果逐项不变，`/app/home/events` 不变。**(a) 纯函数等价：对同一份 `home.events` 全量与窗口版，固定服务端 now 和客户端 now（客户端 = 服务端、+5 天、−23 小时、**恰好 −24 小时**应等价；−24 小时−1 ms 属于不保证范围，只记录结果），比较以下各项全部相等：已报名栏 `slice(0,2)`（home 与 chat-aside）、当月 `calendarMarks`、当月每一天的时间线 `scheduleRows`、`iorbitNextEvent`、活动池（同一份候选）。数据组合要覆盖：0／1／2／3 场未开始；当月已过去 0／1／3 场；当月之前 0／1／2／5 场；当月之前同一开始时间的平局；`starts_at` 为空；月初 00:00 与月末 23:59（东京）；服务端 now 在 1 日 00:00～23:59（24 小时余量取上月）。(b) loader 与页面：`/app/agent` 开窗口后，参与活动只含 `starts_at >= W`（或为空）+ 当月之前 2 场；`/app/home/events` 不传窗口：不调用窗口方法、仍调用原全量方法；返回对象不得多出新的 own-property（含值为 `undefined` 的）；`JSON.stringify` 输出、渲染顺序与分类计数与改前 oracle 相同。(c) 核对与回退：J 与 R 一致时回退 0 次；以下情况必须回退，且回退后页面传给 `IOrbitShell` 的 `home` 与全量逐项相同：`rawSubject ≠ actor.id`，且被保留的 2 场 R 为假而更早一场 R 为真；被保留的一场被同 id 的旧活动去重；平局等于 D；R 为真的活动 `startsAt` 无法解析。(d) 报名状态坏行（已发布活动上的坏 rsvped／cancelled 行）照旧让首页失败；未发布活动上的坏行照旧不影响首页；当月之前、被省略的坏活动行按 W56-3 登记为差异。(e) 真实页面 1440／375：`user_verify_plan` 与一个造了跨月历史报名的临时账号，改前改后截图一致（时间戳除外），控制台无错误 | 新测试 RED→GREEN、PG 用例 0 skip；`matrix-diff.txt`；截图 |
| SC-W0056-02 | **窗口读取的结构、噪声与回退计数。**(a) 新仓库方法与 `listPublishedEventsByIds` 在随机 schema 上并跑：保留集合 = 全量结果中满足「`startsAt >= W` 或 `startsAt` 为空，或属于 `startsAt < W` 按 `starts_at desc, event_id asc` 的前 2 行」的子序列，顺序与全量相同；`omittedNewestStartsAt` = 未入选且 `startsAt` 非空的最大值，没有省略时严格为 null；已发布判定与报名状态读取一致（草稿或下线活动不进入排名）。(b) 噪声对照：本人当月之前再加 20 场已报名的已结束活动后，`/app/agent` 复合读取与页面级报名状态读取的字节**只增长报名状态行那一部分**（每行字节数实测），活动整行 0 增长；改前对照应增长约 20 × 720 B。(c) 开发库与 `orbit_test` 造数据：`/app/agent` 回退次数为 0；回退时多出的语句数与字节如实报告 | 并跑测试；`noise-before/after.jsonl`（含 host 与 workspaceId 证明行，测完剩余 0 行） |
| SC-W0056-03 | **建议图只读本人行，规则两路径一致，正常数据不变。**(a) 冻结 oracle（`b0ba69d2` 的旧选择 + 旧读取）与新实现在「正常数据」上并跑（`seedGeneratedRelationshipFixturesIntoLiveStore` 夹具去平局 + 本人拥有的边界矩阵），整图与接口 JSON（GET 的 success／empty／pending × zh／ja／en，accept／dismiss 四种）deep-equal。(b) 只在约定的情况下变化：他人联系人经本人 connection 引用、记忆经 `contactId`／`connectionId` 命中、他人 evidence 被本人引用、他人双重编码字符串里 `accountId = actor`，这些改后**不进入**本人图（断言新结果），旧 oracle 进入（断言差异确实来自这里）。**属主矩阵**（五个集合）：`user_id` 等于 actor 或为他人、为空或空白，与 `payload.accountId` 缺失、`null`、等于 actor、为他人、为数字 `123`（actor `"123"`）、为数组交叉组合；另加 actor 为空白串。分三层断言：内存选择结果、PG 返回的原始行集（超集）、最终图。`user_id=B`、`accountId=A` 的冲突行既不进 A 的图也不进 B 的图。(c) 内存 store 路径与 Postgres 读取器在同一份数据（含 (a)(b) 与 SC-04 的坏行）上图逐项相等。(d) 读取结构：PG 一次读图 = 1 条图语句 + 1 条 decisions（加上限频窗口内首次的 1 条探针）；改后语句不再包含 `jsonb_typeof(payload) <> 'object'` 这个无属主分支；读取器只用传入的 client，observer spy 看到每条语句 | 新测试与改写测试 RED→GREEN、0 skip；规划统计重跑输出 |
| SC-W0056-04 | **坏行隔离与告警。**坏数据形态沿用 W0042 oracle 的**全部 7 种**（非法 JSON 字符串、jsonb `null`、数组、数字、双重编码对象（含 `accountId = actor`）、双重编码数组、字符串 `"null"`），PG 共 5 集合 × 本人／他人 × 7 = 70 例，每例写明预期（success／TypeError／SyntaxError）；内存路径覆盖它能表达的同组形态。(a) 他人行 × 7 种形态 × 两条路径：GET、accept、dismiss 改后都成功，结果与「删掉这条坏行」时相同；改前对照为 reject。(b) 本人行（`user_id = actor`）同样 7 种形态：新旧成败与错误类型相同（沿用 W0042 ③ 的逐例 oracle）。(c) 告警：有他人坏行时，第一次读取发出一条结构化 warn，字段只含 `event`、`collection`、`payloadType`、`count`，经正则断言不含记录 id、用户 id、workspace id 和 payload 片段；同一进程、同一 workspace 在限频窗口内再读 N 次不再探测、不再告警；把注入的时钟推进 1 小时后再探测一次。并发与范围：同进程两个 provider／reader 实例对同一 workspace 合计只探测一次；两个不同 workspace 各探测一次；`Promise.all` 并发首次读取 N 次，只产生一次探针与一条告警；探针失败后本小时不再重试。探针抛错时请求照常成功，另记一条不含个人数据的 warn。(d) handler 在本人坏行时仍 reject（500 由 Next 运行时产生） | 测试；日志断言输出 |
| SC-W0056-05 | **读取实测与预算表重算。**按 W0017 口径，复用并扩展 W0041／W0042 的 `probe.ts`，warm-up 一次不计，只连 localhost。(a) 首页：`user_verify_plan`／`legacy`／`new`，以及造数据的「当月之前已报名 0／5／20 场」账号，测改前改后的复合读取和页面级报名状态读取的字节／语句；分开报告两条斜率：活动整行（改前约 +720 B／场，改后应为 0）与报名状态行（改前改后相同，实测每行字节）。REPORT 不得把它写成「首页读取与历史无关」。(b) 建议图：四个账号（含 `user_orbit_primary_qa`）改前改后的字节／语句（正常数据下字节应相同、语句 4→2），探针单次的字节。(c) D32 月预算表：以开工时 README D32 的最新总账为 ①（含大目标 4 新增的行），重算首页行、页面级报名状态行、建议图 f_max；写明「人均每多 1 场已报名活动」的新敏感度。不以总账 ≤1.6 GB 作通过条件（沿用 W42-8），超额照实登记 D32 | 测量输出；REPORT 预算表 |

## 一次 Generator 的执行顺序

1. 复核进入条件（W0055 completed 或协调者裁决；README 已登记 W0056 与决定项），记录基线 SHA、Planner SHA256。`git status --short` 确认他人未提交的文件不动。按「与大目标 4 的重叠」逐个核对文件，重跑事实 8 的统计。前序五份并跑测试先跑绿，作为基线。
2. GitNexus：索引落后时全量重建（后台运行，超过 10 分钟就跳过，并在 REPORT 写明），然后对上文符号跑 upstream impact。UNKNOWN 与歧义的用文本搜索复核。
3. 改前测量（SC-05）与对照存证据；写 RED：窗口等价矩阵、回退四例、他人坏行成功、间接引用不进入、告警限频。
4. 实现 B（建议图，较独立）→ 定向集 → 实现 A（窗口 + 核对回退）→ 定向集 → 改后测量与噪声对照。
5. 浏览器：复用 `http://localhost:3000`（或协调者指定端口），1440／375，查看控制台。
6. H 档收口：全量对照一次（RULES §5.2），Codex 代码 review 一次；意见交回本 Generator 修，协调者裁决。
7. 暂存前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`（结果 `partial`／`truncated` 就重跑）；路径限定 commit。可以按 A／B 两条操作链分两个提交。写 REPORT，交接分支 `sprint/W0056-read-trim-closeout` 与固定最终 SHA，由协调者合并 `chat-agent` 并验证合并树。

## 最小测试与检查

- **档位：H。**理由：
  - `createStorageProfileSignalProvider` 为 HIGH；`loadAppHomeRouteViewModel` 按 CRITICAL 处理；
  - 改变授权与归属口径（建议图只读本人行）；
  - 共享读取契约。
- **开发定向集（cwd `repos/orbits`）：**
  - 新测试三个；
  - 改写的 W0042 两份；
  - `canonical-participant-event-journeys`、`app-home-ssr-read-narrow`
  - `profile-signal-review-live-store`、`profile-suggestion-decisions`
  - `unbounded-list-reads`
- **操作链收口集：**
  - 上述，加：`app-agent-guide-demo-page`、`app-agent-registration-actor-id`、`app-agent-iorbit-home`、`app-home-live-route-services`、`home-contacts-summary-postgres`、`app-home-profile-read-trim`、`profile-signal-review-queue`、`app-profile-onboarding-editor`；
  - PG 测试先跑 `assert-local-test-databases`，REPORT 证明 0 skip；
  - `npx tsc --noEmit -p .` 一次。
- **集成：**H 档收口一次 `npm test` 全量，对照新增失败（基线以开工时为准）。不 source `.env`。
- **不运行：**生产／Preview、部署、App 端测试（App 零改动，用 diff 证明）。

## 失败与交接

外部条件缺失时先不启动；run 已开始的，按 RULES 产出 failed／blocked 报告。

REPORT 必须写：
- SC 映射与 SHA；
- impact 与文本复核结果；
- 与大目标 4 的核对结果；
- 统计重跑结果；
- 回退次数；
- 已知且接受的差异（只限 W56-3、W56-7，以及 SC-03 (b)、SC-04 (a) 的约定变化）；
- 测量与预算表；
- 全量对照；
- Codex review 处理。

交接列：
- 分支、最终 SHA、合并目标 `chat-agent`；
- 后续 Sprint 若改了五个集合的属主写法，或改了报名的 `rawSubject`／`actor.id` 口径，需要重跑的测试文件。

## 修订记录

| 修订 | 内容 |
| --- | --- |
| 1（2026-10-02） | 初稿。按 `b0ba69d2` 复核：已报名栏确会显示上月及更早的已结束活动；J（会话主体）与 R（账号 id）口径不同、旧活动会去重；`/app/home/events` 列全部报名。因此窗口定为「当月（含 24 小时余量）起 + 之前 2 场 + 页面核对回退」，只在 `/app/agent` 开启。本机统计：间接共享 0 行、非对象 payload 0 行 |
| 2（2026-10-02，Codex 方案 review 后） | 逐条处理见下表 |

### Codex 方案 review 处理（`~/orbit-sprint-evidence/web/sprint-W0056/plan-review.txt`）

| 意见 | 处理 |
| --- | --- |
| P0-1：W56-5 的 OR 属主判定会让 `user_id` 与 `accountId` 冲突的行同时进两个人的图，不是安全归属 | 接受。W56-5 改为与联系人域相同的真属主规则（`user_id = actor` 且 `accountId` 缺失／null／相同），不抛错实现；事实 9 改 SQL，并补本机冲突统计（0 行，正常数据不变）；SC-03 加属主矩阵三层断言。比用户口述的「`belongsToActor`」更严，已在 W56-5 写明理由 |
| P1-2：限频没有验证每进程、每 workspace 与并发 | 接受。W56-6 写明模块级、按 workspace 键控、合并进行中的探针、失败占名额；SC-04 加跨实例、跨 workspace、并发三例 |
| P1-3：SC-04 写「五种形态」，W0042 oracle 实为 7 种 | 接受。SC-04 改为全部 7 种、70 例，逐例写预期 |
| P1-4：GOAL 的「不再线性增长」与报名状态行仍全量读取矛盾 | 接受。GOAL 改为「活动整行不再增长，报名状态行仍按条增长」；SC-05 分两条斜率报告 |
| P1-5：SC-03 缺属主冲突矩阵 | 接受，同 P0-1 处理 |
| P2-6：窗口 oracle 表述不精确 | 接受。SC-02 改为集合表达式，写明平局方向、`omittedNewestStartsAt` 定义与 null |
| P2-7：24 小时边界只测 −23 h | 接受。SC-01 加恰好 −24 h（等价）与 −24 h−1 ms（不保证，只记录） |
| P2-8：`/app/home/events` 需锁调用与序列化形状 | 接受。SC-01 (b) 加「不调用窗口方法、无新 own-property、序列化与计数相同」 |
| 窗口方案与消费者核对（Codex 认为成立，未发现遗漏消费者） | 保留 |
