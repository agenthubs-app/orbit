import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppointmentAggregate } from '../../features/appointments/contract';
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from '../../features/events/event-operations/storage/postgres-client';
import { runAppointmentInboxBackfillPass } from '../../features/notifications/appointment-inbox-backfill';

test('explicit appointment inbox backfill fences old history, checkpoints, and queues missing future t30m work', async () => {
  const actorId = 'actor:b';
  const appointmentId = 'appointment:backfill';
  const contactId = 'contact:for-b';
  const appointment: AppointmentAggregate = {
    appointmentId,
    authorityRequestId: 'request:a-b',
    contactIdsByActor: { 'actor:a': 'contact:for-a', [actorId]: contactId },
    createdAt: '2026-09-26T07:00:00.000Z',
    createdByActorId: 'actor:a',
    eventId: 'event:backfill',
    history: [{ actorId: 'actor:a', at: '2026-09-26T08:00:00.000Z', command: 'propose', detail: 'Proposed.', proposalRevision: 1, version: 2 }],
    inviteeActorId: actorId,
    ownerActorId: 'actor:a',
    pendingProposalRevision: null,
    proposals: [{ candidateTimes: [{ candidateId: 'slot:1', startsAtUtc: '2026-09-26T11:00:00.000Z' }], createdAt: '2026-09-26T08:00:00.000Z', durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, note: '', proposedByActorId: 'actor:a', revision: 1, timezone: 'UTC' }],
    confirmed: { candidateId: 'slot:1', confirmedAt: '2026-09-26T08:30:00.000Z', confirmedByActorId: actorId, durationMinutes: 30, medium: { kind: 'video', provider: 'other', joinUrl: null }, proposalRevision: 1, startsAtUtc: '2026-09-26T11:00:00.000Z', timezone: 'UTC' },
    projection: { calendar: 'not_synced', meeting: 'not_synced', revision: 1 },
    relationshipPairId: 'pair:a-b',
    reminders: { cancelled: false, currentRevision: 1 },
    status: 'confirmed',
    updatedAt: '2026-09-26T08:30:00.000Z',
    version: 3,
  };
  const records = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  let appointmentPageCalls = 0;
  const fakeQuery = async <TRow>(text: string, values?: readonly unknown[]) => {
    if (text.includes('from appointment_aggregates')) {
      appointmentPageCalls++;
      const after = values?.[2];
      const rows = after === null ? [{ appointment_id: appointmentId, payload: appointment }] : [];
      return { rowCount: rows.length, rows: rows as TRow[] };
    }
    if (text.includes("collection_name='contacts'")) {
      return { rowCount: 1, rows: [{ user_id: actorId, payload: { displayName: 'Bea' }, updated_at: '2026-09-26T07:30:00.000Z', lifecycle_state: 'active' }] as TRow[] };
    }
    if (text.includes('from unnest($3::text[],$4::text[])')) return { rowCount: 0, rows: [] as TRow[] };
    if (text.includes("collection_name='notificationDeliveryAttempts'")) return { rowCount: 0, rows: [] as TRow[] };
    if (text.includes('insert into appointment_outbox')) {
      writes.push('appointment-outbox');
      return { rowCount: 1, rows: [] as TRow[] };
    }
    if (text.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] as TRow[] };
    if (text.includes('insert into orbit_records')) {
      const [workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at] = values ?? [];
      const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const row = { workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, provider, provider_record_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, search_text, payload: parsedPayload, created_at, updated_at, deleted_at };
      records.set(`${String(workspace_id)}\u0000${String(collection_name)}\u0000${String(record_id)}`, row);
      if (collection_name === 'notificationHistoricalSuppressions') writes.push('history-suppression');
      if (collection_name === 'inboxNotifications') writes.push('inbox-notification');
      if (collection_name === 'notificationProjectionBackfill') writes.push('checkpoint');
      return { rowCount: 1, rows: [row] as TRow[] };
    }
    if (text.includes('from orbit_records') && text.includes('limit 1')) {
      const key = `${String(values?.[0])}\u0000${String(values?.[1])}\u0000${String(values?.[2])}`;
      const row = records.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [row] as TRow[] : [] };
    }
    throw new Error(`Unexpected appointment backfill SQL: ${text}`);
  };
  const client = {
    query: fakeQuery,
    async transaction<T>(operation: (executor: EventOperationsSqlExecutor) => Promise<T>) { return operation({ query: fakeQuery }); },
    async close() {},
  } as EventOperationsPostgresClient;

  const result = await runAppointmentInboxBackfillPass({
    runtime: { client, workspaceId: 'workspace:backfill' },
    actorId,
    batchId: 'appointment-inbox-cutover',
    cutoff: '2026-09-26T09:00:00.000Z',
    writersReady: true,
    now: () => '2026-09-26T10:00:00.000Z',
  });

  assert.equal(result.progress.done, true);
  assert.equal(result.progress.processed, 1);
  assert.equal(result.progress.projected, 1);
  assert.equal(result.progress.suppressed, 1);
  assert.equal(result.progress.remindersScheduled, 1);
  assert.ok(writes.indexOf('history-suppression') < writes.indexOf('inbox-notification'), 'historical push is fenced before its inbox row exists');
  assert.ok(writes.includes('appointment-outbox'), 'missing due event is persisted to the appointment outbox');
  assert.equal(writes.at(-1), 'checkpoint');

  const replay = await runAppointmentInboxBackfillPass({
    runtime: { client, workspaceId: 'workspace:backfill' },
    actorId,
    batchId: 'appointment-inbox-cutover',
    cutoff: '2026-09-26T09:00:00.000Z',
    writersReady: true,
    now: () => '2026-09-26T10:00:00.000Z',
  });
  assert.equal(replay.advanced, 0);
  assert.equal(appointmentPageCalls, 1, 'completed backfill does not rescan appointment history');
});
