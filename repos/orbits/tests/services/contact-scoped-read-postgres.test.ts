import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test("contact scope keeps storage keys distinct from domain contact IDs", async () => {
  const calls: (readonly unknown[] | undefined)[] = [];
  const client: LiveRecordSqlClient = {
    async query<T>(_sql: string, values?: readonly unknown[]) {
      calls.push(values);
      return { rows: (calls.length === 1
        ? [{ record_id: "storage:contact", contact_id: "domain:contact" }]
        : [{ collection_name: "connections", record_id: "storage:connection" }]) as T[] };
    },
  };
  const result = await createPostgresContactScopeRecordReader({ client, workspaceId: "w" })("a");
  assert.deepEqual(result.contactIds, ["storage:contact"]);
  assert.deepEqual(calls[1]?.[2], ["domain:contact"], "Relationship foreign keys refer to payload.id, not record_id");
});
test("contact detail SQL transfer stays fixed as unrelated relationships and private notes grow", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(databaseUrl);
  const schema = `contact_read_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const raw = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  let bytes = 0;
  let rows = 0;
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await raw.query<T>(sql, values);
    bytes += Buffer.byteLength(JSON.stringify(result.rows));
    rows += result.rows.length;
    return result;
  } };
  const workspaceId = "workspace:read-test";
  const actorId = "actor:owner";
  const now = "2026-09-17T02:00:00.000Z";
  try {
    await admin.query(`create schema ${schema}`);
    await raw.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const provider = createStorageContactGraphProvider({ store, workspaceId, contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId }) });
    const base = { source: { type: "manual", id: "read-test" }, evidenceIds: ["evidence:test"], createdAt: now, updatedAt: now };
    for (const [collection, payload, owner] of [
      ["contacts", { ...base, id: "contact:target", displayName: "Target", stage: "captured" }, actorId],
      // Positive cost fixture has authoritative ownership on both records.
      ["connections", { ...base, id: "connection:target", contactId: "contact:target", accountId: actorId, summary: "Target relationship", stage: "active", version: 1, valueTypes: [] }, actorId],
    ] as const) {
      await raw.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,$2,$3,$4,'manual','read-test',$5,$6,$6)", [workspaceId, collection, payload.id, owner, payload, now]);
    }
    await provider.upsertContactDetailState!({ actorId, contactId: "contact:target", tags: ["keep"], notes: [], status: "nurture", updatedAt: now });
    const measure = async () => {
      bytes = 0; rows = 0;
      const graph = await provider.readContactGraphForContact!("contact:target", actorId);
      return { graph, bytes, rows };
    };
    const before = await measure();
    assert.equal(before.graph.contacts[0]?.stage, "active");
    assert.deepEqual(before.graph.contacts[0]?.customTags, ["keep"]);
    await raw.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select $1, collection, collection || ':' || n, $2, 'manual','unrelated',
        jsonb_build_object('contactId','unrelated:' || n,'accountId',$2::text,'notes',repeat('private unrelated ',1000)), $3,$3
      from generate_series(1,100) n cross join (values ('connections'),('contact_detail_states')) c(collection)`, [workspaceId,actorId,now]);
    const after = await measure();
    assert.deepEqual(after.graph, before.graph);
    assert.equal(after.rows, before.rows, "Unrelated rows must never leave PostgreSQL");
    assert.equal(after.bytes, before.bytes, "Unrelated private payload must not increase result transfer");
    bytes = 0; rows = 0;
    const legacyGraph = await createStorageContactGraphProvider({ store, workspaceId }).readContactGraphForContact!("contact:target", actorId);
    const legacy = { bytes, rows };
    assert.deepEqual(legacyGraph, after.graph, "SQL scoping must preserve the existing graph");
    assert.ok(legacy.bytes > after.bytes * 100, "Large unrelated private payload exposes the old amplification");
    await raw.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select $1, collection, collection || ':' || n, $2, 'manual','unrelated',
        jsonb_build_object('contactId','unrelated:' || n,'accountId',$2::text,'notes',repeat('private unrelated ',1000)), $3,$3
      from generate_series(101,1000) n cross join (values ('connections'),('contact_detail_states')) c(collection)`, [workspaceId,actorId,now]);
    const tenfold = await measure();
    assert.deepEqual(tenfold, after, "10x unrelated records must not change the graph or result bytes");
    const foreign = await provider.readContactGraphForContact!("contact:target", "actor:stranger");
    assert.equal(foreign.contacts.length, 0);
    bytes = 0; rows = 0;
    assert.equal((await provider.readContactGraphForContact!("contact:target")).contacts.length, 0);
    assert.equal(rows, 0, "No actor means no query");
    await provider.updateContactPrimaryIndustry!("contact:target", actorId, "finance_investment");
    assert.ok(bytes < 20000, `Industry authorization must stay targeted: ${bytes}`);
    await assert.rejects(() => Promise.resolve(provider.updateContactPrimaryIndustry!("contact:target", "actor:stranger", null)), /outside the actor boundary/);
    // Do not silently pick one canonical connection to obtain a smaller response.
    await raw.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) select workspace_id,collection_name,'connection:duplicate',user_id,source_type,source_id,payload || '{"id":"connection:duplicate"}'::jsonb,created_at,updated_at from orbit_records where record_id='connection:target'`);
    await assert.rejects(() => Promise.resolve(provider.readContactGraphForContact!("contact:target", actorId)), /CONTACT_DETAIL_AMBIGUOUS_CONNECTION/);
    console.log(JSON.stringify({ measurement: "contact-detail-result-json-not-wire-bytes", legacy, before: { bytes: before.bytes, rows: before.rows }, after: { bytes: after.bytes, rows: after.rows }, tenfold: { bytes: tenfold.bytes, rows: tenfold.rows } }));
  } finally {
    await raw.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});
