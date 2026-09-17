import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationshipCompletion, readRelationshipSnapshot, relationshipReceiptMatches } from "../src/api/relationship-lifecycle";
import type { RelationshipLifecycleSnapshotDTO } from "../src/api/contract/relationship-lifecycle";
import { resolveSupportedInitialRouteHref } from "../src/view-models/initial-route";
import { mobileAuthReturnHref } from "../src/view-models/mobile-route-access";
const date = "2026-09-16T00:00:00.000Z";
const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: date, updatedAt: date };
const snapshot: RelationshipLifecycleSnapshotDTO = { connection: { ...identity, stage: "needs_follow_up", activeGoal: null }, tasks: [{ ...identity, taskId: "task:1", title: "跟进", dueAt: date, status: "open", purpose: "follow_up" }] };
const draft = { taskId: "task:1", kind: "next_task" as const, title: "下一步", date: "2026-10-01", time: "15:00", goal: "合作", archiveConfirmed: false };
test("lifecycle protected route survives login and rejects invalid detail identifiers", () => {
  assert.equal(resolveSupportedInitialRouteHref("/app/tasks/relationship/connection%3A1"), "/tasks/relationship/connection%3A1");
  assert.equal(mobileAuthReturnHref("/tasks/relationship/connection%3A1", { id: "connection:1" }), "/tasks/relationship/connection%3A1");
  assert.equal(resolveSupportedInitialRouteHref("/tasks/relationship/%2e%2e"), null);
});
test("lifecycle reads enforce actor/connection and every nested task identity", () => {
  assert.deepEqual(readRelationshipSnapshot({ snapshot }, "owner", "connection:1"), snapshot);
  assert.equal(readRelationshipSnapshot({ snapshot }, "other", "connection:1"), null);
  assert.equal(readRelationshipSnapshot({ snapshot: { ...snapshot, tasks: [{ ...snapshot.tasks[0], actorId: "other" }] } }, "owner", "connection:1"), null);
});
test("completion includes both versions, stable supplied ids and explicit zoned next step", () => {
  const body = buildRelationshipCompletion(snapshot, draft, "Asia/Shanghai", "key", "task:2");
  assert.equal(body.expectedConnectionVersion, 1); assert.equal(body.expectedTaskVersion, 1);
  assert.deepEqual(body.outcome, { kind: "next_task", nextTask: { taskId: "task:2", title: "下一步", dueAt: "2026-10-01T07:00:00.000Z" } });
  assert.throws(() => buildRelationshipCompletion(snapshot, { ...draft, date: "2026-02-30" }, "Asia/Shanghai", "key", "task:2"));
  assert.throws(() => buildRelationshipCompletion(snapshot, { ...draft, kind: "archived" }, "Asia/Shanghai", "key", "task:2"));
});
test("completion receipt requires exact actor, task, version and outcome, not just HTTP 200", () => {
  const body = buildRelationshipCompletion(snapshot, { ...draft, kind: "active" }, "Asia/Shanghai", "key", "task:2");
  const after = { connection: { ...snapshot.connection, stage: "active", activeGoal: "合作", version: 2 }, tasks: [{ ...snapshot.tasks[0], status: "completed", version: 2 }] };
  assert.ok(relationshipReceiptMatches({ snapshot: after, replayed: false }, snapshot, body));
  assert.equal(relationshipReceiptMatches({ snapshot, replayed: false }, snapshot, body), null);
  assert.equal(relationshipReceiptMatches({ snapshot: { ...after, connection: { ...after.connection, activeGoal: "other" } }, replayed: false }, snapshot, body), null);
});
