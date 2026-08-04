import { randomUUID } from "node:crypto";

import type { AppointmentOutboxEvent } from "./contract";
import type { AppointmentNotificationProjector } from "./notification-projector";
import type { EventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";

type Row = Record<string, unknown>;

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Appointment outbox timestamp is invalid.");
  return date.toISOString();
}

function message(row: Row): AppointmentOutboxEvent & { attemptCount: number; leaseToken: string } {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  if (!payload || typeof payload !== "object") throw new Error("Appointment outbox payload is invalid.");
  return {
    aggregateVersion: Number(row.aggregate_version),
    appointmentId: String(row.appointment_id),
    attemptCount: Number(row.attempt_count),
    availableAt: timestamp(row.available_at),
    createdAt: timestamp(row.created_at),
    dedupeKey: String(row.dedupe_key),
    eventId: String(row.outbox_event_id),
    eventType: String(row.event_type) as AppointmentOutboxEvent["eventType"],
    leaseToken: String(row.lease_token),
    payload: payload as Readonly<Record<string, unknown>>,
  };
}

export async function runAppointmentOutboxBatch(input: {
  limit?: number;
  projector: AppointmentNotificationProjector;
  runtime: EventOperationsPostgresRuntime;
}): Promise<{ completed: number; failed: number; retried: number }> {
  const limit = Math.max(1, Math.min(64, Math.floor(input.limit ?? 16)));
  const workerId = `appointment-worker:${randomUUID()}`;
  const claimed = await input.runtime.client.transaction(async (tx) => {
    await tx.query(`update appointment_outbox set
      status = 'retry', lease_token = null, lease_expires_at = null,
      last_error = 'Worker lease expired.', updated_at = now()
      where workspace_id = $1 and status = 'processing' and lease_expires_at < now()`, [input.runtime.workspaceId]);
    return tx.query<Row>(`with candidates as (
      select outbox_event_id from appointment_outbox
      where workspace_id = $1 and status in ('pending', 'retry') and available_at <= now()
      order by available_at, outbox_event_id
      for update skip locked limit $2
    )
    update appointment_outbox item set
      status = 'processing', attempt_count = item.attempt_count + 1,
      lease_token = $3 || ':' || item.outbox_event_id,
      lease_expires_at = now() + interval '60 seconds', updated_at = now()
    from candidates where item.workspace_id = $1 and item.outbox_event_id = candidates.outbox_event_id
    returning item.*`, [input.runtime.workspaceId, limit, workerId]);
  }, { isolation: "read committed" });

  let completed = 0;
  let failed = 0;
  let retried = 0;
  await Promise.all(claimed.rows.map(async (row) => {
    const item = message(row);
    try {
      const projection = await input.projector.project(item);
      const result = await input.runtime.client.transaction(async (transaction) => {
        if ((item.eventType === "appointment.calendar.requested" || item.eventType === "appointment.meeting.requested") && projection.policy === "provider_not_configured") {
          const field = item.eventType === "appointment.calendar.requested" ? "calendar" : "meeting";
          await transaction.query(`update appointment_aggregates set payload = jsonb_set(
              payload, $3::text[], '"not_synced"'::jsonb, true
            ), updated_at = greatest(updated_at, $4::timestamptz)
            where workspace_id = $1 and appointment_id = $2
              and (payload #>> '{projection,revision}')::bigint = $5`, [input.runtime.workspaceId, item.appointmentId, ["projection", field], item.createdAt, String(item.payload.revision)]);
        }
        return transaction.query(`update appointment_outbox set
          status = 'completed', lease_token = null, lease_expires_at = null,
          last_error = null, payload = payload || $4::jsonb, updated_at = now()
          where workspace_id = $1 and outbox_event_id = $2 and lease_token = $3`, [input.runtime.workspaceId, item.eventId, item.leaseToken, JSON.stringify({ projection })]);
      }, { isolation: "read committed" });
      if (result.rowCount !== 1) throw new Error("Appointment outbox completion lease was lost.");
      completed += 1;
    } catch (error) {
      const terminal = item.attemptCount >= 10;
      await input.runtime.client.query(`update appointment_outbox set
        status = $4, available_at = case when $4 = 'retry' then now() + ($5 || ' seconds')::interval else available_at end,
        lease_token = null, lease_expires_at = null, last_error = $6, updated_at = now()
        where workspace_id = $1 and outbox_event_id = $2 and lease_token = $3`, [input.runtime.workspaceId, item.eventId, item.leaseToken, terminal ? "failed" : "retry", String(Math.min(300, 2 ** item.attemptCount)), error instanceof Error ? error.message : "Appointment projection failed."]);
      if (terminal) failed += 1; else retried += 1;
    }
  }));
  return { completed, failed, retried };
}
