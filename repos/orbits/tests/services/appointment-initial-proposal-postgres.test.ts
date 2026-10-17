import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createAppointmentService } from "../../features/appointments/service";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

const databaseUrl = process.env.ORBIT_APPOINTMENT_TEST_DATABASE_URL;
test("initial proposal and outbox commit or roll back together in PostgreSQL; retry replays one receipt", { skip: !databaseUrl }, async () => {
  const address = new URL(databaseUrl!); assert.ok(["localhost", "127.0.0.1"].includes(address.hostname)); assert.equal(address.search, "");
  const schema = `appointment_initial_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl!, pool });
  const runtime = { client, workspaceId: "w" };
  try {
    await admin.query(`create schema ${schema}`); await runAppointmentMigrations(client);
    const service = createAppointmentService({ repository: createPostgresAppointmentRepository(runtime), now: () => "2026-10-18T00:00:00.000Z",
      authorityVerifier: { async resolveAcceptedBilateralContact() { return { authorityRequestId: "accepted", contactIdsByActor: { a: "contact-b", b: "contact-a" }, counterpartyActorId: "b", relationshipPairId: "pair" }; } } });
    const input = { actorId: "a", eventId: "event", authorityReference: "accepted", idempotencyKey: "first",
      initialProposal: { candidateTimes: [20, 21, 22].map(day => ({ startsAtUtc: `2026-10-${day}T01:00:00.000Z` })), durationMinutes: 60,
        medium: { kind: "phone" as const, phoneHint: null }, timezone: "Asia/Tokyo" } };
    // Fail after aggregate insertion, before receipt; the native transaction must undo every row.
    await pool.query("alter table appointment_outbox add constraint test_reject_delivery check(false)");
    await assert.rejects(service.createDraft(input), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23514"));
    for (const table of ["appointment_aggregates", "appointment_outbox", "appointment_command_receipts"]) {
      assert.equal((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count, 0, table);
    }
    await pool.query("alter table appointment_outbox drop constraint test_reject_delivery");
    const first = await service.createDraft(input), replay = await service.createDraft(input);
    assert.equal(first.appointment.status, "awaiting_response"); assert.equal(first.appointment.version, 2);
    assert.equal(replay.replayed, true); assert.deepEqual(replay.appointment, first.appointment);
    assert.deepEqual(await service.get({ actorId: "b", appointmentId: first.appointment.appointmentId }), first.appointment);
    for (const table of ["appointment_aggregates", "appointment_outbox", "appointment_command_receipts"]) {
      assert.equal((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count, 1, table);
    }
    const event = (await pool.query("select event_type,payload from appointment_outbox")).rows[0];
    assert.equal(event.event_type, "appointment.proposed"); assert.deepEqual(event.payload.notificationRecipientActorIds, ["b"]);
  } finally { await client.close(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end(); }
});
