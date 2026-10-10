// R23 plan v2.2 generation flow: the App's pure rules (no React, no requests).
// Gaps, reflow and totals come from the shared compute copies (src/api/compute);
// this file only arranges them for the screens. UI-SPEC:
// docs/designs/redesign-2026-10/sprints/R23-plan-generation/UI-SPEC.md.
import type {
  PlanDraftManualEditRequest,
  PlanDraftView,
  PlanGoalKind,
  PlanGoalKindRead,
  PlanIntakeView,
  PlanMemberRelation,
  PlanStance,
  PlanTeamMember,
  PlanV2Content,
  PlanV2PersonType,
} from "../../api/contract/plan-v2";
import {
  changeAllocation,
  changeTargetCount,
  PLAN_ALLOCATION_TOTAL,
  removeSlot,
  type PlanAllocationMove,
  type PlanAllocationResult,
  type PlanAllocationSlot,
} from "../../api/compute/plan-allocation";
import { PLAN_CAPABILITY_COPY, PLAN_EVENT_COPY, PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy, type PlanCopyLanguage } from "../../api/compute/plan-template-copy";
import { PLAN_EVENT_SLOT, PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES, planCapabilityGaps } from "../../api/compute/plan-templates";
import { plan as enPlan } from "../../i18n/en/plan";
import { plan as jaPlan } from "../../i18n/ja/plan";
import { plan as zhPlan } from "../../i18n/zh/plan";

export const PLAN_STANCES: readonly PlanStance[] = ["owner", "cofounder", "employee", "individual"];
export const PLAN_RELATIONS: readonly PlanMemberRelation[] = ["cofounder", "employee", "contractor", "advisor"];
export const PLAN_STEP_LIMIT = 7;
export const PLAN_EVENT_EMOJI = "🎟️";
export const PLAN_NETWORK_ADD_LIMIT = 5;
/** Goal text length (characters) before the type is guessed; the pause before asking. */
export const GOAL_KIND_MIN_LENGTH = 6;
export const GOAL_KIND_DEBOUNCE_MS = 800;

export function isKnownGoalKind(kind: PlanGoalKindRead): kind is PlanGoalKind {
  return (PLAN_GOAL_KINDS as readonly string[]).includes(kind);
}

/** 「🚀 上市・収益化」; an unknown kind shows nothing. */
export function goalKindLabel(kind: PlanGoalKindRead, language: PlanCopyLanguage): string | null {
  if (!isKnownGoalKind(kind)) return null;
  return `${PLAN_GOAL_TEMPLATES[kind].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[kind], language)}`;
}

export function capabilityLabel(id: string, language: PlanCopyLanguage): string {
  const copy = PLAN_CAPABILITY_COPY[id];
  return copy ? planCopy(copy, language) : id;
}

/* ------------------------------ flow progress ------------------------------ */

/** The five progress segments: 背景 / 質問 / 初版 / AI 修正 / 手動編集 (0–4). */
export type FlowStage = 0 | 1 | 2 | 3 | 4;

export function flowStage(intake: Pick<PlanIntakeView, "status">, draft: Pick<PlanDraftView, "aiFixUsed"> | null): FlowStage {
  if (intake.status === "drafting" || intake.status === "background") return 0;
  if (intake.status === "questions" || intake.status === "premise") return draft ? (draft.aiFixUsed > 0 ? 3 : 2) : 1;
  if (draft) return draft.aiFixUsed > 0 ? 3 : 2;
  return intake.status === "drafted" || intake.status === "planned" ? 2 : 1;
}

export type BackgroundBlock = "me" | "team" | "purpose";
export const BACKGROUND_BLOCKS: readonly BackgroundBlock[] = ["me", "team", "purpose"];

/** The first block not confirmed yet (null when all three are). */
export function currentBlock(intake: Pick<PlanIntakeView, "background">): BackgroundBlock | null {
  return BACKGROUND_BLOCKS.find((block) => !intake.background[block].confirmedAt) ?? null;
}

/* ---------------------------------- team ---------------------------------- */

export interface TeamMemberDraft {
  memberId: string;
  capabilities: readonly string[];
  otherCapabilities: readonly string[];
  relation: PlanMemberRelation | null;
}

/** Local team edits: capability ticks per member (no request until the block is confirmed). */
export function teamDraftOf(members: readonly PlanTeamMember[]): Record<string, TeamMemberDraft> {
  return Object.fromEntries(members.map((member) => [member.memberId, {
    capabilities: [...member.capabilities],
    memberId: member.memberId,
    otherCapabilities: [...member.otherCapabilities],
    relation: member.relation,
  }]));
}

/** After members were added the server answers with its own ticks; keep the user's for the people already there. */
export function mergeTeamDraft(previous: Readonly<Record<string, TeamMemberDraft>>, members: readonly PlanTeamMember[]): Record<string, TeamMemberDraft> {
  const fresh = teamDraftOf(members);
  for (const id of Object.keys(fresh)) if (previous[id]) fresh[id] = previous[id]!;
  return fresh;
}

export function toggleCapability(draft: Readonly<Record<string, TeamMemberDraft>>, memberId: string, capability: string): Record<string, TeamMemberDraft> {
  const member = draft[memberId];
  if (!member) return { ...draft };
  const has = member.capabilities.includes(capability);
  return { ...draft, [memberId]: { ...member, capabilities: has ? member.capabilities.filter((id) => id !== capability) : [...member.capabilities, capability] } };
}

/** Members that count: 一人 keeps only you. */
export function activeMembers<T extends { isSelf: boolean }>(mode: "solo" | "team", members: readonly T[]): T[] {
  return mode === "solo" ? members.filter((member) => member.isSelf) : [...members];
}

/** 「空き」: the rule from plan-templates, over the local ticks (never a request). */
export function teamGaps(kind: PlanGoalKind, mode: "solo" | "team", members: readonly PlanTeamMember[], draft: Readonly<Record<string, TeamMemberDraft>>): string[] {
  return planCapabilityGaps(kind, activeMembers(mode, members).map((member) => ({ capabilities: draft[member.memberId]?.capabilities ?? member.capabilities })));
}

export interface ContactCandidate {
  id: string;
  name: string;
  organization: string;
  role: string;
  tags: readonly string[];
}

export interface RankedCandidate extends ContactCandidate {
  cofounder: boolean;
  /** The gaps this person seems to cover (read from the role and tags, no request). */
  fills: string[];
}

// The co-founder tag in any of the three languages (the dictionary words) or as a tag code.
const COFOUNDER_WORDS = [jaPlan["plan.relation.cofounder"], zhPlan["plan.relation.cofounder"], enPlan["plan.relation.cofounder"], "cofounder"];

/** The label, and for longer labels the label without its last character (デザイン → デザイナー, Design → Designer). */
function labelStems(label: string): string[] {
  const chars = [...label];
  return chars.length >= 4 ? [label, chars.slice(0, -1).join("")] : [label];
}

function textHas(haystack: string, needle: string): boolean {
  return needle.trim().length > 0 && haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * 人脈から選ぶ ordering (UI-SPEC ②): people tagged 共同創業者 first, then people whose
 * role or tags name a gap, then the rest in the order the search gave.
 */
export function rankCandidates(candidates: readonly ContactCandidate[], gaps: readonly string[], excludeContactIds: ReadonlySet<string> = new Set()): RankedCandidate[] {
  const ranked = candidates.filter((candidate) => !excludeContactIds.has(candidate.id)).map((candidate, index) => {
    const text = [candidate.role, candidate.organization, ...candidate.tags].join(" ");
    const cofounder = COFOUNDER_WORDS.some((word) => textHas(text, word));
    const fills = gaps.filter((gap) => {
      const copy = PLAN_CAPABILITY_COPY[gap];
      return copy ? (["ja", "zh", "en"] as const).some((language) => labelStems(copy[language]).some((stem) => textHas(text, stem))) : false;
    });
    return { ...candidate, cofounder, fills, index };
  });
  ranked.sort((left, right) => Number(right.cofounder) - Number(left.cofounder) || Number(right.fills.length > 0) - Number(left.fills.length > 0) || left.index - right.index);
  return ranked.map(({ index: _index, ...candidate }) => candidate);
}

/* --------------------------------- draft ---------------------------------- */

/** Person types are lettered A, B, C … in plan order; the event slot has no letter. */
export function typeLetters(personTypes: readonly Pick<PlanV2PersonType, "key">[]): Map<string, string> {
  return new Map(personTypes.map((type, index) => [type.key, String.fromCharCode(65 + index)]));
}

/** The chip under a step: 「🎪 A」, or 「🎟️」 for the event slot. */
export function stepTypeChips(personTypeKeys: readonly string[], personTypes: readonly PlanV2PersonType[]): string[] {
  const letters = typeLetters(personTypes);
  return personTypeKeys.flatMap((key) => {
    if (key === PLAN_EVENT_SLOT) return [PLAN_EVENT_EMOJI];
    const type = personTypes.find((item) => item.key === key);
    return type ? [`${type.emoji} ${letters.get(key)}`] : [];
  });
}

/** The history chip text of a revision: the first 12 characters of what the user wrote. */
export function turnChipText(input: string): string {
  const chars = [...input.trim()];
  return chars.length > 12 ? `${chars.slice(0, 12).join("")}…` : chars.join("");
}

/* ------------------------------ manual edit ------------------------------- */

export interface EditableStep {
  /** Local id (stable while reordering). */
  id: string;
  key: string | null;
  title: string;
  doneCriteria: string;
  personTypeKeys: string[];
  /** The AI's title, shown as 「元：…」 once renamed. */
  originalTitle: string | null;
}

export interface EditableType {
  key: string;
  slot: string;
  isNew: boolean;
  emoji: string;
  shortLabel: string;
  roleSituation: string;
  allocation: number;
  targetCount: number;
}

export interface ManualEditState {
  steps: EditableStep[];
  types: EditableType[];
  event: { allocation: number; targetCount: number };
}

export function manualEditStateOf(content: PlanV2Content): ManualEditState {
  return {
    event: { allocation: content.event.allocation, targetCount: content.event.targetCount },
    steps: content.steps.map((step) => ({ doneCriteria: step.doneCriteria, id: step.key, key: step.key, originalTitle: step.title, personTypeKeys: [...step.personTypeKeys], title: step.title })),
    types: content.personTypes.map((type) => ({ allocation: type.allocation, emoji: type.emoji, isNew: false, key: type.key, roleSituation: type.roleSituation, shortLabel: type.shortLabel, slot: type.slot, targetCount: type.targetCount })),
  };
}

function templateIndex(kind: PlanGoalKind | null, slot: string, fallback: number): number {
  if (!kind) return fallback;
  const index = PLAN_GOAL_TEMPLATES[kind].slots.findIndex((item) => item.slot === slot);
  return index < 0 ? 100 + fallback : index;
}

/** The allocation slots (types + event) the shared reflow works on. Nothing is earned yet in a draft. */
export function allocationSlotsOf(state: ManualEditState, kind: PlanGoalKind | null): PlanAllocationSlot[] {
  return [
    ...state.types.map((type, index) => ({ allocation: type.allocation, earnedBase: 0, key: type.key, metCount: 0, skipped: false, targetCount: type.targetCount, templateIndex: templateIndex(kind, type.slot, index) })),
    { allocation: state.event.allocation, earnedBase: 0, isEvent: true, key: PLAN_EVENT_SLOT, metCount: 0, skipped: false, targetCount: state.event.targetCount, templateIndex: templateIndex(kind, PLAN_EVENT_SLOT, state.types.length) },
  ];
}

function withSlots(state: ManualEditState, slots: readonly PlanAllocationSlot[]): ManualEditState {
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));
  const event = byKey.get(PLAN_EVENT_SLOT);
  return {
    ...state,
    event: event ? { allocation: event.allocation, targetCount: event.targetCount } : state.event,
    types: state.types.filter((type) => byKey.has(type.key)).map((type) => ({ ...type, allocation: byKey.get(type.key)!.allocation, targetCount: byKey.get(type.key)!.targetCount })),
  };
}

export type EditOutcome = { ok: true; state: ManualEditState; moves: PlanAllocationMove[] } | { ok: false; error: string };

function outcome(state: ManualEditState, result: PlanAllocationResult): EditOutcome {
  return result.ok ? { moves: result.moves, ok: true, state: withSlots(state, result.slots) } : { error: result.error, ok: false };
}

/** 配点 input: multiples of 5; the difference flows from the highest other types (shared rule). */
export function editAllocation(state: ManualEditState, kind: PlanGoalKind | null, key: string, allocation: number): EditOutcome {
  if (!Number.isInteger(allocation)) return { error: "not_multiple_of_step", ok: false };
  return outcome(state, changeAllocation(allocationSlotsOf(state, kind), key, allocation));
}

export function editTargetCount(state: ManualEditState, kind: PlanGoalKind | null, key: string, targetCount: number): EditOutcome {
  return outcome(state, changeTargetCount(allocationSlotsOf(state, kind), key, targetCount));
}

/** Removing a type: its points flow back 5 at a time; its letter leaves every step. */
export function removeType(state: ManualEditState, kind: PlanGoalKind | null, key: string): EditOutcome {
  const result = outcome(state, removeSlot(allocationSlotsOf(state, kind), key));
  if (!result.ok) return result;
  return { ...result, state: { ...result.state, steps: result.state.steps.map((step) => ({ ...step, personTypeKeys: step.personTypeKeys.filter((item) => item !== key) })) } };
}

/** Template slots this plan does not use yet (タイプを追加). */
export function unusedTemplateSlots(state: ManualEditState, kind: PlanGoalKind | null): { slot: string; emoji: string; allocation: number; targetCount: number }[] {
  if (!kind) return [];
  const used = new Set(state.types.map((type) => type.slot));
  return PLAN_GOAL_TEMPLATES[kind].slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT && !used.has(slot.slot)).map((slot) => ({ ...slot }));
}

/** Adds a template slot at its template allocation (taken from the highest types); at 0 when nothing can give. */
export function addType(state: ManualEditState, kind: PlanGoalKind | null, slot: string, language: PlanCopyLanguage): EditOutcome {
  const template = unusedTemplateSlots(state, kind).find((item) => item.slot === slot);
  if (!template) return { error: "unknown_slot", ok: false };
  const label = planCopy(PLAN_SHORT_NAME_COPY[slot] ?? PLAN_EVENT_COPY, language);
  const added: ManualEditState = { ...state, types: [...state.types, { allocation: 0, emoji: template.emoji, isNew: true, key: slot, roleSituation: label, shortLabel: label, slot, targetCount: template.targetCount }] };
  const moved = editAllocation(added, kind, slot, template.allocation);
  return moved.ok ? moved : { moves: [], ok: true, state: added };
}

export function allocationTotal(state: ManualEditState): number {
  return state.types.reduce((sum, type) => sum + type.allocation, 0) + state.event.allocation;
}

export function moveStep(state: ManualEditState, id: string, delta: -1 | 1): ManualEditState {
  const index = state.steps.findIndex((step) => step.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.steps.length) return state;
  const steps = [...state.steps];
  [steps[index], steps[target]] = [steps[target]!, steps[index]!];
  return { ...state, steps };
}

/** How many things differ from the AI's plan (「変更 N件」). */
export function changeCount(origin: ManualEditState, edited: ManualEditState): number {
  let count = 0;
  const originSteps = new Map(origin.steps.map((step) => [step.id, step]));
  const keptIds = edited.steps.filter((step) => originSteps.has(step.id)).map((step) => step.id);
  count += origin.steps.filter((step) => !keptIds.includes(step.id)).length;
  count += edited.steps.filter((step) => !originSteps.has(step.id)).length;
  for (const step of edited.steps) {
    const before = originSteps.get(step.id);
    if (!before) continue;
    if (before.title !== step.title.trim()) count += 1;
    if (before.doneCriteria !== step.doneCriteria.trim()) count += 1;
  }
  const originOrder = origin.steps.map((step) => step.id).filter((id) => keptIds.includes(id));
  if (originOrder.join("|") !== keptIds.join("|")) count += 1;
  const originTypes = new Map(origin.types.map((type) => [type.key, type]));
  const editedKeys = new Set(edited.types.map((type) => type.key));
  count += origin.types.filter((type) => !editedKeys.has(type.key)).length;
  for (const type of edited.types) {
    const before = originTypes.get(type.key);
    if (!before) { count += 1; continue; }
    if (before.allocation !== type.allocation) count += 1;
    if (before.targetCount !== type.targetCount) count += 1;
  }
  if (origin.event.allocation !== edited.event.allocation) count += 1;
  if (origin.event.targetCount !== edited.event.targetCount) count += 1;
  return count;
}

export function manualEditReady(state: ManualEditState): boolean {
  return allocationTotal(state) === PLAN_ALLOCATION_TOTAL && state.steps.length >= 1 && state.steps.length <= PLAN_STEP_LIMIT && state.types.length >= 1
    && state.steps.every((step) => step.title.trim().length > 0);
}

export function manualEditRequest(state: ManualEditState, expectedRevision: string, idempotencyKey: string): PlanDraftManualEditRequest {
  const keys = new Set(state.types.map((type) => type.key));
  return {
    event: { ...state.event },
    expectedRevision,
    idempotencyKey,
    personTypes: state.types.map((type) => type.isNew
      ? { allocation: type.allocation, key: null, slot: type.slot, targetCount: type.targetCount }
      : { allocation: type.allocation, key: type.key, targetCount: type.targetCount }),
    steps: state.steps.map((step) => ({
      doneCriteria: step.doneCriteria.trim(),
      key: step.key,
      personTypeKeys: step.personTypeKeys.filter((key) => key === PLAN_EVENT_SLOT || keys.has(key)),
      title: step.title.trim(),
    })),
  };
}

/* ------------------------------ requests --------------------------------- */

let keySequence = 0;

/** A fresh key per user action; a network retry of the same action reuses it. */
export function newIdempotencyKey(operation: string): string {
  keySequence += 1;
  return `app:plan:${operation}:${Date.now().toString(36)}:${keySequence.toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}
