# Sprint W0045 — 名片识别顺带补职级与规范地区，补全值带来源

> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-9、R-16，配额口径统一）：删除 App 契约同步 commit 要求，只保证 optional 兼容并在 REPORT 写「App 影响」交 W0055 的 Bridge handoff；按文字补全计次口径改为「一批 ≤20 人 = 1 次操作」；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。补全来源载体按 C-4 统一：offering／seeking／topics 的来源也记在本 Sprint 定稿的 `enrichment.fields` 下（由 W0046 写入）。

**Plan revision:** 3。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-03（REQUIREMENTS 大目标 4「共享契约 · 补全字段」）；计费口径 D5，D43（名片识别含本补全不计入每日 AI 上限）。
**单一目标:** 名片识别的同一次文本整理调用多输出 `seniorityLevel` 与规范地区；审阅页可改；确认（新建／合并）按来源规则写入联系人；联系人编辑接口能把行业／职级／地区标为 `user`；交付一个只在本机验证的回填脚本与可复用的「按文字补全」模块（W0048a 三层更新入口与 W0053 导入复用，届时计入后台池、按操作计次：一批 ≤20 人 = 1 次；W0055 回填走系统预算）。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 编制时 `chat-agent` = `a48e1749`（GitNexus 索引同为 `a48e174`）。下文行号都按 `a48e1749`；W0043、W0044 先于本 Sprint 合并时可能改动 `features/contacts/**`，开工时按符号重新定位并在 REPORT 登记。
**进入条件:**
- 无前序依赖（登记表）；W45-1 已定（见下「已定决定」）；W45-2～W45-5 已定（D44，见文末）。
- 本机 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → localhost）可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 真实识别调用按 D5：允许，不设累计上限，每次在 REPORT 记录次数与 token；样本用 `docs/designs/*_meishi.heic`（D9）。
- 不做生产迁移、不在生产执行回填（回填生产执行需单独授权）、不 push。

## 已定决定

| 编号 | 决定 | 对标做法 |
| --- | --- | --- |
| W45-1（用户 2026-10-01 确认，REQUIREMENTS 共享契约已同步） | 职级**复用现有 `publicProfile.seniorityLevel`（六档 `individual_contributor／manager／director／vp／c_level／founder`，`shared/domain/source-types.ts:136`）作为唯一存储**，不新增 `seniority` 字段。「决策层／管理层／执行层／其他」四档只是派生分组：`c_level／vp／founder／director → decision`，`manager → manager`，`individual_contributor → staff`，空 → `other`，由纯函数 `seniorityGroup()` 计算，不落库。规范地区存一处（联系人 `region`），原始 `location` 文字保留不改。 | Apollo、LinkedIn Sales Navigator：存一个细粒度职级字段，筛选和统计用派生的粗分组；不并存两个语义相近的字段。 |

## 本 Sprint 定稿的存储（W0046～W0055 只消费，改名须追加记录）

全部放在联系人记录的 payload（`orbit_records`，`collection_name='contacts'`，整份 `ContactDTO` 即 payload），不新增表、不做迁移：

```ts
// shared/domain/contracts.ts（ContactDTO 只加可选字段）
region?: ContactRegionDTO;          // 规范地区；原始 location 不动
enrichment?: ContactEnrichmentDTO;  // 补全值的来源；值本身在各自字段里
// 职级值：publicProfile.seniorityLevel（已有，六档）；行业值：primaryIndustryId / secondaryIndustryId（已有）

export interface ContactRegionDTO {
  countryCode: string;   // ISO 3166-1 alpha-2，大写；校验见下
  city: string | null;   // 规范英文城市名（如 "Tokyo"），按 shared/domain/regions.ts 别名表归一；不认识时保留模型给的英文名（≤64 字）
}
export type EnrichmentOrigin = "ai" | "user" | "card";
export interface EnrichmentProvenance {
  origin: EnrichmentOrigin;
  updatedAt: string;  // ISO 时间
  via: "card_ocr" | "card_review" | "text_enrichment" | "contact_edit" | "legacy_profile" | "rule" | "memo_extraction";
}
export interface ContactEnrichmentDTO {
  version: 1;
  fields: Partial<Record<EnrichmentField, EnrichmentProvenance>>;
}
// C-4（D44）：补全来源的唯一载体。offering／seeking／topics 的值在 publicProfile 原字段，来源记在这里，由 W0046 memo 提取写入（via: "memo_extraction"）
export type EnrichmentField = "industry" | "seniorityLevel" | "region" | "offering" | "seeking" | "topics";
```

- **字段集合一次定全（C-4）：**本 Sprint 只写 `industry`／`seniorityLevel`／`region` 三项；`offering／seeking／topics` 三项的类型在这里一并定稿，由 W0046 的 memo 提取写入，`canWriteEnrichedValue` 对六项同一规则。不得另起 `publicProfile.fieldOrigins` 之类第二套来源载体。
- **来源含义：**`ai` = 模型推断（名片识别、按文字补全、memo 提取）；`card` = 不经模型、从原文或已有资料按确定规则得出（名片地址经别名表直接命中、旧的 `publicProfile.seniorityLevel`、vCard 的国家字段等）；`user` = 用户在审阅页改过或在联系人编辑里填写。
- **写入优先级（唯一规则，纯函数 `canWriteEnrichedValue(current, incomingOrigin)`）：**`user` 永远可写；`card` 只在当前为空或当前来源为 `ai` 时可写；`ai` 只在当前为空或当前来源为 `ai` 时可写。**当前有值但没有来源记录（存量数据）一律按 `user` 对待**（保守：存量行业可能是用户手改的）。
- **地区校验：**`countryCode` 必须是两位大写字母且 `new Intl.DisplayNames(["en"], { type: "region" }).of(code)` 不等于 code 本身；否则整对丢弃为 null。国家显示名用 `Intl.DisplayNames` 按 zh／en 生成，不手抄表；`shared/domain/regions.ts` 只放城市别名（至少覆盖 `normalizedLocation` 现有的东京／大阪／京都／神户／横滨，再加名古屋、福冈、札幌、上海、北京、深圳、新加坡），供 W0049 统计复用。
- **派生分组：**`shared/domain/seniority.ts` 导出 `seniorityGroup(level?: SeniorityLevel | null): "decision" | "manager" | "staff" | "other"`。`shared/**` 要能在 App 端运行（不引入 Node 专属 API）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/acquisition/deepseek-business-card-ocr-provider.ts`：第 35 行 `businessCardStructuringPrompt()`（第 38 行「Never infer … except the industry fields」要扩成行业、职级、地区三项）；第 199 行工厂；`extract()` 内第 230 行转写、第 254–267 行文本整理（`json_object`、thinking 关闭）、第 281 行解析、第 283–287 行 usage；第 290–327 行可选复核调用（不改）。
- `features/acquisition/gemini-business-card-ocr-provider.ts`：第 25 行 `BUSINESS_CARD_EXTRACTION_PROMPT`（第 31、33 行同样的例外句与行业说明）；第 182–186 行原生 schema 传参；第 96／114 行解析。
- `features/acquisition/business-card-industry-prompt.ts`：第 26 行 `businessCardIndustryInstruction()`；新增职级与地区说明放同一文件或并列新文件，两条 provider 都拼进去。
- `features/acquisition/business-card-ocr-validation.ts`：第 31–96 行 `BUSINESS_CARD_EXTRACTION_JSON_SCHEMA`（`additionalProperties:false`、`required` 列全 14 个字段——新字段必须同时加进 properties 与 required，值允许 null）；第 210 行解析，第 266–267 行行业的宽松清洗（新字段照此：不合法清成 null，不让整张卡失败）。
- `features/acquisition/business-card-cloud-ocr.ts`：第 41–60 行 `BusinessCardStructuredExtraction`；第 152 行 `normalizeBusinessCardExtraction` 逐字段重建（**新字段不加这里会被静默丢掉**）。
- `features/acquisition/business-card-ingest-v2/contract.ts:16–18`（版本常量 2 → 3）；`repository.ts:226–236` `storedExtraction`／`mapItem`（v1／v2 行新字段映射为 null）。
- `shared/contract/business-card-batch.ts`：第 15–32 行提取 DTO；第 251–260 行 `IngestCardConfirmationInputContract`。`shared/api-schema/business-card-batch.ts`：第 22–55 行提取 schema 与 transform（新字段 object 与 transform 两处都要加）；第 322–372 行确认输入 schema。
- `app/api/contact-drafts/business-card/batches/v2/handlers.ts`：第 616 行 `confirmationFingerprint`（第 634 行注释：新可选字段为空时必须省略，旧指纹才能重放）；约第 790–860 行确认（合并 `mergeCardIntoContact` 或新建 `confirmBusinessCardContact`）。
- `features/contacts/contact-write-contract.ts:23–45` `ConfirmBusinessCardContactInput`；`features/contacts/live-contact-write-service.ts:110` `contactFor`（第 129、143–144 行写行业）。
- `features/contacts/business-card-contact-match.ts`：第 169 行 `fillEmptyIndustry`、第 196 行 `mergeCardIntoContact`（只补空，按 `updatedAt` 条件更新）。
- `app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model.ts`：第 99 行 `IngestV2IndustryDraft`（`edited`、`conflicted`）、第 405–432 行行业候选与初始草稿、第 545 行 `reconcileCardDraft`、第 573 行 `setDraftIndustry`、第 618 行 `buildConfirmationPayload`。`card-batch-0918/card-batch-ui.tsx:100` `IndustryField`（第 483–489 行挂载）；`card-batch-model.ts:82–106`（冲突挡住自动导入／自动并入）、第 159 行 `fieldTag`。
- `app/api/contacts/[id]/handler.ts:33–43` `PatchBody` 白名单（现在只有行业、标签、备注、状态、最近互动）；`features/contacts/live-detail-service.ts:1221` `updateContactDetail`；`features/contacts/storage/contact-live-record-provider.ts:907` `updateContactPrimaryIndustry`、第 220–290 行 `contactFromRecord`（白名单映射，**不映射 `publicProfile.seniorityLevel`，新字段不加就读不到**）。
- `app/(app)/app/contacts/network-0918/network-detail-modal.tsx:143–165`（hero 与「关系概览」，W45-2 的轻量编辑入口放 hero 区）。
- 回填先例：`scripts/backfill-test-secondary-industries.ts`（plan → 哈希 → `applyTestIndustryBackfillPlan(client, plan, reviewedHash)`，事务内先 `acquireSyncCommitOrderLock`，逐条 `select … for update` + 条件更新）；连库方式 `scripts/backfill-owners.ts:49–76`（`loadLocalEnv` → `resolveLiveDatabaseConnectionConfig` → `createTransactionalPostgresClient`；dry-run／`--apply`；远端库需 `--confirm-remote`）。文本模型调用先例：`features/plans/ai-matcher.ts`（DeepSeek `json_object`、无密钥返回 null、不送邮箱电话、usage 记录）。

### 关键符号（原样）与影响（GitNexus upstream，索引 `a48e174`）
- `export function businessCardStructuringPrompt(): string` — LOW，直接 1（DeepSeek `extract`）。
- `export function businessCardIndustryInstruction(): string` — HIGH，直接 2（两个 provider），间接 193（经路由扇出）。
- `export function parseBusinessCardStructuredExtraction(value: unknown): BusinessCardStructuredExtraction` — LOW，直接 2。
- `export function normalizeBusinessCardExtraction(extraction)` — HIGH，直接 5（`reviewIssuesForBusinessCard`、v2 `worker.extractWithOrientationFallback`、`live-business-card-scan-service.uploadedPayload`、`scripts/evaluate-business-card-ocr.ts`、`business-card-batch-worker.runOnce`）。只加字段、不改既有字段输出。
- `export function createLiveBusinessCardContactWriteService({ now = () => new Date().toISOString(), provider = null, }: LiveBusinessCardContactWriteServiceOptions = {}): BusinessCardContactWriteService` — HIGH，直接 4（v2 `buildTxContactService`、`service-factory` live／mock、v1 `business-card-batch-service.confirmContact`）。v1 路径不传新字段时行为不变。
- `export async function mergeCardIntoContact(input: { store; workspaceId; actorId; contactId; card: CardContactFields; cardNotes: string; evidenceIds: readonly string[]; industry?: IndustrySelectionContract; metEvent?: { eventId: string; title: string } | null; now?: () => Date; }): Promise<string>` — LOW，直接 1。W0053 会复用它（届时加补充段标签参数），本 Sprint 只加可选的 `enrichment` 入参。
- `export function createIngestV2ConfirmHandler(deps: IngestV2HandlerDeps = {})` — HIGH，直接 1（route），间接 191。
- `export function IndustryField({ baseline, busy, candidates = [], draft, onChange, t })` — HIGH，直接 1（`BatchView`）。
- `updateContactPrimaryIndustry(contactId, actorId, primaryIndustryId, secondaryIndustryId?)` — GitNexus `UNKNOWN`（对象字面量方法）；文本搜索：唯一调用点 `live-detail-service.ts:1327`。
- 各存储里的私有 `contactFromRecord`（10 处，`features/**/storage/*-live-record-provider.ts`）— GitNexus `UNKNOWN`；文本搜索 25 处调用。只需改 `contact-live-record-provider.ts` 的那一份（联系人详情读取）；其余几处是各自领域的只读投影，不重写联系人 payload，不受影响——Generator 用 grep 复核「是否有代码用 DTO 整份回写联系人 payload」，有则同批修。

### 前序交接要点
- W0013：行业已放进同一调用；提取结构版本 2；审阅页行业行有「已识别／已修改／未识别到／请核对」；正反面冲突不预选、挡自动导入；合并只补空。真实识别当时缺样本，token 只有估算（行业说明约 +500–560 input token／张）。
- W0015：`metEventId` 只补空（`fillEmptyMetEvent`），同样的「只补空」思路。
- `bc_ingest_items.usage` 记 `transcription + structured` 两次的 token（复核调用 token 不计），真实调用次数与 token 从这里查。

### 易错边界（都对应到 SC）
1. **不增加调用：**新字段只能进现有文本整理（DeepSeek 第二次）与 Gemini 单次请求；不得为职级／地区另发请求（SC-01）。
2. **新字段漏传：**`normalizeBusinessCardExtraction`、api-schema transform、`storedExtraction`、`contactFromRecord` 都是逐字段白名单，漏一处就静默丢值（SC-01、SC-03 用端到端断言兜住）。
3. **来源判定不能信客户端：**确认时由服务端比较「提交值」与该卡（正反面）识别结果：相等 → `ai`，不等或识别为空而提交有值 → `user`；客户端不传来源（SC-02）。
4. **`user` 永不被覆盖：**名片合并、按文字补全、回填三条路径都过 `canWriteEnrichedValue`；存量无来源的值按 `user` 处理（SC-03）。
5. **旧数据与旧客户端：**v1／v2 识别结果新字段为 null；旧客户端不传新字段时不写、不改指纹（SC-01、SC-02）。
6. **回填只本地：**脚本默认 dry-run；apply 只接受复核过的哈希；连非 localhost 库没有 `--confirm-remote` 直接拒绝；本 Sprint 不在生产执行（SC-05）。

## 范围与文件

- 修改：上述识别、校验、契约、schema、v2 handler、写入服务、合并、审阅页 view-model 与 UI、联系人 PATCH handler／detail service／record provider、`shared/domain/contracts.ts`；对应测试。
- 新建：`shared/domain/seniority.ts`（`seniorityGroup`、六档中英标签复用现有）、`shared/domain/regions.ts`（城市别名、`normalizeRegion`、国家校验）、`shared/domain/enrichment.ts`（`canWriteEnrichedValue`、来源类型）、`features/contacts/enrichment/text-enrichment.ts`（按文字补全：输入联系人 id + 公司／职位／原始地址／名片备注文字，**不送邮箱电话**；每次调用 ≤20 人；DeepSeek 文本模型同 `ai-matcher` 配置；无密钥返回 null；每次供应商 HTTP 返回一份 usage（供调用方逐次登记成本子账）；**不自行扣额度**，由调用方按操作记账（一批 ≤20 人 = 1 次操作）：W0048a 三层入口记后台池、W0055 回填记 `system`）、`scripts/backfill-contact-enrichment.ts`（plan／apply）、测试文件。
- 排除：分布统计改读新字段（W0049）；导入（W0053）；三层更新入口与配额（W0048a）；App 端界面；公司规模（RN-03 明确不做）；`/api/mobile/contacts-dashboard` 与 `shared/compute/*` 现有字段语义不改（只可加字段，本 Sprint 预计不碰）。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0045-01 | **同一次调用多出职级与地区。**一张名片经 DeepSeek 与 Gemini 各识别一次，结构化输出都含 `seniorityLevel`（六档或 null）、`regionCountryCode`、`regionCity`，provider HTTP 请求次数与改前完全相同 | `business-card-industry-extraction.test.ts` 同型新测试中的 fetch 计数断言（两 provider） |
| SC-W0045-02 | **审阅页可改、来源由服务端判定。**审阅页改一张卡的「职级」后确认，服务端把该字段来源记为 `user`；未改的字段记 `ai` | v2 路由测试（来源判定） |
| SC-W0045-03 | **按来源规则写入。**确认一张卡并入已有联系人：空栏被补、`ai` 值被新 `ai`／`card` 替换、`user` 与存量无来源值不动，详情读取能读到三项 | `business-card-contact-match.test.ts`（空／ai／user／存量无来源四例 × 三字段） |
| SC-W0045-04 | **联系人编辑标 `user`。**在详情弹窗 hero 区改职级并保存，`PATCH /api/contacts/[id]` 写入值且 `enrichment.fields.seniorityLevel.origin = "user"` | `app/api/contacts/[id]` handler 测试 |
| SC-W0045-05 | **回填脚本只补空、可复核。**本机测试库 dry-run 输出计划与哈希，apply 复核哈希后执行，重复 apply 0 变化 | `tests/services/contact-enrichment-backfill.test.ts`（本机库，证明未 skip） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | 不合法值清成 null 且不影响其他字段（两 provider × 合法／越界／缺失） | 同型新测试 |
| 01 | 请求次数：DeepSeek 2 次 + 可选复核 1 次、Gemini 1 次，与改前相同 | fetch 计数断言 |
| 01 | 提取版本 3；v1／v2 存量行新字段读成 null，旧批次照常打开与确认 | `business-card-ingest-v2-repository.test.ts` 与路由测试的旧版本回读（本机库，未 skip） |
| 02 | 审阅页新增「职级」（六档下拉 + 派生分组提示）与「地区」（国家 + 城市）两行，标签沿用 `fieldTag`；轮询刷新不覆盖已改的行 | `ingest-v2-route-view-model.test.ts`、`app-card-batch-industry-field.test.tsx` 同型组件测试 |
| 02 | 正反面冲突同行业做法（不预选、挡自动导入与自动并入） | `app-card-batch-model.test.ts` |
| 02 | 客户端伪造来源无效；旧客户端不传新字段时不写且确认指纹不变（旧客户端兼容，R-9） | v2 路由测试（指纹重放） |
| 03 | 新建联系人写 `publicProfile.seniorityLevel`、`region`、`enrichment.fields.*` | `business-card-contact-write.test.ts` |
| 03 | `seniorityGroup`、`normalizeRegion`、`canWriteEnrichedValue` 纯函数 | `shared/domain` 纯函数测试 |
| 03 | 联系人详情读取能读到三项 | `contact-detail` 读取测试 |
| 04 | 新增 `seniorityLevel`、`region` 白名单字段；改行业沿用 `updateContactPrimaryIndustry` 并记 `user` | handler 测试、`secondary-industry-records.test.ts` 同型来源断言 |
| 04 | 越权与非法值拒绝 | handler 测试 |
| 04 | 详情弹窗 hero 区行业／职级／地区三个轻量编辑控件，保存走 PATCH（W45-2） | 详情弹窗组件测试 |
| 05 | apply 只接受复核哈希，事务内持提交顺序锁、逐条条件更新，期间被改的记录跳过；`user`／存量值不被写 | 回填测试 |
| 05 | 按文字补全每次 ≤20 人、请求体不含邮箱电话；非 localhost 库无 `--confirm-remote` 拒绝 | `text-enrichment` 解析与请求体断言（mock fetch）、回填测试 |
| 05 | H 档收口：Web typecheck、一次全量基线对照（新增失败 0）、一次 Codex 代码 review | `npm test` 基线对照清单、review 处理 |
| 05 | 审阅页与详情 1440／375 截图；有样本则跑一批（≥3 张）真实识别并记录次数与 token 前后对照 | 证据目录截图与 usage 查询结果 |
| 05 | REPORT「App 影响」一节：改动的 `shared/*` 文件、新增 optional 字段、旧客户端行为、未验证范围；本 Sprint diff 不含 `repos/orbit-app`（R-9） | REPORT、`git diff --stat` |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认 W45-2～W45-5 已定（D44）；复核 `git diff a48e1749 HEAD -- features/contacts features/acquisition app/api/contact-drafts app/api/contacts 'app/(app)/app/contacts'`。
2. 对上文「关键符号」批量 impact；HIGH 先在 REPORT 报告，`UNKNOWN` 用 grep 补查。
3. 先写 `shared/domain` 纯函数与测试（RED → GREEN），再按 SC-01 → 05 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器 1440／375 验证；截图存 `~/orbit-sprint-evidence/web/sprint-W0045/run-01/`。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0045-contact-enrichment-seniority-region` 提交 → REPORT → 交协调者合并回 `chat-agent` 并验证合并树。H 档代码 review（Codex）一次，意见交回本 Generator 修。

## 最小测试与检查

- **档位：H**（共享跨端契约、确认写入路径、provider 输出、新增覆盖规则、回填脚本）。
- **开发定向集**（cwd `/Users/li/work/orbit/repos/orbits`）：`tests/capabilities/business-card-industry-extraction.test.ts`、`deepseek-business-card-ocr-provider.test.ts`、`business-card-cloud-ocr.test.ts`、`business-card-contact-write.test.ts`、`business-card-contact-match.test.ts`、`tests/pages/ingest-v2-route-view-model.test.ts`、`app-card-batch-industry-field.test.tsx`、`app-card-batch-model.test.ts`、新增 `shared/domain` 测试与回填测试。
- **操作链收口集**：上述 + `tests/api/business-card-ingest-v2-routes.test.ts`、`business-card-ingest-v2-repository.test.ts`、`tests/api-schema/business-card-batch-schema.test.ts`、`business-card-two-sided-contract.test.ts`、`business-card-review-and-confirm-flow.test.ts`、`tests/services/business-card-v1-confirm-atomic.test.ts`、`secondary-industry-records.test.ts`、`tests/pages/app-network-detail-modal.test.tsx`、`app-contact-detail-live-route-services.test.ts`、`tests/services/mobile-contacts-dashboard-service.test.ts`（确认只加字段不变语义）；`npx tsc --noEmit -p .`。
- **全量**：本 Sprint 本地代码收口时一次 `npm test`，按 RULES 5.2 基线对照，不 source `.env`。
- **App 端（R-9）：**本轮只做 Web，**不产生任何 `repos/orbit-app` commit**，也不以 App 契约同步作为完成条件。`shared/contract/business-card-batch.ts` 与 `shared/domain/contracts.ts` 是跨端契约，本 Sprint 只加 optional 字段、旧响应与旧请求逐字段兼容（SC-01、SC-02 的旧版本回读与旧客户端用例即为证据）。已知后果：App 仓库的副本校验测试（`repos/orbit-app/tests/contract-sync.test.ts` 等，逐字比对本仓库 `shared/*`）在 App 线同步前会报副本过期——这是预期的跨端待办，不是本 Sprint 的失败；Generator 在 REPORT「App 影响」一节列出：改动的 `shared/*` 文件、新增 optional 字段、旧客户端行为、未验证范围（App 端界面与本地计算未跑），由 W0055 汇总进 Bridge handoff。
- **流量：**用户路径新增读取只有联系人详情 payload 多出三项（预计每次 <0.5 KB）与确认时无新增语句。按 D39 口径（每条语句返回行 JSON 字节）实测详情页一次读取改前改后字节，写进 REPORT 的预算表一行；回填与识别不在用户路径预算内。
- **真实调用：**按 D5 记录每次真实识别的次数、`bc_ingest_items.usage` 的 input／output token；按文字补全若做了真实调用（仅本机回填演练），同样记录。缺样本如实写「未跑」。
- **不运行：**生产回填、生产迁移（本 Sprint 无迁移）、App 端界面。

## 失败与交接

外部条件缺失先不启动；run 已开始则按规则产出 failed／blocked 报告。
REPORT 交接给 W0046／W0048a／W0049／W0051／W0053：`ContactRegionDTO`、`ContactEnrichmentDTO`、`canWriteEnrichedValue`、`seniorityGroup`、`normalizeRegion` 的最终签名与文件；按文字补全模块的入口签名、每次人数上限、usage 形状（每次 HTTP 一份，供调用方登记子账；模块本身不扣额度：W0048a 三层入口按操作记后台池，W0055 回填记 `system`）；每张名片 token 增量实测（或估算）；回填脚本用法与本机演练结果；「App 影响」一节（R-9，交 W0055 汇总进 Bridge handoff，不产生 App commit）。

## 已定（D44，2026-10-02）

W45-1 见上文「已定决定」（用户 2026-10-01）。

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W45-2 | 本 Sprint 在详情弹窗 hero 区加行业／职级／地区轻量编辑（三个下拉／输入，保存走 PATCH，标 `user`） | HubSpot／Apollo：补全出来的每个属性都能在记录侧栏行内直接改，改后标为手动值、补全不再覆盖 |
| W45-3 | 无来源记录的存量值一律按 `user` 保护，回填只补空；旧 `seniorityLevel` 补记 `card`（`via: legacy_profile`），`location` 经别名表直接命中的地区记 `card`，其余由 AI 推断记 `ai` | HubSpot Breeze Intelligence、Clearbit：默认「只填空、不覆盖已有值」，覆盖必须显式开启 |
| W45-4 | 地区 = ISO 3166-1 两位国家码 + 城市英文规范名，显示名用 `Intl.DisplayNames` 中英生成；不做省／州一级 | LinkedIn、Apollo：地区按「国家 → 城市（都市圈）」两级筛选，国家用 ISO 码 |
| W45-5 | 回填的按文字补全每次调用 ≤20 人、串行、间隔 ≥1 秒、单次运行 `--max-calls` 默认 50（≤50 次调用）；回填调用不占用户配额（D5／D43 + W55-5 系统预算），REPORT 记次数与 token；生产执行另行授权。同一模块被 W0053 导入经 W0048a 三层入口调用时计入后台池（C-5），按操作计：一批 ≤20 人 = 1 次 | Apollo／ZoomInfo 批量补全：分批（数十条一批）、限速排队，按批计量 |
