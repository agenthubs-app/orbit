import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";

/**
 * agent-design AG11: `memory_state: []` is first used by an AG11 gate case (AE-REF-002): the account has no memory entry
 * at the end (the runner reads them after the steps). The forms that name entries need AG14's fields and stay
 * cannot_judge; without the runner's reading the check cannot judge either.
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const obs = (extra: Partial<Observation> = {}): Observation => ({
  account: "A", accounts: { A: "user_a" }, answers: [], businessChanges: [], cards: [], caseId: "AE-REF-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
  fixtureIdOf: () => null, idMap: {}, reads: [], requests: [], unsupported: [], ...extra,
});

test("memory_state: [] passes with no entry, fails with one, cannot judge without the reading or with named entries", () => {
  assert.equal(NOT_YET.memory_state, undefined);
  assert.equal(CHECKS.memory_state([], obs({ memoryAfter: [] }), context).status, "pass");
  const one = CHECKS.memory_state([], obs({ memoryAfter: [{ id: "memory:1" }] }), context);
  assert.deepEqual([one.status, one.detail], ["fail", "1 memory entry at the end: memory:1"]);
  assert.equal(CHECKS.memory_state([], obs(), context).status, "cannot_judge");
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active", revision: 1 }], obs({ memoryAfter: [] }), context).status, "cannot_judge");
});
