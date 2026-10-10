// R23: pure helpers for the plan generation screens (no React, no fetch) — the
// stage of a flow, the 「わかったこと」 summary, person-type letters, the manual-edit
// slots and its change list, and how an API error shows (DESIGN §2.1–2.4, UI-SPEC).
// Business rules come from shared/compute; nothing here calls AI.
import type {
  PlanDraftView,
  PlanGoalKind,
  PlanGoalKindRead,
  PlanGoalListItem,
  PlanIntakeView,
  PlanStance,
  PlanTeamMember,
  PlanV2Content,
  PlanV2SummaryResponse,
} from "../../../../../shared/contract/plan-v2";
import { PLAN_ALLOCATION_TOTAL, unitPoints, type PlanAllocationSlot } from "../../../../../shared/compute/plan-allocation";
import { PLAN_CAPABILITY_COPY, PLAN_GOAL_KIND_COPY, planCopy, type PlanCopyLanguage } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_EVENT_SLOT, PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES, planCapabilityGaps } from "../../../../../shared/compute/plan-templates";

export type PlanFlowStage = "background" | "questions" | "draft" | "fix" | "manual";
export const PLAN_FLOW_STAGES: readonly PlanFlowStage[] = ["background", "questions", "draft", "fix", "manual"];

/** UI-SPEC ②: background → 背景; questions / premise → 質問; drafted → 初版 (AI 修正 once a revision is used). */
export function flowStage(intake: Pick<PlanIntakeView, "status">, draft: Pick<PlanDraftView, "aiFixUsed"> | null): PlanFlowStage {
  if (intake.status === "drafting" || intake.status === "background") return "background";
  if (intake.status === "questions" || intake.status === "premise") return "questions";
  return draft && draft.aiFixUsed > 0 ? "fix" : "draft";
}

export function isGoalKind(kind: PlanGoalKindRead | string | null | undefined): kind is PlanGoalKind {
  return Boolean(kind) && (PLAN_GOAL_KINDS as readonly string[]).includes(kind as string);
}

export function goalKindLabel(kind: PlanGoalKindRead, language: PlanCopyLanguage): string | null {
  return isGoalKind(kind) ? `${PLAN_GOAL_TEMPLATES[kind].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[kind], language)}` : null;
}

export function capabilityLabel(id: string, language: PlanCopyLanguage): string {
  const copy = PLAN_CAPABILITY_COPY[id];
  return copy ? planCopy(copy, language) : id;
}

/** At least 6 characters (code points) before the goal-kind guess runs (UI-SPEC ①). */
export function goalGuessReady(text: string): boolean {
  return [...text.trim()].length >= 6;
}

/** Type letters A, B, C … by the order of the plan's person types. */
export function typeLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function typeLetters(content: Pick<PlanV2Content, "personTypes">): Map<string, string> {
  return new Map(content.personTypes.map((type, index) => [type.key, typeLetter(index)]));
}

/* ---------- team: capability × member ---------- */

export type TeamMemberDraft = { memberId: string; capabilities: string[]; otherCapabilities: string[]; relation: PlanTeamMember["relation"] };
export type TeamDraft = { mode: "solo" | "team"; members: TeamMemberDraft[] };

export function teamDraftOf(team: PlanIntakeView["background"]["team"]["value"]): TeamDraft {
  return { members: team.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [...member.otherCapabilities], relation: member.relation })), mode: team.mode };
}

/** Keep the local ticks of members already on screen; take new members from the server. */
export function mergeTeamDraft(local: TeamDraft, server: PlanIntakeView["background"]["team"]["value"]): TeamDraft {
  const known = new Map(local.members.map((member) => [member.memberId, member]));
  return {
    members: server.members.map((member) => known.get(member.memberId) ?? { capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [...member.otherCapabilities], relation: member.relation }),
    mode: server.members.length > local.members.length ? "team" : local.mode,
  };
}

/** Members that count: solo = only you. */
export function visibleMembers<T extends { memberId: string }>(draft: TeamDraft, members: readonly (T & { isSelf: boolean })[]): (T & { isSelf: boolean })[] {
  return draft.mode === "solo" ? members.filter((member) => member.isSelf) : [...members];
}

export function toggleCapability(draft: TeamDraft, memberId: string, capability: string): TeamDraft {
  return {
    ...draft,
    members: draft.members.map((member) => member.memberId !== memberId ? member : {
      ...member,
      capabilities: member.capabilities.includes(capability) ? member.capabilities.filter((item) => item !== capability) : [...member.capabilities, capability],
    }),
  };
}

/** 「空き」: rule-computed locally with shared/compute (no request). */
export function teamGaps(kind: PlanGoalKindRead, draft: TeamDraft, selfId: string | null): string[] {
  if (!isGoalKind(kind)) return [];
  const members = draft.mode === "solo" ? draft.members.filter((member) => member.memberId === selfId) : draft.members;
  return planCapabilityGaps(kind, members);
}

export function coverCount(draft: TeamDraft, capability: string, selfId: string | null): number {
  const members = draft.mode === "solo" ? draft.members.filter((member) => member.memberId === selfId) : draft.members;
  return members.filter((member) => member.capabilities.includes(capability)).length;
}

/* ---------- 目的の階段 ---------- */

export function ladderRungs(purpose: PlanIntakeView["background"]["purpose"]["value"]) {
  return [...purpose.rungs].sort((left, right) => right.level - left.level);
}

/* ---------- 「わかったこと」 ---------- */

export type FlowSummaryRow = { key: "me" | "wants" | "setup" | "gaps" | "purpose" | "premise"; value: string | null; items?: { label: string; value: string }[] };

export function flowSummary(input: {
  intake: PlanIntakeView;
  stanceLabel: string | null;
  wants: string;
  team: TeamDraft;
  purposeLevel: number | null;
  answers: { label: string; value: string }[];
  language: PlanCopyLanguage;
  setupText: (count: number, names: string) => string;
  soloText: string;
  noGapText: string;
}): FlowSummaryRow[] {
  const { intake, language } = input;
  const me = intake.background.me.value;
  const membersById = new Map(intake.background.team.value.members.map((member) => [member.memberId, member]));
  const self = intake.background.team.value.members.find((member) => member.isSelf) ?? null;
  const members = input.team.mode === "solo" ? input.team.members.filter((member) => member.memberId === self?.memberId) : input.team.members;
  const gaps = teamGaps(intake.goalKind, input.team, self?.memberId ?? null).map((id) => capabilityLabel(id, language));
  const names = members.map((member) => membersById.get(member.memberId)?.name ?? "").filter(Boolean).join(" · ");
  const rung = intake.background.purpose.value.rungs.find((item) => item.level === input.purposeLevel);
  const premise = intake.premise ? intake.premise.map((row) => ({ label: row.label, value: row.value })) : input.answers;
  return [
    { key: "me", value: [me.headline, input.stanceLabel].filter(Boolean).join(" · ") || me.name || null },
    { key: "wants", value: input.wants.trim() || null },
    { key: "setup", value: input.team.mode === "solo" || members.length <= 1 ? input.soloText : input.setupText(members.length, names) },
    { key: "gaps", value: isGoalKind(intake.goalKind) ? (gaps.length ? gaps.join(" · ") : input.noGapText) : null },
    { key: "purpose", value: rung?.text ?? null },
    { key: "premise", items: premise, value: null },
  ];
}

export const STANCES: readonly PlanStance[] = ["owner", "cofounder", "employee", "individual"];

/* ---------- ≤5 問 ---------- */

export type AnswerDraft = { values: string[]; text: string; touched: boolean };

export function initialAnswers(intake: Pick<PlanIntakeView, "questions">): Record<string, AnswerDraft> {
  return Object.fromEntries((intake.questions ?? []).map((question) => [question.id, { text: "", touched: false, values: [...(question.guess?.values ?? [])] }]));
}

/** The request body: an untouched, empty answer is left to the server's guess (marked 推測). */
export function answersBody(intake: Pick<PlanIntakeView, "questions">, answers: Record<string, AnswerDraft>) {
  return (intake.questions ?? []).map((question) => {
    const answer = answers[question.id];
    if (!answer || (!answer.touched && !answer.text.trim())) return { questionId: question.id, text: null, values: [] as string[] };
    return { questionId: question.id, text: answer.text.trim() || null, values: answer.values };
  });
}

/* ---------- 「已確定」 ---------- */

export type ActivePlanCard = { planId: string; goal: string; goalKind: PlanGoalKindRead; total: number };

/**
 * The active v2 plan for the Task › プラン card: the summary's current goal (most
 * recently opened), else the first active one. In mock mode this is the demo
 * world's plan (`sample: true`), the same one the home score widget shows.
 */
export function pickActiveV2Plan(summary: PlanV2SummaryResponse | null): ActivePlanCard | null {
  if (!summary) return null;
  const current = summary.current;
  if (current) return { goal: current.goal, goalKind: current.goalKind, planId: current.planId, total: current.score.total };
  const goal = summary.goals.find((item: PlanGoalListItem) => item.status === "active");
  return goal ? { goal: goal.goal, goalKind: goal.goalKind, planId: goal.planId, total: goal.total } : null;
}

/* ---------- API errors → UI ---------- */

export type PlanApiError = { status: number; code: string; reason: string | null; limit: "daily" | "monthly" | null; retryOn: string | null; network: boolean };

export type PlanErrorView =
  | { tone: "limit"; limit: "daily" | "monthly" }
  | { tone: "failure"; op: "draft" | "fix" | "other" }
  | { tone: "notice"; notice: "goalsMonth" | "activeGoals" | "stale" | "used" };

/** UI-SPEC 「常见错误原因 → 界面」: a limit is never shown as a failure card. */
export function planErrorView(error: PlanApiError, op: "draft" | "fix" | "other"): PlanErrorView {
  switch (error.reason) {
    case "AI_LIMIT": return { limit: error.limit === "monthly" ? "monthly" : "daily", tone: "limit" };
    case "GOAL_MONTHLY_LIMIT": return { notice: "goalsMonth", tone: "notice" };
    case "PLAN_GOAL_LIMIT": return { notice: "activeGoals", tone: "notice" };
    case "STALE": return { notice: "stale", tone: "notice" };
    case "FIX_LIMIT":
    case "MANUAL_EDIT_USED":
    case "LADDER_LIMIT": return { notice: "used", tone: "notice" };
    default: return { op, tone: "failure" };
  }
}

/* ---------- 手動編集 ---------- */

export type EditStep = { uid: string; key: string | null; title: string; doneCriteria: string; personTypeKeys: string[] };
export type EditType = { key: string; slot: string; added: boolean };

export function templateIndexOf(kind: PlanGoalKindRead, slot: string): number {
  if (!isGoalKind(kind)) return 99;
  const index = PLAN_GOAL_TEMPLATES[kind].slots.findIndex((item) => item.slot === slot);
  return index === -1 ? 99 : index;
}

/** The draft's person types + the event block as allocation slots (nothing earned yet). */
export function allocationSlotsOf(kind: PlanGoalKindRead, content: Pick<PlanV2Content, "personTypes" | "event">): PlanAllocationSlot[] {
  return [
    ...content.personTypes.map((type) => ({ allocation: type.allocation, earnedBase: 0, key: type.key, metCount: 0, skipped: false, targetCount: type.targetCount, templateIndex: templateIndexOf(kind, type.slot) })),
    { allocation: content.event.allocation, earnedBase: 0, isEvent: true, key: PLAN_EVENT_SLOT, metCount: 0, skipped: false, targetCount: content.event.targetCount, templateIndex: templateIndexOf(kind, PLAN_EVENT_SLOT) },
  ];
}

export function totalOf(slots: readonly PlanAllocationSlot[]): number {
  return slots.reduce((sum, slot) => sum + slot.allocation, 0);
}

export function isFullTotal(slots: readonly PlanAllocationSlot[]): boolean {
  return totalOf(slots) === PLAN_ALLOCATION_TOTAL;
}

/** Unused (non-event) slots of the goal's template, for 「タイプを追加」. */
export function unusedTemplateSlots(kind: PlanGoalKindRead, usedSlots: readonly string[]) {
  if (!isGoalKind(kind)) return [];
  return PLAN_GOAL_TEMPLATES[kind].slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT && !usedSlots.includes(slot.slot));
}

export function unitsOf(allocation: number, targetCount: number): { even: true; points: number } | { even: false; points: number; last: number } {
  const units = unitPoints(allocation, targetCount);
  const first = units[0] ?? 0;
  const last = units[units.length - 1] ?? 0;
  return first === last ? { even: true, points: first } : { even: false, last, points: first };
}

export type EditChange =
  | { kind: "name"; anchor: string; n: number; from: string; to: string }
  | { kind: "done"; anchor: string; n: number }
  | { kind: "order"; anchor: string; title: string; from: number; to: number }
  | { kind: "addStep"; anchor: string; title: string }
  | { kind: "removeStep"; anchor: string; title: string }
  | { kind: "points"; anchor: string; type: string; from: number; to: number }
  | { kind: "count"; anchor: string; type: string; from: number; to: number; allocation: number }
  | { kind: "addType"; anchor: string; type: string }
  | { kind: "removeType"; anchor: string; type: string };

/**
 * 「変更点」 against the AI plan (`draft.content`): names, targets, explicit moves,
 * added / removed steps, points and counts per type, added / removed types.
 */
export function editChanges(input: {
  content: Pick<PlanV2Content, "steps" | "personTypes" | "event">;
  steps: readonly EditStep[];
  moved: ReadonlySet<string>;
  slots: readonly PlanAllocationSlot[];
  typeName: (key: string) => string;
}): EditChange[] {
  const { content, steps, slots, typeName } = input;
  const changes: EditChange[] = [];
  const originIndex = new Map(content.steps.map((step, index) => [step.key, index]));
  steps.forEach((step, index) => {
    const anchor = `plan-edit-step-${step.uid}`;
    if (!step.key) { changes.push({ anchor, kind: "addStep", title: step.title }); return; }
    const origin = content.steps.find((item) => item.key === step.key);
    if (!origin) return;
    if (origin.title !== step.title.trim()) changes.push({ anchor, from: origin.title, kind: "name", n: index + 1, to: step.title.trim() });
    if (origin.doneCriteria !== step.doneCriteria.trim()) changes.push({ anchor, kind: "done", n: index + 1 });
    const from = originIndex.get(step.key)!;
    if (input.moved.has(step.uid) && from !== index) changes.push({ anchor, from: from + 1, kind: "order", title: step.title.trim(), to: index + 1 });
  });
  for (const origin of content.steps) if (!steps.some((step) => step.key === origin.key)) changes.push({ anchor: "plan-edit-steps", kind: "removeStep", title: origin.title });
  const before = new Map<string, { allocation: number; targetCount: number }>([
    ...content.personTypes.map((type) => [type.key, { allocation: type.allocation, targetCount: type.targetCount }] as const),
    [PLAN_EVENT_SLOT, { allocation: content.event.allocation, targetCount: content.event.targetCount }],
  ]);
  for (const slot of slots) {
    const anchor = `plan-edit-type-${slot.key}`;
    const old = before.get(slot.key);
    if (!old) { changes.push({ anchor, kind: "addType", type: typeName(slot.key) }); continue; }
    if (old.allocation !== slot.allocation) changes.push({ anchor, from: old.allocation, kind: "points", to: slot.allocation, type: typeName(slot.key) });
    if (old.targetCount !== slot.targetCount) changes.push({ allocation: slot.allocation, anchor, from: old.targetCount, kind: "count", to: slot.targetCount, type: typeName(slot.key) });
  }
  for (const type of content.personTypes) if (!slots.some((slot) => slot.key === type.key)) changes.push({ anchor: "plan-edit-types", kind: "removeType", type: typeName(type.key) });
  return changes;
}

export function stepsOf(content: Pick<PlanV2Content, "steps">): EditStep[] {
  return content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title, uid: step.key }));
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export const PLAN_STEP_LIMIT = 7;

/* ---------- 三格「flow」と変更のハイライト ---------- */

/** Paths changed in the latest AI revision (`steps.2.title` → step index 2). */
export function changedStepIndexes(draft: Pick<PlanDraftView, "turns">): Set<number> {
  const last = draft.turns[draft.turns.length - 1];
  const indexes = new Set<number>();
  for (const change of last?.changes ?? []) {
    const match = /^steps\.(\d+)\./u.exec(change.path);
    if (match) indexes.add(Number(match[1]));
  }
  return indexes;
}

export function changedTypeKeys(draft: Pick<PlanDraftView, "turns">): Set<string> {
  const last = draft.turns[draft.turns.length - 1];
  const keys = new Set<string>();
  for (const change of last?.changes ?? []) {
    const match = /^personTypes\.([^.]+)/u.exec(change.path);
    if (match) keys.add(match[1]!);
  }
  return keys;
}

/** History chip text: the first 12 characters of what the person wrote. */
export function turnPreview(text: string): string {
  const chars = [...text.trim()];
  return chars.length > 12 ? `${chars.slice(0, 12).join("")}…` : chars.join("");
}
