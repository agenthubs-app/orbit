# 加人与邀请整体设计（R12、R15、R16）

**版本 2（2026-10-11，执行人：小雨（甲）的执行会话；文档阶段，未改代码）。** 版本 2 = 按独立复核（[REVIEW.md](REVIEW.md)）S1–S2、M1–M10、m1–m16 修订。 本文是 R12、R15、R16 三个功能 Sprint 的共同依据：说清加人和邀请为什么这样设计、数据怎么放、契约怎么加、用不用 AI、怎样防止邀请码被枚举，以及和乙负责的 Sprint 之间的接口。三个 Sprint 的 `GOAL.md` / `PLANNER.md` 只写各自的范围和验收，不重复本文。

- 设计稿（越往后越新、越权威）：`b1-onboarding-cards.html`（B1–B8 名刺相机 / 批量 / 复核 / 合并 / 计划匹配）、`b5-me-inbox.html` E6（招待旧版，含唯一的「招待の履歴」画板）、`b6-host-polish.html` C（NFC）、`b7-account-misc.html` A（手入力全字段版）/ J（NFC 被碰方网页）、`b8-responsive.html`（断点规则）、`b9-import-plan-v2.html`（人脈の取り込み v2：A1 名刺衔接、A2 連絡先、A3 LinkedIn、A4 手入力、A5 招待コード、A7 あとで補完）、`app.html` / `web.html` 的人脈三态与「＋」sheet、`b11-nav-v3.html` A（A1 名刺 / A2 招待コード / A3 手入力 的第一次指导、成功、异常——**最新**）、`index.html`「待確認項決定」。逐画板的文字提取见共享笔记 `add-invite-design-extract.md`（本会话组的笔记目录，不进仓库）。
- 旧方案：`IMPLEMENTATION-PLAN.md` §1.3（人脈 与 加人）、§2 D-10 / D-11 / D-13 / D-25、§4 P1 / P5 / P6、§5 Q9 / Q10、附录 D-g / D-m。**本文与它冲突的地方以本文为准**，冲突点逐条写在 §9「自定决定」。README 的「用户决定」表与通用规则高于本文。
- 已定的产品决定（不再讨论）：人脉导入「一个入口 5 个门（名刺 / 手入力 / 連絡先 / LinkedIn CSV / 招待コード），统一『取り込む → まとめて確認 → あとで補完』，全部直接进人脈，每人带信息浓度三点 + 来源 chip」（用户 2026-10-07）；招待コード互加「用户自己发码 / 链接 / 二维码（不代发）；对方注册并填资料、选共享项目后，双向自动加入人脈，标『本人入力』并随对方更新同步；双方推送告知，任一方可移除」（用户 2026-10-07）；有效期 7 天、每码最多 10 人、可随时「無効にする」、对方已在 Orbit 只「つながる」（NAV-V3 定稿 2026-10-08）；人脈右上「＋」sheet 主推 名刺 / 招待コード / 手入力，その他 連絡先・LinkedIn CSV（NAV-V3 定稿）；名刺第一次指导前 3 次显示；**邮件和消息只做到草稿**；示例数据绝不写库；契约「宽进严出」（通用规则 10）；NFC 按规格 §9.2（名札 / 名刺卡，不做手机碰手机）。
- 用语：「本人入力」= 对方自己填的资料，随对方更新同步；「浓度三点」= 信息浓度 ●○○ 身元だけ / ●●○ 名刺レベル / ●●● 関係まで；「まとめて確認」= 一批人进来后只看例外（重复、读得不确定）的确认页；「判断待ち」= Task › To-do 里等用户点一下的项目（R20）。

## 1. 为什么要重做，重做成什么样

### 1.1 现状的问题

现在两端的「加人」是五年间叠出来的：

1. **入口和管线太多。** App 有 8 个路由背后 4 条加人路径——单张扫描（`/scan` → `/api/contacts/business-card/confirm`）、v1 旧批量（`/batch/[id]`）、v1 名片文件导入（`/import/[id]`，PDF 拆成 v1 批次）、v2 批量（`/batch2/*`）；「导入中心」`ContactAcquisitionScreen`（2446 行）里还有 QR 扫码连接、外部候选、引荐、草稿队列、重复合并五块。Web 只用 v2 名片和 CSV / vCard / 活动导入。用户不知道该点哪个。
2. **行为不一致。** 只有 v2 名片会查重候选（`findContactCandidate`）、触发即时洞察、关联活动、入队计划候补（`plan_match_jobs`）；单张、手动、QR 都不会。查重规则有三套（名片：邮箱 / 电话 / 姓名 + 公司；`live-contact-write-service.findDuplicate`：邮箱或姓名 + 公司；手动：只看姓名 + 公司）。
3. **两端体验不一致。** Web 的 `useCardBatch` 已经在读完后把没有疑点的卡自动导入；App 的 v2 批次仍要求每张名片点「确认」。设计定稿是「读完直接进人脈，只有重复和读得不确定的才确认」，两端要一致。
4. **没有招待コード。** 现有「关系邀请」（`relationship-communication/invitations`）是邮箱绑定、登录后才能预览、接受后只建一个双人会话，不建联系人，两端都没有创建界面；R08 契约 4 招待コード只有 mock，live 返回「尚未实现」，公开预览没有限流和防枚举（README 合回前清单）。
5. **导入之后人就「薄」了。** 連絡先、LinkedIn 进来的人只有名字和公司，没有补全的路径；R08 契约 3「每天一问」只有 mock。

### 1.2 新的形状

```
人脈右上「＋」/ Web「人脈を追加」
   ├─ 📇 名刺をスキャン ── 拍照 / 相册 / 拖放（一次 ≤100 张）→ 后台读取（现有 DeepSeek 两阶段 OCR）
   │        → 没有例外的卡直接进人脈；重复 / 读得不确定 / 读不出 → まとめて確認 → 完成页（新加 · 统合 · 读不出）
   ├─ 🤝 招待コード ── 发码（QR · 链接 · 8 位码 · 消息草稿）→ 对方打开 /i/<code> → 注册或登录 → 选共享项目 → つながる
   │        → 双方人脈各多一人（本人入力 ●●●，随对方更新同步）→ 邀请人收到通知 → 计划候补自动入队
   ├─ ✍️ 手入力 ── 名字即可保存 → 保存前查重（与名片同一套规则）→ 统合或新建 → 5 秒内可撤销
   └─ その他：📱 連絡先（App 读通讯录 / Web vCard）· 🔗 LinkedIn CSV · 汎用 CSV · イベントから
            → 选人（规则预选「像工作关系的人」）→ まとめて確認（同一组件）→ 全部进人脈
                                              ↓
                       あとで補完：每天最多一问（规则出题，零 AI），答了浓度上升
```

设计原则（全部来自设计稿和已定决定）：

- **一条管道。** 所有门最后都写进同一个联系人存储，按同一套查重规则（名片现有的 `findContactCandidate`：邮箱 / 电话 / 姓名 + 公司，完全相同则自动统合），都入队计划候补。
- **只看例外。** 进人脈不需要逐个确认；需要人判断的只有「可能是同一个人」和「读得不确定」。统合可以撤销。
- **不代发。** 招待的消息只是草稿（复制、在 LINE / 邮件 App 里打开），按钮旁常驻「Orbit からは送信しません」；Orbit 自己发的只有「邀请被接受」这一条站内通知（README 口径：主办方 / 系统的定型通知不算代发）。
- **AI 只提议。** 计划人物类型的推测（候补）一律用户 ✓/✕ 才关联，关联也不加分（加分发生在「話せた」记录，R24）。
- **隐私默认最小。** 招待码不含姓名；对方的邮箱、电话默认不共享；公开预览只返回邀请人选择共享的字段；名片图片只有本人能看。
- **示例数据绝不写库。** 空态的「サンプル」两行、示例模式下的预览都是前端静态数据。

## 2. 用户流程（逐屏）

画面编号对应设计稿：⑪ = b11 A，⑨ = b9，① = b1。括号里是负责的 Sprint。

### 2.1 加人入口（R12）

- **App**：`contacts/new` 重写为普通页面「人脈を追加」（与 Web 同构，复核 M2）：主推三项 📇 名刺をスキャン「撮るだけで会社・役職・連絡先を読み取り。まとめて最大100枚」、🤝 招待コード「相手が自分で入力 → お互いの人脈に自動で追加」、✍️ 手入力「名前だけで保存。あとで名刺を撮ると統合されます」；「その他」📱 連絡先、🔗 LinkedIn；「確認待ちの下書き」（有待确认草稿时才出现，见 §2.9）；底部浓度三点图例。
  - 设计稿画的是人脈页上的底部 sheet（`app.html`）。人脈页 `ContactsScreen.tsx` 是 R11（乙）的文件，改成透明 modal 路由又要动根导航（`OrbitRouteAccessBoundary.tsx` 的 Stack）和乙的 `parentForPath`（复核 M2），所以本组只做**页面版**，同时导出同一内容的 `AddContactSheet` 组件（R04 `BottomSheet` 包着 `AddContactDoors`），R11 重写人脈页时在「＋」上直接弹它（§8）。`parentForPath` 不改：`contacts/new/*` 返回 `/contacts/new`（现有规则），正好就是这个入口页。
  - 招待コード、連絡先、LinkedIn 三项在对应 Sprint（R15、R16）上线前**隐藏**（不是灰掉），入口只剩名刺和手入力（IMPLEMENTATION-PLAN 依赖「D-13 之前隐藏招待入口」）。
- **Web**：`/app/contacts/new` 重写为「人脈を追加」页（ShellPage，左栏「人脈」高亮）：主推三张大卡 + その他四张小卡（連絡先 vCard / LinkedIn / CSV / イベントから），右栏「いちばん早い方法：招待コードを 3人に送る」（R15 上线后出现）。设计稿只有「5 门弹窗」的注释没画弹窗本身（`web.html` 注 1），而 `/app/contacts` 是 R11 的页面——所以 Web 也用独立页面承载，导出 `AddContactDoors` 组件供 R11 做成弹窗（§8）。1024 同构；390 单列卡片。
- **其他入口不动**：首页「名刺をスキャン」（R10）、iOrbit（R21）、引导（R28）现有链接指向 `contacts/new`、`contacts/new/scan` 的，路径保留，自然落到新屏（§7 路由表专门保留了这两个路径）。活动的「去复核联系人」（`events.ts:253,1473` `reviewQueueHref: "/contacts/new"`）改指 `contacts/new/drafts`（§2.9，`events.ts` 属于 R26，甲自己的范围，复核 M8）。

### 2.2 名刺をスキャン（R12）

**App**
1. **はじめての方へ**（⑪ A1 ①）：前 3 次进入显示（计数存本机，IMPLEMENTATION-PLAN 附录 D-m），可「次回から表示しない」；之后右上「?」可再打开。内容：拍法 4 条（明るい場所 / 平らに置く / 四隅を枠に / 表と裏 · 裏は任意）、拍后流程（AI 読み取り → 例外だけ確認 → 全員 人脈へ）、隐私一句。主按钮「カメラを開く」，次要「写真から選ぶ」（相册多选，同一管道）。
2. **权限**（① B1）：先解释再请求；被拒后显示三步「設定を開く」+「写真から選ぶ」，回到 App 自动检测。
3. **相机**（⑪ A1 ②）：顶部 [表面][裏面] 切换，连拍，「連続撮影 N枚 · あと M枚まで」（上限 100 张照片），托盘显示缩略图（点了可删）；**裏面跟上一张表面配对**（现有 v2 契约的 `IngestCardSide` 与 `card_id` 已支持，App 旧 `BusinessCardIngestStartScreen` 也有补拍反面，复核 M1），「裏なし」直接回表面；「完了 N」进入读取。**不做**实时画面分析提示（反射 / 暗い / ぶれ）和四角检测自动拍：需要逐帧图像分析的原生模块，读不出的张由第 7 步兜底（§9 #6）。
4. **读取中**（⑪ A1 ③）：「読み取り中 N枚 · 閉じても続きます」，逐张显示名字或「読み取り中…」；已在人脈的人标「重複」，读得不确定的标「推測あり」。
5. **读完自动进人脈**（⑪ A1 ③ 注）：批次读完后，客户端按**同一条规则**把「没有疑点」的卡逐张走现有确认接口——这条规则就是 Web `useCardBatch` 早已在用的 `isAutoImportEligible` / `isAutoMergeEligible`（`card-batch-model.ts:97-120`：识别完成、没有 reviewIssue、正反面不冲突、没有过期来源、补全不需复核、有姓名；与已有联系人完全一致的直接并入；**有活动归属候选的卡留给用户**，W0015）。R12 把这条规则搬进 `shared/compute/card-auto-import.ts`，Web 原函数改成调用它（行为不变），App 用同一份（复核 S2）。不新增服务端批次动作，不改 `confirmCard`、worker 与洞察 / 活动归属副作用的位置。
   - 关掉 App 时：读取在服务端继续；自动进人脈发生在下次打开这个批次（点推送、点首页 / 入口页的进度条）时。Web 由全站 `CardBatchHost` 在任何页面上执行（现状）。这个差异写进 §9 #8。
6. **まとめて確認**（⑨ A1 衔接 + ⑨ A2 ④ 同一组件）：顶部三格 重複 N / 要確認 N / そのまま追加 N（点格子滚到对应区）；「会った場所と日付」推定（现有活动归属候选接口），**整批选择一次**，选了的活动随这些卡的确认一起写入（W0015 的卡就在这里由用户确认）；重複区每条左右对照「既存 / 今回」+「統合する / 別人として追加」；要確認区按现有 issue 码分组（缺姓名、公司后缀、定向复读不一致、正反面冲突、行业待复核），点开逐张改字段（复用现有审阅字段）；读不出的卡单独一区：「撮り直す」（相机单张模式，现有 `replace`）/「手入力で補う」（读到的部分预填，现有 `manual-entry`）/「スキップ」（现有 `skip`）。主按钮「N人を人脈に追加」= 按用户在各区的选择逐张调现有确认接口；也可「あとで」离开（批次保持，下次回来继续）。
7. **完成**（⑪ A1 ④）：「N人を人脈に追加しました」+ 场合（日期 · 活动）；三格 新しく追加 / 既存と統合 / 読み取れず（读不出的不计入「追加」）；「次にやるといいこと」：🎯 プランに関係しそうな人（计划候补在批次转 completed 时入队（现状），候补出来之前这一行写「確認が終わると表示されます」）/ 🧩 読み取れなかった N枚。按钮「人脈で見る」「続けて撮る」。浓度分布条按 `contact-density` 计算（§3.4）。
8. **异常**（⑪ A1 ⑤）：读不出的张说明原因——现有错误码只能区分「画像を読み取れません」（`IMAGE_INVALID`、`OCR_INVALID_OUTPUT`）和「混み合っていて失敗しました · もう一度」（`OCR_PROVIDER_FAILED / TIMEOUT`、`LEASE_EXHAUSTED`），设计稿的「ピンぼけ / 文字が小さい」细分需要改 OCR 输出，不在本组（复核 m4）；读到一半的保留为预填；跳过的张按现有 v2 规则保留在批次里。

**Web**（⑪ A1 Web）：`/app/contacts/new/scan` 拖放区（JPG · PNG · HEIC · PDF · 一度に最大 100枚 · 表と裏は自動でペア（现有 `useCardBatch` 的配对））+ 右侧常驻「はじめての方へ」（第 3 次后收成一行）；上传、读取、自动进人脈由 `useCardBatch` / `CardBatchHost` 负责（现状，关掉标签也继续）；读完进 `/app/contacts/new/scan/[batchId]`（まとめて確認 → 完成，与 App 同一状态与文案）。键盘：↵ 确定 / → 下一条 / S 跳过（① B5 右栏）。`CardBatchHost` 的让位前缀从 `/app/contacts/new` 收窄为 `/app/contacts/new/scan`（复核 m3：入口页、手入力抽屉、导入页不挂 `useCardBatch`，不能让续传停在这些页面）。

### 2.3 手入力（R12）

以最新的 ⑪ A3 为准（⑨ A4 的「粘贴签名拆字段」只在 Web 抽屉做，⑦ b7 的全字段版作废，§9 #12）。

- **App**（`contacts/new/manual`）：名前（必須）；「あるといいもの」虚线 chip：会社 / 出会った場所 / メモ / 連絡先（メール・電話）。会社输入联想**人脈里已有的公司名**（新接口 `GET /api/contacts/manual/organizations?q=`，从本人联系人里按前缀取 ≤5 个公司名与人数，复核 m13）；出会った場所 chip 来自参加予定和最近 30 天参加过的活动（现有活动列表接口）+「紹介」「その他…」；メモ 保存为这个人的**联系人备注**（现有联系人备注，不进 Task › メモ——メモ模块与 @ 提及属于 R20，复核 m13）。底部即时预告浓度。
- **保存前查重**（⑪ A3 ③）：查重规则 = 名片的 `findContactCandidate`（邮箱 / 电话 / 姓名 + 公司）**加一条「同名」规则**（复核 M6）：规范化后姓名相同、且至少一方没有公司 / 邮箱 / 电话时算「似ている」（只提示、不自动统合，对标 Google 通讯录「可能重复」）。手入力和名片的重复查询（v2 `duplicates` 接口）都用这条，这样「只填名字 → 以后拍名片」能查到。左右对照「いま入力中 / 人脈にいる人」+「統合する（おすすめ）/ 別の人として保存」。统合 = 冲突字段逐个选（只列不同的字段），用新的字段覆盖写入函数（§3.1）。
- **保存后**（⑪ A3 ④）：进入这个人的详情页（R11 的屏，现有路由 `contacts/[id]`）+ Toast「人脈に追加しました · 手入力 [元に戻す]」5 秒；元に戻す = 把刚建的这个联系人删除（存储层的墓碑删除，App 同步靠它知道删了；只对 10 分钟内、本接口新建、之后没被改过的联系人有效），同时撤掉它的计划候补任务。详情页上的「情報を濃くする」三个入口属于 R11（§8）。
- **Web**：「人脈を追加」页上的右侧抽屉（520，b8：1024 同宽、390 全屏）：同样的字段 + 「📋 メールの署名を貼り付けると、項目に分けます」——签名拆分**用规则**（邮箱、电话、邮编、URL 正则 + 公司法人后缀词典 + 首行姓名），不调 AI（§5、§9 #13）；名字一输入就即时查重（同名规则在只有名字时也能查出）；⌘↵ 保存。

### 2.4 招待コード · 发出方（R15）

- **入口**：App「＋」sheet › 招待コード（`contacts/new/invite`）；Web「人脈を追加」› 招待コード（居中 Modal 560，390 底部 sheet）。マイページ「招待コード」行属于 R18（§8）。
- **はじめて**（⑪ A2 ①）：说明「相手が自分で入力して、お互いの人脈に入ります」+ 3 步 + FAQ 三条（对方已在 Orbit？期限和人数？Orbit 会代发吗？）+「コードをつくる」。第二次起直接进共享页。
- **共享**（⑪ A2 ②）：大 QR + 8 位码（`K7QX-2M9P` 形式，不含姓名，§9 #15）+ 链接；按钮「QR を表示」（全屏放大，当面给人扫）/「リンクをコピー」/「メッセージで送る」。下方「有効期限 10/14 まで · あと 7日」「使える人数 残り 9 / 10人 · 登録済み 1人」；「相手に届くあなたの情報 [変更]」：会社・役職 / 提供できること / 求めていること（默认开）、連絡先（默认关），值来自我的资料；底部「Orbit からは送信しません · 共有はあなたの端末から」+「無効にする」（确认后立即作废）。
  - 同一时间每人只有 1 个有效码；再点「コードをつくる」或过期后「新しいコードを発行」= 旧码作废、发新码（IMPLEMENTATION-PLAN D-13）。
- **メッセージの下書き**（⑪ A2 ③）：底部 sheet，语气 [ていねい][カジュアル][英語] 三套**固定模板**（填入对方不需要的部分：我的名字、链接、期限），不调 AI；按钮 [コピー][LINE で開く][メールで開く]，常驻「Orbit は送信しません」。
- **履历**（b5 E6 是唯一画过的履历画板）：共享页下方「これまでのコード」：每个码一行（作成日、状态 有効 / 期限切れ / 無効 / 上限、登録した人的名字），点人名进联系人详情。⑪ ⑧ 的「期限切れ → 1 タップで再発行」放在这里。
- **成功**（⑪ A2 ⑥ + ⑨ A5 ③）：有人用码连上后，邀请人收到一条站内通知 + 推送（计入全 App 每天 3 件，R14 的频控）：「高橋 美咲さんが招待から登録しました · お互いの人脈に追加」，点开进对方的联系人详情。

### 2.5 招待コード · 接收方 `/i/<code>`（R15）

一张响应式公开页（index：不单独画 1440 版；1024 按 390 居中放宽到 560）。步骤按用户 2026-10-07 原话「好友**注册并填资料**、选择共享项目后…」和 ⑨ A5 的 5 屏（复核 M3）：

1. **打开**（⑨ A5 ② / ⑪ ④）：顶部 Orbit 简洁头；「招待が届いています」+ 邀请人共享的名片（名字、会社・役職、提供できること、求めていること——**预览永远不显示邮箱和电话**，连上之后才交换，复核 M7）；说明「登録すると、お互いの人脈に追加されます。あなたが選んだ項目だけが相手に届きます。」；码与期限「K7QX-2M9P · 10/14 まで有効」。
2. **未登录**：主按钮「無料で登録してつながる」→ 现有注册页（`/app/account/signup?next=/i/<code>`，邮箱 + 密码 / Google），副按钮「ログインしてつながる」（`/app/account/login?next=/i/<code>`）；小字「登録は1分 · クレジットカード不要 · アプリは不要」（index 决定）。
   - 回跳：现有 `normalizeOrbitAuthReturnPath`（`features/auth/app-auth-routing.ts:49-79`，**CRITICAL** 23）只放行 `/app/**`，`/i/…` 会被改成 `/app/home`。R15 只**追加一个分支**：完全匹配 `^/i(/[2-9A-HJKMNP-TV-Z]{4}-?[2-9A-HJKMNP-TV-Z]{4})?$` 的路径原样放行，已有分支不改；注册成功后若 `next` 是 `/i/…`，直接回 `next`，不先进 `profileContinuationPath`（资料引导在之后第一次进 `/app` 时照常出现，现有门禁不改）。开放重定向用例写进测试（`next=//evil.example`、`next=/i/../app/admin`、`%2F` 编码、超长）。
3. **简短资料**（⑨ A5「プロフィール 2/3」）：已有资料的人跳过；资料空的人填 名前（必須，预填账号名）/ 会社 / 役職 / 提供できること / 求めていること（chip + 自由输入），可「自分の名刺を撮って入力」（App 用 R12 的单张拍照；Web 跳过这个按钮）。保存走**现有资料保存接口**（R18 的接口，只调用不改）。这一步让「本人入力 ●●●」名副其实。
4. **确认共享**（⑨ 3/3 + ⑪ ⑦）：「〇〇さんとつながりますか？新しいアカウントは作りません。」；「〇〇さんに見せる情報」开关：名前（必須，不能关）/ 会社・役職 / 提供できること / 求めていること（默认开）/ メール / 電話（默认关）；值一律由服务端从我的资料读（客户端只传选了哪些项，复核 M7）；资料里没有的项不显示开关；如果我的人脈里已经有这个人，显示「〇〇さんはすでにあなたの人脈にいます（名刺 · 9/18）。つながると本人入力に統合されます。」；主按钮「つながる」，副「今はしない」（不留痕）。
5. **完成**（⑪ ⑤）：双头像「〇〇さんとつながりました · お互いの人脈に追加されました」；「〇〇さんに届いたあなたの情報：…」「あとから変えると、相手側も自動で更新されます」；次要「アプリで続ける」。
6. **异常**：期限切れ / 人数上限（⑪ ⑧）显示邀请人名字和期限 +「〇〇さんに新しいコードを頼む」草稿（コピー / LINE で開く，Orbit 不发送）；过期超过 30 天的码按「使えません」处理（复核 M7）；已经连上（重复打开）显示「すでにつながっています」+「人脈で見る」；自己的码显示「自分のコードです」+「共有画面へ」；不存在 / 已作废 / 格式不对 / 被限流 → 同一个「このコードは使えません」页（不区分原因，防枚举，§6）。
7. **手输码**：`/i` 无码时显示输码框（8 位，自动大写、自动补连字符；字母表外的字符提示「使えない文字が含まれています」）。App 里同一路由 `i/[code]`、`i/index`（App 通用链接 / `orbit://i/<code>` 打开时用；未登录走 App 登录后回到原路由）。
8. **链接预览**（复核 m15）：LINE / Slack / iMessage 抓取链接时，页面 `<title>` 与 OG 只写「Orbit への招待」，**不带邀请人名字**；`noindex, nofollow`；`Referrer-Policy: no-referrer`。抓取请求与普通访问同样计入限流（它们本来就是预览）。

### 2.6 连上以后：本人入力、同步、解除（R15）

- **双向加入**：A 的人脈新增 B（值 = B 选择共享的项，从 B 的资料读），B 的人脈新增 A（值 = A 发码时选择共享的项，从 A 的资料读）。两边联系人都写现有 `contacts` 集合（`saveContact`），**来源 `sourceType` 用已有的 `referral`**，联系人上记 `acquisition: { via: 'invite_code', code }`；「本人入力」由 R15 的连接表判断（§3.2），R11 的 `sourceChip = 'self'` 由此得出（复核 S1：`SourceTypeCode` 的读取端是封闭枚举，加新值会让人脈列表整页解析失败，所以不加）。
- **已有对方的联系人**：任一边已有对方（按 §2.3 的同一套查重：邮箱、电话、姓名 + 公司；同名规则只提示不用于自动统合）→ 不新建，统合进已有的那一条：对方选择共享的字段**以对方为准覆盖**，覆盖前的旧值写进历史（字段覆盖写入函数，§3.1），标「本人入力」（⑪ ⑦ 与 D-13 两个方向都处理，§9 #17）。
- **浓度**：本人入力的人直接 ●●●（`contact-density` 口径，§3.4）。
- **计划候补**：双方的新联系人都入队现有计划候补管线（`enqueuePlanMatchJob`，规则 + 现有 matcher C12）；候选出现在人物类型详情和联系人页的虚线确认卡（R11 / R24 已有接口），✓/✕ 才关联（⑨ A5 ③）。不新开接口（plan-v2.2/DESIGN §8 R15 行）。
- **通知**：邀请人收到一条站内通知 + 推送（计入全 App 每天 3 件）；接收方当时就在完成页上，不再推送（用户决定写「双方推送告知」，接收方的那一条由完成页代替，§9 #33，复核 m13）。
- **同步**（⑨ A5 ④）：对方改了资料，我这边那条联系人的共享字段自动更新，旧值进历史。实现：维护心跳（`maintenance-heartbeat`，现有，约 10 分钟一轮）里加任务 `invite_profile_sync`：对每条生效连接，比较对方资料的 `updatedAt` 与连接上记的上次同步时间；只改对方选择共享的字段。**冲突规则**（复核 M5）：连接上存着每个字段「上次同步的值」，我这边的值与它不同 = 我自己改过 → 这个字段停止同步（详情上由 R11 提示「本人の情報と違います」）；没改过的字段以对方为准。我写的备注、笔记永远不动。
- **改共享项目**：在对方联系人详情「⋯ › 共有する項目」改（入口在 R11 的详情页，R15 提供接口和 `InviteShareSheet` 组件）；改完下一轮同步把对方那边被关掉的字段清空（清空也记历史）。
- **解除**（⑨ A5 ⑤）：任一方在联系人详情「⋯ › つながりを解除」：动作表写清后果（相手の人脈からも、あなたが外れます · 通知はしません · 本人入力の情報は今後更新されません）+ 勾选「名前と会社だけの連絡先として残す」（默认开）。效果：连接记 `unlinked_at`；我这边按勾选保留为普通联系人（只留名字和公司，其余共享字段清掉，记历史）或墓碑删除；对方那边那条**由招待新建的**联系人墓碑删除（对方之后写过的备注随记录保留在存储里，可恢复），**统合进对方原有名刺的**只结束连接、去掉「本人入力」，名刺原有的值保留（§9 #19）。动作表不因点遮罩关闭。解除不通知对方（对标 LinkedIn）。
- **再连接**：解除后双方可以再用新码连上；连接是一张新表里的行（§3.2），再连 = 新的一行，不受旧行影响（复核 M4）。

### 2.7 その他：連絡先・LinkedIn・CSV・イベントから（R16）

- **連絡先（App）**（⑨ A2 ①–④）：先解释再请求通讯录权限（读取 氏名・会社・役職・電話・メール；Orbit 不会联系对方；可以只选一部分）；选人页「取り込む人を選ぶ · iPhone の連絡先 1,284件」，默认「選んで取り込む」并按**规则**预选「像工作关系的人」（有公司名 / 公司域名邮箱 / 职称关键词，排除「母」「〜店」「病院」等个人用名字，`?` 展开依据）；筛选 chip 会社名あり / 仕事のメール；「N人を取り込む」→ 整理中（读入 → 与人脈对照 → 公司名统一写法 → 准备确认，关掉也继续）→ まとめて確認（R12 的同一组件：重複 / 要確認 / そのまま追加）→ 完成。Google 通讯录：说明导出 vCard 后从「ファイル」选（不做 OAuth，⑨ A2 ①）。被拒：回「人脈を追加」，不反复追问。
- **連絡先（Web）**：上传 vCard（.vcf），之后同上。
- **LinkedIn CSV**（⑨ A3）：App 说明 3 步（LinkedIn 设置 › データのコピー › Connections，「LinkedIn とは連携しません · パスワードは聞きません」）+「CSV を選ぶ」（`expo-document-picker`）；Web 拖放 CSV 或 ZIP（自动解压）→ 列の対応を確認（可改映射，「メール 341人中 12人のみ」提示）→ まとめて確認 → 完成。公司不同的同名人默认不统合（可能转职），加入后在人物页提示冲突（⑨ A7，提示由 R11 详情承担）。
- **汎用 CSV / Eight**：同 LinkedIn 的映射页（`format = generic`），自动猜列。
- **イベントから**（Web 现有功能保留）：从参加过的活动导入交换过的人（现有 `kind = event`），进同一确认页。
- 全部走现有 `contact_import_*` 表和 `/api/contacts/import/**`（W0053 已有解析、查重、分块提交、撤销）；App 新接这套接口，Web 换新界面。

### 2.8 あとで補完：每天一问（R16）

- 契约 3（R08，负责人甲 R16）转 live：每人每东京日最多出 1 题，**规则出题、不调 AI**：挑一个浓度 ●○○、最近 30 天导入或新加的人。题型两种起步（§9 #24）：
  - 「〇〇さんとは、どこで？」：选项 = 与这个人加入时间相近（±14 天）的我参加过的活动（最多 2 个）+ 与对方同公司的我的其他联系人推出的「前職の同僚」（有才出）+ 固定「紹介」「覚えていない」。
  - 「〇〇さんの会社は？」（缺公司时）：选项 = 对方邮箱域名推出的公司名（有才出）+「自分で入力」+「覚えていない」。
- **写到哪里**（复核 M9）：活动 → 联系人的 `metEventId`（现有字段，与名片的活动归属同一个）；「紹介」「前職の同僚」→ 联系人的「出会い」备注行（现有联系人备注，一行「出会い：紹介」）；公司 → 联系人的 `organization`（现有联系人更新服务，R16 开工时核对入口）；「覚えていない」只记在问题记录上。浓度按 D-10 重新计算——LinkedIn 进来的人多数没有邮箱，答了「どこで」浓度可能仍是 ●○○，SC 只要求「这个人的信息多了一项、浓度按 D-10 重算」。
- 「明日」= 今天跳过、不计入判断待ち；同一个人连续跳过 3 次不再问他（⑨ A7、D-11）。日期口径统一为东京日（契约 3 的 `askedOn` 注释从「the person's time zone」改为「Tokyo day」，注释改动不影响快照）。
- **显示位置不归本组**：App Task › To-do「判断待ち」（R20）、Web 人脈右栏「今日の 1問」（R11）、首页（R10）。R16 交付 live 接口 + 两端各一个现成的卡片组件（`CompletionQuestionCard`，放进各自组件目录与展示页），由乙挂到自己的屏上（§8）；任一端答了，另一端刷新后消失（服务端状态）。

### 2.9 待确认的联系人草稿（R12，复核 M8）

旧「导入中心」里的「草稿队列」承担着两件现有功能：活动会后「去复核联系人」（`EventDetailScreen.tsx:1320` → `reviewQueueHref`）和「参加者からの下書き取り込み」（`ContactAcquisitionScreen.tsx:141,631` 的 `?eventId=`）。新设计没有画它，但不能随旧屏一起消失：

- App 新路由 `contacts/new/drafts`（`?eventId=` 可选）：用新组件列出现有 `/api/contact-drafts` 的待确认草稿（现有接口、现有确认 `/api/contact-drafts/[id]/confirm`），每条「確認して追加 / 破棄」；带 `eventId` 时顶部给「参加者から取り込む」（现有 `POST /api/contact-drafts/event-attendees/import`）。入口：「人脈を追加」页上的「確認待ちの下書き N件」（有草稿时才显示）和活动的 `reviewQueueHref`。
- Web 没有草稿队列页（现状），不新增。
- 以后 R20 的「判断待ち」若把草稿也列进去，这一页可以删；交接写进 R12 REPORT。

## 3. 数据与迁移

### 3.1 R12：不建表

- **名片**：继续用 ingest-v2（`bc_ingest_*` 七张表，`getConfiguredIngestV2` **CRITICAL** 27）。**服务端不新增批次动作**（复核 S2：`confirmCard` 自己开事务、锁批次行，不能在外层锁里逐张调；洞察、活动归属副作用在处理函数 `createConfirmLikeHandler` 里；Web 已有客户端自动导入）。读完自动进人脈由客户端按共享规则调现有确认接口完成（§2.2 第 5 步）。服务端只改两处只读：
  - v2 `duplicates` 接口（`createIngestV2DuplicateCandidatesHandler`，只读）在现有候选之外追加「同名」候选（§2.3 规则，`matchedOn` 新值 `'name'`，响应宽进；`identical` 恒为 false，不会触发自动并入）；
  - 无别的服务端改动。`confirmCard`、worker、迁移都不改。
- **手入力**：新接口 `POST /api/contacts/manual`（§4.1）直接写联系人：查重用 `findContactCandidate` + 同名规则（新纯函数 `shared/compute/contact-name-match.ts`）；新建用现有 `saveContact`（`orbit_records` 的 `contacts` 集合）；统合用**新的字段覆盖写入函数** `applyContactFieldValues`（`features/contacts/contact-field-write.ts`，复核 M5）：按字段写入（覆盖或清空），用存储的 `updateRecordIfCurrent` 做乐观并发，被覆盖的旧值写进联系人 payload 新增的 `fieldHistory` 数组（每条 `{ field, previous, next, source: 'manual' | 'invite' | 'invite_sync', at }`，最多保留 50 条）。R12 开工时核对 `contacts` 记录的读取方有没有 `exactKeys` 一类的白名单（`contact-actor-links` 就有），有就改用 `evidence` 集合存历史，二选一写进 REPORT。现有 `mergeCardIntoContact`（只补空字段）不改，名片继续用它。
  - 建完入队计划候补（`enqueuePlanMatchJob`，现有，LOW）。
  - 撤销：同一接口新建的联系人（记录上带 `createdVia: 'manual_v2'` 与 `createdAt`）在 10 分钟内、`updatedAt = createdAt` 时，`POST /api/contacts/manual/[contactId]/undo` 用存储的 `deleteRecord`（墓碑删除，`lifecycleState = deleted`，App 同步靠它知道删除，复核 m7）删除，并把这个联系人的待处理计划候补任务标记取消（`features/plans/matching-repository.ts` 现有的取消 / 删除入口，开工时 impact，没有就只追加一个按联系人取消的方法）；否则 409 `UNDO_EXPIRED`。
  - 旧 `/api/contact-drafts/manual`（草稿 → 确认）**不动**，计划 v2「线下聊过」（R24）还在用。
- **浓度**：`shared/compute/contact-density.ts`（§3.4）。

### 3.2 R15：迁移「invite-codes-core」（本机验证；生产另行授权）

新模块 `features/invite-codes/`，迁移写法同 `features/plans/migrations.ts`（advisory lock + 模块自己的 `invite_codes_schema_migrations` + checksum，只追加），一个事务。workspace 是部署级的 `ORBIT_WORKSPACE_ID`（`shared/storage/live-database-config.ts:57-58`），A、B 在同一个 workspace，只是 `actor_id` 不同（复核 M4）：

1. `invite_codes`：`workspace_id, id, actor_id, code text`（8 位，字母表 `23456789ABCDEFGHJKMNPQRSTVWXYZ`，不含 0/O/1/I/L/U，存去掉连字符的形式）`, shared_keys text[]`（发码时选择共享的**字段键**，值在用的时候从资料读）`, max_uses smallint not null default 10 check (max_uses between 1 and 10), used_count smallint not null default 0 check (used_count >= 0 and used_count <= max_uses), expires_at timestamptz not null, revoked_at timestamptz`（用户作废）`, superseded_at timestamptz`（被新码替换，复核 m9）`, created_at, idempotency_key text`；
   - `unique (code)`；
   - 部分唯一索引「每人同时只有 1 个可用码」：`unique (workspace_id, actor_id) where revoked_at is null and superseded_at is null`。发新码的事务先给本人所有未作废、未替换的码写 `superseded_at`（过期的码也写，免得占索引），履历按「作废 / 被替换 / 过期 / 满员 / 有效」显示各自的状态；
   - `unique (workspace_id, actor_id, idempotency_key)`。
2. `invite_connections`（**连接本身**，代替原设计里的 `invite_code_redemptions` 与 `contact_actor_links`，复核 M4）：`workspace_id, id, code_id → invite_codes(id), inviter_actor_id, redeemer_actor_id, outcome ('connected','merged'), inviter_contact_id`（A 人脈里的 B）`, redeemer_contact_id`（B 人脈里的 A）`, inviter_shared_keys text[], redeemer_shared_keys text[], inviter_synced jsonb, redeemer_synced jsonb`（各自那条联系人上每个共享字段「上次同步的值」与时间，用于同步与冲突判断）`, redeemer_idempotency_key, created_at, unlinked_at, unlinked_by`；
   - `unique (workspace_id, redeemer_actor_id, redeemer_idempotency_key)`；
   - 同一对人只能有一条生效连接：`unique (workspace_id, least(inviter_actor_id, redeemer_actor_id), greatest(inviter_actor_id, redeemer_actor_id)) where unlinked_at is null`——B 已经和 A 连着时，无论谁的码都返回 `already_connected`，不占用量；解除后再连 = 新的一行；
   - 用量：同一事务里 `update invite_codes set used_count = used_count + 1 where id = … and used_count < max_uses and revoked_at is null and superseded_at is null and expires_at > now() returning …`，0 行 = 满了 / 过期 / 作废；并发 20 个兑换剩 1 人的码只成功 1 个（数据库约束保证，不靠进程内锁）。
3. `invite_code_attempts`（限流计数，§6）：`bucket text, window_start timestamptz, count integer not null, primary key (bucket, window_start)`；只存 IP 的 HMAC，不存原 IP；超过 2 天的窗口由维护任务 `invite_attempts_cleanup` 清理。
- **联系人**：两边都写现有 `contacts` 集合（`saveContact` / 字段覆盖写入函数 `applyContactFieldValues`，§3.1），在**同一个数据库事务**里与连接行一起写（先例：v2 名片确认的 `buildTxContactService`，`batches/v2/handlers.ts:708`）。不使用 `contact_actor_links`（它的读取用 `exactKeys`、撤销后不能重新激活、锁在进程内，是活动主办账号初始化的数据；不碰）。
- R11 判断「本人入力」：R15 导出只读函数 `inviteLinkedContactIds(actorId)` 与 `GET /api/invite-codes/connections/[contactId]`（§4.2）。

### 3.3 R16：不建表

- 导入用现有 `contact_import_batches / rows / followups`（`features/contacts/import/migrations.ts`），格式已有 `linkedin | generic | vcard | event`。上传是**原始请求体 + 头**（`x-orbit-import-kind`、`idempotency-key`、`x-orbit-import-file-name`，`import/handlers.ts:136-149`，复核 m8），App 用 `fetch` 发文本即可。App 的「連絡先」在端上把选中的人转成 vCard 文本再走 `kind = vcard`（服务端零改动，§9 #21）。服务端不解 ZIP：Web 端用 `fflate@0.8.2`（纯 JS）在浏览器里解出 `Connections.csv` 再上传；App 只收 CSV（LinkedIn 邮件里的 ZIP 在「ファイル」App 里点开就是 CSV，说明页写明）。
- 每天一问存 `orbit_records` 集合 `contactCompletionQuestions`（D-11 原定集合，不建表）：`{ id, actorId, contactId, kind: 'met_where' | 'organization', options[], askedOn（东京日）, answeredAt?, answer?, skipCount }`；答案按 §2.8 写进联系人现有字段 / 备注。

### 3.4 共享常量与纯函数（`shared/compute`，两端同步）

- `contact-density.ts`（R12，交接 R11）：D-10 原文——●○○ 只有身份；●●○ 有联系方式（邮箱 / 电话之一）**且**有相遇场合（`metEventId` 或「出会い」备注）；●●● 有目标关系（计划已关联）或往来（面谈 / 笔记 / 互动记录），或本人入力。输入是联系人摘要，输出 1 | 2 | 3 与理由键。
- `card-auto-import.ts`（R12）：从 Web `card-batch-model.ts` 搬出的 `isAutoImportEligible` / `isAutoMergeEligible` 判定（输入改成与端无关的最小字段集），两端共用；Web 原函数改为调用它，行为不变（现有测试守住）。
- `contact-name-match.ts`（R12）：姓名规范化（全半角、空白、大小写、日文姓名间空格）与「同名」规则。
- `signature-split.ts`（R12）：粘贴签名拆字段的规则（邮箱、电话、邮编、URL、法人后缀词典、首行姓名），返回 `{ field, value, start, end, confidence }[]`，Web 抽屉用来高亮原文片段。
- `invite-code-format.ts`（R15）：字母表、规范化（大写、去空白与连字符）、显示格式 `XXXX-XXXX`、手输校验。
- `invite-message-templates.ts`（R15）：三种语气 × 三语的消息草稿模板（零 import 常量，进 `copy:qa`）。
- `work-contact-likelihood.ts`（R16）：通讯录「像工作关系」的规则预选与依据文字键。
- `vcard-build.ts`（R16）：通讯录条目 → vCard 3.0 文本，与服务端解析器做往返测试。
- `completion-question-rules.ts`（R16）：出题规则（挑人、挑题型、选项生成）的纯函数部分；读库在服务端。
- 放 `shared/compute` 的理由同 plan-v2.2/DESIGN §3.4：App 同步白名单整目录放行，不改热点文件；纯函数不碰 IO、时钟（「今天」由调用方传入）。

## 4. 契约（只加不改；每个 Sprint 第一天先提交）

所有新响应宽进（不用 `.strict()`，枚举用 `tolerantEnum` / `knownValues`，列表用 `readableItems`），请求体严格（通用规则 10）。新文件头写负责人（甲）和使用方。

### 4.1 R12

- `shared/contract/business-card-batch.ts` 追加：`IngestContactCandidateContract.matchedOn` 加值 `'name'`（同名候选，`identical` 恒为 false）。读取端：App `src/api/schema/business-card-batch.ts` 与 Web 的候选读取要先改成 `tolerantEnum`（未知值落到 `'name_organization'`），**同一个契约提交里先改读取端再加值**（复核 S1 的教训：先确认所有读取端宽进）。
- 新契约 `shared/contract/manual-contact.ts`：`ManualContactCreateInput { displayName; organization?; role?; email?; phone?; metContext?: { kind: 'event' | 'intro' | 'other'; eventId?; label? }; note?; mergeIntoContactId?; fieldChoices?: Partial<Record<'displayName' | 'organization' | 'role' | 'email' | 'phone', 'existing' | 'incoming'>>; allowDuplicate?: boolean; idempotencyKey }`（strict）→ `ManualContactCreateResult { outcome: 'created' | 'merged' | 'duplicate_review'; contactId?; candidates?: IngestContactCandidateContract[]; undoUntil? }`（`outcome` 用 `tolerantEnum`，未知值兜底 `'duplicate_review'`——界面会再问一次而不是当成功，复核 m10）；`ManualContactDuplicateCheckInput { displayName; organization?; email?; phone? }`（strict）→ `{ candidates }`（只读，≤3 条）；`ManualContactOrganizationSuggestion { name; contactCount }[]`。复用名片的候选类型，查重一种口径。
- 路由：`POST /api/contacts/manual`、`POST /api/contacts/manual/duplicates`、`GET /api/contacts/manual/organizations?q=`、`POST /api/contacts/manual/[contactId]/undo`。

### 4.2 R15

- `shared/contract/invite-codes.ts`（R08 契约 4）追加：
  - `InviteSharedFieldKey = 'organization' | 'offering' | 'seeking' | 'email' | 'phone'`（名字总是共享）；`InviteSharedFields` 加可选 `offering?: string[]`、`seeking?: string[]`、`email?: string`、`phone?: string`（**只出现在响应里**：服务端按键从资料读出的值；预览永远不含 `email` / `phone`）；
  - `InviteCodeCreateInput` 加可选 `sharedKeys?: InviteSharedFieldKey[]`；live 实现**只认 `sharedKeys`**、忽略客户端传来的 `shared` 值（`shared` 仍是必填字段，因为 R08 已定、只加不改；值一律由服务端从资料读，客户端传什么都不影响对方看到的内容，复核 M7）。mock 同样行为；
  - `InviteCodePreview` 加可选 `status?: 'active' | 'expired' | 'full'`（缺省 = active；已作废、被替换、不存在、过期超过 30 天仍是 404，§6）、`inviterAlreadyConnected?: boolean`、`isOwnCode?: boolean`（登录时才算）；
  - `InviteCodeRedeemInput { idempotencyKey; sharedKeys: InviteSharedFieldKey[] }`（strict，新类型）。R08 的 redeem 原来没有请求体，现在要求请求体——这是请求侧的变化，只有 mock 与演示世界在用，`BREAKING.md` 记一行说明（复核 m10）；
  - `InviteCodeRedeemResult` 加可选 `peer?: InviteSharedFields`（对方共享给我的，完成页用）；
  - `InviteCodeHistoryItem { code; createdAt; expiresAt; status: 'active' | 'expired' | 'revoked' | 'superseded' | 'full'; usedCount; maxUses; joined: { contactId; displayName; joinedAt }[] }`（`status` 宽进兜底 `'expired'`）与 `InviteCodeHistoryResponse { items }`（`GET /api/invite-codes`）；
  - `InviteConnectionView { contactId; connectedAt; via: { code }; sharedByMe: InviteSharedFieldKey[]; sharedByPeer: InviteSharedFieldKey[]; pausedFields: InviteSharedFieldKey[] }`（`GET /api/invite-codes/connections/[contactId]`，不是招待连接时 404）、`InviteShareUpdateInput { sharedKeys; idempotencyKey }`（`PUT …/share`，strict）、`InviteUnlinkInput { keepAsContact: boolean; idempotencyKey }`（strict）→ `InviteUnlinkResult { outcome: 'unlinked'; keptContactId? }`（`POST …/unlink`）。
- **不改** `SourceTypeCode`（复核 S1）：招待来的联系人 `sourceType = 'referral'`，联系人 payload 记 `acquisition.via = 'invite_code'`；「本人入力」由 `inviteLinkedContactIds` 判断，R11 把它映射成已有的 `sourceChip = 'self'`。
- 收件箱：用**已有**的 `InboxSourceKind = 'contact'`、`kind = 'update'`、`target.kind = 'source'`（href 指向联系人详情），不加枚举值（§8 R13 行、§9 #22）。
- mock：`mock-service.ts` 的 redeem 改为真正递增 `usedCount`、检查过期 / 上限、返回 `already_connected`；演示世界加 2 条历史与 1 个 `already_connected` 场景。

### 4.3 R16

- 新契约 `shared/contract/contact-import.ts`：把 Web 现有 `/api/contacts/import/**` 的响应形状（批次、行、问题、统计、映射）提升为共享契约（W0053 的类型留在 `features/contacts/import/types.ts`，契约只描述 HTTP 形状），App 从这里读；请求体（改映射、改行决定、提交）严格；上传仍是原始请求体 + 头（§3.3），契约里写明头的名字与取值。
- 契约 3 `contact-completion.ts` 追加：`ContactCompletionQuestion` 加可选 `contactName?`、`contactSubtitle?`、`sourceChip?`、`kind?: 'met_where' | 'organization'`（`kind` 宽进兜底 `'met_where'`）；`ContactCompletionResult` 加可选 `densityAfter?: 1 | 2 | 3`；`askedOn` 注释改为东京日。
- `REDESIGN_CONTRACT_CAPABILITIES` 的 `contact-completion` 加 live 实现。

## 5. AI 调用

**这一组没有新增付费 AI 调用。**

| 环节 | 用什么 | 说明 |
| --- | --- | --- |
| 名片读取 | **现有** DeepSeek 两阶段 OCR（`deepseek-v4-flash-vision-exp` 转录 → `deepseek-v4-flash` 结构化，两阶段都禁用 thinking，每阶段 60 秒；Gemini 兜底） | 已上线，不改提示词、不改 provider。本机真实验证每个 Sprint 最多 5 次（任务授权），次数和结果写 REPORT |
| 名片确认后的即时洞察、补全 | **现有** `insight` / `enrichment` 用途 | 自动进人脈仍逐张走现有确认接口，副作用不变，次数不增加（逐张确认本来也会触发） |
| 计划人物类型候补（招待、名片、手入力、导入后） | **现有** 计划候补管线（规则层 + C12 matcher，用途与提示词都是 R24 已授权的） | 只是让更多新联系人入队；每个后台池日上限 60 不变 |
| 签名拆字段、通讯录预选、公司名统一、姓名拆分、每天一问出题 | **规则** | 不调 AI（§9 #13、#20、#24） |
| 招待消息草稿 | **固定模板** | 不调 AI（§9 #23） |

- 名片 OCR 现在**不经过** AI 账本（`features/acquisition` 没有 `reserve`），成本由 `BusinessCardCloudOcrUsage` 记在批次上。把它接进账本需要新用途 + 账本迁移，属于成本治理，不在本组（列进 §11 后续建议）。
- 如果之后要把「签名拆字段」「公司名统一」换成 AI，按 plan-v2.2 的口径另行设计、mock 先行、逐项授权。

## 6. 公开预览的限流与防枚举（R15，README 合回前清单）

威胁：`GET /api/invite-codes/[code]/preview` 不登录可读（`proxy.ts:28-30`），返回邀请人的名字和公司。要防止批量扫描和对单个码的暴力尝试，同时不能误伤活动会场里共用一个网络的人。

**为什么主要靠码空间 + 失败计数就够**：码 8 位、字母表 29 个字符，共 29⁸ ≈ 5×10¹¹ 个；就算全站同时有 10 万个可用码，随机猜一次命中的概率约 2×10⁻⁷。每个 IP 每小时最多失败 60 次，一个 IP 一年猜中一个码的期望次数约 0.1；要靠大量 IP 扫描，成本与收获（一个名字和公司）不成比例。

1. **码本身**：服务端 `crypto.randomInt` 生成；全局唯一冲突时重试（最多 5 次）；码不含姓名（§9 #15）。
2. **统一的「不可用」**：不存在、已作废、被替换、格式不对、过期超过 30 天，响应完全相同——`404 { success: false, error: { code: 'INVITE_UNAVAILABLE' } }`；被限流是 `429` + 同一个 code + `Retry-After`。只有**真实存在、没作废、没被替换、过期不到 30 天**的码才会返回 `expired` / `full`（页面要显示「请对方重发」；能看到的只是对方的名字和公司，且需要先拿到真码）。
3. **客户端 IP 取哪个头**（复核 M7）：只认平台写入的 `x-real-ip`（Vercel 在边缘覆盖写入，客户端伪造无效）；没有这个头（本机）时用固定桶 `local`；**不读** `x-forwarded-for`。测试：伪造 `x-forwarded-for` 不影响计数。
4. **按 IP 限流**（HMAC 后的 IP，§3.2）：
   - 预览总量：每 IP 每 10 分钟 60 次、每天 500 次（活动会场多人共用一个出口 IP，门槛放宽；超过 → 429）。
   - **失败计数**：每 IP 每小时失败（404）60 次后，这个 IP 在本小时剩余时间里**所有**预览都返回 429（包括真码——否则被锁的 IP 仍能靠「真码 200 / 假码 429」继续区分，锁定就没意义了）。门槛 60 是为会场里十几个人手输打错留余量。
   - 已登录的预览（App 内、已登录的浏览器）按账号计数（每账号每小时失败 30 次），不占 IP 的额度，会场里登录的人互不影响。
   - **不做全站熔断**：全站熔断会让攻击者用很少的请求让所有新用户打不开邀请（复核 M7）；靠上面的按 IP 计数与码空间。
5. **兑换**要登录：每账号每天最多兑换 20 次、失败 10 次；**同时按 IP 计失败**（与预览共用失败桶），防止换账号绕过；兑换的失败响应与预览同样统一（不存在 / 作废 / 被替换 / 格式错 → 同一个 404；过期、满员、自己的码、已连接有各自的 409 code，因为都需要先拿到真码）。
6. **只共享键**：发码和兑换都只传「共享哪些项」，值由服务端从本人资料读；预览永远不返回邮箱和电话（连上之后才交换）。
7. **密钥**：HMAC 用 `ORBIT_INVITE_RATE_SECRET`；缺省时从 `AUTH_SECRET` 用 HKDF 派生（`info = "orbit-invite-rate-v1"`，不直接复用同一把密钥）；两者都缺 → 这几个接口在 live 下返回 503，不退化为不限流。
8. **页面**：`/i/[code]` 服务端渲染时走同一个服务（同一限流），不额外开接口；`noindex, nofollow`、`Referrer-Policy: no-referrer`；`<title>` / OG 不带邀请人名字（§2.5 第 8 条）。
9. **日志**：只记 HMAC 后的 IP 和码的前 2 位，不记完整码与原始 IP。
10. **测试**（R15 SC）：未知码 / 作废码 / 被替换 / 格式错 / 过期 31 天 五者响应逐字节相同；第 61 次失败后真码也 429；伪造 `x-forwarded-for` 无效；不同 IP 互不影响；登录账号的计数与 IP 分开；窗口过期恢复；并发 20 个兑换同一个剩 1 人的码只成功 1 个；换账号兑换仍受 IP 失败计数约束；密钥缺失时派生、都缺时 503；预览响应里没有邮箱和电话；日志不含完整码与原始 IP。

## 7. 两端界面与路由

| 画面 | Web | App | Sprint |
| --- | --- | --- | --- |
| 人脈を追加（入口） | `/app/contacts/new`（ShellPage，重写；右侧抽屉承载手入力 `?add=manual`、Modal 承载招待 `?add=invite`） | `contacts/new`（普通页面，重写；同内容的 `AddContactSheet` 组件给 R11） | R12（招待 / その他 两组入口在 R15 / R16 打开） |
| 名刺 · 拍 / 传 | `/app/contacts/new/scan`（新页：拖放 + はじめての方へ） | `contacts/new/scan`（重写：指导 → 权限 → 相机 / 相册） | R12 |
| 名刺 · 读取 / まとめて確認 / 完成 | `/app/contacts/new/scan/[batchId]` | `contacts/new/scan/[batchId]` | R12 |
| 手入力 | `/app/contacts/new?add=manual` 抽屉 | `contacts/new/manual`（重写） | R12 |
| 待确认草稿 | — （Web 现在就没有） | `contacts/new/drafts`（新，§2.9） | R12 |
| 招待 · 发出方 | `/app/contacts/new?add=invite` Modal（560 / 390 sheet） | `contacts/new/invite`（说明 / 共享 / 草稿 sheet / 履历） | R15 |
| 招待 · 接收方 | `/i/[code]`、`/i`（公开，壳外，响应式） | `i/[code]`、`i/index`（通用链接 / `orbit://i/…` 打开时用） | R15 |
| 解除 / 共有する項目 | 组件（R11 的详情页挂） | 组件（同上） | R15 |
| その他 · 导入选择 | `/app/contacts/new/import`（新页：連絡先 vCard / LinkedIn / CSV / イベントから） | `contacts/new/import`（連絡先 / LinkedIn） | R16 |
| 导入 · 映射 / まとめて確認 / 完成 | `/app/contacts/new/import/[importId]` | `contacts/new/import/[importId]` | R16 |
| 每天一问 | `CompletionQuestionCard`（组件，R11 / R10 挂） | `CompletionQuestionCard`（组件，R20 / R10 挂） | R16 |

- **两端路径完全相同**（`route-parity` 只扫 Web 的 `app/(app)/app/**/page.tsx`，按同一路径比对，不需要例外）。`/app/contacts/new/**` 已在 `ORBIT_PRIVATE_APP_PREFIXES`（`/app/contacts` 覆盖）；`/i/**` 是公开页，放在 `app/i/` 下（不在 `(app)` 组：没有壳、不经过 `proxy.ts` 的 `/app/:path*` 与 `/api/:path*` matcher，所以也不走登录前缀、引导门禁和 `?lang=` 处理——页面自己按浏览器语言选文案）；`audit:full-product` 扫整个 `app/`，`/i` 两页进审计计数。App `i/**` 不进 `PRIVATE_ROUTE_PREFIXES`（未登录可开，页面内引导登录后回到原地），`contacts/new/**` 已私有。
- App 新路由走 HOW-TO §7 的 4 处登记；`parentForPath` 不改（`contacts/new/*` → `/contacts/new`，即入口页）；离线策略全部 `online-only`。
- **删除的旧路由**：App `contacts/new/batch/[id]`、`contacts/new/batch2/index`、`contacts/new/batch2/[id]`、`contacts/new/import/[id]`（v1 名片文件导入；R16 之后同名路径的含义变成联系人导入批次）、`invitations/[token]`；Web `/app/invitations/[token]`。
- **旧链接**（复核 m2、m14）：
  - App `initial-route.ts` 的旧链接翻译：`/contacts/new/batch2/<v2 id>` → `contacts/new/scan/<id>`；`/contacts/new/batch/<v1 id>` 与 `/contacts/new/import/<uuid>`（v1）→ `contacts/new/scan`（v1 批次已不能在新界面打开，入口页顶部提示「以前の読み取りは人脈に反映済みです」）。
  - Web `/app/contacts/new`：`?job=<v2 id>` → `/app/contacts/new/scan/<id>`；`?method=scan` → `/app/contacts/new/scan`；`?method=csv|contacts|event` 与 `?import=<id>` 在 R12 期间仍渲染旧 `NetworkImport`（临时落点），R16 改为 redirect 到 `/app/contacts/new/import…`（带上 `?import=`）。这些旧链接出现在 R11 / R21 / R28 的文件里（`network-shell.tsx:49`、`iorbit-home.tsx:104`、`analysis-threshold.ts:67`、`start-step-cards.tsx:15`），靠 redirect 兼容，不改别人的文件。
  - 收件箱投影 `inbox-business-projections.ts:19-23` 的批次通知：v2 批次 href 改成 `/contacts/new/scan/<id>`，v1 批次 href 改成 `/contacts/new/scan`（按 `pipeline` 区分，乙的文件，一行改动，R12 REPORT 通知乙）。
- 组件只用 R04 / R06 组件库（BottomSheet / Drawer / Modal、ListRow、Toast、States、AI 类确认卡）；业务组件（名片缩略托盘、三格计数、重复对照卡、要確認分组、招待 QR 卡、共享项目开关组、导入映射表、每天一问卡）在各自目录新建：Web `orbit-2026/add/`、App `src/screens/add/`；文案 Web `orbit-2026/copy/add.ts`、App `src/i18n/*/add.ts`（新字典域，按 HOW-TO §6 登记）。
- 依赖：两端 `qrcode-generator@1.4.4`（纯 JS、无原生代码、MIT）生成 QR 矩阵，用 SVG 画（App 已有 `react-native-svg`）；Web `fflate@0.8.2`（纯 JS，R16 解 LinkedIn ZIP）；App 新增 `expo-clipboard`（R15）、`expo-contacts`（R16），版本取 Expo SDK 57 对应版本，权限文案写在 `app.config.ts` 的 `infoPlist`（复核 m8），需要重建开发包。

## 8. 与其他 Sprint 的接口（谁等谁）

原则：每个 Sprint **第一天先提交契约**，乙的 Sprint 从那天起可以按新形状接 mock；对方没做完时按 HOW-TO §4 / §5 隐藏或空态，不阻塞。动乙的热点文件和屏之前先在 REPORT 写明并通知。

| 对方 Sprint | 对方要用的 / 我们要用的 | 接口 | 谁等谁 |
| --- | --- | --- | --- |
| **R11 人脈**（乙） | 人脈右上「＋」弹加人 sheet；新联系人出现在一覧（来源 chip、浓度、「最近追加」）；联系人详情上的「情報を濃くする」三入口、「本人入力」标记、「共有する項目」与「つながりを解除」、同步暂停字段的提示；计划候补确认卡 | 组件 `AddContactSheet`（App）/ `AddContactDoors`（两端）；`shared/compute/contact-density.ts`（R12 先写，交 R11 接管）；招待联系人 `sourceType = 'referral'` + `acquisition.via = 'invite_code'`、`inviteLinkedContactIds(actorId)` → R11 映射成已有 `sourceChip = 'self'`；`InviteConnectionView` + `InviteShareSheet` / `InviteUnlinkSheet`（R15）；联系人 payload 新增的 `fieldHistory`（R12 / R15 写，R11 详情可展示「以前の値」）；计划候补确认卡沿用 R24 的 `contacts/[contactId]/fit` | **R11 不等**：现有人脈页的「＋」链接指向 `contacts/new`，已经是新入口页；R11 未接详情页前，解除与改共享项目从组件展示页和 API 测试验证（REPORT 写明），不影响连接本身 |
| **R13 / R14 收件箱 · 推送**（乙） | 「邀请被接受」通知与推送；名片读完通知的落点 | 用现有 `InboxSourceKind = 'contact'`、`target.kind = 'source'`（不加枚举值）；推送走现有投递服务，计入每天 3 件；名片批次通知 href（`inbox-business-projections.ts:19-23`，按 v1 / v2 区分，乙的文件，一行改动，R12 通知）；App 推送落地白名单 `notification-model.ts` 加 `/contacts/*`、`/contacts/new/scan/*`（乙的文件，**先提需求**；R14 未改前推送点开落到收件箱，不报错）；旧关系邀请接口（`/api/relationship-communication/invitations/**`，接受后建会话）的去留由乙决定 | 互不阻塞 |
| **R20 Task**（乙） | 读不出的名片、每天一问、待确认草稿进「判断待ち」 | `GET /api/contacts/completion-question`（R16 live）+ 组件 `CompletionQuestionCard`；读不出的名片在 v2 批次里（现有接口）；待确认草稿 = 现有 `/api/contact-drafts`（R12 的 `contacts/new/drafts` 是过渡落点，判断待ち接上后可删） | R20 不等；R16 未完成前接口是 mock |
| **R10 首页**（乙） | 首页人脈组件空态「名刺をスキャン」；「今日の 1問」 | 链接 `contacts/new/scan`（路径保留）；同上 completion 接口 | 不等 |
| **R18 账户**（乙） | マイページ「招待コード」行；接收方的简短资料页、注册后回跳 | 链接 `contacts/new/invite`；接收方资料页**调用**现有资料保存接口（不改）；注册页 / `use-account-auth.ts` 的回跳只改「`next` 是 `/i/…` 时直接回去」这一个分支，`normalizeOrbitAuthReturnPath` 只追加 `/i/…` 分支（R15，CRITICAL，REPORT 写对策并通知乙）；资料同步由 R15 的维护任务读资料 `updatedAt`，**不改**资料保存代码 | 不等 |
| **R21 iOrbit / R28 引导**（乙 / 待定） | 引导第 1 步名片（≥3 张）、iOrbit 里的待处理名片 | 现有 `useCardBatch` / `CardBatchHost`（**CRITICAL**）：R12 只改两处——自动导入判定改为调用 `shared/compute/card-auto-import.ts`（行为不变）、让位前缀收窄为 `/app/contacts/new/scan`；引导直接调 v2 接口的地方（App `profile-onboarding.ts`）不动；旧 `card-batch-ui.tsx` 里被引导 / 开始指南用的部分保留在允许清单里等 R28 | 不等 |
| **R24 计划**（甲，已完成） | 新联系人进计划候补 | 手入力、招待的新联系人直接 `enqueuePlanMatchJob`；v2 名片批次完成时现有入队不变；导入 commit 现有入队不变 | 已可用 |
| **R26 / R27 活动**（甲） | 名片「会った場所」、手入力「出会った場所」候选、导入「イベントから」、会后「去复核联系人」 | 现有 `/api/agent/event-attribution/candidates`、参加记录；`events.ts` 的 `reviewQueueHref` 改指 `contacts/new/drafts`（R12 做，甲自己的范围）；活动报名码的界面用词改成「参加コード」以免与招待コード混淆（R26 做，§9 #34） | 不等 |

依赖图（无环）：**R12 → R15**（招待的入口挂在 R12 的「人脈を追加」上）；**R12 → R16**（导入复用 R12 的まとめて確認组件与入口）。R15 与 R16 互不依赖，默认按 R12 → R15 → R16 顺序做。乙的 Sprint 都只依赖各 Sprint 第一天的契约提交。

## 9. 自定决定（对标成熟产品）

| # | 事项 | 决定 | 对标做法 / 理由 |
| --- | --- | --- | --- |
| 1 | Sprint 怎么切 | R12 = 入口 + 名刺 + 手入力 + 待确认草稿；R15 = 招待コード全链路（发出方、接收方 `/i/<code>`、同步、解除、限流防枚举）；R16 = その他导入 + 每天一问 | 按「一条用户旅程一个 Sprint」切，每个都能端到端验收；招待的接收页和发出方共用一套服务与限流，拆开会出现「有码没处兑」的中间态 |
| 2 | Web「人脈を追加」放哪 | 独立页面 `/app/contacts/new`（重写），并导出 `AddContactDoors` 供 R11 改成弹窗 | 设计稿只有弹窗的注释没画弹窗；人脈页是 R11 的文件。Linear / Notion 的「新建」既可在弹窗也可在独立页打开同一组件 |
| 3 | App「＋」sheet | `contacts/new` 做成普通页面，同内容的 `AddContactSheet` 交给 R11 在人脈页弹出（复核 M2） | 透明 modal 路由要改根导航与乙的 `parentForPath`；先页面后 sheet，入口链接零改动 |
| 4 | 未上线的门 | 隐藏，不灰掉 | IMPLEMENTATION-PLAN 依赖口径；Apple HIG 不展示不能用的功能 |
| 5 | 名片「读完直接进人脈」 | 客户端按共享规则 `card-auto-import.ts`（即 Web 现有的 `isAutoImportEligible` / `isAutoMergeEligible`）逐张调现有确认接口；不新增服务端批次动作（复核 S2） | Web 已这样做并验收过（真机 17 张）；`confirmCard` 不能在外层锁里批量调，副作用在处理函数里；只留一份规则、一种执行方式 |
| 6 | 相机实时提示与自动拍 | 不做；只给拍法说明和读不出时的原因 | 需要逐帧图像分析的原生模块，收益小于风险；读不出走「撮り直す」 |
| 7 | 表 / 裏 | **做**：相机切换面，裏面跟上一张表面配对（现有 v2 已支持）；Web 沿用 `useCardBatch` 的自动配对（复核 M1） | 最新 b11 A1 ② 画了；不能删现有能力 |
| 8 | 关掉 App 时读完的卡 | 读取在服务端继续；自动进人脈在下次打开这个批次时执行（Web 由全站 `CardBatchHost` 执行） | 不改 worker（CRITICAL）的代价；推送本来就把人带回批次页。REPORT 写明两端差异 |
| 9 | W0015「有活动归属候选的名片不自动导入」 | **保留**：这些卡进まとめて確認，由用户整批选「会った場所」后确认 | 「默认勾选不是用户的决定」（W0015 原文）；列入 §10 #5 请用户确认是否保持 |
| 10 | 查重规则 | 名片、手入力、招待、导入全部以 `findContactCandidate`（邮箱 / 电话 / 姓名 + 公司，完全相同自动统合）为准，另加「同名」提示规则（姓名相同、一方没有公司 / 邮箱 / 电话时只提示不统合，复核 M6）；导入保留自己的「公司不同不统合（可能转职）」规则 | 一种口径；Google 通讯录「可能重复」同名即提示；旧 `/api/contact-drafts/manual` 不动（R24 在用） |
| 11 | `contact-density.ts` 谁写 | R12 按 D-10 原文先写，交 R11 接管 | 完成页要用；R11 未开工，先写比等更不阻塞；接口就是 D-10 的定义 |
| 12 | 手入力三个版本 | 以 ⑪ A3 为准；粘贴签名只在 Web 抽屉；⑦ b7 的「サブ目標・枠」是计划 v1 用语，作废 | 最新画板；手机上粘贴签名的场景少 |
| 13 | 签名拆字段 | 规则，不调 AI | 邮箱、电话、URL 正则准确率高；姓名和公司靠首行与法人后缀词典；不新增付费调用 |
| 14 | 手入力保存后 | 进详情 + 5 秒撤销（10 分钟内、未改过才可撤；墓碑删除） | Gmail「取り消し」；超过时限或改过的联系人不该被一键删掉 |
| 15 | 招待码格式 | 8 位 `XXXX-XXXX`，去易混字符，**不含姓名**（设计稿的 `7Q2K-SATO` 不采用） | IMPLEMENTATION-PLAN 附录 D-g（隐私）；Zoom 会议号、Slack 邀请码都不含姓名 |
| 16 | 接收方注册 | 用现有注册（邮箱 + 密码 / Google）+ 简短资料页（⑨ 2/3）+ 共享项目，不做 ⑪ ④ 的「只填名字就建账号」（复核 M3） | 无凭据账号无法再登录、也无法防滥用；Slack / Notion 邀请都是先注册再加入；用户原话「注册并填资料」。列入 §10 #1 |
| 17 | 已有对方的联系人 | 两个方向都统合为「本人入力」，共享字段以对方为准覆盖、旧值进历史 | 不产生重复卡；LinkedIn 连接后合并通讯录同一人 |
| 18 | 资料同步 | 维护心跳比对 `updatedAt` 同步（约 10 分钟）；我改过的字段停止同步并提示 | 不改 R18 的资料保存代码；Eight 的「名刺更新」也是异步；用户改过的值不被覆盖（复核 M5） |
| 19 | 解除后对方那边 | 招待新建的那条墓碑删除，统合的那条只结束连接；不通知 | ⑨ A5 ⑤ 原文「相手の人脈からも外れます · 通知はしません」；LinkedIn 移除连接不通知。列入 §10 #2 |
| 20 | 通讯录预选 | 规则（公司名 / 公司域名邮箱 / 职称关键词，排除个人用名字），可展开依据 | D-10 原文；不新增 AI |
| 21 | App 通讯录怎么上传 | 端上转成 vCard 文本，走现有 `kind = vcard` 导入（IMPLEMENTATION-PLAN §1.3 原计划复用 `/api/contact-drafts/external/{candidates,import}`，那套 live 只写草稿、不建联系人，所以改走导入，复核 m13） | 服务端零改动，Web 与 App 同一条管线、同一个まとめて確認 |
| 22 | 「邀请被接受」通知的枚举 | 用现有 `sourceKind = 'contact'`、`target.kind = 'source'` | 读取端遇到未知枚举整条跳过（通用规则 10）；不加值就不需要乙先改读取端 |
| 23 | 招待消息草稿 | 三种语气 × 三语固定模板 | 不新增 AI；邮件止于草稿；LINE / Slack 的邀请文也是模板 |
| 24 | 每天一问 | 规则出题、零 AI；题型只有「どこで会った」与「会社は」两种起步；写进现有字段 / 备注 | D-11；先做最常缺的两个字段 |
| 25 | 删除的旧功能 | 旧「导入中心」里的 QR 扫码连接、外部候选、引荐、旧重复合并页随 `ContactAcquisitionScreen` 删除；**草稿队列保留为新页 `contacts/new/drafts`**（活动会后复核在用，复核 M8）；对应服务端接口保留不删 | 用户 2026-10-07 / 10-08 定稿的 5 个门不含它们。列入 §10 #3 |
| 26 | 旧「关系邀请」 | 删两端页面 `invitations/[token]`；接口保留，去留由乙决定 | 两端都没有创建界面，页面实际无入口；接口属于消息领域 |
| 27 | NFC | 不在本组（IMPLEMENTATION-PLAN D-25、Q9 推荐下一期） | 需要原生 NFC 模块与名札 / 名刺卡实物。列入 §10 #4 |
| 28 | 名片 OCR 进 AI 账本 | 不在本组 | 成本治理问题，需要账本迁移；列进 §11 后续 |
| 29 | v1 名片接口（`/batches`、`/imports`、`/business-card/scan`、`/api/contacts/business-card/confirm`） | 两端不再调用，服务端暂不删 | 旧装机版本（TestFlight）可能还在调；按 W0055 的下线约定另起清理任务 |
| 30 | 「イベントから」导入 | 保留（Web 现有功能），进同一确认页 | 不减已有功能 |
| 31 | 收件箱 / 推送热点文件 | 一行字面量（批次通知 href）由我们改并通知；推送白名单先提需求，不直接改 | 热点归属表：推送与收件箱属乙 |
| 32 | 解除的二次确认 | 底部动作表（R04 组件），不因点遮罩关闭，焦点在「キャンセル」 | R04 复核 M5 的注销确认同一做法 |
| 33 | 「双方推送告知」 | 邀请人收到通知 + 推送；接收方用完成页代替（当时就在页面上） | 给正在看页面的人再推一条是噪音（Slack 加入工作区时只通知邀请人） |
| 34 | 「招待コード」与活动报名码同名 | 加人这边保持「招待コード」；活动报名码改叫「参加コード」（R26 做） | 设计稿两处同名会让用户混淆（复核 m16）；加人这边是 NAV-V3 定稿用词 |
| 35 | 招待联系人的来源枚举 | `sourceType` 用已有的 `referral`，不加 `invite_code`（复核 S1） | `SourceTypeCode` 的读取端是封闭枚举，加值会让人脈列表整页失败；「本人入力」由连接表判断 |
| 36 | 招待连接存哪 | 新表 `invite_connections`，不用 `contact_actor_links`（复核 M4） | 后者是活动主办账号的数据、读取有键白名单、撤销后不能重新激活；新表可以表达「解除后再连」 |
| 37 | 字段覆盖与历史 | 新写入函数 `applyContactFieldValues`，旧值进 `fieldHistory`（或 evidence，开工核对）；现有 `mergeCardIntoContact` 不改（复核 M5） | 手入力统合、招待统合、同步三处都需要「覆盖 + 历史」，只补空字段做不到 |

## 10. 需要用户拍板（已按推荐先做，用户否决再改）

| # | 事项 | 推荐 | 不同意时的影响 |
| --- | --- | --- | --- |
| 1 | 招待的接收方：现有注册（邮箱 + 密码 / Google）→ 简短资料 → 选共享项目 → つながる；不做「只填名字就建账号」（§9 #16） | 用现有注册 + 简短资料 | 若要一屏注册，需要设计无密码登录（邮件魔法链接），是账号体系的改动，归 R18 |
| 2 | 解除后对方那边招待新建的联系人删除、统合的只结束连接，不通知对方（§9 #19） | 删除、不通知 | 若要「保留为普通联系人」，改一个分支；若要通知，加一条收件箱通知 |
| 3 | 随旧「导入中心」删除 QR 扫码连接、外部候选、引荐、旧重复合并页；草稿队列保留为新页（§9 #25）。影响：App 上不再有「扫别人 Orbit 二维码直接加」——新的二维码只用于招待コード | 删除（接口保留），草稿队列保留 | 若要保留某一项，需要在新「人脈を追加」里补一个门，并补设计 |
| 4 | NFC 名刺交換不在本组，放下一期（§9 #27） | 下一期 | 若本期要做，需要另开 Sprint（原生 NFC 模块、实物卡、`/n/[tagId]` 网页） |
| 5 | 有活动归属候选的名片仍不自动进人脈，由用户在まとめて確認里整批选活动后确认（W0015，§9 #9） | 保持 W0015 | 若改成自动带上推定活动直接进人脈，用户少点一次，但「在哪认识」会被系统替用户决定 |
| 6 | 名片表 / 裏配对照做（§9 #7） | 做 | 若不做，App 失去现有的补拍反面能力 |

## 11. 待授权调用与操作清单

| 类别 | 项 | 何时需要 | 说明 |
| --- | --- | --- | --- |
| 付费 AI | 无新增 | — | 本机真实验证现有名片 OCR：每个 Sprint ≤5 次（任务已授权的「已上线调用」），次数、耗时、结果写 REPORT |
| 生产迁移 | `invite-codes-core`（`invite_codes`、`invite_connections`、`invite_code_attempts`） | 合回前，与其他迁移一起 | 先迁移再部署；执行前只读预检（三张表不存在、`contacts` 集合里 `sourceType = 'referral'` 的现有条数作对照）；失败回滚 = 事务自动回滚 |
| 部署 / 环境变量 | `ORBIT_INVITE_RATE_SECRET`（可缺省，从 `AUTH_SECRET` 用 HKDF 派生）；邀请链接的公开域名（契约 fixture 用 `orbitailink.com/i/<code>`，生产域名由用户定） | 上线时 | 不改生产环境变量，列入合回授权 |
| 部署 / App 通用链接 | Web 提供 `/.well-known/apple-app-site-association`（`/i/*` 打开 App）+ App `associatedDomains` | 上线时 | 需要正式域名与 Apple Team ID；本组只做 App 内路由，不做关联文件 |
| 原生依赖 / 发版 | App 新增 `expo-clipboard`（R15）、`expo-contacts`（R16）；通讯录权限说明文案（`NSContactsUsageDescription`） | 下一次 TestFlight | 需要重新构建开发包和 TestFlight 包；本组只在本机模拟器开发包里验证 |
| 后续建议（不在本组） | 名片 OCR 接入 AI 账本；v1 名片接口下线；旧关系邀请接口去留（乙）；NFC（下一期） | — | 写进各 REPORT 的交接 |

## 12. Sprint 怎么切

| Sprint | 主题 | 一句话 | 能单独验收的理由 |
| --- | --- | --- | --- |
| [R12](../R12-add-cards-and-manual/GOAL.md) | 入口、名刺、手入力 | 「人脈を追加」入口（两端）、名刺拍 / 传 → 读完直接进人脈 → まとめて確認 → 完成、手入力（查重、撤销）；删除 App 7 个旧加人屏和 Web 旧导入页的名片部分 | 不依赖招待和导入：两端都能从「＋」走到「N人を人脈に追加しました」，数据进同一联系人存储并入队计划候补 |
| [R15](../R15-invite-codes/GOAL.md) | 招待コード | 迁移、live 服务（发码、预览、兑换、历史、作废、同步、解除）、限流防枚举、发出方两端、接收方 `/i/<code>`（Web）与 App `i/[code]`、通知；删除两端旧邀请页 | 一个人发码、另一个人（未注册 / 已注册 / 已有对方名片）兑换，双方人脈各多一人；用两个本机账号即可验收 |
| [R16](../R16-import-and-completion/GOAL.md) | 导入与每天一问 | 連絡先（App 通讯录 / Web vCard）、LinkedIn / 汎用 CSV、イベントから → まとめて確認（同一组件）；契约 3 每天一问 live + 两端卡片组件；删除 Web 旧导入组件 | 用一份 LinkedIn 样例 CSV 和模拟器通讯录走完导入；每天一问用种子联系人验证出题、回答、跳过 3 次规则 |

为什么这样切：

- **先把最常用的门做好**：名片是加人的主力（设计稿「最常用」），R12 同时把查重口径、まとめて確認组件、入口定下来，后两个 Sprint 直接复用。
- **招待是唯一要新建表、新开公开接口的**：单独一个 Sprint，集中处理迁移、限流、跨账号写入这些高风险的事。
- **导入和每天一问放一起**：导入进来的人最「薄」，每天一问就是为它们补信息的；两者都是规则、零 AI。

## 13. 旧屏归属（本设计的认领）

| 端 | 旧屏 / 文件 | 处理 | Sprint |
| --- | --- | --- | --- |
| App | `contacts/new`（`ContactAcquisitionScreen`，含 QR / 外部 / 引荐 / 草稿队列 / 重复合并） | 重写为「人脈を追加」页；草稿队列改为新页 `contacts/new/drafts`；旧屏与它独有的 view-model 删除 | R12 |
| App | `contacts/new/scan`（`BusinessCardScanScreen`）、`contacts/new/batch/[id]`（`BusinessCardBatchScreen`，v1）、`contacts/new/batch2/index`（`BusinessCardIngestStartScreen`）、`contacts/new/batch2/[id]`（`BusinessCardIngestScreen`）、`contacts/new/import/[id]`（`BusinessCardImportScreen`，v1 文件导入） | 合并为 `contacts/new/scan` + `contacts/new/scan/[batchId]`；旧屏、`BusinessCardBatchReviewForm`、只被它们用的 view-model / api 客户端删除；旧深链翻译 | R12 |
| App | `contacts/new/manual`（`ManualContactAddScreen`） | 重写 | R12 |
| App | `invitations/[token]`（`RelationshipInvitationScreen`） | 删除（§9 #26） | R15 |
| Web | `/app/contacts/new`（`NetworkImport` 的名片部分；`card-batch-ui.tsx` / `card-batch-uploader.tsx` 中只被本页使用的部分） | 重写；`use-card-batch.ts`、`card-batch-store.ts`、`card-batch-host.tsx` 被引导 / iOrbit 共用（CRITICAL），只改两处（§8 R21 / R28 行），其余不改；`card-batch-model.ts` 的两个判定函数改为调用共享规则；UI 文件逐个文本确认调用方，只删只被本页用的 | R12 |
| Web | `/app/contacts/new?method=csv|contacts|event`、`?import=`（`network-import.tsx`、`network-import-file.tsx`、`network-import-event.tsx`、`network-import-client.ts`、`network-import-styles.ts`） | R12 期间保留为「その他」的临时落点；R16 重写后删除并 redirect | R16 |
| Web | `/app/invitations/[token]`（`relationship-invitation-client.tsx`） | 删除 | R15 |
| Web | 新增 `/i/[code]`、`/i` | 新建 | R15 |
| Web | 死代码 `contacts/business-card-import-client.ts`（产品代码零引用） | 随 R12 删除 | R12 |

随删除一起处理（复核 m5）：三份 App 允许清单与 Web `hardcoded-copy-legacy-allowlist.json` 的行（RD-24）；`scripts/generate-full-product-functional-audit.mjs` 里对被删屏 / 路由的引用（R25 删 `contacts/intros` 时的做法，`a91fecae`）；App `scripts/audit-offline-read-surfaces.ts`、`src/data/offline-read/route-domain-inventory.ts`、`scripts/page-offline-inventory.ts`；App 测试 `contact-acquisition-screen`、`relationship-invitation-screen-source`、`app-wide-contacts`、`app-screen-touch-targets`、`app-locale-relationships-events` 里对旧屏的断言，以及两份 `*-opening.json` 开工快照里的对应行（快照只删行，不加）。`screen-ownership.md` 加人 6 行在各 Sprint 收口时改为「已处理」。

## 14. GitNexus（本文写作时，索引在 `5e1c385f` 上全量重建）

| 符号 | 结果 | 对策 |
| --- | --- | --- |
| `getConfiguredIngestV2`（`ingest-v2/configured.ts`） | **CRITICAL** 27 / 直接 9 | 不改 |
| `useCardBatch`（`card-batch-0918/use-card-batch.ts`） | **CRITICAL** 8 / 4（流程 NetworkImport、AppLayout、StartGuide） | 只改自动导入判定改调共享规则（行为不变，现有测试守住）；Web 新页是它的又一个调用方 |
| `isAutoImportEligible` / `isAutoMergeEligible`（`card-batch-model.ts`） | R12 开工跑 | 函数签名不变，内部改调 `shared/compute/card-auto-import.ts` |
| `CARD_BATCH_HOST_YIELD_PREFIXES`（`card-batch-host.tsx`） | UNKNOWN（常量）→ 文本确认 | 只把 `/app/contacts/new` 改成 `/app/contacts/new/scan`；引导 / 开始 / 账户前缀不动 |
| `normalizeOrbitAuthReturnPath`（`features/auth/app-auth-routing.ts`） | **CRITICAL** 23 / 直接 8 | R15 只追加一个只认 `/i/<码>` 的分支，已有分支不改；开放重定向回归测试 |
| `createIngestV2DuplicateCandidatesHandler`（`batches/v2/handlers.ts`） | R12 开工跑 | 只读接口追加同名候选；`confirmCard` 不改 |
| `createBusinessCardIngestRepository`（`ingest-v2/repository.ts`） | HIGH 14 / 2 | 不改 |
| `createLiveManualContactCreationService` | HIGH 14 / 4 | 不改；新的 `/api/contacts/manual` 组合 `saveContact` / `findContactCandidate` / `applyContactFieldValues` |
| `createLiveBusinessCardContactWriteService` | HIGH 5 / 4 | 不改 |
| `findContactCandidate` / `mergeCardIntoContact`（`business-card-contact-match.ts`） | HIGH 6 / 3、HIGH 7 / 2 | 只调用（`mergeCardIntoContact` 本组不再新增调用方）；同名规则放新的纯函数 |
| `confirmBusinessCardContact`、`confirmManualContactDraft` | UNKNOWN / ambiguous | 文本确认调用方（各 3 处 / 1 处），不改 |
| `enqueuePlanMatchJob` | LOW 8 / 2 | 只调用 |
| `createStorageContactActorLinkProvider` | LOW 3 / 2 | 本组不用、不改（§9 #36） |
| 关系邀请三个 handler、`createConfiguredRelationshipCommunicationService` | LOW / UNKNOWN（文本确认仅 `handler.ts`） | 不改（接口保留） |
| `NetworkImport` | LOW 1 / 1 | R16 删除 |
| App 旧屏 8 个（`ContactAcquisitionScreen` 等） | 全部 UNKNOWN（Expo 路由默认导出不入图） | 文本确认：唯一产品调用方是各自路由文件；另被 `route-domain-inventory.ts`、允许清单 JSON、各自测试、审计脚本引用——删屏时一并处理（§13） |
| `SourceTypeCode` 读取端（`shared/api-schema/contact-card-page.ts:10` 等） | 封闭枚举 | 本组不加值（§9 #35） |

注意：索引落后时 impact 会报 not found；每个 Sprint 开工先 `node .gitnexus/run.cjs analyze --index-only --force`。

