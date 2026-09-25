import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppointmentAggregate, AppointmentOutboxEvent } from '../../features/appointments/contract';
import { createAppointmentOutboxInboxProjector } from '../../features/notifications/appointment-outbox-inbox-projector';
import type { InboxNotificationUpsert } from '../../features/notifications/inbox-record-service';
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from '../../features/events/event-operations/storage/postgres-client';
import { runAppointmentOutboxBatch } from '../../features/appointments/outbox-worker';
import type { AppointmentNotificationProjector } from '../../features/appointments/notification-projector';

const actorA = 'actor:a';
const actorB = 'actor:b';
const appointmentId = 'appointment:test';
const contactIds = { [actorA]: 'contact:for-a', [actorB]: 'contact:for-b' };

function aggregate(overrides: Partial<AppointmentAggregate> = {}): AppointmentAggregate {
  return {
    appointmentId,
    authorityRequestId: 'request:a-b',
    contactIdsByActor: contactIds,
    createdAt: '2026-09-26T08:00:00.000Z',
    createdByActorId: actorA,
    eventId: 'event:test',
    history: [{ actorId: actorA, at: '2026-09-26T08:00:00.000Z', command: 'propose', detail: 'Proposed.', proposalRevision: 1, version: 2 }],
    inviteeActorId: actorB,
    ownerActorId: actorA,
    pendingProposalRevision: 1,
    proposals: [{ candidateTimes: [{ candidateId: 'slot:1', startsAtUtc: '2026-09-26T10:40:00.000Z' }], createdAt: '2026-09-26T08:00:00.000Z', durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, note: '', proposedByActorId: actorA, revision: 1, timezone: 'UTC' }],
    confirmed: null,
    projection: { calendar: 'not_synced', meeting: 'not_synced', revision: null },
    relationshipPairId: 'pair:a-b',
    reminders: { cancelled: false, currentRevision: null },
    status: 'awaiting_response',
    updatedAt: '2026-09-26T08:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

function event(eventType: AppointmentOutboxEvent['eventType'], overrides: Partial<AppointmentOutboxEvent> = {}): AppointmentOutboxEvent {
  return {
    aggregateVersion: 2,
    appointmentId,
    availableAt: '2026-09-26T10:10:00.000Z',
    createdAt: '2026-09-26T08:00:00.000Z',
    dedupeKey: `${appointmentId}:1:${eventType}`,
    eventId: `outbox:${eventType}`,
    eventType,
    payload: {
      appointmentId,
      confirmed: null,
      contactIdsByActor: contactIds,
      eventId: 'event:test',
      initiatedByActorId: actorA,
      notificationRecipientActorIds: null,
      participantActorIds: [actorA, actorB],
      revision: 1,
    },
    ...overrides,
  };
}

function runtime(current: AppointmentAggregate, explicitActors: readonly string[] = [], at = '2026-09-26T10:15:00.000Z') {
  const written: InboxNotificationUpsert[] = [];
  const client = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      if (text.includes('from appointment_aggregates')) return { rowCount: 1, rows: [{ payload: current, status: current.status }] as TRow[] };
      if (text.includes("collection_name='contacts'")) {
        const actorIds = values?.[1] as string[];
        const ids = values?.[2] as string[];
        const rows = actorIds.flatMap((actorId) => {
          const recordId = contactIds[actorId as keyof typeof contactIds];
          return ids.includes(recordId) ? [{ record_id: recordId, user_id: actorId, payload: { displayName: actorId === actorA ? 'Alex' : 'Bea' }, updated_at: '2026-09-26T08:30:00.000Z', lifecycle_state: 'active' }] : [];
        });
        return { rowCount: rows.length, rows: rows as TRow[] };
      }
      if (text.includes("collection_name='reminderPlans'")) {
        const actorId = String(values?.[1]);
        return { rowCount: 1, rows: [{ present: explicitActors.includes(actorId) }] as TRow[] };
      }
      throw new Error(`Unexpected SQL in appointment inbox projection test: ${text}`);
    },
  } as unknown as EventOperationsPostgresClient;
  return {
    written,
    projector: createAppointmentOutboxInboxProjector({
      client,
      workspaceId: 'workspace:test',
      service: { async upsert(notification) { written.push(notification); return notification; } },
      now: () => at,
    }),
  };
}

test('appointment history outbox projects the other participant once and preserves the stable historical source', async () => {
  const { projector, written } = runtime(aggregate());
  const result = await projector.project(event('appointment.proposed'));

  assert.equal(result.policy, 'projected');
  assert.equal(written.length, 1, 'the initiating actor is suppressed');
  assert.equal(written[0]?.actorId, actorB);
  assert.equal(written[0]?.semanticKey, `appointment:${appointmentId}:2`);
  assert.equal(written[0]?.sources[0]?.sourceRevision, 'event:2');
  assert.equal(written[0]?.sources[1]?.sourceKind, 'contact');
});

test('due 30-minute outbox retry still creates the original scheduled reminder before the meeting, unless that actor chose an explicit plan', async () => {
  const confirmedAt = '2026-09-26T10:40:00.000Z';
  const current = aggregate({
    confirmed: { candidateId: 'slot:1', confirmedAt: '2026-09-26T09:00:00.000Z', confirmedByActorId: actorA, durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, proposalRevision: 3, startsAtUtc: confirmedAt, timezone: 'UTC' },
    history: [],
    reminders: { cancelled: false, currentRevision: 3 },
    status: 'confirmed',
    updatedAt: '2026-09-26T09:00:00.000Z',
    version: 7,
  });
  const { projector, written } = runtime(current, [actorA]);
  const dueEvent = event('appointment.reminder.t30m', {
    aggregateVersion: 7,
    availableAt: '2026-09-26T10:10:00.000Z',
    payload: { appointmentId, confirmed: current.confirmed, contactIdsByActor: contactIds, eventId: 'event:test', initiatedByActorId: null, notificationRecipientActorIds: null, participantActorIds: [actorA, actorB], revision: 3 },
  });

  const result = await projector.project(dueEvent);

  assert.equal(result.policy, 'projected');
  assert.equal(written.length, 1, 'active explicit reminder suppresses only its owner');
  assert.equal(written[0]?.actorId, actorB);
  assert.equal(written[0]?.semanticKey, `meeting-reminder:${appointmentId}:3`);
  assert.equal(written[0]?.scheduledFor, '2026-09-26T10:10:00.000Z', 'late worker keeps the originally scheduled fire time');
  assert.equal(written[0]?.dueAt, confirmedAt);
  assert.equal(written[0]?.expiresAt, confirmedAt);
});

test('appointment 30-minute reminder cannot materialize after the start or from a superseded confirmation', async () => {
  const confirmedAt = '2026-09-26T10:40:00.000Z';
  const current = aggregate({
    confirmed: { candidateId: 'slot:1', confirmedAt: '2026-09-26T09:00:00.000Z', confirmedByActorId: actorA, durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, proposalRevision: 3, startsAtUtc: confirmedAt, timezone: 'UTC' },
    history: [],
    reminders: { cancelled: false, currentRevision: 3 },
    status: 'confirmed',
    updatedAt: '2026-09-26T09:00:00.000Z',
    version: 7,
  });
  const { projector, written } = runtime(current, [], '2026-09-26T10:41:00.000Z');
  const dueEvent = event('appointment.reminder.t30m', {
    aggregateVersion: 7,
    availableAt: '2026-09-26T10:10:00.000Z',
    payload: { appointmentId, confirmed: current.confirmed, contactIdsByActor: contactIds, eventId: 'event:test', initiatedByActorId: null, notificationRecipientActorIds: null, participantActorIds: [actorA, actorB], revision: 3 },
  });

  await projector.project(dueEvent);
  assert.deepEqual(written, [], 'a late retry after the meeting start does not resurrect the reminder');

  const { projector: staleProjector, written: staleWritten } = runtime({
    ...current,
    reminders: { cancelled: false, currentRevision: 4 },
  }, []);
  const staleResult = await staleProjector.project(dueEvent);
  assert.equal(staleResult.policy, 'stale');
  assert.deepEqual(staleWritten, [], 'superseded or invalidated reminder facts do not materialize');
});

test('appointment outbox worker persists typed inbox reminders before completing the due event', async () => {
  const startsAtUtc = '2026-09-26T10:40:00.000Z';
  const current = aggregate({
    confirmed: { candidateId: 'slot:1', confirmedAt: '2026-09-26T09:00:00.000Z', confirmedByActorId: actorA, durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, proposalRevision: 3, startsAtUtc, timezone: 'UTC' },
    history: [],
    reminders: { cancelled: false, currentRevision: 3 },
    status: 'confirmed',
    updatedAt: '2026-09-26T09:00:00.000Z',
    version: 7,
  });
  const due = event('appointment.reminder.t30m', {
    aggregateVersion: 7,
    availableAt: '2026-09-26T10:10:00.000Z',
    payload: { appointmentId, confirmed: current.confirmed, contactIdsByActor: contactIds, eventId: 'event:test', initiatedByActorId: null, notificationRecipientActorIds: null, participantActorIds: [actorA, actorB], revision: 3 },
  });
  const inboxRows = new Map<string, Record<string, unknown>>();
  let completedAfterWrites = false;
  const dueRow = {
    aggregate_version: due.aggregateVersion,
    appointment_id: appointmentId,
    attempt_count: 1,
    available_at: due.availableAt,
    created_at: due.createdAt,
    dedupe_key: due.dedupeKey,
    event_type: due.eventType,
    lease_token: 'worker:event',
    outbox_event_id: due.eventId,
    payload: due.payload,
  };
  const query = async <TRow>(text: string, values?: readonly unknown[]) => {
    if (text.includes("status = 'retry'")) return { rowCount: 0, rows: [] as TRow[] };
    if (text.includes('with candidates as')) return { rowCount: 1, rows: [dueRow] as TRow[] };
    if (text.includes('from appointment_aggregates')) return { rowCount: 1, rows: [{ payload: current, status: current.status }] as TRow[] };
    if (text.includes("collection_name='contacts'")) {
      const actors = values?.[1] as string[];
      const ids = values?.[2] as string[];
      const rows = actors.flatMap((actorId) => {
        const recordId = contactIds[actorId as keyof typeof contactIds];
        return ids.includes(recordId) ? [{ record_id: recordId, user_id: actorId, payload: { displayName: actorId === actorA ? 'Alex' : 'Bea' }, updated_at: '2026-09-26T08:30:00.000Z', lifecycle_state: 'active' }] : [];
      });
      return { rowCount: rows.length, rows: rows as TRow[] };
    }
    if (text.includes("collection_name='reminderPlans'")) return { rowCount: 1, rows: [{ present: false }] as TRow[] };
    if (text.includes('from orbit_records') && text.includes('limit 1')) {
      const key = `${String(values?.[0])}\u0000${String(values?.[1])}\u0000${String(values?.[2])}`;
      const row = inboxRows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [row] as TRow[] : [] };
    }
    if (text.includes('insert into orbit_records')) {
      const [workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at] = values ?? [];
      const row = { workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload: typeof payload === 'string' ? JSON.parse(payload) : payload, created_at, updated_at, deleted_at };
      inboxRows.set(`${String(workspace_id)}\u0000${String(collection_name)}\u0000${String(record_id)}`, row);
      return { rowCount: 1, rows: [row] as TRow[] };
    }
    if (text.includes("status = 'completed'")) {
      completedAfterWrites = inboxRows.size === 2;
      return { rowCount: 1, rows: [] as TRow[] };
    }
    if (text.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] as TRow[] };
    throw new Error(`Unexpected worker SQL: ${text}`);
  };
  const client = {
    query,
    async transaction<T>(operation: (executor: EventOperationsSqlExecutor) => Promise<T>) {
      return operation({ query });
    },
    async close() {},
  } as EventOperationsPostgresClient;
  const runtime = { client, workspaceId: 'workspace:test' };
  const legacyProjector: AppointmentNotificationProjector = { async project() { throw new Error('30-minute reminder must not be sent through the legacy projector'); } };

  const result = await runAppointmentOutboxBatch({ projector: legacyProjector, runtime, now: () => '2026-09-26T10:15:00.000Z' });

  assert.deepEqual(result, { completed: 1, failed: 0, retried: 0 });
  assert.equal(inboxRows.size, 2, 'typed inbox rows are durably upserted for both participants');
  assert.equal(completedAfterWrites, true, 'the outbox acknowledgement follows the inbox writes');
  const notifications = [...inboxRows.values()].map((row) => (row.payload as { notification: { scheduledFor: string; actorId: string } }).notification);
  assert.deepEqual(notifications.map((row) => row.actorId).sort(), [actorA, actorB].sort());
  assert.ok(notifications.every((row) => row.scheduledFor === due.availableAt));
});
