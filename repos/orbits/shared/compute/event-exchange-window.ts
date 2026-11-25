// 2026-11-20 会場の記録：活动结束后还能新申请名片交换的期限（两端与服务端共用一个数字）。
// 只判断「结束后」这一头：开场前由调用方按开始时间拒绝（运营服务、参加者の詳細都这样）；开场后到结束后 30 天可申请；之后服务端拒绝新建（既有请求的承認 / 撤回不受影响）。

import { isoTimestamp, parseTimestamp } from "./compute-text";

export const EVENT_EXCHANGE_WINDOW_DAYS = 30;
const DAY = 86_400_000;

/** 结束后最后可申请的时刻（ISO）；没有可用的结束时间 → null。 */
export function eventExchangeUntil(endsAt: string | null | undefined): string | null {
  const end = endsAt ? parseTimestamp(endsAt) : Number.NaN;
  return Number.isFinite(end) ? isoTimestamp(end + EVENT_EXCHANGE_WINDOW_DAYS * DAY) : null;
}

/** 现在还能新申请交换吗（结束前 / 结束后 30 天内为 true）。没有结束时间时不拦。 */
export function eventExchangeOpen(endsAt: string | null | undefined, now: Date): boolean {
  const until = eventExchangeUntil(endsAt);
  return until === null || now.getTime() <= parseTimestamp(until);
}
