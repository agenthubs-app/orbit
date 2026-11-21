/**
 * rankCandidates() (设计稿 §3.5 排序, §3.8 先过滤再判断; agent-design AG10-1, AG10-2, PLANNER 易错边界 3).
 *
 * In code, over a set the caller read under the account's authorization (the @ selection, or what the hard conditions
 * left): hard conditions and hard time constraints remove candidates; a candidate with no start time, or one that cannot
 * be read, is set apart as "not announced" and never given a place in a time order; soft time preferences rank first,
 * then the topic (funnel(): rule ranking, the cut, one match.level request), then the field, then the natural order, and
 * a tie is broken by the record id — so the same input in any order gives the same list. Judgment answers for ids that
 * were not asked (E999), repeated ids and answers with no candidate behind them are rejected and counted. Over the
 * candidate budget, the coverage says how many were looked at.
 */
import type { JudgmentOutcome } from "../judgment/ask";
import { funnel, type FunnelCandidate, type FunnelCoverage, type FunnelMode } from "../judgment/funnel";
import { meetsTime, type TimePreference } from "./basis";

export interface RankCandidate extends FunnelCandidate {
  /** The record ref ("event:…", "contact:…", "todo:…"). */
  ref: string;
}

export interface RankRequest<T extends RankCandidate> {
  candidates: readonly T[];
  hard?: (candidate: T) => boolean;
  /** The start of a candidate (events): needed for time preferences and time orders; null or unreadable → not announced. */
  timeOf?: (candidate: T) => string | null;
  time: readonly TimePreference[];
  timeZone: string;
  /** The words to judge the topic by (a memo's body, the user's basis); null: no topic. */
  topic: string | null;
  /** "相关的几场按时间排": only topic hits are kept (rule overlap, or the judgment's "match"); the field orders them. */
  topicAsFilter?: boolean;
  /** The field the user asked to order by. */
  field: { value: (candidate: T) => string | null; direction: "asc" | "desc" } | null;
  /** The domain's natural order (ties and fallback). */
  natural: { value: (candidate: T) => string | null; direction: "asc" | "desc" };
  /** Extra keys of a domain's history signals, highest first (computed by code from the user's records). */
  signal?: (candidate: T) => number[];
  count: number;
  mode?: FunnelMode;
  judge?: (kept: readonly { key: string; candidate: T }[]) => Promise<JudgmentOutcome>;
}

export interface RankedItem<T extends RankCandidate> {
  candidate: T;
  /** The time preferences it meets (soft ones). */
  meetsTime: boolean;
  level: "insufficient" | "partial" | "match" | null;
  ruleScore: number;
}

export interface RankResult<T extends RankCandidate> {
  ordered: RankedItem<T>[];
  /** No start time (or one that cannot be read): listed apart, never placed in a time order. */
  untimed: T[];
  /** How many met the hard conditions (before the count cut). */
  matching: number;
  /** Of those, how many also meet what only ranks — the soft time preferences and the topic when it was matched (release-2
   *  gate 2, AE-ANS-002 / AE-MEM-*: the count line says this number, not the hard-condition one). Equal to `matching` when
   *  nothing only ranks. */
  meeting: number;
  coverage: FunnelCoverage;
  matched: boolean;
  semantic: boolean;
  unmatchedReason: string | null;
  /** Judgment answers rejected: ids not asked, repeated, not among the candidates. */
  rejected: number;
}

const readable = (value: string | null | undefined) => typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));

function compareValues(a: string | null, b: string | null, direction: "asc" | "desc"): number {
  if (a === b) return 0;
  // Records without the value come last either way.
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? (a < b ? -1 : 1) : a < b ? 1 : -1;
}

const LEVEL = { insufficient: 0, match: 2, partial: 1 } as const;

export async function rankCandidates<T extends RankCandidate>(request: RankRequest<T>): Promise<RankResult<T>> {
  const total = request.candidates.length;
  // The set is the caller's; a repeated id is one candidate.
  const unique = [...new Map(request.candidates.map((candidate) => [candidate.id, candidate])).values()];
  const hardTime = request.time.filter((preference) => preference.hard);
  const softTime = request.time.filter((preference) => !preference.hard);
  const needsTime = Boolean(request.timeOf) && (request.time.length > 0 || request.field !== null || request.natural !== null);
  const untimed: T[] = [];
  const kept: T[] = [];
  for (const candidate of unique) {
    if (request.hard && !request.hard(candidate)) continue;
    const at = request.timeOf?.(candidate) ?? null;
    if (needsTime && request.timeOf && !readable(at)) {
      untimed.push(candidate);
      continue;
    }
    if (at && hardTime.some((preference) => (preference.exclude ? meetsTime(preference, at, request.timeZone) : !meetsTime(preference, at, request.timeZone)))) continue;
    kept.push(candidate);
  }
  const byId = (left: T, right: T) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const naturalOrder = (left: T, right: T) => compareValues(request.natural.value(left), request.natural.value(right), request.natural.direction) || byId(left, right);
  // The topic: funnel over every kept candidate (its own order is replaced below; it gives the levels and rule scores).
  let rejected = 0;
  const judge = request.judge
    ? async (sent: readonly { key: string; candidate: T }[]) => {
      const outcome = await request.judge!(sent);
      rejected += outcome.rejected;
      return outcome;
    }
    : undefined;
  const topic = request.topic
    ? await funnel<T>({ basis: request.topic, candidates: [...kept].sort(naturalOrder), count: kept.length, judge, mode: request.mode ?? "conversation", order: { direction: request.natural.direction, value: request.natural.value } })
    : null;
  const scoreOf = new Map(topic?.ordered.map((item, index) => [item.candidate.id, { index, level: item.level, ruleScore: item.ruleScore }]) ?? []);
  let pool = kept.filter((candidate) => !topic || scoreOf.has(candidate.id));
  if (topic && request.topicAsFilter) {
    // A hit: the record's own words share the topic's, or the judgment says it matches.
    pool = pool.filter((candidate) => {
      const score = scoreOf.get(candidate.id)!;
      return score.ruleScore > 0 || score.level === "match";
    });
  }
  const meets = (candidate: T) => {
    const at = request.timeOf?.(candidate) ?? null;
    return softTime.length > 0 && Boolean(at) && softTime.every((preference) => (preference.exclude ? !meetsTime(preference, at!, request.timeZone) : meetsTime(preference, at!, request.timeZone)));
  };
  const ordered = [...pool].sort((left, right) => {
    const time = Number(meets(right)) - Number(meets(left));
    if (time) return time;
    const signals = request.signal ? compareSignals(request.signal(left), request.signal(right)) : 0;
    if (signals) return signals;
    if (topic && !request.topicAsFilter) {
      const a = scoreOf.get(left.id)!;
      const b = scoreOf.get(right.id)!;
      if (topic.matched) {
        const level = LEVEL[b.level ?? "insufficient"] - LEVEL[a.level ?? "insufficient"];
        if (level) return level;
      }
      const order = a.index - b.index;
      if (order && !request.field) return order;
    }
    if (request.field) {
      const field = compareValues(request.field.value(left), request.field.value(right), request.field.direction);
      if (field) return field;
    }
    return naturalOrder(left, right);
  });
  const count = Math.max(0, request.count);
  const meetsTopic = (candidate: T) => {
    if (!topic || !topic.matched || request.topicAsFilter) return true;
    const score = scoreOf.get(candidate.id);
    return Boolean(score && (score.ruleScore > 0 || score.level === "match" || score.level === "partial"));
  };
  return {
    coverage: topic?.coverage ?? { afterHardConditions: kept.length, judged: 0, total, truncated: 0 },
    matched: topic?.matched ?? false,
    matching: ordered.length,
    meeting: ordered.filter((candidate) => (softTime.length === 0 || meets(candidate)) && meetsTopic(candidate)).length,
    ordered: ordered.slice(0, count).map((candidate) => ({ candidate, level: scoreOf.get(candidate.id)?.level ?? null, meetsTime: meets(candidate), ruleScore: scoreOf.get(candidate.id)?.ruleScore ?? 0 })),
    rejected,
    semantic: topic?.semantic ?? false,
    unmatchedReason: topic?.unmatchedReason ?? null,
    untimed: [...untimed].sort(byId),
  };
}

function compareSignals(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
