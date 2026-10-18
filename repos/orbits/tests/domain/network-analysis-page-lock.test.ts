import assert from "node:assert/strict";
import test from "node:test";

import { NETWORK_ANALYSIS_MIN_CONTACTS, analysisThreshold } from "../../features/network-analysis/analysis-threshold";
import { NETWORK_ANALYSIS_STABLE_CONTACTS, NETWORK_ANALYSIS_UNLOCK_CONTACTS, networkAnalysisPageLock } from "../../features/network-analysis/page-lock";
import { NETWORK_ANALYSIS_UNLOCK_CONTACTS as WEB_ENTRY_CONSTANT } from "../../app/(app)/app/orbit-2026/network/network-model";

// R11b SC-03（PLANNER §2 B-1 / B-2）：10 人整页锁，10–29 人「参考値」，30 人起去掉；3 人门槛只管快照。
test("below 10 people the page is locked with the ring progress; 10 opens it", () => {
  assert.equal(NETWORK_ANALYSIS_UNLOCK_CONTACTS, 10);
  assert.deepEqual(networkAnalysisPageLock(0), { state: "locked", total: 0, required: 10, missing: 10 });
  assert.deepEqual(networkAnalysisPageLock(5), { state: "locked", total: 5, required: 10, missing: 5 });
  assert.deepEqual(networkAnalysisPageLock(9), { state: "locked", total: 9, required: 10, missing: 1 });
  assert.deepEqual(networkAnalysisPageLock(10), { state: "open", total: 10, reference: true });
  // Deleting back to 9 locks again: the rule only reads the current total.
  assert.equal(networkAnalysisPageLock(9).state, "locked");
});

test("10–29 people carry 「参考値」; from 30 it goes away (an explanation line, not a second lock)", () => {
  assert.equal(NETWORK_ANALYSIS_STABLE_CONTACTS, 30);
  assert.deepEqual(networkAnalysisPageLock(14), { state: "open", total: 14, reference: true });
  assert.deepEqual(networkAnalysisPageLock(29), { state: "open", total: 29, reference: true });
  assert.deepEqual(networkAnalysisPageLock(30), { state: "open", total: 30, reference: false });
  assert.deepEqual(networkAnalysisPageLock(286), { state: "open", total: 286, reference: false });
});

test("an unreadable count is unknown — never a fake 0-person lock", () => {
  assert.deepEqual(networkAnalysisPageLock(null), { state: "unknown" });
  assert.deepEqual(networkAnalysisPageLock(undefined), { state: "unknown" });
  assert.deepEqual(networkAnalysisPageLock(Number.NaN), { state: "unknown" });
  assert.deepEqual(networkAnalysisPageLock(12.7), { state: "open", total: 12, reference: true });
});

test("the 3-confirmed-contact snapshot threshold and the R11a entry card keep their own meaning", () => {
  assert.equal(NETWORK_ANALYSIS_MIN_CONTACTS, 3);
  assert.deepEqual(analysisThreshold(3), { confirmed: 3, met: true, missing: 0 });
  assert.equal(WEB_ENTRY_CONSTANT, NETWORK_ANALYSIS_UNLOCK_CONTACTS);
});
