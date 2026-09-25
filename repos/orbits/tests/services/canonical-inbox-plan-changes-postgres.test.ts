import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createConfiguredReminderPlanService } from '../../features/notifications/reminder-plan-service-factory';
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { canonicalInboxProjectionRevision } from '../../features/notifications/canonical-inbox-projection-revision';
import { claimCanonicalReminderWakes, processCanonicalReminderWakeMessage, readCanonicalReminderProjectionSource } from '../../features/notifications/canonical-reminder-wake';
import { dispatchActor } from '../../features/notifications/configured-canonical-reminder-maintenance';
import { createReminderPlanRepository } from '../../features/notifications/reminder-plan-repository';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const start = '2026-09-25T00:00:00.000Z', due = '2026-09-25T01:00:00.000Z';

test('plan changes schedule bounded inbox work at due time; reschedule and cancellation fence old work', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'inbox_plan_changes_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const workspaceId = 'w'; let clock = start; const now = () => clock;
  const store = createPostgresLiveRecordStore({ client });
  const work = createInboxProjectionWorkRepository({ client, workspaceId, now });
  const runtime = { client, workspaceId, now, publisher: { publish: async () => {} } };
  const service = createConfiguredReminderPlanService({ runtime, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
  const pass = () => runInboxProjectionPass({ client, workspaceId, now, enabled: true });
  const source = (plan: Parameters<typeof canonicalInboxProjectionRevision>[0]) => ({ actorId: 'a', sourceKind: 'canonical_reminder' as const, sourceId: plan.id, sourceRevision: canonicalInboxProjectionRevision(plan) });
  const rows = () => pool.query('select source_id,source_revision,state,generation::text,available_at from orbit_inbox_projection_work order by source_id');
  const create = (key: string, fireAt = due) => service.create({ actorId: 'a', targetType: 'task', targetId: 'task:a', fireAt, timeZone: 'UTC', channels: ['in_app'], title: 'Reminder', body: 'Private body', deepLink: '/app/tasks/task:a', createdBy: 'user', idempotencyKey: key });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await store.upsertRecord({ workspaceId, collectionName: 'tasks', recordId: 'task:a', userId: 'a', sourceType: 'manual', sourceId: 'task:a', evidenceIds: [], lifecycleState: 'active', createdAt: start, updatedAt: start, payload: { version: 1, task: { id: 'task:a', accountId: 'a', ownerUserId: 'a', title: 'Task', status: 'open', category: 'work', priority: 'normal', source: 'manual', createdAt: start, updatedAt: start }, activities: [] } });
    const plan = await create('first');
    assert.equal((await rows()).rows.length, 1, 'creation persists work in the plan transaction, not at the next GET');
    assert.equal((await rows()).rows[0].available_at.toISOString(), due);
    assert.equal((await pass()).projectionClaimed, 0, 'future work must not be consumed early');
    await create('first'); assert.equal((await rows()).rows[0].generation, '1', 'idempotent replay does not churn work');
    clock = due;
    const stale = (await work.claim())[0]!;
    const later = '2026-09-25T02:00:00.000Z';
    const changed = await service.reschedule({ actorId: 'a', reminderId: plan.id, fireAt: later, timeZone: 'UTC', expectedUpdatedAt: plan.updatedAt, idempotencyKey: 'later' });
    assert.equal(await work.complete(stale, async () => { throw Error('stale projection ran'); }), false);
    assert.equal((await pass()).projectionClaimed, 0);
    assert.equal((await rows()).rows[0].available_at.toISOString(), later);
    clock = later;
    assert.equal((await pass()).projectionCompleted, 1, 'scheduled and due is enough; a delivery fence is not required until delivered');
    const inbox = createInboxRuntime({ client, workspaceId, now });
    const notifications = await inbox.service.list('a', { limit: 10 });
    assert.equal(notifications.items.length, 1);
    assert.equal((await store.listRecords({ workspaceId, collectionName: 'notificationDeliveries', limit: 'unbounded' })).length, 0);
    assert.equal(changed.fireAt, later);
    await service.cancel({ actorId: 'a', reminderId: plan.id, idempotencyKey: 'cancel' });
    const cancelled = await pass(); assert.equal(cancelled.projectionSkipped, 1);
    assert.equal((await inbox.service.list('a', { limit: 10 })).items.length, 0, 'cancelled source is no longer visible');
    // The legacy projection includes due failed plans too, without a delivered fence.
    const failedBase = await create('failed', clock);
    const failed = { ...failedBase, status: 'failed' as const, failureCode: 'TEST_FAILURE' };
    await client.transaction(async tx => {
      await createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client: tx }), workspaceId }).savePlan(failed);
      await work.enqueue(tx, source(failed));
    });
    assert.equal((await pass()).projectionCompleted, 1);
    assert.equal(await readCanonicalReminderProjectionSource(client, workspaceId, { ...source(failed), actorId: 'foreign' }), null);
    // Real no-channel failures must replace the scheduled revision too. A
    // scheduled work item alone would become stale and silently lose this row.
    const preferences = await service.getPreferences('a');
    await service.updatePreferences({ ...preferences, actorId: 'a', inAppEnabled: false });
    const dispatched = await create('dispatcher-failed', clock);
    await dispatchActor({ ...runtime, inboxProjection: work }, 'a', clock);
    const persisted = await createReminderPlanRepository({ store, workspaceId }).getPlan('a', dispatched.id);
    assert.equal(persisted?.status, 'failed');
    assert.equal((await rows()).rows.find(row => row.source_id === dispatched.id)?.source_revision, canonicalInboxProjectionRevision(persisted!));
    assert.equal((await pass()).projectionCompleted, 1);
    const wakeFailure = await create('wake-failed', clock);
    const claimed = await claimCanonicalReminderWakes({ runtime, workerId: 'test', now: clock });
    for (const message of claimed.messages) await processCanonicalReminderWakeMessage(message, { ...runtime, inboxProjection: work });
    const wakePlan = await createReminderPlanRepository({ store, workspaceId }).getPlan('a', wakeFailure.id);
    assert.equal(wakePlan?.status, 'failed');
    assert.equal((await rows()).rows.find(row => row.source_id === wakeFailure.id)?.source_revision, canonicalInboxProjectionRevision(wakePlan!));
    assert.equal((await pass()).projectionCompleted, 1);
    // Work persistence failure must roll back the authoritative create as well.
    await pool.query(`create function reject_projection_work() returns trigger language plpgsql as $$ begin raise exception 'work unavailable'; end $$`);
    await pool.query('create trigger reject_projection_work before insert or update on orbit_inbox_projection_work for each row execute function reject_projection_work()');
    const before = (await store.listRecords({ workspaceId, collectionName: 'reminderPlans', limit: 'unbounded' })).length;
    await assert.rejects(create('rollback', clock), /work unavailable/);
    assert.equal((await store.listRecords({ workspaceId, collectionName: 'reminderPlans', limit: 'unbounded' })).length, before);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});
