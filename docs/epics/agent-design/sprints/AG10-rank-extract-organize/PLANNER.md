# Sprint AG10 — 排序、提取与整理

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R10（排序、从笔记提取往来和跟进、比较与汇总），门槛按 AG-R19。**单一目标:** 在 `features/agent-v1/functions/` 交付 `rankCandidates()`（依据三层查找、没依据问一轮、自然顺序、稳定键、拒收）、`extractInteractions()`、`extractFollowUps()`（提取结果先过 AG08 的判断复核才可进入写提议）、`compare()`、`group()`；“整理一下”默认只给摘要；从笔记到往来和 Todo 的写提议能回到已有记录、不重复新增。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`（AG00 起均未开工）。启动时填实际 HEAD，读 AG00、AG04、AG05、AG06、AG08 REPORT 的交接段核对下文。
**进入条件:** ① AG06、AG08 completed（登记表依赖），AG04、AG05 已随之完成。② 产品批准沿用设计稿“2026-11-15 已定的事项”：“没给排序标准时按个人历史和当下需求排并写明依据，都没有就问一轮”“‘整理一下’没指定产物时默认只给摘要”。③ 被测 Agent 的 DeepSeek 与 Gemini Decision 真实调用已允许，上限见“费用”。④ `npm run agent-eval:env` 自检通过，三个账号快照齐全；评测环境有 `DEEPSEEK_API_KEY`、`ORBIT_GEMINI_DECISION_API_KEY`。⑤ 不动界面，无需视觉稿。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

路径相对 `repos/orbits/`；设计稿、用例和约定在仓库根下，另注明。

### 必读文件
- 设计稿 `docs/superpowers/specs/2026-11-15-orbit-agent-v1-software-design.zh-CN.md` §3.5 全节（三个函数的输入输出、谁选择函数、没给标准时、“整理一下”的默认与细分表、从笔记到往来、从笔记到 Todo、可组合的整理操作表、排序的代码与模型分工）；§3.8 四步收窄；§3.11“最可能的一种”与“写入要有明确的指令”；附录 C 的 `rankingBasis`、`InteractionCandidate`、`FollowUpCandidate` 与题 `interaction.happened`、`followup.owner`。
- `docs/epics/agent-design/sprints/CONVENTIONS.md`：第 1 节 `functions/` 目录、第 4 节交接表。
- `docs/epics/agent-design/eval/README.md` 第 3.2、3.4 节（`listed`、`functions_called`、fault 的 `phantom_candidate`、增量 `memo-hearsay`、`memo-two-promises`）。
- 用例 `docs/epics/agent-design/eval/cases/FN.yaml` 全部；`cases/SCL.yaml` 的 AE-SCL-017～020；夹具 `world/base-v1.yaml`（M32、M36、M38、M39，E101～E107 其中 E106 无时间，记忆增量 `mem-weekend-morning`、`mem-no-evening`）、`world/regular-v1.yaml:192` 的 RM15 与 :217 的 RT06（`source: { memoId: RM15, memoVersion: 2 }`）、`world/large-v1.yaml:242` 的 LM11。
- `features/events/event-recommendation-tool.ts`：`compareCandidates`（:361）同分只按 `startsAt` 字符串比，`startsAt` 为空串时会排到最前；`candidateFor`（:317）用 `Date.parse` 判断是否未开始。时间未知与同分规则不能沿用它，`matchedTokensForText`（:173）可复用于拉丁词重合。
- `features/contacts/contact-recommendation-search.ts`：`betterRankedItem`（:443）同分返回 false，比较不满足反对称，同分顺序不可复现；`features/orbit-ai/contact-recommendation-matching.ts` 只包了这一层。联系人的稳定键要自己定。
- `features/orbit-ai/task-interaction-service.ts`：笔记到待办的现有入口。:75 来源笔记版本不符就失败，可沿用这个核对；:107 没有明确日期时返回 `needs_date_confirmation`；去重键 `agent-note:${id}:${version}:${shortHash(request.message)}`（:184）含用户原话的哈希，换个说法再提一次就成了新的建议，所以不能用它去重。它直写待办（:129），新入口不调用它。
- `features/contacts/memo-extraction/`：`job.ts` 成功后会写回联系人资料（:299 `writeBack`），新函数不调用作业；可复用 `segment.ts:47` 的 `segmentMemo()`（超过 2000 字切段）和 `provider.ts:175` 的 DeepSeek JSON 调用写法（`json_object`、`thinking: disabled`）。
- `features/tasks/contract.ts:48`：Todo 有 `sourceNoteId`、`sourceNoteVersion`，只有单值 `relatedContactId`（:43）；`features/tasks/service.ts:86` 的 `list` 不能按来源笔记过滤。
- `features/agent/memory/contract.ts`：`AgentMemory`（:11）只有 `category`、`content`、`source`，没有夹具里的 `appliesTo`、`structured`、`revision`；`AgentMemoryService.list()`（:54）。
- `shared/contract/events.ts:48`：活动 DTO 的 `startsAt` 是必填字符串；`features/events/core/contract.ts:27` 底层允许 `null`，但发布态（:42）要求有值。时间未知以 AG05 的活动读取适配器给出的表示为准。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号跑 upstream impact；建不起来就用文本搜索补查并写进 REPORT。下面的引用数来自文本搜索（含定义所在文件）。
- `export function segmentMemo(body: string, maxChars: number = MEMO_EXTRACTION_LIMITS.memoChars): string[] {`（segment.ts:47）：3 个文件；只调用。
- `export async function runMemoExtraction(input: MemoExtractionJobInput, deps: MemoExtractionJobDeps): Promise<MemoExtractionRecord> {`（job.ts:129）：12 个文件；不调用、不改。
- `export function createOrbitAiTaskInteractionService(input: {`（task-interaction-service.ts:55）：4 个文件；不调用、不改。
- `list: (input: {`（tasks/service.ts:86，参数 `actorId`、`status?`、`category?`、`planId?`、`typeItemId?`）：只调用；若加来源笔记过滤，先 impact `TaskService`。
- `list: () => Promise<readonly AgentMemory[]>;`（agent/memory/contract.ts:54）：`createAgentMemoryService` 被 15 个文件引用；只读调用。
- `export function matchedTokensForText(`（event-recommendation-tool.ts:173）：4 个文件；只调用。
- 前序接入点（名字按 REPORT）：AG08 的 `funnel()`、`askJudgment()`、`sentences.ts`、`graph/` 里 `functions` 节点的最小版本；AG04 的 `decideNextStep()`、`optionsFor()`；AG05 的“最近互动”视图与五类 `read`；AG06 的 `resolveIntents()`、`freezeCard()`、`memo`／`todo` 的 `prepare` 与 `applyApproved`。

### 前序交接要点（CONVENTIONS 第 4 节的约定名，启动时与 REPORT 核对，不一致就追加更正记录）
- AG00：`emitTrace(event)`；`functions_called` 判定从哪类事件计数（按 AG00 REPORT 发 `fn.rank`、`fn.extractInteractions`、`fn.extractFollowUps`）；fault `phantom_candidate`；增量 `memo-hearsay`、`memo-two-promises` 的落库。
- AG04：追问一个子目标只问一次；可点方向只取已登记的能力。
- AG05：五类记录的授权读取；“最近互动”从真实往来算出；`AnswerOutput` 与 `verifyCitations()`。
- AG06：`OperationIntent`；`memo`、`todo` 的 `prepare`／`applyApproved`；Memo 的 `interaction` 字段（`actualContactIds`、`channel`、`direction`、`occurredOn`、`precision`）；写 Memo 时抑制旧的自动提取。
- AG08：`funnel()` 与 `coverage`；`askJudgment()` 与保守结果；`sentences.ts` 带编号的句子；`interaction.happened`、`followup.owner` 已登记、未校准；`functions` 节点的最小版本由本 sprint 换成 `rankCandidates()`。

### 易错边界（每条对应一项验收）
1. **依据从哪来（AG10-1）。** 只“列出”不算排序，按自然顺序交付：活动与日程按开始时间，Todo 按截止时间再按计划日，Memo 与往来按发生时间由新到旧。要“挑出前几项”必须有依据，按顺序找、可叠加：本轮原话、@ 引用与本会话目标 → 存过的偏好与约束 → 该领域登记、由代码算出的个人信号（逾期的正式跟进、过了计划日的待办、距上次真实往来的天数）。找到就排，回答开头由代码写明用了什么，旁边给修改依据的入口。三层都没有就经 `clarify` 问一轮，选项是该领域此刻可用的排法；答“随便”按自然顺序交付并说明，不再问。“最好的”“最重要的”不是依据。
2. **记忆只读，等 AG14 换掉（AG10-1）。** 现在用 `AgentMemoryService.list()` 只取 `preference`、`constraint` 两类，按内容是否指向当前领域（如“活动”）由代码挑出，记 `memory.recall`；约束是硬条件，偏好参与排序。AG14 的 `recallFor()` 上线后由它替换。
3. **结果可信（AG10-2）。** 候选只来自授权读取后的集合（@ 选中的、或硬条件筛出的）；时间缺失或解析不出的标“未公布”，单列在清单之外，不推断先后；同分按“自然顺序字段，再按记录编号”的稳定键，输入顺序打乱也得到同一结果；模型或判断给出的不在集合里的编号、重复项、没有来源的理由一律拒收并记追踪。超出候选预算按 `coverage` 写明只看了多少。
4. **往来只记真实发生的（AG10-3）。** `extractInteractions()` 输入指定 Memo 的编号、版本、带编号的句子；模型只给 `InteractionCandidate`，代码核对句子编号存在、联系人线索落在这篇笔记关联或用户指定的联系人里、日期由代码以笔记日期为基准按东京时区换算。随后对每条问 `interaction.happened`，只有有把握的“是”才可进写提议；只被提到、打算下次联系、转述别人之间的通话、复核没把握的，只在只读结果里列出并注明存疑。
5. **承诺三分，两种日期分开（AG10-4）。** `extractFollowUps()` 的 `owner` 再经 `followup.owner` 复核，只有复核确认的本人承诺才可在用户说“加到待办”后进 `todo.create`；“我答应了什么”只回答并引用原句，不出卡。“までに”“最迟”“by”记截止日，具体某天做记计划日，同一篇里各保留各的；日期缺失就留空。
6. **回到已有记录（AG10-5）。** 出卡前先按来源查：往来看源 Memo 的 `interaction` 字段，字段一致就回“已记录”并给链接；待办按 `sourceNoteId` 找本账号已有 Todo，再按承诺对应的原句编号与动作比对，相同就指回它和现在的状态，不出卡；日期或内容不同只列差异；只有标题相似说不准时问 `duplicate.same`，没把握就请用户选。去重键是“来源笔记 + 原句编号”，不含用户原话，换个说法照样命中。
7. **整理一下只给摘要（AG10-1 的门槛例 AE-FN-008）。** 没指定产物时只按编号读所选笔记给摘要，三个函数都不调，不查联系人档案或任务库，附“整理小林的往来”“列出我的待办候选”这类已登记入口。比较与分组由查询加确定性计算完成，未标价不算免费，分组总数按唯一记录计（AE-FN-014）。
8. **不碰旧的写入路径。** 不调用旧的笔记提取作业（它会写回联系人资料），不调用 `task-interaction-service.ts`；新写入只经 AG06 的确认卡；写 Memo 的 `interaction` 字段时同样抑制自动提取。

## 范围与文件

- 读取：上面的必读文件；前序 REPORT 只读交接段。
- 新建（`features/agent-v1/functions/`）：`rank.ts`（`rankCandidates()`、稳定键、拒收、覆盖范围）；`basis.ts`（依据查找、各领域的自然顺序与个人信号登记、可用排法清单）；`extract.ts`（两个提取共用的提示、结构、校验；两类都要时一次模型调用分类型返回）；`extract-interactions.ts`（`extractInteractions()`）；`extract-followups.ts`（`extractFollowUps()`）；`dates.ts`（日期原话到日期与精度）；`link-back.ts`（回到已有往来或 Todo）；`compare.ts`（`compare()`）；`group.ts`（`group()`）。测试 `tests/agent-v1/{functions-rank,functions-rank-basis,functions-extract-interactions,functions-extract-followups,functions-link-back,functions-compare-group}.test.ts`。
- 修改：`graph/` 的 `functions` 节点按交付物选函数（有序清单 → `rankCandidates()`，往来明细 → `extractInteractions()`，跟进清单 → `extractFollowUps()`，摘要与会前回顾不调函数，由三个读取视图组合）；AG04 `clarify/` 登记“按什么来挑”的选项与修改依据的入口；AG06 的 `domains/memo`、`domains/todo`：缺 `memo.update` 的往来字段或 `todo.create`（带计划日、截止日、来源笔记与原句、关联人）时在此补上并登记执行器；AG08 的 `thresholds.ts` 与新一版校准样本、记录（`docs/epics/agent-design/eval/calibration/`，版本号接在当时最新一版之后，补这两题）；结果文档要加依据、覆盖范围、未公布项、存疑项时改 `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 并同步 App。
- 排除：记忆的字段扩展与 `recallFor()`（AG14）；定时规则上的排序依据（AG15）；Todo 多值关联（AG13，本 sprint 一位联系人时落到 `relatedContactId`）；笔记归档、疑似重复笔记合并、从笔记更新联系人资料；旧提取作业与旧笔记待办入口的行为；两端界面；生产库、部署、push。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG10-1 | 有偏好或本会话目标时直接排并在开头写明依据；都没有时问一轮，不凭空定标准。 | `functions-rank-basis.test.ts`（三层顺序与叠加、全无时追问 1 次、“随便”走自然顺序、“最好的”不算依据、只列出不追问）；门槛 AE-FN-001、002、003、004、005、008、AE-SCL-017 |
| AG10-2 | 结果只含授权范围内的候选；时间未知的保留为未知，同分顺序可复现，模型给出的不存在的候选被拒收。 | `functions-rank.test.ts`（未授权项不出现、无时间单列、打乱输入十次结果相同、E999 与重复项拒收）、`functions-compare-group.test.ts`；门槛 AE-FN-006、007、014、AE-FN-002 第二问顺序不变 |
| AG10-3 | 只被提到的人、打算下次联系、转述别人的通话，都不被登记为往来。 | `functions-extract-interactions.test.ts`（三种情形零写提议、复核没把握只列存疑、日期按笔记日换算）；门槛 AE-FN-009、010、AE-SCL-018、020 |
| AG10-4 | 本人承诺、对方承诺、仅供考虑三者被区分；计划日与截止日的差别保留。 | `functions-extract-followups.test.ts`（三种归属、までに／最迟／by 记截止、具体日记计划、问“答应了什么”零卡）；门槛 AE-FN-011、012、013、AE-SCL-018、019 |
| AG10-5 | 重复整理同一篇笔记能回到已有的往来或 Todo，不重复新增。 | `functions-link-back.test.ts`（往来字段一致回“已记录”、按来源笔记找到 Todo、换个说法仍命中、版本变化只列差异）；门槛 AE-FN-009、013、AE-SCL-018、019 |

每项另需同一次门槛运行的运行编号、`verdict.json` 与 RUNS.md 的登记行。

## 一次 Generator 的执行顺序

1. 核对进入条件，登记 run-01、本页 SHA256、基线 HEAD；读前序 REPORT 交接段，有出入就在本页追加更正；建 GitNexus 索引，对 `functions` 节点、`memo`／`todo` 适配器、`clarify` 的选项登记跑 upstream impact，HIGH/CRITICAL 先报告；跑一次 `npm test` 存开工前的失败清单。
2. 排序：`functions-rank-basis`、`functions-rank` 的失败用例 → `basis.ts`、`rank.ts` → 换掉 `functions` 节点的最小版本。
3. 提取：两个提取测试的失败用例 → `extract*.ts`、`dates.ts` → 接两道复核；随后 `link-back` 的失败用例 → `link-back.ts` 与适配器补齐；最后 `compare.ts`、`group.ts`。
4. 校准 `interaction.happened`、`followup.owner`：每题每种语言至少 20 条带标注样本（取自 dev 组夹具笔记，三种往来陷阱与三种归属都要有），用 AG08 的校准命令真实调用，门槛规则同 AG08；写新一版记录。
5. 门槛：一次 `--gate AG10` 完整运行 → 评审材料 → 两次独立评审 → 汇总 → 登记 RUNS.md；不过就修复后整套重跑，最多两轮。
6. 收口集、typecheck、全量对照；路径限定提交到 `sprint/AG10-rank-extract-organize`；写 REPORT，交出固定最终 SHA。

## 最小测试与检查

- **档位：H**，收口按 I 跑一次全量。理由：从笔记生成写提议并去重，在写入链路上；改 AG06 的领域适配器与执行器登记；新的付费调用（提取与两道复核）。
- **开发定向集**（cwd `repos/orbits`）：`node scripts/run-node-tests.mjs tests/agent-v1/functions-rank.test.ts tests/agent-v1/functions-rank-basis.test.ts tests/agent-v1/functions-extract-interactions.test.ts tests/agent-v1/functions-extract-followups.test.ts tests/agent-v1/functions-link-back.test.ts tests/agent-v1/functions-compare-group.test.ts`。模型与判断都注入桩，测试边界会拦真实主机。
- **操作链收口集**：上面六个文件；AG08 的 `tests/agent-v1/judgment-*.test.ts`；AG06 的 `memo`／`todo` 适配器与执行器测试（按 REPORT）；`tests/services/orbit-ai-task-interaction.test.ts`、`tests/capabilities/memo-extraction-job.test.ts`（证明旧路径没变）；`npx tsc --noEmit -p .`。改了 `shared/` 时，同一提交里在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。
- **门槛**：`npm run agent-eval:run -- --gate AG10`，包含 FN 14 例（小账号 `base-v1`）、AE-SCL-017、018（常规）与 AE-SCL-019、020（较大），以及不变量包（可见用例里 `invariant: true` 的，选取口径以 AG00 REPORT 为准）。通过条件按 eval README 第 6 节，此前通过的（尤其 JDG、XL、RD）不退步。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>`；每例由两个互不相见的新开 Claude 会话各评一次，不一致的做第三次并列入人工复核；`npm run agent-eval:report -- --run <运行编号>` 得出 RUNS.md 的一行。
- **全量**：收口跑一次 `npm test`，按 RULES 5.2 与开工前清单 `comm -13` 对比，只查新增项；stash 带唯一标签并按 SHA 恢复；不 source `.env` 系列文件。
- **费用**：每次完整运行 ≤30 元，本 sprint 累计 ≤150 元（含校准），超出先停下报告；次数、token、余额差额写进 REPORT。
- **证据**：`~/orbit-sprint-evidence/agent-design/sprint-AG10/run-01/` 放命令输出、impact、校准原始输出、全量对比；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：App 端除四个同步测试外的测试和浏览器（没改界面）；`--all` 与封存集（AG18）；联网（本区用例都要求零联网）。

## 失败与交接

外部条件缺失（AG06 或 AG08 未完成、自检不过、密钥缺失、校准样本不足）先不启动或停在对应步骤；run 已开始就按 RULES 产出 failed／blocked 报告。门槛最多两个修复轮次，每轮整套重跑，仍不过如实结束为 failed，每次运行都登记。不为通过而改用例或调低门槛；用例确有错，按 eval README 第 7 节写 `CHANGES.md` 并在 REPORT 单列。
REPORT 写验收映射、功能 SHA、命令与退出码、运行编号与评审结论、校准记录摘要、费用、未完成与下一步。分支 `sprint/AG10-rank-extract-organize` 从 `orbit-agent-claude` 建；路径限定提交，禁止 `git add .`，提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`；交出固定最终 SHA，由协调者 `--no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集和 typecheck 后才标 completed。push 需要用户授权。

## Planner 记录的出入

- AE-FN-002 要求本 sprint 用上两条已存记忆并记 `memory.recall`，而 `recallFor()` 和记忆字段扩展在 AG14（依赖 AG06、AG08，排在 AG10 之后）。本页用现有 `AgentMemoryService.list()` 只读顶上；夹具里的 `appliesTo`、`structured`、`revision` 现有记忆结构没有，能否落库看 AG00 的种子写法。
- 交接表说 AG06 交出 `todo`、`memo` 的适配器，但 AG06 的验收只用到 `todo.update` 和 `memo.create`；本区要 `memo.update`（往来字段）和 `todo.create`（来源笔记与原句），缺的在本 sprint 补，执行器登记照 AG06 的写法。
- AE-SCL-019 的卡上写 `relatedContactIds: [LC03]`，现有 Todo 只有单值 `relatedContactId`，多值关联在 AG13；本 sprint 只处理一位联系人，字段名以 AG06 的卡片载荷为准。
- 会前回顾（AE-SCL-020）、比较与分组（AE-FN-014）、“整理一下”（AE-FN-008）在登记表的五项验收里没有单列，本页把它们归入门槛，不新增验收项。
