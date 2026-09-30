import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineTaskMutation, parseOfflineTaskRequest } from "../src/data/sync/task-outbox-mutation";

const createdAt = "2026-09-20T00:00:00.000Z";
const localId = "local:123e4567-e89b-42d3-a456-426614174000";

test("task outbox freezes a personal create request and validates its receipt key", () => {
  const mutation = buildOfflineTaskMutation({
    mutationId: "task-create-1", entityId: localId, operation: "create", baseRevision: null,
    requestBody: { title: "Renew passport", category: "personal", idempotencyKey: "task-create-1" }, createdAt,
  });
  assert.equal(mutation.domainId, "tasks");
  assert.equal(mutation.kind, "task");
  assert.equal(mutation.requestJson, JSON.stringify({ title: "Renew passport", category: "personal", idempotencyKey: "task-create-1" }));
  assert.deepEqual(parseOfflineTaskRequest(mutation).mutation.patch, { title: "Renew passport", category: "personal" });
  assert.throws(() => buildOfflineTaskMutation({
    mutationId: "task-create-2", entityId: localId, operation: "create", baseRevision: null,
    requestBody: { title: "Work task", category: "work", idempotencyKey: "task-create-2" }, createdAt,
  }));
  assert.throws(() => buildOfflineTaskMutation({
    mutationId: "task-create-3", entityId: localId, operation: "create", baseRevision: null,
    requestBody: { title: "Wrong receipt", category: "personal", idempotencyKey: "not-task-create-3" }, createdAt,
  }));
});

test("task outbox accepts all six task operations and keeps stale-delete versions in the frozen request", () => {
  const actions = ["complete", "reopen", "cancel", "delete"] as const;
  for (const operation of actions) {
    const mutationId = `task-${operation}-1`;
    const requestBody = operation === "delete"
      ? { idempotencyKey: mutationId, expectedUpdatedAt: createdAt }
      : { action: operation, idempotencyKey: mutationId };
    const mutation = buildOfflineTaskMutation({ mutationId, entityId: "task-1", operation, baseRevision: "r1", requestBody, createdAt });
    assert.equal(parseOfflineTaskRequest(mutation).mutation.operation, operation);
  }
  const update = buildOfflineTaskMutation({ mutationId: "task-update-1", entityId: "task-1", operation: "update", baseRevision: "r1",
    requestBody: { action: "update", expectedUpdatedAt: createdAt, idempotencyKey: "task-update-1", patch: { location: null } }, createdAt });
  assert.equal((JSON.parse(update.requestJson!) as Record<string, unknown>).expectedUpdatedAt, createdAt);
  assert.throws(() => parseOfflineTaskRequest({ ...update, requestJson: JSON.stringify({ ...JSON.parse(update.requestJson!), idempotencyKey: "different-receipt" }) }));
});
