/**
 * W0036（RH-03）：首页共享的「推荐活动池」。纯函数：不 import React，不读时钟（`now` 由调用方给），
 * 不碰存储。W0037 活动小模组与 W0038 月历圆点只消费这里的结果，不再各自组池。
 *
 * 顺序：计划点名 → 目标匹配 → 近期可报名；按 `eventId` 去重，先到的理由为准；`startsAt ≤ now`
 * 或在已报名集合里的剔除；**组完池之后**才截到 `limit`。服务端给的 `upcoming` 是全部可报名候选
 * （不截断），所以计划点名的活动不论排第几场都能解析到展示字段并排在池首。
 *
 * 理由只来自真实来源：`goal.tokens` 原样取 `matchedTokens`，空数组不标 goal；计划项标 plan；
 * 其余标 recent。展示字段优先取自 `upcoming`；目标匹配项不在 `upcoming` 里时用推荐项自带的
 * `title/startsAt/venue/publicCode`。`place` 是来源原文（不声称已本地化）；目录没有费用字段，
 * `feeLabel` 一律不填（W36-5）。标题的多语言替换在 `IOrbitHome` 里做，不在这里。
 */

export type HomeEventPoolReason =
  | { kind: "plan" }
  | { kind: "goal"; tokens: string[] }
  | { kind: "recent" };

export interface HomeEventPoolItem {
  eventId: string;
  publicCode: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  place?: string;
  feeLabel?: string;
  reason: HomeEventPoolReason;
}

/** 服务端给的「近期可报名」候选（已排除已开始、已取消、本人主办、已报名；按开始时间升序）。 */
export interface HomeEventPoolCandidate {
  eventId: string;
  publicCode: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  venue?: string;
}

/** 目标匹配（snapshot.recommendations.items）：展示字段可选，不在 upcoming 里时才用。 */
export interface HomeEventPoolGoalMatch {
  eventId: string;
  matchedTokens: readonly string[];
  publicCode?: string;
  startsAt?: string;
  title?: string;
  venue?: string;
}

/** ≥ 小模组 3 场 + 当月 5 场的需求（W0038 从池里取当月最多 5 场）。 */
export const HOME_EVENT_POOL_LIMIT = 8;

export interface BuildHomeEventPoolInput {
  /** 计划点名，按计划原顺序。 */
  planEventIds: readonly string[];
  goalMatches: readonly HomeEventPoolGoalMatch[];
  /** 全部可报名候选（服务端不截断）。 */
  upcoming: readonly HomeEventPoolCandidate[];
  /** 服务端已排除之外，再并上首页 home.events 里已报名的。 */
  registeredEventIds: ReadonlySet<string>;
  now: Date;
  limit?: number;
}

type Display = Omit<HomeEventPoolItem, "reason">;

function fromCandidate(candidate: HomeEventPoolCandidate): Display {
  return {
    eventId: candidate.eventId,
    publicCode: candidate.publicCode,
    startsAt: candidate.startsAt,
    title: candidate.title,
    ...(candidate.endsAt ? { endsAt: candidate.endsAt } : {}),
    ...(candidate.venue ? { place: candidate.venue } : {}),
  };
}

function fromGoalMatch(match: HomeEventPoolGoalMatch): Display | null {
  if (!match.title || !match.startsAt || !match.publicCode) return null;
  return {
    eventId: match.eventId,
    publicCode: match.publicCode,
    startsAt: match.startsAt,
    title: match.title,
    ...(match.venue ? { place: match.venue } : {}),
  };
}

export function buildHomeEventPool(input: BuildHomeEventPoolInput): HomeEventPoolItem[] {
  const limit = input.limit ?? HOME_EVENT_POOL_LIMIT;
  const nowMs = input.now.getTime();
  const upcomingById = new Map(input.upcoming.map((candidate) => [candidate.eventId, candidate]));
  const goalById = new Map(input.goalMatches.map((match) => [match.eventId, match]));
  const displayFor = (eventId: string): Display | null => {
    const candidate = upcomingById.get(eventId);
    if (candidate) return fromCandidate(candidate);
    const match = goalById.get(eventId);
    return match ? fromGoalMatch(match) : null;
  };

  const pool: HomeEventPoolItem[] = [];
  const seen = new Set<string>();
  const add = (eventId: string, reason: HomeEventPoolReason) => {
    if (seen.has(eventId) || input.registeredEventIds.has(eventId)) return;
    const display = displayFor(eventId);
    if (!display) return;
    const startsAtMs = Date.parse(display.startsAt);
    if (!Number.isFinite(startsAtMs) || startsAtMs <= nowMs) return;
    seen.add(eventId);
    pool.push({ ...display, reason });
  };

  for (const eventId of input.planEventIds) add(eventId, { kind: "plan" });
  for (const match of input.goalMatches) {
    if (match.matchedTokens.length > 0) add(match.eventId, { kind: "goal", tokens: [...match.matchedTokens] });
  }
  for (const candidate of input.upcoming) add(candidate.eventId, { kind: "recent" });

  return pool.slice(0, Math.max(0, limit));
}
