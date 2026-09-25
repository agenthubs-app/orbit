import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createConfiguredReminderPlanService } from '../../features/notifications/reminder-plan-service-factory';
import { INBOX_PROJECTION_WORK_SCHEMA_SQL, createInboxProjectionWorkRepository } from '../../features/notifications/storage/inbox-projection-work';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { createDeliveryPolicyRepository } from '../../features/notifications/delivery-policy-repository';
import { createTypedDeliveryRuntime } from '../../features/notifications/typed-delivery-factory';
import { createTypedDeliverySources } from '../../features/notifications/typed-delivery-source';
import { createTypedDeliveryWorker } from '../../features/notifications/typed-delivery-worker';
import type { PushDeviceService } from '../../features/notifications/push-device-service';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;

test('typed delivery cutoff treats offset timestamps as instants and fails closed on invalid cutover', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url);
  const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname));
  assert.equal(address.search, '');

  const schema = 'typed_cutover_offsets_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const actorId = 'a', workspaceId = 'w', since = '2026-09-01T00:00:00.000Z', now = '2026-09-25T12:00:00.000Z';
  const cases = [
    { key: 'historical-positive', fireAt: '2026-09-01T00:30:00+02:00', shouldMaterialize: false },
    { key: 'historical-negative', fireAt: '2026-08-31T18:30:00-02:00', shouldMaterialize: false },
    { key: 'equal-negative', fireAt: '2026-08-31T19:00:00-05:00', shouldMaterialize: true },
    { key: 'equal-positive', fireAt: '2026-09-01T02:00:00+02:00', shouldMaterialize: true },
    { key: 'future-negative', fireAt: '2026-09-01T01:30:00-02:00', shouldMaterialize: true },
    { key: 'future-positive', fireAt: '2026-09-01T03:00:00+02:00', shouldMaterialize: true },
  ] as const;
  assert.ok(Date.parse(cases[0].fireAt) < Date.parse(since));
  assert.ok(Date.parse(cases[1].fireAt) < Date.parse(since));
  assert.equal(Date.parse(cases[2].fireAt), Date.parse(since));
  assert.equal(Date.parse(cases[3].fireAt), Date.parse(since));
  assert.ok(Date.parse(cases[4].fireAt) > Date.parse(since));
  assert.ok(Date.parse(cases[5].fireAt) > Date.parse(since));

  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    await store.upsertRecord({ workspaceId, collectionName: 'tasks', recordId: 'task', userId: actorId, sourceType: 'manual', sourceId: 'task', evidenceIds: [], lifecycleState: 'active', createdAt: now, updatedAt: now,
      payload: { version: 1, task: { id: 'task', accountId: actorId, ownerUserId: actorId, title: 'Task', status: 'open', category: 'work', priority: 'normal', source: 'manual', createdAt: now, updatedAt: now }, activities: [] } });

    const work = createInboxProjectionWorkRepository({ client, workspaceId, now: () => now });
    const publisher = { publish: async () => undefined };
    const commandRuntime = { client, workspaceId, now: () => now, inboxProjection: work, publisher };
    const reminders = createConfiguredReminderPlanService({ runtime: commandRuntime, now: () => now, publisher, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
    for (const item of cases) await reminders.create({ actorId, targetType: 'task', targetId: 'task', fireAt: item.fireAt, timeZone: 'UTC', channels: ['in_app'],
      title: item.key, body: 'Body', deepLink: '/app/tasks/task', createdBy: 'user', idempotencyKey: item.key });
    assert.equal((await runInboxProjectionPass({ client, workspaceId, now: () => now, enabled: true })).projectionCompleted, cases.length);

    const inbox = createInboxRuntime({ client, workspaceId, now: () => now });
    const projected = await inbox.service.list(actorId, { limit: 50 });
    assert.equal(projected.items.length, cases.length);
    assert.equal(projected.unreadCount, cases.length);
    const notificationByKey = new Map(projected.items.map(item => [item.title, item]));
    const repository = createDeliveryPolicyRepository({ client, workspaceId, now: () => now });
    const devices: PushDeviceService = {
      listActive: async () => [{ deviceId: 'device', platform: 'ios', permission: 'granted', registeredAt: now, updatedAt: now, active: true, token: 'local-test-only' }],
      register: async () => { throw Error('not used'); }, revoke: async () => null,
    };
    const runtime = createTypedDeliveryRuntime({ actorId, client, workspaceId, now: () => now, devices, push: null });

    const initialCursor = { notifications: null, messages: { at: '2026-09-25T11:00:00.000Z', id: 'sentinel' } };
    await repository.tx(actorId, tx => repository.save(tx, 'notificationDeliveryCursor', actorId, actorId, initialCursor));
    await repository.tx(actorId, tx => repository.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since: 'invalid-cutover', batchId: 'cutover' }));
    await assert.rejects(runtime.materialize(), /TYPED_DELIVERY_CUTOVER_INVALID/);
    assert.equal((await runtime.ledger.list()).length, 0);
    assert.deepEqual(await repository.get(client, 'notificationDeliveryCursor', actorId), initialCursor, 'invalid cutover does not advance or rewrite the cursor');

    await repository.tx(actorId, tx => repository.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since, batchId: 'cutover' }));
    assert.deepEqual(await runtime.materialize(), { notifications: 4, messages: 0 });
    const created = await runtime.ledger.list();
    const expectedKeys = cases.filter(item => item.shouldMaterialize).map(item => {
      const n = notificationByKey.get(item.key)!;
      return n.id + ':' + (n.scheduledFor ?? n.occurredAt);
    }).sort();
    assert.deepEqual(created.map(item => item.policySource!.eventKey).sort(), expectedKeys);

    const equalNotification = notificationByKey.get('equal-negative')!;
    const equalEventKey = equalNotification.id + ':' + (equalNotification.scheduledFor ?? equalNotification.occurredAt);
    const equalDelivery = created.find(item => item.policySource?.eventKey === equalEventKey);
    assert.ok(equalDelivery);
    const sources = createTypedDeliverySources({ actorId, client, workspaceId, repository, now: () => now });
    await repository.tx(actorId, tx => repository.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since: 'invalid-cutover', batchId: 'cutover' }));
    assert.equal(await sources.resolve(equalDelivery), null, 'invalid since fails closed at final source check');
    await repository.tx(actorId, tx => repository.save(tx, 'notificationCutover', actorId, actorId, { enabled: true, generation: 1, since, batchId: 'cutover' }));
    for (const delivery of created) assert.ok(await sources.resolve(delivery), `cutoff-equal/future event resolves: ${delivery.policySource!.eventKey}`);

    const oldNotification = notificationByKey.get('historical-positive')!;
    const oldScheduled = oldNotification.scheduledFor ?? oldNotification.occurredAt;
    const oldEventKey = oldNotification.id + ':' + oldScheduled;
    const bypassed = await runtime.ledger.materialize({ signalId: 'typed:' + oldNotification.id, signalRevision: oldScheduled, phase: 'commitment', title: 'Orbit', body: 'Notification', scheduledFor: oldScheduled,
      policySource: { kind: 'notification', id: oldNotification.id, eventKey: oldEventKey } });
    assert.equal(await sources.resolve(bypassed.delivery), null, 'pre-existing old candidate is rejected by the final source cutoff');

    await repository.acknowledgeOwner(actorId, 'device', 1, true);
    let sends = 0;
    const worker = createTypedDeliveryWorker({ actorId, ledger: runtime.ledger, repository, devices, sources, now: () => now,
      push: { send: async () => { sends++; return { receiptId: 'local-fake-ticket', verified: true }; } } });
    const boundaryResult = await worker.run({ workerId: 'offset-cutoff-boundary', limit: 1 });
    assert.equal(boundaryResult.claimed, 1);
    assert.equal(boundaryResult.sent, 1, 'an equal-instant event remains eligible for the local fake adapter');
    assert.equal((await runtime.ledger.get(equalDelivery.deliveryId))?.status, 'sent');
    assert.equal(sends, 1);
    const oldResult = await worker.run({ workerId: 'offset-cutoff-regression', limit: 1 });
    assert.equal(oldResult.claimed, 1);
    assert.equal(oldResult.suppressed, 1);
    assert.equal(oldResult.sent, 0);
    assert.equal(sends, 1, 'the local fake adapter is not asked to send the historical event');
    assert.equal((await runtime.ledger.get(bypassed.delivery.deliveryId))?.status, 'suppressed');
    const after = await inbox.service.list(actorId, { limit: 50 });
    assert.equal(after.unreadCount, cases.length, 'Push suppression does not read or dismiss inbox notices');
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await client.close();
  }
});
