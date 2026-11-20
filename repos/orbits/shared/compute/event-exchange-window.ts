// 2026-11-20 会場の記録：活动结束后还能新申请名片交换的期限（两端与服务端共用一个数字）。
// 结束前随时可申请（开场前由运营服务另行拒绝）；结束后 30 天内可申请；之后服务端拒绝新建（既有请求的承認 / 撤回不受影响）。

export const EVENT_EXCHANGE_WINDOW_DAYS = 30;
const DAY = 86_400_000;

/** 结束后最后可申请的时刻（ISO）；没有可用的结束时间 → null。 */
export function eventExchangeUntil(endsAt: string | null | undefined): string | null {
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  return Number.isFinite(end) ? new Date(end + EVENT_EXCHANGE_WINDOW_DAYS * DAY).toISOString() : null;
}

/** 现在还能新申请交换吗（结束前 / 结束后 30 天内为 true）。没有结束时间时不拦。 */
export function eventExchangeOpen(endsAt: string | null | undefined, now: Date): boolean {
  const until = eventExchangeUntil(endsAt);
  return until === null || now.getTime() <= Date.parse(until);
}
