import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const at = "2026-10-18T00:00:00.000Z";
function record(id: string, startsAt: string, endsAt: string, patch: object = {}): LiveRecord {
  return { workspaceId: "w", collectionName: "personal_schedule_items", recordId: id, userId: "a", sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active", createdAt: at, updatedAt: at,
    payload: { id, sourceId: id, accountId: "a", ownerUserId: "a", kind: "personal", category: "personal", title: id, state: "upcoming", startsAt, endsAt, createdAt: at, updatedAt: at, ...patch } };
}
test("calendar overlap includes carry-over single and recurring personal schedules but preserves old start-only list", async () => {
  const store = createMemoryLiveRecordStore([
    record("carry", "2030-03-30T12:00:00Z", "2030-04-02T12:00:00Z"),
    record("boundary", "2030-03-30T12:00:00Z", "2030-04-01T00:00:00Z"),
    record("series", "2020-01-01T23:00:00Z", "2020-01-02T02:00:00Z", { timeZone: "UTC", recurrence: { frequency: "daily" } }),
  ]);
  const service = createPersonalScheduleService({ store, workspaceId: "w", now: () => at });
  const window = { actorId: "a", from: "2030-04-01T00:00:00Z", to: "2030-04-02T00:00:00Z" };
  const old = await service.list(window);
  assert.deepEqual(old.map(item => item.id), ["series:occurrence:2030-04-01"]);
  const calendar = await service.list({ ...window, overlap: true });
  assert.deepEqual(new Set(calendar.map(item => item.id)), new Set(["carry", "series:occurrence:2030-03-31", "series:occurrence:2030-04-01"]));
  assert.deepEqual(await service.list({ ...window, overlap: true, actorId: "b" }), []);
});
test("calendar recurrence keeps local clocks through DST, moved exceptions and half-open ends", async () => {
  const item = record("dst", "2026-10-31T03:00:00Z", "2026-10-31T06:00:00Z", { timeZone: "America/New_York", recurrence: { frequency: "daily" } });
  const store = createMemoryLiveRecordStore([item]);
  const service = createPersonalScheduleService({ store, workspaceId: "w", now: () => at });
  const values = await service.list({ actorId: "a", from: "2026-11-01T04:00:00Z", to: "2026-11-02T05:00:00Z", overlap: true });
  assert.deepEqual(values.map(item => [item.startsAt, item.endsAt]), [["2026-11-01T03:00:00.000Z", "2026-11-01T07:00:00.000Z"], ["2026-11-02T04:00:00.000Z", "2026-11-02T07:00:00.000Z"]]);
  await store.upsertRecord({ ...item, collectionName: "personal_schedule_occurrence_exceptions", recordId: "dst:occurrence:2026-10-30", sourceId: "dst", payload: { seriesId: "dst", occurrenceDate: "2026-10-30", cancelled: false, patch: { startsAt: "2026-11-01T20:00:00Z", endsAt: "2026-11-01T21:00:00Z" }, updatedAt: at } });
  const moved = await service.list({ actorId: "a", from: "2026-11-01T04:00:00Z", to: "2026-11-02T05:00:00Z", overlap: true });
  assert.equal(moved.some(item => item.id === "dst:occurrence:2026-10-30" && item.startsAt === "2026-11-01T20:00:00Z"), true);
});

test("an old anchor moved to a long carry-over exception is not lost outside the ordinary expansion window", async () => {
  const item = record("long-move", "2020-01-01T09:00:00Z", "2020-01-01T10:00:00Z", { timeZone: "UTC", recurrence: { frequency: "weekly" } });
  const exception = { ...item, collectionName: "personal_schedule_occurrence_exceptions", recordId: "long-move:occurrence:2020-01-08", sourceId: "long-move", payload: { seriesId: "long-move", occurrenceDate: "2020-01-08", cancelled: false, patch: { startsAt: "2030-03-01T00:00:00Z", endsAt: "2030-04-02T00:00:00Z" }, updatedAt: at } };
  const service = createPersonalScheduleService({ store: createMemoryLiveRecordStore([item, exception]), workspaceId: "w", now: () => at });
  const values = await service.list({ actorId: "a", from: "2030-04-01T00:00:00Z", to: "2030-04-02T00:00:00Z", overlap: true });
  assert.equal(values.some(item => item.id === exception.recordId), true);
});
