/**
 * W0047：关系强度纯函数。输入只有关系时间线（RelationshipTimelineItem）与时间点，
 * 没有 stage／tags／status／customTags／networkCategory／私信字段；不读时钟、不读库。
 *
 * 按时间点（R-7）：只计 `occurredAt ≤ at` 的条目；唯一例外是「未来的约见」（schedule meeting 且 occurredAt > at），
 * 按规则表计 5 分、不衰减。对完整、去重后的时间线传 `at = now − 30 天` 即「30 天前」的档位。
 */
import type {
  RelationshipStrength,
  RelationshipStrengthSignal,
  RelationshipTier,
  RelationshipTierCounts,
} from "../../shared/contract/relationship-strength";
import type { RelationshipTimelineItem, RelationshipTimelineSource } from "../../shared/contract/relationship-timeline";
import { RELATIONSHIP_STRENGTH_RULES, type RelationshipStrengthRules } from "./rules";

const DAY_MS = 86_400_000;
/** 东京固定 UTC+9、无夏令时。 */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 某一瞬间的东京日序号（自 1970-01-01 东京日起的天数）。 */
export function tokyoDayNumber(ms: number): number {
  return Math.floor((ms + TOKYO_OFFSET_MS) / DAY_MS);
}

interface Scored {
  item: RelationshipTimelineItem;
  ms: number;
  day: number;
  basePoints: number;
  future: boolean;
}

/** 规则表里的基础分（衰减前）。`future` = occurredAt 晚于计算时间点。 */
export function relationshipSignalBasePoints(
  item: RelationshipTimelineItem,
  future: boolean,
  rules: RelationshipStrengthRules = RELATIONSHIP_STRENGTH_RULES,
): number {
  const points = rules.points;
  switch (item.source) {
    case "capture":
      return future ? 0 : points.capture[item.detail?.captureMethod ?? "other"] ?? points.capture.other;
    case "memo": {
      if (future) return 0;
      const types = item.detail?.memoEventTypes ?? [];
      if (types.includes("collaborated")) return points.memo.collaborated;
      if (types.includes("met") || types.includes("introduced")) return points.memo.metOrIntroduced;
      return points.memo.default;
    }
    case "encounter":
      return future ? 0 : points.encounter;
    case "schedule": {
      const kind = item.detail?.scheduleKind;
      if (kind === "meeting") return future ? points.schedule.futureMeeting : points.schedule.pastMeeting;
      if (future) return 0;
      if (kind === "event") return points.schedule.pastEvent;
      return points.schedule.personal;
    }
    case "followup_done":
      return future ? 0 : points.followupDone;
    case "plan": {
      if (future) return 0;
      const event = item.detail?.planEvent;
      if (event === "contact_established") return points.plan.contactEstablished;
      if (event === "contact_linked") return points.plan.contactLinked;
      return points.plan.other;
    }
    case "note":
      return future ? 0 : points.note;
    default:
      return 0;
  }
}

function refKey(item: RelationshipTimelineItem): string {
  return `${item.ref.store}\u0000${item.ref.recordId}\u0000${item.ref.subId ?? ""}`;
}

/** 更高分优先；同分取较早、再按 id（确定性）。 */
function better(left: Scored, right: Scored): boolean {
  if (left.basePoints !== right.basePoints) return left.basePoints > right.basePoints;
  if (left.ms !== right.ms) return left.ms < right.ms;
  return left.item.id < right.item.id;
}

/** 去重：同一 ref 只计一次；同一来源同一东京日只计最高的一条。 */
function dedupe(scored: readonly Scored[]): Scored[] {
  const byRef = new Map<string, Scored>();
  for (const entry of scored) {
    const key = refKey(entry.item);
    const existing = byRef.get(key);
    if (!existing || better(entry, existing)) byRef.set(key, entry);
  }
  const byDay = new Map<string, Scored>();
  for (const entry of byRef.values()) {
    // 同一来源同一东京日只计最高的一条（已发生与当天未来的约见也在同一组里比较，W0047 review P2-5）。
    const key = `${entry.item.source}\u0000${entry.day}`;
    const existing = byDay.get(key);
    if (!existing || better(entry, existing)) byDay.set(key, entry);
  }
  return [...byDay.values()];
}

function decayed(basePoints: number, ageDays: number, rules: RelationshipStrengthRules): number {
  return basePoints * Math.pow(0.5, Math.max(0, ageDays) / rules.halfLifeDays);
}

function tierFor(score: number, rules: RelationshipStrengthRules): RelationshipTier {
  if (score >= rules.coreThreshold) return "core";
  if (score >= rules.activeThreshold) return "active";
  return "new";
}

function clampScore(sum: number): number {
  return Math.max(0, Math.min(100, Math.round(sum)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 一位联系人在时间点 `now` 的关系强度。结果只取决于 `items` 与 `now`（与 rules）；
 * `contactId` 取自条目（空时间线为空串，由调用方保证每人至少有 capture）。
 */
export function computeRelationshipStrength(
  items: readonly RelationshipTimelineItem[],
  now: Date,
  rules: RelationshipStrengthRules = RELATIONSHIP_STRENGTH_RULES,
): RelationshipStrength {
  const atMs = now.getTime();
  const atDay = tokyoDayNumber(atMs);
  let lastSignalMs = -Infinity;
  let lastSignalAt: string | null = null;
  const scored: Scored[] = [];
  for (const item of items) {
    const ms = Date.parse(item.occurredAt);
    if (!Number.isFinite(ms)) continue;
    const future = ms > atMs;
    if (!future && item.source !== "capture" && ms > lastSignalMs) {
      lastSignalMs = ms;
      lastSignalAt = item.occurredAt;
    }
    const basePoints = relationshipSignalBasePoints(item, future, rules);
    if (basePoints <= 0) continue;
    scored.push({ item, ms, day: tokyoDayNumber(ms), basePoints, future });
  }
  const kept = dedupe(scored);

  const signals: RelationshipStrengthSignal[] = kept.map((entry) => ({
    timelineItemId: entry.item.id,
    source: entry.item.source as RelationshipTimelineSource,
    occurredAt: entry.item.occurredAt,
    basePoints: entry.basePoints,
    points: round1(entry.future ? entry.basePoints : decayed(entry.basePoints, atDay - entry.day, rules)),
  }));
  const rawScore = kept.reduce(
    (sum, entry) => sum + (entry.future ? entry.basePoints : decayed(entry.basePoints, atDay - entry.day, rules)),
    0,
  );
  const score = clampScore(rawScore);

  // 峰值：按东京日重放已发生的信号（分数只在有新信号的那天跳升，之后单调衰减），取各日与当前的最大值。
  const past = kept.filter((entry) => !entry.future);
  const days = [...new Set(past.map((entry) => entry.day))].sort((a, b) => a - b);
  let peakScore = score;
  for (const day of days) {
    const atThatDay = past.reduce(
      (sum, entry) => (entry.day <= day ? sum + decayed(entry.basePoints, day - entry.day, rules) : sum),
      0,
    );
    peakScore = Math.max(peakScore, clampScore(atThatDay));
  }

  const quietDays = lastSignalAt === null ? Infinity : atDay - tokyoDayNumber(lastSignalMs);
  const dormant = peakScore >= rules.activeThreshold && quietDays >= rules.dormantAfterDays;

  signals.sort((left, right) =>
    right.points - left.points ||
    (left.occurredAt < right.occurredAt ? 1 : left.occurredAt > right.occurredAt ? -1 : 0) ||
    (left.timelineItemId < right.timelineItemId ? -1 : left.timelineItemId > right.timelineItemId ? 1 : 0));

  return {
    contactId: items[0]?.contactId ?? "",
    tier: tierFor(score, rules),
    dormant,
    score,
    peakScore,
    lastSignalAt,
    signals: signals.slice(0, rules.maxSignals),
    computedAt: now.toISOString(),
    rulesVersion: rules.version,
  };
}

/** 管线列／分布分组：dormant 优先归入「待唤醒」。 */
export function relationshipTierGroup(strength: Pick<RelationshipStrength, "tier" | "dormant">): RelationshipTier | "dormant" {
  return strength.dormant ? "dormant" : strength.tier;
}

/**
 * 时间点 `at` 的档位人数（R-7）：只计 capture.occurredAt ≤ at 的联系人，每人用完整、去重后的时间线中
 * occurredAt ≤ at 的条目以 `at` 调用 computeRelationshipStrength（历史回放不计「未来约见」）。
 * 不得用缓存里最多 12 条的 signals 回放。
 */
export function computeRelationshipTierCountsAt(
  timelines: ReadonlyMap<string, readonly RelationshipTimelineItem[]>,
  at: Date,
  rules: RelationshipStrengthRules = RELATIONSHIP_STRENGTH_RULES,
): RelationshipTierCounts {
  const atMs = at.getTime();
  const counts = { new: 0, active: 0, core: 0, dormant: 0 };
  let contactCount = 0;
  for (const items of timelines.values()) {
    const capture = items.find((item) => item.source === "capture");
    const captureMs = capture ? Date.parse(capture.occurredAt) : NaN;
    if (!Number.isFinite(captureMs) || captureMs > atMs) continue;
    // 历史回放（W0047 review P1-1）：只看截止点当时已发生的条目；截止点之后的约见当时未必已约，不按「未来约见」计分。
    const asOf = items.filter((item) => {
      const ms = Date.parse(item.occurredAt);
      return Number.isFinite(ms) && ms <= atMs;
    });
    counts[relationshipTierGroup(computeRelationshipStrength(asOf, at, rules))] += 1;
    contactCount += 1;
  }
  return { asOf: at.toISOString(), counts, contactCount };
}
