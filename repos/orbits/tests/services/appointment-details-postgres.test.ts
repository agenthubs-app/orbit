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
