# Sprint W0053 — CSV／vCard 与活动导入、去重合并，导入后走三层更新

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-16，配额口径统一）：导入补全计次改为「一批 ≤20 人 = 1 次后台池操作、每次 HTTP 一条成本子账」；验收契约改为「操作链 + 主证据」+ 必需证据子表；SC 数与通过条件不变。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。三层更新入口来自 W0048a；导入后的 AI 补全计入后台自动池（每人每东京日 60 次调用、≤20 人／批，超限顺延次日）。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-11（REQUIREMENTS 大目标 4）；导入后流程见 RN-06「新人脉三层」；D41。
**单一目标:** `/app/contacts/new` 的 CSV、通讯录（vCard 文件）、活动三种方式可用：服务端解析 → 字段对应 → 去重核对（合并需用户确认）→ 幂等写入联系人 → 调用 W0048a 三层更新入口；删掉未实现的静态文案。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `a48e1749`（GitNexus 索引 `a48e174`）。依赖的 W0045～W0047、W0048a 会改联系人写入、合并与计划匹配，下文行号按 `a48e1749`，开工时按符号重新定位并登记差异。
**进入条件:**
- **W0045、W0046、W0047、W0048a completed**（登记表依赖；不依赖 W0048b）。从 W0045、W0048a REPORT 交接节**只取**：W0045 的 `canWriteEnrichedValue`／`normalizeRegion`／按文字补全入口；W0048a 的三层更新入口 `runNewContactLayers`（联系人 id 列表 + 来源键 = 批次 id）及其返回的补全状态（`enrichment: "done" | "deferred"` + `retryOn`）。缺任一项则 blocked。
- W53-1～W53-6 已定（D44，见文末）。
- 本机 `orbit_test` 可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 不新增 npm 依赖（W53-2）；迁移只写文件与本机验证；生产迁移、部署、push、真实付费调用的生产执行需单独授权。

## 已查清的事实（按 `a48e1749`）

1. **页面。**`app/(app)/app/contacts/new/page.tsx` 渲染 `NetworkImport`（`?method=csv|contacts|scan|event`，默认 scan；`?job=<batchId>`）。`network-0918/network-import.tsx`（228 行）：第 23 行 `export type NetworkImportMethod = "csv" | "contacts" | "scan" | "event";`；第 29–34 行 `METHODS`（CSV 提示「支持 .csv、.xlsx 格式」）；第 36–41 行 `NOTES`，**第 38 行「单个文件不超过 10MB，最多 10,000 条记录」**、第 37 行去重说明；第 110–116 行非 scan 方式渲染「即将开放／该方式尚未接入」；第 155–163 行非 scan 卡片 `aria-disabled` 的「即将开放」；第 195–224 行导入记录只列名片 v2 批次，来源列写死「扫描名片夹」，新建／合并列为「—」。
2. **现有 `contact-drafts` 接口不能复用来写联系人。**草稿是 `orbit_records` 的 `contactDrafts` 集合；通用确认（`[id]/confirm` 的兜底分支，`features/acquisition/live-service.ts:558–590`）只翻状态、`contactWriteExecuted:false`；`merge-suggestions/[id]/apply` 只返回预览（`mergeWriteExecuted:false`）。`merge-suggestions` 的匹配（`live-merge-service.ts:224–256`）只看草稿、只认 email 与姓名+公司、不含电话、不做 NFKC。`event-attendees/import` 读的是**主办方自有**的 `events／attendees` 集合（`event-attendee-live-record-provider.ts:446–530`），不读现场交换。**App 端在用这些接口**（`repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx`：event-attendees/import、external、merge-suggestions 等）——本 Sprint 一律不改它们的契约与行为。
3. **真正可复用的写入与去重在名片 v2。**`features/contacts/business-card-contact-match.ts`：`findContactCandidate`（email、电话 ≥7 位数字、姓名+公司；NFKC、去空白、小写；完全一致优先）、`listActorContactRecords`（只取比对字段，上限 20,000）、`mergeCardIntoContact`（只补空、冲突写进备注「名片补充 · 日期」段、按 `updatedAt` 条件更新）。新建用 `createLiveBusinessCardContactWriteService` 的 `confirmBusinessCardContact`（稳定 id `contact:business-card:<sha24>`、来源写死 `business_card_ocr`）——导入需要自己的稳定 id 与来源，复用写入 provider（`BusinessCardContactWriteProvider.saveContact`）而不是这个服务。v2 的只读批量查重 `POST …/v2/[id]/duplicates`（`handlers.ts:1006–1034`）可作形状参考。`bc_ingest_*` 表带图片／识别专属约束且单批 ≤100，不复用。
4. **活动交换已经自动成为联系人。**对方接受交换请求后（`onsite-operations-repository.ts:1217–1350`），写 `event_ops_relationship_pairs`／`event_ops_relationship_sides`（`features/events/event-operations/storage/migrations.ts:537–575`，sides 有 `owner_actor_id, other_actor_id, contact_id, connection_id`，`unique (workspace_id, owner_actor_id, contact_id)`），outbox 投影（`outbox-projector.ts:238–263`）建出 `contact:event-consent:<digest>` 联系人，来源 `{type:"event_import", id: eventId}`，**不写 `metEventId`**。没有「按 actor 列出跨活动全部交换」的读取函数，需要新查询 `event_ops_relationship_sides where owner_actor_id = $actor`。
5. **「待确认」匹配队列。**`features/plans/matching-repository.ts:167 enqueuePlanMatchJob(client, { workspaceId, actorId, batchId, contactIds, singleCard, at? })`（≤200 人、幂等、表缺失返回 skipped）；唯一调用方是名片批次完成事务（`business-card-ingest-v2/repository.ts:425–449`）。规则层只看行业（`matching.ts:90 scoreRuleMatches`）。计划条目只在用户接受候选时改变（`matching-service.ts` `decide`／`linkManually`）。W0048a 的三层更新入口会包住这一步——本 Sprint 只调用入口，不直接碰计划表。
6. **没有解析库。**`package.json` 无 papaparse／csv-parse／xlsx／vCard 解析器；上传先例：v2 `readRawBody`（content-length 检查 + 流式硬上限 10 MiB，`handlers.ts:257–288`），v1 `request.formData()`。卡片来源分组已有 `contact: ["external_contacts"]`、`event: ["event_import"]`（`contact-card-view-model.ts:6`），导入的联系人自然出现在列表对应来源下。

## 本 Sprint 定稿的设计

- **新表**（迁移模块 `features/contacts/import/migrations.ts`，照 plans 写法；注册到 `scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts`）：
  - `contact_import_batches`：`workspace_id, id, actor_id, kind ('csv'|'vcard'|'event'), format ('linkedin'|'generic'|'vcard'|'event'), status ('parsed'|'reviewing'|'committing'|'completed'|'cancelled'|'expired'), file_name, row_count, mapping jsonb, idempotency_key, version, counts jsonb {created, merged, skipped, failed}, enrichment_deferred_until timestamptz null（后台池顺延时的 `retryOn`）, created_at, updated_at, completed_at, expires_at`；`unique (workspace_id, actor_id, idempotency_key)`。
  - `contact_import_rows`：`workspace_id, batch_id, seq, fields jsonb`（归一后的 `displayName, organization, role, email, phone, location, linkedinUrl, connectedOn, notes, metEventId?, countryCode?`）、`parse_issues text[]`、`in_file_duplicate_of int null`、`candidate jsonb null`（`{contactId, matchedOn[], identical}`）、`decision ('create'|'merge'|'skip') null`、`merge_into_contact_id`、`status ('pending'|'created'|'merged'|'skipped'|'failed')`、`contact_id`、`version`；主键 `(workspace_id, batch_id, seq)`。
  - **不存原始文件**；行数据在批次完成或取消后 7 天过期清理（W53-6）。
- **解析（服务端，纯函数，`features/contacts/import/parse/*`）：**RFC 4180 CSV（引号、转义引号、字段内换行、CRLF／LF、BOM）；编码依次试 UTF-8（fatal）→ UTF-16LE（有 BOM）→ Shift_JIS（`TextDecoder("shift_jis")`）；LinkedIn 识别：跳过 `Notes:` 起头的说明段，表头含 `First Name, Last Name, URL, Email Address, Company, Position, Connected On`；通用表头同义词表（中／英／日：姓名／名前／Name、公司／会社／Company、职位／役職／Title／Position、邮箱／メール／Email、电话／電話／Phone、地址／住所／Address），用户可在 UI 改对应。vCard 2.1／3.0／4.0：行折叠展开、`FN`／`N`／`ORG`／`TITLE`／`EMAIL`／`TEL`／`ADR`（国家字段 → `countryCode`，按 W0045 规则记 `card`）、2.1 的 `QUOTED-PRINTABLE` 与 `CHARSET`、一个文件多张卡。上限按 W53-3。
- **去重：**每批只调一次 `listActorContactRecords`，每行 `findContactCandidate`；文件内重复（同邮箱／电话／姓名+公司）标 `in_file_duplicate_of`，默认跳过后者。默认决定：无候选 → `create`；`identical` → **预选** `merge`；非完全一致 → 留空必须选。提交时任何 `decision` 为空或 `merge` 未经本次提交确认的行都拒绝提交（服务端校验，不靠前端）。
- **写入（`POST /api/contacts/import/[id]/commit`，带 `confirmationIntentId` 幂等）：**每 ≤200 行一个事务；新建 id `contact:import:<sha24(actorId, batchId, seq)>`（重放得同一 id，不重复建）；来源 CSV／vCard 为 `{type:"external_contacts", id: batchId, label: "CSV 导入"／"vCard 导入"}`，活动为 `event_import`；合并复用 `mergeCardIntoContact`，加可选参数 `supplementLabel`（导入写「导入补充」，名片默认不变），补全字段走 W0045 `canWriteEnrichedValue`。每个事务提交后调用一次 W0048a 三层更新入口（新建 + 合并的 contactId，批次 id 作为来源键）；入口按 W53-1 对缺字段的人做 AI 补全（后台池，一批 ≤20 人 = 1 次操作，每次 HTTP 一条成本子账，由入口结算），后台池不够时入口把剩余人顺延到次日，批次记 `enrichment_deferred_until`，导入记录显示「补全明天继续」。
- **活动导入（W53-4）：**新查询列出 actor 作为 owner 的交换（`event_ops_relationship_sides` join 活动标题／时间），按活动分组显示「已互换 N 人 · 其中已在人脉 M 人」；导入 = 对这些 `contact_id` 只补空 `metEventId／metEventTitle` 并作为一批走三层更新；对应联系人尚未投影成功的显示「同步中」，不自行建联系人；未互换的参会者不可导入，给「去活动页交换名片」链接。
- **API 前缀：**新建 `app/api/contacts/import/**`（不放进 `contact-drafts`，避免和 App 在用的草稿接口混淆）：`POST /api/contacts/import`（multipart 或原始体，`idempotencyKey`，返回批次 + 解析摘要）、`PATCH /[id]`（改字段对应 → 重算行与去重）、`GET /[id]/rows?cursor`（分页 50）、`PATCH /[id]/rows`（批量改 decision）、`POST /[id]/commit`、`POST /[id]/cancel`、`GET /api/contacts/import`（导入记录）、`GET /api/contacts/import/events`（可导入的活动）。全部 `resolveAuthenticatedApiActor`，按 actor 隔离。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-import.tsx`（全文 228 行）与 `app/(app)/app/contacts/new/page.tsx`。
- `features/contacts/business-card-contact-match.ts`（全文；事实 3 的四个导出）；`features/contacts/contact-write-contract.ts:125–161`（`BusinessCardContactWriteProvider { getContact; listContacts; saveContact }`、`RelationshipRecordWriteProvider`）；`features/contacts/storage/contact-write-live-record-provider.ts:278–312 saveContact`。
- `app/api/contact-drafts/business-card/batches/v2/handlers.ts`：`257–288 readRawBody`（上传上限写法）、`616–660 confirmationFingerprint`、`720–920 createConfirmLikeHandler`（重复检查与合并分支）、`1006–1034` 批量查重。
- `features/plans/matching-repository.ts:151–167`（入参与幂等方式，仅参考；实际调用 W0048a 入口）；`features/acquisition/business-card-ingest-v2/repository.ts:425–449`（批次完成时入队的位置与事务写法）。
- `features/events/event-operations/storage/migrations.ts:499–575`（contact_requests、relationship_pairs、relationship_sides）；`features/events/event-operations/relationship-acquisition.ts:11–50`（联系人 id 与来源）。
- `features/plans/migrations.ts:1–60, 170–224`（迁移模块写法）；`tests/capabilities/plans-repository.test.ts:23–120`（本机库测试写法）。
- `app/(app)/app/contacts/card-batch-0918/use-card-batch.ts:388–484`、`card-batch-ui.tsx`（「可能是同一个联系人」的交互与文案，核对表照它的样子做，不复用其状态机）。

### 关键符号（原样）与影响（GitNexus upstream，索引 `a48e174`）
- `export function findContactCandidate(records: readonly ContactRecord[], actorId: string, card: CardContactFields): ContactCandidate | null` — HIGH，直接 2（v2 查重与新建），间接 143。只调用、不改语义。
- `export async function listActorContactRecords(store: Pick<LiveRecordStoreLike<Record<string, unknown>>, "listRecords">, workspaceId: string, actorId: string): Promise<readonly ContactRecord[]>` — HIGH，直接 2，间接 143。只调用。
- `export async function mergeCardIntoContact(input: { store; workspaceId; actorId; contactId; card: CardContactFields; cardNotes: string; evidenceIds: readonly string[]; industry?: IndustrySelectionContract; metEvent?: { eventId: string; title: string } | null; now?: () => Date; }): Promise<string>` — LOW，直接 1。新增可选 `supplementLabel`，默认值保持「名片补充」。
- `export async function enqueuePlanMatchJob(client: PlanMatchQueryClient, input: EnqueuePlanMatchJobInput): Promise<EnqueuePlanMatchJobResult>` — LOW，直接 1（`reconcileBatchStateLocked`）。本 Sprint 不直接调用（经 W0048a 入口）。
- `export function NetworkImport(...)` — LOW，直接 1（`AppContactScanPage`）。
- `contactFields`／`matchReasons`／`normalized`（同文件私有）— 只读理解，不改。

### 前序交接要点
- W0045：补全值写入一律过 `canWriteEnrichedValue`（`user` 与存量无来源值不覆盖）；vCard／CSV 里明确的国家按 `card` 记；按文字补全由 W0048a 三层入口调用（计入后台池，一批 ≤20 人 = 1 次操作），本 Sprint 不直接调模型、不碰账本。
- W0048a：三层更新入口 `runNewContactLayers`（补全 → 规则匹配进待确认 → 新增 ≥3 人或 ≥20% 时后台重算快照）；计划阶段与目标不自动改写；两池配额按操作计次（导入补全与快照自动重算都在后台池，超限顺延次日）。
- W0051（若已合并）：补全层会标洞察 dirty，本 Sprint 不另外标。
- W0013／W0015：只补空的合并规则、`metEventId` 只补空。

### 易错边界（都对应到 SC）
1. **不产生重复联系人：**同一文件重复上传（新批次）会对已导入的人命中「完全一致」候选；同一批重放 commit 得到同一 id；文件内重复只建一条（SC-02）。
2. **合并必须用户确认：**服务端拒绝任何未明确 `decision` 的行；完全一致也只是预选（SC-02）。
3. **导入不改计划：**提交前后 `plan_items`、`plans`、`plan_log` 逐行相等，只允许新增 `plan_match_candidates`（pending）（SC-03）。
4. **App 在用的草稿接口不动：**`contact-drafts/**` 的契约与测试不变（SC-05 收口集）。
5. **活动导入只含互相交换过的人：**未互换的参会者不出现在可导入名单；不自建 `contact:event-consent:*` 联系人（SC-04）。
6. **隔离与上限：**他人批次 404；超大小／超行数在读完前拒绝；解析失败的行不阻塞其余行，原因写进核对表（SC-01）。

## 范围与文件

- 新建：`features/contacts/import/**`（parse、mapping、dedupe、repository、commit、events-source、migrations）、`app/api/contacts/import/**`、核对表与导入面板组件（`app/(app)/app/contacts/network-0918/network-import-*.tsx`）、测试与样例夹具（LinkedIn CSV、Shift_JIS CSV、多卡 vCard 2.1／3.0，全部虚构数据）。
- 修改：`network-import.tsx`（启用三种方式；删「10,000 条」「.xlsx」与「即将开放」；导入记录合并列出导入批次，来源、文件名、新建／合并数真实显示）、`business-card-contact-match.ts`（`supplementLabel` 可选参数）、`scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts`、维护 pass 注册（过期行清理任务）。
- 排除：.xlsx（W53-2）；Google／iCloud 在线授权同步；引荐页；App 端；`contact-drafts/**` 现有接口；直接调用模型（经 W0048a 入口）；改计划。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0053-01 | **解析。**上传 LinkedIn Connections.csv（含说明段、空邮箱）得到一个按 actor 隔离的批次，行数据正确归一 | `tests/capabilities/contact-import-parse.test.ts`（夹具驱动） |
| SC-W0053-02 | **去重与确认。**同一文件导入两次：第二次每行命中完全一致候选并预选「合并」，确认提交后联系人数 0 新增 | 路由与 repository 测试（本机库）的联系人数量断言 |
| SC-W0053-03 | **导入后走三层更新、不改计划。**提交一批后，每个提交事务调用一次 W0048a 三层入口（新建 + 合并的 contactId、批次 id），导入前后 `plans`／`plan_items`／`plan_log` 逐行相等 | 本机库集成测试（真实计划夹具 + 三层入口，模型用 mock） |
| SC-W0053-04 | **活动导入。**从「活动」方式只看到本人作为 owner 的已互换对象，导入后只补空 `metEventId／metEventTitle` 并走三层入口 | `tests/services/contact-import-events-postgres.test.ts`（本机库） |
| SC-W0053-05 | **页面与收口。**在 `/app/contacts/new?method=csv` 走完 选文件 → 字段对应 → 核对表 → 提交，导入记录显示真实来源、文件名、新建／合并数 | `tests/pages/app-network-import.test.tsx`（新设计断言） + 三种方式 1440／375 截图 |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 带 BOM 的 UTF-8、Shift_JIS、UTF-16LE、字段内换行与转义引号、通用表头（中／英／日同义词）与用户改对应、vCard 2.1（QP+CHARSET）／3.0／4.0 多卡文件全部正确归一 | 解析测试 |
| 01 | 超出 W53-3 上限在读完前拒绝；坏行带原因不阻塞其余行 | 解析测试、路由测试 |
| 01 | 他人批次 404 | `tests/api/contact-import-routes.test.ts`（本机库，未 skip） |
| 02 | 每行给出候选与命中原因；完全一致预选「合并」、非完全一致必须选择；服务端拒绝含未决行的提交 | 路由测试 |
| 02 | 文件内重复只建一条；同批重放 commit 0 新增 | repository 测试 |
| 02 | 合并只补空、冲突进「导入补充」段，`user` 来源值不被覆盖；`business-card-contact-match.test.ts` 默认标签不变 | repository 测试、既有测试 |
| 03 | 只新增 pending 候选；文件里明确的字段（如国家）按规则写 `card`、不调模型 | 集成测试 |
| 03 | 入口返回补全顺延（后台池 60 次操作用满）时导入记录显示「补全明天继续」、联系人照常可用；本 Sprint 代码不直接调用账本与模型 | 集成测试（入口桩返回 deferred）、源码扫描 |
| 03 | 入口失败时联系人已写入、批次标「后续更新待重试」而不回滚联系人，重试不重复写 | 入口桩失败与重试用例 |
| 04 | 交换已接受／拒绝／撤回／他人四类：只有已接受且本人为 owner 的出现；按活动分组显示人数与「已在人脉」数 | Postgres 测试 |
| 04 | 未投影的显示「同步中」不自建 `contact:event-consent:*`；未互换参会者不出现，给活动页链接 | Postgres 测试、组件测试 |
| 05 | `/app/contacts/new?method=contacts\|event` 同样可用，「全部按建议处理」；不再出现「10,000 条」「.xlsx」「即将开放」（scan 不变） | 页面测试、核对表组件测试 |
| 05 | `contact-drafts/**` 现有测试不回归 | 收口集退出码 |
| 05 | 按 D39 口径实测一批 200 行导入（上传、核对表 4 页、提交）的读取字节并入预算表 | 测量输出（证据目录） |
| 05 | typecheck、一次全量基线对照（新增失败 0）、一次 Codex 代码 review | `app-contacts-new-live-route-services.test.ts`、全量清单、review 处理 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；从 W0045、W0048a REPORT 交接节取名字写进 REPORT；缺项 blocked。
2. 批量 impact（上表符号 + `saveContact`、三层入口）；HIGH 先报告，`UNKNOWN` grep 补查。
3. 解析纯函数（SC-01）→ 迁移与 repository → 去重与提交（SC-02）→ 三层入口接线（SC-03）→ 活动来源（SC-04）→ 页面（SC-05）；每步 RED → GREEN，最多两轮本地修复。
4. 测量与浏览器验证，证据存 `~/orbit-sprint-evidence/web/sprint-W0053/run-01/`（样例文件只用虚构数据）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0053-contacts-import-csv-event` 提交 → REPORT → 协调者合并回 `chat-agent` 验证合并树；Codex 代码 review 一次。

## 最小测试与检查

- **档位：H**（新表与迁移、联系人批量写入与幂等、合并规则、计划匹配接线、文件上传边界）。
- **开发定向集**：新增 parse、routes、repository、events 测试；`tests/capabilities/business-card-contact-match.test.ts`。
- **操作链收口集**：上述 + `tests/api/business-card-ingest-v2-routes.test.ts`（合并函数共用）、`business-card-contact-write.test.ts`、`tests/capabilities/plan-matching.test.ts`、`tests/api/agent-plan-candidates-routes.test.ts`、`tests/capabilities/duplicate-detection-merge-live-store.test.ts`、`event-attendee-import-live-store.test.ts`、`external-contacts-import-live-store.test.ts`、`contact-acquisition-draft-live-store.test.ts`（草稿接口不回归）、`tests/pages/app-network-import.test.tsx`、`app-contacts-new-live-route-services.test.ts`、`tests/services/contact-card-page-postgres.test.ts`（来源分组）；`npx tsc --noEmit -p .`。
- **全量**：本地代码收口一次 `npm test`，RULES 5.2 基线对照。
- **流量：**导入是低频操作；`listActorContactRecords` 每批一次（按本机 1,000 联系人账号实测字节），核对表分页读取实测；按「每位活跃用户每月 1 批 200 行」假设折算月增量写进 REPORT 预算表。
- **不运行：**生产迁移；真实模型调用（补全在 W0048a 入口内，用 mock）；App 端。

## 失败与交接

依赖未齐不启动（blocked）；run 开始后失败如实写 failed／blocked 报告。
REPORT 交接给 W0054／W0055：两张导入表结构与迁移版本、导入 API 列表、稳定 id 规则、`mergeCardIntoContact` 新参数、活动交换读取函数签名、上限实测、预算表行。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W53-1（rev 3 按操作计次） | 导入联系人的 AI 补全计入 W0048a **后台自动池**（每人每东京日 60 次操作；一批 ≤20 人 = 1 次操作，成本按每次 HTTP 一条子账），按 W0045 按文字补全每次 ≤20 人一批，超限顺延次日并在导入记录显示「补全明天继续」；文件里已有的国家等明确字段按规则直接写（`card`），不调用模型 | Apollo、HubSpot 导入后在后台补全，消耗补全额度（credits），额度用尽排队 |
| W53-2 | 本轮只做 CSV 与 vCard，不支持 .xlsx、不新增依赖；页面提示「Excel 请另存为 CSV」 | LinkedIn 导出是 CSV；Google／iCloud 通讯录导出是 vCard；CSV 是通用格式 |
| W53-3 | 单文件上限 5 MB、2,000 行；超出提示拆分文件 | 面向个人人脉的 CRM 导入常见数千行；本项目受 D39 数据库流量预算约束，先保守 |
| W53-4 | 活动导入只导互相交换过联系方式的人（补「在该活动认识」并走三层更新）；未互换的参会者只给「去活动页交换名片」 | LinkedIn、Luma、Eventbrite：只有双方确认连接后才能拿到对方联系信息 |
| W53-5 | 完全一致的重复预选「合并」，仍需一次确认（可「全部按建议处理」一键确认） | HubSpot 导入按邮箱匹配但导入前有核对步骤；Salesforce 导入向导让用户选匹配规则 |
| W53-6 | 不保存原始文件；解析行在批次完成或取消后 7 天清理，联系人不受影响 | 从隐私出发不留原文件，与名片批次 7 天 TTL 一致 |
