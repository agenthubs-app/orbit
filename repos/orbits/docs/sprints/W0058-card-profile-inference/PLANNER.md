# Sprint W0058 — 名片补全产出推测字段（offering／seeking／topics，来源 card_inference）

> revision 2（2026-10-03）：按 [REVIEW-2026-10-03.md](../REVIEW-2026-10-03.md) 修订（revision 1 SHA256 `ee6ee63e70c73a6800b32bc1ccb7438869ec7d4d4986e2abc67e1d70c4a99f22`）：G-3 推测结果与洞察同事务持久化在洞察行上、写回可无模型重试，`card_inference` 值不进输入版本；G-10 写入门禁改为比较完整来源，用户清空的字段受保护；G-11 D46① 照做同步脚本；G-14 去掉独立 department 依据。

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RC-02（REQUIREMENTS 大目标 5）；D54（字段语义）、D58（推测字段）、D63（只做 Web、付费上限）；沿用 D43／D45 配额口径。
**单一目标:** 在 W0057 的即时洞察生成**同一次调用**里，为本批每位联系人额外产出有依据的 `offering`／`seeking`／`topics` 推测，写入 `publicProfile` 并记来源 `origin: "ai"`、`via: "card_inference"`；memo 提取与用户手改优先级更高、永不被推测覆盖；推测值可被 memo 提取替换。
**易读目标:** [GOAL.md](GOAL.md)。
**视觉依据:** 原型 <https://claude.ai/artifact/1xi35cdWj5hjv8oPZDbHcV> 画板①第 3 块「TA 能给你的／TA 需要的（你也许帮得上）／可以聊的话题」：推测条目浅灰字 + 虚线小角标「据名片推测」，话题 chip 为虚线浅底「… · 推测」。**本 Sprint 只交付数据与来源字段；样式在 W0060。**
**基线:** 编制时 `chat-agent` = `a7c96deb`；本 Sprint 在 W0057 合并后开工，行号按符号重定位。
**进入条件:**
- **W0057 completed**（即时执行器、失败重试与池判定是本 Sprint 的调用载体）。缺则 blocked。
- 本机 `orbit_test` 可用。
- **本 Sprint 真实 DeepSeek 调用上限 = 0 次**，待用户决定 W58-A；全部用 mock 生成器与夹具。

## 「同一调用」的选择（Planner 核实后定，写明取舍）

用户决定（D58）是「名片批次确认后的那次 AI 补全，同一调用顺带产出」。确认前后实际有三次可能的 AI 调用：

| 候选 | 现状 | 取舍 |
| --- | --- | --- |
| A 名片识别（OCR 文本整理）调用 `features/acquisition/deepseek-business-card-ocr-provider.ts:25–50` | **确认前**、逐张；已产 `primaryIndustryId`／`seniorityLevel`／`region`；按 D5 不设上限 | 不选：发生在用户审阅修改公司／职位**之前**，推测会建立在可能被改掉的识别结果上；且逐张调用、已知 60 s 超时与多卡合照幻觉（W0055 记录），再加输出会加重 |
| B 批次确认后「补行业 + 计划匹配」AI 层 `features/plans/ai-matcher.ts`（`plan_match_jobs`，`POST /api/agent/plans/candidates/run`） | 只在用户**有计划且有人脉需求**时调用；输出是「联系人 × 需求」配对 | 不选：没有计划的用户（新用户大多数）拿不到；输出语义是配对不是画像 |
| **C 洞察生成（W0057 即时执行器 / `contact-insights` 维护任务）`features/contacts/insights/generator.ts`** | **确认后**、按 actor 合批 ≤20 人一次；读的是确认后的数据；已计入用户池（即时）／后台池；已有别名、证据校验与 `json_object` | **选 C**：正是 W0057 让它在确认后秒级运行的那一次调用；同批同调用，不增加调用次数；已有配额与失败重试。代价见 W58-1：没设目标时洞察不调用模型，推测也不产出 |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/contacts/insights/generator.ts`（339 行）：`CONTACT_INSIGHT_SYSTEM_PROMPT`（:89–98）、`buildInsightPromptInput`（:111，白名单字段 + 别名）、`parseInsightOutput`（:199，越界丢弃）、mock（:264）与 DeepSeek（:300）生成器。输出形状 `{"insights":[{contactId, goalRelation{zh,en}, nextStep{zh,en}, evidence[]}]}`——本 Sprint 加 `profile: { offering: Item[], seeking: Item[], topics: Item[] }`，`Item = { text: {zh,en}, basis: "title"|"company"|"card_notes"|"industry" }`（rev 2 G-14：联系人没有独立 department 字段，OCR 的部门被拼进联系人 `notes`——见 `features/acquisition/business-card-notes-aggregation.ts`——所以部门信息只能经 `card_notes` 作依据）。
- `features/contacts/insights/input-source.ts`：`INSIGHT_INPUT_CONTACTS_SQL`（:44–61）已取 `offering`／`seeking`／`topics` 与 `enrichment.fields`；**未取名片备注**（联系人 `notes`，详情里称 cardNotes，见 `features/contacts/live-detail-service.ts:446`）——本 Sprint 加，进提示词前去掉邮箱／电话／URL 模式并截到 200 字。
- `features/contacts/insights/worker.ts` `executeInsightGeneration`（:111）：解析后 `repository.complete(...)`。**rev 2 G-3：**推测结果作为新列 `profile_inference jsonb` + `profile_apply_state`（`pending`／`applied`／`skipped`）在**同一条 complete 语句**里写进洞察行（迁移 v4），之后再按行写回联系人；写回失败或冲突时行保持 `pending`，由维护任务下一轮**从存储的推测重放写回**（0 次模型调用，最多 3 次，之后 `skipped` 并记日志）。
- `features/contacts/live-service.ts:96–105` `applyContactMemoExtraction(contactId, actorId, values: readonly EnrichedValue[], at)`：逐项过 `canWriteEnrichedValue`、一次条件更新、返回实际写入字段；实现在 `features/contacts/storage/contact-live-record-provider.ts`。本 Sprint 复用这条写入路径（或抽出同构的 `applyContactEnrichedValues`），`via` 传 `card_inference`。
- `shared/domain/enrichment.ts`：`canWriteEnrichedValue`（:32–37，`user` 永远可写；`card`／`ai` 只在空或当前 `ai` 时可写；有值无来源按 `user`）、`ENRICHMENT_VIAS`（:21–23）；`shared/domain/contracts.ts:184` `EnrichmentVia`。
- `features/contacts/live-detail-service.ts:318–378` `publicProfileFor`：offering／seeking／topics 空时回退 connection 的 `valueTypes`／`suggestedActions`／`sharedTopics`。本 Sprint 让详情 VM 额外带每个字段的来源（`enrichment.fields.<field>.via`），供 W0060 显示角标；**回退规则的修改在 W0060**。
- `features/contacts/memo-extraction/provider.ts:50–58`：memo 提取的条目上限（每栏 ≤5、每条 ≤40 字）与「用 memo 的语言」惯例。
- 测试先例：insights generator／worker 单测、`tests/services/contact-insights-postgres.test.ts`、memo 提取写回测试（`grep -rl applyContactMemoExtraction tests`）、`tests/capabilities/contact-detail-note-preservation.test.ts`。

### 关键符号（原样）
- `export function canWriteEnrichedValue(current: EnrichedValueState, incomingOrigin: EnrichmentOrigin): boolean` —— 全部补全写入共用（W0045／W0046／W0053／W0055），预期 HIGH；本 Sprint 只**加**一条按 `via` 的规则，不改既有分支的结果。
- `export function buildInsightPromptInput(input: InsightGenerationInput)`、`export function parseInsightOutput(content: string, input: InsightGenerationInput): InsightParseResult`
- `export const CONTACT_INSIGHT_PROMPT_VERSION = "contact-insight@1"`（`source-version.ts:10`）

### 前序交接要点
- W0057：即时执行器（文件名以 W0057 REPORT 交接为准）、池判定、失败重试；本 Sprint 不改它们，只扩生成器输入输出与完成后的写回。
- W0046：memo 提取写回 offering／seeking／topics，`origin: "ai"`、`via: "memo_extraction"`。
- W0045：补全来源统一在 `payload.enrichment.fields`，`origin ∈ ai|user|card`。

### 易错边界（都对应到 SC）
1. **优先级（D58；rev 2 G-10）：**`user` > `memo_extraction` > `card_inference`。现规则「ai 可覆盖 ai」会让推测覆盖 memo 提取，且「当前为空即可写」会让 AI 回填**用户主动清空**的字段。门禁改为比较完整来源：`canWriteEnrichedValue(current: { hasValue; provenance }, incoming: { origin; via })`——先看当前来源：`origin=user`（含值为空、即用户清空）→ 只有 user 可写；`via=memo_extraction` → card_inference 不可写、memo 可写；`via=card_inference` → memo 与 card_inference 可写；无来源且有值（存量）→ 按 user 保护；无来源且空 → 可写。旧调用方（只传 origin）语义逐项不变，用表驱动测试锁定。CAS 冲突后重读并最多重试 2 次，不再调用模型（SC-02）。
2. **不编造：**每条推测必须带 `basis`，且 basis 指向的输入字段在本次输入里非空；无 basis 或 basis 越界的条目丢弃；每栏 ≤3 条、每条 ≤20 字；拒绝空洞套话（服务端黑名单，至少含「人脉资源」「行业经验」「合作机会」「资源对接」「商业机会」「networking」「resources」「business opportunities」「industry experience」「collaboration」，大小写与空格归一后整条等于或只由它们组成即拒）；与公司名／职位原文完全相同的条目拒绝；推不出来返回空数组是正确结果（SC-03）。
3. **只从名片推：**输入只加名片备注（脱敏、截断）与已有的公司／职位／行业；**不**把 memo 原文、时间线、目标文字当推测依据（目标只用于洞察那两句）。提示词明确「profile 只依据 company/title/department/card notes/industry」（SC-03）。
4. **同一调用、调用次数不变：**一批 ≤20 人仍是 1 次 HTTP；provider 计数与 W0057 相同；输出 token 增加需在 REPORT 估算（mock 下按夹具长度）（SC-01）。
5. **无目标：**洞察不调用模型 → 推测也不产出（W58-1），0 次调用；详情三栏为空时由 W0060 显示真实空态（SC-01）。
6. **语言：**每条推测由模型同时给 `{zh,en}`；写入 `publicProfile` 的字符串取**用户目标文字的语言**（含 CJK 即 zh，否则 en）——与 memo 提取「用用户写的文字的语言」同一惯例；双语原文同时存进 `enrichment.fields.<field>.bilingual`（可选字段）供以后切换语言用（W58-3）（SC-02）。
7. **输入版本不含推测（rev 2 G-3）：**`source_data_version` 计算时忽略 `via = card_inference` 的 offering／seeking／topics 值（只计用户与 memo 来源的值），否则写回推测后版本变化，会让下一次领取以为数据变了而再次计费。
8. **提示词版本：**加推测后 `CONTACT_INSIGHT_PROMPT_VERSION` 升到 `contact-insight@2`；升版本**不得**让存量 ready 洞察显示「过期」、不得触发全量重算（`view.ts` 的 `stale` 只看 dirty 与目标哈希，保持；存量补推测走回填授权）（SC-04）。
9. **写回失败不重调：**洞察已写成功、联系人推测写回失败（冲突等）只记日志，provider 不再调用（SC-04）。
10. **安全：**名片备注是用户输入，按 W0051 既有「untrusted data」提示词规则处理；邮箱、电话、URL 去除后才进入提示词（SC-03）。

## 范围与文件

- 修改：`features/contacts/insights/{generator,input-source,worker,source-version}.ts`；`shared/domain/enrichment.ts`、`shared/domain/contracts.ts`（`EnrichmentVia` 加 `card_inference`、写入规则）；`features/contacts/live-service.ts` 与 `storage/contact-live-record-provider.ts`（复用／抽出补全值写入）；`features/contacts/live-detail-service.ts`（详情 VM 带字段来源，只加字段）；对应测试。
- 同步副本（D46①，rev 2 G-11）：本 Sprint 改 `shared/domain/{enrichment,contracts}.ts`，按 RULES §6 字面要求**同一提交执行** `npm run sync:contract`（cwd `repos/orbit-app`；脚本对 `shared/domain` 只复制 `industries.ts`／`language.ts`，预期 App 副本无变化）并跑 App 四个 *-sync 测试为绿，REPORT 记录「副本无 diff」。不把 `EnrichmentVia` 搬进 `shared/contract`（App 不消费来源细节）。
- 新增迁移：`contact_insights` v4（`profile_inference`、`profile_apply_state`），注册方式同 v1～v3；生产执行列入授权清单。
- 排除：详情三栏的样式与角标（W0060）；OCR 调用与审阅页（不加推测）；计划匹配 AI；存量联系人回填执行（生产授权）；App 端。

## 验收契约（最多五项）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0058-01 | **同一调用产出。**有目标的账号确认 3 张名片：即时执行器 1 次 provider 调用，同时写回 3 条洞察与各自的推测三栏；无目标账号 0 次调用、三栏无推测 | worker／generator 单测（mock fetch 计数、请求体断言）+ Postgres 测试 |
| SC-W0058-02 | **优先级与来源。**用户清空的字段（`origin=user`、值空）→ 推测与 memo 都不写；字段为空且无来源 → 写入推测（`via: card_inference`）；已有 `memo_extraction` 值 → 推测不写；已有 `card_inference` → memo 提取可替换；用户手改 → 推测与 memo 都不写；存量无来源值 → 推测不写；写入语言按目标文字语言，双语原文存在 `bilingual` | `canWriteEnrichedValue` 表驱动单测 + 写入路径 Postgres 测试 |
| SC-W0058-03 | **不编造。**夹具含：空洞套话、无 basis、basis 指向空字段、与职位原文相同、超长、他人别名的条目——全部被丢弃；推不出时为空；名片备注里的邮箱电话 URL 不出现在请求体 | `parseInsightOutput` 单测 + 请求体断言 |
| SC-W0058-04 | **版本与失败。**提示词升 `contact-insight@2` 后存量 ready 行不显示过期、不被领取；洞察写成功而推测写回冲突时行保持 `profile_apply_state=pending`，下一轮维护从存储的推测重放写回成功、provider 计数不变；写入推测后再次领取该行判为「未变化」0 次调用 | view／worker 单测 |
| SC-W0058-05 | **收口。**本机 mock 生成器走「扫名片 → 确认 → 详情 VM 三栏有推测且带来源」；typecheck、一次全量基线对照（新增失败 0）、一次 Codex 代码 review | 浏览器截图（1440／375，证据目录）+ `npm test` 对照清单 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner SHA256、基线；确认 W0057 已合并并从其 REPORT 交接节取即时执行器名字。
2. impact：`canWriteEnrichedValue`（预期 HIGH，先报告）、`parseInsightOutput`、`executeInsightGeneration`、`applyContactMemoExtraction`、`publicProfileFor`。
3. 写入规则（SC-02）→ 生成器输入输出与校验（SC-03）→ worker 写回（SC-01、SC-04）→ 详情 VM 来源字段 → 浏览器（SC-05）；每步 RED → GREEN。
4. 路径限定提交 `sprint/W0058-card-profile-inference` → 全量对照 → Codex 代码 review → REPORT → 协调者合并验证。

## 最小测试与检查

- **档位：H**（付费 AI 调用的输出与写回、共享补全写入规则 HIGH）。
- **开发定向集**：insights generator／worker 单测、`enrichment` 规则单测、`contact-insights-postgres.test.ts`、memo 提取写回测试。
- **操作链收口集**：上述 + W0045 补全写入测试（`grep -rl canWriteEnrichedValue tests`）、W0053 导入补全测试、`contact-detail-note-preservation.test.ts`、详情路由与 VM 测试、`tests/api/business-card-ingest-v2-routes.test.ts`；`npx tsc --noEmit -p .`。
- **全量**：本地收口一次 `npm test` 基线对照。
- **不运行**：真实 DeepSeek（上限 0，待 W58-A）；回填。

## 付费 AI 调用上限

- 执行期间真实调用：**0 次**（待用户决定 W58-A）。
- 运行期：不新增调用次数（复用洞察那一次）；单次输出 token 预计增加（每人三栏 ≤9 条 × 双语），REPORT 用夹具估算并写进成本说明。

## 生产授权清单（不在本 Sprint 执行）

- 生产迁移 `contact_insights` v4。
- 部署后新确认的名片自动带推测；**存量联系人补推测**需要把它们标 dirty 走一遍洞察生成，属回填，按 W0055 授权清单第 4 项分档执行。

## 回滚

revert 本 Sprint 提交即可；已写入的推测值带 `via: card_inference`，可按来源一条 SQL 清除（脚本只写不执行，生产执行需授权）。

## 风险

- 推测质量取决于名片信息量；规则宁缺毋滥，空是正确结果。
- 输出变长可能接近 60 s 超时：批大小仍 ≤20，若 mock 估算的输出 token 超过当前约 2 倍，REPORT 提出把推测批降为 ≤10 人的方案（不在本 Sprint 自行改批大小）。

## Planner 定（对标）与待用户决定

| 编号 | 结论 | 对标做法 |
| --- | --- | --- |
| W58-1 | 选洞察生成调用为「同一调用」（见上表）；无目标时不产推测 | Apollo／Clay：画像推断挂在已有的富化调用上，不为单字段另起调用 |
| W58-2 | 优先级 user > memo_extraction > card_inference，按 `via` 判定 | HubSpot 属性来源：手动值优先于自动富化，较新的高可信来源覆盖低可信来源 |
| W58-3 | 写入语言取目标文字语言，双语原文另存 | 与 memo 提取同一惯例（用用户书写的语言） |
| W58-4 | 每栏 ≤3、每条 ≤20 字、必须有 basis、黑名单拒套话 | LinkedIn Sales Navigator「Insights」：只列能指出来源的要点 |
| **W58-A（待用户决定）** | 是否允许本机用真实 DeepSeek 跑一批（建议 ≤5 次 HTTP、≤20 人／次）检查推测质量；未决定前为 0 | — |
