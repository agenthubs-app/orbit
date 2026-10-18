import assert from "node:assert/strict";
import test from "node:test";

import { parseOfflineMutation } from "../src/api/schema/offline-mutations";

const createdAt = "2026-10-18T00:00:00.000Z";
const entityId = "local:123e4567-e89b-42d3-a456-426614174000";

test("App strict outbox parses event mentions and memo fields", () => {
  const parsed = parseOfflineMutation({
    mutationId: "note:event", kind: "note", entityId, operation: "create", baseRevision: null, createdAt,
    patch: {
      body: "At @Launch", noteKind: "meeting", usedForPlan: true,
      mentions: [{ entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" }],
    },
  });
  assert.deepEqual(parsed.patch, {
    body: "At @Launch", noteKind: "meeting", usedForPlan: true,
    mentions: [{ entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" }],
  });
});

test("App strict outbox parses planLink while preserving older task patches", () => {
  const base = { mutationId: "task:plan", kind: "task", entityId, operation: "create", baseRevision: null, createdAt };
  const parsed = parseOfflineMutation({ ...base, patch: { title: "Follow up", category: "work", planLink: { planId: "plan:1", typeItemId: "type:1" } } });
  assert.deepEqual(parsed.patch, { title: "Follow up", category: "work", planLink: { planId: "plan:1", typeItemId: "type:1" } });
  const old = parseOfflineMutation({ ...base, patch: { title: "Old", category: "work" } });
  assert.deepEqual(old.patch, { title: "Old", category: "work" });
});

test("App can queue a stored future mention on update, but cannot create a new future token", () => {
  const future = { entityType: "future", futureId: "future:1", start: 0, end: 4, displayText: "Note" };
  const update = { mutationId: "note:future", kind: "note", entityId: "note:existing", operation: "update", baseRevision: "revision:1", createdAt };
  assert.deepEqual(parseOfflineMutation({ ...update, patch: { body: "Note for later", mentions: [future] } }).patch, { body: "Note for later", mentions: [future] });
  assert.throws(() => parseOfflineMutation({ ...update, entityId, operation: "create", baseRevision: null, patch: { body: "Note for later", mentions: [future] } }));
});
