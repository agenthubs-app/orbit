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
/** The particle tying the description to the demonstrative ("…的这条", "…のこの"). */
const TRAILING = /(?:的|の)+$/u;
/** "这条待办", "那篇笔记", "このタスク", "その予定": a demonstrative and a record word, nothing else. */
const CJK_DEMONSTRATIVE = /^(?:(?:这|那)(?:条|个|篇|件|项|场|次|份)?(?:待办|笔记|活动|日程|任务|安排|事|记录)|(?:この|その|あの)(?:タスク|ToDo|予定|メモ|件|イベント|打ち合わせ|用事|記録))$/u;
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
  const lead = LEADING.exec(message.slice(s, e));
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
