import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createDeliveryPolicyRepository, deliveryPolicyId, readHistoricalNotificationSuppression, recordHistoricalNotificationSuppression } from '../../features/notifications/delivery-policy-repository';
import { createStorageNotificationDeliveryService } from '../../features/notifications/delivery-service';
import { createTypedDeliveryWorker } from '../../features/notifications/typed-delivery-worker';
import { createTypedDeliverySources } from '../../features/notifications/typed-delivery-source';
import type { PushDeviceService } from '../../features/notifications/push-device-service';
import { createInboxRecordService } from '../../features/notifications/inbox-record-service';
import { createPostgresInboxRecordRepository } from '../../features/notifications/storage/inbox-record-repository';
import { createConfiguredReminderPlanService } from '../../features/notifications/reminder-plan-service-factory';
import { INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { createTypedDeliveryRuntime } from '../../features/notifications/typed-delivery-factory';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('historical notification suppression blocks real dispatch reservation without marking the inbox read', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'historical_delivery_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const at = '2026-09-25T01:00:00.000Z', scheduledFor = '2026-09-25T00:00:00.000Z', actorId = 'a', workspaceId = 'w';
  const repo = createDeliveryPolicyRepository({ client, workspaceId, now: () => at });
  const eventKey = 'inbox:historical:' + scheduledFor;
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await repo.tx(actorId, async tx => {
      await repo.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since: '2026-09-01T00:00:00.000Z', batchId: 'cutover' });
      await repo.save(tx, 'notificationHistoricalSuppressions', deliveryPolicyId(actorId, eventKey), actorId, { actorId, eventKey, reason: 'historical_backfill', batchId: 'backfill', recordedAt: at });
    });
    await repo.acknowledgeOwner(actorId, 'device', 1, true);
    const response = await repo.reserve(actorId, { deliveryId: 'delivery', eventKey, deviceId: 'device', automatic: false, suggestion: false, expectedPreferenceRevision: 0 });
    assert.deepEqual(response, { allowed: false, reason: 'historical_backfill' });
    assert.equal((await pool.query("select count(*)::int as count from orbit_records where collection_name in ('notification_interactions','notificationDeliveryAttempts')")).rows[0].count, 0);
    assert.equal((await repo.reserve(actorId, { deliveryId: 'rescheduled', eventKey: 'inbox:historical:' + at, deviceId: 'device', automatic: false, suggestion: false, expectedPreferenceRevision: 0 })).allowed, true);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});

async function database(run: (client: TransactionalPostgresClient) => Promise<void>) {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'historical_atomic_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  try { await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await run(client); }
  finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
}

test('historical suppression is atomic, scoped, idempotent, and refuses an already reserved send', { skip: !url, timeout: 30000 }, () => database(async client => {
  const now = '2026-09-25T01:00:00.000Z', scheduledFor = '2026-09-25T00:00:00.000Z';
  const scope = { workspaceId: 'w', actorId: 'a' }, historical = { ...scope, notificationId: 'inbox:old', scheduledFor, cutoff: now, now, batchId: 'job:1' };
  const eventKey = historical.notificationId + ':' + scheduledFor;
  const read = (extra = {}) => readHistoricalNotificationSuppression({ ...scope, executor: client, eventKey, ...extra });
  const repo = createDeliveryPolicyRepository({ client, workspaceId: 'w', now: () => now });
  await assert.rejects(client.transaction(async executor => { await recordHistoricalNotificationSuppression({ ...historical, executor }); throw Error('rollback'); }), /rollback/);
  assert.equal(await read(), false);
  await client.transaction(executor => recordHistoricalNotificationSuppression({ ...historical, executor }));
  await client.transaction(executor => recordHistoricalNotificationSuppression({ ...historical, executor, batchId: 'job:2' }));
  assert.equal(await read(), true);
  assert.equal(await read({ actorId: 'b' }), false); assert.equal(await read({ workspaceId: 'other' }), false);
  assert.equal(await read({ eventKey: historical.notificationId + ':' + now }), false);
  const facts = await client.query<{ payload: { batchId: string } }>("select payload from orbit_records where collection_name='notificationHistoricalSuppressions'");
  assert.equal(facts.rows.length, 1); assert.equal(facts.rows[0].payload.batchId, 'job:1');
  await assert.rejects(client.transaction(executor => recordHistoricalNotificationSuppression({ ...historical, executor, scheduledFor: '2026-09-26T00:00:00Z' })), /INPUT_INVALID/);
  await repo.tx('a', tx => repo.save(tx, 'notificationCutover', 'a', 'a', { enabled: true, generation: 1, since: scheduledFor, batchId: 'cutover' }));
  await repo.acknowledgeOwner('a', 'd', 1, true);
  const startedKey = 'inbox:started:' + scheduledFor;
  assert.equal((await repo.reserve('a', { deliveryId: 'already', eventKey: startedKey, deviceId: 'd', automatic: false, suggestion: false, expectedPreferenceRevision: 0 })).allowed, true);
  await assert.rejects(client.transaction(executor => recordHistoricalNotificationSuppression({ ...historical, executor, notificationId: 'inbox:started' })), /ALREADY_STARTED/);
  assert.equal(await read({ eventKey: startedKey }), false);
  await repo.settle('a', 'already', 'rejected');
  await client.transaction(executor => recordHistoricalNotificationSuppression({ ...historical, executor, notificationId: 'inbox:started' }));
  assert.equal(await read({ eventKey: startedKey }), true);
  await client.query("update orbit_records set user_id='foreign' where collection_name='notificationHistoricalSuppressions' and record_id=$1", [deliveryPolicyId('a', eventKey)]);
  await assert.rejects(read(), /FACT_INVALID/);
}));

test('real typed worker suppresses pre-existing candidates without send or read changes; a new event can send', { skip: !url, timeout: 30000 }, () => database(async client => {
  const now = '2026-09-25T01:00:00.000Z', scheduledFor = '2026-09-25T00:00:00.000Z';
  const repository = createDeliveryPolicyRepository({ client, workspaceId: 'w', now: () => now });
  await repository.tx('a', tx => repository.save(tx, 'notificationCutover', 'a', 'a', { enabled: true, generation: 1, since: '2026-09-01T00:00:00Z', batchId: 'cutover' }));
  await repository.acknowledgeOwner('a', 'd', 1, true);
  const devices: PushDeviceService = {
    listActive: async () => [{ deviceId: 'd', platform: 'ios', permission: 'granted', registeredAt: now, updatedAt: now, active: true, token: 'test-only-token' }],
    register: async () => { throw Error('not used'); }, revoke: async () => null,
  };
  const store = createPostgresLiveRecordStore({ client });
  const ledger = createStorageNotificationDeliveryService({ actorId: 'a', workspaceId: 'w', store: store as never, sqlClient: client, devices, now: () => now });
  const candidates = [];
  for (const id of ['inbox:old', 'inbox:new']) candidates.push((await ledger.materialize({ signalId: 'typed:' + id, signalRevision: scheduledFor,
    phase: 'commitment', title: 'Private', body: 'Private body', scheduledFor, policySource: { kind: 'notification', id, eventKey: id + ':' + scheduledFor } })).delivery);
  await client.transaction(executor => recordHistoricalNotificationSuppression({ executor, workspaceId: 'w', actorId: 'a', notificationId: 'inbox:old', scheduledFor, cutoff: now, now, batchId: 'backfill' }));
  assert.equal(await createTypedDeliverySources({ actorId: 'a', client, workspaceId: 'w', repository, now: () => now }).resolve(candidates[0]), null);
  let sends = 0;
  const worker = createTypedDeliveryWorker({ actorId: 'a', ledger, repository, devices, now: () => now,
    push: { send: async () => { sends++; return { receiptId: 'local-fake-ticket', verified: true }; } },
    // Deliberately bypass the early source guard: the final reservation must
    // still block an old already-materialized candidate.
    sources: { resolve: async () => ({ subject: { channel: 'reminder', origin: 'user', active: true, read: false, explicitNight: true, scheduledFor }, title: 'Private', body: 'Private body', href: '/inbox', language: 'zh' }) },
  });
  const result = await worker.run({ workerId: 'test' });
  assert.equal(result.suppressed, 1); assert.equal(result.sent, 1); assert.equal(sends, 1);
  assert.equal((await ledger.get(candidates[0].deliveryId))?.status, 'suppressed');
  assert.equal((await client.query<{ count: number }>("select count(*)::int as count from orbit_records where collection_name='notification_interactions'")).rows[0].count, 0);
  assert.equal((await worker.run({ workerId: 'repeat' })).claimed, 0); assert.equal(sends, 1);
}));

test('suppression preserves actual unread inbox state and wins against a concurrent reservation', { skip: !url, timeout: 30000 }, () => database(async client => {
  const now = '2026-09-25T01:00:00.000Z', scheduledFor = '2026-09-25T00:00:00.000Z';
  const inbox = createInboxRecordService({ repository: createPostgresInboxRecordRepository({ client, workspaceId: 'w' }), now: () => now,
    sourceAccess: async () => 'available', effects: { accept: async () => { throw Error('not used'); }, snooze: async () => { throw Error('not used'); } } });
  const n = await inbox.upsert({ actorId: 'a', semanticKey: 'test:historical', kind: 'reminder', origin: 'user', title: 'Historical', reason: 'Keep unread', occurredAt: scheduledFor, scheduledFor,
    sources: [{ sourceKind: 'reminder_plan', sourceId: 'plan', sourceRevision: scheduledFor, occurredAt: scheduledFor, readAt: scheduledFor }],
    target: { kind: 'task', id: 'task', href: '/tasks/task', status: 'available' }, actions: ['read', 'dismiss'] });
  const repo = createDeliveryPolicyRepository({ client, workspaceId: 'w', now: () => now });
  await repo.tx('a', tx => repo.save(tx, 'notificationCutover', 'a', 'a', { enabled: true, generation: 1, since: scheduledFor, batchId: 'cutover' }));
  await repo.acknowledgeOwner('a', 'd', 1, true);
  let suppressionReady!: () => void, releaseSuppression!: () => void, reservationAttempted!: () => void;
  const ready = new Promise<void>(resolve => { suppressionReady = resolve; });
  const release = new Promise<void>(resolve => { releaseSuppression = resolve; });
  const attempted = new Promise<void>(resolve => { reservationAttempted = resolve; });
  const first = client.transaction(async executor => {
    await recordHistoricalNotificationSuppression({ executor, workspaceId: 'w', actorId: 'a', notificationId: n.id, scheduledFor, cutoff: now, now, batchId: 'job' });
    suppressionReady(); await release;
  });
  await ready;
  const competing: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ query: async (sql, values) => {
    if (sql.includes('pg_advisory_xact_lock')) reservationAttempted();
    return tx.query(sql, values);
  } })) };
  const second = createDeliveryPolicyRepository({ client: competing, workspaceId: 'w', now: () => now }).reserve('a', {
    deliveryId: 'racing', eventKey: n.id + ':' + scheduledFor, deviceId: 'd', automatic: false, suggestion: false, expectedPreferenceRevision: 0,
  });
  await attempted; releaseSuppression();
  await first;
  assert.deepEqual(await second, { allowed: false, reason: 'historical_backfill' });
  const after = await inbox.get('a', n.id);
  assert.equal(after.readAt, null); assert.equal(after.disposition, 'open'); assert.equal(after.revision, n.revision);
  const list = await inbox.list('a', { limit: 20 }); assert.equal(list.unreadCount, 1); assert.equal(list.items[0]?.id, n.id);
}));

test('real typed materializer checks a notification page in one batch and leaves historical notices unread', { skip: !url, timeout: 30000 }, () => database(async client => {
  const at = '2026-09-25T00:00:00.000Z', now = '2026-09-25T01:00:00.000Z', workspaceId = 'w', actorId = 'a';
  await client.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
  const store = createPostgresLiveRecordStore({ client });
  await store.upsertRecord({ workspaceId, collectionName: 'tasks', recordId: 'task', userId: actorId, sourceType: 'manual', sourceId: 'task', evidenceIds: [], lifecycleState: 'active', createdAt: at, updatedAt: at,
    payload: { version: 1, task: { id: 'task', accountId: actorId, ownerUserId: actorId, title: 'Task', status: 'open', category: 'work', priority: 'normal', source: 'manual', createdAt: at, updatedAt: at }, activities: [] } });
  const service = createConfiguredReminderPlanService({ runtime: { client, workspaceId, now: () => at, publisher: { publish: async () => {} } }, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
  for (let i = 0; i < 3; i++) await service.create({ actorId, targetType: 'task', targetId: 'task', fireAt: at, timeZone: 'UTC', channels: ['in_app'], title: 'Reminder ' + i, body: 'Body', deepLink: '/app/tasks/task', createdBy: 'user', idempotencyKey: 'create:' + i });
  assert.equal((await runInboxProjectionPass({ client, workspaceId, now: () => now, enabled: true })).projectionCompleted, 3);
  const inbox = createInboxRuntime({ client, workspaceId, now: () => now });
  const before = await inbox.service.list(actorId, { limit: 20 }); assert.equal(before.unreadCount, 3);
  await client.transaction(executor => recordHistoricalNotificationSuppression({ executor, workspaceId, actorId, notificationId: before.items[0].id, scheduledFor: at, cutoff: now, now, batchId: 'job' }));
  const repository = createDeliveryPolicyRepository({ client, workspaceId, now: () => now });
  await repository.tx(actorId, tx => repository.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since: '2026-09-01T00:00:00Z', batchId: 'cutover' }));
  let checks = 0;
  const measured: TransactionalPostgresClient = { ...client, query: async (sql, values) => { if (sql.includes('from unnest($3::text[],$4::text[])')) checks++; return client.query(sql, values); } };
  const runtime = createTypedDeliveryRuntime({ actorId, client: measured, workspaceId, now: () => now, push: null,
    devices: { listActive: async () => [{ deviceId: 'd', platform: 'ios', permission: 'granted', registeredAt: at, updatedAt: at, active: true, token: 'test-only' }], register: async () => { throw Error('not used'); }, revoke: async () => null } });
  assert.equal((await runtime.materialize()).notifications, 2);
  assert.equal(checks, 1, 'one lookup per notification page, not per notification');
  assert.equal((await inbox.service.list(actorId, { limit: 20 })).unreadCount, 3);
}));
