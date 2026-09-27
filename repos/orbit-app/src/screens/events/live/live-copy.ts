import type { OrbitLanguage } from "../../../api/contract/language";

const zh = {
  back: "活动详情", live: "现场", fallbackTitle: "活动现场",
  tabs: { home: "首页", rec: "推荐", all: "参会者", group: "分组", agenda: "议程" },
  loading: "正在读取现场…", retry: "重新读取", busy: "正在确认结果…",
  position: "你现在的位置", table: (n: number) => `${n} 号桌`, round: (n: number) => `第 ${n} 轮`, people: (n: number) => `${n} 人`, peopleWithMe: (n: number) => `${n} 人（含你）`,
  noTable: "尚未为你发布分桌结果。",
  checkedIn: "已完成签到", checkedInAt: (time: string) => `${time} 签到成功`, checkIn: "立即签到", checkInClosed: "当前不在签到时间内", checkingIn: "签到中…",
  forYou: "推荐给你", all: "全部 ›", graphRow: "关系图谱", graphSummary: (known: number, rec: number) => `现场已认识 ${known} 人 · 推荐认识 ${rec} 人`,
  recIntro: "基于你的兴趣、行业和当前场景。只有你主动申请交换，对方才会收到你的信息。", match: (score: number) => `${score}%`,
  search: "搜索姓名、公司、职位", searchLabel: "搜索参会者", allAttendees: "全部参会者", noMatch: "没有匹配的参会者。", noOthers: "还没有其他参会者报名。",
  currentGroup: (round: number) => `第 ${round} 轮 · 当前分组`, otherGroup: (round: number) => `第 ${round} 轮分组`, switchRound: "切换轮次", theme: (text: string) => `本组主题：${text}`,
  whyTable: "为什么分到这桌", icebreakers: "全桌破冰", prompts: "交流建议", tablemates: "同桌成员",
  agendaEmptyTitle: "还没有发布议程", agendaEmptyBody: "主办方发布后显示在这里，正在进行的环节会标出来。",
  flow: "现场流程", flowItems: { checkIn: "开始签到", roundOne: "第一轮分桌", roundTwo: "第二轮话题桌" },
  agendaStatus: { done: "已完成", now: "进行中", soon: "即将开始", later: "未开始" },
  graphTitle: "现场关系", graphHint: "点人物查看资料", me: "我", known: "现场已认识", recommended: "推荐认识", graphEmpty: "交换名片或结果发布后，这里会显示你的现场关系。",
  results: {
    locked: { title: "结果尚未开放", body: "发布后，推荐和分组会出现在这里。" },
    not_generated: { title: "结果尚未生成", body: "组织者尚未为当前报名发布结果。" },
    processing: { title: "结果正在生成", body: "全部生成并由组织者发布后才会出现。" },
    failed: { title: "结果生成未完成", body: "组织者可以重试；系统没有发布替代结果。" },
    ready: { title: "暂无推荐", body: "已发布的结果没有为你返回推荐。" }
  },
  deniedTitle: "现场只对已报名的参会者开放", deniedBody: "报名通过后，活动当天可以在这里签到、看推荐、交换名片。", deniedAction: "查看活动并报名",
  offline: "没有网络 · 连上后点「重新读取」", needsNetwork: "需要联网",
  close: "关闭", sharedTopics: "共同兴趣", placement: "位置", card: "名片", none: "—",
  placementValue: (round: number, table: number) => `第 ${round} 轮 · ${table} 号桌`,
  cardState: { self: "这是你本人", none: "未交换", outgoing: "已申请，等待对方", incoming: "对方申请交换", accepted: "已交换", declined: "对方已拒绝", withdrawn_outgoing: "你已撤回", withdrawn_incoming: "申请已撤回" },
  request: "申请交换名片", requestAgain: "再次申请交换", requested: "已申请 · 撤回", accept: "接受", ignore: "忽略", exchanged: "已交换 · 打开联系人", opensAtStart: "活动开始后可申请交换",
  requestedWaiting: "已申请 · 等待对方", recAction: { none: "申请交换名片", outgoing: "已申请 · 等待对方", incoming: "对方申请交换 · 查看", accepted: "已交换", declined: "对方已拒绝", withdrawn_outgoing: "再次申请交换", withdrawn_incoming: "申请已撤回", self: "" },
  note: "记一条笔记", schedule: "约个时间", exchangeFirst: "先交换名片：笔记和约时间挂在联系人上。", loadingPerson: "正在读取资料…",
  noteTitle: "记一条笔记", noteWhat: "聊了什么", noteNeed: "对方需求", noteOffer: "我能提供", noteNext: "后续动作", notePrivacy: "只有你能看到，组织方和其他参会者不可见。", save: "保存", saving: "保存中…", cancel: "取消", noteSaved: "笔记已保存",
  scheduleTitle: "约个时间", scheduleHint: (count: number) => `已选 ${count} 个 · 选 3–5 个候选时段（日本时间）`, inPerson: "现场见面", video: "线上会议", scheduleNote: "附加说明（可选）", send: "发送邀约", sending: "发送中…", scheduleSent: "邀约已发送，等待对方确认",
  checkingAppointments: "正在检查已有约谈…", existingAppointment: "已有进行中的约谈", existingStatus: { draft: "草稿", awaiting_response: "邀约已发送，等待对方回复", negotiating: "正在协商时间", confirmed: "约谈已确认", reschedule_pending: "改期待确认", cancelled: "已取消", completed: "已完成" },
  openContact: "在联系人页查看", draftContinues: "将在已保存的草稿上继续。"
};

type LiveCopy = typeof zh;

const en: LiveCopy = {
  back: "Event details", live: "Live", fallbackTitle: "Event live",
  tabs: { home: "Home", rec: "For you", all: "Attendees", group: "Groups", agenda: "Agenda" },
  loading: "Loading the live page…", retry: "Reload", busy: "Confirming…",
  position: "Where you are now", table: n => `Table ${n}`, round: n => `Round ${n}`, people: n => `${n} people`, peopleWithMe: n => `${n} people (incl. you)`,
  noTable: "No table has been published for you yet.",
  checkedIn: "Checked in", checkedInAt: time => `Checked in at ${time}`, checkIn: "Check in now", checkInClosed: "Check-in is not open right now", checkingIn: "Checking in…",
  forYou: "For you", all: "All ›", graphRow: "Relationship graph", graphSummary: (known, rec) => `${known} connected · ${rec} recommended`,
  recIntro: "Based on your interests, industry and this event. They only see your details after you request an exchange.", match: score => `${score}%`,
  search: "Search name, company, role", searchLabel: "Search attendees", allAttendees: "All attendees", noMatch: "No attendee matches this search.", noOthers: "No other attendee is registered yet.",
  currentGroup: round => `Round ${round} · current group`, otherGroup: round => `Round ${round} group`, switchRound: "Switch round", theme: text => `Theme: ${text}`,
  whyTable: "Why this table", icebreakers: "Table icebreakers", prompts: "Talking points", tablemates: "Tablemates",
  agendaEmptyTitle: "No agenda published yet", agendaEmptyBody: "It appears here once the organizer publishes it; the current item is highlighted.",
  flow: "Live schedule", flowItems: { checkIn: "Check-in opens", roundOne: "Round one tables", roundTwo: "Round two topic tables" },
  agendaStatus: { done: "Done", now: "Now", soon: "Up next", later: "Later" },
  graphTitle: "Your connections here", graphHint: "Tap a person to open", me: "Me", known: "Connected", recommended: "Recommended", graphEmpty: "Your connections appear after an exchange or once results are published.",
  results: {
    locked: { title: "Results are not open yet", body: "Recommendations and groups appear here once published." },
    not_generated: { title: "Results have not been generated", body: "The organizer has not published results for this registration." },
    processing: { title: "Results are being generated", body: "They appear only after generation finishes and the organizer publishes them." },
    failed: { title: "Results are not ready", body: "The organizer can retry; no substitute result was published." },
    ready: { title: "No recommendation", body: "The published results returned no recommendation for you." }
  },
  deniedTitle: "The live page is for registered attendees", deniedBody: "Once your registration is approved, you can check in, see recommendations and exchange cards here on the day.", deniedAction: "View event and register",
  offline: "No connection · reload when you are back online", needsNetwork: "Needs a connection",
  close: "Close", sharedTopics: "Shared interests", placement: "Seat", card: "Business card", none: "—",
  placementValue: (round, table) => `Round ${round} · Table ${table}`,
  cardState: { self: "This is you", none: "Not exchanged", outgoing: "Requested, waiting", incoming: "They asked to exchange", accepted: "Exchanged", declined: "Declined", withdrawn_outgoing: "You withdrew", withdrawn_incoming: "Request withdrawn" },
  request: "Request card exchange", requestAgain: "Request again", requested: "Requested · Withdraw", accept: "Accept", ignore: "Ignore", exchanged: "Exchanged · open contact", opensAtStart: "Exchange opens when the event starts",
  requestedWaiting: "Requested · waiting", recAction: { none: "Request card exchange", outgoing: "Requested · waiting", incoming: "They asked · view", accepted: "Exchanged", declined: "Declined", withdrawn_outgoing: "Request again", withdrawn_incoming: "Request withdrawn", self: "" },
  note: "Add a note", schedule: "Pick a time", exchangeFirst: "Exchange cards first: notes and meetings attach to a contact.", loadingPerson: "Loading profile…",
  noteTitle: "Add a note", noteWhat: "What you discussed", noteNeed: "Their needs", noteOffer: "I can offer", noteNext: "Next step", notePrivacy: "Only you can see this; organizers and attendees cannot.", save: "Save", saving: "Saving…", cancel: "Cancel", noteSaved: "Note saved",
  scheduleTitle: "Pick a time", scheduleHint: count => `${count} selected · choose 3–5 slots (Japan time)`, inPerson: "In person", video: "Video call", scheduleNote: "Note (optional)", send: "Send invitation", sending: "Sending…", scheduleSent: "Invitation sent, waiting for their reply",
  checkingAppointments: "Checking existing appointments…", existingAppointment: "An appointment is already in progress", existingStatus: { draft: "Draft", awaiting_response: "Invitation sent — waiting for their reply", negotiating: "Negotiating times", confirmed: "Appointment confirmed", reschedule_pending: "Reschedule pending", cancelled: "Cancelled", completed: "Completed" },
  openContact: "Open on the contact page", draftContinues: "Continuing your saved draft."
};

const ja: LiveCopy = {
  back: "イベント詳細", live: "会場", fallbackTitle: "イベント会場",
  tabs: { home: "ホーム", rec: "おすすめ", all: "参加者", group: "グループ", agenda: "アジェンダ" },
  loading: "会場ページを読み込み中…", retry: "再読み込み", busy: "結果を確認中…",
  position: "いまの場所", table: n => `テーブル ${n}`, round: n => `第 ${n} ラウンド`, people: n => `${n} 人`, peopleWithMe: n => `${n} 人（あなたを含む）`,
  noTable: "テーブルはまだ公開されていません。",
  checkedIn: "チェックイン済み", checkedInAt: time => `${time} にチェックイン`, checkIn: "チェックインする", checkInClosed: "チェックイン受付時間外です", checkingIn: "チェックイン中…",
  forYou: "あなたへのおすすめ", all: "すべて ›", graphRow: "つながりマップ", graphSummary: (known, rec) => `つながり ${known} 人 · おすすめ ${rec} 人`,
  recIntro: "興味・業界・このイベントに基づくおすすめです。あなたが申請するまで相手に情報は届きません。", match: score => `${score}%`,
  search: "名前・会社・役職で検索", searchLabel: "参加者を検索", allAttendees: "すべての参加者", noMatch: "該当する参加者はいません。", noOthers: "ほかの参加者はまだいません。",
  currentGroup: round => `第 ${round} ラウンド · 現在のグループ`, otherGroup: round => `第 ${round} ラウンドのグループ`, switchRound: "ラウンド切替", theme: text => `テーマ：${text}`,
  whyTable: "このテーブルになった理由", icebreakers: "テーブルの話題", prompts: "会話のヒント", tablemates: "同じテーブル",
  agendaEmptyTitle: "アジェンダはまだ公開されていません", agendaEmptyBody: "主催者が公開するとここに表示され、進行中の項目が示されます。",
  flow: "当日の流れ", flowItems: { checkIn: "チェックイン開始", roundOne: "第 1 ラウンド", roundTwo: "第 2 ラウンド（テーマ別）" },
  agendaStatus: { done: "完了", now: "進行中", soon: "まもなく", later: "未開始" },
  graphTitle: "会場でのつながり", graphHint: "人をタップして表示", me: "自分", known: "つながり済み", recommended: "おすすめ", graphEmpty: "名刺交換や結果公開のあと、ここに表示されます。",
  results: {
    locked: { title: "結果はまだ公開されていません", body: "公開後、おすすめとグループがここに表示されます。" },
    not_generated: { title: "結果はまだ生成されていません", body: "主催者はこの登録の結果をまだ公開していません。" },
    processing: { title: "結果を生成中です", body: "生成が完了し主催者が公開すると表示されます。" },
    failed: { title: "結果は未完了です", body: "主催者が再試行できます。代わりの結果は公開されていません。" },
    ready: { title: "おすすめはありません", body: "公開された結果にあなたへのおすすめはありませんでした。" }
  },
  deniedTitle: "会場ページは登録済みの参加者専用です", deniedBody: "参加登録が承認されると、当日ここでチェックイン・おすすめ確認・名刺交換ができます。", deniedAction: "イベントを見て登録する",
  offline: "オフライン · 接続後に再読み込みしてください", needsNetwork: "接続が必要です",
  close: "閉じる", sharedTopics: "共通の関心", placement: "場所", card: "名刺", none: "—",
  placementValue: (round, table) => `第 ${round} ラウンド · テーブル ${table}`,
  cardState: { self: "あなた自身です", none: "未交換", outgoing: "申請済み・相手の同意待ち", incoming: "相手から申請があります", accepted: "交換済み", declined: "相手が辞退しました", withdrawn_outgoing: "申請を取り消しました", withdrawn_incoming: "申請は取り消されました" },
  request: "名刺交換を申請", requestAgain: "もう一度申請", requested: "申請済み · 取り消す", accept: "承認", ignore: "無視", exchanged: "交換済み · 連絡先を開く", opensAtStart: "イベント開始後に申請できます",
  requestedWaiting: "申請済み · 同意待ち", recAction: { none: "名刺交換を申請", outgoing: "申請済み · 同意待ち", incoming: "相手から申請 · 見る", accepted: "交換済み", declined: "相手が辞退", withdrawn_outgoing: "もう一度申請", withdrawn_incoming: "申請は取り消されました", self: "" },
  note: "メモを残す", schedule: "日程を決める", exchangeFirst: "先に名刺交換を：メモと日程は連絡先に紐づきます。", loadingPerson: "プロフィールを読み込み中…",
  noteTitle: "メモを残す", noteWhat: "話した内容", noteNeed: "相手のニーズ", noteOffer: "提供できること", noteNext: "次のアクション", notePrivacy: "あなただけが見られます。主催者や参加者には見えません。", save: "保存", saving: "保存中…", cancel: "キャンセル", noteSaved: "メモを保存しました",
  scheduleTitle: "日程を決める", scheduleHint: count => `${count} 件選択 · 候補を 3〜5 件（日本時間）`, inPerson: "会場で会う", video: "オンライン", scheduleNote: "補足（任意）", send: "招待を送る", sending: "送信中…", scheduleSent: "招待を送りました。相手の返事を待っています",
  checkingAppointments: "既存の予定を確認中…", existingAppointment: "進行中の予定があります", existingStatus: { draft: "下書き", awaiting_response: "招待済み・返信待ち", negotiating: "日程調整中", confirmed: "予定が確定しました", reschedule_pending: "日程変更の確認待ち", cancelled: "キャンセル済み", completed: "完了" },
  openContact: "連絡先ページで見る", draftContinues: "保存済みの下書きから続けます。"
};

export const liveCopy: Record<OrbitLanguage, LiveCopy> = { zh, en, ja };
export type { LiveCopy };
