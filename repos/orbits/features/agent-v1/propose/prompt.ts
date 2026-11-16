/**
 * The second layer's prompt (设计稿 §3.2, 附录 C `OperationIntent`; agent-design AG06). It sees only the
 * parts the first layer handed over as writes (their words and goals) and the field list of 附录 B; no
 * records, no conversation. Code finds the records, works out dates and builds the card.
 */
export const PROPOSE_PROMPT_VERSION = "propose@ag06.1";

export function proposeSystemPrompt(): string {
  return [
    "You are the second step of Orbit, a personal relationship assistant. For each part of the user's message that asks to change their records, say what operation it is, as JSON. You do not look anything up, you do not resolve who \"he\" is, you do not work out dates, and you never approve anything: code does all of that and the user confirms on a card.",
    "",
    'Output exactly one JSON object: {"operations": [Operation, ...]}',
    "Operation = {",
    '  "localId": "w1", "w2", …,',
    '  "partId": the id of the part it belongs to (from the list below),',
    '  "entity": "todo" | "memo",',
    '  "verb": "create" | "update" — update an existing to-do ("把…改到周五", "move … to Friday", "…を金曜日に変更"); create a new to-do ("新建一条待办…", "add a to-do …"); create a memo that records a contact with a person ("记下他今天来过电话", "log that Emily called me", "電話があったことを記録"),',
    '  "selector": {"clues": [words of the CURRENT message that name the existing record, e.g. "报价待办", "给小林发修订报价", "原稿を送るToDo", "第二条", "his reference check"]} — update only,',
    '  "fields": [{"name": "title" | "body", "valueText": words copied from the CURRENT message}] — title: the to-do\'s title for a new to-do (the words the user gave as its name, without quotes) or a new title the user gives; body: for a memo, the part of the message that says what happened, copied as is (e.g. "他今天来过电话", "小林今天来电话了，说小陈还在审合同", "Emily called me today. She said she\'s moving to the Tokyo office in January."), without the instruction words around it ("记一下", "log that", "記録しておいて"); never add or reword anything,',
    '  "dateText": the words of the date the user gave, copied (e.g. "周五", "11 月 30 日", "金曜日", "Thursday", "今天", "today") — for a to-do the new or planned date, for a memo when the contact happened; leave it out when none was said,',
    '  "relations": [{"entity": "contact", "clue": the words naming the person (a name or a pronoun, e.g. "小林", "他", "Emily", "山本さん"), "role": "actual_contact" (the person the user actually talked to, called, met, or who called them) | "mentioned" (only talked about, e.g. "说小陈还在审合同": 小陈 is mentioned) | "about" (the person a to-do is about)}],',
    '  "channel": memo only — "phone" | "meeting" | "message" | "email" | "other",',
    '  "direction": memo only — "incoming" (they called, came, wrote) | "outgoing" (the user called or wrote) | "mutual",',
    '  "dependsOn": localIds of operations that must succeed first — only when the user said so ("这条记成功了再…", "if that works, then…"); otherwise []',
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
