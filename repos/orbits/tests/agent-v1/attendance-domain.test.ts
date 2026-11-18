import assert from "node:assert/strict";
import test from "node:test";

import { AttendanceError, createAttendanceService } from "../../features/events/attendance-notes/service";
import { createPrivateEventService } from "../../features/events/private-events/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG13-2 (设计稿 §4, 附录 B「三处边界」; PLANNER 易错边界 2, 6): «我去过» (the user's own note), the organizer's
 * check-ins and registrations, and the schedule never write for one another. One note per account and event; a deleted one
 * does not count; numeric versions raised by each write.
 */

const WS = "workspace:attendance-test";

/** A store that records which collections were written. */
function spyStore() {
  const inner = createMemoryLiveRecordStore<Record<string, unknown>>();
  const written: string[] = [];
  const store: LiveRecordStoreLike<Record<string, unknown>> = {
    ...inner,
    upsertRecord: (record) => {
      written.push(record.collectionName);
      return inner.upsertRecord(record);
    },
    insertRecordIfAbsent: (record) => {
      written.push(record.collectionName);
      return inner.insertRecordIfAbsent(record);
    },
    updateRecordIfCurrent: (record, expected) => {
      written.push(record.collectionName);
      return inner.updateRecordIfCurrent!(record, expected);
    },
  };
  return { store, written };
}

test("one note per account and event; a second (any key) is refused; after deleting, one may be added again; versions rise", async () => {
  const { store } = spyStore();
  const notes = createAttendanceService({ store, workspaceId: WS });
  const ref = { id: "event:e103", kind: "platform" as const };
  const first = await notes.create(ACTOR, { attendedOn: "2026-11-19", dayParts: ["evening"], eventRef: ref, idempotencyKey: "k1" });
  assert.equal(first.version, 1);
  assert.deepEqual(await notes.create(ACTOR, { attendedOn: "2026-11-19", eventRef: ref, idempotencyKey: "k1" }), first, "the same key again is the same note (a replay)");
  await assert.rejects(notes.create(ACTOR, { attendedOn: "2026-11-19", eventRef: ref, idempotencyKey: "k2" }), (error: unknown) => error instanceof AttendanceError && error.code === "DUPLICATE");
  // Another account may record the same event.
  await notes.create("actor:other", { attendedOn: "2026-11-19", eventRef: ref, idempotencyKey: "k2" });
  const moved = await notes.update(ACTOR, first.id, { expectedVersion: 1, patch: { selfNote: "认识了两位定价顾问" } });
  assert.equal(moved.version, 2);
  await assert.rejects(notes.update(ACTOR, first.id, { expectedVersion: 1, patch: { selfNote: "x" } }), (error: unknown) => error instanceof AttendanceError && error.code === "VERSION_CONFLICT");
  await notes.delete(ACTOR, first.id, { expectedVersion: 2 });
  const again = await notes.create(ACTOR, { attendedOn: "2026-11-19", eventRef: ref, idempotencyKey: "k3" });
  assert.equal(again.version, 1, "a deleted note does not count");
});

test("«我去过» writes only its own collection — no check-in, no registration; a private event must be the account's and not deleted", async () => {
  const { store, written } = spyStore();
  const events = createPrivateEventService({ store, workspaceId: WS });
  const notes = createAttendanceService({ store, workspaceId: WS });
  const event = await events.create(ACTOR, { idempotencyKey: "p1", startsAt: "2026-11-14T10:00:00.000Z", title: "大学同学聚会", venue: "新宿" });
  assert.deepEqual([...new Set(written)], ["private_events"], "creating a private event records no attendance");
  written.length = 0;
  await notes.create(ACTOR, { attendedOn: "2026-11-14", eventRef: { id: event.id, kind: "private" }, idempotencyKey: "a1" });
  assert.deepEqual([...new Set(written)], ["event_attendance_notes"]);
  assert.ok(!written.some((name) => /checkin|registration|membership|admission/u.test(name)));
  await assert.rejects(notes.create("actor:other", { attendedOn: "2026-11-14", eventRef: { id: event.id, kind: "private" }, idempotencyKey: "a2" }), (error: unknown) => error instanceof AttendanceError && error.code === "EVENT_UNAVAILABLE", "another account's private event");
  const other = await events.create(ACTOR, { idempotencyKey: "p2", startsAt: "2026-11-01T10:00:00.000Z", title: "读书会" });
  await events.delete(ACTOR, other.id);
  await assert.rejects(notes.create(ACTOR, { attendedOn: "2026-11-01", eventRef: { id: other.id, kind: "private" }, idempotencyKey: "a3" }), (error: unknown) => error instanceof AttendanceError && error.code === "EVENT_UNAVAILABLE", "a deleted private event");
});

test("adding a schedule item for an event records no «我去过»; a card with both writes each to its own collection", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [
    { capability: "attendance.create", partId: "p1", set: { attendedOn: "2026-11-19", dayParts: ["evening"], eventRef: { id: "event:e103", kind: "platform" } }, shown: { event: { kind: "platform", startsAt: "2026-11-19T10:00:00.000Z", title: "SaaS 定价研讨会" } } },
    { capability: "schedule.create", partId: "p2", set: { endsAt: "2026-11-21T03:00:00.000Z", eventRefs: [{ id: "event:e101", kind: "platform" }], startsAt: "2026-11-21T01:00:00.000Z", timeZone: "Asia/Tokyo", title: "东京街头摄影展" }, shown: { events: [{ kind: "platform", startsAt: "2026-11-21T01:00:00.000Z", title: "东京街头摄影展" }] } },
  ]);
  assert.equal(card.title, "新增2项");
  assert.match(card.operations[0].display!.rows[0].after, /SaaS 定价研讨会 · 11月19日（周四）（平台活动）/u);
  assert.match(card.operations[0].display!.note!, /不会替你签到或报名/u);
  assert.match(card.operations[1].display!.rows[0].after, /11月21日（周六）10:00–12:00/u);
  assert.match(card.operations[1].display!.note!, /不会替你报名/u);
  await decide(kit, card, "confirm", "d1");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const list = async (collectionName: string) => kit.store.listRecords({ collectionName, limit: "unbounded", userId: ACTOR, workspaceId: kit.workspaceId });
  assert.equal((await list("event_attendance_notes")).length, 1, "one «我去过», for the seminar only");
  assert.equal((await list("personal_schedule_items")).length, 1);
  assert.deepEqual((await list("personal_schedule_items"))[0].payload.eventRefs, [{ id: "event:e101", kind: "platform" }]);
  assert.equal((await list("event_registrations")).length, 0);
});

test("a private event's links: the schedule refuses one that is not the account's", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const schedule = createPersonalScheduleService({ store, workspaceId: WS });
  await assert.rejects(schedule.create(ACTOR, { eventRefs: [{ id: "private_event:nobody", kind: "private" }], idempotencyKey: "s1", startsAt: "2026-11-21T01:00:00.000Z", title: "x" } as never), /linked private event is unavailable/u);
});
