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

export function localizeAnswerDates(text: string, language: ReplyLanguage): string {
  if (!text) return text;
  return text.replace(CJK_DATE, (said: string, year: string | undefined, month: string, day: string, weekday: string | undefined, offset: number, whole: string) => {
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) return said;
    const index = weekday ? WEEKDAY_INDEX[weekday] ?? null : null;
    if (language === "en") {
      const date = `${EN_MONTH[m - 1]} ${d}${year ? `, ${year}` : ""}`;
      // A CJK date sits against the next word ("11月27日（周五）at the latest"); English needs the space.
      const next = whole.charAt(offset + said.length);
      return `${index === null ? date : `${EN_WEEKDAY[index]}, ${date}`}${/[A-Za-z0-9—–(]/u.test(next) ? " " : ""}`;
    }
    const plain = `${year ? `${year}年` : ""}${m}月${d}日`;
    if (language === "ja") return index === null ? plain : `${plain}（${JA_WEEKDAY[index]}）`;
    // Chinese: keep the writer's own form unless the weekday is a Japanese one.
    if (index === null || (weekday && (ZH_WEEKDAY_WORDS.test(weekday) || /(周|星期|礼拜)/u.test(said)))) return said;
    return `${plain}（${ZH_WEEKDAY[index]}）`;
  });
}
