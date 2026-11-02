/**
 * R36a：初版 v3 页上的调整态（删一类 / 人数 ± / 分量 ±5）与合计。合计与合法性用 `shared/compute/plan-allocation` 的
 * `validateAllocations`（与服务端 `confirm` 带 `adjustments` 时同一函数），不自己算规则。调整只存在客户端；确定时
 * `adjustmentsOf` 把它变成 `PlanDraftConfirmAdjustments`（没动过就是 undefined，请求不带字段）。
 */
import { PLAN_ALLOCATION_STEP, PLAN_ALLOCATION_TOTAL, PLAN_TYPE_TARGET_MAX, validateAllocations, type PlanAllocationError, type PlanAllocationSlot } from "../../../../../shared/compute/plan-allocation";
import { PLAN_EVENT_SLOT } from "../../../../../shared/compute/plan-templates";
import type { PlanDraftConfirmAdjustments, PlanDraftView, PlanV2Content } from "../../../../../shared/contract/plan-v2";
import { allocationSlotsOf } from "./plan-model";

/** 字段表：分量 5 一档、5–50。 */
export const DRAFT_V3_POINTS_MIN = PLAN_ALLOCATION_STEP;
export const DRAFT_V3_POINTS_MAX = 50;
export const DRAFT_V3_COUNT_MIN = 1;
export const DRAFT_V3_COUNT_MAX = PLAN_TYPE_TARGET_MAX;

export interface DraftV3TypeAdjust {
  targetCount: number;
  allocation: number;
  /** false = 已删（行仍显示、不计入合计、可恢复）。 */
  on: boolean;
}

export type DraftV3Adjust = Readonly<Record<string, DraftV3TypeAdjust>>;

export function initialAdjust(content: Pick<PlanV2Content, "personTypes">): DraftV3Adjust {
  return Object.fromEntries(content.personTypes.map((type) => [type.key, { allocation: type.allocation, on: true, targetCount: type.targetCount }]));
}

/** 这一类被动过（人数或分量和初版不同）。 */
export function typeChanged(content: Pick<PlanV2Content, "personTypes">, adjust: DraftV3Adjust, key: string): boolean {
  const type = content.personTypes.find((item) => item.key === key);
  const state = adjust[key];
  return Boolean(type && state && (state.allocation !== type.allocation || state.targetCount !== type.targetCount));
}

export function setCount(adjust: DraftV3Adjust, key: string, delta: number): DraftV3Adjust {
  const state = adjust[key];
  if (!state) return adjust;
  const next = Math.min(DRAFT_V3_COUNT_MAX, Math.max(DRAFT_V3_COUNT_MIN, state.targetCount + delta));
  return { ...adjust, [key]: { ...state, targetCount: next } };
}

export function setPoints(adjust: DraftV3Adjust, key: string, delta: number): DraftV3Adjust {
  const state = adjust[key];
  if (!state) return adjust;
  const next = Math.min(DRAFT_V3_POINTS_MAX, Math.max(DRAFT_V3_POINTS_MIN, state.allocation + delta));
  return { ...adjust, [key]: { ...state, allocation: next } };
}

export function toggleType(adjust: DraftV3Adjust, key: string): DraftV3Adjust {
  const state = adjust[key];
  if (!state) return adjust;
  return { ...adjust, [key]: { ...state, on: !state.on } };
}

export function onTypes(content: Pick<PlanV2Content, "personTypes">, adjust: DraftV3Adjust) {
  return content.personTypes.filter((type) => adjust[type.key]?.on !== false);
}

/** 调整后的内容（只剩留下的类型，带调整后的数字），交给 `allocationSlotsOf` → `validateAllocations`。 */
export function adjustedContent(content: Pick<PlanV2Content, "personTypes" | "event">, adjust: DraftV3Adjust): Pick<PlanV2Content, "personTypes" | "event"> {
  return {
    event: content.event,
    personTypes: onTypes(content, adjust).map((type) => ({ ...type, allocation: adjust[type.key]?.allocation ?? type.allocation, targetCount: adjust[type.key]?.targetCount ?? type.targetCount })),
  };
}

export function adjustSlots(draft: Pick<PlanDraftView, "goalKind" | "content" | "slotState">, adjust: DraftV3Adjust): PlanAllocationSlot[] {
  return allocationSlotsOf(draft.goalKind, adjustedContent(draft.content, adjust), draft.slotState ?? []);
}

/** 合计 = 留下的类型分量 + イベント枠（与 `validateAllocations` 求和的是同一组槽）。 */
export function adjustTotal(draft: Pick<PlanDraftView, "goalKind" | "content" | "slotState">, adjust: DraftV3Adjust): number {
  return adjustSlots(draft, adjust).reduce((sum, slot) => sum + slot.allocation, 0);
}

export function adjustCheck(draft: Pick<PlanDraftView, "goalKind" | "content" | "slotState">, adjust: DraftV3Adjust): { ok: true } | { ok: false; error: PlanAllocationError } {
  if (onTypes(draft.content, adjust).length === 0) return { error: "total_not_100", ok: false };
  const result = validateAllocations(adjustSlots(draft, adjust));
  return result.ok === false ? { error: result.error, ok: false } : { ok: true };
}

export const isFull = (total: number) => total === PLAN_ALLOCATION_TOTAL;

/** 确定时随请求带的调整；没删、没改数字时返回 undefined（请求体不带 `adjustments`，和改前逐字节相同）。 */
export function adjustmentsOf(draft: Pick<PlanDraftView, "content" | "revision">, adjust: DraftV3Adjust): PlanDraftConfirmAdjustments | undefined {
  const touched = draft.content.personTypes.some((type) => adjust[type.key]?.on === false || typeChanged(draft.content, adjust, type.key));
  if (!touched) return undefined;
  return {
    event: { allocation: draft.content.event.allocation, targetCount: draft.content.event.targetCount },
    expectedRevision: draft.revision,
    personTypes: onTypes(draft.content, adjust).map((type) => ({ allocation: adjust[type.key]!.allocation, key: type.key, targetCount: adjust[type.key]!.targetCount })),
  };
}

/** 类型按所属阶段（`stepKey`）分组，阶段顺序照 `steps`；没有 `stepKey` 或指向不存在阶段的类型排在最后一组（无阶段头）。 */
export function groupTypesByStep(content: Pick<PlanV2Content, "steps" | "personTypes">): Array<{ stepIndex: number | null; types: PlanV2Content["personTypes"] }> {
  const groups: Array<{ stepIndex: number | null; types: PlanV2Content["personTypes"][number][] }> = [];
  const indexOf = (key: string | null | undefined) => {
    if (!key) return null;
    const at = content.steps.findIndex((step) => step.key === key);
    return at < 0 ? null : at;
  };
  for (const type of content.personTypes) {
    const stepIndex = indexOf(type.stepKey);
    const last = groups[groups.length - 1];
    if (last && last.stepIndex === stepIndex) last.types.push(type);
    else groups.push({ stepIndex, types: [type] });
  }
  return groups;
}

export { PLAN_EVENT_SLOT };
