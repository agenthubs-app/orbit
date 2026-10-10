import assert from "node:assert/strict";
import test from "node:test";

import { canConfirmManualMemo, defaultProposalSlots, eventRingTone, groupPending, mailtoHref, segmentKinds, shiftSlot, typePace, typeState } from "../src/screens/plan/plan-overview-model";

// R24: the pure rules behind the plan overview and the person-type page.
test("segment kinds: solid, striped (skipped), overflow and the grey rest", () => {
  const base = { emoji: "", shortLabel: "", allocation: 10, earned: 0, overflow: 0, skipped: false };
  assert.deepEqual(segmentKinds([{ ...base, key: "a", earned: 5 }]), { overflow: false, rest: true, solid: true, striped: false });
  assert.deepEqual(segmentKinds([{ ...base, key: "b", earned: 10, skipped: true }, { ...base, key: "c", earned: 10, overflow: 5 }]), { overflow: true, rest: false, solid: true, striped: true });
});

test("type pace reads people and the next award from the segment (remainder to the last person, half beyond target)", () => {
  assert.deepEqual(typePace(15, 2, 7, false), { firstUnit: 7, lastUnit: 8, met: 1, next: 8, nextPart: "base", target: 2 });
  assert.deepEqual(typePace(20, 2, 20, false), { firstUnit: 10, lastUnit: 10, met: 2, next: 5, nextPart: "overflow", target: 2 });
  assert.equal(typePace(10, 1, 10, true).nextPart, "none");
});

test("type state, ring tone, pending grouping, manual memo rule", () => {
  assert.equal(typeState({ skipped: true, candidates: [{}] as never }), "skipped");
  assert.equal(typeState({ skipped: false, candidates: [] }), "none");
  assert.deepEqual([eventRingTone(70), eventRingTone(50), eventRingTone(49)], ["deep", "mid", "rose"]);
  const item = (id: string, kind: string) => ({ id, kind, planId: "p", itemId: null, title: "", detail: null, createdAt: "" }) as never;
  const grouped = groupPending([item("step:p:s:2", "step_suggestion"), item("c1", "candidate"), item("c2", "candidate"), item("c3", "candidate"), item("c4", "candidate"), item("m", "memo_coverage")]);
  assert.equal(grouped.steps.get("s:2")?.id, "step:p:s:2");
  assert.equal(grouped.candidates.length, 3);
  assert.equal(grouped.memo.length, 1);
  assert.equal(canConfirmManualMemo([0]), false);
  assert.equal(canConfirmManualMemo([0, 2]), true);
});

test("proposal slots: three weekdays ahead; shifts stay in the future and inside 7:00–22:00", () => {
  const friday = new Date(2026, 9, 9, 12, 0);
  const slots = defaultProposalSlots(friday);
  assert.deepEqual(slots.map((slot) => [slot.getDate(), slot.getHours(), slot.getMinutes()]), [[12, 10, 0], [13, 16, 0], [14, 9, 30]]);
  assert.equal(shiftSlot(new Date(2026, 9, 12, 22, 0), "time", 1, friday).getHours(), 22);
  assert.equal(shiftSlot(new Date(2026, 9, 10, 10, 0), "day", -1, friday).getDate(), 10, "never into the past");
  assert.equal(mailtoHref("件名", "本文 & more"), "mailto:?subject=%E4%BB%B6%E5%90%8D&body=%E6%9C%AC%E6%96%87%20%26%20more");
});
