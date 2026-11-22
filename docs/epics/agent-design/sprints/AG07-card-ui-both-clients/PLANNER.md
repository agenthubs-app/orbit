# Sprint AG07 — 两端的确认卡与对话界面（H）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R07（设计稿 §10、§7 的离线、未同步修改与接口；卡片状态取 §5.2、附录 D）；门槛按 AG-R19。
**单一目标:** Web 与 App 各新增一张确认卡，都只从服务端冻结的同一份 `actionPreview` 渲染；对话里加排队提示、依据行、追问候选、进度四处小改动；离线时只显示待确认份数且不能确认；App 本机有未同步修改时不能确认，同步后按新版差异重出；重开和跨端按编号重读。
**易读目标:** [GOAL.md](GOAL.md)。两端同一张卡、同一个状态；离线与未同步时点不了。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`；启动时填实际 HEAD 与 AG06 REPORT 记录的合并 SHA。未启动不填 run。
**进入条件（缺一项不启动）:**
- **用户已批准确认卡与对话四处小改动的视觉稿。** 手机稿和网页稿按 §10 的出稿方式：设备框、编号标注、现状与改后对照、改动文件清单、需要拍板的项，不改的区域用真实截图嵌入。编制时仓库里没有这份视觉稿（`docs/designs/` 下没有）。**没有用户批准，本 sprint 不启动，登记为 blocked，不写任何界面代码。** 批准记录（视觉稿链接与日期）以追加记录写进本页。
- AG06 completed 并已合回 `orbit-agent-claude`（因而 AG00–AG05 已完成）。可与 AG08 并行；并行的第二条线在外接盘 `/Volumes/ORICO/Dev/worktrees/orbit/<名称>` 另建 worktree，未挂载就停下询问。
- 设计稿「2026-11-15 已定的事项」即产品批准；真实模型调用已允许，上限按 EPIC 建议每次完整运行 ≤30 元、累计 ≤150 元，用户另定时以用户为准。
- 环境：`npm run agent-eval:env` 自检通过；Web 本地生产构建起在评测端口 3100 并连 `orbit_agent_eval`；App 的 API 地址指向它；有一台 375pt 宽的 iOS Simulator 机型可用。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- 设计稿 §10（五处界面中的确认卡与四处小改动、离线说法、出稿方式）、§7（离线只读、未同步修改、接口表、可边生成边显示的内容）、§5.1（决定接口字段）、§5.2「用户看到什么」、附录 D（卡片状态与错误）。
- `docs/epics/agent-design/eval/README.md` 第 3.1、3.4、4、6、10 节；`cases/UIX.yaml` 全部 6 例与文件顶部四条约定（Web 按 1440、App 按 375 渲染并截图）。
- `repos/orbits/docs/sprints/RULES.md` 0.1 与 `repos/orbits/docs/development/web-no-flash-and-cache-rules.md`（不用 `setInterval` 轮询、不用 `router.refresh()`、在本地生产构建上逐帧测位置）；RULES 5.4（1440 与 375、用 `next-auth/jwt` 签 cookie 注入登录）；`repos/orbit-app/docs/sprints/RULES.md` 5.4（Web 改动后重建重启再做 App 验收，同账号同库，记 Web→App、App→Web 回读）。
- Web：`app/(app)/app/agent/page.tsx`（`/app/agent` 渲染 `IOrbit2026`）；`agent/iorbit-2026/IOrbit2026.tsx`（:370–372 在消息下挂任务卡、`PanelCards`、`AgentActionStatusCard`）；`agent/iorbit-0918/use-agent-chat.ts`（发送与读取）；`agent/agent-action-status-card.tsx`（旧账本卡、状态词、决定请求）；`orbit-2026/iorbit/`（现有 `entity-draft.ts`、`page-context.ts`，新卡放这里）；`orbit-last-answer.ts`、`orbit-change-watch.ts`；`orbit-2026/copy/standard.ts`。
- App：`src/screens/ai/AiConversationScreen.tsx`（离线判定 :286–301、未同步提示 :193、草稿卡挂载 :1016）；`src/screens/ai/cards/AiEntityDraftCard.tsx`（现有卡片样式）；`src/hooks/usePendingWriteCounts.ts` 与 `.web.ts`、`src/hooks/pending-write-items.ts`；`src/data/sync/sync-coordinator.ts:122`、`local-sync-repository.ts:105`、`useLocalAlias.ts`；`src/hooks/useLocalAiSessions.ts`（离线时显示上次在线读到的卡）；`src/api/agent-ledger-contract.ts`、`src/api/endpoints.ts`；`src/i18n/standard-copy.ts`；`scripts/sync-contract.mjs`（整目录复制 `shared/contract`、`api-schema`、`compute`，以及 `shared/copy` 三个文件）。
- 测试夹具：Web `tests/pages/app-agent-iorbit-chat.test.tsx`、`app-agent-chat-actions.test.tsx`；App `tests/ai-conversation-screen-source.test.ts`、`tests/agent-ledger-screen-render.test.tsx`、`tests/helpers/node-sync-database.ts`、`tests/helpers/offline-page-harness.ts`。

### 关键符号（签名原样抄自源码；调用方为文本搜索到的引用文件数，含定义与测试）
- `export function IOrbit2026({ accountName, initialHistoryOpen = false }: {`（`app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx:178`，7 个文件）。
- `export function useAgentChat({ history, suggests }: { history: AgentChatHistoryStore; suggests: OrbitAgentViewModel["suggests"] }) {`（`agent/iorbit-0918/use-agent-chat.ts:90`，5 个文件）。
- `export function AgentActionStatusCard({`（`agent/agent-action-status-card.tsx:269`，7 个文件）：读 `/api/ai/runs/[id]`，决定发往 `/api/agent/ledger/[id]/transition`；状态词把 `rejected` 写成「已忽略」，另有「写入 Orbit」「外部操作」「需要复核」，都不合 §10。
- `export function AiConversationScreen({ scopeKey, isScopeCurrent = () => true, claimInitialPrompt, …`（`src/screens/ai/AiConversationScreen.tsx:185`，17 个文件）。
- `export function AiEntityDraftCard({`（`src/screens/ai/cards/AiEntityDraftCard.tsx:79`，5 个文件）。
- `export function usePendingWriteCounts(enabled = true): PendingWriteCounts {`（`src/hooks/usePendingWriteCounts.ts:19`，4 个文件）：只按种类计数；浏览器版恒为 0。
- `readOutboxOverlay(kind: SyncChangeKind): Promise<{ serverRecords: readonly SyncRecord[]; queuedMutations: readonly LocalSyncQueuedMutation[] } | null>;`（`sync-coordinator.ts:122`，24 个文件）；`export interface LocalSyncOutboxMutation {`（`local-sync-repository.ts:105`）每行带 `kind: SyncEntityKind;` 与 `id: string;`，能按记录比对。
- `export function useLocalAiConversation(sessionId: string | null): LocalAiConversationState {`（`src/hooks/useLocalAiSessions.ts:10`）：`saveCards` 保存上次在线读到的卡供离线显示。
- `export const AGENT_LEDGER_ENTRY_STATUSES = [`（`src/api/agent-ledger-contract.ts:7`）：App 手写的账本状态，没有 `expired`。
- `export function agentLedgerTransitionPath(id: string): string {`（`src/api/endpoints.ts:242`）。

App 没有 NetInfo 一类的网络监听，离线是从读取失败得出的（`state.kind === "offline"`、`noteWriteStatus.offline`、`localConversation.freshness.offline`）。本 worktree 没有 GitNexus 索引，Generator 先按根目录 `CLAUDE.md` 建索引，再对上面要改的符号做 upstream impact；`IOrbit2026`、`AiConversationScreen` 若为 HIGH/CRITICAL 先报告；`UNKNOWN` 用文本搜索补查。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时逐条对照前序 REPORT，有出入追加更正）
- AG01：`shared/contract/agent-v1.ts` 的 `AgentRequestStatus`、`AgentResultDocument`、`AgentPartResult`；`GET /api/ai/conversations/sessions/[id]?requestId=` 读结果文档；可选实时通道。
- AG02：决定接口带 `revision`、`payloadHash`、`clientDecisionId`；`CARD_EXPIRED`、`CARD_CLOSED`、`CARD_REVISION_CHANGED`、`CARD_CONTENT_CHANGED` 带最新卡；状态 `expired`。
- AG04：结果文档的 `clarifications` 与点选绑定。AG05：回答带的出处，依据行要用的字段以 AG05 REPORT 为准。
- AG06：`actionPreview` 里 `todo.update`、`memo.create` 两类操作，卡上可见文字（总数句、每项原值→新值、带星期的日期）由 `freezeCard()` 冻结在载荷里。
- **启动时要核对的四处缺口：** ① 按编号取单张卡（§7 的 `GET conversation/action-preview`）——编制时 `app/api/agent/ledger/` 下没有 `[id]/route.ts`；② App 同步后不点击也要出第 2 版（AE-UIX-006 要求 `card_revision` ≥2 且零决定）；③ AE-UIX-005 的卡含 `todo.create`，SPRINTS 没把它列进 AG06；④ 运行器对 `client_view`、`same_card_on`、`local_pending_edit`、`sync`、`disconnect` 的支持（AG00）。前序没交付时：①② 由本 sprint 补一个只读取卡并按 AG02 内容核对重出新版的服务端路径（不是决定接口，不写业务数据）；③ 记为受阻并报告，不在本 sprint 新增领域适配器；④ 在 `tests/agent-eval/` 补客户端驱动。

### 易错边界（都对应到下方验收）
1. **同一份预览（AG07-1）。** 两端只渲染 `actionPreview` 的字段和 `shared/copy` 的固定词；不在客户端拼总数句、日期、差异；不从旧 `AgentActionStatusCard` 或 App 的 `agent-ledger-contract.ts` 取字段。卡在载荷冻结后一次出现，不逐项拼出。
2. **状态跟随（AG07-2）。** 一端决定后另一端重读得到最新状态。Web 用 AG01 的实时通道或 `orbit-change-watch.ts` 的变更游标，不写 `setInterval`，不 `router.refresh()`，后台刷新不把已有内容换回骨架；App 在前台恢复和对话重读时更新。点已否决或过期的卡，显示服务端返回的最新状态，不露错误码；`rejected` 与 `canceled` 都显示「已取消」。
3. **离线（AG07-3）。** 离线只显示份数和「联网后才能确认」，不渲染卡片条目；`saveCards` 的离线副本不得带出新卡的条目；离线时的点击不进 App 的离线写队列，重连后先在线重验再显示内容，不补发。Web 断网时同样禁用。
4. **本机未同步（AG07-4）。** 按卡上每项的目标（种类 + 编号）比对 `queuedMutations`，不能只看 `usePendingWriteCounts` 的种类总数；本机新建的记录经 `useLocalAlias` 对上编号。按钮旁写「先同步你的修改」；同步完取新版并提示「内容有变化，请再看一遍」，仍需再点。浏览器版 App 没有本机队列，AE-UIX-006 只能在原生 App 上证明，不能用浏览器版冒充。
5. **文字（AG07-5）。** 照 §10：「修改 1 项，新增 1 项」「确认以上 N 项」「不改了」（§1 示例里的「否决」以 §10 为准），八种状态的说法，日期写「11 月 20 日（周五）」，过期写「这张卡放太久了，要重新生成一张吗？」；不出现「操作」「载荷」「版本」「证据」「来源」、错误码和哈希。固定词放 `shared/copy` 的 `aiCard` 组，三语键一致。

## 范围与文件

- **读取：** 上面的必读文件；AG01、AG02、AG04–AG06 REPORT 的交接段落；获批的视觉稿。
- **修改（Web，`repos/orbits`）：** `app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx` 与 `IOrbit2026.module.css`（挂新卡与四处小改动）；`agent/iorbit-0918/use-agent-chat.ts`（按 `requestId` 读结果文档）；`shared/copy/zh.ts`、`ja.ts`、`en.ts`（`aiCard` 组新增固定词）；`shared/contract/agent-v1.ts` 只在显示必需时追加字段。
- **修改（App，`repos/orbit-app`）：** `src/screens/ai/AiConversationScreen.tsx`；`src/api/endpoints.ts`；必要时 `src/hooks/useLocalAiSessions.ts`；同步脚本写出的 `src/api/contract`、`src/api/schema`、`src/api/copy` 副本。
- **新建：** Web `app/(app)/app/orbit-2026/iorbit/confirmation-card.tsx`、`orbit-2026/iorbit/action-preview-client.ts`；App `src/screens/ai/cards/AgentConfirmationCard.tsx`、`src/hooks/useCardLocalPendingEdits.ts`（含 `.web.ts`）、`src/api/agent-v1-client.ts`。测试：Web `tests/pages/agent-v1-confirmation-card.test.tsx`；App `tests/agent-v1-confirmation-card.test.tsx`、`tests/agent-v1-card-offline-and-pending.test.ts`。按缺口①② 视情况新建 `repos/orbits/app/api/agent/ledger/[id]/route.ts`，按缺口④ 在 `repos/orbits/tests/agent-eval/` 补驱动，都写进 REPORT。
- **排除：** @ 选择器（AG11）、收件箱（AG15）、记忆管理页（AG14）、定时任务页；新的领域适配器；删除旧 `AgentActionStatusCard`、`AgentActionsScreen`（旧卡保留可读到 AG18）；推送；视觉稿没画的区域保持原样。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
|---|---|---|
| AG07-1 | 两端从同一份预览渲染出相同的条目、数量和差异，没有各自拼装的字段。 | Web `agent-v1-confirmation-card.test.tsx`、App `agent-v1-confirmation-card.test.tsx`（预览少一个字段，界面就少那一处；客户端不格式化日期）；门槛 AE-UIX-001、002、003、005、006 的 `same_card_on` |
| AG07-2 | 一端确认后另一端显示同一结果；已否决或过期的卡点击后显示最新状态。 | 两端卡片测试的决定错误分支；门槛 AE-UIX-002、003、005；Web 与 App 对同一张卡的双向回读记录 |
| AG07-3 | 离线时只显示有几份待确认，卡片内容和确认按钮不可用。 | `agent-v1-card-offline-and-pending.test.ts`（用 `offline-page-harness.ts`：只显示份数、点击不进离线队列、重连不补发）；门槛 AE-UIX-004、005 |
| AG07-4 | App 本机有未同步的修改时确认按钮不可用，同步后按最新数据重出差异。 | 同一测试文件用 `node-sync-database.ts` 造卡上目标的待同步修改；门槛 AE-UIX-006；iOS Simulator 上的截图与回读记录 |
| AG07-5 | 界面文字符合设计稿 §10 的说法，没有内部词；桌面 1440 和手机 375 各验证一次。 | `npm run copy:qa -- --shared` 0 问题；门槛 AE-UIX-001 的 R1–R4、AE-UIX-003 的 R1–R2；Web 1440、375 与 App 375 截图，控制台无错误；按 RULES 0.1 在本地生产构建上逐帧测位置不变并核对读取次数 |

## 一次 Generator 的执行顺序

1. 复核进入条件，**先确认视觉稿批准记录**，没有就停在 blocked；对照前序 REPORT 与四处缺口，登记 run-01、PLANNER SHA256、基线、UIX 用例与夹具校验值；建索引并做 impact。
2. 先写两端卡片组件、离线与未同步的失败测试；`shared/copy` 新增固定词，`npm run copy:qa -- --shared` 后在 App 同步并跑同步测试。
3. Web：结果文档读取、确认卡、四处小改动、状态跟随；按需补缺口①②的服务端读取路径。
4. App：同样的卡与四处小改动、按记录的未同步检查、离线只读；离线副本不带新卡条目。
5. 收口：两端定向集、收口集、typecheck、两端各一次全量；本地生产构建上做浏览器与 iOS Simulator 验证；跑门槛与两次评审；路径限定提交，提交前 `detect-changes`。
6. 写 REPORT，交接分支与固定最终 SHA，由协调者合回。不启动第二轮 Generator。

## 最小测试与检查

- **档位：H。** 改动共享契约与固定词、决定入口和跨端状态，两端同时改；收口做一次 I（两端各一次全量）。H 档的一次代码审查由协调者另开 Claude 会话完成（Codex 已停用）。
- **Web 定向与收口（cwd `repos/orbits`）：** 新卡测试、`tests/pages/app-agent-iorbit-chat.test.tsx`、`app-agent-chat-actions.test.tsx`、`tests/copy-qa/shared-copy.test.ts`；读缓存的组件在 `beforeEach` 调 `resetLastAnswersForTests()`；`npx tsc --noEmit -p .`；全量按 RULES 5.2 两次 `npm test` 对照失败清单（stash 栈共用，只用带唯一标签的 stash，按 SHA `apply`）。
- **App 定向与收口（cwd `repos/orbit-app`）：** 两个新测试、`tests/ai-conversation-screen-source.test.ts`、`tests/agent-ledger-screen-render.test.tsx`；`npm run sync:contract` 后跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts` 与 `copy-sync.test.ts`；`npm run typecheck`；一次 `npm test` 全量。
- **真实页面：** Web 本地生产构建（端口 3100，连 `orbit_agent_eval`），登录用 `next-auth/jwt` 签 cookie；1440 与 375 各看一次，检查控制台；App 在 375pt 宽的 iOS Simulator 上看同一账号同一张卡，记录 Web 提交号、构建结果、地址、脱敏的库与账号、App API 地址和构建版本，以及 Web→App、App→Web 回读。Web 源码或契约改了就重建重启再做 App 验收。
- **门槛：** `npm run agent-eval:run -- --gate AG07`，含 UIX 区 6 例与不变量包；SCL 没有分给 AG07 的用例。不变量包若含后续 sprint 才有能力的用例，按 AG00 REPORT 的选取口径执行并写明。失败后修复并整套重跑，最多两个修复轮次。
- **评审：** `npm run agent-eval:judge-pack -- --run <运行编号>`，每例两个互不相见的新 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report` 的结果登记进 `eval/RUNS.md`。
- **费用：** 真实调用每次完整运行 ≤30 元、累计 ≤150 元，超出先停下报告；REPORT 记次数、token、金额与余额差。
- **证据位置：** `~/orbit-sprint-evidence/agent-design/sprint-AG07/run-01/`（截图、逐帧测量、命令输出；本 epic 以此为准，不用 App 规则里的 `build/harness-state/`）；评测日志 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行：** 封存集、`--all`、真实联网、其他用例区；实体设备（本机 Simulator 足以证明本地跨端行为，App RULES 5.4）。

## 失败与交接

视觉稿未获批或其他外部条件缺失时不启动；run 已开始则按 RULES 产出 failed 或 blocked 报告，不降低验收。
报告包含验收映射、功能 SHA、文件与理由、四处缺口各自怎么处理、命令与退出码、门槛运行编号与 `RUNS.md` 行、截图与回读记录、费用与下一步。分支从 `orbit-agent-claude` 建 `sprint/AG07-card-ui-both-clients`，两端改动各自路径限定提交，禁止 `git add .`；由协调者用 `--no-ff` 合回 `orbit-agent-claude`，在合并树上跑两端受影响测试和 typecheck 并记录合并 SHA 后，登记表才写 completed。push 需要用户另行授权。

## 视觉稿批准记录（协调者追加，2026-11-16）

- 视觉稿：https://claude.ai/artifact/NGFXiimkSuH3s9xmSDpCvk（确认卡与对话界面视觉稿）。
- 2026-11-16 用户回复“批准”：按稿执行，需拍板的 D1～D7 取稿中推荐。
- 截图与素材在 `~/orbit-sprint-evidence/agent-design/sprint-AG07/visual-draft/`。
- 进入条件第一项已满足。
