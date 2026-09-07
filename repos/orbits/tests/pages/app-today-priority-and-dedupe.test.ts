import assert from "node:assert/strict";
import test from "node:test";

import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import { __internal } from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";

test("Today shows at most five decisions and one card per named contact", () => {
  const base = agentLedgerEntryFixtures.find(
    (entry) => entry.status === "awaiting_confirmation",
  );
  assert.ok(base);

  const entries = Array.from({ length: 8 }, (_, index) => ({
    ...base,
    contactName: index < 2 ? "Same Person" : `Person ${index}`,
    entryId: `decision-${index}`,
    updatedAt: new Date(Date.UTC(2026, 7, 19, index)).toISOString(),
  }));
  const visible = __internal.visibleDecisionEntries(
    entries,
    null,
    Date.UTC(2026, 7, 19),
  );

  assert.equal(visible.length, 5);
  assert.ok(
    visible.filter((entry) => entry.contactName === "Same Person").length <= 1,
  );
});

test("an explicit Today deep link remains visible even below the normal cutoff", () => {
  const base = agentLedgerEntryFixtures.find(
    (entry) => entry.status === "awaiting_confirmation",
  );
  assert.ok(base);

  const entries = Array.from({ length: 7 }, (_, index) => ({
    ...base,
    contactName: `Person ${index}`,
    entryId: `decision-${index}`,
    updatedAt: new Date(Date.UTC(2026, 7, 19, index)).toISOString(),
  }));
  const visible = __internal.visibleDecisionEntries(
    entries,
    "decision-0",
    Date.UTC(2026, 7, 19),
  );

  assert.ok(visible.some((entry) => entry.entryId === "decision-0"));
});
