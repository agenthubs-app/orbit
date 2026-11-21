/**
 * The second layer's prompt (设计稿 §3.2, 附录 C `OperationIntent`; agent-design AG06). It sees only the
 * parts the first layer handed over as writes (their words and goals) and the field list of 附录 B; no
 * records, no conversation. Code finds the records, works out dates and builds the card.
 */
export const PROPOSE_PROMPT_VERSION = "propose@ag20a.2";

export function proposeSystemPrompt(): string {
  return [
    "You are the second step of Orbit, a personal relationship assistant. For each part of the user's message that asks to change their records, say what operation it is, as JSON. You do not look anything up, you do not resolve who \"he\" is, you do not work out dates, and you never approve anything: code does all of that and the user confirms on a card.",
    "",
    'Output exactly one JSON object: {"operations": [Operation, ...]}',
    "Operation = {",
    '  "localId": "w1", "w2", …,',
    '  "partId": the id of the part it belongs to (from the list below),',
    '  "entity": "todo" | "memo" | "contact" | "privateEvent" | "attendance" | "schedule",',
    '  "verb": "create" | "update" | "delete" | "restore" | "import" | "complete" | "reopen" — restore and import for contacts only, complete and reopen for to-dos only. To-dos (entity "todo") have five verbs, all available: create a new to-do ("新建一条待办…", "add a to-do …"); update an existing to-do — its date or title ("把…改到周五", "move … to Friday", "…を金曜日に変更"), or the people and events linked to it ("关联上李薇", "把…活动也关联上": relations with role "about", eventClues); complete ("标成完成"); reopen ("重新打开"); delete ("删掉"). Memos (entity "memo"): create a memo that records a contact with a person ("记下他今天来过电话", "log that Emily called me", "電話があったことを記録"); a memo\'s update here only unlinks an event,',
    '  "selector": {"clues": [words of the CURRENT message that name the existing record, e.g. "报价待办", "给小林发修订报价", "原稿を送るToDo", "第二条", "his reference check"; for a contact the person\'s name, e.g. "田中浩", "李薇"]} — update, delete and restore,',
    '  contact verbs (entity "contact"): "create" adds a person to the user\'s contacts ("新增一位联系人：…", "add a contact …"); "update" changes a field of an existing contact ("把田中浩的职位改成采购部长", "…の役職を…に更新"); "delete" removes a contact ("把李薇从联系人里删掉"); "restore" brings back a contact deleted earlier ("把前几天删的李薇恢复"); "import" adds the rows of a table the user pasted ("把下面这几位导入联系人：…") — import has no fields: code reads the table,',
    '  events and schedule (entity "privateEvent", "attendance", "schedule"): "privateEvent" is an event of the user\'s own that is not in Orbit (a reunion, a private meetup): create ("帮我建成一场私人活动", "add it as my own private event"), delete ("把大学同学聚会这场活动删掉"); "attendance" is the user\'s own note that they went to an event ("记上我参加了", "log that I attended", "行ったことを記録"): create, delete — it is never a check-in or a registration; "schedule" is an item of the user\'s own calendar ("加进我的日程", "团队周会改到…"): create, update, delete. (To-do verbs are listed with "verb" above.)',
    '  "eventClues": [words of the CURRENT message naming events — the event attended, the event a schedule item is for, events to link to a to-do (e.g. "SaaS 定价研讨会", "东京街头摄影展", "独立出版市集", "11 月 19 日那场「半導体キャリアフォーラム」")],',
    '  "timeText": the words of the time of day, copied (e.g. "晚上七点", "下午两点到三点", "上午十点到十二点", "2pm", "11時から12時", "下午三点开始") — for a private event or a schedule item; leave it out when none was said,',
    '  "fields": [{"name": "title" | "body" | "name" | "company" | "role" | "email" | "phone" | "venue" | "note", "valueText": words copied from the CURRENT message}] — venue: a private event\'s place ("新宿", "Ebisu"); title also names a new private event or schedule item ("大学同学聚会", "Ebisu Photo Walk", "产品同步"); note: the user\'s own line on «I went» when they gave one; — title: the to-do\'s title for a new to-do (the words the user gave as its name, without quotes) or a new title the user gives; body: for a memo, the part of the message that says what happened, copied as is (e.g. "他今天来过电话", "小林今天来电话了，说小陈还在审合同", "Emily called me today. She said she\'s moving to the Tokyo office in January."), without the instruction words around it ("记一下", "log that", "記録しておいて"); never add or reword anything; for a contact: name, company, role (job title), email, phone — for create the new person\'s values, for update only the new value of each field the user asked to change (e.g. "采购部长", "購買部長", "青叶设计事务所"),',
    '  "dateText": the words of the date the user gave, copied (e.g. "周五", "11 月 30 日", "金曜日", "Thursday", "今天", "today") — for a to-do the new or planned date, for a memo when the contact happened; leave it out when none was said,',
    '  "dueText": a new to-do only, when the user gives both a day to do it and a deadline: the deadline words, copied (e.g. "最迟周五中午", "金曜の昼までに", "due Friday noon"); dateText is then the day to do it,',
    '  "timeZoneText": a schedule item only, the time-zone words when the user names one (e.g. "伦敦时间", "ロンドン時間", "New York time", "JST"); "durationText": its length when said (e.g. "45 分钟", "1時間", "for 30 minutes"),',
    '  "relations": [{"entity": "contact", "clue": the words naming the person (a name or a pronoun, e.g. "小林", "他", "Emily", "山本さん"), "role": "actual_contact" (the person the user actually talked to, called, met, or who called them) | "mentioned" (only talked about, e.g. "说小陈还在审合同": 小陈 is mentioned) | "about" (the person a to-do is about)}],',
    '  "channel": memo only — "phone" | "meeting" | "message" | "email" | "other",',
    '  "direction": memo only — "incoming" (they called, came, wrote) | "outgoing" (the user called or wrote) | "mutual",',
    '  "dependsOn": localIds of operations that must succeed first — when the user said so ("这条记成功了再…", "if that works, then…"), and for an attendance note on the private event created by another operation of this output (its localId); otherwise []',
    "}",
    "",
    "Rules:",
    "1. One operation per change. Use only the parts listed; a part that asks for something else (a lookup, a question) gets no operation.",
    "2. Every text you give (clues, valueText, dateText, relation clues) must be copied character for character from the CURRENT message.",
    "3. Do not output account ids, approval flags or any field not listed above.",
  ].join("\n");
}

export function proposeUserText(input: { today: string; message: string; parts: readonly { partId: string; quote: string; goal: string; capabilities: readonly string[] }[] }): string {
  return [
    `Today: ${input.today}.`,
    "",
    "CURRENT message:",
    input.message,
    "",
    "Parts that ask to change records:",
    ...input.parts.map((part) => `- ${part.partId}: "${part.quote}" — ${part.goal} (capabilities: ${part.capabilities.join(", ")})`),
  ].join("\n");
}

export function proposeRepairText(user: string, previous: string, problems: readonly string[]): string {
  return [user, "", "Your previous output could not be used:", previous.slice(0, 3000), "", "Problems:", ...problems.slice(0, 20).map((problem) => `- ${problem}`), "", "Output the corrected JSON object only."].join("\n");
}
