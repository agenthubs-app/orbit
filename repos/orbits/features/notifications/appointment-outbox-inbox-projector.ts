import type { AppointmentAggregate, AppointmentHistoryEntry, AppointmentOutboxEvent } from '../appointments/contract';
import { appointmentChangeNotification } from './inbox-business-projections';
import { hasExplicitAppointmentReminder } from './inbox-reminder-policy';
import { inboxNotificationId, type InboxNotificationUpsert } from './inbox-record-service';
import type { EventOperationsPostgresClient } from '../events/event-operations/storage/postgres-client';
import type { TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';

type ProjectableAppointmentEvent = AppointmentOutboxEvent & { attemptCount?: number; leaseToken?: string };
type InboxWriter = { upsert(notification: InboxNotificationUpsert): Promise<unknown> };
type AppointmentRow = { payload: AppointmentAggregate | string; status: string };
type ContactRow = { record_id: string; user_id: string; payload: Record<string, unknown> | string; updated_at: Date | string; lifecycle_state: string };

const HISTORY_COMMANDS: Partial<Record<AppointmentOutboxEvent['eventType'], AppointmentHistoryEntry['command']>> = {
  'appointment.proposed': 'propose',
  'appointment.countered': 'counter',
  'appointment.reschedule.proposed': 'propose',
  'appointment.declined': 'decline',
  'appointment.reschedule.declined': 'decline',
  'appointment.confirmed': 'accept',
  'appointment.rescheduled': 'accept',
  'appointment.cancelled': 'cancel',
};

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function actorsFor(event: AppointmentOutboxEvent): readonly string[] {
  const raw = event.payload.participantActorIds;
  if (!Array.isArray(raw) || raw.length !== 2 || raw.some((value) => !string(value))) {
    throw new Error('Appointment inbox projection requires exactly two participant actors.');
  }
  const participants = [...new Set(raw as string[])];
  if (participants.length !== 2) throw new Error('Appointment inbox projection participants must be distinct.');
  const recipients = event.payload.notificationRecipientActorIds;
  if (recipients === null || recipients === undefined) return participants;
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some((value) => !string(value) || !participants.includes(value))) {
    throw new Error('Appointment inbox recipients must be appointment participants.');
  }
  return [...new Set(recipients as string[])];
}

function currentAggregate(row: AppointmentRow | undefined): AppointmentAggregate | null {
  if (!row) return null;
  const value = objectValue(row.payload);
  return value as unknown as AppointmentAggregate | null;
}

function assertCanonicalParticipants(event: AppointmentOutboxEvent, appointment: AppointmentAggregate): void {
  const eventActors = event.payload.participantActorIds;
  const canonicalActors = [appointment.ownerActorId, appointment.inviteeActorId];
  if (!Array.isArray(eventActors) || eventActors.length !== 2
    || [...new Set(eventActors)].sort().join('\u0000') !== [...new Set(canonicalActors)].sort().join('\u0000')
    || new Set(eventActors).size !== 2 || new Set(canonicalActors).size !== 2) {
    throw new Error('Appointment outbox participants do not match the aggregate.');
  }
}

function meetingCopy(contactName: string) {
  return {
    zh: { title: `与${contactName}的约谈将于30分钟内开始`, reason: '已确认的约谈即将开始。' },
    en: { title: `Your meeting with ${contactName} starts within 30 minutes`, reason: 'Your confirmed meeting is coming up.' },
    ja: { title: `${contactName}さんとの面談が30分以内に始まります`, reason: '確定した面談の開始時刻が近づいています。' },
  } as const;
}

/**
 * Projects appointment history and the canonical 30-minute reminder from the
 * durable appointment outbox. This is intentionally a writer-only projection:
 * requests never scan appointment aggregates to reconstruct these rows.
 */
export function createAppointmentOutboxInboxProjector(input: {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  service: InboxWriter;
  now?: () => string;
}) {
  const now = input.now ?? (() => new Date().toISOString());
  const policyReader: TransactionalSqlExecutor = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      const result = await input.client.query<TRow>(text, values);
      return { rows: result.rows };
    },
  };

  async function readAggregate(appointmentId: string): Promise<AppointmentAggregate | null> {
    const result = await input.client.query<AppointmentRow>(`select status,payload from appointment_aggregates
      where workspace_id=$1 and appointment_id=$2`, [input.workspaceId, appointmentId]);
    return currentAggregate(result.rows[0]);
  }

  async function readContacts(actorIds: readonly string[], contactIds: readonly string[]): Promise<Map<string, ContactRow>> {
    if (!actorIds.length || !contactIds.length) return new Map();
    const result = await input.client.query<ContactRow>(`select record_id,user_id,payload,updated_at,lifecycle_state from orbit_records
      where workspace_id=$1 and collection_name='contacts' and lifecycle_state='active'
        and user_id=any($2::text[]) and record_id=any($3::text[])`, [input.workspaceId, actorIds, contactIds]);
    return new Map(result.rows.map((row) => [`${row.user_id}\u0000${row.record_id}`, row]));
  }

  async function projectHistory(event: ProjectableAppointmentEvent): Promise<readonly string[]> {
    const command = HISTORY_COMMANDS[event.eventType];
    if (!command) return [];
    const appointment = await readAggregate(event.appointmentId);
    if (!appointment || appointment.appointmentId !== event.appointmentId) throw new Error('Appointment history source is missing.');
    assertCanonicalParticipants(event, appointment);
    const history = appointment.history.find((entry) => entry.version === event.aggregateVersion);
    if (!history || history.command !== command) throw new Error('Appointment outbox event does not match durable history.');
    const initiatedByActorId = string(event.payload.initiatedByActorId);
    const proposalRevision = Number(event.payload.revision);
    if (!initiatedByActorId || !Number.isSafeInteger(proposalRevision) || proposalRevision < 0
      || history.actorId !== initiatedByActorId
      || (history.proposalRevision !== null && history.proposalRevision !== proposalRevision)) {
      throw new Error('Appointment outbox history facts are inconsistent.');
    }

    const recipients = actorsFor(event).filter((actorId) => actorId !== initiatedByActorId);
    const contactIdsByActor = appointment.contactIdsByActor;
    const contactIds = recipients.map((actorId) => string(contactIdsByActor?.[actorId])).filter((value): value is string => Boolean(value));
    if (contactIds.length !== recipients.length) throw new Error('Appointment history is missing an actor-owned contact.');
    const contacts = await readContacts(recipients, contactIds);
    const currentProposal = appointment.proposals.find((proposal) => proposal.revision === history.proposalRevision);
    const notificationIds: string[] = [];
    for (const actorId of recipients) {
      const contactId = string(contactIdsByActor?.[actorId]);
      const contact = contactId ? contacts.get(`${actorId}\u0000${contactId}`) : undefined;
      const contactPayload = objectValue(contact?.payload);
      const contactName = string(contactPayload?.displayName);
      if (!contact || contact.lifecycle_state !== 'active' || !contactName) continue;
      const notification = appointmentChangeNotification({
        actorId,
        appointmentId: appointment.appointmentId,
        contactId: contact.record_id,
        contactName,
        history,
        ...(history.command === 'accept' && appointment.confirmed?.proposalRevision === history.proposalRevision
          ? { time: appointment.confirmed.startsAtUtc, timeZone: currentProposal?.timezone ?? appointment.confirmed.timezone }
          : {}),
      });
      if (!notification) continue;
      const updatedAt = contact.updated_at instanceof Date ? contact.updated_at.toISOString() : String(contact.updated_at);
      await input.service.upsert({
        ...notification,
        sources: [...notification.sources, {
          sourceKind: 'contact', sourceId: contact.record_id, sourceRevision: updatedAt,
          occurredAt: history.at, readAt: now(),
        }],
      });
      notificationIds.push(inboxNotificationId(actorId, notification.semanticKey));
    }
    return notificationIds;
  }

  async function projectThirtyMinuteReminder(event: ProjectableAppointmentEvent): Promise<readonly string[]> {
    const revision = Number(event.payload.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Appointment 30-minute reminder revision is invalid.');
    const appointment = await readAggregate(event.appointmentId);
    if (!appointment || appointment.appointmentId !== event.appointmentId) throw new Error('Appointment reminder source is missing.');
    assertCanonicalParticipants(event, appointment);
    const confirmed = appointment.confirmed;
    if (!confirmed || !['confirmed', 'reschedule_pending'].includes(appointment.status)
      || appointment.reminders.cancelled || appointment.reminders.currentRevision !== revision
      || confirmed.proposalRevision !== revision) return [];
    const startsAt = Date.parse(confirmed.startsAtUtc);
    const fireAt = Date.parse(event.availableAt);
    const currentTime = Date.parse(now());
    const eventConfirmed = objectValue(event.payload.confirmed);
    if (![startsAt, fireAt, currentTime].every(Number.isFinite) || fireAt !== startsAt - 30 * 60_000) {
      throw new Error('Appointment 30-minute reminder timing is invalid.');
    }
    if (!eventConfirmed || Number(eventConfirmed.proposalRevision) !== revision || eventConfirmed.startsAtUtc !== confirmed.startsAtUtc) {
      throw new Error('Appointment 30-minute reminder facts do not match the current confirmation.');
    }
    // A retry that wakes after the meeting starts must never recreate a stale reminder.
    if (currentTime < fireAt || currentTime >= startsAt) return [];

    const recipients = actorsFor(event);
    const contactIdsByActor = appointment.contactIdsByActor;
    const contactIds = recipients.map((actorId) => string(contactIdsByActor?.[actorId])).filter((value): value is string => Boolean(value));
    if (contactIds.length !== recipients.length) throw new Error('Appointment reminder is missing an actor-owned contact.');
    const contacts = await readContacts(recipients, contactIds);
    const notificationIds: string[] = [];
    for (const actorId of recipients) {
      // The shared rule is also rechecked at read/dispatch time. An explicit,
      // active plan wins independently for each participant.
      if (await hasExplicitAppointmentReminder(policyReader, input.workspaceId, actorId, appointment.appointmentId)) continue;
      const contactId = string(contactIdsByActor?.[actorId]);
      const contact = contactId ? contacts.get(`${actorId}\u0000${contactId}`) : undefined;
      const contactName = string(objectValue(contact?.payload)?.displayName);
      if (!contact || contact.lifecycle_state !== 'active' || !contactName) continue;
      const copy = meetingCopy(contactName);
      const semanticKey = `meeting-reminder:${appointment.appointmentId}:${revision}`;
      const notification: InboxNotificationUpsert = {
        actorId,
        semanticKey,
        kind: 'reminder',
        origin: 'automation',
        ...copy.zh,
        copy,
        object: { id: contactId!, name: contactName },
        occurredAt: event.availableAt,
        dueAt: confirmed.startsAtUtc,
        scheduledFor: event.availableAt,
        expiresAt: confirmed.startsAtUtc,
        sources: [{
          sourceKind: 'appointment', sourceId: appointment.appointmentId,
          sourceRevision: String(appointment.version), occurredAt: appointment.updatedAt,
          readAt: now(),
        }],
        target: {
          kind: 'appointment', id: appointment.appointmentId,
          href: `/contacts/${encodeURIComponent(contactId!)}?appointmentId=${encodeURIComponent(appointment.appointmentId)}`,
          status: 'available',
        },
        actions: ['read', 'dismiss', 'handle'],
      };
      await input.service.upsert(notification);
      notificationIds.push(inboxNotificationId(actorId, semanticKey));
    }
    return notificationIds;
  }

  return {
    async project(event: ProjectableAppointmentEvent): Promise<{ notificationIds: readonly string[]; policy: 'projected' | 'not_applicable' | 'stale' }> {
      if (event.eventType === 'appointment.reminder.t30m') {
        const notificationIds = await projectThirtyMinuteReminder(event);
        return { notificationIds, policy: notificationIds.length ? 'projected' : 'stale' };
      }
      if (HISTORY_COMMANDS[event.eventType]) {
        const notificationIds = await projectHistory(event);
        return { notificationIds, policy: notificationIds.length ? 'projected' : 'stale' };
      }
      return { notificationIds: [], policy: 'not_applicable' };
    },
  };
}
