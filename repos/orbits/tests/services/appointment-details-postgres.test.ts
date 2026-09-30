import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { AppointmentError } from "../../features/appointments/contract";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("PostgreSQL keeps shared appointment details idempotent and accepts only one concurrent version", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_details_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  const owner = "actor:details-owner";
  const invitee = "actor:details-invitee";
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(runtime.client);
    const service = createAppointmentService({
      authorityVerifier: { async resolveAcceptedBilateralContact() {
        return { authorityRequestId: "request:details", contactIdsByActor: { [owner]: "contact:invitee", [invitee]: "contact:owner" }, counterpartyActorId: invitee, relationshipPairId: "pair:details" };
      } },
      now: () => "2026-09-15T08:00:00.000Z",
      repository: createPostgresAppointmentRepository(runtime),
    });
    const created = await service.createDraft({ actorId: owner, appointmentId: "appointment:postgres-details", authorityReference: "request:details", eventId: null, idempotencyKey: "create-details" });
    const first = await service.updateDetails({ actorId: owner, appointmentId: created.appointment.appointmentId, details: "共享说明", expectedVersion: 1, idempotencyKey: "details-first" });
    assert.equal((await service.get({ actorId: invitee, appointmentId: created.appointment.appointmentId })).details, "共享说明");
    assert.equal((await service.updateDetails({ actorId: owner, appointmentId: created.appointment.appointmentId, details: "共享说明", expectedVersion: 1, idempotencyKey: "details-first" })).replayed, true);

    const concurrent = await Promise.allSettled([
      service.updateDetails({ actorId: owner, appointmentId: created.appointment.appointmentId, details: "owner update", expectedVersion: first.appointment.version, idempotencyKey: "details-owner-race" }),
      service.updateDetails({ actorId: invitee, appointmentId: created.appointment.appointmentId, details: "invitee update", expectedVersion: first.appointment.version, idempotencyKey: "details-invitee-race" }),
    ]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected" && result.reason instanceof AppointmentError && result.reason.code === "APPOINTMENT_CONFLICT").length, 1);
    const stored = await service.get({ actorId: invitee, appointmentId: created.appointment.appointmentId });
    assert.ok(stored.details === "owner update" || stored.details === "invitee update");
    assert.equal(stored.version, 3);
    const outbox = await runtime.client.query<{ count: string }>("select count(*)::text as count from appointment_outbox where workspace_id = $1", [workspaceId]);
    assert.equal(outbox.rows[0]?.count, "0");
  } finally {
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

// Root cause of the "concurrent version" flake (0123): mutate runs SERIALIZABLE. When the
// loser's snapshot is taken before the winner commits, its SELECT … FOR UPDATE fails with
// SQLSTATE 40001 instead of reaching the version check, so it surfaced as a raw database
// error rather than APPOINTMENT_CONFLICT. This forces that interleaving deterministically.
test("a serialization failure on a concurrent update is reported as APPOINTMENT_CONFLICT", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_details_race_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  const owner = "actor:race-owner";
  const invitee = "actor:race-invitee";
  const blocker = await pool.connect();
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(runtime.client);
    const service = createAppointmentService({
      authorityVerifier: { async resolveAcceptedBilateralContact() {
        return { authorityRequestId: "request:race", contactIdsByActor: { [owner]: "contact:invitee", [invitee]: "contact:owner" }, counterpartyActorId: invitee, relationshipPairId: "pair:race" };
      } },
      now: () => "2026-09-15T08:00:00.000Z",
      repository: createPostgresAppointmentRepository(runtime),
    });
    const created = await service.createDraft({ actorId: owner, appointmentId: "appointment:postgres-race", authorityReference: "request:race", eventId: null, idempotencyKey: "create-race" });

    // A competing writer holds the row lock.
    await blocker.query("begin");
    await blocker.query("select version from appointment_aggregates where workspace_id = $1 and appointment_id = $2 for update", [workspaceId, created.appointment.appointmentId]);
    const loser = service.updateDetails({ actorId: invitee, appointmentId: created.appointment.appointmentId, details: "late", expectedVersion: 1, idempotencyKey: "details-race-loser" })
      .then(() => null, (error: unknown) => error);
    // Wait until the loser has taken its snapshot and is queued on the lock.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = await admin.query("select count(*)::int as count from pg_stat_activity where wait_event_type = 'Lock' and query like '%appointment_aggregates%for update%' and pid <> pg_backend_pid()");
      if (waiting.rows[0].count > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await blocker.query("update appointment_aggregates set version = version + 1 where workspace_id = $1 and appointment_id = $2", [workspaceId, created.appointment.appointmentId]);
    await blocker.query("commit");

    const error = await loser;
    assert.ok(error instanceof AppointmentError, `expected AppointmentError, got ${String((error as { code?: unknown })?.code ?? error)}`);
    assert.equal(error.code, "APPOINTMENT_CONFLICT");
    const receipts = await runtime.client.query<{ count: string }>("select count(*)::text as count from appointment_command_receipts where workspace_id = $1 and idempotency_key = 'details-race-loser'", [workspaceId]);
    assert.equal(receipts.rows[0]?.count, "0", "the conflicting attempt leaves no receipt, so a retry with the new version is not a replay");
  } finally {
    blocker.release();
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
