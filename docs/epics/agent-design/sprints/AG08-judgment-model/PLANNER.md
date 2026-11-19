# Sprint AG08 — 判断模型接入

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R08（判断型步骤：先过滤再判断、门槛、降级），AG-R20 中判断事件的可观测性，门槛按 AG-R19。**单一目标:** 在 `features/agent-v1/judgment/` 交付 Gemini Decision 适配器 `askJudgment()`、附录 C 题目清单、按题按语言的门槛配置与校准记录、四步收窄的 `funnel()`；把证据核对、写入意图复核、重复判断三处接进现有流程；超时与不可用按固定规则降级。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00 起均未开工）。启动时填实际 HEAD，读 AG00、AG03、AG04、AG05、AG06 REPORT 的交接段核对下文。
**进入条件:** ① AG05 completed（登记表的依赖）；另需 AG04、AG06 completed：AE-JDG-006/007 要用 AG04 的可点入口，AE-JDG-008 要用 AG06 的 Memo 新增准备与追问，缺任一项不启动（见文末出入）。② 产品批准沿用设计稿“2026-11-15 已定的事项”的“判断型步骤用 Gemini Decision 1，先用规则过滤再判断”。③ 被测 Agent 的 DeepSeek 与 Gemini Decision 真实调用已允许，上限见“费用”。④ `npm run agent-eval:env` 自检通过；评测环境有 `ORBIT_GEMINI_DECISION_API_KEY` 与 `DEEPSEEK_API_KEY`；对外连接守卫放行 `generativelanguage.googleapis.com`。⑤ 不动界面，无需视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿、用例和约定在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md`：§3.8 全节（用途表、四步收窄、置信度、引文、数据与失败）；§3.11“写入要有明确的指令”；附录 C 判断题清单（11 题，是非题类型名 `noul`）；§3.3 判断调用另设上限（每轮 3 次、每次 3 秒）。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`：第 1 节 `judgment/` 目录、第 2 节 `ORBIT_GEMINI_DECISION_API_KEY`、第 4 节交接表。
- `docs/epics/agent-design/eval/README.md` 第 3.2、3.4 节（`judgment_question`、`judgment_candidates_max`、fault 的 `low_confidence`、`mistag_write`、增量 `judgment-uncalibrated-match`）、第 4 节 `judgment.request/response` 要记的字段、第 13 节 `source` 与费用。
- 用例 `docs/epics/agent-design/eval/cases/JDG.yaml` 全部；`cases/SCL.yaml` 的 AE-SCL-013、014；夹具 `world/base-v1.yaml` 的增量 `contacts-2000`、`later-interaction`。
- Gemini Decisions 接口（已在代码外核实）：`POST https://generativelanguage.googleapis.com/v1beta/decisions`，请求头 `x-goog-api-key`，请求体 `{model: "gemini-decision-1", input: [{type: "text", text}], questions: {<名>: {type: "noul" | "choice" | "score", instructions, criteria}}}`，返回每题答案、置信度与用量。
- `features/plans/search/tavily.ts`：单次 HTTP 的写法照抄：`AbortController` 超时加外部 `signal`、`fetchImplementation` 注入、带 `responded` 的错误类（:17）、缺字段的条目丢弃。`features/ai/deepseek-json-chat.ts:42` 用量解析的写法。
- `features/events/event-recommendation-tool.ts`：`matchScore`（:257，未导出：状态 20、每命中一词 15、有关系上下文 10、有准备建议 10、未开始 15，封顶 100）与 `compareCandidates`（:361，分数降序再按 `startsAt` 字符串）可作活动的规则粗排参考。注意 `tokensFor`（:133）只在非字母处切分，一整句中文或日文会成为一个词，中日文粗排不能靠它。
- `features/orbit-ai/contact-recommendation-matching.ts`：只包一层 `createContactsRecommendationSearchTool` 并改方法名；真正的打分在 `features/contacts/contact-recommendation-search.ts`：`rankedRelevance`（:432，身份字段命中 ×3 加证据命中最多 2）、`betterRankedItem`（:443，同分时返回 false，比较不稳定）、条数封顶 10（:273）、没有覆盖范围。两千候选的截断和计数必须在 `funnel()` 里自己做。
- `features/orbit-ai/task-write-authorization.ts:17`：现有的疑问、假设、否定词表（如果、假如、会不会、`if`、`suppose`），写入意图复核的触发判据从这里取。
- `scripts/test-paid-ai-boundary.mjs:15`：`npm test` 拦下 `generativelanguage.googleapis.com`，开发测试一律注入 `fetchImplementation` 桩。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。下面的引用数来自文本搜索（含定义所在文件）。
- `export function matchedTokensForText(`（event-recommendation-tool.ts:173，参数 `text: string, query: string`，返回 `readonly string[]`）：4 个文件；只调用，拉丁词粗排可复用。
- `export function createEventsRecommendationTool(`（:542）：6 个文件（产品 1 个 `features/orbit-ai/live-artifact-task-service.ts`，测试 4 个）；不改。
- `export function createContactRecommendationMatcher(input: {`（contact-recommendation-matching.ts:137）：3 个文件；不改。
- `export function taskWriteAuthorization(message: string): TaskWriteAuthorization {`（task-write-authorization.ts:13）：3 个文件；不改，只读它的词表或抽出共用常量（抽出前先 impact）。
- 前序 sprint 的接入点（名字按 REPORT）：AG05 `answer/` 的 `verifyCitations()`；AG04 `clarify/` 的 `decideNextStep()`、`optionsFor()`；AG06 `propose/` 的 `resolveIntents()`、`freezeCard()` 与 `memo`、`todo` 的 `prepare`；AG03 `graph/` 的节点表。每个都先 impact 再改。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 REPORT 核对，不一致就追加更正记录）
- AG00：`observability/trace.ts` 的 `emitTrace(event)`；fault 注入（`where: judgment` 的 `timeout`、`fail_always`，以及本区提出的 `low_confidence`）；增量的 `settings` 覆盖（`judgment_uncalibrated`）；`costs.json` 的判断模型计数；对外连接守卫。
- AG03：`graph/` 的图与 `AgentGraphState`；`understand/` 的 `UnderstandOutput`（`clarity`、`deliverable`、`intentBasis`、`rankingBasis`）；`models/main.ts` 的每轮 4 次上限。
- AG04：`clarify/` 的 `decideNextStep()`、`optionsFor()`；被标成写入的陈述在 AG04 不复核、直接按保守结果处理（AE-AMB-012 的注释），本 sprint 在它前面加复核。
- AG05：`domains/registry.ts` 与五类记录的 `read`；“最近互动”视图；`answer/` 的 `AnswerOutput` 与 `verifyCitations()`。
- AG06：`propose/` 的 `OperationIntent`、`resolveIntents()`、`freezeCard()`；`todo`、`memo` 的 `prepare`；Memo 的 `interaction` 字段。

### 易错边界（每条对应一项验收）
1. **先过滤再判断，覆盖范围写明（AG08-1）。** `funnel()` 四步：硬条件（权限、时间、地点、状态、用户明说的排除，代码）→ 规则粗排（代码）→ 截断（对话每次最多 50、定时任务每期最多 30，常量写在代码里）→ 一次判断请求答完全部入选候选。结果带 `coverage { total, afterHardConditions, judged, truncated }`，回答由代码模板写出“细看了 N 位、还有 M 位没细看”，不说成全库前几。中日文粗排用第一层 `rankingBasis` 的词与候选字段的双字重合，拉丁词用 `matchedTokensForText`。主模型调用数与候选数无关（≤4）。送判断的片段只含这道题要的字段，邮箱、电话不进。
2. **规则能分出先后就不调（AG08-2）。** 排序依据只有时间、截止日、距上次往来天数这类字段时，在第 2 步结束；是否含语义成分由代码按第一层给的依据类型判定，不问模型。
3. **门槛与未校准（AG08-3）。** 门槛按“题号 × 语言（zh、ja、en）”配置并带版本；缺一格就是该题该语言未启用：不发这道题，按“判断不可用”处理。低于门槛的答案一律落到 §3.8 用途表里的保守结果。置信度不授予写入权限，也不代替点击。评测用的“未校准”覆盖只在 `ORBIT_AGENT_EVAL=1` 时生效。
4. **超时与不可用（AG08-4）。** 每次请求 3 秒超时；没有密钥、HTTP 失败、超时、本轮 3 次额度已用完，都按不可用：排序交付规则粗排的顺序，并由代码写明“这次没有做主题匹配”；复核类题按保守结果；委托照常 `completed`，不说成没有合适的。同一用途的多道题合在一次请求里。
5. **写入意图复核（AG08-5）。** 第一层把子目标标成写入、而原话命中疑问或假设词表、或者不含已登记的写入动词时，问 `intent.explicitWrite`；答“否”、没把握、不可用都按陈述处理：不出卡、零写入，附一个 `optionsFor()` 给出的已登记入口（如“记到小林的往来里”）。用户点选的入口（`intentBasis: selection`）不复核。
6. **重复判断不自动合并（AG08-3）。** Memo、Todo 新增在 `prepare` 前，代码先按同一联系人、同一天、同一种往来方式筛出疑似重复，再问 `duplicate.same`；有把握的“不同”才继续出卡，“同一件事”指回已有记录并给“仍然新增”入口，“说不准”或低于门槛就追问核对，选项含“不是同一次，仍然新增”。
7. **拒收与留痕（AG08-1）。** 返回里不在本次题目里的名字、重复项一律丢弃并记 `judgment.response` 的拒收数；每次调用记题目版本、候选数、截断数、输入 token、耗时、低于门槛的比例，带 `source`。判断模型不参与评测打分。

## 范围与文件

- 读取：上面的必读文件；前序 REPORT 只读交接段。
- 新建（`features/agent-v1/judgment/`）：`gemini-decision.ts`（单次 HTTP，3 秒超时，错误带 `responded`）；`questions.ts`（附录 C 的 11 题：编号、类型、选项、题目文字与版本、各题保守结果）；`thresholds.ts`（门槛配置与版本、未启用判定、评测覆盖）；`ask.ts`（`askJudgment()`：每轮额度、门槛、保守结果、拒收、追踪）；`funnel.ts`（`funnel()` 与覆盖范围）；`sentences.ts`（把原文切成带编号的句子，供 `quote.sentence` 和 AG10 复用）；`intent-review.ts`（触发判据与复核）。`scripts/agent-eval/calibrate-judgment.ts`（校准命令）；校准样本 `docs/epics/agent-design/eval/calibration/judgment-samples-v1.yaml` 与校准记录 `docs/epics/agent-design/eval/calibration/judgment-thresholds-v1.md`（仓库根）。测试 `tests/agent-v1/{judgment-adapter,judgment-ask,judgment-funnel,judgment-thresholds,judgment-intent-review,judgment-duplicate}.test.ts`。
- 修改：AG03 的 `graph/` 加 `functions` 节点的最小版本（只做挑选与按字段排序，调 `funnel()`；AG10 在同一节点换成 `rankCandidates()`）；AG05 `answer/` 的核对步骤接 `evidence.*` 四题；AG04 `clarify/` 或 AG03 `route/` 接写入意图复核；AG06 `memo`、`todo` 的新增准备接重复判断；AG00 运行器缺 `low_confidence` 时在 `tests/agent-eval/` 补上；结果文档要加覆盖范围字段时改 `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 并同步；`package.json` 加 `agent-eval:calibrate`。
- 排除：`rankCandidates()`、没给标准时问一轮、自然顺序与稳定键（AG10）；`interaction.happened`、`followup.owner` 的校准与启用（AG10）；`outbound.extra` 与网页证据（AG09）；定时任务接入（AG15，30 的上限只写常量与单测）；旧运行时和现有推荐工具的行为；两端界面；生产库、部署、push。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG08-1 | 候选两千个时送入判断的不超过上限，结果写明覆盖了多少、截掉多少；模型调用次数不随候选数增长。 | `judgment-funnel.test.ts`（2008 个候选送判断 ≤50、定时 ≤30、`coverage` 四个数、判断请求 1 次、主模型桩计数不变、拒收不存在的名字）；门槛 AE-JDG-001、AE-SCL-013、AE-SCL-014 |
| AG08-2 | 纯按时间或日期的排序不调判断。 | `judgment-funnel.test.ts`（依据只有日期时 `askJudgment` 桩 0 次）；门槛 AE-JDG-002、AE-JDG-003 |
| AG08-3 | 低于门槛的答案落到保守结果；没有校准过门槛的题目不启用。 | `judgment-thresholds.test.ts`、`judgment-duplicate.test.ts`（逐题低于门槛的保守结果、缺格即不发题）；门槛 AE-JDG-005、AE-JDG-008；校准记录 `judgment-thresholds-v1.md` |
| AG08-4 | 判断超时或不可用时按规则顺序交付并说明没做主题匹配；复核类按保守结果处理。 | `judgment-adapter.test.ts`（请求体与请求头、3 秒超时、非 2xx、无密钥）、`judgment-ask.test.ts`（额度用完）；门槛 AE-JDG-004、AE-JDG-007 |
| AG08-5 | 像陈述的话被主模型标成写入请求时，经判断复核后不出卡。 | `judgment-intent-review.test.ts`（触发与不触发各一组、三种保守情形零卡）；门槛 AE-JDG-006、AE-JDG-007 |

每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件，登记 run-01、本页 SHA256、基线 HEAD；读前序 REPORT 交接段，有出入就在本页追加更正；建 GitNexus 索引，对上文接入点逐个 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. 写适配器、题目、门槛、`askJudgment()` 的失败用例，再实现；HTTP 全部用桩。
3. 写 `funnel()` 的失败用例（两千候选、30 上限、纯日期、超时退回粗排），实现后接进 `functions` 节点的最小版本。
4. 三处接入：核对步骤、写入意图复核、重复判断，各自先有失败用例。
5. 校准：从 dev 组用例的三个夹具世界取样，每题每种语言至少 20 条带标注样本，用真实调用跑 `npm run agent-eval:calibrate`；门槛取样本上“非保守答案零误判”的最低置信度，样本不足 20 条的格子不启用；val 组只用来核对，不据它调门槛。记录写明样本数、门槛、覆盖率、模型名与日期。
6. 门槛：一次 `--gate AG08` 完整运行 → 评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md；不过就修复后整套重跑，最多两轮。随后收口集、typecheck、全量对照，路径限定提交到 `sprint/AG08-judgment-model`，写 REPORT，交出固定最终 SHA。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：新的付费调用路径；写入意图复核决定出不出卡，重复判断决定出不出新增，都在写入链路上；核对步骤改变已通过的读取用例的输出。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/judgment-adapter.test.ts tests/agent-v1/judgment-ask.test.ts tests/agent-v1/judgment-funnel.test.ts tests/agent-v1/judgment-thresholds.test.ts tests/agent-v1/judgment-intent-review.test.ts tests/agent-v1/judgment-duplicate.test.ts`。
- **操作链收口集**：上面六个文件；AG04、AG05、AG06 被改动处的测试文件（按 REPORT）；`tests/services/orbit-ai-task-interaction.test.ts`（若抽出了词表）；`npx tsc --noEmit -p .`。改了 `shared/` 时，同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- **门槛**：`npm run agent-eval:run -- --gate AG08`，包含 JDG 8 例（小账号 `base-v1`）、AE-SCL-013（常规）与 AE-SCL-014（较大），以及不变量包（可见用例里 `invariant: true` 的，选取口径以 AG00 REPORT 为准）。通过条件按 eval README 第 6 节：同一次完整运行里全部通过，不变量全过，此前通过的（尤其 RD、XL、AMB）不退步。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。Gemini Decision 不参与评审。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前清单 `comm -13` 对比，只查新增项；stash 栈与其他 worktree 共享，stash 带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：每次完整运行 ≤30 元，本 sprint 累计 ≤150 元（含校准），超出先停下报告；判断模型按输入 token 折算，DeepSeek 记余额差额；次数与 token 写进 REPORT。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG08/run-01/` 放命令输出、impact、校准原始输出、全量对比；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：App 测试与浏览器（没改界面；只在改了 `shared/` 时跑四个同步测试）；`--all` 与封存集（AG18）；联网（AG09）。

## 失败与交接

外部条件缺失（前序未完成、自检不过、密钥缺失、余额不够跑一次门槛）先不启动；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例或调低门槛；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、功能 SHA、命令与退出码、运行编号与评审结论、校准记录摘要、费用、未完成与下一步。分支 `sprint/AG08-judgment-model` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- 登记表只写 AG08 依赖 AG05，但 AE-JDG-006/007 需要 AG04 的可点入口，AE-JDG-008 需要 AG06 的 Memo 新增准备；本页把 AG04、AG06 列为进入条件。登记表写可与 AG07 并行，AG07 本身依赖 AG06，两者不冲突。
- 交接表把 `rankCandidates()` 和 `functions/` 目录给了 AG10，但 AE-JDG-001～005 与 AE-SCL-013/014 要求本 sprint 就能端到端挑选和排序；本页只在 `graph/` 加 `functions` 节点的最小版本调 `funnel()`，不建 `functions/` 目录。
- `sentences.ts` 不在交接表里，AG10 的提取要复用它；建议协调者把它补进 CONVENTIONS 第 4 节 AG08 一行。
- 证据核对的四道题没有门槛用例直接检验，只靠单测和已通过的 RD 用例不退步；`interaction.happened`、`followup.owner`、`outbound.extra` 三题本 sprint 只登记、不校准，分别由 AG10、AG09 校准后启用。

## 启动核对（Generator run-01，2026-11-17，追加；上文原样保留）

- 本页开工时 SHA-256 `60279d954764199686f0c3eb68ba735289e12d85caf4826361639efdf29dbaad`；基线 HEAD `d3805e8fe`（AG04～AG07 已合回，评测并行 `--workers N` 与 requestId 归属修正已合回）。run-01。
- 进入条件：AG04、AG05、AG06 completed 并已合回；`.env.agent-eval` 有 `ORBIT_GEMINI_DECISION_API_KEY` 与 `DEEPSEEK_API_KEY`（只查了长度，未打印）；真实接口 2026-11-17 实测可用。
- 与前序 REPORT、真实接口对照的更正：
  1. **AG03 没有交付 `rankingBasis`**：第一层输出里没有这个字段。本 sprint 在 `UnderstandPart` 加可选的 `rank`（`count`、`basis`、`within`、`orderBy`、`direction`），`basis` 即附录 C 的 `rankingBasis`（source 为 turn），代码按原文核对；提示版本升到 `understand@ag08.1`。
  2. **Gemini Decisions 的实际形状**与上文“已在代码外核实”的描述不同处：题目编号只收 `[A-Za-z0-9_-]{1,64}`（`match.level` 发成 `match_level__c1`）；`choice` 的 `criteria` 是“选项 → 说明”的对象；`score` 的 `criteria` 是 2～255 个等级名的列表，返回期望等级 `score`、按等级序号的 `probabilities` 与 `legend`；`noul` 不收 `criteria`，返回 `noul`（“是”的概率）；每个答案有 `confidence`；用量是 `usage.total_input_tokens`。50 题一次请求约 0.6 秒。
  3. **`sentences.ts`**：AG05 已在 `features/agent-v1/text/sentences.ts` 交付按句切分，本 sprint 不另建 `judgment/sentences.ts`。
  4. **事件的筛选读取**：AG05 的事件读取只按编号读；排序要列出全部可见的平台活动，本 sprint 在记录读取里加 `listEvents()`，由 functions 节点按可见性和日期过滤。
  5. **评测并行**：门槛与复跑一律 `--workers 4`（CONVENTIONS §3），一次一个运行。
- 门槛：`npm run agent-eval:run -- --gate AG08 --workers 4`（JDG ×8、SCL-013/014 与不变量包）；AG07、AG06、AG05、AG04、AG03 门槛各复跑一次（`AG0x-gate-rerun-at-AG08`）。另修 AG07 交接 (a)：回答里的记录条数必须出自本轮读取，否则删去该句（AE-UND-006）。
- GitNexus：`npx -y gitnexus@latest analyze --index-only --force` 重建成功；impact 用 `npx -y gitnexus@latest impact`。
