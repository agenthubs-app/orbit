import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("list projections preserve the complete API response while excluding detail-only payloads", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const schema = `list_projection_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL, max: 1, options: `-c search_path=${schema}` });
  let bytes = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values ? [...values] : undefined);
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    return { rows: result.rows as T[] };
  } };
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const timestamp = "2026-09-17T00:00:00.000Z";
    const common = { workspaceId: "w", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active" as const };
    const source = { type: "manual", id: "s" };
    await store.upsertRecord({ ...common, collectionName: "contacts", recordId: "c", searchText: "Visible designer", payload: { id: "c", displayName: "Visible", role: "designer", stage: "active", source, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, notes: "private note ".repeat(20000), rawCapture: "raw ".repeat(20000) } });
    await store.upsertRecord({ ...common, collectionName: "connections", recordId: "r", payload: { id: "r", accountId: "a", contactId: "c", stage: "active", summary: "A relationship", valueTypes: ["knowledge_exchange"], source, evidenceIds: ["e"], createdAt: timestamp, updatedAt: timestamp, raw: "private ".repeat(20000) } });
    await store.upsertRecord({ ...common, collectionName: "contact_detail_states", recordId: "d", payload: { actorId: "a", contactId: "c", status: "active", tags: ["Design"], updatedAt: timestamp, notes: [{ noteId: "note", body: "note ".repeat(20000), authorLabel: "Owner", createdAt: timestamp }] } });
    await store.upsertRecord({ ...common, collectionName: "evidence", recordId: "e", payload: { id: "e", sourceType: "manual", sourceId: "s", summary: "Evidence excerpt", confidence: 1, occurredAt: timestamp, createdBy: "owner", raw: "evidence raw ".repeat(20000) } });
    const provider = createStorageContactGraphProvider({ store, workspaceId: "w", contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId: "w" }) });
    const projected = createLiveContactsListSearchAndFilterService({ provider });
    const original = createLiveContactsListSearchAndFilterService({ provider: { ...provider, readContactGraphForList: undefined } });
    for (const input of [{}, { query: "designer" }, { tagFilters: ["Design"] }, { valueFilters: ["knowledge_exchange"] }, { limit: 1 }]) {
      bytes = 0;
      const expected = await original.listContacts({ ...input, actorId: "a" });
      const fullBytes = bytes;
      bytes = 0;
      const actual = await projected.listContacts({ ...input, actorId: "a" });
      assert.deepEqual(actual, expected);
      assert.ok(bytes < fullBytes / 20, `${bytes} must be much smaller than ${fullBytes}`);
    }
    const detail = await provider.readContactGraphForContact!("c", "a");
    assert.equal(detail.contacts[0]?.notes?.length, "private note ".repeat(20000).length);
  } finally {
    await pool.query(`drop schema ${schema} cascade`);
    await pool.end();
  }
});
