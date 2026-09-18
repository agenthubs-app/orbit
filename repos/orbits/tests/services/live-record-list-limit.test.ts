import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordListQuery,
} from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const W = "workspace:list-limit";

function record(index: number): LiveRecord<Record<string, unknown>> {
  const at = `2026-09-18T00:00:${String(index).padStart(2, "0")}.000Z`;
  return {
    workspaceId: W, collectionName: "widgets", recordId: `widget:${index}`, userId: "actor:a",
    sourceType: "manual", sourceId: "list-limit", evidenceIds: ["evidence:seed"],
    occurredAt: at, createdAt: at, updatedAt: at, lifecycleState: "active", payload: { id: `widget:${index}`, index },
  };
}

test("listRecords requires an explicit limit at the type level", () => {
  // Removing the expectation below must turn typecheck red: an unbounded read has to say so.
  // @ts-expect-error limit is required
  const missing: LiveRecordListQuery = { workspaceId: W, collectionName: "widgets" };
  const unbounded: LiveRecordListQuery = { workspaceId: W, collectionName: "widgets", limit: "unbounded" };
  const bounded: LiveRecordListQuery = { workspaceId: W, collectionName: "widgets", limit: 3 };
  assert.ok(missing && unbounded && bounded);
});

test("memory store truncates to the limit in its existing order and rejects invalid limits", () => {
  const store = createMemoryLiveRecordStore(Array.from({ length: 10 }, (_, index) => record(index)));
  const all = store.listRecords({ workspaceId: W, collectionName: "widgets", limit: "unbounded" });
  assert.equal(all.length, 10);
  const three = store.listRecords({ workspaceId: W, collectionName: "widgets", limit: 3 });
  assert.deepEqual(three.map((item) => item.recordId), all.slice(0, 3).map((item) => item.recordId));
  for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => store.listRecords({ workspaceId: W, collectionName: "widgets", limit }), /limit/i, `limit ${limit}`);
  }
});

test("postgres store pushes a numeric limit down into SQL and omits it for unbounded", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  const schema = `list_limit_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
  const statements: string[] = [];
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    statements.push(sql);
    const result = await pool.query(sql, values ? [...values] : undefined);
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (let index = 0; index < 10; index += 1) await store.upsertRecord(record(index));
    statements.length = 0;
    const all = await store.listRecords({ workspaceId: W, collectionName: "widgets", limit: "unbounded" });
    assert.equal(all.length, 10);
    assert.doesNotMatch(statements.at(-1)!, /\blimit\b/i, "unbounded must not emit LIMIT");
    const three = await store.listRecords({ workspaceId: W, collectionName: "widgets", limit: 3 });
    assert.match(statements.at(-1)!, /\blimit \$\d+\b/i, "numeric limit must be a bound parameter");
    assert.deepEqual(three.map((item) => item.recordId), all.slice(0, 3).map((item) => item.recordId), "first rows of the existing order");
    await assert.rejects(async () => store.listRecords({ workspaceId: W, collectionName: "widgets", limit: 0 }), /limit/i);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
