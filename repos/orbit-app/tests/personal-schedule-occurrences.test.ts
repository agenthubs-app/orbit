import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { personalScheduleList } from "../src/api/personal-schedule";
import {
  expandPersonalScheduleOccurrences,
  personalScheduleById,
  personalScheduleSeriesFromMirror,
  personalScheduleWindow,
} from "../src/view-models/personal-schedule-occurrences";

// Sprint 0108: the device derives personal-schedule occurrences from its
// mirror. Parity against the real server code (orbits recurrence expansion and
// the personal-schedule service over its memory store) instead of hand-written
// expectations.
const orbits = path.resolve(process.cwd(), "../orbits");
const load = (file: string) => import(pathToFileURL(path.join(orbits, file)).href);

type Expand = typeof expandPersonalScheduleOccurrences;
function outcome(expand: Expand, ...args: Parameters<Expand>) {
  try { return { ok: expand(...args) }; } catch (error) { return { error: (error as Error).message }; }
}

test("expansion matches the server for daily/weekly/monthly, until, all-day, DST and invalid series", async () => {
  const server: { expandPersonalScheduleOccurrences: Expand } = await load("features/personal-schedule/recurrence.ts");
  const window = { from: "2026-10-20T00:00:00.000Z", to: "2027-01-20T00:00:00.000Z" };
  const cases: Parameters<Expand>[] = [
    [{ id: "s:daily", startsAt: "2026-10-25T01:00:00.000Z", endsAt: "2026-10-25T02:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "daily", until: "2026-11-10" } }, window],
    [{ id: "s:weekly-ny", startsAt: "2026-10-26T13:30:00.000Z", endsAt: "2026-10-26T14:30:00.000Z", timeZone: "America/New_York", recurrence: { frequency: "weekly" } }, window],
    [{ id: "s:monthly-31", startsAt: "2026-10-31T09:00:00.000Z", timeZone: "Europe/Berlin", recurrence: { frequency: "monthly" } }, window],
    [{ id: "s:allday", startsAt: "2026-10-20T15:00:00.000Z", endsAt: "2026-10-21T15:00:00.000Z", allDay: true, timeZone: "Asia/Tokyo", recurrence: { frequency: "weekly" } }, window],
    [{ id: "s:exact", startsAt: "2026-10-25T01:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "daily" } }, window, "2026-11-03"],
    [{ id: "s:gap", startsAt: "2026-03-01T07:30:00.000Z", timeZone: "America/New_York", recurrence: { frequency: "daily" } }, { from: "2027-03-10T00:00:00.000Z", to: "2027-03-20T00:00:00.000Z" }],
    [{ id: "s:bad-zone", startsAt: "2026-10-25T01:00:00.000Z", timeZone: "Not/AZone", recurrence: { frequency: "daily" } }, window],
    [{ id: "s:bad-until", startsAt: "2026-10-25T01:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "daily", until: "2026-10-01" } }, window],
  ];
  for (const args of cases) {
    assert.deepEqual(outcome(expandPersonalScheduleOccurrences, ...args), outcome(server.expandPersonalScheduleOccurrences, ...args), args[0].id);
  }
});

test("windowed list and occurrence reads match the server service, with cancelled and moved occurrences", async () => {
  const { createPersonalScheduleService } = await load("features/personal-schedule/service.ts");
  const { createMemoryLiveRecordStore } = await load("shared/storage/live-record-store.ts");
  const store = createMemoryLiveRecordStore();
  let clock = "2026-10-20T00:00:00.000Z";
  const service = createPersonalScheduleService({ store, workspaceId: "w", now: () => clock });
  const actor = "actor-1";
  const weekly = await service.create(actor, { title: "Weekly 1:1", startsAt: "2026-10-26T01:00:00.000Z", endsAt: "2026-10-26T02:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "weekly" }, idempotencyKey: "weekly" });
  const single = await service.create(actor, { title: "Dentist", startsAt: "2026-10-22T05:00:00.000Z", endsAt: "2026-10-22T06:00:00.000Z", location: "Shibuya", idempotencyKey: "single" });
  clock = "2026-10-21T00:00:00.000Z";
  const second = await service.get({ actorId: actor, id: `${weekly.scheduleItem.id}:occurrence:2026-11-02` });
  await service.remove(actor, second.id, { expectedUpdatedAt: second.updatedAt, idempotencyKey: "cancel", scope: "occurrence" });
  const third = await service.get({ actorId: actor, id: `${weekly.scheduleItem.id}:occurrence:2026-11-09` });
  await service.update(actor, third.id, { expectedUpdatedAt: third.updatedAt, idempotencyKey: "move", scope: "occurrence", patch: { title: "Moved 1:1", startsAt: "2026-11-10T03:00:00.000Z", endsAt: "2026-11-10T04:00:00.000Z", location: "Cafe" } });
  const later = await service.create(actor, { title: "Later", startsAt: "2027-03-01T00:00:00.000Z", idempotencyKey: "later" });
  await service.remove(actor, later.scheduleItem.id, { expectedUpdatedAt: later.scheduleItem.updatedAt, idempotencyKey: "later-delete" });

  // The device mirror: each live series payload plus its exceptions, as the sync page sends them.
  const records = store.listRecords({ workspaceId: "w", collectionName: "personal_schedule_items", limit: "unbounded" });
  const exceptions = store.listRecords({ workspaceId: "w", collectionName: "personal_schedule_occurrence_exceptions", limit: "unbounded" });
  const mirror = records.map((record: { recordId: string; payload: Record<string, unknown> }) => {
    const own = exceptions.filter((row: { sourceId: string }) => row.sourceId === record.recordId)
      .map((row: { payload: { occurrenceDate: string; cancelled: boolean; patch: Record<string, unknown> } }) => ({ occurrenceDate: row.payload.occurrenceDate, cancelled: row.payload.cancelled, patch: row.payload.patch }))
      .sort((left: { occurrenceDate: string }, right: { occurrenceDate: string }) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    return { payload: { ...record.payload, ...(own.length ? { occurrenceExceptions: own } : {}) } };
  });
  const series = personalScheduleSeriesFromMirror(mirror, actor);
  assert.ok(series, "the mirror parses");
  assert.equal(series.length, 2, "the deleted series is not shown");

  clock = "2026-10-22T05:30:00.000Z";
  const now = Date.parse(clock);
  const window = { from: "2026-10-21T15:00:00.000Z", to: "2027-01-19T15:00:00.000Z" };
  const expected = await service.list({ actorId: actor, from: window.from, to: window.to });
  const actual = personalScheduleWindow(series, window, now);
  // What the screen showed from the network: the App's own parser of that response.
  assert.deepEqual(actual, personalScheduleList({ scheduleItems: expected }, actor), "same occurrences, fields, order and states as GET /api/schedule-items");
  assert.ok(actual.some((item) => item.id === single.scheduleItem.id && item.state === "ongoing"), "state follows the device clock");
  assert.ok(!actual.some((item) => item.occurrenceDate === "2026-11-02"), "a cancelled occurrence is gone");
  assert.equal(actual.find((item) => item.occurrenceDate === "2026-11-09")?.title, "Moved 1:1");

  for (const id of [weekly.scheduleItem.id, single.scheduleItem.id, `${weekly.scheduleItem.id}:occurrence:2026-11-09`, `${weekly.scheduleItem.id}:occurrence:2026-11-16`]) {
    assert.deepEqual(personalScheduleById(series, id, now), await service.get({ actorId: actor, id }), id);
  }
  assert.equal(personalScheduleById(series, `${weekly.scheduleItem.id}:occurrence:2026-11-02`, now), null, "a cancelled occurrence cannot be opened");
  await assert.rejects(service.get({ actorId: actor, id: `${weekly.scheduleItem.id}:occurrence:2026-11-02` }));
});

test("a mirrored row of another account, or a malformed exception, is refused", () => {
  const item = { id: "p:1", sourceId: "p:1", accountId: "actor-1", ownerUserId: "actor-1", kind: "personal", category: "personal", state: "upcoming", title: "T", startsAt: "2026-10-22T05:00:00.000Z", createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" };
  assert.equal(personalScheduleSeriesFromMirror([{ payload: item }], "actor-1")?.length, 1);
  assert.equal(personalScheduleSeriesFromMirror([{ payload: { ...item, accountId: "actor-2", ownerUserId: "actor-2" } }], "actor-1"), null);
  assert.equal(personalScheduleSeriesFromMirror([{ payload: { ...item, occurrenceExceptions: [{ occurrenceDate: "nope", cancelled: true, patch: {} }] } }], "actor-1"), null);
  assert.equal(personalScheduleSeriesFromMirror([{ payload: { ...item, unknownField: 1 } }], "actor-1"), null, "the strict App schema still applies");
});
