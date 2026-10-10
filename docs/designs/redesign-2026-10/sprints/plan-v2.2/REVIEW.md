# 计划 v2.2（R22–R25）文档 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与写作），2026-10-10。
**对象：** `plan-v2.2/DESIGN.md`（版本 1）、`R22`–`R25` 的 `GOAL.md` / `PLANNER.md`、`README.md`「功能登记表」与 `screen-ownership.md` 计划相关的未提交改动（`git diff -- docs/designs/redesign-2026-10/sprints/`）。
**依据：** README（RD 决定、通用规则 10、合回前总验收）、HOW-TO、`screen-ownership.md`、R08 PLANNER（结构）、R07 REVIEW 的 M5 处理记录；旧方案 `IMPLEMENTATION-PLAN.md`（§1.7、D-02～D-09、P3、§5 Q4/Q6/Q7、附录 A、附录 D）；设计稿 b10、b4、app、web、index「待確認項決定」、b9，另补看了 b8（Web 自适应）；现有代码（只读）。
**说明：** 只读复核，没有改任何已有文件，没有连数据库、没有起服务器、没有调用付费 AI。

## 结论：有条件通过

整体是一份认真、可执行的设计。复核人独立核实过下面这些：
- **结构**：四个 PLANNER 都按 R08 的标准结构写（事实 → 上下文包 → 契约 → 范围 → SC → 证据子表 → 执行顺序 → 失败与交接），GOAL 是普通人能读懂的说明。
- **代码事实大多属实**：`plans.horizon not null`、`plans_one_active_per_actor`、`plan_items` 的两条 CHECK、`criteria.targetCount` 1–5、`plan_log` 按 `(workspace, actor, idempotency_key)` 唯一且 `event` 不约束取值、账本 `purpose` CHECK 的 6 个值、`resolvePlanService` 14 个非测试调用方、`configuredHasActivePlan` 只在 `progress.ts`、`sync-contract.mjs` 对 `shared/compute` 整目录放行而 `shared/domain` 只放两个文件、`DEMO_PLAN.goalKind = "customers"`，都与代码一致。GitNexus 抽查 `resolvePlanService`（CRITICAL 50 / 直接 14）、`createPostgresAiUsageLedger`（CRITICAL 80）、`PlanService`（CRITICAL 121），与 §13 一致。文档里引用的路径抽查 20 余处，只有 1 处写错位置（m6）。
- **对旧方案的偏离**：§9 #1（原地更新）、#2（记账式分数）、#3（独立路由）、#4（库即代码）、#5（イベント枠放 `plans`）、#7（模板放 `shared/compute`）都确实是对 D-03b / D-04 / §1.7 / D-06 / D-03 / D-02 的偏离，理由站得住、有对标。
- **付费 AI 清单**：C1–C12 都有模型、单次成本、每用户每月上限、本机验证 ≤5 次；授权前一律 mock；生产迁移和部署写成另行授权；示例数据不写库、邮件 / 消息只到草稿的规矩处处写到。
- **依赖无环**：R22 → R23 / R24 → R25；R24 → R26；R23 → R28；乙的 R10 / R11 / R20 / R21 只依赖 R22 第一天提交的契约（mock），互相只有「接上更好、不接也能收口」的关系。

但有 **1 条严重、11 条中等**问题：
- **S1**：DESIGN 规定 v2 计划在 `getCurrent()` 里返回 null，而人脉覆盖度、人脉分析快照、联系人详情的计划说明、候补管线的草稿都只经 `getCurrent()` 读计划。按现写法，v2 用户的这些现有功能会静默消失，而 DESIGN 说它们「原样可用」。
- **M1–M11**：账本 `max_calls` 按用途写死，与「每个调用自己的 max_calls」冲突（M1）；Web 和 App 新路由路径不一致，`route-parity` 会全红（M2）；R24 说和契约 8 一致的活动评分形状，实际和契约 8 不一致（M3）；`recordInteraction` 在 DESIGN 里是 409、在 R24 里要接计分，且「生效计划」变成多份后活动参加该给哪个目标计分没定义（M4）；已达成的计划在库里是什么状态没定义（M5）；`expectedRevision` 的口径前后矛盾（M6）；Step 完成建议、紹介ルート 这两类数据从哪来没定义（M7）；b8 的 1024 / 390 计划画板没人认领（M8）；iOrbit「プランに追加」把任务挂到人物类型下这件事没人认领（M9）；几个月度成本上限其实用户会碰到，C2「每月最多 10 个新目标」是产品限制，应该交用户拍板（M10）；v1 计划的创建入口（`bootstrap`、引导）在 R28 之前仍然开着（M11）。

**条件：**
- S1、M1–M7 在 R22 开工前改进 DESIGN 和相应 PLANNER（都是文档改动，R22 第一天要提交的契约受它们影响）。
- M8、M9 在 DESIGN §2 / §7 补上认领（或写明「不做」及理由）。
- M10 把 C2 的月上限列进 §10「需要用户拍板」，或把上限调到普通用户碰不到并改写「唯一用户可见上限」的说法。
- M11 写明 v1 创建入口在哪个 Sprint 关闭。
- m 级在执行时顺手处理即可。

## 问题清单

### 严重

**S1 `getCurrent()` 对 v2 返回 null，会让现有的人脉覆盖度、人脉分析快照、联系人计划说明对 v2 用户全部消失**
- **现象**：
  - DESIGN §3.6 第 201 行：「`getCurrent` / `getCurrentView` 对 v2 计划返回 null（旧 UI 和旧接口只认 v1）」。R22 PLANNER SC-R22-06 只验证 v1 行为不变。
  - 同一节第 204–205 行又说：人脉覆盖度（W0050）、候补管线「原样可用」；v2 初版照旧按 `decideSnapshotRefresh` 顺带生成 `origin = plan` 的快照。
  - 代码里这些功能读计划的唯一入口就是 `getCurrent()`：`features/plans/coverage.ts:9`（W0050 覆盖度与机会标签，「计划只经 `PlanService.getCurrent()` 读取」）、`features/network-analysis/runtime.ts:37-42`（`readCurrentPlanForSnapshot`，快照的计划输入）、`features/plans/contact-plan-context.ts:69-88`（联系人详情的计划上下文）、`features/plans/matching-service.ts:150`（候补「约 TA」草稿）。
- **为什么是问题**：v2 用户确定计划后，人脉分析的「机会」标签、覆盖度、`origin = plan` 快照的计划部分、联系人详情里的计划说明都会当作「没有计划」。这些是乙的 R11 和已上线功能在用的东西，而 DESIGN 写的是「不受影响」，没有任何 SC 会发现它坏了。
- **建议修法**：
  - 在 DESIGN §3.6 逐个列出 `getCurrent()` 的消费方，分成两类：只认 v1 的旧界面（读 `getCurrent` 返回 null 没关系，R25 会删），和要同时认 v2 的服务（覆盖度、快照、联系人上下文、事件归属）。
  - 第二类改走新的只读函数（例如 `readPlanNeedsForActor(actorId)`：返回所有生效计划的人物类型 / 需求，v1 v2 都包括），由 R22 提供；多目标时按「所有生效目标合并」还是「最近打开的目标」也要写明（对标：Notion 多项目视图默认合并显示）。
  - R22 SC-R22-06 增加「v2 种子计划下覆盖度、快照计划输入、联系人上下文仍有数据」的测试。

### 中等

**M1 账本的 `max_calls` 按用途写死，DESIGN 的「每个调用各自的 max_calls」做不到，除非改 CRITICAL 的 `reserve`**
- **现象**：DESIGN §5.2 的表里同一用途给了不同的 `max_calls`：`plan_intake` 下 C2 = 2、C1 / C3 / C4 / C5 / C10 = 1；`plan_review` 下 C8 = 1、C9 = 2；C6 用现有 `plan` 用途却写 3。代码里 `features/ai-quota/ledger.ts:159` 写库时取的是 `AI_QUOTA_MAX_CALLS[request.purpose]`，`constants.ts:34` 是 `Record<AiQuotaPurpose, number>`，现有 `plan: 4`（v1 生成还在用）。DESIGN §3.3 / §13 又承诺 `createPostgresAiUsageLedger`（CRITICAL 80）「只新增按月计数，已有方法不动」。
- **为什么是问题**：两条承诺不能同时成立。要么改 `reserve` 的签名或行为（违背 §13 的对策），要么同一用途只能有一个上限（C2 的修复重试或 C6 的 3 次会被挡掉 / 放宽到不该有的值）。
- **建议修法**：二选一写进 DESIGN：(a) 拆用途，让每个用途只有一个 `max_calls`（例如 `plan_intake`（1）/ `plan_background`（2）/ `plan_draft`（3）/ `plan_review_mark`（1）/ `plan_review`（2）），并把新增的用途一起放进迁移二；或 (b) `reserve` 增加可选的 `maxCalls`（缺省仍按用途），在 §13 改写对策为「新增可选参数，缺省行为不变 + 回归测试」。推荐 (a)：不碰 CRITICAL 函数，月度计数也不用再靠「幂等键前缀」区分（§5.3）。

**M2 Web 与 App 的新路由路径不一致，`route-parity` 测试会对每个新 Web 计划页报缺失**
- **现象**：DESIGN §7（第 342–348 行）Web 用 `/app/plans/flow/[intakeId]`、`/app/plans/[planId]/types/[itemId]`、`/app/plans/[planId]/review`…，App 用 `app/plan/flow/[intakeId].tsx`、`app/plan/[planId]/type/[itemId].tsx`…。App `tests/route-parity.test.ts` 把 Web 的 `app/(app)/app/**/page.tsx` 和 App 的 `app/**` 按**同一路径**比对（`plans` ≠ `plan`、`types` ≠ `type`）。HOW-TO §7 写明例外只能由用户决定。
- **为什么是问题**：R23–R25 每加一个 Web 页都会让 App 测试失败，「零新增失败」做不到，而且不能自己加例外。
- **建议修法**：两端统一成同一套路径（例如都用 `plans/…`、`types/…`，App 文件放 `app/plans/flow/[intakeId].tsx`），DESIGN §7、§8 的深链表和 R22 的 `plan-href.ts` 同步改。

**M3 R24 定义的活动评分形状和 R08 契约 8 不一致，却写成「一致」**
- **现象**：R24 PLANNER 第 40 行 `EventScoreBreakdown.items[].key = 'fit' | 'confidence' | 'timeCost' | 'connections' | 'format'`，满分 45/15/20/10/10，注明「与 R08 契约 8 的 5 项一致，R26 复用」。实际 `shared/contract/event-assessment.ts` 的 `EventAssessmentCriterion = "goalFit" | "people" | "timing" | "cost" | "followUp"`，每项「0–20」。
- **为什么是问题**：两份契约描述同一个分数却是两种键名、两种满分。R26（甲）复用时要么再改一次契约 8，要么两端各认一种；首页的「イベント推薦」也会拿到两种口径。
- **建议修法**：R24 直接把契约 8 改成设计稿规范板的 5 项（键名、满分），在 `BREAKING.md` 登记（契约 8 现在负责人也是甲），`EventScoreBreakdown` 复用契约 8 的类型而不是另起一个；DESIGN §8 R26 行同步写明。

**M4 v2 下「记录面谈」「参加活动」的计分接线前后矛盾，多目标时归属不明**
- **现象**：
  - DESIGN §3.6 第 202 行：v1 写接口（含 `interaction`）对 v2 计划返回 409。R24 PLANNER 第 27、68 行：在 `recordInteraction` / `markEventAttended` 里为 v2 追加计分。
  - `markEventAttended`（`service.ts:1207-1212`）只取 `tx.activePlan()` 一份计划；v2 允许同时 2 个生效目标（再加可能的 v1）。DESIGN §2.7「活动：参加 → イベント枠计分」没说两个目标都有イベント枠时算给谁。
  - `decideMatchCandidate`（R24 转调）接受候补时会在同一事务里给 v2 需求生成 v1 式「约 TA」行动条目（`linkWithin`），DESIGN 没说 v2 要不要这些条目。
- **为什么是问题**：执行人照 DESIGN 会把 `interaction` 挡掉，照 R24 又要接计分；多目标时活动分可能只进其中一个，或者两边都算。
- **建议修法**：DESIGN §2.7 / §3.6 写清：(1) v2 计分只走 R22 的 v2 命令，`recordInteraction` 对 v2 保持 409（或明确允许并说明为何）；(2) 参加一场活动对**每个**有イベント枠的生效 v2 目标各记一次（幂等键已经带 `planId`，天然支持），或只记最近打开的目标——选一个并给对标；(3) v2 接受候补是否生成「约 TA」行动。

**M5 已达成的计划在库里是什么状态没有定义**
- **现象**：`plans.status` 只有 `active` / `archived`。DESIGN §3.2 只加了 `achieved_at`；§9 #12 说「只数生效中的 v2 目标；达成、归档的不算」；契约 `PlanGoalListItem.status: 'active' | 'achieved'`。没有一处说达成时 `status` 改不改。
- **为什么是问题**：如果达成后仍是 `active`，所有按 `status = 'active'` 读的地方（候补管线 `matching-repository.ts:517` 等、引导第 3 步、覆盖度、R11 的 `goalRelated`）都会继续把它当生效计划，候补任务也会继续跑；如果改成 `archived`，又和 v1「以前のプラン」混在一起，`archived_at` 的 CHECK 也要一起满足。
- **建议修法**：DESIGN §3.2 明确「达成 = `status = 'archived'` + `achieved_at` 非空（列表按 `achieved_at` 区分『完了した目標』和 v1 旧计划）」，或新增状态值 `achieved` 并在迁移里放宽 CHECK；同时列出哪些读路径要排除已达成计划。

**M6 `expectedRevision` 的口径前后矛盾**
- **现象**：R22 PLANNER 第 67 行「写接口带 `idempotencyKey` 与 `expectedRevision`」，第 89 行要测 `expectedRevision` 冲突；但第 47 行的 `PlanAwardRequest` / `PlanUndoRequest` / `PlanSkipRequest` 都是 strict 且**没有** `expectedRevision`。DESIGN 也没说计分是否推进 `plans.revision`。
- **为什么是问题**：这是 R22「第一天提交」、乙要照着开发的契约。若计分推进 revision，连续记两个人就会 409，見直し草稿的 `base_revision` 也会因为用户在见直期间记了一笔而作废；若不推进，第 67 行就是错的。另外见直确定时，要按「确定那一刻的已得分」重新校验「配点 ≥ 已得」，DESIGN 没写。
- **建议修法**：写明「revision 只因方案内容改变（见直、手动编辑、目标编辑、Step 完成）而 +1；计分 / 撤销 / 跳过不带 `expectedRevision`、不推进 revision，靠幂等键和按人串行事务保证正确」；見直し / 手動編集确定时按当时的已得分重新跑 `reallocate` 的约束。

**M7 Step 完成建议、紹介ルート 这两类数据从哪来没有定义**
- **现象**：
  - DESIGN §2.5「目安可能已达成时出虚线确认卡（『〇〇さんと DD に進みましたか？』）」，R24 契约有 `stepSuggestions[{ stepKey, question, evidenceIds[] }]`。目安是自由文本（如「主催者 5人中 3人が『欲しい』と言う」），规则判断不了；§5.2 的 C1–C12 和「不新增调用」清单里都没有它。
  - 人物タイプ詳細的「紹介ルート：小林さん → 主催者 4 名」需要知道「经谁、能介绍几个人」。R24 只有 `introRoutes[{ viaContactId, viaName, description }]`，C6 只输出 `introRouteHints[]`，C12（候补 matcher）只加 `opener`；谁产出 `viaContactId`、何时刷新，都没写。
- **为什么是问题**：SC-R24-01（Step 确认卡）和 SC-R24-02（紹介ルート）无法按文档实现；若执行时临时加 AI 调用，就是一笔不在待授权清单里的付费调用。
- **建议修法**：在 DESIGN §5.2 明确：Step 建议是规则（例如「该 Step 关联的人物类型都已达到目标人数」或「有关联面谈记录」时出卡，文案用模板）还是 AI（那就加一行 C13，补成本和上限，进 §10）；紹介ルート由 C6 在生成时从输入别名里挑（写进 C6 输出与校验），还是由 C12 在每次匹配时产出（写进 C12 的输出变更）。

**M8 b8 的 Web 自适应计划画板（1024 / 390 / 空态 / 深色）没有 Sprint 认领**
- **现象**：`b8-responsive.html` 第 2 节「Task › プラン」有 1024 大量数据（スコア 横跨 12 列、下方 7+5、右侧「最近の加点」列表）、390 大量数据（Step 改横滑卡片、↻ = 見直し）、390 空态、深色 1024。DESIGN 开头的设计稿清单没有 b8；R23–R25 的截图对照要求「Web 1440 / 1024 / 390」，但没有对应的设计稿画板。另外 b8 的 390 空态还是旧版（4 个目标磁贴、「分析する」「テンプレートから選ぶ」），和 b10 ① 冲突。
- **为什么是问题**：1024 / 390 的版式（尤其是 390 的 Step 横滑、1024 的「最近の加点」）没人按设计做，截图对照也没有左边那一列；b8 与 b10 的冲突没有记录取舍。
- **建议修法**：DESIGN 设计稿清单补上 b8，§7 写明「版式按 b8（1024：7+5；390：Step 横滑），内容按 b10 / b4（空态以 b10 ① 为准，b8 的 4 磁贴作废）」，并决定「最近の加点」做不做、归 R24；R23–R25 的截图对照页把 b8 画板列进去。

**M9 iOrbit「プランに追加」把任务挂到人物类型下，这件事没有认领**
- **现象**：b4 B4 ②「『プランで見る』跳到『CVC 担当者』人物类型页（A2），该任务挂在类型下」；b8 iOrbit 1024 / 390「プランに追加しますか？『小林さんに CVC 担当者の紹介を依頼』を『CVC 担当者』のやることに」。DESIGN §8 R21 行只给了深链，人物类型详情里没有「やること」区，契约里也没有「给人物类型挂任务」的接口。
- **为什么是问题**：R21（乙）做执行后确认卡时，计划这边没有可写的地方，也没有可显示的地方；按 RD-01「跨人依赖先用空态顶上」也得有一个接口约定。
- **建议修法**：DESIGN 定一个最小方案（对标 Linear issue 关联：任务仍是 To-do 里的任务，只多一个可选的 `planTypeItemId` 关联字段；人物类型详情显示关联的任务），写进 §8 R20 / R21 行和 R24 的契约；或者明确「本期不做，确认卡只给『プランで見る』」，并请设计负责人确认。

**M10 有几个「用户看不到」的月度成本上限其实用户会碰到；C2「每月 10 个新目标」是产品限制**
- **现象**：DESIGN §5.3 第 304 行说 C2 是「唯一一个用户会碰到的成本上限」。但：
  - C6 每月 15 次，而每改一次前提就重做一次初版（§2.3「改前提会让初版重做」）。一个人改几次前提、做两三个目标就会用完，降级结果是「初版をつくれませんでした」——用户直接被挡住，且提示语说的是「失败」而不是「到上限」。
  - 用户主动池每人每日 10 次总熔断（现有）：一次完整生成要 C2 + C6 + C7 ×3 = 5 次，同一天做两个目标或多改几次前提就会触顶，这时 C6 / C7 / C9 都会失败。DESIGN 没提和日熔断的关系。
  - C2 每月 10 个新目标是一条新的产品限制（设计稿和 Q6 只有「同时 2 个目标」）。
- **为什么是问题**：按规则「真正的产品取舍」要留给用户拍板；而 C6 / 日熔断的碰撞会表现为莫名的失败。
- **建议修法**：把「每月新目标上限」列进 §10；C6 的月上限按「目标数 × 预计前提修改次数」放宽（例如 30），或改前提重做时复用同一操作的剩余次数；所有因上限（月或日）被挡的情况统一显示「今日 / 今月の上限に達しました」类提示而不是失败卡，并写进各 SC。

**M11 v1 计划的创建入口在 R28 之前仍然开着**
- **现象**：DESIGN §3.6 只让 `bootstrap` 在「已有 v2 生效目标时拒绝」。没有 v2 的新用户，从引导（`/app/start`、Web `/app/profile/onboarding` 的生成步骤）仍会走 `bootstrap` 生成 v1 计划；R25 删掉旧界面后，这些用户一生成就只能看到只读的「以前のプラン」。引导改走 v2 是 R28 的事，而 R28 负责人待定。
- **为什么是问题**：redesign 一次合回（RD-03），如果 R28 晚于 R25 或范围变化，新用户的第一份计划就是「旧计划」。
- **建议修法**：R25 增加一条「关闭 v1 创建入口」：`bootstrap`、`POST /api/agent/plans`（v1 生成）、`reanalyze` 对所有人返回 409 或改为创建 v2 intake 并返回 `href`；或在 README 合回前总验收里加一条「R28 完成前不得合回」。

### 轻微

**m1 `BREAKING.md` 登记不完整。** R22 PLANNER 第 49 行只登记了 `total`、`byType → segments`、`PlanV2Summary → PlanV2HomeSummary`。实际还有：`PlanV2SummaryResponse` 从 `{ summary, score }` 变成 `{ current, goals }`；`PlanV2Step` 的 `id / personTypeKey` 变成 `key / personTypeKeys[]`；`PlanV2PersonType` 字段整套换掉；`PlanIntakeSummary` 去掉。建议一并登记（虽然 `@draft` 不在快照里，乙读的是 BREAKING）。

**m2 「R23 与 R24 不改同一批文件」不成立。** R24 PLANNER 第 8 行这么写，但 R23 也改插槽的「有 v2 计划」分支（加「已确定」最小卡），两者都改 Web `plan-slot.tsx`、App `TaskScreen.tsx` 的 `PlanSlot`、`orbit-2026/copy/plan.ts`、`src/i18n/*/plan.ts`、`orbit-2026/plan/`、`src/screens/plan/`。建议改为「R23、R24 默认先后做；并行时先约定这几个文件的分段」。

**m3 业界现状库「每类 ≥3 条」前后矛盾。** R23 PLANNER 第 66、94 行要求每类至少 3 条 published（测试断言），第 120 行又允许「该类先少于 3 条发布」。建议测试改成「每类 ≥3 条，或 REPORT 已知例外里列出的类别」。

**m4 C1「每个 intake 草稿最多 5 次」做不到。** C1 在目标输入时触发，那时还没有 intake（intake 在点「iOrbit と具体化する」时才建，§2.1）。建议改为「每人每东京日最多 N 次 + 同文不重调」，或先建 `drafting` intake 再推测。

**m5 业界现状库的审核人从 Codex 改成「全新上下文的 AI 会话」，没有记进 §9。** `IMPLEMENTATION-PLAN.md` §5 Q7 已定「Claude 设计条目，Codex 审核」；DESIGN §6 和 R23 写的是全新上下文的 AI 复核会话。若是有意改动，请写进 §9 并说明理由；否则按 Q7 用 Codex。

**m6 R24 PLANNER 第 16 行写错了入口位置。** `ContactNeedsHomeEntry` 不在旧首页，而在 `src/screens/contacts/ContactsScreen.tsx:1524`（人脈页，R11 的地盘）。R25 删除时要动的是 R11 的文件，按热点规则先通知乙。

**m7 R25 的删除清单漏了几处。** `shared/contract/contact-needs.ts`（只给 `features/contact-needs` 和 App `src/view-models/contact-needs.ts` 用）、App `src/view-models/contact-intros-summary.ts`、`src/view-models/contact-needs.ts`、`src/data/offline-read/route-domain-inventory.ts` 里的 `contacts/intros` 登记。建议补进 R25 第 58 行。

**m8 v2 行要满足的现有约束没写。** `plans` 有 `unique (workspace_id, actor_id, version)`、`goal_snapshot not null`、`starts_on not null`；`plan_log` 的 `body` 必填（1–2000 字）、`kind` / `author` 有 CHECK。DESIGN §3.2 / §4.2 没说 v2 计划的 `version` 怎么取（两个目标并存时都要唯一）、计分记录的 `body` 写什么。建议在 §3.2 补一行。

**m9 有几条自定决定没进 §9。** (1) 「有得分的类型不能移除」：b10 ⑥ 说移除后「可在『方案を見直す』恢复」，没有这条限制；(2) 生成时没用手动编辑，确定后仍保留 1 次（b10 ⑥ Web 写「手动编辑只有这 1 次」）；(3) 用新列 `type_slot` 而不是 D-03 的 `criteria.typeCode`；(4) b10 ⑥ 和 b4 A6 ③ 写「变更案逐条 ✓/✕」，DESIGN 的見直し只有整体「この内容で確定」（b4 A3 ③ 本身也没有逐条确认，属于设计稿内部不一致）。这些都可以自定，但要写进 §9 并给对标。

**m10 R22 的 SC 没覆盖给别人用的服务端函数。** `createPlanFromDraft`（归档 v1、入队匹配、第 3 个目标拒绝）、`addEventToPlan`、`planRemainingTargets`、`planGoalRelatedContactIds`、`markEventAttended` 的 v2 计分都在 R22 范围里，但没有对应 SC 或测试文件。建议加一条 SC-R22-09，否则 R23 / R26 / R11 接上时才发现问题。

**m11 成本上限估算偏低。** §5.4「一个用户用满所有上限约 $0.6」只给 C6 算了修复重试；C2、C7、C9 的 `max_calls` 都是 2，按最坏情况约 $0.84。数量级不变，建议改成「约 $0.6–0.9」。

**m12 `goalKind` 的宽进兜底值不合适。** R22 PLANNER 第 52 行用 `tolerantEnum` 兜底成 `'launch'`。通用规则 10 说「决定『这条是什么』的枚举出现未知值时整条跳过」；目标类型决定显示的 emoji 和名称，兜底成「上市・収益化」会显示错。建议兜底为一个中性显示值（例如 `unknown`，界面只显示目标文），或说明为什么可以兜底。

**m13 几处画面细节没写清归属。** (1) b4 A4 ①「作り直しの確認（残り 2 回）」这张入口弹层（3 格配额条 + 本次会用哪些数据）在 R25 的 SC 里只作为「用完」的截图依据出现，没写要不要做；(2) 概要的「前提を見る」：app.html 写「可逐行改」，但 DESIGN 里确定后改前提只能走見直し——请写明它是只读还是跳到見直し；(3) 「オフラインで話した」填了名字就「加入人脉并用于去重」，用哪个接口建联系人、同名怎么判重没写；(4) b9 招待 ③「AI 推测她符合计划中的人物类型：虚线确认卡」画在联系人页，DESIGN 只说候补出现在人物类型详情，联系人页上的那张卡归谁（R11 / R15）没写。

**m14 Step 撤回后无法再次完成。** DESIGN §4.2 `step_completed` 的幂等键是 `step:<planId>:<stepKey>`，而 R22 允许 `DELETE` 撤回；撤回后再完成会撞唯一键。按计分记录的做法加序号 `:<n>` 即可。

**m15 题库、短名字典等大量产品文字放进 `shared/copy` 的「标准用词」文件不合适。** `shared/copy/README.md` 说明这三个文件只放导航、按钮、状态等通用说法（现在 162 行）；6 类 × 6–8 问的题干和选项、6 × 8 项能力、短名字典会让它膨胀数倍，`copy:qa` 的 kind 规则也不是为题干设计的。另外设计稿只有题干没有选项，选项文字谁写、谁审没有写。建议单独建一个同步文件（`sync-contract.mjs` 的 `fileNames` 加一项，这是 App 热点文件，先找负责人），并把「写题库选项」列进 R22 或 R23 的范围。

**m16 文档可读性小问题。** 整体好读。R22 GOAL「契约去掉 `@draft`、进入『只加不改』快照」对非开发读者仍是内部用语，可改成「首页、人脈等其他人的开发从这天起按正式版接」；DESIGN 里「下书」「豆沙」「斜纹」这类设计稿用语第一次出现时可各加半句解释。

## 逐项核对

| 重点 | 结论 | 说明 |
| --- | --- | --- |
| 1 遗漏的画面 | ⚠️ 基本齐全 | b10 ①–⑥（R23）、⑦⑧ 与规范板的活动评分（R24）、规范板的模板数值（R22）、b4 A1–A2（R24）、A3–A6（R25，A4 ③ 与 Web ご利用プラン 按 Q6 不做）、app / web 的 Task › プラン 目標入力（R23）/ 概要与人物タイプ詳細（R24）、各深色板，都有认领且没有两个 Sprint 重复做（插槽分三步换已写清）。缺：b8 的 1024 / 390 计划版式（M8）、iOrbit 任务挂到人物类型（M9）、A4 ① 入口弹层与几处细节（m13）。index「每月 1 日自动見直し」已被 b4 A3「没有月次自动见直し」和附录 D-b 取代，DESIGN 不做是对的 |
| 2 数据与口径 | ⚠️ | 计分口径（单价、余数、超额半分、匿名到目标、跳过满额、イベント）与 b10 / b4 / app 定稿一致，b10 例子（15 ÷ 2 → 7 + 8，超额 3；20 ÷ 5 → 4，超额 2）按 §4.3 公式验算正确；配额次数与设计稿一致；C1–C12 在 DESIGN 与四个 PLANNER 之间编号和归属一致。冲突：`getCurrent` 消费方（S1）、`max_calls` 按用途（M1）、契约 8（M3）、已达成状态（M5）、revision（M6）、现有 NOT NULL / 唯一约束（m8）。迁移在 v1 数据上可行：现有行默认 `model_version = 1` 且 `horizon` 非空，满足新 CHECK；每人至多一份 active，换成 `coalesce(goal_id, 'legacy')` 索引不会冲突 |
| 3 Sprint 切分 | ✅ / ⚠️ | 四个 Sprint 都能单独收口：R22 无界面、靠服务与路由测试；R24 用 R22 种子计划，不依赖 R23；R23 以「确定后显示最小卡」收口；R25 以删除与零旧链接收口。SC 大多可检验、证据具体。缺口：R22 给别人的服务端函数无 SC（m10）、Step 建议与紹介ルート 的来源未定义导致 R24 两条 SC 无法按文档实现（M7） |
| 4 依赖是否成环 | ✅ | 无环。R10 / R11 / R20 / R21 只等 R22 契约（mock），live 是收尾接线；R20 ↔ R24、R21 ↔ R25 是双向「可选接入」，都写了不接也能收口；R26 在 R24 后、R28 在 R23 后。需注意：R25 可能要改 R11（`ContactsScreen`，m6）和 R21（`iorbit-home`）的文件，已写「先通知乙」；R28 负责人待定会影响 v1 入口关闭（M11） |
| 5 规则遵守 | ⚠️ | §10 只列付费 AI、生产迁移、`contacts/intros` 删除三类，其余自定并有对标；C1–C12 都在待授权清单（模型、单次成本、月上限、本机 ≤5 次）；授权前 mock；生产迁移与部署另行授权；契约宽进严出写进 R22；示例数据不写库；面谈提议对非 Orbit 用户、依頼文只到草稿。问题：C2 月上限是产品限制却没进 §10（M10）；Q7 审核人变更未记录（m5）；`goalKind` 兜底与规则 10 不完全一致（m12） |
| 6 可读性 | ✅ / ⚠️ | GOAL 是普通人能读懂的说明；DESIGN 结构清楚、每个决定有理由。写错的位置 1 处（m6），前后矛盾 3 处（M4、M6、m3），少量内部用语（m16）。抽查的文件路径、符号名其余都存在 |

## 附：复核人做了什么

**读过的文件**
- 被复核：`plan-v2.2/DESIGN.md`、`R22`–`R25` 的 `GOAL.md` / `PLANNER.md`、`git diff -- docs/designs/redesign-2026-10/sprints/`（README 功能登记表、`screen-ownership.md` 四处改动）。
- 依据：`sprints/README.md`、`HOW-TO-START-A-FEATURE-SPRINT.md`、`screen-ownership.md`、`R08-contracts-and-mocks/PLANNER.md`（结构）、`R07-web-shell/REVIEW.md`（格式与 M5 处理记录）、`IMPLEMENTATION-PLAN.md`（§1.7、D-02～D-09、P3、§5、附录 A、附录 D）、`docs/designs/orbit-app/ai-cost-and-storage/2026-08-31-contact-ai-cost-storage-analysis.md`（单价）。
- 设计稿（已渲染文本）：b10、b4、app、web、b9 的 `*.anno.txt` 与正文、`index.txt`；另用无头 Chrome 重新渲染了 `b8-responsive.html`（`--headless=new --dump-dom`），只读其「Task › プラン」一节。
- 代码（只读）：orbits `features/plans/{migrations,service,repository,matching-service,matching-repository,coverage,contact-plan-context,validators,contract}.ts`、`features/network-analysis/{migrations,runtime}.ts`、`features/ai-quota/{constants,ledger}.ts`、`features/guide/progress.ts`、`shared/contract/{plan-v2,event-assessment,notes,contact-needs}.ts`、`shared/api-schema/plan-v2.ts`、`shared/mock/demo-world/index.ts`、`shared/copy/README.md`；App `scripts/sync-contract.mjs`、`tests/route-parity.test.ts`、`src/screens/task/TaskScreen.tsx`、`src/screens/contacts/{ContactIntrosScreen,ContactDetailScreen,ContactsScreen}.tsx`。

**跑过的命令（都是只读）**
- `git -C /Users/li/work/orbit diff -- docs/designs/redesign-2026-10/sprints/`
- `node .gitnexus/run.cjs impact <符号> -f <文件> --direction upstream --repo . --summary-only`：`resolvePlanService`（CRITICAL 50，直接 14）、`createPostgresAiUsageLedger`（CRITICAL 80）、`PlanService`（CRITICAL 121），与 DESIGN §13 一致。
- `grep` / `ls` 核对：`resolvePlanService` 的 14 个非测试调用方、`getCurrent()` 的消费方、`activePlan()` 的单行查询、`AI_QUOTA_MAX_CALLS[request.purpose]`、`/app/agent/plan` 旧链接（复核人数到 25 个文件 41 处，口径与 R25 的「37 处」不同，不计为问题）、文档中 20 余个路径与符号是否存在。
- 用 Python 按 DESIGN §5.4 的单价复算每次调用成本与最坏月成本。

没有修改任何已有文件，只新增了本文件；没有连数据库、没有启动服务器、没有调用付费 AI、没有提交 git。

## 处理记录（执行人，2026-10-10）

S1、M1–M11、m1–m16 全部按建议处理（都是文档改动），DESIGN 升为版本 2。没有需要推翻复核意见的地方；需要用户拍板的事项从 3 项增加到 4 项（M10）。

| # | 处理 | 改了哪里 |
| --- | --- | --- |
| S1 | `getCurrent()` 消费方分两类：只认 v1 的旧界面 / 流程（R25 删或改）；要认 v2 的服务改走 R22 新增的只读函数 `readActivePlanNeeds`（所有生效计划的需求，多目标合并，对标 Notion 多项目视图）。R22 新增 `v2-consumers` 测试，SC-R22-06 改为「旧计划不受影响、新计划被认得」 | DESIGN §3.6、§13；R22 事实 7、impact、范围、测试、SC-06；R22 GOAL |
| M1 | 选 (a) 拆用途：`plan_intake`（1）/ `plan_background`（2）/ `plan_draft`（3）/ `plan_revise`（2）/ `plan_review_mark`（1）/ `plan_review`（2）+ `event_assessment`；`reserve` 不动，月度按用途计数 | DESIGN §3.3、§5.2、§5.3、§9 #22；R22 事实 8、impact、范围、SC-07 |
| M2 | 两端统一同一套路径 `plans/flow/…`、`plans/drafts/…/edit`、`plans/<planId>/types/<itemId>`、`plans/<planId>/review`、`plans/<planId>/done`、`plans/legacy/<planId>`，`route-parity` 不需要例外 | DESIGN §7、§8 R21 行；R22 契约深链；R23 / R24 / R25 新建文件路径 |
| M3 | R24 把契约 8 的 5 项改成设计稿规范板口径（`fit 45 / confidence 15 / timeCost 20 / connections 10 / format 10`），`BREAKING.md` 登记；计划的会える活動复用契约 8 的类型，不另起形状 | DESIGN §8 R26 行；R24 单一目标、事实 6、impact、契约、范围、测试、SC-06、交接 |
| M4 | (1) v2 计分只走 R22 命令，`recordInteraction` 对 v2 保持 409、不改；(2) 活动参加给每个有イベント枠的生效 v2 目标各记一次（R22 `recordEventAttendanceForPlans`，对标 Strava）；(3) 接受 v2 候补只关联、不生成「约 TA」 | DESIGN §2.7、§8 R26 行、§9 #26 #28；R22 服务端函数、范围；R24 事实 7、impact、接口、测试 |
| M5 | 已达成 = `status = 'archived'` + `achieved_at`，加 CHECK；所有「生效」读路径自然排除 | DESIGN §3.2 第 8 条、§9 #29；R22 易错边界、`PLAN_ACHIEVED` |
| M6 | `revision` 只因方案内容改变（見直し、手动编辑、目标编辑）+1；计分 / 撤销 / 跳过 / Step 完成不带 `expectedRevision`；Step 完成改由 `plan_log` 推出（不写进 phases）；见直 / 手动编辑确定时按当时已得分重新校验，`base_revision` 过期 409 | DESIGN §3.1、§3.2 第 9 条、§9 #30；R22 契约；R23 手动编辑接口；R25 测试 |
| M7 | Step「可能已完成」卡改为规则（关联类型都到目标人数），模板文案，不新增 AI；紹介ルート由 C6 / C9 顺带从输入联系人里产出（校验别名、不带无据人数） | DESIGN §2.5、§2.6、§5.2（C6、C9、不新增调用）、§9 #24 #25；R22 契约 `introRoutes`；R23 接口与测试；R24 契约 |
| M8 | 设计稿清单补 b8；Web 1024 / 390 版式按 b8（含「最近の加点」、Step 横滑、↻），内容按 b10 / b4；b8 的 390 空态作废；截图对照页列入 b8 画板 | DESIGN 开头、§2.5、§7、§9 #37；R24 单一目标、契约 `recentAwards`、新建文件、SC-01、证据子表；R23 证据子表 |
| M9 | 最小方案：契约 10 `TaskItemContract` 加可选 `planLink`（R22 第一天契约提交里加，先征得乙同意；R20 落库），人物类型详情显示「やること」，R21 的「プランに追加」写入 `planLink`；落库前该块不显示、确认卡只给「プランで見る」 | DESIGN §2.6、§8 R20 / R21 行；R22 契约；R24 契约、SC-02 |
| M10 | 「每人每月最多新建 10 个目标」列入 §10 第 4 项（推荐 10）；C6 月上限 15 → 30；计划生成流程有自己的日上限 15、不占 10 次总熔断（W0057 先例）；所有上限一律显示「上限」说明而不是失败卡 | DESIGN §5.3、§5.4、§9 #23、§10；R22 范围、SC-07；R23 进入条件、易错边界、测试、SC-07 |
| M11 | R25 关闭 v1 创建入口：`bootstrap`、`POST /api/agent/plans`、`reanalyze` 一律 409 `PLAN_V1_RETIRED` + v2 入口；旧引导的生成步骤改跳 v2。新增 SC-R25-09 | DESIGN §3.6、§12；R25 单一目标、事实 6、接口、范围、测试、SC-09；R25 GOAL |
| m1 | `BREAKING.md` 登记补全 7 项 | R22 契约 |
| m2 | 改为「默认 R23 → R24 先后做；并行先约定共用文件分段」 | R24 分支 |
| m3 | 「每类 ≥3 条」测试排除 REPORT 已知例外里的类别（同一份例外常量） | R23 业界现状库测试 |
| m4 | C1 改为「同文不重调 + 每人每东京日 ≤20 次」 | DESIGN §5.2 C1、§5.4；R23 接口 |
| m5 | 按 Q7 交 Codex 审；不可用时由全新上下文 AI 会话代替并写明 | DESIGN §6、§9 #38；R23 GOAL、业界现状库、执行顺序 |
| m6 | `ContactNeedsHomeEntry` 位置改为人脈页 `ContactsScreen.tsx`（R11 的文件），删除前通知乙 | DESIGN §12；R24 事实 5；R25 事实 5、impact、删除清单 |
| m7 | 删除清单补 `shared/contract/contact-needs.ts`、两个 App 视图模型、离线登记 | DESIGN §12；R25 删除清单 |
| m8 | 写明 v2 行的 `version`（本人最大 + 1）、`goal_snapshot`、`starts_on`、`creation_key`，计分记录的 `kind` / `author` / `body` | DESIGN §3.2 第 7 条、§4.2；R22 服务端函数 |
| m9 | 四条自定决定补进 §9（#31 有分类型不能移除、#32 手动编辑次数顺延、#33 `type_slot`、#27 見直し逐条 ✓/✕）；逐条 ✓/✕ 落到 R25 | DESIGN §2.8、§9；R25 接口、测试、SC-01 |
| m10 | 新增 SC-R22-09 与 `v2-service-functions` 测试 | R22 范围、SC |
| m11 | 最坏月成本改为约 $1.2（按新上限与修复重试重算） | DESIGN §5.4 |
| m12 | `goalKind` 未知值兜底 `'unknown'`，界面只显示目标文 | DESIGN §9 #34；R22 契约与 schema |
| m13 | (1) A4 ① 入口弹层归 R25；(2)「前提を見る」只读 +「見直しで変える」；(3) 线下聊过填名字：先按姓名找、让用户选，没有才新建（来源「プラン」）；(4) 联系人页的人物类型确认卡归 R11，用 R24 的 `fit` 与候补决定接口 | DESIGN §2.5、§2.7、§2.8、§8 R11 行、§9 #35 #36；R24 接口、SC-01；R25 新建文件、SC-01 |
| m14 | Step 完成 / 撤回的幂等键加序号 `:<n>` | DESIGN §4.2；R22 接口 |
| m15 | 题库等文字改放 `shared/compute/plan-template-copy.ts`（整目录已同步，不改热点文件），加进 `copy:qa`；设计稿缺的选项、能力名、短名由 R22 撰写，走 R03 翻译流程并请产品负责人过目 | DESIGN §3.4、§3.5、§9 #7 #39；R22 范围；R23 修改清单 |
| m16 | R22 GOAL 的内部用语改成普通说法；DESIGN 开头解释「下书」「斜纹」「豆沙」 | R22 GOAL；DESIGN 开头 |

**留给用户的（DESIGN §10）**：付费 AI C1–C12 的授权；两个生产迁移（另行授权）；App `contacts/intros` 删除；每人每月最多新建 10 个目标。
