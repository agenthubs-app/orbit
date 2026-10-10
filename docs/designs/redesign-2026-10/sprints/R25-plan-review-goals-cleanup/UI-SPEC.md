# R25 两端界面规格（执行用）

依据：DESIGN §2.8–2.11、§7–§8、§12；PLANNER（SC-R25-01～09）；设计稿 `b4-plan-iorbit.html` A3 見直し ①–④（含 Web）、A4 配額 ①②（③ ご利用プラン **不做**，Q6 隐藏付费入口）、A5 達成 ①–③（含 Web）、A6 目標切替と編集 ①–③（含 Web）；`app.html` / `web.html` 的目标下拉。设计稿人名一律换成接口数据。

服务端已完成：`features/plans/v2/{flow-service,flow-handlers,service,handlers,v1-retired}.ts`，契约 `shared/contract/plan-v2.ts` 的 R25 段，深链 `shared/compute/plan-href.ts`（`planReviewHref`、`planDoneHref`、`planLegacyHref`、新增 `planNewGoalHref`）。界面不自己算分、不自己算配额。

## 接口

请求头：`x-orbit-lang`；App 另加 `x-orbit-platform: app`。写请求带新的 `idempotencyKey`。

| 操作 | 接口 | 返回 |
| --- | --- | --- |
| 配额 | `GET /api/agent/plans/v2/quota` | `PlanQuotaResponse`（`reviewLeftThisMonth` / `reviewMonthlyLimit` / `resetsAt` / `activeGoals` / `activeGoalLimit` / `newGoalsLeftThisMonth`） |
| 开始見直し（不扣次数） | `POST /api/agent/plans/v2/[planId]/reviews` | `PlanReviewView`（201；同一计划已有进行中的見直し时续上同一份） |
| 进行中的見直し | `GET /api/agent/plans/v2/[planId]/reviews/current` | `PlanReviewView`（没有 → 404） |
| 按草稿读 | `GET /api/agent/plans/drafts/[draftId]/review` | `PlanReviewView` |
| 送出（扣 1 次；失败不扣；不改也扣） | `POST /api/agent/plans/drafts/[draftId]/review/fix` `{ premise: [{key, value}], text, idempotencyKey }` | `PlanReviewView`；用完 → 409 `REVIEW_LIMIT`（`retryOn`）；AI 失败 → 同 R23 的 AI 错误（`AI_FAILED` / `AI_BUSY` / 上限） |
| 逐条 ✓ / ✕ | `POST /api/agent/plans/drafts/[draftId]/changes/[changeId]/toggle` `{ accepted }` | `PlanReviewView`（服务端重组方案，合计保持 100） |
| 见直后手动编辑（1 次） | `POST /api/agent/plans/drafts/[draftId]/manual-edit`（R23 同一个，草稿 kind review 也行） | `PlanConfirmResult`（手动编辑即确定） |
| 确定 | `POST /api/agent/plans/drafts/[draftId]/confirm` | `PlanConfirmResult`（`base_revision` 过期 → 409 `STALE`） |
| 确定后的手动编辑 | `POST /api/agent/plans/v2/[planId]/manual-edit` → 返回 review 草稿（`PlanDraftView`），再用上面的 manual-edit 提交 | 不调 AI、不扣见直；`MANUAL_EDIT_USED` 409 |
| 达成 | `POST /api/agent/plans/v2/[planId]/achieve` `{ expectedRevision }` | `{ planId, achievedAt }` |
| 完成页 | `GET /api/agent/plans/v2/[planId]/achievement` | `PlanAchievementView` |
| 下一目标候选（C10，每计划一次） | `GET /api/agent/plans/v2/[planId]/next-goals` | `PlanNextGoalsResponse`（`source: "none"` 时只显示「自分で決める」） |
| 改目标 | `PATCH /api/agent/plans/v2/[planId]/goal` `{ goalText?, goalKind?, mode: "save_only" \| "save_and_rebuild", expectedRevision }` | `PlanGoalEditResult`（`save_and_rebuild` 带 `reviewDraftId` → 进見直し页） |
| 以前のプラン | `GET /api/agent/plans/legacy`、`GET /api/agent/plans/legacy/[planId]` | `PlanLegacyListResponse` / `PlanLegacyDetail` |
| 目标列表 / 切换 | R22 已有：`GET /api/agent/plans/v2`（`goals`）、`POST …/v2/[planId]/open`（切换时调用，首页 `summary.current` 跟随） | |
| v1 创建入口 | `POST /api/agent/plans`、`…/bootstrap`、`…/reanalyze` 一律 409 `PLAN_V1_RETIRED`，`error.context.href` = v2 目標入力（Web `/app/tasks?tab=plan&new=1`，App `/task?seg=plan&new=1`） | |

## 画面

### 概要按钮接线（R24 的「まもなく」占位全部接上）
- 「方案を見直す」→ 入口弹层（b4 A4 ①：Web Modal 520 / App BottomSheet）：3 格配额条（用掉的灰、剩下的深紫）、「毎月 1 日に戻ります（`resetsAt`）」、这次参考的数据（`sinceConfirmed`：話した N 人 · イベント N 回 · Step 完了 N）、主按钮「iOrbit で見直す」→ 调 `reviews` → 进見直し页。用完时弹层变 A4 ②（见下）。
- 「手動で編集」→ `v2/[planId]/manual-edit` 开草稿 → 进 R23 的手动编辑页（`planDraftEditHref`；R23 页面要能处理 kind review 的草稿：返回 / 确定后回概要 + Toast）。`quota.manualEditAvailable` 为 false 时按钮灰 + 说明「見直すと 1回つきます」。
- 「達成にする」→ 确认框（b4 A5 ①：分数、话过的人数，「達成にすると点数はこれ以上増えません」）→ `achieve` → 完成页。
- 右上 ↻（390）同「方案を見直す」。

### 見直し页（Web `/app/plans/[planId]/review`、App `app/plans/[planId]/review.tsx`）
- 顶部 3 段进度：前提 / AI 修正 / 手動編集。
- ① 前提卡（「確定した前提」）：每行 label + value + 出处（背景 / Q1… / 記録）；`premiseMarks` 里的行豆沙底 + 「変わったかもしれない」+ 依据（`evidenceIds` → 记录摘要）+ 建议值（`suggested`，点了填进去）。点任一行就地改（输入框深紫描边）；改过的行旧值删除线 + 新值浅紫。
- 输入框上方：「見直し · 今月 あと N 回」+「送ると 1回使います（変更がなくても 1回）· 月3回 · 毎月1日に戻ります」；「ほかに変わったこと（任意）」多行输入。主按钮「前提を送って修正案をつくる」，按钮下「今月あと N → N-1 回」。
- ② AI 修正卡（每一轮 `turns`）：「見直し · AI 修正を反映（今月 k / 3 回目）」；只列差分：每条「変更」小签 + 旧文删除线 + 新文浅紫 + 理由「?」；**每条右侧 ✓ / ✕**（`accepted`，✕ 后整卡用服务端返回的新方案）；「変わらない点」列表（`unchanged`）+「獲得済み X → X」。没改的轮次显示「今回は変更しません」+ `noChangeReason`（b4 A3 ④）。
- 底部：「手動で編集（1回）」（`draft.manualEditUsed` 为 true 时灰）、「この内容で確定」→ 回概要 + Toast「方案を更新しました」；「もう一度直す（あと N 回）」。
- 用完（`reviewLeftThisMonth = 0`，b4 A4 ②）：输入栏灰「今月の見直しは使い切りました」+「記録・加点・スキップはいつも通り使えます」+ 恢复日；主按钮「わかりました」；**不出现任何付费 / ご利用プラン 入口**。
- STALE（别处改过）→ 说明 + 「最新を読み込む」。AI 失败 → 「もう一度」（不扣次数的说明）。

### 達成 → 完成页 → 次の目標（Web `/app/plans/[planId]/done`、App `app/plans/[planId]/done.tsx`，b4 A5）
- 克制：emoji 方块 + 三格大数字（スコア `total` · 話した人 `talkedPeople` · イベント `events`），无礼花；「いちばん効いたこと」（`bestMove.text` + 依据「?」）；「スキップした領域」（`skippedAreas`）。
- 次の目標：调 `next-goals`；最多 2 张候选卡（目标文 + 类型 chip + 依据）+「自分で決める」；选候选 → 进 R23 生成流程（`POST /api/agent/plans/intakes` `{ goalText, goalKind, source: "next_goal" }` → `planFlowHref`）；「自分で決める」→ 目標入力（`planNewGoalHref`）。`source: "none"` → 只剩「自分で決める」。
- 生效目标已满 2 个时，候选卡下方说明「同時に進められる目標は 2 つまでです」，按钮灰；**不出现付费入口**。

### 目标下拉 / 添加 / 编辑（b4 A6）
- App：Task › プラン 段下目标名「▾」→ BottomSheet：生效目标（分数、话过人数、当前打勾）、达成的目标（只读，进完成页）、底部「以前のプラン」（有 v1 才显示）、「＋ 目標を追加」（满 2 个时灰 + 说明）。切换时调 `open`。
- Web：页签下目标行左侧下拉（Popover，内容同上）。
- 「目標を編集」（概要头部的 ⋯ 或下拉里）→ Modal / BottomSheet：目标文 + 类型；只改说明直接「保存」；改了目标文或类型 → 三个出口：「方案を作り直す」（`save_and_rebuild` → 見直し页）、「目標だけ保存」（`save_only`，配点不变）、「キャンセル」。
- `new=1`：Task › プラン 带 `new=1` 时直接打开目標入力（R23 组件）；满 2 个时显示说明而不是输入。

### 以前のプラン（v1 只读，Web `/app/plans/legacy/[planId]`、App `app/plans/legacy/[planId].tsx`）
- 没有 v2 但有 v1 的用户：Task › プラン 显示「以前のプラン」卡（目标、开始日、Step 进度 `actionsDone / actionsTotal`、会いたい人 `needs`）+ 主按钮「新しいプランを作る」（→ 目標入力）。替换 Web `plan-slot.tsx` / App `PlanSlot` 里的 v1 分支。
- 详情页只读：目标、分析摘要、条目按 kind 分组（行动 / 会いたい人 / 情報 / イベント，带状态）。不提供任何编辑 / 重新分析。

## 其他
- 旧引导（`/app/start`、Web `/app/profile/onboarding`）里「生成计划」那一步：收到 409 `PLAN_V1_RETIRED` 或直接改为跳 `error.context.href` / `planNewGoalHref`。
- 新路由登记照 HOW-TO §7（Web：transport 审计计数 + 样本、`audit:full-product`、`audit:surfaces`；App：`integratedFeatureRoutes`、离线清单 online-only、`parentForPath` → Task › プラン、`route-domain-inventory.ts` 登记新接口）。
- 组件只用 R04 / R06 库；文字进 Web `copy/plan.ts`、App `plan` 字典（三语）；token、Icon；浅色 / 深色；原生 `<button>` 带 `btn ` 类。
- 只在用户操作时发写请求；动效遵守「減らす動き」。
