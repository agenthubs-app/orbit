/**
 * R16 #2（2026-10-12 用户拍板）：LinkedIn 导入的人，「加入时间」用 LinkedIn 导出里的 `Connected On`（连接日期），
 * 不用导入那一刻。Owner: 甲 (R16). Used by: 导入写入（`features/contacts/import/service.ts`，新建联系人时存成
 * 结构化字段 `linkedinConnectedAt`）、每天一问读取（`features/contacts/completion/repository.ts`）。
 *
 * - 认得的写法（LinkedIn 各语言 / 各年代的导出与用户自己整理的表）：`05 Jan 2024`、`5-Jan-2024`、`Jan 5, 2024`、
 *   `2024-01-05`、`2024/1/5`、`2024年1月5日`、`1/5/2024`（斜线三段：LinkedIn 英文导出是「月/日/年」，
 *   第一段 > 12 时按「日/月/年」）。认不出、日期不存在（2/30）都当没有（返回 null），不猜。
 * - 规范成「那个东京日的 12:00（JST）」，即 UTC 03:00，写成 ISO（`2024-01-05T03:00:00.000Z`）。取正午：
 *   连接日期只有「日」，取一天正中，换算 UTC / 东京日都落在同一天，按东京日比较（30 天窗口、±14 天活动窗口）不会差一天；
 *   ISO 字符串也能直接按字典序与 `YYYY-MM-DD` 比较（SQL 预筛用）。
 * - 比导入时间所在东京日还晚的（未来日期 / 写错）忽略。同一个东京日的不忽略（正午可能晚于上午的导入时刻，
 *   读取时取两者较早者 `earliestAddedAt`）。
 * - 纯函数，不碰时钟（导入时间由调用方传入）。
 */
import { isoTimestamp } from "./compute-text";
import { parseStrictTokyoInstant, tokyoCalendarDaysUntil } from "./tokyo-calendar-days";

/** 导入写进备注的连接日期行前缀（旧数据只有这一行，读取时退而从这里解析）。 */
export const LINKEDIN_CONNECTED_NOTE_PREFIX = "LinkedIn 连接日期: ";

const MONTHS: Readonly<Record<string, number>> = {
  apr: 4, april: 4, aug: 8, august: 8, dec: 12, december: 12, feb: 2, february: 2, jan: 1, january: 1, jul: 7, july: 7, jun: 6, june: 6,
  mar: 3, march: 3, may: 5, nov: 11, november: 11, oct: 10, october: 10, sep: 9, sept: 9, september: 9,
};

/** 东京正午 = UTC 03:00。 */
const NOON_TOKYO_IN_UTC_HOURS = 3;

function daysInMonth(year: number, month: number): number {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function fullYear(text: string): number {
  const year = Number(text);
  // 两位年份（`5-Jan-24`）按 2000 年代：LinkedIn 2003 年才上线。
  return text.length === 2 ? 2000 + year : year;
}

function noonOf(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return isoTimestamp(Date.UTC(year, month - 1, day, NOON_TOKYO_IN_UTC_HOURS));
}

/** 连接日期原文 → 那个东京日正午的 ISO 时间；认不出返回 null。 */
export function parseLinkedinConnectedOn(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!value) return null;
  let match = /^(\d{1,2})[ \-.](?:of )?([A-Za-z]{3,9})\.?[ \-.,]+(\d{4}|\d{2})$/.exec(value);
  if (match) {
    const month = MONTHS[match[2]!.toLowerCase()];
    return month ? noonOf(fullYear(match[3]!), month, Number(match[1])) : null;
  }
  match = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(value);
  if (match) {
    const month = MONTHS[match[1]!.toLowerCase()];
    return month ? noonOf(Number(match[3]), month, Number(match[2])) : null;
  }
  match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value) ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value);
  if (match) return noonOf(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    // LinkedIn 英文导出是「月/日/年」；第一段 > 12 只能是「日/月/年」。
    return first > 12 ? noonOf(Number(match[3]), second, first) : noonOf(Number(match[3]), first, second);
  }
  return null;
}

/**
 * 导入时用：解析连接日期，并丢掉比导入时间所在东京日还晚的（未来 / 写错）。`importedAt` 非法时也返回 null。
 */
export function linkedinConnectedAtFor(raw: string | null | undefined, importedAt: string): string | null {
  const connectedAt = parseLinkedinConnectedOn(raw);
  if (!connectedAt) return null;
  const days = tokyoCalendarDaysUntil(connectedAt, importedAt);
  return days !== null && days <= 0 ? connectedAt : null;
}

/** 旧数据：备注里导入写的「LinkedIn 连接日期: …」那一行（取第一行）→ 原文；没有返回 null。 */
export function linkedinConnectedOnFromNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== "string") return null;
  for (const line of notes.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(LINKEDIN_CONNECTED_NOTE_PREFIX)) return trimmed.slice(LINKEDIN_CONNECTED_NOTE_PREFIX.length).trim() || null;
  }
  return null;
}

/** 「加入时间」= 连接时间与录入时间里较早的；连接时间缺 / 非法时就是录入时间。 */
export function earliestAddedAt(createdAt: string, connectedAt: string | null | undefined): string {
  if (!connectedAt) return createdAt;
  const connected = parseStrictTokyoInstant(connectedAt);
  if (connected === null) return createdAt;
  const created = parseStrictTokyoInstant(createdAt);
  return created === null || connected < created ? connectedAt : createdAt;
}
