/**
 * agent-design AG17: every fixed string of the consent page, the confirm page, settings › 外部 AI 助手 and the inbox line
 * — the approved visual draft's board 10, word for word in Chinese; Japanese and English follow it. No internal term
 * (授权, 范围, 令牌, scope, token, MCP) appears in any of them (tests/pages/agent-connection-consent-page.test.tsx).
 * `{client}`, `{a}`, `{b}`, `{n}`, `{time}`, `{host}`, `{m}`, `{d}` are filled in by the page.
 *
 * A copy table like the other pages' (R03 contract D: every entry is { zh, ja, en }), so the pages themselves hold no
 * user-facing text.
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";

export const agentConnectionsCopy = {
  // ── 同意页 ──
  consentTitle: { zh: "{client} 想连接你的 Orbit", ja: "{client} が Orbit への接続を求めています", en: "{client} wants to connect to your Orbit" },
  consentTitleMore: { zh: "{client} 想多要一点", ja: "{client} がもう少し求めています", en: "{client} is asking for a little more" },
  consentLead: { zh: "连上以后，你在 {client} 里问到自己的事，它可以来查你允许的记录。", ja: "つながると、{client} で自分のことを聞いたとき、許可した記録を見に来られます。", en: "Once connected, when you ask {client} about your own things, it can look up the records you allow." },
  consentLeadMore: { zh: "它从 {date} 起就连着你的 Orbit。这次多要的地方标出来了，其余没动。", ja: "{date} から Orbit につながっています。今回増えたところに印を付けました。ほかは変わりません。", en: "It has been connected to your Orbit since {date}. What it asks for this time is marked; the rest is unchanged." },
  accountRow: { zh: "连到这个账号", ja: "接続するアカウント", en: "Connects to this account" },
  switchAccount: { zh: "换个账号", ja: "アカウントを切り替える", en: "Switch account" },
  chooseHeading: { zh: "给 {client} 看哪些", ja: "{client} に見せるもの", en: "What {client} may see" },
  chooseNote: { zh: "「可以提修改」也包含能看", ja: "「変更を提案できる」は見ることも含みます", en: "“Can propose changes” includes seeing" },
  levelNone: { zh: "不给看", ja: "見せない", en: "Not shown" },
  levelRead: { zh: "只读", ja: "見るだけ", en: "Read only" },
  levelPropose: { zh: "可以提修改", ja: "変更を提案できる", en: "Can propose changes" },
  levelProposeUnavailable: { zh: "这一类暂时只能看，还不能提修改", ja: "この種類はいまは見るだけで、変更の提案はまだできません", en: "For now this can only be seen, not changed" },
  wantsPropose: { zh: "{client} 想要「可以提修改」", ja: "{client} は「変更を提案できる」を求めています", en: "{client} wants “Can propose changes”" },
  wantsProposeMore: { zh: "{client} 这次想要「可以提修改」", ja: "{client} は今回「変更を提案できる」を求めています", en: "{client} now wants “Can propose changes”" },
  newlyAsked: { zh: "新 · 原来是「不给看」", ja: "新しい · 前は「見せない」", en: "New · was “Not shown”" },
  guaranteeOneTitle: { zh: "它改不了你的东西", ja: "勝手には変えられません", en: "It can’t change your things" },
  guaranteeOne: { zh: "它提的每一项修改，都要你回到 Orbit 点「确认」才会改。", ja: "提案された変更はどれも、Orbit に戻って「確認」を押すまで変わりません。", en: "Every change it proposes happens only when you come back to Orbit and press “Confirm”." },
  guaranteeTwoTitle: { zh: "这三样永远不给", ja: "この 3 つは決して渡しません", en: "These three are never given" },
  guaranteeTwo: { zh: "iOrbit 记住的事、你和 iOrbit 的完整对话、任何人的电话和邮箱。", ja: "iOrbit が覚えていること、iOrbit との会話の全文、誰の電話番号やメールアドレスも。", en: "What iOrbit remembers, your full conversations with iOrbit, and anyone’s phone number or email." },
  allow: { zh: "允许", ja: "許可する", en: "Allow" },
  deny: { zh: "不允许", ja: "許可しない", en: "Don’t allow" },
  allowChanges: { zh: "允许这些改动", ja: "この変更を許可する", en: "Allow these changes" },
  keepAsIs: { zh: "保持原样", ja: "このままにする", en: "Keep as it is" },
  footer: { zh: "点「允许」后回到 {host}。以后可以在「设置 › 外部 AI 助手」随时断开。", ja: "「許可する」を押すと {host} に戻ります。あとから「設定 › 外部 AI アシスタント」でいつでも切断できます。", en: "After “Allow” you go back to {host}. You can disconnect at any time in “Settings › Outside AI assistants”." },
  footerMore: { zh: "点「允许这些改动」后回到 {host}。以后可以在「设置 › 外部 AI 助手」随时断开。", ja: "「この変更を許可する」を押すと {host} に戻ります。あとから「設定 › 外部 AI アシスタント」でいつでも切断できます。", en: "After “Allow these changes” you go back to {host}. You can disconnect at any time in “Settings › Outside AI assistants”." },
  accountChanged: { zh: "登录的账号变了。这一页打开时是「{a}」，现在是「{b}」。看清下面的账号，再点一次。", ja: "ログイン中のアカウントが変わりました。このページを開いたときは「{a}」、いまは「{b}」です。下のアカウントを確かめて、もう一度押してください。", en: "The signed-in account changed. It was “{a}” when this page opened; now it is “{b}”. Check the account below and press again." },
  allowedTitle: { zh: "连好了", ja: "つながりました", en: "Connected" },
  allowedLine: { zh: "正在回到 {client}…", ja: "{client} に戻っています…", en: "Going back to {client}…" },
  allowedFallback: { zh: "没有自动回去？", ja: "自動で戻らない場合は", en: "Didn’t go back on its own?" },
  backTo: { zh: "回到 {client}", ja: "{client} に戻る", en: "Back to {client}" },
  refusedTitle: { zh: "没有连接", ja: "接続しませんでした", en: "Not connected" },
  refusedLine: { zh: "{client} 看不到你 Orbit 里的任何东西。这一页可以关掉了。", ja: "{client} からは Orbit の中身は何も見えません。このページは閉じてかまいません。", en: "{client} can’t see anything in your Orbit. You can close this page." },
  unsupportedTitle: { zh: "这个应用现在连不了 Orbit", ja: "このアプリはいまは Orbit につなげません", en: "This app can’t connect to Orbit yet" },
  // Coordinator-approved deviation from board 10: only Claude is named until Codex's sign-in has been verified.
  unsupportedLine: { zh: "目前能连的只有 Claude。", ja: "いまつなげるのは Claude だけです。", en: "For now only Claude can connect." },
  staleTitle: { zh: "这次连接请求已经过期", ja: "この接続のリクエストは期限が切れました", en: "This connection request has expired" },
  staleLine: { zh: "回到 {client}，重新点一次连接就行。", ja: "{client} に戻って、もう一度接続を押してください。", en: "Go back to {client} and press connect again." },
  staleLineUnknown: { zh: "回到你的 AI 助手，重新点一次连接就行。", ja: "AI アシスタントに戻って、もう一度接続を押してください。", en: "Go back to your AI assistant and press connect again." },
  failedTitle: { zh: "没连上，再试一次", ja: "つながりませんでした。もう一度お試しください", en: "Not connected — try again" },
  failedLine: { zh: "刚才没能保存你的选择，{client} 还看不到任何东西。", ja: "選んだ内容を保存できませんでした。{client} からはまだ何も見えません。", en: "Your choice wasn’t saved; {client} still can’t see anything." },
  failedLineMore: { zh: "刚才没能保存你的选择，连接还是原来的样子。", ja: "選んだ内容を保存できませんでした。接続は前のままです。", en: "Your choice wasn’t saved; the connection is as it was." },
  retry: { zh: "再试一次", ja: "もう一度", en: "Try again" },
  // ── 六类与每类一句（按 MCP 实际给出的字段写：tools/projection.ts） ──
  domain_contacts: { zh: "联系人", ja: "連絡先", en: "Contacts" },
  domain_events: { zh: "活动", ja: "イベント", en: "Events" },
  domain_attendance: { zh: "我去过", ja: "参加記録", en: "Events I attended" },
  domain_todos: { zh: "待办", ja: "タスク", en: "To-dos" },
  domain_memos: { zh: "笔记", ja: "メモ", en: "Notes" },
  domain_schedule: { zh: "日程", ja: "予定", en: "Schedule" },
  gives_contacts: { zh: "姓名、公司、职位、你加的标签和跟进阶段。不含电话和邮箱", ja: "名前・会社・役職・自分で付けたタグと進み具合。電話番号とメールは含みません", en: "Name, company, role, your own tags and stage. No phone numbers or emails" },
  // Includes the events the user added themselves (the draft's own words), so an event id that is one of them says nothing more.
  gives_events: { zh: "你报名、收藏和自己加的活动：名称、时间和地点", ja: "申し込んだ・保存した・自分で追加したイベントの名前・日時・場所", en: "Events you signed up for, saved or added yourself: name, time and place" },
  gives_attendance: { zh: "你自己记的参加记录", ja: "自分で付けた参加記録", en: "The attendance notes you wrote" },
  gives_todos: { zh: "标题、备注、计划日和截止时间、做完没有", ja: "タイトル・メモ・予定日と期限・終わったかどうか", en: "Title, notes, planned day and due time, done or not" },
  gives_memos: { zh: "标题、正文和日期", ja: "タイトル・本文・日付", en: "Title, text and date" },
  gives_schedule: { zh: "标题、时间、地点和备注", ja: "タイトル・日時・場所・メモ", en: "Title, time, place and notes" },
  // ── 确认页 ──
  confirmTitle: { zh: "确认修改", ja: "変更の確認", en: "Confirm changes" },
  wantsToChange: { zh: "{client} 想改 {n} 项", ja: "{client} が {n} 件の変更を提案", en: "{client} wants to change {n} {items}" },
  proposedAt: { zh: "{time} 提的", ja: "{time} に提案", en: "proposed {time}" },
  validUntil: { zh: "{time} 前有效", ja: "{time} まで有効", en: "valid until {time}" },
  afterConfirm: { zh: "确认之后，{client} 只知道「改好了」还是「没改」。", ja: "確認したあと、{client} にわかるのは「変更済み」か「変更なし」だけです。", en: "After you confirm, {client} only learns “done” or “not changed”." },
  notYours: { zh: "不认识这条修改？点「不改了」，再到「设置 › 外部 AI 助手」断开 {client}。", ja: "心当たりがない変更なら「変更しない」を押して、「設定 › 外部 AI アシスタント」で {client} を切断してください。", en: "Don’t recognise this change? Press “Don’t change”, then disconnect {client} in “Settings › Outside AI assistants”." },
  expiredTitle: { zh: "这条修改已经过期", ja: "この変更は期限が切れました", en: "This change has expired" },
  expiredWhen: { zh: "{client} 在{time} 提的", ja: "{client} が {time} に提案", en: "{client} proposed it {time}" },
  expiredBoxTitle: { zh: "过了 24 小时，不能再确认", ja: "24 時間が過ぎたので、もう確認できません", en: "24 hours have passed; it can’t be confirmed now" },
  expiredBox: { zh: "什么都没改。还想改的话，回到 {client} 让它重新提一次。", ja: "何も変わっていません。変えたい場合は、{client} に戻ってもう一度提案してもらってください。", en: "Nothing was changed. If you still want it, go back to {client} and ask it to propose again." },
  doneTitle: { zh: "已经改好了", ja: "変更しました", en: "Done" },
  doneBoxTitle: { zh: "你在{time} 确认过了", ja: "{time} に確認済みです", en: "You confirmed it {time}" },
  doneBox: { zh: "再点一次也不会重复改。{client} 那边会看到「已完成」。", ja: "もう一度押しても重ねて変わることはありません。{client} には「完了」と伝わります。", en: "Pressing again won’t change anything twice. {client} will see “done”." },
  revokedTitle: { zh: "这条修改已经作废", ja: "この変更は取り消されました", en: "This change was voided" },
  revokedBoxTitle: { zh: "你在{time} 断开了 {client}", ja: "{time} に {client} を切断しました", en: "You disconnected {client} {time}" },
  revokedBox: { zh: "它提了还没确认的修改一起作废，什么都没改。", ja: "まだ確認していなかった提案もいっしょに取り消され、何も変わっていません。", en: "The changes it proposed that you hadn’t confirmed were voided with it; nothing was changed." },
  rejectedTitle: { zh: "你选了不改", ja: "変更しないことにしました", en: "You chose not to change it" },
  rejectedBoxTitle: { zh: "这条修改已经关掉", ja: "この変更は閉じました", en: "This change is closed" },
  rejectedBox: { zh: "什么都没改。", ja: "何も変わっていません。", en: "Nothing was changed." },
  otherAccountTitle: { zh: "这个账号里没有这条修改", ja: "このアカウントにはこの変更はありません", en: "This change isn’t in this account" },
  otherAccountLine: { zh: "你现在登录的是「{b}」。如果链接是你的 AI 助手给的，换成当时连它的那个账号再打开。", ja: "いまログインしているのは「{b}」です。AI アシスタントからのリンクなら、そのとき接続したアカウントに切り替えて開き直してください。", en: "You are signed in as “{b}”. If an AI assistant gave you this link, switch to the account you connected it with and open it again." },
  goHome: { zh: "回首页", ja: "ホームへ", en: "Go home" },
  backToInbox: { zh: "返回收件箱", ja: "受信箱に戻る", en: "Back to inbox" },
  signInConnect: { zh: "{client} 想连接你的 Orbit", ja: "{client} が Orbit への接続を求めています", en: "{client} wants to connect to your Orbit" },
  signInConnectLine: { zh: "先登录，再决定给它看什么。", ja: "ログインしてから、何を見せるか決めてください。", en: "Sign in first, then decide what it may see." },
  signInProposal: { zh: "有一条修改等你确认", ja: "確認を待っている変更があります", en: "A change is waiting for you" },
  signInProposalLine: { zh: "登录后才能看到内容。", ja: "ログインすると内容が見られます。", en: "Sign in to see it." },
  loadFailed: { zh: "没读到，再试一次", ja: "読み込めませんでした。もう一度お試しください", en: "Couldn’t load — try again" },
  // ── 设置 › 外部 AI 助手 ──
  settingsTitle: { zh: "外部 AI 助手", ja: "外部 AI アシスタント", en: "Outside AI assistants" },
  settingsIntro: { zh: "你自己的 Claude 连到 Orbit 之后，能看什么、能提什么修改，都在这里。随时可以断开。", ja: "自分の Claude を Orbit につないだあと、何を見られて何を提案できるかはここにあります。いつでも切断できます。", en: "Once your own Claude is connected to Orbit, what it may see and propose is here. You can disconnect at any time." },
  connected: { zh: "已连接", ja: "接続中", en: "Connected" },
  connectedOn: { zh: "{date} 连上", ja: "{date} に接続", en: "connected {date}" },
  lastUsed: { zh: "上次使用 {time}", ja: "最終利用 {time}", en: "last used {time}" },
  neverUsed: { zh: "还没用过", ja: "まだ使われていません", en: "not used yet" },
  canSee: { zh: "能看", ja: "見られるもの", en: "Can see" },
  canPropose: { zh: "能提修改", ja: "提案できる変更", en: "Can propose" },
  cannot: { zh: "不能", ja: "なし", en: "Nothing" },
  waiting: { zh: "它提的 {n} 项修改等你确认", ja: "提案された変更が {n} 件、確認を待っています", en: "{n} {items} it proposed {wait} for you" },
  goLook: { zh: "去看", ja: "見る", en: "Look" },
  disconnect: { zh: "断开连接", ja: "切断する", en: "Disconnect" },
  disconnectTitle: { zh: "断开 {client}？", ja: "{client} を切断しますか？", en: "Disconnect {client}?" },
  disconnectNowLabel: { zh: "马上生效：", ja: "すぐに反映：", en: "Right away: " },
  disconnectNow: { zh: "{client} 立刻读不到你的 Orbit。", ja: "{client} はすぐに Orbit を読めなくなります。", en: "{client} can no longer read your Orbit." },
  disconnectVoidLabel: { zh: "没确认的作废：", ja: "未確認のものは取り消し：", en: "Unconfirmed are voided: " },
  disconnectVoid: { zh: "它提的 {n} 项修改还没确认，会一起作废。", ja: "まだ確認していない提案 {n} 件もいっしょに取り消されます。", en: "The {n} {items} it proposed and you haven’t confirmed are voided too." },
  disconnectKeepLabel: { zh: "改好的不动：", ja: "変更済みはそのまま：", en: "Done stays done: " },
  disconnectKeep: { zh: "你已经确认改好的，照旧保留。", ja: "確認して変更したものは、そのまま残ります。", en: "What you already confirmed stays as it is." },
  cancel: { zh: "取消", ja: "キャンセル", en: "Cancel" },
  disconnected: { zh: "已断开 {client}", ja: "{client} を切断しました", en: "Disconnected {client}" },
  disconnectedVoided: { zh: "已断开 {client}，{n} 项没确认的修改已作废", ja: "{client} を切断し、未確認の変更 {n} 件を取り消しました", en: "Disconnected {client}; {n} unconfirmed {items} voided" },
  disconnectFailed: { zh: "没断开，再试一次", ja: "切断できませんでした。もう一度お試しください", en: "Not disconnected — try again" },
  sameForAll: { zh: "不管连的是哪个，都一样", ja: "どれをつないでも同じです", en: "The same whichever you connect" },
  gives: { zh: "能给的", ja: "渡すもの", en: "What it can get" },
  givesOne: { zh: "✓ 你允许的那几类记录", ja: "✓ 許可した種類の記録", en: "✓ The kinds of records you allow" },
  givesTwo: { zh: "✓ 它提的修改，你点确认才会改", ja: "✓ 提案された変更は、確認したときだけ反映", en: "✓ Changes it proposes happen only when you confirm" },
  never: { zh: "永远不给的", ja: "決して渡さないもの", en: "Never given" },
  neverOne: { zh: "✕ iOrbit 记住的事 · 完整对话", ja: "✕ iOrbit が覚えていること · 会話の全文", en: "✕ What iOrbit remembers · full conversations" },
  neverTwo: { zh: "✕ 任何人的电话和邮箱", ja: "✕ 誰の電話番号やメールアドレスも", en: "✕ Anyone’s phone number or email" },
  emptyChip: { zh: "还没有连接", ja: "まだ接続はありません", en: "Nothing connected yet" },
  emptyTitle: { zh: "还没有 AI 助手连到 Orbit", ja: "Orbit につないだ AI アシスタントはまだありません", en: "No AI assistant is connected to Orbit yet" },
  emptyLead: { zh: "连上以后，你可以在 Claude 里直接问自己的联系人、待办、笔记，也可以让它帮你提修改。", ja: "つなぐと、Claude で自分の連絡先・タスク・メモについてそのまま聞けて、変更の提案もしてもらえます。", en: "Once connected, you can ask Claude about your contacts, to-dos and notes, and have it propose changes." },
  stepOne: { zh: "在 Claude 里添加 Orbit，填这个地址", ja: "Claude で Orbit を追加し、このアドレスを入力", en: "In Claude, add Orbit with this address" },
  copy: { zh: "复制", ja: "コピー", en: "Copy" },
  copied: { zh: "已复制", ja: "コピーしました", en: "Copied" },
  stepTwo: { zh: "它会打开 Orbit，让你选给它看哪几类。", ja: "Orbit が開くので、見せる種類を選びます。", en: "It opens Orbit so you can choose what it may see." },
  stepThree: { zh: "点「允许」就连上了。它提的修改，都要你回来点确认。", ja: "「許可する」でつながります。提案された変更は、戻ってきて確認するまで反映されません。", en: "Press “Allow” and you’re connected. Every change it proposes waits for your confirmation." },
  // ── 收件箱 ──
  inboxLine: { zh: "{summary} · {time} 前有效", ja: "{summary} · {time} まで有効", en: "{summary} · valid until {time}" },
  inboxHead: { zh: "你连着的 {client} 提的。看清楚再点确认；不认识就点「不改了」。", ja: "接続中の {client} からの提案です。よく見てから確認を。心当たりがなければ「変更しない」を。", en: "From the {client} you connected. Look before you confirm; if you don’t recognise it, press “Don’t change”." },
  waitingChip: { zh: "等你确认", ja: "確認待ち", en: "Waiting for you" },
  today: { zh: "今天", ja: "今日", en: "today" },
  tomorrow: { zh: "明天", ja: "明日", en: "tomorrow" },
  yesterday: { zh: "昨天", ja: "昨日", en: "yesterday" },
  // Dates in zh and ja («11月20日（周五）»); English uses the browser's own date format, these two are not read for it.
  monthDay: { zh: "{m}月{d}日", ja: "{m}月{d}日", en: "{m}/{d}" },
  weekdayNames: { zh: "周日,周一,周二,周三,周四,周五,周六", ja: "日,月,火,水,木,金,土", en: "Sun,Mon,Tue,Wed,Thu,Fri,Sat" },
} as const;

export type AgentConnectionsWord = keyof typeof agentConnectionsCopy;

/** The words for a language, with `{name}` filled from `values` (English plurals: `{items}`, `{wait}` from `n`). */
export function agentConnectionsWords(language: OrbitLanguage) {
  return (key: AgentConnectionsWord, values: Record<string, string | number> = {}): string => {
    const n = typeof values.n === "number" ? values.n : Number(values.n ?? 1);
    const filled: Record<string, string | number> = { items: n === 1 ? "item" : "items", wait: n === 1 ? "waits" : "wait", ...values };
    return agentConnectionsCopy[key][language].replace(/\{(\w+)\}/gu, (match, name: string) => (filled[name] !== undefined ? String(filled[name]) : match));
  };
}

export const DOMAIN_ORDER = ["contacts", "events", "attendance", "todos", "memos", "schedule"] as const;
export type ConnectionDomain = (typeof DOMAIN_ORDER)[number];
