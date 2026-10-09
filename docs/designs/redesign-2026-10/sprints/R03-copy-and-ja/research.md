# R03 调研记录：成熟产品的日文界面用词

- 调研日期：2026-10-10
- 调研人：Claude（日语产品文案调研角色）
- 用途：为 `glossary.md`（术语表）和 `style-guide.md`（写作规范）提供依据。本文件只记录"别人怎么叫、出处在哪"，最后一节给出对 Orbit 的建议，最终取舍以术语表为准。

## 0. 方法与局限

**方法**

1. 优先看官方帮助中心（help / support 站）的日文页面；其次看官方 App Store 日本区描述、官方产品首页；第三方文章只在官方查不到时作旁证，并明确标注。
2. 能直接抓取的页面用 WebFetch / curl 取原文；被 Cloudflare 拦截的（Sansan、Eight 帮助中心、OpenAI 帮助中心）用桌面端内置浏览器打开公开页面读取文字。
3. 三份风格指南均下载原始 PDF / 官方页面全文检索：Microsoft《Japanese Localization Style Guide》PDF、JTF《日本語標準スタイルガイド（翻訳用）第4.0版》（2026-07-25）PDF、Apple 日文版 Human Interface Guidelines「表現」页（Apple 没有公开的日语风格指南，见下文）。
4. 下文所有日文用词均为页面原文；引用控制在 15 字以内，较长的规则用中文转述。

**局限**

- 没有任何产品的登录账号，**App 内实际按钮文案无法直接截图核对**，只能以帮助中心描述的按钮名（通常用「」或 [ ] 标出）为准。帮助中心可能比 App 版本滞后。
- Apple 没有公开的「日本語スタイルガイド」。Apple Style Guide 只有英文版；日文规范只能从日文版 HIG 和 Apple 日文支持文档的实际写法归纳（见 §3.1）。Apple Developer Forums 上也有开发者确认找不到官方日文风格指南（出处见来源清单）。
- Peatix、Doorkeeper、connpass 是活动平台，没有"人脉 / 待办"概念；Eight、Sansan 没有"活动报名"概念，表中用「—」表示不适用。
- 「未查到」表示在本次查看的公开页面中没有找到，不代表产品里一定没有。

## 1. 来源清单

| 产品 / 指南 | 查看的页面 |
| --- | --- |
| Eight | 官网首页 https://8card.net/ ；帮助中心 https://eight.zendesk.com/hc/ja ；「他人の名刺を登録・管理する」分类 https://eight.zendesk.com/hc/ja/categories/360000066696 ；「つながりとは」https://eight.zendesk.com/hc/ja/articles/360000574475 ；App Store https://apps.apple.com/jp/app/id444423637 |
| Sansan | サポートセンター https://jp-help.sansan.com/hc/ja ；「コンタクトとは」https://jp-help.sansan.com/hc/ja/articles/206508317 ；App Store https://apps.apple.com/jp/app/id787058108 |
| LinkedIn 日本版 | 「LinkedInのつながりリクエストについて」https://www.linkedin.com/help/linkedin/answer/a542708?lang=ja ；「つながりの公開設定」https://www.linkedin.com/help/linkedin/answer/a545584?lang=ja |
| Peatix | 参加者ヘルプ https://help-attendee.peatix.com/ja-JP/support/home ；「チケットを申し込む」https://help-attendee.peatix.com/ja-JP/support/solutions/articles/44001821791 ；「主催者にチケットのキャンセルを依頼する」https://help-attendee.peatix.com/ja-JP/support/solutions/articles/44001822284 |
| connpass | ヘルプトップ https://help.connpass.com/ ；「イベントに参加する」https://help.connpass.com/participants/event-join.html |
| Doorkeeper | 官网 https://www.doorkeeper.jp/ ；サポート https://support.doorkeeper.jp/ ；「イベントに参加したいのですが？」https://support.doorkeeper.jp/article/65-article ；「イベントをキャンセルしたいのですが？」https://support.doorkeeper.jp/article/17-cancel-event |
| Google カレンダー / Tasks | 「予定を作成する」https://support.google.com/calendar/answer/72143?hl=ja ；「予定の招待状に返信する」https://support.google.com/calendar/answer/37135?hl=ja ；「自分の予定を日、週、月ごとに表示する」https://support.google.com/calendar/answer/6110849?hl=ja ；Google Tasks「タスクを追加または編集する」https://support.google.com/tasks/answer/7675838?hl=ja |
| TimeTree | ヘルプ https://support.timetreeapp.com/hc/ja ；「招待」検索结果 https://support.timetreeapp.com/hc/ja/search?query=招待 ；App Store https://apps.apple.com/jp/app/id952578473 |
| iOS カレンダー / リマインダー | 「iPhoneの『カレンダー』で予定を作成する/編集する」https://support.apple.com/ja-jp/guide/iphone/iph3d110f84/ios ；「iPhone、iPad、iPod touchでリマインダーを使う」https://support.apple.com/ja-jp/HT4970 |
| Notion | ヘルプトップ https://www.notion.com/ja/help ；「更新と通知」https://www.notion.com/ja/help/updates-and-notifications ；「コンテンツの複製・削除・復元」https://www.notion.com/ja/help/duplicate-delete-and-restore-content |
| Slack | 「リマインダーを設定する」https://slack.com/intl/ja-jp/help/articles/208423427 ；「メッセージやファイルを『後で』にブックマークする」https://slack.com/intl/ja-jp/help/articles/360042650274 |
| ChatGPT 日文版 | 「ChatGPT のメモリ」https://help.openai.com/ja-jp/articles/8590148-memory-in-chatgpt ；帮助中心检索「再生成」https://help.openai.com/ja-jp/?q=再生成 |
| Apple（日文规范） | 日文版 HIG「表現」https://developer.apple.com/jp/design/human-interface-guidelines/writing （正文经 https://developer.apple.com/tutorials/data/jp/design/human-interface-guidelines/writing.json 读取）；英文 HIG Writing https://developer.apple.com/design/human-interface-guidelines/writing ；Apple Style Guide（英文）https://support.apple.com/guide/applestyleguide/welcome/web ；Developer Forums「Japanese localization style guide」https://developer.apple.com/forums/thread/109260 |
| Microsoft 日本語スタイルガイド | 《Japanese Localization Style Guide》PDF https://download.microsoft.com/download/a/8/2/a822a118-18d4-4429-b857-1b65ab388315/jpn-jpn-StyleGuide.pdf |
| JTF 日本語標準スタイルガイド | 介绍页 https://www.jtf.jp/tips/styleguide ；PDF（第4.0版，2026-07-25）https://www.jtf.jp/pdf/jtf_style_guide.pdf |

## 2. 概念 × 产品对照

表头缩写：EI=Eight，SS=Sansan，LI=LinkedIn，PX=Peatix，CP=connpass，DK=Doorkeeper，GC=Google カレンダー / Tasks，TT=TimeTree，iOS=iOS カレンダー / リマインダー，NO=Notion，SL=Slack，GPT=ChatGPT。
出处编号对应 §1 的页面；表内只写原文用词。

### 2.1 人脉 / 联系人（人脈・つながり・コンタクト・連絡先）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 双方建立的关系 | EI：「つながり」「つながる」「つながりを解除」；LI：「つながり」「1次のつながり」「つながりリクエスト」；SS：—（以"人物 / 名刺"为单位，无双向关系）；其余：— | Eight「つながりとは」；LinkedIn a542708 |
| 一个人的档案 | SS：「人物詳細・名刺詳細」（帮助分类名）；EI：「他人の名刺」「プロフィール名刺」；iOS：「連絡先」（App 名，帮助中称「自分のカード」）；GC：「連絡先」（候补来宾只显示有邮箱的「連絡先」） | Sansan サポートセンター首页；Eight 分类页；Apple HT4970；Google 72143 |
| 「コンタクト」一词 | SS：**「コンタクト」= 名片交换后的接触记录**（面会、电话、邮件），不是"人"；LI：动词用法「コンタクトを作る」 | Sansan「コンタクトとは」；LinkedIn a542708 |
| 「人脈」一词 | 本次查看的官方页面中**未查到**作为 UI 标签使用（Eight 首页用「ビジネスネットワーク」） | Eight 官网首页 |
| 与手机通讯录同步 | EI：「連絡先と連携」「電話帳アプリとの連携」 | Eight 官网首页；Eight App Store |
| 共同好友 | EI：「共通の知り合い」 | Eight 官网首页 |
| 重复合并 | EI：「重複した名刺をまとめる」；SS：「名寄せ」 | Eight 分类页；Sansan 首页 |

### 2.2 名片（名刺・スキャン・名刺交換）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 拍名片录入 | EI：「名刺を読み取る」「連続スキャン」「名刺を撮影するだけで」「取り込んだ名刺」；SS：「名刺スキャン」「データ化、入力」 | Eight 分类页 / 官网；Sansan 首页 |
| OCR 结果 | EI：「データ化」「名刺のデータ化」；SS：「データ化」 | Eight 帮助首页；Sansan 首页 |
| 交换名片 | EI：「名刺交換」「タッチ名刺交換」「デジタル名刺交換」「名刺交換リクエスト」「名刺交換日」；SS：「デジタル名刺」 | Eight 官网 / 帮助 / 「つながりとは」 |
| 对请求的回应 | EI：「承諾」；LI：「承認」「辞退」「招待を承認」 | Eight「つながりとは」；LinkedIn a542708 |
| 编辑 / 删除名片 | EI：「他人の名刺を編集する」「他人の名刺を削除する」；SS：「名刺参照・編集・削除」 | Eight 分类页；Sansan 首页 |
| 标签 | EI：「マイタグ」「スキルタグ」；SS：「タグ」 | Eight 分类页；Sansan 首页 |

### 2.3 活动（イベント・参加・申込・主催）

| 概念 | PX | CP | DK | GC / iOS | 出处 |
| --- | --- | --- | --- | --- | --- |
| 活动 | 「イベント」 | 「イベント」 | 「イベント」 | GC/iOS：「予定」（日历条目） | 各帮助页 |
| 报名动作（按钮） | 「チケットを申し込む」「イベントに申し込む」 | 「このイベントに申し込む」 | 「申し込む」 | — | PX 44001821791；CP event-join；DK 65 |
| 报名（名词） | 「チケット申し込み」 | 「参加申し込み」 | 未查到名词形 | — | 同上 |
| 已报名状态 | 未查到 | 「参加登録済みのイベント」 | 未查到 | — | CP event-join |
| 候补 | 未查到 | 「補欠」 | 「キャンセル待ち」 | — | CP event-join；DK サポート首页 |
| 取消报名 | 「チケットキャンセル」（需向主催者申请） | 「キャンセルする」「参加キャンセル」 | 「キャンセル」→确认「はい、キャンセルします。」 | — | PX 44001822284；CP；DK 17 |
| 主办方 | 「主催者」「主催を始める」 | 「主催者の機能」「管理者」 | 「主催者向け」 | GC：「主催者」（会议发起人） | 各帮助页；GC 37135 |
| 「参加予定」 | 未查到 | 未查到 | 未查到 | — | — |
| 出席回复 | — | 「出席」（签到） | — | GC：「出欠確認」「はい／いいえ／未定」；iOS：「出席依頼」「予定出席者」 | GC 37135；iOS iph3d110f84 |

### 2.4 日程（予定・カレンダー）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 日历条目 | GC：「予定を作成する」「終日」「定期的な予定」；TT：「予定作成/編集」「予定スキャン機能」；iOS：「新規予定」「予定を削除」「編集」 | GC 72143；TT 帮助首页；iOS iph3d110f84 |
| 日历本身 | GC/TT/iOS：「カレンダー」；TT：「共有カレンダー」「公開カレンダー」 | 同上 |
| 来宾 / 成员 | GC：「ゲスト」；TT：「メンバー」；iOS：「予定出席者」 | GC 72143；TT 招待搜索；iOS |

### 2.5 待办（To-do・タスク・リマインダー）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 待办条目 | GC/Tasks：「タスク」「タスクを追加」「タスクリスト」；iOS：「リマインダー」「+ 新規」「最重要To Doリスト」；SL：「リマインダー」「後で」；TT：「ToDoリスト」（App Store 描述）；NO：受信トレイ内「タスク」 | Tasks 7675838；Apple HT4970；Slack 208423427；TT App Store |
| 完成（动作） | Tasks：「完了アイコン」「タスクを完了とする」；SL：「完了」「リマインダーを完了にする」；iOS：「リマインダーを『実行済み』にする」 | 同上 |
| 已完成（状态） | iOS：「実行済み」；SL：进行中 tab 叫「進行中」 | Apple HT4970；Slack 208423427 |
| 期限 | Tasks：「期限」「日時を設定する」「繰り返し」；iOS：「期日を設定する」「今日」「明日」「今週末」 | Tasks 7675838；Apple HT4970 |
| 推迟 / 改期 | SL：「後でリマインドする」「カスタム時間」「スケジュールの再設定」（图标名）；iOS：「今日」「明日」快捷项；「明日へ」**未查到** | Slack 208423427；Apple HT4970 |

### 2.6 计划 / 目标（プラン・目標）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 个人计划 / 目标 | 本次所有来源中**未查到**作为功能名的「プラン」「目標」；「プラン」在 Notion、TimeTree、Eight、Sansan 中都指**付费方案**（如 Notion「プランと請求」、Sansan「ご利用のプラン」、TimeTree「TimeTreeプレミアム」） | Notion 帮助首页；Sansan 首页 |

### 2.7 笔记（メモ・ノート）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 对人 / 名片的备注 | EI：「メモ」「メモの全文検索」「手書きのメモ」；SS：「コンタクトのメモテンプレート」；SS 英文官网：Memos | Eight App Store / 分类页；Sansan 首页 |
| 日历 / 共享备注 | TT：「メモを登録・閲覧したい」「共有できるメモ機能」 | TT 帮助首页；TT App Store |
| 文档 | NO：「ページ」（不用「ノート」） | Notion 帮助首页 |
| 「ノート」 | **未查到**用作 UI 标签 | — |

### 2.8 草稿（下書き）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 未发送的消息 | SL：搜索引擎对官方帮助的摘录称未发送消息「下書きとして保存」，入口名第三方文章写作「下書き&送信済み」（官方页面未能直接核对）；LI：离开编辑页时让用户选择放弃或「下書き保存」 | Slack 第三方：moneyforward（见 §5）；LinkedIn https://www.linkedin.com/help/linkedin/answer/a548122?lang=ja |
| 发送撤回 | Gmail：「元に戻す」「送信取り消し」——仅第三方文章，官方页面未取得 | 第三方：appllio、dev.classmethod.jp |

### 2.9 收件箱 / 通知（受信箱・通知）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 汇总入口 | NO：「受信トレイ」「すべてアーカイブ」「既読」；SL：「アクティビティ」tab；LI：「招待マネージャー」「招待の管理」 | Notion updates-and-notifications；Slack 208423427；LinkedIn a542708 |
| 推送 / 提醒 | EI：「通知」「通知設定（メールやプッシュ通知）」；GC：「カレンダーの通知を変更またはオフにする」；TT：「通知が届かない」 | Eight 帮助首页；GC 72143；TT |
| 「受信箱」写法 | **未查到**任何来源使用「受信箱」；Notion（及 Gmail 系惯例）用「受信トレイ」 | Notion |

### 2.10 邀请 / 邀请码（招待・招待コード）

| 概念 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 邀请他人加入 | EI：「Eightに招待する」「招待メール」；TT：「メンバーを招待する」「招待URL」「招待リンクを発行」；GC：「ゲストを招待する」；LI：「招待」 | Eight 分类页 / 「つながりとは」；TT 招待搜索；GC 72143；LI a542708 |
| 邀请码 | **未查到**「招待コード」；最接近的是 TT「招待URL」（有效期 90 天）、CP「バウチャーコード」（付费活动优惠码，不是邀请） | TT；connpass 帮助首页 |

### 2.11 设置（設定）

| 产品用词（原文） | 出处 |
| --- | --- |
| EI：「環境設定」（分类名）、「公開設定」；SS：「設定」「個人メール設定」；NO：「設定と環境設定」；SL：「環境設定」；GPT：「設定」→「パーソナライズ」→「メモリ」；CP：「登録情報・利用設定を変更する」 | Eight 帮助首页；Sansan 首页；Notion；Slack 208423427；ChatGPT メモリ；connpass |

### 2.12 动作动词

| 动作 | 产品用词（原文） | 出处 |
| --- | --- | --- |
| 追加 | Tasks：「タスクを追加」「リストを追加する」；Slack：「リマインダーを追加する」；Eight：「スキルタグを追加する・外す」 | Tasks 7675838；Slack；Eight 分类页 |
| 保存 | GC：「保存」按钮；Slack：「保存」 | GC 72143；Slack 208423427 |
| 删除 | GC/Tasks：「削除」；iOS：「予定を削除」；Slack：「リマインダーを削除する」「削除する」；Notion：「削除」「ゴミ箱」「完全に削除」 | 各页 |
| 恢复已删除 | Notion：「復元」；iOS：「最近削除した項目」「表示／復元する」 | Notion duplicate…；Apple HT4970 |
| 撤销（Undo） | MS 快捷键表：Undo →「編集内容を元に戻す」；iOS：缩进的反操作「元に戻すには…」；Notion：「元の状態に戻す」（版本历史） | MS PDF §5.3.6；Apple HT4970；Notion |
| 取消 / 撤回 | MS：Cancel 按钮 [キャンセル]，键盘说明 Cancel →「操作を取り消す」；JTF：送りがな示例「取り消す」（不写「取消す」）；Slack：从「後で」移除叫「『後で』から外す」 | MS PDF §5.3.6；JTF p.2；Slack |
| 完成 | iOS：「完了」=**确认 / 结束编辑的按钮**，「実行済み」=任务完成状态；Slack：「完了」；Tasks：「完了とする」；Apple HIG：流程结束用「完了」 | Apple HT4970；Slack；Tasks；HIG |
| 编辑 | iOS：「編集」；Eight：「編集する」；Tasks：「タスクを変更する」 | 各页 |
| 取消（键） | DK：「キャンセル」；CP：「キャンセルする」；MS：[キャンセル] | DK 17；CP；MS PDF |
| 关闭 | MS 快捷键：「ファイルを閉じる」；LI：「招待を閉じるか削除」；Slack 关键词表含「閉じる」 | MS PDF；LinkedIn a542708 |
| 重试 | MS：推荐「もう一度お試しください」，避免「再試行してください」；Slack：「後でもう一度お試しください」 | MS PDF §4.2；Slack 208423427 页尾 |
| 推迟到明天 | iOS：期日快捷项「明日」；Slack：「後でリマインドする」；「明日へ」**未查到** | Apple HT4970；Slack |

### 2.13 离线 / 错误提示

| 概念 | 来源用词（原文） | 出处 |
| --- | --- | --- |
| 离线 | GC：「Google カレンダーをオフラインで使用する」（帮助标题） | GC 6110849 侧栏 |
| 无法执行 | MS 标准句式：Cannot / Could not →「～できません」；Failed to →「～できませんでした」；Cannot find →「～が見つかりません」 | MS PDF §5.3.2 |
| 「エラーが発生しました」 | MS：只在把名词性的 "Failure of …" 译作「…のエラーが発生しました」时使用；**没有被禁止，但不是首选**，首选具体说明哪件事做不了 | MS PDF §5.3.2 |
| 加载失败示例 | Apple HIG：避免「私たちはこのコンテンツを…」，改用「コンテンツを読み込めません」 | Apple HIG「表現」 |
| 「接続できません」 | 本次来源中**未查到**原文；按 MS 句式「～できません」可以自然得出 | — |
| 道歉 | MS：只在严重故障时用「申し訳ございません」；Apple HIG：「おっと!」类感叹词不要用 | MS PDF §5.3.2；Apple HIG |
| 错误位置 | Apple HIG：错误显示在问题旁，说明怎么改，不责备；反例「無効な名前」 | Apple HIG |

### 2.14 AI 相关

| 概念 | 来源用词（原文） | 出处 |
| --- | --- | --- |
| AI 产品名 | NO：「Notion AI」「Notion AIを活用する」「カスタムエージェント」；SL：「Slack AI」；SS：「AIサーチ」「AIチャット」（客服） | Notion；Slack 页脚；Sansan 首页 |
| 根据 / 来源 | GPT：「ソース」（回答下方显示参考的过往聊天、记忆等） | ChatGPT メモリ |
| 记忆 | GPT：「メモリ」「保存したメモリ」「今後この情報に言及しない」 | ChatGPT メモリ |
| 回答 | GPT：「応答」 | ChatGPT メモリ |
| 生成 / 再生成 | GPT：帮助中心检索「再生成」**未查到**专门条目；「画像生成」用作功能名 | ChatGPT 检索页 |
| 「AI に聞く」「提案」 | **未查到**官方原文 | — |
| 秘書 | **未查到**任何来源把 AI 助手叫「秘書」 | — |

### 2.15 加载 / 空态

| 概念 | 来源用词（原文） | 出处 |
| --- | --- | --- |
| 加载中 | MS：进行中状态译作「～しています...」或「～中」（例「ファイルのコピー中…」）；Slack 帮助关键词表含「読み込み中」 | MS PDF §4.1.12；Slack 208423427 |
| 空态 | Apple HIG：空白画面要给出下一步并提供按钮，不放关键信息；具体字符串「まだ〜がありません」**未查到** | Apple HIG「表現」 |

## 3. 风格指南摘录

### 3.1 Apple

> Apple 没有公开日语风格指南。下列各条出自日文版 HIG「表現」页（2025-12-16 更新）和 Apple 日文支持文档的实际写法。

| 规则 | 出处 | 引用 / 转述 |
| --- | --- | --- |
| 按钮用动词 | HIG「表現」 | 「ほとんどの場合、動詞を使用」；例：「やりましょう!」不如「送信」 |
| 流程按钮统一 | HIG「表現」 | 开始用「開始」，中间用「続ける」或「次へ」（二选一统一），结束用「完了」 |
| 不说「私たち」 | HIG「表現」 | 例：改成「コンテンツを読み込めません」 |
| 少用所有格 | HIG「表現」 | 「お気に入り」好过「あなたのお気に入り」 |
| 触屏说「タップ」 | HIG「表現」 | iPhone / iPad 上不用「クリック」 |
| 空态给下一步 | HIG「表現」 | 空白状态要提示可做的操作并给按钮 |
| 错误信息说怎么改 | HIG「表現」 | 例：「8文字以上のパスワードを選択してください」 |
| 长音 | HIG 正文与 Apple 支持文档 | Apple 自己写「ユーザ」「デベロッパ」「プレースホルダ」（省略词尾长音）；Apple 支持站标题「iPhoneユーザガイド」 |
| 中英文间空格 | HIG 正文；Developer Forums 109260 | Apple 文本在日文与拉丁字母之间**不加空格**（如「Apple Watchの」「8文字以上」）；论坛里开发者也指出 Apple 自带 App 不加空格 |
| 日期 | HIG 修订记录 | 「2025年12月16日」（无空格） |

### 3.2 Microsoft《Japanese Localization Style Guide》

| 规则 | 出处（PDF 章节） | 引用 / 转述 |
| --- | --- | --- |
| 文体分工 | §4.2 Style | 说明文用です・ます；需要用户操作时用「…してください。」；复选框、选项可用である；**菜单、按钮、标签、标签页标题用体言止め** |
| 体言止め写法 | §4.2 | 「変更箇所の表示」；避免「～の～の～」；必要时补助词，如「次へ」不写「次」 |
| 按钮动词形 | §2.1.3 | 句中用「選ぶ」更口语，但按钮名沿用「<漢語> する」形式，例：「選択」按钮 |
| 口语化用词 | §2.1.2–2.1.3 | 「可能です」→「できます」；「推奨します」→「お勧めします」；「無効です」→「使用できません」；「再度」→「もう一度」；「電子メール」→「メール」 |
| 重试 | §4.2 Tone | 「もう一度お試しください」优于「再試行してください」 |
| 询问 | §4.2 | 用「…しますか?」，避免「…してもよろしいですか?」 |
| 不用尊敬语 / 谦让语 | §4.2 | 一般不用；需要"商家—顾客"关系时才用（如「お問い合わせください」） |
| 错误信息 | §5.3.2 | 正文用です・ます；对话框标题和按钮用体言止め；标准句式「～できません」「～できませんでした」「～が見つかりません」「～は使用できません」 |
| 道歉 | §5.3.2 | 严重故障才用「申し訳ございません」 |
| 进行中 | §4.1.12 | 「～しています...」或「～中」 |
| 长音 | §4.1.11 | -er / -or / -ar 结尾加长音（「コンピューター」）；其它词按字数（3 字以下加，4 字以上不加），例「メニュー」「メモリ」 |
| 全角半角 | §4.1.3 / §4.1.7 | 片假名全角；英文、数字半角 |
| 空格 | §4.1.11 | **全角与半角之间原则上加半角空格**（「Word を使用」「第 3 章」）；句读点、括号、斜线两侧不加 |
| 括号 | §4.1.9 | UI 标签用半角方括号「[OK]」；引用语用全角「」 |
| 日期分隔 | §4.1.9 | 斜线半角，如 2011/1/13 |
| 数字 | §4.1.7 | 可替换的数用阿拉伯数字（「1 つ」「1 月」），固定词用汉字（「もう一度」「一時的に」） |
| 外来语 | §1.1 | 以内阁告示「外来語の表記」为准 |

### 3.3 JTF《日本語標準スタイルガイド（翻訳用）》第4.0版（2026-07-25）

| 规则 | 出处（PDF 章节） | 引用 / 转述 |
| --- | --- | --- |
| 正文文体统一 | 基本规则 1；§1.1.1 | 敬体和常体二选一，不混用；面向一般读者用敬体 |
| 标题 | §1.1.2 | 「見出しには常体や体言止め」，不加句号 |
| 列表 | §1.1.3 | 正文敬体时列表可用常体或体言止め，同一组不混用 |
| 图表内文字 | §1.1.4 | 通常不加句号，多句时才加 |
| 句读点 | 基本规则 2；§3.1 | 用全角「、」「。」，不用「，．」 |
| 送假名 | 基本规则 4 | 「取り消す」不写「取消す」 |
| 长音 | 基本规则 5；§2.1.6 | 「語尾の長音は省略しない」：ユーザー、カレンダー、メモリー；但承认「メモリ／メモリー」等有分歧，要求同一文档统一 |
| 全角半角 | 基本规则 7–9 | 假名汉字全角；数字、英文半角；记号原则全角「？！：（）」 |
| 空格 | 基本规则 10；§2.3.1 | **全角与半角之间不加空格**（「JTF標準」） |
| 数值范围 | §3.2 | 用全角「～」，不用半角 ~ |
| UI 名 | §3.2 | 画面用语可用全角「［ファイル］メニュー」 |
| 时间单位 | §4.3.1 | 用汉字「時」「分」「秒」 |
| 外来语 | §2.1.5 | 以内阁告示「外来語の表記」为准 |

### 3.4 三份指南的分歧（需要 Orbit 自己定）

| 议题 | Apple | Microsoft | JTF | 成熟日本产品实际 |
| --- | --- | --- | --- | --- |
| 词尾长音 | 省略（ユーザ） | -er 结尾加（ユーザー），4 字以上其它词不加（メモリ） | 一律加（ユーザー、メモリー） | Eight、LinkedIn、Google、ChatGPT：「ユーザー」；Sansan 混用「一般ユーザ」与「ユーザー設定」；ChatGPT「メモリ」 |
| 日英之间空格 | 不加 | 加半角空格 | 不加 | Eight「Eightユーザー」、TimeTree「TimeTreeプレミアム」不加；ChatGPT「ChatGPT のメモリ」加；Google「Google カレンダー」加 |
| UI 名括号 | 「」（支持文档） | 半角 [ ] | 全角［ ］ | Apple、Slack 帮助用「」；Google、LinkedIn 帮助用 [ ] |

## 4. 对 Orbit 的建议

原则：以成熟日本商务产品（Eight、Sansan、LinkedIn 日本版）的叫法为第一依据，iOS 自带 App 为第二依据，三份指南用来定写法细节。中文用大陆简体，英文用简洁的 sentence case。

### 4.1 名词

| 概念 | 推荐日文 | 理由（依据见 §2 / §3） | 简体中文 | English |
| --- | --- | --- | --- | --- |
| 人脉（整体，导航名） | 人脈 | 「つながり」在 Eight / LinkedIn 是"双方确认的关系"，Orbit 的人脉不要求对方确认，用「つながり」会误导；「人脈」虽未在 UI 中查到，但 Orbit 的定位就是人脉管理，作导航名意思清楚 | 人脉 | Network |
| 单个联系人 | 連絡先 | iOS、Google 都用「連絡先」指"一个人"；**不用「コンタクト」**——Sansan 的「コンタクト」是接触记录，商务用户会混淆 | 联系人 | Contact |
| 与某人的关系（详情页小标题） | つながり | 只在描述"和这个人的关系"时用，与 Eight / LinkedIn 一致 | 关系 | Connection |
| 名片 | 名刺 | 所有日本产品一致 | 名片 | Business card |
| 拍名片 | 名刺をスキャン | Eight「連続スキャン」、Sansan「名刺スキャン」；比「読み取る」短，适合按钮 | 扫描名片 | Scan card |
| 交换名片 | 名刺交換 | Eight / Sansan 一致 | 交换名片 | Exchange cards |
| 活动 | イベント | Peatix / connpass / Doorkeeper 一致 | 活动 | Event |
| 计划参加（状态） | 参加予定 | 未在活动平台查到，但 connpass「参加登録済み」偏系统用语；「参加予定」是日语日常说法，≤8 字状态标签合适（**需审校确认**） | 计划参加 | Going |
| 报名（动作） | 申し込む | Peatix / connpass / Doorkeeper 都用「申し込む」 | 报名 | Register |
| 主办 | 主催 | 三家活动平台都用「主催者」 | 主办 | Host |
| 日程 | 予定 | Google / iOS / TimeTree 一致 | 日程 | Event（日历语境）/ Schedule |
| 日历 | カレンダー | 同上；长音保留 | 日历 | Calendar |
| 待办 | To-do | iOS「To Do」、TimeTree「ToDo」；「タスク」偏项目管理（Google Tasks、Notion）；Orbit 是个人跟进，用 To-do 更轻。连字符写法需在术语表里统一 | 待办 | To-do |
| 提醒 | リマインダー | iOS、Slack 一致；只用于"到点提醒"本身，不用作待办的别名 | 提醒 | Reminder |
| 计划 | プラン | 来源中没有作为功能名的先例，且「プラン」在多数产品指**付费方案**，存在冲突；若 Orbit 将来有付费方案，需改用「計画」或「目標」。**列为待定项** | 计划 | Plan |
| 备注 | メモ | Eight、Sansan、TimeTree 一致；不用「ノート」 | 备注 | Note |
| 草稿 | 下書き | Slack、LinkedIn 一致；Orbit 只生成草稿不代发，草稿是核心状态 | 草稿 | Draft |
| 收件箱 | 受信トレイ | Notion 与 Gmail 惯例都是「受信トレイ」；「受信箱」未查到使用先例 | 收件箱 | Inbox |
| 通知 | 通知 | 所有来源一致 | 通知 | Notifications |
| 邀请 | 招待 | Eight、TimeTree、Google、LinkedIn 一致 | 邀请 | Invite |
| 邀请码 | 招待コード | 无直接先例；TimeTree 用「招待URL」。Orbit 是码而不是链接时，「招待コード」是最直白的组合（**需审校确认**） | 邀请码 | Invite code |
| 设置 | 設定 | Sansan、ChatGPT、Google 一致；「環境設定」偏桌面软件 | 设置 | Settings |
| AI 助手 | iOrbit（产品名，不翻译） | 参照「Notion AI」「Slack AI」直接用产品名；**不用「秘書」**——没有先例，且与"邮件只到草稿"的定位不符（秘书会代发） | iOrbit | iOrbit |
| 依据 / 来源 | 根拠 | ChatGPT 用「ソース」，但 Orbit 要求"处处有据"，「根拠」对商务用户更直接（**需审校确认**；备选「出典」） | 依据 | Sources |

### 4.2 动作动词（按钮用体言止め或「〜する」，见 §3.2）

| 动作 | 推荐日文（按钮） | 理由 | 简体中文 | English |
| --- | --- | --- | --- | --- |
| 添加 | 追加 | Google Tasks / Slack 一致；按钮用汉语名词形，符合 MS「<漢語> する」惯例 | 添加 | Add |
| 保存 | 保存 | Google / Slack 一致 | 保存 | Save |
| 删除 | 削除 | 所有来源一致；破坏性操作的确认句用「〜を削除しますか?」（MS §4.2） | 删除 | Delete |
| 撤销刚做的操作（Toast 里） | 元に戻す | MS Undo =「元に戻す」；与「取り消す」分开 | 撤销 | Undo |
| 撤回已提交的事（申请、报名、邀请） | 取り消す | MS Cancel 说明 =「操作を取り消す」；JTF 送假名「取り消す」 | 撤回 | Withdraw |
| 完成待办 | 完了 | Slack / Google Tasks 一致；注意 iOS 把「完了」也用作"确定"按钮，所以 Orbit 的编辑确认按钮用「保存」，避免一个词两个意思 | 完成 | Done |
| 已完成（状态） | 完了済み | iOS 用「実行済み」，但「完了」与按钮呼应更好（**需审校确认**） | 已完成 | Completed |
| 编辑 | 編集 | iOS / Eight 一致 | 编辑 | Edit |
| 取消（关闭对话框不保存） | キャンセル | 所有来源一致 | 取消 | Cancel |
| 关闭 | 閉じる | MS / LinkedIn 一致；对话框右上的关闭用这个，不用「キャンセル」 | 关闭 | Close |
| 重试（按钮） | もう一度試す | MS 推荐「もう一度」而不是「再度 / 再試行」；按钮用动词原形 | 重试 | Try again |
| 重试（提示句） | もう一度お試しください。 | MS §4.2 原例；Slack 也这样写 | 请重试。 | Please try again. |
| 推迟到明天 | 明日にする | 「明日へ」无先例且是方向助词结尾，按钮语感不完整；iOS 用「明日」作期日选项。建议「明日にする」或直接「明日」（**需审校在两者中选**） | 改到明天 | Move to tomorrow |

### 4.3 提示与状态

| 场景 | 推荐日文 | 理由 | 简体中文 | English |
| --- | --- | --- | --- | --- |
| 离线 | オフラインです | Google「オフラインで使用する」；状态短句 | 当前离线 | You're offline |
| 连不上 | 接続できません。もう一度お試しください。 | MS「～できません」+「もう一度お試しください」 | 无法连接，请重试。 | Can't connect. Try again. |
| 通用失败 | 〜できませんでした | MS：Failed to →「～できませんでした」；**尽量不用笼统的「エラーが発生しました」**（MS 只把它用于名词性的 Failure of，Apple 要求说明能做什么） | 无法…… | Couldn't … |
| 加载中 | 読み込み中… | MS 进行中用「～中」；Slack 关键词有「読み込み中」 | 加载中… | Loading… |
| 空态 | まだ〜はありません | Apple HIG：空态要给下一步按钮；具体句式无先例，建议「まだ〜はありません」+ 行动按钮（**需审校确认助词「は／が」**） | 还没有…… | No … yet |
| 问 AI | iOrbitに聞く | 「AI に聞く」无先例；直接用产品名更具体 | 问 iOrbit | Ask iOrbit |
| AI 建议 | 提案 | 商务日语常用；无直接先例（**需审校确认**） | 建议 | Suggestion |
| AI 生成 | 作成 | ChatGPT 帮助中「生成」多用于"画像生成 / API キー生成"等技术语境；面向用户的按钮用「作成」更自然（如「下書きを作成」） | 生成 | Create / Draft |

### 4.4 写法细节建议

| 议题 | 建议 | 依据 |
| --- | --- | --- |
| 文体 | 正文、提示句用です・ます；按钮、标签、标签页、导航用体言止め；标题不加句号 | MS §4.2；JTF §1.1 |
| 长音 | 词尾长音**保留**：ユーザー、カレンダー、リマインダー、メンバー；「メモリ」等 4 字以上、非 -er 结尾的词按 MS 规则不加（Orbit 目前基本用不到） | JTF 基本规则 5；MS §4.1.11；Eight / LinkedIn / Google / ChatGPT 实际都写「ユーザー」 |
| 全角半角 | 数字、英文半角；括号「」（）全角；范围用全角「～」 | JTF 基本规则 7–9；§3.2 |
| 日英间空格 | **不加**（「iOrbitに聞く」「3件」） | JTF 基本规则 10；Apple 实际写法；Eight / TimeTree 实际写法。MS 要求加空格，但 Orbit 是移动端日本产品，跟 Apple / JTF 一致 |
| 日期 | 「10月7日（水）」，年份需要时「2026年10月7日」；不加空格 | Apple HIG 修订记录写法；JTF 不加空格规则；括号全角 |
| 句读点 | 「、」「。」全角；按钮、标签不加「。」 | JTF 基本规则 2；§1.1.4 |
| 敬语 | 不用尊敬语 / 谦让语，只在客服类文案用「お問い合わせください」 | MS §4.2 |
| 人称 | 不写「あなたの」「私たち」 | Apple HIG；MS §4.1.8 |
| 外来语 | 以内阁告示「外来語の表記」为准 | MS §1.1；JTF §2.1.5 |

### 4.5 待独立审校重点确认的条目

参加予定、計画 / プラン 的冲突、招待コード、根拠、完了済み、明日にする / 明日、空态句式的助词、提案。以上都没有直接的产品先例，属于推断。

## 5. 补充：只作旁证的第三方来源

- Slack「下書き&送信済み」入口名：https://biz.moneyforward.com/work-efficiency/basic/28037/
- Gmail「送信取り消し」「元に戻す」：https://appllio.com/gmail-cancel-sent-mail ，https://dev.classmethod.jp/articles/unsend-an-email-gmail-jp
- Eight つながり無法完全关闭的报道：https://dime.jp/genre/2027941/ （已由 Eight 官方帮助「つながりが発生しないようにできますか」条目标题佐证存在该问题）
