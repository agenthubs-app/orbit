# Sprint AG12 — 联系人写入

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R12（设计稿 §4「联系人」行与「版本与既有调用方」段、附录 B 联系人四行及「三处边界」、附录 E「联系人」行）；AG-R19（门槛用例）。
**单一目标:** `features/agent-v1/domains/contact/` 提供联系人的 `read`、`prepare`、`applyApproved`，新增、修改、删除、恢复、批量导入五种操作全部经确认卡执行；联系人 `version` 每次写入加一，字段写入接口接受期望版本；联系方式字段没有单独授权时不进任何模型输入。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`；开工时重新记录 HEAD，并读 AG02、AG04、AG05、AG06、AG07 的 REPORT。
**进入条件:**
1. AG06 completed（登记表的依赖）。另需 AG07 已合回：登记表把本 sprint 的端写成「服务端、两端」，两端显示联系人卡要用 AG07 的确认卡组件；登记表没列 AG07，开工前由协调者确认。
2. 设计稿「2026-11-15 已定的事项」即产品批准，不重复索要。
3. 开工先看 AG07 的卡能否用通用条目显示导入的逐行归类和删除影响；能，就不改两端界面代码；不能，先出视觉稿（§10 出稿方式），批准前不启动。
4. 真实模型调用已允许，费用上限见下文；评测环境 `npm run agent-eval:env` 自检通过；`ORBIT_DEEPSEEK_MODEL=deepseek-flash`，`ORBIT_GEMINI_DECISION_API_KEY` 可用。
5. 与 AG13 并行时（SPRINTS.md 允许），第二条线按根 `CLAUDE.md` 在 `/Volumes/ORICO/Dev/worktrees/orbit/<名称>` 另建 worktree；外接盘未挂载则停下询问。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
路径相对 `repos/orbits`。
- `features/contacts/manual-contact-v2/service.ts`：`create` 带查重，结果是 `created`、`merged`、`duplicate_review`；`allowDuplicate` 对应「另建一位」，`mergeIntoContactId` 对应并入；`idempotencyKey` 重放返回首次结果。契约 `shared/contract/manual-contact.ts`。
- `features/contacts/contact-duplicate-candidates.ts`：`findManualContactCandidates`（最多 3 位）。候选结构 `IngestContactCandidateContract`（`shared/contract/business-card-batch.ts`:254）**带 `email`、`phone`、`address`**，交给模型前必须去掉。
- `features/contacts/contact-field-write.ts`：五个基本字段按字段写；前置条件是读到的 `updatedAt`，冲突时**自动重读重试最多 3 次**；旧值进 payload 的 `fieldHistory`（最多 50 条）。**不读也不写 `version`。** 接口 `app/api/contacts/[id]/fields/handler.ts`，契约 `shared/contract/contact-fields.ts`（没有期望版本）。
- `features/contacts/live-detail-service.ts`:1372 `updateContactDetail`：行业、职级、地区在联系人 payload 上一次条件更新；标签、状态、备注写在另一条记录 `contact_detail_states`，两者不在同一事务（:1515 注释）。这些字段**没有 `fieldHistory`**。接口 `app/api/contacts/[id]/handler.ts` 的 PATCH。
- `features/contacts/delete/service.ts`：软删除与 30 天恢复是两条带同步提交锁的 SQL，只改联系人这一行；笔记、任务不动。契约 `shared/contract/contact-delete.ts`。
- `features/contacts/import/service.ts`：`upload` 会建批次（写库），之后 `setDecisions`、`commit`（带 `confirmationIntentId`）；逐行查重在 `features/contacts/import/dedupe.ts` 的 `reviewImportRows`，解析在 `features/contacts/import/parse/`。契约 `shared/contract/contact-import.ts`。
- **今天的联系人 `version`**：`shared/domain/contracts.ts`:139 `version?: number`，是「关系生命周期」的版本。只有活动换名片的获取路径写 `version: 1`（`features/events/event-operations/outbox-projector.ts`:100），关系初始化时联系人和关系各加一（`features/connections/lifecycle/initialization.ts`:150）。手动新增、字段修改、详情修改、删除恢复、导入都不碰它。**它的有无还被当作信号**：`initialization.ts`:76 的 `legacyPending` 要求 `contact.payload.version === undefined`；各读取器遇到非正整数会抛 `Invalid contact lifecycle version`（`features/contacts/storage/contact-live-record-provider.ts`:260）。
- 写 `contacts` 集合的模块（文本搜索）：`features/connections/lifecycle/initialization.ts`、`postgres-repository.ts`，`features/contacts/` 下的 `action-writer.ts`、`business-card-contact-match.ts`、`completion/repository.ts`、`contact-field-write.ts`、`delete/service.ts`、`enrichment/backfill.ts`、`manual-contact-v2/service.ts`、`storage/contact-write-live-record-provider.ts`，以及 `features/events/confirmed-followup/service.ts`、`features/invite-codes/invite-fields.ts`、`features/network-analysis/layers-runtime.ts`；导入在 `features/contacts/import/service.ts` 里经 `provider.saveContact` 与 `mergeCardIntoContact` 写入，落到上面两个模块。另有 `scripts/` 下的种子与迁移脚本也写这个集合，评测种子走产品写入链路时要一并核对。
- `features/agent/runtime/domain-executors.ts`:299：联系人现在只有 `contacts.archive` 一个执行器。
- `features/orbit-ai/data-query/permission-registry.ts`:16：`contacts.query` 的字段白名单不含邮箱电话（该注册表全部停用，生产未调用），可作字段名参照。
- 测试夹具：`tests/api/contact-fields-route.test.ts`、`tests/services/contact-field-write.test.ts`、`tests/services/contact-field-write-postgres.test.ts`、`tests/services/contact-delete-postgres.test.ts`、`tests/api/manual-contact-v2-routes.test.ts`、`tests/api/contact-import-routes.test.ts`、`tests/capabilities/contact-import-parse.test.ts`、`tests/services/relationship-lifecycle-postgres.test.ts`、`tests/services/contact-detail-lifecycle-guard-postgres.test.ts`。

### 关键符号
文件数为文本搜索结果，含定义文件。
- `export async function applyContactFieldValues(input: ApplyContactFieldValuesInput): Promise<ApplyContactFieldValuesResult> {` — 9。
- `async updateContactDetail(input): Promise<ContactDetailTagStatusResult> {` — 17 个文件含 `updateContactDetail`。
- `export function createContactDeleteService(input: { client: ContactDeleteSqlClient; workspaceId: string; now?: () => Date }): ContactDeleteService {` — 3。
- `export function createManualContactV2Service({ storage, events = null, now = () => new Date(), log = (line) => console.warn(line) }: ManualContactV2ServiceOptions): ManualContactV2Service {` — 5。
- `export function findManualContactCandidates(` — 2；`export function reviewImportRows(` — 2；`export function parseImportFile(input: { kind: "csv" | "vcard"; bytes: Uint8Array }): ParsedImportFile {` — 4。
- `export function createContactImportService(deps: ContactImportServiceDeps) {` — 6；其中 `async upload(input: { actorId: string; kind: "csv" | "vcard"; fileName: string; bytes: Uint8Array; idempotencyKey: string }): Promise<{ batch: ContactImportBatchView; replayed: boolean }> {`、`async commit(actorId: string, batchId: string, input: { confirmationIntentId: string; mergeConfirmations: readonly MergeConfirmation[] }): Promise<{ batch: ContactImportBatchView; replayed: boolean }> {`。
- `export interface ContactFieldsUpdateInput {` — 5；`export interface ContactDTO {`（含 `version?: number;`）— 81 个文件，按 HIGH 对待。
- 本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号做 upstream impact；建不起来用文本搜索补查并写进 REPORT（CONVENTIONS 第 5 节）。

### 前序交接要点
以下是 CONVENTIONS 第 4 节约定的名字，开工时按前序 REPORT 核对，有出入追加更正记录。
- AG02：账本项的 `revision`、各版载荷、`decideAction()`；卡面或目标数据变了时旧版点击返回最新状态并出新差异（AE-CON-004 期望 `CARD_CONTENT_CHANGED`）。
- AG04：`decideNextStep()`、`optionsFor()`、`attributeMessage()`；疑似重复的核对按追问处理，选项含 `create_new`。
- AG05：`domains/registry.ts` 与联系人的 `read`；`references/authorize.ts`。
- AG06：`OperationIntent`、`resolveIntents()`、`freezeCard()`；`todo`、`memo` 的 `prepare`、`applyApproved` 与执行器登记写法，本 sprint 照此登记联系人。
- AG07：两端确认卡组件与结果文档读取。

### 易错边界（括号里是对应验收项）
1. **查重不替用户决定**：候选按现有规则取；核对是追问，排在出卡之前，给「都不是，另建一位」；选了已有的且没有要改的就不出卡；名字只差几个字母、公司不同的不算同一人（AG12-1）。
2. **版本加一，覆盖全部写入方**：上面列的每个写 `contacts` 的模块都要加一，否则期望版本对得上而内容已变；写入值永远是正整数；没有版本的旧记录在版本标记里读作 0，第一次写成 1，不做回填（回填属 AG18）（AG12-2）。
3. **不破坏关系生命周期**：给旧联系人写上版本后，`initialization.ts`:76 的 `legacyPending` 不再成立。代码注释写明「被编辑过的关系不重新初始化」，与此一致，但它改变了现状：生命周期测试必须保持通过，REPORT 写明这处行为变化；若有测试或页面依赖「编辑过的旧联系人仍可初始化」，停下报告，那是产品决定（AG12-2）。
4. **期望版本**：字段写入接口新增可选的期望版本，带了就不再自动重试，不符返回冲突；不带的旧客户端行为不变。Agent 执行一律带期望版本（AG12-2）。
5. **旧值可追溯**：五个基本字段沿用 `fieldHistory`；行业、职级、地区、标签、状态、备注没有字段历史，旧值至少留在账本该项的 `before` 里，是否扩展 `fieldHistory` 由 Generator 定并在 REPORT 说明（AG12-2）。
6. **删除与恢复**：卡上列出关联的笔记和待办并写明不删、30 天内可恢复；执行只改联系人一行；恢复用原编号，卡和回执用「恢复」的说法，不写成新增（AG12-3）。
7. **导入的准备阶段只读**：`prepare` 只读，而 `upload` 会写批次表，所以卡片用 `parse` 与 `reviewImportRows` 在内存里算出逐行归类，批准后执行器再走 `upload` → `setDecisions` → `commit`，幂等键取账本项的键；解析由代码做，模型调用次数不随行数增加；重复行不自动合并，用户改一行就出新一版卡（AG12-4）。
8. **联系方式**：邮箱、电话、微信、地址在读取结果、查重候选、卡片预览、回答步骤的每一份模型输入里都去掉，统一在一个出口处理；用户自己在消息里打出来的不受此限；卡片由代码渲染，可以显示（AG12-5）。

## 范围与文件

- 读取：上文必读文件；AG02、AG04、AG05、AG06、AG07 的 REPORT；`docs/epics/agent-design/eval/cases/CON.yaml`，`SCL.yaml` 的 AE-SCL-023、AE-SCL-024。
- 修改（相对 `repos/orbits`）：
  - 版本：上文列出的写 `contacts` 的模块（导入经由其中两个，不另改 `features/contacts/import/`）。
  - 字段写入：`features/contacts/contact-field-write.ts`、`app/api/contacts/[id]/fields/handler.ts`、`shared/contract/contact-fields.ts`、`shared/api-schema/contact-fields.ts`（期望版本为可选输入，结果带新版本）。
  - 执行器登记：`features/agent/runtime/executor-registry.ts`、`domain-executors.ts`。
  - App 副本 `repos/orbit-app/src/api/contract/contact-fields.ts`、`src/api/schema/contact-fields.ts` 只经 `npm run sync:contract` 写出。两端界面代码只在进入条件第 3 条判定需要时改。
- 新建：
  - `features/agent-v1/domains/contact/`：`prepare.ts`（五种操作）、`apply.ts`（`applyApproved`，复用现有服务）、`duplicates.ts`（候选去联系方式）、`import-preview.ts`、`field-grants.ts`（联系方式出口），以及在 `domains/registry.ts` 的登记。
  - `features/contacts/contact-version.ts`：读版本标记与加一的共用函数，SQL 写入方共用同一段片段。
  - 测试：`tests/agent-v1/contact-domain.test.ts`、`tests/agent-v1/contact-field-grants.test.ts`、`tests/architecture/contact-version-writers.test.ts`（列出写 `contacts` 的模块，断言都经共用函数）、`tests/services/contact-version-postgres.test.ts`。
- 排除：联系人详情页与人脉页的界面；App 离线写入队列的行为；名片识别流程；联系方式的授权设置界面（首版没有入口，默认不授权）；历史数据回填（AG18）。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG12-1 | 新增时遇到疑似重复先让用户核对，不自动合并。 | `contact-domain.test.ts`（候选顺序、选已有不出卡、选另建才出新增卡、无合并写入）；门槛 AE-CON-001、AE-CON-002、AE-SCL-023、AE-SCL-024。 |
| AG12-2 | 修改只动指定字段，旧值可追溯；带期望版本，版本不符时不覆盖。 | `contact-version-postgres.test.ts`（每个写入方加一、期望版本不符返回冲突且不重试、旧客户端不带期望版本照旧）；`contact-version-writers.test.ts`；`tests/api/contact-fields-route.test.ts` 补期望版本用例；生命周期测试保持通过；门槛 AE-CON-003、AE-CON-004。 |
| AG12-3 | 删除前列出受影响的笔记和任务；删除后它们保留；可在期限内恢复。 | `contact-domain.test.ts`（影响清单、删除只改联系人一行、30 天内恢复原编号、过期拒绝）；`tests/services/contact-delete-postgres.test.ts` 保持通过；门槛 AE-CON-005、AE-CON-006。 |
| AG12-4 | 批量导入列出新增、重复、跳过的行，改一项重出卡。 | `contact-domain.test.ts`（内存预览与 `commit` 结果一致、准备阶段零写入、重出卡后旧版点击不执行）；门槛 AE-CON-007；Web 与 App 各一张导入卡截图。 |
| AG12-5 | 联系方式字段没有单独授权时不进入模型。 | `contact-field-grants.test.ts`（读取、查重候选、卡片预览、回答步骤四条路径的模型输入都不含邮箱电话）；门槛 AE-CON-008，以及 AE-CON-001～003 的 `model_input_excludes`。 |

## 一次 Generator 的执行顺序

1. 核对进入条件（AG06、AG07 的 REPORT，卡片能否通用显示导入），登记 run-01、本页 SHA256、基线 HEAD；建 GitNexus 索引，对关键符号与各写入方做 upstream impact，HIGH/CRITICAL 先报告。
2. 版本：先写版本加一和期望版本的失败测试与写入方架构测试，再改共用函数、各写入方和字段写入接口；契约改动同一提交跑 App `npm run sync:contract` 与四个同步测试；跑生命周期测试。
3. 联系人适配器：`prepare`、`apply`、查重、删除影响、恢复、导入预览，登记执行器；定向测试转绿。
4. 联系方式出口与模型输入测试。
5. 两端用 AG07 的卡看一遍新增、修改、删除、导入四种卡（App RULES 5.4：本机 Web 生产构建与模拟器同账号）；收口集、typecheck、全量对照。
6. 跑门槛与双评，路径限定提交到 `sprint/AG12-contact-writes`，写 REPORT，交协调者合并。

## 最小测试与检查

- **档位：H。** 写入、幂等、并发前置、共享契约都在改，`ContactDTO` 涉及 81 个文件；收口做一次 I 全量对照。
- **开发定向集**（cwd `repos/orbits`）：新测试四份，加 `tests/services/contact-field-write.test.ts`、`tests/services/contact-field-write-postgres.test.ts`、`tests/api/contact-fields-route.test.ts`。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`，并在 REPORT 证明没被跳过。
- **操作链收口集**：上述完整文件；`tests/services/contact-delete-postgres.test.ts`、`tests/api/manual-contact-v2-routes.test.ts`、`tests/api/contact-import-routes.test.ts`、`tests/capabilities/contact-import-parse.test.ts`、`tests/services/relationship-lifecycle-postgres.test.ts`、`tests/api/relationship-lifecycle-routes.test.ts`、`tests/services/contact-detail-lifecycle-guard-postgres.test.ts`，以及各写入方所在模块的现有测试；`npx tsc --noEmit -p .`；两端界面有改动时加 App `npm run typecheck`。
- **契约同步**：cwd `repos/orbit-app` 执行 `npm run sync:contract`，跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`，与契约改动同一提交。与 AG13 并行时，合并后在合并树再跑一次这四个测试。
- **门槛命令**：`npm run agent-eval:run -- --gate AG12`，包含 CON 区 8 例（AE-CON-001～008，小账号）、SCL 的 AE-SCL-023（常规）与 AE-SCL-024（较大），以及不变量包。
- **评审**：门槛运行的每例由两个互不相见的 Claude 会话各评一次（`npm run agent-eval:judge-pack -- --run <运行编号>`），不一致做第三次并列入人工复核；`agent-eval:report` 的结论登记进 `eval/RUNS.md`。
- **全量对照**：`repos/orbits` 按 RULES 5.2 跑失败清单对照，只调查新增项；stash 带唯一标签并按 SHA 取回（本 worktree 与其他 worktree 共用 stash 栈）。App 只有同步副本变化时不跑 App 全量，四个同步测试即可；两端界面有改动则按 App RULES 5.1 的 I 档跑一次。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数与 token 记进 REPORT。
- **证据位置**：截图与命令输出放 `~/orbit-sprint-evidence/agent-design/sprint-AG12/run-01/`，评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：`--all` 与封存集（AG18）；真实联网（门槛用例都不联网）；生产库与测试服（迁移、部署、push 都需另行授权，本 sprint 没有迁移）。

## 失败与交接

外部条件缺失（AG07 未合回、需要视觉稿而未批准、评测自检不过）先不启动。run 已开始，按 eval README 第 6 节最多两个修复轮次，每次整套门槛重跑；仍不过就如实结束为 failed，不为通过改用例，用例确实写错按第 7 节记进 `eval/CHANGES.md`。
REPORT 含验收映射、功能 SHA／文件／理由、写入方清单与各自的版本处理、生命周期的行为变化、命令与退出码、门槛运行编号与评审结论、费用、未提交与下一步。分支 `sprint/AG12-contact-writes` 从 `orbit-agent-claude` 建；固定最终 SHA 交协调者以 `--no-ff` 合回 `orbit-agent-claude`，合并树跑受影响测试与 typecheck 后才登记 completed。

## 开工更正记录（Generator 追加，2026-11-18；原文与原哈希 dc91d29a… 保留）

- **进入条件 3：** AG07 的卡（`display.record`、`rows[{label, before?, after}]`、`note`）能逐行显示导入归类和删除影响，两端界面代码不改。只缺“删除”“恢复”两个徽章词（设计稿 §10 要求写“删除”）：加在共享的 `shared/compute/agent-card-view.ts` 与 `shared/copy`（经同步脚本到 App），两端用原有徽章样式显示这个词。
- **全量对照：** 本页写 stash 取回；按 Generator 说明不用 git stash，改为把失败名字与协调者给的 24 条基线逐条比较。
- **执行器登记：** 按 AG06 的写法登记在 `domains/writes.ts`（`registry.ts` 是读取侧，联系人读取 AG05 已登记）。
- **修改的范围：** 首版只改五个基本字段（姓名、公司、职位、邮箱、电话，经字段写入接口与期望版本）。行业、职级、地区、标签、状态、备注在对话里说“这一版改不了”，仍在联系人页面改；它们不在门槛用例里。
- **写入方清单：** 上文列的 `completion/repository.ts`、`confirmed-followup/service.ts`、`postgres-repository.ts` 读查后不写联系人；另有 `storage/contact-live-record-provider.ts`（行业、补全、画像写回）写联系人，已纳入。清单与理由见 REPORT 与 `tests/architecture/contact-version-writers.test.ts`。

## run-02 更正记录（协调者批准的例外，2026-11-18）

run-01 评审后协调者开 run-02（最多两个修复轮次，先写测试，规则写在代码里）。范围：
1. AE-WEB-004 R3：“不能上网”只删那一个分句，有出处的其余部分留下（中日英）。
2. AE-CTX-005 R1：删卡片句时，一并删请用户确认的那句（中日英）。
3. AE-SCL-016 R2：读到的记录自己写了旧报价已过期、回答用了新的，由代码补一句；做不到确定性就在 REPORT 说明。
4. AE-AMB-011：任何删句规则之后，清掉空的或不成对的引号残留。
5. REF ×5：不变量包的“早晚”改按执行顺序（AG11 在 AG13 之后），REF-001／005／007 加用例级 `gate: AG14`。
留到交接：AG03 CTX-005 的「お礼をどうぞ。」开头、AMB-008 卡上方残留的「是李薇吗？」。
门槛 `AG12-gate-run-02`，回归 AG10～AG03 标为 `-gate-rerun-at-AG12-run-02`。

## run-03 更正记录（协调者批准的例外，2026-11-18）

run-02 评审后协调者开 run-03（最多两个修复轮次，先写测试，规则写在代码里）。范围：
1. AE-WEB-004：同一部分里另有线索点名了一条记录时，没有名字的指示或代称线索（那家公司、这个人、その会社、that company、he…）不当联系人去找，当成那条记录里的主体（在 AG09 的描述线索规则上扩展）。
2. AE-WEB-004：删掉否认分句后，开头悬空的引导语（只能据…说明：、所以、但、ただ、but、so…）一并去掉，后面有出处的内容留下。
3. AE-FN-008：列表前的无出处数量（有三件事：）只中和掉数量；任何删句规则都不能让引用了记录的回答一点有出处的内容都不剩。
4. AE-SCL-004 R2：公司过时的那一行，带上资料里在该公司的职位（拾野选物店店长）。
5. AE-FN-003 R4：如果 AG10 已有可点的排序依据选项，就作为入口放在回答旁边；需要新界面就不做，报告。
门槛 `AG12-gate-run-03`，回归 AG10～AG03 标为 `-gate-rerun-at-AG12-run-03`。
