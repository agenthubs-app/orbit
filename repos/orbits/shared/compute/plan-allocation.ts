/**
 * R22 计划 v2.2 的配点回流（DESIGN §4.3，手動編集 / 見直し / 移除类型共用，两端同一份）。
 *
 * - 配点 5 分一档，全部类型 + イベント枠合计 100；
 * - 改一个类型的配点时，差额按 5 分一步，从配点高的类型依次（同分按模板顺序）扣 / 加，
 *   排在后面的轮到再回到第一个（b10 ⑥：移除 C 15 点 → A、B、D 各 +5）；
 * - 已跳过的类型不参与回流、也不能改配点；配点不能低于已得的 base 分；
 * - 目标人数不能少于已计入的人数；有得分（或已计入人）的类型不能移除；
 * - 单价 = 配点 ÷ 人数取整，余数给最后 1 人（人数 × 单价之和 = 配点）。
 */

export const PLAN_ALLOCATION_STEP = 5;
export const PLAN_ALLOCATION_TOTAL = 100;
export const PLAN_TYPE_TARGET_MAX = 5;
export const PLAN_EVENT_TARGET_MAX = 10;

export interface PlanAllocationSlot {
  key: string;
  allocation: number;
  targetCount: number;
  /** 模板里的顺序（同分时先轮到小的）。 */
  templateIndex: number;
  /** 已得的 base 分（不含跳过记的分）。 */
  earnedBase: number;
  /** 已计入 base 的人数（含无名字自报）。 */
  metCount: number;
  skipped: boolean;
  /** イベント枠：不能移除，人数上限不同。 */
  isEvent?: boolean;
}

export type PlanAllocationError =
  | "not_multiple_of_step"
  | "below_earned"
  | "skipped_locked"
  | "target_below_met"
  | "target_out_of_range"
  | "cannot_remove_with_points"
  | "cannot_remove_event"
  | "no_room"
  | "unknown_slot"
  | "total_not_100";

export interface PlanAllocationMove {
  key: string;
  from: number;
  to: number;
}

export type PlanAllocationResult =
  | { ok: true; slots: PlanAllocationSlot[]; moves: PlanAllocationMove[] }
  | { ok: false; error: PlanAllocationError; key?: string };

/** 每人的分值：前 n−1 人 = 配点 ÷ 人数取整，最后 1 人补齐余数。 */
export function unitPoints(allocation: number, targetCount: number): number[] {
  if (targetCount <= 0) return [];
  const unit = Math.floor(allocation / targetCount);
  return Array.from({ length: targetCount }, (_, index) => (index === targetCount - 1 ? allocation - unit * (targetCount - 1) : unit));
}

/** 整体校验：5 分一档、合计 100、人数在范围内、不低于已得。 */
export function validateAllocations(slots: readonly PlanAllocationSlot[]): PlanAllocationResult {
  let total = 0;
  for (const slot of slots) {
    if (slot.allocation < 0 || slot.allocation % PLAN_ALLOCATION_STEP !== 0) return { error: "not_multiple_of_step", key: slot.key, ok: false };
    if (slot.allocation < slot.earnedBase && !slot.skipped) return { error: "below_earned", key: slot.key, ok: false };
    const max = slot.isEvent ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX;
    if (slot.targetCount < 1 || slot.targetCount > max) return { error: "target_out_of_range", key: slot.key, ok: false };
    if (slot.targetCount < slot.metCount) return { error: "target_below_met", key: slot.key, ok: false };
    total += slot.allocation;
  }
  if (total !== PLAN_ALLOCATION_TOTAL) return { error: "total_not_100", ok: false };
  return { moves: [], ok: true, slots: slots.map((slot) => ({ ...slot })) };
}

/** 回流的轮转顺序：配点高的先，同分按模板顺序。 */
function donorOrder(slots: readonly PlanAllocationSlot[], exclude: string): PlanAllocationSlot[] {
  return slots
    .filter((slot) => slot.key !== exclude && !slot.skipped)
    .sort((left, right) => right.allocation - left.allocation || left.templateIndex - right.templateIndex);
}

function distribute(slots: PlanAllocationSlot[], exclude: string, delta: number): PlanAllocationError | null {
  // delta > 0：把这些分加给其他类型；delta < 0：从其他类型扣。
  const order = donorOrder(slots, exclude);
  let remaining = Math.abs(delta);
  let guard = 0;
  while (remaining > 0) {
    let movedThisRound = false;
    for (const candidate of order) {
      if (remaining === 0) break;
      const slot = slots.find((item) => item.key === candidate.key)!;
      if (delta < 0 && slot.allocation - PLAN_ALLOCATION_STEP < slot.earnedBase) continue;
      slot.allocation += delta > 0 ? PLAN_ALLOCATION_STEP : -PLAN_ALLOCATION_STEP;
      remaining -= PLAN_ALLOCATION_STEP;
      movedThisRound = true;
    }
    guard += 1;
    if (!movedThisRound || guard > 100) return "no_room";
  }
  return null;
}

function movesBetween(before: readonly PlanAllocationSlot[], after: readonly PlanAllocationSlot[]): PlanAllocationMove[] {
  return after.flatMap((slot) => {
    const old = before.find((item) => item.key === slot.key);
    return old && old.allocation !== slot.allocation ? [{ from: old.allocation, key: slot.key, to: slot.allocation }] : [];
  });
}

/** 改一个类型的配点；差额从其他类型回流，合计保持 100。 */
export function changeAllocation(slots: readonly PlanAllocationSlot[], key: string, allocation: number): PlanAllocationResult {
  const before = slots.map((slot) => ({ ...slot }));
  const working = slots.map((slot) => ({ ...slot }));
  const target = working.find((slot) => slot.key === key);
  if (!target) return { error: "unknown_slot", key, ok: false };
  if (target.skipped) return { error: "skipped_locked", key, ok: false };
  if (allocation < 0 || allocation % PLAN_ALLOCATION_STEP !== 0) return { error: "not_multiple_of_step", key, ok: false };
  if (allocation < target.earnedBase) return { error: "below_earned", key, ok: false };
  const delta = allocation - target.allocation;
  target.allocation = allocation;
  if (delta !== 0) {
    const error = distribute(working, key, -delta);
    if (error) return { error, key, ok: false };
  }
  const checked = validateAllocations(working);
  if (!checked.ok) return checked;
  return { moves: movesBetween(before, working), ok: true, slots: working };
}

/** 改一个类型的目标人数（不动配点）。 */
export function changeTargetCount(slots: readonly PlanAllocationSlot[], key: string, targetCount: number): PlanAllocationResult {
  const working = slots.map((slot) => ({ ...slot }));
  const target = working.find((slot) => slot.key === key);
  if (!target) return { error: "unknown_slot", key, ok: false };
  const max = target.isEvent ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX;
  if (targetCount < 1 || targetCount > max) return { error: "target_out_of_range", key, ok: false };
  if (targetCount < target.metCount) return { error: "target_below_met", key, ok: false };
  target.targetCount = targetCount;
  return { moves: [], ok: true, slots: working };
}

/** 移除一个类型；它的配点按 5 分一步回流给其他类型。 */
export function removeSlot(slots: readonly PlanAllocationSlot[], key: string): PlanAllocationResult {
  const before = slots.map((slot) => ({ ...slot }));
  const target = before.find((slot) => slot.key === key);
  if (!target) return { error: "unknown_slot", key, ok: false };
  if (target.isEvent) return { error: "cannot_remove_event", key, ok: false };
  if (target.earnedBase > 0 || target.metCount > 0 || target.skipped) return { error: "cannot_remove_with_points", key, ok: false };
  const working = before.filter((slot) => slot.key !== key).map((slot) => ({ ...slot }));
  const error = distribute(working, key, target.allocation);
  if (error) return { error, key, ok: false };
  const checked = validateAllocations(working);
  if (!checked.ok) return checked;
  return { moves: [...movesBetween(before, working), { from: target.allocation, key, to: 0 }], ok: true, slots: working };
}
