# 活动整体设计（R26、R27）

**版本 2（2026-10-14，执行人：小雨（甲）的文档会话；文档阶段，未改代码）。** 版本 2 = 按独立复核（[REVIEW.md](REVIEW.md)）S1–S2、M1–M11、m1–m10 修订，处理记录见 REVIEW 末尾。 本文是 R26、R27 两个功能 Sprint 的共同依据。它说明以下几件事：活动这一块为什么这样切；数据怎么放、契约怎么加；用不用 AI、花不花钱；和计划页（R24 概要右栏「今日のチャンス」、推荐活动行、会える活動、D53）怎样接；每个画面对应哪块画板；以及开工前还要定的事。

- **设计稿**（越往后越新、越权威）：
  - `web.html` #10–12 / #23（Web イベント 評価页）；`app.html` #13–15、#30 / #31 / #37（App イベント 与 評価）；
  - `b2-events-flow.html` #0–48（异常态、探す、詳細、参加登録、会う準備、会場モード、会後）；
  - `b8-responsive.html` #0–5 / #17 / #19（イベント与評価结果的 1024 / 390）；
  - `b3-daily-actions.html` #42（参加の取り消し確認）；`b12-missing-states.html` W-R24-08（会える活動内訳，计划页）。
  - `b6-host-polish.html` 是主办侧（R17），本组只用其中的受付 kiosk 来说明工作人员代签的边界（R26-04），不认领 b6 的画面。
- **旧方案**：`IMPLEMENTATION-PLAN.md` §1.5（イベント）、§2 D-07（活动评估）/ D-08（興味なし）/ D-09（账本与月上限）、附录 A ⑤、附录 D-c（5 项计分、3 维展示）。**本文与它冲突的地方以本文为准**，冲突点逐条写在 §9。README「用户决定」表、决定表 `maintenance/2026-10-12-decisions.md` 和通用规则 11 / 12 高于本文。
- **已定的产品决定（不再讨论）**：
  - 活动分数是后台固定标准：5 项 45 / 15 / 20 / 10 / 10，阈值 70 / 50；AI 只填事实，分数由规则算（plan-v2.2 DESIGN §8、R24 已落 `shared/compute/event-score.ts`）。
  - 结果页把 5 项合成 3 个展示维度（附录 D-c）：目標との一致 = 適合 + 確度；会える人 = 既存のつながり + 交流の形式；時間対効果 = 時間とコスト。
  - 活动报名码叫「参加コード」（D33）；「会える活動」等 R26 上线后显示（D53）；面談を提案只出草稿（D46）。
  - 邮件 / 消息止于草稿；全场录音永久出局，只有「碰一下 + 说一句」式的本人短语音（AI 定位决定 2026-07-11，2026-10-07 补充）。
- **用语**：
  - 「库内活动」= Orbit `events` 表里的活动（主办方建的、日历同步来的）；「外部活动」= 用户贴 URL / 海报 / 文字评估、库里没有的活动。
  - 「事实」= 判分用的客观字段（日期、地点、费用、参加者构成、交流形式等）；「评估记录」= `event_assessments` 的一行。

## 1. 为什么要重做，重做成什么样

### 1.1 现状的问题

1. **计划页在等活动。** R24 / R25 的 Web 计划页还有 10 个画面没过门禁（W-R24-01 / 02 三宽度、04a、04c、05、06、07、08，交接表 R24-06b），App 还有 2 个（A-R24-01 / 04，R24-06c）。原因都一样：live 下 `PLAN_LIVE_EVENT_FACTS_READY = false`（`features/plans/v2/event-facts.ts:31`），`livePlanEventFacts` 返回空。所以概要的推荐活动行、右栏「今日のチャンス」的活动候选、人物类型详情的「会える活動」表全是空的。缺的事实是参加者构成、费用、移动时间和交流形式（R25 REPORT:223–226）。
2. **没有「行く価値ある？」入口。** 契约 8（`shared/contract/event-assessment.ts`）只有 mock，live 返回 503 `NOT_IMPLEMENTED`（`features/redesign-contracts/service-factory.ts:29` 只登记了 `contact-completion`）。仓库里也没有：
   - `event_assessments` 表；
   - 抓外部 URL 的能力；
   - SSRF 防护。
3. **推荐分数有两套。** 探す和首页用的是 `live-event-value-service.ts` 的 `valueScore`：20 + 目标 / 地点 / 行业 / 密度 / 日历，上限 99，见 :244 / :343。计划页用的是 `event-score.ts`。同一个活动在两处可能显示两个分数。
4. **「我参加的活动」没有接口。** `GET /api/events` 只能按 scenario / capture method / status 过滤（`app/api/events/handler.ts:43`），不能筛「我」。所以下面三处都只能各自绕：
   - 首页「次のイベント」（R10，乙）；
   - 手入力「出会った場所」候选（R26-06，现在用过去 30 天内已开始的活动）；
   - 每天一问的活动选项（R26-07，现在用 `metEventId` + 录入时间）。
5. **工作人员代签不计分。** 本人签到会走 `onSelfCheckedIn → markPlanEventAttendedForActor → recordEventAttendanceForPlans`（`event-operations/service.ts:479`、`runtime.ts:68-71`），工作人员代签 `checkInParticipant`（`service.ts:515`，`kind: "staff"`）不走（R26-04）。
6. **两端旧屏全部要换。** 涉及的旧屏如下（归属表 L26 / 38–41 / 64 / 72–73）：
   - Web `events-0918/*`；
   - App `EventsScreen`、`EventDetailScreen`、`EventRegistrationScreen`、`RegisterInviteScreen`、`EventLiveScreen`。

   旧屏还有两处遗留：
   - `/app/events` 在 1440 宽有水合警告：服务端 `Date.now()` 算「已结束」，见 `events/page.tsx:27`；
   - `/live` 在控制台报 403：没报名的人打开时，报名访问守卫返回 `FORBIDDEN`（`active-event-registration-required`，`registered-event-access.ts:139-150`），运营服务另有 `EVENT_OPERATIONS_FORBIDDEN`（`event-operations/service.ts:284-308`）。
7. **已有的活动 AI 不记账。** 报名访谈（`features/events/registration/adaptive-interview-service.ts`，走 `orbit-ai/gemini-provider`，由 `ORBIT_AGENT_PROVIDER` 选）和会后总结（`post-event-artifact/provider-config.ts:18`）都不写 `ai_usage_ledger`。

### 1.2 新的形状

```
イベント（一级页，两端）
 ├─ 評価 ── 贴 URL / 拍或传海报 / 贴正文 / 3 项手入力 → 判定中 → 評価結果（0–100 · 3 维内訳 · 会えそうな人 · 気をつけること）
 │          → 「参加予定に追加」（库内活动 = 报名 / 加入计划；外部活动 = 建一条只属于自己的活动 + 加入计划）/「見送る」
 │          异常：要登录 / 不是活动页（列出页内活动）/ 海报不清（补 3 项，分数可给区间）
 ├─ 参加予定 ── 我报名 / 加入的活动（今后 · 过去）；次の参加予定卡「会う準備をする」
 └─ 探す ── 「プランに効く」（event-score 排序，与计划页同一分数）· あなたのコミュニティ · 全部（日付順）· 絞り込み · 検索
       ↓ 详情
イベント詳細（评估吸顶 · 紹介 / アジェンダ / 主催 / 参加者 · 会えそうな人）→ 参加登録（AI 5 问 → 参加用プロフィール → 申込完了 / 審査中）
       ↓ 当天
会う準備（倒计时 · 名刺余量 · 会いたい人 + 話しかけ方 · 準備リスト · 明日のフォロー）→ チェックイン → 会場モード（現場 / おすすめ / 参加者 / グループ / マップ / アジェンダ · 交換申請 · 面談を提案 · ひとことメモ）
       ↓ 结束
会後のふりかえり（今日会った人 · AI まとめ下書き · 次の一手 ✓/✕ · お礼の下書き · プラン スコア 46 → 56）

计划（R24/R25）← 同一个 event-score：概要推荐活动行 · 今日のチャンス · 会える活動 / 内訳；参加 → 记分（本人 / 代签同一路）
```

设计原则（全部来自设计稿和已定决定）：

- **一个分数。** 库内活动、外部活动、探す、计划页、首页都用 `scoreEvent`（`shared/compute/event-score.ts`）。旧 `valueScore` 只留给它现有的调用方，新界面不读它（§9 #3）。
- **AI 只填事实、不打分。** URL / 海报 / 正文进来，AI 只抽事实（名称、日期、地点、费用、主办、登壇者、展示社数、议程），分数一律由规则算。抽不到的事实标「推定」，并降低「推定の確度」。
- **处处有据。** 评估结果上的每条内訳都带依据。会えそうな人要写出来源，例如「登壇者・過去参加者から推定」；気をつけること要写理由。「会いたい人 N名」= 参加者 × 计划人物类型的匹配人数，库外活动用登壇 / 展示推定，并标「推定」。
- **不代发。** 会後的お礼只是草稿，常驻「送信はしません · 送信はあなたが行います」。面談を提案按 D46 只出草稿。会场交換申请是站内的结构化动作（AI 定位 2026-10-07 补充口径：站内结构化动作不算代发）。
- **不录全场。** 会场只有本人 ≤15 秒的一言メモ，用设备上的语音转文字，不上传音频，不用付费 AI（§9 #18）。
- **示例数据绝不写库。** 评估页空态的「判定の例 · サンプル」、探す空态「プランができると · サンプル」、会後空态「記録するとこう見えます · サンプル」都是前端静态数据。

## 2. 用户流程（逐屏）

括号里是负责的 Sprint；画板写「文件 #序号 标题」（序号见 `compare-redesign.mjs --list`）。

### 2.1 イベント一级页与评估（R26）

- **App**（R26-01）：
  - 顶栏三段：左 🔍、居中「イベント」+ 副标题「10月 · 参加予定 3件」、右 📅。
  - 下方「評価 / 参加予定 N / 探す」三段胶囊，用 `Segmented variant="tseg"`。
  - 評価页从上到下：
    - 「このイベント、行く価値ある？」卡（URLを貼り付け / ポスターを選ぶ）；
    - 空态时是三项说明（目標との一致 / 会える人 / 時間対効果）+「判定の例 サンプル」+「参加コード」卡；有数据时是「参加予定 N件」卡（次の参加予定 + 头像 + 会いたい人 N名 +「会う準備をする」）；
    - 「評価したイベント · スコア順」列表。
  - 画板：`app.html` #13 / #14 / #15。
  - 🔍 在 R30 之前跳到「探す」并聚焦搜索框；📅 打开 Task › カレンダー（§9 #19）。
- **Web**：
  - 用 ShellPage。标题「イベント」，副标题「10月 · 参加予定 N件 · 評価済み N件」，右侧放三段页签。
  - 主区：评估输入卡（URL + 判定する + 海报拖放）→ 次の参加予定 → 評価したイベント（スコア順）。
  - 选中一行时，右侧出「評価の詳細」面板。画板：`web.html` #11 / #12 / #23。
  - 空态时右栏是默认 iOrbit 右栏（`web.html` #10）。
  - 1024 宽：选中一行出评估详情抽屉（`b8` #2），抽屉右上「全画面」进入 1024 单页（`b8` #4）。
  - 390 宽：列表（`b8` #1 / #3）→ 全屏结果（`b8` #5）。
- **评估流程**：
  1. 用户提交 URL、海报（拍 / 传，Web 可多张截图）、正文或 3 项手入力。
  2. 进入「判定中…」，三步依次是「ページの読み取り → 登壇者・出展企業の抽出 → あなたのプランと照合」（`app.html` #30）。
  3. 出結果（`app.html` #31，深色 #37）：总分 /100 + 判定 chip、3 维内訳、会えそうな人（类型 emoji + 依据）、気をつける点、「見送る / 参加予定に追加」。
  4. Web 1024 单页另有：
     - 「この判定は 10月7日時点です。参加者リストが公開されたら再計算し、お知らせします」；
     - 「午前だけの参加なら時間対効果は 64 → 78」；
     - 日历冲突行「10/16 午前に予定なし」（`b8` #4）。
- **异常态**（R26）：

  | 情况 | 画面 | 画板 |
  | --- | --- | --- |
  | 要登录 | 「ログインが必要なページ」+ 三条退路（贴正文 / 截图 / 3 项）+「Orbit があなたの代わりにログインすることはありません」 | `b2` #0（App）、#4（Web） |
  | 不是活动页 | 列出页内找到的活动（可逐个「評価」）+「手入力」 | `b2` #1 |
  | 海报不清 | 已读字段按 绿 = 读取 / 橙 = 推测 / 赤 = 读不出 标色 +「判定に必要な3項目」逐项补（可「不明」）+ 判定预览 | `b2` #2（App）、#5（Web） |
  | 补完后 | 「あなたが補った項目 2つ」、時間対効果可为区间「55–70」 | `b2` #3 |
- **「参加予定に追加」**：
  - 库内活动：调 `addEventToPlan`（不报名；需要报名的活动，按钮旁给「参加登録」入口，进 R27 的报名流程）。
  - 外部活动：**不进活动表**（`event_ops_events` 没有可见性列，写成 `published` 会进公开目录、名片归属窗口和他人计划，写成 `draft` 计划读不到，还会让用户变成主办方，复核 S1）。评估记录本身就是这场外部活动：计划条目引用 `assessment:<id>`，live 事实另开一路「我的外部评估」只对本人读取（§3.1、§6.2-1，§9 #7）。
  - 「見送る」只记在这条评估记录上（`user_decision = 'dismissed'`）：評価したイベント列表把它沉到底部、标「見送り」；**不影响探す**。想让探す少推荐，用契约 9 的「興味なし」（复核 m4）。
- **参加予定页签**（R26）：列我报名、待审核、已加入计划的活动，分「これから / 過去」，过去的显示「参加した」或 未签到。
  - **设计稿无**（§10 B2）。画板定稿前先按 `app.html` #15「参加予定」卡的行样式实现，待补画后过门禁。
- **参加コード**（R26-02）：
  - 評価页空态的「参加コードをお持ちですか？ 入力する」（`web.html` #10）打开输码弹窗，输码后进 `/register/<code>`，即 R27 的报名流程。
  - 界面上活动的码一律叫「参加コード」。R15 的「招待コード」只指人脉邀请码，两者不混用。

### 2.2 探す（R27）

- **画板**：App `b2` #6 空 / #7 少量 / #8 大量 / #9 絞り込み / #10 検索中；Web `b2` #11 空 / #12 少量 / #13 テーマ弹层。
- **结构**：搜索框 → 已选筛选 chip（今月 ✕ · 東京 ✕ · テーマ · 参加費）→「📌 あなたのコミュニティ」→「プランに効くイベント N件」→「すべて · 日付順」。
  - 「プランに効く」每行带分数环和「🎯 VC パートナー 3名が登壇」这样的依据，以及「?」。
  - Web 版是表格（日付 / 場所 / 参加費 / スコア / 判定）。
- **分数**：用 `scoreEvent`（§9 #3）。没有计划时，空态「まだプランがありません」+「目標を設定する」，列表按人气（报名数）排序，并写明「今は『人気順』で表示しています」（`b2` #6）。
- **絞り込み**：時期 / 場所 / テーマ / 形式 / 無料のみ / 「プランに合うものを優先」开关，底部「N件を表示」（`b2` #9、#13）。「📍 現在地から5km」见 §10 A3。
- **検索**（`b2` #10）：分三组「イベント · 主催・コミュニティ · あなたの人脈から（登壇予定の知り合い）」+「最近の検索」+ 找不到时「告知ページの URL を貼って評価できます」。这一套搜索服务同时给 R30 全局搜索用（§8）。
- **あなたのコミュニティ**：定义为「我参加过、或关注的主办方」将来的活动，带「メンバー限定 / 先行申込」标签。关注按钮见 `b2` #10「フォロー中」（§10 A2）。
- **興味なし**（契约 9，R27）：在推荐行的「?」/ 长按菜单里选，理由四选一（日程 / 距離 / 内容 / 知っている）。之后推荐降权或过滤：同一主办方同类理由 3 次后降权，「知っている」只过滤这一场（§9 #12）。

### 2.3 イベント詳細（R27）

- **画板**：App `b2` #14 参加者 0 / #15 少 / #16 多（深色 #43）；Web `b2` #17 / #18 / #19（深色 #47）。
- **结构**：顶部 emoji + 标签（「締切間近 · 残り 22枠」）+ 主办 + 名称 + 日時 / 場所 / 参加費 · 定員 · 審査あり → 评估吸顶条（74 · 参加をおすすめ · 3 维小字）→ 页签 紹介 / アジェンダ / 主催 / 参加者 128 → 参加者（プランに合う 18 · 知り合い 3 · 全員）→ 知り合い N名も参加 → 底部「参加登録 · AI が5問だけ質問」。
  - 主办块（Web）：「2023年から毎月開催 · 累計 18回 · 平均参加 112 · CFO 比率 41% · あなた 2回」，由库内活动统计规则算出。
  - 参加者只显示「プロフィールを公開している人」。
- **评估吸顶条**：库内活动打开详情时，如果没有评估记录，就**按规则当场算**，用库内事实，不调 AI，并写一条 `source_kind = 'orbit_event'` 的评估记录（§9 #6）。
- **未登录**（R26-08，复核 M10）：公开活动的**列表**和**详情 / 报名入口**都用公开顶栏（b1 公开页样式，`PublicTopNav`，G14）。列表 = `/app/events?tab=discover` 对未登录开放「すべて · 日付順」一组（数据来自现有公开目录 `app/api/events/public`，没有分数、没有コミュニティ与プランに効く，顶部一条「ログインすると、あなたの目標で判定します」）；評価 / 参加予定页签对未登录跳登录。对标 Peatix / connpass：活动列表与详情公开可浏览，个性化部分要登录。设计稿没有未登录版，见 §10 B4。

### 2.4 参加登録（R27）

- **画板**：App `b2` #20 ① 質問に答える / #21 ② 参加用プロフィール / #22 ③ 申込完了 · 審査中；Web `b2` #23（左右两栏：问题 + 实时「参加用プロフィール」）。
- **流程**：「会社・役職・業界はプロフィールから入力済み。聞くのは 5問だけです」→ 5 问。用现有 adaptive interview 提问、现有问题集（`event-experience.ts`），不新增 AI 调用。
  - → 参加用プロフィール（カバー率 %、各项 ✓ / △、話題 chip、自己紹介、公開範囲「参加者全員 / 主催者のみ」；「参加者全員」= 现有 `visibility = 'event_attendees'`，「主催者のみ」= `matching_only`（`event-operations/storage/migrations.ts:917`，只给主办方与匹配用，复核 m5））→「この内容で申し込む」。
  - → 申込完了：時間軸「申込 → 審査 → 結果通知 → 当日」+「カレンダーに仮で入れますか？」（追加する / 不要），确认后写入日历，属 A 档执行（§9 #15）。
- **参加の取り消し**：确认对话框，`b3` #42（R27）。

### 2.5 会う準備（R27）

- **画板**：App `b2` #24；Web `b2` #25。
- **内容**：
  - 开始倒计时、地点 +「地図アプリで開く」、チェックイン入口；
  - 名刺余量「名刺の残りは 8枚。会いたい人 4名 + 予備で 15枚がおすすめです」——余量是用户自填数字，只存本机（IMPLEMENTATION-PLAN §1.5）；
  - 会いたい人 · 4名 · 会いやすい順，每人有なぜ / 話しかけ方 / これまで + コピー；
  - 準備リスト 2 / 5；
  - 「明日のフォロー時間を予定に入れますか？」（追加する / やめる）；
  - Web 右侧加「当日の流れ」+ 💡 席位提示。
- **数据**：
  - 会いたい人：现有 readiness（`app/api/events/[id]/readiness`，`features/events/goal-readiness`）× 计划人物类型。
  - 話しかけ方：现有规则 opening-line（`/api/recommendations/event/[id]/opening-line`，`generatedBy: "live-opening-line-rule"`），不调 AI。
  - これまで：联系人时间线。
  - 30秒の自己紹介「AI 下書きを確認済み」：取参加登録时生成的「自己紹介（下書き）」。**现有报名 AI 不产出自己紹介**（复核 S2），要由 E4 产出（§5，等 §10 A6 授权）；授权前这一项显示用户资料里的自我介绍，没有则显示「自己紹介を書く」并跳资料编辑，不显示「AI 下書き」字样。
  - 準備リスト：固定模板 5 项（名刺 N枚 / 30秒の自己紹介 / 共有資料 / 受付 QR / 帰りの時間），资料一项的文字由用户填。勾选状态按「人 × 活动」存在集合 `eventPrepChecklists` 里（§9 #16）。

### 2.6 会場モード（R27）

- **画板**：App `b2` #26 ① チェックイン / #27 ② 現場ホーム / #28 ③ おすすめ / #29 ④ 参加者一覧 / #30 ⑤ グループ / #31 ⑥ 関係マップ / #32 ⑦ アジェンダ / #33 ⑧ 参加者シート / #34 ⑨ 面談を提案 / #35 ⑩ 交換成功（深色 #44 / #45）；Web `b2` #36。
- **数据**：
  - 现有运营接口 `/api/events/[id]/operations/**`：check-in、contact-requests，以及主办方已发布的 event-ops 分组 / 席位 / 推荐结果。这是主办侧 AI 管线已经生成并冻结发布的内容，参加者端只读，不新增调用。
  - 話のきっかけ：现有规则 opening-line。
  - 関係マップ：只用会场内参加者 × 我自己的联系人，算出「以前から / 交換済み / 会いたい / その他」，以及共通の知り合い一句话。不读别人的人脉（§9 #17）。
  - 面談を提案：复用 R24 的面談提案组件，按 D46 只出草稿。`b2` #34 的文案与 D46 冲突，见 §10 B3。
  - ひとことメモ：只录本人 ≤15 秒，用设备上的语音转文字；保存为笔记（`notes`，@人 + @イベント）。
- **签到**（R26-04 / R26-09）：
  - 本人签到已接计分；工作人员代签由 R26 补接（§2.8）。
  - 没报名的人打开 `/live`：先查报名状态，未报名就显示「このイベントに参加登録していません」并给报名入口（复用详情底部按钮样式），不再打运营接口，从而消掉控制台 403。

### 2.7 会後のふりかえり（R27）

- **画板**：App `b2` #37 空 / #38 少 / #39 多（深色 #46）；Web `b2` #40 / #41 / #42（深色 #48）。
- **内容**：
  - 今日会った人 N 人（交換 / 会いたい人 x/4 / 面談の約束）；
  - 「✨ 今日のまとめ · AI 下書き · 編集できます」（3 条，每条带依据，「?」可展开）；
  - 「次の一手 · N名分 · AI の提案 · 確認して確定」，每行 ✓ / ✕ + ✉️ お礼の下書き + 📅 フォロー日 + 🎯 计划人物类型；
  - 「N名分を確定する / あとで」+「送信はしません · 送信はあなたが行います」；
  - プラン スコア「46 → 56 +10 ·『次の一手』を確定すると反映されます」；
  - Web 右侧打开お礼の下書き（件名 + 正文，复制 / 在邮件 App 里打开）。
- **数据**：现有 post-event（`/api/events/[id]/post-event/{artifact,confirm,followup(s)}`）。**现有 AI 产物 `AttendeePostEventAiArtifact`（`post-event-artifact/contract.ts:8-18`）只有一段 `summary` 和一封 `messageDraft`**（复核 S2）；设计稿要的「今日のまとめ 3 条带依据」「次の一手逐人（お礼下書き + フォロー日 + 🎯 类型）」要由 E3 产出（§5，等 §10 A6 授权）。授权前的退路：まとめ显示现有 `summary` 一段；次の一手用规则（フォロー日 = 活动次日起按会いやすい順每人顺延 1 个工作日；🎯 = 联系人已关联的计划人物类型，没有就空）；お礼只给现有的一封 `messageDraft`（对第一位）。这个退路与画板不同，需在 A6 里一并请用户确认。
- **确定时的动作**：
  - 建 To-do（フォロー日）；
  - 写联系人「出会い：<活动>」（`metEventId`）；
  - 🎯 一项 = 把这个人关联到计划人物类型并记「話せた」（basis `talked`，同人同类型一次，R24 记分规则）；
  - 活动本身的参加分，已在签到时记过。

  分数预览由 `summarizePlanScore` 在前端用同一纯函数推算，确定后以服务端为准。
- **空态**：参加者一覧から選ぶ / 名刺をスキャン（进 R12 的扫描，带 `eventId`）/ 音声でメモ。

### 2.8 和计划连起来（R26，见 §6）

## 3. 数据与迁移

### 3.1 R26：迁移「event-assessments-core」（本机验证；生产另行授权）

新表 `event_assessments`（放 `features/events/assessment/migrations.ts`，模块迁移表按现有 `storage/migrations.ts` 的写法登记）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `workspace_id`、`id` | text | 主键 `(workspace_id, id)` |
| `actor_id` | text | 评估人；所有读写都按 actor 隔离 |
| `source_kind` | text check in (`url`,`poster`,`text`,`manual`,`orbit_event`) | `text` / `manual` 是本组新加的（契约只加不改，见 §4.1） |
| `source_url`、`source_digest` | text | digest = 规范化 URL 的 sha256，或海报 / 正文内容的 sha256，或 `event:<id>` |
| `event_id` | text null | 只用于库内活动（`orbit_event`）；外部活动为 null，计划引用 `assessment:<id>`（开工第一天核实 `plan_items.linked_event_id` 无外键约束；如有外键，改为本迁移给 `plan_items` 加可空列 `linked_assessment_id` 并放宽 `kind = 'event'` 的 CHECK，REPORT 写 impact） |
| `facts` | jsonb | AI 或规则填的事实。每个字段带 `{value, basis: 'read' \| 'guessed' \| 'user' \| 'rule', source?}` |
| `score_breakdown` | jsonb | `scoreEvent` 的 5 项（`{criterion, score, max, estimated}`）+ 依据文字（复用 `overview.ts:140-143` `eventScoreView` 生成，不另写一套） |
| `total`、`total_min`、`total_max` | smallint | 区间：事实缺失（如参加費「不明」）时给 min / max，`total` 取中值 |
| `verdict` | text check in (`recommend`,`conditional`,`skip`) | 由规则阈值 70 / 50 得出 |
| `rubric_version` | text | 现为 `event-score-v2` |
| `status` | text check in (`reading`,`ready`,`needs_input`,`failed`) | |
| `failure_reason` | text null | `login_required` / `not_event_page` / `unreadable` / `fetch_failed` / `too_large` / `blocked_host` / `ai_unavailable`（付费 AI 未开启）/ `quota_exceeded` / `timeout`（`reading` 超过 2 分钟被回收） |
| `missing_fields` | text[] | `startsAt` / `venue` / `price` 中缺的 |
| `page_candidates` | jsonb null | 「不是活动页」时页内找到的活动（≤5 条） |
| `user_decision` | text null check in (`added`,`dismissed`) | 「参加予定に追加 / 見送る」 |
| `idempotency_key` | text | 唯一 `(workspace_id, actor_id, idempotency_key)` |
| `created_at`、`updated_at`、`facts_refreshed_at` | timestamptz | |

- 唯一索引 `(workspace_id, actor_id, source_digest, rubric_version)`：同一来源重复评估时幂等返回已有记录（D-07）。
- 不存页面全文和海报原图：海报走现有上传资产（`posterAssetId`），按现有资产保存期处理；URL 抓到的正文只在内存里交给 AI，不落库（§9 #9）。
- 账本：`ai_usage_ledger.purpose` 已含 `event_assessment`（`network-analysis/migrations.ts:138-153` v3），`features/ai-quota/constants.ts` 已登记（池 `user`）。本组改动（都不需要迁移，复核 M3 / M4）：
  - `AI_QUOTA_MAX_CALLS.event_assessment` 从 2 调到 **3**（E1：抽取 + 修复；E2：vision 转录 + 结构化 + 修复）；
  - 月上限 `AI_QUOTA_MONTHLY_LIMITS.event_assessment = 10`（现有类型是 `Partial<Record<AiQuotaPurpose, number>>`；产品还没有付费档，D-09 的「付费不限」等付费档上线时再加）；东京自然月、每月 1 日重置；
  - **不占** `USER_POOL_DAILY_LIMIT`（10 次总熔断），照 `PLAN_FLOW_DAILY_LIMIT` 的写法单独计数：评估日上限 5 次；
  - 超限 `failure_reason = quota_exceeded`（与 `ai_unavailable` 分开，界面文案不同）。

### 3.2 R26：集合（不迁移）

- `eventPreferences`（D-07）：字段名沿用代码 `EventPreferences`（`event-score.ts:22-32` 的 `maxFee` / `maxTravelMinutes` / `weekdayEvening`），另加 `homeArea?`。本组**不做设置界面**（设计稿无）；集合仍然建，原因是 `homeArea` 要从用户资料的所在地写进来，R18 做设置界面时直接读写同一集合（交接 R18）。没有记录时用代码缺省值。

### 3.3 R27：集合（不迁移）

- `eventRecommendationFeedback`（契约 9）：`{ actorId, eventId, organizerId, reason, dismissedAt, idempotencyKey }`。
- `organizerFollows`：`{ actorId, organizerId, followedAt }`，「フォロー中」用（§10 A2 定了再做）。
- `eventPrepChecklists`：`{ actorId, eventId, items: [{key, label?, done}] }`。

### 3.4 R27（可选，看 §10 A5）：迁移「ai-usage-event-purposes」

放宽 `ai_usage_ledger.purpose` 的 CHECK，加 `event_registration_interview`、`event_post_summary`，把这两个现有调用接进账本（只记账，不设月上限）。和 plan-v2.2 §3.3 同一写法（新版本追加，不改旧版本）。

### 3.5 共享常量与纯函数（`shared/compute`，两端同步）

| 文件 | 用途 | Sprint |
| --- | --- | --- |
| `event-score.ts`（现有，R24） | 5 项计分；**只加**：参加費 / 日时缺失时返回 `range { min, max }` | R26 |
| `event-assessment-display.ts` | 5 项 → 3 维（目標との一致 = (fit+confidence)/60、会える人 = (connections+format)/20、時間対効果 = timeCost/20，各换算到 0–100，四舍五入）；区间同样换算 | R26 |
| `event-facts-derive.ts` | 库内活动的规则事实：参加者构成（报名者职位 / 行业 → 计划人物类型匹配数）、费用、交流形式（议程关键词：交流 / テーブルトーク / 名刺交換 / 懇親会；主办开了 matching 的算有）、既存のつながり（报名者 ∩ 我的联系人） | R26 |
| `event-travel-estimate.ts` | 移动时间推定表：オンライン 0；同一市区町村 20；東京 23 区内 / 大阪市内 30；同一都道府県 60；隣接県 90；其他 150。结果一律 `estimated: true` | R26 |
| `event-partial-attendance.ts` | 有带时间的议程时，算「只参加目标相关时段」的時間対効果（`b8` #4 那一行）；没有议程就不出这一行 | R26 |
| `event-score-input.ts` | 契约事实 → `EventScoreFacts`（`event-score.ts:43-59`）映射，见下表；全部规则，AI 不参与 | R26 |
| `event-attendee-typing.ts` | 登壇者 / 展示社 / 报名者的职位、公司 → 计划人物类型（复用计划候补的规则层关键词表，不调 C12），得出每类 `expected`；外部活动的推定一律 `attendeeSource: 'estimated'` | R26 |
| `event-emoji.ts` | 活动 emoji：主办方设的优先，否则按类别 / 关键词表（登壇・カンファレンス 🎤、交流会・ナイト 🥂、製造 🏭、朝会 ☕、ピッチ 🔧、勉強会 📚、ミートアップ 🤝），兜底 🎟️ | R26 |

**契约事实 → `EventScoreFacts` 映射（复核 M1）**

| `EventScoreFacts` 输入 | 库内活动（规则） | 外部活动 | 推导函数 |
| --- | --- | --- | --- |
| 每类 `expected` / `attendeeSource` | 报名者职位 × 人物类型 | 登壇者、展示社数（AI 读取的**事实**）× 人物类型（**规则**）；`estimated` | `event-attendee-typing.ts` |
| `fee` | 活动记录的费用 | `price` 字符串解析：「無料 / 0円」→ 0；「¥15,000 / 15000円 / 1.5万円」→ 15000；区间取上限；「不明 / 空」→ 缺失（出区间） | `event-score-input.ts` `parsePriceYen` |
| `travelMinutes` | 会场地区 × `homeArea` | 同左（`area` / `venue`） | `event-travel-estimate.ts` |
| `timeslot` | `startsAt` / `endsAt` × 偏好 | 同左；日时缺失 → 缺失 | `event-score-input.ts` |
| `firstDegree` / `secondDegree` | 报名者 ∩ 我的联系人；二度 = 我的联系人里认识报名者的人数 | 登壇者姓名 ∩ 我的联系人（只一度） | `event-facts-derive.ts` |
| `networkingMinutes` | 议程里交流类条目时长合计 | `agenda`（AI 读取）同法；无议程 → 缺失、`estimated` | `event-facts-derive.ts` |
| `nameTags` / `matching` / `exchangeCorner` | 主办方开了 event-ops 匹配 / 名札 / 名刺交換コーナー | `format` 各布尔（AI 读取的事实；缺失视为未知） | `event-score-input.ts` |

- **多目标**：评估对「当前目标」（`PlanV2SummaryResponse.current`，即首页 / Task 显示的那一个）判定，结果页标题下写「シリーズA 資金調達 で判定」；「参加予定に追加」同样加到当前目标（`addEventToPlan` 不传 `planId` 时的现有行为）。对标 Strava 默认当前挑战。

## 4. 契约（只加不改；每个 Sprint 第一天先提交）

### 4.1 R26

- **契约 8 `event-assessment.ts`**（只加；App 读取先改宽进，G19）：
  - `SourceKind` 加 `text`、`manual`；`CreateInput` 加 `{ sourceKind: 'text', text }`、`{ sourceKind: 'manual', facts }`；海报支持多张 `posterAssetIds?: string[]`。
  - `Facts` 只加：`speakers?: { name, org?, role? }[]`、`exhibitorCount?`、`expectedAttendees?`、`format?: { networking: boolean, tableTalk?: boolean, matching?: boolean }`、`agenda?: { at, title }[]`、`endsAt?`、`area?`；每个事实可带 `basis`（read / guessed / user / rule）。
  - `Contract` 只加：
    - `display?: { goalFit, people, timeCost }`（0–100，可为区间）；
    - `scoreRange?: { min, max }`；
    - `meetCandidates?: { emoji, label, count?, basis }[]`（会えそうな人）；
    - `knownAttendees?: { contactId, name }[]`；
    - `cautions?: { kind: 'fee' | 'off_target_session' | 'calendar' | 'travel' | 'other', text, detail? }[]`；
    - `partialAttendanceHint?: { window, timeCostAfter }`；
    - `failureReason?`、`pageCandidates?`、`userFilledFields?`、`userDecision?`、`eventId?`、`assessedAt`。
  - 新接口 `POST /api/events/assessments/[id]/dismiss`（見送る）。

  `BREAKING.md` 不需要登记（全部可选字段 / 枚举加值）。
- **新契约 `events-mine.ts`**：`GET /api/events/mine?range=upcoming|past&limit=` → `MyEventItem[] { eventId, title, startsAt, endsAt?, venue?, emoji, status: 'registered' | 'pending_review' | 'waitlisted' | 'planned' | 'attended' | 'rejected' | 'cancelled'（membership 的 `withdrawn` 归入 `cancelled`，复核 m5）, meetCount?, meetInitials?, assessmentId?, href }`。用户包括：参加予定页签、首页「次のイベント」（R10，乙）、手入力「出会った場所」（R26-06）、每天一问（R26-07）。
- **计划 v2 概要（契约 12）只加**：`PlanOverview.events[]` 每项加 `assessmentHref?`、`fitLabel?`、`display?`；`todayChance` 的活动候选加 `basis` 文本。R24-06 的服务端小项见 §6.2。

### 4.2 R27

- **契约 9 `event-recommendation-feedback.ts`** live，形状不变。
- **新契约 `event-discover.ts`**：`GET /api/events/discover?period=&area=&themes=&formats=&freeOnly=&planFirst=&sort=` → `{ community: DiscoverRow[], planFit: DiscoverRow[], all: DiscoverRow[], total, planFitTotal, popularityFallback: boolean }`。`DiscoverRow { eventId, title, startsAt, venue, area, priceYen?, emoji, score?, verdict?, reason?, badges?: ('members_only' | 'early_access' | 'last_time' )[] }`。
- **新契约 `event-search.ts`**：`GET /api/events/search?q=` → `{ events: [...], organizers: [...], people: [...] }`。R30 全局搜索的「イベント」组直接用这个服务。
- **新契约 `event-prep.ts`**：`GET /api/events/[id]/prep` → `{ startsAt, venue, mapUrl, people: [{ contactId?, attendeeId, name, org, role, relation, why, opener, history }], checklist, followupSuggestion }`；`PATCH /api/events/[id]/prep/checklist`。
- **organizer follow**（看 §10 A2）：`POST / DELETE /api/organizers/[id]/follow`。
- 现有 `events.ts` / `event-experience.ts` / `event-registration-portrait.ts` / 运营 / post-event 的接口形状**不改**；新界面读到缺字段时用 `whenNotImplemented` 隐藏那一块（G18）。

## 5. AI 调用

**R26 有新增付费 AI 调用（E1 / E2，契约 8 live）；R27 变更两个现有付费调用的提示词与输出（E3 / E4）。四项都需要用户授权真实验证和生产开启（§10 A1 / A6）。**

| # | 环节 | Sprint | 用什么 | 输入 / 输出 | 计费与上限 |
| --- | --- | --- | --- | --- | --- |
| E1 | URL / 贴正文 → 事实 | R26 | **新增**：现有 orbit-ai provider（`ORBIT_AGENT_PROVIDER`，生产为 DeepSeek 文本模型），新提示词 `event-facts-2026-10-v1` | 页面正文（去脚本、≤12k 字，按 `<main>` / `article` / meta / JSON-LD `Event` 优先）→ 只填 `Facts`（JSON schema 校验）；JSON-LD 里已有的字段直接用、不交给 AI | 账本 `event_assessment`；每次评估最多 2 次调用（抽取 + 修复）；月上限免费 10 次 |
| E2 | 海报 / 截图 → 事实 | R26 | **新增**：复用名片 vision 管线的两段结构（`deepseek-business-card-ocr-provider.ts:15-22`：`deepseek-v4-flash-vision-exp` 转录 → 文本模型结构化，禁用 thinking），单独提示词 `event-poster-2026-10-v1`；多张截图（≤3 张）合并成一次 vision 请求，不逐张调用（复核 M4） | 图片（HEIC 先转 JPEG，沿用 `heic-convert`）→ 转录 → 字段，每字段带 read / guessed / unreadable | 同 E1；一次评估 ≤3 次调用（转录 + 结构化 + 修复，`max_calls` 调到 3）；单次总超时 90 秒 |
| — | 评分、3 维、会えそうな人、気をつけること、部分参加、日历冲突、库内活动的事实 | R26 | **规则** | `event-score.ts`、§3.5 纯函数 | 不调 AI |
| — | 页内活动列表（不是活动页时） | R26 | E1 的同一次调用多输出 `pageCandidates` | — | 不额外调用 |
| — | 参加登録 5 问、参加用プロフィール | R27 | **现有** adaptive interview（不改提示词、不改 provider） | — | 现在不记账；§10 A5 定后补账本 |
| E4 | 参加用「自己紹介（下書き）」 | R27 | **变更现有调用**：给报名 persona / portrait 生成那一次调用加输出字段 `selfIntroDraft`（提示词升版本），不另起请求；若该调用不存在于目标路径，改为新增一次文本调用（开工核实后写 REPORT） | 资料字段 + 5 问回答 → ≤200 字自我介绍草稿 | 现有调用的次数不变；账本用途见 A5；需 §10 A6 授权 |
| E3 | 会後まとめ、次の一手、お礼の下書き | R27 | **变更现有调用**：post-event artifact 的提示词与输出 schema 升版本——`summary` 换成 `highlights[3]{emoji, title, detail, evidence}`，新增 `nextSteps[]{attendeeId, followupDate, thanksDraft{subject, body}, planTypeSuggestion?}`（类型建议只从计划人物类型字典里选，用户 ✓ 才生效）；`messageDraft` 保留兼容 | 当天交換 / 一言メモ / 报名资料（别名，id 不出境）→ 上述 JSON | 每场活动每人 1 次（与现有相同）+ 修复 1 次；需 §10 A6 授权 |
| — | 会场分组 / 席位 / おすすめ | R27 | **现有**主办侧 event-ops 管线已发布的结果（参加者端只读） | — | 主办方的调用，不在本组 |
| — | 探す排序、検索、話しかけ方、関係マップ、準備リスト、興味なし | R27 | **规则** | — | 不调 AI |
| — | ひとことメモ转文字 | R27 | **设备端**语音识别（iOS `SFSpeechRecognizer` 设备端模式；Web 用浏览器 Web Speech API，不支持时按钮隐藏） | 音频不离开设备 | 免费 |

共同规矩（沿用 plan-v2.2 §5.1）：


- **id 不出境**：库内活动、联系人只给别名。
- **AI 输出必须过 schema**：不过就修复一次，还不过就 `status = failed`、`failure_reason = unreadable`，并把已抽到的部分交给「补 3 项」画面。
- **提示词版本进账本** `ai_usage.promptVersion`。
- **示例模式拦截写入**、不调 AI；mock 模式返回 `demoEventAssessment` 及本组新加的异常态 fixture（login_required / not_event_page / needs_input）。
- **费用**：E1 / E2 单次都是几千 token 级。真实验证轮次按任务授权（§11），结果写进 REPORT。

**URL 抓取（SSRF 防护，R26 新建 `features/events/assessment/url-fetch.ts`）**：

- 只允许 http / https，默认端口，拒绝带用户名的 URL；
- DNS 解析后逐个校验地址，拒绝私网 / 环回 / 链路本地 / 元数据地址（含 IPv6 与 IPv4 映射）；
- 连接时钉住已校验的 IP，防 DNS rebinding；
- 5 秒超时、2 MB 上限、只收 `text/html` / `application/xhtml+xml`，不带 cookie / 认证头，固定 UA；
- 最多跟随 3 次重定向，每一跳重新校验；
- 限速：每人每分钟 ≤10 次抓取，超了接口直接回 429 `RATE_LIMITED`（不写 `failure_reason`）；主机级限速见 §9 #23。
- 拒绝的地址段逐条（复核 m3）：IPv4 `0.0.0.0/8`、`10/8`、`100.64/10`、`127/8`、`169.254/16`、`172.16/12`、`192.0.0/24`、`192.168/16`、`198.18/15`、`224/4`、`240/4`；IPv6 `::/128`、`::1`、`fc00::/7`、`fe80::/10`、`ff00::/8`、`64:ff9b::/96`、`2002::/16`、`::ffff:0:0/96`（按映射出的 IPv4 再判）。
- 2 MB 上限按**解压后**的字节累计，超了中断并记 `too_large`；`content-type` 不是 HTML → `not_event_page`（PDF / 图片提示改用「ポスター」入口）；地址被拒 → `blocked_host`；超时 / 连接失败 → `fetch_failed`。

**执行方式（复核 M5）**：
- `POST /api/events/assessments` 在请求内写一条 `status = reading` 的记录和一条任务（新表不需要：沿用 `post-event-artifact/task-repository.ts` 的任务表 + 处理器模式，任务行放在 `event_assessments` 自身——`status = reading` 且 `lease_until` 列为空或过期即可被认领；本迁移加 `lease_until timestamptz null`、`attempts smallint default 0`），然后立即返回 `reading`。
- 处理器：请求结束后用 Next `after()` 立即跑一次；兜底由现有 cron 入口每分钟扫一次 `reading` 且租约过期的记录（≤20 条 / 轮）。
- 卡死回收：`reading` 超过 2 分钟 → `failed / timeout`，已扣的额度按账本 `settle` 退回。
- 客户端每 2 秒轮询 `GET /[id]`，最多 90 秒，之后显示「時間がかかっています · あとで「評価したイベント」に出ます」（现有 toast 组件，不新增画面）。
- 同一幂等键在 `reading` 中重试 → 返回同一条记录，不重复入队。

**登录页判定（规则，不调 AI）**：

- 落到 401 / 403；
- 或最终 URL 路径含 `login` / `signin` / `members` 且正文短于 600 字；
- 或正文含登录表单（`input[type=password]`）。

命中任一条 → `failure_reason = login_required`，不调 AI。

## 6. 和计划页怎样接（R24 / R25 → R26）

### 6.1 已就绪、复用（R26-05）

| 接口 | 位置 | R26 怎么用 |
| --- | --- | --- |
| `addEventToPlan({ planId?, eventId, title? })` → `{ planId, itemId, created } \| null` | `features/plans/v2/service.ts:194`（实现 :931），加入后状态 `recommended` | 「参加予定に追加」；外部活动不建活动，计划引用 `assessment:<id>`（§2.1、§3.1） |
| `planRemainingTargets()` | `service.ts:197`（:983） | `scoreEvent` 的 ① fit 按剩余目标人数加权 |
| `recordEventAttendanceForPlans({ eventId, title?, at?, skipIfEverScored? })` | `service.ts:196`（:951） | 本人签到已接；**代签补接**（§6.3） |
| `scoreEvent({ types, facts, preferences? })` | `shared/compute/event-score.ts:95`；`EVENT_SCORE_MAX`（:11）、阈值（:12-13）、`EVENT_MEET_RATE` 0.25、缺省偏好（:32）、`event-score-v2` | 一切活动分数 |
| `eventsFor()` | `features/plans/v2/overview.ts:150`（还喂 `todayChance` :247）；mock `demoPlanEventFacts`（`v2/service-factory.ts:82`）/ live（:92） | 打开 live 事实后，概要、类型详情、今日のチャンス自然有活动 |
| 账本用途 `event_assessment` | 已在 CHECK 和 quota 常量里 | 直接用 |

### 6.2 R26 要补的（计划页的 10 + 2 个画面靠这些解锁）

1. **打开 live 事实（R26-03 / D53；复核 M6）**：
   - `livePlanEventFacts` 改签名为 `livePlanEventFacts({ workspaceId, actorId })`（现为无参，`v2/service-factory.ts:92`），调用方 `eventsFor` 传当前用户。合并顺序：我的外部评估（`user_decision = 'added'`）→ 我报名的库内活动 → 公开活动补足，总数 ≤20 场、未来 60 天；所以我的活动不会被公开活动挤掉。
   - 事实由 `event-facts-derive.ts` + `event-travel-estimate.ts` 算出，外部活动用评估记录的事实。
   - 缓存分两层：**活动级事实**（报名者构成、费用、形式、议程）按 `eventId` 缓存在进程内 LRU（最长 6 小时，报名人数变化时作废），外部活动的事实就是评估记录本身；**人级事实**（一度 / 二度人脉、人物类型匹配、移动时间）每次现算，不缓存。
   - `PLAN_LIVE_EVENT_FACTS_READY` 改成 `true`（常量，不做环境开关；需要回退时改回 false，测试守住两种状态）。
   - 概要、人物类型详情、内訳三处都显示（交接表 R26-03 原文）。
2. **概要推荐活动行（D53，R24-06）**：
   - 概要「🎟 イベント」整宽卡放 3 个推荐活动（分数环 + 名称日期 + 适配 chip），按 `scoreEvent` 降序；
   - 人物类型详情右栏「このタイプに会えるイベント」放 2 个；
   - 「会える活動」表首行展开 5 项评分条（W-R24-08，`b12` #226 / #227）。
   - 排序口径见交接表 R24-08（CVC 页画板 79 / 68 / 82 vs 服务端降序，待画板口径），本组按服务端降序实现，画板定了再重比。
3. **右栏「今日のチャンス」**：活动候选 = 剩余目标人数最多、且未来 14 天内的活动。依据文本由服务端给（「VC パートナー 3名が登壇 · 2 / 3人」），按钮文案按设计稿「会う準備をする / イベントを見る」。
4. **R24-06 的其余服务端小项**（同一批，交接表原文逐条）：
   - Step ↔ 活动关联；
   - 「最近の加点」含スキップ；
   - 最终接点相对时间；
   - 依頼文两种语气由服务端给；
   - 记录弹窗「いつ」传 `at`（服务端已支持，接界面）；
   - 見分け方分类与人物像键值行。

   这几项不全是活动的事，但交接表把它们和推荐活动行放进同一桶（「待 R26」），概要页要一起过门禁，所以 R26 一起做（§9 #20）。
5. **重比**：R24-06b（`web-plan-A.json` W-R24-01 / 02 三宽度、04a、04c、05、06、07、08 + C 组 W-R25-01 / 02 / 07 / 09 / 10 整屏）、R24-06c（`app-plan-A.json` A-R24-01 / 04，连同 R24-09 弁護士卡新图清缓存）。只重比、不重写计划页；没过的按规则 11 登记暂缓。

### 6.3 签到计分（R26-04）

工作人员代签 `checkInParticipant`（`event-operations/service.ts:515`）：

- 代签成功后，按参加者记录上的 `actorId` 调 `markPlanEventAttendedForActor`，与本人签到同一函数，幂等键带 planId。
- **参加者 → actor 映射**：参加者有 Orbit 账号（报名时登录）→ 用报名记录的 actor；无账号（主办导入的名单）→ 不记分，不报错，记结构化日志。
- **兜底（复核 M7）**：现有对账任务（`event-attendance-reconcile.ts:88-96`）的 v2 待补列表来自 `listUnscoredAttributedEventsV2`（`matching-repository.ts:792`），数据源是联系人的 `metEventId`，**不读签到记录**，所以现在代签失败没有补记。本组给对账任务加一路「已签到（`kind = self | staff`）、参加者有 actor、但该活动对该目标没有 `score_awarded`」的补记（每东京日一轮，≤50 组，与现有一路共用上限），并补测试。

### 6.4 其他 Sprint 用到的（谁等谁）

| Sprint | 需要什么 | 本组给什么 | 不等的做法 |
| --- | --- | --- | --- |
| R24 / R25 计划页（甲，重比） | 活动事实、推荐活动行、今日のチャンス | §6.2 | 已登记暂缓（交接表 R24-06b / 06c），R26 收口后重比 |
| R10 首页（乙） | 「次のイベント」卡 | `GET /api/events/mine?range=upcoming&limit=1`（R26） | 乙用 mock；R26 收口后 live |
| R12 手入力（甲，已收口） | 出会った場所候选（R26-06） | `events/mine` 过去 30 天 + 未来 7 天；R26 改两端手入力的取数（只改取数函数，不改界面） | 现用「过去 30 天内已开始的活动」 |
| R16 每天一问（甲，已收口） | 活动选项（R26-07） | 参加记录（`events/mine` 的 `attended` / `registered`）+ 活动开始时间，±14 天窗口不变 | 现用 `metEventId` + 录入时间 |
| R13 收件箱（乙） | `event_deadline` / `event_prep` / `event_pick` 来源的通知（契约 6 已有枚举） | **R26**：`event_pick`——重算任务（§6.5）发现分数变化 ≥10 或参加者名单首次公开时写一条；**R27**：`event_deadline`（报名截止 48 小时前，对已评估「参加予定に追加」但未报名的人）、`event_prep`（活动当天东京 8:00，对已报名的人）；都按现有收件箱写入接口与频控（契约 7 `dailyCap`）；两者都有 SC（R26 SC-R26-16、R27 SC-R27-13） | 乙先用 fixture |
| R20 Task（乙） | カレンダー打开、To-do「フォロー」、メモ @イベント | App 📅 跳 `task?seg=calendar`；会後确定建普通 To-do；ひとことメモ写 `notes`（契约 5 的 `eventId`） | — |
| R21 iOrbit（乙） | 「このイベント、行く価値ある？」建议问句 | 深链 `/app/events?tab=assess`（App `events?tab=assess`） | — |
| R30 搜索（甲） | 活动搜索接口 | `event-search` 服务（**R27**，交接表 R30-01 与 README R30 行的依赖已同步改为 R27，复核 M10） | R30 排在 R27 之后 |
| R17 主催（甲） | 代签计分、参加者侧会场数据形状 | R26 接代签；R27 只读运营接口，不改主办侧 | R17 排在 R27 之后 |

### 6.5 重算任务（R26，复核 M8）

- 位置：`features/events/assessment/recompute-job.ts`，由现有 cron 入口每小时跑一次。
- 范围（有界）：未来 30 天内、`ready` 的评估记录中，库内活动的参加者名单在上次计算后有变化（报名数变化或名单首次公开）的，每轮 ≤100 条。
- 动作：只用规则重算（不调 AI），更新 `score_breakdown` / `total` / `facts_refreshed_at`；分数变化 ≥10 或名单首次公开 → 写一条 `event_pick` 收件箱通知（「参加者リストが公開されました · 82 → 88」），深链到評価結果。`b8` #4 的「参加者リストが公開されたら再計算し、お知らせします」由这里兑现。
- 外部活动不重算（没有名单来源），結果页不显示这一行。

## 7. 两端界面与路由

| 端 | 路由 | 画面 | Sprint |
| --- | --- | --- | --- |
| Web | `/app/events`（`?tab=assess \| going \| discover`，缺省 `assess`） | 一级页三页签（評価在 R26；探す页签的内容在 R27，R26 期间仍显示旧列表的「探す」内容并保持可用） | R26 / R27 |
| Web | `/app/events/assessments/[id]` | 評価結果（1440 = 一级页 + 右侧详情；1024 = 单页；390 = 全屏） | R26 |
| Web | `/app/events/[id]` | イベント詳細（未登录 = 公开顶栏） | R27 |
| Web | `/app/events/[id]/register`、`/app/register`、`/app/register/[code]` | 参加登録 / 参加コード | R27（输码弹窗 R26） |
| Web | `/app/events/[id]/prep` | 会う準備（新路由） | R27 |
| Web | `/app/events/[id]/live` | 会場モード | R27 |
| Web | `/app/events/[id]/after` | 会後のふりかえり（新路由；旧 post-event 入口跳这里） | R27 |
| App | `(app)/events`（`?tab=`） | 一级页 | R26 / R27 |
| App | `events/assess`、`events/assessments/[id]` | 评估输入 / 判定中 / 结果 / 异常态 | R26 |
| App | `events/[id]`、`events/[id]/register`、`register`、`register/[code]`、`events/[id]/prep`、`events/[id]/live`、`events/[id]/after` | 详情 / 报名 / 会う準備 / 会場 / 会後 | R27 |
| 两端 | `home/events`、`attendees`、`participants/[participantId]`、`party`、`party/checkin`、`party/graph` | 旧跳转路由：改成新地址的跳转（归属表 L26 / 41 / 64） | R26（home/events）/ R27（其余） |

- 新路由登记：App `parentForPath`、旧路由跳转表；Web 审计计数、`shellAppliesTo`（会場モード Web 全屏、不挂右栏，`b2` #36 左上「終了」）。见 HOW-TO 第 7 节。
- 主办侧的 `events/center`、`operations/**`、`analytics`、`o/[slug]` 不动（R17）。

## 8. 画面与画板总表（像素 SC 的来源）

演示数据：照计划页做法放「设计稿示例 fixture」——`features/events/design-fixtures/`（CFO Night Tokyo vol.18、Japan SaaS Summit 2026 秋 等）+ 只在非生产存在的 `route.dev.ts` 切换，经同一接口 schema 解析，生产构建不收录（测试守住，复核 m10）。新用户空态用 QA 种子里的「空账号」`qa-empty@orbit.test`（R26 开工时用种子脚本建，步骤写进画面清单）。

宽度栏写「设计稿无」的，由 §10 A7 / B 组决定后补画（`b12` 末尾追加），补画认可前不进门禁，按规则 11 登记暂缓。深色由门禁把画框 `data-theme` 切深色得到（README-redesign「主题」），不另要画板。

| 画面 | App | Web 1440 | Web 1024 | Web 390 | Sprint |
| --- | --- | --- | --- | --- | --- |
| 評価 · 空 | `app.html` #13 | `web.html` #10 | 设计稿无 | `b8` #3 | R26 |
| 評価 · 少量 | `app.html` #14 | `web.html` #11 | 设计稿无 | 设计稿无 | R26 |
| 評価 · 大量 | `app.html` #15 | `web.html` #12（深 #23） | `b8` #0 | `b8` #1（深 #17） | R26 |
| 評価結果 | `app.html` #31（深 #37） | 同 `web.html` #12 右侧 | `b8` #2 抽屉、#4 单页 | `b8` #5（深 #19） | R26 |
| 判定中 | `app.html` #30 | 设计稿无 | 设计稿无 | 设计稿无 | R26 |
| 要登录 | `b2` #0 | `b2` #4 | 设计稿无 | 设计稿无 | R26 |
| 不是活动页 | `b2` #1 | 设计稿无 | 设计稿无 | 设计稿无 | R26 |
| 海报补 3 项 | `b2` #2 | `b2` #5 | 设计稿无 | 设计稿无 | R26 |
| 补完后判定 | `b2` #3 | 设计稿无（同評価結果） | — | — | R26 |
| 参加予定页签 | 设计稿无 | 设计稿无 | 设计稿无 | 设计稿无 | R26 |
| 参加コード输入 | 设计稿无 | 设计稿无 | — | — | R26 |
| 探す · 空 / 少 / 大 | `b2` #6 / #7 / #8 | `b2` #11 / #12 / — | 设计稿无 | 设计稿无 | R27 |
| 探す · 絞り込み / テーマ | `b2` #9 | `b2` #13 | 设计稿无 | 设计稿无 | R27 |
| 探す · 検索中 | `b2` #10 | 设计稿无 | — | — | R27 |
| 詳細 · 0 / 少 / 多 | `b2` #14 / #15 / #16（深 #43） | `b2` #17 / #18 / #19（深 #47） | 设计稿无 | 设计稿无 | R27 |
| 参加登録 ① ② ③ | `b2` #20 / #21 / #22 | `b2` #23（只有 ①+②） | 设计稿无 | 设计稿无 | R27 |
| 参加の取り消し | `b3` #42 | 设计稿无 | — | — | R27 |
| 会う準備 | `b2` #24 | `b2` #25 | 设计稿无 | 设计稿无 | R27 |
| 会場 ①–⑩ | `b2` #26–#35（深 #44 / #45） | `b2` #36 | 设计稿无 | 设计稿无 | R27 |
| 会後 · 空 / 少 / 多 | `b2` #37 / #38 / #39（深 #46） | `b2` #40 / #41 / #42（深 #48） | 设计稿无 | 设计稿无 | R27 |
| 计划页重比 | `app-plan-A` A-R24-01 / 04；另补 `app.html` #22 / #25（概要 · イベント段）、#27 / #28（人物タイプ詳細 · 会える活動）、`b10` #33（App 会える活動 · 内訳）——R26 开工时先查它们是否已是某个 A-R24 画面的画板（是则写 view id），否则在 `app-plan-A.json` 追加（复核 M9） | `web-plan-A` / `web-plan-C` 清单内 | 同 | 同 | R26 |

## 9. 自定决定（对标成熟产品）

| # | 事项 | 决定 | 对标 |
| --- | --- | --- | --- |
| 1 | R26 / R27 怎么切 | R26 = 评估 + 一级页 + 参加予定 + 计划接线（解锁计划页 12 个画面）；R27 = 探す、詳細、报名、会う準備、会場、会後、興味なし、搜索（§12） | 先做「被别人等」的关键路径（关键路径法） |
| 2 | 外部活动评估的事实来源顺序 | 页面 JSON-LD `Event` → OpenGraph / meta → AI 抽取 | Google 活动富结果、Slack / Notion 链接预览都先读结构化数据 |
| 3 | 推荐分数统一 | 新界面只用 `scoreEvent`；`valueScore` 不删，只保留给旧调用方，合回前随旧屏一起清 | 一个指标一个口径（Stripe Sigma / Amplitude 的「单一指标定义」） |
| 4 | 时間対効果缺费用时 | 给区间（`55–70`），总分取中值，**判定一律用 `eventVerdict(total)`**（与计划页 `eventsFor` 同一口径，复核 M2），区间只用于显示；画面写「参加費が不明のままだと、スコアは幅で表示します」（`b2` #5） | Zillow Zestimate / 银行利率试算给区间 |
| 5 | 移动时间 | 规则推定表（§3.5），一律标「推定」，不调地图 API | Meetup / Peatix 只按地区显示距离；Google Calendar 的「移動時間」也是估值 |
| 6 | 库内活动打开详情时的评分 | 规则当场算、写 `orbit_event` 评估记录、不调 AI；参加者名单变化后由重算任务更新（§6.5） | 推荐系统的「读时计算 + 短缓存」 |
| 7 | 外部活动「参加予定に追加」 | 不进活动表；评估记录即这场外部活动，计划引用 `assessment:<id>`，只对本人可见；名片归属窗口、公开目录、他人计划、主催中心都读不到（复核 S1） | TripIt / Google Calendar 的私有条目不进公共目录 |
| 8 | 同一来源重复评估 | 幂等返回已有记录（唯一 `actor + digest + rubric`）；「再評価」按钮只在事实变化（名单公开、用户补项）后出现 | D-07 已定 |
| 9 | 隐私 | 不存页面全文与抓取 HTML；海报按现有资产保存期；评估只本人可见 | 链接预览服务只缓存元数据 |
| 10 | 登录页 | 规则判定，不调 AI、不代登录；三条退路（贴正文最准） | 1Password / Pocket 对付费墙页面的做法 |
| 11 | 「不是活动页」 | 同一次 AI 调用输出页内活动 ≤5 条，可逐个评估 | Pocket / Readwise 识别文章内链接 |
| 12 | 興味なし 的作用 | 「知っている」只过滤这一场；「日程 / 距離」对同时段 / 同地区降权；「内容」对同主办同主题降权；同一主办方 3 次后整体降权 | YouTube「興味なし」/「このチャンネルをおすすめに表示しない」 |
| 13 | 探す没有计划时 | 按人气（报名数）排序，明写「今は『人気順』」，并引导设目标 | Spotify 新用户冷启动先给热门 |
| 14 | 参加者显示范围 | 只显示公开资料的参加者（设计稿已写），关系图只用我的联系人，不读他人人脉 | LinkedIn「共通のつながり」只算自己可见的 |
| 15 | 写日历 | 「カレンダーに仮で入れる」「明日のフォロー」都是确认后写入（A 档执行，走 Actions 确认链）；审核结果出来后自动更新仮予定 | Google Calendar 的「仮予定」（tentative） |
| 16 | 準備リスト | 固定 5 项模板，资料一项的文字可编辑；勾选存服务端（两端同步）；名刺余量只存本机 | Apple Reminders 模板清单 |
| 17 | 関係マップ | 会场内参加者 × 我的联系人；共通の知り合い只用我的联系人里同时认识两人的记录 | LinkedIn mutual connections |
| 18 | 一言メモ转文字 | 设备端识别，音频不上传；Web 不支持 Web Speech 时隐藏按钮（G18 口径：没有数据 / 能力就隐藏，不是改画板） | iOS 键盘听写、Otter 设备端模式 |
| 19 | App 顶栏 🔍 / 📅 | 🔍 在 R30 前跳「探す」并聚焦搜索；📅 打开 Task › カレンダー | R20-01 同一临时做法 |
| 20 | R24-06 的非活动小项一起做 | 跟推荐活动行同一桶、同一组画面门禁 | 交接表原文就是一桶 |
| 21 | `PLAN_LIVE_EVENT_FACTS_READY` | 改常量 `true`，不做环境开关；回退 = 改回 false 发版 | 现有写法就是常量；R25 M3 有界读取已就位 |
| 22 | 评估的月上限 | 免费 10 次 / 月，付费不限（D-09）；超限时输入卡下写「今月の判定は上限に達しました（10/10）· 来月1日にリセット」，库内活动的规则评分不受限 | Notion AI / Grammarly 免费额度 |
| 23 | 抓取频率 | 每人每分钟 ≤10 次（429）；主机级每分钟 ≤30 次用现有 Postgres 限流表实现（与 R15 公开预览限流同一写法，serverless 下共享），有测试 | 爬虫礼仪（robots / 主机级限速） |
| 24 | `/live` 未报名 | 先查报名状态再请求运营接口，显示「参加登録していません」+ 报名入口 | 正常访问控制不该在控制台报错 |
| 25 | 水合警告 | 「已结束」等时间相关状态改在服务端按请求时刻算好、作为 props 传，客户端不再自己算 `Date.now()` | Next.js 官方建议 |

## 10. 需要定的事（推荐做法 + 对标；A = 用户拍板，B = 设计稿会话改 / 补画板（经主会话），C = 工具 / token）

**决定（2026-10-14，主会话；用户授权项由主会话转问）**：

| # | 结论 |
| --- | --- |
| A1 / A6 付费 AI | **用户已授权（2026-10-14，原话「A1 同意，A6 同意」）**。**只限本机真实验证**：A1 是 E1 ≤15 次、E2 ≤10 次，本轮合计 ≤ $0.3；A6 是 E3、E4 各 ≤5 次。**生产开启**另等合回授权。E1–E4 是**主路径**，规则退路（A1 时只有 3 项手入力 + 库内活动的规则评分；A6 见 §2.5 / §2.7）只在 AI 不可用、超限或失败时降级用。真实调用验证通过之前，live 仍按 G18 隐藏 URL / 海报入口 |
| A2 | 做轻量版（`organizerFollows`，按推荐） |
| A3 | 本期去掉「📍 現在地から5km」（`b2` #9 的 chip 交设计稿会话改） |
| A4 | 按推荐：生产迁移 `event-assessments-core`、`ai-usage-event-purposes` 已登记进 README「合回前总验收」，等授权 |
| A5 | 接账本：R27 带 `ai-usage-event-purposes` 迁移，只在本机验证，生产等合回授权 |
| A7 | 按推荐：Web 会場 390 显示「会場モードは App で」+ 打开 App / 继续用 Web；1024 照 1440 结构补画 |
| B 组 | 已交 design-decisions 会话（决定表 §28） |
| C 组 | 按推荐，R26 第一天走 R01 流程补 token |

### A 需要用户拍板（真产品取舍 / 付费 AI / 生产）

| # | 事项 | 推荐 | 对标 | 不同意时 |
| --- | --- | --- | --- | --- |
| A1 | **R26 新增付费 AI**（E1 URL / 正文抽事实、E2 海报 / 截图抽事实）：本机真实验证和生产开启 | 同意；本机真实验证 E1 ≤15 次、E2 ≤10 次、本轮 ≤ $0.3；生产随合回一起开 | plan-v2.2 的逐项授权口径 | 授权前 live 按 G18「没有能力就隐藏」：评估卡只留「3 项手入力」和库内活动的规则评分，URL / 海报两个入口隐藏（不新造文案，复核 M11）；用户最终不同意时再请设计稿会话改画板 |
| A2 | **探す「あなたのコミュニティ」与「フォロー」**（`b2` #8 / #10 / #13：コミュニティ行、メンバー限定 / 先行申込标签、主催「フォロー中」）——现在没有这个功能 | 做轻量版：コミュニティ = 我参加过或关注的主办方；关注存集合 `organizerFollows`；「メンバー限定 / 先行申込」只在主办方设置了对应开关时出现（读 R17 申込設定现有字段，没有就不出标签） | connpass / Peatix「グループをフォロー」 | 画板去掉这一行和「フォロー中」（要改 `b2` 3 块画板） |
| A3 | **「📍 現在地から5km」筛选**（`b2` #9）：要定位权限，还要会场坐标，库里没有坐标 | 本期去掉这一项，记为下一期（改 `b2` #9 一处 chip）；地点筛选保留 オンライン / 東京 / 大阪 / 名古屋 | Peatix 只按都道府県筛选 | 做的话要接地理编码服务（外部 API，可能付费）+ App 定位权限 |
| A4 | **生产迁移** `event-assessments-core`（R26）；如 A5 同意再加 `ai-usage-event-purposes`（R27） | 同意，合回前与其他迁移一起执行；先只读预检 | 既有口径 | 不迁移 → 契约 8 不能 live，计划页的外部活动无事实 |
| A5 | **已有的报名访谈 / 会後总结两个付费调用接进 AI 账本**（现在不记账，§1.1 第 7 条） | 接（只记账，不设上限），R27 带一个账本用途迁移 | 所有付费调用都可计量（成本治理） | 不接：成本继续只在 provider 账单里看得到；R27 不需要迁移 |
| A6 | **R27 变更两个现有付费调用**：E3 会後逐人提案（まとめ 3 条 + 每人お礼下書き / フォロー日 / 类型建议）、E4 报名时的自己紹介下書き（复核 S2） | 同意；本机真实验证各 ≤5 次；提示词升版本、账本记 `promptVersion` | Eventbrite / LinkedIn 的 AI 跟进草稿均为「草稿 + 用户确认」 | 不同意：用 §2.5 / §2.7 写的规则退路，并请设计稿会话改 `b2` #24 / #25 / #38–#42 的对应文案（「AI 下書き」字样等） |
| A7 | **Web 会場モード在 390 宽**：画板没有；是「做一版手机 Web 会场」还是「显示『会場モードは App で』+ 打开 App / 继续用 Web」（复核 m7） | 后者（会场是 App 主场景，手机 Web 只给出口）；1024 照 1440 结构补画 | Zoom / Slack 手机浏览器打开时引导到 App | 前者：需要补画 390 全套 10 个子视图，R27 工作量 +2 天 |

### B 需要设计稿会话改 / 补画板（经主会话；补画只加在 `b12` 末尾）

| # | 事项 | 推荐 | 对标 |
| --- | --- | --- | --- |
| B1 | **D33 漏改**：`app.html` #13「招待されたイベント · 招待コードがあれば…」、`b8` #3「🎟️ 招待コード」、`b2` #6「招待コード 🔗」仍叫招待コード | 改成「参加コード」（与 `web.html` #10 同文案「参加コードをお持ちですか？」） | D33 已定，执行漏项 |
| B2 | **参加予定页签没有画板**（两端） | 补画：App + Web 1440 / 1024 / 390；分「これから / 過去」，行样式沿用 `app.html` #15「参加予定」卡，过去的行带「参加した / 未チェックイン」chip；空态「参加予定はまだありません · 探すでイベントを見つける」 | Peatix「参加予定 / 過去のイベント」、Meetup「Your events」 |
| B3 | **`b2` #34 面談を提案与 D46 冲突**：画板写「相手が 1つ選ぶと確定し、双方のカレンダーに入ります」，D46 定「只出草稿」（D45 / D46 当时只改了 b4 / app / b10 等，未改 b2） | 按 R24 已实现的面談提案草稿画法重画 `b2` #34（默认时段可调、只出草稿） | Q2：较新的决定优先 |
| B4 | **未登录的活动列表 / 详情 / 报名**（R26-08，b1 只有主办方公开页） | 补画 Web 1440 / 390：公开顶栏 + `b2` #12 的「すべて」一组（列表）与 `b2` #17 同结构（详情），评估吸顶条换成「ログインして行く価値を判定」 | Peatix / connpass 未登录列表与详情 |
| B5 | **Web 1024 / 390 缺口**：評価 空 / 少量（1024）、少量（390）；判定中、不是活动页、补完后；探す、詳細、参加登録、会う準備、会後的 1024 / 390；会場モード 1024（390 见 A7） | 补画 1024 + 390 | b8 断点规范「每屏三宽度」 |
| B6 | **缺的状态**：参加コード输入（两端）、Web 判定中 | 参加コード：补画 App sheet + Web Modal 380（D42 档），8 位码分段输入；Web 判定中：补画 1440（与 App #30 同三步） | Peatix / Luma「招待コードを入力」弹窗；Notion AI 的分步进度 |
| B7 | **探す画板里的计数差**：`b2` #8 「すべて」区列 6 行，标题无计数；`web.html` 各板「VC 3名 vs 2名」是不同活动——**预检判定不是不一致**，无需改 | 不改 | 预检工具对「每行各自数字」的误报 |

### C 工具 / token（R01 流程补齐，不用拍板，开工第一天做）

预检汇总（`board-preflight.mjs`，2026-10-14，67 块画板：b2 49、web 4、app 6、b8 8）：近似但不等 57 处、缺 token 946 处（其中间距 893）、疑似不自洽 5 处（全部是列表每行各自的「会いたい人 N名」，属误报）、疑似无功能 79 处（逐项结论见各 PLANNER 预检表）。

| # | 缺口 | 出现 | 推荐 token（Web / App 同名） |
| --- | --- | --- | --- |
| C1 | 行高 1.1（近似 `--lh-display` 1.05） | 172 处 · 40 块 | `--lh-tight: 1.1` |
| C2 | 行高 1.2 | 47 · 13 | `--lh-snug: 1.2` |
| C3 | 行高 1.55（近似 `--lh-body` 1.5） | 31 · 7 | `--lh-body-relaxed: 1.55` |
| C4 | 行高 1.6 / 1.7 / 1.75 / 1.8 | 23 / 3 / 3 / 7 | `--lh-prose: 1.6`、`--lh-prose-lg: 1.7`、`--lh-quote: 1.75`、`--lh-letter: 1.8`（1.8 只在お礼の下書き正文） |
| C5 | 字距 -0.02em / -0.01em / 0.01em | 42 · 30 / 13 · 10 / 36 · 36 | `--track-tight: -0.02em`、`--track-snug: -0.01em`、`--track-title: 0.01em` |
| C6 | 阴影 `0 1px 2px rgba(0,0,0,.06)`（三段胶囊选中项） | 32 · 31 | `--shadow-seg`（App 已有同值的 `tseg` 阴影则对齐成同一个 token） |
| C7 | 选中描边 `0 0 0 2px <lav>`（评估行选中） | 8 | `--ring-select`（浅深各一值） |
| C8 | 字号 36 / 52 / 60 / 34 | 10 / 4 / 3 / 3 | `--fs-display-36`、`--fs-display-52`（会後大数字）、`--fs-display-60`、`--fs-number-34`；命名随 R01 习惯定 |
| C9 | 圆角 26（`.mcta`） | 3 | `--r-cta: 26` |
| C10 | 状态点外圈 `0 0 0 4px <apricot-soft>`、错误输入框 `inset 0 0 0 1.5px <coral>` | 3 / 2 | `--ring-dot`、`--ring-error` |
| C11 | 间距不在 `--space-*` 刻度：10（822 次）、6（653）、9（491）、3（333）、11（309）、7（224）、2（196）、5（137）、1（114）、13（114）、40、48、28、29 | 全部画板 | 刻度补小值 `--space-1/2/3/5/6/7/9/10/11/13` 和 `--space-28/40/48`（29、18.89 等非整数是画板缩放 / 文字测量值，不进 token，照搬 kit 源码精确值） |
| C12 | `b2` #2 / #5 海报示意图里的 8px / 0.1em 文字 | 2 | 不是 UI，是海报图片示意：实现里放用户上传的图，门禁归 `[data]` |

## 11. 待授权调用与操作清单

| 类别 | 项 | 何时需要 | 说明 |
| --- | --- | --- | --- |
| 付费 AI（新增 / 变更） | E1 URL / 正文抽事实、E2 海报 / 截图抽事实（R26，A1）；E3 会後逐人提案、E4 自己紹介下書き（R27，A6） | R26 / R27 本机真实验证；合回后生产开启 | 推荐额度见 §10 A1 / A6；每次的耗时、token、结果写 REPORT |
| 付费 AI（现有） | 报名访谈、会後总结 | R27 本机验证 ≤5 次 / 项 | 现有已上线调用，按惯例任务授权 |
| 生产迁移 | `event-assessments-core`；（A5 同意时）`ai-usage-event-purposes` | 合回前 | 先迁移再部署；只读预检（表不存在、CHECK 当前值） |
| 部署 / 环境 | 无新环境变量（抓取限速、月上限都是常量） | — | — |
| 原生依赖 | App `expo-speech-recognition`（或同类设备端识别模块）+ `NSSpeechRecognitionUsageDescription` / `NSMicrophoneUsageDescription` 文案 | R27；下一次 TestFlight | 本组只在模拟器开发包验证 |
| 后续建议（不在本组） | 活动偏好设置界面（R18）；地理坐标与「現在地から」（A3）；`valueScore` 下线（合回前） | — | 写进 REPORT 交接 |

## 12. Sprint 怎么切

| Sprint | 主题 | 一句话 | 能单独验收的理由 |
| --- | --- | --- | --- |
| [R26](../R26-events-assessment-and-plan/GOAL.md) | 评估、一级页、参加予定、计划接线 | 契约 8 live（URL 抓取 + SSRF、海报、正文、3 项、异常态）、`event_assessments` 迁移、`events/mine`、两端イベント一级页（評価 / 参加予定，探す页签壳）与評価結果；活动事实 live（D53），概要推荐活动行、今日のチャンス、会える活動、R24-06 小项；代签计分；R26-06 / 07 换取数；重比计划页 12 个画面 | 贴一个 URL 得到分数并加入计划，计划概要出现推荐活动；不依赖 R27 的任何画面 |
| [R27](../R27-events-journey/GOAL.md) | 从找到活动到会后 | 探す（コミュニティ、絞り込み、検索、興味なし契约 9 live）、詳細（含未登录）、参加登録 / 参加コード、会う準備、会場モード（含签到状态、一言メモ）、会後のふりかえり；`event-search` 给 R30；删除两端旧活动屏 | 一场活动从发现到会后完整走一遍 |

为什么这样切：

- **计划页在等**：10 + 2 个画面只差活动事实和推荐行。R26 先交付，让计划页重比尽早开始。
- **新风险集中在 R26**：新表、外部抓取、付费 AI 都在 R26；R27 基本是在现有接口上重写界面，风险低、画面多。
- **R27 依赖 R26**：詳細的评估吸顶条、探す的分数、会後的分数预览都用 R26 的评分与 `events/mine`。

## 13. 旧屏归属（本设计的认领）

| 端 | 旧屏 / 路由 | 处理 | Sprint |
| --- | --- | --- | --- |
| App | `(app)/events` → `EventsScreen`；`home/events` | 重写 / 改跳转 | R26 |
| App | `events/[id]` → `EventDetailScreen`；`events/[id]/register`、`register`、`register/[code]` → `EventRegistrationScreen`、`RegisterInviteScreen`、`Registration7a*` | 重写 | R27 |
| App | `events/[id]/live` → `live/EventLiveScreen`；`attendees`、`participants/[participantId]`、`party`、`party/checkin`、`party/graph` | 重写 / 改跳转 | R27 |
| Web | `/app/events` → `events-0918/events-list.tsx`；`/app/home/events` | 重写 / 改跳转 | R26 |
| Web | `/app/events/[id]`、`/register`、`/app/register` → `events-0918/event-detail.tsx`、`event-register-modal.tsx`、`modals` | 重写 | R27 |
| Web | `/app/events/[id]/live` → `events-0918/event-live.tsx` | 重写 | R27 |
| 两端 | 主办侧（`events/center`、`operations/**`、`analytics`、`o/[slug]`、`ops-0918`） | 不动 | R17 |

删除旧组件前逐个确认调用方（GitNexus `impact` + 文本搜索），允许清单只减不增（G20）。

## 14. GitNexus（本文写作时）

本文的符号和行号来自代码阅读（2026-10-14，`redesign` @ `89e16b2b4`）：`features/redesign-contracts/{handlers,service-factory,mock-service}.ts`、`shared/contract/event-assessment.ts`、`shared/compute/event-score.ts`、`features/plans/v2/{service,overview,event-facts,service-factory}.ts`、`features/events/event-operations/{service,runtime}.ts`、`features/plans/{event-attribution-runtime,event-attendance-reconcile}.ts`、`features/recommendations/{live-event-value-service,live-service}.ts`、`features/ai-quota/constants.ts`、`features/network-analysis/migrations.ts`。开工第一天先刷新索引（`node .gitnexus/run.cjs analyze --index-only`），然后对下列符号跑 `impact --direction upstream`，结果写进 REPORT：

- `scoreEvent`、`livePlanEventFacts`、`eventsFor`；
- `checkInParticipant`、`markPlanEventAttendedForActor`；
- `createEventValueRecommendationService`；
- 契约 8 / 9 的 handlers、`service-factory`。
