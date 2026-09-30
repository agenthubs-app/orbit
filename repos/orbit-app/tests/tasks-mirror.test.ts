import assert from "node:assert/strict";
import test from "node:test";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { overlayQueuedTasks } from "../src/view-models/tasks-mirror";

const actorId = "actor-a";
const serverTask = { id: "task-1", accountId: actorId, ownerUserId: actorId, title: "Original", status: "open" as const, category: "personal" as const,
  priority: "normal" as const, source: "manual" as const, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
function mutation(overrides: Partial<LocalSyncQueuedMutation>): LocalSyncQueuedMutation {
  return { actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: "m1", kind: "task", id: serverTask.id, operation: "update",
    patch: { title: "Local title" }, requestJson: "{}", baseRevision: "r1", dependsOn: null, createdAt: "2026-09-20T00:01:00Z", retryCount: 0,
    nextRetryAt: null, lastErrorCode: null, state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null, ...overrides };
}

test("task mirror overlays edits, state transitions, local creates, and delete intent without mutating server rows", () => {
  const result = overlayQueuedTasks([serverTask], [
    mutation({ mutationId: "update", patch: { title: "Offline edit", location: "Tokyo" } }),
    mutation({ mutationId: "complete", operation: "complete", patch: {}, createdAt: "2026-09-20T00:02:00Z" }),
    mutation({ mutationId: "local-create", id: "local:123e4567-e89b-42d3-a456-426614174000", operation: "create", baseRevision: null,
      patch: { title: "Offline new", category: "personal" }, createdAt: "2026-09-20T00:03:00Z" }),
  ], actorId);
  assert.ok(result);
  assert.equal(result.find(task => task.id === "task-1")?.status, "completed");
  assert.equal(result.find(task => task.id === "task-1")?.title, "Offline edit");
  assert.equal(result.find(task => task.id.startsWith("local:"))?.title, "Offline new");
  assert.equal(serverTask.title, "Original");
  assert.equal(overlayQueuedTasks([serverTask], [mutation({ operation: "delete", patch: {} })], actorId)?.length, 0);
  assert.equal(overlayQueuedTasks([serverTask], [mutation({ operation: "delete", patch: {}, state: "conflict" })], actorId)?.[0]?.title, "Original");
});

test("task mirror refuses another actor, relationship records, and malformed queued rows", () => {
  assert.equal(overlayQueuedTasks([serverTask], [mutation({ actorId: "actor-b" })], actorId), null);
  assert.equal(overlayQueuedTasks([{ ...serverTask, category: "relationship" }], [mutation({})], actorId), null);
  assert.equal(overlayQueuedTasks([serverTask], [mutation({ requestJson: null })], actorId), null);
});
