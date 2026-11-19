# Sprint AG01 — 入口、排队与结果文档

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R01（触发先落库、同一会话按顺序处理、提交与取结果分开）；AG-R20 的入口部分（排队时长等指标，`requestId` 进追踪）。
**单一目标:** `ORBIT_AGENT_V1_MODE=on` 时，`POST /api/ai/conversations` 接受协议版本 3：入口只做认证、去重、落库，立即返回 `requestId` 和委托状态；同一会话按接收顺序一轮一轮交给现有运行时处理（只读）；结果文档按 `requestId` 读取，可选的实时通道按序号续传；可以停止当前这一轮。`off`（缺省）时行为与现在完全相同。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，开工时填实际 HEAD（编制时 `324943ad5`）；前序 `sprints/AG00-eval-foundation/REPORT.md`。
**进入条件:**
1. AG00 completed 并已合回 `orbit-agent-claude`；`agent-eval:*` 命令、本机库快照和 `emitTrace` 可用，名字与 AG00 REPORT 核对一致。
2. 设计稿「2026-11-15 已定的事项」的“排队范围”一行即产品批准（同一会话按顺序、点击不排队、中途来的消息排到下一轮）。
3. 付费模型调用按 EPIC 的上限执行（每次完整运行 30 元以内，累计 150 元以内）；`DEEPSEEK_API_KEY` 与 AG00 的评测环境就绪。
4. 本 sprint 只改服务端，两端界面不动（AG07），不需要视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbits/app/api/ai/conversations/route.ts`：`POST`（:644）；协议 2 的分支（:653–654 解析，:773–883 可靠发送）；现有管线 :749–769 是 `sendMessage → applyTaskInteraction → applyEntityDraft → persistNaturalLanguageActionProposals`；引用授权在发送前同步做（:785）；普通回答不写 run 记录（:621–625 的注释）。
- `features/orbit-ai/reliable-send-service.ts`：按指纹预留与重放（:258–302）；消息版本不符时 `SESSION_REVISION_CONFLICT`（:351–360）；执行在同一次调用里跑完（:411–427），没跑完时 route 返回 202。
- `features/orbit-ai/storage/orbit-agent-chat-request-store.ts`：集合 `orbit_agent_chat_requests` 与 `orbit_agent_chat_session_revisions`（:18–19）；记录编号是 `sha256(actorId, requestId)`（:23–27）；写入在 `pg_advisory_xact_lock` 下进行（:53–56），这是会话级加锁可以照用的先例。
- `shared/contract/ai-sessions.ts:105–138`（`ReliableAiSendInputContract`，`protocolVersion: 2`，引用类型只有联系人、活动、笔记）；`shared/api-schema/ai-sessions.ts:178`（`reliableAiSendInputSchema`，`z.literal(2)`）。
- `app/api/ai/conversations/sessions/[id]/handler.ts:260–279`：按 `requestId` 读回发送记录，附录 D 要扩成返回结果文档。
- `app/api/ai/runs/[id]/transition/route.ts`：只接受 `cancel`，调 `runtime.cancelRun(id)`；普通回答没有 run 记录，停止要能按 `requestId` 认出这一轮。
- `features/orbit-ai/gemini-provider.ts`：`fetchImplementation?: typeof fetch`（:195）；:1269 的 `AbortController` 只用于超时，现有运行时没有外部取消信号。
- `scripts/contract-snapshot.mjs` 与 `tests/contracts/contract-append-only.test.ts`：`shared/contract` 只增不删，改后要 `--write` 快照；`repos/orbit-app/scripts/sync-contract.mjs` 与 App 的 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- 设计稿 §3.7（四种触发、去重键、排队规则）、§7（结果文档样例、六个委托状态、逻辑接口、实时通道规则）、附录 D（逻辑接口对应到现有路由）。
- `docs/epics/agent-design/eval/cases/ENT.yaml`：8 例；新判定 `request_states`、`order`、`client_view_matches_result`，新步骤修饰 `while_running`。

### 关键符号
本 worktree 原本没有 GitNexus 索引；按 AG00 REPORT 确认索引已建，否则先建，再对每个要改的符号做 upstream impact（CONVENTIONS §5）。调用方数是编制时的文本搜索（含定义文件）。
- `export async function POST(request: Request): Promise<Response> {`（`app/api/ai/conversations/route.ts:644`）：9 个测试文件 import 这个 route。
- `export function createReliableOrbitAgentSendService(dependencies: {`（`reliable-send-service.ts:223`）：8 个文件，其中测试 6 个。
- `export function createOrbitAgentChatRequestStore(`（`orbit-agent-chat-request-store.ts:257`）：7 个文件（会话读取 handler、runs handler、发送 route 和 3 个测试）。
- `export interface ReliableAiSendInputContract {`（`shared/contract/ai-sessions.ts:105`）：6 个文件，含 Web 客户端 `app/(app)/app/agent/iorbit-0918/iorbit-model.ts` 与 `features/plans/bootstrap.ts`；不改它。
- `export const reliableAiSendInputSchema: z.ZodType<ReliableAiSendInputContract> =`（`shared/api-schema/ai-sessions.ts:178`）：4 个文件；不改它。
- `export function createOrbitAgentChatSessionHandlers(`（`sessions/[id]/handler.ts:84`）：8 个文件，其中测试 5 个。

### 前序交接要点
以下是约定的名字，开工时按 AG00 REPORT 核对；不一致就按 REPORT 更新本节并留追加记录。
- `npm run agent-eval:check`、`agent-eval:env`、`agent-eval:seed`、`agent-eval:run -- --gate AG01`、`agent-eval:judge-pack`、`agent-eval:report`。
- `features/agent-v1/observability/trace.ts` 的 `emitTrace(event)`；本 sprint 新增的入口事件（收下、排队、开始、结束、取消、通道推送）都经它发出。
- 对外连接守卫与固定时钟由 `agent-eval:env` 装上；运行器在 `repos/orbits/tests/agent-eval/`。

### 易错边界（都对应到下方验收项）
1. **开关关着一切照旧**（AG01-1）：`ORBIT_AGENT_V1_MODE` 缺省为 `off`；协议 2 的请求在任何取值下都走原路径，返回逐字节不变。`shadow` 本 sprint 按 `off` 处理并在 REPORT 写明，比较在 AG18。
2. **应答早于模型**（AG01-1）：协议 3 的 POST 只做认证、去重、落库就返回 `requestId` 与 `queued` 或 `running`；引用授权、页面上下文校验挪到处理阶段（§3.7）。`request_states` 要求这次应答早于该委托的第一次 `model.response`。
3. **去重**（AG01-1）：同一客户端消息键重发，返回原 `requestId` 和当前状态，不另起一轮；同一 `requestId` 配不同内容仍按现有 `REQUEST_ID_REUSED` 拒收。
4. **只读**（AG01-2）：新入口不调用 `applyTaskInteraction`、`applyEntityDraft`、`persistNaturalLanguageActionProposals`；现有运行时给的 `proposedActionRequests` 与 `proposedEntityDraft` 丢弃，结果文档里没有卡，也没有业务写入。
5. **同一会话一次一轮**（AG01-2）：用会话级的锁或条件更新保证同一时刻只有一轮在跑；中途来的消息排到下一轮，不合并、不打断；处理进程退出后，下一个进程按原键接手；入口改成排队后，用户不再看到 `SESSION_REVISION_CONFLICT`（附录 D）。入口记下每条消息的排队等待时长和“处理中又来消息”的比例。
6. **结果文档是唯一的交付**（AG01-3、AG01-4）：两端用同一个查询读结果文档；实时通道只是它的另一种读法，带序号，重连带上次序号从其后续推；只在通道里出现过、文档里没有的片段不算已交付。按 `requestId` 读取和订阅都只限本人，别人的编号读不到。
7. **停止**（AG01-5）：只取消正在处理的这一轮；停止后这一轮不再发模型请求，迟到的结果不写进结果文档，已交付的部分保留，排在后面的照常处理。现有运行时没有外部取消，可以按请求传入一个停止后拒绝调用的 `fetchImplementation`（:195 已有这个注入点），不改模型步骤本身。
8. **契约只增**（AG01-1）：新结构放 `shared/contract/agent-v1.ts`、校验放 `shared/api-schema/agent-v1.ts`，经 `shared/contract/index.ts` 导出；不改协议 2 的类型。同一提交里跑 `node scripts/contract-snapshot.mjs --write`、App 的 `npm run sync:contract` 和四个同步测试。

## 范围与文件

- 读取：上面的必读文件；AG00 REPORT 的“交接”一节。
- 修改：`app/api/ai/conversations/route.ts`（协议 3 分支，开关后面）；`app/api/ai/conversations/sessions/[id]/handler.ts`（协议 3 的记录返回结果文档）；`app/api/ai/runs/[id]/transition/route.ts`（`on` 时接受协议 3 委托的 `requestId` 做停止，原 run 取消不变）；`features/orbit-ai/storage/orbit-agent-chat-request-store.ts`（记录里加委托状态、结果文档、通道序号，只加字段）；`shared/contract/index.ts`、`shared/contract/.snapshot.json`；App 同步脚本写出的 `repos/orbit-app/src/api/contract`、`src/api/schema` 副本；`repos/orbits/tests/agent-eval/` 里补 ENT 需要而 AG00 未实现的步骤与判定。
- 新建：`features/agent-v1/entry/` 下的入口记录与去重（`acceptMessage()`）、会话队列与处理、结果文档（`getRequestResult()`）、实时通道、停止（`cancelCurrentRun()`）、开关读取，文件名可调，导出名照 CONVENTIONS §4；`shared/contract/agent-v1.ts`（`AgentRequestStatus`、`AgentResultDocument`、`AgentPartResult`、协议 3 的发送与应答）；`shared/api-schema/agent-v1.ts`；实时通道路由 `app/api/ai/conversations/sessions/[id]/events/route.ts`；对应测试 `tests/services/agent-v1-entry-*.test.ts`、`tests/services/agent-v1-entry-queue-postgres.test.ts`、`tests/api/agent-v1-conversation-v3-route.test.ts`。
- 排除：模型步骤与提示词；任何写入与出卡（AG02 起）；两端客户端改用协议 3（AG07）；旧客户端经新入口由服务端代等（AG18）；影子比较（AG18）；引用类型扩到六类（AG11）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| AG01-1 | 发送在模型跑完之前返回 `requestId` 和状态；同一客户端消息键重发，返回原委托，不产生第二次。 | 门槛 AE-ENT-001、AE-ENT-002；`tests/services/agent-v1-entry-accept.test.ts`（用会卡住的运行时桩证明应答先于执行；重发同键返回同一 `requestId`、处理次数为 1）；`tests/api/agent-v1-conversation-v3-route.test.ts`（`off` 时协议 3 被拒、协议 2 原样）；契约快照与 App 四个同步测试的输出。 |
| AG01-2 | 同一会话里两端同时发消息，按接收顺序各得一个结果；处理中又来的消息排到下一轮。 | 门槛 AE-ENT-003、AE-ENT-004、AE-ENT-008；`tests/services/agent-v1-entry-queue-postgres.test.ts`（本机测试库：两个并发收下按顺序处理、同一时刻只有一轮、处理进程中断后由下一个进程按原键接手、排队时长被记下）。 |
| AG01-3 | 发送后断线、换设备，再按 `requestId` 读，得到与一直在线时逐项一致的结果。 | 门槛 AE-ENT-002、AE-ENT-003、AE-ENT-005；`tests/services/agent-v1-entry-result-document.test.ts`（处理中读到已完成的部分、结束后读到全部；另一账号读同一编号得不到内容）。 |
| AG01-4 | 实时通道断开后重连能续上；只在通道里出现过的片段不算已交付。 | 门槛 AE-ENT-006、AE-ENT-007；`tests/services/agent-v1-entry-events.test.ts`（带上次序号重连只收其后的事件；通道里有、文档里没有的片段在比对时判为未交付）。 |
| AG01-5 | 点停止后当前这一轮结束，已交付的部分保留，排在后面的消息继续处理。 | 门槛 AE-ENT-007、AE-ENT-008；`tests/services/agent-v1-entry-cancel.test.ts`（停止后模型请求计数不再增加、迟到结果不进文档、队列里下一条照常开始）。 |

## 一次 Generator 的执行顺序

1. 复核进入条件，按 AG00 REPORT 核对交接名；登记 run-01、PLANNER SHA256 与 HEAD；从 `orbit-agent-claude` 建 `sprint/AG01-entry-queue-result`；动手前跑 `npm test` 存失败清单。
2. 对上表关键符号做 upstream impact，HIGH／CRITICAL 先报告；先写 `shared/contract/agent-v1.ts` 与校验，跑契约快照和 App 同步。
3. AG01-1、AG01-2：先写失败测试，再实现 `acceptMessage()`、会话队列与交给现有运行时的处理（只读）、开关。
4. AG01-3 至 AG01-5：结果文档与读取、实时通道、`cancelCurrentRun()`；运行器补 ENT 的步骤与判定。
5. 收口集与 typecheck；`npm run agent-eval:run -- --gate AG01`，两个新会话评审，`agent-eval:report` 汇总并登记 `RUNS.md`；全量对照。
6. `detect-changes --scope staged`；按操作链路径限定提交；写 REPORT 交接。

## 最小测试与检查

- **档位 H**：共享契约、幂等、并发与身份范围都变了。收口跑一次全量对照。
- **开发定向集**（cwd `repos/orbits`）：上表新增的五个测试文件。
- **操作链收口集**：`tests/capabilities/orbit-agent-reliable-send.test.ts`、`orbit-agent-conversation-readback.test.ts`、`orbit-agent-chat-session-api.test.ts`、`ai-session-origin.test.ts`、`tests/api/orbit-ai-reliable-reply-identity.test.ts`、`tests/services/ai-session-paging-postgres.test.ts`、`tests/pages/app-agent-chat-actions.test.tsx`（runs 停止）、`tests/contracts/contract-append-only.test.ts`、`tests/agent-eval/*.test.ts`；`npx tsc --noEmit -p .`；`node scripts/contract-snapshot.mjs`。
- **契约同步**：cwd `repos/orbit-app` 执行 `npm run sync:contract`，跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`，再 `npx tsc --noEmit`；除同步写出的副本外不改 App。
- **全量对照**：第 1 步的失败清单与收口时的 `npm test` 用 `comm -13` 比较，只查新增项；不 source `.env` 系列文件。
- **门槛命令**：`npm run agent-eval:run -- --gate AG01`，含 ENT 区 8 例；登记表没有给 AG01 分 SCL 用例；不变量包从 AG02 起，本 sprint 不含。
- **评审**：每例由两个互不相见的 Claude 会话各评一次，不一致做第三次并列入人工复核清单。
- **费用**：每次完整运行不超过 30 元，本 sprint 累计不超过 150 元；超出先停下报告。
- **证据位置**：`~/orbit-sprint-evidence/agent-design/sprint-AG01/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：`--sealed`；浏览器验证（页面不变，RULES 0.1 不适用）；App 端除同步测试和 typecheck 以外的测试。

## 失败与交接

外部条件缺失（AG00 未合回、评测环境或密钥不可用）先不启动；run 已开始则按规则产出 failed／blocked 报告。门槛不过时最多两个修复轮次，每轮把门槛整套重跑，每次运行都登记。
REPORT 包含：验收项对应的提交 SHA、文件与证据；命令与退出码；全量对照新增失败；门槛运行编号、`bundle.sha256`、真实调用次数、token 与费用；`shadow` 的处理方式；排队时长与“处理中又来消息”比例的样本；交给 AG02 的接口名与签名。分支 `sprint/AG01-entry-queue-result`，固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树上跑收口集、typecheck 与 App 四个同步测试后才标 completed。push 需要用户另行授权。

## 追加记录（2026-11-15，Generator run-01 开工核对；原文与原哈希 d8d21e9f… 保留）

按 AG00 REPORT 核对“前序交接要点”：命令名、`emitTrace(event)`、`takeEvalFault`、运行器位置一致。有出入的几处，以 AG00 REPORT 与协调者说明为准：
1. 基线 HEAD 是 `c891947e8`（AG00 合并），不是编制时的 `324943ad5`。
2. GitNexus：`.gitnexus/run.cjs` 读不了索引，改用 `npx gitnexus@latest analyze --index-only` 与 `impact`／`detect-changes`；`[id]` 目录下的路由文件不在索引里，这几处用文本搜索补查。
3. 评测服务是生产构建，改产品代码后先 `--stop` 再 `--build`。
4. 第 5 步的“两个新会话评审、`agent-eval:report` 汇总并登记 `RUNS.md`”由协调者做；Generator 停在 `agent-eval:judge-pack`（generator-brief）。
5. 本 worktree 没有本机测试库变量，DB 测试在本机 Postgres 上另建 `orbit_agent_v1_entry_test`，经 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 只给定向测试用；全量 `npm test` 与开工前一样不设它。

## 追加记录（2026-11-15，run-02 登记）

run-01 结束为 failed（修复轮 2 的门槛 `20261115-214128-65b2ed1-AG01-gate` 双评 7/8，AE-ENT-005 R1 不过：交付文本里的卡片是原始字段和 UTC 时间）。协调者开 run-02，范围只限这一处：把现有运行时的结果卡片写成用户读得懂的文字（按请求语言，时间用记录自己的时区，去掉内部字段）。验收项、用例与运行器不变。run-02 开工时本文件 SHA-256 `4339c8f26a65c77df8623061b2a39f3e4c8b5878b2e81267958f9f181acc1875`，基线 HEAD `a1e3e2859`。
