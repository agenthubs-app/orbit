/**
 * Dates said in a memo, worked out by code (agent-design AG10, PLANNER 易错边界 4/5; 设计稿 §3.5). The model copies the
 * words of a date ("11 月 20 日", "12月5日までに", "by Friday", "前天"); the day is computed here, with the memo's own date
 * as "today" (a memo written on 11-14 that says "前天" means 11-12), in the user's time zone. Words of a deadline
 * ("最迟", "までに", "by", "no later than") make a due date; a day to do something is a planned date. Both may be in one
 * memo and each keeps its own kind. No date words: the date stays empty, it is never guessed.
 */
import { localDayOf, resolveSaidDate } from "../propose/dates";

export type DatePrecision = "day" | "instant" | "unknown";

export interface MemoDate {
  /** YYYY-MM-DD in the user's time zone, or null when the words give no day. */
  day: string | null;
  /** HH:MM when the words name a time of day. */
  time?: string;
  precision: DatePrecision;
}

/** The day (and time) the words mean, with the memo's creation as "today". */
export function memoDateOf(words: string | undefined | null, memoCreatedAt: string, timeZone: string): MemoDate {
  if (!words || !words.trim()) return { day: null, precision: "unknown" };
  // A weekday alone ("by Friday", "周五", "金曜日") is read against the memo's day in more than one way: kept as written.
  if (BARE_WEEKDAY.test(words.trim()) && !/\d/u.test(words)) return { day: null, precision: "unknown" };
  const said = resolveSaidDate(words, memoCreatedAt, timeZone);
  if (!said) return { day: null, precision: "unknown" };
  return { day: said.day, precision: said.time ? "instant" : "day", ...(said.time ? { time: said.time } : {}) };
}

const BARE_WEEKDAY = /^(?:by\s+|before\s+|on\s+|最迟|最晚)?(?:(?:周|星期|礼拜)[一二三四五六日天]|[月火水木金土日]曜日?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:までに|まで|前|之前)?$/iu;

/** The memo's own day (its creation, in the user's time zone). */
export function memoDayOf(memoCreatedAt: string, timeZone: string): string {
  return localDayOf(memoCreatedAt, timeZone);
}

/** Words that make a date a deadline: before it (最迟 / no later than / by) or right after it (までに / 之前 / 前). */
const DEADLINE_BEFORE = /(最迟|最晚|不晚于|截止|期限は?|\bby\b|\bno later than\b|\bbefore\b|\buntil\b|\bdue\b)\s*(?:是|为|在)?\s*$/iu;
const DEADLINE_AFTER = /^\s*(までに|まで|迄に|以前|之前|前(?!往|来|去|面)|为止|截止|\s*or (?:before|earlier))/iu;

/**
 * Whether the date words in this sentence are a deadline: a deadline word stands right before or right after them.
 * `dateText` is where the date is found in the sentence (the model's copy); when it is not there, the sentence
 * as a whole decides (a deadline word anywhere).
 */
export function isDeadline(sentence: string, dateText: string | undefined | null): boolean {
  // The date itself ("11 月 25 日", "Friday") inside the model's copy, found in the sentence near that copy.
  const copy = dateText?.trim() ?? "";
  const core = (copy && dateWordsIn(copy)) || copy;
  const near = copy ? sentence.indexOf(copy) : -1;
  const at = core ? sentence.indexOf(core, Math.max(0, near)) : -1;
  if (at < 0) return /(最迟|最晚|までに|\bby\b|\bno later than\b|之前|以前)/iu.test(sentence);
  const before = sentence.slice(Math.max(0, at - 12), at);
  const after = sentence.slice(at + core.length, at + core.length + 8);
  return DEADLINE_BEFORE.test(before) || DEADLINE_AFTER.test(after);
}

/** The date words the sentence holds, when the model's copy is not found in it: the first month-day or weekday words. */
export function dateWordsIn(sentence: string): string | null {
  const found = sentence.match(/(\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}\/\d{1,2}\b|(?:下个?|这个?|本)?(?:周|星期|礼拜)[一二三四五六日天]|(?:来週|今週)?の?[月火水木金土日]曜日?|\b(?:next |this )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|今天|明天|后天|昨天|前天|今日|明日|昨日|\btoday\b|\btomorrow\b|\byesterday\b/iu);
  return found ? found[0] : null;
}
