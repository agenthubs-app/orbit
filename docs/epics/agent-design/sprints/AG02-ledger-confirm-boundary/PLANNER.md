# Sprint AG02 — 账本升级与确认边界

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R02（确认卡与动作账本：一次点击批准一批，过期、版本、待核对）；AG-R20 的账本部分（`requestId → actionId/revision → operationId → receipt` 可追）。
**单一目标:** 账本记录新增 `origin`、`revision` 与各版载荷、`expiresAt`，哈希换成覆盖卡上可见内容的 SHA‑256；`decideAction()` 只接按钮决定（`actionId, revision, payloadHash, decision, clientDecisionId`，待核对项另带 `operationId`），批准与出队在一个事务里做条件更新；过期、已否决、已取消和旧版本的点击零写入并返回最新状态；结果未知的项进待核对，重试、标为已完成、放弃各留回执；新入口上关闭 Todo 直写和实体草稿的文字确认，卡只经账本产生。不新增领域执行器。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，开工时填实际 HEAD（编制时 `324943ad5`）；前序 `sprints/AG01-entry-queue-result/REPORT.md`（及其引用的 AG00 REPORT 交接节）。
**进入条件:**
1. AG01 completed 并已合回 `orbit-agent-claude`；新入口、结果文档与 `ORBIT_AGENT_V1_MODE` 的名字与 AG01 REPORT 核对一致。
2. 设计稿 §5.1、§5.2、附录 D 与「2026-11-15 已定的事项」即产品批准。
3. **需要协调者先裁决的两件事**（未裁决不启动，裁决写进 CONVENTIONS 并在本页追加记录）：
   - **BND 用例要的卡，现有通路出不了。** 现有运行时能提议的写入只有 5 种（`features/agent/natural-language-actions/contract.ts:7–13`），没有改待办；登记的 11 种执行器（`features/agent/capabilities/contract.ts:63–75`）里也没有。AE-BND-001、005、006 要一张 `todo.update` 卡。新建待办的提议只带 `title` 和 `dueAt`（contract.ts:23–29、`gemini-provider.ts:802`），执行时写入的也只有这两个字段（`features/followups/action-writer.ts:30–66`）；而 AE-BND-002、003、004、007、008、010、011、012 核对的是 `plannedDate`。可选做法：甲，允许本 sprint 给现有的新建待办加可选 `plannedDate`（提议解析、提示词一行、写入字段），并加一种只提议不执行的 `todo.update` 卡。这两处都要改提示词，而提示词是新旧入口共用的。乙，把受影响的用例按 `eval/CHANGES.md` 的规矩调整，或者移到 AG06 的门槛。
   - **不变量包怎样计入门槛。** 从本 sprint 起门槛要跑不变量包，但包里有属于更后面 sprint 的用例（例如 AE-WEB-003 属 AG09、AE-MCP-001 属 AG17），它们的功能性判定现在不可能通过。AG00 的运行器会把结论分成“四类不变量判定”和“其余判定”两栏，由协调者定按哪一栏计。
4. 付费模型调用按 EPIC 的上限执行（每次完整运行 30 元以内，累计 150 元以内）；AG00 的评测环境与 `DEEPSEEK_API_KEY` 就绪。
5. 只改服务端，不需要视觉稿；两端的确认卡在 AG07。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbits/features/agent/runtime/contract.ts`：十种卡状态（:24–35）；`AgentActionOperationPayload`（:124–134）；`AgentActionRecord`（:136–169，`immutablePayloadHash`，`conversationId?` 可选）；`AgentExecutionReceipt.status` 只有 `completed | failed | undone`（:193–206）。
- `features/agent/runtime/service.ts`：`immutablePayloadFor`（:171–186，哈希只含执行字段、不含预览文字）；`proposeAction`（:540–563）；`approveAction`（:564–649，已批准时按选择比对后直接返回，否则生成出队事件再调 `approveActionWithOutbox`）；`rejectAction`、`cancelAction`、`retryAction`（:661–730）。
- `features/agent/runtime/repository.ts`：`AgentRuntimeRepository` 接口（:92–127）；内存版 `approveActionWithOutbox`（:176–183）。
- `features/agent/storage/agent-runtime-live-record-provider.ts`：`save()` 用 `upsertRecord` 并取 `new Date()`（:265–279）；线上版 `approveActionWithOutbox` 先逐条写出队事件、再写卡（:437–453），不在一个事务里；`claimReadyOutbox` 用 `for update skip locked`（:466–543）。
- `features/agent/runtime/hash.ts`：`stablePayloadHash` 是 32 位 FNV‑1a。它还被用来生成编号：`natural-language-actions/service.ts:37`、`automations/runner.ts:304`、`orbit-ai/workflows/id.ts:1`。
- `features/agent/runtime/action-queue-worker.ts`、`executor-registry.ts`、`domain-executors.ts`（新建待办的执行器 :64–91，任务编号由操作键决定：`task:agent:${idempotencyKey}`）。
- `app/api/agent/ledger/[id]/transition/route.ts`：请求体只读 `actorLabel, draftUpdates, selectedOperationIds, transition`（:73–88）；本机确认后当场处理出队（:119–124）。`features/agent/ledger/contract.ts`：`AGENT_LEDGER_TRANSITIONS`（:58–65）、`AgentLedgerTransitionInput`（:189–196）；`features/agent/ledger/runtime-adapter.ts:255` 起的 `applyTransition`。
- `features/orbit-ai/task-interaction-service.ts`：把 `followups.createTask` 从提议里摘掉（:31–41），对明确的命令直接 `taskService.create`（:127–162），这就是要关的直写。
- `features/orbit-ai/entity-drafts/`：`readEntityDraftIntent`（`contract.ts:164`）把“确认”读成批准；`app/api/ai/conversations/route.ts:579–615` 据此直接 `service.confirm`，这就是要关的文字确认。route.ts:536–541 的注释写明现有运行时的 `activeConversationId` 是常量。
- `features/agent/natural-language-actions/service.ts`：`propose`（:198 起）一项提议一张卡，操作键 `${actionId}:v1`（:284）。
- `shared/storage/transactional-postgres.ts`（`createConfiguredTransactionalPostgresRuntime`，:118）与 `shared/storage/live-record-store.ts:134`（`updateRecordIfCurrent`）：事务与条件更新的现成接口。
- `repos/orbit-app/src/api/agent-ledger-contract.ts`：App 手写的卡状态（:7–18，没有 `expired`）和逐项状态（:49）；`src/view-models/agent-ledger.ts` 是它的消费者。本 sprint 不改 App。
- 设计稿 §5.1、§5.2、附录 D（卡状态、逐项回执、错误与 `reason`、决定接口对应路由）、附录 E 的“动作账本”一行；`eval/cases/BND.yaml`（12 例，约定一到三，增量 `card-canceled`）。

### 关键符号
本 worktree 原本没有 GitNexus 索引；按 AG00 REPORT 确认索引已建，否则先建，再对每个要改的符号做 upstream impact（CONVENTIONS §5）。调用方数是编制时的文本搜索（含定义文件）。
- `async approveAction(input) {`（`service.ts:564`；接口 `approveAction: (input: {` 在 :68）：20 个文件，其中测试 13 个。
- `approveActionWithOutbox: (`（`repository.ts:105`，参数 `action: AgentActionRecord, events: readonly AgentOutboxEvent[]`，返回 `Promise<void>`）：3 个文件，测试直接引用 0 个。
- `export function createStorageAgentRuntimeRepository({`（`agent-runtime-live-record-provider.ts:258`）：13 个文件，其中测试 11 个。
- `export function stablePayloadHash(value: unknown): string {`（`hash.ts:17`）：5 个文件；只新增 SHA‑256 函数，不改它。
- `export function createAgentRuntimeService({`（`service.ts:227`）：16 个文件，其中测试 14 个。
- `export function createAgentExecutorRegistry(`（`executor-registry.ts:69`）：16 个文件，其中测试 14 个。
- `export async function processAgentActionQueueWake(`（`action-queue-worker.ts:19`）：4 个文件，其中测试 2 个。
- `export async function POST(`（`app/api/agent/ledger/[id]/transition/route.ts:90`）：由 `tests/api/agent-action-ledger-routes.test.ts` 引用。
- `export function createOrbitAiTaskInteractionService(input: {`（`task-interaction-service.ts:55`）；工厂 `createConfiguredOrbitAiTaskInteractionService` 6 个文件。
- `export function readEntityDraftIntent(message: string): EntityDraftIntent | null {`（`entity-drafts/contract.ts:164`）：5 个文件。
- `export function createAgentNaturalLanguageActionProposalService(input: {`（`natural-language-actions/service.ts:191`）：7 个文件，其中测试 5 个。

### 前序交接要点
以下是约定的名字，开工时按 AG00、AG01 的 REPORT 核对；不一致就按 REPORT 更新本节并留追加记录。
- AG00：`agent-eval:*` 命令；`emitTrace(event)`；运行器支持 `click`、`resend`（点击时沿用同一 `clientDecisionId`）、`external_change`、`advance_clock`、`fault`（`where: model`）；不变量包两栏结论。
- AG01：`features/agent-v1/entry/` 的 `acceptMessage()`、`getRequestResult()`、`cancelCurrentRun()`；契约 `AgentRequestStatus`、`AgentResultDocument`（含 `actionPreview` 字段）、`AgentPartResult`；协议版本 3；`ORBIT_AGENT_V1_MODE`。新入口目前丢弃全部写入提议，本 sprint 把它接到账本上。

### 易错边界（都对应到下方验收项）
1. **一份批准、一次效果**（AG02-1）：批准与出队在同一个 Postgres 事务里，卡用条件更新（按当前 `revision` 与状态），后到的点击读到先到的结果，不报失败。决定记录按 `clientDecisionId` 唯一，同一键重发返回第一次的结果并标 `replayed`。
2. **只认按钮**（AG02-2）：新入口不调用 `applyTaskInteraction` 与 `applyEntityDraft`。明确的新建待办命令和 task 类实体草稿都转成账本里的卡，不直写，也不建草稿；其他类实体草稿本 sprint 不出卡，由代码给一句固定说明。卡未决时收到“好的”“确认”这类文字，可以用 `readEntityDraftIntent` 识别，但只用来附一句代码写死的提醒（点卡上的按钮），绝不据此批准。模型输出里的批准标志、账号编号一律剥掉，并发一条拒收事件；卡的归属只认服务端认证结果。
3. **按卡上看过的内容核对**（AG02-3）：每项操作冻结 `before`、用来认出对象的名称和对象是否存在；点击时任何一项变了，返回 `CONFLICT`／`CARD_CONTENT_CHANGED`，按当前数据出 `revision+1` 和新差异，不执行。决定带的 `revision` 或 `payloadHash` 与当前版不符，返回 `CARD_REVISION_CHANGED` 并带最新卡。旧版载荷保留。哈希用新的 SHA‑256 函数，覆盖顺序、变更、目标、依赖、版本和全部可见文字；`stablePayloadHash` 不动，否则现有编号会变。
4. **关了的卡零写入**（AG02-4）：对话卡的 `expiresAt` 是 7 天；AG15 之前没有定时器，过期在决定和读取时按 `expiresAt` 判出，返回 `CARD_EXPIRED`；已否决、已取消返回 `CARD_CLOSED`。重新生成沿用原操作意图，按当前数据出新版本并重置有效期，仍是 `awaiting_confirmation`。它不是决定，在 REPORT 写明用的是哪个接口。
5. **待核对**（AG02-5）：执行器报“结果未知”时不自动重试，逐项回执记 `needs_review`。处理只走决定接口并带 `operationId`：重试回到 `pending`，沿用原操作键（新建待办靠同一任务编号去重）；标为已完成记 `user_confirmed`，不调执行器，依赖项照常继续；放弃记 `abandoned`，依赖项跳过。故障注入点只在 `ORBIT_AGENT_EVAL=1` 时装上，`VERCEL_ENV=production` 时拒绝启动。
6. **旧卡与旧端**（AG02-1、AG02-3）：带 `origin` 的新卡只接带 `revision`、`payloadHash`、`clientDecisionId` 的决定，旧形状的请求被拒，旧接口不能绕过新门；没有 `origin` 的旧卡保持现有行为，兼容在 AG18。卡的 `origin.conversationId` 用会话编号和 `requestId`，不用那个常量。App 不认识 `expired` 和三种新回执：先查 `src/view-models/agent-ledger.ts` 遇到未知值会不会出错，会出错就停下报告，不改 App。
7. **外部修改不算被测写入**（AG02-3）：`external_change` 由运行器经产品正常的更新接口完成，从 `no_business_writes` 与 `writes_exact` 里排除（BND 约定一）。

## 范围与文件

- 读取：上面的必读文件；AG00、AG01 REPORT 的交接节。
- 修改：`features/agent/runtime/contract.ts`（`expired`；`origin`、`revision`、各版载荷、`expiresAt`；每项的 `partId`、`targetRef`、`before`、`after`、`preconditions`、`dependsOn`、`effects`；三种新回执，附录 E）；`service.ts`、`repository.ts`、`hash.ts`（只加 SHA‑256 函数）；`features/agent/storage/agent-runtime-live-record-provider.ts`（事务内的批准与出队、决定记录）；`executor-registry.ts` 或 `service.ts` 中处理“结果未知”的位置；`features/agent/ledger/contract.ts`、`runtime-adapter.ts`、`app/api/agent/ledger/[id]/transition/route.ts`（新字段与 `mark_done`、`abandon`）；`features/agent-v1/entry/` 的处理（接账本、关两条绕过、拒收批准标志、文字提醒、结果文档的 `actionPreview`）；`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（`actionPreview` 的新字段，只增）；`tests/agent-eval/`（`click.revision`、`fault.applied`、`inject_approval_flag`、`review`、`regenerate`、夹具里的 `cards` 及 BND 用到的判定）。按协调者裁决，可能还有 `natural-language-actions/contract.ts`、`gemini-provider.ts`、`features/followups/action-writer.ts`。
- 新建：`features/agent/runtime/decision.ts`（`decideAction()`，文件名可调，导出名照 CONVENTIONS §4）；测试 `tests/services/agent-ledger-decision.test.ts`、`tests/services/agent-ledger-decision-postgres.test.ts`、`tests/services/agent-ledger-review.test.ts`、`tests/services/agent-v1-entry-confirm-boundary.test.ts`、`tests/api/agent-ledger-decision-route.test.ts`。
- 排除：新的领域执行器（AG06 起）；一次性定时器（AG15）；两端确认卡界面（AG07）；旧入口（协议 2）上的直写与文字确认，本 sprint 只关新入口；旧卡迁移与旧客户端兼容（AG18）；App 代码。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| AG02-1 | 两端同时点确认，只有一份批准，每项最多一次业务效果。 | 门槛 AE-BND-003、AE-BND-004；`tests/services/agent-ledger-decision-postgres.test.ts`（本机测试库：两个不同 `clientDecisionId` 并发确认，只有一份批准、一组出队记录；事务中途失败时两者都不存在）；`tests/services/agent-ledger-decision.test.ts`（同一 `clientDecisionId` 重发返回第一次结果并标 `replayed`；旧形状请求点新卡被拒）。 |
| AG02-2 | 输入“好的”“确认”不会执行任何卡；模型给出的批准标志被拒收。 | 门槛 AE-BND-001、AE-BND-002、AE-BND-008；`tests/services/agent-v1-entry-confirm-boundary.test.ts`（新入口上直写与草稿确认的调用次数为 0；“确认”“好的”只附固定提醒、决定数为 0；带 `approved`／账号编号的模型输出被剥掉并留拒收事件；新建待办命令出的是账本卡）。 |
| AG02-3 | 卡片内容或目标数据变了，旧版本的点击返回最新状态并出新差异，不执行旧内容。 | 门槛 AE-BND-005、AE-BND-006；`tests/services/agent-ledger-decision.test.ts`（要改字段的原值变了、名称变了、对象没了，各返回 `CARD_CONTENT_CHANGED` 与 `revision+1`；旧 `revision` 或哈希返回 `CARD_REVISION_CHANGED` 与最新卡；改动预览文字会改变 SHA‑256 哈希）。 |
| AG02-4 | 过期、已否决、已取消的卡点击后零写入；重新生成得到新版本。 | 门槛 AE-BND-007、AE-BND-008、AE-BND-009；`tests/api/agent-ledger-decision-route.test.ts`（固定时钟推过 7 天返回 `CARD_EXPIRED`；已否决、已取消返回 `CARD_CLOSED`；三种情况业务记录与出队都不变；重新生成后 `revision` 为 2，状态为 `awaiting_confirmation`）。 |
| AG02-5 | 执行结果未知的项进入待核对，重试、标为已完成、放弃各留回执，重试不产生第二条记录。 | 门槛 AE-BND-010、AE-BND-011、AE-BND-012；`tests/services/agent-ledger-review.test.ts`（结果未知记 `needs_review` 且不自动重试；重试沿用原操作键、任务只有一条；标为已完成记 `user_confirmed`、执行器调用数 0；放弃记 `abandoned`、依赖项 `skipped`）。 |

## 一次 Generator 的执行顺序

1. 复核进入条件与两项裁决，按 AG00、AG01 REPORT 核对交接名；登记 run-01、PLANNER SHA256 与 HEAD；从 `orbit-agent-claude` 建 `sprint/AG02-ledger-confirm-boundary`；动手前跑 `npm test` 存失败清单。
2. 对上表关键符号做 upstream impact，HIGH／CRITICAL 先报告；先改账本契约与 SHA‑256 函数，跑契约快照和 App 同步。
3. AG02-1、AG02-3、AG02-4：先写失败测试，再实现 `decideAction()`、事务内批准与出队、版本与内容核对、过期与关闭、重新生成，接上决定接口。
4. AG02-5：结果未知、待核对与三种处理及回执。
5. AG02-2：新入口接账本、关两条绕过、拒收批准标志；运行器补 BND 的步骤与判定；收口集与 typecheck；`--gate AG02`、两个新会话评审、汇总登记；全量对照。
6. `detect-changes --scope staged`；按操作链路径限定提交；写 REPORT 交接。

## 最小测试与检查

- **档位 H**：权限、写入、幂等、并发和共享契约都变了。收口跑一次全量对照。
- **开发定向集**（cwd `repos/orbits`）：上表新增的五个测试文件。
- **操作链收口集**：`tests/api/agent-action-ledger-routes.test.ts`、`tests/services/agent-action-queue-worker.test.ts`、`agent-worker-recovery.test.ts`、`agent-worker-postgres-recovery.test.ts`、`agent-ledger-paging.test.ts`、`agent-ledger-paging-postgres.test.ts`、`tests/capabilities/agent-ledger-cross-request.test.ts`、`agent-natural-language-actions.test.ts`、`agent-runtime-evolution.test.ts`、`agent-action-ledger-contract.test.ts`、`tests/api/orbit-ai-task-authorization.test.ts`、`tests/services/orbit-ai-task-interaction.test.ts`、`tests/api/entity-draft-routes.test.ts`、`tests/services/entity-draft-service.test.ts`、AG01 的 `tests/services/agent-v1-entry-*.test.ts`、`tests/agent-eval/*.test.ts`；`npx tsc --noEmit -p .`；`node scripts/contract-snapshot.mjs`。
- **契约同步**（改了 `shared/` 时）：cwd `repos/orbit-app` 执行 `npm run sync:contract`，跑四个同步测试，再 `npx tsc --noEmit`；除同步写出的副本外不改 App。
- **全量对照**：第 1 步的失败清单与收口时的 `npm test` 用 `comm -13` 比较，只查新增项；不 source `.env` 系列文件。
- **门槛命令**：`npm run agent-eval:run -- --gate AG02`，含 BND 区 12 例（全部标了不变量）和不变量包（可见用例里全部 `invariant: true`），按协调者对不变量包的裁决计入。登记表没有给 AG02 分 SCL 用例。
- **评审**：每例由两个互不相见的 Claude 会话各评一次，不一致做第三次并列入人工复核清单。
- **费用**：每次完整运行不超过 30 元，本 sprint 累计不超过 150 元；超出先停下报告。
- **证据位置**：`~/orbit-sprint-evidence/agent-design/sprint-AG02/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：`--sealed`；浏览器验证（页面不变，RULES 0.1 不适用）；App 端除同步测试和 typecheck 以外的测试。

## 失败与交接

外部条件缺失（AG01 未合回、两项裁决未定、评测环境或密钥不可用）先不启动；run 已开始则按规则产出 failed／blocked 报告。门槛不过时最多两个修复轮次，每轮把门槛整套重跑，每次运行都登记。
REPORT 包含：验收项对应的提交 SHA、文件与证据；命令与退出码；全量对照新增失败；门槛运行编号、`bundle.sha256`、真实调用次数、token 与费用；两项裁决的落实方式；重新生成用的接口；App 对新状态的实测表现；交给 AG03 起各 sprint 的账本字段与 `decideAction()` 签名。分支 `sprint/AG02-ledger-confirm-boundary`，固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树上跑收口集、typecheck 与 App 四个同步测试后才标 completed。push 需要用户另行授权。

## 追加记录（run-01，2026-11-15，Generator）

开工时本页 SHA-256 `66e6ca6e5901568811f7adba7565210b04ae927ac5b7625311ae67f027892b25`，基线 HEAD `1a97ce231`。原文不改，以下按 CONVENTIONS §4、§8 与 AG00、AG01 REPORT 核对后补记：

1. **进入条件 3 的两项裁决已由 CONVENTIONS §8 给出**：门槛用 `--seed-cards` 预置卡片，AG02 交付待办的新建（`todo.create`）和修改（`todo.update`）两个执行器，甲、乙两个方案都不用，提示词不改；不变量包只含顺延之后归属不晚于 AG02 的不变量用例（BND ×12 与 AE-H-002、003、004）。
2. **App 端**：CONVENTIONS §4 的 AG02 交接写明「状态 expired（App 端账本契约同步）」，与本页「本 sprint 不改 App」不一致，按 CONVENTIONS 执行：`repos/orbit-app/src/api/agent-ledger-contract.ts` 与 `src/view-models/agent-ledger.ts` 认识 `expired` 和三种新回执。改之前 App 遇到 `expired` 时 `allowedTransitions` 返回 undefined，状态文字为空。
3. **前序交接要点**与 AG00、AG01 REPORT 一致。补一条：运行器原先从账本行的 `payload` 顶层读卡片状态，而账本把动作放在 `payload.entity` 下，AG02 一并改正。
