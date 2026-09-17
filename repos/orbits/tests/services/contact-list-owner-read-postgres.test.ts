import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("ordinary unpaged contact lists transfer no unrelated workspace payloads", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const schema = `list_owner_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  let rows = 0;
  let bytes = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    rows += result.rows.length;
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const timestamp = "2026-09-17T00:00:00.000Z";
    await store.upsertRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active", payload: { id: "c", displayName: "Visible", stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp } });
    const provider = createStorageContactGraphProvider({ store, workspaceId: "w", contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId: "w" }) });
    rows = 0; bytes = 0;
    const before = await provider.readContactGraph("a");
    const budget = { rows, bytes };
    assert.equal(before.contacts.length, 1);
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w',collection,collection || ':' || n,'stranger','manual','s',jsonb_build_object('id','foreign:' || n,'contactId','foreign:' || n,'accountId','stranger','private',repeat('secret',1000)),$1,$1
      from generate_series(1,1000) n cross join (values ('contacts'),('connections'),('contact_detail_states')) c(collection)`, [timestamp]);
    rows = 0; bytes = 0;
    const after = await provider.readContactGraph("a");
    assert.deepEqual(after, before);
    assert.deepEqual({ rows, bytes }, budget);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
