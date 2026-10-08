# Sprint W0042 — 资料「更新建议」图按本人收窄（P1）

**Plan revision:** 2（2026-10-02）。revision 1（SHA256 `bd8e32aa6871e9518b2783666357112d936e566d0520ea784b06c5041ccba9ec`）经 Codex `gpt-5.6-sol` 方案 review 后修订。review 全文在 `~/orbit-sprint-evidence/web/sprint-W0042/plan-review.txt`，共 P0 4 条、P1 11 条、P2 5 条，结论是「修完 P0 再开工」。逐条处理见文末「修订记录」。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-03（线上流量核算）、RV-05（用户读取流量瘦身）。来源：用户决定 D40（W0040 之后 W0041＝P2，W0042＝P1）；调查报告 `~/orbit-sprint-evidence/web/investigation-home-db-read/REPORT.md` 第六节 P1（下称「调查报告」）。
**单一目标:** `createStorageProfileSignalProvider().readSignalGraph(actorId)` 只从数据库取回本人相关的行。现在的做法是对 profiles／contacts／connections／interactionMemories／evidence 五个集合做整 workspace、不分页、全 payload 读取，再在 Node 里过滤。改后返回的 `LiveProfileSignalGraph` 与旧过滤**逐项相等**，包括各集合的行、顺序、`generatedAt`，以及坏数据下的成败。唯一允许的差异有两项：一是排序键完全相同的平局行，它们的相对顺序本来就不确定；二是多条坏行同时存在时先抛出哪一个错误。`/api/profile/update-suggestions` 与 accept／dismiss 的契约、App 端行为都不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `a40ee163`（W0041 已合并并 push）。下文行号都按 `a40ee163`。GitNexus 编制时已全量重建（`analyze --index-only --force`，144,012 节点，名字解析正常），impact 输出在 `~/orbit-sprint-evidence/web/sprint-W0042/plan/`。工作树里有不属于本 Sprint 的未提交改动：RULES §4 列出的用户文件，以及另一会话可能在写的大目标 4 文档。
**进入条件（缺任一项不得标 ready）：**
- 协调者已在 README 登记 W0042 行。依赖列写明：「W40/W41 已完成；W42-1～W42-11 已定（新决定项，例如 D48）；不与 W0043～W0055 并行；按 W42-11 排定先后；后跑方按『与大目标 4 的重叠』的结构判据重跑并跑比对」。协调者已获用户授权按推荐定稿，标「需用户授权」的项不在本 Sprint 执行，不阻塞开工。
- 本机 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → localhost）可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 不需要云端授权。不读写生产或 Preview，不调用付费 AI，不做迁移：只新增查询，不加索引；需要索引就停下，登记为待定项。

## 已查清的事实（按 `a40ee163` 源码与 GitNexus 复核；Codex 复核行号与规则准确）

1. **调用链。**
   - `readSignalGraph` 是对象字面量方法，GitNexus 报 `UNKNOWN`、0 调用方。文本搜索复核，调用点只有 `features/profile/live-signal-service.ts` 三处：
     - 第 585 行：`readPayload` ← `listUpdateSuggestions`（第 601 行）。`scenario: "failure"`（第 617 行）、缺 actor、provider 未配置都在读图前返回。
     - 第 648 行：`acceptUpdateSuggestion`。
     - 第 720 行：`dismissUpdateSuggestion`。
   - provider 构造链（GitNexus，全部 LOW）：`createStorageProfileSignalProvider`（第 455 行，direct 2）← `createTransactionalStorageProfileSignalProvider`（第 643 行；第 655、668 行调用）← `createConfiguredStorageProfileSignalProvider`（第 684 行）← `features/profile/service-factory.ts:46–56` `profileSignalReviewQueueServiceFactory.live`。
   - 测试直接调用 `createStorageProfileSignalProvider`，传的都是**内存 store**：`tests/capabilities/profile-signal-review-live-store.test.ts` 5 例、`tests/api/profile-suggestion-decisions.test.ts` 3 例。这条读取目前**没有任何 Postgres 测试**。
   - `createProfileSignalReviewQueueService`（`service-factory.ts:96`）在 GitNexus 里有歧义；指定候选后为 MEDIUM，影响 13。
2. **谁会读建议图（每次调用读一次整图）。**
   - **App**：
     - `repos/orbit-app/src/screens/profile/ProfileScreen.tsx:255–259`：资料页每次打开都 GET `/api/profile/update-suggestions`。
     - `ProfileSuggestionsScreen.tsx:41–42`：建议页打开时 GET，`cachePolicy: "network-only"`；第 85 行起 POST accept／dismiss。
   - **API**：
     - `app/api/profile/update-suggestions/handler.ts:22–57`、`[id]/accept/handler.ts:39–41`、`[id]/dismiss/handler.ts:30`。
     - handler 不捕获 provider 抛出的异常。直接调用 handler 时得到的是 Promise rejection；500 由 Next 运行时边界产生。
   - **Web**：
     - `profile-route-view-model.ts:585–593` 在 live 模式下默认（`include`）调用 `listUpdateSuggestions`，并且 `.catch(() => null)`。
     - 调用方是资料编辑页 `profile-0918/load-profile-editor-page.tsx:142` 和管理台 `admin-platform-route-view-model.ts:398`。
     - Web 资料编辑页 UI 不显示建议（W0040 事实 5）。首页传 `skip`，0 次（W0040）。
3. **旧过滤的归属规则**（`profile-signal-live-record-provider.ts:464–595`，逐项）。所有规则都基于 `listRecords` 返回的**原始记录**，也就是解析器丢弃之前的记录，包括后来解析失败的无效行。
   - **前提**：
     - 同一 `workspace_id`；`lifecycle_state <> 'deleted'`，所以 `archived` 也读（`postgres-live-record-store.ts:244–246`）。
     - 排序为 `coalesce(occurred_at, updated_at) desc, updated_at desc`（第 297–303 行），没有第三排序键。
     - `rowToRecord`（第 158–185 行）遇到 jsonb 字符串 payload 会 `JSON.parse`（`payloadFromRow`，第 148–156 行）：内容是合法 JSON 文本时还原为对象、数组、数字或 null，不合法时**在读取阶段就抛错**。jsonb `null` 读成 JS `null`。
   - **`belongsToActor`**（第 417–422 行）：`record.userId === actorId || record.payload.accountId === actorId`。
     - JS 严格相等，`accountId` 必须是**字符串**；`payload` 为 `null` 时访问 `.accountId` 会抛 TypeError，但 `userId` 命中时会短路，不会走到这一步。
     - SQL 只能写成 `payload -> 'accountId' = to_jsonb($actor::text)`，不能用 `->>`。先例是 W0041 的 `owned-events-postgres-reader.ts`。
     - 这条规则与联系人域 `contactRecordOwnedByActor`（要求 `user_id = actor` 且 accountId 为空或等于 actor）**不同**，不得复用。
   - **profiles、connections**：只看 `belongsToActor`。
   - **id 集合**：从本人**全部** connection 原始记录取 `payload.id` 得到 `actorConnectionIds`，取 `payload.contactId` 得到 `actorContactIds`。两者都按 `nonEmptyString` 过滤（类型为 string，JS `trim()` 后非空），集合里存**未 trim 的原值**。`actorContactIds` **只来自 connections**。
   - **contacts**：`belongsToActor`，或者 `payload.id` 是非空字符串且在 `actorContactIds` 里。其他用户的联系人行只要被引用，也会进入建议图（间接共享，W42-10）。同一 id 的多行全部进入。
   - **interactionMemories**：`belongsToActor`；或者 `payload.contactId` 在 `actorContactIds` 里；或者 `payload.connectionId` 在 `actorConnectionIds` 里。如果一条 memory 指向本人拥有的联系人，但没有本人 connection 引用这个联系人，它本身也不归属本人，就**不进入**。
   - **evidence**：`belongsToActor`；或者 `payload.id` 是非空字符串且在「被引用 id」里。
     - 被引用 id 来自本人的 profiles、contacts、connections、memories 原始记录，用 `evidenceIdsFromRecord`（第 140–148 行）取：`evidence_ids` 列长度 > 0 时用列值，不过滤空串；否则用 `payload.evidenceIds` 里的非空字符串。
     - 列非空时，payload 里的 `evidenceIds` 被**忽略**。
   - **suggestionDecisions**：已按 `user_id = actor` 读，JS 里再校验 actor。不改。
   - **messages**：恒为空（Sprint 0109）。
   - **`generatedAt`**：本人全部原始记录 `updatedAt` 的字符串最大值，范围是五个集合，含无效行与 archived 行；没有记录时为 `1970-01-01T00:00:00.000Z`。该值会进入 API 响应的 `provenance.collectedAt`。
   - **当前坏数据语义**：workspace 里**任何人**的一行 payload 是非法 JSON 字符串，所有人的建议读取都会在 `rowToRecord` 抛错。任何人的一行 payload 是 jsonb `null`，在 `belongsToActor` 访问 `.accountId` 时，凡是没有被 `userId` 短路的读取者都会抛错。数组和数字 payload 只会读到 `undefined`，不抛错。
4. **用 SQL 做「安全预过滤」、JS 原函数做最终判定，就能逐项等价**（Codex P0-3 后采用）。
   - 新读取器每一步取回的候选行 = SQL 能精确判定「可能被选中」的对象 payload 行 ∪ 该集合在 workspace 里**全部非对象 payload 行**（`jsonb_typeof(payload) <> 'object'`，含双重编码的字符串）。两部分在**同一条语句**里用原 ORDER BY 取回。
   - 然后用旧代码的过滤谓词（`belongsToActor`、`nonEmptyString`、`evidenceIdsFromRecord`、id 集合推导）对候选行做最终判定。
   - 等价的理由：
     - 对象 payload 行在旧过滤中不会抛错，SQL 对它的归属与 id 成员判断与 JS 完全一致。所以被 SQL 排除的对象行，旧过滤也一定不选。
     - 非对象行全部交给 JS，所以抛错、双重编码还原后被选中等情况与旧逻辑相同。
     - 候选集是旧全量列表在同一排序下的子序列，非平局行的相对顺序不变。
   - **代价**：非对象行在正常数据里是 0 行。规划时本机开发库五个集合为 0 行（只读事务核对）。它们不随正常数据增长。
   - **SQL 判断只有两种**：
     - 归属：`user_id = $actor or payload -> 'accountId' = to_jsonb($actor::text)`。
     - id 成员：`jsonb_typeof(payload->'id') = 'string' and payload->>'id' = any($ids)`。集合元素已是非空字符串，所以字符串相等即可，被比的一侧不必再 trim。
   - **分阶段**（W42-4）：
     - 第 1 轮：profiles、connections 的候选，与 decisions 读取并行。
     - 第 2 轮：contacts、memories 的候选，使用 JS 从第 1 轮推出的 id 集合。
     - 第 3 轮：evidence 的候选，使用 JS 从前两轮推出的被引用 id。
5. **建议算法只用到图的一小部分**（`live-signal-service.ts:293–432、434–489`）：
   - `stableProfile`：第一条 `accountId === actor` 的有效 profile；
   - 最新的 `follow_up_request` memory：按 `occurredAt` 的 `localeCompare` 稳定排序，同值时保持输入顺序；没有就取最新的 memory；
   - `businessRelevanceScore` 最高的有效 connection，同分时取输入顺序第一条；
   - 该 connection 的 `contactId` 对应的第一条有效 contact；
   - 三个 evidence id 各自对应的第一条有效 evidence；
   - `generatedAt`。
   - 所以**平局顺序**会影响输出。旧读取在平局时的顺序本来就不确定，这一点登记为已知不确定性，不作为契约。
6. **本机规划估算**（只读事务；脚本与输出在 `~/orbit-sprint-evidence/web/sprint-W0042/plan/estimate*.cjs`、`estimate-output.jsonl`。口径为 `select *` 每行 JSON 字节，接近 W0017 口径但不完全相同，**以 Generator 实测为准**）：

   | 账号 | 改前（W0040 实测，整 workspace 五集合） | 本人相关行（整行） | 加投影、不取 `search_text`（W42-2） |
   | --- | --- | --- | --- |
   | `user_verify_new` | 9,534,477 B／5,681 行 | 约 1,209 B（1 行） | — |
   | `user_verify_legacy` | 同上 | 约 33,592 B（21 行） | — |
   | `user_verify_plan` | 同上 | 约 41,483 B（26 行：profile 1、contacts 5、connections 5、memories 0、evidence 15） | 约 31,027 B |
   | `user_orbit_primary_qa`（本机 QA 重账号，占 workspace 约 98% 的行） | 同上 | 约 9,338,410 B（5,557 行） | 约 7,304,897 B |

   - 三个验收账号与 QA 账号的间接共享联系人都是 0 行，被引用 evidence 全部是本人拥有的。
   - **结论**：普通账号单次约省 99.6%。本人数据多的账号几乎不省，因为单次成本随本人历史线性增长，evidence 占大头。这是「图等价」方案的结构上限，见 W42-1、SC-05。
   - **生产**：只有一个共享 workspace（`PRODUCTION-COUNTS.md`：profiles 5、contacts 34、connections 31、evidence 76、memories 0）。整图估算约 276 KB／次，收窄后约为本人那一份。这是估算，不是实测。
7. **测量与比对工具可复用。**
   - `~/orbit-sprint-evidence/web/sprint-W0040/run-01/probe.ts`：拦截 `pg.Client.prototype.query`，逐语句记返回行 JSON 字节，断言 localhost。
     - `measure` 模式：`ssr-home`、`profile-default`、`suggestions-service`。
     - `noise` 模式：往五个集合灌噪声。
     - 用 `signalGraphStatements` 标签识别 6 条图读取。
   - W0041 的 `matrix-live.ts`、`summarize.py` 在 `~/orbit-sprint-evidence/web/sprint-W0041/run-01/`。
   - PG 并跑先例：`tests/services/home-contacts-summary-postgres.test.ts`（W0041）、`tests/services/contact-scoped-read-postgres.test.ts`，都是随机 schema。
   - 造数据：`shared/storage/seed-generated-fixtures.ts` 的 `seedGeneratedRelationshipFixturesIntoLiveStore` 接受任意 store，可以灌进 PG store。
8. **索引现状**（`shared/storage/migrations.ts:31–90`）：
   - `orbit_records_private_owner_idx (workspace_id, collection_name, user_id, updated_at desc)` 覆盖 `user_id`；
   - `orbit_records_profile_account_idx` 只覆盖 profiles 的 `accountId`；
   - `orbit_records_connection_contact_owner_idx` 覆盖 connections 的 contactId／user_id／accountId。
   - 其他条件会在 `(workspace_id, collection_name, …)` 范围内逐行过滤，只影响库内计算，不影响返回字节。见 W42-5。
9. **读取计量。** configured runtime 建 client 时就装好了 `configuredReadMetrics`（读预算门的 observer 加 `ORBIT_PG_READ_METRICS`，`transactional-postgres.ts:110–150`）。provider 拿到的就是这个已包装的 client（`profile-signal-live-record-provider.ts:702–715`）。新读取器必须用传入的同一个 `TransactionalPostgresClient.query`，不得另建 Pool 或 client。
10. **投影的坑。** 通用 `listQuery` 的 `payloadFields` 用 `jsonb_each(payload)` 实现（`postgres-live-record-store.ts:283–287`），遇到数组或标量会报错。新读取器**不能**复用它。
11. **审计棘轮。** `tests/audits/unbounded-list-reads.baseline.json:57` 记录 `profile-signal-live-record-provider.ts` 为 6。基线只能下降。

## 范围

- **做（P1，一个 Generator）：**
  - A. **Postgres 专用的本人图读取器（新文件）**：
    - 按事实 4 做「安全预过滤 + 非对象行全取」，分三轮读。
    - 只在 `createTransactionalStorageProfileSignalProvider` 里用传入的 `client` 注入；`createStorageProfileSignalProvider` 加一个可选注入点，例如 `graphRecordReader`，名字由 Generator 定。
    - 「原始记录 → 过滤 → 解析 → 图」的组装抽成一个纯函数，旧路径和新路径共用；最终判定一律用旧谓词。
    - 没有注入时（内存 store、测试注入的 store）走原路径，一字不改。
  - B. **payload 投影，并且不取 `search_text`**（W42-2）。表达式的必要形态：

    ```sql
    case when jsonb_typeof(payload) = 'object'
      then (select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
            from jsonb_each(payload) f where f.key = any($fields::text[]))
      else payload            -- jsonb null／数组／数字／字符串原样返回，字符串仍交给 rowToRecord 二次解析
    end as payload
    ```

    每个集合的字段表分两栏：「归属／推导字段」（`id`、`accountId`、`contactId`、`connectionId`、`evidenceIds`）和「解析器字段」（逐个从第 170–403 行的解析器抄）。字段表与解析器放在一起。
  - C. **测试**：
    - PG 随机 schema 的图级并跑与接口级并跑；
    - 读取器单测，检查返回的原始记录保留归属与推导字段、`evidence_ids` 列、`occurred_at`／`updated_at`；
    - 噪声与隔离。
  - 测量脚本放证据目录。
- **不做：**
  - 建议算法改为「只取建议所需的行」（W42-1 B）；
  - 修正「他人坏行让所有人的建议接口失败」（W42-3：保持现状，另行决定）；
  - 收紧间接共享（W42-10）；
  - Web 资料编辑页或管理台跳过建议（W42-7）；
  - 索引与迁移（W42-5）；
  - 缓存（不能用缓存掩盖读取量）；
  - `saveSuggestionDecision` 写路径；
  - `features/profile/live-signal-service.ts` 的算法；
  - App 端，以及 `shared/contract|api-schema|compute|domain`（不触发 D46① 同步）；
  - 部署与生产读取。

## 与大目标 4 的重叠（复核 README 登记表 W0043～W0055 与 REQUIREMENTS 大目标 4）

- **源码文件**：按 revision 3 各 PLANNER 的当前白名单，没有发现与本 Sprint 修改同一文件的情况。
  - 大目标 4 不改 `features/profile/**`、`shared/storage/**`、`app/api/profile/**`，也不改审计基线 json。
  - W0045 PLANNER 第 88 行说明只改 `contact-live-record-provider.ts` 那一份私有 `contactFromRecord`。
  - RULES 允许执行时补充必要文件，所以开工时要以最新 HEAD 和实际 diff 再核一次。
- **数据有重叠**。本 Sprint 读的五个集合，下列 Sprint 会写入或改形状（当前已知）：
  - W0045：名片补全与回填写联系人 payload 新字段；
  - W0046：AI 栏写 `contacts` payload 的 `enrichment.fields`；
  - W0048a：快照的 source graph 读 contacts／connections 等，可能新增 seed 或夹具形状；
  - W0053：导入与合并写 contacts、connections、evidence；
  - W0055：回填脚本。
- **共享测试**：`tests/audits/unbounded-list-reads.test.ts`。W0046、W0047 列为收口集，只运行。本 Sprint 如果计数下降，会调低基线。
- **结构判据（写进进入条件，固定名单只作当前已知集合）**：后跑的 Sprint，只要修改了以下任一项，就必须重跑本 Sprint 新建的 `tests/services/profile-signal-graph-postgres.test.ts`（名字以 REPORT 为准）与接口级并跑测试，并在自己的 REPORT 里记录：
  - profiles、contacts、connections、interactionMemories、evidence 五个集合的写入、seed、迁移；
  - 这些集合里的 `user_id`、`payload.accountId`、`payload.id`、`contactId`、`connectionId`、`evidenceIds`／`evidence_ids` 写法；
  - `shared/storage/postgres-live-record-store.ts`。
- 本 Sprint 若后跑：以最新 `chat-agent` 为基线；审计基线以最新值为准。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/profile/storage/profile-signal-live-record-provider.ts`，全文 725 行，是主战场：
  - 第 122–148 行：`isRecord`、`nonEmptyString`、`stringArray`、`evidenceIdsFromRecord`；
  - 第 170–403 行：六个解析器，字段表从这里抄；
  - 第 405–428 行：`latestTimestamp`、`belongsToActor`、`referencedEvidenceIds`；
  - 第 455–641 行：`createStorageProfileSignalProvider`，其中 `readSignalGraph` 在第 464–595 行；
  - 第 643–682 行：transactional，注入点放这里；
  - 第 684–725 行：configured。
- `features/profile/live-signal-service.ts`，只读，用来理解哪些字段和顺序影响输出：
  - 第 44–60 行：`stableProfile`、`evidenceSummary`；
  - 第 293–432 行：`buildSuggestions`；
  - 第 434–489 行：`payload`；
  - 第 566–748 行：三个服务方法，以及读图前就返回的分支。
- `shared/storage/postgres-live-record-store.ts`：
  - 第 148–185 行：`payloadFromRow`、`rowToRecord`，新读取器要复用；
  - 第 221–307 行：`listQuery`，包括列、`deleted` 条件、ORDER BY，以及 `payloadFields` 为什么不能复用。
- `shared/storage/transactional-postgres.ts:103–150`：client 与计量。
- 先例：
  - `features/events/event-crud-and-import/providers/owned-events-postgres-reader.ts`：jsonb 严格归属，沿用整行列与 ORDER BY。
- 接口（只读）：
  - `app/api/profile/update-suggestions/handler.ts`
  - `route-support.ts`
  - `[id]/accept/handler.ts`
  - `[id]/dismiss/handler.ts`
- 测试先例：
  - `tests/capabilities/profile-signal-review-live-store.test.ts`
  - `tests/api/profile-suggestion-decisions.test.ts`
  - `tests/capabilities/profile-signal-review-queue.test.ts`：API 信封与 handler 调法。
  - `tests/services/home-contacts-summary-postgres.test.ts`：PG 随机 schema 并跑。
  - `tests/audits/unbounded-list-reads.test.ts`
- 测量：把 W0040 的 `probe.ts` 复制到 `~/orbit-sprint-evidence/web/sprint-W0042/run-01/` 扩展，不放进仓库。

### 关键符号（原样）
- `export function createStorageProfileSignalProvider({ source, sourceLabel = "Profile signal shared live storage", store, workspaceId }: StorageProfileSignalProviderOptions): LiveProfileSignalProvider`
  - GitNexus LOW，direct 2；另有 8 例测试直接调用。
  - 可以在 `StorageProfileSignalProviderOptions` 里加可选字段。
- `readSignalGraph: (actorId: string) => LiveProfileSignalProviderResult<LiveProfileSignalGraph>`
  - 签名与返回类型都不变。
  - GitNexus 报 `UNKNOWN`；文本搜索有 3 个调用点。
- `export function createTransactionalStorageProfileSignalProvider({ client, source, sourceLabel = "Profile signal Postgres live storage", workspaceId }: { client: TransactionalPostgresClient; … }): LiveProfileSignalProvider`
  - GitNexus LOW，direct 1。
- `export function rowToRecord<TPayload>(row: PostgresLiveRecordRow): LiveRecord<TPayload>`
  - 只复用，不改。
- `export interface LiveProfileSignalGraph { connections; contacts; evidence; generatedAt; interactionMemories; messages; profiles; suggestionDecisions }`
  - 不改。

### 前序交接要点
- **流量口径**（W0017／W0040／W0041）：每条语句返回行的 JSON 字节之和，不含协议开销；十进制，1 MB = 1,000,000 B。
- **W0040**：
  - `loadAppProfileRouteViewModel(actor, { suggestions: "skip" })` 只有首页在用。
  - 资料页默认路径单次 9,535,781～9,535,929 B／8 条；建议服务单次 9,534,477 B／6 条。
- **W0041**：
  - jsonb 严格归属 SQL 的写法；
  - PG 并跑用 `ORBIT_EVENT_DATABASE_URL=…/orbit_test`，每次随机 schema；
  - 全量对照基线为 9 项失败。
- **D32（W0041 后）**：

  | 档位 | 总账（去重） | 总账（直接相加） | 剩余（去重） | 剩余（直接相加） |
  | --- | --- | --- | --- | --- |
  | 10% | 1,508.14 MB | 1,522.64 MB | 91.86 MB | 77.36 MB |
  | 20% | 1,567.99 MB | 1,582.49 MB | 32.01 MB | 17.51 MB |
  | 100% | 2,046.74 MB | 2,061.24 MB | 已超 446.74 MB | 已超 461.24 MB |

### 易错边界（都有对应 SC）
- **归属不能写宽，也不能写窄**（SC-02）：
  - 用 jsonb 严格比较，`accountId: 123` 不等于 actor `"123"`；不用 `->>`，不复用 `contactRecordOwnedByActor`。
  - `archived` 读，`deleted` 不读。
  - 他人的联系人被本人 connection 引用时要读；他人的 evidence 被本人记录引用时也要读。
  - `actorContactIds` 只来自 connections。
  - 引用来源包括**无效**的本人记录。
  - `evidence_ids` 列非空时，忽略 payload 里的 `evidenceIds`。
- **非对象 payload 与失败语义**（SC-02）：
  - 五个集合的非对象行（jsonb `null`、数组、数字、合法或非法 JSON 字符串）必须**全部**取回，交给 JS，不管属于谁。
  - 投影对非对象行原样返回，不调用 `jsonb_each`。
  - 每种输入先用旧路径记下结果（oracle），新路径必须与之相同：成功则图相等，失败则同样失败。只有多个坏行同时存在时，先抛哪个错误允许不同，要登记。
  - SQL 失败照旧抛出。
- **顺序**（SC-02）：每轮沿用原 ORDER BY。非平局夹具要求全序相等；完全平局夹具按多重集比较，并单独比 `generatedAt` 与最终建议输出。
- **`generatedAt`**（SC-02）：包含无效行与 archived 行；空图时为纪元时间。
- **接口不变**（SC-03）：
  - 读图分支（success、empty、pending，以及 accept／dismiss 的成功与 not-found）要调用新读取器；读图前就返回的分支（failure 场景、缺 actor、未配置）调用 0 次。
  - accept／dismiss 的新旧比对用**独立 schema**，或者每例从同一快照重新 seed。
  - 读取异常时，三个 handler 仍然 reject，不转成结构化失败。
- **隔离与其他路径**（SC-04）：
  - 内存 store 走原路径；
  - 不新增 `limit: "unbounded"`；
  - 不用缓存；
  - 新 SELECT 经过 `configuredReadMetrics` observer；
  - `saveSuggestionDecision`、`live-signal-service.ts`、App 端、`shared/contract` 等零改动。
- **测量安全**（SC-01）：
  - 只连 localhost。
  - 噪声只写本机测试库的临时 workspace，用 `ORBIT_WORKSPACE_ID` 指定，脚本开头打印 host 与 workspaceId 作证明；测完删除并证明剩余 0 行。
  - accept／dismiss 只在临时 workspace 或随机 schema 里测。

## 范围与文件

- **修改：**
  - `features/profile/storage/profile-signal-live-record-provider.ts`：注入点、共用组装纯函数、两栏字段表、transactional 构造时注入。
  - `tests/audits/unbounded-list-reads.baseline.json`：只在计数下降时调低。
  - 受影响的既有测试：只限断言了内部结构的那些。
- **新建：**
  - `features/profile/storage/profile-signal-graph-postgres-reader.ts`（名字可调）：三轮读取，复用 `rowToRecord`。
  - `tests/services/profile-signal-graph-postgres.test.ts`：图级并跑、边界矩阵、坏数据 oracle、平局组、读取器原始记录单测、隔离、噪声不变。
  - `tests/api/profile-suggestions-postgres-parity.test.ts`（也可以并入上一个文件）：接口级并跑，覆盖 GET、accept、dismiss、handler reject。
- **证据（仓库外）：**放在 `~/orbit-sprint-evidence/web/sprint-W0042/run-01/`。
  - `probe.ts`（扩展版）
  - `measure-before/after.jsonl`、`noise-before/after.jsonl`
  - 行集比对
  - 本机 HTTP 比对
  - `EXPLAIN` 输出
  - impact 输出
  - 全量对照清单
  - `codex-review.txt`
- **排除：**
  - `features/profile/live-signal-service.ts`、`service-factory.ts`、`mock-signal-service.ts`、`signal-contract.ts`
  - `app/api/profile/**`
  - `app/(app)/app/profile/**`、`app/(app)/app/home/**`、管理台
  - `features/contacts/**`
  - `shared/storage/**`（只复用）
  - `repos/orbit-app/**`
  - 迁移
  - README、REQUIREMENTS、RULES 及 W0043～W0055 目录

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0042-01 | **单次读取实测与噪声对照（W0017 口径）。**本机扩展 W0040 `probe.ts`，测改前与改后，warm-up 一次不计。账号：`user_verify_new`、`user_verify_legacy`、`user_verify_plan` 与重账号 `user_orbit_primary_qa`。路径：`suggestions-service`（即 GET 的读取）与 `profile-default`（资料编辑页默认路径）。**硬判据：**(a) 改后五个集合的每条读取都带本人条件或由本人记录推出的 id 列表；唯一的例外是「非对象 payload」分支。不再出现只按 workspace + collection 的读取。(b) 改后最终入图的五个集合行，与旧 JS 过滤选出的行按 `(collection, record_id)` 完全相同，在开发库上对四个账号逐一比对。(c) 噪声对照：在临时 workspace（证明行显示 host=localhost、workspaceId 为临时值）里，由 10 个其他账号向每个集合合计至少插入 100 条对象 payload 行，总计至少 500 条，且与本人无引用关系；改后本人读取的字节、行数、语句数**完全不变**；改前在同样条件下应增长，作为对照。测完删除，剩余 0 行。**报告指标（不作门槛）：**四个账号改前改后的字节、行、语句数与降幅（规划估算 `user_verify_plan` 约 31～42 KB）；有无投影各自的字节；accept／dismiss 在临时 workspace 各测一次读取部分；新语句的 `EXPLAIN (ANALYZE, BUFFERS)` 只记扫描行数、buffer、耗时，不因本机小数据出现 Seq Scan 判失败 | 测量输出（改前、改后、噪声三份，含证明行与删除证明）；行集比对输出；EXPLAIN 输出 |
| SC-W0042-02 | **新旧并跑：图逐项相等（含边界与坏数据）。**`orbit_test` 随机 schema，同一份数据分别用旧路径（PG `listRecords` + JS 过滤）和新读取器读图。**① 非平局组**：`assert.deepStrictEqual` 整个 `LiveProfileSignalGraph`，含顺序与 `generatedAt`。数据包括 `seedGeneratedRelationshipFixturesIntoLiveStore` 灌入的夹具，以及以下边界矩阵：(i) 归属：`user_id` 命中；`accountId` 字符串命中但 `user_id` 是他人；`accountId` 为数字 `123`（actor `"123"`）、数组、对象、`null`、带空白；`user_id` 为空；其他 workspace；`deleted` 不读；`archived` 要读。(ii) 间接：他人联系人经本人 connection 引用后进入；connection 的 `contactId` 为非字符串、空串、纯空白；同 id 多条联系人；**无效**的本人 connection 仍贡献 id 与 evidence 引用；memory 经 `contactId`／`connectionId` 进入；memory 指向本人拥有、但没有本人 connection 引用的联系人时不进入。(iii) evidence：本人拥有；经列引用；列为空时经 payload 引用；列非空时 payload 引用被忽略；被**无效**记录引用；evidence 的 `payload.id` 非字符串；他人的 evidence 被引用。(iv) `generatedAt` 来自无效行或 archived 行；空图时为纪元时间。(v) payload 带解析器不读的多余字段时，投影后图仍相等。**② 平局组**：排序键完全相同的行，逐集合按带重复次数的多重集比较，另比 `generatedAt` 与最终建议输出，不对整图做 deep-equal。**③ 坏数据 oracle 组**：本人行与**他人行**分别放入 jsonb `null`、数组、数字、合法 JSON 字符串（内容依次为含本人 `accountId` 的对象、数组、`null`）、非法 JSON 字符串，五个集合各至少一例；每例先跑旧路径记录「成功且图为 X」或「抛出 E 类错误」，新路径必须得到相同结果。多个坏行并存时允许先抛的错误不同，要登记。SQL 失败时新路径抛出。**④ 读取器单测**：返回的原始记录保留两栏字段表里的全部字段、`evidence_ids` 列、`occurred_at`／`updated_at`，非对象 payload 原样返回 | 新测试 RED→GREEN；PG 用例 0 skip，并证明连的是 localhost `orbit_test`；REPORT「已知且接受的差异」只含平局顺序与多坏行时的错误先后 |
| SC-W0042-03 | **接口与 App 行为不变。**同一快照数据、固定 `now`，旧 provider 与新 provider 各自装进 `createLiveProfileSignalReviewQueueService`，比对完整 JSON。**写操作的比对，新旧两组使用独立随机 schema，或每例从同一快照重新 seed。**(a) `listUpdateSuggestions`：success、empty、pending 三个场景 × zh／ja／en，新读取器各调用 1 次；failure 场景、缺 actor、未配置，新读取器调用 0 次。(b) `acceptUpdateSuggestion`／`dismissUpdateSuggestion`：首次决定、同 `mutationId` 重放、相反决定冲突、建议不存在（以上新读取器各调用 1 次）；缺 actor、未配置（0 次）；写入的决定记录相同。(c) 三个 handler 在读取异常时都 reject，不转成结构化失败；结构化失败的状态码与信封不变。若仓库已有能跑到 Next 运行时的集成测试手段，再加一例注入读取异常、断言 500；没有就在 REPORT 写明「500 由 Next 运行时产生，handler 未改」。(d) 本机 `http://localhost:3000`（或协调者指定端口）用 `user_verify_plan` 会话 GET `/api/profile/update-suggestions`，改前改后除时间戳外相同；accept／dismiss 不在开发库上做。(e) `loadAppProfileRouteViewModel` 默认路径的三个建议字段与改前相等；首页仍 0 次（`tests/pages/app-home-profile-read-trim.test.ts` 通过）。(f) 以下路径 `git diff chat-agent..HEAD` 为空：`repos/orbit-app`、`shared/contract`、`shared/api-schema`、`shared/compute`、`shared/domain`、`app/api/profile`、`features/profile/live-signal-service.ts` | 接口级并跑测试；`profile-signal-review-live-store`、`profile-suggestion-decisions`、`profile-signal-review-queue`、`app-profile-onboarding-editor`、`app-home-profile-read-trim` 通过；HTTP 比对输出；diff 输出 |
| SC-W0042-04 | **隔离与其他路径不回退。**(a) A／B 隔离：同一 workspace 两个账号各有数据。A 的图里不出现 B 的行，经 A 的 connection 合法间接引用的除外；反之亦然。新旧路径都满足。(b) 内存 store 与测试注入的 store 走原路径：既有 8 个内存用例不改断言即通过；在注入点打桩，证明这两种 store 下新读取器调用 0 次。(c) 计量：读取器只调用传入的 `TransactionalPostgresClient.query`，不新建 Pool／client。用带 observer spy 的 client 证明每条新 SELECT 都触发 observer。(d) `tests/audits/unbounded-list-reads.test.ts` 通过，计数不升；如果下降，同一提交调低基线。(e) 不用缓存：同一 actor 连续读两次，语句数翻倍。(f) `saveSuggestionDecision`、advisory lock 与重试路径零改动，`git diff` 证明 | 新测试；审计测试；diff 输出 |
| SC-W0042-05 | **数据库月预算表重算（D39 1.6 GB），频次未知时给敏感度模型。**REPORT 里一张表，十进制，1 MB = 1,000,000 B。**人群模型：**1000 位活跃用户 × 30 天。f = 每人每天读建议图的次数，包括 App 资料页打开、App 建议页打开、每次 accept／dismiss、Web 资料编辑页打开、管理台。f 取 0.05／0.1／0.25／0.5／1／4。**两张替代情景表，不相加：**「普通账号」用 `user_verify_plan` 的单次；「全员都是重账号」的压力上界用 `user_orbit_primary_qa` 的单次。**各行：**① 开工时总账，三档两口径；② **新增行**：建议图读取 = 改后单次 × 30,000 × f；③ 被消除的项，只作对照、不进总账：改前 9,534,477 B 在同一 f 下的月流量，并说明 W0040 的 N² 敏感度改后变为「与 N 无关、与本人数据量线性」；④ **每档剩余额度允许的最高频次** f_max = 剩余额度 ÷（30,000 × 单次）；100% 档写「0，开工基线已超 446.74（直接相加 461.24）MB」，不写负数；⑤ 资料编辑页默认路径改后单次。**规划估算的 f_max**（单次 41,483 B／31,027 B）：10% 档去重 0.0738／0.0987、直接相加 0.0622／0.0831；20% 档去重 0.0257／0.0344、直接相加 0.0141／0.0188。重账号单次 7.3～9.3 MB 时，各档 f_max 都 ≤ 0.0004。**判定**（W42-8）：不以总账 ≤ 1.6 GB 作通过条件。f_max 低于 0.1 次／人／天的档，以及重账号情景，都登记为 D32 风险，并写明后续选项（W42-1 B、W42-7、App 端缓存） | REPORT 预算表；测量输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件：README 已登记 W0042 与 W42 决定，先后顺序已排定。记录基线 SHA 与 Planner SHA256。`git status --short` 确认他人未提交的文件不动；用最新 HEAD 再核一次与大目标 4 的同文件重叠。
2. GitNexus：索引落后时全量重建。对 `createStorageProfileSignalProvider`、`createTransactionalStorageProfileSignalProvider`、`createConfiguredStorageProfileSignalProvider` 跑 upstream impact（编制时都是 LOW）。`readSignalGraph` 报 `UNKNOWN`，用文本搜索复核 3 个调用点。按 H 档处理，理由见下。
3. 改前准备：
   - 跑测量（measure、noise、行集导出）并存证据。
   - 写 RED：PG 并跑先只接旧路径，新读取器先给一个空实现；接口级比对、坏数据 oracle、注入点计数、observer spy 也在这一步写好。
4. 实现：
   - 先实现 A（三轮读取 + 共用组装函数），跑定向集；
   - 再实现 B（投影），重跑并跑比对；
   - 最后跑改后测量与噪声对照。
5. 本机 HTTP 比对（SC-03 (d)），只做 GET。
6. H 档收口：
   - 全量对照一次（RULES §5.2）；
   - Codex 代码 review 一次，意见交回本 Generator 修，协调者裁决。
7. 提交与交接：
   - 暂存前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`，结果为 `partial`／`truncated` 就重跑；
   - 路径限定 commit；
   - 写 REPORT（短模板，含 SC-05 表与「已知且接受的差异」）；
   - 交接分支 `sprint/W0042-profile-suggestion-read-scope` 与固定的最终 SHA，由协调者合并回 `chat-agent` 并验证合并树。

## 最小测试与检查

- **档位：H。**理由（任一即足够）：
  - 共享存储读取：App 两个页面、accept／dismiss、Web 资料页、管理台共用这条读取。
  - 归属与授权口径：用 SQL 复刻 JS 的归属与间接共享规则，写错就会读到别人的数据，或者漏读。
  - App 依赖的接口契约必须不变。
  - 收口时跑一次全量对照，做一次 Codex 代码 review。
- **开发定向集（cwd `repos/orbits`）：**
  - 新测试两个；
  - `tests/capabilities/profile-signal-review-live-store.test.ts`
  - `tests/api/profile-suggestion-decisions.test.ts`
  - `tests/audits/unbounded-list-reads.test.ts`
- **操作链收口集：**
  - 上述全部，加上：
    - `tests/capabilities/profile-signal-review-queue.test.ts`
    - `tests/pages/app-profile-onboarding-editor.test.tsx`
    - `app-profile-live-route-services.test.ts`
    - `app-profile-onboarding-navigation.test.ts`
    - `app-home-profile-read-trim.test.ts`
    - `app-home-live-route-services.test.ts`
  - PG 测试先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明没有被 skip。
  - `npx tsc --noEmit -p .` 一次。
- **集成：**H 档收口时跑一次 `npm test` 全量，按 RULES §5.2 对照新增失败（W0041 基线 9 项）。不 source `.env`。
- **不运行：**
  - 生产／Preview 读取，部署。
  - App 端测试与模拟器：App 代码和接口契约都不改，SC-03 (f) 用 diff 证明。
  - 浏览器截图：页面没有可见变化，用 SC-03 (d) 的 HTTP 比对代替。

## 待定项（附推荐与对标；协调者已获授权按推荐定，标「需用户授权」的除外）

| 编号 | 问题 | 推荐（对标成熟产品做法） | 需用户授权 |
| --- | --- | --- | --- |
| W42-1 | 收窄口径有两种。**A「图等价」**：只读本人相关行，读出的图与旧过滤逐项相等。**B「只读建议所需的行」**：只取 top-1 connection／memory，evidence 按 id 只取 3 条；单次成本与本人数据量无关，但图的内容和 provider 契约会变，只能证明接口输出等价 | **W0042 做 A。B 留作后续**，触发条件是 SC-05 实测 f_max 低于合理频次，或者重账号单次超过 1 MB。理由：D40 定的 P1 就是「按 actor 收窄、与旧过滤逐项等价」；A 可以在图这一层做强等价证明；B 要复刻建议的选择逻辑（`localeCompare`、有效性、平局），风险高一档。**对标**：GitHub Scientist 替换读路径时，先让新旧逐项一致，再在独立变更里改算法；Kent Beck「先让改动变容易，再做容易的改动」 | 否 |
| W42-2 | 同时做 payload 投影，并且不取 `search_text` | **做。**字段表分「归属／推导」和「解析器」两栏；非对象 payload 原样返回；由 SC-02 ①(v) 与 ④ 兜底。规划估算 `user_verify_plan` 再省约 25%（41.5→31.0 KB）。**对标**：Rails `select`、Django `only()`，各家数据库指南都建议只取用到的列，避免 `SELECT *` | 否 |
| W42-3 | 坏数据语义：今天 workspace 里**任何人**的一行非法 JSON 或 jsonb `null` payload，都会让**所有人**的建议接口 500。要不要借这次收窄顺手消除 | **不消除，保持逐项等价。**非对象 payload 行全部取回，交给原 JS 判定（事实 4）。正常数据下这类行为 0 行，代价可忽略，用户看到的行为零变化。消除这个故障面另开 Sprint 并由用户决定，届时可援引 D47② 的先例。**对标**：GitHub Scientist 的做法是新旧行为完全一致后再单独修 bug；行为修复不夹带在性能改动里。（revision 1 原推荐「沿用 D47② 不再读他人坏行」，按 Codex P0-3 改为逐项等价，免去新的行为授权） | 否（消除该故障面时需用户授权） |
| W42-4 | SQL 结构：一条大 CTE，在库内推导 id 集合；还是分三轮，按 id 列表读 | **分三轮。**第 1 轮：profiles+connections，与 decisions 并行，共 2 条语句。第 2 轮：contacts+memories。第 3 轮：evidence。最终判定由 JS 原谓词做。语句数和往返次数是报告指标，不是门槛；Generator 可以按实测合并同一轮内的语句，并在 REPORT 说明。**对标**：ActiveRecord `preload`、Django `prefetch_related` 都是按 id 列表分条查询，而不是一条大 join | 否 |
| W42-5 | 要不要为 evidence、memories 的 `payload->>'id'`、`accountId` 加索引 | **不加，不写迁移。**流量口径只算返回字节；本机 `EXPLAIN` 作为报告指标。等生产延迟或计算量出现问题时，再另开 Sprint。**对标**：PostgreSQL 与 Neon 的常规做法是先看执行计划和慢查询，再加索引 | 生产执行迁移需用户授权（本 Sprint 不涉及） |
| W42-6 | 内存 store 和测试注入的 store 怎么处理 | **保留原路径**（同 W41-4），新读取器只注入到 transactional／configured。**对标**：Repository 模式下，各存储后端各自实现查询下推；内存实现保持朴素过滤，由共享契约测试保证等价 | 否 |
| W42-7 | Web 资料编辑页和管理台不显示建议，却默认读建议图（W40-2 留给 P1 决定） | **W0042 不改。**SC-05 ⑤ 报告资料编辑页改后的单次读取量；如果它让 f_max 吃紧，另开 L 档，在资料编辑页传 W0040 的 `skip`，用户看不到变化。**对标**：GraphQL／Relay 让每个视图只声明自己要渲染的数据 | 否（用户看不到变化） |
| W42-8 | 调用频次未知，预算怎么判定 | **不以总账 ≤ 1.6 GB 作通过条件。**SC-05 给出敏感度表、两种情景和 f_max；f_max < 0.1 的档和重账号情景登记为 D32 风险。硬判据放在 SC-01 的结构、行集、噪声不变三条上。**对标**：Lighthouse CI 性能预算分 `warn` 和 `error` 两级；SRE 容量规划在负载未知时给敏感度区间和触发阈值 | 否 |
| W42-9 | 真实频次从哪里来 | **本 Sprint 不连生产。**建议协调者在 D32 周检时，经授权只读查看 Vercel 上 `/api/profile/update-suggestions*` 的请求计数，以及生产 `ORBIT_PG_READ_METRICS` 是否开启，用实测的 f 回填 SC-05。上线后的效果核对同样另行授权。**对标**：先度量再定优化优先级（Google SRE「measure before optimizing」） | **需用户授权**（生产只读观测） |
| W42-10 | 间接共享：他人的联系人只要 id 被本人 connection 的 `contactId` 引用，就进入本人的建议图，连带被引用的他人 evidence。显示名可能出现在建议摘录 `${displayName}: summary` 里 | **W0042 保持等价，不收紧。**REPORT 统计本机这类行有多少（规划时四个账号都是 0），登记为后续安全复核。**对标**：权限收紧与性能重构分开发布；OWASP 最小权限原则要求单独评审与回归 | 收紧时需用户授权（会改变用户可见行为） |
| W42-11 | 与大目标 4 的先后（W0043～W0045 当前 ready） | **W0042 排在 W0043 之前，下一个执行。**它是 D40 已定的顺序，范围窄，不与大目标 4 改同一文件；先把这条已知的成本回归修掉，大目标 4 新增的预算行（W0046、W0047 的 SC-05）就能在更新后的总账上计算。之后大目标 4 的 Sprint 按结构判据重跑并跑比对。**对标**：先止住已知的成本或性能回归，再叠加新功能（「stop the bleeding」） | 否 |

## 失败与交接

外部条件缺失时先不启动；run 已开始的，按 RULES 产出 failed／blocked 报告，不自动重跑。

REPORT 必须写：
- SC 映射与 SHA；
- impact 结果，`UNKNOWN` 的要写文本复核；
- 新读取器：文件、注入点名字、两栏字段表的位置、各轮语句数；
- 四个账号的改前／改后／噪声测量摘要与行集比对；
- 已知且接受的差异（只限平局顺序、多个坏行时先抛的错误）；
- 间接共享行与非对象 payload 行的本机统计；
- `EXPLAIN` 摘要；
- SC-05 两张情景表与 f_max；
- 全量对照里新增的失败；
- Codex review 的处理。

交接要列：
- 本线分支、固定的最终 SHA、待合并目标 `chat-agent`；
- 大目标 4 后跑方需要重跑的测试文件名；
- f_max 偏紧时的后续选项排序（W42-1 B、W42-7、App 端缓存、W42-3 故障面修复）。

没有完成 commit 或没有通过合并树验证，不能标 completed。

## 修订记录

| 修订 | 内容 |
| --- | --- |
| 1（2026-10-02） | 初稿。按 `a40ee163` 源码与重建后的 GitNexus 复核调用链与归属规则；本机开发库只读估算 `user_verify_plan` 约 41.5 KB（投影后约 31 KB），重账号约 9.3 MB；发现间接共享、他人 null payload 让所有人 500；与大目标 4 只在数据上重叠。SHA256 `bd8e32aa…a9ec` |
| 2（2026-10-02，Codex 方案 review 后） | 逐条处理见下表 |

### Codex 方案 review 处理（`~/orbit-sprint-evidence/web/sprint-W0042/plan-review.txt`）

| 意见 | 处理 |
| --- | --- |
| P0-1：README 没有 W0042 行，与 W0043～W0045（ready）的先后未排定 | 接受。Planner 不改 README（任务边界）。进入条件改为「协调者已登记 W0042 行与依赖列，否则不得标 ready」，给出依赖列原文；新增 W42-11，推荐 W0042 排在 W0043 之前 |
| P0-2：W42-1～10 没有批准记录，D47 不能外推 | 接受。进入条件要求协调者把 W42 决定登记为新的 D 项；并按 P0-3 让 W0042 不再引入任何用户可见的行为差异，因此不需要新的行为授权 |
| P0-3：「逐项等价」与 W42-3 接受差异相互矛盾；双重编码可能让本人行漏读 | 接受 Codex 推荐的前者。事实 4 改为「SQL 安全预过滤 ∪ 五个集合全部非对象 payload 行，由 JS 原谓词最终判定」，可以证明与旧过滤逐项等价；W42-3 改为保持现状；顶层目标与 GOAL 只保留平局顺序、多个坏行时先抛哪个错误这两项不确定性 |
| P0-4：投影约束不足，`payloadFields` 的 `jsonb_each` 会对非对象报错 | 接受。范围 B 写明 `case when jsonb_typeof(payload)='object' … else payload end` 的必要形态；事实 10 写明不能复用 `payloadFields`；字段表分「归属／推导」与「解析器」两栏 |
| P1-1：整图 deep-equal 与平局判据冲突 | 接受。SC-02 拆成非平局组（整图 deep-equal）和平局组（多重集 + `generatedAt` + 建议输出） |
| P1-2：非对象 payload 要按实际失败点逐例给 oracle | 接受。SC-02 ③ 改为每例先记旧路径的结果，新路径必须相同；覆盖本人与他人 × 五种形态 × 五个集合 |
| P1-3：handler 的 500 由 Next 产生，直接调用 handler 看到的是 reject | 接受。SC-03 (c) 改为断言三个 handler 都 reject；有 Next 集成手段时加 500 实测，否则在 REPORT 写明 |
| P1-4：要区分读图前返回的分支与真正读图的分支 | 接受。SC-03 (a)(b) 写明新读取器的调用次数：读图分支 1 次，读图前返回的分支 0 次 |
| P1-5：accept／dismiss 的新旧比对会互相污染数据 | 接受。SC-03 与易错边界要求使用独立 schema，或每例从同一快照重新 seed |
| P1-6：计量要用 observer spy 证明 | 接受。SC-04 (c) 改为「只用传入 client、不新建 Pool、observer spy 证明每条新 SELECT 都触发」；事实 9 补全 |
| P1-7：重跑名单应改用结构判据 | 接受。「与大目标 4 的重叠」改为结构判据，固定名单只作当前已知集合，并补上 W0048a |
| P1-8：「源码无重叠」应收窄表述 | 接受，改为「按当前白名单未发现同文件修改，开工时再核」 |
| P1-9：f_max 漏了投影后直接相加的值；100% 档不能写负数 | 接受。补 0.0831／0.0188；100% 档写「0，已超 446.74／461.24 MB」；注明十进制 |
| P1-10：普通账号与重账号是替代情景，不能相加 | 接受。SC-05 改为两张替代情景表，重账号情景直接登记 D32 风险 |
| P1-11：噪声规模有歧义 | 接受。改为「每个集合合计 ≥100 条，分到 10 个账号，总计 ≥500 条」 |
| P2-1：写清并行关系 | 接受，W42-4 与事实 4 写明第 1 轮与 decisions 并行 |
| P2-2：加同值异型断言 | 接受，SC-02 (i) 与易错边界写明 `accountId: 123` 对 actor `"123"` |
| P2-3：投影字段表分两栏 | 接受，见范围 B |
| P2-4：读取器单测检查原始字段 | 接受，SC-02 ④ |
| P2-5：EXPLAIN 只作报告指标 | 接受，SC-01 报告指标里写明 |
