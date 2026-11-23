# Sprint AG10 — 执行总结（排序、提取与整理，H）

（REPORT 由协调者提交：Generator 的写文件工具拒绝在 sprint 目录写报告，本文件放在协调者的 scratchpad。）

改了哪些文件看 git diff（`40a8132e0..2793cf06c`）。PLANNER SHA-256 `33f562200200b60a2708707e368d939fc6488e7541108da2142739085d6443a0`，基线 HEAD `40a8132e0`。

## 结果

**run-01：最终 SHA `2793cf06c` 上 AG10 门槛代码判定 63/63，AG09～AG03 七个复跑全过；用了修复轮 1（门槛第一次 62/63，AE-XL-007 回退）。每次运行都做了 judge-pack，没有自评，待评审。**

已验证能做到（开发测试里模型与判断是桩；运行里 DeepSeek 与 Gemini Decision 真实调用）：

- **开头两项（各一个提交，先失败后通过，`run-01/red-opening.txt`）**：`9768e1c69` 判断不可用时排序开头写“你要的是和「…」相关的，但这次没有做主题匹配”，不再写“按「…」这个主题挑”；模型句子声称按主题/相关度排了序、而本轮没做成主题匹配时整句不交付（`answer/claims.ts`，中日英）。`a8bb6ccab` “我无法上网／ネットに接続できません／I can't go online”在有据回答、讨论回答和第一层直接回复里都不交付。
- **AG10-1 依据从哪来**（`functions/basis.ts`）：只列出按自然顺序；挑前几项时依据按本轮原话与 @（@ 笔记取正文为主题）→ 存过的偏好/约束（`AgentMemoryService.list()` 只读，约束是硬条件，trace `memory.recall`）→ 代码算出的个人信号（逾期正式跟进、过计划日的待办、本周到期）找，可叠加；开头由代码写明用了什么，旁边给“想换个依据重新排”。“最好的/最值得”不算依据；第一层给的排序字段只有原话里说了才认。都没有：问一次（`purpose: ranking`，选项为该领域现有排法），回复“随便”按自然顺序交付并说明原因，不再问。
- **AG10-2 结果可信**（`rankCandidates()`）：只用授权读到的候选；无开始时间的单列“时间未公布”；排序键依次为软时间偏好、个人信号、主题等级、用户字段、自然顺序、记录编号，打乱十次同序；判断返回里没问过的编号（E999）与重复候选拒收并记 `functions.rejected`。
- **AG10-3 往来只记真实发生的**（`extractInteractions()`）：一次模型调用按句号编号给候选（附录 C 外加 `kind`，用来说明为什么不算）；代码核对句号、人在笔记关联联系人里（逐字匹配，张薇/张玮/张伟分得开）、日期以笔记日为“今天”按东京时区算（只有星期几的照原文）；转述与只有打算的由代码改判；其余问 `interaction.happened`，只有过门槛的“是”可写；没把握的只读列出并注明存疑。写入是新的 `memo.update`（按冻结版本只写往来字段，抑制旧自动提取，不写联系人资料）。
- **AG10-4 承诺三分、两种日期**（`extractFollowUps()`）：本人/对方/仅供考虑；只有考虑词没有承诺词的由代码定为仅供考虑；`followup.owner` 过门槛的 me 才可写。原句里日期旁边是“までに/最迟/前/by”记截止日，否则计划日；缺日期留空。“我答应了什么”只回答并引用原句；“加到待办”才出卡，待办带关联人、来源笔记与版本，原句记在备注，卡上截止只写到日。
- **AG10-5 回到已有记录**（`link-back.ts`）：往来看源笔记 `interaction`，一致答“已经记过了”并引用；待办按 `sourceNoteId` 找，按备注原句与动作比对，相同指回它和状态，日期不同只列差异，说不准不新增并说明。键是来源笔记 + 原句（+ 动作），换说法照样命中。
- **整理、比较、分组、会前回顾**：只说“@笔记 帮我整理一下”给摘要并写明，附两个已登记入口，三个函数都不调；活动比较与按费用分组由代码写，主办方载荷的 `free` 也是没填时的默认值，所以以介绍里的费用行为准（“费用：未标价”不算免费、单列）；问某人“现在的…”也读最新笔记，“还没做完”只看待办与正式跟进，对应待办已完成的旧“还要…”笔记不给模型，“we/us/our”是代词。
- 函数追踪：`fn.rank`（带 `listed`）、`fn.extractInteractions`、`fn.extractFollowUps` 只在函数真跑时发。

仍未实现或未验证：`recallFor()` 与记忆字段（AG14，FN-002 顺延）；一篇多次往来只列出请用户说、待办“说不准”没有接 `duplicate.same` 与可点项；排序追问的点击路径只有单测；评审。

## 运行记录

run-01，修复轮用 1 轮；Claude Opus 5.5，2026-11-18；分支 `sprint/AG10-rank-extract-organize`，最终 SHA `2793cf06c`，合并等待协调者。

| 运行（`--workers 4`，一次一个，干净重建，都已 judge-pack） | 代码判定 | 主模型真实 | 元 |
|---|---|---|---|
| `20261118-030626-43ec050-AG10-gate` | 62/63（XL-007） | 126 | 0.289 |
| `20261118-030924-43ec050-AG09-gate-rerun-at-AG10` | 53/54（XL-007） | 106 | 0.207 |
| AG08～AG03 于 `43ec050` | 未开始（工作区有修复改动，运行器拒绝；日志 `*.not-started-dirty-tree.log`） | — | — |
| **`20261118-031407-2793cf0-AG10-gate-r1`** | **63/63** | 124 | 0.272 |
| `20261118-031700-2793cf0-AG09-gate-rerun-at-AG10-r1` | 54/54 | 107 | 0.203 |
| `20261118-031922-2793cf0-AG08-gate-rerun-at-AG10-r1` | 50/50 | 88 | 0.180 |
| `20261118-032145-2793cf0-AG07-gate-rerun-at-AG10-r1` | 43/43 | 82 | 0.160 |
| `20261118-032347-2793cf0-AG06-gate-rerun-at-AG10-r1` | 47/47 | 94 | 0.188 |
| `20261118-032555-2793cf0-AG05-gate-rerun-at-AG10-r1` | 43/43 | 77 | 0.155 |
| `20261118-032745-2793cf0-AG04-gate-rerun-at-AG10-r1` | 37/37 | 69 | 0.138 |
| `20261118-032931-2793cf0-AG03-gate-rerun-at-AG10-r1` | 39/39 | 77（模拟 3） | 0.144 |

没有一例因超时失败，未用超时单例重跑。

**修复轮 1（`2793cf06c`）**：AE-XL-007 第二轮“刚才那条来电记录没存上，再记一次：小林今天来过电话”被当成从上文笔记提取往来。改为：口述新笔记（`memo.create`、无 `fn.extract*`、本轮无 @ 笔记）绝不走提取；上文笔记只在“把那篇里的承诺加到待办”时沿用。先失败 `run-01/red-repair1-xl007.txt`。

**开发与稳定性（17 个 AG10 门槛例，`--case`）**：诊断基线 17 例全不过；dev-1 14/17、dev-2 15/17、stab-a～f 15～17/17；最后三次 stab-g/h/i（`43ec050`）都是 17/17。中途翻转都改成代码规则（不改提示词），各自先在运行里失败再补测试：FN-001（第一层没给 event.read → 两个以上 @ 活动即活动排序）；FN-003 ×2（加了待办/日程读取、没给 rank → “谁”+“跟进”即按人排）；FN-013（运行器 `duplicate_effects` 误判，运行器修正）；FN-014（E103 读成免费 → 介绍里的费用行）；SCL-017（加了笔记读取 → 原话点名跟进即待办排序）；SCL-020 ×2（整句并成一个子目标 → current 读法与已完成待办覆盖旧笔记；“we” 配到 Daniel Wee → 代词）；FN-009 ×2（漏写入能力 → 原话“更新…往来”即写入）；FN-008（第一层给多种读法 → 只说整理一下即摘要）。

## 验收结果

| SC | 代码判定（评审待做） | 证据 |
|---|---|---|
| AG10-1 | pass | `functions-rank-basis.test.ts`；门槛 FN-001、003、004、005、008、SCL-017 |
| AG10-2 | pass | `functions-rank.test.ts`、`functions-compare-group.test.ts`；门槛 FN-006、007、014 |
| AG10-3 | pass | `functions-extract-interactions.test.ts`、`agent-v1-memo-update-executor-postgres.test.ts`；门槛 FN-009、010、SCL-018、020 |
| AG10-4 | pass | `functions-extract-followups.test.ts`；门槛 FN-011、012、013、SCL-018、019 |
| AG10-5 | pass | `functions-link-back.test.ts`；门槛 FN-009、013、SCL-018、019 |

## 校准记录摘要

`npm run agent-eval:calibrate -- --only interaction.happened,followup.owner --write`，74 次真实请求、18,826 token（约 0.014 元）。样本 `judgment-samples-v3.yaml`（v2 原样加两题；dev 每格 21～24 条，三种往来陷阱与三种归属都有；val 用 val 用例 M90/M39/LM11 的故事）；记录 `judgment-thresholds-v3.md`；配置 `judgment-thresholds@3`。门槛 `interaction.happened` zh 0.836、ja 0.631、en 0.891；`followup.owner` zh 0.871、ja 0.846、en 0.752；dev 零误判。val 上 `followup.owner` zh、en 各错 1（“打算下周再联系”“should think about … beta”判成本人承诺），都被代码“只有考虑词即仅供考虑”规则兜住。ja 的“是”置信度偏低（0.67～0.69），门槛贴边，列为观察项。

## 与 PLANNER 不同

1. 新增文件：`functions/extract-memo.ts`、`functions/copy.ts`、`answer/claims.ts`；测试 `ag10-opening`、`ag10-review`、`functions-kit`、`tests/agent-eval/hard-checks-ag10`、`tests/capabilities/agent-v1-memo-update-executor-postgres`。
2. `InteractionCandidate` 加 `kind`。
3. 没改 `shared/`（依据、覆盖、未公布、存疑写在回答文字与 trace），App 不需同步。
4. 图依赖加可选只读 `deps.memories`；生产执行器未接（AG14 接 `recallFor()`）。
5. 活动费用/主题、待办来源笔记不进 `executeAiRead` 字段白名单（`permission-registry.ts` 拒收未知字段），函数节点直接读记录；待办读取只多白名单已有的 `source`。
6. 评测侧（不是用例改动，CHANGES.md 已登记，部分“待协调者确认”）：`functions_called`、`phantom_candidate` 实现；`listed` 取函数清单；`null`/`relatedContactIds` 比较；`duplicate_effects` 看存储外层；种子费用改动已撤回。
7. **用例改动（待协调者确认）**：AE-FN-006 R1 按 AE-JDG-003 先例改写（E106 是另一主办方草稿，账号读不到），CHANGES.md 已登记。
8. 测试顺序：开头两项、SCL-020 读取规则、修复轮 1 与稳定性规则先失败后通过（`run-01/red-*.txt`）；函数主体六个测试文件与实现同批写成，如实记录。

## 影响分析

改前（`run-01/impact-1.txt`）：`createNoteService`、`todoWriteExecutors`、`cardWriteExecutors` **CRITICAL**（都只加可选字段/一个执行器），`rankDomainOf` **HIGH**；其余 LOW；`TODO_DOMAIN`、`createTodoExecutors`、`canonical` UNKNOWN，文本搜索补查。稳定性修复里 `isPronounClue` **CRITICAL**（只在拉丁代词表加 we/us/our）。detect-changes 每次提交 low、受影响流程 0（新测试文件不在索引里）。

## 测试与全量

收口集（agent-v1、agent-eval、`tests/capabilities/agent-v1-*`、账本契约、能力注册、`orbit-ai-task-interaction`、`memo-extraction-job`；本机 Postgres 测试库 `orbit_agent_v1_entry_test`）667/667，0 skip（`run-01/closing-set.log`）；`tsc` 新增 0。全量 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`（`2793cf06c`）：8840 例，7688 过，24 失败，1128 跳过；失败名与基线 24 条逐条相同，无新增、无消失（`run-01/full-orbits.log`、`full-fail-names.txt`）。

## 费用

22 次评测运行：DeepSeek 1,495 次真实调用，Gemini 220 次（91,689 token）；校准 74 次（18,826 token）；合计约 3.52 元（上限 150）。真实 Search/Fetch 0 次。

## 交接

- `functions/`：`rankCandidates()`、`basis.ts`（`timePreferenceIn`、`memoriesFor`、`groundedField`、`topicWordsOf`、`leavesItToAgent`）、`extractFromMemo()` 与两组 `extract*/review*`、`extractJudgmentInput`（校准共用）、`linkInteraction`、`linkFollowUp`、`compare`、`group`、`groupEventsByFee`；`eventFactsOf`。
- 卡：执行器键 `memo.update`（账本操作类型 `update_memo`）；`todo.create` 可带 `relatedContactIds`（落单值）、`sourceNoteId/Version`、`notes`；`shown.dueDayOnly`。
- 图：functions 节点可预先给出写入项（`run.presetIntents`，propose 不调模型）；propose 后有引用时经 verify；未结事项多 `rank`；`OptionSetState.purpose` 多 `ranking`。
- 回退：不合并或 revert；`ORBIT_AGENT_V1_MODE=off`。
- 评分项外的小问题：日文列表人名后用了中文逗号；AG09 的 `withoutPartialCounts` 在英文段落里会吃掉换行；FN-010 把“同事”也列为“不算你的往来”。

## run-02（协调者例外，选项 A）

起因：run-01 评审 AG05 重跑 42/43，AE-AMB-012 R1 不过（回答说“这件事我记下了”而什么也没写）；AE-RD-008 三位评审在评分项外指出两处（复述成了“整理一下”；笔记打不开还给出整理它的入口）。协调者确认的三行 CHANGES 已标“协调者已确认”（`87dbb53b8`）。

| 提交 | 内容 |
|---|---|
| `4cebe04aa` | AMB-012：句中任何位置的第一人称“记下了/记住了/帮你记了/存好了/已记录”、`I have recorded` 不交付；卡片入口不是写入 |
| `290fc83e4` | RD-008：用户说“总结/归纳/summarize”不再加复述行；只有含糊的“整理”才复述，且引用用户原词；@ 了打不开的笔记不出摘要复述、不出作用于其内容的入口（`memoOf` 与摘要判定都看 `accessible`） |
| `a3e7b9762` | AMB-004（可选项，有干净规则）：陈述里说要加待办（“add a to-do”“设个提醒”）时入口给 `todo.create`，不给记笔记；同句提到电话/笔记仍给笔记 |
| `87dbb53b8` | CHANGES.md 三行标已确认 |
| `5c0251567` | 修复轮 1（run-02 门槛 `20261118-051038-87dbb53-AG10-gate-run-02` 62/63，AE-WEB-007 `no_private_reads`）：第一层这次给了 `web.fetch + fn.summarize`、数据源只有公开网页，`webPartReads` 把函数能力当成读用户记录，读了 10 篇笔记。改为函数能力只在数据源含 `orbit_records` 时才读用户记录 |

测试先行：`tests/agent-v1/ag10-run02.test.ts` 6 例，修前全红（`run-02/red-before-fixes.txt`），修复轮 1 的一例另行先红后绿。影响分析：`stripSaveTalk`、`memoOf`、`functionOf`、`summaryPart`、`webPartReads` 均 **HIGH**（都在请求图回答/读取路径内，调用方 readDue、resolveNode、answer 节点）；`summaryLead`、`routeNode` LOW。detect-changes 每次 low、受影响流程 0。中途 AG09 重跑（`20261118-051329-87dbb53-…`）为修复而中止，不计结果。

最终运行（`5c0251567`，干净重建后逐个跑，`--workers 4`）：

| 运行 | 硬检查 |
|---|---|
| `20261118-051751-5c02515-AG10-gate-run-02-r1` | 63/63 |
| `20261118-052046-5c02515-AG09-gate-rerun-at-AG10-run-02-r1` | 53/54：AE-WEB-011 为 DeepSeek 15 s 超时（probe 节点，trace 可见）→ `20261118-053843-5c02515-AE-WEB-011-timeout-retry-1` 1/1，记为基础设施抖动 |
| `…-052308-…-AG08-…-run-02-r1` | 50/50 |
| `…-052527-…-AG07-…-run-02-r1` | 43/43 |
| `…-052728-…-AG06-…-run-02-r1` | 47/47 |
| `…-052937-…-AG05-…-run-02-r1` | 43/43（AMB-012 回答已无“记下了”；RD-008 无复述行、无入口） |
| `…-053133-…-AG04-…-run-02-r1` | 37/37（AMB-004 入口为 “Set a reminder about Emily”） |
| `…-053322-…-AG03-…-run-02-r1` | 39/39 |
| `amb012-stab-run02-1/2/3`（053508、053544、053620） | 各 1/1 |
| `rd008-stab-run02-1/2/3`（053655、053729、053803） | 各 1/1 |

每个运行都已出 judge-pack（16 份）；评审未做。收口集 673/673，0 skip（`run-02/closing-set.log`）；`tsc` 新增 0。全量（`5c0251567`）：8846 例，7694 过，24 失败，1128 跳过；失败名与基线 24 条逐条相同（`run-02/full-orbits.log`、`full-fail-names.txt`）。

费用：run-02 共约 1.89 元（完成的运行 1.74 元，DeepSeek 856 次、Gemini 57 次 / 30,953 token；中止的 AG09 约 81 次 DeepSeek ≈0.15 元）。本 sprint 累计约 5.4 元。

交接补充：AMB-004 的入口文字是“设个提醒 / Set a reminder about X”（`todo.create` 现有标签），若希望写“加个待办”需改 `clarify/options.ts` 标签。

## run-03（协调者例外，选项 A）

起因（run-02 评审与协调者三次补充）：AG04 重跑 AE-AMB-001 R2 方向回到通用三项；AG08 AE-RD-005 “只记到…这一次”拆开的计数；AG10 门槛 62/63（AE-FN-009 R3：第 3 步 DeepSeek 超时，失败行没说已记在 M32）；评分项外 AE-CTX-005 西里尔字母残片、AE-SCL-018 第 1 轮整块重复。

AMB-001 查明：不是代码回退。a3e7b9762 只改 `route.ts` 的 respond 入口，`clarify/options.ts` 没动；5c02515 那次第一层没给 `objectClues`（`dataSources: turn_material`，前 10 次都给了“小林”联系人线索）。规则改为代码按字面判断。不查联系人（R1 与 `no_private_reads` 不许查）。

| 提交 | 内容 |
|---|---|
| `0f24129c3` | AMB-001：整句只是一个名字（“小林”“小林さん”“Emily”，带小/老/阿、常见姓、敬称，排除“明天/谢谢/Hello”等）且第一层没给线索时，代码补联系人线索，方向按“小林”命名；不读任何记录（测试断言 0 次读取） |
| `decc041eb` | RD-005：拆开的确数也算（只记到…这一次、只有…那一条、…だけで、一回、only … once / only have one call）；有冒号换成代码的中性开头，中文去掉“只”和“一”，日英整句不交付；“不只一次”“not only”不算 |
| `c5e72f3d6` | CTX-005：回答里含西里尔/阿拉伯/泰/希伯来/天城/谚文等文字的句子，若这段文字不在用户消息、读到的记录或网页里，不交付 |
| `7acb7133f` | SCL-018：查实是代码重复。第一层把一句拆成两个子目标（同一引文、同一笔记，分别 extractInteractions / extractFollowUps），函数节点各做了一次完整提取。改为同句同笔记合并为一次提取、只说一次，另一子目标随之作答。FN-009 R3：提取失败而笔记上已记着与所问之人的往来时，失败行说“已经记在笔记「…」上了；这次没能再整理”，笔记仍可打开 |
| `58d65e874` | 修复轮 1（run-03 门槛 `20261118-061147-7acb713-AG10-gate-run-03` 60/63）：FN-011 第一层把“それ”绑到笔记却标成 todo，改为绑定到笔记的线索即为该笔记；SCL-017 第一层给 memo.read+fn.extractFollowUps+fn.rank 没给 todo.read，改为“正式跟进”排序即待办排序。同次 FN-010 为 DeepSeek 超时（trace 两处），最终门槛已过，未单独重试 |

测试先行：`tests/agent-v1/ag10-run03.test.ts` 11 例（选项生成器“小林”三项命名的单元测试、图测试、拆分确数、异体文字、超时已记、同句合并、修复轮两例），修前红的输出存 `run-03/red-*.txt`（修复轮两例以临时撤回实现的方式确认红）。影响分析：`memoOf`、`rankDomainOf`、`extractPart`、`withoutFalseClaims` **HIGH**（均在请求图读取/回答路径）；`understandNode`、`exactCountsIn`、`functionsNode`、`answerNode` LOW。detect-changes 每次 low、受影响流程 0。中止的运行：`…-061442-7acb713-AG09…`（54/54，完成）与 `…-061712-7acb713-AG08…`（刚开始即为修复中止），均不计结果。

最终运行（`58d65e874`，干净重建，逐个跑，`--workers 4`）：

| 运行 | 硬检查 |
|---|---|
| `20261118-062056-58d65e8-AG10-gate-run-03-r1` | 63/63 |
| `…-062347-…-AG09-gate-rerun-at-AG10-run-03-r1` | 54/54 |
| `…-062621-…-AG08-…` | 50/50（RD-005 回答已无确数） |
| `…-062839-…-AG07-…` | 43/43 |
| `…-063035-…-AG06-…` | 47/47 |
| `…-063240-…-AG05-…` | 43/43 |
| `…-063431-…-AG04-…` | 37/37（AMB-001 为命名三项） |
| `…-063617-…-AG03-…` | 39/39 |
| 单独 ×3：amb001、amb004、amb012、rd008、rd005、ctx005、scl018、fn009、fn011、scl017（`*-58d65e8-<名>-stab-run03-1/2/3`） | 30 次全部 1/1 |

全部 40 份 judge-pack 已出（含中止前的两份）；评审未做。收口集 684/684，0 skip（`run-03/closing-set.log`）；`tsc` 新增 0。全量（`58d65e874`）：8857 例，7705 过，24 失败，1128 跳过；失败名与基线 24 条逐条相同（`run-03/full-orbits.log`、`full-fail-names.txt`）。

费用：run-03 约 2.10 元（DeepSeek 1,012 次，Gemini 78 次 / 36,110 token）。本 sprint 累计约 7.5 元。

交接补充：
- SCL-018：第一层若把句子拆成两段不同引文（“…実際にあったやり取り”／“私が約束したこと…”），两块内容不同、不重复，但各带一行相同的笔记标题“メモ「…」から：”。若要只留一行，需在交付时合并相邻同笔记的标题，未做。
- AMB-001 的名字判断是字面规则（姓氏表 + 前缀 + 敬称 + 排除词），名单外的名字（如不在表里的单字姓双字名）仍依赖第一层给线索。

## 协调者复核与结论（2026-11-18）

**结论：AG10 完成，按 run-03 最终 SHA `58d65e874` 合入 `orbit-agent-claude`。** run-02、run-03 是按做法 A 开的例外。

**最终运行的评审**（都在 `58d65e8` 上，干净重建，`--workers 4`）：

| 运行 | 评审 | 结果 |
|---|---|---|
| `20261118-062056-58d65e8-AG10-gate-run-03-r1` | 两评 | 63/63，两位都过 |
| FN-009、FN-011、SCL-017、SCL-018 各单跑 ×3 | 两评 | 12/12 |
| AG09、AG08、AG07、AG06、AG05、AG04、AG03 复跑（`-run-03-r1`） | 各一评 | 54、50、43、47、43、37、39，全过 |
| AMB-001、AMB-004、AMB-012、RD-005、RD-008、CTX-005 各单跑 ×3 | 一评 | 18/18 |

**各轮经过**
- **run-01**（`2793cf0`）：门槛两评 63/63。AG05 复跑的 AE-AMB-012 R1 不过：没有写入，回答却说"这件事我记下了"。另有 3 位评审在评分项之外都指出 RD-008 的问题：用户说"总结"，回答复述成"整理一下"，还对读不到的笔记给了操作按钮。
- **run-02**（`5c02515`）：门槛两评 62/63。FN-009 R3 不过，原因是 DeepSeek 超时，而且失败时没有说明内容已经记在 M32 上。AG04 复跑的 AE-AMB-001 R2 不过：选项退回成泛泛的说法。
  - 我起初判断 AMB-001 是代码倒退，这个判断不对。生成者查实，代码没有改选项，是第一层模型这次没给出人名线索；之前连续 10 次都给了。现在改成：只有一个人名的消息，由代码补上联系人线索。
- **run-02 的其他问题**（评分项未覆盖，一并转为代码规则）：
  - CTX-005 混入了西里尔字母片段；
  - SCL-018 整块回答重复，查实是代码重复提取；
  - RD-005 的拆开写法"只记到…这一次"。

**确认过的生成者决定**
- AE-FN-006 R1 改写。理由与 AE-JDG-003 相同：E106 是另一位主办方的草稿，账号甲读不到。
- 运行器口径三行：`listed` 取自 `fn.rank`；`null` 与字段缺失视为相同；AG13 前 `relatedContactId` 只有单值。
- `isPronounClue`（加入 we/us/our）和三个写入工厂（只加可选字段）的影响为 CRITICAL。七个复跑都通过后，我接受这两处改动。
- AMB-004 新按钮沿用"设个提醒"的说法，与现有用词一致。

**交接**（接在生成者的交接之后）
- **优先，AE-FN-003：** 回答说三个人都符合条件，但小林的待办计划在 11/18，按回答自己给出的两条标准都不算。下个 sprint 开头改成代码规则："符合条件"的每个人都由代码核对条件确实成立。
- **AE-WEB-011：** 在超时之前，就把公开公司名 Acme Cloud 当成只存在于私有记录里的名字。重跑没有再出现，列为观察项。
- **AE-UND-006：** 日语回答里夹着无意义的拉丁字母词"ett"。外文字形规则不管拉丁字母，列为观察项。
- **ctx005-stab-run03-3：** 日语句子缺词，是模型原文就缺的。
- **AE-JDG-006：** 举例句"（比如：2026-11-15 来电话，内容待补）"，没有写入，列为观察项。
- **AE-SCL-004：** 没有提到"店长"，评审判为边缘通过。
- **AE-AMB-004：** 追问里写的是"待办"，按钮写的是"设个提醒"。
- **AE-UND-003／UND-016：** 把用户自己的想法说成联系人的话，问题仍在。
- **AE-UND-007：** 把笔记里的价格说成"公开的单价"。
- **SCL-018：** 两段线索分开时，笔记标题行会重复，但正文不重复。
- **人名规则：** 按字面匹配，名单之外的名字仍然要靠第一层模型。
- **评测运行器：** `scripts/agent-eval/run.ts:125` 的注释已经过时，现在判断模型自 AG08 起已经调用。
- **仍未处理：** AG07 交接 (b)(c)(e)(f)(g)，Gemini 延迟，trace 只抽 40 行。

**费用：** 本 sprint 约 7.5 元，上限 150 元。全量测试 24 个失败，与基线同名。
