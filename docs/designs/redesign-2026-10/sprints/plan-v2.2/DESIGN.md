# 计划 v2.2 整体设计（R22–R25）

**版本 2（2026-10-10，执行人：小雨（甲）；文档阶段，未改代码）。** 版本 2 = 按独立复核（[REVIEW.md](REVIEW.md)）S1、M1–M11、m1–m16 修订。 本文是 R22–R25 四个功能 Sprint 的共同依据：说清这个功能为什么这样设计、数据怎么放、分数怎么算、每一次 AI 调用的规矩，以及和乙负责的 Sprint 之间的接口。四个 Sprint 的 `GOAL.md` / `PLANNER.md` 只写各自的范围和验收，不重复本文。

- 设计稿：`b10-plan-example.html`（生成流程 ①–⑧ 与规范板）、`b4-plan-iorbit.html`（記録と加点、人物タイプ詳細、見直し、配額、達成、目標切替）、`app.html` / `web.html` 的 Task › プラン 与人物タイプ詳細、`index.html`「待確認項決定」、`b9-import-plan-v2.html`（招待后「AI 推测符合人物类型 → 虚线确认」）、`b8-responsive.html`「2 · Task › プラン」（Web 1024 / 390 的版式）。
- 设计稿用语：「下书」= AI 先填好、等用户确认的草稿；「斜纹」= 跳过得来的满额分在构成条上的斜线花纹；「豆沙」= 设计系统里提示「需要留意」的暗粉色（超额分、空き、可能变了的前提）。
- 旧方案：`IMPLEMENTATION-PLAN.md` §1.7、D-02/02b/03/03b/03c/04/05/06/09、P3、附录 A、§5 Q4/Q6/Q7。**本文与它冲突的地方以本文为准**，冲突点逐条写在 §9「自定决定」里，附理由和对标做法。
- 已定的产品决定：Q4「该用 AI 的都用 AI，真实调用逐项授权」；Q6「这期不做付费，所有人按 Free 限额，付费入口隐藏」；Q7「业界现状库由 Claude 撰写、独立审核」；邮件和消息只做到草稿；契约「宽进严出」（README 通用规则 10），App 未正式发布，契约可以直接改（走 `BREAKING.md`）；人脉分析 grill D44「计划阶段与目标不自动改写、旧模板计划不自动重写」。

## 1. 为什么要重做，重做成什么样

### 1.1 旧计划（v1）的问题

现在 Web 上的「我的计划」（`/app/agent/plan` → Task › プラン 插槽里的 `IOrbitPlan`）是 W0007–W0055 做出来的：目标 + 期限（一个月 / 3 个月 / 一年）→ 按周排的阶段 → 行动、人脉需求、要获得的信息、活动。它有三个根本问题：

1. **它按时间排，而用户的目标没有时间表。** 设计定稿「目标不设期限」，周次、延期、到期回顾这一整套都用不上；按周提醒还会把「没按时做」变成负担。
2. **它没有先弄清用户到底想要什么。** 只有一个固定问题，直接拿目标原文生成。b10 的例子里用户写「落地して黒字化」，真实目的却是「ブランドとして確立」；不先确认背景，人物类型就会偏。
3. **它没有一个能每天看到进展的数字。** 首页「プラン スコア」、活动评分 ①（还缺几个人）、会后回写，都需要一个两端一致、同人同类型只算一次的分数。

### 1.2 v2.2 的形状

```
目标一句话 + 目标类型
   ↓  AI 1 次（下书）
背景确认：わたし → チーム（必要な力 × メンバー）→ 目的の階段      ← 用户逐块确认，「空き」由规则即时算
   ↓  AI 1 次（从题库挑 ≤5 问）
≤5 问一次答完 →「確定した前提」（每行标出处，可点改）
   ↓  AI 1 次（高级提示词 + 业界现状库，只引用库内条目）
初版方案：見立て · 結論 · Step（完了の目安）· 人物タイプ（役割×状況 + 配点 + 人数）· イベント枠
   ↓  AI 修正 ≤3 次（不改也算一次）→ 手動編集 1 次（合计保持 100）→ 確定
プラン概要：分数（满分 100、不封顶）· Step · 人物タイプ · イベント · 今日のチャンス
   ↓
记录加分（面谈 / 线下聊过 / 参加活动）· 跳过（習熟済み，满额斜纹，可撤回）
   ↓
方案を見直す（月 3 次）· 目標を達成した → 次の目標 · 多目标切换（同时 2 个）
```

设计原则（全部来自设计稿和已定决定，实现时不得违背）：

- **AI 只提议，用户决定。** 下书、推测、预标都可以改；匹配候选、计分提议、Step 完成都要用户点确认才生效。
- **处处有据，默认收起。** 每个 AI 结论旁有「?」展开依据（前提哪几行、业界现状哪几条、提示词版本）。
- **不编造。** AI 只能引用业界现状库里的条目，库里没有的说法标「一般論」且不出数字；人物类型短名只能从固定字典里选；问题只能从题库里选；联系人和活动只能用输入里给的。
- **不代发。** 面谈提议对 Orbit 用户是站内结构化请求（3 个时段、无自由文本，用户点「提案する」才发出）；对其他人只出草稿，「送信はしません」常驻。
- **不保证达成。** 概要页写明「方案は達成を保証しません」。
- **示例数据绝不写库。** 空态的「サンプル」人物类型卡、引导示例模式的计划都是前端静态数据。

## 2. 用户流程（逐屏）

画面编号对应 b10 / b4 / app.html / web.html 的画板；括号里是负责的 Sprint。

### 2.1 定目标（R23）

- **入口**：Task › プラン 空态（两端）；首页「プラン スコア」空态「目標を決める」（R10 的组件，点进 Task › プラン）；引导里「生成计划」那一步（R28，见 §8）；達成后的「次の目標」（R25）；目标下拉里的「目標を追加」（R25）。
- **画面**：一句话输入（原样保留用户说法，不纠错）+ 6 类目标 chip（🚀 上市・収益化 `launch` / 💰 資金調達 `fundraising` / 🤝 新規開拓 `sales` / 🧑‍💼 採用 `hiring` / 🔗 事業提携 `partnership` / 🧭 キャリア `career`）。chip 默认值由「目标类型推测」给出（§5 调用 C1），用户可改。按钮下预告全流程与次数（背景 → 5 问 → 初版 → AI 修正 3 → 手动编辑 1）。下方淡化的「サンプル」人物类型卡，绝不写库。
- **「iOrbit と具体化する」**：建一条 `plan_intakes`（状态 `drafting`）并发起背景下书（C2），进入生成流程页。

### 2.2 背景确认（R23）

- 生成流程页长得和 iOrbit 对话一样（顶部 5 段进度：背景 / 質問 / 初版 / AI 修正 / 手動編集），App 全屏、从下推入、不显示底栏；Web 一屏三块 + 右栏「わかったこと」（本地实时汇总，不调 AI）。**它是独立路由，不寄生在 iOrbit 的会话存储里**（理由见 §9 自定决定 3）。
- 下书中：骨架屏约 5 秒 +「読んでいるもの」（登录资料、目标文、人脉里标「共同創業者」等的人的名片与面谈记录、该类型的「必要な力」清单）。
- **わたし**：姓名、职种来自登录资料（要改去マイ）；立场单选（代表・オーナー / 共同創業者 / 社内の担当者 / 個人として，AI 预选）；「やりたいこと」AI 从目标文抽出，可改——改了才重算目的の階段（C4，轻量、不计用户次数）。
- **チーム**：一人 / チーム。表格 = 行「必要な力」（每类目标固定 8 项，来自模板，不是 AI 现想）× 列成员（来源 chip：プロフィール / 人脈から / 手入力）。初始勾选是下书，点头像付け外し；没人勾的行即时变「空き」（规则，不调 AI）。「メンバーを追加」两页签：人脈から選ぶ（按名字・公司・标签搜，候选排序 = 标「共同創業者」的在前、能补「空き」的其次，选中后「できること」由名片・面谈记录推定（C3）并可改）/ 自分で書く（名字或称呼 + 关わり方 + できること，不调 AI；「人脈にも登録する」默认关，开了才走现有手动建联系人，来源「プラン」）。成员都不需要注册 Orbit。
- **目的**：目的の階段 4 级（上大下小）。规则：原文放第 2 级（标「最初に書いた目標」）；下 1 级更小更具体（数か月）；上 2 级由「やりたいこと」和「チーム」推出 1 级 + 再往上 1 级（10 年単位）。AI 只建议「いちばん近い？」一级并给理由（「?」展开），单选、必选。
- 三块按顺序确认（当前块展开 + 「確認中」，已确认块折成一行 + ✎ 可回改（**只在进入选题之前**；选题之后背景锁定，要改就改前提行——选题缓存依赖背景，R23 自定决定 2），未到的块虚线 +「下書き：…」）。三块都确认后才出现「この背景で質問へ（5問まで）」。

### 2.3 ≤5 问与确定的前提（R23）

- 选题（C5）：从该类目标题库（6 类，各 6–8 问，见 §3.4）里挑「背景还不知道 × 最影响分岔」的最多 5 问；能从背景、资料、人脉、面谈记录知道的不问；空白相关的问题优先；**同类目标 + 同背景 → 同样的题、同样的顺序**（输入摘要做缓存键，见 §5）。「?」展开选题理由。
- 作答：每题 chip（单选，R7 类可多选）+ 一行自由输入（可空）；Web 三列网格；「まとめて回答する」一次提交；也可在输入框用文字一次答完（这时由选题同一次的结果做字段映射，不另调 AI——文字原样存进自由输入）；空着的题按推测处理，依据里写「推測」。
- 「確定した前提」卡：目的 / チーム 来自背景，现在地… 来自 Q1–Q5，每行右侧小签标出处；点任一行就地改（下拉同原题选项 + 自由输入）。改前提会让初版重做，但**不计 AI 修正次数**。
- 「この前提で初版をつくる」→ 初版（C6）。按钮下写「初版は回数に含みません」。

### 2.4 初版、AI 修正、手动编辑、确定（R23）

- **初版**就是完整方案：見立て（文中 ①② 对应引用的业界现状条目）、進め方の結論（+ 三格图）、Step（每步「完了の目安」写成可数的状态 + 人物类型字母 chip，不排期）、人物类型（固定短名 + 「役割×状況」一句 + 配点 · 人数；「?」展开相对模板的调整理由）、イベント枠、折叠区「この案で参考にした業界の現状 N件」（分野 · 要点 · ID · 版 · 日付 · 出典；App 默认收起、Web 默认展开）。
- **AI 修正**（C7，≤3 次）：固定在输入框上方的「AI 修正 あと N 回」；每轮只列差分（「変更」小签 + 旧文删除线 + 新文浅紫）+「変わらない点」；AI 判断不改也计一次（「今回は変更しません」+ 理由）；三轮历史 chip 可跳回；用完后输入框禁用，只剩「手動で編集」「この内容で確定」。
- **手動編集**（1 次，新画面，不调 AI）：Step 改名（就地输入，下方灰字「元：…」）、拖动排序、删除、增加（新 Step 只有名称和目安）；人物类型人数步进器、配点输入（只收 5 的倍数）、移除类型（底部确认，列出配点怎么回流）。合计始终 100（规则见 §4.3）。底部「合計 100 / 100 · 変更 N件」+「このプランで始める」= 保存并确定。右上「元に戻す」恢复到 AI 方案。
- **确定**：建一份生效的 v2 计划（§3），之后 AI 不再自动改写；要改走「方案を見直す」。

### 2.5 プラン概要（R24）

- 分段下方目标名「▾」= 目标下拉（切换 / 目標を追加 / 編集，R25）；二级页（人物タイプ詳細、見直し、手動編集、生成流程）都从这里进，返回回到 Task › プラン。
- 大分数（count-up）+「満点 100 · 上限なし」+ 构成条（按配点分段：实色 = 聊出来的分，斜纹 = 跳过的满额，豆沙 = 超过 100 的部分接在刻度之后，灰 = 还没得的）+「話して 36 · スキップ 10」「あと 54 で満点」。
- 「確定した方案」卡（見立て / 結論一句，「?」= 前提 N 件 · 业界现状 N 件 · AI 修正 N 回 · 手動編集）+ 统一按钮组：前提を見る / 方案を見直す（AI · 月 3 回）/ 手動で編集（每次見直し后 1 回）/ 目標を達成した。Web 放在标题栏，App 放在卡内。
- 今日のチャンス（「今日 +N の機会」）：一个推荐（候补里推薦度最高且还没聊的人，或能见到最多剩余目标的活动）。
- Step 列表：目安 + 进度 chip（如「VC 2 / 3人」）+ 人物类型 chip；目安可能已达成时出虚线确认卡，只有用户点「完了にする」才算完成，点「まだ」收起。**出卡是规则判断，不调 AI**：这个 Step 关联的人物类型都已达到目标人数（或已跳过）时出卡，文案用模板「〇〇（Step 名）の目安に届いたかもしれません。完了にしますか？」，依据列出计入的人。设计稿里「高橋さんと DD に進みましたか？」这种具体问法需要 AI 读目安文本，本期不做（§9 #24）。没有关联人物类型的 Step 不出卡，用户随时可以手动点「完了にする」。
- 「前提を見る」：只读的「確定した前提」卡；每行旁「見直しで変える」进入見直し（确定后的前提只能经見直し改，避免绕过月配额改出与方案不符的前提）。
- 人物类型卡：一句话名称不截断 + 三格（人脈の候補 N / 会える活動 N / 紹介ルート N；人脉里没有时第一格灰「人脈にいない」）+ 分数进度；跳过的显示「習熟済み · スキップ（満額）」斜纹。
- イベント一块单独放（不和人物类型混排）：参加 1 次 + 单价，满额后半分；下面按固定 5 项分数排的推荐活动。
- 右栏（Web）/ 卡底（App）：「方案は達成を保証しません」。
- Web 版式按宽度（b8）：1440 = 左 Step 4 列 + 人物类型 8 列 + 右栏；1024 = 分数与构成条横跨 12 列，下方左 7 列「Step 分组的人物类型行」、右 5 列「今日のチャンス + 最近の加点 + イベント」，右栏收成标题区按钮 + 380 抽屉，目标切换收进左上下拉；390 = Step 改横滑卡片（scroll-snap，露出下一张），右上 ↻ =「方案を見直す」。「最近の加点」= 最近 5 条计分记录（R24）。内容口径一律按 b10 / b4；b8 的 390 空态（4 个目标磁贴、「分析する」「テンプレート」）是旧版，以 b10 ① 为准。

### 2.6 人物タイプ詳細（R24）

三种去向（b4 A2、b10 ⑧）：

- **人脉里有候补**：头卡（一句话 + 配点 · 人数 · 单价 + 三格）→ なぜこの人か（「?」依据）→ 聞くこと 3 問（コピー）→ 話せたの判定（3 问中聊到 2 问以上 = 单价；超额半分；无名字自报只算到目标人数）→ 見分け方 → 候补（推薦度数字降序，理由 + 切り出し方 + 最后接点，「?」展开依据；方形多选；已聊过的折叠在底部）→ 紹介ルート（依頼文 = 草稿）→ 会える活動 → やること（挂在这个类型下的 To-do，没有就不显示，见 §8 R20 / R21 行）。底部固定栏「N人を選択中 · すでに話した · 面談を提案」。
- **紹介ルート从哪来**：初版（C6）从输入的联系人别名里挑「可能引荐这类人的人」（经谁、为什么），写进人物类型的 `introRoutes`；校验别名在输入里、描述里不带人数等无据数字（设计稿「主催者 4 名」这种数字只在有数据时出现，本期不出）。見直し（C9）可以更新它；确定后加进人脉的新人不会自动出现在紹介ルート，要等下一次見直し（§9 #25）。
- **人脉里没有**：顶部浅灰条直说「人脈にまだいません」→ 人物像（年代・経歴 / いまの立場 / 関心ごと）→ 開口一番（コピー）→ 会える活動（固定 5 项分数环，内訳可展开）→ 紹介ルート → 页底「この分野はもう詳しい」= 跳过。
- **已跳过**：进度条整条斜纹 + 常驻「取り消す」；候补名单淡化但保留。
- **面談を提案**：Orbit 用户 = 结构化请求（3 个候补时段，取日历空闲，无自由文本，可撤回）；非 Orbit 用户 = 依頼文草稿 + コピー / メールアプリで開く，「送信はあなたが行います」。Web 用 520 抽屉，App 用底部弹层。

### 2.7 记录与加分（R24）

- **计分只走 v2 的计分命令**（R22）：v1 的 `interaction`、`PATCH items` 对 v2 计划保持 409；接受候补（✓）只把人关联到这个类型（`contact_links` linked），**不生成 v1 式的「约 TA」行动条目**——人物类型详情本身就是要做的事。
- **面谈记录**：在人物类型详情点「すでに話した」或在面谈记录弹层里选人物类型，弹层预告「プランに反映：VC パートナー +10」；记下后回到プラン播放加分动效（「+10」浮起淡出、大数字回弹、对应段描边闪一下），Toast 5 秒「元に戻す」= 删掉这次计分（面谈记录保留）。
- **オフラインで話した**：名字可空；填了名字先在人脉里按姓名找（完全一致或读音一致的列出「この人ですか？」让用户选），选了就按那个人计分；都不是才经现有手动建联系人接口（`/api/contact-drafts/manual`，来源「プラン」）新建再计分；规则写在弹层里（同一人同一类型只算一次；无名字只算到目标人数）。
- **目標超え**：到目标人数后说明「N 人目からは半分（+5）ずつ、上限なし」；半分加点用豆沙色。
- **面谈メモ判定**（C11）：メモ打开「プランの話せた に使う」（R20 的开关）且 @ 的人是某类型的候补或已关联时，AI 判断 3 问里聊到几问；≥2 问生成虚线确认卡（「〇〇さんとの面談で 3 問中 2 問を聞けました。+10 にしますか？」），用户确认才计分。AI 不可用或超额 → 卡片改为手动勾选「3 問のうち聞けたもの」。
- **活动**：参加（活动页标「参加した」或签到）→ 给**每一个**イベント枠配点 > 0 的生效 v2 目标各记一次（幂等键带 planId，同一场活动对同一个目标只记一次；对标 Strava 一次活动同时计入所有进行中的挑战）。
- **跳过**：「この分野はもう詳しい」→ 居中确认（非破坏，主按钮默认焦点）→ 记满额斜纹，可撤回；Toast「元に戻す」。

### 2.8 方案を見直す（R25）

- 入口：概要按钮 → 先出入口弹层（b4 A4 ①：3 格配额条「今月あと N 回」、重置日、「最初のプラン作成は回数に含みません」、这次会参考哪些数据），主按钮「iOrbit で見直す」才进入页面（打开页面不扣次数）；iOrbit 里说「プランを見直したい」（R21 跳到同一入口，见 §8）。
- 页面同生成流程（顶部 3 段：前提 / AI 修正 / 手動編集）。先给「確定した前提」卡，AI 预标「変わったかもしれない」的行（豆沙底 + 依据，如面谈记录「ARR 1億円の見込み」，C8，不扣次数）；用户就地改前提、补一句想法；输入框上方「見直し · 今月 あと N 回」+「送ると 1回使います（変更がなくても 1回）」。
- 「前提を送って修正案をつくる」才扣 1 次（C9）。结果只列差分 +「変わらない点」（結論 · Step 顺序 · 已得分不变，只重分「まだの点」）；每条变更旁有 ✓/✕（默认都采用），✕ 掉的变更确定时不应用，配点合计仍由 `reallocate` 保证 100（§9 #27）。确定前可再发（再扣）；每次見直し后重新给 1 次手動編集；「この内容で確定」→ 回概要 + Toast（元に戻す）。
- 手動編集的次数：确定时，如果生成流程里没用过手动编辑，确定后仍有 1 次；每次見直し确定后重新给 1 次；用掉即为 0（`plans.manual_edit_available`）。确定后的手动编辑不调 AI、不扣見直し。
- 用完：输入栏变灰「今月の見直しは使い切りました」，记录 / 加分 / 跳过照常；下月 1 日（东京）恢复。说明弹窗主按钮「わかりました」；「ご利用プランを見る」按 Q6 **隐藏**。

### 2.9 达成与下一个目标（R25）

- 只在用户手动点「目標を達成した」时出现确认框（分数确定、以后不再累加、可回看）。
- 完成页：克制的庆祝（emoji 方块 + 三格大数字 スコア / 話した人 / イベント count-up，无礼花）、「いちばん効いたこと」（带依据）、跳过的领域单独一行。
- 「次の目標を決める」→ AI 给 2 个基于面谈记录的候选（C10）+「自分で決める」，单选卡，选中项展开依据；「この目標で具体化する」→ 和首次相同的 v2.2 流程。「あとで」→ 该目标进「完了した目標」。

### 2.10 多目标与目标编辑（R25）

- 目标下拉：每个目标显示分数（不封顶）与聊过的人数，当前项打勾；「目標を追加」；Free 同时 2 个生效目标，满了在「目標を追加」下写明限制（不弹付费墙）。
- 首页「プラン スコア」显示**最近打开的那个目标**（§3.2 `last_opened_at`）。
- 目标编辑：改动字段显示「旧 → 新」+「変更」chip，没有期限字段。只改背景、ひとこと → 直接保存；改了目标文或金额 → 底部动作表三选一：キャンセル / 目標だけ保存（不重算）/ 保存して作り直す（进入見直し流程，前提里目标行已改，发送时扣 1 次見直し）。

### 2.11 旧计划（v1）怎么办（R25）

- 有 v1 生效计划的用户：Task › プラン 显示一张只读的「以前のプラン」卡（目标、阶段标题、已完成数，新组件画）+ 主按钮「新しいプランを作る」。
- 第一次确定 v2 计划时，v1 计划在同一事务里归档（`status = archived`），「以前のプラン」仍可从目标下拉底部「以前のプラン」打开只读查看。首次 v2 生成不计任何次数。
- 不自动把 v1 转成 v2（D44「旧模板计划不自动重写」；v1 没有背景、前提和配点，硬转只会编出假内容）。
- v1 专用的后台任务（`plan-phase` 补细、到期回顾、周一小结、`plan-event-*` 的阶段归属）只处理 `model_version = 1` 的计划；v2 计划跳过（R22 加守卫）。

## 3. 数据模型与迁移

### 3.1 和现有表的关系

现有：`plans`（版本链、一人一份 active）、`plan_items`（action / network_need / info / event）、`plan_log`（进展记录，`(workspace, actor, idempotency_key)` 唯一）、`plan_commands`（命令回执）、`plan_match_jobs` / `plan_match_candidates`（候补管线，rule + ai，pending / accepted / dismissed）、`network_analysis_snapshots`（`origin = plan` 的共享快照）、`ai_usage_ledger` / `ai_usage_calls`（两池配额 + 成本子账）。

v2 的取舍：

| v2 概念 | 放在哪里 | 为什么 |
| --- | --- | --- |
| 一个目标的一份计划 | `plans` 一行，`model_version = 2`，`goal_id` = 来源 intake 的 id | 复用 actor 隔离、复合外键、advisory lock；一个目标一行，生命周期内**原地更新**（§9 自定决定 1） |
| 見立て · 結論 · 引用 · 配点理由 | `plans.analysis`（`schemaVersion: 2`） | 现有 jsonb 列，v1 / v2 用 `schemaVersion` 区分 |
| Step | `plans.phases`（`schemaVersion: 2` 的元素：`key, title, doneCriteria, why, personTypeKeys[]`），不含周次；**完成状态不写进 phases**，由 `plan_log` 的 `step_completed` / `step_reopened` 推出 | 完成和撤回是用户日常操作，写进方案内容会推进 `revision`，打断进行中的見直し草稿（§3.2 第 9 条） |
| 人物类型 | `plan_items.kind = 'network_need'` 一行一类；新列 `allocation`、`skipped_at`、`type_slot`；`criteria.targetCount`（已有，1–5）；长文本放 `meta.personType` | 本质就是「某类人脉需求 + 目标人数」，候补管线、人脉覆盖度（W0050）的数据形状不用改（读取入口要换，见 §3.6） |
| イベント枠 | `plans.event_allocation`、`plans.event_target_count`；参加过的活动仍是 `plan_items.kind = 'event'` | 枠本身没有活动 id，放进 items 会违反 `kind <> 'event' or linked_event_id is not null` |
| 前提 | `plans.premise`（行数组：`key, label, value, source: 'background' \| 'q1'..'q5' \| 'record', guessed`） | 前提只属于这份计划；見直し时改它 |
| 背景、题目、回答 | 新表 `plan_intakes` | 生成前就要存，`plan_items.kind = info` 承载不了 |
| 初版和修正中的草稿 | 新表 `plan_drafts`（`kind: 'initial' \| 'review'`） | 确定前不进 `plans`，首页、分数、维护任务都看不到半成品 |
| 确定后的每次改动 | 新表 `plan_revisions`（before / after / changes / 来源） | 原地更新也要留痕，「元に戻す」和审计都靠它 |
| 计分 | `plan_log` 新事件（§4）；不建分数表 | 分数 = 计分记录之和，撤销 = 对冲记录 |
| 月度见直次数 | `plan_log` 幂等键 `review:<YYYY-MM>:<n>` | 沿用 W0012 的「唯一键计数法」 |
| 业界现状库 | 代码里的版本化内容（`features/plans/landscape/`），不建表 | §6，§9 自定决定 4 |

### 3.2 迁移一：`plans` 模块 v2「plans-v2-model」（R22，本机验证；生产另行授权）

一个迁移、一个事务（写法同 `features/plans/migrations.ts`：advisory lock + checksum，只追加）：

1. `plans` 加列：
   - `model_version smallint not null default 1 check (model_version in (1, 2))`
   - `goal_id text`；`goal_kind text check (goal_kind is null or goal_kind in ('launch','fundraising','sales','hiring','partnership','career'))`
   - `purpose_text text`（目的の階段选中的那一级）、`purpose_level smallint check (purpose_level is null or purpose_level between 1 and 4)`
   - `premise jsonb check (premise is null or jsonb_typeof(premise) = 'array')`
   - `event_allocation smallint check (event_allocation is null or (event_allocation between 0 and 100 and event_allocation % 5 = 0))`、`event_target_count smallint check (event_target_count is null or event_target_count between 1 and 10)`
   - `revision integer not null default 1 check (revision >= 1)`（v2 原地更新的乐观并发）
   - `manual_edit_available boolean not null default false`
   - `achieved_at timestamptz`、`last_opened_at timestamptz`
   - `check (model_version = 1 or (goal_id is not null and goal_kind is not null))`
2. 放宽 `horizon`：drop `not null` 和旧 CHECK，加 `check ((model_version = 1 and horizon in ('month','quarter','year')) or (model_version = 2 and horizon is null))`（按定义找约束名，不依赖默认名，写法同 `plan-matching-plan-source`）。`starts_on` 不动（v2 = 确定日）。
3. 唯一索引：drop `plans_one_active_per_actor`，建 `plans_one_active_per_goal on plans (workspace_id, actor_id, coalesce(goal_id, 'legacy')) where status = 'active'`。服务层另加「同时生效的 v2 目标 ≤ 2」（Q6 Free），在按人串行的事务里检查。
4. `plan_items` 加列：`allocation smallint check (allocation is null or (allocation between 0 and 100 and allocation % 5 = 0))`、`skipped_at timestamptz`、`type_slot text check (type_slot is null or length(type_slot) between 1 and 40)`；加 `check (skipped_at is null or kind = 'network_need')`。`criteria` 的 CHECK 不动。
5. 新表 `plan_intakes`：`workspace_id, id, actor_id, source ('task','onboarding','next_goal','iorbit'), goal_text, goal_kind, status ('drafting','background','questions','premise','drafted','planned','abandoned'), background jsonb（me / team / purpose 三块：下书值、确认值、确认时间）, ladder jsonb, questions jsonb（题 id 列表 + 选题理由 + 缓存键）, answers jsonb, premise jsonb, ai_steps jsonb（每个 AI 步骤的状态机：none / started / succeeded / failed、operationId、次数）, plan_id, created_at, updated_at`；复合外键 `(workspace_id, actor_id, plan_id)` → plans；部分索引「每人未完成的 intake」。手写成员只存在 `background.team` 里（`{name, relation, capabilities[], contactId?}`），**不建联系人**。
6. 新表 `plan_drafts`：`workspace_id, id, actor_id, kind ('initial','review'), intake_id（initial 必填）, plan_id（review 必填）, base_revision（review 时的 plans.revision）, status ('open','confirmed','discarded'), content jsonb（完整方案，形状 = 契约 `PlanV2Content`）, origin_content jsonb（AI 方案，「元に戻す」用）, ai_fix_used smallint check (between 0 and 3), manual_edit_used boolean, turns jsonb（每轮：用户输入、差分、不改理由、operationId）, premise jsonb, created_at, updated_at, confirmed_at`；每个 plan 同时最多一份 open 的 review 草稿（部分唯一索引）。
7. v2 计划行怎么满足现有约束：`version` = 本人所有计划（v1、v2、各目标）里最大版本号 + 1（满足 `unique (workspace_id, actor_id, version)`，在按人串行的事务里取）；`goal_snapshot` = 目标文；`starts_on` = 确定那天（东京日）；`previous_plan_id` 留空（v2 不走版本链）；`creation_key` = 草稿 id（重复确定只建一份）。
8. **已达成**：`status = 'archived'` + `achieved_at` 非空（加 `check (achieved_at is null or (status = 'archived' and model_version = 2))`）。这样所有按 `status = 'active'` 读的地方（候补管线、引导、覆盖度、`goalRelated`）自然不再把它当生效计划，候补任务也停；列表里「完了した目標」= v2 且 `achieved_at` 非空，「以前のプラン」= v1 已归档。不新增状态值，免得放宽 `status` 的 CHECK。
9. **`revision` 什么时候 +1**：只在方案内容改变时——見直し确定、手动编辑确定、目标编辑保存。计分、撤销、跳过 / 撤回、Step 完成 / 撤回**不带** `expectedRevision`、不推进 `revision`，正确性靠幂等键和按人串行的事务。見直し / 手动编辑确定时，用「确定那一刻」的已得分重新跑 `reallocate` 的约束（配点 ≥ 已得、人数 ≥ 已计入、已跳过不改配点），不满足就让用户回到差分页调整；`base_revision` 不等于当前 `revision`（别的设备刚改过方案）→ 409，提示「別の端末で変更されました」。
10. 新表 `plan_revisions`：`workspace_id, id, actor_id, plan_id, from_revision, to_revision, source ('review','manual_edit','goal_edit','undo')（Step 完成不改方案、不进这张表，见 §3.1）, draft_id, before jsonb, after jsonb, changes jsonb, created_at`；`unique (workspace_id, plan_id, to_revision)`。
11. 新表 `plan_flow_commands`（生成流程的命令回执，形状同 `plan_commands`，但不要求 plan_id）：`workspace_id, actor_id, idempotency_key, kind, intake_id, draft_id, fingerprint (sha256 hex), outcome ('applied','noop'), response jsonb, created_at`，主键 `(workspace_id, actor_id, idempotency_key)`；同一键不同指纹 → 409。

### 3.3 迁移二：AI 账本用途「ai-usage-plan-v2-purposes」（R22，本机验证；生产另行授权）

`features/network-analysis/migrations.ts` 追加一个版本：放宽 `ai_usage_ledger.purpose` 的 CHECK。账本的「一次操作最多几次 HTTP」（`max_calls`）是**按用途**取的（`ledger.ts` 写库时取 `AI_QUOTA_MAX_CALLS[purpose]`），所以每种上限不同的调用用一个自己的用途，不改账本函数：

| 新用途 | 调用 | `max_calls` |
| --- | --- | --- |
| `plan_intake` | C1 目标类型推测、C3 成员能力、C4 阶梯重算、C5 選題、C10 次の目標 | 1 |
| `plan_background` | C2 背景下書き（含 1 次修复） | 2 |
| `plan_draft` | C6 初版（初版 + 修复 + 顺带快照） | 3 |
| `plan_revise` | C7 生成中的 AI 修正（含 1 次修复） | 2 |
| `plan_review_mark` | C8 見直し前提预标 | 1 |
| `plan_review` | C9 見直し修正案（含 1 次修复） | 2 |
| `event_assessment` | R26 活动评估（同一个人负责，合进这次放宽，免得再授权一次；`max_calls` 由 R26 定） | — |

`mail_summary` 不加（Q5 首期不做）。现有 `plan`（v1 生成，4）不动。同步改 `features/ai-quota/constants.ts` 的 `AiQuotaPurpose` / `AI_QUOTA_PURPOSES` / `AI_QUOTA_MAX_CALLS`，新增月度上限常量与按月计数（§5.3）。

`AiQuotaPurpose`（MEDIUM，35）只加值；`createPostgresAiUsageLedger`（**CRITICAL**，80）只新增一个「按用途、按东京月计数」的方法，已有方法（含 `reserve`）的签名和行为不变。

### 3.4 共享常量与纯函数（`shared/compute`，两端同步）

- `shared/compute/plan-templates.ts`：6 类目标各自的 ① 「必要な力」8 项 id、② 题库（6–8 问的 id、题型 single / multi、选项 id、默认顺序）、③ 配点模板（枠 id、默认配点、默认人数，含イベント枠，每类合计 100）、④ 枠 × 行业的固定短名字典（每枠一个通用短名 + 主要行业的覆盖项）、⑤ 目的の階段与选题的规则常量（≤5 问、±5 最多 2 处）、⑥ 目标类型推测的关键词表（C1 失败时用）。数值与 b10 规范板一致。**只放 id 和数字**，三语文字放同目录的 `plan-template-copy.ts`（§3.5）。
- `shared/compute/plan-score.ts`：§4 的计分函数（`nextAward`、`summarizePlanScore`、`reallocate`）。
- `shared/compute/plan-allocation.ts`：手动编辑与見直し的配点回流（从配点最高的枠按 5 分增减，同分按模板顺序；人数 × 单价之和 = 配点，余数给最后 1 人）。
- 放 `shared/compute` 而不是 `shared/domain`：App 同步白名单对 `shared/compute` 整目录放行，对 `shared/domain` 只放两个字典（`sync-contract.mjs`）；放这里不用改热点文件和 `AGENTS.md`。纯常量和纯函数符合 `shared-compute-audit` 的规则（不碰 IO、网络、时钟；「今天」由调用方传入）。

### 3.5 文案

- 题库题干与选项、必要な力、短名字典、枠名、目的の階段固定说明：三语，放 `shared/compute/plan-template-copy.ts`（零 import 常量）。不放 `shared/copy/{ja,zh,en}.ts`：那三个文件只放导航、按钮、状态等通用说法，题库会让它膨胀数倍，`copy:qa` 的 kind 规则也不是为题干设计的；放 `shared/compute` 则 App 整目录同步，不用改 `sync-contract.mjs`（热点文件）。这个文件加进 `copy:qa` 的检查范围（按「题干 / 选项 / 标签」三种 kind）。
- **题库选项由谁写**：设计稿只有题干（和上市・収益化 R1–R7 的部分选项）。其余选项、6 类的必要な力名称、短名字典由 R22 执行会话撰写，按 R03 的翻译流程（三语 → 自动检查 → 独立审校）定稿，结果写进 R22 REPORT 请产品负责人过目。
- AI 生成的方案文字：用**生成时的界面语言**输出，之后切换语言不重新翻译（对标 ChatGPT / Notion AI）。前提、问题、短名这些模板文字随界面语言切换。
- 业界现状库条目：标题和要点三语，出处保持原文。

### 3.6 旧计划兼容

- 读：`resolvePlanService`（**CRITICAL**，50）只加 `model_version` 分支读取，不改 v1 行为；v2 走新入口 `createPlanV2Service`（复用 repository 的事务与锁）。`getCurrent` / `getCurrentView` 只返回 v1 生效计划（v2 计划对它们不存在）。
- **`getCurrent()` 的消费方分两类处理**（文本确认的完整清单，R22 开工时再核一次）：
  - **只认 v1 的旧界面与旧流程**——R25 删除或改造，返回 null 没关系：`app/(app)/app/agent/plan/plan-route-view-model.ts`、`agent/iorbit-0918/iorbit-plan.tsx`、`agent/strategy/page.tsx`、`features/plans/reanalysis.ts`（到期回顾）、`features/plans/bootstrap.ts`（第一份计划）。
  - **要同时认 v2 的服务**——改走 R22 新的只读函数 `readActivePlanNeeds(actorId)`：返回本人**所有生效计划**（v1 + v2 各目标）的人脉需求 / 人物类型（`itemId, planId, modelVersion, criteria, targetCount, contactLinks, skipped`），多目标**合并**（对标 Notion 多项目视图默认合并显示；人脉分析看的是「我现在需要哪些人」，不分目标）：`features/plans/coverage.ts`（W0050 覆盖度与机会标签）、`features/network-analysis/{runtime,input-source,service}.ts`（快照的计划输入）、`app/(app)/app/contacts/analysis/{overview-cockpit-loader,structure-tab-model,structure-tab-loader,opportunities-route-service}.ts`（人脉分析三个标签）、`features/plans/contact-plan-context.ts`（联系人详情的计划说明）、`features/plans/matching-service.ts`（候补；v2 需求接受时不生成「约 TA」，§2.7）、`features/guide/progress.ts`（引导：任一生效即完成）。
  - R22 SC-R22-06 用 v2 种子计划断言：覆盖度、快照的计划输入、人脉分析结构 / 机会标签、联系人详情的计划说明都仍有数据。
- 写：v1 的读写把 v2 计划当「不存在」（读返回 null、改条目 404，与「别人的计划」同一口径；R22 实现，见 R22 REPORT 自定决定 1）；v2 接口收到 v1 计划 id 同样 404。只有「生成新的 v1 生效计划」返回 409 `V2_PLAN_ACTIVE`：`bootstrap` 在调生成器之前就检查（不花 AI），v1 仓储写入前再兜底一次。
- **v1 的创建入口在 R25 关闭**：`POST /api/agent/plans/bootstrap`、`POST /api/agent/plans`（v1 生成）、`POST /api/agent/plans/reanalyze` 对所有人返回 409 `PLAN_V1_RETIRED`，响应带 v2 入口地址（Task › プラン 的目標入力）；旧引导（`/app/start`、`/app/profile/onboarding` 的生成步骤，R28 重写前）里的「生成计划」改为跳到同一入口。这样无论 R28 何时完成，合回后不会再有人生成 v1 计划。
- 引导第 3 步「有生效计划」（`features/guide/progress.ts` 的 `configuredHasActivePlan`，文本确认只在本文件两处调用）：v1 或 v2 任一生效即完成。
- 人脉覆盖度（W0050）：v2 人物类型就是 `network_need`，读取入口改走合并读取（上一条）。
- 候补管线（`plan_match_*`）：**R22 先把 v2 排除在外**（不入队、不读 v2 需求、不花 AI；R22 复核 S1），**R24 接入**：v2 版「接受候补」（只关联、不生成「约 TA」）、确定计划时入队 `plan` 来源匹配任务、排除已跳过的类型，然后去掉匹配查询里的 `model_version = 1`。
- 共享快照：v2 初版的那次操作照旧按 `decideSnapshotRefresh`（HIGH，13）判断要不要顺带生成 `origin = plan` 的人脉分析快照（只调用，不改函数）。

## 4. 分数怎么算（`shared/compute/plan-score.ts`）

### 4.1 口径（设计定稿，不改）

- 满分 100 = 各人物类型配点 + イベント枠配点（5 分一档，合计 100）。**不封顶**，直到用户点「目標を達成した」。
- 同一个人在同一类型下只计一次；面谈记录、自报线下聊过都算。
- 单价 = 配点 ÷ 目标人数取整，余数由最后 1 人补齐（人数 × 单价之和 = 配点）。
- 超过目标人数后，每人加「当前单价 ÷ 2 向下取整」，不封顶。
- 不填名字的自报：只算到目标人数为止，不享受超额半分。
- 跳过 = 该类型记满额（扣掉已得的部分），斜纹区分，可撤回；跳过期间这个类型的新记录不再加分。
- イベント：参加 1 次 = 一个单价（`event_allocation ÷ event_target_count`），满额后半分。
- 没有成果加分。

### 4.2 记账方式：分数 = 计分记录之和

旧方案 D-04 是「读时从 `contact_links` 推算」。我改成「**加分时用纯函数算好分值，写进 `plan_log`，概要读时求和**」。原因：设计要求「見直し / 手動編集只重分『まだの点』，已得分不变」。如果分数永远从当前配点推算，改一次配点，过去的分就跟着变了。把每次加分的分值记下来，过去的分就固定了；撤销 = 写一条对冲记录，和 D-04 的撤销口径一致。仍然不建分数表（`plan_log` 本来就是这份计划的账本）。

`plan_log` 新事件（`event` 列无 CHECK，常量在 `features/plans/contract.ts` 追加）：

| 事件 | payload | 幂等键 |
| --- | --- | --- |
| `score_awarded` | `{ typeKey \| 'event', contactId?, anonymous?, eventId?, basis: 'talked' \| 'self_report' \| 'memo' \| 'event' \| 'skip', part: 'base' \| 'overflow', points }` | `score:<planId>:<typeKey>:<contactId>`（有名字）/ `score:<planId>:<typeKey>:anon:<客户端键>` / `score:<planId>:event:<eventId>` / `skip:<planId>:<typeKey>:<n>` |
| `score_reversed` | `{ awardLogId, reason: 'undo' \| 'unskip' }` | `reverse:<awardLogId>` |
| `type_skipped` / `type_unskipped` | `{ typeKey }` | 客户端键 |
| `step_completed` / `step_reopened` | `{ stepKey }` | `step:<planId>:<stepKey>:<n>`（n 递增，撤回后可再完成） |
| `plan_revised` | `{ revisionId, source }` | 草稿 id |
| `review_used` | `{ draftId, month }` | `review:<YYYY-MM>:<n>`（n = 1..月上限，§5.3） |
| `goal_achieved` | `{ total }` | `achieve:<planId>` |

「同人同类型一次」由幂等键唯一约束兜底（撤销后再记，用 `score:<planId>:<typeKey>:<contactId>:<n>` 递增 n，服务层取第一个空位）。

这些记录满足 `plan_log` 现有约束：`kind = 'auto'`；`author` = `user`（用户操作）或 `system`（活动签到同步）；`body` 是一句给人看的模板文字（生成时的界面语言，如「VC パートナー：高橋さん +10」「CFO Night に参加 +5」，1–2000 字）。

### 4.3 纯函数

```ts
// 下一次加分的分值（两端共用；App 用它做「+10」预告，服务端用它落账）
nextAward(input: {
  allocation: number;            // 该类型当前配点（5 的倍数）
  targetCount: number;           // 目标人数 1–5（イベント 1–10）
  awarded: readonly { part: 'base' | 'overflow'; points: number; anonymous: boolean }[]; // 未被对冲的记录
  skipped: boolean;
  anonymous: boolean;
}): { part: 'base' | 'overflow' | 'none'; points: number; reason?: 'skipped' | 'anonymous_over_target' };

// 概要、首页组件、小组件用的汇总
summarizePlanScore(input: { types: …; event: …; awards: …; achievedAt: string | null; todayTokyo: string }): PlanScoreView;

// 配点回流（手动编辑、見直し、移除类型）
reallocate(input: { slots: …; change: …; templateOrder: … }): { slots: …; moves: …[] } | { error: 'below_earned' | 'skipped_locked' | 'not_multiple_of_5' | … };
```

- **单价的「まだの点」口径**：`remainingAlloc = allocation − 已得 base 分`，`remainingSlots = targetCount − 已计入 base 的人数`；下一个 base 的单价 = `floor(remainingAlloc / remainingSlots)`，最后一个 slot 拿余数。配点未改时这和「配点 ÷ 人数、余数给最后 1 人」完全相同；配点改了，过去的分不动，只重分剩下的。
- **超额单价** = `floor(allocation / targetCount / 2)`（用当前配点与人数；b10：15 ÷ 2 人 → 单价 7，超额 3）。
- **配点修改的约束**（`reallocate` 与服务端校验共用）：新配点 ≥ 该类型已得 base 分；新目标人数 ≥ 已计入的人数；已跳过的类型不能改配点（先撤回跳过）；有得分的类型不能移除；合计必须 100。
- **今日 +N** = 东京自然日内 `score_awarded` 减 `score_reversed` 之和。
- 时区：沿用全产品的东京日（`tokyoUsageDay`），「今天」由调用方传入，函数本身不读时钟。

### 4.4 表驱动测试（R22 必须覆盖）

同人同类型一次（重复记 → noop）；余数给最后 1 人（15 ÷ 2 → 7 + 8）；超额半分向下取整（不封顶）；匿名只到目标人数；跳过记满额（含已得部分）与撤回；跳过期间记录不加分；改配点后过去的分不变、剩余重分；降配点低于已得 → 拒绝；移除有分类型 → 拒绝；イベント满额后半分；达成后不再累加；今日 +N 跨东京零点；撤销对冲后可重新记。

## 5. AI 调用

### 5.1 共同规矩（所有调用都适用）

- **模型**：`deepseek-v4-flash`（与现有计划、快照、memo 提取相同），走 `deepseekJsonChat`（HIGH，7；只新增调用点，不改函数），JSON 输出，超时 60–90 秒。
- **账本**：每次操作 `reserve`（池、用途、触发、幂等键、`max_calls`），每次 HTTP 前 `beginCall`、后 `endCall`。失败的操作**不计用户看得到的次数**（修正次数、見直し次数）；但只要有 HTTP 响应，账本记 `failed`，仍占计划流程日上限与各用途月上限（按成本口径计；没有任何响应时才是 `released`）。（R23 复核 m11 改写）
- **live 未配置 AI**（`ORBIT_PLAN_V2_AI` 不是 `ai`，或没有密钥 / 账本）：每一步都按「不可用」处理——C1 / C3 / C4 / C5 规则、C2 规则下书、C6 / C7 失败卡。**live 下绝不用 mock 生成内容**（会变成用户的正式计划）；mock 只在 mock 模块模式（演示世界）下使用。上线 v2 时要同时打开开关（属于部署授权）。（R23 复核 M6）
- **mock 先行**：每个调用都有确定性的 mock 生成器（输入相同 → 输出相同，内容来自演示世界）。开关 `ORBIT_PLAN_V2_AI`（`mock` 默认 / `ai`）；**获得授权前一律 mock**；本机验证期每项真实调用 ≤5 次，次数记在各 Sprint 的 REPORT（含 operationId 和成本子账）。
- **id 不出境**：联系人、活动只用短期别名（C1… / E1…）给模型，回来后反向映射；输入里没有的别名整条丢弃并记日志（沿用 `ai-generator.ts` 的做法）。
- **校验**：每个输出先过 zod（严格，未知字段丢弃）再过业务校验；不合格 → 同一操作内最多 1 次修复重试（计入 `max_calls`），仍不合格 → 按该调用的「失败降级」处理。
- **幂等**：每个触发 AI 的请求都带客户端 `idempotencyKey`；回执存 `plan_flow_commands`；同键重放返回已保存的结果，不再调 AI；同键不同内容 → 409。每个 AI 步骤在 `plan_intakes.ai_steps` / `plan_drafts.turns` 里有状态机（none → started → succeeded / failed），只有 none 和用户主动「もう一度」的 failed 才发起调用。
- **语言**：输出用请求时的界面语言。
- **依据**：每个 AI 输出都带 `basis[]`（引用的前提行、业界条目、记录 id），界面「?」展开。

### 5.2 逐项清单

池：U = 用户主动池（每人每日 10 次总熔断）；U* = 用户主动池里的「计划生成流程」，有自己的日上限、**不占** 10 次总熔断（§5.3）；B = 后台池（每日 60 次）。「月上限」是本设计新增的每用户每月上限（§5.3），用来封住成本；超出时按「失败降级」处理并提示，不报错。

| # | 调用 | Sprint | 触发 | 输入 | 输出 | 校验 | 失败降级 | 用途 / 池 / max_calls | 幂等键 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 目标类型推测 | R23 | 目标输入停顿 800ms 且 ≥6 字；同文不重调；每人每东京日最多 20 次（这时还没有 intake） | 目标文 | `goalKind` + 置信 | 6 类之一 | 关键词规则（`plan-templates` 的词表）→ 默认 `launch` | plan_intake / B / 1 | `goal-kind:<sha(目标文)>` |
| C2 | 背景下書き（①） | R23 | 「iOrbit と具体化する」 | 资料（姓名、职种、公司）、目标文、目标类型、标「共同創業者」等的联系人别名及其名片字段与面谈记录摘要（≤5 人）、该类型必要な力 8 项 | わたし（立场、やりたいこと）、チーム（成员别名 × 能力 id 勾选）、目的の階段 4 级 + 建议级 + 理由 | 能力 id ∈ 8 项；阶梯第 2 级 = 原文；建议级 ∈ 1–4；别名 ∈ 输入 | 规则下书：わたし 只填资料、立场空；チーム 只有自己、全不勾；阶梯只放原文在第 2 级、不给建议；提示「下書きできませんでした · 自分で選べます」+「もう一度」 | plan_background / U* / 2 | `intake:<intakeId>:background:<n>` |
| C3 | 成员能力推定 | R23 | 「人脈から選ぶ」选中成员 | 被选联系人的名片字段、面谈记录摘要（别名）、8 项能力 | 每人勾选的能力 id + 一句依据 | 能力 id ∈ 8 项 | 全不勾，用户自己点 | plan_intake / B / 1（一次最多 5 人） | `intake:<id>:members:<sha(联系人集合)>` |
| C4 | 目的の階段重算 | R23 | 改「やりたいこと」并确认；每 intake ≤3 次 | 目标文、新的やりたいこと、チーム摘要 | 阶梯 4 级 + 建议级 | 同 C2 | 保留原阶梯 | plan_intake / B / 1 | `intake:<id>:ladder:<sha(やりたいこと)>` |
| C5 | 選題 | R23 | 「この背景で質問へ」 | 目标类型、确认后的背景摘要（含空き）、资料、面谈记录摘要、题库该类全部题 id 与题干 | ≤5 个题 id（有序）+ 每题「为什么问」+ 不问的题及原因 + 能从背景推出的答案（标「推測」） | 题 id ∈ 题库该类；≤5；无重复 | 规则选题：按模板默认顺序，去掉背景已能回答的题，空白相关题前移，取前 5 | plan_intake / B / 1 | `questions:<goalKind>:<sha(背景规范化摘要)>`（**跨用户不共享**，按人缓存；同类同背景 → 同题同序） |
| C6 | 初版（④） | R23 | 「この前提で初版をつくる」；改前提后重做 | 系统方针 v4 + 该类目标模板（Step 型、枠、默认配点、短名候选表）+ 业界现状库里**已发布且 12 个月内**的条目（按目标类型、行业筛选，≤12 条）+ 确定的前提 + 背景 + 联系人别名（裁剪 ≤200，沿用 `input-selector`） | `PlanV2Content`：見立て、結論、Step（≤7，目安可数）、人物类型（枠、短名 id、役割×状況、配点、人数 1–5、why、聞くこと 3 問、判定、見分け方、人物像、開口一番、紹介ルート `[{ viaAlias, why }]`）、イベント枠、引用 `[{id, version}]`、配点调整理由 | 短名 ∈ 字典；配点 5 分一档、合计 100；相对模板 ±5 且最多 2 处；人数 1–5；引用存在、已发布、≤12 个月；文中 ①② 对应引用；没有引用的结论不得带数字；紹介ルート的别名 ∈ 输入、描述不带人数 | 1 次修复重试；仍失败 → 不保存任何东西，错误卡「初版をつくれませんでした · 何も保存していません」+「もう一度」（不计次） | plan_draft / U* / 3（初版 1 + 修复 1 + 快照 1） | `draft:<intakeId>:<premise 版本>` |
| C7 | AI 修正（②） | R23 | 生成流程里提交修正；每份草稿 ≤3 次，不改也计 | 当前草稿 content、前提、用户这次的话、前几轮摘要、引用条目 | 差分 `changes[]`（路径、旧、新、理由）+ `unchanged[]` + `noChangeReason?` | 只改允许的路径；已得分规则（草稿阶段为 0，不触发）；配点合计 100；短名 ∈ 字典 | 不计次，提示「修正できませんでした · 回数は減っていません」 | plan_revise / U* / 2 | `fix:<draftId>:<n>` |
| C8 | 見直し・前提预标 | R25 | 打开見直し；每份计划每东京日最多 1 次，结果缓存当天 | 前提、确定以来的面谈记录 / 自报 / 活动 / Step 完成（别名） | 可能变化的前提行 key + 依据记录 id + 建议值 | 行 key ∈ 前提；依据 ∈ 输入 | 不预标，前提照常可改 | plan_review_mark / B / 1 | `review-mark:<planId>:<东京日>` |
| C9 | 見直し・修正案（③） | R25 | 「前提を送って修正案をつくる」；Free 月 3 次（全目标合计），不改也计 | 当前计划 content + 已得分（只读）+ 改后的前提 + 用户的话 + 引用条目 | 同 C7 | 同 C7，另加：配点不低于已得、已跳过类型不改配点、有分类型不移除；可以更新紹介ルート | 不计次（失败不写 `review_used`） | plan_review / U* / 2 | `review:<draftId>:<n>`；月计数 `review:<YYYY-MM>:<n>` |
| C10 | 次の目標候選 | R25 | 達成后「次の目標を決める」 | 刚达成的计划摘要、面谈记录摘要、资料 | 2 个候选（目标文、类型、依据） | 类型 ∈ 6 类；依据 ∈ 输入 | 只给「自分で決める」 | plan_intake / B / 1 | `next-goal:<planId>` |
| C11 | 面谈メモ「聞けたこと」判定（⑥） | R24 | 保存 / 更新面谈メモ，且「プランの話せた に使う」开、@ 的人是某类型的候补或已关联 | **并入现有 memo 提取调用**：现有输入 + 该类型的聞くこと 3 問 | 现有输出 + `questionCoverage[{typeItemId, answered: number[]}]` | 题号 ∈ 0–2 | 生成手动勾选卡 | memo_extraction / B / 不变（提示词版本 +1，次数不增加） | 沿用 memo 提取的键 |
| C12 | 候补推荐度与理由 | R24 | 确定计划时（`plan` 来源匹配任务）、批量名片确认时 | **现有 plan AI matcher**，输入多带 `roleSituation`、`recognizeHints` | 现有输出（strength、reason）+ `opener` | 同现有 | 只有规则层候补 | 现有用途 / B / 不变（提示词变更） | 沿用 |

不新增调用（规则或现有 AI）：「空き」判定、右栏「わかったこと」、手动编辑的配点回流、分数、今日のチャンス挑选（规则）、Step「可能已完成」确认卡（规则，§2.5）、紹介ルート（C6 / C9 顺带产出）、依頼文 / 面談提案的草稿（现有 email-draft）、会える活動的分数（`shared/compute/event-score.ts`，规则，见 §8 R26）。

### 5.3 配额与月上限

- **用户看得到的次数**（设计定稿）：初版不计；AI 修正每份草稿 3 次；見直し每人每月 3 次（Q6：所有人按 Free；全部目标合计）；手动编辑每次確定 / 見直し后 1 次；同时生效目标 2 个。
- **每月新目标数**（新的产品限制，**列入 §10 请用户拍板**）：每人每月最多新建 10 个目标（= C2 的月上限）。推荐 10：正常用户一个月建 1–3 个，10 只挡反复建了又扔的情况。
- **计划生成流程的日上限**：`plan_background` / `plan_draft` / `plan_revise` / `plan_review` 合计每人每东京日 15 次操作，**不占**用户主动池 10 次总熔断（先例：W0057 的即时洞察 `INSTANT_INSIGHT_DAILY_LIMIT` 也是自己计数、不占 10 次）。理由：一次完整生成 = C2 + C6 + C7 ×3 = 5 次，同一天做两个目标或多改几次前提就会撞上 10 次总熔断，表现为莫名失败。
- **成本上限**（按用途、东京自然月，`ai_usage_ledger` 非 released 行，`countMonthly`）：`plan_intake` 60（C1、C3、C4、C5、C10 合计；另有单步上限：C1 每日 20、C4 每 intake 3、C10 每计划 1）、`plan_background` 10、`plan_draft` 30（每个目标改几次前提重做初版也够用）、`plan_revise` 30、`plan_review_mark` 20、`plan_review` 3。
- **碰到上限时**：一律显示「上限」说明而不是失败卡——日上限「今日はここまでです · 明日また使えます」、月上限「今月の上限に達しました（来月 1 日から）」、新目标数「今月はこれ以上新しい目標を作れません」；轻量调用（C1、C3、C4、C5、C8、C10）碰到上限时静默改用规则降级（同「失败降级」列），不打扰用户。各 SC 覆盖这些提示。
- **计数并发**：月度与日度计数在按人串行的事务里先查再写；見直し再由 `plan_log` 的 `review:<YYYY-MM>:<n>` 唯一键兜底（同 W0012）。

### 5.4 待授权调用清单

成本按 `docs/designs/orbit-app/ai-cost-and-storage/2026-08-31-contact-ai-cost-storage-analysis.md` 的保守混合价（未命中输入 $0.374 / 百万 token，输出 $1.122 / 百万 token）估算，token 数是工程估计。

| # | 调用点 | 模型 | 单次估算（输入 / 输出 token → 美元） | 每用户每月上限 | 本机验证期真实调用上限 |
| --- | --- | --- | --- | --- | --- |
| C1 | 目标类型推测 | deepseek-v4-flash | 0.6k / 0.05k → 约 $0.0003 | 与 C3、C4、C5、C10 合计 60（每日 ≤20） | 5 |
| C2 | 背景下書き | deepseek-v4-flash | 3.5k / 1.2k → 约 $0.003；含修复最坏约 $0.006 | 10 | 5 |
| C3 | 成员能力推定 | deepseek-v4-flash | 2k / 0.4k → 约 $0.0012 | 同上（合计 60） | 5 |
| C4 | 目的の階段重算 | deepseek-v4-flash | 1.5k / 0.4k → 约 $0.001 | 同上（每 intake ≤3） | 5 |
| C5 | 選題 | deepseek-v4-flash | 2.5k / 0.3k → 约 $0.0013 | 同上 | 5 |
| C6 | 初版（含修复 1 次、快照 1 次） | deepseek-v4-flash | 9k / 4k → 约 $0.008；最坏（修复 + 快照）约 $0.02 | 30 | 5 |
| C7 | AI 修正（生成中） | deepseek-v4-flash | 8k / 2k → 约 $0.005；含修复最坏约 $0.01 | 30 | 5 |
| C8 | 見直し・前提预标 | deepseek-v4-flash | 4k / 0.6k → 约 $0.0022 | 20 | 5 |
| C9 | 見直し・修正案 | deepseek-v4-flash | 9k / 2k → 约 $0.006；含修复最坏约 $0.012 | 3 | 5 |
| C10 | 次の目標候選 | deepseek-v4-flash | 3k / 0.6k → 约 $0.0018 | 同 C1（每计划 1 次） | 5 |
| C11 | 面谈メモ判定（并入现有 memo 提取，提示词变更） | deepseek-v4-flash | 每条 memo 增加约 1k / 0.2k → 约 +$0.0006；次数不增加 | 不增加次数 | 5 |
| C12 | 候补推荐（现有 matcher 提示词变更） | deepseek-v4-flash | 每批增加约 0.5k 输入 → 约 +$0.0002；次数不增加 | 不增加次数 | 5 |

- 一个用户把所有上限、所有修复重试都用满，一个月最多约 **$1.2**（大头是 C6 30 次 × $0.02 与 C7 30 次 × $0.01）；正常用户（1–2 个目标、修正 2–3 次、見直し 1 次）约 **$0.05 / 月**。
- 业界现状库条目（D-06）由开发会话里的 Claude 撰写，不走产品付费接口，**不在此清单**。

## 6. 业界现状库（D-06）

- **形态：内容即代码。** `features/plans/landscape/entries.ts`（服务端常量，不同步给 App；App 只看接口返回的已解析引用）。每条：`id`（`L-101` 形式）、`version`、`goalKinds[]`、`industries[]`（`shared/domain/industries` 的 id）、`title{ja,zh,en}`、`summary{ja,zh,en}`（两行内）、`source{label, url, publishedOn}`、`updatedOn`、`status: 'draft' | 'published' | 'retired'`、`reviewedBy`（复核记录路径）、`checksum`（内容哈希，测试核对）。改内容 = 新版本，旧版本保留（已引用的计划仍能显示当时那一版）。
- **为什么不建表和管理页**：条目由 Orbit 编辑部维护、更新频率按月计、只有几十条；放在代码里自带版本历史、评审（PR / 复核文件）和回滚，省一个生产迁移和一个没有设计稿的后台页（R29 范围）。以后条目多到需要非开发人员编辑时，再迁到表里（入口只有 `landscape/store.ts` 一个读函数，换实现不影响调用方）。
- **初始内容（R23）**：6 类目标 × 4 条左右，共约 24 条，由实施会话的 Claude 撰写；**每条必须有可查证的公开出处**（官方统计、上市公司公开资料、行业协会报告、主流媒体报道），没有可靠出处的不收录，不编数字。设计稿里的示例条目（L-012 / L-031 / L-047 / L-058 / L-104 / L-117）只是示意，**不照抄**（例如「Orbit 編集部の主催者ヒアリング 24名」不是可查证的公开出处）。
- **独立审核**（Q7）：写完后由 **Codex** 只读核对事实、出处可访问、时效和三语一致；Codex 不可用时，由全新上下文的 AI 复核会话代替，并在 R23 REPORT 写明原因。结论写 `features/plans/landscape/REVIEW.md`；执行人逐条处理，审核通过的条目才改 `published`。12 个月未更新的条目自动不再被引用（读函数按 `updatedOn` 过滤，测试覆盖）。
- **引用规则**（写进 C6 的提示词和校验器）：只引用输入里给的条目；没有条目支撑的说法标「一般論」且不出数字；计划保存 `citations[{id, version}]`；库升级不改写已有计划，概要里出「新しい版があります」，要不要見直し由用户决定。

## 7. 两端界面

| 画面 | Web（主做） | App | Sprint |
| --- | --- | --- | --- |
| 目標入力（空态） | Task › プラン 段（替换插槽里「没有计划」的分支） | Task › プラン 段（替换 `PlanSlot` 的空态） | R23 |
| 生成流程（背景 / 5 问 / 前提 / 初版 / 修正 / 手動編集） | `/app/plans/flow/[intakeId]`：iOrbit 式全页 + 右栏「わかったこと」/「方案の下書き」；手動編集 `/app/plans/drafts/[draftId]/edit` | `app/plans/flow/[intakeId].tsx`（全屏、无底栏、从下推入）；`app/plans/drafts/[draftId]/edit.tsx` | R23 |
| プラン概要 | Task › プラン 段（v2 计划时） | Task › プラン 段 | R24 |
| 人物タイプ詳細 | `/app/plans/[planId]/types/[itemId]`（左 5 列 + 右 7 列） | `app/plans/[planId]/types/[itemId].tsx` | R24 |
| 面談を提案 / 依頼文 | 520 抽屉 | 底部弹层 | R24 |
| 記録・自报・跳过弹层 | Modal（380） | BottomSheet | R24 |
| 見直し | `/app/plans/[planId]/review` | `app/plans/[planId]/review.tsx` | R25 |
| 達成 / 完了 / 次の目標 | `/app/plans/[planId]/done` | `app/plans/[planId]/done.tsx` | R25 |
| 目标下拉 / 编辑 | 页签下目标行（Popover + 居中 Modal） | 目标名「▾」（BottomSheet + 动作表） | R25 |
| 以前のプラン（v1 只读） | Task › プラン 段内卡 + `/app/plans/legacy/[planId]` | 段内卡 + `app/plans/legacy/[planId].tsx` | R25 |

- **两端路径完全相同**：Web `app/(app)/app/plans/**/page.tsx` 与 App `app/plans/**.tsx` 一一对应（同样的段名和参数名），App 的 `route-parity` 测试按同一路径比对，不需要例外。Web 前缀 `/app/plans/**`（新，`ORBIT_PRIVATE_APP_PREFIXES` 登记；`shellNavKeyFor` → Task）。不用 `/app/tasks/plan/**`，避免和 `/app/tasks/[id]` 混淆；不用 `/app/agent/plan/**`，那是 R25 要删的旧地址。
- **版式**：Web 1440 按 web.html / b10 / b4；1024 与 390 按 b8「2 · Task › プラン」（见 §2.5）；生成流程、人物类型详情在 1024 / 390 没有专门画板，按 b8 的通用断点规则（1024 右栏收成抽屉、390 单列）。截图对照页里 1024 / 390 的左列用 b8 画板，没有画板的写「按断点规则」。
- App 新路由走 HOW-TO §7 的 4 处登记；`parentForPath` 全部回到 Task（`seg=plan`）；全部 `online-only`（生成和计分都要联网；Task › プラン 段离线时显示「オフラインでは見られません」）。
- 组件只用 R04 / R06 组件库（AI 类的确认卡、Toast、BottomSheet / Drawer、States）；业务组件（构成条、分数大数字、人物类型卡、差分卡、前提卡、配点表）由 R23 / R24 在各自目录新建，两端规格同源（b10 / b4）。
- 演示世界：R22 把 `DEMO_PLAN` 改成 v2 形状（`goalKind` 用 6 类之一；人物类型带配点、人数、跳过；イベント枠），引导示例模式的计划概要读它（`sample: true`，写操作拦截）。

## 8. 与其他 Sprint 的接口（谁等谁）

原则：**R22 第一天先提交契约**（`plan-v2.ts` 定稿 + schema + mock），乙负责的 Sprint 从那天起按新形状接 mock；live 接口按 Sprint 收口时间陆续可用。所有接口都是只加不改；对方没做完时，按 HOW-TO §4 / §5 隐藏入口或空态，不阻塞。

| 对方 Sprint | 对方要用的 | 契约（R22 定稿，写在 `shared/contract/plan-v2.ts`） | 谁等谁 |
| --- | --- | --- | --- |
| **R10 首页**（乙）「プラン スコア」组件、小组件（R19） | 当前目标的分数、构成条、今日 +N、空态 | `GET /api/agent/plans/v2/summary` → `PlanV2SummaryResponse { current: PlanV2HomeSummary \| null; goals: PlanGoalListItem[] }`；`PlanScoreView { total（不封顶）, talked, skipped, overflow, remainingToFull, todayDelta, segments[{key, shortLabel, emoji, allocation, earned, overflow, skipped}] }`；`current = null` → 组件显示「目標を決める」空态，点进 `/app/tasks?tab=plan` / App `task?seg=plan` | R10 用 mock 开发，不等；live 在 **R22 收口**后可用。R08 草案里 `total ≤ 100` 改为不封顶，`byType` 改为 `segments`（`@draft` 文件，R22 在 `BREAKING.md` 登记） |
| **R11 人脈**（乙）`goalRelated` 筛选、联系人详情的「プランで」说明、联系人页上的「符合人物类型？」确认卡（b9 招待 ③） | 和生效目标有关的联系人；某人在哪个类型下被推荐；对待确认的候补 ✓/✕ | 服务端函数 `planGoalRelatedContactIds(actorId)`（R22，供 R11 的 live 实现调用）；`GET /api/agent/plans/v2/contacts/[contactId]/fit` → `PlanContactFit[] { planId, goal, typeItemId, shortLabel, recommendScore, reason, state: 'candidate' \| 'linked' \| 'talked' }`（R24）；`state = 'candidate'` 时联系人页画虚线确认卡，✓/✕ 调 R24 的候补决定接口 | R11 不等：没有时筛选参数照旧忽略、详情不显示这一块；接上即可。人脉覆盖度、人脉分析经 `readActivePlanNeeds` 认 v2（R22，§3.6） |
| **R20 Task**（乙）メモ「プランの話せた に使う」、判断待ち、「挂在人物类型下的 To-do」 | 写 `NoteContract.usedForPlan`（R08 契约 5 已有）；判断待ち里列计划的待确认项（可选）；To-do 可以挂到某个人物类型 | R24 消费 `usedForPlan` + @人 触发 C11；`GET /api/agent/plans/v2/pending` → `PlanPendingItem[] { kind: 'score_proposal' \| 'step_done' \| 'candidate', planId, href, title }`（R24）；契约 10 `TaskItemContract` 加可选 `planLink?: { planId, typeItemId }`（**R22 第一天的契约提交里一起加，只加不改，事先征得乙同意**；R20 负责落库和读写），R24 的人物类型详情显示带 `planLink` 的任务 | R24 不等：用现有笔记接口和测试数据验证 C11；R20 的开关上线后端到端接通；R20 未落库 `planLink` 时「やること」一块不显示。R20 的判断待ち接不接 `pending` 由乙决定 |
| **R21 iOrbit**（乙）会话列表、「プランを見直したい」、执行后确认卡「プランで見る」与「プランに追加」 | 跳到计划的深链；生成流程能不能出现在会话列表；把 iOrbit 建的任务挂到人物类型下 | 深链（两端同路径）：`/app/tasks?tab=plan&plan=<planId>`（App `task?seg=plan&plan=…`）、`plans/<planId>/types/<itemId>`、`plans/<planId>/review`、`plans/flow/<intakeId>`（R22 在 `shared/compute/plan-href.ts` 导出构造函数）；`GET /api/agent/plans/intakes?status=open` → 未完成的生成流程（R23），R21 可把它们作为「プランを作る」行列在会話リスト；「プランに追加」= 建一个普通 To-do 并带 `planLink`（见 R20 行） | 互不阻塞。R21 用深链即可；会话列表要不要列未完成流程由乙决定（只加不改）；`planLink` 未落库前确认卡只给「プランで見る」 |
| **R26 / R27 活动**（甲） | 活动「参加予定に追加」写进计划；评分 ① 用「剩余目标人数」；参加后回写分数 | R22：服务方法 `addEventToPlan({ planId?, eventId })`、`planRemainingTargets(actorId)`、`recordEventAttendanceForPlans(actorId, eventId)`（给每个有イベント枠的生效 v2 目标各记一次，§2.7）；R24：`shared/compute/event-score.ts`（5 项固定标准 45/15/20/10/10，① 按剩余目标人数和配点加权，事实取不到的项降「推定の確度」）+ 库内活动的规则事实；**R24 同时把 R08 契约 8（`event-assessment.ts`）的 5 项改成设计稿规范板的键名和满分**（`fit 45 / confidence 15 / timeCost 20 / connections 10 / format 10`，现为 `goalFit / people / timing / cost / followUp` 各 0–20），`BREAKING.md` 登记，评分只有一种形状 | R26 在 R24 之后做：沿用 `event-score.ts` 和改好的契约 8，补 AI 评估事实（URL / 海报），不重写公式 |
| **R28 引导**（负责人待定）「生成计划」那一步（归属表记作第 4 步，即首页「はじめの 3ステップ」的第 3 步） | 从引导开始生成流程；判断这一步做完了 | `POST /api/agent/plans/intakes { goalText, goalKind?, source: 'onboarding', idempotencyKey }` → `{ intakeId, href }`（R23）；完成判定 = `features/guide/progress.ts` 的「有生效计划」（R22 改为 v1 或 v2 任一） | **R28 等 R23** 收口；R22 先把完成判定改好 |
| **R15 招待コード**（甲） | 对方加入后「AI 推测符合人物类型 → 虚线确认」 | 复用候补管线：新联系人入队 `plan_match_jobs`（规则 + C12），候选出现在人物类型详情；不另开接口 | R15 不等计划；计划在时自然出现候补 |

依赖图（无环）：R22 → R23 → R25；R22 → R24 → R25；R24 → R26；R23 → R28。乙的 R10 / R11 / R20 / R21 都只依赖 R22 的契约提交（mock），live 接上是收尾接线（RD-01）。

## 9. 自定决定（对标成熟产品）

| # | 事项 | 决定 | 对标做法 / 理由 |
| --- | --- | --- | --- |
| 1 | 见直、手动编辑后的计划版本 | **v2 计划一个目标一行，原地更新 + `plan_revisions` 留痕**；不再像 v1 那样每次生成新行、旧行归档（推翻 D-03b「沿用 previous_plan_id 版本链」） | Linear issue 历史、Notion 页面历史：对象不变，改动记历史。计分记录、候补、面谈关联都挂在 plan id 上，换行就得搬家；原地更新最省事、最不易丢分 |
| 2 | 分数 | **加分时算好分值写进 `plan_log`，读时求和**（修订 D-04 的「全读时推算」） | 记账式（Strava / Duolingo 的积分流水）：「已得分不变、只重分まだの点」只有记下当时分值才能保证；撤销 = 对冲记录，与 D-04 一致 |
| 3 | 生成流程放在哪里 | **独立路由，画面长得和 iOrbit 对话一样**；状态存在 `plan_intakes` / `plan_drafts`，不写进 iOrbit 会话表；R21 可选择把未完成的流程列进会話リスト | ChatGPT 的 GPT Builder、Notion AI 的表单式生成：结构化流程用卡片，不用自由对话存储；这样 R23 不依赖 R21 的会话模型，两人不改同一套文件 |
| 4 | 业界现状库 | **内容即代码**（版本化常量 + 复核文件），不建 `landscape_entries` 表和管理页（推翻 D-06 的迁移 + admin 页） | Stripe Docs、GOV.UK 内容走代码评审：几十条、按月更新，代码自带版本、评审、回滚；少一个生产迁移。以后要非开发编辑再换实现（读函数一个入口） |
| 5 | イベント枠 | 配点和人数放 `plans` 两列，参加记录仍是 `kind = event` 的条目 | 枠没有活动 id，放进 items 会违反现有 CHECK |
| 6 | 草稿 | 初版和见直的草稿放 `plan_drafts`，确定才写 `plans` | Google Docs「建议模式」/ GitHub PR：草稿和正式版分开，首页和分数看不到半成品 |
| 7 | 题库、模板、短名 | 数字和 id 放 `shared/compute/plan-templates.ts`，文字放同目录 `plan-template-copy.ts`（见 #39） | `shared/compute` 已整目录同步给 App；不用改同步白名单 |
| 8 | 業界库语言 | 标题和要点三语，出处原文 | 与 R03 三语口径一致 |
| 9 | AI 生成文字的语言 | 生成时的界面语言；切换语言不重译 | ChatGPT / Notion AI |
| 10 | 見直し的前提预标（C8） | 用后台池、每份计划每天最多 1 次、不扣用户次数；扣次数只在「送る」 | 设计稿「发送前提时才扣 1 次，避免意外消耗」；每日缓存防止反复打开刷调用 |
| 11 | 目标编辑「保存して作り直す」 | 进入見直し流程，发送时扣 1 次見直し（b4 A6 的「作り直し」与「見直し」共用月 3 次） | 一个配额一种口径，用户只需理解「月 3 回」 |
| 12 | 同时 2 个目标的计数 | 只数生效中的 v2 目标；达成、归档的不算 | Things / Notion 的「アクティブなプロジェクト」上限只数进行中的 |
| 13 | 首页显示哪个目标 | 最近在 Task › プラン 打开的那个（`last_opened_at`） | Slack / Notion 记住上次的工作区 |
| 14 | v1 旧计划 | 只读「以前のプラン」卡 + 「新しいプランを作る」；第一次确定 v2 时归档 v1；不自动转换 | 附录 D-h、D44；Notion 模板升级不改旧页 |
| 15 | 面谈メモ判定的开关 | 默认关，用户在メモ里打开「プランの話せた に使う」才把 3 问交给 AI 判定 | 设计稿「开关由用户决定」；隐私默认最小 |
| 16 | 「今天」的时区 | 东京自然日（全产品现有口径） | 与配额、首页、跟进队列一致 |
| 17 | 目标类型推测（C1）的触发 | 输入停顿 800ms、≥6 字、同文不重调、每人每东京日最多 20 次（与 §5.2 一致；R23 复核 m18 统一）；失败用关键词规则 | 搜索框联想的去抖惯例；成本可控 |
| 18 | App 计划页离线 | 全部 online-only | 现有 `contacts/matches` 已是 online-only；生成和计分都依赖服务端 |
| 19 | 选题缓存 | 按人缓存（输入摘要做键），不跨用户共享 | 「同类同背景 → 同题同序」只需在同一用户内可复现；跨用户共享会泄露别人的背景摘要 |
| 20 | App `contacts/intros` | **删除，不并入**（R25）：它是旧「关系管线」里给引荐候选发关系邀请，新设计里「邀请」由 R15 招待コード承担，「请人引荐」由人物类型详情的紹介ルート（依頼文草稿）承担。入口在联系人详情（R11 重写时去掉），接口 `/api/contacts/intros/summary` 只有这一屏用（文本确认：Web 侧只有 handler 和 reader） | 一个功能一个入口；**这一条会去掉现有功能；用户已确认删除（§10）** |
| 21 | `/api/contacts/needs-matches` 与 `features/contact-needs` | R25 删除 App `contacts/matches` 后一并删除（文件头已写「仅供 App，App 迁移完成再下线」；GitNexus：handler LOW / 1，service UNKNOWN → 文本确认只有这个 handler 引用） | 按 W0055 的下线约定 |
| 22 | 账本 `max_calls` | 每种上限不同的调用一个用途（`plan_intake` / `plan_background` / `plan_draft` / `plan_revise` / `plan_review_mark` / `plan_review`），不改 `reserve`（§3.3） | 不碰 CRITICAL 的账本函数；月度计数直接按用途数，不靠幂等键前缀 |
| 23 | 计划生成流程的日上限 | 自己的日上限 15，不占 10 次总熔断（§5.3） | W0057 即时洞察的先例；避免一天做两个目标就莫名失败 |
| 24 | Step「可能已完成」 | 规则出卡（关联类型都到目标人数），模板文案；不做设计稿里按目安文本提问的 AI 版 | 不新增付费调用；用户随时可手动完成。Things / Todoist 的「子任务都完成 → 提示完成父任务」 |
| 25 | 紹介ルート的来源 | 初版（C6）和見直し（C9）顺带从输入联系人里挑；不单独调 AI、不实时刷新 | 不新增调用；新加的人在下一次見直し时纳入 |
| 26 | 接受候补后 | 只关联，不生成 v1 式「约 TA」行动 | 人物类型详情本身就是待办；To-do 里另有判断待ち（R20） |
| 27 | 見直し的修正案 | 每条变更可 ✓/✕（默认都采用）；生成流程里的 AI 修正保持整体确认 | b10 ⑥、b4 A6 ③ 写了「变更案逐条 ✓/✕」，b4 A3 ③ 没画（设计稿内部不一致，取更细的一方）；对标 GitHub suggested changes、Google Docs 逐条接受建议。生成中还没确定过，整体确认更快 |
| 28 | 活动参加给哪个目标计分 | 每个有イベント枠的生效 v2 目标各记一次 | Strava 一次活动计入所有进行中的挑战；同一场活动对同一目标只记一次 |
| 29 | 已达成的计划 | `status = archived` + `achieved_at`，不新增状态值 | 所有「生效」读路径自然排除；不放宽 `status` CHECK |
| 30 | `revision` | 只因方案内容改变而 +1；计分、跳过、Step 完成不推进（§3.2 第 9 条） | 乐观并发只保护「改方案」，日常记录不该互相冲突（Linear：评论不改 issue 版本） |
| 31 | 有得分的类型 | 手动编辑 / 見直し都不能移除（先撤销那些计分或保留）；没有得分的可以移除，移除后可在見直し里恢复 | 已得分不变的前提；YNAB 不能直接删有交易的分类 |
| 32 | 确定后的手动编辑次数 | 生成时没用过手动编辑，确定后仍有 1 次；每次見直し确定后再给 1 次 | b10 ⑥ Web 写「手动编辑只有这 1 次」指生成流程内；确定后按 b4 / app.html「每次見直し后 1 回」。不让「生成时没用」的那次白白作废 |
| 33 | 人物类型的模板枠 | 新列 `plan_items.type_slot`，不用 D-03 的 `criteria.typeCode` | `criteria` 的 CHECK 只允许 `network_need`、且它是匹配条件，不该混进模板定位；单独一列便于约束和查询 |
| 34 | `goalKind` 未知值 | 响应宽进时落到 `'unknown'`，界面只显示目标文、不显示类型 emoji 和名称 | 通用规则 10：决定显示内容的枚举不猜一个具体值 |
| 35 | 「前提を見る」 | 只读，每行「見直しで変える」进入見直し | 确定后改前提必须经見直し，避免绕过月配额改出与方案不符的前提 |
| 36 | 线下聊过填了名字 | 先按姓名在人脉里找、让用户选「この人ですか？」，没有才新建（来源「プラン」） | 通讯录选人惯例（iOS 共享表、LINE 好友选择）；避免重复联系人 |
| 37 | b8 的 390 空态 | 作废，以 b10 ① 为准 | b8 是 v2.1 之前的画法（4 磁贴、「分析する」、选模板） |
| 38 | 业界库审核人 | 按 Q7 用 Codex；Codex 不可用时由全新上下文的 AI 会话代替并在 REPORT 写明 | 保持 Q7；独立性靠「不看写作过程」保证 |
| 39 | 题库文字放哪 | `shared/compute/plan-template-copy.ts`，不放 `shared/copy` 三个标准用词文件 | 标准用词文件只放通用说法；放 `shared/compute` 不用改同步白名单 |

## 10. 用户已确认（2026-10-10）

用户原话：「都按推荐，开工 R22」。四项口径：

1. **付费 AI C1–C12 全部授权**：仅限本机验证，每项真实调用不超过 5 次，模型 deepseek-v4-flash，每用户每月上限按 §5.4 执行；调用要记账（`ai_usage_ledger` / `ai_usage_calls`），次数和 operationId 写进各 Sprint 的 REPORT。staging 和生产上线另行授权，不在这次授权里。
2. **两个生产迁移现在不执行**（迁移一 `plans` v2「plans-v2-model」、迁移二 AI 账本用途放宽）：等 `redesign` 整体合回前，和其他功能的迁移一起出授权清单；执行前先在生产做只读预检（CHECK 约束名、现有 `purpose` 取值、active 计划数）。Sprint 里只在本机跑迁移。
3. **App `contacts/intros` 确定删除**，由 R25 执行（邀请由招待コード R15、请人引荐由紹介ルート R24 承担）。
4. **每人每月最多新建 10 个目标**：确定（碰到时提示「今月はこれ以上新しい目標を作れません」）。

## 11. Sprint 怎么切

| Sprint | 主题 | 一句话 | 能单独验收的理由 |
| --- | --- | --- | --- |
| [R22](../R22-plan-data-and-score/GOAL.md) | 数据、契约与分数 | 迁移两个、契约转正、模板与计分纯函数、v2 读接口和计分命令（mock + live）、旧计划守卫、演示世界改形 | 不需要任何界面：用服务测试和路由测试证明「存得下、读得出、分数对、旧计划不受影响」；首页（R10）从这里拿到 live 分数 |
| [R23](../R23-plan-generation/GOAL.md) | 生成流程与 AI | 目标入力 → 背景 → 5 问 → 前提 → 初版 → AI 修正 → 手動編集 → 確定；业界现状库；C1–C7 | 端到端：两端都能从空态走到「确定了一份 v2 计划」，mock 下全流程可走；确定后 Task › プラン 先显示一个最小的「已确定」卡（R24 换成完整概要） |
| [R24](../R24-plan-overview-and-types/GOAL.md) | 概要、人物类型与记录加分 | プラン概要、人物タイプ詳細三种去向、候补 ✓/✕、面談提案 / 依頼文草稿、记录 / 自报 / 超额 / 跳过 / 撤销、Step 完成确认、イベント枠与 `event-score.ts`、C11 / C12；App `contacts/matches` 改为跳转 | 用 R22 的种子计划即可验收（不依赖 R23 的界面）：分数在两端和首页契约里一致 |
| [R25](../R25-plan-review-goals-cleanup/GOAL.md) | 见直、达成、多目标与清理 | 見直し（C8 / C9）、月配额与用完状态、達成 → 次の目標（C10）、目标下拉 / 编辑 / 作り直し、以前のプラン、删除旧屏和兼容跳转、换掉所有旧计划链接 | 收尾 Sprint：以「旧文件已删、归属表计划行全部处理、旧链接为零」验收 |

为什么这样切：

- **数据先行、契约第一天提交**：分数和契约是乙的首页、人脈、Task 都要用的东西，越早定越少返工；R22 不带界面，测试最好写、最容易单独收口。
- **生成和使用分开**：R23 只管「把一份计划做出来」，R24 只管「用计划」。两边共享的只有 R22 的数据层，所以 R24 可以用种子计划独立验收，必要时和 R23 并行。
- **会改动别人入口和删旧文件的事放最后**：R25 要换掉 `features/**` 里十多处旧链接、删 `iorbit-0918` 里的计划文件（R21 的地盘）和 App 两个旧屏，放在功能都可用之后做，删的时候有新地址可换，也方便和乙对一次热点文件。
- **AI 调用跟着用到它的画面走**：C1–C7 在 R23，C11 / C12 在 R24，C8–C10 在 R25；每个 Sprint 只申请自己那几项的本机验证次数。

## 12. 旧屏归属（本设计的认领）

| 端 | 旧屏 / 文件 | 处理 | Sprint |
| --- | --- | --- | --- |
| Web | Task › プラン 插槽 `agent/plan/plan-slot.tsx`（现放 `IOrbitPlan`） | 分三步换：R23 换空态分支、R24 换 v2 概要分支、R25 换 v1 分支并删除插槽旧代码 | R23–R25 |
| Web | `/app/agent/plan`（兼容跳转）、`read-current-plan.ts`、`plan-route-view-model.ts` | 删除；所有旧链接换新地址 | R25 |
| Web | `/app/agent/strategy`（`?view=contacts` 联系人建议） | 删除；内容由人物タイプ詳細取代 | R25 |
| Web | `agent/iorbit-0918/` 里只属于计划的文件（`iorbit-plan*.tsx`、`iorbit-plan-card*`、`iorbit-my-plan-styles.ts`、`plan-anchors.ts`、`plan-match-*`、`today-plan-items.ts`、`iorbit-strategy.tsx`） | 删除；`iorbit-home.tsx` 等 R21 的文件里对它们的引用，R21 先重写就随之消失，R21 未完成时由 R25 改成新链接（热点文件先找负责人） | R25 |
| App | `contacts/matches`（`ContactNeedsMatchesScreen`、`ContactNeedsMatchesContent`、`src/view-models/contact-needs.ts`；入口 `ContactNeedsHomeEntry` 在人脈页 `ContactsScreen.tsx`，R11 的文件） | R24 改为跳转 Task › プラン；R25 删除路由、屏幕、视图模型和接口（动 `ContactsScreen.tsx` 前先通知乙；R11 已重写则入口已不在） | R24 / R25 |
| App | `contacts/intros`（`ContactIntrosScreen`、`src/view-models/contact-intros-summary.ts`、`src/data/offline-read/route-domain-inventory.ts` 里的登记；入口在 `ContactDetailScreen.tsx`，R11 的文件） | **删除**（核对结论，§9 #20，用户已确认 2026-10-10） | R25 |
| App | Task › プラン `PlanSlot`（「目標を決める」即将上线） | R23 替换 | R23 |
| 服务端 | `/api/contacts/needs-matches`、`features/contact-needs/**`、`shared/contract/contact-needs.ts`、`/api/contacts/intros/summary`、`contact-intros-summary-reader.ts`、`shared/contract/contact-intros-summary.ts` | 删除（随 App 两屏；契约删除在 `BREAKING.md` 登记，App 同步副本一起删） | R25 |
| 服务端 | v1 创建入口：`POST /api/agent/plans/bootstrap`、`POST /api/agent/plans`、`POST /api/agent/plans/reanalyze`；旧引导里的「生成计划」 | 返回 409 `PLAN_V1_RETIRED` + v2 入口地址；旧引导改跳 v2 入口（§3.6） | R25 |
| 服务端 | `features/**` 产生的 `/app/agent/plan…` href、活动跟进 `taskHref` 的字面量类型 | 换成 §8 的新深链 | R25 |

## 13. GitNexus（本文写作时，索引 @ `fe896414` 全量重建）

| 符号 | 结果 | 对策 |
| --- | --- | --- |
| `PlanService`（`features/plans/contract.ts`） | **CRITICAL** 121 | 接口只加方法；v2 新方法放在 `PlanV2Service`，不往 `PlanService` 里加 |
| `createPlanService`（`service.ts`） | **CRITICAL** 55 | 不改；v2 新建 `createPlanV2Service`，只共享 repository 的事务与锁 |
| `resolvePlanService`（`service-factory.ts`） | **CRITICAL** 50 | 只加 `model_version` 守卫（v2 计划对 v1 读返回 null、写返回 409）；新增 `resolvePlanV2Service` |
| `createPostgresAiUsageLedger`（`ai-quota/ledger.ts`） | **CRITICAL** 80 | 只新增「按月计数」方法，已有方法不动 |
| `createDeepseekMemoExtractionProvider`（`memo-extraction/provider.ts`） | **CRITICAL** 63 | C11 只在「usedForPlan 且有类型」时给输入加字段、输出加可选字段；提示词版本 +1；现有输出形状不变 |
| `createPostgresPlanRepository`（`repository.ts`） | HIGH 37 | 只加 v2 的读写方法和列映射；v1 查询加 `model_version = 1` 过滤的地方逐个列在 R22 REPORT |
| `decideSnapshotRefresh`（`network-analysis/refresh-policy.ts`） | HIGH 13 | 只调用 |
| `HumanEncounterRecord`（`encounters/service.ts`） | HIGH 24 | 不碰：匿名自报只写 `plan_log` |
| `getCurrent()` 的消费方（`coverage.ts`、`network-analysis/{runtime,input-source,service}.ts`、`contact-plan-context.ts`、`matching-service.ts`、人脉分析三个 loader） | 文本确认（§3.6） | 改走 `readActivePlanNeeds`，v2 种子计划下的回归测试（SC-R22-06） |
| `AiQuotaPurpose` | MEDIUM 35 | 只加值 |
| `createAiPlanGenerator` | LOW 7 | v2 另写 `createAiPlanV2Generator`，v1 不动 |
| `runPlanMigrations` | LOW 4 | 只追加版本 |
| `readCurrentPlan`、`loadPlanSlot`、`IOrbitPlan` | LOW 2 / 1 / 2 | R25 删除 |
| `createContactNeedsGetHandler` | LOW 1 | R25 删除 |
| `createContactIntrosSummaryReader` | LOW 3 | R25 删除 |
| `validateGeneratedPlan` | LOW 2 | v1 不动；v2 新校验器 |
| `REANALYSIS_MONTHLY_LIMIT`、`configuredHasActivePlan`、`planV2SummaryResponseSchema`、`ContactNeedsMatchesScreen`、`ContactIntrosScreen`、`TASK_SLOTS`、`createConfiguredContactNeedsService` | UNKNOWN | 文本确认：`REANALYSIS_MONTHLY_LIMIT` 只在 `service.ts`；`configuredHasActivePlan` 只在 `progress.ts` 两处；`planV2SummaryResponseSchema` 只在 `redesign-contracts/handlers.ts` 与测试；两个 App 屏幕只由 `app/contacts/{matches,intros}.tsx` 挂载（入口分别在 `ContactNeedsHomeEntry`、`ContactDetailScreen`）；`TASK_SLOTS` 只在 `TaskScreen.tsx`；`createConfiguredContactNeedsService` 只在 needs-matches handler。**UNKNOWN 不当作安全**，各 Sprint 开工时重跑 |

注意：增量刷新后的索引曾漏掉 `features/plans` 大部分文件（impact 全部 not found）；本文结果来自 `analyze --index-only --force` 全量重建。各 Sprint 开工时如果 impact 报 not found，先全量重建再判断。
