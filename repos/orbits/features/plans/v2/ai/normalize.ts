/**
 * AI 方案输出的确定性规整（本机真实调用跑通时加，见 R23 / R25 REPORT「真实 AI 跑通」）：模型出主意，算术由服务端做。
 *
 * 真实 C6 / C9 被拦的主因是算术与引用一致性：配点合计不是 100、Step 引用了方案里没有的类型。这两类是模型不擅长、
 * 规则又唯一确定的事，规整后再走同一套校验器（`checkDraftContent` 等），质量规则一条不放：
 * - Step 的 `personTypeKeys` 只保留方案里存在的类型与 `event`（去重）；
 * - 配点四舍五入到 5 分一档；
 * - 初版（C6，受模板约束）：模型的调整不合「±5、最多 2 处、合计 100」时，整份回到模板配点（提示词本来就要求「拿不准就照抄模板」）；
 * - 修正（C7 / C9）：合计不是 100 时，差额由模型没有改动、未跳过的槽按「配点高的先」5 分一步补齐或扣回，不低于已得与 5 分；
 *   补不齐就原样交给校验器拒绝。模型明确改动的槽和跳过的槽不动。
 */
import { PLAN_ALLOCATION_STEP, PLAN_ALLOCATION_TOTAL } from "../../../../shared/compute/plan-allocation";
import { checkTemplateAdjustment, PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES } from "../../../../shared/compute/plan-templates";
import type { PlanGoalKind } from "../../../../shared/contract/plan-v2";
import { citationMarkerIssues } from "../validate-content";
import type { DraftOutput } from "./types";

/** 修正里不许改的人物类型字段（与 `disallowedChangeIssues` 同一清单）。 */
const FROZEN_TYPE_FIELDS = ["shortLabelId", "questions", "countRule", "recognizeHints", "persona", "opener", "introRoutes", "primaryIndustryId"] as const;

/**
 * 宽进：模型有时把整份输入回显成 `revised`（方案在 `revised.current` 里，真实 C9 第 1 轮 3 次都是这样）。
 * `revised` 本身没有方案字段、而 `revised.current` 有时取出来；其余情况原样交给 zod。
 */
export function unwrapRevised(revised: unknown): unknown {
  if (!revised || typeof revised !== "object") return revised;
  const record = revised as Record<string, unknown>;
  if ("personTypes" in record || "steps" in record) return revised;
  const inner = record.current;
  return inner && typeof inner === "object" && "personTypes" in (inner as Record<string, unknown>) ? inner : revised;
}

/**
 * 修正（C7 / C9）：不许改的部分由服务端还原成修正前的值（结果与「不许改」一致）；見立て / 結論若违反「没有 ① 的句子不写数字」，
 * 退回修正前已通过校验的原文。类型的增删不在这里处理（仍由校验器拒绝）。
 */
function restoreFrozen(draft: DraftOutput, reference: DraftOutput): DraftOutput {
  const before = new Map(reference.personTypes.map((type) => [type.slot, type]));
  const personTypes = draft.personTypes.map((type) => {
    const previous = before.get(type.slot);
    if (!previous) return type;
    const restored = { ...type } as Record<string, unknown>;
    for (const field of FROZEN_TYPE_FIELDS) restored[field] = (previous as unknown as Record<string, unknown>)[field];
    return restored as unknown as DraftOutput["personTypes"][number];
  });
  const citations = reference.citations;
  const diagnosis = citationMarkerIssues(draft.diagnosis, citations.length, "diagnosis").length > 0 ? reference.diagnosis : draft.diagnosis;
  const conclusion = citationMarkerIssues(draft.conclusion, citations.length, "conclusion").length > 0 ? reference.conclusion : draft.conclusion;
  return { ...draft, citations, conclusion, diagnosis, personTypes };
}

export interface DraftNormalizeOptions {
  goalKind: PlanGoalKind;
  /** C6：相对模板调整。 */
  enforceTemplate: boolean;
  /** C7 / C9：修正前的方案（用来判断模型改了哪些槽）。 */
  reference?: DraftOutput;
  /** C9：每槽已得分（key = slot / "event"）与跳过的槽。 */
  earned?: Readonly<Record<string, number>>;
  skippedSlots?: readonly string[];
}

const roundToStep = (value: number) => Math.max(0, Math.round(value / PLAN_ALLOCATION_STEP) * PLAN_ALLOCATION_STEP);

function allocationsOf(draft: DraftOutput): Map<string, number> {
  return new Map([...draft.personTypes.map((type) => [type.slot, type.allocation] as const), [PLAN_EVENT_SLOT, draft.event.allocation] as const]);
}

function withAllocations(draft: DraftOutput, allocations: ReadonlyMap<string, number>): DraftOutput {
  return {
    ...draft,
    event: { ...draft.event, allocation: allocations.get(PLAN_EVENT_SLOT) ?? draft.event.allocation },
    personTypes: draft.personTypes.map((type) => ({ ...type, allocation: allocations.get(type.slot) ?? type.allocation })),
  };
}

const totalOf = (allocations: ReadonlyMap<string, number>) => [...allocations.values()].reduce((sum, value) => sum + value, 0);

/** 把 `delta`（100 − 合计）按 5 分一步分给 `donors`（配点高的先），不低于各自的下限。返回是否补齐。 */
function rebalance(allocations: Map<string, number>, donors: readonly string[], floors: ReadonlyMap<string, number>, delta: number): boolean {
  let remaining = delta;
  for (let guard = 0; remaining !== 0 && guard < 100; guard += 1) {
    const order = [...donors].sort((left, right) => (allocations.get(right) ?? 0) - (allocations.get(left) ?? 0));
    let moved = false;
    for (const key of order) {
      if (remaining === 0) break;
      const value = allocations.get(key) ?? 0;
      if (remaining < 0 && value - PLAN_ALLOCATION_STEP < (floors.get(key) ?? PLAN_ALLOCATION_STEP)) continue;
      const step = remaining > 0 ? PLAN_ALLOCATION_STEP : -PLAN_ALLOCATION_STEP;
      allocations.set(key, value + step);
      remaining -= step;
      moved = true;
    }
    if (!moved) return false;
  }
  return remaining === 0;
}

export function normalizeDraftOutput(draft: DraftOutput, options: DraftNormalizeOptions): DraftOutput {
  const keys = new Set(draft.personTypes.map((type) => type.slot));
  const steps = draft.steps.map((step) => ({ ...step, personTypeKeys: [...new Set(step.personTypeKeys.filter((key) => key === PLAN_EVENT_SLOT || keys.has(key)))] }));
  let next: DraftOutput = { ...draft, steps };
  if (options.reference && !options.enforceTemplate) next = restoreFrozen(next, options.reference);
  const allocations = new Map([...allocationsOf(next)].map(([key, value]) => [key, roundToStep(value)] as const));

  if (options.enforceTemplate) {
    const template = PLAN_GOAL_TEMPLATES[options.goalKind];
    const record = Object.fromEntries(template.slots.map((slot) => [slot.slot, 0]));
    for (const [key, value] of allocations) record[key] = value;
    if (checkTemplateAdjustment(options.goalKind, record).ok !== true) {
      for (const slot of template.slots) if (allocations.has(slot.slot)) allocations.set(slot.slot, slot.allocation);
    }
    return withAllocations(next, allocations);
  }

  const delta = PLAN_ALLOCATION_TOTAL - totalOf(allocations);
  if (delta !== 0) {
    const before = options.reference ? allocationsOf(options.reference) : new Map<string, number>();
    const skipped = new Set(options.skippedSlots ?? []);
    const floors = new Map([...allocations.keys()].map((key) => [key, Math.max(PLAN_ALLOCATION_STEP, options.earned?.[key] ?? 0)] as const));
    const untouched = [...allocations.keys()].filter((key) => !skipped.has(key) && before.has(key) && before.get(key) === allocations.get(key));
    const working = new Map(allocations);
    // 只动模型没改的槽：拿模型改过的槽补差额等于悄悄撤销用户要的改动，补不齐就交给校验器拒绝（修复重试会带上原因）。
    if (rebalance(working, untouched, floors, delta)) return withAllocations(next, working);
  }
  next = withAllocations(next, allocations);
  return next;
}
