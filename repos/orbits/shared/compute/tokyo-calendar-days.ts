/**
 * 东京日历日的天数差（W0044，RN-02）。纯函数，不读时钟（shared/compute 规则：
 * 不用 Date.parse／new Date(value)／Intl，结果不随进程 TZ、ICU 或运行时变化）。
 *
 * 跟进与提醒的「还有几天到期」按东京日历日比较，不按 24 小时滑窗向上取整：
 * 截止今天 20:00、现在今天 09:00 是 0（今天）；截止昨天 23:00、现在今天 09:00 是 −1（逾期）。
 * 与首页 facts、计划周次（`features/plans/week.ts` 的 `planTokyoDate`）同一口径。
 *
 * 只接受严格的 ISO 8601：`YYYY-MM-DD`，或其后接 `T`／空格 + `HH:MM[:SS[.fff…]]`，
 * 可带 `Z` 或 `±HH:MM`／`±HHMM` 偏移。
 *   - 没有偏移（含纯日期）按东京本地时间解释；
 *   - 日期必须真实存在（2026-02-30 非法，不归一化到 3 月），时 0–23、分秒 0–59；
 *   - 偏移小时 0–14、分钟 0–59，否则非法。
 * 非法输入返回 null，由调用方走兜底。Asia/Tokyo 自 1951 年起无夏令时，固定 UTC+9。
 */
const TOKYO_OFFSET_MINUTES = 9 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const STRICT_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function offsetMinutes(offset: string | undefined): number | null {
  if (offset === undefined) return TOKYO_OFFSET_MINUTES;
  if (offset === "Z" || offset === "z") return 0;
  const digits = offset.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 14 || minutes > 59) return null;
  return (offset.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
}

/** 严格 ISO 时间 → 毫秒（epoch）；非法返回 null。无偏移按东京本地时间。 */
export function parseStrictTokyoInstant(value: string): number | null {
  const match = STRICT_ISO.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const zone = offsetMinutes(offset);
  if (zone === null) return null;
  const milliseconds = fraction === undefined ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  return Date.UTC(year, month - 1, day, hour, minute, second, milliseconds) - zone * MINUTE_MS;
}

function tokyoDayNumber(epochMs: number): number {
  return Math.floor((epochMs + TOKYO_OFFSET_MINUTES * MINUTE_MS) / DAY_MS);
}

/**
 * `dueAt` 所在东京日历日减去 `now` 所在东京日历日；逾期为负。
 * 任一时间不是合法 ISO 时返回 `null`，由调用方决定兜底。
 */
export function tokyoCalendarDaysUntil(dueAt: string, now: string): number | null {
  const dueTime = parseStrictTokyoInstant(dueAt);
  const nowTime = parseStrictTokyoInstant(now);
  if (dueTime === null || nowTime === null) return null;
  return tokyoDayNumber(dueTime) - tokyoDayNumber(nowTime);
}
