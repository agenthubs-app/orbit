// R37b: the v3 plan home's pure rules (plan-draft-v5-proposal.html v16「计划主页 · 执行」). A port of the Web
// `orbit-2026/plan/home-v3-model.ts` (R37a) so both ends draw the same numbers; the screen only renders these.
import type { PlanHomeAction, PlanHomeSeat, PlanHomeView, PlanPrepCardView, PlanPrepRow, PlanV2Content, PlanV2Detail } from "../../api/contract/plan-v2";
import { unitPoints } from "../../api/compute/plan-allocation";
import { PLAN_EVENT_SEGMENT_KEY } from "../../api/compute/plan-score";
import type { KitTone } from "./plan-kit";

export const PLAN_HOME_POLL_MS = 3000;
export const PLAN_HOME_POLL_MAX = 10;
export const PLAN_HOME_FACT_MAX = 80;

/** The system's five rotating type colours (design `types[i][1]`; same order as the draft page, from blue). */
export const PLAN_TYPE_TONES: readonly Exclude<KitTone, "neutral" | "coral" | "ok">[] = ["blue", "teal", "apricot", "pink", "lav"];
export type PlanTypeTone = (typeof PLAN_TYPE_TONES)[number];

/** A v3 plan with a home block gets the new page; everything else keeps the R24 overview. */
export function isPlanHomeV3(detail: Pick<PlanV2Detail, "content" | "home">): boolean {
  return detail.content.schemaVersion === 3 && Boolean(detail.home);
}

/** The current stage (0-based): the first one not done; all done = the last. */
export function currentStepIndex(detail: { content: Pick<PlanV2Content, "steps"> }): number {
  const steps = detail.content.steps;
  const index = steps.findIndex((step) => !step.completedAt);
  return index >= 0 ? index : Math.max(0, steps.length - 1);
}

export interface HomeHeader {
  stepIndex: number;
  stepCount: number;
  stepTitle: string;
  /** People already in the network (capped at each type's count) / people needed (skipped types left out). */
  found: number;
  need: number;
  score: number;
  total: number;
  /** Progress bar width (0–100) = score / full marks. */
  barPercent: number;
}

export function seatOf(home: Pick<PlanHomeView, "seats"> | null | undefined, typeKey: string): PlanHomeSeat | null {
  return home?.seats?.find((seat) => seat.typeKey === typeKey) ?? null;
}

/** The head: stage first, score after (field table: computed by the system). */
export function homeHeader(detail: Pick<PlanV2Detail, "content" | "score" | "home">): HomeHeader {
  const stepIndex = currentStepIndex(detail);
  const types = detail.content.personTypes.filter((type) => !type.skipped);
  const need = types.reduce((sum, type) => sum + type.targetCount, 0);
  const found = types.reduce((sum, type) => sum + Math.min(type.targetCount, seatOf(detail.home, type.key)?.people.length ?? 0), 0);
  const total = detail.content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + detail.content.event.allocation;
  const score = detail.score.total;
  return { barPercent: total > 0 ? Math.max(0, Math.min(100, Math.round((score / total) * 100))) : 0, found, need, score, stepCount: detail.content.steps.length, stepIndex, stepTitle: detail.content.steps[stepIndex]?.title ?? "", total };
}

/** A type's colour by its place in the plan; events (and unknown keys) are pink. */
export function typeToneOf(detail: { content: Pick<PlanV2Content, "personTypes"> }, typeKey: string | null): PlanTypeTone {
  if (!typeKey) return "pink";
  const index = detail.content.personTypes.findIndex((type) => type.key === typeKey);
  return index >= 0 ? PLAN_TYPE_TONES[index % PLAN_TYPE_TONES.length]! : "blue";
}

/** The stage (1-based) a type belongs to, after `steps[].personTypeKeys` (R36b: steps win over `stepKey`). */
export function typeStepNumber(content: Pick<PlanV2Content, "steps">, typeKey: string): number {
  return Math.max(1, content.steps.findIndex((step) => step.personTypeKeys.includes(typeKey)) + 1);
}

/** A prep card's lines in the design's order: who / met / last contact / one line per used fact / in common; events: when / about / plan fit. */
export type PrepLine = { kind: "row"; row: PlanPrepRow } | { kind: "fact"; fact: PlanPrepCardView["usedFacts"][number] };

const ROW_ORDER: PlanPrepRow["key"][] = ["who", "met", "last_contact"];
const TAIL_ORDER: PlanPrepRow["key"][] = ["common", "when_where", "about", "plan_fit"];

export function prepLines(prep: PlanPrepCardView): PrepLine[] {
  const pick = (keys: PlanPrepRow["key"][]) => keys.flatMap((key) => prep.rows.filter((row) => row.key === key).map((row): PrepLine => ({ kind: "row", row })));
  return [...pick(ROW_ORDER), ...prep.usedFacts.map((fact): PrepLine => ({ fact, kind: "fact" })), ...pick(TAIL_ORDER)];
}

export interface MarkedPiece {
  text: string;
  marked: boolean;
}

/**
 * Cuts a text at its marks (UTF-16 half-open ranges; out-of-range ends are clamped, reversed ones ignored) — the
 * reason's bold part and the opener's underlines.
 */
export function markedPieces(text: string, marks: readonly { start: number; end: number }[]): MarkedPiece[] {
  const spans = marks.map((mark) => ({ end: Math.min(text.length, mark.end), start: Math.max(0, mark.start) })).filter((mark) => mark.start < mark.end);
  const cuts = [...new Set([0, text.length, ...spans.flatMap((mark) => [mark.start, mark.end])])].sort((left, right) => left - right);
  const pieces: MarkedPiece[] = [];
  for (let index = 0; index < cuts.length - 1; index++) {
    const start = cuts[index]!;
    const end = cuts[index + 1]!;
    if (start === end) continue;
    pieces.push({ marked: spans.some((mark) => mark.start <= start && end <= mark.end), text: text.slice(start, end) });
  }
  return pieces;
}

/** The opener's underlines: each `refs` range is one underline. */
export function draftPieces(prep: PlanPrepCardView): MarkedPiece[] {
  return markedPieces(prep.draft.text, prep.draft.refs);
}

/** 「MM/DD」(the fact date chip). */
export function monthDay(date: string | null): string {
  if (!date) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[2]}/${match[3]}` : "";
}

/** The optimistic tick (the screen changes before the answer arrives). */
export function withDone(home: PlanHomeView, actionKey: string, done: boolean): PlanHomeView {
  return { ...home, actions: home.actions.map((action) => (action.actionKey === actionKey ? { ...action, done } : action)) };
}

/** Tick / regenerate answers carry no `seats`: keep the last ones. */
export function mergeHome(previous: PlanHomeView | null | undefined, next: PlanHomeView): PlanHomeView {
  return next.seats ? next : { ...next, ...(previous?.seats ? { seats: previous.seats } : {}) };
}

export const isEventAction = (action: Pick<PlanHomeAction, "kind">) => action.kind === "event";

/** Events met so far: how many per-event awards the event segment's earned points cover (Web `metCountOf`). */
export function eventsDoneOf(detail: Pick<PlanV2Detail, "content" | "score">): number {
  const segment = detail.score.segments.find((entry) => entry.key === PLAN_EVENT_SEGMENT_KEY);
  if (!segment) return 0;
  let sum = 0;
  let count = 0;
  for (const unit of unitPoints(detail.content.event.allocation, detail.content.event.targetCount)) {
    if (sum + unit > segment.earned) break;
    sum += unit;
    count += 1;
  }
  return count;
}

/** A fact the user can save: trimmed, 1–80 characters (code points, like the Web counter). */
export function factTextOk(text: string): boolean {
  const length = Array.from(text.trim()).length;
  return length > 0 && length <= PLAN_HOME_FACT_MAX;
}
