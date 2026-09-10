import assert from "node:assert/strict";
import test from "node:test";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { projectCanonicalContactLifecycles } from "../../features/connections/lifecycle/read-projection";

const actorId = "actor:projection";
const workspaceId = "workspace:projection";
const now = "2026-09-09T14:30:00.000Z";
function row(collectionName: string, recordId: string, payload: Record<string, unknown>, userId: string | null = actorId): LiveRecord {
  return { workspaceId, collectionName, recordId, userId, sourceType: "manual", sourceId: "test:source", evidenceIds: [], lifecycleState: "active", createdAt: now, updatedAt: now, payload: { id: recordId, version: 1, createdAt: now, updatedAt: now, ...payload } };
}
function graph(stage = "active") {
  return [row("contacts", "contact:a", { stage: "captured", nextAction: "PRIVATE ADVICE", displayName: "NAME" }), row("connections", "connection:a", { accountId: actorId, contactId: "contact:a", stage, activeGoal: stage === "active" ? "ACTOR GOAL" : null, version: 4 })];
}
function task(recordId: string, patch: Record<string, unknown> = {}) {
  return row("tasks", recordId, { connectionId: "connection:a", contactId: "contact:a", status: "open", title: `Task ${recordId}`, dueAt: "2026-09-09T14:45:00.000Z", relationshipPurpose: "follow_up", version: 3, ...patch });
}
const project = (records: readonly LiveRecord[], timeZone = "Asia/Tokyo") => projectCanonicalContactLifecycles({ actorId, workspaceId, records, now, timeZone });

test("Connection alone supplies stage and advice never becomes a scheduled next action", () => {
  const rows = [...graph(), row("contact_detail_states", "detail:a", { actorId, contactId: "contact:a", status: "archived", nextAction: "PRIVATE ADVICE", updatedAt: "2099-01-01T00:00:00Z" })];
  assert.deepEqual(project(rows), [{ contactId: "contact:a", connectionId: "connection:a", connectionVersion: 4, relationshipStage: "active", status: "active", activeGoal: "ACTOR GOAL", nextFollowup: null }]);
});

test("next action is the earliest real open or scheduled task with a stable ID tie break", () => {
  const rows = [...graph(), task("task:z"), task("task:b"), task("task:a", { status: "completed", dueAt: "2026-09-09T00:00:00.000Z" }), task("task:c", { status: "dismissed" }), task("task:later", { dueAt: "2026-09-10T00:00:00.000Z" }), task("task:undated", { relationshipPurpose: undefined, dueAt: undefined }), task("task:generic", { relationshipPurpose: undefined, dueAt: "2026-09-09T15:00:00.000Z" })];
  assert.deepEqual(project(rows)[0].nextFollowup, { taskId: "task:b", taskVersion: 3, title: "Task task:b", dueAt: "2026-09-09T14:45:00.000Z", timeStatus: "today" });
  assert.deepEqual(project([...rows].reverse()), project(rows));
  const scheduled = task("task:scheduled", { status: "scheduled", dueAt: "2026-09-09T14:40:00.000Z", relationshipPurpose: undefined });
  assert.equal(project([...rows, scheduled])[0].nextFollowup?.taskId, "task:scheduled");
});

test("time status uses the supplied clock and timezone without advancing relationship stage", () => {
  for (const [dueAt, timeZone, expected] of [
    ["2026-09-09T14:29:59.999Z", "Asia/Tokyo", "overdue"],
    [now, "Asia/Tokyo", "today"],
    ["2026-09-09T14:59:59.999Z", "Asia/Tokyo", "today"],
    ["2026-09-09T15:00:00.000Z", "Asia/Tokyo", "future"],
    ["2026-09-09T15:00:00.000Z", "America/Los_Angeles", "today"],
  ]) {
    const view = project([...graph("needs_follow_up"), task("task:a", { dueAt })], timeZone)[0];
    assert.equal(view.nextFollowup?.timeStatus, expected);
    assert.equal(view.status, "needs_follow_up");
  }
  const dst = projectCanonicalContactLifecycles({ actorId, workspaceId, records: [...graph(), task("task:a", { dueAt: "2026-03-08T10:30:00.000Z" })], now: "2026-03-08T09:30:00.000Z", timeZone: "America/Los_Angeles" });
  assert.equal(dst[0].nextFollowup?.timeStatus, "today");
});

test("each canonical stage requires its own real invariants", () => {
  assert.equal(project([...graph("nurture"), task("task:a", { relationshipPurpose: "maintenance" })])[0].relationshipStage, "nurture");
  assert.equal(project(graph("archived"))[0].relationshipStage, "archived");
  // Ordinary tasks are not archive-blocking relationship obligations.
  assert.equal(project([...graph("archived"), task("task:a", { relationshipPurpose: undefined })])[0].nextFollowup?.taskId, "task:a");
  for (const rows of [graph("needs_follow_up"), graph("nurture"), graph("captured"), [...graph("archived"), task("task:a")], [graph()[0]], [graph()[1]]]) {
    assert.throws(() => project(rows), { code: "INCONSISTENT_STATE" });
  }
  const noGoal = graph(); noGoal[1].payload.activeGoal = " ";
  assert.throws(() => project(noGoal), { code: "INCONSISTENT_STATE" });
});

test("missing or malformed versions and generic dated task data cannot be repaired by reading", () => {
  for (const value of [undefined, null, "1", 0, -1, 1.2]) {
    const rows = graph(); rows[1].payload.version = value;
    assert.throws(() => project(rows), { code: "INCONSISTENT_STATE" });
  }
  for (const patch of [{ title: " " }, { status: "unknown" }, { status: ["open"] }, { dueAt: "tomorrow" }, { dueAt: "2026-09-10T10:00:00+09:00" }, { createdAt: "invalid" }, { updatedAt: "invalid" }, { version: undefined }]) {
    assert.throws(() => project([...graph(), task("task:a", { relationshipPurpose: undefined, ...patch })]), { code: "INCONSISTENT_STATE" });
  }
});

test("invalid clocks, timezones and scopes fail visibly", () => {
  for (const patch of [{ now: "tomorrow" }, { now: "2026-02-30T00:00:00Z" }, { timeZone: "Invalid/Zone" }, { timeZone: "" }, { timeZone: undefined }, { actorId: " " }, { workspaceId: "" }]) {
    assert.throws(() => projectCanonicalContactLifecycles({ actorId, workspaceId, records: graph(), now, timeZone: "Asia/Tokyo", ...patch } as never), { code: "INVALID_INPUT" });
  }
});

test("actor ownership, incoming foreign references and duplicate records fail without private output", () => {
  const foreignContact = row("contacts", "contact:a", { stage: "active", displayName: "FOREIGN PRIVATE" }, "actor:other");
  const foreignConnection = row("connections", "connection:foreign", { accountId: "actor:other", contactId: "contact:a", stage: "active", activeGoal: "FOREIGN PRIVATE" }, "actor:other");
  const foreignTask = { ...task("task:foreign", { title: "FOREIGN PRIVATE" }), userId: "actor:other" };
  for (const records of [[foreignContact, graph()[1]], [...graph(), foreignConnection], [...graph(), foreignTask], [...graph(), graph()[1]], [...graph(), { ...graph()[0], lifecycleState: "deleted" as const }], [...graph(), row("contact_actor_links", "link:a", { contactId: "contact:a", linkedActorId: actorId }), { ...task("task:missing-owner"), userId: null }]]) {
    assert.throws(() => project(records), error => error instanceof Error && "code" in error && error.code === "INCONSISTENT_STATE" && !error.message.includes("FOREIGN"));
  }
  const unrelated = [row("contacts", "contact:foreign", { displayName: "FOREIGN PRIVATE" }, "actor:other"), { ...graph()[0], workspaceId: "workspace:other", payload: { id: "contact:a", displayName: "FOREIGN PRIVATE" } }];
  assert.deepEqual(project([...graph(), ...unrelated]), project(graph()));
  assert.equal(JSON.stringify(project([...graph(), ...unrelated])).includes("FOREIGN"), false);
});

test("projection is immutable, excludes deleted tasks and returns deterministic contact order", () => {
  const second = [row("contacts", "contact:b", { stage: "legacy" }), row("connections", "connection:b", { accountId: actorId, contactId: "contact:b", stage: "archived" })];
  const rows = [...second, ...graph(), { ...task("task:deleted"), lifecycleState: "deleted" as const }];
  const before = structuredClone(rows);
  for (const item of rows) { Object.freeze(item.payload); Object.freeze(item); } Object.freeze(rows);
  const result = project(rows);
  assert.deepEqual(result.map(view => view.contactId), ["contact:a", "contact:b"]);
  assert.ok(result.every(view => view.nextFollowup === null));
  assert.deepEqual(rows, before);
});
