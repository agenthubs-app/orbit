# R24 两端界面规格（执行用）

依据：DESIGN §2.5–2.7、§7；PLANNER（SC-R24-01～07）；设计稿 `b10-plan-example.html` ⑦ プラン概要（少量 / 大量、App / Web）、⑧ 人物タイプ詳細（A 人脈にいる · D 人脈にいる · B 人脈にいない、内訳展开、依頼文草稿）、规范板「イベントスコアの基準」；`b4-plan-iorbit.html` A1（記録と加点 ①–④）、A2（三种去向、面談提案、Web 版）；`b8-responsive.html`「2 · Task › プラン」1024 / 390；`app.html` / `web.html` 的 Task › プラン。设计稿人名一律换成接口数据（mock 是演示世界）。

服务端已完成（`features/plans/v2/{service,overview,handlers}.ts`），契约在 `shared/contract/plan-v2.ts` 的 R24 段。分数一律用接口返回的 `score`（服务端用 `summarizePlanScore` 算），界面不自己算分；单价 / 回流用 `shared/compute`。

## 接口

请求头：`x-orbit-lang`；App 另加 `x-orbit-platform: app`（`todayChance.href` 等返回 App 形状）。写请求带新的 `idempotencyKey`。

| 操作 | 接口 | 返回 |
| --- | --- | --- |
| 概要 | `GET /api/agent/plans/v2/[planId]` | `PlanV2Detail`（含 `todayChance`、`typeStats`、`stepProgress`、`stepSuggestions`、`recentAwards`、`pending`） |
| 首页同一份分数 | `GET /api/agent/plans/v2/summary` | `PlanV2SummaryResponse`（Task › プラン 先用它找当前目标） |
| 人物タイプ詳細 | `GET …/v2/[planId]/types/[itemId]` | `PlanPersonTypeDetail` |
| 记一次（有名字） | `POST …/types/[itemId]/awards` `{ basis: "talked", contactId }` | `PlanAwardResult`（`points` / `part` / `reason`） |
| 线下聊过（名字可空） | `POST …/types/[itemId]/talked-offline` `{ name }` → 返回 `matches` 时让用户选「この人ですか？」→ 选了 `{ contactId }`；都不是 `{ name, createContact: true }`；没名字 `{ anonymous: true }` | `PlanTalkedOfflineResult` |
| 撤销（5 秒 Toast） | `POST …/v2/[planId]/awards/[awardLogId]/undo` | `PlanCommandResult` |
| 跳过 / 撤回 | `POST` / `DELETE …/types/[itemId]/skip` | `PlanCommandResult` |
| Step 完成 / 撤回 | `POST` / `DELETE …/steps/[stepKey]/complete` | `PlanCommandResult` |
| 候补 ✓ / ✕ | `POST …/types/[itemId]/candidates/[contactId]/decision` `{ decision }` | `PlanCandidateDecisionResult` |
| 面談を提案 | `POST …/types/[itemId]/proposals` `{ contactId, slots: [3 个 ISO] }` | `PlanProposalResult`（现在一律 `kind: "draft"`：显示草稿 + コピー / メールアプリで開く，**没有发送按钮**） |
| 紹介ルートの依頼文 | `POST …/types/[itemId]/intro-drafts` `{ viaContactId }` | `PlanIntroDraftResult`（同上，只有コピー / メールアプリで開く） |
| 待确认卡 | `GET /api/agent/plans/v2/pending`；`POST …/pending/[id]/accept`（memo 手动卡带 `answered`）/ `dismiss` | `PlanPendingListResponse` / `PlanPendingDecisionResult` |

`PlanAwardResult.reason`：`already_counted` →「この人は記録済みです（点数は 1 回だけ）」；`anonymous_over_target` →「目標人数に達したので、名前なしの記録は加点されません」；`skipped` →「スキップ中のタイプです」。

## 画面

### Task › プラン（有 v2 生效计划时；替换 R23 的「已確定」卡）
- 头部：目标文 + 类型 chip；大分数（count-up，「減らす動き」设置开启时只淡入）+ 「/ 100」+ 今日 +N；构成条：每段按 `segments`，实色 = earned、斜纹 = 跳过记的分、豆沙 = 超额（overflow）、灰 = 剩余；段可点进类型详情（イベント段除外）。
- 「確定した方案」卡（見立て一行 + 「全文」展开、結論、依据「?」）+ 4 个统一按钮：「前提を見る」（只读弹层列出 `premise`，底部「見直しで変える」）、「方案を見直す」「手動で編集」「達成にする」——这三个在 R25 前显示，点了 Toast「まもなく使えます」。
- 今日のチャンス（`todayChance`：label、+points、点进 href）；没有就不显示这一块。
- 待确认（`pending`）：memo 计分提议卡（「〇〇さんとの面談で 3 問中 N 問を話せました · +X 点にしますか？」✓ / ✕；`manual` 卡给 3 问勾选，≥2 才能确认）、Step 完成建议卡（「「<title>」は完了しましたか？」✓ / ✕，不会自动完成）、候补卡（最多 3 张，点进类型）。
- Step（竖排）：序号、标题、目安、进度 chip（`stepProgress.label`）、完成后打勾（点开可撤回）。
- 人物类型卡网格：emoji + 字母 + 短名、roleSituation、「配点 · 人数」、earned / allocation 小条、三格（人脈の候補 N · 会える活動 N · 紹介ルート N，来自 `typeStats`）；跳过的卡显示「スキップ中」。点卡进详情。
- イベント块：配点 · 回数、已参加次数。
- 底注「プランは達成を保証しません」。
- Web 1440 按 web.html；1024 按 b8（分数横跨 12 列、左 7 列类型行、右 5 列 今日のチャンス + 最近の加点（`recentAwards`）+ イベント）；390 单列（Step 横滑卡片、右上 ↻ 見直し 也是「まもなく」）。

### 人物タイプ詳細（Web `/app/plans/[planId]/types/[itemId]`、App `app/plans/[planId]/types/[itemId].tsx`）
- 头卡：emoji、「タイプ <letter>」、短名、roleSituation、配点 · 人数 · 1人 <unitPoints[0]> 点（最后 1 人补余数时写明）、earned / allocation、超额半分说明、关联 Step。
- 三种去向：
  1. 人脈に候補あり：候补表（名字、公司 · 职位、推薦度、理由、開口一番、最后联系）按推薦度降序；每行 ✓（「プランの候補にする」= decision accept，只关联，不加分）/ ✕；「すでに話した」→ 记一次（有名字）。可多选，底部栏「N 人を記録」。已聊过的人折叠在「話した人」里，每条可撤销（Toast 5 秒内）。
  2. 人脈にいない：人物像（persona）、見分け方（recognizeHints）、聞くこと 3 問、会える活動、紹介ルート（`introRoutes`：经谁介绍 + 理由 +「依頼文をつくる」→ 草稿抽屉 / 底部弹层：件名、本文、コピー、メールアプリで開く（`mailto:`），没有送信）。
  3. スキップ中：说明「習熟済みとして満点を記録しています」+「スキップを取り消す」。
- 不论哪种都有：「聞くこと」3 问、「数え方」（countRule）、会える活動表（分数环 ≥70 深紫 / 50–69 中紫 / <50 豆沙；点开 5 项内訳，每项 `score / max` + `facts`，`estimated` 的显示「推定」）、「やること」（`tasks`，R20 前为空就不显示）。
- 记录弹层（Web Modal 380 / App BottomSheet）：「話した」（选候补或搜人脈）/「線下で話した」（名字可空 → 「この人ですか？」→ 选或「新しく登録」）/ 匿名自报说明「名前なしは目標人数まで」。加分后 Toast「+X 点 · 取り消す」5 秒。
- 跳过确认（底部确认，默认焦点在主按钮）：「スキップすると満点（N 点）を記録します。あとで取り消せます」。
- 面談を提案（Web 520 抽屉 / App 底部弹层）：选 3 个时段（日期 + 时间），生成草稿 → 显示草稿 + コピー / メールアプリで開く。**不出现「送信」**。

## 其他
- App 旧屏 `app/contacts/matches.tsx` 改为跳转 `/task?seg=plan`（用 `router.replace`，返回能回到原处：从人脈页进来再返回仍回人脈页——用 push 到 task 并保留历史，或 replace 视现有导航而定，测试断言返回位置）。屏幕文件 `ContactNeedsMatchesScreen` 留给 R25 删。
- 新路由登记照 HOW-TO §7（Web 前缀 `/app/plans` 已有；App `/plans` 前缀已有，补 `integratedFeatureRoutes`、离线清单 online-only、`parentForPath` → Task › プラン、离线读取清单 `route-domain-inventory.ts` 登记新接口）。
- 组件只用 R04 / R06 库；文字进 Web `copy/plan.ts`、App `plan` 字典（三语、kind）；token、Icon；浅色 / 深色。
- 只在用户操作时发写请求；动效遵守「減らす動き」。
