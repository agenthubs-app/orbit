// R36b: the pure rules of the v3 draft page (plan-draft-v5-proposal.html v16「手机」·「初稿 · 确认」; DESIGN
// §1.2 第 3 条). No React, no requests. The adjust state lives only on the client (D-1: it is not a manual
// edit); the total and the 100 check reuse the shared plan-allocation copy, the type groups follow
// `steps[].personTypeKeys` (the truth) rather than `personTypes[].stepKey` (SC-05, R35 hand-over).
import type { PlanMarkedText, PlanPremiseRow, PlanSource, PlanV2Content, PlanV2PersonType, PlanV2Step, PlanCitationView } from "../../api/contract/plan-v2";
import { PLAN_ALLOCATION_STEP, PLAN_TYPE_TARGET_MAX, validateAllocations, type PlanAllocationSlot } from "../../api/compute/plan-allocation";
import { PLAN_EVENT_SLOT } from "../../api/compute/plan-templates";

/** 字段表：分量 5 一档、5–50。 */
export const PLAN_DRAFT_ALLOCATION_MIN = 5;
export const PLAN_DRAFT_ALLOCATION_MAX = 50;
/** 来源抓取时间超过这个天数 → 「可能已更新」。 */
export const PLAN_SOURCE_STALE_DAYS = 180;

export type PlanDraftV3Content = PlanV2Content & { schemaVersion: 3; outcome: string; summary: PlanMarkedText };

/** v3 when the server says so and the hero has what it needs; anything else renders the v2.2 card. */
export function isDraftV3(content: PlanV2Content): content is PlanDraftV3Content {
  return content.schemaVersion === 3 && typeof content.outcome === "string" && content.outcome.length > 0 && Boolean(content.summary);
}

/* ---------------------------------- groups --------------------------------- */

export interface TypeGroup {
  step: PlanV2Step;
  stepIndex: number;
  types: PlanV2PersonType[];
}

/** The type table grouped by stage: `steps[].personTypeKeys` decides; a type no step names goes by its `stepKey`, else to the first group. */
export function typeGroups(content: PlanV2Content): TypeGroup[] {
  const byKey = new Map(content.personTypes.map((type) => [type.key, type]));
  const placed = new Set<string>();
  const groups: TypeGroup[] = content.steps.map((step, stepIndex) => ({
    step,
    stepIndex,
    types: step.personTypeKeys.flatMap((key) => {
      const type = byKey.get(key);
      if (!type || placed.has(key)) return [];
      placed.add(key);
      return [type];
    }),
  }));
  for (const type of content.personTypes) {
    if (placed.has(type.key)) continue;
    const home = groups.find((group) => group.step.key === type.stepKey) ?? groups[0];
    if (!home) continue;
    home.types.push(type);
    placed.add(type.key);
  }
  return groups.filter((group) => group.types.length > 0);
}

/* ---------------------------------- adjust --------------------------------- */

export interface DraftAdjustType {
  on: boolean;
  targetCount: number;
  allocation: number;
}

export interface DraftAdjustState {
  types: Record<string, DraftAdjustType>;
  event: { targetCount: number; allocation: number };
}

export function draftAdjustStateOf(content: PlanV2Content): DraftAdjustState {
  return {
    event: { allocation: content.event.allocation, targetCount: content.event.targetCount },
    types: Object.fromEntries(content.personTypes.map((type) => [type.key, { allocation: type.allocation, on: true, targetCount: type.targetCount }])),
  };
}

function withType(state: DraftAdjustState, key: string, patch: Partial<DraftAdjustType>): DraftAdjustState {
  const current = state.types[key];
  if (!current) return state;
  return { ...state, types: { ...state.types, [key]: { ...current, ...patch } } };
}

/** 人数 stepper：1–5。 */
export function adjustTargetCount(state: DraftAdjustState, key: string, delta: number): DraftAdjustState {
  const current = state.types[key];
  if (!current) return state;
  const next = current.targetCount + delta;
  if (next < 1 || next > PLAN_TYPE_TARGET_MAX) return state;
  return withType(state, key, { targetCount: next });
}

/** 分量 stepper：5 一档、5–50。 */
export function adjustAllocation(state: DraftAdjustState, key: string, delta: number): DraftAdjustState {
  const current = state.types[key];
  if (!current) return state;
  const next = current.allocation + delta;
  if (next < PLAN_DRAFT_ALLOCATION_MIN || next > PLAN_DRAFT_ALLOCATION_MAX || next % PLAN_ALLOCATION_STEP !== 0) return state;
  return withType(state, key, { allocation: next });
}

export function onTypeCount(state: DraftAdjustState): number {
  return Object.values(state.types).filter((type) => type.on).length;
}

/** Whether 「×」 is available: the last type that is still on cannot be taken off (SC-03). */
export function canToggleOff(state: DraftAdjustState, key: string): boolean {
  const current = state.types[key];
  return Boolean(current && (!current.on || onTypeCount(state) > 1));
}

/** 「×」 takes a type off (its row dims, it leaves the total); 「↺」 brings it back. */
export function toggleType(state: DraftAdjustState, key: string): DraftAdjustState {
  const current = state.types[key];
  if (!current || !canToggleOff(state, key)) return state;
  return withType(state, key, { on: !current.on });
}

/** 「已改」: people or allocation differ from the AI's values. */
export function typeAdjusted(content: PlanV2Content, state: DraftAdjustState, key: string): boolean {
  const origin = content.personTypes.find((type) => type.key === key);
  const current = state.types[key];
  return Boolean(origin && current && (origin.allocation !== current.allocation || origin.targetCount !== current.targetCount));
}

function adjustSlots(content: PlanV2Content, state: DraftAdjustState): PlanAllocationSlot[] {
  const lock = { earnedBase: 0, metCount: 0, skipped: false };
  return [
    ...content.personTypes.flatMap((type, index) => {
      const current = state.types[type.key];
      return current && current.on ? [{ ...lock, allocation: current.allocation, key: type.key, targetCount: current.targetCount, templateIndex: index }] : [];
    }),
    { ...lock, allocation: state.event.allocation, isEvent: true, key: PLAN_EVENT_SLOT, targetCount: state.event.targetCount, templateIndex: content.personTypes.length },
  ];
}

export interface AdjustTotals {
  typeCount: number;
  peopleCount: number;
  eventCount: number;
  total: number;
  /** = 100 and every slot valid (the shared `validateAllocations`); only then can the draft be confirmed. */
  ok: boolean;
}

export function adjustTotals(content: PlanV2Content, state: DraftAdjustState): AdjustTotals {
  const slots = adjustSlots(content, state);
  const types = slots.filter((slot) => !slot.isEvent);
  return {
    eventCount: state.event.targetCount,
    ok: validateAllocations(slots).ok,
    peopleCount: types.reduce((sum, slot) => sum + slot.targetCount, 0),
    total: slots.reduce((sum, slot) => sum + slot.allocation, 0),
    typeCount: types.length,
  };
}

/**
 * `confirm` 的可选 `adjustments`（R36a 契约：`PlanDraftManualEditRequest` 去掉 `steps` / `idempotencyKey`）。
 * 同步契约后换成 `src/api/contract/plan-v2` 的类型；形状相同。
 */
export interface PlanDraftConfirmAdjustments {
  expectedRevision: string;
  personTypes: readonly { key: string; targetCount: number; allocation: number }[];
  event: { targetCount: number; allocation: number };
}

/** null when nothing differs from the AI's draft (then `confirm` goes out without the field). */
export function adjustmentsOf(content: PlanV2Content, state: DraftAdjustState, expectedRevision: string): PlanDraftConfirmAdjustments | null {
  const personTypes = content.personTypes.flatMap((type) => {
    const current = state.types[type.key];
    return current && current.on ? [{ allocation: current.allocation, key: type.key, targetCount: current.targetCount }] : [];
  });
  const unchanged = personTypes.length === content.personTypes.length
    && content.personTypes.every((type, index) => personTypes[index]!.allocation === type.allocation && personTypes[index]!.targetCount === type.targetCount)
    && state.event.allocation === content.event.allocation && state.event.targetCount === content.event.targetCount;
  if (unchanged) return null;
  return { event: { ...state.event }, expectedRevision, personTypes };
}

/* --------------------------------- summary --------------------------------- */

export type SummarySegment =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "source"; n: number }
  | { kind: "answer"; label: string | null };

/**
 * The 理由段 as runs: bold by `marks` index slices (never by text search), and after each referenced
 * span its badge — the source number, or the premise row an answer ref points at. Marks past the
 * end are clamped, reversed ones ignored; a ref to an unknown source gets no badge (R36a 易错边界).
 */
export function summarySegments(summary: PlanMarkedText, sources: readonly PlanSource[], premise: readonly PlanPremiseRow[]): SummarySegment[] {
  const chars = [...summary.text];
  const length = chars.length;
  const clamp = (value: number) => Math.max(0, Math.min(length, value));
  const marks = summary.marks.map((mark) => ({ end: clamp(mark.end), start: clamp(mark.start) })).filter((mark) => mark.start < mark.end);
  const refs = summary.refs.map((ref) => ({ ...ref, end: clamp(ref.end) }));
  const cuts = [...new Set([0, length, ...marks.flatMap((mark) => [mark.start, mark.end]), ...refs.map((ref) => ref.end)])].sort((a, b) => a - b);
  const segments: SummarySegment[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const from = cuts[i]!;
    const to = cuts[i + 1]!;
    segments.push({ bold: marks.some((mark) => mark.start <= from && to <= mark.end), kind: "text", text: chars.slice(from, to).join("") });
    for (const ref of refs) {
      if (ref.end !== to) continue;
      if (ref.ref.kind === "source") {
        const n = sourceNumber(sources, ref.ref.sourceId);
        if (n !== null) segments.push({ kind: "source", n });
      } else {
        const questionKey = ref.ref.questionKey;
        segments.push({ kind: "answer", label: premise.find((row) => row.key === questionKey)?.label ?? null });
      }
    }
  }
  return segments;
}

/* --------------------------------- sources --------------------------------- */

/** 来源编号 = 清单顺序（1 起）；正文的 `sourceId` 查这里。 */
export function sourceNumber(sources: readonly PlanSource[], id: string): number | null {
  const index = sources.findIndex((source) => source.id === id);
  return index < 0 ? null : index + 1;
}

/** The library entry a landscape source points at (the draft's `citations` carry title and URL). */
export function sourceCitation(source: PlanSource, citations: readonly PlanCitationView[]): PlanCitationView | null {
  if (source.kind !== "landscape") return null;
  return citations.find((citation) => citation.id === source.landscapeId && citation.version === source.version) ?? citations.find((citation) => citation.id === source.landscapeId) ?? null;
}

export function sourceTitle(source: PlanSource, citations: readonly PlanCitationView[]): string {
  if (source.kind === "web") return source.title;
  return sourceCitation(source, citations)?.title ?? source.landscapeId;
}

export function sourceUrl(source: PlanSource, citations: readonly PlanCitationView[]): string | null {
  if (source.kind === "web") return source.url;
  return sourceCitation(source, citations)?.sourceUrl ?? null;
}

/** A web source fetched more than 180 days ago may have changed (字段表). */
export function sourceStale(source: PlanSource, now: Date): boolean {
  if (source.kind !== "web") return false;
  const fetched = Date.parse(source.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return now.getTime() - fetched > PLAN_SOURCE_STALE_DAYS * 24 * 60 * 60 * 1000;
}
