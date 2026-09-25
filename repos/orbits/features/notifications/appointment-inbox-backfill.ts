import { randomUUID } from 'node:crypto';

import type { AppointmentAggregate, AppointmentHistoryEntry } from '../appointments/contract';
import type { EventOperationsPostgresRuntime, EventOperationsSqlExecutor } from '../events/event-operations/storage/postgres-client';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { appointmentChangeNotification } from './inbox-business-projections';
import { createInboxRuntime } from './inbox-record-service-factory';
import { inboxNotificationId } from './inbox-record-service';
import { deliveryPolicyId, recordHistoricalNotificationSuppression } from './delivery-policy-repository';

const COLLECTION = 'notificationProjectionBackfill';
type Progress = {
  version: 1;
  actorId: string;
  batchId: string;
  cutoff: string;
  afterAppointmentId: string | null;
  done: boolean;
  processed: number;
  projected: number;
  suppressed: number;
  remindersScheduled: number;
  missingContacts: number;
};
type ContactRecord = { userId: string; payload: Record<string, unknown>; updatedAt: string; lifecycleState: string };

function required(value: string, field: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max || value.includes('\0')) throw Error(`APPOINTMENT_INBOX_BACKFILL_${field.toUpperCase()}_INVALID`);
  return value;
}

function parseProgress(value: unknown): Progress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('APPOINTMENT_INBOX_BACKFILL_PROGRESS_INVALID');
  const progress = value as Partial<Progress>;
  if (progress.version !== 1 || typeof progress.actorId !== 'string' || typeof progress.batchId !== 'string'
    || typeof progress.cutoff !== 'string' || !Number.isFinite(Date.parse(progress.cutoff))
    || (progress.afterAppointmentId !== null && typeof progress.afterAppointmentId !== 'string')
    || typeof progress.done !== 'boolean'
    || ![progress.processed, progress.projected, progress.suppressed, progress.remindersScheduled, progress.missingContacts].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)) {
    throw Error('APPOINTMENT_INBOX_BACKFILL_PROGRESS_INVALID');
  }
  return progress as Progress;
}

function executorFor(client: EventOperationsSqlExecutor): TransactionalSqlExecutor {
  return {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      return { rows: (await client.query<TRow>(text, values)).rows };
    },
  };
}

function inboxClient(runtime: EventOperationsPostgresRuntime): TransactionalPostgresClient {
  return {
    ...executorFor(runtime.client),
    async transaction<T>(operation: (executor: TransactionalSqlExecutor) => Promise<T>) {
      return runtime.client.transaction((executor) => operation(executorFor(executor)), { isolation: 'read committed' });
    },
    async close() {},
  };
}

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function commandNotification(input: {
  actorId: string;
  appointment: AppointmentAggregate;
  contact: ContactRecord;
  contactId: string;
  history: AppointmentHistoryEntry;
  now: string;
}) {
  const name = input.contact.payload.displayName;
  if (typeof name !== 'string' || !name.trim()) return null;
  const proposal = input.appointment.proposals.find((item) => item.revision === input.history.proposalRevision);
  const notification = appointmentChangeNotification({
    actorId: input.actorId,
    appointmentId: input.appointment.appointmentId,
    contactId: input.contactId,
    contactName: name,
    history: input.history,
    ...(input.history.command === 'accept' && input.appointment.confirmed?.proposalRevision === input.history.proposalRevision
      ? { time: input.appointment.confirmed.startsAtUtc, timeZone: proposal?.timezone ?? input.appointment.confirmed.timezone }
      : {}),
  });
  if (!notification) return null;
  return {
    ...notification,
    sources: [...notification.sources, {
      sourceKind: 'contact' as const,
      sourceId: input.contactId,
      sourceRevision: input.contact.updatedAt,
      occurredAt: input.history.at,
      readAt: input.now,
    }],
  };
}

async function readContact(input: { client: EventOperationsPostgresRuntime['client']; workspaceId: string; actorId: string; contactId: string }): Promise<ContactRecord | null> {
  const result = await input.client.query<{ user_id: string; payload: Record<string, unknown> | string; updated_at: Date | string; lifecycle_state: string }>(`select user_id,payload,updated_at,lifecycle_state from orbit_records
    where workspace_id=$1 and collection_name='contacts' and record_id=$2 and user_id=$3 and lifecycle_state='active' limit 1`, [input.workspaceId, input.contactId, input.actorId]);
  const row = result.rows[0];
  if (!row) return null;
  const payload = object(row.payload);
  if (!payload) return null;
  return { userId: row.user_id, payload, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at), lifecycleState: row.lifecycle_state };
}

function upcomingConfirmed(appointment: AppointmentAggregate, now: string) {
  const confirmed = appointment.confirmed;
  return Boolean(confirmed && ['confirmed', 'reschedule_pending'].includes(appointment.status)
    && !appointment.reminders.cancelled && appointment.reminders.currentRevision === confirmed.proposalRevision
    && Number.isFinite(Date.parse(confirmed.startsAtUtc)) && Date.parse(confirmed.startsAtUtc) > Date.parse(now));
}

async function ensureThirtyMinuteOutboxEvent(input: {
  client: EventOperationsPostgresRuntime['client'];
  workspaceId: string;
  appointment: AppointmentAggregate;
  now: string;
}): Promise<boolean> {
  const appointment = input.appointment;
  if (!upcomingConfirmed(appointment, input.now) || !appointment.confirmed) return false;
  const revision = appointment.confirmed.proposalRevision;
  const availableAt = new Date(Date.parse(appointment.confirmed.startsAtUtc) - 30 * 60_000).toISOString();
  const dedupeKey = `${appointment.appointmentId}:${revision}:t30m`;
  const payload = {
    appointmentId: appointment.appointmentId,
    confirmed: appointment.confirmed,
    contactIdsByActor: appointment.contactIdsByActor,
    eventId: appointment.eventId,
    initiatedByActorId: null,
    notificationRecipientActorIds: null,
    participantActorIds: [appointment.ownerActorId, appointment.inviteeActorId],
    revision,
  };
  const inserted = await input.client.query(`insert into appointment_outbox (
      workspace_id,outbox_event_id,appointment_id,aggregate_version,event_type,dedupe_key,payload,status,available_at,created_at,updated_at
    ) values ($1,$2,$3,$4,'appointment.reminder.t30m',$5,$6,'pending',$7,$8,$8)
    on conflict (workspace_id,dedupe_key) do nothing`, [
    input.workspaceId, `appointment-event:${randomUUID()}`, appointment.appointmentId, appointment.version,
    dedupeKey, payload, availableAt, input.now,
  ]);
  return inserted.rowCount === 1;
}

/** Explicit, bounded migration pass. It is never called by a route or worker. */
export async function runAppointmentInboxBackfillPass(input: {
  runtime: EventOperationsPostgresRuntime;
  actorId: string;
  batchId: string;
  cutoff: string;
  writersReady: boolean;
  limit?: number;
  now?: () => string;
}) {
  const actorId = required(input.actorId, 'actor');
  const batchId = required(input.batchId, 'batch', 128);
  const cutoff = required(input.cutoff, 'cutoff', 40);
  const currentTime = input.now ?? (() => new Date().toISOString());
  const now = currentTime();
  const limit = input.limit ?? 10;
  if (input.writersReady !== true || !Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff) > Date.parse(now)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw Error('APPOINTMENT_INBOX_BACKFILL_INPUT_INVALID');

  const { workspaceId, client } = input.runtime;
  const recordId = deliveryPolicyId('appointment-inbox', actorId, batchId);
  const store = createPostgresLiveRecordStore({ client });
  const saved = await store.getRecord({ workspaceId, collectionName: COLLECTION, recordId });
  if (saved && (saved.userId !== actorId || saved.lifecycleState !== 'active')) throw Error('APPOINTMENT_INBOX_BACKFILL_PROGRESS_INVALID');
  const progress = saved
    ? parseProgress(saved.payload)
    : { version: 1 as const, actorId, batchId, cutoff, afterAppointmentId: null, done: false, processed: 0, projected: 0, suppressed: 0, remindersScheduled: 0, missingContacts: 0 };
  if (progress.actorId !== actorId || progress.batchId !== batchId || progress.cutoff !== cutoff) throw Error('APPOINTMENT_INBOX_BACKFILL_PROGRESS_CONFLICT');
  if (progress.done) return { advanced: 0, progress, deferred: false };

  const page = await client.query<{ appointment_id: string; payload: AppointmentAggregate | string }>(`select appointment_id,payload from appointment_aggregates
    where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)
      and ($3::text is null or appointment_id collate "C">$3 collate "C")
    order by appointment_id collate "C" limit $4`, [workspaceId, actorId, progress.afterAppointmentId, limit]);
  const inbox = createInboxRuntime({ client: inboxClient(input.runtime), workspaceId, now: currentTime });
  let projected = 0, suppressed = 0, remindersScheduled = 0, missingContacts = 0;
  for (const row of page.rows) {
    const appointment = object(row.payload) as unknown as AppointmentAggregate | null;
    if (!appointment || appointment.appointmentId !== row.appointment_id) throw Error('APPOINTMENT_INBOX_BACKFILL_AGGREGATE_INVALID');
    const contactIds = appointment.contactIdsByActor ?? {};
    const contactId = contactIds[actorId];
    if (typeof contactId === 'string' && contactId.trim()) {
      const contact = await readContact({ client, workspaceId, actorId, contactId });
      if (!contact) missingContacts++;
      else for (const history of appointment.history) {
        if (!Number.isFinite(Date.parse(history.at)) || Date.parse(history.at) > Date.parse(cutoff)) continue;
        const notification = commandNotification({ actorId, appointment, contact, contactId, history, now: currentTime() });
        if (!notification) continue;
        const scheduledFor = notification.scheduledFor ?? notification.occurredAt;
        const notificationId = inboxNotificationId(actorId, notification.semanticKey);
        // Fence historical pushes first. If a process stops between this and
        // upsert, replay is safe: both the fence and inbox identity are stable.
        await client.transaction(async transaction => recordHistoricalNotificationSuppression({
          executor: executorFor(transaction), workspaceId, actorId, notificationId, scheduledFor, cutoff,
          now: currentTime(), batchId,
        }), { isolation: 'read committed' });
        await inbox.service.upsert(notification);
        projected++;
        suppressed++;
      }
    } else missingContacts++;

    if (await ensureThirtyMinuteOutboxEvent({ client, workspaceId, appointment, now: currentTime() })) remindersScheduled++;
  }

  const last = page.rows.at(-1)?.appointment_id ?? progress.afterAppointmentId;
  const next: Progress = {
    ...progress,
    afterAppointmentId: last,
    done: page.rows.length < limit,
    processed: progress.processed + page.rows.length,
    projected: progress.projected + projected,
    suppressed: progress.suppressed + suppressed,
    remindersScheduled: progress.remindersScheduled + remindersScheduled,
    missingContacts: progress.missingContacts + missingContacts,
  };
  const at = currentTime();
  await store.upsertRecord({ workspaceId, collectionName: COLLECTION, recordId, userId: actorId, sourceType: 'system', sourceId: recordId,
    evidenceIds: [], lifecycleState: 'active', createdAt: saved?.createdAt ?? at, updatedAt: at, payload: next });
  return { advanced: page.rows.length, progress: next, deferred: !next.done };
}
