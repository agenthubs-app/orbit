# Sprint AG18 — 兼容、影子运行与放量

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R18（设计稿 §8 过渡表与实施顺序第 5 步、§7「旧回答与撤权」和旧客户端、§9「发布判据」）；AG-R19 的封存集收口；EPIC「怎样算完成」。
**单一目标:** 新入口打开后旧版客户端照常可用，局部更新或整条提交都不冲掉新字段；交付只补缺的回填脚本、按账号分组的只读影子运行与分歧报告、回退开关与上线手册；在本机隔离环境里跑全部可见用例、封存集、回退演练和影子对比，并出与 AG00 基线的费用和延迟对比报告。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`；编制时 HEAD `324943ad5`，Generator 启动时填实际 HEAD、AG00～AG17 各 REPORT 的固定 SHA 和 AG00 基线的运行编号。未启动不填 run。
**进入条件:**
1. AG00～AG17 全部 completed 并已合回 `orbit-agent-claude`（SPRINTS.md 依赖「全部」）；AG17 的两项人工联调若仍 blocked，本 sprint 可启动，但 EPIC 收口要等它补齐。RUNS.md 里有 AG00 的基线运行。
2. 设计稿「2026-11-15 已定的事项」即产品批准，其中「发布门槛：封存集至少 27/30，确定性不变量零违规」就是 AG18-4 的标准。
3. 付费模型调用已允许。本 sprint 至少要跑一次 `--all`（222 例）、一次 `--sealed`（30 例）、门槛和影子对比，影子运行会让同一条消息多调一遍模型。开工前按 AG00 基线的 `costs.json` 估算全程费用；超过每 sprint 150 元时先停下，请用户另定上限再跑。
4. 环境：AG00 的本机评测环境（`orbit_agent_eval`、端口 3100、对外只放行 DeepSeek 与 Gemini）自检通过；跨端检查另需 iOS Simulator 和 Web 本地生产构建（App RULES 5.4）。
5. 界面：本 sprint 不新增界面。回退后卡上的说明沿用 AG07 已有的状态和文字；确实需要新的可见状态时先出视觉稿，批准前只用服务端回执文字。
6. 授权边界：回填、演练、影子运行只对本机库。合并进 `chat-agent`、在正式库执行迁移或回填、部署、push 都不在本 sprint，须用户明确决定（EPIC 规矩第 3 条：何时并入 `chat-agent` 由用户在 epic 收口时决定）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§8 过渡表的「入口与传输」「写入口与卡片」「业务数据」三行与实施顺序第 5 步（先部署能读新旧字段的版本 → 只在新字段缺失时回填 → 旧端局部更新保护多值 → 按账号分组只读影子运行、通过两端业务验收后再开写 → 回退）；§7 末尾「未知版本的旧客户端只展示可读内容并引导到兼容的确认端」与「旧回答与撤权」；§9「发布判据」；§4「版本与既有调用方」；附录 E 的 Todo、动作账本两行。
- `docs/epics/agent-design/EPIC.md`「怎样算完成」五条；`eval/cases/CMP.yaml` 五例及其新词 `client: app_old`、`legacy_update`、`settings.shadow`、`rollback`、`shadow_report`，故障位置 `where: shadow`；`eval/README.md` §5（双评）、§6、§8（封存集）、§13。
- `repos/orbits/app/api/ai/conversations/route.ts`：`POST` 里 `body.protocolVersion === 2` 走可靠发送（未跑完回 202，:859-868），不带版本的直接 `executeConversation()`；两条都经 :749-769 的 `persistNaturalLanguageActionProposals(applyEntityDraft(applyTaskInteraction(service.sendMessage(…))))`。`applyTaskInteraction`（:481）直写 Todo 并回“已创建待办”，`applyEntityDraft`（:529，注释 :522-528）读打字的“确认”。AG01 加协议版本 3，AG02 只在新入口上关掉这两处。
- `repos/orbits/app/api/ai/entity-drafts/handler.ts` 与 `[id]/route.ts`：旧版 App 实体草稿卡的确认 `action: "confirm"` 调 `service.confirm` 直接写，不经账本。
- `repos/orbits/app/api/agent/actions/[id]/accept/route.ts`（`dismiss` 同目录）：旧版 App 待办页用空请求体接受动作（`repos/orbit-app/src/screens/todo/todo-actions.ts:55`），并用 `{ transition: "defer" }` 调账本 transition（:70）；两处都不带版本和哈希。
- `repos/orbits/app/api/tasks/[id]/handler.ts`：`PATCH` 的 `action: "update"` 只收 `patchKeys`（单值 `relatedContactId`、`relatedEventId`），多余键被拒。`features/tasks/service.ts:403-458` 先铺存储里的记录再铺补丁，没写的字段保留，`null` 只清计划日、截止、地点、计划关联。App 端 `src/screens/tasks/TaskDetailScreen.tsx:329-335` 只提交标题和备注，离线队列 `src/data/sync/task-outbox-mutation.ts` 原样重放同一请求体。
- `repos/orbits/app/api/notes/[id]/handler.ts:42`：笔记 `PATCH` 收 `eventIds`（只放平台活动）、`contactIds`；新字段 `eventRefs`、`interaction` 要在旧端提交后保留。
- `repos/orbits/app/api/ai/conversations/sessions/[id]/handler.ts:260-274`：按 `requestId` 读发送记录，旧端读历史和结果走这里，§7 的撤权规则要覆盖它。
- `repos/orbits/features/agent/runtime/action-queue-worker.ts`（`processAgentActionQueueWake` → `processOutbox`）与 `repository.ts:105`（`approveActionWithOutbox`）：回退时暂停执行的位置。
- `repos/orbits/scripts/backfill-owners.ts` 与 `features/sync/owner-backfill.ts`：回填脚本的既有写法——默认只读试算、`--preview`、`--apply` 只写本机、远程要 `--confirm-remote=<host>/<database>`、重跑改 0 行、npm 名 `db:backfill:*`。`scripts/assert-local-test-databases.mjs`。
- `repos/orbit-app/tests/contract-sync.test.ts` 及同目录 `api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`：副本逐字一致的检查。现有 App 用 `protocolVersion: 2` 发消息（`src/screens/ai/AiConversationScreen.tsx`），这就是 `app_old` 要模拟的行为。
- 任务里点名的 `docs/superpowers/specs/2026-09-30-staging-production-release-design.md` 在本 worktree 不存在。现有的上线文档只有 `repos/orbits/docs/sprints/W0019-release-checklist/RELEASE-CHECKLIST.md`（发布门、迁移须用户授权的写法），上线手册参照它的格式。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 启动时先按根目录 `CLAUDE.md` 建索引，对每个要改的符号跑 upstream impact（CONVENTIONS §5）；建不起来就用文本搜索补查并写进 REPORT。数字是 2026-11-15 文本搜索命中的文件数，含定义所在文件。
- `export async function POST(request: Request): Promise<Response> {`（`conversations/route.ts`）：发消息总入口，9 个测试文件直接引用该路由。按 CRITICAL 对待。
- `async function applyTaskInteraction(`、`async function applyEntityDraft(`、`async function persistNaturalLanguageActionProposals(`：模块内私有，只在 :749-769 一处串联调用。
- `export function createReliableOrbitAgentSendService(dependencies: {`：6 个文件。
- `export function createEntityDraftRouteHandlers(`：4 个文件。
- `TaskService.update`：`update: (input: { actorId: string; taskId: string; expectedUpdatedAt: string; patch: TaskUpdatePatch; idempotencyKey: string; now: string; }) => Promise<TaskMutationResult>;`；`createTaskService(` 35 个文件，`createTaskDetailHandlers(` 8 个文件。
- `export async function processAgentActionQueueWake(`：4 个文件。`approveActionWithOutbox: (action: AgentActionRecord, events: readonly AgentOutboxEvent[],) => Promise<void>;`：3 个文件。
- `export function assertOwnerBackfillTarget(input: { connectionString: string; target: "local" | "cloud"; apply: boolean; confirmRemote?: string | null }): { host: string; database: string; remote: boolean } {`：3 个文件，只作写法参照。
- 约定名，代码里还没有：AG01 `acceptMessage()`、`getRequestResult()`、`ORBIT_AGENT_V1_MODE`；AG02 `decideAction()`；AG17 的 `propose_change`。

### 前序交接要点（CONVENTIONS §4 的约定名，启动时按各 REPORT 核对，有出入追加更正）
- AG00：评测命令与 `--all`、`--sealed`；基线运行（AG00-5）及其 `costs.json`、逐事件耗时。
- AG01：协议版本 3、`acceptMessage()`、`getRequestResult()`、`ORBIT_AGENT_V1_MODE` 的 `off`／`shadow`／`on`。
- AG02：`origin`、`revision`、`expiresAt`、`decideAction()`、待核对三种处理；新入口上直写和文字确认已关。旧决定路由（上面的 accept、transition）是否已改走 `decideAction()`，以 AG02 REPORT 为准。
- AG07：两端确认卡；离线与未同步规则。AG13：Todo 的 `relatedContactIds`、`relatedEventRefs`，AG13-5 已覆盖旧端只改标题；`legacy_update` 是否已在运行器里，以 AG13 REPORT 为准。
- AG14：记忆字段的迁移（本 sprint 不重做）。AG15：一次性定时器与定时规则出卡。AG17：`propose_change` 也是一个出卡入口。

### 易错边界（都对应到验收项）
1. **旧端绕不过新门（AG18-1、AG18-3）。** 新入口打开后，协议 2 和不带版本的两条旧路都不能再直写 Todo、不能因打字“确认”执行（AE-CMP-001 R3）；旧实体草稿的确认、旧的 accept 和 transition 不能批准用户没看过当前版本的内容。打开前留下的草稿保持可读，点确认时按当前数据重新核实、出一张新版账本卡，或说明要到新版确认，不直接写。
2. **旧端代为等待（AG18-1）。** 协议 2 的消息在新入口打开时交给新流程，服务端等结果文档完成，在同一次调用里按旧格式返回（AE-CMP-001 R1）；卡片变成一段可读的修改说明，加一句“到新版 App 或网页上确认”（R2）；旧端不认识的字段不放进去，以 `repos/orbit-app/src/api/contract/ai-sessions.ts` 的旧结构为准能解析。超时仍按现状回 202 加回执。
3. **局部更新与整条提交（AG18-1）。** 只改标题时多值关联原样保留，响应里旧端认得的单值字段仍是 C17（AE-CMP-002 R1）；旧端把它认得的整条记录交回来（单值 C17、没有数组）时，数组既不收窄成只剩 C17，也不被清空。整次拒收或收下但保住新字段两种做法都可以。同一规则用于 Memo 的 `eventRefs`、`interaction` 对旧的 `eventIds`，日程的 `eventRefs`，联系人的 `version`。
4. **旧回答与撤权（AG18-1）。** 旧端读历史时同样在线核对授权：已撤权或已删除的引用不返回正文和由它生成的摘要。离线旧端已读过的内容收不回，按 §7 在 REPORT 里列为已知限度。
5. **回填只补缺（AG18-1）。** 只在新字段缺失时把单值写成零或一项的数组，已有数组一概不动；默认只读试算，`--apply` 只写本机；重跑改 0 行；逐集合列出计数和无法处理的行；参会自述不从报名推断（§8 第 5 步）。
6. **影子只读（AG18-2）。** `ORBIT_AGENT_V1_MODE=shadow` 时用户拿到的是旧通路的回答；新通路对同一条消息只读地跑：不出卡、不入账本、不写收件箱和推送、不学记忆、不写业务数据。结果只进按工作区＋账号＋`requestId` 存的比较记录，每个账号只出现在自己的组里（AE-CMP-003）。影子在应答之后跑，不拖慢用户；它出错时用户这次照常 `completed`，回答里不提另一条通路（AE-CMP-004 R2），这次记一条带委托编号和出错原因的分歧（R3）。影子的模型调用按真实调用计费，单独一栏。
7. **分歧怎么算（AG18-2）。** 按结构比：是否出卡、卡上的操作、目标与值、引用了哪些记录、读了哪些记录（有无越界）、是否追问、哪边出错。措辞不同两边原文都存档，但不算分歧。报告按账号分组，每条分歧带委托编号和两边结果。
8. **回退不是回到旧路（AG18-3）。** CONVENTIONS §2 的开关只有 `off`／`shadow`／`on`；若 `off` 会恢复旧流程的直写和文字确认，回退就不能用 `off`。需要另设一个回退开关（或第四个取值），先登记进 CONVENTIONS §2 再实现，并在 REPORT 写明。回退时：聊天、定时规则、MCP `propose_change` 三个入口都不再出新卡（AE-CMP-005 全程两张卡）；点等确认的卡得到“这项修改现在没有执行”（R1）；执行队列暂停，已批准未执行的留在原地，不被领取；执行中结果未知的按 AG02 进待核对；已完成的回执照常可读（R4）；打字“确认”和明确的“新建待办”都不写入（R2、R3）。对账脚本逐条列出未执行的动作、它的批准记录和回执；恢复后沿用原操作键继续，没有重复效果；等确认的卡按 AG02 的核对规则重新核实后才可点。
9. **封存集不打开（AG18-4）。** Generator 不打开 `docs/epics/agent-design/eval/cases/sealed/`，也不打开封存用例运行目录里的用例原文、对话记录和评审材料；只执行 `--sealed`，只读 `agent-eval:report` 给出的分类汇总（每类通过数和没过的用例编号）。封存集在 `--all` 全过之后、在最终 SHA 上只跑一次；不足 27/30 时不针对它修补（修补就得读用例），如实结束并交用户决定。
10. **不变量（AG18-4）。** 越权读、未批准或重复写、跨账号记忆、已忘记的条目被再次使用，任何一例违规都阻止放量（§9），不论总通过数多少。
11. **对比口径（AG18-5）。** 与 AG00 基线比同一批用例：每次成功请求的费用（只算真实调用，影子和模拟另列）、查询／混合写入／记忆三类路径各自的 p50 和 p95（§7）、追问轮数、模型调用上限命中率。两次运行的用例集不同，只比交集并写明。

## 范围与文件

- 读取：上下文包所列；前序 REPORT 只读交接段，重点 AG00（基线运行编号）、AG01、AG02、AG13、AG17。
- 新建（`repos/orbits/` 下）：
  - `features/agent-v1/rollout/`：`legacy-client.ts`（旧两条路交给新流程、代为等待、卡变文字）、`field-preservation.ts`（各领域旧端提交的保留规则）、`shadow.ts` 与 `shadow-report.ts`、`rollback.ts`（回退开关、各入口拒收、队列暂停、对账清单）、`backfill.ts`。`rollout/` 不在 CONVENTIONS §1 的目录表里，先补登再建。
  - 脚本：`scripts/backfill-agent-v1-fields.ts`（npm `db:backfill:agent-v1`）、`scripts/agent-v1-shadow-report.ts`、`scripts/agent-v1-reconcile.ts`、`scripts/agent-eval/compare-baseline.ts`（npm `agent-eval:compare -- --run <编号> --baseline <编号>`）。
  - 上线手册 `docs/epics/agent-design/sprints/AG18-compat-shadow-rollout/ROLLOUT.md`：五步顺序、每步的检查和回退开关；凡涉及正式库、部署、push 的步骤都标“需用户授权”。CMP 区约定三说的“上线手册里的回退开关”指它。
  - 运行器（`tests/agent-eval/`）：`client: app_old`、`settings.shadow`、`rollback`、故障位置 `shadow`、判定 `shadow_report`；`legacy_update` 只在 AG13 未实现时补。
  - 测试：`tests/agent-v1/rollout/` 下 `legacy-client.test.ts`、`field-preservation.test.ts`、`shadow.test.ts`、`rollback.test.ts`、`backfill-postgres.test.ts`（本机库）；`tests/agent-eval/compare-baseline.test.ts`。
- 修改：`app/api/ai/conversations/route.ts` 的协议 2 与无版本分支；`app/api/ai/entity-drafts/handler.ts`；`app/api/agent/actions/[id]/accept/route.ts`、`dismiss/route.ts`、`app/api/agent/ledger/[id]/transition/route.ts`（只在 AG02 未处理时）；`app/api/tasks/[id]/handler.ts`、`features/tasks/service.ts`、`app/api/notes/[id]/handler.ts`（只补 AG13 留下的缺口）；`app/api/ai/conversations/sessions/[id]/handler.ts`（撤权）；`features/agent/runtime/` 的队列暂停点；`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`（影子与回退的原因码）。
- 排除：旧版 App 本身（已装在用户手机上的版本改不到；`repos/orbit-app/src` 只有同步副本变化）；新功能；对封存集调提示词；正式库、测试服部署、push、并入 `chat-agent`。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG18-1 | 旧客户端继续可用；它提交局部更新时新字段不丢。 | `legacy-client.test.ts`（协议 2 与无版本两条路：同一次调用拿回完整回答；卡变文字和引导；“确认”零写入；旧草稿、旧 accept 与 transition 不能越过版本核对；撤权后历史读不到正文）；`field-preservation.test.ts`（Todo、Memo、日程、联系人的局部与整条提交）；`backfill-postgres.test.ts`（只补缺、重跑 0 行）；门槛 AE-CMP-001、AE-CMP-002；本机库回填试算与执行的输出 |
| AG18-2 | 只读影子运行按账号分组比较新旧结果，分歧逐条列出。 | `shadow.test.ts`（零写入、零出卡、账号隔离、影子出错不影响用户）；门槛 AE-CMP-003、AE-CMP-004；用小、常规、较大三个账号和账号乙跑一遍可见用例里只读的那些，`agent-v1-shadow-report` 出的按账号分组报告，每条分歧带委托编号和两边结果 |
| AG18-3 | 回退演练：停接新提案，未执行的动作可暂停并对账，已完成的保留回执，不回到文字确认或直写。 | `rollback.test.ts`（三个出卡入口都拒收；队列不领取；文字确认与直写零写入；恢复后无重复效果）；门槛 AE-CMP-005；本机演练记录：预先造出等确认、已批准未执行、执行中结果未知、已完成四种卡，回退 → 对账清单 → 恢复，逐张核对状态与回执 |
| AG18-4 | 全部可见用例通过，四类不变量零违规；封存集至少 27/30，逐类报告。 | `--all` 一次完整运行 222 例全过、不变量违规 0；`--sealed` 在最终 SHA 上一次，按类列通过数与没过的用例编号；两份独立评审；两次运行都登记 RUNS.md |
| AG18-5 | 费用、p95 延迟、追问轮数、调用上限命中率与基线的对比报告。 | `compare-baseline.test.ts`（用固定的两份运行目录核对计算）；`agent-eval:compare` 对 AG00 基线与本 sprint `--all` 运行的报告：每次成功请求的费用、三类路径的 p50 与 p95、追问轮数、上限命中率，影子与模拟单列 |

## 一次 Generator 的执行顺序

1. 核对进入条件，读各前序 REPORT 的交接段，按 REPORT 更正上下文包并追加记录；登记 run-01、Planner SHA256、HEAD、CMP 与全部可见用例和夹具的校验值（封存集的校验值由运行器算，不打开目录）；按 AG00 基线估算全程费用；建 GitNexus 索引，对 `POST`、`createEntityDraftRouteHandlers`、旧 accept／transition、`TaskService.update`、`processAgentActionQueueWake` 跑 upstream impact，HIGH/CRITICAL 先报告。
2. 先补登 CONVENTIONS §1 的 `rollout/` 和 §2 的回退开关并留记录；写失败测试：旧端两条路、字段保留、影子隔离、回退。
3. 实现旧端兼容与回填（本机库先试算、再执行、再重跑确认 0 行）→ 影子与分歧报告 → 回退开关与对账；写 ROLLOUT.md。
4. 跑 `--gate AG18`；再跑三个账号的影子对比和回退演练，存证据。
5. 跑 `--all`，评审，不过就修，每次修复后整套 `--all` 重跑，最多两个修复轮次；固定最终 SHA；两端全量对照；跨端检查。
6. 在最终 SHA 上跑一次 `--sealed` 并评审；出与基线的对比报告；路径限定提交、REPORT、交接，到合回 `orbit-agent-claude` 为止。

## 最小测试与检查

- **档位 I。** 本 sprint 是本 epic 的集成收口（Web RULES 5.1、App RULES 5.1 的 I）：两端全量对照，加全部可见用例、封存集和真实演练。改动本身含 H：旧入口的写入与决定路径、共享契约。
- **开发定向集**（cwd `repos/orbits`）：`tests/agent-v1/rollout/*.test.ts`、`tests/agent-eval/compare-baseline.test.ts`；既有消费者 `tests/capabilities/orbit-agent-conversation-mock.test.ts`、`tests/capabilities/agent-chat-known-workflow-route.test.ts`、`tests/api/orbit-ai-reliable-reply-identity.test.ts`、`tests/api/orbit-ai-task-authorization.test.ts`、`tests/api/tasks-routes.test.ts`、`tests/api/agent-action-ledger-routes.test.ts`，以及 `grep -rl createEntityDraftRouteHandlers tests` 找到的草稿测试。
- **收口集**：上面各完整文件、`npx tsc --noEmit -p .`。改了 `shared/` 就在同一提交里于 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts` 和 `npm run typecheck`。
- **门槛与全量用例**：每次先 `npm run agent-eval:check`、`npm run agent-eval:env`。`npm run agent-eval:run -- --gate AG18` 含 CMP 5 例（小账号）与不变量包；`--all` 跑全部 222 例可见用例（三个账号）；`--sealed` 跑 30 例封存集。
- **评审**：门槛和封存集每例由两个互不相见的新 Claude 会话各评一次；SPRINTS.md 把全部可见用例列为本 sprint 的门槛，所以 `--all` 也按门槛的规矩双评（评测规范 §5 的“全量运行其余单评”在此不适用）。不一致做第三次并列人工复核。封存集的评审会话不是 Generator，Generator 只拿汇总。
- **全量**：`repos/orbits` 跑一次 `npm test`，按 Web RULES 5.2 与基线比失败清单，只查新增项；暂存基线用带唯一标签的 `git stash push -u -m <标签> -- <路径>` 并按 SHA 恢复（stash 栈与其他工作树共享）；不 source `.env`；数据库测试前跑 `node scripts/assert-local-test-databases.mjs`。`repos/orbit-app` 跑一次 `npm test` 与其基线对照。
- **跨端检查**（EPIC「怎样算完成」第 4 条，不是新增验收项）：按 App RULES 5.4 起 Web 本地生产构建并查健康端点，iOS Simulator 上的 App 连同一服务、同一测试账号，对同一张卡做 Web→App 与 App→Web 回读，记下 Web 提交、构建结果、地址、App 构建号。
- **费用**：每次完整运行 30 元以内、本 sprint 累计 150 元以内；222 例的 `--all` 加影子运行可能逼近单次上限，第一次 `--all` 之后按实际花费复算，余额或上限不够跑完剩余运行时先停下报告；REPORT 记次数与 token。
- **证据**：影子报告、演练记录、对账清单、回填输出、对比报告、跨端截图放 `~/orbit-sprint-evidence/agent-design/sprint-AG18/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：正式库与测试服上的任何操作；真实外部客户端联调（AG17 已做）；针对封存集的修补；Lighthouse 一类与验收无关的检查。

## 失败与交接

外部条件缺失（前序未完成、费用上限不够）先不启动或停在对应运行之前。门槛或 `--all` 不过，修复后整套重跑，最多两个修复轮次，仍不过如实结束为 failed。封存集不足 27/30 或出现任何不变量违规，不修补、不重跑封存集，按类写清结果后结束为 failed，由用户决定下一步。
分支：从 `orbit-agent-claude` 建 `sprint/AG18-compat-shadow-rollout`，路径限定提交（禁止 `git add .`／`git add -A`），提交前 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`。交接列本线分支和固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集与 typecheck 后才登记 completed。REPORT 含验收映射、SHA、命令与退出码、RUNS.md 各行、封存集分类结果、费用、对比报告摘要、未完成项。之后的并入 `chat-agent`、正式库迁移与回填、部署、push，本 sprint 都不做，等用户明确决定。
