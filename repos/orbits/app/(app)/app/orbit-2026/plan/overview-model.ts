// R24: pure helpers for the plan overview and the person-type detail (no React, no
// fetch). Scores always come from the API (`summarizePlanScore` on the server); the
// per-person points and the half points past the target come from shared/compute.
import type {
  PlanEventScore,
  PlanPersonTypeDetail,
  PlanScoreSegment,
  PlanV2Content,
  PlanV2Detail,
  PlanV2PersonType,
} from "../../../../../shared/contract/plan-v2";
import { unitPoints } from "../../../../../shared/compute/plan-allocation";
import { overflowPoints, PLAN_EVENT_SEGMENT_KEY } from "../../../../../shared/compute/plan-score";

export { PLAN_EVENT_SEGMENT_KEY };

/** One coloured part of a segment in the score bar. */
export type SegmentPartKind = "earned" | "skipped" | "overflow" | "rest";
export type SegmentPart = { kind: SegmentPartKind; value: number };

/**
 * A segment's parts (DESIGN §2.5): solid = earned by talking, striped = the full
 * allocation recorded by a skip, grey = still open. Overflow (half points past the
 * target) is drawn after the 100 scale (`overflowParts`), not inside the segment.
 */
export function segmentParts(segment: Pick<PlanScoreSegment, "allocation" | "earned" | "skipped">): SegmentPart[] {
  if (segment.allocation <= 0) return [];
  if (segment.skipped) return [{ kind: "skipped", value: segment.allocation }];
  const earned = Math.max(0, Math.min(segment.allocation, segment.earned));
  const parts: SegmentPart[] = [];
  if (earned > 0) parts.push({ kind: "earned", value: earned });
  if (segment.allocation - earned > 0) parts.push({ kind: "rest", value: segment.allocation - earned });
  return parts;
}

/** The half points past each target, in segment order, drawn after the scale. */
export function overflowParts(segments: readonly PlanScoreSegment[]): { key: string; label: string; value: number }[] {
  return segments.filter((segment) => segment.overflow > 0).map((segment) => ({ key: segment.key, label: segment.shortLabel, value: segment.overflow }));
}

/** How many people (or event visits) the earned base points stand for: units are always awarded in order. */
export function metCountOf(allocation: number, targetCount: number, earned: number, skipped = false): number {
  if (skipped) return targetCount;
  const units = unitPoints(allocation, targetCount);
  let sum = 0;
  let count = 0;
  for (const unit of units) {
    if (sum + unit > earned) break;
    sum += unit;
    count += 1;
  }
  return count;
}

/** The points the next named record would add (base unit until the target, then half). */
export function nextPointsOf(allocation: number, targetCount: number, earned: number): { points: number; half: boolean } {
  const met = metCountOf(allocation, targetCount, earned);
  const units = unitPoints(allocation, targetCount);
  if (met < targetCount) return { half: false, points: units[met] ?? 0 };
  return { half: true, points: overflowPoints(allocation, targetCount) };
}

/** 「1人 7点（最後の1人 8点）」 or 「1人 10点」. */
export function unitsOf(allocation: number, targetCount: number): { points: number; last: number | null } {
  const units = unitPoints(allocation, targetCount);
  const first = units[0] ?? 0;
  const last = units[units.length - 1] ?? 0;
  return { last: first === last ? null : last, points: first };
}

/** Type letters A, B, C … by the plan's order of person types. */
export function letterOf(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** Step numbers (1-based) whose types include this one. */
export function stepNumbersOf(content: Pick<PlanV2Content, "steps">, typeKey: string): number[] {
  return content.steps.flatMap((step, index) => (step.personTypeKeys.includes(typeKey) ? [index + 1] : []));
}

export function segmentOf(detail: Pick<PlanV2Detail, "score">, key: string): PlanScoreSegment | null {
  return detail.score.segments.find((segment) => segment.key === key) ?? null;
}

export type TypeCardView = {
  type: PlanV2PersonType;
  letter: string;
  steps: number[];
  earned: number;
  overflow: number;
  met: number;
  candidates: number;
  events: number;
  introRoutes: number;
};

/** Everything a type card shows, from the overview (segments for points, typeStats for the three cells). */
export function typeCards(detail: Pick<PlanV2Detail, "content" | "score" | "typeStats">): TypeCardView[] {
  return detail.content.personTypes.map((type, index) => {
    const segment = segmentOf(detail, type.key);
    const stats = detail.typeStats?.find((item) => item.itemId === type.itemId);
    const earned = segment?.earned ?? 0;
    return {
      candidates: stats?.candidates ?? 0,
      earned,
      events: stats?.events ?? 0,
      introRoutes: stats?.introRoutes ?? type.introRoutes.length,
      letter: letterOf(index),
      met: metCountOf(type.allocation, type.targetCount, earned, type.skipped),
      overflow: segment?.overflow ?? 0,
      steps: stepNumbersOf(detail.content, type.key),
      type,
    };
  });
}

/** b8 1024: each type once, under the first step that lists it; types in no step come last. */
export function stepGroups(detail: Pick<PlanV2Detail, "content" | "score" | "typeStats">): { stepKey: string | null; n: number; title: string; types: TypeCardView[] }[] {
  const cards = typeCards(detail);
  const placed = new Set<string>();
  const groups = detail.content.steps.map((step, index) => {
    const types = cards.filter((card) => step.personTypeKeys.includes(card.type.key) && !placed.has(card.type.key));
    types.forEach((card) => placed.add(card.type.key));
    return { n: index + 1, stepKey: step.key as string | null, title: step.title, types };
  });
  const rest = cards.filter((card) => !placed.has(card.type.key));
  return [...groups.filter((group) => group.types.length > 0), ...(rest.length ? [{ n: 0, stepKey: null, title: "", types: rest }] : [])];
}

/** The event block: visits counted from its earned base points. */
export function eventView(detail: Pick<PlanV2Detail, "content" | "score">) {
  const segment = segmentOf(detail, PLAN_EVENT_SEGMENT_KEY);
  const { allocation, targetCount } = detail.content.event;
  const earned = segment?.earned ?? 0;
  return { allocation, count: metCountOf(allocation, targetCount, earned), earned, overflow: segment?.overflow ?? 0, targetCount, unit: unitsOf(allocation, targetCount).points };
}

export type TypeDetailState = "candidates" | "none" | "skipped";

/** The three ways a type page reads (b4 A2 / b10 ⑧). */
export function typeDetailState(detail: Pick<PlanPersonTypeDetail, "skipped" | "candidates">): TypeDetailState {
  if (detail.skipped) return "skipped";
  return detail.candidates.length > 0 ? "candidates" : "none";
}

/** Candidates by 推薦度, highest first (the server sorts too; the page never trusts order). */
export function sortedCandidates<T extends { recommendScore: number }>(candidates: readonly T[]): T[] {
  return [...candidates].sort((left, right) => right.recommendScore - left.recommendScore);
}

/** Score ring tone: ≥70 deep plum, 50–69 mid plum, <50 red bean. */
export function ringTone(score: number): "high" | "mid" | "low" {
  return score >= 70 ? "high" : score >= 50 ? "mid" : "low";
}

export function verdictOf(score: Pick<PlanEventScore, "verdict">): PlanEventScore["verdict"] {
  return score.verdict;
}

/** A record preview: named people use the server's `next`; unnamed ones add nothing once the target is met. */
export function recordPreview(detail: Pick<PlanPersonTypeDetail, "next" | "metCount" | "targetCount" | "skipped">, anonymous: boolean): { points: number; half: boolean } | null {
  if (detail.skipped || detail.next.part === "none") return null;
  if (anonymous && detail.metCount >= detail.targetCount) return null;
  return { half: detail.next.part === "overflow", points: detail.next.points };
}

/** Three slots for 面談を提案: the next three weekdays at 10:00 (local), as date / time strings. */
export function defaultSlots(now: Date): { date: string; time: string }[] {
  const slots: { date: string; time: string }[] = [];
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (slots.length < 3) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    slots.push({ date, time: "10:00" });
  }
  return slots;
}

/** Local date + time → ISO; null when either is missing or invalid. */
export function slotIso(slot: { date: string; time: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(slot.date) || !/^\d{2}:\d{2}$/u.test(slot.time)) return null;
  const value = new Date(`${slot.date}T${slot.time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** `mailto:` with subject and body only — the person picks the recipient and sends it themselves. */
export function mailtoHref(draft: { subject: string; body: string }): string {
  return `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
