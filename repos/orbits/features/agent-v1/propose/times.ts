/**
 * agent-design AG13: times of day said in words, worked out by code — the model only copies the words ("晚上七点",
 * "下午两点到三点", "上午十点到十二点", "2pm", "11時から12時", "下午三点开始", "7 to 9pm"). Chinese, Japanese, English;
 * Chinese numerals for hours. A later hour without its own part of the day takes the start's ("下午两点到三点" is
 * 14:00–15:00); "到十二点" after a morning start stays noon.
 */

export interface SaidTimes {
  /** HH:MM. */
  start: string;
  end?: string;
}

const CJK_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function cjkNumber(text: string): number | null {
  if (/^\d+$/u.test(text)) return Number(text);
  if (!text) return null;
  if (text === "十") return 10;
  const match = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/u.exec(text);
  if (match) return (match[1] ? CJK_DIGIT[match[1]] : 1) * 10 + (match[2] ? CJK_DIGIT[match[2]] : 0);
  return text.length === 1 && text in CJK_DIGIT ? CJK_DIGIT[text] : null;
}

const PM = /(下午|晚上|傍晚|今晚|昨晚|夜里|夜晚|午後|夕方|夜|\bpm\b|p\.m\.|\bevening\b|\bafternoon\b|\btonight\b)/iu;
const AM = /(上午|早上|早晨|清晨|午前|朝|\bam\b|a\.m\.|\bmorning\b)/iu;
const NOON = /(中午|正午|\bnoon\b)/iu;

const pad = (value: number) => String(value).padStart(2, "0");

interface Point { hour: number; minute: number; at: number; end: number; period: "am" | "pm" | "noon" | null }

const HOUR = "(\\d{1,2}|[〇零一二两三四五六七八九十]{1,3})";
const CJK_POINT = new RegExp(`${HOUR}\\s*(?:点|點|時|时)\\s*(半|(\\d{1,2})\\s*分?|一刻)?`, "gu");
const CLOCK = /(\d{1,2})\s*[:：]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/giu;
const LATIN = /\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/giu;

function periodBefore(text: string, at: number, floor = 0): Point["period"] {
  const before = text.slice(Math.max(floor, at - 6), at);
  if (NOON.test(before)) return "noon";
  if (PM.test(before)) return "pm";
  if (AM.test(before)) return "am";
  return null;
}

function pointsOf(text: string): Point[] {
  const points: Point[] = [];
  for (const match of text.matchAll(CLOCK)) {
    const hour = Number(match[1]);
    const suffix = match[3]?.toLowerCase();
    points.push({ at: match.index!, end: match.index! + match[0].length, hour, minute: Number(match[2]), period: suffix ? (suffix.startsWith("p") ? "pm" : "am") : periodBefore(text, match.index!) });
  }
  for (const match of text.matchAll(CJK_POINT)) {
    if (points.some((point) => match.index! >= point.at && match.index! < point.end)) continue;
    const hour = cjkNumber(match[1]);
    if (hour === null || hour > 24) continue;
    const minute = match[2] === "半" ? 30 : match[2] === "一刻" ? 15 : match[3] ? Number(match[3]) : 0;
    points.push({ at: match.index!, end: match.index! + match[0].length, hour, minute, period: periodBefore(text, match.index!) });
  }
  for (const match of text.matchAll(LATIN)) {
    if (points.some((point) => match.index! >= point.at && match.index! < point.end)) continue;
    points.push({ at: match.index!, end: match.index! + match[0].length, hour: Number(match[1]), minute: 0, period: match[2].toLowerCase().startsWith("p") ? "pm" : "am" });
  }
  // "7 to 9pm": a bare number before "to/-" and a time with its part of the day after it.
  const range = /\b(\d{1,2})\s*(?:to|-|–|until)\s*(\d{1,2})\s*(am|pm)\b/iu.exec(text);
  if (range && !points.some((point) => point.at === range.index)) points.push({ at: range.index, end: range.index + range[1].length, hour: Number(range[1]), minute: 0, period: range[3].toLowerCase() === "pm" ? "pm" : "am" });
  points.sort((left, right) => left.at - right.at);
  // A part of the day belongs to the time right after it: a later time looks back only to the end of the one before.
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const own = text.slice(point.end, point.end + 4);
    if (/^\s*(am|pm|a\.m\.|p\.m\.)/iu.test(own)) continue;
    point.period = periodBefore(text, point.at, points[index - 1].end);
  }
  return points;
}

function hour24(point: Point, inherit: Point["period"]): number {
  const period = point.period ?? inherit;
  if (period === "pm" && point.hour < 12) return point.hour + 12;
  if (period === "am" && point.hour === 12) return 0;
  if (period === "noon" && point.hour < 6) return point.hour + 12;
  return point.hour;
}

/** The start (and end) the words say; null when no time of day is in them. */
export function resolveSaidTimes(text: string): SaidTimes | null {
  const points = pointsOf(text);
  if (!points.length) return null;
  const [first, second] = points;
  const startHour = hour24(first, null);
  const start = `${pad(startHour)}:${pad(first.minute)}`;
  if (!second) return { start };
  let endHour = hour24(second, second.period ? null : first.period);
  // "上午十点到十二点": noon stays noon; an end before the start in the same part of the day moves on half a day.
  if (endHour < startHour && endHour + 12 <= 24 && !second.period) endHour += 12;
  if (endHour * 60 + second.minute <= startHour * 60 + first.minute) return { start };
  return { end: `${pad(endHour)}:${pad(second.minute)}`, start };
}

/** "下午三点开始", "starts at 3pm": only a new start was said (the length stays). */
export function onlyStartSaid(text: string): boolean {
  const times = resolveSaidTimes(text);
  return Boolean(times && !times.end);
}

/** The parts of the day the words name ("晚上" → evening), for «我去过». */
export function dayPartsOf(text: string): ("morning" | "noon" | "afternoon" | "evening" | "night")[] {
  if (/(晚上|昨晚|今晚|傍晚|夜晚|晚|夕方|夜|\bevening\b|\btonight\b|\blast night\b)/iu.test(text)) return ["evening"];
  if (/(下午|午後|\bafternoon\b)/iu.test(text)) return ["afternoon"];
  if (/(中午|正午|昼|\bnoon\b|\blunch\b)/iu.test(text)) return ["noon"];
  if (/(上午|早上|早晨|午前|朝|\bmorning\b)/iu.test(text)) return ["morning"];
  const times = resolveSaidTimes(text);
  if (!times) return [];
  const hour = Number(times.start.slice(0, 2));
  return hour >= 18 ? ["evening"] : hour >= 13 ? ["afternoon"] : hour >= 11 ? ["noon"] : ["morning"];
}
