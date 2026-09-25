import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { createPostgresContactCardReader } from "../../features/contacts/storage/contact-list-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("same actor growth 100 / 10,000 / 100,000 keeps cold card-page transfer bounded", {
  skip: process.env.ORBIT_CONTACT_CARD_GROWTH !== "1", timeout: 240_000,
}, async () => {
  const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? "";
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname), "Growth tests are local-only");
  const schema = `card_growth_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url, max: 1, options: `-c search_path=${schema} -c statement_timeout=60000` });
  let bytes = 0;
  let queries = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++;
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const at = "2026-09-25T00:00:00.000Z";
    await store.upsertRecord({ workspaceId: "w", collectionName: "contacts", recordId: "seed", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], lifecycleState: "active", createdAt: at, updatedAt: at, payload: {
      id: "seed", displayName: "联系人", role: "Engineer", organization: "Org", stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at,
    } });
    let previous = 0;
    let firstBytes = 0;
    for (const size of [100, 10_000, 100_000]) {
      await pool.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, payload, created_at, updated_at)
        select workspace_id, collection_name, 'c' || lpad(n::text, 6, '0'), user_id, source_type, source_id, evidence_ids, lifecycle_state,
          payload || jsonb_build_object('id', 'c' || lpad(n::text, 6, '0')), created_at, updated_at
        from orbit_records cross join generate_series($1::integer, $2::integer) n where record_id='seed'`, [previous + 1, size]);
      await pool.query("analyze orbit_records");
      // A fresh reader, no private response cache. Same actor owns all history.
      const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-growth-secret-".repeat(3) });
      bytes = 0; queries = 0;
      const started = performance.now();
      const page = await reader.page({}, "a");
      const elapsed = Math.round(performance.now() - started);
      assert.equal(page.items.length, 30);
      assert.equal(queries, 1);
      assert.ok(bytes < 64_000, `${size}: ${bytes} bytes exceeds budget`);
      firstBytes ||= bytes;
      assert.ok(bytes <= firstBytes * 1.1, `${size}: returned bytes grew with history`);
      console.info(JSON.stringify({ metric: "contact_card_growth", actorContacts: size + 1, queries, returnedJsonBytes: bytes, elapsedMs: elapsed, cache: "off" }));
      bytes = 0; queries = 0;
      const summaryStarted = performance.now();
      const summary = await reader.summary({}, "a");
      assert.equal(summary.total, size + 1);
      assert.equal(queries, 1);
      assert.ok(bytes < 4_000);
      console.info(JSON.stringify({ metric: "contact_summary_growth", actorContacts: size + 1, queries, returnedJsonBytes: bytes, elapsedMs: Math.round(performance.now() - summaryStarted), cache: "off" }));
      previous = size;
    }
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
