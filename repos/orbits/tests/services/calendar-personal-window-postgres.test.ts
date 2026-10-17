import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { readPersonalScheduleOccurrenceExceptions } from "../../features/personal-schedule/occurrence-exceptions";
import { createTodayScheduleProvider } from "../../features/tasks/today-schedule-provider";
import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const at = "2026-10-18T00:00:00.000Z";
test("calendar selected-window route uses real PG exception overlap selection and exposes exception caps", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = `calendar_window_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const base = { workspaceId: "w", userId: "a", sourceType: "manual" as const, sourceId: "series", evidenceIds: [], lifecycleState: "active" as const, createdAt: at, updatedAt: at };
    await store.upsertRecord({ ...base, collectionName: "personal_schedule_items", recordId: "series", payload: { id: "series", sourceId: "series", accountId: "a", ownerUserId: "a", kind: "personal", category: "personal", title: "Private schedule", state: "upcoming", startsAt: "2020-01-01T09:00:00Z", endsAt: "2020-01-01T10:00:00Z", timeZone: "UTC", recurrence: { frequency: "weekly" }, createdAt: at, updatedAt: at } });
    const movedId = "series:occurrence:2020-01-08";
    await store.upsertRecord({ ...base, collectionName: "personal_schedule_occurrence_exceptions", recordId: movedId, payload: { seriesId: "series", occurrenceDate: "2020-01-08", cancelled: false, patch: { startsAt: "2030-03-01T00:00:00Z", endsAt: "2030-04-02T00:00:00Z" }, updatedAt: at } });
    const service = createPersonalScheduleService({ store, workspaceId: "w", executor: pool, now: () => at });
    const scheduleProvider = createTodayScheduleProvider({ listEvents: async () => [], listAppointments: async () => [], personalList: service.list });
    const GET = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), scheduleProvider });
    const request = () => new Request("http://localhost/api/schedule-items?scope=calendar&from=2030-04-01T00%3A00%3A00Z&to=2030-04-02T00%3A00%3A00Z&language=ja");
    const response = await GET(request());
    assert.equal(response.status, 200);
    const items = (await response.json()).data.scheduleItems;
    assert.deepEqual(items.map((item: { id: string }) => item.id), [movedId]);
    assert.equal((await createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "b", workspaceId: "w" }), scheduleProvider })(request())).status, 200);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','personal_schedule_occurrence_exceptions','series:occurrence:'||(date '2020-02-01'+n)::text,'a','manual','series',
        jsonb_build_object('seriesId','series','occurrenceDate',(date '2020-02-01'+n)::text,'cancelled',false,'patch',jsonb_build_object('startsAt','2030-03-01T00:00:00Z','endsAt','2030-04-02T00:00:00Z'),'updatedAt',$1::text),$1::timestamptz,$1::timestamptz from generate_series(1,1001) n`, [at]);
    let returned = 0;
    const executor = { async query(text: string, values?: readonly unknown[]) { const result = await pool.query(text, values as unknown[]); returned += result.rows.length; return result; } };
    await assert.rejects(readPersonalScheduleOccurrenceExceptions({ store, workspaceId: "w", actorId: "a", seriesId: "series", executor, window: { from: "2030-03-29T00:00:00Z", to: "2030-04-02T00:00:00Z", overlapFrom: "2030-04-01T00:00:00Z", occurrenceDates: [] } }), /CALENDAR_EXCEPTION_READ_CAP/);
    assert.equal(returned, 1001, "101st-style cap breach must be detected, not truncated as complete");
    const capped = await GET(request());
    assert.equal(capped.status, 503); assert.doesNotMatch(await capped.text(), /Private schedule|series:occurrence|CALENDAR_EXCEPTION_READ_CAP/);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
