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

function isProviderRequest(eventType: AppointmentOutboxEvent["eventType"]): boolean {
  return eventType === "appointment.calendar.requested" || eventType === "appointment.meeting.requested";
}

function isProviderCancellation(eventType: AppointmentOutboxEvent["eventType"]): boolean {
  return eventType === "appointment.calendar.cancel" || eventType === "appointment.meeting.cancel";
}

async function providerRevisionIsCurrent(
  runtime: EventOperationsPostgresRuntime,
  event: AppointmentOutboxEvent,
): Promise<boolean> {
  if (!isProviderRequest(event.eventType) && !isProviderCancellation(event.eventType)) return true;
  const result = await runtime.client.query<{ projection_revision: string | null }>(`
    select payload #>> '{projection,revision}' as projection_revision
      from appointment_aggregates
     where workspace_id = $1 and appointment_id = $2
  `, [runtime.workspaceId, event.appointmentId]);
  const row = result.rows[0];
  if (!row) throw new Error("Appointment aggregate is missing for provider projection.");
  return Number(row.projection_revision) === Number(event.payload.revision);
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
      const projection = await providerRevisionIsCurrent(input.runtime, item)
        ? await input.projector.project(item)
        : { notificationIds: [], policy: "superseded" as const };
      const result = await input.runtime.client.transaction(async (transaction) => {
        if ((isProviderRequest(item.eventType) || isProviderCancellation(item.eventType)) && projection.policy === "provider_not_configured") {
          await transaction.query(`update appointment_aggregates set payload = jsonb_set(
              payload, '{projection}', coalesce(payload -> 'projection', '{}'::jsonb) || $3::jsonb, true
            ), updated_at = greatest(updated_at, $4::timestamptz)
            where workspace_id = $1 and appointment_id = $2
              and (payload #>> '{projection,revision}')::bigint = $5`, [
            input.runtime.workspaceId,
            item.appointmentId,
            JSON.stringify({ calendar: "not_synced", meeting: "not_synced", updatedAt: item.createdAt }),
            item.createdAt,
            String(item.payload.revision),
          ]);
        }
        if (isProviderRequest(item.eventType) && projection.policy === "provider_synced") {
          const projectionPatch = {
            calendar: "synced",
            meeting: projection.meetingJoinUrl ? "synced" : "not_synced",
            provider: "google_calendar",
            providerRecordId: projection.providerRecordId,
            updatedAt: item.createdAt,
          };
          await transaction.query(`update appointment_aggregates set payload =
              case when $4::text is null then
                jsonb_set(payload, '{projection}', coalesce(payload -> 'projection', '{}'::jsonb) || $3::jsonb, true)
              else
                jsonb_set(
                  jsonb_set(payload, '{projection}', coalesce(payload -> 'projection', '{}'::jsonb) || $3::jsonb, true),
                  '{confirmed,medium,joinUrl}', to_jsonb($4::text), true
                )
              end,
              updated_at = greatest(updated_at, $5::timestamptz)
            where workspace_id = $1 and appointment_id = $2
              and (payload #>> '{projection,revision}')::bigint = $6`, [
            input.runtime.workspaceId,
            item.appointmentId,
            JSON.stringify(projectionPatch),
            projection.meetingJoinUrl ?? null,
            item.createdAt,
            String(item.payload.revision),
          ]);
        }
        if (isProviderCancellation(item.eventType) && projection.policy === "provider_cancelled") {
          await transaction.query(`update appointment_aggregates set payload = jsonb_set(
              payload, '{projection}', coalesce(payload -> 'projection', '{}'::jsonb) || $3::jsonb, true
            ), updated_at = greatest(updated_at, $4::timestamptz)
            where workspace_id = $1 and appointment_id = $2
              and (payload #>> '{projection,revision}')::bigint = $5`, [
            input.runtime.workspaceId,
            item.appointmentId,
            JSON.stringify({ calendar: "not_synced", meeting: "not_synced", updatedAt: item.createdAt }),
            item.createdAt,
            String(item.payload.revision),
          ]);
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
      await input.runtime.client.transaction(async (transaction) => {
        if (terminal && (isProviderRequest(item.eventType) || isProviderCancellation(item.eventType))) {
          await transaction.query(`update appointment_aggregates set payload = jsonb_set(
              payload, '{projection}', coalesce(payload -> 'projection', '{}'::jsonb) || $3::jsonb, true
            ), updated_at = now()
            where workspace_id = $1 and appointment_id = $2
              and (payload #>> '{projection,revision}')::bigint = $4`, [
            input.runtime.workspaceId,
            item.appointmentId,
            JSON.stringify({ calendar: "failed", meeting: "failed", updatedAt: item.createdAt }),
            String(item.payload.revision),
          ]);
        }
        await transaction.query(`update appointment_outbox set
          status = $4, available_at = case when $4 = 'retry' then now() + ($5 || ' seconds')::interval else available_at end,
          lease_token = null, lease_expires_at = null, last_error = $6, updated_at = now()
          where workspace_id = $1 and outbox_event_id = $2 and lease_token = $3`, [input.runtime.workspaceId, item.eventId, item.leaseToken, terminal ? "failed" : "retry", String(Math.min(300, 2 ** item.attemptCount)), error instanceof Error ? error.message : "Appointment projection failed."]);
      }, { isolation: "read committed" });
      if (terminal) failed += 1; else retried += 1;
    }
  }));
  return { completed, failed, retried };
}
