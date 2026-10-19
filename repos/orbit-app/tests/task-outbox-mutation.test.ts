import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineTaskMutation, isOfflineRelationshipFollowupMutation, isOfflineTaskCategory, parseOfflineTaskRequest } from "../src/data/sync/task-outbox-mutation";

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
    requestBody: { title: "Follow up", category: "relationship", idempotencyKey: "task-create-2" }, createdAt,
  }));
  assert.throws(() => buildOfflineTaskMutation({
    mutationId: "task-create-3", entityId: localId, operation: "create", baseRevision: null,
    requestBody: { title: "Wrong receipt", category: "personal", idempotencyKey: "not-task-create-3" }, createdAt,
  }));
});

test("planLink survives the frozen task outbox request and explicit unlink survives update", () => {
  const planLink = { planId: "plan:mine", typeItemId: "type:mine" };
  const created = buildOfflineTaskMutation({ mutationId: "task-plan-create", entityId: localId,
    operation: "create", baseRevision: null, createdAt,
    requestBody: { title: "会う準備", category: "work", planLink, idempotencyKey: "task-plan-create" } });
  assert.deepEqual(parseOfflineTaskRequest(created).mutation.patch.planLink, planLink);
  assert.deepEqual((JSON.parse(created.requestJson!) as Record<string, unknown>).planLink, planLink);
  const unlinked = buildOfflineTaskMutation({ mutationId: "task-plan-unlink", entityId: "task:server",
    operation: "update", baseRevision: "rev:1", createdAt,
    requestBody: { action: "update", expectedUpdatedAt: createdAt,
      idempotencyKey: "task-plan-unlink", patch: { planLink: null } } });
  assert.equal(parseOfflineTaskRequest(unlinked).mutation.patch.planLink, null);
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

test("D6 still forbids relationship, meeting and event task creation offline", () => {
  for (const category of ["personal", "work", "other"]) {
    const mutationId = `task-create-${category}`;
    const mutation = buildOfflineTaskMutation({ mutationId, entityId: localId, operation: "create", baseRevision: null,
      requestBody: { title: `${category} task`, category, idempotencyKey: mutationId }, createdAt });
    assert.equal(parseOfflineTaskRequest(mutation).mutation.patch.category, category);
    assert.equal(isOfflineTaskCategory(category), true);
  }
  for (const category of ["relationship", "meeting", "event", undefined, ""]) {
    assert.equal(isOfflineTaskCategory(category), false);
    assert.throws(() => buildOfflineTaskMutation({ mutationId: "task-create-x", entityId: localId, operation: "create", baseRevision: null,
      requestBody: { title: "Online only", ...(category === undefined ? {} : { category }), idempotencyKey: "task-create-x" }, createdAt }));
  }
});

test("R20a narrow relationship follow-up exception never admits lifecycle, rename, or a backwards date", () => {
  const task = { category: "relationship", kind: "task", status: "open", plannedDate: "2026-10-18" };
  assert.equal(isOfflineRelationshipFollowupMutation(task, "complete", {}), true);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "update", { plannedDate: "2026-10-19" }), true);
  assert.equal(isOfflineRelationshipFollowupMutation({ ...task, kind: "lifecycle" }, "complete", {}), false);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "update", { plannedDate: "2026-10-17" }), false);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "update", { title: "Changed" }), false);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "delete", {}), false);
});

test("an existing event task with a contact can complete or move later offline but cannot be renamed", () => {
  const task = { kind: "task", category: "event", relatedContactId: "contact:1", status: "open",
    plannedDate: "2026-10-18", deletedAt: null };
  assert.equal(isOfflineRelationshipFollowupMutation(task, "complete", {}), true);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "update", { plannedDate: "2026-10-19" }), true);
  assert.equal(isOfflineRelationshipFollowupMutation(task, "update", { title: "Changed" }), false);
  assert.equal(isOfflineRelationshipFollowupMutation({ ...task, relatedContactId: null }, "complete", {}), false);
  assert.equal(isOfflineRelationshipFollowupMutation({ ...task, status: "completed" }, "complete", {}), false);
});
