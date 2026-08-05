import type { ReminderActionWriter } from "../notifications/action-writer";
import type { AppointmentOutboxEvent } from "./contract";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsPostgresRuntime, type EventOperationsSqlExecutor } from "../events/event-operations/storage/postgres-client";

export interface AppointmentNotificationProjection {
  notificationIds: readonly string[];
  policy: "in_app" | "provider_not_configured" | "reminders_invalidated" | "superseded";
}

export interface AppointmentNotificationProjector {
  project(event: AppointmentOutboxEvent): Promise<AppointmentNotificationProjection>;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function revision(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Appointment outbox payload has an invalid revision.");
  return parsed;
}

function notificationActorIds(event: AppointmentOutboxEvent, participantActorIds: readonly string[]): readonly string[] {
  const explicit = stringArray(event.payload.notificationRecipientActorIds);
  if (event.payload.notificationRecipientActorIds === null || event.payload.notificationRecipientActorIds === undefined) return participantActorIds;
  if (!explicit.length || explicit.some((actorId) => !participantActorIds.includes(actorId))) {
    throw new Error("Appointment notification recipients must be appointment participants.");
  }
  return [...new Set(explicit)];
}

function contactIdFor(event: AppointmentOutboxEvent, actorId: string): string | null {
  const contactIdsByActor = event.payload.contactIdsByActor;
  if (!contactIdsByActor || typeof contactIdsByActor !== "object" || Array.isArray(contactIdsByActor)) return null;
  const contactId = (contactIdsByActor as Record<string, unknown>)[actorId];
  return typeof contactId === "string" && contactId.trim() ? contactId : null;
}

function actionHrefFor(event: AppointmentOutboxEvent, actorId: string): string | null {
  const contactId = contactIdFor(event, actorId);
  if (!contactId) return null;
  const query = new URLSearchParams();
  query.set("appointmentId", event.appointmentId);
  if (typeof event.payload.eventId === "string" && event.payload.eventId.trim()) query.set("eventId", event.payload.eventId);
  return `/app/contacts/${encodeURIComponent(contactId)}?${query.toString()}`;
}

function titleFor(event: AppointmentOutboxEvent, now: string): string | null {
  const eventType = event.eventType;
  switch (eventType) {
    case "appointment.proposed": return "收到新的约谈时间提议";
    case "appointment.countered": return "约谈时间有新的反提议";
    case "appointment.reschedule.proposed": return "收到约谈改期提议";
    case "appointment.confirmed": return "约谈已确认 · Calendar/Meet 未配置时不会自动同步";
    case "appointment.rescheduled": return "约谈改期已确认 · 旧提醒已失效";
    case "appointment.cancelled": return "约谈已取消";
    case "appointment.reminder.t24h":
    case "appointment.reminder.t1h": {
      const confirmed = event.payload.confirmed;
      const startsAtUtc = confirmed && typeof confirmed === "object" ? (confirmed as Record<string, unknown>).startsAtUtc : null;
      const remainingMinutes = typeof startsAtUtc === "string" ? Math.max(0, Math.ceil((Date.parse(startsAtUtc) - Date.parse(now)) / 60_000)) : null;
      if (remainingMinutes === null || !Number.isFinite(remainingMinutes)) return "约谈提醒 · 请查看已确认开始时间";
      if (remainingMinutes === 0) return "约谈已到开始时间或已经开始";
      if (remainingMinutes >= 120) return `约谈约 ${Math.ceil(remainingMinutes / 60)} 小时后开始`;
      return `约谈约 ${remainingMinutes} 分钟后开始`;
    }
    case "appointment.memo.t15m": return "约谈已到会后：先确认完成，再记录纪要与下一步";
    default: return null;
  }
}

export function createAppointmentNotificationProjector(input: {
  now?: () => string;
  writerForActor(actorId: string): ReminderActionWriter;
}): AppointmentNotificationProjector {
  return {
    async project(event) {
      const participantActorIds = stringArray(event.payload.participantActorIds);
      if (participantActorIds.length !== 2) throw new Error("Appointment notification requires exactly two participant actors.");
      const proposalRevision = revision(event.payload.revision);
      if (event.eventType === "appointment.reminders.invalidate") {
        if (proposalRevision < 1) throw new Error("Appointment reminder invalidation requires a positive revision.");
        const removed: string[] = [];
        for (const actorId of participantActorIds) {
          const writer = input.writerForActor(actorId);
          for (const type of ["t24h", "t1h", "t15m"] as const) {
            const notificationId = `notification:${event.appointmentId}:${proposalRevision}:${type}:${actorId}`;
            await writer.removeReminder(notificationId, event.createdAt);
            removed.push(notificationId);
          }
        }
        return { notificationIds: removed, policy: "reminders_invalidated" };
      }
      if (event.eventType === "appointment.calendar.cancel" || event.eventType === "appointment.meeting.cancel" || event.eventType === "appointment.calendar.requested" || event.eventType === "appointment.meeting.requested") {
        return { notificationIds: [], policy: "provider_not_configured" };
      }
      const title = titleFor(event, input.now?.() ?? new Date().toISOString());
      if (!title) throw new Error(`Unsupported appointment outbox event type: ${String(event.eventType)}`);
      const suffix = event.eventType === "appointment.reminder.t24h" ? "t24h" : event.eventType === "appointment.reminder.t1h" ? "t1h" : event.eventType === "appointment.memo.t15m" ? "t15m" : event.eventType.split(".").at(-1)!;
      const notificationIds: string[] = [];
      const actorIds = notificationActorIds(event, participantActorIds);
      for (const actorId of actorIds) {
        const reminderId = `notification:${event.appointmentId}:${proposalRevision}:${suffix}:${actorId}`;
        await input.writerForActor(actorId).createReminder({
          reminderId,
          title,
          dueAt: event.availableAt,
          contactId: contactIdFor(event, actorId) ?? undefined,
          evidenceIds: [`appointment:${event.appointmentId}:revision:${proposalRevision}`],
          now: event.createdAt,
        });
        notificationIds.push(reminderId);
      }
      return { notificationIds, policy: "in_app" };
    },
  };
}

function isReminder(eventType: AppointmentOutboxEvent["eventType"]): boolean {
  return eventType === "appointment.reminder.t24h" || eventType === "appointment.reminder.t1h" || eventType === "appointment.memo.t15m";
}

async function canonicalReminderIsCurrent(
  transaction: EventOperationsSqlExecutor,
  runtime: EventOperationsPostgresRuntime,
  event: AppointmentOutboxEvent,
  proposalRevision: number,
): Promise<boolean> {
  const result = await transaction.query<{ payload: Record<string, unknown> | string; status: string }>(`
    select status, payload from appointment_aggregates
    where workspace_id = $1 and appointment_id = $2
    for share
  `, [runtime.workspaceId, event.appointmentId]);
  const row = result.rows[0];
  if (!row) return false;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const reminders = payload?.reminders;
  return row.status !== "cancelled"
    && reminders !== null
    && typeof reminders === "object"
    && (reminders as Record<string, unknown>).cancelled !== true
    && Number((reminders as Record<string, unknown>).currentRevision) === proposalRevision;
}

async function upsertNotification(input: {
  actionHref: string | null;
  actorId: string;
  contactId: string | null;
  dueAt: string;
  evidenceIds: readonly string[];
  now: string;
  reminderId: string;
  runtime: EventOperationsPostgresRuntime;
  title: string;
  transaction: EventOperationsSqlExecutor;
}): Promise<void> {
  const payload = {
    id: input.reminderId,
    channel: "in_app",
    title: input.title,
    body: input.title,
    status: "pending",
    scheduledFor: input.dueAt,
    actionHref: input.actionHref ?? undefined,
    source: { type: "agent_action", id: input.reminderId, label: "Orbit Agent confirmed reminder" },
    evidenceIds: input.evidenceIds,
    createdAt: input.now,
  };
  await input.transaction.query(`
    insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type,
      source_id, source_label, provider, provider_record_id, evidence_ids,
      target_type, target_id, occurred_at, lifecycle_state, search_text,
      payload, created_at, updated_at, deleted_at
    ) values (
      $1, 'notifications', $2, $3, 'agent_action', $2,
      'Orbit Agent confirmed reminder', null, null, $4::text[],
      $5, $6, $7, 'active', $8, $9::jsonb, $7, $7, null
    )
    on conflict (workspace_id, collection_name, record_id) do update set
      user_id = excluded.user_id,
      evidence_ids = excluded.evidence_ids,
      occurred_at = excluded.occurred_at,
      lifecycle_state = 'active',
      search_text = excluded.search_text,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      deleted_at = null
  `, [
    input.runtime.workspaceId,
    input.reminderId,
    input.actorId,
    [...input.evidenceIds],
    input.contactId ? "contact" : "task",
    input.contactId,
    input.now,
    input.title,
    JSON.stringify(payload),
  ]);
}

export function createPostgresAppointmentNotificationProjector(runtime: EventOperationsPostgresRuntime): AppointmentNotificationProjector {
  return {
    async project(event) {
      const participantActorIds = stringArray(event.payload.participantActorIds);
      if (participantActorIds.length !== 2) throw new Error("Appointment notification requires exactly two participant actors.");
      const proposalRevision = revision(event.payload.revision);
      if (event.eventType === "appointment.reminders.invalidate") {
        if (proposalRevision < 1) throw new Error("Appointment reminder invalidation requires a positive revision.");
        const notificationIds = participantActorIds.flatMap((actorId) => ["t24h", "t1h", "t15m"].map((type) => `notification:${event.appointmentId}:${proposalRevision}:${type}:${actorId}`));
        await runtime.client.transaction(async (transaction) => {
          await transaction.query(`update orbit_records set
            lifecycle_state = 'deleted', deleted_at = $3, updated_at = $3
            where workspace_id = $1 and collection_name = 'notifications'
              and record_id = any($2::text[])`, [runtime.workspaceId, notificationIds, event.createdAt]);
        }, { isolation: "read committed" });
        return { notificationIds, policy: "reminders_invalidated" };
      }
      if (event.eventType === "appointment.calendar.cancel" || event.eventType === "appointment.meeting.cancel" || event.eventType === "appointment.calendar.requested" || event.eventType === "appointment.meeting.requested") return { notificationIds: [], policy: "provider_not_configured" };
      const title = titleFor(event, new Date().toISOString());
      if (!title) throw new Error(`Unsupported appointment outbox event type: ${String(event.eventType)}`);
      const suffix = event.eventType === "appointment.reminder.t24h" ? "t24h" : event.eventType === "appointment.reminder.t1h" ? "t1h" : event.eventType === "appointment.memo.t15m" ? "t15m" : event.eventType.split(".").at(-1)!;
      return runtime.client.transaction(async (transaction) => {
        if (isReminder(event.eventType) && !(await canonicalReminderIsCurrent(transaction, runtime, event, proposalRevision))) {
          return { notificationIds: [], policy: "superseded" as const };
        }
        const notificationIds: string[] = [];
        const actorIds = notificationActorIds(event, participantActorIds);
        for (const actorId of actorIds) {
          const reminderId = `notification:${event.appointmentId}:${proposalRevision}:${suffix}:${actorId}`;
          const contactId = contactIdFor(event, actorId);
          await upsertNotification({ actionHref: actionHrefFor(event, actorId), actorId, contactId, dueAt: event.availableAt, evidenceIds: [`appointment:${event.appointmentId}:revision:${proposalRevision}`], now: event.createdAt, reminderId, runtime, title, transaction });
          notificationIds.push(reminderId);
        }
        return { notificationIds, policy: "in_app" as const };
      }, { isolation: "read committed" });
    },
  };
}

export function createConfiguredAppointmentNotificationProjector(): AppointmentNotificationProjector | null {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  return runtime ? createPostgresAppointmentNotificationProjector(runtime) : null;
}
