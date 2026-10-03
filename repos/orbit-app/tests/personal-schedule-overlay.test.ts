import assert from "node:assert/strict";
import test from "node:test";
import type { LocalSyncQueuedMutation } from "../src/data/sync/local-sync-repository";
import { buildOfflineScheduleMutation } from "../src/data/sync/schedule-outbox-mutation";
import { overlayQueuedScheduleItems, overlayQueuedScheduleSeries } from "../src/view-models/personal-schedule-overlay";
import { personalScheduleById, personalScheduleWindow, type MirrorScheduleSeries } from "../src/view-models/personal-schedule-occurrences";
import type { PersonalScheduleContract } from "../src/api/contract/tasks";

const A = "actor-a";
const stamp = "2026-10-03T09:00:00.000Z";
const localId = "local:b21c0000-0000-4000-8000-000000000002";
const localNote = "local:7f3a0000-0000-4000-8000-000000000001";
const item = (id: string, extra: Partial<PersonalScheduleContract> = {}) => ({ id, sourceId: id, accountId: A, ownerUserId: A, kind: "personal", category: "personal", state: "upcoming",
  title: id, startsAt: "2026-10-04T01:00:00.000Z", createdAt: stamp, updatedAt: stamp, ...extra }) as PersonalScheduleContract;
function queued(mutation: ReturnType<typeof buildOfflineScheduleMutation>, state: LocalSyncQueuedMutation["state"] = "queued", serverSnapshot: unknown = null): LocalSyncQueuedMutation {
  return { ...mutation, actorId: A, workspaceId: "w", domainId: "personal-schedule", requestJson: mutation.requestJson!, dependsOn: mutation.dependsOn ?? null, state, attemptCount: 0, firstAttemptAt: null, serverSnapshot };
}

test("queued schedule writes overlay the mirror: a local create appears, an edit applies, a delete hides; each is marked", () => {
  const series: MirrorScheduleSeries[] = [{ item: item("personal:edit", { location: "Tokyo" }), exceptions: [] }, { item: item("personal:gone"), exceptions: [] }, { item: item("personal:same"), exceptions: [] }];
  const mutations = [
    queued(buildOfflineScheduleMutation({ mutationId: "m1", entityId: localId, operation: "create", baseRevision: null, createdAt: stamp,
      requestBody: { title: "Call Chen", startsAt: "2026-10-05T01:00:00.000Z", endsAt: "2026-10-05T01:30:00.000Z", timeZone: "Asia/Tokyo", noteIds: [localNote], reminderMinutes: 15, idempotencyKey: "m1" } })),
    queued(buildOfflineScheduleMutation({ mutationId: "m2", entityId: "personal:edit", operation: "update", baseRevision: "r1", createdAt: stamp,
      requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "m2", patch: { title: "Moved", location: null } } })),
    queued(buildOfflineScheduleMutation({ mutationId: "m3", entityId: "personal:gone", operation: "delete", baseRevision: "r1", createdAt: stamp,
      requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "m3" } })),
  ];
  const result = overlayQueuedScheduleSeries(series, mutations, A);
  const ids = result.series.map(entry => entry.item.id);
  assert.deepEqual(ids.sort(), [localId, "personal:edit", "personal:same"].sort());
  const created = result.series.find(entry => entry.item.id === localId)!.item;
  assert.equal(created.title, "Call Chen");
  assert.deepEqual(created.noteIds, [localNote]);
  assert.equal(created.reminderMinutes, 15);
  const edited = result.series.find(entry => entry.item.id === "personal:edit")!.item;
  assert.equal(edited.title, "Moved");
  assert.equal(edited.location, undefined, "a null in the patch clears the field");
  assert.equal(edited.updatedAt, stamp, "the server version stays the edit base");
  assert.deepEqual(result.states, { [localId]: "queued", "personal:edit": "queued", "personal:gone": "queued" });
  // The derived list and detail read the overlaid series.
  const window = personalScheduleWindow(result.series, { from: "2026-10-03T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" }, Date.parse(stamp));
  assert.ok(window.some(entry => entry.id === localId));
  assert.equal(personalScheduleById(result.series, localId, Date.parse(stamp))?.title, "Call Chen");
});

test("a conflicting or failed delete keeps the schedule visible; other people's or malformed rows are ignored", () => {
  const series: MirrorScheduleSeries[] = [{ item: item("personal:a"), exceptions: [] }, { item: item("personal:b"), exceptions: [] }];
  const conflict = queued(buildOfflineScheduleMutation({ mutationId: "c1", entityId: "personal:a", operation: "delete", baseRevision: "r1", createdAt: stamp,
    requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "c1" } }), "conflict", { ...item("personal:a"), title: "Web title" });
  const failed = queued(buildOfflineScheduleMutation({ mutationId: "f1", entityId: "personal:b", operation: "delete", baseRevision: "r1", createdAt: stamp,
    requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "f1" } }), "failed");
  const foreign = { ...queued(buildOfflineScheduleMutation({ mutationId: "x1", entityId: "personal:a", operation: "update", baseRevision: "r1", createdAt: stamp,
    requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "x1", patch: { title: "B" } } })), actorId: "actor-b" };
  const result = overlayQueuedScheduleSeries(series, [conflict, failed, foreign], A);
  assert.deepEqual(result.series.map(entry => entry.item.id), ["personal:a", "personal:b"]);
  assert.equal(result.series[0]!.item.title, "personal:a", "a foreign row never changes the owner's view");
  assert.deepEqual(result.states, { "personal:a": "conflict", "personal:b": "failed" });
});

test("the calendar's raw schedule payloads get the same overlay, with the state on each changed personal item", () => {
  const payloads = [{ ...item("personal:edit") }, { id: "meeting:1", kind: "meeting", title: "Meet", startsAt: stamp }];
  const mutations = [
    queued(buildOfflineScheduleMutation({ mutationId: "m1", entityId: localId, operation: "create", baseRevision: null, createdAt: stamp,
      requestBody: { title: "Local", startsAt: "2026-10-05T01:00:00.000Z", idempotencyKey: "m1" } })),
    queued(buildOfflineScheduleMutation({ mutationId: "m2", entityId: "personal:edit", operation: "update", baseRevision: "r1", createdAt: stamp,
      requestBody: { expectedUpdatedAt: stamp, idempotencyKey: "m2", patch: { title: "Moved" } } }), "conflict"),
  ];
  const overlaid = overlayQueuedScheduleItems(payloads, mutations, A);
  assert.deepEqual(overlaid.map(entry => [entry.id, entry.title, entry.localMutationState ?? null]), [
    ["personal:edit", "Moved", "conflict"], ["meeting:1", "Meet", null], [localId, "Local", "queued"],
  ]);
});

test("the calendar shows a schedule created offline on its day, marked 未同步", async () => {
  const { localScheduleItems } = await import("../src/screens/schedule/schedule-calendar-source-mirror");
  const { scheduleToCalendarView } = await import("../src/view-models/schedule");
  const create = queued(buildOfflineScheduleMutation({ mutationId: "m1", entityId: localId, operation: "create", baseRevision: null, createdAt: stamp,
    requestBody: { title: "和陈总复盘", startsAt: "2026-10-05T01:00:00.000Z", endsAt: "2026-10-05T01:30:00.000Z", idempotencyKey: "m1" } }));
  const scheduleItems = localScheduleItems([], A, [create]);
  const view = scheduleToCalendarView({ events: { events: [] }, tasks: { tasks: [] }, scheduleItems, selectedDateKey: "2026-10-05", now: new Date(stamp), timeZone: "Asia/Tokyo", language: "zh" });
  const entry = view.items.find(item => item.title === "和陈总复盘");
  assert.ok(entry, JSON.stringify(view.items));
  assert.equal(entry.href, `/schedule/personal/${encodeURIComponent(localId)}`);
  assert.match(entry.subtitle, /未同步$/u);
});
