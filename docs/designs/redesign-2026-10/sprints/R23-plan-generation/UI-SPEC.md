# R23 两端界面规格（执行用）

依据：DESIGN §2.1–2.4、§7；设计稿 `docs/designs/redesign-2026-10/b10-plan-example.html` 的 ①–⑤ 画板（目標入力、背景確認、≤5問、確定した前提、AI 初版、AI 修正、手動編集），`app.html` / `web.html` 的「Task · プラン（目標入力）」。设计稿用的是「佐藤 健一 / Orbit」的例子，实现里一律用接口返回的数据（mock 时是演示世界），不出现设计稿里的人名。

服务端已完成（`features/plans/v2/flow-*.ts`，契约 `shared/contract/plan-v2.ts` 的 R23 段，schema `shared/api-schema/plan-v2.ts`）。界面只调接口，**不在客户端调 AI、不在客户端算分以外的业务规则**；「空き」、配点回流、合计用 `shared/compute`（两端同步副本）。

## 接口（都要登录；mock 模式下不登录也能用演示账号）

请求头：`x-orbit-lang: ja|zh|en`（界面语言）；App 另加 `x-orbit-platform: app`（返回 App 形状的 `href`）。所有写请求带客户端生成的 `idempotencyKey`（每次用户操作一个新键；网络重试用同一个键）。错误信封里 `error.context.reason` 是原因，`limit` / `retryOn` 是上限信息。

| 操作 | 接口 | 返回 |
| --- | --- | --- |
| 目标文停顿 800ms 且 ≥6 字 → 推测类型（同文不重发；用户手动选过 chip 后不再覆盖） | `POST /api/agent/plans/goal-kind` `{ text }` | `PlanGoalKindResult` |
| 空态读余量（本月还能新建几个、生效目标数） | `GET /api/agent/plans/intakes` | `PlanIntakeListResponse` |
| 「iOrbit と具体化する」 | `POST /api/agent/plans/intakes` `{ goalText, goalKind, source: "task", idempotencyKey }` | `PlanIntakeView`（201；带 `href`，跳过去） |
| 打开流程页 | `GET /api/agent/plans/intakes/[intakeId]` | `PlanIntakeView` |
| 下书失败「もう一度」 | `POST …/[intakeId]/background` `{ idempotencyKey }` | `PlanIntakeView` |
| 确认わたし / チーム / 目的 | `PATCH …/[intakeId]` `{ block, me? / team? / purpose?, expectedUpdatedAt, idempotencyKey }` | `PlanIntakeView` |
| 加成员（人脈から / 自分で書く） | `POST …/[intakeId]/members` | `PlanIntakeView` |
| 改「やりたいこと」后重算阶梯（只在文字变了时发） | `POST …/[intakeId]/ladder` `{ wants, idempotencyKey }` | `PlanIntakeView` |
| 「この背景で質問へ（5問まで）」 | `POST …/[intakeId]/questions` | `PlanIntakeView`（status `questions`） |
| 「まとめて回答する」 | `POST …/[intakeId]/answers` `{ answers: [{ questionId, values, text }] }` | `PlanIntakeView`（status `premise`） |
| 前提行就地改 | `PATCH …/[intakeId]/premise` `{ key, value }` | `PlanIntakeView`（`premiseVersion` +1，`draftId` 变 null） |
| 「この前提で初版をつくる」 | `POST …/[intakeId]/draft` | `PlanDraftView`（201） |
| 读草稿 | `GET /api/agent/plans/drafts/[draftId]` | `PlanDraftView` |
| AI 修正 | `POST …/drafts/[draftId]/fix` `{ text }` | `PlanDraftView` |
| 手動編集「このプランで始める」（保存即确定） | `POST …/drafts/[draftId]/manual-edit` | `PlanConfirmResult` |
| 「元に戻す」（手动编辑页，只丢弃本地改动即可；服务端 reset 可不用） | `POST …/drafts/[draftId]/reset` | `PlanDraftView` |
| 「この内容で確定」 | `POST …/drafts/[draftId]/confirm` | `PlanConfirmResult`（跳 `href` = Task › プラン） |
| 人脈から選ぶ的搜索 | 现有联系人搜索接口（`POST /api/contacts/search` 或现有列表）；只要 id、名字、公司、职位 | — |

常见错误原因 → 界面：
- `AI_FAILED`（503）：错误卡「初版をつくれませんでした · 何も保存していません」/「修正できませんでした · 回数は減っていません」+「もう一度」（同一操作重试用新键）。
- `AI_LIMIT`（409，`limit: daily|monthly`，`retryOn`）：**不是失败卡**，显示上限说明：日「今日はここまでです · 明日また使えます」、月「今月の上限に達しました（来月 1 日から）」。
- `GOAL_MONTHLY_LIMIT`：「今月はこれ以上新しい目標を作れません」（空态里如果 `newGoalsLeftThisMonth = 0` 就提前显示并禁用按钮）。
- `PLAN_GOAL_LIMIT`：「同時に進められる目標は 2 つまでです」。
- `STALE`：「別の端末で変更されました」+ 重新读取。
- `FIX_LIMIT` / `MANUAL_EDIT_USED` / `LADDER_LIMIT`：对应按钮禁用（正常情况下界面已按 `aiFixUsed`、`manualEditAvailable`、`limits.ladderLeft` 禁用，不该触发）。
- 背景下书 `aiSteps.background.state = "fallback"`：如果有 `limit` → 上限说明；没有 → 「下書きできませんでした · 自分で選べます」+「もう一度」（调 background）。轻量调用（C3、C4、C5）的 fallback 不打扰用户。

## 画面与状态

### ① 目標入力（Task › プラン 的空态；两端）
- 一句话输入（原样保留，不纠错）、6 类 chip（🚀 上市・収益化 / 💰 資金調達 / 🤝 新規開拓 / 🧑‍💼 採用 / 🔗 事業提携 / 🧭 キャリア；文字取 `plan-template-copy` 的 `PLAN_GOAL_KIND_COPY`，emoji 取 `plan-templates`）。
- chip 默认值由 goal-kind 接口给出，用户可改；改过以后不再被推测覆盖。
- 主按钮「iOrbit と具体化する」，按钮下两行预告「背景の確認 → 質問 5つまで → AI の初版 / → AI 修正 3回まで → 手動編集 1回」。
- 下方淡化的「サンプル」人物类型卡（纯静态展示：`役割×状況` 一句 + 「人脈の候補 · 会える活動 · 紹介ルート」三格 + 「肩書きではなく…」说明）。**不发任何请求、不写库**（测试断言）。
- 「状态」：有 v2 生效计划时这里显示「已确定」最小卡（目标文 + 类型 + 「プランを見る」占位，R24 替换）；本月余量 0 时显示上限说明；生效目标已 2 个时显示说明。
- 有未完成的 intake（`GET /intakes` 的 `intakes[0]`）时，在输入框上方显示「作りかけのプラン：<目标>」→ 继续（跳 `href`）。

### ② 生成流程页（Web `/app/plans/flow/[intakeId]`；App `app/plans/flow/[intakeId].tsx` 全屏、从下推入、无底栏）
- 顶部 5 段进度：背景 / 質問 / 初版 / AI 修正 / 手動編集（当前段深色）。状态映射：`background`→背景；`questions`/`premise`→質問；`drafted` 且 `aiFixUsed=0`→初版；`aiFixUsed>0`→AI 修正。
- 「目標：…」一行。
- **下书中**（`status = drafting`，正常不会出现，因为创建接口同步返回）：骨架 +「読んでいるもの」（`reading[]`：プロフィール / 目標文 / 人脈 / 必要な力）。
- **背景**：三块按顺序（わたし → チーム → 目的）。当前块展开 +「確認中」；已确认块折成一行 + ✎（✎ 只在 status `background` 时可点，重新展开）；未到的块虚线 +「下書き：…」摘要。
  - わたし：名字、headline（来自资料，不可改，旁边小字「プロフィールから」）；立场单选 4 个（代表・オーナー / 共同創業者 / 社内の担当者 / 個人として）；「やりたいこと」输入（标「目標文から」）。确认时如果 wants 和原值不同：先调 ladder 接口，再 PATCH me。主按钮「わたしを確定 → チームへ」。
  - チーム：一人 / チーム 切换；「必要な力」8 行（该类模板 capabilities，文字取 `PLAN_CAPABILITY_COPY`）× 成员列（头像首字 + 来源 chip：プロフィール / 人脈から / 手入力）；点头像付け外し；没人勾的行显示「空き」（用 `planCapabilityGaps` 本地算，**不发请求**）；「?」说明「8 項目は目標タイプごとに固定・AI が考えたものではありません」。「メンバーを追加」→ App 底部弹层 / Web Modal，两页签：
    - 人脈から選ぶ：搜索框 + 候选（标「共同創業者」的在前、能补空き的其次，chip「空き：デザイン」）；可多选；「N名を追加」→ members 接口 `mode: network`（能力由服务端推定，返回后展示「名刺・面談メモから」预勾，用户可改）。
    - 自分で書く：名前か呼び名、関わり方（共同創業者 / 社員 / 業務委託 / アドバイザー）、できること（8 项 chip + 「＋ その他」自由输入）、「人脈にも登録する」开关（默认关，说明「オフならこのプランの中だけ」）→ members 接口 `mode: manual`。
    - 主按钮「チームを確定 → 目的へ」，PATCH team 时带当前所有成员的勾选。
  - 目的：阶梯 4 级（上大下小、逐级缩进；4 级标「大きめ · 10年単位」，1 级「小さめ · 数か月」，2 级标「最初に書いた目標」，建议级标「いちばん近い？」并预选）；单选；🧭 一句建议理由（`reason`）+「?」。阶梯只有 1 级（规则降级）时只显示那一级。
  - 三块都确认后才出现「この背景で質問へ（5問まで）」。
- **≤5 問**：卡片「あと N つだけ、確認させてください」+ 题库名「題庫「上市・収益化」」+「?」（展开每题 `why`）。每题：编号（`R1 現在地` = 题 id + `topic`）、题干（`prompt`）、选项 chip（`single` 单选、`multi` 多选；`guess` 预选并淡色标「推測」）、一行自由输入（可空）。Web 三列网格、App 纵排。底部「まとめて回答する（N問）」+「空欄は推測で進め、依拠に『推測』と書きます」。
- **確定した前提**卡：每行 label / value / 右侧出处小签（背景 / Q1–Q5；`guessed` 加「推測」）；点行就地改（下拉同原题选项 + 自由输入；目的、チーム行只能自由输入）→ premise 接口。按钮「この前提で初版をつくる」+ 下方「初版は回数に含みません · この後 AI 修正 3回 + 手動編集 1回」。初版生成中显示进度（可能要几十秒）。
- **初版 / 方案卡**：見立て（文中 ①② 保持原样）、進め方の結論（浅紫块）+ flow 三格（有才显示）、ステップ · 完了の目安（序号、标题、「目安：…」、人物类型字母 chip：类型按顺序 A/B/C…，イベント用 🎟️）、話すべき人のタイプ · 配点（emoji、字母 + 短名、`roleSituation`、「25 点 · 5人」；「?」展开 `allocationReasons`）、イベント（配点 · 回数）、折叠区「この案で参考にした業界の現状 N件」（每条：序号、标题、要点、ID、`v版 · updatedOn`、「出典：label」链接到 `sourceUrl`；App 默认收起、Web 默认展开；底注「AI は Orbit が管理するこのライブラリの資料だけを引用します」）。
- **AI 修正栏**（固定在输入框上方）：「AI 修正 あと N 回」大号数字 +「初版は回数に含みません」+ 提示「現状と考えを、できるだけ一度にまとめて書いてください」+ 例子；输入框；用完（`aiFixUsed = 3`）后输入框禁用、显示「修正は使い切りました。手動で編集するか、この内容で確定します」+「変更がなかった回も 1回と数えます」。两个次按钮「手動で編集」（`manualEditAvailable` 才可用）「この内容で確定」。
- **每轮修正**：用户的话（右侧气泡）+ 更新卡「AI 修正 n / 3 を反映 · 方案を更新しました」：只列 `changes`（「変更」小签 + label + 旧文删除线 + 新文浅紫）+「変わらない点：…」（`unchanged` 用 · 连接）；不改时「今回は変更しません」+ `noChangeReason`。三轮历史 chip（「1：…」截前 12 字），点 chip 滚到那一轮。
- Web 右栏：背景阶段「わかったこと」（わたし / やりたいこと / 体制 / 空白 / 目的 / 前提，本地实时汇总、不发请求）+「このあと」4 步；初版之后换成「方案の下書き」（Step 目安列表，本轮改到的浅紫标出）。1024 以下右栏收成标题区按钮 + 抽屉（壳的默认行为），390 单列。

### ③ 手動編集（Web `/app/plans/drafts/[draftId]/edit`；App `app/plans/drafts/[draftId]/edit.tsx`）
- 标题「プランを手動で編集」+ 副标题「1回だけ · 保存すると確定」；右上「元に戻す」（丢弃本地改动，回到 `content`）。
- ステップ：点名称就地编辑（下方灰字「元：…」）、目安可编辑、拖动排序（Web 拖拽；App 长按拖动或上下移按钮，至少要能改顺序）、× 删除、虚线「Step を追加」（名称 + 目安，可选已有类型）。最多 7 个，至少 1 个。
- 人物タイプと配点：每行 emoji + 字母短名 + roleSituation；人数步进器（1–5，イベント 1–10）；配点输入（只收 5 的倍数）；改一项后用 `shared/compute/plan-allocation` 的 `changeAllocation` 从配点最高的类型按 5 点扣 / 加，显示「25 → 20」；× 移除类型 → 确认弹层列出 `removeSlot` 的回流（「15点を 5点ずつ、配点の高いタイプから順に配り直します」+ 前→后列表 + 合计 100）；「タイプを追加（テンプレートの枠から選ぶ）」（该类模板里还没用的枠）。
- 底部固定栏：「合計 100 / 100 · 変更 N件 · 手動編集は 1回だけ」+「このプランで始める」（→ manual-edit 接口，带 `expectedRevision = draft.revision`；成功跳 `href`）。合计不是 100 时按钮禁用（正常情况下回流保证 100）。页底说明「保存したあとは、AI がこのプランを自動で書き換えることはありません…」。
- Web 1440：左 5 列 Step + 右 7 列配点表（「タイプ · 目標 · 配点 · AI の方案 → 今」）+ 右栏「変更点」（名称 / 顺序 / 配点 / 人数，每条可点回到对应行）。

### 「已确定」最小卡（Task › プラン；有 v2 生效计划时；R24 换成完整概要）
- 目标文、类型 chip、总分（`GET /api/agent/plans/v2/summary` 的 `current.score.total`）、「プランを確定しました」一句。Web 在 `loadPlanSlot` 里：有 v2 生效计划 → 这张卡；否则有 v1 → 旧界面不动；否则 → 目標入力。

## 规矩（两端）

- 组件只用 R04（App `src/components/ui/**`）/ R06（Web `orbit-2026/ui`）组件库；业务组件新建在 Web `app/(app)/app/orbit-2026/plan/`、App `src/screens/plan/`。
- 文字全部进字典：Web `orbit-2026/copy/plan.ts`（`OrbitCopyTable`），App 新字典域 `src/i18n/{ja,zh,en}/plan.ts`（按 HOW-TO §6 登记）；三语齐全，每条写 `kind`；题干、选项、能力名、短名直接用 `shared/compute/plan-template-copy.ts`（`planCopy(…, language)`），不要再抄一份。
- 只用 token：Web CSS Modules 在 `[data-orbit-2026]` 里、不写十六进制颜色；App 用 `useOrbitTheme()` / `createThemedStyles`。不用 Ionicons；图标只用 `Icon`。
- 浅色 / 深色都要正确。
- 不在客户端调 AI；只有设计允许的触发点发请求（goal-kind、intakes、members、ladder、questions、draft、fix）。勾选能力、切 chip、填答案、改配点都不发请求（渲染测试里记录 fetch 断言）。
- 「示例」卡、演示数据不写库。
