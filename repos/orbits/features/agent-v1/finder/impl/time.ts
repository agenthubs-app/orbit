// @ts-nocheck -- finder/impl/time.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/time.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * resolveTime: time words of a sentence (zh / ja / en) → TimeRef, following the rules in cases/time.yaml (R1–R24).
 * Works on an NFKC-normalised copy of the text with an index map back to the original, so spans point at the
 * characters the user typed (full-width digits included).
 */
import type { PartOfDay, TimeInput, TimeRef } from "../types";
import { editDistance, parseNumber } from "./text";

// ---------------------------------------------------------------- calendar helpers (pure Y-M-D arithmetic)
type YMD = { y: number; m: number; d: number };
const pad = (n: number) => String(n).padStart(2, "0");
export const fmt = (t: YMD) => `${t.y}-${pad(t.m)}-${pad(t.d)}`;
const toUTC = (t: YMD) => Date.UTC(t.y, t.m - 1, t.d);
const fromUTC = (ms: number): YMD => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
export const addDays = (t: YMD, n: number) => fromUTC(toUTC(t) + n * 86400000);
const isoWeekday = (t: YMD) => { const w = new Date(toUTC(t)).getUTCDay(); return w === 0 ? 7 : w; };
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const diffDays = (a: YMD, b: YMD) => Math.round((toUTC(a) - toUTC(b)) / 86400000);
export const parseYMD = (s: string): YMD => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return { y, m, d }; };

/** Local wall-clock date and time of an ISO instant in a time zone. */
export function localParts(iso: string, timeZone: string): { date: YMD; hour: number; minute: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { date: { y: +p.year, m: +p.month, d: +p.day }, hour: +p.hour % 24, minute: +p.minute };
}

// ---------------------------------------------------------------- normalisation with index map
function normalise(text: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = ch.normalize("NFKC");
    for (const c of n) { s += c; map.push(i); }
    i += ch.length;
  }
  map.push(text.length);
  return { s, map };
}

// ---------------------------------------------------------------- vocabulary
const N = `(?:[0-9]+|[零〇一二两兩三四五六七八九十]+)`;
const WD_ZH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7 };
const WD_JA: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 7 };
const WD_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WD_EN_SHORT: Record<string, number> = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 7 };
const MONTH_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_EN_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Words saying the user went / it happened (R4, R17). */
const WENT_RE = /(去了|去的|去过|去過|参加了|参加的|参加过|见的|見た|行った|行って(?:き|た)|行ってた|参加した|出席した|訪問した|[跑去走来來到]了一趟|[跑去走]过一趟|顔を出し(?:た|て(?:き|た))|寄った|寄って(?:き|た)|立ち寄った|出てきた|went|attended|visited|was at|been to|dropped by|stopped by|showed up)/i;

/** Holidays that fall on a fixed month/day every year (national holidays of JP / CN and common international ones). */
const HOLIDAYS: [RegExp, number, number][] = [
  [/(元旦|元日|new year'?s day)/, 1, 1],
  [/(建国記念の日|建国记念日|national foundation day)/, 2, 11],
  [/(情人节|情人節|バレンタインデー|バレンタイン|valentine'?s day)/, 2, 14],
  [/(天皇誕生日|天皇诞生日|emperor'?s birthday)/, 2, 23],
  [/(妇女节|婦女節|国际妇女节|women'?s day)/, 3, 8],
  [/(植树节|植樹節)/, 3, 12],
  [/(愚人节|愚人節|エイプリルフール|april fools'? day)/, 4, 1],
  [/(昭和の日|昭和之日|昭和日)/, 4, 29],
  [/(劳动节|勞動節|メーデー|may day)/, 5, 1],
  [/(憲法記念日|宪法纪念日|constitution (?:memorial )?day)/, 5, 3],
  [/(みどりの日|绿之日|綠之日|greenery day)/, 5, 4],
  [/(こどもの日|子供の日|儿童节|兒童節|children'?s day)/, 5, 5],
  [/(七夕)/, 7, 7],
  [/(山の日|山之日|mountain day)/, 8, 11],
  [/(国庆节|國慶節|国庆|國慶|national day)/, 10, 1],
  [/(万圣节|萬聖節|ハロウィーン|ハロウィン|halloween)/, 10, 31],
  [/(文化の日|文化之日|文化日|culture day)/, 11, 3],
  [/(勤労感謝の日|勤劳感谢日|勤勞感謝日|勤劳感谢之日|勤労感謝日|labou?r thanksgiving day)/, 11, 23],
  [/(平安夜|圣诞夜|聖誕夜|クリスマスイブ|クリスマス・イブ|christmas eve)/, 12, 24],
  [/(圣诞节|聖誕節|圣诞|聖誕|クリスマス(?![・]?イブ)|christmas(?! eve))/, 12, 25],
  [/(大晦日|除夕夜|new year'?s eve)/, 12, 31],
];

interface Hit { a: number; b: number; kind: string; apply: (r: Acc) => boolean | void; priority?: number }
interface Acc {
  day?: YMD; range?: { from: YMD; to: YMD }; partOfDay?: PartOfDay; time?: string; endTime?: string;
  shiftMinutes?: number; occurrence?: TimeRef["occurrence"]; went?: boolean; wantWent?: boolean;
}

function weekStart(t: YMD) { return addDays(t, 1 - isoWeekday(t)); }

/** Nearest occurrence of month/day to the base day (R5). */
function nearestMonthDay(base: YMD, m: number, d: number): YMD | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  let best: YMD | undefined, bestD = Infinity;
  for (const y of [base.y - 1, base.y, base.y + 1]) {
    if (d > daysIn(y, m)) continue;
    const t = { y, m, d };
    const dd = Math.abs(diffDays(t, base));
    if (dd < bestD) { bestD = dd; best = t; }
  }
  return best;
}
function nearestDay(base: YMD, d: number): YMD | undefined {
  if (d < 1 || d > 31) return undefined;
  let best: YMD | undefined, bestD = Infinity;
  for (const off of [-1, 0, 1]) {
    let y = base.y, m = base.m + off;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    if (d > daysIn(y, m)) continue;
    const t = { y, m, d };
    const dd = Math.abs(diffDays(t, base));
    if (dd < bestD) { bestD = dd; best = t; }
  }
  return best;
}
function monthRange(y: number, m: number) { while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return { from: { y, m, d: 1 }, to: { y, m, d: daysIn(y, m) } }; }

function hourOf(numStr: string): number { return parseNumber(numStr); }

// ---------------------------------------------------------------- main
export function resolveTime(input: TimeInput): TimeRef {
  const { s, map } = normalise(input.text);
  const low = s.toLowerCase();
  const nowParts = localParts(input.now, input.timeZone);
  const today: YMD = input.noteWrittenOn ? parseYMD(input.noteWrittenOn) : nowParts.date;
  const wd = isoWeekday(today);
  const hits: Hit[] = [];
  const add = (re: RegExp, kind: string, fn: (m: RegExpExecArray, r: Acc) => boolean | void, opts: { group?: number; priority?: number } = {}) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(low))) {
      let a = m.index, b = m.index + m[0].length;
      if (opts.group !== undefined && m[opts.group] !== undefined) { a = m.index + m[0].indexOf(m[opts.group]); b = a + m[opts.group].length; }
      const mm = m;
      hits.push({ a, b, kind, apply: (r) => fn(mm, r), priority: opts.priority ?? 0 });
      if (m[0].length === 0) g.lastIndex++;
    }
  };
  const setDay = (r: Acc, t: YMD | undefined): boolean => { if (!t || isNaN(t.y) || isNaN(t.m) || isNaN(t.d) || t.m < 1 || t.m > 12 || t.d < 1 || t.d > daysIn(t.y, t.m)) return false; if (!r.day) r.day = t; return true; };
  const setRange = (r: Acc, from: YMD, to: YMD): boolean => { if (!r.range && !r.day) r.range = { from, to }; return true; };
  const setPart = (r: Acc, p: PartOfDay) => { if (!r.partOfDay) r.partOfDay = p; };

  // ---- not-time look-alikes are excluded by lookarounds in the patterns below (R15)
  const NOT_AFTER_DAYWORD = "(?![香子美奈菜])";

  // ---- relative days with a part of day glued (明早, 昨晚, 今晚 …)
  add(new RegExp(`(今晚|今夜|tonight)`), "pod-day", (_m, r) => { setDay(r, today); setPart(r, "evening"); });
  add(/(昨晚|昨夜|昨晩|last night)/, "pod-day", (_m, r) => { setDay(r, addDays(today, -1)); setPart(r, "evening"); });
  add(/(明早|明朝)/, "pod-day", (_m, r) => { setDay(r, addDays(today, 1)); setPart(r, "morning"); });
  add(/(明晚)/, "pod-day", (_m, r) => { setDay(r, addDays(today, 1)); setPart(r, "evening"); });
  add(/(今早|今朝)/, "pod-day", (_m, r) => { setDay(r, today); setPart(r, "morning"); });
  add(/\bthis (morning|afternoon|evening)\b/, "pod-day", (m, r) => { setDay(r, today); setPart(r, m[1] as PartOfDay); });
  add(/\btomorrow (morning|afternoon|evening|night)\b/, "pod-day", (m, r) => { setDay(r, addDays(today, 1)); setPart(r, m[1] === "night" ? "evening" : m[1] as PartOfDay); });

  // ---- relative days
  add(new RegExp(`(大后天|大後天|しあさって|明々後日|明明後日|three days from now)`), "day", (_m, r) => setDay(r, addDays(today, 3)), { priority: 2 });
  add(new RegExp(`(后天|後天|明後日|あさって|day after tomorrow)`), "day", (_m, r) => setDay(r, addDays(today, 2)), { priority: 1 });
  add(new RegExp(`(前天|一昨日|おととい|day before yesterday)`), "day", (_m, r) => setDay(r, addDays(today, -2)), { priority: 1 });
  add(new RegExp(`(今天|今儿(?:个)?|今兒(?:個)?|今日${NOT_AFTER_DAYWORD}|きょう|本日|today)`), "day", (_m, r) => setDay(r, today));
  add(new RegExp(`(明天|明儿(?:个)?|明兒(?:個)?|明日${NOT_AFTER_DAYWORD}|あした|あす(?![かな])|tomorrow|tmrw|tmr)`), "day", (_m, r) => setDay(r, addDays(today, 1)));
  add(new RegExp(`(昨天|昨儿(?:个)?|昨兒(?:個)?|昨日|きのう|yesterday)`), "day", (_m, r) => setDay(r, addDays(today, -1)));
  add(new RegExp(`(${N})\\s*(?:天|日|个工作日)\\s*(?:后|後|以后|之后)(?!ろ)`), "day", (m, r) => setDay(r, addDays(today, parseNumber(m[1]))), { priority: 1 });
  add(new RegExp(`(${N})\\s*(?:个|個)?\\s*(?:周|週間|星期|礼拜)\\s*(?:后|後|以后|之后)(?!ろ)`), "day", (m, r) => setDay(r, addDays(today, 7 * parseNumber(m[1]))), { priority: 1 });
  add(/(?:in\s+(\d+|a|one|two|three|four)\s+weeks?|(\d+|a|one|two|three|four)\s+weeks?\s+(?:later|from now))/, "day", (m, r) => setDay(r, addDays(today, 7 * enNum(m[1] ?? m[2]))), { priority: 1 });
  add(/(\d+|a|one|two|three|four|five|six|seven|ten)\s+days?\s+(?:later|from now)/, "day", (m, r) => setDay(r, addDays(today, enNum(m[1]))), { priority: 1 });
  add(new RegExp(`in\\s+(\\d+|a|one|two|three|four|five|six|seven|ten)\\s+days?`), "day", (m, r) => setDay(r, addDays(today, enNum(m[1]))), { priority: 1 });
  add(new RegExp(`(${N})\\s*(?:天|日)\\s*前(?!倒)`), "day", (m, r) => setDay(r, addDays(today, -parseNumber(m[1]))), { priority: 1 });
  add(/(\d+|a|one|two|three|four|five|six|seven|ten)\s+days?\s+ago/, "day", (m, r) => setDay(r, addDays(today, -enNum(m[1]))), { priority: 1 });
  add(new RegExp(`(?:(${N})\\s*(?:天|日)|(${N}|一)\\s*(?:周|週間|个星期|個星期|个礼拜))\\s*(?:内|以内|之内)`), "range", (m, r) => {
    const n = m[1] ? parseNumber(m[1]) : parseNumber(m[2]) * 7;
    setRange(r, today, addDays(today, n));
  }, { priority: 1 });
  add(/(?:within|in\s+the\s+next)\s+(?:the\s+next\s+)?(\d+|a|one|two|three|four|five|six|seven|ten)\s+weeks?/, "range", (m, r) => setRange(r, today, addDays(today, 7 * enNum(m[1]))), { priority: 1 });
  add(/(?:within|in\s+the\s+next)\s+(?:the\s+next\s+)?(\d+|two|three|four|five|six|seven|ten)\s+days/, "range", (m, r) => setRange(r, today, addDays(today, enNum(m[1]))), { priority: 1 });

  // ---- weeks, weekends, weekdays
  const weekOff: [RegExp, number][] = [
    [/(?:下下[个個]?(?:周|週|星期|礼拜|禮拜)|再来週|再來週)/, 2],
    [/(?:上上[个個]?(?:周|週|星期|礼拜|禮拜)|先々週|先先週)/, -2],
    [/(?:(?:这|這|本)[个個]?(?:周|週|星期|礼拜|禮拜)|今週)/, 0],
    [/(?:下[个個]?(?:周|週|星期|礼拜|禮拜)|来週|來週)/, 1],
    [/(?:上[个個]?(?:周|週|星期|礼拜|禮拜)|先週)/, -1],
  ];
  const ZH_WD = "(?:周|週|星期|礼拜|禮拜)([一二三四五六日天1-7])";
  const JA_WD = "([月火水木金土日])曜(?:日)?(?!大工)";
  for (const [prefix, off] of weekOff) {
    const P = prefix.source;
    // weekend
    add(new RegExp(`${P}末|${P}の?(?:土日|週末)`), "range", (_m, r) => { const st = addDays(weekStart(today), 7 * off); setRange(r, addDays(st, 5), addDays(st, 6)); }, { priority: 3 });
    // weekday with prefix: 下周二, 下周的周二? (keep simple), 来週の火曜, 下礼拜二
    add(new RegExp(`${P}(?:的)?\\s*([一二三四五六日天1-7])(?![0-9号號日月年点點時])`), "day", (m, r) => { const st = addDays(weekStart(today), 7 * off); setDay(r, addDays(st, WD_ZH[m[1]] - 1)); }, { priority: 3 });
    add(new RegExp(`${P}(?:的|の)?\\s*${ZH_WD}`), "day", (m, r) => { const st = addDays(weekStart(today), 7 * off); setDay(r, addDays(st, WD_ZH[m[1]] - 1)); }, { priority: 3 });
    add(new RegExp(`${P}(?:の)?\\s*${JA_WD}`), "day", (m, r) => { const st = addDays(weekStart(today), 7 * off); setDay(r, addDays(st, WD_JA[m[1]] - 1)); }, { priority: 3 });
    // the week as a range
    add(new RegExp(`${P}(?:之内|之內|以内|以內|内|內|中(?![国國文旬午心间間]))?(?![末一二三四五六日天1-7])`), "range", (_m, r) => { const st = addDays(weekStart(today), 7 * off); setRange(r, st, addDays(st, 6)); }, { priority: 2 });
  }
  // weekday-to-weekday ranges (下周一到周三 / 来週の月〜水 / Mon to Wed next week)
  const wdRange = (off: number | undefined, a: number, b: number, r: Acc): boolean => {
    if (!a || !b) return false;
    let from: YMD;
    if (off !== undefined) from = addDays(addDays(weekStart(today), 7 * off), a - 1);
    else if (r.wantWent) { from = addDays(today, -1); while (isoWeekday(from) !== a) from = addDays(from, -1); }
    else { from = addDays(today, 1); while (isoWeekday(from) !== a) from = addDays(from, 1); }
    return setRange(r, from, addDays(from, (b - a + 7) % 7));
  };
  const RANGE_TO = "\\s*(?:到|至|~|〜|～|-|－|—|–)\\s*";
  const ZH_WD_WORD = "(?:周|週|星期|礼拜|禮拜)";
  for (const [prefix, off] of weekOff) {
    const P = prefix.source;
    add(new RegExp(`${P}(?:的|の)?\\s*${ZH_WD_WORD}?([一二三四五六日天])${RANGE_TO}${ZH_WD_WORD}?([一二三四五六日天])(?![0-9点點時号號日月个個])`), "range", (m, r) => wdRange(off, WD_ZH[m[1]], WD_ZH[m[2]], r), { priority: 5 });
    add(new RegExp(`${P}(?:の)?\\s*([月火水木金土日])(?:曜日?)?\\s*(?:〜|~|～|-|－|から)\\s*([月火水木金土日])(?:曜日?)?(?:まで)?`), "range", (m, r) => wdRange(off, WD_JA[m[1]], WD_JA[m[2]], r), { priority: 5 });
  }
  add(new RegExp(`${ZH_WD_WORD}([一二三四五六日天])${RANGE_TO}${ZH_WD_WORD}?([一二三四五六日天])(?![0-9点點時号號日月个個])`), "range", (m, r) => wdRange(undefined, WD_ZH[m[1]], WD_ZH[m[2]], r), { priority: 4 });
  add(/([月火水木金土日])曜日?\s*(?:〜|~|～|-|－|から)\s*([月火水木金土日])曜日?(?:まで)?/, "range", (m, r) => wdRange(undefined, WD_JA[m[1]], WD_JA[m[2]], r), { priority: 4 });
  add(/(?:\b(this|next|last)\s+)?\b([a-z]{3,9})\s*(?:to|-|–|through|thru|till|until)\s*([a-z]{3,9})\b(?:\s+(this|next|last)\s+week\b)?/, "range", (m, r) => {
    const a = enWeekdayLoose(m[2]), b = enWeekdayLoose(m[3]); if (!a || !b) return false;
    const w = m[1] ?? m[4]; const off = w === undefined ? undefined : w === "this" ? 0 : w === "next" ? 1 : -1;
    return wdRange(off, a, b, r);
  }, { priority: 5 });
  // English weeks
  add(/(?:the\s+)?(week after next)/, "range", (_m, r) => { const st = addDays(weekStart(today), 14); setRange(r, st, addDays(st, 6)); }, { group: 1, priority: 4 });
  add(/(?:the\s+)?(week before last)/, "range", (_m, r) => { const st = addDays(weekStart(today), -14); setRange(r, st, addDays(st, 6)); }, { group: 1, priority: 4 });
  add(/\b(this|next|last)\s+weekend\b/, "range", (m, r) => { const off = m[1] === "this" ? 0 : m[1] === "next" ? 1 : -1; const st = addDays(weekStart(today), 7 * off); setRange(r, addDays(st, 5), addDays(st, 6)); }, { priority: 3 });
  add(/\b(this|next|last)\s+week\b/, "range", (m, r) => { const off = m[1] === "this" ? 0 : m[1] === "next" ? 1 : -1; const st = addDays(weekStart(today), 7 * off); setRange(r, st, addDays(st, 6)); }, { priority: 2 });
  add(/(?:^|[^a-z])((?:this|next|last)\s+([a-z]{5,9}))(?![a-z.])/, "day", (m, r) => {
    const w = enWeekday(m[2]); if (!w) return false;
    const off = m[0].includes("this") ? 0 : m[0].includes("next") ? 1 : -1;
    setDay(r, addDays(addDays(weekStart(today), 7 * off), w - 1));
  }, { group: 1, priority: 3 });
  // bare weekdays (R3 / R4)
  const bare = (w: number, r: Acc) => {
    if (r.wantWent) { let d = addDays(today, -1); while (isoWeekday(d) !== w) d = addDays(d, -1); setDay(r, d); r.went = true; }
    else { let d = addDays(today, 1); while (isoWeekday(d) !== w) d = addDays(d, 1); setDay(r, d); }
  };
  add(new RegExp(`(?:周|週|星期|礼拜|禮拜)([一二三四五六日天1-7])(?![0-9年])`), "day", (m, r) => bare(WD_ZH[m[1]], r));
  add(new RegExp(JA_WD), "day", (m, r) => bare(WD_JA[m[1]], r));
  add(/(?:^|[^a-z])([a-z]{3,9})(?![a-z.]|\.com)/, "day-en", (m, r) => { const w = enWeekday(m[1]); if (!w) return false; bare(w, r); }, { group: 1, priority: -1 });
  add(/(?:来週|下周)の?(?:土日)/, "range", (_m, r) => { const st = addDays(weekStart(today), 7); setRange(r, addDays(st, 5), addDays(st, 6)); }, { priority: 4 });
  add(/(?<![下上这這本今来來先再])(?:周末|週末)|(?<![a-z])weekend(?![a-z])/, "range", (_m, r) => { const st = weekStart(today); setRange(r, addDays(st, 5), addDays(st, 6)); }, { priority: 1 });

  // ---- months, years
  add(/(这个月|這個月|本月|今月|this month)(?!末|底)/, "range", (_m, r) => { const x = monthRange(today.y, today.m); setRange(r, x.from, x.to); }, { priority: 2 });
  add(/(下个月|下個月|下月|来月|來月|next month)(?!末|底)/, "range", (_m, r) => { const x = monthRange(today.y, today.m + 1); setRange(r, x.from, x.to); }, { priority: 2 });
  add(/(上个月|上個月|上月|先月|last month)(?!末|底)/, "range", (_m, r) => { const x = monthRange(today.y, today.m - 1); setRange(r, x.from, x.to); }, { priority: 2 });
  // a period-end word glued to a two-Han noun is the head of a compound noun (a year-end procedure, a month-end
  // settlement), not a time word (R15); a verb, a position word or a modal right after it keeps it a time word
  const END_COMPOUND = "(?!(?![交发發発送做开開办辦见見去来來到完提出回给給寄付支前后後之以内內左再还還要得会會能可就才也都])\\p{Script=Han}{2})";
  add(new RegExp(`((?:这个|這個|本|今|下个|下個|下|来|來|上个|上個|先)?(?:月底|月末)${END_COMPOUND}|end of (?:the |this |next )?month)`, "u"), "range", (m, r) => {
    const t = m[0];
    const off = /下个月|下月|来月|next/.test(t) ? 1 : /上个月|先月/.test(t) ? -1 : 0;
    const x = monthRange(today.y, today.m + off);
    setRange(r, { ...x.to, d: 21 }, x.to);
  }, { priority: 3 });
  add(new RegExp(`((?:今年|明年|来年|去年)?(?:年底|年末)(?![セ-ヿ])${END_COMPOUND}|end of (?:the |this )?year)`, "u"), "range", (m, r) => {
    const y = /明年|来年/.test(m[0]) ? today.y + 1 : /去年/.test(m[0]) ? today.y - 1 : today.y;
    setRange(r, { y, m: 12, d: 21 }, { y, m: 12, d: 31 });
  }, { priority: 3 });
  add(/(去年|昨年|last year)(?!底|末)/, "range", (_m, r) => setRange(r, { y: today.y - 1, m: 1, d: 1 }, { y: today.y - 1, m: 12, d: 31 }), { priority: 2 });
  add(/(今年|this year)(?!底|末)/, "range", (_m, r) => setRange(r, { y: today.y, m: 1, d: 1 }, { y: today.y, m: 12, d: 31 }), { priority: 1 });
  add(/(明年|来年|next year)(?!底|末)/, "range", (_m, r) => setRange(r, { y: today.y + 1, m: 1, d: 1 }, { y: today.y + 1, m: 12, d: 31 }), { priority: 1 });

  // ---- explicit dates
  add(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, "day", (m, r) => setDay(r, { y: +m[1], m: +m[2], d: +m[3] }), { priority: 5 });
  add(new RegExp(`(?:(?:(\\d{4})|(令和|平成|昭和)\\s*(${N}|元))\\s*年\\s*)?(${N})\\s*月\\s*(${N})\\s*(?:日|号|號)?(?![0-9間间])`), "day", (m, r) => {
    const mo = parseNumber(m[4]), d = parseNumber(m[5]);
    const era = m[2] ? { 令和: 2018, 平成: 1988, 昭和: 1925 }[m[2]]! + (m[3] === "元" ? 1 : parseNumber(m[3])) : undefined;
    setDay(r, m[1] ? { y: +m[1], m: mo, d } : era ? { y: era, m: mo, d } : nearestMonthDay(today, mo, d));
  }, { priority: 4 });
  add(new RegExp(`(${N})\\s*月\\s*(上旬|中旬|下旬|初)`), "range", (m, r) => {
    const mo = parseNumber(m[1]); const t = nearestMonthDay(today, mo, 15); if (!t) return false;
    const last = daysIn(t.y, mo);
    const [a, b] = m[2] === "上旬" || m[2] === "初" ? [1, 10] : m[2] === "中旬" ? [11, 20] : [21, last];
    setRange(r, { y: t.y, m: mo, d: a }, { y: t.y, m: mo, d: b });
  }, { priority: 4 });
  // r07: a bare month / day written with a CJK numeral that is glued to a following noun character is the head of a
  // fixed compound (a name, an idiom, a season word), not a date (R15): in Japanese text any Han character that is not a
  // time continuation (中 / 末 / 頃 / 朝 …) after it; 月天 (the weather of a month) in any text.
  const MONTH_CONT = /[份分初中上下末底旬内內前后後以之的号號日頃]/;
  const DAY_CONT = /[朝昼晝夜晩晚午夕頃付迄]/;
  const hasKana = /[ぁ-ゖァ-ヺ]/.test(low);
  const gluedCompound = (m: RegExpExecArray, cont: RegExp, month: boolean): boolean => {
    if (/[0-9]/.test(m[1] ?? "")) return false;
    const nx = low[m.index + m[0].length] ?? "";
    if (!/\p{Script=Han}/u.test(nx) || cont.test(nx)) return false;
    return hasKana || (month && nx === "天");
  };
  add(new RegExp(`(?<![0-9月])(${N})\\s*月(?![0-9一二三四五六七八九十]|末|底|曜)`), "range", (m, r) => {
    const mo = parseNumber(m[1]); if (!(mo >= 1 && mo <= 12)) return false;
    if (gluedCompound(m, MONTH_CONT, true)) return false;
    const t = nearestMonthDay(today, mo, 15); if (!t) return false;
    setRange(r, { y: t.y, m: mo, d: 1 }, { y: t.y, m: mo, d: daysIn(t.y, mo) });
  }, { priority: 1 });
  add(new RegExp(`(这个月|這個月|本月|今月|下个月|下個月|下月|来月|來月|上个月|上個月|先月)\\s*(${N})\\s*(?:号|號|日)`), "day", (m, r) => {
    const off = /下|来|來/.test(m[1]) ? 1 : /上|先/.test(m[1]) ? -1 : 0;
    const x = monthRange(today.y, today.m + off); return setDay(r, { y: x.from.y, m: x.from.m, d: parseNumber(m[2]) });
  }, { priority: 5 });
  add(new RegExp(`(去年|昨年|今年|明年|来年)\\s*(?:の|的)?\\s*(${N})\\s*月(?![0-9一二三四五六七八九十]|末|底|曜)`), "range", (m, r) => {
    const y = /去年|昨年/.test(m[1]) ? today.y - 1 : /明年|来年/.test(m[1]) ? today.y + 1 : today.y; const mo = parseNumber(m[2]);
    if (!(mo >= 1 && mo <= 12)) return false; const x = monthRange(y, mo); return setRange(r, x.from, x.to);
  }, { priority: 5 });
  // 下个月上旬 / 来月の中旬 / 先月下旬: the third of a relative month
  add(/(这个月|這個月|本月|今月|下个月|下個月|下月|来月|來月|上个月|上個月|上月|先月)\s*(?:の|的)?\s*(上旬|中旬|下旬|初め|初|头|頭)/, "range", (m, r) => {
    const off = /下|来|來/.test(m[1]) ? 1 : /上|先/.test(m[1]) ? -1 : 0;
    const x = monthRange(today.y, today.m + off); const last = x.to.d;
    const [a, b] = /^(上旬|初め|初|头|頭)$/.test(m[2]) ? [1, 10] : m[2] === "中旬" ? [11, 20] : [21, last];
    return setRange(r, { ...x.from, d: a }, { ...x.from, d: b });
  }, { priority: 5 });
  // bare 月初 / 月头 / 月中 = the first / middle third of the current month (like a bare 上旬 / 中旬)
  add(new RegExp(`(?<![今本这這个個下上来來先0-9一二三四五六七八九十])(月初め|月初|月头|月頭|月中)(?!旬)${END_COMPOUND}`, "u"), "range", (m, r) => {
    const [a, b] = m[1] === "月中" ? [11, 20] : [1, 10];
    return setRange(r, { y: today.y, m: today.m, d: a }, { y: today.y, m: today.m, d: b });
  });
  // 年初 / 年明け早々 = Jan 1–10 (mirror of 年底 = Dec 21–31); bare: the nearest one
  add(new RegExp(`((今年|明年|来年|去年|昨年)\\s*(?:的|の)?\\s*)?(年初|年明け早々|beginning of (?:the |next )?year|start of (?:the |next )?year)${END_COMPOUND}`, "u"), "range", (m, r) => {
    let y: number;
    if (m[2]) y = /去年|昨年/.test(m[2]) ? today.y - 1 : /明年|来年/.test(m[2]) ? today.y + 1 : today.y;
    else if (/next/.test(m[3])) y = today.y + 1;
    else { const t = nearestMonthDay(today, 1, 5); y = t ? t.y : today.y; }
    return setRange(r, { y, m: 1, d: 1 }, { y, m: 1, d: 10 });
  }, { priority: 4 });
  // 月内 / 年内 = from today to the end of this month / year (like 一周内 = today … today+7)
  add(/(?<![个個])(?:(?:这个|這個|本|今)?月内|(?:今)?年内)/, "range", (m, r) => {
    if (/年/.test(m[0])) return setRange(r, today, { y: today.y, m: 12, d: 31 });
    return setRange(r, today, { y: today.y, m: today.m, d: daysIn(today.y, today.m) });
  }, { priority: 3 });
  // fixed-date holidays (zh / ja / en names): the nearest occurrence (R5); r10: 当日 / 当天 (the day itself) joins the span
  for (const [re, mo, d] of HOLIDAYS) add(new RegExp(`(?:${re.source})(?:当日|当天|當天)?`, re.flags), "day", (_m, r) => setDay(r, nearestMonthDay(today, mo, d)), { priority: 4 });
  // r10: the Nth / last weekday of a month (11月最后一个周五 / 12月の第1月曜 / the first Monday of December)
  const nthWeekday = (mo: number, nth: number, wdN: number, r: Acc): boolean => {
    if (!(mo >= 1 && mo <= 12) || !wdN || !nth) return false;
    const y = nearestMonthDay(today, mo, 15)!.y;
    if (nth > 0) {
      let t: YMD = { y, m: mo, d: 1 };
      while (isoWeekday(t) !== wdN) t = addDays(t, 1);
      t = addDays(t, 7 * (nth - 1));
      return t.m === mo && setDay(r, t);
    }
    let t: YMD = { y, m: mo, d: daysIn(y, mo) };
    while (isoWeekday(t) !== wdN) t = addDays(t, -1);
    return setDay(r, t);
  };
  const ORD_ZH = `(?:第\\s*(${N})\\s*[个個]?|(最后|最後|倒数第一)\\s*[一]?\\s*[个個]?)`;
  add(new RegExp(`(${N})\\s*月\\s*(?:的)?\\s*${ORD_ZH}\\s*(?:周|週|星期|礼拜|禮拜)([一二三四五六日天1-7])`), "day", (m, r) =>
    nthWeekday(parseNumber(m[1]), m[3] ? -1 : parseNumber(m[2]), WD_ZH[m[4]], r), { priority: 6 });
  add(new RegExp(`(${N})\\s*月\\s*の?\\s*(?:第\\s*(${N})|(最終|最後の))\\s*([月火水木金土日])曜(?:日)?`), "day", (m, r) =>
    nthWeekday(parseNumber(m[1]), m[3] ? -1 : parseNumber(m[2]), WD_JA[m[4]], r), { priority: 6 });
  add(/\b(first|second|third|fourth|1st|2nd|3rd|4th|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:of|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/, "day", (m, r) => {
    const nth = m[1] === "last" ? -1 : ["first", "second", "third", "fourth"].indexOf(m[1]) + 1 || parseInt(m[1], 10);
    return nthWeekday(enMonth(m[3]) ?? 0, nth, WD_EN.indexOf(m[2]) + 1, r);
  }, { priority: 6 });
  // r10: the month after next / before last (下下个月 / 再来月 / 上上个月 / 先々月): that whole month
  add(/(下下[个個]?月|再来月|再來月|month after next|上上[个個]?月|先々月|先先月|month before last)/, "range", (m, r) => {
    const off = /下下|再来|再來|after/.test(m[1]) ? 2 : -2;
    const x = monthRange(today.y, today.m + off); return setRange(r, x.from, x.to);
  }, { priority: 4 });
  // r10: today / tomorrow + 中 / 之内 (今日中 / 本日中 / 今天之内 / 明日中): that one day
  add(/(今日|本日|今天|明日|明天)(?:中(?![午国國文心间間旬])|之内|之內|以内|以內)/, "day", (m, r) => setDay(r, /明/.test(m[1]) ? addDays(today, 1) : today), { priority: 3 });
  add(/(?<![月0-9一二三四五六七八九十])(上旬|中旬|下旬)/, "range", (m, r) => {
    const last = daysIn(today.y, today.m); const [a, b] = m[1] === "上旬" ? [1, 10] : m[1] === "中旬" ? [11, 20] : [21, last];
    return setRange(r, { y: today.y, m: today.m, d: a }, { y: today.y, m: today.m, d: b });
  });
  // next January / last March / this coming May: the whole month (the next / previous one of that name)
  add(/\b(next|last|this coming|coming)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/, "range", (m, r) => {
    const mo = enMonth(m[2]); if (!mo) return false;
    let y = today.y;
    if (m[1] === "last") { if (mo >= today.m) y -= 1; } else if (mo <= today.m) y += 1;
    const x = monthRange(y, mo); return setRange(r, x.from, x.to);
  }, { priority: 4 });
  add(/(?<![的の])(?<![来週下周])土日/, "range", (_m, r) => { const st = weekStart(today); return setRange(r, addDays(st, 5), addDays(st, 6)); });
  add(/(?<![0-9.a-z])(\d{1,2})\.(\d{1,2})(?![0-9.%a-z倍万亿千百元円块億])/, "day", (m, r) => {
    if (/(版本|版|バージョン|ver\.?|version|v)\s*$/.test(low.slice(Math.max(0, m.index - 8), m.index))) return false; // a version number
    return setDay(r, nearestMonthDay(today, +m[1], +m[2]));
  }, { priority: 3 });
  add(/(?<![0-9/])(\d{1,2})\/(\d{1,2})(?![0-9/])/, "day", (m, r) => setDay(r, nearestMonthDay(today, +m[1], +m[2])), { priority: 3 });
  add(new RegExp(`(?<![月0-9${"零〇一二两兩三四五六七八九十"}])(${N})\\s*(?:号|號)(?![楼樓館馆线線室车車机機])`), "day", (m, r) => setDay(r, nearestDay(today, parseNumber(m[1]))), { priority: 2 });
  add(new RegExp(`(?<![月0-9])([0-9]{1,2}|[一二三四五六七八九十]+)\\s*日(?![間间後后前以内目本曜]|ろ)`), "day", (m, r) => !gluedCompound(m, DAY_CONT, false) && setDay(r, nearestDay(today, parseNumber(m[1]))), { priority: 2 });
  add(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?)\b/, "day", (m, r) => {
    const mo = enMonth(m[0].split(/[\s.]/)[0]); if (mo) setDay(r, nearestMonthDay(today, mo, +m[2]));
  }, { priority: 3 });
  add(/\b((\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b/, "day", (m, r) => {
    const mo = enMonth(m[3]); if (mo) setDay(r, nearestMonthDay(today, mo, +m[2]));
  }, { priority: 3 });
  add(/\bthe\s+((\d{1,2})(?:st|nd|rd|th))\b/, "day", (m, r) => setDay(r, nearestDay(today, +m[2])), { group: 1, priority: 2 });

  // ---- occurrence words (R11, R17)
  add(/(下次|下一次|下回|下一回|下一趟|次回|次の回|next time)/, "occ", (_m, r) => { if (!r.occurrence) r.occurrence = "next"; });
  // an evaluative remark (这次X得真好) is not about one occurrence of a series
  const evaluative = /得(?:真|很|太|挺|非常|特别|十分|相当|蛮)/.test(low) && !/[吗嗎？?]/.test(low);
  add(/(这次|這次|这一次|這一次|这回|這回|这一回|這一回|本次|今回|this time)/, "occ", (_m, r) => { if (evaluative) return false; if (!r.occurrence) r.occurrence = "this"; });
  add(/(以后每次|以後每次|今后每次|今後毎回|今後は毎回|毎回|from now on|every time from now)/, "occ", (_m, r) => { r.occurrence = "series"; }, { priority: 1 });
  add(/(上次|上回|上一次|前回|この前|last time)/, "went", (_m, r) => { r.went = true; });

  // ---- parts of day
  const POD: [RegExp, PartOfDay][] = [
    [/(凌晨|未明|早朝|early morning)/, "early"],
    [/(早上|上午|早晨|朝(?![日鮮霞刊食礼会ァ-ヿ])|午前(?![0-9一二三四五六七八九十]|中)|午前中|morning|お昼前)/, "morning"],
    [/(中午|正午|お昼|昼(?!間|食|ご|飯)|(?<![a-z])noon|lunchtime)/, "noon"],
    [/(下午(?!茶)|午後(?![0-9一二三四五六七八九十]|の紅茶|ティー)|afternoon(?! tea))/, "afternoon"],
    [/(晚上|傍晚|夜里|夜晚|夕方|晩(?!ご|飯|餐|酌)|夜(?!中|間|景|宵|市|[ァ-ヿ])|evening)/, "evening"],
    [/(深夜|半夜|夜中|夜间|late night)/, "night"],
  ];
  for (const [re, p] of POD) add(re, "pod", (_m, r) => setPart(r, p));

  // ---- clock times
  const ZH_POD = "(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚|今夜|夜里|半夜|午前|午後|朝|夜|夕方)?";
  const podOf = (pw: string, h: number): PartOfDay | undefined =>
    /凌晨/.test(pw) ? "early" : /午前/.test(pw) ? (h >= 5 ? "morning" : undefined) : /早上|上午|朝/.test(pw) ? "morning" : /中午/.test(pw) ? "noon"
      : /下午|午後/.test(pw) ? "afternoon" : /半夜/.test(pw) ? "night" : /傍晚|晚上|今晚|今夜|夜|夕方/.test(pw) ? "evening" : undefined;
  const clock = (podWord: string | undefined, hStr: string, minPart: string | undefined, r: Acc, isEnd = false, meal = false): boolean => {
    let h = hourOf(hStr);
    if (isNaN(h) || h > 24) return false;
    let mi = 0;
    if (minPart) {
      if (/半/.test(minPart)) mi = 30;
      else if (/一刻/.test(minPart)) mi = 15;
      else if (/三刻/.test(minPart)) mi = 45;
      else { const mm = minPart.match(/([0-9]+|[零〇一二三四五六七八九十]+)/); if (mm) mi = parseNumber(mm[1]); }
    }
    if (mi > 59) return false;
    const pw = podWord ?? "";
    let nextDay = false;
    if (h === 0 || h === 24) { h = 0; if (/今晚|今夜|晚上|夜|半夜/.test(pw)) nextDay = true; }
    else if (/凌晨|午前|朝|早上|上午/.test(pw)) { if (h === 12) h = 0; }
    else if (/中午/.test(pw)) { if (h < 6) h += 12; }
    else if (/下午|午後|傍晚|夕方/.test(pw)) { if (h < 12) h += 12; }
    else if (/晚上|今晚|今夜|夜/.test(pw) && !/半夜/.test(pw)) { if (h === 12) { h = 0; nextDay = true; } else if (h < 12 && h >= 5) h += 12; }
    else if (/半夜/.test(pw)) { if (h === 12) { h = 0; nextDay = true; } }
    else if (!isEnd && (r.partOfDay === "evening" || r.partOfDay === "afternoon") && h >= 1 && h < 12) h += 12;
    else if (!isEnd && (r.partOfDay === "morning" || r.partOfDay === "early")) { /* keep */ }
    else {
      if (h >= 1 && h <= 6) h += 12;
      else if (meal && h >= 7 && h <= 9) h += 12;
    }
    const t = `${pad(h)}:${pad(mi)}`;
    if (!isEnd) { const p = podOf(pw, h); if (p) setPart(r, p); }
    if (isEnd) { if (!r.endTime) r.endTime = t; }
    else if (!r.time) { r.time = t; if (nextDay) r.day = r.day ? addDays(r.day, 1) : addDays(today, 1); else if (/今晚|今夜/.test(pw) && !r.day) r.day = today; }
    return true;
  };
  const meal = /(吃饭|饭局|晚饭|晚餐|晚宴|聚餐|ご飯|ごはん|晩ご飯|晩飯|夕食|夕飯|ディナー|会食|dinner|supper)/i.test(low) && !/(早饭|早餐|朝食|朝ご飯|breakfast)/i.test(low);
  const MIN = "(半|一刻|三刻|[0-9]{1,2}\\s*分|[零〇一二三四五六七八九十]+\\s*分|整)?";
  const NOT_TIME_AFTER = "(?!钟方向|鐘方向|建议|建議|意见|要求|内容|问题|想法|看法|原因|理由|事项|セット|式|差|数|心|子)";
  // zh: 下午三点半到四点
  add(new RegExp(`${ZH_POD}(${N})\\s*(?:点|點)${MIN}${NOT_TIME_AFTER}(?:\\s*(?:到|至|-|~|〜|～)\\s*${ZH_POD}(${N})\\s*(?:点|點)${MIN})?`), "clock", (m, r) => {
    if (/[ぁ-ゖ]/.test(low) && !m[1] && !m[3]) return false; // Japanese 3点 = three items
    if (!m[1] && m[2] === "一" && /[早晚快慢多少好大小高低长短近远轻重有]/.test(low[m.index - 1] ?? "")) return false; // 早一点 = a bit earlier
    clock(m[1], m[2], m[3], r, false, meal);
    if (m[5]) clock(m[4] ?? m[1] ?? (hourOf(m[2]) <= 6 || hourOf(m[2]) >= 13 ? "下午" : undefined), m[5], m[6], r, true, meal);
  });
  // ja: 午後3時半から4時まで / 15時〜16時
  add(new RegExp(`${ZH_POD}の?(${N})\\s*時${MIN}(?:\\s*(?:から|〜|~|-|～|－)\\s*${ZH_POD}(${N})\\s*時${MIN}(?:まで)?)?(?![間间])`), "clock", (m, r) => {
    clock(m[1], m[2], m[3], r, false, meal);
    if (m[5]) clock(m[4] ?? m[1], m[5], m[6], r, true, meal);
  });
  const before = (podWord: string | undefined, hStr: string, minus: number, r: Acc): boolean => {
    const tmp: Acc = { partOfDay: r.partOfDay };
    if (!clock(podWord, hStr, undefined, tmp, false, meal) || !tmp.time) return false;
    const [hh, mm] = tmp.time.split(":").map(Number);
    const tot = (hh * 60 + mm - minus + 1440) % 1440;
    if (!r.time) r.time = `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
    if (tmp.partOfDay) setPart(r, tmp.partOfDay);
    return true;
  };
  const minusOf = (w: string): number => /一刻/.test(w) ? 15 : /三刻/.test(w) ? 45 : /半/.test(w) ? 30 : parseNumber((w.match(/([0-9]+|[零〇一二两三四五六七八九十]+)/) ?? ["", "NaN"])[1]);
  const MINUS = "(一刻|三刻|[0-9]{1,2}\\s*分(?:钟|鐘)?|[零〇一二两三四五六七八九十]+\\s*分(?:钟|鐘)?)";
  add(new RegExp(`差\\s*${MINUS}\\s*${ZH_POD}(${N})\\s*(?:点|點)(?:钟|鐘)?`), "clock", (m, r) => before(m[2], m[3], minusOf(m[1]), r), { priority: 3 });
  add(new RegExp(`${ZH_POD}(${N})\\s*(?:点|點)(?:钟|鐘)?\\s*差\\s*${MINUS}`), "clock", (m, r) => before(m[1], m[2], minusOf(m[3]), r), { priority: 3 });
  add(new RegExp(`${ZH_POD}の?(${N})\\s*時\\s*の?\\s*([0-9]{1,2}|[一二三四五六七八九十]+)\\s*分前`), "clock", (m, r) => before(m[1], m[2], parseNumber(m[3]), r), { priority: 3 });
  add(/\b(a quarter|quarter|half|\d{1,2}|five|ten|twenty|twenty-five)\s+(?:minutes\s+)?(to|past|after)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?:\s*(am|pm|a\.m\.|p\.m\.))?/, "clock", (m, r) => {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, "twenty-five": 25 };
    let h = /^\d+$/.test(m[3]) ? +m[3] : words[m[3]];
    const amt = /quarter/.test(m[1]) ? 15 : m[1] === "half" ? 30 : /^\d+$/.test(m[1]) ? +m[1] : words[m[1]];
    if (!h || !amt || h > 12 || (m[2] === "to" && m[1] === "half")) return false;
    if (m[4]) { if (/p/.test(m[4]) && h < 12) h += 12; if (/a/.test(m[4]) && h === 12) h = 0; }
    else if (h >= 1 && h <= 6) h += 12;
    const tot = (h * 60 + (m[2] === "to" ? -amt : amt) + 1440) % 1440;
    if (!r.time) r.time = `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
  }, { priority: 3 });
  // 24h clock 15:00(-16:00)
  add(/(?<![0-9:/])([01]?[0-9]|2[0-4]):([0-5][0-9])(?:\s*(am|pm|a\.m\.|p\.m\.))?(?:\s*(?:-|~|〜|to|到|から)\s*([01]?[0-9]|2[0-4]):([0-5][0-9])(?:まで)?)?(?![0-9])/, "clock", (m, r) => {
    let h = +m[1];
    if (m[3] && /p/.test(m[3]) && h < 12) h += 12;
    if (m[3] && /a/.test(m[3]) && h === 12) h = 0;
    // 7:30 in the evening / 晚上7:30: a 12-hour reading of the clock under an afternoon / evening part of day
    if (!m[3] && !m[1].startsWith("0") && h >= 1 && h < 12 && (r.partOfDay === "evening" || r.partOfDay === "afternoon")) h += 12;
    if (!r.time) r.time = `${pad(h)}:${m[2]}`;
    if (m[4] && !r.endTime) r.endTime = `${pad(+m[4])}:${m[5]}`;
    if (m[3]) setPart(r, h < 12 ? (h < 5 ? "early" : "morning") : h < 17 ? "afternoon" : "evening");
  });
  // en: 7am, 9 pm, 7 to 9pm
  add(/(?<![0-9:])(\d{1,2})(?:\s*(am|pm|a\.m\.|p\.m\.))?\s*(?:-|to|–)\s*(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/, "clock", (m, r) => {
    const ap2 = m[4], ap1 = m[2] ?? ap2;
    const conv = (h: number, ap: string) => (/p/.test(ap) && h < 12 ? h + 12 : /a/.test(ap) && h === 12 ? 0 : h);
    if (!r.time) r.time = `${pad(conv(+m[1], ap1))}:00`;
    if (!r.endTime) r.endTime = `${pad(conv(+m[3], ap2))}:00`;
  }, { priority: 2 });
  add(/(?<![0-9:])(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/, "clock", (m, r) => {
    let h = +m[1];
    if (/p/.test(m[3]) && h < 12) h += 12;
    if (/a/.test(m[3]) && h === 12) h = 0;
    if (!r.time) r.time = `${pad(h)}:${m[2] ?? "00"}`;
    setPart(r, h < 12 ? (h < 5 ? "early" : "morning") : h < 17 ? "afternoon" : "evening");
  }, { priority: 1 });
  add(/(?<![0-9])(\d{1,2})\s*o'?clock/, "clock", (m, r) => clock(undefined, m[1], undefined, r, false, meal));
  // "at 7" / "to 10" (bare hour, R6/R22): span is the number only
  add(/(?:^|\s)(?:at|to|by|around)\s+(\d{1,2})(?![0-9:/\-a-z.]|\s*(?:am|pm|a\.m|p\.m|%|days?|weeks?|hours?|minutes?|people|pax|th|st|nd|rd))/, "clock", (m, r) => clock(undefined, m[1], undefined, r, false, meal), { group: 1, priority: -1 });
  add(/\b(midnight)(?:\s+tonight)?/, "clock", (m, r) => { if (!r.time) { r.time = "00:00"; r.day = addDays(r.day ?? today, 1); } }, { priority: 2 });
  add(/\bnoon\b/, "clock", (_m, r) => { if (!r.time) r.time = "12:00"; setPart(r, "noon"); });

  // ---- shifts (R10): amount span only; direction from the verbs around
  const SHIFT_AMOUNT = `((${N})\\s*(?:个|個)?\\s*半\\s*(?:小时|小時|钟头|鐘頭)|(${N})\\s*時間半|(?:an?|one|\\d+)\\s+hours?\\s+and\\s+a\\s+half|半小时|半个小时|半個小時|半个钟头|半個鐘頭|半钟头|半鐘頭|半時間|(?:${N})\\s*(?:个|個)?\\s*刻(?:钟|鐘)|(${N})\\s*(?:个|個)?\\s*(?:分钟|分鐘|分|小时|小時|時間|钟头|天|日|周|週間|个星期|个礼拜|週)|an? hour|an? half hour|half an hour|(\\d+|one|two|three|a)\\s+(?:hours?|minutes?|mins?|days?|weeks?))`;
  add(new RegExp(SHIFT_AMOUNT), "shift", (m, r) => {
    const amtText = m[1];
    const minutes = shiftAmount(amtText);
    if (minutes === undefined) return false;
    const ctx = low.slice(Math.max(0, m.index - 24), m.index + m[0].length + 12);
    const after = low.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^\s*(?:后|後(?!ろ)|前(?!倒)|内|以内|之内|以上|ago|later|左右)/.test(after) && !/(往后推|推迟|延后|推后)/.test(ctx)) return false; // relative day / duration, not a shift
    const earlier = /(提前|早め|早めて|前倒し|提早|(?<![今明昨])早(?=\s*(?:半|一刻|[0-9零〇一二两兩三四五六七八九十]))|move (?:it )?up|earlier|bring (?:it )?forward|pull (?:it )?forward)/.test(ctx);
    const later = /(推迟|推後|推后|延后|延後|延期|往后|往後|晚|遅らせ|遅く|後ろ|後ろ倒し|ずらし|ずらす|push(?:ed)? (?:it )?back|\bback\b|delay|later|postpone)/.test(ctx);
    if (!earlier && !later) return false;
    const dest = new RegExp(`(提前|推迟|往后推|延后)\\s*到`).test(ctx);
    if (dest) return false;
    if (r.shiftMinutes === undefined) r.shiftMinutes = earlier ? -minutes : minutes;
  }, { group: 1 });

  // ---- drop hits that are not time words (an English word that is not a weekday, 24/7, …)
  const wantWent = WENT_RE.test(low);
  const valid = hits.filter((h) => h.b > h.a && h.apply({ wantWent }) !== false);
  // ---- resolve overlaps: prefer longer, then higher priority, then earlier
  valid.sort((x, y) => (y.b - y.a) - (x.b - x.a) || (y.priority ?? 0) - (x.priority ?? 0) || x.a - y.a);
  const taken: Hit[] = [];
  for (const h of valid) {
    if (taken.some((t) => h.a < t.b && t.a < h.b)) continue;
    taken.push(h);
  }
  taken.sort((x, y) => x.a - y.a);

  const acc: Acc = { wantWent };
  // apply: days / ranges first (the first expression in the sentence wins), then the rest
  const order = ["pod-day", "day", "day-en", "range", "occ", "went", "pod", "clock", "shift"];
  const applied: Hit[] = [];
  for (const k of order) for (const h of taken.filter((t) => t.kind === k)) { if (h.apply(acc) !== false) applied.push(h); }
  if (acc.wantWent && (acc.day || acc.range) && acc.went === undefined) acc.went = true;
  // occurrence pinned by a day (R11 / R23): 周二那次 / 火曜の回 / 周二的例会这次
  if (acc.day && (/(那次|那一次|那回|那一回|那趟|这回|這回|の回|の時の|这次|這次|今回|this time)/.test(low))) acc.occurrence = "date";

  const res: TimeRef = { spans: [] };
  if (acc.day) res.day = fmt(acc.day);
  if (acc.range && !acc.day) res.range = { from: fmt(acc.range.from), to: fmt(acc.range.to) };
  if (acc.partOfDay) res.partOfDay = acc.partOfDay;
  if (acc.time) res.time = acc.time;
  if (acc.endTime) res.endTime = acc.endTime;
  if (acc.shiftMinutes !== undefined) res.shiftMinutes = acc.shiftMinutes;
  if (acc.occurrence) res.occurrence = acc.occurrence;
  if (acc.went) res.went = true;
  // spans in normalised indices; join two time words separated only by の / 的 (今日の朝, 26日の夜)
  for (const h of applied) {
    if (h.kind !== "day") continue;
    const wk = s.slice(h.b).match(/^\s*\(\s*(?:[月火水木金土日](?:曜日?)?|(?:周|週|星期)?[一二三四五六日天]|mon|tue|wed|thu|fri|sat|sun)\.?\s*\)/i);
    if (wk) h.b += wk[0].length;
  }
  const sp = applied.map((h) => [h.a, h.b] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const x of sp) {
    const last = merged[merged.length - 1];
    if (last && (x[0] <= last[1] || (x[0] === last[1] + 1 && /[の的]/.test(s[last[1]])) || /^\s+in\s+the\s+$/i.test(s.slice(last[1], x[0])))) last[1] = Math.max(last[1], x[1]);
    else merged.push([x[0], x[1]]);
  }
  res.spans = merged.map(([a, b]) => [map[a], map[b]] as [number, number]);
  return res;
}

function enNum(w: string): number {
  const t: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
  return /^\d+$/.test(w) ? +w : t[w] ?? NaN;
}
function enWeekday(w: string): number | undefined {
  const x = w.toLowerCase().replace(/'s$/, "");
  const i = WD_EN.indexOf(x);
  if (i >= 0) return i + 1;
  if (WD_EN_SHORT[x] && /^(tues|thurs|thur)$/.test(x)) return WD_EN_SHORT[x];
  if (x.length >= 6) for (let k = 0; k < 7; k++) if (editDistance(x, WD_EN[k], 1) <= 1) return k + 1;
  return undefined;
}
/** Weekday name or its usual short form (mon / tue / tues / wed / thu / thur / thurs / fri / sat / sun). */
function enWeekdayLoose(w: string): number | undefined { return enWeekday(w) ?? WD_EN_SHORT[w.toLowerCase()]; }
function enMonth(w: string): number | undefined {
  const x = w.toLowerCase().replace(/\.$/, "");
  const i = MONTH_EN_SHORT.indexOf(x.slice(0, 3));
  if (i >= 0 && (x.length === 3 || x === "sept" || MONTH_EN[i].startsWith(x))) return i + 1;
  return undefined;
}
function shiftAmount(t: string): number | undefined {
  const x = t.toLowerCase();
  const hh = x.match(/^([0-9]+|[零〇一二两兩三四五六七八九十]+|an?|one)\s*(?:个|個)?\s*(?:半\s*(?:小时|小時|钟头|鐘頭)|時間半|hours?\s+and\s+a\s+half)$/);
  if (hh) { const n = /^[a-z]+$/.test(hh[1]) ? enNum(hh[1]) : parseNumber(hh[1]); if (!isNaN(n)) return n * 60 + 30; }
  if (/半小时|半个小时|半個小時|半个钟头|半個鐘頭|半钟头|半鐘頭|半時間|half an hour|a half hour/.test(x)) return 30;
  const q = x.match(/^([0-9]+|[零〇一二两兩三四五六七八九十]+)\s*(?:个|個)?\s*刻(?:钟|鐘)$/);
  if (q) { const n = parseNumber(q[1]); if (!isNaN(n)) return n * 15; }
  if (/^an? hour$/.test(x)) return 60;
  const m = x.match(/([0-9]+|[零〇一二两兩三四五六七八九十]+|one|two|three|a)/);
  if (!m) return undefined;
  const n = /^[a-z]+$/.test(m[1]) ? enNum(m[1]) : parseNumber(m[1]);
  if (isNaN(n)) return undefined;
  if (/分|min/.test(x)) return n;
  if (/小时|小時|時間|钟头|鐘頭|hour/.test(x)) return n * 60;
  if (/天|日|day/.test(x)) return n * 1440;
  if (/周|週|星期|礼拜|week/.test(x)) return n * 10080;
  return undefined;
}
