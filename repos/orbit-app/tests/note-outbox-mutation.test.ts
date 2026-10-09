import assert from "node:assert/strict";
import test from "node:test";

import { buildOfflineNoteMutation } from "../src/data/sync/note-outbox-mutation";

test("offline note create freezes the complete POST body while keeping parser fields separate", () => {
  const requestBody = {
    title: "Offline note", body: "Private body", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: "mutation-create",
  };
  const mutation = buildOfflineNoteMutation({
    mutationId: "mutation-create", entityId: "local:123e4567-e89b-42d3-a456-426614174000",
    operation: "create", baseRevision: null, requestBody, createdAt: "2026-09-28T00:00:00.000Z",
  });
  assert.equal(mutation.domainId, "notes");
  assert.equal(mutation.requestJson, JSON.stringify(requestBody));
  assert.deepEqual(mutation.patch, { title: "Offline note", body: "Private body", manualContactIds: [], mentions: [], eventIds: [] });
});

test("offline note update keeps expected version and idempotency key in the frozen PATCH body", () => {
  const requestBody = { body: "Updated", expectedVersion: 4, idempotencyKey: "mutation-update" };
  const mutation = buildOfflineNoteMutation({
    mutationId: "mutation-update", entityId: "note:canonical", operation: "update", baseRevision: "opaque-r4",
    requestBody, createdAt: "2026-09-28T00:00:00.000Z",
  });
  assert.equal(mutation.requestJson, JSON.stringify(requestBody));
  assert.deepEqual(mutation.patch, { body: "Updated" });
});

test("offline note mutation builder rejects a mismatched receipt ID and unsupported operation", () => {
  assert.throws(() => buildOfflineNoteMutation({
    mutationId: "mutation-1", entityId: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create",
    baseRevision: null, requestBody: { body: "x", idempotencyKey: "other" }, createdAt: "2026-09-28T00:00:00.000Z",
  }));
  assert.throws(() => buildOfflineNoteMutation({
    mutationId: "mutation-1", entityId: "note:canonical", operation: "delete",
    baseRevision: "r1", requestBody: { idempotencyKey: "mutation-1" }, createdAt: "2026-09-28T00:00:00.000Z",
  }));
});
