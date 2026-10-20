import assert from "node:assert/strict";
import test from "node:test";

import { computeGuideRealProgress } from "../../shared/compute/guide-real-progress";
import { deriveGuideProgress } from "../../features/guide/progress";

const facts = { completedAt: null, confirmedContacts: 0, grandfathered: false, hasActivePlan: false, relationshipGoal: null, step1Skipped: false };

test("real guide progress follows the existing three-step rules without a demo switch or currentStep", () => {
  const states = [
    facts,
    { ...facts, confirmedContacts: 3 },
    { ...facts, confirmedContacts: 3, relationshipGoal: "会う人を増やす" },
    { ...facts, confirmedContacts: 3, relationshipGoal: "会う人を増やす", hasActivePlan: true },
    { ...facts, step1Skipped: true },
  ];
  for (const state of states) {
    const current = computeGuideRealProgress(state);
    assert.equal(current.kind, "progress");
    if (current.kind === "progress") {
      const legacy = deriveGuideProgress(state);
      assert.deepEqual({ completed: current.completed, nextStep: current.nextStep, steps: current.steps },
        { completed: legacy.completed, nextStep: legacy.nextStep, steps: legacy.steps });
    }
  }
});

test("completed latch and grandfathered actors stay hidden after facts change", () => {
  assert.deepEqual(computeGuideRealProgress({ ...facts, completedAt: "2026-10-20T00:00:00Z" }),
    { kind: "hidden", reason: "completed" });
  assert.deepEqual(computeGuideRealProgress({ ...facts, grandfathered: true }),
    { kind: "hidden", reason: "grandfathered" });
  assert.deepEqual(computeGuideRealProgress({ ...facts, grandfathered: null }), { kind: "unavailable" });
});

test("invalid required facts fail closed instead of showing a false 0/3", () => {
  assert.deepEqual(computeGuideRealProgress({ ...facts, confirmedContacts: Number.NaN }), { kind: "unavailable" });
  assert.deepEqual(computeGuideRealProgress({ ...facts, confirmedContacts: -1 }), { kind: "unavailable" });
});
