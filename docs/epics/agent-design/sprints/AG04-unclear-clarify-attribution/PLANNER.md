# Sprint AG04 — 需求不清楚、追问与归属

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R04（需求不清楚时的下一步；追问、归属），门槛按 AG-R19。**单一目标:** 在 AG03 的图上加 `clarify` 节点：每个子目标按设计稿 §3.11 表的六行由代码定下一步，可点方向只由代码给；追问用 `interrupt` 暂停，点选或文字回答后从原处恢复；新消息按 §3.7 归属到追问、卡片、待续、替代方案或新委托；一个子目标只问一次。写入意图的判断模型复核在 AG08 接入，本 sprint 按保守结果执行同一条规则。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00–AG03 未开工）。启动时填实际 HEAD 与 AG03 的合并 SHA；与 AG05 并行时另记 AG05 是否已合回。
**进入条件:** ① AG03 completed 并已合回 `orbit-agent-claude`。② 产品批准沿用设计稿“2026-11-15 已定的事项”与 §3.11、§3.7 的规则，不再逐项索要。③ 真实 DeepSeek 调用已允许，上限按 CONVENTIONS 第 6 节。④ `npm run agent-eval:env` 自检通过，DeepSeek 余额够跑本 sprint 与 AG03 各一次门槛。⑤ 与 AG05 并行时，第二条线在 `/Volumes/ORICO/Dev/worktrees/orbit/<名称>` 另建 worktree，外接盘未挂载就停下询问。⑥ 不动界面，无需视觉稿（可点方向的界面在 AG07）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿和用例在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§3.11 全节（六行表、“最可能的一种”、可点方向的来源、写入要有明确指令、只问一次、不为弄懂而读数据）；§3.7 “新消息接到哪件事上”的归属表与“文字不能代替点击”；§3.9 `clarify` 行、“暂停与恢复”；§3.10 搁置规则；附录 C `Part.clarity`、`readings`、`continues`、`intentBasis` 与校验清单。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`（仓库根）。
- AG03 交付的 `features/agent-v1/understand/schema.ts`、`route/decide.ts`、`context/session-state.ts`、`graph/build.ts`、`graph/state.ts`、`graph/nodes/deliver.ts`：本 sprint 在这些文件上扩展，并替换 AG03 的简易追问（AG03 PLANNER 易错边界 5）。
- `features/orbit-ai/live-agent-runtime.ts:947` `createLiveOrbitAgentLocalBoundaryPayload`：旧运行时按关键词判多意图、收件人不明（:978–983），新图不复用这套关键词规则。
- `shared/contract/ai-sessions.ts`：:1 引用类型只有 `contact | event | note`；判定“最可能的读法”要用到引用的类型。
- `features/orbit-ai/ai-session-reference-authorization.ts`：只核对联系人；笔记、活动引用的授权在 AG05 的 `references/authorize.ts`。
- `scripts/test-paid-ai-boundary.mjs`：开发测试不得发真实调用。
- 用例（仓库根 `docs/epics/agent-design/eval/`）：`cases/AMB.yaml` 全部 12 例；`cases/CTX.yaml` 的 AE-CTX-006、008（本 sprint 改写了它们依赖的追问）。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。
- 现有代码，只读不改：`export function createLiveOrbitAgentLocalBoundaryPayload(`（live-agent-runtime.ts:947，旧路径；文本搜索 1 个非测试文件、5 个测试文件）；`export type AiSessionReferenceType = "contact" | "event" | "note";`（ai-sessions.ts:1，3 个非测试文件）。
- AG03 交付、本 sprint 要改的：`decideRoute()`、`buildFirstLayerContext()`、`UnderstandOutput`、`AgentGraphState`、会话级状态的读写函数、`deliver` 节点。签名以 AG03 REPORT 为准，启动时原样抄进本页的追加记录，并对每个跑 impact。
- LangGraph 的 `interrupt()` 与 `Command({ resume })`：版本以 AG03 锁定的为准。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 AG03 REPORT 核对，不一致就追加更正记录）
- AG03：`graph/` 的图与 `AgentGraphState`；`understand/` 的 `UnderstandOutput` 与校验；`context/` 的 `buildFirstLayerContext()` 与会话级状态（未结事项、无关消息计数）；`route/` 的能力清单与 `decideRoute()`；`models/main.ts`；单轮调用上限的设置名。
- AG01：`entry/` 的 `acceptMessage()` 与会话顺序处理；结果文档 `AgentResultDocument` 的 `clarifications[]`、`partResults[]`。点选要经它落库。
- AG02：文字“好的”“确认”不能批准卡片；本 sprint 的归属只把文字用于回答追问和接受替代方案。
- AG00：`fault` 注入机制（本 sprint 要 `understand` 处的 `mistag_write`）；运行器 `select` 步骤调用哪个接口。
- AG05（可能并行）：已合回就用 `references/authorize.ts` 核对笔记、活动引用；没合回则引用类型只用来选默认读法，不读内容。

### 易错边界（每条对应一项验收）
1. **读不出需求时零读取（AG04-1）。** 第一层拆不出子目标，或只有对象没有动作（“小林”“えっと…”、只 @ 一条记录），代码直接回一句固定文案说没看懂，不读、不联网、不再调模型写回答（AE-AMB-002 上限 2 次即理解加一次修复）。可点方向由 `optionsFor()` 从三处取：本轮 @ 引用和页面、会话里的未结事项、该类记录登记的常用动作；都没有时恰好三个通用入口：查我的资料、记一笔、设个提醒。只有文字线索（“小林”）时，方向带着这段文字，不为确认是谁去查联系人。
2. **方向的文字也由代码写（AG04-1、AG04-3）。** 每个方向对应附录 A 里登记的能力，标签取该能力的中日英固定文案加对象线索。模型给的 `readings[]` 只用来挑能力，`label` 不展示；不在附录 A 的能力整条丢弃。
3. **陈述和假设不出卡（AG04-2）。** 只有 `intentBasis` 为指令或点选、`clarity` 为 `clear` 或 `missing_one`、`constraints` 里没有否定或假设、能力含写入的子目标才可能去 `propose_write`。第一层把子目标标成写入、却同时带着陈述或假设的标记（`fault: mistag_write` 造的正是这种），本该由判断模型复核；AG08 之前一律按保守结果：当陈述回应，状态 `answered`，最多附一个“要记下来吗”这类入口。用户点了入口，生成一个 `intentBasis: selection` 的新子目标，写入在 AG06 才出卡，本 sprint 标 `unfinished` 并说明。
4. **只读的多种读法先做（AG04-3）。** 候选读法都不写入时，按“刚点选的入口或所在页面 → 本会话正在进行的话题 → 该类记录登记的默认只读动作”定最可能的一种去做，开头用代码文案写明是怎么理解的，其余读法最多两个列成入口，不反问。默认动作按 §3.11 登记：笔记看摘要，联系人看最近往来和没做完的事，活动看时间地点和我的相关记录，待办看当前状态和关联的人。排序、挑选没有默认依据，归入“问一句”。读法里有写入的，不猜，问一句，把读法列成方向；问的时候不为弄懂它去读数据（AE-AMB-010 零读取）。
5. **只问一次（AG04-5）。** 每个子目标记追问次数，到 1 就不再问：再不清楚就交付已确定的部分，写明还缺哪一项，子目标 `unfinished`（AE-AMB-007）。缺一项能写的，只就缺的那一项问，尽量给选项；一句话里清楚的照做，不清楚的单独处理，互不拖累（AE-AMB-011 第一轮）。
6. **归属由代码核对（AG04-4、AG04-5）。** `attributeMessage()` 吃第一层给的 `continues`，核对所指的事项确实在未结事项清单里且未结，否则当新委托。点选不经模型：带追问编号和所选编号，代码直接绑定到原子目标；所选编号必须在当时给出的候选里。点选先落库、按会话顺序处理，但不产生新委托（AE-AMB-008 委托数 2）。一句话同时回答追问并提新请求：回答部分恢复原委托的线程，新请求是本轮的委托，两边都有结果（AE-AMB-011）。用户不答而说别的：按新委托处理，原追问保留；隔两条无关消息或会话断开后搁置，原子目标改为 `unfinished`（AE-AMB-010 只隔一条，仍是 `awaiting_clarification`）。有卡未决时要求改卡，归到该卡，改卡本身在 AG06。
7. **暂停与恢复可重复（AG04-4）。** `clarify` 用 `interrupt` 暂停，线程编号仍是 `requestId`。恢复后回到 `route`（AG05 起也可回到 `resolve`），不重跑 `understand`，不新增模型调用，不重复发同一条追问；检查点里只有引用和进度。点击决定不恢复图。

## 范围与文件

- 读取：上面的必读文件；AG03 REPORT 只读交接段；AG05 已合回时读它的 `references/authorize.ts` 接口。
- 新建（目录按 CONVENTIONS 第 1 节）：
  - `features/agent-v1/clarify/next-step.ts`：`decideNextStep()`，§3.11 六行。
  - `features/agent-v1/clarify/options.ts`：`optionsFor()`，三处来源、三个通用入口、中日英固定标签。
  - `features/agent-v1/clarify/default-readings.ts`：各类记录登记的默认只读动作与“最可能的一种”的顺序。
  - `features/agent-v1/clarify/attribution.ts`：`attributeMessage()`，五种归属与点选绑定。
  - `features/agent-v1/graph/nodes/clarify.ts`：生成追问、`interrupt` 暂停、恢复。
  - 测试 `tests/agent-v1/{clarify-next-step,clarify-options,clarify-attribution,clarify-pause-resume}.test.ts`；暂停恢复用本机测试库上的检查点，先跑 `node scripts/assert-local-test-databases.mjs`。
  - 评测侧，AG00 没覆盖的才补，放 `tests/agent-eval/`：`understand` 处的 `mistag_write`（带 `quote`）；运行器 `select` 步骤接到点选接口。
- 修改：AG03 的 `graph/build.ts`、`graph/state.ts`（加 `clarify` 节点与边、追问次数）、`route/decide.ts`（不清楚的子目标交给 `decideNextStep()`）、`context/session-state.ts`（未结事项的五种类型与搁置）、`graph/nodes/deliver.ts`（写追问、方向、理解说明；删去 AG03 的简易追问）、`understand/prompt.ts`（`clarity`、`readings`、`continues` 的说明）；AG01 的发送入口加点选输入；`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts` 加点选与可点方向的传输结构，并做 App 同步。
- 排除：判断模型与 `intent.explicitWrite` 复核（AG08）；业务记录读取（AG05）；写入提议、改卡、出卡（AG06）；两端显示方向与追问的界面（AG07）；@ 选择器（AG11）；旧运行时的关键词边界。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG04-1 | 读不出需求时零数据读取，回一句没看懂并给可点的方向，方向都是 Orbit 能做的事。 | `tests/agent-v1/clarify-next-step.test.ts`、`clarify-options.test.ts`（无上下文恰好三个通用入口、方向都在附录 A、读取桩计数 0）；门槛 AE-AMB-001、002 |
| AG04-2 | 陈述和假设不出卡；可附一个入口，用户点了才算提出。 | `clarify-next-step.test.ts`（写入标记与陈述标记冲突时按保守结果、点入口生成 `selection` 子目标）；门槛 AE-AMB-003、004、012 |
| AG04-3 | 只读的多种读法按最可能的做并写明理解；涉及写入的不猜，列出读法让用户选。 | `clarify-next-step.test.ts`、`clarify-options.test.ts`（四类默认读法、理解说明在开头、含写入的读法只问不做）；门槛 AE-AMB-005、006、009、010 |
| AG04-4 | 在追问下点选或用文字回答，原委托从该处恢复；一句话同时回答追问并提新请求时两者都被处理。 | `clarify-attribution.test.ts`、`clarify-pause-resume.test.ts`（点选不进模型、恢复后模型调用数不变、所选编号不在候选里被拒、一句两用）；门槛 AE-AMB-008、009、011 |
| AG04-5 | 每个子目标最多追问一次；用户不答而说别的，按新委托处理，原追问在两条消息后搁置。 | `clarify-attribution.test.ts`（问过一次不再问、一条后仍等、两条后 `unfinished`）；门槛 AE-AMB-007、010，及复跑 AG03 门槛里的 AE-CTX-006、008 |

每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件，登记 run-01、本页 SHA256、基线 HEAD；读 AG03 REPORT 交接段，把要改的 AG03 符号签名抄进追加记录；建 GitNexus 索引并逐个跑 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. 写四个测试文件里改变行为的失败用例。
3. `default-readings.ts` 与 `options.ts` → `next-step.ts` → `attribution.ts` → `clarify` 节点与暂停恢复 → 接入 `route`、`deliver`、会话级状态与发送入口的点选；契约改动同一提交做 App 同步。定向测试转绿。
4. 补评测侧的 `mistag_write` 与 `select` 接线，跑 `npm run agent-eval:check`；只用 dev 组调提示词。
5. 门槛：一次 `--gate AG04` 完整运行，再跑一次 `--gate AG03` 确认没有退步；评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md。不过就修复后两套整套重跑，最多两轮。
6. 收口集、typecheck、全量对照；路径限定提交到 `sprint/AG04-unclear-clarify-attribution`；写 REPORT，交出固定最终 SHA。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：改共享契约、改会话级状态与暂停恢复（重放不能多出模型调用或重复追问）、真实付费调用。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/clarify-next-step.test.ts tests/agent-v1/clarify-options.test.ts tests/agent-v1/clarify-attribution.test.ts tests/agent-v1/clarify-pause-resume.test.ts`。模型一律用桩。
- **操作链收口集**：上面四个文件；AG03 的五个 `tests/agent-v1/*.test.ts`（`route-decide`、`first-layer-context`、`graph-flow` 会被本 sprint 的改动波及）；AG01 发送入口的测试（按 AG01 REPORT）；`npx tsc --noEmit -p .`。`shared/` 改动同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。App 只收同步脚本写出的副本，不改别的文件。
- **门槛**：`npm run agent-eval:run -- --gate AG04`，包含 AMB 12 例（小账号 `base-v1`；登记表没有给 AG04 分配 SCL 用例）和不变量包（全部可见用例中标 `invariant: true` 的，判定口径以 AG00 REPORT 为准）。另跑 `npm run agent-eval:run -- --gate AG03` 一次，证明 UND、CTX 与 AE-SCL-001～003 没有退步。通过条件按 eval README 第 6 节。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；门槛里每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前的失败清单 `comm -13` 对比，只查新增项；stash 带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：真实 DeepSeek 调用每次完整运行 ≤30 元，本 sprint 累计 ≤150 元（含 AG03 门槛复跑），超出先停下报告；`costs.json` 的次数、token、余额差额写进 REPORT。判断模型和联网都是 0 次。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG04/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。都不进仓库。
- **不运行**：浏览器与 App 的界面验证（没改界面）；`--all` 与封存集；真实联网。

## 失败与交接

外部条件缺失（AG03 未完成、自检不过、余额不够跑两次门槛）先不启动；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、功能 SHA、命令与退出码、两次门槛的运行编号与评审结论、费用、契约同步结果、未完成与下一步。分支 `sprint/AG04-unclear-clarify-attribution` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- 与 AG05 并行时，两边都要改 `graph/build.ts`、`graph/state.ts`、`route/decide.ts`，不满足 RULES 第 2 节“文件不重叠”。本 sprint 对这三处只追加 `clarify` 相关的节点、边和字段；后合回的一边由协调者解决冲突，并在合并树重跑两边的收口集。若协调者认为冲突风险太大，改为先 AG05 后 AG04 顺序执行。
- 登记表的门槛只列 AMB ×12；本页加跑一次 AG03 门槛，是因为本 sprint 替换了 AE-CTX-006、008 所依赖的简易追问。
- 点选的传输形状、接到哪个接口，CONVENTIONS 没有约定；本页定为经 AG01 的发送入口落库、按会话顺序处理、不产生新委托，具体字段在 REPORT 登记，并请协调者补进 CONVENTIONS 第 4 节。
- “写入标记与陈述标记冲突时按保守结果”是本页在判断模型接入前的代码规则；AG08 接入 `intent.explicitWrite` 后替换保守分支，规则的触发条件不变。

## 启动核对记录（run-01，2026-11-16，Generator 追加）

原文不改。开工时本页 SHA-256 `54f8fe6707146135ea4e55197552f21df305d22ae7287908066b05fde7a56990`，基线 HEAD `323f6a432`（AG03 已合回，合并提交即此）。AG05 未开工，不并行。

**AG03 交付、本 sprint 改的符号（按 AG03 REPORT 交接段）：** `decideRoute(part, options)`、`statusForRoute(route)`、`settleDependencies(parts)`（`route/decide.ts`）；`buildFirstLayerContext(input)`（`context/build.ts`，本 sprint 未改）；`UnderstandOutput`／`UnderstandPart`（`understand/schema.ts`）；`AgentGraphState`、`GraphPart`（`graph/state.ts`）；`buildAgentGraph(scope)`、`runAgentGraph(deps, input)`（`graph/build.ts`）；`deliverNode`、`routeNode`、`understandNode`、`answerNode`（`graph/nodes/`）；会话级状态 `SessionOpenItem`（`context/session-state.ts`）；`createGraphExecutor(mode, overrides)`（`graph/executor.ts`）。LangGraph 版本沿用 AG03 锁定的 `@langchain/langgraph` 1.7.4，`interrupt()` 与 `Command({ resume })` 从同一包导入。

**与前序交接要点的出入：**

1. **AG01 的结果文档没有 `clarifications[]`。** 本页“前序交接要点”写的 `AgentResultDocument` 的 `clarifications[]` 在 AG01 并不存在（AG01 只交付了 `partResults[]`）。本 sprint 在契约里新增可选的 `clarifications`（一组可点方向一项），App 副本同步。
2. **点选的接口。** 本页“Planner 记录的出入”第 3 条请 REPORT 登记字段：沿用协议 3 的 `POST /api/ai/conversations`，请求体带 `selection: { requestId, clarificationId, optionId }` 和去重键 `clientSelectionId`；先落库、按会话顺序处理、接回原委托，不产生新委托；所选不在候选里或这组方向已关闭返回 409，`error.context.reason` 写明原因。
3. **AG03 的两项遗留和一项运行器缺口**（协调者交代）一并在本 sprint 做：搁置时回写旧委托文档（遗留 2）、替代方案文案（遗留 3，经 `optionsFor()`）、运行目录 `report.md` 列出“已评、从 AGnn 起计入”的评审项。
4. **门槛**：按 CONVENTIONS §3、§8，本 sprint 门槛是 `--gate AG04 --seed-cards`（AMB ×12、顺延来的 CTX-006/008，加不变量包）。本页步骤 5 另跑一次 AG03 门槛的要求照做，作为没有退步的证据。
5. **GitNexus**：`.gitnexus/run.cjs` 读不到索引；用 `npx -y gitnexus@latest analyze --index-only --force` 重建后可用（增量建索引退出码 1，强制重建成功）。
