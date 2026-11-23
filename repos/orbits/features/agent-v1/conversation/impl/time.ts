// @ts-nocheck -- conversation/impl/time.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r11-maintenance/impl/time.ts
// (lab commit ce0b76fe4, r11 = r10 + when to ask round 2: exact @ / quoted picks on reads, typed confirmations while a card waits, 他们 for a company). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Time expressions (zh / ja / en, on folded text) → a window of local days. General calendar rules only:
 * weeks start on Monday; a bare weekday is its next occurrence (today counts); a bare month earlier than this month is
 * next year's; a bare day of month takes the month of the window talked about before (else this month, else next).
 */
import type { TimeWindow } from "../types";
import { fold, fre } from "./text";

export const DAY_MS = 86_400_000;

export function localDay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const isoWeekday = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const weekStart = (day: string) => addDays(day, 1 - isoWeekday(day));
const pad2 = (n: number) => String(n).padStart(2, "0");
const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthWin = (y: number, m: number): TimeWindow => ({ from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastOfMonth(y, m))}` });
export const sameWin = (a?: TimeWindow | null, b?: TimeWindow | null) => !!a && !!b && a.from === b.from && a.to === b.to;

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 日: 7, 天: 7, 末: 0 };
const JA_WD: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 7 };
const EN_WD: [RegExp, number][] = [
  [/\bmon(day)?\b/, 1], [/\btue(s|sday)?\b/, 2], [/\bwed(nesday)?\b/, 3], [/\bthu(rs|rsday)?\b/, 4], [/\bfri(day)?\b/, 5], [/\bsat(urday)?\b/, 6], [/\bsun(day)?\b/, 7],
];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const EN_MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?/;

export interface TimeParse {
  win: TimeWindow | null;
  spans: [number, number][];
  /** The words point back at a day / range said before (那天 / その日 / 那几天 …) instead of naming one. */
  anaphor: "day" | "range" | null;
  /** The window is relative to the window talked about before (那再后一天 / その次の週). */
  relative: boolean;
}

interface Hit { kind: "week" | "day" | "date" | "month" | "weekday" | "partweek" | "span"; at: [number, number]; win?: TimeWindow; wd?: number; weekOffset?: number; dayOnly?: number; part?: "weekend" | "workdays"; month?: number }

/**
 * Parses the folded text. `today` is the local day of the message; `prev` the window of the request before (for the
 * relative forms and a bare day of month).
 */
export function parseTime(t: string, today: string, prev?: TimeWindow | null): TimeParse {
  const hits: Hit[] = [];
  const used: [number, number][] = [];
  const free = (a: number, b: number) => !used.some(([x, y]) => a < y && b > x);
  const take = (re: RegExp, fn: (m: RegExpExecArray) => Omit<Hit, "at"> | null) => {
    const g = new RegExp(fold(re.source), re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(t))) {
      const a = m.index;
      const b = a + m[0].length;
      if (!m[0].length) { g.lastIndex++; continue; }
      if (!free(a, b)) continue;
      const h = fn(m);
      if (!h) continue;
      hits.push({ ...h, at: [a, b] } as Hit);
      used.push([a, b]);
    }
  };
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const td = Number(today.slice(8, 10));
  const thisWeek = weekStart(today);
  let anaphor: TimeParse["anaphor"] = null;
  let relative = false;

  // relative to the window before
  take(/(再|还)?(往后|后)一天|再过一天|第二天|隔天|その次の日|次の日|翌日|その翌日|the (next|following) day|the day after(?! tomorrow)|a day later/u, () => {
    if (!prev) return null;
    relative = true;
    const d = addDays(prev.to, 1);
    return { kind: "span", win: { from: d, to: d } };
  });
  take(fre(/再往后一周|往后一周|再下一周|再下周|下一周|その次の週|次の週|the week after(?! next)/u), () => {
    if (!prev) return { kind: "week", weekOffset: 2 };
    relative = true;
    const s = weekStart(addDays(prev.from, 7));
    return { kind: "span", win: { from: s, to: addDays(s, 6) } };
  });
  // anaphora to a stated day / range
  take(fre(/那几天|这几天|那段时间|那期间|出差(那几天|期间|的时候|那段)|出張(中|の間|期間|の日程)|その(\d+|[一二三四五六七八九十])日間|その間|その期間|期間中|その時期|那段期间|those days|that trip|during the trip|while i'?m (away|there)|that week/u), () => { anaphor = "range"; return null; });
  take(/那天|那一天|当天|同一天|その日|同じ日|that day|the same day|那日/u, () => { anaphor = anaphor ?? "day"; return null; });

  // explicit dates
  take(/(20\d\d)\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*[日号]?/u, (m) => {
    const d = `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
    return { kind: "date", win: { from: d, to: d } };
  });
  take(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/u, (m) => mkDate(+m[1], +m[2]));
  take(/(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d:/])/u, (m) => (+m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? mkDate(+m[1], +m[2]) : null));
  // a range inside one month (Dec 7 to 13 / Dec 7-13 / between Dec 7 and 13)
  take(new RegExp(`${EN_MONTH_RE.source}\\s*(\\d{1,2})(st|nd|rd|th)?\\s*(?:to|till|until|through|thru|and|-|–|~|〜)\\s*(\\d{1,2})(st|nd|rd|th)?\\b(?!\\s*(?:am|pm|:|点|時))`, "u"), (m) => {
    const mo = EN_MONTHS.indexOf(m[1].slice(0, 3)) + 1;
    const x = mkDate(mo, +m[2]), y = mkDate(mo, +m[4]);
    if (!x?.win || !y?.win || +m[4] <= +m[2]) return null;
    return { kind: "span", win: { from: x.win.from, to: y.win.to } };
  });
  take(new RegExp(`${EN_MONTH_RE.source}\\s*(\\d{1,2})(st|nd|rd|th)?\\b`, "u"), (m) => mkDate(EN_MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]));
  take(new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)?\\s*(of\\s*)?${EN_MONTH_RE.source}`, "u"), (m) => mkDate(EN_MONTHS.indexOf(m[4].slice(0, 3)) + 1, +m[1]));
  // months
  take(/(\d{1,2})\s*月\s*(份)?\s*(上旬|中旬|下旬|初|底|末)?(?![\d日号])/u, (m) => {
    const mo = +m[1];
    if (mo < 1 || mo > 12) return null;
    const y = tm - mo > 2 ? ty + 1 : ty;
    return { kind: "month", win: monthPart(y, mo, m[3]), month: mo };
  });
  take(new RegExp(`(early|mid|late)?[- ]?${EN_MONTH_RE.source}`, "u"), (m) => {
    const mo = EN_MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    const y = tm - mo > 2 ? ty + 1 : ty;
    const part = m[1] === "early" ? "上旬" : m[1] === "mid" ? "中旬" : m[1] === "late" ? "下旬" : undefined;
    return { kind: "month", win: monthPart(y, mo, part), month: mo };
  });
  take(/(这个月|这月|本月|今月|this month)(的)?(底|末)?|月底|月末|end of (the )?month/u, (m) => {
    if (/底|末|end/.test(m[0])) return { kind: "span", win: { from: today, to: monthWin(ty, tm).to } };
    return { kind: "month", win: monthWin(ty, tm), month: tm };
  });
  take(/下个月|下月|来月|next month/u, () => {
    const mo = tm === 12 ? 1 : tm + 1;
    return { kind: "month", win: monthWin(tm === 12 ? ty + 1 : ty, mo), month: mo };
  });
  take(/上个月|上月|先月|last month/u, () => {
    const mo = tm === 1 ? 12 : tm - 1;
    return { kind: "month", win: monthWin(tm === 1 ? ty - 1 : ty, mo), month: mo };
  });
  // weeks
  take(/(next|this|coming) weekend/u, (m) => ({ kind: "partweek", part: "weekend", weekOffset: m[1] === "this" ? 0 : 1 }));
  take(/(?<!一)(下下|再来|下个|下|来|这|这个|本|今)(周末)/u, (m) => ({ kind: "partweek", part: "weekend", weekOffset: m[1] === "下下" || m[1] === "再来" ? 2 : m[1] === "下" || m[1] === "下个" || m[1] === "来" ? 1 : 0 }));
  take(fre(/(?<!一)下下(个)?(周|星期|礼拜|週)|再来周|week after next|the week after/u), () => ({ kind: "week", weekOffset: 2 }));
  take(/(?<!一)下(个)?(周|星期|礼拜)(?![一二三四五六七天末]|日(?![程期子常本]))|来周|next week/u, () => ({ kind: "week", weekOffset: 1 }));
  take(/(这|本|今)(个)?(周|星期|礼拜)(?![一二三四五六七天末]|日(?![程期子常本]))|this week/u, () => ({ kind: "week", weekOffset: 0 }));
  take(/上(个)?(周|星期|礼拜)(?![一二三四五六七天末]|日(?![程期子常本]))|先周|last week/u, () => ({ kind: "week", weekOffset: -1 }));
  // weekday with its week (下周三 / 下下周一 / 这周五 / 来周の水曜 / next tuesday)
  take(/(?<!一)(下下|下|这|本|上)?(个)?(?:周|星期|礼拜)([一二三四五六七日天末])(?![程期子常本])/u, (m) => {
    const off = m[1] === "下下" ? 2 : m[1] === "下" ? 1 : m[1] === "这" || m[1] === "本" ? 0 : m[1] === "上" ? -1 : undefined;
    if (m[3] === "末") return { kind: "partweek", part: "weekend", weekOffset: off };
    return { kind: "weekday", wd: CN_NUM[m[3]], weekOffset: off };
  });
  take(/([月火水木金土日])曜(日)?/u, (m) => ({ kind: "weekday", wd: JA_WD[m[1]] }));
  // r10: "the Monday after next" is the Monday of the week after next
  for (const [re, wd] of EN_WD) take(new RegExp(`${re.source} after next\\b`, "u"), () => ({ kind: "weekday", wd, weekOffset: 2 }));
  for (const [re, wd] of EN_WD) take(new RegExp(`(next |this |coming )?${re.source}`, "u"), (m) => ({ kind: "weekday", wd, weekOffset: m[1]?.startsWith("next") ? 1 : m[1]?.startsWith("this") ? 0 : undefined }));
  take(fre(/周末|週末|weekend/u), () => ({ kind: "partweek", part: "weekend" }));
  take(/工作日|平日|weekdays?/u, () => ({ kind: "partweek", part: "workdays" }));
  // days
  take(/大后天|しあさって/u, () => day(3));
  take(/后天|明后日|あさって|day after tomorrow/u, () => day(2));
  take(/明天|明日|明晚|明早|明儿|tomorrow|あした|あす/u, () => day(1));
  take(/今天|今日|今晚|今早|今夜|今朝|today|tonight|本日|きょう/u, () => day(0));
  // a bare day of month (26号 / 27日 / the 12th / 12号)
  take(/(?<![\d/月])(\d{1,2})\s*(号|日(?!本|间|元|程))|the (\d{1,2})(st|nd|rd|th)\b|(?<![\d/])(\d{1,2})(st|nd|rd|th)\b/u, (m) => {
    const n = +(m[1] ?? m[3] ?? m[5]);
    if (n < 1 || n > 31) return null;
    return { kind: "date", dayOnly: n };
  });

  function day(n: number): Omit<Hit, "at"> {
    const d = addDays(today, n);
    return { kind: "day", win: { from: d, to: d } };
  }
  function mkDate(mo: number, d: number): Omit<Hit, "at"> | null {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const y = tm - mo > 2 ? ty + 1 : ty;
    const s = `${y}-${pad2(mo)}-${pad2(d)}`;
    return { kind: "date", win: { from: s, to: s } };
  }
  function monthPart(y: number, mo: number, part?: string): TimeWindow {
    const w = monthWin(y, mo);
    if (part === "上旬" || part === "初") return { from: w.from, to: `${y}-${pad2(mo)}-10` };
    if (part === "中旬") return { from: `${y}-${pad2(mo)}-11`, to: `${y}-${pad2(mo)}-20` };
    if (part === "下旬" || part === "底" || part === "末") return { from: `${y}-${pad2(mo)}-21`, to: w.to };
    return w;
  }

  // ---- combine
  const spans = hits.map((h) => h.at);
  if (!hits.length) return { win: null, spans, anaphor, relative };
  const week = hits.find((h) => h.kind === "week");
  const weekdays = hits.filter((h) => h.kind === "weekday");
  const part = hits.find((h) => h.kind === "partweek");
  const dates = hits.filter((h) => h.kind === "date" || h.kind === "day" || h.kind === "span");
  const month = hits.find((h) => h.kind === "month");
  const weekOf = (off: number) => addDays(thisWeek, 7 * off);

  // bare days of month take the month of an explicit date in the same message, else of the window before
  const explicit = dates.filter((h) => h.win);
  for (const h of dates) {
    if (h.win || !h.dayOnly) continue;
    const base = explicit[0]?.win?.from ?? (month?.win?.from) ?? prev?.from ?? null;
    let y = ty;
    let mo = tm;
    if (base) {
      y = Number(base.slice(0, 4)); mo = Number(base.slice(5, 7));
      // "29号到12月1号": a bare day before an explicit date and later in the month than it belongs to the month before
      const ex = explicit[0];
      if (ex && h.at[0] < ex.at[0] && h.dayOnly > Number(base.slice(8, 10))) { mo -= 1; if (mo < 1) { mo = 12; y -= 1; } }
    }
    else if (h.dayOnly < td) { mo = tm === 12 ? 1 : tm + 1; if (tm === 12) y++; }
    const s = `${y}-${pad2(mo)}-${pad2(h.dayOnly)}`;
    h.win = { from: s, to: s };
  }
  const dated = dates.filter((h) => h.win).map((h) => h.win!);
  if (dated.length) {
    const froms = dated.map((w) => w.from).sort();
    const tos = dated.map((w) => w.to).sort();
    return { win: { from: froms[0], to: tos[tos.length - 1] }, spans, anaphor, relative };
  }
  if (weekdays.length) {
    const days = weekdays.map((h) => {
      const off = h.weekOffset ?? week?.weekOffset;
      if (off !== undefined) return addDays(weekOf(off), h.wd! - 1);
      let d = today;
      while (isoWeekday(d) !== h.wd) d = addDays(d, 1);
      return d;
    }).sort();
    return { win: { from: days[0], to: days[days.length - 1] }, spans, anaphor, relative };
  }
  if (part) {
    const off = part.weekOffset ?? week?.weekOffset;
    let s: string;
    if (off !== undefined) s = weekOf(off);
    else s = isoWeekday(today) === 7 ? weekOf(1) : thisWeek;
    const w = part.part === "weekend" ? { from: addDays(s, 5), to: addDays(s, 6) } : { from: s, to: addDays(s, 4) };
    return { win: w, spans, anaphor, relative };
  }
  if (week) {
    const s = weekOf(week.weekOffset!);
    return { win: { from: s, to: addDays(s, 6) }, spans, anaphor, relative };
  }
  if (month) return { win: month.win!, spans, anaphor, relative };
  const span = hits.find((h) => h.win);
  return { win: span?.win ?? null, spans, anaphor, relative };
}

/** A clock time in the text (HH:MM, 24h): 9点 / 9時半 / 3pm / 15:00. */
export function parseClock(t: string): string | null {
  const PM = fre(/下午|晚上|傍晚|夜里|午後|夜|夕方/u);
  const AM = fre(/上午|早上|凌晨|午前|朝/u);
  const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  const hourOf = (x: string) => (/^\d+$/.test(x) ? +x : cn[x] ?? NaN);
  const shift = (h: number, before: string, after: string) => {
    if (h < 12 && (PM.test(before) || /^\s*(pm|p\.m\.)/.test(after))) return h + 12;
    if (h === 12 && (AM.test(before) || /^\s*(am|a\.m\.)/.test(after))) return 0;
    return h;
  };
  let m = /(\d{1,2}):(\d{2})/.exec(t);
  if (m) return `${pad2(shift(+m[1], t.slice(Math.max(0, m.index - 4), m.index), t.slice(m.index + m[0].length)))}:${m[2]}`;
  m = fre(/(上午|早上|凌晨|下午|晚上|傍晚|午前|午後|夜|夕方|朝)?\s*(\d{1,2}|十[一二]?|[一二两三四五六七八九])\s*(点|時|时)\s*(半|(\d{1,2})\s*分?)?/u).exec(t);
  if (m) {
    const h = shift(hourOf(m[2]), m[1] ?? "", "");
    if (Number.isNaN(h)) return null;
    const min = m[4] === "半" ? 30 : m[5] ? +m[5] : 0;
    return `${pad2(h)}:${pad2(min)}`;
  }
  m = /\b(\d{1,2})\s*(am|pm)\b/.exec(t);
  if (m) {
    let h = +m[1] % 12;
    if (m[2] === "pm") h += 12;
    return `${pad2(h)}:00`;
  }
  return null;
}
