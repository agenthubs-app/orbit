/**
 * AG09 run-03 (coordinator, AE-BND-006): an object clue that is only a demonstrative ("这条待办", "このタスク", "the task")
 * while the user described the record right before it ("约山本吃饭这条待办", "山本さんとの食事のこのタスク", "the
 * dinner-with-Yamamoto task"). The describing words are the clue: the record is looked up by them, and the object is not
 * taken as missing (the same kind of rule as AG07 namedObjectWithDate and AG08 listSearchWords — an object the user named
 * in their own words). Code decides from the message; nothing the model wrote is added.
 */
import { isPronounClue } from "../route/decide";

/** Where describing words stop when read backwards from the demonstrative. */
const BOUNDARY = /[\s、，。,.!?！？「」『』（）()：:；;"“”]/u;
/** Words that lead into the object without describing it ("把…", "将…", "帮我…"). */
const LEADING = /^(?:请|麻烦|帮我|帮忙|看看|看一下|查查|查一下|把|将|给|对|和|跟|关于)+/u;
/** AG11 run-02 (AE-JDG-007): a conditional lead-in ("要是把…", "如果将…", "もし…") — only it and one 把／将 go, so the record's own words ("给小林发修订报价") stay. */
const CONDITIONAL = /^(?:要是|如果|假如|假设|万一|若是|倘若|もしも?)\s*(?:把|将)?/u;
/** The particle tying the description to the demonstrative ("…的这条", "…のこの"). */
const TRAILING = /(?:的|の)+$/u;
/** "这条待办", "那篇笔记", "このタスク", "その予定": a demonstrative and a record word, nothing else. */
const CJK_DEMONSTRATIVE = /^(?:(?:这|那)(?:条|个|篇|件|项|场|次|份)?(?:待办|代办|笔记|活动|日程|任务|安排|事|记录)|(?:この|その|あの)(?:タスク|ToDo|予定|メモ|件|イベント|打ち合わせ|用事|記録))$/u;
/** Words of when, not of what ("刚才那件事", "さっきのあの件"): they describe no record. */
const TIME_ONLY = /^(?:刚才|刚刚|上次|之前|以前|昨天|今天|前天|早上|上午|下午|晚上|最近|さっき|この前|前回|昨日|今日|先日|earlier|recently|yesterday|today|last time)$/iu;
const LATIN_NOUN = "(?:task|to-?do|note|memo|event|meeting|appointment|plan|item|schedule)";

/** A clue that names nothing by itself: a demonstrative with a record word ("这条待办", "このタスク", "the task"). */
export function demonstrativeOnly(text: string): boolean {
  const words = text.trim();
  // Not a personal pronoun ("他", "彼女", "she"): those stand for a person, resolved from the context (AG04 rules).
  return CJK_DEMONSTRATIVE.test(words) || new RegExp(`^(?:this|that|the|these|those)\\s+${LATIN_NOUN}s?$`, "iu").test(words);
}

function trimmed(message: string, start: number, end: number): [number, number] | null {
  let s = start;
  let e = end;
  const conditional = CONDITIONAL.exec(message.slice(s, e));
  const lead = conditional ?? LEADING.exec(message.slice(s, e));
  if (lead) s += lead[0].length;
  const tail = TRAILING.exec(message.slice(s, e));
  if (tail) e -= tail[0].length;
  const words = message.slice(s, e).trim();
  if ([...words].length < 2 || isPronounClue(words) || TIME_ONLY.test(words)) return null;
  return [s, e];
}

/**
 * The span of the words describing the record a demonstrative clue points at, or null. `clue` is the clue's span in the
 * message when the clue was copied from it; `clueText` serves an English clue that was not ("the task" for "the
 * dinner-with-Yamamoto task"). The words must lie inside the part's own span.
 */
export function describedObjectSpan(message: string, clue: [number, number] | null, part: [number, number], clueText?: string): [number, number] | null {
  const text = clue && clue[0] >= 0 ? message.slice(clue[0], clue[1]) : clueText ?? "";
  if (!text || !demonstrativeOnly(text)) return null;
  if (clue && clue[0] >= 0 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    let start = clue[0];
    while (start > part[0] && !BOUNDARY.test(message[start - 1])) start -= 1;
    return start < clue[0] ? trimmed(message, start, clue[0]) : null;
  }
  // English: "this / that / the <describing words> task" within the part.
  const region = message.slice(part[0], part[1]);
  const match = new RegExp(`\\b(?:this|that|the)\\s+((?:[\\w'’-]+\\s+){0,4}?[\\w'’-]+)\\s+${LATIN_NOUN}\\b`, "iu").exec(region);
  if (!match) return null;
  const start = part[0] + match.index + match[0].indexOf(match[1]);
  return trimmed(message, start, start + match[1].length);
}

/**
 * AG12 run-03 (coordinator, AE-WEB-004): a person or company clue that names nobody — a demonstrative with a person or
 * company word ("那家公司", "这个人", "那位", "その会社", "あの人", "that company") or a personal pronoun ("他", "彼", "he") —
 * in a part where another clue names a record in its own words ("竞品笔记 C"): it is the subject inside that record, not a
 * contact to look up (the same family as demonstrativeOnly: a clue that names nothing by itself).
 */
const CJK_UNNAMED_SUBJECT = /^(?:(?:这|那)(?:家|个|位|间|名|一家|一位)?(?:公司|企业|厂商|店|人|客户|对方|品牌|供应商)?|(?:この|その|あの)(?:会社|企業|人|方|お店|店|取引先|相手|ブランド))$/u;
const LATIN_UNNAMED_SUBJECT = /^(?:(?:this|that|the|these|those)\s+(?:company|firm|vendor|supplier|brand|person|guy|client|customer|one|people)|it|they|them)$/iu;

export function unnamedSubject(text: string): boolean {
  const words = text.trim();
  return CJK_UNNAMED_SUBJECT.test(words) || LATIN_UNNAMED_SUBJECT.test(words) || isPronounClue(words);
}

/** Record words that name no particular record ("待办", "笔记", "the note"): what is left after them must name it. */
const GENERIC_RECORD_WORDS = /(?:这|那)?(?:条|篇|个|份)?(?:待办|代办|笔记|备忘|记录|任务|日程|活动|メモ|タスク|予定|記録|ノート|\b(?:the|this|that|my)\b|\bnotes?\b|\bmemos?\b|\btasks?\b|\bto-?dos?\b|\brecords?\b)/giu;

/** A note clue that names a particular note in its own words ("竞品笔记 C", "the Nov 10 note"), not just "笔记" or "这篇笔记". */
function namesANote(other: { entity: string; text: string }): boolean {
  if (other.entity !== "memo" || demonstrativeOnly(other.text) || isPronounClue(other.text) || unnamedSubject(other.text)) return false;
  return other.text.replace(GENERIC_RECORD_WORDS, "").replace(/[\s@「」"“”]/gu, "").length >= 2;
}

/**
 * AG13 opening 3 (AE-RD-003): a contact clue that is only a word of when or a demonstrative of time ("当时", "那时", "今天",
 * "その時", "あの時", "then", "that time") names no person. The part it came in ("当时说了什么？") is about the object of the
 * part before it in the same message, not a contact to look up.
 */
const CJK_TIME_CLUE = /^(?:当时|那时|那时候|那会儿|当时候|彼时|这时|这时候|那次|这次|那天|这天|当天|那一次|这一次|那回)$/u;
const JA_TIME_CLUE = /^(?:その時|そのとき|あの時|あのとき|その際|当時|その日|あの日|その場|今回|前回|この時|このとき)$/u;
const EN_TIME_CLUE = /^(?:then|back then|at that time|that time|this time|that day|the time|at the time|that|this)$/iu;

export function timeWordClue(clue: { entity: string; text: string }): boolean {
  if (clue.entity !== "contact") return false;
  const words = clue.text.trim().replace(/[。.?？!！、，,]+$/u, "");
  return CJK_TIME_CLUE.test(words) || JA_TIME_CLUE.test(words) || EN_TIME_CLUE.test(words) || TIME_ONLY.test(words);
}

// A described group of contacts ("东京做零售的联系人", "東京で小売をしている連絡先", "contacts in retail in Tokyo") is a
// filter on the contacts, not one person to look up (AG13 rerun of AG08, AE-SCL-013).
const CJK_GROUP = /^.{2,}(?:的|の)(?:联系人|人脉|人們|人们|那些人|几位|朋友们|客户们|連絡先|人たち|方々)$/u;
const JA_GROUP = /^.{2,}(?:いる|てる|した|する|だった)(?:連絡先|人たち|方々)$/u;
const EN_GROUP = /^(?:my\s+|the\s+)?contacts?\s+(?:who|in|at|from|that|with)\b/iu;

/**
 * AG13 gate run-04 (AE-SCL-025): "明天这场周会关联了哪些人" — "哪些人" came tagged as a contact. A question word ("哪些人",
 * "谁", "誰", "who") is what the question asks for, not a person to look up.
 */
const QUESTION_PERSON = /^(?:哪些人|哪些联系人|哪几位|哪几个人|哪位|哪个人|哪一位|谁|是谁|都有谁|有谁|哪些|誰|誰が|どなた|どの人|どの方|who|whom|which (?:people|persons?|contacts?|ones?))$/iu;

export function questionWordClue(clue: { entity: string; text: string }): boolean {
  return clue.entity === "contact" && QUESTION_PERSON.test(clue.text.trim().replace(/[?？。.]+$/u, ""));
}

/**
 * Release-2 gate 2 (AE-ANS-033/034, AE-REF-003): words for the user's contacts or relationships as a whole ("人脉关系",
 * "人脈", "my contacts") or for the people a record is about ("两位客户", "the two clients") name the set, not one person.
 */
// A bare 「联系人」 / 「連絡先」 stays a clue (AG13: "the contact" spoken of); with 我的 / 所有 / 们 it is the set.
const CJK_ALL_PEOPLE = /^(?:(?:我的|自己的|所有的?|全部的?|这些|那些)(?:联系人|連絡先)|联系人们|(?:我的|自己的|所有的?|全部的?)?(?:人脉关系|人脉|人际关系|关系网|客户们|人脈関係|人脈|人間関係|つながり))(?:全体|全部|全員|里|中)?$/u;
const CJK_COUNTED_PEOPLE = /^(?:这|那)?(?:两|二|三|四|几|各|每|一些|一些个)(?:位|个|名|人の)?(?:客户|联系人|人|朋友|同事|お客様|お客さん|方)$/u;
const EN_ALL_PEOPLE = /^(?:(?:all\s+)?(?:of\s+)?my\s+|the\s+|all\s+(?:the\s+|my\s+)?)?(?:contacts|relationships|network|connections|clients|customers|people)$|^(?:the\s+)?(?:two|both|three|several)\s+(?:clients|customers|contacts|people)$/iu;

/**
 * Words for someone not named ("某位人脉", "某个联系人", "a contact", "ある連絡先", "someone"): a person is asked for but none is
 * said — the part asks which contact (gap-copy noContact), never reads everything without one.
 */
export const INDEFINITE_PERSON = /(某位人脉|某位联系人|某个联系人|某个人脉|某位客户|某个人|某人|某位朋友|ある連絡先|ある人脈|誰か|\ba contact\b|\bone of my contacts\b|\bsomeone\b|\bsomebody\b)/iu;

export function groupClue(clue: { entity: string; text: string }): boolean {
  if (clue.entity !== "contact") return false;
  const words = clue.text.trim().replace(/[。.?？!！、，,]+$/u, "");
  return CJK_GROUP.test(words) || JA_GROUP.test(words) || EN_GROUP.test(words) || CJK_ALL_PEOPLE.test(words) || CJK_COUNTED_PEOPLE.test(words) || EN_ALL_PEOPLE.test(words);
}

/** Only parts that read: in a change ("把她的待办改到周五") the person is who the record is about. */
export function subjectInsideRecord(clue: { entity: string; text: string }, others: readonly { entity: string; text: string }[], writes = false): boolean {
  if (writes || clue.entity !== "contact" || !unnamedSubject(clue.text)) return false;
  // AG13 rerun of AG04 (AE-AMB-009): "我和他最近聊了什么" describes the notes by the person (他, named earlier in the
  // conversation); the pronoun is that person, not a subject inside a named note.
  const own = clue.text.trim();
  const inside = (text: string) => (/^[A-Za-z\s'-]+$/u.test(own) ? new RegExp(String.raw`\b${own.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\b`, "iu").test(text) : text.includes(own));
  return others.some((other) => other !== clue && namesANote(other) && !inside(other.text));
}
