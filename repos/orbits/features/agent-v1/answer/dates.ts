/**
 * Dates follow the reply language (agent-design AG07, carried from AG06's review: "11月10日（周二）" in English
 * answers of AE-SCL-002 and AE-SCL-007). The answer model is told to write dates the user's way, but what reaches
 * the user is code's: a date written in another language's form is rewritten here, before delivery.
 *
 * - English: "11月10日（周二）", "2024年6月18日（周二）", "11 月 10 日（火）" → "Tue, Nov 10", "Tue, Jun 18, 2024".
 * - Japanese: a Chinese weekday after a date becomes the Japanese one ("（周二）" → "（火）"); spaces go.
 * - Chinese: a Japanese weekday after a date becomes the Chinese one ("（火）" → "（周二）").
 * The day itself is never changed; only the way it is written.
 */
import type { ReplyLanguage } from "../route/handoff-copy";

const WEEKDAY_INDEX: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const EN_WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const JA_WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const ZH_WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A CJK date with an optional year and an optional weekday in brackets (周X, 星期X, 礼拜X, X曜日, or a bare Japanese X).
const CJK_DATE = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:\s*[（(]\s*(?:周|星期|礼拜)?([一二三四五六日天月火水木金土])(?:曜日?)?\s*[)）])?/gu;
const ZH_WEEKDAY_WORDS = /^[一二三四五六天]$/u;

/**
 * Hotfix 2026-11-20 (both judges, AE-SCL-002: "Thu, Nov 27" — a Friday; the note gave no weekday): the weekday of a date is
 * code's, in every language, never the writer's. Without a year the date is taken in the year that puts it nearest today.
 */
export function weekdayOf(month: number, day: number, year: number | null, asOf: string): number {
  const now = Date.parse(asOf);
  const base = Number.isFinite(now) ? new Date(now).getUTCFullYear() : new Date().getUTCFullYear();
  const years = year ? [year] : [base - 1, base, base + 1];
  const at = years.map((y) => Date.UTC(y, month - 1, day)).sort((left, right) => Math.abs(left - (Number.isFinite(now) ? now : Date.now())) - Math.abs(right - (Number.isFinite(now) ? now : Date.now())))[0];
  return new Date(at).getUTCDay();
}

const EN_LONG_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "Thu, Nov 27", "Thursday, November 27, 2026", "Thu Nov 27". */
const EN_WEEKDAY_DATE = /\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(day|nesday|sday|urday|rsday)?(\.?,?\s+)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)([a-z]*\.?\s+)(\d{1,2})(?!\d)(,?\s+(\d{4}))?/gu;

function withCodeWeekdays(text: string, asOf: string): string {
  return text.replace(EN_WEEKDAY_DATE, (said: string, short: string, long: string | undefined, gap: string, month: string, rest: string, day: string, yearPart: string | undefined, year: string | undefined) => {
    const m = MONTH_INDEX[month.toLowerCase()];
    const d = Number(day);
    if (!m || d < 1 || d > 31) return said;
    const index = weekdayOf(m, d, year ? Number(year) : null, asOf);
    const name = long ? EN_LONG_WEEKDAY[index] : EN_WEEKDAY[index];
    return `${name}${gap}${month}${rest}${day}${yearPart ?? ""}`;
  });
}

export function localizeAnswerDates(text: string, language: ReplyLanguage, asOf: string = new Date().toISOString()): string {
  if (!text) return text;
  return withCodeWeekdays(text, asOf).replace(CJK_DATE, (said: string, year: string | undefined, month: string, day: string, weekday: string | undefined, offset: number, whole: string) => {
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) return said;
    // Hotfix 2026-11-20: a weekday the writer gave is replaced by the date's own.
    const index = weekday ? weekdayOf(m, d, year ? Number(year) : null, asOf) : null;
    const wrong = weekday !== undefined && index !== null && WEEKDAY_INDEX[weekday] !== index;
    if (language === "en") {
      const date = `${EN_MONTH[m - 1]} ${d}${year ? `, ${year}` : ""}`;
      // A CJK date sits against the next word ("11月27日（周五）at the latest"); English needs the space.
      const next = whole.charAt(offset + said.length);
      return `${index === null ? date : `${EN_WEEKDAY[index]}, ${date}`}${/[A-Za-z0-9—–(]/u.test(next) ? " " : ""}`;
    }
    const plain = `${year ? `${year}年` : ""}${m}月${d}日`;
    if (language === "ja") return index === null ? plain : `${plain}（${JA_WEEKDAY[index]}）`;
    // Chinese: keep the writer's own form unless the weekday is a Japanese one.
    if (index === null || (!wrong && weekday && (ZH_WEEKDAY_WORDS.test(weekday) || /(周|星期|礼拜)/u.test(said)))) return said;
    return `${plain}（${ZH_WEEKDAY[index]}）`;
  });
}

const EN_MONTH_WORD = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?!\d)/giu;
const CJK_MONTH_DAY = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/gu;
const ISO_DAY = /\b\d{4}-(\d{2})-(\d{2})\b/gu;
const MONTH_INDEX: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** The calendar days ("11-13") a text names: "Nov 13", "11月13日", "2026-11-13". */
export function datesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(EN_MONTH_WORD)) out.add(`${MONTH_INDEX[match[1].toLowerCase()]}-${Number(match[2])}`);
  for (const match of text.matchAll(CJK_MONTH_DAY)) out.add(`${Number(match[1])}-${Number(match[2])}`);
  for (const match of text.matchAll(ISO_DAY)) out.add(`${Number(match[1])}-${Number(match[2])}`);
  return out;
}

/** A weekday said without a date ("by Friday", "周五前", "金曜までに"). */
export const WEEKDAY_WORD = /\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b|(?:周|星期|礼拜)[一二三四五六日天]|[月火水木金土日]曜/u;

/**
 * AG07 run-02 (AE-CTX-003): every calendar day in a model's answer must come from this turn — the user's message,
 * the conversation it saw, today, or a record read now (its words or its own date). A note that says only
 * "by Friday" is not where a date comes from: its own date is not a source for that Friday (`weekdayNotes`, the
 * headers of such notes, are left out). Returns the days with no source.
 */
export function unsourcedDates(answer: string, sources: readonly string[], options: { weekdayNotes?: readonly string[] } = {}): string[] {
  const withheld = new Set(options.weekdayNotes ?? []);
  const known = new Set(sources.filter((source) => !withheld.has(source)).flatMap((source) => [...datesIn(source)]));
  return [...datesIn(answer)].filter((day) => !known.has(day));
}

/** The answer without the sentences that name a day with no source (what is left after the one repair). */
export function withoutUnsourcedDates(text: string, days: readonly string[]): string {
  if (!days.length) return text;
  const bad = new Set(days);
  const pieces = text.match(/[^。！？!?\n]+(?:[。！？!?]+|\n+|$)|\n+/gu) ?? [text];
  const kept: string[] = [];
  for (const piece of pieces) {
    const parts = /[A-Za-z]/u.test(piece) ? piece.split(/(?<=\.)[ \t]+/u) : [piece];
    for (const part of parts) if (![...datesIn(part)].some((day) => bad.has(day))) kept.push(part);
  }
  return kept.map((part, index) => (index > 0 && /\.$/u.test(kept[index - 1]) && /^[A-Za-z]/u.test(part) ? ` ${part}` : part)).join("").replace(/\n\s*\n/gu, "\n").trim();
}
