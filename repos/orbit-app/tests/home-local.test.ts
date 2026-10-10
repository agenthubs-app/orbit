import assert from "node:assert/strict";
import test from "node:test";
import type { SyncRecord } from "../src/api/contract/sync";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { homeScheduleToView } from "../src/view-models/home-dashboard";
import { localHomeScheduleItems, localHomeTaskPage } from "../src/view-models/home-local";
import { localScheduleTasks } from "../src/screens/schedule/schedule-calendar-source-mirror";

// Sprint 0131: the home cards from the device copy reproduce the server's
// answers they stand in for (the task page rule of features/tasks/task-page.ts
// and the today schedule provider's three sources).
const A = "account:one";
const record = (payload: Record<string, unknown>, deleted = false): SyncRecord => ({ id: String(payload.id ?? payload.eventId), kind: "task", workspaceId: "w", revision: "1", updatedAt: "2026-09-28T00:00:00.000Z", deletedAt: deleted ? "2026-09-28T00:00:00.000Z" : null, payload: deleted ? null : payload } as SyncRecord);
const task = (id: string, patch: Record<string, unknown>) => record({ id, accountId: A, ownerUserId: A, title: "待办 " + id, status: "open", category: "relationship", priority: "normal", source: "manual", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", ...patch });

test("home tasks: open tasks planned through the day or due before its end, in the server's order, first five and the total", () => {
  const records = [
    task("late-due", { dueAt: "2026-09-28T14:00:00.000Z" }),                 // 23:00 Tokyo, still on 9/28
    task("tomorrow", { dueAt: "2026-09-28T16:00:00.000Z" }),                 // 01:00 Tokyo 9/29: excluded
    task("planned-past", { plannedDate: "2026-09-25" }),
    task("planned-today-new", { plannedDate: "2026-09-28", updatedAt: "2026-09-28T01:00:00.000Z" }),
    task("planned-today-old", { plannedDate: "2026-09-28", updatedAt: "2026-09-27T01:00:00.000Z" }),
    task("undated", {}),                                                      // no date: excluded
    task("done", { plannedDate: "2026-09-20", status: "completed", completedAt: "2026-09-21T00:00:00.000Z" }),
    task("early-due", { dueAt: "2026-09-27T00:00:00.000Z" }),
    task("planned-later", { plannedDate: "2026-10-01" }),
    task("gone", {}, ),
  ];
  records.push(task("deleted", { plannedDate: "2026-09-01" }));
  records[records.length - 1] = record({ id: "deleted" }, true);
  const page = localHomeTaskPage(records, A, "2026-09-28", "Asia/Tokyo", new Date("2026-09-28T03:00:00.000Z"), "zh");
  assert.ok(page);
  assert.equal(page.total, 5);
  // dueAt "2026-09-27T00…" < "2026-09-28T14…" < plannedDate keys "2026-09-25T23:59:59" … by code point order.
  assert.deepEqual(page.items.map((item) => item.id), ["planned-past", "early-due", "late-due", "planned-today-new", "planned-today-old"]);
});

test("home tasks: a foreign or invalid mirrored task makes the local page unavailable instead of partial", () => {
  assert.equal(localHomeTaskPage([task("x", { plannedDate: "2026-09-28", ownerUserId: "someone-else" })], A, "2026-09-28", "Asia/Tokyo", new Date(), "zh"), null);
});

test("home task copy overlays queued personal completion and local creation", () => {
  const records = [task("personal:one", { category: "personal", plannedDate: "2026-09-28" })];
  const queued = [
    { actorId: A, workspaceId: "w", domainId: "tasks", mutationId: "complete-one", kind: "task", id: "personal:one", operation: "complete", state: "queued", patch: {}, requestJson: JSON.stringify({ action: "complete", idempotencyKey: "complete-one" }), baseRevision: "1", createdAt: "2026-09-28T01:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null },
    { actorId: A, workspaceId: "w", domainId: "tasks", mutationId: "create-local", kind: "task", id: "local:task-a", operation: "create", state: "queued", patch: { category: "personal", title: "Local task", plannedDate: "2026-09-28" }, requestJson: JSON.stringify({ idempotencyKey: "create-local", category: "personal", title: "Local task", plannedDate: "2026-09-28" }), baseRevision: null, createdAt: "2026-09-28T02:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null },
  ] as LocalSyncQueuedMutation[];
  const page = localHomeTaskPage(records, A, "2026-09-28", "Asia/Tokyo", new Date("2026-09-28T03:00:00.000Z"), "en", queued);
  assert.ok(page);
  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.id, "local:task-a");
});

test("calendar task mirror overlays personal task completion without enabling relationship writes", () => {
  const personal = task("personal:calendar", { category: "personal", plannedDate: "2026-09-28" });
  const relationship = task("relationship:calendar", { category: "relationship", plannedDate: "2026-09-28" });
  const mutation = {
    actorId: A, workspaceId: "w", domainId: "tasks", mutationId: "complete-calendar", kind: "task", id: personal.id, operation: "complete", state: "queued",
    patch: {}, requestJson: JSON.stringify({ action: "complete", idempotencyKey: "complete-calendar" }), baseRevision: "1", createdAt: "2026-09-28T01:00:00.000Z", retryCount: 0, nextRetryAt: null, lastErrorCode: null, serverSnapshot: null,
  } as LocalSyncQueuedMutation;
  const result = localScheduleTasks([personal, relationship], A, [mutation]);
  assert.deepEqual(result.tasks.map(item => item.id), ["relationship:calendar"]);
});

test("home schedule: personal items and registered events from the domains, meetings from the last answer", () => {
  const personal = [record({ id: "p1", accountId: A, ownerUserId: A, kind: "personal", category: "personal", state: "upcoming", title: "和张伟喝咖啡", sourceId: "p1", startsAt: "2026-09-28T02:00:00.000Z", endsAt: "2026-09-28T03:00:00.000Z", occurrenceExceptions: [] })];
  const events = [record({ eventId: "ev1", participantId: "pt1", title: "储能论坛", description: "", venue: "东京国际论坛", timeZone: "Asia/Tokyo", startsAt: "2026-09-28T05:00:00.000Z", endsAt: "2026-09-28T08:00:00.000Z", lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null, eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null })];
  const lastAnswer = { scheduleItems: [
    { id: "schedule:m1", kind: "meeting", category: "meeting", state: "upcoming", title: "约谈：佐藤", startsAt: "2026-09-28T09:00:00.000Z", endsAt: "2026-09-28T09:30:00.000Z", sourceId: "m1" },
    { id: "p-old", kind: "personal", category: "personal", state: "upcoming", title: "旧回应里的个人日程", startsAt: "2026-09-28T01:00:00.000Z", sourceId: "p-old" },
  ] };
  const payload = localHomeScheduleItems({ personal, events, lastAnswer });
  assert.deepEqual(payload.scheduleItems.map((item) => item.id), ["p1", "event:ev1", "schedule:m1"], "personal rows of an old answer are not resurrected");
  const rows = homeScheduleToView(payload, "2026-09-28", new Date("2026-09-28T00:00:00.000Z"), "Asia/Tokyo", "zh");
  assert.deepEqual(rows?.map((row) => [row.title, row.href]), [
    ["和张伟喝咖啡", "/schedule/personal/p1"],
    ["储能论坛", "/events/ev1"],
    ["约谈：佐藤", "/task?seg=calendar"],
  ]);
});
