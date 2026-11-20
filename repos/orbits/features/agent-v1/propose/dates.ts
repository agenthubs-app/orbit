/**
 * Dates said in words, worked out by code (设计稿 §3.2 第 3 步 "日期按 asOf 与时区换算"; agent-design AG06,
 * PLANNER 易错边界 1). The model only copies the words ("周五", "今天", "11 月 30 日", "金曜日", "Thursday");
 * the day comes from the request's fixed time (asOf) in the user's time zone. Chinese, Japanese, English.
 *
 * A weekday alone is the next such day after today (on Sunday 11-15, 周五 is 11-20); "下周…/来週…/next …"
 * is that day of next week, "这周…/今週…/this …" that day of this week (weeks start on Monday).
 */

export interface SaidDate {
  /** YYYY-MM-DD in the user's time zone. */
  day: string;
  /** HH:MM when a time of day was said. */
  time?: string;
}

const ZH_WEEKDAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const JA_WEEKDAY: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
const EN_WEEKDAY: Record<string, number> = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const EN_MONTH: Record<string, number> = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };

/** The calendar day of an instant in a time zone. */
export function localDayOf(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

const pad = (value: number) => String(value).padStart(2, "0");

function weekdayDay(today: string, target: number, which: "next" | "this" | "upcoming" | "last" | "latest"): string {
  const current = weekdayOf(today);
  if (which === "upcoming") {
    const ahead = (target - current + 7) % 7 || 7;
    return addDays(today, ahead);
  }
  // AG20a R5: "last Saturday" is the latest one before today.
  if (which === "latest") return addDays(today, -((current - target + 7) % 7 || 7));
  // Weeks start on Monday. AG20a R5: "上周六", "先週の土曜日" are that day of the week before.
  const monday = addDays(today, -((current + 6) % 7));
  const offset = (target + 6) % 7;
  return addDays(monday, offset + (which === "next" ? 7 : which === "last" ? -7 : 0));
}

function timeOf(text: string): string | undefined {
  const clock = /(\d{1,2})\s*[:：]\s*(\d{2})/u.exec(text);
  if (clock) return `${pad(Number(clock[1]))}:${clock[2]}`;
  const cjk = /(\d{1,2})\s*(?:時|时|点)(半)?/u.exec(text);
  if (cjk) {
    let hour = Number(cjk[1]);
    if (/(下午|晚上|午後|夜)/u.test(text) && hour < 12) hour += 12;
    return `${pad(hour)}:${cjk[2] ? "30" : "00"}`;
  }
  const latin = /\b(\d{1,2})\s*(am|pm)\b/iu.exec(text);
  if (latin) {
    let hour = Number(latin[1]) % 12;
    if (latin[2].toLowerCase() === "pm") hour += 12;
    return `${pad(hour)}:00`;
  }
  return undefined;
}

function withYear(today: string, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${pad(month)}-${pad(day)}`;
  // Half a year back or more means next year's date (in November, "1月"/"January" is next January).
  return Date.parse(`${thisYear}T00:00:00Z`) < Date.parse(`${today}T00:00:00Z`) - 183 * 86_400_000 ? `${year + 1}-${pad(month)}-${pad(day)}` : thisYear;
}

/** The day (and time) the words mean, as of `asOf` in `timeZone`; null when no date can be read from them. */
export function resolveSaidDate(text: string, asOf: string, timeZone: string): SaidDate | null {
  const words = text.trim();
  if (!words) return null;
  const today = localDayOf(asOf, timeZone);
  const time = timeOf(words);
  const out = (day: string | null): SaidDate | null => (day ? { day, ...(time ? { time } : {}) } : null);
  const iso = /(\d{4})-(\d{2})-(\d{2})/u.exec(words);
  if (iso) return out(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const full = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/u.exec(words);
  if (full) return out(`${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`);
  const monthDay = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/u.exec(words);
  if (monthDay) return out(withYear(today, Number(monthDay[1]), Number(monthDay[2])));
  const slash = /\b(\d{1,2})\/(\d{1,2})\b/u.exec(words);
  if (slash) return out(withYear(today, Number(slash[1]), Number(slash[2])));
  const lower = words.toLowerCase();
  const enMonthFirst = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/u.exec(lower);
  if (enMonthFirst) return out(withYear(today, EN_MONTH[enMonthFirst[1]], Number(enMonthFirst[2])));
  const enDayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/u.exec(lower);
  if (enDayFirst) return out(withYear(today, EN_MONTH[enDayFirst[2]], Number(enDayFirst[1])));
  if (/(今天|今日|本日|\btoday\b|\btonight\b)/u.test(lower)) return out(today);
  if (/(大后天|しあさって)/u.test(lower)) return out(addDays(today, 3));
  if (/(后天|明後日|あさって|day after tomorrow)/u.test(lower)) return out(addDays(today, 2));
  if (/(明天|明日|\btomorrow\b)/u.test(lower)) return out(addDays(today, 1));
  if (/(前天|一昨日|おととい)/u.test(lower)) return out(addDays(today, -2));
  if (/(昨天|昨日|\byesterday\b)/u.test(lower)) return out(addDays(today, -1));
  const which = (prefix: string | undefined): "next" | "this" | "upcoming" | "last" => (!prefix ? "upcoming" : /(上|先|last)/u.test(prefix) ? "last" : /(下|来|next)/u.test(prefix) ? "next" : "this");
  const zh = /(上个?|下个?|这个?|本)?(?:周|星期|礼拜)([一二三四五六日天])/u.exec(words);
  if (zh) return out(weekdayDay(today, ZH_WEEKDAY[zh[2]], which(zh[1])));
  const ja = /(来週|今週|再来週|先週)?\s*の?\s*([月火水木金土日])曜(?:日)?/u.exec(words);
  if (ja) return out(weekdayDay(today, JA_WEEKDAY[ja[2]], ja[1] === "再来週" ? "next" : which(ja[1])));
  const en = /\b(next|this|coming|last)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/u.exec(lower);
  if (en) return out(weekdayDay(today, EN_WEEKDAY[en[2]], en[1] === "coming" ? "upcoming" : en[1] === "last" ? "latest" : which(en[1])));
  return null;
}

/** An instant for a day and HH:MM in a time zone (ISO, UTC). */
export function instantOf(day: string, time: string, timeZone: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(guess).map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

/** HH:MM of an instant in a time zone. */
export function localTimeOf(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}
