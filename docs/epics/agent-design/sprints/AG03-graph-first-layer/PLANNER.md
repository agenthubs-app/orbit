# Sprint AG03 — 流程骨架与第一层

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R03（第一层：拆子目标、承接三结论、上文四样），门槛按 AG-R19。**单一目标:** `ORBIT_AGENT_V1_MODE=on` 时，新入口的一条消息由 LangGraph 图处理：`intake → understand → route → answer → deliver`；第一层拆出子目标，代码给每项定承接结论和去向，普通讨论一次调用直接回答；不读业务记录、不提写入；主模型调用名改为 `deepseek-flash`。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00–AG02 未开工）。启动时填实际 HEAD 与 AG02 的合并 SHA，读 AG00、AG01、AG02 REPORT 的交接段核对下文。
**进入条件:** ① AG02 completed 并已合回 `orbit-agent-claude`。② 产品批准沿用设计稿“2026-11-15 已定的事项”（主模型 `deepseek-flash`、编排底座 LangGraph TypeScript、评测方式），不再逐项索要。③ 真实 DeepSeek 调用已允许，上限按 CONVENTIONS 第 6 节。④ `npm run agent-eval:env` 自检通过：本机库 `orbit_agent_eval`、评测端口 3100、`ORBIT_AGENT_PROVIDER=deepseek`、评测环境有 `DEEPSEEK_API_KEY`、DeepSeek 余额够跑一次门槛；能从 npm 安装依赖。⑤ 不动界面，无需视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿和用例在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§3 开头流程图；§3.1 承接判据与“其余转换”；§3.3 预算；§3.9 节点表、“状态里放什么”、“预算由代码守”；§3.10 四样上文；附录 A 取值与能力清单；附录 C `UnderstandOutput` 及其后的校验清单。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`（仓库根）：目录、开关、评测命令、交接表。
- `features/orbit-ai/gemini-provider.ts`：:20 默认名仍是 `deepseek-v4-flash`；:270 默认超时 20 秒；:360 未显式指定时按 gemini → deepseek → openai 选第一个有密钥的，所以新适配器必须显式传 `deepseek`；:418–428 DeepSeek 读 `ORBIT_DEEPSEEK_MODEL`；:1199–1223 DeepSeek 请求体是一条 system 加一条 user，`jsonOutput` 打开 `response_format: json_object`；:882 旧规划器把最近 8 条历史 `JSON.stringify` 成一段文字。
- `features/orbit-ai/live-agent-runtime.ts`：旧运行时一轮一个 intent，最多 3 步（:53）；:56 `OrbitAgentLocale` 只有 `en | zh`，:168 日语被归到英文，新图要自己处理中日英。`off` 时它的行为不变。
- `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`：:42 历史窗口 12；:161 `getSessionPage`；消息带 `createdAt` 和 `references`（:276 `normalizeMessage` 保留其余字段），空闲时长从最后一条消息的 `createdAt` 算。
- `features/orbit-ai/reliable-send-service.ts`：:413–420 旧路径把历史压成 `{role, content}`，丢了时间和引用，新上文不走这条。
- `features/orbit-ai/ai-session-reference-authorization.ts`：只核对联系人引用；`intake` 调它。
- `features/orbit-ai/agent-tools/registry.ts`：线上 9 个只读工具，对应附录 A 末段的能力映射；本 sprint 不调用。
- `shared/contract/ai-sessions.ts`：:1 引用类型只有 `contact | event | note`。
- `shared/storage/live-record-store.ts`、`shared/storage/live-database-config.ts`：会话级状态的存储；检查点连同一个本机库。
- `scripts/test-paid-ai-boundary.mjs`：`npm test` 拦下 DeepSeek、Gemini、OpenAI 三个主机，开发测试一律用桩。
- `package.json`：没有任何 `@langchain/*` 依赖（已核对），本 sprint 加。
- 用例（仓库根 `docs/epics/agent-design/eval/`）：`cases/UND.yaml`、`cases/CTX.yaml`、`cases/SCL.yaml` 的 AE-SCL-001～003；夹具对话 `world/regular-v1.yaml` 的 `RCV01`、`world/large-v1.yaml` 的 `LCV01`（带 `shownList`、`lastMentioned`、`openItems`）。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。下面的引用数来自文本搜索。
- `export const DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL = "deepseek-v4-flash" as const;`（gemini-provider.ts:20）：3 个文件，另两处是 `features/events/event-operations/ai-provider.ts:682`、`features/events/post-event-artifact/provider-config.ts:27`，改名会一起生效。
- `export async function runOrbitAgentModelText(input: {`（:1320）：16 个非测试文件；只调用不改。
- `export function resolveOrbitAgentModelProviderSelection(`（:360）：4 个非测试文件；不改。
- `export async function runLiveOrbitAgentRuntime(`（live-agent-runtime.ts:1526）：8 个非测试文件；不改。
- `export const ORBIT_AGENT_CHAT_HISTORY_WINDOW = 12;`：2 个非测试文件；不改，新上文另取 10 条。
- `export async function authorizeAiSessionContactReferences(input: {`：3 个非测试文件；只调用。
- AG01 里处理阶段调用旧运行时的那个函数：名字按 AG01 REPORT，改之前 impact。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 AG00–AG02 的 REPORT 核对，不一致就追加更正记录）
- AG00：`observability/trace.ts` 的 `emitTrace(event)`；评测命令；本机库快照；对外连接守卫；`fault` 注入机制（本 sprint 在 `understand` 处接 `malformed_once`、`malformed_always`）；不变量包的判定口径；夹具对话怎样落库。
- AG01：`entry/` 的 `acceptMessage()`、`getRequestResult()`、`cancelCurrentRun()`；会话按序处理；契约 `AgentRequestStatus`、`AgentResultDocument`、`AgentPartResult`；`ORBIT_AGENT_V1_MODE`。处理部分现接旧运行时，本 sprint 在 `on` 时改接图。
- AG02：新入口上的 Todo 直写和文字确认已关闭，`decideAction()` 只接按钮。本 sprint 不出卡；文字“好”只用来接受替代方案，不进决定接口。

### 易错边界（每条对应一项验收）
1. **去向由代码定（AG03-2）。** 模型只给 `requiredCapabilities`、`dataSources`、`deliverable`、`clarity`、`constraints`、`dependsOn`；`verdict`、`route`、`waitReason` 由 `decideRoute()` 按附录 A 和 §3.1 判据算出，模型自带的这类字段丢弃。`external.deepResearch` → `convert` + `suggest_external_agent`；缺数据所有者授权 → `decline` + `explain_limit`，不建议换途径；“一直找下去”→ `convert` + `offer_alternative`，子目标 `awaiting_acceptance`、委托 `waiting_user`。用户下一句用文字接受（AE-UND-012）：第一层标 `continues: alternative`，代码核对它在未结事项里，记下 `acceptedAlternativeRef`；不调决定接口，不建规则，不说已建好。话题是否商业、要不要联网都不单独决定去向。
2. **原话、否定与先后（AG03-1）。** `sourceQuote` 必须是本轮原话的子串（只规整首尾空白），否则进修复；`constraints` 里有否定或假设（“先别改”“don't add”“もし”）的子目标不得落到 `propose_write`；转述别人的命令按讨论处理（AE-UND-006）。`dependsOn` 不成环；前置没完成的子目标标 `waiting_dependency`（AE-UND-008）。
3. **普通讨论只调一次（AG03-3）。** `plainChat` 为真、且代码判定全部子目标都是 `answer` 时才展示 `reply`，不再调第二次。整张图在本 sprint 没有业务记录读取的路径，`intake` 核对 @ 联系人除外。
4. **上文四样（AG03-4）。** 只有第一层看上文：最近 10 条消息只给文字，长的助手回答截短并保留它引用的记录编号；未结事项清单；上一份清单（编号＋名称）；每类最近提到的一条（编号＋名称）。记录正文不进上文（AE-CTX-004 的两句只在 M31 正文里）。空闲超过 60 分钟后前三样不给模型，“上次提到的那位”只留给代码排在追问候选第一位；未结事项不受影响。只有本轮消息能产生子目标。`referenceId` 只能是本轮已授权的 @ 引用或上文给出的编号；活动、笔记引用要到 AG05 才有授权，本 sprint 不当作已授权引用。做不了的子目标用代码文案复述要做的事和绑定对象的名称，不编内容（AE-CTX-001、002 的评审项看这句）。
5. **最小的追问与搁置（AG03-4；完整版在 AG04）。** 要写入的子目标缺对象（AE-CTX-006 的“他”、AE-CTX-008 的“it”）时去向 `clarify`、`waitReason: object_ambiguous`，由 `deliver` 写一条追问，委托停在 `waiting_user`，候选只取会话里记下的对象。追问没被回答、用户又发了两条无关消息，按 §3.10 搁置，原子目标改为 `unfinished`。点选绑定、`interrupt` 恢复、`optionsFor()` 留给 AG04。
6. **检查点只放引用和进度（AG03-4）。** 线程编号用 `requestId`；检查点里没有记录正文、上文原文和模型原始输出。
7. **修复一次，预算由代码守（AG03-5）。** 每进模型节点先核对本轮已用次数，默认上限 4（含至多一次修复），部署侧更低的值优先（`model-budget-1` 压到 1）；单节点超时 15 秒。到上限就去 `deliver`：代码已定的（如建议外部 Agent）照常交付，需要模型的标 `unfinished`，写明是这一轮的次数用完了。修复后仍不合规，如实说这次没处理成，不硬编回答。
8. **模型、语言与故障点（AG03-3、AG03-5）。** `models/main.ts` 显式用 DeepSeek，调用名取 `ORBIT_DEEPSEEK_MODEL`，未设时 `deepseek-flash`；每次请求和响应经 `emitTrace` 记 `model.request`、`model.response`，带 `source`。回复语言由代码按本轮原话定：含假名为日语，有汉字无假名为中文，其余英文；固定文案备齐三种。故障注入只在 `ORBIT_AGENT_EVAL=1` 时存在。

## 范围与文件

- 读取：上面的必读文件；AG00–AG02 REPORT 只读交接段。
- 新建（目录按 CONVENTIONS 第 1 节）：
  - `features/agent-v1/graph/state.ts`（`AgentGraphState`）、`graph/build.ts`（五节点与条件边）、`graph/checkpointer.ts`（LangGraph 的 Postgres 检查点，连本机库）、`graph/nodes/{intake,understand,route,answer,deliver}.ts`。这里的 `answer` 只写不用私有材料的讨论回答；带引用的回答与 `answer/` 目录在 AG05。
  - `features/agent-v1/models/main.ts`：主模型适配，经 `runOrbitAgentModelText` 发出，显式 DeepSeek、JSON 输出、15 秒超时、计次、追踪、评测故障点。
  - `features/agent-v1/understand/{schema,prompt,validate}.ts`：`UnderstandOutput` 与附录 C 的校验、一次修复。
  - `features/agent-v1/context/{build,session-state}.ts`：`buildFirstLayerContext()`；会话级状态（上一份清单、最近提到的记录、未结事项、无关消息计数），存通用记录表的新集合。
  - `features/agent-v1/route/{capabilities,decide,handoff-copy}.ts`：附录 A 能力清单、`decideRoute()`、外部 Agent 建议、无权限说明、替代方案、未完成说明的中日英固定文案。
  - 测试 `tests/agent-v1/{understand-validate,route-decide,first-layer-context,graph-budget,graph-flow}.test.ts`。
  - 评测侧，AG00 没覆盖的才补，放 `tests/agent-eval/`：`understand` 处的 `malformed_*` 故障、单轮调用上限的设置项、夹具对话的会话级状态种子映射。
- 修改：`package.json`、`package-lock.json`（加 `@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres` 及它们要求的 `@langchain/core`，锁定版本写进 REPORT）；`features/orbit-ai/gemini-provider.ts:20` 默认名改为 `deepseek-flash`（CONVENTIONS 第 2 节）；AG01 处理阶段的接线（`on` 时改调图，`off` 照旧）；结果文档要加子目标原因字段时，改 `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 并做同步。
- 排除：业务记录读取与 `domains/`（AG05）；`probe`、`propose`、`resolve`、`freeze` 节点与写入提议（AG06）；`clarify` 节点、点选、恢复、§3.11 六种情况（AG04）；判断模型（AG08）；联网（AG09）；旧运行时和旧入口的行为；两端界面；在生产库建表、部署、push。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG03-1 | 一句含三件事的话被拆成三个子目标，各自的原话引用是原句的子串，否定和先后关系保留。 | `tests/agent-v1/understand-validate.test.ts`（非子串进修复、否定进 `constraints`、成环被拒）；门槛 AE-UND-001、002、003、008、010 |
| AG03-2 | 每个子目标的承接结论和去向符合设计稿 §3.1 的判据，包括建议外部 Agent 和无权限两种。 | `tests/agent-v1/route-decide.test.ts`（附录 A 表驱动，模型自带结论被丢弃，文字接受替代方案零决定）；门槛 AE-UND-001、004、006、007、008、009、011、012 |
| AG03-3 | 普通讨论直接回答，日志里没有私有读取，也没有写入提议。 | `tests/agent-v1/graph-flow.test.ts`（模型桩计数 1、读取 0、写提议 0、`off` 时走旧运行时）；门槛 AE-UND-005、006、AE-SCL-001 |
| AG03-4 | 上文按 §3.10 取：指代能解析；空闲超过 60 分钟后不猜对象；旧消息里的请求不被再次执行。 | `tests/agent-v1/first-layer-context.test.ts`（10 条、截短留编号、59／61 分钟两侧、正文不进上文、两条无关消息后搁置、检查点无正文）；门槛 AE-CTX-001～008、AE-SCL-001～003 |
| AG03-5 | 模型输出不合规时最多修复一次；到调用上限就交付已确定的部分并列出未完成项。 | `tests/agent-v1/graph-budget.test.ts`（修复一次、上限 4 与 1、15 秒超时）；门槛 AE-UND-013、014 |

每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件，登记 run-01、本页 SHA256、基线 HEAD；读 AG00–AG02 REPORT 的交接段，有出入就在本页追加更正；建 GitNexus 索引，对 `DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL` 和 AG01 的处理接线跑 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. 装 LangGraph 依赖；写五个测试文件里改变行为的失败用例。
3. 依次实现 `models/main.ts`、`understand/`、`route/`、`context/`、`graph/` 与检查点，再接到 AG01 的处理位置；改默认模型名；定向测试转绿。
4. 补评测侧的故障点、调用上限设置和种子映射，跑 `npm run agent-eval:check`；只用 dev 组用例调提示词，val 组不逐例修补（eval README 第 8 节）。
5. 门槛：一次 `--gate AG03` 完整运行 → 评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md；不过就修复后整套重跑，最多两轮。
6. 收口集、typecheck、全量对照；路径限定提交到 `sprint/AG03-graph-first-layer`；写 REPORT，交出固定最终 SHA。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：新依赖与新的处理路径、真实付费调用、共享的默认模型名（活动两处也读它）。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/understand-validate.test.ts tests/agent-v1/route-decide.test.ts tests/agent-v1/first-layer-context.test.ts tests/agent-v1/graph-budget.test.ts tests/agent-v1/graph-flow.test.ts`。模型经 `fetchImplementation` 注入桩，测试边界会拦真实主机。
- **操作链收口集**：上面五个文件；`tests/capabilities/orbit-agent-provider-auto-selection.test.ts`、`tests/capabilities/orbit-agent-gemini-live.test.ts`；读默认名的 `tests/capabilities/event-operations-ai-provider.test.ts`、`tests/capabilities/event-operations-scale.test.ts`、`tests/events/r27-e3-post-event.test.ts`；AG01 入口的测试（按 AG01 REPORT）；`npx tsc --noEmit -p .`。改了 `shared/` 时，同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- **门槛**：`npm run agent-eval:run -- --gate AG03`，包含 UND 14 例与 CTX 8 例（小账号 `base-v1`）、AE-SCL-001～003（常规、较大账号），以及不变量包（全部可见用例中标 `invariant: true` 的，判定口径以 AG00 REPORT 为准）。通过条件按 eval README 第 6 节：同一次完整运行里全部通过，不变量全过，此前通过的不退步。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；门槛里每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前的失败清单 `comm -13` 对比，只查新增项；stash 栈与其他 worktree 共享，stash 要带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：真实 DeepSeek 调用每次完整运行 ≤30 元，本 sprint 累计 ≤150 元，超出先停下报告；`costs.json` 的次数、token、余额差额写进 REPORT。判断模型和联网本 sprint 都是 0 次。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG03/run-01/` 放命令输出、impact 结果、全量对比；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。都不进仓库。
- **不运行**：App 测试和浏览器验证（没改界面；只在改了 `shared/` 时跑四个同步测试）；`--all` 与封存集（AG18）；真实联网（本 sprint 没有联网路径）。

## 失败与交接

外部条件缺失（AG02 未完成、自检不过、余额不够跑一次门槛）先不启动；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、功能 SHA、命令与退出码、运行编号与评审结论、费用、依赖版本、未完成与下一步。分支 `sprint/AG03-graph-first-layer` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- 登记表给 AG03 的节点只有五个，但 AE-CTX-006、008 要求本 sprint 发出追问并在两条无关消息后搁置，这与 AG04 的范围重叠。本页取最小做法（易错边界 5），AG04 在其上补 `clarify` 节点与恢复。
- 单轮调用上限的部署设置（`model-budget-1` 用到）和 `understand` 故障点不在 CONVENTIONS 第 2 节的开关表里；新增开关先由协调者登记到 CONVENTIONS，再在 REPORT 里写明名字。
- 改 `DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL` 会同时改变活动运营和会后产物两处的默认模型。CONVENTIONS 要求改默认值，本页照做；impact 若为 HIGH/CRITICAL，先报告再改。

## 启动核对记录（run-01，2026-11-16，Generator 追加）

开工时本页 SHA-256 `0d50396d8b55d62b8accc3b8b2b0ad84951078043ccd29921601d5471f41e8f1`，基线 HEAD `c0b7bd8e5`（AG02 合并）。原文不改，以下按 CONVENTIONS §4、§8、SPRINTS.md 与 AG00–AG02 REPORT 核对后补记：

1. **门槛用例数**：SPRINTS.md 登记表是 UND ×14、CTX ×6、SCL ×3。CONVENTIONS §8 已把 CTX-006、CTX-008 顺延到 AG04，所以本页“CTX 8 例”与易错边界 5（追问与搁置）不进 AG03 门槛；最小的追问与“两条无关消息后搁置”仍实现并有开发测试，完整版留给 AG04。
2. **评测端口**：进入条件 ④ 写的 3100，按 CONVENTIONS §2 为 3110。
3. **AG01 的接线点**：处理阶段的 `execute` 由 `createLegacyRuntimeExecutor` 换成 `createGraphExecutor`（`features/agent-v1/graph/executor.ts`），AG02 的 `runWithConfirmBoundary` 仍包在外面。
4. **评审项级 gate**：协调者交代 AE-ENT-003 R3（`gate: AG03`）计入本门槛；运行器的 `--gate` 扩成也选带本 sprint 评审项 gate 的用例（README §3.3 补一句，CHANGES.md 登记）。
5. **AG02 遗留**：运行器对重发点击的记录（BND-003 seq 331/332）按服务端应答记，先写测试。
6. **`--seed-cards`**：CONVENTIONS §3 写“只给 AG02 用”，但 BND ×12 作为不变量进本门槛，AG06 之前只有预置卡这条出卡途径，本 sprint 的门槛照样加 `--seed-cards`（REPORT 登记，需协调者确认 CONVENTIONS 的写法）。
