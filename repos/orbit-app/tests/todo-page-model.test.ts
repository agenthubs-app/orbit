import assert from "node:assert/strict";
import test from "node:test";
import type { TodoPageContract } from "../src/api/contract/todo-page";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { canWriteTodoFollowup, overlayTodoPage, todoPageIsStale } from "../src/screens/todo/todo-page-model";

const actorId = "actor-a";
const date = "2026-10-18";
const task = { id: "task-1", accountId: actorId, ownerUserId: actorId, title: "Follow up", status: "open" as const,
  category: "relationship" as const, plannedDate: "2026-10-17", priority: "normal" as const, source: "manual" as const,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z", deferralCount: 1 };
const page: TodoPageContract = {
  date, timeZone: "Asia/Tokyo", asOf: "2026-10-18T00:00:00Z",
  counts: { decisions: 1, nextMoves: 0, followups: 2, overdue: 1 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [{ key: "task_suggestion:s1", source: "task_suggestion", sourceId: "s1", titlePreview: "Review", createdAt: "2026-10-17T00:00:00Z", actions: ["accept"] }], next: {} },
  nextMoves: { items: [], next: {} },
  followups: { items: [
    { key: "task:task-1", source: "task", sourceId: "task-1", taskId: "task-1", titlePreview: "Follow up", createdAt: task.createdAt, kind: "task", status: "open", dueAt: "2026-10-17T14:59:59.999Z", overdue: true, deferralCount: 1 },
    { key: "relationship_task:lc1", source: "relationship_task", sourceId: "lc1", taskId: "lc1", titlePreview: "Lifecycle", createdAt: task.createdAt, kind: "lifecycle", status: "scheduled", dueAt: "2026-10-19T14:59:59.999Z", overdue: false },
  ], next: {} }, sources: { task: "ok", relationship_task: "ok", task_suggestion: "ok" },
};
function mutation(operation: "update" | "complete", patch: Record<string, unknown>): LocalSyncQueuedMutation {
  return { actorId, workspaceId: "workspace-a", domainId: "tasks", mutationId: `m-${operation}`, kind: "task", id: task.id, operation,
    patch, requestJson: "{}", baseRevision: "r1", dependsOn: null, createdAt: "2026-10-18T00:01:00Z", retryCount: 0,
    nextRetryAt: null, lastErrorCode: null, state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null };
}

test("a last-seen To-do copy becomes stale after the device's local day changes", () => {
  assert.equal(todoPageIsStale(page, date), false);
  assert.equal(todoPageIsStale(page, "2026-10-19"), true);
  assert.equal(todoPageIsStale(page, date, "America/Los_Angeles"), true);
});

test("offline follow-up actions require a mirrored plain task; stale copies are read-only", () => {
  const [plain, lifecycle] = page.followups.items;
  assert.ok(plain && lifecycle);
  assert.equal(canWriteTodoFollowup(plain, { offline: true, staleDay: false, locallyMirrored: true }), true);
  assert.equal(canWriteTodoFollowup(plain, { offline: true, staleDay: false, locallyMirrored: false }), false);
  assert.equal(canWriteTodoFollowup(lifecycle, { offline: true, staleDay: false, locallyMirrored: true }), false);
  assert.equal(canWriteTodoFollowup(lifecycle, { offline: false, staleDay: false, locallyMirrored: false }), true);
  assert.equal(canWriteTodoFollowup(plain, { offline: false, staleDay: true, locallyMirrored: true }), false);
});

test("queued plain-task deferral updates local date/count but leaves lifecycle and decisions untouched", () => {
  const result = overlayTodoPage(page, [task], [mutation("update", { plannedDate: "2026-10-20" })], actorId);
  assert.ok(result);
  assert.deepEqual(result.followups.items.map(item => item.key), ["relationship_task:lc1", "task:task-1"], "a deferred task moves after an earlier lifecycle due date");
  const moved = result.followups.items.find(item => item.taskId === task.id);
  assert.equal(moved?.deferralCount, 2);
  assert.equal(moved?.overdue, false);
  assert.equal(moved?.dueAt, "2026-10-20T14:59:59.999Z");
  assert.equal(result.counts.overdue, 0);
  assert.deepEqual(result.followups.items[0], page.followups.items[1]);
  assert.deepEqual(result.decisions, page.decisions);
});

test("queued completion removes only its task row and locally reconciles counts", () => {
  const result = overlayTodoPage(page, [task], [mutation("complete", {})], actorId);
  assert.deepEqual(result?.followups.items.map(item => item.key), ["relationship_task:lc1"]);
  assert.equal(result?.counts.followups, 1);
  assert.equal(result?.counts.overdue, 0);
  assert.equal(page.followups.items.length, 2);
});
