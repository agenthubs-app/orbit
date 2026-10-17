import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createAppointmentContactAuthorityReader } from "../../features/appointments/contact-authority";
import { resolveAcceptedEventContactContext } from "../../features/appointments/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

const databaseUrl = process.env.ORBIT_APPOINTMENT_TEST_DATABASE_URL;
test("contact context uses exact workspace/actor sides and rechecks native accepted bilateral consent", { skip: !databaseUrl }, async () => {
  const address = new URL(databaseUrl!); assert.ok(["localhost", "127.0.0.1"].includes(address.hostname)); assert.equal(address.search, "");
  const schema = `appointment_context_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  const runtime = { client, workspaceId: "w" };
  try {
    await admin.query(`create schema ${schema}`);
    // Only the existing verifier's native relational columns; no Orbit fixture records or consent shortcut.
    await pool.query(`create table event_ops_relationship_sides(workspace_id text,relationship_pair_id text,owner_actor_id text,contact_id text,
      primary key(workspace_id,relationship_pair_id,owner_actor_id),unique(workspace_id,owner_actor_id,contact_id));
      create table event_ops_contact_requests(workspace_id text,request_id text,event_id text,relationship_pair_id text,requester_actor_id text,target_actor_id text,status text,
      primary key(workspace_id,request_id));
      insert into event_ops_relationship_sides values('w','pair','a','contact-b'),('w','pair','b','contact-a');
      insert into event_ops_contact_requests values('w','accepted','event','pair','a','b','accepted')`);
    let queries = 0, bytes = 0;
    const reader = createAppointmentContactAuthorityReader({ workspaceId: "w", client: { async query(sql, values) {
      const result = await client.query(sql, values); queries++; bytes += Buffer.byteLength(JSON.stringify(result.rows)); return result;
    } }, verify: async input => { queries++; return resolveAcceptedEventContactContext(input, runtime); } });
    const expected = { eventId: "event", authorityReference: "accepted" };
    assert.deepEqual(await reader.read("a", "contact-b"), expected);
    assert.deepEqual(await reader.read("b", "contact-a"), expected, "both accepted sides may initiate, using their own distinct contact IDs");
    assert.equal(await reader.read("outsider", "contact-b"), null);
    assert.equal(await reader.read("a", "imported-unilateral-contact"), null);
    await pool.query("update event_ops_contact_requests set status='declined'");
    assert.equal(await reader.read("a", "contact-b"), null);
    await pool.query("update event_ops_contact_requests set status='accepted'");
    await pool.query("delete from event_ops_relationship_sides where owner_actor_id='b'");
    assert.equal(await reader.read("a", "contact-b"), null, "an accepted flag without both canonical sides is insufficient");
    await pool.query("insert into event_ops_relationship_sides values('w','pair','b','contact-a')");
    await pool.query("insert into event_ops_contact_requests values('w','second','another-event','pair','a','b','accepted')");
    await assert.rejects(reader.read("a", "contact-b"), /More than one accepted event context/);
    await pool.query("delete from event_ops_contact_requests where request_id='second'");
    await pool.query(`insert into event_ops_relationship_sides select 'foreign','pair:'||n,'a','foreign-contact:'||n from generate_series(1,10000)n`);
    queries = 0; bytes = 0;
    assert.deepEqual(await reader.read("a", "contact-b"), expected);
    assert.equal(queries, 2); assert.ok(bytes < 1024);
    console.info(JSON.stringify({ metric: "r20a_accepted_contact_context", unrelated: 10000, queries, discoveryBytes: bytes }));
  } finally { await client.close(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); }
});
