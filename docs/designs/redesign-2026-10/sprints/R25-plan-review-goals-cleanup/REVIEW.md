# Sprint R25 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话，2026-10-11。全新上下文，没参与写作，也没看执行会话的推理。
**对象：** `fcddbc31`（契约）、`0f7e1ef1`（服务端）、`6b1a9492`（Web 界面，含部分 R24 复核修复）、`a91fecae`（App 界面、旧屏 / 旧接口 / 旧链接清理、REPORT）。文中行号都按 `a91fecae`（= 复核时的 HEAD，工作区里只有用户自己的 3 个无关文件）。
**依据：** PLANNER（修订 1，SC-R25-01～09、易错边界、必需证据子表）、GOAL、UI-SPEC；`plan-v2.2/DESIGN.md` §2.8–2.11、§3.6、§5（C8–C10、§5.1、§5.3）、§8、§12；`sprints/README.md` 通用规则。

REPORT 只当线索。下面每条结论都来自复核人重读代码、重跑测试，或在 scratchpad `r25-review/` 里写的临时探针（`probe-pg.test.ts`、`probe-mem.test.ts`、`probe-ui-edit.test.ts`）。

## 结论：不通过

修完 S1，并处理（或经用户拍板后交接）M1–M4，可以转为「有条件通过」。

R25 的大部分内容都做到了，而且做得扎实：见直计次的主路径、全目标合计 3 次、并发只扣到上限（Postgres 上验证）、他人隔离（Postgres 上验证）、达成定格与不占名额、多目标切换、以前のプラン只读、v1 创建入口全关、旧屏 / 旧接口 / 旧链接清理，测试都在断言真实行为。

不通过的原因只有一条：**确定后的手动编辑、见直后的手动编辑，两端界面都不知道哪些类型已得分、哪些已跳过**。手动编辑页把每个类型的 `earnedBase` 当 0、`skipped` 当 false 来做配点联动，所以在任何有跳过类型的计划上，用户只把某个类型 +5，界面就会自动从配点最大的类型里扣 5——如果那正好是跳过的类型（跳过时记满额，等于已得分），服务端确定时必拒。复核人用两端共用的联动函数复现了。更糟的是見直し草稿：手动编辑先保存（标记「已用」）再确定，确定失败后这份草稿再也改不了、确定不了，这次已经扣掉的見直し也就白花了。这正是 PLANNER 易错边界里点名的「已得分变了、跳过的类型配点被改、有分的类型被删」，SC-R25-01 的「手动编辑 1 次」在常见条件下走不通。

### 已经做到、复核人独立核实过的部分

**测试真实通过。** 都在 `a91fecae` 上跑，Postgres 只用本机 `orbit_test`：

| 范围 | 结果 |
| --- | --- |
| orbits R25 服务端：`review`、`goals-r25`、`plan-review-routes`、`plans-v2-flow-postgres`（含 R25 Postgres 往返）、`no-legacy-plan-links` | 23 / 23 |
| orbits 界面与登记：`plan-review-screens`、`plan-overview-screens`、`app-start-guide`、`web-route-transport`、`app-tasks-container`、`agent-plans-routes`、`agent-plans-reanalyze-route`、`need-criteria` | 94 / 94 |
| orbits 门禁：`no-hardcoded-copy`、`orbit-scale-ratchet`、`orbit-0918-anchor-colour`、`product-surface-manifest`、`tests/contracts/*` | 90 / 90 |
| App：`plan-review-screens`、`plan-overview-screens`、`plan-screens`、`app-wide-route-coverage`、`mobile-route-access`、`app-wide-contacts` | 96 通过、2 跳过（截图用例按环境变量跳过）、0 失败 |
| App 门禁：`no-hardcoded-copy`、`legacy-ui-ratchet`、`ionicons-ratchet` | 19 / 19 |
| orbits `npm run typecheck`、App `tsc --noEmit` | 都是 0 错误 |
| `copy:qa` | 1662 条 0 问题（与 REPORT 一致） |

**見直し的计次规则成立。**
- 打开（`startReview`）不扣；同一计划续用进行中的草稿；送出才写 `review_used`；AI 失败（非 busy）不写；没有修改也写一条（`flow-service.ts:1589-1673`）。
- 月计数按 `goalPlans()`（生效 + 已达成）合计，所以两个目标共用 3 次；按 `tokyoUsageMonth` 分月，`review.test.ts` 有东京月初恢复的用例。
- 并发：v2 仓储每个事务先拿按人的 advisory lock（`repository.ts:586`），事务内再查一次计数（`flow-service.ts:1641-1642`），`plan_log` 有 `(workspace_id, actor_id, idempotency_key)` 唯一约束兜底（`features/plans/migrations.ts:123`）。复核人的探针 P1 在 Postgres 上让**两个不同目标**在已用 2 次时同时送出：一个成功、一个 `REVIEW_LIMIT`，`review_used` 正好 3 条。仓库里的并发用例只测了同一份草稿（被 STALE 拦下，不是被配额拦下），P1 补上了跨目标这一种。
- 同键重放直接读回结果、不再调 AI（`flow-service.ts:1591-1593`）；失败回执也会重放成同一个错误。
- 逐条 ✓/✕ 从这一轮的基线重组方案，配点不足 100 时按 5 点回流，跳过的类型不动、不低于已得（`applyAccepted`，`flow-service.ts:815-855`）。C9 输出本身不允许增删类型、不允许改引用（`validate-content.ts:117-133`），所以重组时不会丢掉新增或删除。
- 确定时校验 `base_revision`、按当时的已得分 / 已计人数 / 跳过状态重新校验人物类型、有分或跳过的类型不能删（`flow-service.ts:857-915`）；確定后按「这次是否用过手动编辑」重新给 1 次手动编辑。

**达成、多目标、以前のプラン。**
- 达成 = `archived` + `achieved_at`，不再占生效名额；`summarizePlanScore` 只算 `achievedAt` 之前的记录；达成后记分、见直、改目标都返回 `PLAN_ACHIEVED`（探针 E8）。
- 首页 `summary.current` 取生效目标里 `last_opened_at` 最新的一个，切换时两端都调 `POST …/open`。
- 第 3 个目标在 `createIntake` 被 `PLAN_GOAL_LIMIT` 拒绝；两端代码与文案里都没有任何付费 / ご利用プラン 入口（全文搜索确认）。
- 以前のプラン 只读（`legacyPlans()` 只 select，按人过滤），不会被转成 v2（`goals-r25` legacy 用例）。

**v1 创建入口全关。** `POST /api/agent/plans`、`/bootstrap`、`/reanalyze` 三个路由都直接导出 `planV1RetiredPost`，一律 409 `PLAN_V1_RETIRED` + v2 目標入力地址；`createVersion` / `createPlanBootstrapService` 在产品代码里已没有调用方（只剩种子脚本和测量脚本）；Web 旧引导 `/app/start` 第 3 步改成客户端跳转到 v2，不调任何计划接口；Web `/app/profile/onboarding` 本来就不生成计划；App 没有 `/start`。

**他人数据隔离（Postgres，探针 P2）。** bob 用 alice 的 planId / draftId / changeId 调 R25 的全部新接口：`startReview`、`openManualEdit`、`achieve`、`editGoal`、`nextGoals` → `PLAN_NOT_FOUND`；`reviewFix`、`toggleChange`、`confirm`、`manualEdit` → `DRAFT_NOT_FOUND`（都在调 AI 之前）；`getReview`、`currentReview`、`achievement`（达成前后）、`legacyDetail` → `null`；bob 的配额是 3、alice 的是 2，互不影响；alice 计划的目标文没被改。

**清理。**
- PLANNER 删除清单里的文件全部不存在（逐个 `test -e` 确认）；`plan-slot.tsx` 搬到 `app/(app)/app/tasks/`。
- 旧地址在两端代码里为零：复核人用比 `no-legacy-plan-links` 更宽的范围（两个仓库全部非 `node_modules` / 构建产物 / docs / tests 的文件，含 JSON 与 mockdata）搜了 6 个旧地址，剩下的只有注释和 `scripts/visual/README.md`。`?plan=…&reveal=1` 也已没有生产者。
- BREAKING.md 新增 27 行，覆盖两个契约文件的全部导出、`index.ts` 导出与活动跟进 `taskHref`。
- 允许清单只减不增：orbits `hardcoded-copy-legacy-allowlist.json`（`6b1a9492`、`a91fecae` 两次都只有删除或数字变小）、`orbit-scale-ratchet`、`orbit-0918-anchor-colour`，App 三份允许清单，逐行看过 diff。
- Web transport 审计 60 → 63（R25 新增 3 页）→ 61（删 2 页），门禁测试通过。
- 归属表计划相关 3 行改为「已处理」，README 合回前两项打勾。

**REPORT 的几个说法核实过。**
- 「8 条已有失败在基线同样失败」属实：复核人把 `3b8f0d20` 用 `git archive` 解到 scratchpad，同库同文件重跑，基线与 HEAD 都是 66 条里同样 8 条失败、名字逐条相同。
- 付费 AI 记录与 `real-ai.json` 的账本行一致：C9 三个操作（2 失败、1 成功）共 5 次 HTTP、输入 13,886 / 输出 10,678；C8、C10 各 1 次。
- 点击验证日志 `click-verify.log` 存在，旧地址 404、v1 三入口 409 属实（证据强度见 m4）。

## 问题清单

### S1 手动编辑（确定后 / 見直し后）的界面不知道已得分与跳过，配点联动会做出服务端必拒的方案；見直し草稿失败后卡死

**位置：**
- Web `app/(app)/app/orbit-2026/plan/PlanManualEditScreen.tsx:96` 用 `allocationSlotsOf` 建配点槽；`features/plans/v2/validate-content.ts:56-57` 给每个槽填的是 `earnedBase: 0`、`metCount: 0`、`skipped: false`。
- App `src/screens/plan/plan-model.ts:232-235` 同样全填 0 / false，`:258`、`:267` 的改配点、删类型都基于它。
- 服务端 `features/plans/v2/flow-service.ts:1458-1528`：`manualEdit` 先在一个事务里保存草稿并把 `manualEditUsed` 记为 true，**然后**（`:1525`）在另一个事务里调 `confirmReviewDraft`，那里（`:871-880`）才校验已得分、跳过、有分不能删。

**复现：**
- 探针 U1（`probe-ui-edit.test.ts`）：fundraising 计划配点 `cfo 10 / funded_founder 15 / angel 10 / vc_partner 30 / cvc 15 / lawyer 10 / event 10`，跳过 VC パートナー（跳过记满额 30）。打开确定后的手动编辑，用界面同一个 `changeAllocation` 把 CFO 调到 15：联动自动从最大的 VC 扣 5 → 提交得到 `INVALID_INPUT: VC パートナー: points cannot go below what was already earned.`。用户在界面上做的只是「给一个类型 +5」。界面同样允许删除有分的类型（`removeSlot` 看到的 `earnedBase` 是 0）。
- 探针 E2（`probe-mem.test.ts`）：在見直し草稿上做同样的事 → 确定失败，但草稿已记 `manualEditUsed = true`；之后 `startReview` 续上的还是这份草稿，`confirm` 永远是同一个 `INVALID_INPUT`，再手动编辑是 `MANUAL_EDIT_USED`；再送出 C9 也没用（C9 校验器拿这份已经不合法的内容当「改之前」，跳过类型的配点会被原样保留）。唯一的出路是回概要点「手動で編集」，`openManualEdit` 会把这份草稿作废——这次已经扣掉的見直し和它的修正结果一起丢掉。

**建议修法：**
1. 两端手动编辑页在草稿 `kind: "review"` 时，从概要（`PlanV2Detail` 的 `score.segments` / 类型列表）拿每个类型的已得分、已计人数和跳过状态，填进 `earnedBase` / `metCount` / `skipped`，让共用的联动函数自己避开（`plan-allocation.ts` 本来就支持这三个字段）。或者给 `PlanDraftView` 加只读的可选字段（契约只加不改），服务端直接给。
2. 服务端 `manualEdit` 对 review 草稿，在**同一个事务里**先做 `confirmReviewDraft` 那套校验，不合格就整体回滚，不要先把 `manualEditUsed` 记成 true。最好把保存与确定合成一个事务（R23 的「保存即确定」语义不变）。
3. 加回归：有跳过类型的计划，手动编辑 +5 一个类型 → 成功，跳过类型的配点不变；見直し草稿上手动编辑被拒后，草稿仍可再手动编辑。

### M1 见直配额有两套数：用户看到的 3 次只扣成功，成本上限的 3 次连失败也算

**位置：** `features/ai-quota/constants.ts:88`（`plan_review: 3`）+ `features/ai-quota/ledger.ts:122-125`（月计数 = 非 released 行，`failed` 也算）；`flow-service.ts:1597-1598`、`:808` 只按 `review_used` 显示和拦截。

**证据：** REPORT 自己的真实调用账本（`real-ai.json`）：同一个月里 `plan_review` 有 3 行非 released（2 failed、1 succeeded），而界面口径只扣了 1 次。按代码，这个人接下来送出会在账本 `reserve` 处得到 `monthly_limit`，界面显示 `AI_LIMIT`「今月の上限に達しました」，同时配额条还写着「今月あと 2 回」。DESIGN §5.1 明确「失败不计用户看得到的次数，但有 HTTP 响应就占月上限」，§5.3 又把 `plan_review` 的成本上限设成和用户次数一样的 3，两条放在一起必然打架。R23 复核 M7 对 `plan_background` 提过同类问题。

**建议修法：** 成本上限要高于用户次数，给失败留余量（例如 `plan_review` 6：3 次成功 + 每次最多 1 次失败），或者改成按 `succeeded` 计。这是付费 AI 的上限，**需要用户拍板**；拍板前至少在 REPORT 交接里写明这个不一致。

### M2 事件枠的配点可以降到已得分以下

**位置：** `flow-service.ts:871-877` 只校验人物类型，不校验 `content.event.allocation`；C9 的 `checkReviewFix`（`features/plans/v2/ai/schemas.ts:203-207`）也只看人物类型。

**复现：** 探针 E1：计划加一场活动并记参加分（event 已得 5），确定后的手动编辑把事件枠配点改成 0、差额挪给第一个类型 → 确定成功；概要的事件段变成 `allocation 0 / earned 5`。DESIGN §2.8 和 C9 都要求「配点不低于已得」，イベント枠也是计分枠。

**建议修法：** `confirmReviewDraft` 与 `checkReviewFix` 对事件枠同样校验（已得 = `typeKey === PLAN_EVENT_SEGMENT_KEY` 的 base 记录之和）；S1 的界面修法里事件槽也填上 `earnedBase`。

### M3 计划被改过之后，旧的見直し草稿照样能送出、照样扣次数，但永远确定不了

**位置：** `flow-service.ts:1594-1598`（送出前不比对 `draft.baseRevision` 与 `plan.revision`）；`:1581-1586`（`currentReview` 不管草稿是否已过期都返回）；`:1759-1781`（`editGoal` 的 `save_only` 让 revision +1，但不作废进行中的見直し草稿；只有 `save_and_rebuild`、确定后手动编辑、达成会作废）。

**复现：** 探针 E6：开始見直し → 「目標だけ保存」改目标（revision +1）→ `currentReview` 仍返回旧草稿 → 送出成功、配额 3 → 2 → 确定得到 `STALE`。界面上「最新を読み込む」会开一份新草稿，刚才扣掉的那次和修正结果都作废。用户在 Web 上从見直し页回概要改目标、再用浏览器返回，就会走到这条路。

**建议修法：** `reviewFix` 在调 AI 之前检查 `baseRevision === plan.revision`，不等就直接 `STALE`（不扣、不调 AI）；`editGoal` 的 `save_only` 同时作废进行中的見直し草稿（与另外三处一致），或者 `currentReview` 不返回过期草稿。

### M4 C8 / C10 的输入里没有面谈内容，只有计分流水；而且带着内部记录 id

**位置：** `flow-service.ts:1556-1562`（C8 的 `records` = `plan_log` 的 `score_awarded` / `step_completed`，正文是「CFO 経験者：+10」「Step 完了：…」这类计分文字）；`:1746-1747`（C10 同样只给计分流水 + 目标文 + 结论）；`features/plans/v2/ai/deepseek.ts:94-96` 把 `input` 原样发给模型。探针 E7 打印了真实输入：`{"id":"plog_id9","kind":"talked","text":"CFO 経験者：+10"}`。

**影响：**
- DESIGN §5.2 的 C8 输入是「确定以来的面谈记录 / 自报 / 活动 / Step 完成」，§2.8 的例子是从面谈记录「ARR 1億円の見込み」推出前提变了。现在模型只能看到「某类型 +10」，推不出任何前提事实，C8 的核心价值做不出来；C10 的「基于面谈记录的候选」同理（DESIGN 还要求带资料，也没带）。
- `plog_…` 是数据库内部 id，原样出境；不是联系人信息，但不符合 §5.1「id 不出境、用短期别名」的做法，复核任务也点名要查这一点。

**建议修法：** C8 / C10 输入加上确定以来、与本计划类型关联的面谈メモ摘要（联系人换成 C1… 别名，沿用 `aliasContacts`），条数和字数设上限；记录 id 换成 `R1…` 短别名，回来后反向映射（`checkReviewMarks` / `checkNextGoals` 的「依据 ∈ 输入」照常适用）。提示词变更后在本机重新验证（属于已授权的 ≤5 次范围内，C8 还剩 4 次、C10 还剩 4 次）。

### m 级

- **m1 两端「このまま」语义不一致。** Web 在没有任何修改时显示「このままにする」并直接回概要、不确定（`PlanReviewScreen.tsx:275-277`）；App 只看最后一轮，最后一轮没改就把按钮写成「このままにする」，按下去却调 `confirm`（`orbit-app/src/screens/plan/PlanReviewScreen.tsx:453`、`:493`）——如果前几轮有采用的修改，App 会把它们确定并弹「方案を更新しました」。另外 Web 要求「改了前提或写了一句」才能送出（`PlanReviewScreen.tsx:127`），App 空着也能送出（`plan-review-model.ts:85`）。建议两端统一：按整个草稿是否有改动决定文案，「このまま」一律不确定；送出条件两端一致。
- **m2 「確定以来」的 Step 数不准。** `service.ts:265` 的 `stepsCompleted` 既没按「确定以来」过滤，也没扣掉 `step_reopened`，完成 → 撤回 → 再完成算 2。入口弹层「这次参考的数据」用的就是这个数。
- **m3 完成页一打开就调 C10。** 两端完成页加载时就请求 `next-goals`（Web `PlanDoneScreen.tsx:44,52`、App `PlanDoneScreen.tsx:53`），DESIGN §2.9 是按「次の目標を決める」才出候选。每计划只调一次、有缓存，成本可控，但只想回看完成页的人也会触发一次付费调用；缓存也不分语言（第一次用什么语言，之后都是那种语言）。建议改成按钮触发，或在 REPORT 里写明这是有意的偏离。
- **m4 SC-07 / 截图证据比 REPORT 写的弱。** REPORT 写「37 个链接直达 200」，日志里实际只有 35 行 `OPEN`，其中 30 个是 `/app/tasks/relationship/*` 的任务详情，真正的计划 / 日程 / To-do 落点只有 `/app/tasks`、`?tab=plan`、`?tab=calendar` 三种；活动详情的跟进链接（`orbit-post-event-center.tsx`）所在页面没有打开。App 截图用的是 react-native-web，不是 PLANNER 要求的模拟器（REPORT 已注明）。
- **m5 测试删多了一点。** `tests/pages/app-contact-value-line.test.tsx` 删掉的「SC-W0061-02 none／pending／failed／no_goal 退化」用例里，除了已删的 `PlanMatchSheet` 渲染，还有对仍在使用的 `contactValueLine` 纯函数的断言（各状态的 tail、只有姓名、姓名也空时「—」、英文失败文案）。建议把纯函数那部分留下。
- **m6 R25 新接口的他人隔离没有进仓库的 Postgres 回归。** 复核人的探针 P2 证明行为正确，建议把它收进 `tests/capabilities/plans-v2-flow-postgres.test.ts`（R24 复核 M7 的同类要求）。
- **m7 动过的 R21 文件不止 import / 链接 / 入口。** `iorbit-shell.tsx` 删掉了 W0014 的示例只读问答，`iorbit-home.tsx` 删掉了本周行动、计划匹配、周一小结、计划点名活动，`agent/page.tsx` 删掉了 W0008 的 `?plan=` 回答卡片。都是因为依赖的 v1 组件被删，方向没错，REPORT 决定 #9 也列了首页那部分；但 W0014 示例问答的删除没写进 REPORT，热点文件也没通知到乙（REPORT 写「用这份 REPORT 代替通知」）。建议在 REPORT「动过的别人的文件」里补全，并在乙上线时补一次通知。
- **m8 以前のプラン会把同一份 v1 计划的每个历史版本都列出来。** `repository.ts:269-273` 取全部 `model_version = 1` 的行（最多 20 条），v1 每次重新分析都会留一个归档版本，做过两次重新分析的人会看到 3 张「以前のプラン」。建议每条 v1 系列只列最新一版，或按版本分组。
- **m9 C9 不允许改紹介ルート。** C9 复用 C7 的 `disallowedChangeIssues`，`introRoutes` 在禁改字段里（`validate-content.ts:128`），而 DESIGN §5.2 C9 写的是「可以更新紹介ルート」。改不改都行，但要和设计对齐（改设计或放开这一项）。
- **m10 `next-env.d.ts` 被提交成指向 `.next-verify`。** `a91fecae` 把它改成 `import "./.next-verify/dev/types/routes.d.ts"`，这是本机第二个 dev server 的 distDir。这个文件历史上来回变过，不影响别人，但属于无关改动，建议还原。
- **已知例外（REPORT 已写明，复核人确认属实，不另计）：** C9 提示词 v4 未验证；改目标弹窗因契约没有背景字段，「只改说明直接保存」做不出来，任何改动都给三个出口；只剩已达成目标、又没有 v1 的人进不了完成页；`/app/tasks` 未登录跳转丢 `new=1`。

## 复核人做了什么

- 读了 PLANNER、GOAL、UI-SPEC、REPORT，DESIGN §2.8–2.11、§3.6、§5、§8、§12，R24 REVIEW 的格式。
- 逐段读了服务端 `flow-service.ts`（見直し、确定、手动编辑、配额、达成、C10、改目标）、`service.ts`（完成页、以前のプラン、`planSinceConfirmed`）、`repository.ts`（锁、`goalPlans`、`legacyPlans`、内存仓储约束）、`ai/schemas.ts`、`ai/deepseek.ts`、`validate-content.ts`、`v1-retired.ts`、三个 v1 路由、`ai-quota` 的上限与月计数、`plan_log` 迁移；Web `PlanReviewScreen`、`PlanReviewEntry`、`PlanDoneScreen`、`PlanManualEditScreen`（配点槽部分）；App `PlanReviewScreen`、`plan-review-model`、`plan-model`（配点槽）、`PlanDoneScreen`、`PlanProposalSheet`。
- 清理部分：逐个确认删除清单、全仓库搜旧地址、读 `no-legacy-plan-links` 的扫描范围、BREAKING 新增行、允许清单与 ratchet 的 diff、R21 / R11 文件的 diff、被删 / 改写测试的 diff。
- 跑了上表的测试、两端类型检查、`copy:qa`；基线 `3b8f0d20` 用 `git archive` 解到 scratchpad 重跑 8 条已有失败。
- 写了 3 个探针（scratchpad `r25-review/`）：
  - `probe-pg.test.ts`（Postgres）：P1 跨目标并发送出；P2 他人隔离。两条都通过。
  - `probe-mem.test.ts`（内存 + mock AI）：E1 事件枠降到已得以下；E2 見直し草稿手动编辑被拒后卡死；E3 只保存改目标类型后再见直；E6 改目标后旧草稿送出；E7 C8 / C10 的真实输入；E8 达成后的写操作。
  - `probe-ui-edit.test.ts`：U1 用界面同一个联动函数在有跳过类型的计划上 +5。
- 看了证据目录里的 `click-verify.log`、`real-ai.json`。

## 没做的事

- 没跑两端全量测试（按要求）；REPORT 的全量数字（orbits 7014 / App 4252）没有重算。
- 没起 dev server、没做浏览器或模拟器走查，也没逐张看 `compare.html` 的截图；界面结论来自代码和两端渲染测试。
- 没连 Neon、没读 `.env`、没调付费 AI、没部署；Postgres 只用 `postgres://localhost/orbit_test`。
- 没核对 `6b1a9492` / `a91fecae` 里夹带的 R24 复核修复的每一条（不在本次对象内），只顺带看了与 R25 交叉的部分。
- 没跑 GitNexus `detect-changes`。
- 没改任何产品代码，没有 commit / stash / checkout；唯一产出是本文件，探针与基线副本只在 scratchpad。
