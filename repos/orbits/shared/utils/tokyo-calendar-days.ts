/**
 * 东京日历日的天数差（W0044，RN-02）。纯函数，不读时钟。
 *
 * 跟进与提醒的「还有几天到期」按东京日历日比较，不按 24 小时滑窗向上取整：
 * 截止今天 20:00、现在今天 09:00 是 0（今天）；截止昨天 23:00、现在今天 09:00 是 −1（逾期）。
 * 与首页 facts、计划周次（`features/plans/week.ts` 的 `planTokyoDate`）同一口径。
 *
 * Asia/Tokyo 自 1951 年起没有夏令时，固定 UTC+9，所以用固定偏移即可精确换算日历日。
 */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function tokyoDayNumber(epochMs: number): number {
  return Math.floor((epochMs + TOKYO_OFFSET_MS) / DAY_MS);
}

/**
 * `dueAt` 所在东京日历日减去 `now` 所在东京日历日；逾期为负。
 * 任一时间无法解析时返回 `null`，由调用方决定兜底。
 */
export function tokyoCalendarDaysUntil(dueAt: string, now: string): number | null {
  const dueTime = new Date(dueAt).getTime();
  const nowTime = new Date(now).getTime();

  if (!Number.isFinite(dueTime) || !Number.isFinite(nowTime)) {
    return null;
  }

  return tokyoDayNumber(dueTime) - tokyoDayNumber(nowTime);
}
