import assert from "node:assert/strict";
import test from "node:test";

import { RECORD_SYNC_DOMAINS } from "../../features/sync/domain-registry";

test("device note and task domains project the optional memo and plan fields", () => {
  const notes = RECORD_SYNC_DOMAINS.find((domain) => domain.domainId === "notes");
  const tasks = RECORD_SYNC_DOMAINS.find((domain) => domain.domainId === "tasks");
  assert.ok(notes);
  assert.ok(tasks);
  assert.equal(notes.exposure, "device");
  assert.equal(tasks.exposure, "device");
  assert.ok(notes.fields.includes("noteKind"));
  assert.ok(notes.fields.includes("usedForPlan"));
  assert.ok(tasks.fields.includes("planLink"));
});

test("LF5: the tasks domain passes deferralCount through its field whitelist (the offline 2nd-deferral check needs it)", () => {
  const tasks = RECORD_SYNC_DOMAINS.find((domain) => domain.domainId === "tasks");
  assert.ok(tasks?.fields.includes("deferralCount"));
});
