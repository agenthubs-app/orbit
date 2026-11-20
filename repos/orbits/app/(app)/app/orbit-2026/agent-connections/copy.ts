/**
 * agent-design AG17: every fixed string of the consent page, the confirm page, settings › 外部 AI 助手 and the inbox line
 * — the approved visual draft's board 10, word for word in Chinese; Japanese and English follow it. No internal term
 * (授权, 范围, 令牌, scope, token, MCP) appears in any of them (tests/pages/agent-connections-wording.test.ts).
 * `{client}`, `{a}`, `{b}`, `{n}`, `{time}`, `{host}` are filled in by the page.
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";

type Words = Record<OrbitLanguage, string>;
const w = (zh: string, ja: string, en: string): Words => ({ en, ja, zh });

export const agentConnectionsCopy = {
  // ── 同意页 ──
  consentTitle: w("{client} 想连接你的 Orbit", "{client} が Orbit への接続を求めています", "{client} wants to connect to your Orbit"),
  consentTitleMore: w("{client} 想多要一点", "{client} がもう少し求めています", "{client} is asking for a little more"),
  consentLead: w("连上以后，你在 {client} 里问到自己的事，它可以来查你允许的记录。", "つながると、{client} で自分のことを聞いたとき、許可した記録を見に来られます。", "Once connected, when you ask {client} about your own things, it can look up the records you allow."),
  consentLeadMore: w("它从 {date} 起就连着你的 Orbit。这次多要的地方标出来了，其余没动。", "{date} から Orbit につながっています。今回増えたところに印を付けました。ほかは変わりません。", "It has been connected to your Orbit since {date}. What it asks for this time is marked; the rest is unchanged."),
  accountRow: w("连到这个账号", "接続するアカウント", "Connects to this account"),
  switchAccount: w("换个账号", "アカウントを切り替える", "Switch account"),
  chooseHeading: w("给 {client} 看哪些", "{client} に見せるもの", "What {client} may see"),
  chooseNote: w("「可以提修改」也包含能看", "「変更を提案できる」は見ることも含みます", "“Can propose changes” includes seeing"),
  levelNone: w("不给看", "見せない", "Not shown"),
  levelRead: w("只读", "見るだけ", "Read only"),
  levelPropose: w("可以提修改", "変更を提案できる", "Can propose changes"),
  levelProposeUnavailable: w("这一类暂时只能看，还不能提修改", "この種類はいまは見るだけで、変更の提案はまだできません", "For now this can only be seen, not changed"),
  wantsPropose: w("{client} 想要「可以提修改」", "{client} は「変更を提案できる」を求めています", "{client} wants “Can propose changes”"),
  wantsProposeMore: w("{client} 这次想要「可以提修改」", "{client} は今回「変更を提案できる」を求めています", "{client} now wants “Can propose changes”"),
  newlyAsked: w("新 · 原来是「不给看」", "新しい · 前は「見せない」", "New · was “Not shown”"),
  guaranteeOneTitle: w("它改不了你的东西", "勝手には変えられません", "It can’t change your things"),
  guaranteeOne: w("它提的每一项修改，都要你回到 Orbit 点「确认」才会改。", "提案された変更はどれも、Orbit に戻って「確認」を押すまで変わりません。", "Every change it proposes happens only when you come back to Orbit and press “Confirm”."),
  guaranteeTwoTitle: w("这三样永远不给", "この 3 つは決して渡しません", "These three are never given"),
  guaranteeTwo: w("iOrbit 记住的事、你和 iOrbit 的完整对话、任何人的电话和邮箱。", "iOrbit が覚えていること、iOrbit との会話の全文、誰の電話番号やメールアドレスも。", "What iOrbit remembers, your full conversations with iOrbit, and anyone’s phone number or email."),
  allow: w("允许", "許可する", "Allow"),
  deny: w("不允许", "許可しない", "Don’t allow"),
  allowChanges: w("允许这些改动", "この変更を許可する", "Allow these changes"),
  keepAsIs: w("保持原样", "このままにする", "Keep as it is"),
  footer: w("点「允许」后回到 {host}。以后可以在「设置 › 外部 AI 助手」随时断开。", "「許可する」を押すと {host} に戻ります。あとから「設定 › 外部 AI アシスタント」でいつでも切断できます。", "After “Allow” you go back to {host}. You can disconnect at any time in “Settings › Outside AI assistants”."),
  footerMore: w("点「允许这些改动」后回到 {host}。以后可以在「设置 › 外部 AI 助手」随时断开。", "「この変更を許可する」を押すと {host} に戻ります。あとから「設定 › 外部 AI アシスタント」でいつでも切断できます。", "After “Allow these changes” you go back to {host}. You can disconnect at any time in “Settings › Outside AI assistants”."),
  accountChanged: w("登录的账号变了。这一页打开时是「{a}」，现在是「{b}」。看清下面的账号，再点一次。", "ログイン中のアカウントが変わりました。このページを開いたときは「{a}」、いまは「{b}」です。下のアカウントを確かめて、もう一度押してください。", "The signed-in account changed. It was “{a}” when this page opened; now it is “{b}”. Check the account below and press again."),
  allowedTitle: w("连好了", "つながりました", "Connected"),
  allowedLine: w("正在回到 {client}…", "{client} に戻っています…", "Going back to {client}…"),
  allowedFallback: w("没有自动回去？", "自動で戻らない場合は", "Didn’t go back on its own?"),
  backTo: w("回到 {client}", "{client} に戻る", "Back to {client}"),
  refusedTitle: w("没有连接", "接続しませんでした", "Not connected"),
  refusedLine: w("{client} 看不到你 Orbit 里的任何东西。这一页可以关掉了。", "{client} からは Orbit の中身は何も見えません。このページは閉じてかまいません。", "{client} can’t see anything in your Orbit. You can close this page."),
  unsupportedTitle: w("这个应用现在连不了 Orbit", "このアプリはいまは Orbit につなげません", "This app can’t connect to Orbit yet"),
  unsupportedLine: w("目前能连的只有 Claude 和 Codex。", "いまつなげるのは Claude と Codex だけです。", "For now only Claude and Codex can connect."),
  staleTitle: w("这次连接请求已经过期", "この接続のリクエストは期限が切れました", "This connection request has expired"),
  staleLine: w("回到 {client}，重新点一次连接就行。", "{client} に戻って、もう一度接続を押してください。", "Go back to {client} and press connect again."),
  staleLineUnknown: w("回到你的 AI 助手，重新点一次连接就行。", "AI アシスタントに戻って、もう一度接続を押してください。", "Go back to your AI assistant and press connect again."),
  failedTitle: w("没连上，再试一次", "つながりませんでした。もう一度お試しください", "Not connected — try again"),
  failedLine: w("刚才没能保存你的选择，{client} 还看不到任何东西。", "選んだ内容を保存できませんでした。{client} からはまだ何も見えません。", "Your choice wasn’t saved; {client} still can’t see anything."),
  failedLineMore: w("刚才没能保存你的选择，连接还是原来的样子。", "選んだ内容を保存できませんでした。接続は前のままです。", "Your choice wasn’t saved; the connection is as it was."),
  retry: w("再试一次", "もう一度", "Try again"),
  // ── 六类与每类一句（按 MCP 实际给出的字段写：tools/projection.ts） ──
  domain_contacts: w("联系人", "連絡先", "Contacts"),
  domain_events: w("活动", "イベント", "Events"),
  domain_attendance: w("我去过", "参加記録", "Events I attended"),
  domain_todos: w("待办", "タスク", "To-dos"),
  domain_memos: w("笔记", "メモ", "Notes"),
  domain_schedule: w("日程", "予定", "Schedule"),
  gives_contacts: w("姓名、公司、职位、你加的标签和跟进阶段。不含电话和邮箱", "名前・会社・役職・自分で付けたタグと進み具合。電話番号とメールは含みません", "Name, company, role, your own tags and stage. No phone numbers or emails"),
  gives_events: w("活动的名称、时间和地点", "イベントの名前・日時・場所", "The event’s name, time and place"),
  gives_attendance: w("你自己记的参加记录", "自分で付けた参加記録", "The attendance notes you wrote"),
  gives_todos: w("标题、备注、计划日和截止时间、做完没有", "タイトル・メモ・予定日と期限・終わったかどうか", "Title, notes, planned day and due time, done or not"),
  gives_memos: w("标题、正文和日期", "タイトル・本文・日付", "Title, text and date"),
  gives_schedule: w("标题、时间、地点和备注", "タイトル・日時・場所・メモ", "Title, time, place and notes"),
  // ── 确认页 ──
  confirmTitle: w("确认修改", "変更の確認", "Confirm changes"),
  wantsToChange: w("{client} 想改 {n} 项", "{client} が {n} 件の変更を提案", "{client} wants to change {n} {items}"),
  proposedAt: w("{time} 提的", "{time} に提案", "proposed {time}"),
  validUntil: w("{time} 前有效", "{time} まで有効", "valid until {time}"),
  afterConfirm: w("确认之后，{client} 只知道「改好了」还是「没改」。", "確認したあと、{client} にわかるのは「変更済み」か「変更なし」だけです。", "After you confirm, {client} only learns “done” or “not changed”."),
  notYours: w("不认识这条修改？点「不改了」，再到「设置 › 外部 AI 助手」断开 {client}。", "心当たりがない変更なら「変更しない」を押して、「設定 › 外部 AI アシスタント」で {client} を切断してください。", "Don’t recognise this change? Press “Don’t change”, then disconnect {client} in “Settings › Outside AI assistants”."),
  expiredTitle: w("这条修改已经过期", "この変更は期限が切れました", "This change has expired"),
  expiredWhen: w("{client} 在 {time} 提的", "{client} が {time} に提案", "{client} proposed it {time}"),
  expiredBoxTitle: w("过了 24 小时，不能再确认", "24 時間が過ぎたので、もう確認できません", "24 hours have passed; it can’t be confirmed now"),
  expiredBox: w("什么都没改。还想改的话，回到 {client} 让它重新提一次。", "何も変わっていません。変えたい場合は、{client} に戻ってもう一度提案してもらってください。", "Nothing was changed. If you still want it, go back to {client} and ask it to propose again."),
  doneTitle: w("已经改好了", "変更しました", "Done"),
  doneBoxTitle: w("你在 {time} 确认过了", "{time} に確認済みです", "You confirmed it {time}"),
  doneBox: w("再点一次也不会重复改。{client} 那边会看到「已完成」。", "もう一度押しても重ねて変わることはありません。{client} には「完了」と伝わります。", "Pressing again won’t change anything twice. {client} will see “done”."),
  revokedTitle: w("这条修改已经作废", "この変更は取り消されました", "This change was voided"),
  revokedBoxTitle: w("你在 {time} 断开了 {client}", "{time} に {client} を切断しました", "You disconnected {client} {time}"),
  revokedBox: w("它提了还没确认的修改一起作废，什么都没改。", "まだ確認していなかった提案もいっしょに取り消され、何も変わっていません。", "The changes it proposed that you hadn’t confirmed were voided with it; nothing was changed."),
  rejectedTitle: w("你选了不改", "変更しないことにしました", "You chose not to change it"),
  rejectedBoxTitle: w("这条修改已经关掉", "この変更は閉じました", "This change is closed"),
  rejectedBox: w("什么都没改。", "何も変わっていません。", "Nothing was changed."),
  otherAccountTitle: w("这个账号里没有这条修改", "このアカウントにはこの変更はありません", "This change isn’t in this account"),
  otherAccountLine: w("你现在登录的是「{b}」。如果链接是你的 AI 助手给的，换成当时连它的那个账号再打开。", "いまログインしているのは「{b}」です。AI アシスタントからのリンクなら、そのとき接続したアカウントに切り替えて開き直してください。", "You are signed in as “{b}”. If an AI assistant gave you this link, switch to the account you connected it with and open it again."),
  goHome: w("回首页", "ホームへ", "Go home"),
  backToInbox: w("返回收件箱", "受信箱に戻る", "Back to inbox"),
  signInConnect: w("{client} 想连接你的 Orbit", "{client} が Orbit への接続を求めています", "{client} wants to connect to your Orbit"),
  signInConnectLine: w("先登录，再决定给它看什么。", "ログインしてから、何を見せるか決めてください。", "Sign in first, then decide what it may see."),
  signInProposal: w("有一条修改等你确认", "確認を待っている変更があります", "A change is waiting for you"),
  signInProposalLine: w("登录后才能看到内容。", "ログインすると内容が見られます。", "Sign in to see it."),
  loadFailed: w("没读到，再试一次", "読み込めませんでした。もう一度お試しください", "Couldn’t load — try again"),
  // ── 设置 › 外部 AI 助手 ──
  settingsTitle: w("外部 AI 助手", "外部 AI アシスタント", "Outside AI assistants"),
  settingsIntro: w("你自己的 Claude、Codex 连到 Orbit 之后，能看什么、能提什么修改，都在这里。随时可以断开。", "自分の Claude や Codex を Orbit につないだあと、何を見られて何を提案できるかはここにあります。いつでも切断できます。", "Once your own Claude or Codex is connected to Orbit, what it may see and propose is here. You can disconnect at any time."),
  connected: w("已连接", "接続中", "Connected"),
  connectedOn: w("{date} 连上", "{date} に接続", "connected {date}"),
  lastUsed: w("上次使用 {time}", "最終利用 {time}", "last used {time}"),
  neverUsed: w("还没用过", "まだ使われていません", "not used yet"),
  canSee: w("能看", "見られるもの", "Can see"),
  canPropose: w("能提修改", "提案できる変更", "Can propose"),
  cannot: w("不能", "なし", "Nothing"),
  waiting: w("它提的 {n} 项修改等你确认", "提案された変更が {n} 件、確認を待っています", "{n} {items} it proposed {wait} for you"),
  goLook: w("去看", "見る", "Look"),
  disconnect: w("断开连接", "切断する", "Disconnect"),
  disconnectTitle: w("断开 {client}？", "{client} を切断しますか？", "Disconnect {client}?"),
  disconnectNowLabel: w("马上生效：", "すぐに反映：", "Right away: "),
  disconnectNow: w("{client} 立刻读不到你的 Orbit。", "{client} はすぐに Orbit を読めなくなります。", "{client} can no longer read your Orbit."),
  disconnectVoidLabel: w("没确认的作废：", "未確認のものは取り消し：", "Unconfirmed are voided: "),
  disconnectVoid: w("它提的 {n} 项修改还没确认，会一起作废。", "まだ確認していない提案 {n} 件もいっしょに取り消されます。", "The {n} {items} it proposed and you haven’t confirmed are voided too."),
  disconnectKeepLabel: w("改好的不动：", "変更済みはそのまま：", "Done stays done: "),
  disconnectKeep: w("你已经确认改好的，照旧保留。", "確認して変更したものは、そのまま残ります。", "What you already confirmed stays as it is."),
  cancel: w("取消", "キャンセル", "Cancel"),
  disconnected: w("已断开 {client}", "{client} を切断しました", "Disconnected {client}"),
  disconnectedVoided: w("已断开 {client}，{n} 项没确认的修改已作废", "{client} を切断し、未確認の変更 {n} 件を取り消しました", "Disconnected {client}; {n} unconfirmed {items} voided"),
  disconnectFailed: w("没断开，再试一次", "切断できませんでした。もう一度お試しください", "Not disconnected — try again"),
  sameForAll: w("不管连的是哪个，都一样", "どれをつないでも同じです", "The same whichever you connect"),
  gives: w("能给的", "渡すもの", "What it can get"),
  givesOne: w("✓ 你允许的那几类记录", "✓ 許可した種類の記録", "✓ The kinds of records you allow"),
  givesTwo: w("✓ 它提的修改，你点确认才会改", "✓ 提案された変更は、確認したときだけ反映", "✓ Changes it proposes happen only when you confirm"),
  never: w("永远不给的", "決して渡さないもの", "Never given"),
  neverOne: w("✕ iOrbit 记住的事 · 完整对话", "✕ iOrbit が覚えていること · 会話の全文", "✕ What iOrbit remembers · full conversations"),
  neverTwo: w("✕ 任何人的电话和邮箱", "✕ 誰の電話番号やメールアドレスも", "✕ Anyone’s phone number or email"),
  emptyChip: w("还没有连接", "まだ接続はありません", "Nothing connected yet"),
  emptyTitle: w("还没有 AI 助手连到 Orbit", "Orbit につないだ AI アシスタントはまだありません", "No AI assistant is connected to Orbit yet"),
  emptyLead: w("连上以后，你可以在 Claude 或 Codex 里直接问自己的联系人、待办、笔记，也可以让它帮你提修改。", "つなぐと、Claude や Codex で自分の連絡先・タスク・メモについてそのまま聞けて、変更の提案もしてもらえます。", "Once connected, you can ask Claude or Codex about your contacts, to-dos and notes, and have it propose changes."),
  stepOne: w("在 Claude 或 Codex 里添加 Orbit，填这个地址", "Claude か Codex で Orbit を追加し、このアドレスを入力", "In Claude or Codex, add Orbit with this address"),
  copy: w("复制", "コピー", "Copy"),
  copied: w("已复制", "コピーしました", "Copied"),
  stepTwo: w("它会打开 Orbit，让你选给它看哪几类。", "Orbit が開くので、見せる種類を選びます。", "It opens Orbit so you can choose what it may see."),
  stepThree: w("点「允许」就连上了。它提的修改，都要你回来点确认。", "「許可する」でつながります。提案された変更は、戻ってきて確認するまで反映されません。", "Press “Allow” and you’re connected. Every change it proposes waits for your confirmation."),
  // ── 收件箱 ──
  inboxLine: w("{summary} · {time} 前有效", "{summary} · {time} まで有効", "{summary} · valid until {time}"),
  inboxHead: w("你连着的 {client} 提的。看清楚再点确认；不认识就点「不改了」。", "接続中の {client} からの提案です。よく見てから確認を。心当たりがなければ「変更しない」を。", "From the {client} you connected. Look before you confirm; if you don’t recognise it, press “Don’t change”."),
  waitingChip: w("等你确认", "確認待ち", "Waiting for you"),
  today: w("今天", "今日", "today"),
  tomorrow: w("明天", "明日", "tomorrow"),
  yesterday: w("昨天", "昨日", "yesterday"),
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
