# Sprint AG05 — 读取与带出处的回答

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R05（授权读取、三个读取视图、带出处的回答；设计稿 §3.2、§3.6、§4、附录 B），门槛按 AG-R19。**单一目标:** 在 AG03 的图上接入只读的 `resolve` 与 `verify`：第一层判为读取的子目标由代码编成读取请求，经联系人、笔记、待办、个人日程、活动五类记录的授权读取适配器和三个读取视图取数，每次最多 10 条，用游标翻页；`answer` 只用本轮读到的材料写带引用的回答，由代码校验引用；六类引用在服务端逐条授权；空结果、部分可读、读取失败分别交付。判断模型的证据核对在 AG08 接入。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00–AG04 未开工）。启动时填实际 HEAD 与 AG03 的合并 SHA；与 AG04 并行时另记 AG04 是否已合回。
**进入条件:** ① AG03 completed 并已合回 `orbit-agent-claude`。② 产品批准沿用设计稿“2026-11-15 已定的事项”与 §3.2、§3.6、§4、附录 B，不再逐项索要。③ 真实 DeepSeek 调用已允许，上限按 CONVENTIONS 第 6 节。④ `npm run agent-eval:env` 自检通过，三个账号的快照可恢复，DeepSeek 余额够跑本 sprint 与 AG03 各一次门槛。⑤ 开工前核对三件评测侧的事，缺一项先请协调者裁定再启动（见末节）：快照里 M41 带着 `interaction` 字段；运行器的 `revoke: { read }`、`external_change`、`fault: { where: memo.read }` 怎样落到产品读取上；新入口能收下 `memo`、`todo`、`event` 类型的引用。⑥ 与 AG04 并行时，第二条线在 `/Volumes/ORICO/Dev/worktrees/orbit/<名称>` 另建 worktree。⑦ 不动界面，无需视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿和用例在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§3.2 第 1、2、4 步与小林示例表；§3.6 第三段（逐项授权、引用不授予修改权、已不可访问就提示重选、恢复时按当前权限重读）；§4 领域表、“读取视图”段、“存储与约束建议”末句；附录 B 的 `read` 签名、每次 10 条与游标、覆盖范围、联系方式另授权；附录 C `AnswerOutput` 与 `gaps` 的取值；附录 D 的 `REFERENCE_NOT_ACCESSIBLE` 与 `partial`。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`（仓库根）。
- `features/orbit-ai/data-query/read-contract.ts`：`ReadScope`（账号、工作区、授权纪元）与 `ReadAdapter`（`authorize`、`page`、`authorizeEvidence`、`readCurrentAtRevision`）现成，但没有任何生产实现。
- `features/orbit-ai/data-query/query-result.ts:89` `executeAiRead`：前后两次授权核对、签名游标、版本栅栏、字段白名单、字节上限；只有测试在调用。它抛的 `READ_NOT_FOUND`、`SOURCE_UNAVAILABLE`、`AI_NOT_AUTHORIZED`、`CANONICAL_RECORD_UNAVAILABLE` 要分别映射到缺口原因。
- `features/orbit-ai/data-query/permission-registry.ts`：13 个工具的字段白名单，`maxItems: 10`，`enabled` 全部是 `disabled`（:26）；`tasks.query` 没有 `plannedDate`，`notes.query` 没有 `updatedAt`、`version`；`fieldSchemas` 是 `.strict()`，多出的字段会被拒。
- `features/orbit-ai/data-query/query-cursor.ts`：`sealReadCursor`／`openReadCursor` 用 HMAC 把游标绑到账号、工作区、纪元；密钥至少 32 字节，已有的 `ORBIT_READ_CURSOR_SECRET`（待办页、联系人卡片页在用）。
- `features/orbit-ai/data-query/query-service.ts`：线上四个查询把全部记录读进内存再分页（:113–156），游标是没签名的偏移量，绑定串里没有账号（:61–74、:154），新读取不复用这套游标。
- `features/notes/service.ts:41–56` `NoteSearchInput`（`q`、`contactId`、`sort: updated_desc | updated_asc`、`cursor`、`limit`，结果带 `total`），:282 在内存里过滤；`features/notes/note-record.ts:53` `readNote` 保留其余字段，所以库里存了 `interaction` 就读得到，:124–127 已删除或别人的记录返回空。
- `features/tasks/service.ts:81` `TaskService`（`get`、`list` 没有联系人筛选和分页）；`features/tasks/contract.ts:30` `TaskItemDTO`（`plannedDate`、`dueAt`、`status`、单值 `relatedContactId`）。
- `features/personal-schedule/service.ts:213–214` `get`、`list({ actorId, from, to })`；`authority-contract.ts` 的 `kind`、`contactIds`、`noteIds`。
- `features/contacts/service.ts:13` `ContactsListSearchAndFilterService`（`query`、`contactIds`、`cursor`、`limit`）；`features/contacts/storage/contact-read-authorization.ts:5` 归属口径；`features/contacts/live-detail-service.ts:524–692` 联系人详情里另存的 `lastInteraction` 只是展示摘要。
- `features/events/mine/service.ts:61` `createMyEventsService`（本人相关活动，过去 180 天到未来 365 天，最多 200 行）；`features/events/core/repository.ts:7` `getEvent(eventId)` 读平台活动。
- `shared/contract/relationship-timeline.ts` 与 `features/relationship-timeline/reader.ts:326`：七个来源各读至多 50 条，条目带 `ref`；`note` 来源用 `createdAt` 当发生时间，分不出谁真的参与了；`build.ts:137` 已按 `human_encounters` 去掉投影；`unavailableSources` 标出读不到的来源。
- `features/orbit-ai/ai-session-reference-authorization.ts`：只核对联系人，遇到第一条失败就整体抛错；`features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts:292–297` 存消息时丢掉 `contact | event | note` 以外的引用类型。
- 用例（仓库根 `docs/epics/agent-design/eval/`）：`cases/RD.yaml` 全部；`cases/SCL.yaml` 的 AE-SCL-004～008；`world/base-v1.yaml` 的 M31、M32、M37 与增量 `later-interaction`（M41 带 `interaction`）。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。下面的引用数来自文本搜索。
- `export async function executeAiRead(`（query-result.ts:89）：1 个非测试文件、1 个测试文件；调用，必要时小改。
- `export const AI_READ_PERMISSIONS = AI_READ_TOOLS.map((tool) => ({`（permission-registry.ts:28）：2 个非测试、2 个测试文件；补字段，不改停用状态。
- `export function sealReadCursor(claims: CursorClaims, key: Uint8Array): string {`：2 个非测试文件；只调用。
- `search(input: NoteSearchInput): Promise<NoteSearchResult>;`（notes/service.ts:23）：`createNoteService` 5 个非测试、13 个测试文件；只调用。
- `export async function readRelationshipTimelineForContact(`（reader.ts:326）：2 个非测试、2 个测试文件；只调用。
- `export function createMyEventsService(deps: { reader: MyEventsReader; now?: () => Date }) {`：2 个非测试文件；只调用。
- `export async function authorizeAiSessionContactReferences(input: {`：3 个非测试文件；旧路径照用，新入口改用新授权。
- AG03 交付、本 sprint 要改的 `decideRoute()`、`AgentGraphState`、`answer` 与 `deliver` 节点、会话级状态：签名以 AG03 REPORT 为准，启动时抄进追加记录再跑 impact。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 REPORT 核对，不一致就追加更正记录）
- AG03：`graph/` 与 `AgentGraphState`；`route/` 的 `decideRoute()`（`read`、`probe` 去向已能定出）；`models/main.ts`；单轮 4 次调用的计数；回复语言规则；会话级状态里“每类最近提到的一条”。
- AG01：结果文档的 `answer.sourceRefs`、`partResults[]`；协议版本 3 的引用类型。
- AG00：`emitTrace` 的 `read.query`、`read.result` 事件；运行器的 `revoke`、`external_change`、`fault` 与 `recent_interaction` 判定怎样调到产品；快照怎样写入 M41。
- AG04（可能并行）：已合回就用 `decideNextStep()` 处理读取时的多个同名对象；没合回就列出候选并说明，不猜。

### 易错边界（每条对应一项验收）
1. **只在本账号和工作区里读（AG05-2）。** `Scope` 只取自服务端认证，模型给的账号、编号一律不作为授权依据；每次读取按账号和工作区过滤，结果返回前再核一次授权；游标用 HMAC 绑定范围，另一个范围的游标被拒。按名字找人只在本账号里找：AE-RD-007 的小林诚在本账号不存在，就说没找到，可以问是不是指小林健，绝不用账号乙的数据。账号乙的记录不出现在 `read.result`、回答和日志里。
2. **只给模型这一问需要的字段（AG05-2）。** 各领域按白名单投影；邮箱、电话、微信这类联系方式不进模型输入（附录 B）；记录正文先由代码切成带编号的句子再交给 `answer`；正文不进检查点和上文，只留引用与版本；正文是数据，不是指令。
3. **每次最多 10 条，翻页并如实写覆盖（AG05-3、AG05-4）。** `read(scope, query)` 返回至多 10 条和 `nextCursor`；筛选至少要有联系人、文字、状态、日期范围、由新到旧或由旧到新（AE-SCL-005 要在 104 篇里找最早谈灰釉的那篇，AE-SCL-007 要找 120 篇里最早的一篇）；每个子目标的翻页有上限（建议初值 5 页，放配置），结果记下翻了几页、看过多少、总数多少，回答里不把看过的一部分说成全部（AE-SCL-008 的 64 条）。
4. **引用由代码校验（AG05-3）。** `verifyCitations()`：每个 `sourceRef` 都是本次委托读过的记录（AE-RD-009 撤权后第二轮必须重读，上一轮的读取不算），每个句子编号都存在；读取类子目标里没有有效引用的段落删去。不合规最多修复一次，算在 4 次调用里；仍不合规就交付已校验的部分并记缺口。原文是否支持结论的语义核对在 AG08。结果文档的 `sourceRefs` 用 `memo:<编号>` 这类带类型的引用，交付前按当前权限再核一次，保证点得开。
5. **三种读不到分开说（AG05-4）。** 查询成功但零条：`no_record`，子目标照常 `answered`，说没有找到（AE-RD-004）；一部分记录或来源读不到：`partial`，交付读得到的并说明还有读不到的（AE-RD-005）；读取服务失败或超时：`service_error`，说这次没读到、可以稍后再试，绝不说没有记录（AE-RD-006）；引用的记录不可访问：`unreadable`。`executeAiRead` 的异常按含义映射，不一律当服务错误。缺口文案由代码按三种语言给出。
6. **六类引用逐条授权（AG05-5）。** `references/authorize.ts` 对联系人、笔记（旧的 `note` 视同笔记）、待办、日程、活动、参会记录逐条核对类型、编号、归属和是否已删除；活动是平台上可见的或与本人相关的；参会记录要到 AG13 才有实体，本 sprint 一律判为不可访问。每条单独给结果，不像旧函数那样一条失败整体抛错：不可访问的那个子目标记 `unreadable`，用代码文案请用户重新选择，原因 `REFERENCE_NOT_ACCESSIBLE`，其余部分照常交付。每轮都重新授权，恢复会话时也一样。引用不授予修改权，不建立关联，不写记忆。
7. **“最近互动”只算真实往来（AG05-1）。** 只收能从结构上看出这个人真的参与了的记录：`interaction.actualContactIds` 含此人的笔记、`human_encounters`、已经开始且列了此人的日程会面。按发生日期或时间由新到旧，同一天同精度用稳定编号排，不声称知道同日先后；会面记录和它的投影按来源编号去重。旧笔记、联系人详情里的 memo 和另存的 `lastInteraction` 摘要只作为“旧资料”附带返回，标明不是确认过的往来。视图只读，不写 `contact_detail_states`。问“上次聊了什么”而没有结构化往来时，改用“上下文”视图里关于此人最新的笔记，并说明出自笔记。
8. **新旧冲突以较新的为准（AG05-1、AG05-3）。** 每条材料带日期和版本，联系人资料带更新时间；代码按由新到旧排好再交给 `answer`；提示要求以较新的为准并指出有过变化（AE-SCL-004、006、007）。
9. **读取不多调模型（AG05-1）。** 读取请求由代码从第一层的能力、对象线索、`referenceId` 和限定编出，不另调第二层（`propose` 在 AG06）；一次普通读取是理解加回答两次调用，连修复不超过 4 次。

## 范围与文件

- 读取：上面的必读文件；AG03 REPORT 的交接段；AG00 REPORT 里与 `revoke`、`fault`、快照有关的段落。
- 新建（目录按 CONVENTIONS 第 1 节）：
  - `features/agent-v1/domains/registry.ts`（能力名到五个适配器的登记）；`domains/{contact,memo,todo,schedule,event}/read.ts`（各自实现 `ReadAdapter`，经 `executeAiRead` 出口，包成附录 B 的 `read(scope, query)`）。
  - `features/agent-v1/views/{context,timeline,recent-interaction}.ts`；时间线复用 `readRelationshipTimelineForContact`，不改它。
  - `features/agent-v1/references/authorize.ts`。
  - `features/agent-v1/answer/{schema,prompt,sentences,verify}.ts`（`AnswerOutput`、切句、`verifyCitations()`）。
  - `features/agent-v1/graph/nodes/{resolve,verify}.ts`。
  - 测试 `tests/agent-v1/{domain-read-scope,domain-read-paging,views-recent-interaction,references-authorize,answer-verify,read-gaps}.test.ts`；用到 Postgres 的先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 里证明没有被跳过。
  - 评测侧，AG00 没覆盖的才补，放 `tests/agent-eval/`：读取适配器上的故障点、`revoke` 在 `ORBIT_AGENT_EVAL=1` 下的拒读名单、运行器调用“最近互动”视图的入口。
- 修改：`features/orbit-ai/data-query/permission-registry.ts`（给五个工具补本 sprint 要的字段，旧登记仍是停用，agent-v1 经 `ReadDependencies.permission` 注入自己的启用判断）；AG03 的 `graph/build.ts`、`graph/state.ts`、`route/decide.ts`（读取类子目标进 `resolve`）、`graph/nodes/intake.ts`（改用新授权）、`graph/nodes/answer.ts`（改成带引用的回答）、`graph/nodes/deliver.ts`（`sourceRefs`、缺口、覆盖范围）、`context/session-state.ts`（用交付的引用更新“最近提到的”）。若 AG01 的协议版本 3 还收不下六类引用，只把类型并集扩到六类（位置在 AG11），改 `shared/contract`、`shared/api-schema` 对应文件并同步 App。
- 排除：写入提议与 `propose/`（AG06）；Memo 往来字段的契约与写入（AG06）；判断模型的证据核对（AG08）；联网（AG09）；排序、提取、比较等二级函数（AG10）；@ 选择器与引用位置（AG11）；私有活动与参会自述（AG13）；记忆召回（AG14）；修改 `features/relationship-timeline/`、`query-service.ts`、旧引用授权和旧运行时；联系方式进模型。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG05-1 | “上次和小林聊了什么”得到 11 月 12 日那篇笔记的要点，引用指向原笔记。 | `tests/agent-v1/views-recent-interaction.test.ts`（只算真实往来、同日按编号、旧资料不冒充、去重）、`answer-verify.test.ts`；门槛 AE-RD-001、002、003，AE-SCL-004～007 |
| AG05-2 | 读取只发生在当前账号和工作区内；另一个账号的记录在回答和日志里都不出现。 | `tests/agent-v1/domain-read-scope.test.ts`（五类各测账号乙零条、别的范围的游标被拒、联系方式不进模型输入）；门槛 AE-RD-007、008，AE-SCL-005、006 |
| AG05-3 | 回答里的每条引用都属于本轮读过的记录；没有依据的内容不出现。 | `answer-verify.test.ts`（引用未读记录被拒、无引用段落删去、只修复一次）、`domain-read-paging.test.ts`（10 条一页、翻页上限、覆盖计数）；门槛 AE-RD-001、009，AE-SCL-004、008 |
| AG05-4 | 没有记录、部分读不到、服务出错三种情况各有不同的说明，不把读不到说成没有。 | `tests/agent-v1/read-gaps.test.ts`（`executeAiRead` 各异常的映射、三种文案互不相同）；门槛 AE-RD-004、005、006，AE-SCL-008 |
| AG05-5 | 活动和笔记的引用经过授权才生效；已删除或撤权的引用提示重新选择，其余部分照常交付。 | `tests/agent-v1/references-authorize.test.ts`（六类、已删除、他人、参会记录一律拒、逐条结果）；门槛 AE-RD-008、009、010 |

每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件（含第⑤条三件事），登记 run-01、本页 SHA256、基线 HEAD；把要改的 AG03 符号签名抄进追加记录；建 GitNexus 索引，对上列符号和 `executeAiRead` 跑 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. 写六个测试文件里改变行为的失败用例。
3. 五个适配器与登记 → 引用授权 → 三个视图 → 切句、回答、引用校验 → `resolve`、`verify` 接进图，`intake` 改用新授权；需要时扩引用类型并同步 App。定向测试转绿。
4. 补评测侧钩子，跑 `npm run agent-eval:check`；只用 dev 组调提示词。
5. 门槛：一次 `--gate AG05` 完整运行，再跑一次 `--gate AG03`；评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md。不过就修复后整套重跑，最多两轮。
6. 收口集、typecheck、全量对照；路径限定提交到 `sprint/AG05-read-grounded-answer`；写 REPORT，交出固定最终 SHA。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：读取授权与跨账号隔离、共享的字段登记、可能改共享契约、真实付费调用。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/domain-read-scope.test.ts tests/agent-v1/domain-read-paging.test.ts tests/agent-v1/views-recent-interaction.test.ts tests/agent-v1/references-authorize.test.ts tests/agent-v1/answer-verify.test.ts tests/agent-v1/read-gaps.test.ts`。模型一律用桩；读取测试用两个账号的真实存储（本机测试库或内存记录库）。
- **操作链收口集**：上面六个文件；AG03 的 `tests/agent-v1/*.test.ts`；字段登记的既有测试 `tests/capabilities/orbit-ai-read-permission.test.ts`、`orbit-ai-read-pagination.test.ts`、`orbit-ai-actor-query-tools.test.ts`；`tests/capabilities/ai-session-reference-authorization.test.ts`（旧授权不变）；`tests/capabilities/relationship-timeline-build.test.ts`、`relationship-timeline-reader-postgres.test.ts`（只调用，确认没被波及）；`npx tsc --noEmit -p .`。改了 `shared/` 时，同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- **门槛**：`npm run agent-eval:run -- --gate AG05`，包含 RD 10 例（小账号 `base-v1`）、AE-SCL-004～008（常规 `regular-v1`、较大 `large-v1`），三个账号都在；以及不变量包（全部可见用例中标 `invariant: true` 的，判定口径以 AG00 REPORT 为准）。另跑一次 `npm run agent-eval:run -- --gate AG03`：UND、CTX 里读取去向的用例现在真的会读，`private_reads_within` 开始起作用，要证明没有退步；AG04 若已合回，同理再跑 `--gate AG04`。通过条件按 eval README 第 6 节。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；门槛里每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前的失败清单 `comm -13` 对比，只查新增项；stash 带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：真实 DeepSeek 调用每次完整运行 ≤30 元，本 sprint 累计 ≤150 元（含前序门槛复跑），超出先停下报告；`costs.json` 的次数、token、余额差额写进 REPORT。判断模型和联网都是 0 次。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG05/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。都不进仓库。
- **不运行**：浏览器与 App 界面验证（没改界面）；`--all` 与封存集；真实联网。

## 失败与交接

外部条件缺失（AG03 未完成、第⑤条未裁定、自检不过、余额不够）先不启动；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、功能 SHA、命令与退出码、各次门槛的运行编号与评审结论、费用、契约同步结果、未完成与下一步。分支 `sprint/AG05-read-grounded-answer` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- AE-RD-003 要读 M41 的 `interaction` 字段，而 CONVENTIONS 把 Memo 往来字段交给 AG06。本 sprint 只读这个字段（库里有就认），不改笔记契约和写入。若 AG00 的快照经产品写入链路写不进这个字段，开工前由协调者在两条路里选一条：把这个字段的契约提前到本 sprint，或把 AE-RD-003 改挂 AG06。
- AE-RD-008、010 由客户端带 `memo`、`todo`、`event` 引用，CONVENTIONS 把“引用扩到六类”交给 AG11。本页定为：AG01 的协议版本 3 收不下时，本 sprint 只扩类型，位置仍归 AG11。
- “参会记录”的实体在 AG13 才有，所以六类引用里这一类在本 sprint 只能判为不可访问。
- 产品里没有按单条记录收回读取权限的功能；`revoke: { read }` 只能靠评测环境里的拒读名单实现，由读取授权在每次读取时查询。
- 与 AG04 并行时两边都改 `graph/build.ts`、`graph/state.ts`、`route/decide.ts`，处理办法同 AG04 PLANNER 末节。

## 启动核对记录（run-01，2026-11-16，Generator 追加）

原文不改。开工时本页 SHA-256 `5bea9534a1935c587eca49794e0f95914628ec98b412816e9ed397336f540b8b`，基线 HEAD `459c5ec0c`（AG03、AG04 都已合回，AG04 的合并提交即此）。不与其他 sprint 并行。

**AG03／AG04 交付、本 sprint 改的符号（按两份 REPORT 的交接段）：** `decideRoute`、`statusForRoute`、`NOT_YET_ROUTES`（`route/decide.ts`）；`buildFirstLayerContext`（`context/build.ts`）；`SessionOpenItem`（`context/session-state.ts`）；`UnderstandPart`、`validateUnderstandOutput`、`understandSystemPrompt`（`understand/`）；`AgentGraphState`、`GraphPart`、`PartPlan`、`AgentGraphRun`（`graph/state.ts`）；`AgentGraphDependencies`（`graph/deps.ts`）；`buildAgentGraph`、`runAgentGraph`、`resumeAgentGraph`（`graph/build.ts`）；`intakeNode`、`understandNode`、`routeNode`、`answerNode`、`deliverNode`、`clarify` 的 `candidatesFor`／`nameOf`（`graph/nodes/`）；`contactReferenceAuthorizer`、`createGraphExecutor`（`graph/executor.ts`）；`stripCardTalk` 的 `CARD_TALK`（`entry/approval-claims.ts`）；`AgentEntrySessionWriter.appendAssistant`（`entry/service.ts`、`legacy-runtime.ts`）。

**与前序交接要点的出入：**

1. **AG04 已合回**，读取时的多个同名对象按 AG04 的追问（`ask_missing` 加候选）处理，不猜。
2. **AG00 的快照里 M41 没有 `interaction`**（种子把它记为缺口“Memo has no interaction field yet”），本页进入条件⑤的第一件不满足。按 CONVENTIONS §4（优先于本页“出入”第 1 条）AG05 交付“Memo 的 `interaction` 字段的契约与读取”：契约加在 `shared/contract/notes.ts`（可选字段，App 同步），种子经笔记仓库的条件写入存进这个字段（Agent 的写入路径仍在 AG06）。AE-RD-003 不改挂。
3. **运行器的 `revoke: { read }`、`fault: { where: memo.read }`、`external_change` 删笔记、六类引用**，AG00～AG04 都没有落到产品上（`revoke` 记为不支持，`fault` 只认 model／understand／executor，`external_change` 只支持改待办，引用只发联系人、笔记、活动）。本 sprint 在评测侧补齐：评测预加载的拒读名单（产品每次读取时核对），读取适配器上的故障点，经笔记正常删除接口的删除，协议 3 的六类引用（契约与校验扩类型，位置仍在 AG11）。
4. **`listed` 判定**原登记为 AG10 交付，但本 sprint 的门槛 AE-SCL-008 用到它；按 CONVENTIONS §7（第一个用到的门槛 sprint 实现）在本 sprint 实现，口径见 REPORT。
5. **协调者交代的三项**（brief）：收窄 `CARD_TALK`；门槛里 ENT-002 R1、ENT-003 R1、ENT-004 R3/R4 要过；把 `read` 从 `NOT_YET_ROUTES` 去掉、@ 笔记和活动改为真授权、读得了的地方去掉“这一版还不能读”。
6. **GitNexus**：`npx -y gitnexus@latest analyze --index-only --force` 重建成功；`impact` 用 `--repo /Volumes/ORICO/Dev/worktrees/orbit/orbit-agent-claude`。
