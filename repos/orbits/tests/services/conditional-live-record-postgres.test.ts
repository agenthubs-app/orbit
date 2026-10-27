import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const seed: LiveRecord = { workspaceId: "w", collectionName: "contacts", recordId: "c", userId: "a", sourceType: "manual", sourceId: "test", evidenceIds: [], createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z", lifecycleState: "active", payload: { name: "original" } };

for (const kind of ["memory", "postgres"] as const) {
  test(`${kind} conditional writes fence stale versions, owners and tombstones`, { skip: kind === "postgres" && !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
    const schema = `cas_${randomUUID().replaceAll("-", "")}`;
    const pool = kind === "postgres" ? new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` }) : null;
    try {
      if (pool) { await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); }
      const store = pool ? createPostgresLiveRecordStore({ client: { async query<T>(sql: string, values?: readonly unknown[]) { return { rows: (await pool.query(sql, values ? [...values] : undefined)).rows as T[] }; } } }) : createMemoryLiveRecordStore();
      await store.upsertRecord(seed);
      assert.equal(await store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c", userId: "other" }), null);
      const expected = { userId: "a", updatedAt: seed.updatedAt };
      const next = { ...seed, updatedAt: "2026-09-17T00:01:00.000Z", payload: { name: "winner" } };
      const results = await Promise.all([store.updateRecordIfCurrent!(next, expected), store.updateRecordIfCurrent!({ ...next, payload: { name: "other" } }, expected)]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await store.updateRecordIfCurrent!({ ...next, userId: "other" }, { ...expected, updatedAt: next.updatedAt }), null);
      assert.equal(await store.deleteRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c", deletedAt: next.updatedAt, userId: "other" }), null);
      await store.deleteRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c", deletedAt: next.updatedAt, userId: "a" });
      assert.equal(await store.updateRecordIfCurrent!(next, { ...expected, updatedAt: next.updatedAt }), null);
    } finally {
      if (pool) { await pool.query(`drop schema ${schema} cascade`); await pool.end(); }
    }
  });
}

test("postgres conditional writes accept rows stored with microsecond timestamps", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  // Rows written by SQL (seeds, backfills) keep microseconds; the record read back only has milliseconds,
  // and an exact comparison then refused every save with CONFLICT.
  const schema = `cas_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: { async query<T>(sql: string, values?: readonly unknown[]) { return { rows: (await pool.query(sql, values ? [...values] : undefined)).rows as T[] }; } } });
    await store.upsertRecord(seed);
    await pool.query(`update orbit_records set updated_at = '2026-09-17T00:00:00.123456Z', created_at = '2026-09-16T00:00:00.654321Z'`);
    const read = await store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c", userId: "a" });
    assert.ok(read);
    const written = await store.updateRecordIfCurrent!({ ...read, updatedAt: "2026-09-17T00:01:00.000Z", payload: { name: "saved" } }, { userId: "a", updatedAt: read.updatedAt });
    assert.equal(written?.payload.name, "saved");
  } finally {
    await pool.query(`drop schema ${schema} cascade`); await pool.end();
  }
});
