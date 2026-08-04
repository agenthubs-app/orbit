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

test("two actors with different contact ids negotiate one PostgreSQL appointment aggregate", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_pair_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  const A = "actor:aiko";
  const B = "actor:ren";
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(runtime.client);
    const service = createAppointmentService({
      authorityVerifier: { async resolveAcceptedBilateralContact(input) {
        if (input.authorityReference !== "request:aiko-ren" || (input.actorId !== A && input.actorId !== B)) return null;
        return { authorityRequestId: "request:aiko-ren", contactIdsByActor: { [A]: "contact:ren-owned-by-aiko", [B]: "contact:aiko-owned-by-ren" }, counterpartyActorId: input.actorId === A ? B : A, relationshipPairId: "pair:aiko-ren" };
      } },
      now: () => "2026-08-04T06:00:00.000Z",
      repository: createPostgresAppointmentRepository(runtime),
    });
    const created = await service.createDraft({ actorId: A, authorityReference: "request:aiko-ren", appointmentId: "appointment:aiko-ren", eventId: "event:tokyo-ai-night", idempotencyKey: "create:a" });
    assert.equal((await service.list({ actorId: B }))[0]?.appointmentId, created.appointment.appointmentId);
    assert.notEqual(created.appointment.contactIdsByActor[A], created.appointment.contactIdsByActor[B]);
    const proposed = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose:a", proposal: {
      candidateTimes: [
        { candidateId: "slot:1", startsAtUtc: "2026-09-10T01:00:00.000Z" },
        { candidateId: "slot:2", startsAtUtc: "2026-09-11T03:00:00.000Z" },
        { candidateId: "slot:3", startsAtUtc: "2026-09-12T08:00:00.000Z" },
      ], durationMinutes: 45, medium: { kind: "video", provider: "google_meet", joinUrl: null }, note: "Discuss a concrete cross-border mobility pilot.", timezone: "Asia/Tokyo",
    } });
    const confirmed = await service.command({ actorId: B, appointmentId: created.appointment.appointmentId, candidateId: "slot:2", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "accept:b" });
    assert.equal(confirmed.appointment.confirmed?.confirmedByActorId, B);
    await assert.rejects(() => service.createDraft({ actorId: B, authorityReference: "request:aiko-ren", appointmentId: "appointment:duplicate", eventId: "event:tokyo-ai-night", idempotencyKey: "create:b" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
  } finally {
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
