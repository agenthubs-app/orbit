import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createAppointmentInitialProposalBoundary, createAppointmentInitialProposalHandlers } from "../../app/api/appointments/initial-proposal-handlers";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

const databaseUrl = process.env.ORBIT_APPOINTMENT_TEST_DATABASE_URL;
test("initial proposal HTTP uses native scoped authority and atomic PG writes with independent participant readback", { skip: !databaseUrl }, async () => {
  const address = new URL(databaseUrl!); assert.ok(["localhost", "127.0.0.1"].includes(address.hostname)); assert.equal(address.search, "");
  const schema = `appointment_http_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool }), runtime = { client, workspaceId: "w" };
  try {
    await admin.query(`create schema ${schema}`); await runAppointmentMigrations(client);
    await pool.query(`create table event_ops_relationship_sides(workspace_id text,relationship_pair_id text,owner_actor_id text,contact_id text,
      primary key(workspace_id,relationship_pair_id,owner_actor_id),unique(workspace_id,owner_actor_id,contact_id));
      create table event_ops_contact_requests(workspace_id text,request_id text,event_id text,relationship_pair_id text,requester_actor_id text,target_actor_id text,status text,
      primary key(workspace_id,request_id));
      insert into event_ops_relationship_sides values('w','pair','a','contact-b'),('w','pair','b','contact-a');
      insert into event_ops_contact_requests values('w','accepted','event','pair','a','b','accepted')`);
    const handlers = createAppointmentInitialProposalHandlers({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), boundary: (workspace, contact) => createAppointmentInitialProposalBoundary(runtime, workspace, contact) });
    const proposal = { candidateTimes: [3, 4, 5].map(days => ({ startsAtUtc: new Date(Date.now() + days * 86_400_000).toISOString() })), durationMinutes: 60, medium: { kind: "phone", phoneHint: null }, note: "", timezone: "Asia/Tokyo" };
    const request = () => new Request("https://orbit.local/api/appointments/initial-proposal", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "pg-http-first" }, body: JSON.stringify({ contactId: "contact-b", proposal }) });
    assert.equal(createAppointmentInitialProposalBoundary(runtime, "foreign", "contact-b"), null);
    // Actual storage/verifier path refuses unilateral contact and non-participant actor.
    assert.deepEqual((await (await handlers.GET(new Request("https://orbit.local/api/appointments/initial-proposal?contactId=imported"))).json()).data, { contactId: "imported", available: false });
    const outsider = createAppointmentInitialProposalHandlers({ resolveActor: async () => ({ id: "outsider", workspaceId: "w" }), boundary: (workspace, contact) => createAppointmentInitialProposalBoundary(runtime, workspace, contact) });
    assert.equal((await outsider.POST(request())).status, 403);
    await pool.query("alter table appointment_outbox add constraint test_reject_delivery check(false)");
    assert.equal((await handlers.POST(request())).status, 503);
    for (const table of ["appointment_aggregates", "appointment_outbox", "appointment_command_receipts"]) assert.equal((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count, 0);
    await pool.query("alter table appointment_outbox drop constraint test_reject_delivery");
    const response = await handlers.POST(request()), receipt = (await response.json()).data;
    assert.equal(response.status, 201); assert.equal(receipt.status, "awaiting_response"); assert.equal(receipt.pendingProposalRevision, 1);
    const repository = createPostgresAppointmentRepository(runtime);
    const independent = await repository.getForActor(receipt.appointmentId, "b");
    assert.equal(independent?.contactIdsByActor.b, "contact-a"); assert.equal(independent?.version, receipt.version);
    assert.deepEqual(independent?.proposals[0].candidateTimes, receipt.proposals[0].candidateTimes);
    assert.equal((await handlers.POST(request())).status, 200);
    for (const table of ["appointment_aggregates", "appointment_outbox", "appointment_command_receipts"]) assert.equal((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count, 1);
    // Even between discovery and write, native verification must still bind the requested contact.
    const oldBoundary = createAppointmentInitialProposalBoundary(runtime, "w", "contact-b")!;
    await pool.query("update event_ops_relationship_sides set contact_id='changed' where owner_actor_id='a'");
    await assert.rejects(oldBoundary.service.createDraft({ actorId: "a", eventId: "event", authorityReference: "accepted", idempotencyKey: "changed-side", initialProposal: { ...proposal, medium: { kind: "phone", phoneHint: null } } }), /accepted bilateral/);
    assert.equal((await pool.query("select count(*)::int as count from appointment_outbox")).rows[0].count, 1);
  } finally { await client.close(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); }
});
