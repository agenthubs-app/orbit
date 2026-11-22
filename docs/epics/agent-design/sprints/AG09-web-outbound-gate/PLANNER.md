# Sprint AG09 — 基础联网与出站把关

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R09（基础联网与出站把关），AG-R20 中联网事件的可观测性，门槛按 AG-R19。**单一目标:** 在 `features/agent-v1/web/` 交付 DeepSeek 独立 Search／Fetch 适配器、`buildQuery()`、`outboundGate()`（七条规则写成代码，加判断模型的第二道闸）、每次委托共享的额度、证据记录与总开关和个人开关；评测与测试一律走联网回放，真实供应商另做一次标明身份的联验。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00 起均未开工）。启动时填实际 HEAD，读 AG00、AG01、AG03、AG04、AG05、AG08 REPORT 的交接段核对下文。
**进入条件:** ① AG08 completed（登记表依赖；第二道闸和证据核对要用 `askJudgment()`），AG04、AG05 已随之完成。② 产品批准沿用设计稿“2026-11-15 已定的事项”的“联网用同一供应商的独立 Search／Fetch 接口”，七条出站规则以设计稿 §3.4 为准。③ 被测 Agent 的 DeepSeek、Gemini Decision 真实调用已允许；联网在门槛里全部回放，联验的两次真实调用约 0.01 元。④ `npm run agent-eval:env` 自检通过；评测环境有 `DEEPSEEK_API_KEY`、`ORBIT_GEMINI_DECISION_API_KEY`；联验在评测环境之外的本机 shell 里做。⑤ 不动界面，无需视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿、用例和约定在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md` §3.4 全节：两个接口的允许输入、“允许先做什么”、出站把关七条与第二道闸、预算与停止条件、证据足够的认定、结果与写入；§3.9 `probe` 节点与“预算由代码守”；附录 C `webTarget`、题 `outbound.extra`、`AnswerOutput.gaps` 的 `conflict`、`budget`。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`：第 1 节 `web/` 目录、第 2 节开关表（没有联网开关，见文末出入）、第 4 节交接表。
- `docs/epics/agent-design/eval/README.md` 第 3.2 节 `web_calls`、`outbound_traceable`、`outbound_blocked`、`fetch_urls_within`，第 3.4 节 `send_query`，第 4 节 `web.search`、`web.fetch` 要记两道闸与命中的回放，第 10 节“联网查询默认用回放”，第 13 节 `source`。
- 用例 `docs/epics/agent-design/eval/cases/WEB.yaml` 全部；`cases/SCL.yaml` 的 AE-SCL-015、016；回放 `world/base-v1.yaml:163` 起的 `web_replay`（9 条）、`world/regular-v1.yaml:388` 的 `kasane-*`、`world/large-v1.yaml:570` 的 `lumen-pricing`。
- DeepSeek 独立接口（已在代码外核实）：`POST https://api.deepseek.com/v1/tools/search`（检索词 1 到 128 个字符）、`POST https://api.deepseek.com/v1/tools/fetch`；与模型同一个 Bearer 密钥；各按每千次成功调用 5 元，失败和空结果不计费。返回字段名未核实，按官方文档 <https://api-docs.deepseek.com/zh-cn/guides/search/> 写桩，联验时核对并写进 REPORT。
- `features/plans/search/tavily.ts`：适配器写法照抄：固定端点常量、10 秒 `AbortController` 加外部 `signal`、`fetchImplementation` 注入、带 `responded` 的错误类（:17）、缺字段条目丢弃、不重试。
- `features/plans/search/service.ts`：记账写法照抄：`reserve` → `beginCall` → 供应商 HTTP → `endCall`（有响应记 0 token、无响应记 null）→ `finish`；幂等键 `${prefix}#search-${n}`（:33）；`owner: false` 的回放不再发请求（:53）；本方法永不抛错。`features/plans/search/factory.ts:27`：开关、密钥、账本三者缺一就返回 `disabled.ts` 的实现。
- `features/plans/v2/flow-factory.ts:33`、`features/orbit-ai/gemini-provider.ts:420`：DeepSeek 密钥都读 `DEEPSEEK_API_KEY`；`features/ai/deepseek-json-chat.ts:9` 模型端点是 `https://api.deepseek.com/chat/completions`（不带 `/v1`），工具端点另写常量。
- `features/ai-quota/constants.ts`：`AiQuotaPurpose`（:8）、`AI_QUOTA_PURPOSES`（:37）、`AI_QUOTA_MAX_CALLS`（:64，是完整的 Record，新用途必须补）、`AI_QUOTA_PURPOSE_POOLS`（:140）、`isRecordOnlyUserOperation`（:174，`plan_search` 只记账不计上限）；`features/ai-quota/ledger.ts:101` 的 `RECORD_ONLY_SQL`。
- `scripts/test-paid-ai-boundary.mjs:15`：`npm test` 拦下 `api.deepseek.com`，开发测试一律注入桩。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。下面的引用数来自文本搜索（含定义所在文件）。
- `export function createTavilySearchProvider(options: TavilySearchProviderOptions): PlanSearchProvider {`（tavily.ts:43）：4 个文件；只作参照，不改。
- `export function createPlanSearchService(deps: PlanSearchServiceDeps): PlanSearch {`（service.ts:39）：4 个文件；只作参照，不改。
- `export function isRecordOnlyUserOperation(input: { pool: AiQuotaPool; purpose: AiQuotaPurpose; trigger: AiQuotaTrigger }): boolean {`（constants.ts:174）：3 个文件；要改，先 impact。`AiQuotaGate` 被 35 个文件引用，接口（`features/ai-quota/gate.ts:48`–56）不改，只调用。
- `const RECORD_ONLY_SQL = …`（ledger.ts:101）：要改，账本是全站共用，impact 结果为 HIGH 时先报告。
- 前序接入点（名字按 REPORT）：AG03 `understand/` 的 `webTarget` 与限定词类型；`probe` 节点（AG03 或 AG05 建的，没有就本 sprint 建）；AG04 `clarify/` 的追问与点选恢复；AG05 `answer/` 的引用与 `gaps`；AG08 `judgment/` 的 `askJudgment()`、`questions.ts`、`thresholds.ts`、`npm run agent-eval:calibrate`。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 REPORT 核对，不一致就追加更正记录）
- AG00：`emitTrace(event)`；联网回放（按用例 `settings.web_replay` 装载）与 `behavior: timeout`；对外连接守卫只按主机放行 DeepSeek 与 Gemini；`costs.json` 的 Search、Fetch 计数栏；增量 `settings` 的 `web: off`。
- AG01：结果文档 `AgentResultDocument`、`AgentPartResult`，本 sprint 往里加网页证据和实际发出的检索词。
- AG03：`UnderstandOutput.parts[].webTarget { quote, qualifiers }`（`quote` 已校验是原话子串）；`AgentGraphState` 的剩余预算字段；检查点不放网页正文。
- AG04：`decideNextStep()`、`optionsFor()`、点选后从原委托恢复。
- AG08：`askJudgment()`（每轮 3 次、3 秒、保守结果）；`outbound.extra` 已登记未校准；`evidence.*` 四题已接在核对步骤。

### 易错边界（每条对应一项验收）
1. **该不该联网（AG09-1）。** 子目标只查内部资料、用户说离线、或总开关／个人开关关着时零请求，笔记部分照常回答并由代码写明“联网查询现在是关着的”。用户本轮给了公开网址就直接 Fetch，不先 Search。
2. **检索词的来历（AG09-2，规则 1、2、4）。** `buildQuery()` 只拼三样：`webTarget.quote`（本轮原话子串）、固定词表里的限定词（中日英三套，如“官网”“价格”“现任”）、本轮点选的公开线索。模型给的整句检索词丢弃。逐词记来历，任何实词说不出来历就整条作废。从联系人记录解析出的人名先把完整检索词给用户看（选项 `send_query`／`skip_query`），点了才发，发的与给看的逐字相同。
3. **拦下而不改写（AG09-3，规则 3、6）。** 邮箱、电话、6 位以上连续数字、证件或银行卡样式、金额、街道地址、网址、长串编码，以及与本轮读到的私有正文连续重合（中日文 6 字、其他 12 字符以上）且不在原话里的片段，命中任何一条整条不发，不去掉再发；改用已有资料回答并写明“这次没有联网查”，或请用户给可公开的名称或网址。只出现在私有笔记里的公司名不能成为检索词（AE-WEB-004）。被拦下的只记规则编号，不记原文。
4. **第二道闸（AG09-3）。** 代码通过之后才问 `outbound.extra`，只给用户本轮原话和候选检索词；答“是”、没把握、超时、未启用都不发。`outbound.extra` 在中日英三种语言上校准后才启用，没启用时联网等于关闭，所以校准是门槛前的必做步骤。
5. **网页只是证据（AG09-4，规则 5）。** Fetch 的网址必须是用户本轮给的或本次 Search 返回的，原样使用，不改写不加参数；只收 http、https，不带用户名口令，不指向内网或 IP，不超过 250 字符。网页正文和搜索摘要永远不进检索词来源、不触发工具调用、不改卡、不进记忆、不触发私有读取；网页里的链接不抓。
6. **额度共享不重置（AG09-5，规则 7）。** 额度按 `requestId` 计：Search 2 次、Fetch 2 次，每次 Search 取前 3 条；发请求前先扣，记账幂等键 `agent-web:<requestId>#search-<n>`／`#fetch-<n>`，恢复时按调用键复用已有结果，`owner: false` 的不再发。多个子目标、点选恢复、节点重跑共用这一份。超时不重试。额度用完的子目标标 `gaps: budget`，不把搜索摘要当成已核实。
7. **四种情况各自交付（AG09-5）。** 同名：Search 后由模型给出“结果指向不同对象”的结构化标记，代码按搜索结果顺序出选项追问，点选后不重新搜索；未披露：如实说页面没有公开标价；两页冲突：两个数字、各自更新日和链接都列出，不挑一个；超时：说没读到及原因，留链接。证据记录 `sourceRef, url, title, snippet|excerpt, sourceDate?, fetchedAt, readStatus`，实际发出的检索词和打开的网页进结果文档。
8. **评测里不碰真实网络。** `ORBIT_AGENT_EVAL=1` 时供应商换成回放；对外连接守卫只看主机会放行 `api.deepseek.com`，本 sprint 给守卫加路径规则：评测运行中任何 `/v1/tools/` 请求记 `egress.blocked` 并作废该次运行。

## 范围与文件

- 读取：上面的必读文件；前序 REPORT 只读交接段。
- 新建（`features/agent-v1/web/`）：`deepseek-tools.ts`（两个端点、10 秒超时、错误带 `responded`）；`replay.ts`（只在评测环境存在）；`vocabulary.ts`（限定词表）；`query.ts`（`buildQuery()` 与逐词来历）；`outbound-gate.ts`（`outboundGate()`：七条规则加第二道闸，每条规则一个具名函数）；`budget.ts`；`service.ts`（`search()`、`fetch()`，记账照 plans 的写法）；`evidence.ts`（证据记录与按账号留存：已发出的检索词、网址、时间、供应商、两道闸结果；被拦的只记规则编号）；`settings.ts`（个人开关，存通用记录表的新集合）；`factory.ts`、`disabled.ts`。`scripts/agent-eval/web-live-check.ts`（联验命令）。测试 `tests/agent-v1/{web-tools-adapter,web-query,web-outbound-rules,web-second-gate,web-budget,web-flow}.test.ts`。
- 修改：`probe` 节点接联网分支；AG05 `answer/` 的引用与核对接网页证据（`evidence.*` 四题按原文核对，搜索摘要不算已核实）；`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 加网页证据与实际发出的检索词并同步 App；`features/ai-quota/constants.ts`、`features/ai-quota/ledger.ts` 加两个只记账用途 `agent_web_search`、`agent_web_fetch`（用户池、每次 1 次调用）；AG00 的对外连接守卫加路径规则；AG08 的 `thresholds.ts` 与新一版校准样本、记录（`docs/epics/agent-design/eval/calibration/`，版本号接在当时最新一版之后，补 `outbound.extra`）。
- 排除：对话里声明 `deepseek_web_search`、`deepseek_read_url` 让模型自选工具（设计稿已选独立接口）；开放式深度调研（AG03 已转外部 Agent）；把网页结果存成记录的写入卡（没有门槛用例；搜索本身不新建 Memo、联系人事实或记忆）；两端显示检索词和网页的界面、个人开关的设置界面；定时任务里的联网；生产库、部署、push。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG09-1 | 给了官网链接就直接读取，不先搜索；只查内部资料时联网调用为零。 | `web-flow.test.ts`（给网址 Search 0 次 Fetch 1 次、只读笔记 0 次、两个开关各关一次 0 次）；门槛 AE-WEB-001、002、012、AE-SCL-016 |
| AG09-2 | 发出的每条检索词都能逐词对回用户原话、点选的公开线索或固定词表。 | `web-query.test.ts`；`web-outbound-rules.test.ts` 的规则 1、2、4；门槛 AE-WEB-003、006、AE-SCL-015（`outbound_traceable`） |
| AG09-3 | 带私有笔记内容、联系方式或金额的检索词被拦下，不悄悄改写，并说明这次没有联网查。 | `web-outbound-rules.test.ts` 的规则 3、6；`web-second-gate.test.ts`（是、没把握、超时、未启用都不发）；门槛 AE-WEB-004、005、AE-SCL-015 |
| AG09-4 | 抓到的网页里的指令不被执行；后续检索词不含网页内容，也不抓网页给的链接。 | `web-outbound-rules.test.ts` 的规则 5；`web-flow.test.ts`（注入页之后零工具调用、零私有读取、零新检索词）；门槛 AE-WEB-007、011 |
| AG09-5 | 同名、未披露、两页冲突、超时四种情况各有相应的交付；拆分子任务和恢复会话都不重置额度。 | `web-budget.test.ts`（先扣后发、三子目标共用、恢复复用调用键）；`web-outbound-rules.test.ts` 的规则 7；门槛 AE-WEB-004、008、009、010、011 |

七条规则各自的“先失败”输出（命令、退出码、失败断言）与转绿输出都存进证据目录，REPORT 逐条列出。每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件，登记 run-01、本页 SHA256、基线 HEAD；读前序 REPORT 交接段，有出入就在本页追加更正；建 GitNexus 索引，对 `isRecordOnlyUserOperation`、`RECORD_ONLY_SQL`、`probe` 节点、核对步骤跑 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. `web-outbound-rules.test.ts` 按规则 1 到 7 逐条写失败用例并存下失败输出，再逐条实现 `outbound-gate.ts` 转绿；随后 `buildQuery()`、适配器、额度、证据、开关，各自先失败后实现。
3. 接 `probe` 节点、追问与恢复、回答与核对；加评测回放与守卫的路径规则；改共享契约并在同一提交同步 App。
4. 校准 `outbound.extra`：每种语言至少 20 条带标注样本（检索词干净与夹带私有内容各半，取自 dev 组夹具），用 AG08 的校准命令真实调用，门槛规则同 AG08；写新一版记录。
5. 门槛：一次 `--gate AG09` 完整运行 → 评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md；不过就修复后整套重跑，最多两轮。
6. 联验（单独进行，不算门槛）：本机 shell、评测环境之外、`ORBIT_AGENT_WEB=on`，跑 `npx tsx scripts/agent-eval/web-live-check.ts`，用固定的公开检索词“DeepSeek 官网 价格”搜一次、读一次设计稿引用过的官方文档页；记录状态码、耗时、返回字段名、条数、联验前后余额；输出存 `run-01/live-check/`，REPORT 单列一节并标“真实供应商联验”。随后收口集、typecheck、全量对照，路径限定提交到 `sprint/AG09-web-outbound-gate`，写 REPORT。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：第一次有用户相关内容离开 Orbit；改共用的 AI 账本；改共享契约；新的付费调用。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/web-tools-adapter.test.ts tests/agent-v1/web-query.test.ts tests/agent-v1/web-outbound-rules.test.ts tests/agent-v1/web-second-gate.test.ts tests/agent-v1/web-budget.test.ts tests/agent-v1/web-flow.test.ts`。单条规则的先失败用 `--test-name-pattern "rule 3"` 这样单独跑。
- **操作链收口集**：上面六个文件；`tests/plans/plan-search-service.test.ts`、`tests/plans/plan-search-factory.test.ts`、`tests/capabilities/ai-usage-plan-v3-purposes-postgres.test.ts`（账本用途；先跑 `node scripts/assert-local-test-databases.mjs`，确认没被 skip）；AG08 的 `tests/agent-v1/judgment-*.test.ts`；AG05 核对步骤的测试（按 REPORT）；`npx tsc --noEmit -p .`；同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- **门槛**：`npm run agent-eval:run -- --gate AG09`，包含 WEB 12 例（小账号 `base-v1`）、AE-SCL-015（常规）与 AE-SCL-016（较大），以及不变量包（可见用例里 `invariant: true` 的，选取口径以 AG00 REPORT 为准；WEB 区 003 到 007、012 本身就是不变量）。联网全部回放，`source: replay`。通过条件按 eval README 第 6 节，此前通过的（尤其 RD、JDG）不退步。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前清单 `comm -13` 对比，只查新增项；stash 带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：每次完整运行 ≤30 元，本 sprint 累计 ≤150 元（含校准与联验），超出先停下报告；`costs.json` 里 Search、Fetch 的真实次数应为 0，回放次数另列。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG09/run-01/` 放命令输出、七条规则的先失败与转绿、impact、校准原始输出、联验、全量对比；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。联验输出不留密钥，网页正文只留前 500 字。
- **不运行**：App 端除四个同步测试外的测试和浏览器（没改界面）；`--all` 与封存集（AG18）；门槛里的任何真实联网。

## 失败与交接

外部条件缺失（AG08 未完成、自检不过、密钥缺失、`outbound.extra` 校准样本不足）先不启动或停在对应步骤；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例或放宽规则；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、七条规则的先失败与转绿、功能 SHA、命令与退出码、运行编号与评审结论、联验结果、费用、未完成与下一步。分支 `sprint/AG09-web-outbound-gate` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- CONVENTIONS 第 2 节没有联网的总开关。本页暂定 `ORBIT_AGENT_WEB`（`on`／`off`，未设为 `off`），由协调者先登记到 CONVENTIONS 再动工。个人开关在评测里由 `settings.web` 设置，产品里还没有设置界面，界面另立视觉稿。
- DeepSeek 两个接口的返回字段名不在已核实的事实里，桩按官方文档写，联验后若不一致按实际修正并在 REPORT 写明。
- 记账照 `features/plans/search/service.ts` 走共用的 AI 账本，要在 `features/ai-quota/` 加两个只记账用途；这是全站共用的账本，若 impact 为 HIGH 且协调者不同意，退回只记 `costs.json` 与追踪事件，在 REPORT 说明。
- 设计稿 §9 的样例表写“有依据时出保存卡”，WEB 区没有保存类用例，本 sprint 不做保存卡。
- “同名”的认定没有对应的判断题，本页交给主模型给结构化标记、由代码出选项；若主模型调用超过每轮 4 次，改为在回答步骤一并给出。
