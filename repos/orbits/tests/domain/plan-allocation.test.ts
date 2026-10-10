import assert from "node:assert/strict";
import test from "node:test";

import { changeAllocation, changeTargetCount, removeSlot, validateAllocations, type PlanAllocationSlot } from "../../shared/compute/plan-allocation";

// R22 SC-R22-03（DESIGN §4.3，b10 ⑥ 的例子）：配点回流。
const slot = (key: string, allocation: number, targetCount: number, templateIndex: number, extra: Partial<PlanAllocationSlot> = {}): PlanAllocationSlot =>
  ({ allocation, earnedBase: 0, key, metCount: 0, skipped: false, targetCount, templateIndex, ...extra });

// b10 ⑥：AI 初版之后 A 25 / B 20 / C 15 / D 15 / E 10 / ヘビー 0（已移除）/ イベント 15。
const b10 = (): PlanAllocationSlot[] => [
  slot("A", 25, 5, 0), slot("B", 20, 2, 1), slot("C", 15, 2, 2), slot("D", 15, 3, 3), slot("E", 10, 2, 4), slot("event", 15, 3, 6, { isEvent: true }),
];

test("raising E 10 → 15 takes 5 from the highest allocation (A 25 → 20)", () => {
  const result = changeAllocation(b10(), "E", 15);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.moves, [{ from: 25, key: "A", to: 20 }, { from: 10, key: "E", to: 15 }]);
  assert.equal(result.slots.reduce((sum, item) => sum + item.allocation, 0), 100);
});

test("removing C (15) gives 5 each to A, B and D in turn (b10 ⑥ 外す)", () => {
  const start = changeAllocation(b10(), "E", 15);
  assert.ok(start.ok);
  if (!start.ok) return;
  const result = removeSlot(start.slots, "C");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const after = Object.fromEntries(result.slots.map((item) => [item.key, item.allocation]));
  assert.deepEqual(after, { A: 25, B: 25, D: 20, E: 15, event: 15 });
});

test("ties go by template order", () => {
  const result = changeAllocation([slot("X", 30, 3, 1), slot("Y", 30, 3, 0), slot("Z", 40, 4, 2)], "Z", 45);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(Object.fromEntries(result.slots.map((item) => [item.key, item.allocation])), { X: 30, Y: 25, Z: 45 });
});

test("an allocation must stay a multiple of 5 and not drop below what was earned", () => {
  assert.deepEqual(changeAllocation(b10(), "A", 23), { error: "not_multiple_of_step", key: "A", ok: false });
  const earned = b10().map((item) => (item.key === "A" ? { ...item, earnedBase: 20, metCount: 5 } : item));
  assert.deepEqual(changeAllocation(earned, "A", 15), { error: "below_earned", key: "A", ok: false });
});

test("points are not taken from a type below its earned points", () => {
  const slots = [slot("A", 50, 5, 0, { earnedBase: 50, metCount: 5 }), slot("B", 50, 5, 1)];
  const result = changeAllocation(slots, "B", 55);
  assert.deepEqual(result, { error: "no_room", key: "B", ok: false });
});

test("a skipped type is locked; a type with points cannot be removed; the event block cannot be removed", () => {
  const slots = b10().map((item) => (item.key === "B" ? { ...item, skipped: true } : item.key === "C" ? { ...item, earnedBase: 7, metCount: 1 } : item));
  assert.deepEqual(changeAllocation(slots, "B", 25), { error: "skipped_locked", key: "B", ok: false });
  assert.deepEqual(removeSlot(slots, "C"), { error: "cannot_remove_with_points", key: "C", ok: false });
  assert.deepEqual(removeSlot(slots, "event"), { error: "cannot_remove_event", key: "event", ok: false });
});

test("a skipped type does not receive points when another is removed", () => {
  const slots = [slot("A", 40, 4, 0, { skipped: true }), slot("B", 30, 3, 1), slot("C", 30, 3, 2)];
  const result = removeSlot(slots, "C");
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(Object.fromEntries(result.slots.map((item) => [item.key, item.allocation])), { A: 40, B: 60 });
});

test("target counts: 1–5 for a type, 1–10 for events, never below the people already counted", () => {
  assert.equal(changeTargetCount(b10(), "D", 2).ok, true);
  assert.deepEqual(changeTargetCount(b10(), "D", 6), { error: "target_out_of_range", key: "D", ok: false });
  assert.equal(changeTargetCount(b10(), "event", 8).ok, true);
  const met = b10().map((item) => (item.key === "D" ? { ...item, metCount: 3 } : item));
  assert.deepEqual(changeTargetCount(met, "D", 2), { error: "target_below_met", key: "D", ok: false });
});

test("validateAllocations: the total must be 100", () => {
  assert.equal(validateAllocations(b10()).ok, true);
  assert.deepEqual(validateAllocations([slot("A", 50, 5, 0), slot("B", 45, 5, 1)]), { error: "total_not_100", ok: false });
});
