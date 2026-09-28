/**
 * 活动归属（RW-11 Q26A，Sprint W0015）：名片是不是在某场已报名的活动上拿到的。
 *
 * 规则（纯函数，不读时钟、不碰存储）：
 * - 以名片条目的 `createdAt`（扫描上传时间，不可变）为准，而不是确认时间——扫完几天后才确认，
 *   仍按扫描那天判定；
 * - 按东京日历日（Asia/Tokyo，UTC+9，无夏令时）比较：扫描日 = 活动开始日当天或次日；
 * - 只看本人已报名（rsvped）的活动；多场都落在窗口里时取开始时间离扫描时间最近的一场
 *   （相同再按 eventId 排序，结果稳定）。
 *
 * 数据来源（已发布活动目录、本人报名状态）经 `EventAttributionSource` 注入：live 实现在
 * `event-attribution-runtime.ts`，测试用内存实现。候选接口与名片确认都调用 `resolveEventAttribution`，
 * 确认时服务端按同一规则重算，客户端提交的活动 id 不在重算结果里就拒绝。
 */

export const EVENT_ATTRIBUTION_TIME_ZONE = "Asia/Tokyo";

export interface AttributionEvent {
  /** canonical event id（与计划条目的 `linkedEventId` 同一套）。 */
  eventId: string;
  title: string;
  /** ISO 时间。 */
  startsAt: string;
}

export interface EventAttributionSource {
  /** 已发布、开始时间落在 [fromIso, toIso) 的活动。 */
  listEventsStartingBetween(fromIso: string, toIso: string): Promise<readonly AttributionEvent[]>;
  /** 这些活动里本人（Auth.js 用户 id）已报名的那些。 */
  registeredEventIds(input: { userId: string; eventIds: readonly string[] }): Promise<ReadonlySet<string>>;
}

export interface EventAttributionCard {
  cardId: string;
  /** 名片条目的 `createdAt`。 */
  scannedAt: string;
}

export interface EventAttributionResult {
  /** 至少是一张名片候选的活动（按开始时间正序）。 */
  events: AttributionEvent[];
  /** cardId → 候选活动 id；不在任何已报名活动的窗口里为 null。 */
  byCard: Record<string, string | null>;
}

const tokyoDay = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: EVENT_ATTRIBUTION_TIME_ZONE,
  year: "numeric",
});

/** ISO 时间 → 东京日历日 `YYYY-MM-DD`；无法解析时 null。 */
export function tokyoDayKey(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return tokyoDay.format(new Date(time));
}

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 东京某日 0 点的 ISO 时间（东京固定 UTC+9）。 */
function tokyoMidnightIso(key: string): string {
  return new Date(`${key}T00:00:00+09:00`).toISOString();
}

/** 单张名片：扫描日落在开始日当天或次日的活动里，取开始时间最近的一场。 */
export function eventAttributionCandidate(
  scannedAt: string,
  events: readonly AttributionEvent[],
): AttributionEvent | null {
  const scanDay = tokyoDayKey(scannedAt);
  if (!scanDay) return null;
  const scanTime = Date.parse(scannedAt);
  let best: AttributionEvent | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const event of events) {
    const startDay = tokyoDayKey(event.startsAt);
    if (!startDay || (startDay !== scanDay && shiftDay(startDay, 1) !== scanDay)) continue;
    const distance = Math.abs(scanTime - Date.parse(event.startsAt));
    if (distance < bestDistance || (distance === bestDistance && best !== null && event.eventId < best.eventId)) {
      best = event;
      bestDistance = distance;
    }
  }
  return best;
}

/** 一组名片的候选：先按扫描日圈出可能的活动，再只保留本人已报名的，最后逐张判定。 */
export async function resolveEventAttribution(
  source: EventAttributionSource,
  input: { userId: string; cards: readonly EventAttributionCard[] },
): Promise<EventAttributionResult> {
  const byCard: Record<string, string | null> = {};
  const days = input.cards.map((card) => tokyoDayKey(card.scannedAt)).filter((day): day is string => day !== null).sort();
  for (const card of input.cards) byCard[card.cardId] = null;
  if (days.length === 0 || !input.userId.trim()) return { byCard, events: [] };
  // 扫描日 D 只可能对应开始日 D-1 或 D 的活动。
  const from = tokyoMidnightIso(shiftDay(days[0]!, -1));
  const to = tokyoMidnightIso(shiftDay(days[days.length - 1]!, 1));
  const inWindow = await source.listEventsStartingBetween(from, to);
  if (inWindow.length === 0) return { byCard, events: [] };
  const registered = await source.registeredEventIds({
    eventIds: inWindow.map((event) => event.eventId),
    userId: input.userId,
  });
  const eligible = inWindow.filter((event) => registered.has(event.eventId));
  const used = new Map<string, AttributionEvent>();
  for (const card of input.cards) {
    const candidate = eventAttributionCandidate(card.scannedAt, eligible);
    byCard[card.cardId] = candidate?.eventId ?? null;
    if (candidate) used.set(candidate.eventId, candidate);
  }
  const events = [...used.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { byCard, events };
}

/** 批次条目 → 每张名片一条：扫描时间取这张名片第一面（seq 最小）的 `createdAt`。 */
export function attributionCardsFromItems(
  items: readonly { cardId: string; seq: number; createdAt: string }[],
): EventAttributionCard[] {
  const first = new Map<string, { seq: number; createdAt: string }>();
  for (const item of items) {
    const known = first.get(item.cardId);
    if (!known || item.seq < known.seq) first.set(item.cardId, { createdAt: item.createdAt, seq: item.seq });
  }
  return [...first.entries()].map(([cardId, entry]) => ({ cardId, scannedAt: entry.createdAt }));
}
