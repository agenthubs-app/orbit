# Sprint AG06 — 小林切片：一张卡改待办、记往来（H）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R06（设计稿 §1、§3.2、§5.1、§5.2、附录 B、附录 E 的 Memo 往来字段）；门槛按 AG-R19。
**单一目标:** 新入口上，§1 那句话经第二层提出 `todo.update` 与 `memo.create` 两项，定位、消歧、排依赖后冻结成一张卡；用户点一次确认后由执行器逐项执行并给出逐项回执；Agent 写的 Memo 带往来字段并抑制旧的自动提取。
**易读目标:** [GOAL.md](GOAL.md)。一答、一卡、两项，点击后执行，逐项回执；不新增界面。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`；启动时填实际 HEAD，以及 AG04、AG05 REPORT 记录的合并 SHA。未启动不填 run。
**进入条件（缺一项不启动）:**
- AG04、AG05 completed 并已合回 `orbit-agent-claude`（因而 AG00–AG03 已完成）。
- 设计稿「2026-11-15 已定的事项」即产品批准（EPIC.md），不再逐项索要。
- 真实模型调用已允许；上限按 EPIC「等你决定」的建议：每次完整运行 ≤30 元、本 sprint 累计 ≤150 元，用户另定时以用户为准。
- 环境：外接盘已挂载；本机库 `orbit_agent_eval`、评测服务端口 3100；`ORBIT_AGENT_V1_MODE`、`ORBIT_DEEPSEEK_MODEL=deepseek-flash` 与 DeepSeek 密钥就绪；`npm run agent-eval:env` 自检通过。
- 本 sprint 不改界面，不需要视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md` §1、§3.2、§3.3（单轮 4 次调用）、§5.1、§5.2、附录 B、附录 D、附录 E「Memo 的往来字段」：本 sprint 的全部行为依据。
- `docs/epics/agent-design/eval/README.md` 第 3.2、3.4、4、6、7 节：判定词（`writes_exact`、`receipts`、`recent_interaction`、`no_auto_extraction`）的含义与冻结规则。
- `docs/epics/agent-design/eval/cases/XL.yaml` 全部 12 例；`cases/SCL.yaml` 的 AE-SCL-009～012；`world/base-v1.yaml`（C17、C21、C40、C41、M31、T42 与 `two-kobayashi`、`two-quote-todos`、`todo-plan-and-due` 增量）；`world/regular-v1.yaml` 的 RT01–RT04；`world/large-v1.yaml` 的 LC01/LC02、LT06/LT07。
- `repos/orbits/features/tasks/service.ts`：`update` 的前置检查（:417）与外层 `repository.mutate` 包装（:245–259）。
- `repos/orbits/features/tasks/mutations.ts`：`runTaskMutation` 用 advisory lock 和 `task_mutations` 回执去重；同键不同内容报 `TASK_VERSION_CONFLICT`。
- `repos/orbits/features/tasks/task-record.ts`：`readTask` 原样放过未登记字段（:140），所以夹具里的 `relatedContactIds` 会随 `update` 的展开保留。
- `repos/orbits/shared/contract/notes.ts`、`features/notes/service.ts`（`create` :313）、`features/notes/note-record.ts`（`readNote` :53）：笔记契约、新建路径、解码。
- `repos/orbits/app/api/notes/route-support.ts`（`noteOnPersisted` :37）与 `features/contacts/memo-extraction/rescan.ts`（`MEMO_RESCAN_SQL` :30）：笔记集合触发自动提取的两条路。
- `repos/orbits/features/agent/runtime/` 的 `executor-registry.ts`、`domain-executors.ts`、`service-factory.ts`、`service.ts`（`processOutbox` :910、`aggregateActionStatus` :206）、`contract.ts`：执行器登记与出队执行。
- `repos/orbits/features/agent/capabilities/contract.ts`、`registry.ts` 与 `features/agent/ledger/contract.ts`：执行器键、能力描述、操作类型三处登记。
- `repos/orbits/features/relationship-timeline/reader.ts`、`build.ts`：现有时间线读的是哪些来源。

### 关键符号（签名原样抄自源码；调用方为文本搜索到的引用文件数，含定义与测试）
- `export function createTaskService(input: {`（`features/tasks/service.ts:235`，35 个文件）。`TaskService.update` 多行签名的字段：`actorId: string; taskId: string; expectedUpdatedAt: string; patch: TaskUpdatePatch; idempotencyKey: string; now: string;`，返回 `Promise<TaskMutationResult>`；HTTP 调用方 `app/api/tasks/[id]/handler.ts:80`。
- `export interface TaskUpdatePatch {`（`service.ts:66`）：`plannedDate?: string | null;`、`dueAt?: string | null;`，联系人只有单值 `relatedContactId?: string;`。
- `export function createNoteService(input: { repository: NoteRepository; associationReader?: NoteAssociationReader }): NoteService {`（`features/notes/service.ts:266`，18 个文件）；`export interface NoteCreateInput {`（:58）含 `onPersisted?: (note: NoteDTO) => void;`。笔记编号由 `actorId + idempotencyKey` 算出，`saveIfAbsent` 原子插入。
- `export interface NoteContract {`（`shared/contract/notes.ts:11`，6 个文件）：没有 `interaction`。
- `export function noteOnPersisted(note: NoteDTO, dependencies?: NoteRouteDependencies): void {`（`app/api/notes/route-support.ts:37`，3 个文件）：只在 `usedForPlan === true`、`noteKind === "meeting"`、恰好一位联系人时排提取。
- `export async function listMemoExtractionRescanCandidates(`（`rescan.ts:85`，3 个文件），由 `features/operations/maintenance/configured-tasks.ts:246` 调用；SQL 第二段同样只选 meeting + usedForPlan 的笔记。
- `export async function runMemoExtraction(input: MemoExtractionJobInput, deps: MemoExtractionJobDeps): Promise<MemoExtractionRecord> {`（`job.ts:129`）：经 `applyValues` 写回联系人。
- `export function createAgentDomainExecutors(`（`domain-executors.ts:61`，9 个文件）：现有 11 个执行器，没有 Todo 修改，也没有写 `notes` 集合的 Memo。
- `export function createAgentExecutorRegistry(`（`executor-registry.ts:69`，16 个文件）；执行函数 `execute: (payload: Readonly<Record<string, unknown>>, context: AgentExecutorContext) => Promise<AgentExecutorResult>;`。
- `export const AGENT_RUNTIME_EXECUTOR_KEYS = [`（`features/agent/capabilities/contract.ts:63`，2 个文件）；`export const AGENT_LEDGER_OPERATION_TYPES = [`（`features/agent/ledger/contract.ts:32`，3 个文件）。`tests/capabilities/agent-capability-registry.test.ts` 断言执行器与能力表一一对应。
- `async processOutbox(input = {}) {`（`service.ts:910`）：每项独立执行，任何错误都重试到 `maxAttempts`，没有依赖和跳过；回执 `status: "completed" | "failed" | "undone"`（`contract.ts:201`）。
- `export function createOrbitAgentRuntimeService(`（`service-factory.ts:52`）：账本用 `${workspaceId}:agent-actor:${actorId}`，领域写入用原 `workspaceId`。
- `export async function readRelationshipTimelineForContact(`（`reader.ts:326`，4 个文件）；`TimelineNoteRow`（`build.ts:59`）不含往来字段。

本 worktree 没有 GitNexus 索引（也没有 `.gitnexus/run.cjs`）。Generator 启动时按根目录 `CLAUDE.md` 先建索引，再对上面每个要改的符号做 upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查；建不起来就用文本搜索并在 REPORT 写明（CONVENTIONS 第 5 节）。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时逐条对照前序 REPORT，有出入追加更正）
- AG00：`npm run agent-eval:*` 命令、本机库快照、`observability/trace.ts` 的 `emitTrace(event)`、对外连接守卫、基线运行；`writes_exact` 对派生字段的口径。
- AG01：`entry/` 的 `acceptMessage()`、`getRequestResult()`；`shared/contract/agent-v1.ts` 的 `AgentResultDocument`、`AgentPartResult`；协议版本 3。
- AG02：账本的 `origin`、`revision`、各版载荷、`expiresAt`；`decideAction()`；回执 `needs_review`、`user_confirmed`、`abandoned`；批准与出队一个事务；新入口上直写与文字确认已关。核对 AG02 是否已交付 `skipped`、操作间 `dependsOn`、永久失败不重试；没有的由本 sprint 补在 `features/agent/runtime/`。
- AG03：`AgentGraphState`、`UnderstandOutput`、`decideRoute()`、`models/main.ts`、会话级状态（上一份清单，AE-SCL-009 要用）。
- AG04：`decideNextStep()`、`optionsFor()`、`attributeMessage()`，追问的暂停与恢复。
- AG05：`domains/registry.ts` 与五类 `read`；「最近互动」视图（确认它读的是 Memo 的哪个字段）；`references/authorize.ts`；`AnswerOutput`、`verifyCitations()`。

### 易错边界（都对应到下方验收）
1. **一轮一张卡（AG06-1）。** 本轮独立且已定位的写入合成一张卡，读结果先交付；卡上可见文字（总数句「修改 1 项，新增 1 项」、每项对象、原值→新值、带星期的日期）由 `freezeCard()` 按确定性模板生成并冻结进载荷，哈希覆盖它。「周五」「今天」按 `asOf` 与 Asia/Tokyo 由代码换算，不交给模型。整轮主模型 ≤4 次（承接、提出操作、回答各一次，至多一次修复）。
2. **消歧顺序（AG06-2）。** 同名的人影响全部三项：先问一次，选定前不交付查询也不出卡；只有待办不明：查询照常交付，只问哪一条；「改到周五」在计划日与截止时间之间有两解：卡前问清；只说「改」却零匹配：说明找不到，不转成新增（AE-XL-009）；候选只列全名相同的人并各带一条能区分的信息（AE-SCL-011）；空闲超过 60 分钟的指代不自动绑定，长对话里的旧指令不重放（AE-SCL-009、012）。
3. **点击前零写入、写入与卡一致（AG06-3）。** `prepare` 只读；`applyApproved` 只由批准后的执行器调用。Todo 前置按 §5.2：执行时重读，卡上展示过的字段（标题、要改字段的原值、对象是否还在）都没变就以重读到的 `updatedAt` 作 `expectedUpdatedAt` 写入；展示过的变了就不写，走 AG02 的「内容有变化」路径。不得直接拿准备时的 `updatedAt` 硬比（别的字段被改过会误报冲突），也不得跳过核对。记录上已有的 `relatedContactIds`、`relatedEventRefs` 原样保留（AE-SCL-010、012）。`deferralCount`、活动记录、`task_mutations` 回执是 Todo 服务原有的记账，按 AG00 的 `writes_exact` 口径处理，不为过判定删掉。去掉一项只重新冻结剩余项（AE-XL-006）；否决后零写入，再点确认得 `CARD_CLOSED`（AE-XL-005）。`prepare` 拒绝未登记字段、越权关联和模型给的账号或批准标志。
4. **逐项回执（AG06-4）。** 用户说了先后（AE-XL-008）就建 `dependsOn`，前项失败后项记 `skipped`，整批 `failed`；永久失败不重试（AE-XL-007 的 `fail_always`）；临时失败重试沿用同一操作键：Todo 靠 `task_mutations`，Memo 靠同键同编号的 `saveIfAbsent`，不产生第二条笔记。部分成功时回应不说「都完成了」。
5. **往来字段与不自动提取（AG06-5）。** `interaction.actualContactIds` 必须是 `contactIds` 的子集，由服务端校验；被提到的人（小陈 C21）可以在关联里，不能进实际往来。正文只写用户说过的话。抑制提取用一个持久在笔记上的标记，`noteOnPersisted` 和 `MEMO_RESCAN_SQL` 都要认它，执行器也不传 `onPersisted`。测试要用本来会触发提取的形状（meeting + usedForPlan + 一位联系人），否则测试是空过。执行器不写 `contact_detail_states` 和 `lastInteraction`，「最近互动」只从 AG05 的读取视图得出。

## 范围与文件

- **读取：** 上面的必读文件；AG02–AG05 REPORT 的交接段落。不做全库盘点。
- **修改（`repos/orbits`）：** `shared/contract/notes.ts`（可选 `interaction`，附录 E 的形状）；`features/notes/service.ts`、`note-record.ts`（接受并校验往来字段、持久抑制标记）；`app/api/notes/route-support.ts`、`features/contacts/memo-extraction/rescan.ts`（认抑制标记）；`features/agent/capabilities/contract.ts`、`registry.ts`、`features/agent/ledger/contract.ts`（登记两个新执行器）；`features/agent/runtime/domain-executors.ts`、`service-factory.ts`（接 Todo 与笔记服务）；`features/agent/runtime/service.ts`、`contract.ts`（只在 AG02 未交付时补依赖、跳过、永久失败）；`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`（AG01 建立；本 sprint 追加卡片预览里两类操作的形状）；AG03 的图与 AG05 的 `domains/registry.ts`（接入第二层与两个适配器）；断言执行器个数的既有测试。
- **同步：** `shared/` 有改动，同一提交里在 `repos/orbit-app` 执行 `npm run sync:contract`，只带同步脚本写出的 `src/api/contract`、`src/api/schema` 副本。
- **新建：** `features/agent-v1/propose/`（`OperationIntent` 结构与校验、第二层提示、`resolveIntents()`、`freezeCard()`）；`features/agent-v1/domains/todo/`（`update` 的 `prepare`、`applyApproved`）、`domains/memo/`（`create` 的 `prepare`、`applyApproved`），目录形状以 AG05 为准。测试：`tests/capabilities/agent-v1-propose.test.ts`、`agent-v1-todo-update-executor-postgres.test.ts`、`agent-v1-memo-create-executor-postgres.test.ts`、`agent-v1-receipts.test.ts`，`tests/api/notes-extraction-suppression.test.ts`。
- **排除：** 联系人、活动、日程的写入（AG12、AG13）；`todo.create`、删除、完成（SPRINTS 未列入本 sprint）；判断模型（AG08）；从笔记提取往来和跟进（AG10）；两端界面（AG07）；旧入口的自然语言提议与实体草稿；联系人详情的 `lastInteraction`；Todo 的多值关联字段本身（AG13）；`repos/orbit-app` 除同步副本外的任何文件。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
|---|---|---|
| AG06-1 | 小林那句话得到一答一卡两项：待办的计划日从 11 月 18 日改到 11 月 20 日，新增一条 11 月 15 日的来电往来。 | `agent-v1-propose.test.ts`（两项合成一张卡、总数句、带星期的日期、按 `asOf` 换算）；门槛 AE-XL-001、AE-XL-012、AE-SCL-009；日志里主模型调用 ≤4 |
| AG06-2 | 有两位小林时先选人；只有待办不明时先交付查询，只问要改哪一条。 | `agent-v1-propose.test.ts` 的消歧分支（同名人、待办两条、字段两解、零匹配不转新增）；门槛 AE-XL-002、003、004、009，AE-SCL-010、011、012 |
| AG06-3 | 点击前零写入；点击后数据的变化与卡上所列完全一致。 | `agent-v1-todo-update-executor-postgres.test.ts`（展示值未变而别的字段变了照常写；展示值变了零写入；多值关联保留；同键重放不重写）、`agent-v1-memo-create-executor-postgres.test.ts`；门槛 AE-XL-001、005、006 与 AE-SCL-009～012 的 `no_write_before_click`、`writes_exact` |
| AG06-4 | 一项成功一项失败时回执如实区分，已成功的不重做，依赖失败项的被跳过。 | `agent-v1-receipts.test.ts`（依赖跳过、永久失败不重试、临时失败同键重试不出第二条）；门槛 AE-XL-007、AE-XL-008 |
| AG06-5 | 新增往来后“最近互动”由读取得出，没有第三条业务记录；只被提到的人的最近互动不变。 | `notes-extraction-suppression.test.ts`（两条触发路都被抑制）、memo 执行器测试里的子集校验；门槛 AE-XL-010、011、012 的 `recent_interaction`、`no_auto_extraction` |

## 一次 Generator 的执行顺序

1. 复核进入条件；按 CONVENTIONS 第 4 节对照 AG00–AG05 REPORT 的名字，有出入追加更正；登记 run-01、本 PLANNER 的 SHA256、基线 HEAD、门槛用例与夹具的校验值（eval README 第 7 节）；建索引并做 impact。
2. 先写 AG06-3、4、5 的服务端失败测试（执行器、回执、抑制），再写 propose 层的失败测试。
3. 领域侧：笔记契约加往来字段与校验、抑制标记；两个适配器；三处登记与依赖接线；运行时补依赖与跳过（若 AG02 未交付）。`shared/` 改动当提交同步 App 副本并跑同步测试。
4. propose 层：`OperationIntent` 输出结构与修复一次的校验、`resolveIntents()`（授权检索 → 消歧 → 依赖成无环图 → 构造变更）、`freezeCard()`；接入 AG03 的图，结果文档写 `partResults` 与 `actionPreview`。
5. 收口：定向集、收口集、typecheck、一次全量对照；`npm run agent-eval:check`，再跑门槛与两次评审；按操作链路径限定提交，提交前 `detect-changes`。
6. 写 REPORT，交接分支与固定最终 SHA，由协调者合回。不启动第二轮 Generator。

## 最小测试与检查

- **档位：H。** 有业务写入、幂等、共享契约（`notes.ts`、`agent-v1.ts`）和付费模型调用；本地代码收口时做一次 I。H 档的一次代码审查由协调者另开 Claude 会话完成（Codex 已停用），意见交回本 Generator 修。
- **开发定向集（cwd `repos/orbits`）：** 上面五个新测试；`tests/api/notes-routes.test.ts`、`tests/api/tasks-routes.test.ts`、`tests/capabilities/memo-extraction-job.test.ts`、`tests/capabilities/agent-capability-registry.test.ts`、`tests/capabilities/agent-runtime-evolution.test.ts`。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`，`ORBIT_EVENT_DATABASE_URL` 指向本机测试库，REPORT 证明没有被 skip。
- **操作链收口集：** 以上完整文件，加抑制标记的实际消费者 `tests/api/contact-memo-patch.test.ts`、`tests/capabilities/r20b-memo-plan-local-e2e-postgres.test.ts`、`tests/services/network-snapshot-maintenance-postgres.test.ts`；`npx tsc --noEmit -p .`。App 端（cwd `repos/orbit-app`）：`npm run sync:contract` 后跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`，契约加了字段，再跑一次 `npm run typecheck`。
- **全量对照（I）：** 按 RULES 5.2 跑两次 `npm test` 比失败清单，只查新增项；不 source `.env`。stash 栈各 worktree 共用，只能 `git stash push -u -m <唯一标签> -- <本 sprint 路径>`，按 SHA `apply`，用完按标签找回再 drop。
- **门槛：** `npm run agent-eval:run -- --gate AG06`，含 XL 区 12 例、SCL 的 AE-SCL-009～012，以及不变量包（可见用例里 `invariant: true` 的那些）。不变量包若含后续 sprint 才有能力的用例，按 AG00 REPORT 的选取口径执行并在 REPORT 写明。失败后修复并整套重跑，最多两个修复轮次。
- **评审：** `npm run agent-eval:judge-pack -- --run <运行编号>`，每例由两个互不相见的新 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 的结果登记进 `eval/RUNS.md`。
- **费用：** 真实调用每次完整运行 ≤30 元、本 sprint 累计 ≤150 元（含开发时单跑的用例）；超出先停下报告。REPORT 记次数、token、金额与 DeepSeek 余额差。
- **证据位置：** `~/orbit-sprint-evidence/agent-design/sprint-AG06/run-01/`（命令输出、退出码）；评测日志 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行：** 封存集（不打开 `cases/sealed/`）；`--all`（AG18）；真实联网（门槛要求零联网）；浏览器与原生验证（无界面改动）；App 全量（只有同步副本变化）。

## 失败与交接

外部条件缺失先不启动；run 已开始则按 RULES 产出 failed 或 blocked 报告。只承接具体前序结果，不自动重跑整个 sprint。
报告包含验收映射、功能 SHA、文件与理由、命令与退出码、门槛运行编号与 `RUNS.md` 行、未提交与失败项、费用与下一步。分支从 `orbit-agent-claude` 建 `sprint/AG06-kobayashi-slice`，路径限定提交，禁止 `git add .`；由协调者用 `--no-ff` 合回 `orbit-agent-claude`，在合并树上跑受影响测试和 typecheck 并记录合并 SHA 后，登记表才写 completed。push 需要用户另行授权。

## 启动核对（Generator run-01，2026-11-16，追加；上文原样保留）

- 本页开工时 SHA-256 `784f1130904de137d9c5ff01c035e26a95da445ac53598845fca03152c73bb72`；基线 HEAD `be10e575c`（AG05 已合回，含协调者新增的 ja/en 用例与两条回答语言用例）。run-01。
- 进入条件：AG04、AG05 completed 并已合回；评测环境 `agent-eval:env -- --build` 自检通过。
- 与前序 REPORT 对照的更正：
  1. **AG02 的“依赖、跳过、永久失败不重试”**：AG02 只交付了 `dependsOn` 在出队和“放弃”里的生效，卡上没有依赖，失败一律重试到 5 次。本 sprint 在 `features/agent/runtime/` 补上：卡上依赖、永久失败立即停止并跳过依赖项、等前置的项在同一次处理里再跑一轮。
  2. **CONVENTIONS §4 写“Memo 含新建和修改”**，本页、SPRINTS 与 GOAL 只列 `memo.create`。门槛没有 Memo 修改的用例；本 sprint 只做新建，修改记为待协调者定（REPORT）。
  3. **`--seed-cards` 停用**（CONVENTIONS §3、§8）：门槛不带它，BND ×12 以完整对话出卡。
  4. **协调者交代的五项**（brief）：去掉 `propose_write` 的“这一版还不能出确认卡”；AE-BND-008 打字同意由代码答；AE-BND-002 证明批准标志进不了卡和账本；Memo 往来字段的子集校验复用 `readNoteInteraction()`；回答语言由第一层报告、代码按原文核对。
- 门槛：`npm run agent-eval:run -- --gate AG06`（不带 `--seed-cards`），XL ×12、SCL-009/011、BND ×12、UND-015/016 及不变量包；AG03、AG04、AG05 门槛各复跑一次。
- GitNexus：`npx -y gitnexus@latest analyze --index-only --force` 重建成功；`impact`、`detect-changes` 用 `npx -y gitnexus@latest`（worktree 里的 `.gitnexus/run.cjs` 版本旧，读不了新索引）。
