/**
 * R11b 人脈分析: the pure projection behind GET /api/network/analysis and …/people (PLANNER §2 B-1 / B-2 / B-5, §5, §6).
 *
 * Input: every R11a contact row of the person (the 人脈 list's own rows: same de-duplication / deletion, plan-related
 * and follow-up merged on read) plus the active plan needs, read at one instant. Output: counts that reconcile —
 * each distribution adds up to the total, a card's number equals its drill-down list, the list's 段階の内訳 adds up to
 * the list. Nothing is sampled or invented: a trend without enough people is left out, an opportunity without people
 * is left out, and no AI text feeds a number.
 */
import { seniorityGroup } from "../../shared/compute/seniority-group";
import { NETWORK_ANALYSIS_STABLE_CONTACTS, networkAnalysisPageLock } from "../../shared/compute/network-analysis-page-lock";
import type {
  NetworkAnalysisBucket,
  NetworkAnalysisDimension,
  NetworkAnalysisDistribution,
  NetworkAnalysisGap,
  NetworkAnalysisInsight,
  NetworkAnalysisOpportunity,
  NetworkAnalysisOpportunityKind,
  NetworkAnalysisPeopleDTO,
  NetworkAnalysisPeopleSort,
  NetworkAnalysisPersonRow,
  NetworkAnalysisViewDTO,
} from "../../shared/contract/network-analysis-view";

export interface NetworkAnalysisRow {
  id: string;
  name: string;
  organization: string;
  role: string;
  /** The card status (R11a): nurture reads 関係構築, everything else 知り合い (§B-2). */
  status: string;
  primaryIndustryId?: string | null;
  city?: string | null;
  metKind?: string | null;
  seniorityLevel?: string | null;
  addedAt?: string | null;
  lastInteractionAt?: string | null;
  goalRelated: boolean;
  needsFollowUp: boolean;
  nextActionPreview: string;
}

export interface NetworkAnalysisNeed {
  planId: string;
  needId: string;
  title: string;
  primaryIndustryId: string | null;
  targetCount: number;
  linkedCount: number;
  skipped: boolean;
}

/** null = the plan could not be read; [] = no active plan. */
export type NetworkAnalysisNeeds = readonly NetworkAnalysisNeed[] | null;

const DAY = 86_400_000;
/** 再会すべき人: plan-related and no touch for this long (b5 #35 「90日以上 接点がなく」). */
export const RECONNECT_AFTER_DAYS = 90;
/** 止まっている関係: still 関係構築 with no touch for this long. */
export const STALLED_AFTER_DAYS = 30;
/** Legend rows of the industry ring / region card (b5 #34: four rows; the fourth folds the rest when there are more). */
const TOP_BUCKETS = 4;
/** A met-path comparison needs this many people on each side. */
const MET_PATH_MIN_GROUP = 5;
/** A growth headline needs this many joiners in one industry this month. */
const GROWTH_MIN_ADDED = 3;
const PREVIEW = 3;

const stageOf = (row: NetworkAnalysisRow): "active" | "nurture" => (row.status === "nurture" ? "nurture" : "active");
const parse = (value: string | null | undefined): number => (value ? Date.parse(value) : Number.NaN);
/** The last touch: the latest interaction, else when the person joined. */
const lastTouch = (row: NetworkAnalysisRow): number => {
  const interacted = parse(row.lastInteractionAt);
  return Number.isFinite(interacted) ? interacted : parse(row.addedAt);
};
const daysSince = (row: NetworkAnalysisRow, nowMs: number): number => {
  const at = lastTouch(row);
  return Number.isFinite(at) ? Math.floor((nowMs - at) / DAY) : Number.POSITIVE_INFINITY;
};

function bucketKey(row: NetworkAnalysisRow, dimension: Exclude<NetworkAnalysisDimension, "opportunity">): string {
  switch (dimension) {
    case "industry": return row.primaryIndustryId?.trim() || "none";
    case "region": return row.city?.trim() || "none";
    case "met": return row.metKind === "event" || row.metKind === "referral" || row.metKind === "visit" ? row.metKind : "other";
    case "seniority": {
      const group = seniorityGroup(row.seniorityLevel);
      return group === "other" ? "unset" : group;
    }
  }
}

function countBy(rows: readonly NetworkAnalysisRow[], dimension: Exclude<NetworkAnalysisDimension, "opportunity">): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(bucketKey(row, dimension), (counts.get(bucketKey(row, dimension)) ?? 0) + 1);
  return counts;
}

/** Biggest first, ties by id; when more than four buckets, the top three plus `rest` (the rest, unset included; `other` is a real industry id). */
function topBuckets(counts: Map<string, number>): NetworkAnalysisBucket[] {
  const named = [...counts.entries()].filter(([key]) => key !== "none").sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0));
  const unset = counts.get("none") ?? 0;
  if (named.length + (unset ? 1 : 0) <= TOP_BUCKETS && !unset) return named.map(([id, count]) => ({ id, count }));
  const keep = named.slice(0, TOP_BUCKETS - 1);
  const rest = named.slice(TOP_BUCKETS - 1).reduce((sum, [, count]) => sum + count, 0) + unset;
  return [...keep.map(([id, count]) => ({ id, count })), ...(rest ? [{ id: "rest", count: rest }] : [])];
}

export function distribution(rows: readonly NetworkAnalysisRow[], dimension: Exclude<NetworkAnalysisDimension, "opportunity">): NetworkAnalysisDistribution {
  const counts = countBy(rows, dimension);
  let buckets: NetworkAnalysisBucket[];
  if (dimension === "seniority") {
    buckets = (["decision", "manager", "staff", "unset"] as const).flatMap((id) => (id === "unset" && !counts.get(id) ? [] : [{ id, count: counts.get(id) ?? 0 }]));
  } else if (dimension === "met") {
    buckets = (["event", "referral", "visit", "other"] as const).map((id) => ({ id, count: counts.get(id) ?? 0 }));
  } else {
    buckets = topBuckets(counts);
  }
  return { dimension, total: rows.length, buckets };
}

export function planGaps(needs: NetworkAnalysisNeeds): NetworkAnalysisGap[] | null {
  if (needs === null) return null;
  return needs
    .filter((need) => !need.skipped && need.targetCount > need.linkedCount)
    .sort((a, b) => (b.targetCount - b.linkedCount) - (a.targetCount - a.linkedCount) || (a.needId < b.needId ? -1 : 1))
    .map(({ planId, needId, title, targetCount, linkedCount }) => ({ planId, needId, title, targetCount, linkedCount }));
}

function opportunityMembers(rows: readonly NetworkAnalysisRow[], kind: NetworkAnalysisOpportunityKind, nowMs: number, hasPlan: boolean): NetworkAnalysisRow[] {
  if (kind === "reconnect") return hasPlan ? rows.filter((row) => row.goalRelated && daysSince(row, nowMs) >= RECONNECT_AFTER_DAYS) : [];
  return rows.filter((row) => stageOf(row) === "nurture" && daysSince(row, nowMs) >= STALLED_AFTER_DAYS);
}

export function opportunities(rows: readonly NetworkAnalysisRow[], nowMs: number, hasPlan: boolean): NetworkAnalysisOpportunity[] {
  return (["reconnect", "stalled"] as const).flatMap((kind) => {
    const members = sortPeople(opportunityMembers(rows, kind, nowMs, hasPlan), "goal");
    if (!members.length) return [];
    const finite = members.map((row) => daysSince(row, nowMs)).filter(Number.isFinite);
    return [{
      kind, count: members.length, preview: members.slice(0, PREVIEW).map((row) => ({ id: row.id, name: row.name })),
      ...(kind === "stalled" && finite.length ? { averageDays: Math.round(finite.reduce((sum, days) => sum + days, 0) / finite.length) } : {}),
    }];
  });
}

/** `YYYY-MM` of an instant in Tokyo (JST has no daylight saving). */
function tokyoMonth(ms: number): string {
  const tokyo = new Date(ms + 9 * 3_600_000);
  return `${tokyo.getUTCFullYear()}-${String(tokyo.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(nowMs: number, count: number): string[] {
  const tokyo = new Date(nowMs + 9 * 3_600_000);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth() - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const percentOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function insights(rows: readonly NetworkAnalysisRow[], needs: NetworkAnalysisNeeds, nowMs: number): NetworkAnalysisInsight[] {
  if (rows.length < NETWORK_ANALYSIS_STABLE_CONTACTS) return [];
  const result: NetworkAnalysisInsight[] = [];
  // 出会い方: in the biggest industry, events vs referrals and how many of each reached 関係構築 (a correlation, not a cause).
  const biggest = distribution(rows, "industry").buckets.find((bucket) => bucket.id !== "rest");
  if (biggest) {
    const members = rows.filter((row) => bucketKey(row, "industry") === biggest.id);
    const events = members.filter((row) => bucketKey(row, "met") === "event");
    const referrals = members.filter((row) => bucketKey(row, "met") === "referral");
    if (events.length >= MET_PATH_MIN_GROUP && referrals.length >= MET_PATH_MIN_GROUP) {
      result.push({
        kind: "met_path", industryId: biggest.id, sample: members.length, eventShare: percentOf(events.length, members.length),
        eventRate: percentOf(events.filter((row) => stageOf(row) === "nurture").length, events.length),
        referralRate: percentOf(referrals.filter((row) => stageOf(row) === "nurture").length, referrals.length),
      });
    }
  }
  // 伸び: joiners per Tokyo month (6 months) and the industry that grew most this month.
  const months = lastMonths(nowMs, 6);
  const current = months.at(-1)!;
  const thisMonth = rows.filter((row) => Number.isFinite(parse(row.addedAt)) && tokyoMonth(parse(row.addedAt)) === current);
  const grown = [...countBy(thisMonth, "industry").entries()].filter(([key]) => key !== "none").sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))[0];
  if (grown && grown[1] >= GROWTH_MIN_ADDED) {
    const need = (needs ?? []).find((entry) => !entry.skipped && entry.primaryIndustryId === grown[0]);
    result.push({
      kind: "growth", industryId: grown[0], added: grown[1],
      months: months.map((month) => ({ month, added: rows.filter((row) => Number.isFinite(parse(row.addedAt)) && tokyoMonth(parse(row.addedAt)) === month).length })),
      ...(need ? { planNeedTitle: need.title } : {}),
    });
  }
  return result;
}

export function buildNetworkAnalysisView(input: { total: number; rows: readonly NetworkAnalysisRow[] | null; needs: NetworkAnalysisNeeds; now: Date }): NetworkAnalysisViewDTO {
  const asOf = input.now.toISOString();
  const lock = networkAnalysisPageLock(input.total);
  if (lock.state !== "open" || !input.rows) {
    const total = lock.state === "unknown" ? 0 : lock.total;
    return { asOf, lock: { state: "locked", total, required: 10, missing: Math.max(0, 10 - total) } };
  }
  const rows = input.rows;
  const hasPlan = Array.isArray(input.needs) && input.needs.length > 0;
  return {
    asOf,
    lock: { state: "open", total: rows.length, required: 10, reference: networkAnalysisPageLock(rows.length).state === "open" && rows.length < NETWORK_ANALYSIS_STABLE_CONTACTS },
    structure: {
      industries: distribution(rows, "industry"),
      seniority: distribution(rows, "seniority"),
      regions: distribution(rows, "region"),
      mets: distribution(rows, "met"),
      gaps: planGaps(input.needs),
      hasPlan,
    },
    opportunities: opportunities(rows, input.now.getTime(), hasPlan),
    insights: insights(rows, input.needs, input.now.getTime()),
  };
}

/** The people of one drill-down bucket — the same rule the card counted with. null = unknown dimension / bucket. */
export function bucketMembers(rows: readonly NetworkAnalysisRow[], dimension: NetworkAnalysisDimension, bucketId: string, context: { nowMs: number; hasPlan: boolean }): NetworkAnalysisRow[] | null {
  if (dimension === "opportunity") {
    return bucketId === "reconnect" || bucketId === "stalled" ? opportunityMembers(rows, bucketId, context.nowMs, context.hasPlan) : null;
  }
  const shown = distribution(rows, dimension).buckets;
  if (bucketId === "rest" && dimension !== "met") {
    const named = new Set(shown.filter((bucket) => bucket.id !== "rest").map((bucket) => bucket.id));
    return rows.filter((row) => !named.has(bucketKey(row, dimension)));
  }
  return rows.filter((row) => bucketKey(row, dimension) === bucketId);
}

const collator = new Intl.Collator("ja");

export function sortPeople(rows: readonly NetworkAnalysisRow[], sort: NetworkAnalysisPeopleSort): NetworkAnalysisRow[] {
  const byName = (a: NetworkAnalysisRow, b: NetworkAnalysisRow) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const touch = (row: NetworkAnalysisRow) => { const at = parse(row.lastInteractionAt); return Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY; };
  const copy = [...rows];
  if (sort === "name") return copy.sort(byName);
  if (sort === "recent") return copy.sort((a, b) => touch(b) - touch(a) || byName(a, b));
  // 目標に近い順: plan-related, then needing a follow-up, then 関係構築, then the latest touch.
  const rank = (row: NetworkAnalysisRow) => (row.goalRelated ? 0 : 4) + (row.needsFollowUp ? 0 : 2) + (stageOf(row) === "nurture" ? 0 : 1);
  return copy.sort((a, b) => rank(a) - rank(b) || touch(b) - touch(a) || byName(a, b));
}

/** The orders this list can offer: 目標に近い順 needs a plan, 最終接点 someone with a recorded touch; 名前 always. */
export function availableSorts(rows: readonly NetworkAnalysisRow[], hasPlan: boolean): NetworkAnalysisPeopleSort[] {
  return [
    ...(hasPlan ? (["goal"] as const) : []),
    ...(rows.some((row) => Number.isFinite(parse(row.lastInteractionAt))) ? (["recent"] as const) : []),
    "name",
  ];
}

export function personRow(row: NetworkAnalysisRow): NetworkAnalysisPersonRow {
  return {
    id: row.id, name: row.name, organization: row.organization, role: row.role, stage: stageOf(row),
    needsFollowUp: row.needsFollowUp, goalRelated: row.goalRelated, nextActionPreview: row.nextActionPreview,
    ...(row.primaryIndustryId ? { primaryIndustryId: row.primaryIndustryId } : {}),
    ...(row.lastInteractionAt ? { lastInteractionAt: row.lastInteractionAt } : {}),
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const offset = (JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown }).o;
    if (typeof offset === "number" && Number.isSafeInteger(offset) && offset >= 0) return offset;
  } catch {
    // fall through
  }
  throw new Error("NETWORK_ANALYSIS_CURSOR_INVALID");
}

export function buildNetworkAnalysisPeople(input: {
  rows: readonly NetworkAnalysisRow[];
  needs: NetworkAnalysisNeeds;
  dimension: NetworkAnalysisDimension;
  bucketId: string;
  sort?: NetworkAnalysisPeopleSort;
  cursor?: string;
  limit?: number;
  now: Date;
}): NetworkAnalysisPeopleDTO | null {
  const hasPlan = Array.isArray(input.needs) && input.needs.length > 0;
  const members = bucketMembers(input.rows, input.dimension, input.bucketId, { nowMs: input.now.getTime(), hasPlan });
  if (!members) return null;
  const sorts = availableSorts(members, hasPlan);
  const sort = input.sort && sorts.includes(input.sort) ? input.sort : sorts[0]!;
  const offset = decodeCursor(input.cursor);
  const limit = Math.min(50, Math.max(1, input.limit ?? 30));
  const ordered = sortPeople(members, sort);
  const page = ordered.slice(offset, offset + limit);
  return {
    asOf: input.now.toISOString(), dimension: input.dimension, bucketId: input.bucketId, total: members.length,
    stages: { active: members.filter((row) => stageOf(row) === "active").length, nurture: members.filter((row) => stageOf(row) === "nurture").length },
    sort, sorts, items: page.map(personRow), nextCursor: offset + limit < ordered.length ? encodeCursor(offset + limit) : null,
  };
}
