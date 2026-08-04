import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import type { AppointmentAggregate, AppointmentOutboxEvent } from "../../features/appointments/contract";
import { createPostgresAppointmentNotificationProjector } from "../../features/appointments/notification-projector";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("a reminder already claimed for processing becomes a no-op when cancellation commits before its contact write", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_race_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const runtime = { client: createEventOperationsPostgresClient({ connectionString: databaseUrl, pool }), workspaceId };
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runAppointmentMigrations(runtime.client);
    const aggregate: AppointmentAggregate = {
      appointmentId: "appointment:cancel-race",
      authorityRequestId: "request:aiko-ren",
      confirmed: { candidateId: "candidate:1", confirmedAt: "2026-08-04T06:00:00.000Z", confirmedByActorId: "actor:ren", durationMinutes: 45, medium: { kind: "video", provider: "google_meet", joinUrl: null }, proposalRevision: 1, startsAtUtc: "2026-09-04T06:00:00.000Z", timezone: "Asia/Tokyo" },
      contactIdsByActor: { "actor:aiko": "contact:ren", "actor:ren": "contact:aiko" },
      createdAt: "2026-08-04T06:00:00.000Z",
      createdByActorId: "actor:aiko",
      eventId: "event:tokyo-ai-night",
      history: [],
      inviteeActorId: "actor:ren",
      ownerActorId: "actor:aiko",
      pendingProposalRevision: null,
      projection: { calendar: "pending", meeting: "pending", revision: 1 },
      proposals: [],
      relationshipPairId: "pair:aiko-ren",
      reminders: { cancelled: false, currentRevision: 1 },
      status: "confirmed",
      updatedAt: "2026-08-04T06:00:00.000Z",
      version: 3,
    };
    await pool.query(`insert into appointment_aggregates (
      workspace_id, appointment_id, owner_actor_id, invitee_actor_id,
      relationship_pair_id, authority_request_id, contact_ids_by_actor,
      event_id, status, version, payload, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`, [workspaceId, aggregate.appointmentId, aggregate.ownerActorId, aggregate.inviteeActorId, aggregate.relationshipPairId, aggregate.authorityRequestId, aggregate.contactIdsByActor, aggregate.eventId, aggregate.status, aggregate.version, aggregate, aggregate.createdAt]);

    const cancelling = await pool.connect();
    await cancelling.query("begin");
    await cancelling.query(`update appointment_aggregates set status = 'cancelled', payload = jsonb_set(jsonb_set(payload, '{status}', '"cancelled"'), '{reminders,cancelled}', 'true') where workspace_id = $1 and appointment_id = $2`, [workspaceId, aggregate.appointmentId]);
    const event: AppointmentOutboxEvent = {
      aggregateVersion: 3,
      appointmentId: aggregate.appointmentId,
      availableAt: "2026-09-03T06:00:00.000Z",
      createdAt: "2026-08-04T06:00:00.000Z",
      dedupeKey: "appointment:cancel-race:1:t24h",
      eventId: "outbox:cancel-race:t24h",
      eventType: "appointment.reminder.t24h",
      payload: { participantActorIds: [aggregate.ownerActorId, aggregate.inviteeActorId], revision: 1 },
    };
    const projection = createPostgresAppointmentNotificationProjector(runtime).project(event);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await cancelling.query("commit");
    cancelling.release();
    assert.equal((await projection).policy, "superseded");
    const notifications = await pool.query<{ count: string }>("select count(*)::text as count from orbit_records where workspace_id = $1 and collection_name = 'notifications'", [workspaceId]);
    assert.equal(notifications.rows[0]?.count, "0");
  } finally {
    await runtime.client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
