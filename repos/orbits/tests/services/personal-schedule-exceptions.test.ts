import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { readPersonalScheduleOccurrenceExceptions } from "../../features/personal-schedule/occurrence-exceptions";

const query = { workspaceId: "exceptions-60", actorId: "owner", seriesId: "personal:series", occurrenceDate: "2026-09-19" };
const revision = "2026-09-17T08:00:00Z";
const record: LiveRecord = { workspaceId: query.workspaceId, collectionName: "personal_schedule_occurrence_exceptions", recordId: "personal:series:occurrence:2026-09-19", userId: "owner", sourceType: "manual", sourceId: query.seriesId, evidenceIds: [], createdAt: revision, updatedAt: revision, lifecycleState: "active", payload: { seriesId: query.seriesId, occurrenceDate: "2026-09-19", cancelled: false, patch: { startsAt: "2026-09-19T11:00:37Z", endsAt: "2026-09-19T12:00:37Z" }, updatedAt: revision } };

test("persisted occurrence exceptions can be read independently without returning another owner", async () => {
  const store = createMemoryLiveRecordStore([record]);
  const loaded = await readPersonalScheduleOccurrenceExceptions({ ...query, store });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.occurrenceDate, "2026-09-19");
  assert.equal(loaded[0]!.patch.startsAt, "2026-09-19T11:00:37Z");
  assert.deepEqual(await readPersonalScheduleOccurrenceExceptions({ ...query, actorId: "other", store }), []);
});

test("cancellation is a durable exception rather than deletion of the series", async () => {
  const store = createMemoryLiveRecordStore([{ ...record, payload: { ...record.payload, cancelled: true, patch: {} } }]);
  const loaded = await readPersonalScheduleOccurrenceExceptions({ ...query, store });
  assert.equal(loaded[0]!.cancelled, true);
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId: query.workspaceId, collectionName: "personal_schedule_items" }).length, 0);
});

test("exception storage rejects impossible dates, stale envelopes and forbidden series fields", async () => {
  for (const corrupt of [
    { ...record, payload: { ...record.payload, occurrenceDate: "2026-02-30" } },
    { ...record, updatedAt: "2026-09-17T09:00:00Z" },
    { ...record, recordId: "another-occurrence" },
    { ...record, payload: { ...record.payload, patch: { ownerUserId: "other" } } },
    { ...record, payload: { ...record.payload, patch: { recurrence: { frequency: "monthly" } } } },
  ]) await assert.rejects(readPersonalScheduleOccurrenceExceptions({ ...query, store: { ...createMemoryLiveRecordStore(), listRecords: () => [corrupt] } }));
});

test("single-occurrence reads are storage-bounded and retain owner, identity and envelope checks", async () => {
  const memory = createMemoryLiveRecordStore([record]);
  const reads: unknown[] = [];
  const store = { ...memory, listRecords(input: Parameters<typeof memory.listRecords>[0]) { reads.push(input); return memory.listRecords(input); } };
  const exact = { ...query, store, occurrenceDate: "2026-09-19" };
  assert.equal((await readPersonalScheduleOccurrenceExceptions(exact)).length, 1);
  assert.deepEqual(reads, [{
    limit: 1, workspaceId: query.workspaceId, collectionName: record.collectionName, userId: query.actorId, sourceId: query.seriesId, recordIds: [record.recordId],
  }]);
  assert.deepEqual(await readPersonalScheduleOccurrenceExceptions({ ...exact, actorId: "other" }), []);
  assert.deepEqual(await readPersonalScheduleOccurrenceExceptions({ ...exact, occurrenceDate: "2026-09-20" }), []);
  await assert.rejects(readPersonalScheduleOccurrenceExceptions({ ...exact, occurrenceDate: "2026-02-30" }), /valid occurrence date/);
  await assert.rejects(readPersonalScheduleOccurrenceExceptions({ ...exact, store: { ...memory, listRecords: () => [record] }, occurrenceDate: "2026-09-20" }), /integrity mismatch/);
});
