# Sprint AG08 — 执行总结（判断模型接入，H）

改了哪些文件看 git diff（`d3805e8fe..a628a1c84`），这里不逐文件复述。

## 结果

**run-02（协调者按做法 A 批准的例外重跑）：最终 SHA `a628a1c84` 上 AG08 门槛代码判定 50/50，AG07～AG03 五个复跑全过；全量 24 失败，与基线逐条相同。待评审（每次运行都已做 judge-pack）。** run-01 的经过保留在下文。

**run-01 已结束，两轮修复用完；最终 SHA `68d64e778` 上 AG08 门槛代码判定 48/50，五个复跑全过。没有交评审，待协调者决定是否开 run-02。**

- 不过的两例都是同一个原因：那一次真实 Gemini Decision 请求超过了 3 秒（3003 ms、3002 ms，被中止）。今天 56 次真实判断响应中位 572 ms、最慢的成功一次 2814 ms，只有这两次超时（`run-01/judgment-latency.txt`）。
  - **AE-JDG-008**：行为按设计——超时即不可用，落到“请用户核对”，问题与选项都对、零写入、等用户。但用例注入的 `low_confidence` 要等判断返回才生效，返回没来，运行器判 `fault_not_fired`。
  - **AE-SCL-014**：超时后按规则粗排交付，并写明没有做主题匹配；规则粗排把 Daniel Wee（Meridian Power Devices 的人事伙伴，公司名里有 Power）排进了前三，`listed` 不过。
  - 同一份代码在 `81ee38ede`、`a6d7678aa` 上的两次门槛和三次稳定性运行里，这两例都过了（判断按时返回）。
- run-02 可做的两点（都在代码里，不改用例）：① 粗排给职位、行业、标签、备注的命中更高的权重，公司名只算一半，这样没有判断时 SCL-014 的前三也是 LC17～LC19；② 判断请求超时、而本轮还有额度时重试一次（设计稿 §3.8 只写“超时按不可用”，重试要协调者认可）。

已验证能做到（开发测试里模型和判断都是桩；门槛和开发运行里 DeepSeek 与 Gemini Decision 都是真实调用）：

- **先过滤再判断，覆盖范围写明（AG08-1）。**
  - 新的 functions 节点（`graph/nodes/functions.ts`）接手“挑几位联系人／几场活动”的子目标，不调主模型。
  - 候选全部按账号范围从库里读；地点、行业（用户在排序依据之外说的）、日期、“有过往来”是代码的硬条件；再按排序依据与候选字段的重合粗排（中日文按两字片段，拉丁文按整词）；截到 50 个（定时任务常量 30）；一次 `match.level` 请求答完全部。
  - 回答由代码写：按什么挑的、“细看了 50 位，还有 1958 位没有细看（共 2008 位）”、不说成全部联系人里最合适；每位的理由只取记录里的公司、职位、地区、行业、标签、备注。
  - 发给判断的片段不含邮箱和电话（测试断言）。返回里不在本次题目里的编号丢弃并计入拒收数。
  - 主模型调用数与候选数无关：AE-JDG-001（2008 位）整轮主模型 1 次、判断 1 次。
- **规则能分出先后就不调（AG08-2）。** 排序只按开始时间或最近一次往来日期时，在粗排一步结束，判断 0 次（AE-JDG-002、AE-JDG-003）。只含时间词的依据（“最久没联系”“開始時間が早い順”）由代码认定为不需要理解。
- **门槛与未校准（AG08-3）。**
  - 附录 C 的 11 题全部登记（类型、选项、题目文字与版本、保守结果）。
  - 门槛按“题号 × 语言”配置并带版本（`judgment-thresholds@1`），由 `npm run agent-eval:calibrate` 对真实接口校准写出；缺格即不发题、按判断不可用处理。
  - 本 sprint 启用 9 格：`match.level`、`intent.explicitWrite`、`duplicate.same` × 中日英；其余 8 题登记但不启用（见校准记录）。
  - 评测的“未校准”覆盖（`judgment_uncalibrated`）只在评测钩子里生效（AE-JDG-005）。
  - 重复判断：同一联系人、同一天、同一种往来方式的已有笔记才送判断；有把握“不同”才出卡，“同一件事”指回原笔记并给“不是同一次，仍然新增”，说不准／低于门槛／不可用就追问（AE-JDG-008）。从不合并。
- **超时与不可用（AG08-4）。** 每轮最多 3 次判断请求，每次 3 秒；没有密钥、非 2xx、超时、额度用完、结构不对都按不可用。排序交付粗排顺序，代码写明“这次没有做主题匹配（…），这不代表没有合适的”，委托照常 completed（AE-JDG-004）；复核类按保守结果。
- **写入意图复核（AG08-5）。** 第一层标了写入、而原话像陈述／疑问／假设或不含已登记的写入动词时，问一次 `intent.explicitWrite`；答“否”、低于门槛、不可用都按陈述：不出卡、零写入，附一个代码写的入口（“把这件事记到小林的往来里”“把「给小林发修订报价」改到周五”）。复核只能拿掉写入，不能给出写入；用户点选的入口、否定、回应未结事项、跟在同句写入后面的补充值不复核（AE-JDG-006、AE-JDG-007）。
- **AG07 交接 (a)（AE-UND-006）。** 回答里说出的记录条数（“3件あります”“有 3 条”“you have 3 …”）必须出自本轮读取（读到的条数、计数、读到的文字或用户自己的话），否则删去那一句；讨论回答和第一层的直接回复也一样（`answer/counts.ts`）。

仍未实现或未验证：

- 证据核对四题与 `quote.sentence` 已登记并接进询问接口，但没有校准样本，本 sprint 不启用；核对步骤没有改变回答（PLANNER 出入第 4 条已预计“没有门槛用例直接检验”）。
- `interaction.happened`、`followup.owner`（AG10）、`outbound.extra`（AG09）只登记。
- 定时任务的 30 上限只有常量和单测（接入在 AG15）。
- 评审（协调者派）。

## 运行记录

- Generator：Claude Opus 5.5（Claude Code 子会话），2026-11-17，run-01；PLANNER revision 1，SHA-256 `60279d95…dbaad`；基线 `d3805e8fe`。
- 分支 `sprint/AG08-judgment-model`：`0e272a9a3`（主体）、`a6d7678aa`（stab2 发现的联系人线索）、`81ee38ede`（修复轮 1）、`68d64e778`（修复轮 2）、REPORT 提交。最终功能 SHA `68d64e778`；合并 SHA：等待协调者。
- 档位 H，收口 I。

开发与稳定性运行（都不交评审）：

| 运行 | SHA | 结果 |
|---|---|---|
| `20261117-170246-d3805e8-AG08-probe-before` | 开工前 | 5 例 0/5（看现状） |
| `20261117-174010-d3805e8-AG08-dev1` | 工作区 | 10/13（JDG-005、SCL-013、SCL-014） |
| `20261117-174715-d3805e8-AG08-dev2` | 工作区 | 13/13 |
| `20261117-175200-0e272a9-AG08-stab1` | `0e272a9a3` | 50/50 |
| `20261117-175425-0e272a9-AG08-stab2` | `0e272a9a3` | 49/50：AE-SCL-014 线索 “my contacts based in Singapore” 被当成一个人 → `a6d7678aa` |
| `20261117-175704-0e272a9-AG08-stab3` | `0e272a9a3` | 50/50 |

三次稳定性运行逐例比较（`run-01/stability-compare.txt`）：结果不同的只有 AE-SCL-014；调用次数不同的有 AE-BND-002、AE-JDG-006、AE-JDG-007、AE-UND-004（结果都相同）。

门槛与复跑（`--workers 4`，一次一个，`builtFromHead`，工作区只有构建改写的 `next-env.d.ts`）：

| 轮次 | SHA | 运行 | 代码判定 | 真实调用（主模型／判断） | 费用（元） |
|---|---|---|---|---|---|
| 第一次 | `a6d7678aa` | `20261117-181121-a6d7678-AG08-gate` | 50/50 | 89／6 | 0.349 |
| | | `…181350…-AG07-gate-rerun-at-AG08` | 43/43 | 84 | 0.324 |
| | | `…181555…-AG06-gate-rerun-at-AG08` | 47/47 | 93 | 0.383 |
| | | `…181807…-AG05-gate-rerun-at-AG08` | 43/43 | 79 | 0.309 |
| | | `…181959…-AG04-gate-rerun-at-AG08` | 37/37 | 67 | 0.278 |
| | | `…182145…-AG03-gate-rerun-at-AG08` | **38/39**：AE-UND-010 `private_reads_within`（第一层没给搜索词，读了所有笔记的最新一页）→ 修复轮 1 | 75（模拟 3） | 0.288 |
| 修复轮 1 | `81ee38ede` | `20261117-183408-81ee38e-AG08-gate` | 50/50 | 87 | 0.329 |
| | | `…183630…-AG07-gate-rerun-at-AG08` | **42/43**：AE-UIX-008（第二层把“Li Wei”也列为待办线索，AG07 的“另一种文字、此人唯一一条未完成待办”规则没有生效，改成了追问）→ 修复轮 2 | 83 | 0.328 |
| | | `…183835…-AG06-…`、`…184040…-AG05-…`、`…184236…-AG04-…`、`…184424…-AG03-gate-rerun-at-AG08` | 47/47、43/43、37/37、39/39 | 94、78、69、75 | 1.263 |
| 修复轮 2（最终） | `68d64e778` | `20261117-185503-68d64e7-AG08-gate` | **48/50**：AE-JDG-008 `fault_not_fired`、AE-SCL-014 `listed`（都是判断超时，见上） | 87／4 | 0.330 |
| | | `20261117-185724-68d64e7-AG07-gate-rerun-at-AG08` | 43/43 | 83 | 0.303 |
| | | `20261117-185923-68d64e7-AG06-gate-rerun-at-AG08` | 47/47 | 93 | 0.237 |
| | | `20261117-190136-68d64e7-AG05-gate-rerun-at-AG08` | 43/43 | 78 | 0.160 |
| | | `20261117-190331-68d64e7-AG04-gate-rerun-at-AG08` | 37/37 | 69 | 0.142 |
| | | `20261117-190522-68d64e7-AG03-gate-rerun-at-AG08` | 39/39 | 76（模拟 3） | 0.140 |

每次运行都做了 `agent-eval:judge-pack`（双评材料）。评审没有做（brief：Generator 不自评）。

付费调用：

- 评测运行（开发、稳定性、三轮门槛与复跑，共 24 次）：DeepSeek 真实调用 1,765 次，prompt 3,858,035 token、completion 726,526 token；Gemini Decision 真实请求 58 次、输入 115,414 token；合计约 6.40 元（`run-01/costs-all.txt`）。
- 校准：`agent-eval:calibrate` 跑了 3 次，每次 147 次 Gemini 请求、33,680 输入 token，合计约 101k token ≈ 0.07 元；接口探测 12 次左右，几百 token。
- 本 sprint 合计约 6.5 元，单次完整门槛运行（含判断）约 0.33～0.35 元，低于 30 元／150 元的上限。DeepSeek 余额现为 31.53 元。
- Gemini 的价格按 0.10 美元／百万输入 token 折算（未在计费页核实）。
- 没有 push、没有部署、没有碰正式库和远端库。

收口：

- 收口集（agent-v1、agent-eval、`tests/capabilities/agent-v1-*`，带本机 Postgres 测试库 `orbit_agent_v1_entry_test`，`assert-local-test-databases` 通过）：修复轮 2 后 433/433，0 skip（第一次 470/470，含 `tests/services` 一组）。
- `npx tsc --noEmit -p .`：只有原有的 `tests/scripts/redesign-pixel-lib.test.ts` 错误，新增 0。
- 全量 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`（`68d64e778`）：8717 例，24 失败，与 AG07 run-03 的 24 个基线名字逐条相同，新增 0、消失 0（`run-01/full-orbits-r2.log`）。`a6d7678aa` 那次多过一例 `event-registration-plan-sync`（负载下偶发，单独连跑 3 次都过，文件未改）。
- `agent-eval:check`：232 例，0 问题。没有改 `shared/`，App 同步与 App 测试不需要。

证据目录：`~/orbit-sprint-evidence/agent-design/sprint-AG08/run-01/`（impact、detect、校准原始返回、稳定性对照、全量日志、门槛输出）。评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/<运行编号>/`。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG08-1 候选两千个时送判断不超过上限、写明覆盖、调用数不随候选数增长 | 最终门槛 AE-SCL-014 不过（判断超时），其余证据通过；待评审 | `judgment-funnel.test.ts`（2008 候选送 50、定时 30、`coverage` 四个数、判断 1 次、主模型 1 次、拒收不存在的编号、不送邮箱电话）；门槛 AE-JDG-001、AE-SCL-013、AE-SCL-014 |
| AG08-2 纯按时间或日期排序不调判断 | 代码判定通过，待评审 | `judgment-funnel.test.ts`（只有日期时判断 0 次、只含时间词的依据不算主题）；门槛 AE-JDG-002、AE-JDG-003 |
| AG08-3 低于门槛落到保守结果、没校准的题不启用 | 最终门槛 AE-JDG-008 `fault_not_fired`（判断超时，行为仍是请用户核对），其余证据通过；待评审 | `judgment-thresholds.test.ts`（逐格低于门槛的保守结果、缺格即不发题、代码门槛与校准记录一致）、`judgment-duplicate.test.ts`、`judgment-ask.test.ts`；门槛 AE-JDG-005、AE-JDG-008；校准记录 `eval/calibration/judgment-thresholds-v1.md` |
| AG08-4 超时／不可用按规则顺序交付并说明、复核类按保守结果 | 代码判定通过，待评审 | `judgment-adapter.test.ts`（请求体与请求头、3 秒超时、非 2xx、无密钥、坏答案）、`judgment-ask.test.ts`（每轮 3 次额度）；门槛 AE-JDG-004、AE-JDG-007 |
| AG08-5 像陈述的话被标成写入、复核后不出卡 | 代码判定通过，待评审 | `judgment-intent-review.test.ts`（触发与不触发各一组；答否、没把握、不可用三种情形零卡、一个入口）；门槛 AE-JDG-006、AE-JDG-007 |

## 校准记录摘要

`npm run agent-eval:calibrate -- --write`，模型 `gemini-decision-1`，2026-11-17；每次 147 次真实请求、33,680 输入 token（共跑 3 次：初版、取整修正、按等级读评级题之后）。样本 `eval/calibration/judgment-samples-v1.yaml`：取自三个夹具世界里 dev 组用例的人物、活动和笔记，dev 每格 20～23 条，val 2～4 条。

| 题目 | zh | ja | en |
|---|---|---|---|
| `match.level`（“至少部分匹配”的概率） | 0.675 | 0.932 | 0.542 |
| `intent.explicitWrite`（“是”） | 0.951 | 0.933 | 0.883 |
| `duplicate.same`（同一件事／不同） | 0.833 | 0.873 | 0.822 |

dev 与 val 上都是零误判；采纳率（dev 上非保守且过门槛）见记录。未启用：证据四题、`quote.sentence`、`interaction.happened`、`followup.owner`、`outbound.extra`。

## 与 PLANNER 不同（CONVENTIONS／brief／真实接口优先）

1. **接口形状**（PLANNER 启动核对第 2 条）：题号只收 `[A-Za-z0-9_-]{1,64}`；`choice` 的 `criteria` 是对象、`score` 的是等级名列表、`noul` 不收；返回 `noul` 概率、`choice`、`score` 期望等级加按序号的概率；用量 `usage.total_input_tokens`。适配器按实测写，测试锁定。
2. **评级题按等级读**：只看最可能的一级时，AE-SCL-014 里“部分 0.46／匹配 0.43”的工艺整合负责人被落成“证据不足”，排在人事伙伴后面。改为取“至少某级”的累计概率与门槛比较、同级按模型的期望等级排（`ask.ts` `scoreDecision`），校准按同一读法重做；评级题门槛不低于 0.5。
3. **第一层加 `rank`**（启动核对第 1 条）：AG03 没有交付 `rankingBasis`。提示版本 `understand@ag08.1`。
4. **没有建 `judgment/sentences.ts`**：沿用 AG05 的 `text/sentences.ts`。
5. **新增文件**（PLANNER 文件表外）：`judgment/duplicate.ts`、`judgment/thresholds-config.ts`（校准命令写出）、`graph/nodes/functions.ts`（PLANNER 说“在 graph/ 加 functions 节点”）、`answer/counts.ts`（AG07 交接 (a)）、`tests/agent-eval/lib/patch-generator.ts`、`tests/agent-v1/judgment-kit.ts`、`answer-counts.test.ts`、`ag08-repair1.test.ts`。
6. **没有改 `shared/`**：覆盖范围放在已有的 `coverage`（`seen` = 细看数，`total` = 过了硬条件的数），四个数在 trace 的 `judgment.decided` 与 `functions.ranked`。App 同步不需要。
7. **`matchedTokensForText` 没有复用**：它所在的模块引入活动服务工厂，图里不引入；拉丁词粗排用同样的整词规则自写。
8. **评测侧改动**（不是用例改动）：`low_confidence` 故障（判断返回的置信度和各级概率压成 0）；`judgment` 故障点；`judgment_uncalibrated` 部署设置；夹具增量 `generate.contacts`（`contacts-2000`：2000 位联系人、各一条有往来的笔记，固定种子，经产品写入链路，单例约 37 秒）；`judgment_question`、`judgment_candidates_max` 两个判定；`costs.json` 记 Gemini 输入 token（`total_input_tokens`）并按 0.10 美元／百万 token（设计稿 §3.8 引官方说明，7.2 汇率）折算，价格表出新版本 `2026-11-17.1`，`verified` 仍为 false。
9. **内部词扫描**：`judgment/questions.ts` 的题目文字只发给判断模型，加进 `ag07-no-internal-words.test.ts` 的 MODEL_ONLY 名单。
10. **测试顺序**：适配器、题目、门槛、`askJudgment`、`funnel` 的测试和实现同批写成；stab2、AG03 复跑与 AG07 复跑暴露的三处，先在运行里看到失败，再补测试后修。
11. **两轮修复都是复跑里的退步**（AE-UND-010、AE-UIX-008），都改成代码规则，不改提示词：笔记清单没有搜索词时按这一句自己的词搜（`listSearchWords`）；只是人名的待办线索不参与“另一种文字”的判断。

## 影响分析

- 改前跑的 upstream impact（`run-01/impact-1.txt`）：HIGH 为 `validateUnderstandOutput`、`decideNextStep`（只加可选字段／可选的 `reviewed` 标记）；`understandSystemPrompt`、`routeNode`、`buildAgentGraph`、`newRun`、`proposeNode`、`optionsFor`、`answerNode`、`resolveNode`、`createGraphExecutor`、`understandNode`、`verifyNode`、`deliverNode`、`partLine` 为 LOW；`prepare` 同名多个为 UNKNOWN，已用文本搜索确认只改了 `graph/nodes/clarify.ts` 的入口一行。
- 修复轮 1 的 `resolveNode`（LOW）、`clueSearchWords`（HIGH，未改，只被新函数调用）是改后才跑的，如实记录。`PartWrite.picks`、`applyResolution` 的 `pickFor` 加了一个可选键，未单独跑 impact，已用文本搜索补查调用方。
- 修复轮 2 的 `resolveTodo` 改前跑了 impact：HIGH（3 处），改动只是去掉“只有人名”的线索，受 `ag08-repair2.test.ts` 与 AG06/AG07 既有测试覆盖。
- detect-changes（`--scope staged`）：四次提交都是 low、受影响流程 0；第二次提交第一遍因索引没有新文件不算干净，重建索引后重跑为 low。

## 交接

- `features/agent-v1/judgment/`：
  - `askJudgment(access, budget, { purpose, language, input, items: [{ key, question, subject }], coverage? })` → `{ sent, unavailable, verdicts: Map<key, { answer, raw, confidence, threshold, fallback, reason, expected? }>, rejected, inputTokens, durationMs }`；每轮预算 `newJudgmentBudget()`（3 次），在 `AgentGraphRun.judgment`。
  - `funnel({ candidates, hard, basis, order, mode, count, judge })` → `{ ordered, coverage { total, afterHardConditions, judged, truncated }, matched, semantic, unmatchedReason }`；常量 `CONVERSATION_CANDIDATE_LIMIT = 50`、`SCHEDULED_CANDIDATE_LIMIT = 30`。
  - `needsIntentReview()`、`reviewWriteIntent()`；`possibleDuplicates()`、`judgeDuplicate()`；`rankJudgmentInput`、`intentJudgmentInput`、`duplicateJudgmentInput`（校准与产品共用）。
  - 门槛：`thresholdFor(id, language)`，配置 `thresholds-config.ts` 只由 `npm run agent-eval:calibrate -- --write` 写；新题或新语言要先加样本（每格 dev ≥ 20）再校准。
- `graph/nodes/functions.ts`：`rankDomainOf()`、`functionsDue()`；AG10 在同一节点换成 `rankCandidates()`。记录读取多了 `listEvents()`。
- 图依赖 `deps.judgment = { apiKey, fetchImplementation, thresholds? }`；执行器从 `ORBIT_GEMINI_DECISION_API_KEY` 取，与主模型共用可停止的 fetch。**部署前要把密钥配到 Vercel 与 `.env.local`**（目前只在 `~/.zshrc` 和 `.env.agent-eval`）。
- trace：`judgment.decided`（每次请求）、`functions.hard_conditions`、`functions.ranked`、`route.intent_review`、`judgment.duplicate`、`answer.unsourced_counts_dropped`、`resolve.own_words`。
- 回退：不合并，或 revert 合并提交；`ORBIT_AGENT_V1_MODE=off`。去掉密钥则所有判断按不可用（保守）。
- 需要协调者决定：是否开 run-02（见“结果”开头的两点做法）。留给后续：证据核对四题的样本与启用；`match.level` ja 门槛 0.932 偏高，采纳率 10/22，可在 AG10 加样本后重校。

## run-02（2026-11-17，协调者批准的例外重跑）

协调者的四项决定与处理：

1. **判断超时不重试**，照设计按不可用；规则顺序本身要给出对的结果。没有加重试。
2. **AE-SCL-014 的粗排**：职位、行业、标签、备注的命中算 2，名字、地区、公司名里的命中算 1（`FIELD_WEIGHT`，`ruleScore` 按字段取最高权重）。测试用 run-01 的原样：判断不可用（请求不返回、到时中止），Daniel Wee（HR Business Partner，Meridian Power Devices）不在前三，前三是 LC17～LC19。权重改回 1 时这个测试不过（`run-02/red-weights.txt`）。没有判断时的回答也写出范围、原本要按的主题、共几位、都没有细看。
3. **`fault_not_fired` 是运行器的问题**：评测预载在判断请求的出口、联网之前就应答 `low_confidence`（每道题置信度和各级概率都是 0，`source: simulated`），不再等真实返回；`timeout`、`fail_always` 本来就在联网前。测试 `tests/agent-eval/judgment-faults.test.ts`（三种故障都不发真实请求、故障记为已生效）；登记 `eval/CHANGES.md` 2026-11-17 一行。
4. **判断不可用时逐例跑一遍**：`tests/agent-v1/judgment-unavailable-gate.test.ts`，JDG-001～008 与 SCL-013/014 的判断路径都在判断不可用下跑，代码判定对应的结果（条数、范围内、候选上限、判断次数、保守次数、零卡、一个入口、等用户）全部成立；另有一条证明模拟的 `low_confidence` 答案对三种题型都落到保守结果。

判断不可用时与评审项不一致的地方（用例不改，报协调者）：

- **AE-JDG-001 R1、AE-SCL-014 R1**：“细看了多少位、还有多少位没有细看”——判断不可用时一位也没有细看，回答写成“共 N 位……都没有细看”，没有“细看了 50 位”这个数。
- **AE-SCL-014 R2**：“说的是在新加坡、细看过的范围内”——不可用时说的是“只按记录字段排”，没有细看过的范围。
- **AE-SCL-013 R1、AE-JDG-001 R4**：会写“按「…」这个主题挑”，但紧接着说这次没有做主题匹配；评审可能认为不算“按主题挑的”。
- 其余（JDG-002～008、SCL-013 的 R2、R3）不受影响：JDG-004、005、007 本来就是不可用的情形，JDG-006、008 不可用时走的是同一个保守结果。

提交：`a628a1c84`（粗排权重、预载、两份测试、CHANGES.md）与本 REPORT 更新。impact 是改后跑的（`run-02/impact.txt`）：`contactCandidates`、`writeAnswer` HIGH，`ruleScore`、`funnel` UNKNOWN（文本搜索：只有 `funnel.ts`、`functions.ts` 与测试调用）；detect-changes low、受影响流程 0。

| 运行 | 代码判定 | 真实调用（主模型） | 费用（元） |
|---|---|---|---|
| `20261117-192252-a628a1c-AG08-gate-run-02` | 50/50 | 88 | 0.177 |
| `20261117-192518-a628a1c-AG07-gate-rerun-at-AG08-run-02` | 43/43 | 82 | 0.154 |
| `20261117-192731-a628a1c-AG06-gate-rerun-at-AG08-run-02` | 47/47 | 95 | 0.186 |
| `20261117-192941-a628a1c-AG05-gate-rerun-at-AG08-run-02` | 43/43 | 78 | 0.169 |
| `20261117-193142-a628a1c-AG04-gate-rerun-at-AG08-run-02` | 37/37 | 68 | 0.144 |
| `20261117-193334-a628a1c-AG03-gate-rerun-at-AG08-run-02` | 39/39 | 75（模拟 3） | 0.142 |

- 每次运行都做了 judge-pack；没有自评。
- 收口集 445/445，0 skip（本机 Postgres 测试库）；`tsc` 新增 0；全量 8729 例 24 失败，与基线名字逐条相同（`run-02/full-orbits.log`）。
- run-02 付费：DeepSeek 486 次、Gemini 9 次（16,639 token），约 0.97 元；本 sprint 合计约 7.5 元。
- 证据：`~/orbit-sprint-evidence/agent-design/sprint-AG08/run-02/`。

## 协调者复核与结论

- **结论：completed（run-02）。** run-01 用满两轮修复后门槛 48/50（两例都是 Gemini 判断请求 3 秒超时），按用户 2026-11-16 选定的做法 A 开 run-02。
- **协调者在 run-02 的决定：**
  - 超时不重试，按设计算不可用；规则排序本身要排对（角色、行业、标签、备注重于公司名里的词）。
  - `low_confidence` 改在联网之前注入，结果不取决于 Gemini 延迟（eval/CHANGES.md）。
  - 新增“判断强制不可用”下跑 JDG-001…008、SCL-013/014 的测试。Generator 报告的评审项差异（不可用时没有“细看了 50 位”之类的数）接受：评审项写的是判断可用时的行为，门槛运行覆盖它；不改用例。
- **评审（都是新开的 Claude 会话，互不可见）：**
  - AG08 门槛 `20261117-192252-a628a1c-AG08-gate-run-02`：评审 1 50/50，评审 2 49/50。分歧在 AE-JDG-003 R1，两名评审都记为 caseIssue：R1 要求“E106 被标为时间未公布”，但种子经产品写入链路把没有开始时间的活动存为草稿，用户问的是已公开的活动，代码判定 `listed.sequence` 本来就不含 E106。
  - 协调者改写 R1（`2449628`，CHANGES 已登记，要考的“不给未公布时间的活动编时间”不变），对这一例单独重跑 `20261117-195119-2449628-AG08-JDG-003-recheck` 并双评：两名都通过。其余 49 例两评一致通过。
  - 复跑都是单评：AG07 43/43、AG06 47/47、AG05 43/43、AG04 37/37、AG03 39/39，没有 `caseIssue`。
  - 全部运行已用 `--append-runs` 记进 RUNS.md。
- **交接（评审项之外，没影响结论）：**
  1. 判断不可用时的回答先说“按主题排了序”，又说“这次没有做主题匹配”，自相矛盾；AG10（排序）修。
  2. AE-SCL-008：回答说“只看到 10 条”又说“64 条里看了 50 条”。AG07 修过总数，这次是“看过几条”不一致。需要一条通用的代码规则：回答里的件数必须与本轮读取的覆盖记录一致，不一致的句子不交付。下一个 sprint 开头做。
  3. AE-RD-002（ja）：约定的主语没写出，按上下文读得通，留作观察。
  4. AG07 交接的 (b)(c)(e)(f)(g) 仍待安排。
- **花费：** DeepSeek 约 7.5 元，余额约 30 元；已提醒用户充值。
