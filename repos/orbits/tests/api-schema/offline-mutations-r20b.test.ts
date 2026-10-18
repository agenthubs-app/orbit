import assert from "node:assert/strict";
import test from "node:test";

import { parseOfflineMutation } from "../../shared/api-schema/offline-mutations";

const createdAt = "2026-10-18T00:00:00.000Z";
const localId = "local:123e4567-e89b-42d3-a456-426614174000";

test("offline note accepts an event mention without a contact ID and the optional memo fields", () => {
  const mutation = parseOfflineMutation({
    mutationId: "note:event", kind: "note", entityId: localId, operation: "create",
    baseRevision: null, createdAt,
    patch: {
      body: "At @Launch", noteKind: "meeting", usedForPlan: true,
      mentions: [{ entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" }],
    },
  });
  assert.deepEqual(mutation.patch, {
    body: "At @Launch", noteKind: "meeting", usedForPlan: true,
    mentions: [{ entityType: "event", eventId: "event:launch", start: 3, end: 10, displayText: "@Launch" }],
  });
});

test("offline task accepts an optional plan link without changing older task payloads", () => {
  const mutation = parseOfflineMutation({
    mutationId: "task:plan", kind: "task", entityId: localId, operation: "create",
    baseRevision: null, createdAt,
    patch: { title: "Follow up", category: "work", planLink: { planId: "plan:1", typeItemId: "type:1" } },
  });
  assert.deepEqual(mutation.patch, {
    title: "Follow up", category: "work", planLink: { planId: "plan:1", typeItemId: "type:1" },
  });
  const old = parseOfflineMutation({
    mutationId: "task:old", kind: "task", entityId: localId, operation: "create",
    baseRevision: null, createdAt, patch: { title: "Old task", category: "work" },
  });
  assert.deepEqual(old.patch, { title: "Old task", category: "work" });
});

test("offline mention branches and plan links reject mismatched or extra identifiers", () => {
  const patch = (mention: Record<string, unknown>) => ({
    mutationId: "note:invalid", kind: "note", entityId: localId, operation: "create",
    baseRevision: null, createdAt, patch: { body: "@Launch", mentions: [mention] },
  });
  assert.throws(() => parseOfflineMutation(patch({ entityType: "event", contactId: "contact:1", eventId: "event:1", start: 0, end: 7, displayText: "@Launch" })));
  assert.throws(() => parseOfflineMutation(patch({ entityType: "contact", eventId: "event:1", start: 0, end: 7, displayText: "@Launch" })));
  assert.throws(() => parseOfflineMutation(patch({ entityType: "event", eventId: "event:1", start: 0, end: 8, displayText: "@Launch" })));
  assert.throws(() => parseOfflineMutation({
    ...patch({ contactId: "contact:1", start: 0, end: 7, displayText: "@Launch" }),
    patch: {
      body: "@Launch", mentions: [
        { contactId: "contact:1", start: 0, end: 7, displayText: "@Launch" },
        { entityType: "event", eventId: "event:1", start: 0, end: 7, displayText: "@Launch" },
      ],
    },
  }));
  assert.throws(() => parseOfflineMutation({
    mutationId: "task:invalid", kind: "task", entityId: localId, operation: "create",
    baseRevision: null, createdAt,
    patch: { title: "Bad", category: "work", planLink: { planId: "plan:1", typeItemId: "type:1", actorId: "actor:other" } },
  }));
});

test("legacy contact mention and explicit plan unlink retain their wire shapes", () => {
  const legacy = parseOfflineMutation({
    mutationId: "note:legacy", kind: "note", entityId: localId, operation: "create",
    baseRevision: null, createdAt,
    patch: { body: "@Ada", mentions: [{ contactId: "contact:ada", start: 0, end: 4, displayText: "@Ada" }] },
  });
  assert.deepEqual(legacy.patch, { body: "@Ada", mentions: [{ contactId: "contact:ada", start: 0, end: 4, displayText: "@Ada" }] });
  const unlink = parseOfflineMutation({
    mutationId: "task:unlink", kind: "task", entityId: "task:1", operation: "update",
    baseRevision: "revision:1", createdAt, patch: { planLink: null },
  });
  assert.deepEqual(unlink.patch, { planLink: null });
});

test("an update can carry a future token unchanged for server validation, but create cannot forge one", () => {
  const future = { entityType: "future", futureId: "future:1", start: 0, end: 4, displayText: "Note" };
  const base = { mutationId: "note:future", kind: "note", entityId: "note:existing", operation: "update", baseRevision: "revision:1", createdAt };
  const updated = parseOfflineMutation({ ...base, patch: { body: "Note for later", mentions: [future] } });
  assert.deepEqual(updated.patch, { body: "Note for later", mentions: [future] });
  assert.throws(() => parseOfflineMutation({ ...base, entityId: localId, operation: "create", baseRevision: null, patch: { body: "Note for later", mentions: [future] } }));
});
