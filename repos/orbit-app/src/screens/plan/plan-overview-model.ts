// R24: pure rules behind the plan overview and the person-type page (UI-SPEC
// 「画面」). The score itself always comes from the server (`score`, computed with
// summarizePlanScore); here we only turn it into bar pieces and labels. Unit points
// and the next award preview use the synced shared/compute rules.
import type {
  PlanAwardResult,
  PlanPendingItem,
  PlanPersonTypeDetail,
  PlanScoreSegment,
  PlanV2Detail,
  PlanV2PersonType,
} from "../../api/contract/plan-v2";
import { unitPoints } from "../../api/compute/plan-allocation";
import { nextAward, PLAN_EVENT_SEGMENT_KEY } from "../../api/compute/plan-score";
import type { MessageKey } from "../../i18n/messages";

/** One piece of the composition bar: solid = talked, striped = skipped, overflow = beyond the target, rest = still open. */
export interface SegmentPieces {
  key: string;
  /** Relative width of the whole segment (allocation + overflow). */
  flex: number;
  earned: number;
  kind: "solid" | "striped";
  overflow: number;
  rest: number;
}

export function segmentPieces(segment: PlanScoreSegment): SegmentPieces {
  const earned = Math.max(0, Math.min(segment.allocation, segment.earned));
  return {
    earned,
    flex: Math.max(1, segment.allocation + segment.overflow),
    key: segment.key,
    kind: segment.skipped ? "striped" : "solid",
    overflow: Math.max(0, segment.overflow),
    rest: Math.max(0, segment.allocation - earned),
  };
}

/** Which of the four bar kinds appear (for the legend and tests). */
export function segmentKinds(segments: readonly PlanScoreSegment[]): { solid: boolean; striped: boolean; overflow: boolean; rest: boolean } {
  const pieces = segments.map(segmentPieces);
  return {
    overflow: pieces.some((piece) => piece.overflow > 0),
    rest: pieces.some((piece) => piece.rest > 0),
    solid: pieces.some((piece) => piece.kind === "solid" && piece.earned > 0),
    striped: pieces.some((piece) => piece.kind === "striped" && piece.earned > 0),
  };
}

/** Pace of one type on the overview (people met, unit points, the next award), read back from its segment. */
export interface TypePace {
  met: number;
  target: number;
  firstUnit: number;
  lastUnit: number;
  next: number;
  nextPart: "base" | "overflow" | "none";
}

export function typePace(allocation: number, targetCount: number, earned: number, skipped: boolean): TypePace {
  const units = unitPoints(allocation, targetCount);
  const unit = units[0] ?? 0;
  const met = skipped ? targetCount : Math.min(targetCount, unit > 0 ? Math.floor(earned / unit) : 0);
  // nextAward reads only the count and the sum of the base awards, so the pace above is enough.
  const awards = Array.from({ length: skipped ? 0 : met }, (_, index) => ({ basis: "talked" as const, part: "base" as const, points: index === 0 ? earned - unit * (met - 1) : unit }));
  const next = nextAward({ allocation, anonymous: false, awards, skipped, targetCount });
  return { firstUnit: unit, lastUnit: units[units.length - 1] ?? 0, met, next: next.points, nextPart: next.part, target: targetCount };
}

/** "1・2・4": the 1-based numbers of the steps that use this type (separator from the dictionary). */
export function stepNumbers(steps: readonly { key: string; personTypeKeys: readonly string[] }[], typeKey: string, separator: string): string {
  return steps.flatMap((step, index) => (step.personTypeKeys.includes(typeKey) ? [String(index + 1)] : [])).join(separator);
}

export function stepNumbersOf(steps: readonly { key: string }[], stepKeys: readonly string[], separator: string): string {
  return steps.flatMap((step, index) => (stepKeys.includes(step.key) ? [String(index + 1)] : [])).join(separator);
}

export function typeLetterOf(personTypes: readonly Pick<PlanV2PersonType, "key">[], key: string): string {
  const index = personTypes.findIndex((type) => type.key === key);
  return index < 0 ? "" : String.fromCharCode(65 + (index % 26));
}

/** The segment of a type (or the event block) in the score. */
export function segmentOf(detail: Pick<PlanV2Detail, "score">, key: string): PlanScoreSegment | null {
  return detail.score.segments.find((segment) => segment.key === key) ?? null;
}

export function isEventSegment(segment: Pick<PlanScoreSegment, "key">): boolean {
  return segment.key === PLAN_EVENT_SEGMENT_KEY;
}

/** Score ring tone: ≥70 deep plum, 50–69 mid plum, <50 rose (b10 ⑧). */
export function eventRingTone(total: number): "deep" | "mid" | "rose" {
  return total >= 70 ? "deep" : total >= 50 ? "mid" : "rose";
}

/** The three ways a person-type page can look (UI-SPEC 三种去向). */
export type TypeState = "skipped" | "candidates" | "none";

export function typeState(detail: Pick<PlanPersonTypeDetail, "skipped" | "candidates">): TypeState {
  if (detail.skipped) return "skipped";
  return detail.candidates.length > 0 ? "candidates" : "none";
}

/** Dictionary key for an award that brought no points (UI-SPEC PlanAwardResult.reason). */
export function awardReasonKey(reason: PlanAwardResult["reason"]): MessageKey | null {
  switch (reason) {
    case "already_counted": return "plan.award.alreadyCounted";
    case "anonymous_over_target": return "plan.award.anonymousOverTarget";
    case "skipped": return "plan.award.skipped";
    default: return null;
  }
}

/** Pending cards split the way the overview shows them: memo checks, step suggestions (by step), candidates (max 3). */
export function groupPending(items: readonly PlanPendingItem[]): { memo: PlanPendingItem[]; steps: Map<string, PlanPendingItem>; candidates: PlanPendingItem[] } {
  const steps = new Map<string, PlanPendingItem>();
  for (const item of items) {
    if (item.kind !== "step_suggestion") continue;
    const stepKey = item.id.split(":").slice(2).join(":");
    if (stepKey) steps.set(stepKey, item);
  }
  return {
    candidates: items.filter((item) => item.kind === "candidate").slice(0, 3),
    memo: items.filter((item) => item.kind === "memo_coverage"),
    steps,
  };
}

/**
 * The points a memo card would add, as the server computed them (`PlanPendingItem.points`;
 * it knows already-counted people and skipped types). Absent → null: the card asks
 * without a number, never a front-end guess (R24 review m9).
 */
export function pendingPoints(item: PlanPendingItem): number | null {
  return typeof item.points === "number" && Number.isFinite(item.points) && item.points >= 0 ? item.points : null;
}

/** The step a proposal answer ended in: an in-app request (contract allows it) or a draft to copy. */
export function proposalOutcome(result: { kind: "request" | "draft"; draft?: { subject: string; body: string } | null }): "request" | "draft" | "none" {
  if (result.kind === "request") return "request";
  return result.draft ? "draft" : "none";
}

/** A manual memo card can be confirmed once at least 2 of the 3 questions are ticked. */
export const MEMO_MIN_ANSWERED = 2;

export function canConfirmManualMemo(answered: readonly number[]): boolean {
  return new Set(answered).size >= MEMO_MIN_ANSWERED;
}

/** 面談を提案: three slots on the next weekdays (10:00, 16:00, 9:30 — b4 A2 ①), editable by day and 30 minutes. */
export const PROPOSAL_SLOT_COUNT = 3;
const DEFAULT_SLOT_TIMES: readonly [number, number][] = [[10, 0], [16, 0], [9, 30]];

export function defaultProposalSlots(now: Date): Date[] {
  const slots: Date[] = [];
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (slots.length < PROPOSAL_SLOT_COUNT) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const [hour, minute] = DEFAULT_SLOT_TIMES[slots.length]!;
    slots.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute));
  }
  return slots;
}

/** Moves a slot by whole days or 30-minute steps, never into the past and only between 7:00 and 22:00. */
export function shiftSlot(slot: Date, unit: "day" | "time", delta: -1 | 1, now: Date): Date {
  const next = new Date(slot.getTime());
  if (unit === "day") next.setDate(next.getDate() + delta);
  else next.setMinutes(next.getMinutes() + delta * 30);
  const minutes = next.getHours() * 60 + next.getMinutes();
  if (unit === "time" && (minutes < 7 * 60 || minutes > 22 * 60 || next.getDate() !== slot.getDate())) return slot;
  return next.getTime() <= now.getTime() ? slot : next;
}

/** Opens the user's mail app with the draft filled in (no recipient: Orbit never sends). */
export function mailtoHref(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
