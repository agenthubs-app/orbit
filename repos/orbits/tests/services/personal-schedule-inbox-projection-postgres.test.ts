import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { createReminderPlanRepository } from '../../features/notifications/reminder-plan-repository';
import { canonicalInboxProjectionRevision } from '../../features/notifications/canonical-inbox-projection-revision';
import { readCanonicalReminderProjectionSource, createCanonicalReminderWakeIntent, saveCanonicalReminderWakeIntent, claimCanonicalReminderWakes, processCanonicalReminderWakeMessage } from '../../features/notifications/canonical-reminder-wake';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('personal schedule writes enqueue due inbox work atomically, without pretending mixed Push was delivered', { skip: !url, timeout: 20000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'schedule_inbox_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 3, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const workspaceId = 'w', actorId = 'a'; let clock = '2026-09-25T00:00:00.000Z'; const now = () => clock;
  const store = createPostgresLiveRecordStore({ client });
  const work = createInboxProjectionWorkRepository({ client, workspaceId, now });
  const runtime = { store, client, workspaceId, now, inboxProjection: work };
  const schedule = createPersonalScheduleService(runtime);
  const pass = () => runInboxProjectionPass({ client, workspaceId, now, enabled: true });
  const inbox = createInboxRuntime({ client, workspaceId, now });
  const rows = () => pool.query('select source_id,source_revision,state,generation::text,available_at from orbit_inbox_projection_work order by source_id');
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    const body = { title: 'Daily reminder', startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15 as const, recurrence: { frequency: 'daily' as const, until: '2026-09-28' }, idempotencyKey: 'daily' };
    const { scheduleItem } = await schedule.create(actorId, body);
    assert.equal((await rows()).rows.length, 3, 'every derived mixed-channel plan is registered in the schedule transaction');
    assert.equal((await pass()).projectionClaimed, 0);
    await schedule.create(actorId, body);
    assert.ok((await rows()).rows.every(row => row.generation === '1'), 'replay does not reset work');
    clock = '2026-09-26T08:45:00.000Z';
    assert.equal((await pass()).projectionCompleted, 1);
    assert.equal((await inbox.service.list(actorId, { limit: 10 })).items.length, 1);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='notificationDeliveries'")).rows[0].n, 0, 'projection is not a delivery executor');
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='reminderPlans' and payload->'entity'->>'status'='scheduled'")).rows[0].n, 3);
    const plans = createReminderPlanRepository({ store, workspaceId });
    const first = (await plans.listPlans({ actorId })).find(plan => plan.fireAt === clock)!;
    const source = (plan: typeof first) => ({ actorId, sourceKind: 'canonical_reminder' as const, sourceId: plan.id, sourceRevision: canonicalInboxProjectionRevision(plan) });
    assert.deepEqual((await readCanonicalReminderProjectionSource(client, workspaceId, source(first)))?.channels, ['in_app', 'ios_push']);
    assert.equal(await readCanonicalReminderProjectionSource(client, workspaceId, { ...source(first), actorId: 'foreign' }), null);
    const mixedDelivered = { ...first, status: 'delivered' as const, deliveredAt: clock, updatedAt: clock };
    await plans.savePlan(mixedDelivered);
    assert.deepEqual(await readCanonicalReminderProjectionSource(client, workspaceId, source(mixedDelivered)), mixedDelivered, 'a mixed plan can be delivered by Push only; projection does not invent an in-app fence');
    await plans.savePlan({ ...mixedDelivered, channels: ['in_app'] });
    await assert.rejects(readCanonicalReminderProjectionSource(client, workspaceId, source({ ...mixedDelivered, channels: ['in_app'] })), /SOURCE_INVALID/, 'pure-in-app delivered still requires its real fence');
    await plans.savePlan(first);
    // Even a wrongly-created pure wake pointing at a mixed plan must not gain
    // delivery authority through the new projection-only decoding capability.
    const wakeStore = createPostgresLiveRecordStore<ReturnType<typeof createCanonicalReminderWakeIntent> & Record<string, unknown>>({ client });
    await saveCanonicalReminderWakeIntent(wakeStore, createCanonicalReminderWakeIntent({ plan: first, workspaceId, now: clock }));
    const wakes = await claimCanonicalReminderWakes({ runtime: { client, workspaceId, now }, workerId: 'mixed-negative', now: clock });
    assert.equal(wakes.messages.length, 1);
    assert.deepEqual(await processCanonicalReminderWakeMessage(wakes.messages[0], { client, workspaceId, now }), { outcome: 'failed', reason: 'plan_scope_invalid' });
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='notificationDeliveries'")).rows[0].n, 0);
    // The second reminder is due but has not been projected. A series edit
    // preserves elapsed plan history; the worker must reject its stale source.
    clock = '2026-09-27T08:46:00.000Z';
    const changed = await schedule.update(actorId, scheduleItem.id, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: 'move', scope: 'series', patch: { startsAt: '2026-09-26T10:00:00.000Z' } });
    const obsolete = await pass();
    assert.equal(obsolete.projectionCompleted, 0, 'an old scheduled occurrence must not newly project after a series edit');
    assert.equal(obsolete.projectionFailed, 0);
    clock = '2026-09-27T09:45:00.000Z';
    assert.equal((await pass()).projectionCompleted, 1);
    const visible = await inbox.service.list(actorId, { limit: 10 });
    assert.equal(visible.items.length, 1); assert.equal(visible.items[0].scheduledFor, clock);
    await schedule.remove(actorId, scheduleItem.id, { expectedUpdatedAt: changed.scheduleItem.updatedAt, idempotencyKey: 'remove', scope: 'series' });
    clock = '2026-09-28T10:00:00.000Z';
    assert.equal((await pass()).projectionCompleted, 0);
    assert.equal((await inbox.service.list(actorId, { limit: 10 })).items.length, 0);
    const before = (await pool.query('select count(*)::int as n from orbit_records')).rows[0].n;
    await pool.query(`create function reject_projection_work() returns trigger language plpgsql as $$ begin raise exception 'work unavailable'; end $$`);
    await pool.query('create trigger reject_projection_work before insert or update on orbit_inbox_projection_work for each row execute function reject_projection_work()');
    await assert.rejects(schedule.create(actorId, { ...body, startsAt: '2026-09-29T10:00:00.000Z', recurrence: undefined, idempotencyKey: 'rollback' }), /work unavailable/);
    assert.equal((await pool.query('select count(*)::int as n from orbit_records')).rows[0].n, before, 'schedule, plan and receipt roll back with queue failure');
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});
