import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { createReminderPlanRepository } from '../../features/notifications/reminder-plan-repository';
import type { ReminderPlanDTO } from '../../features/notifications/reminder-plan-contract';
import { runCanonicalInboxBackfillPass } from '../../features/notifications/canonical-inbox-backfill';
import { runInboxProjectionPass } from '../../features/notifications/inbox-projection-worker';
import { canonicalInboxProjectionRevision } from '../../features/notifications/canonical-inbox-projection-revision';
import { createInboxRuntime } from '../../features/notifications/inbox-record-service-factory';
import { deliveryPolicyId } from '../../features/notifications/delivery-policy-repository';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const at = '2026-09-24T00:00:00.000Z', cutoff = '2026-09-25T00:00:00.000Z', now = '2026-09-25T01:00:00.000Z';
async function database(run: (client: TransactionalPostgresClient) => Promise<void>) {
  assert.ok(url); const address = new URL(url); assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'inbox_backfill_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  try { await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL); await run(client); }
  finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
}
const options = (client: TransactionalPostgresClient) => ({ client, workspaceId: 'w', actorId: 'a', batchId: 'history:1', cutoff, writersReady: true, limit: 2, now: () => now });
const plan = (id: string): ReminderPlanDTO => ({ id, accountId: 'a', ownerUserId: 'a', targetType: 'task', targetId: 'task', fireAt: at, timeZone: 'UTC', status: 'scheduled', channels: ['in_app', 'ios_push'], title: id, body: 'Body', deepLink: '/app/tasks/task', createdBy: 'user', createdAt: at, updatedAt: at });
async function seedTask(client: TransactionalPostgresClient) {
  await createPostgresLiveRecordStore({ client }).upsertRecord({ workspaceId: 'w', collectionName: 'tasks', recordId: 'task', userId: 'a', sourceType: 'manual', sourceId: 'task', evidenceIds: [], lifecycleState: 'active', createdAt: at, updatedAt: at,
    payload: { version: 1, task: { id: 'task', accountId: 'a', ownerUserId: 'a', title: 'Task', status: 'open', category: 'work', priority: 'normal', source: 'manual', createdAt: at, updatedAt: at }, activities: [] } });
}

test('historical plans register bounded resumable work and push fences; future work waits and inbox stays unread', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seedTask(client);
  const plans = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  await plans.savePlan(plan('plan:00'));
  await plans.savePlan({ ...plan('plan:01'), fireAt: '2026-09-26T00:00:00.000Z' });
  await plans.savePlan({ ...plan('plan:02'), status: 'cancelled', cancelledAt: at });
  await plans.savePlan({ ...plan('plan:03'), status: 'failed', failureCode: 'OLD_FAILURE' });
  assert.equal((await client.query('select source_id from orbit_inbox_projection_work')).rows.length, 0, 'legacy plans have no work before explicit backfill');
  const first = await runCanonicalInboxBackfillPass(options(client));
  assert.equal(first.advanced, 2); assert.equal(first.progress?.afterId, 'plan:01'); assert.equal(first.progress?.suppressed, 1); assert.equal(first.progress?.done, false);
  const work = await client.query<{ source_id: string; available_at: Date }>('select source_id,available_at from orbit_inbox_projection_work order by source_id');
  assert.equal(work.rows.length, 2); assert.equal(work.rows[1].available_at.toISOString(), '2026-09-26T00:00:00.000Z');
  assert.equal((await runInboxProjectionPass({ client, workspaceId: 'w', now: () => now, enabled: true })).projectionCompleted, 1);
  assert.equal((await runCanonicalInboxBackfillPass(options(client))).progress?.processed, 4);
  const done = await runCanonicalInboxBackfillPass(options(client));
  assert.equal(done.progress?.done, true); assert.equal(done.progress?.enqueued, 3); assert.equal(done.progress?.skipped, 1); assert.equal(done.progress?.suppressed, 2);
  assert.equal((await runInboxProjectionPass({ client, workspaceId: 'w', now: () => now, enabled: true })).projectionCompleted, 1);
  const list = await createInboxRuntime({ client, workspaceId: 'w', now: () => now }).service.list('a', { limit: 20 });
  assert.equal(list.items.length, 2); assert.equal(list.unreadCount, 2); assert.ok(list.items.every(item => item.readAt === null && item.disposition === 'open'));
  assert.equal((await client.query("select record_id from orbit_records where collection_name='notificationHistoricalSuppressions'")).rows.length, 2);
  const measured: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ query: async (sql, values) => {
    assert.ok(!sql.includes("collection_name='reminderPlans'"), 'a finished checkpoint must not rescan sources'); return tx.query(sql, values);
  } })) };
  assert.equal((await runCanonicalInboxBackfillPass(options(measured))).advanced, 0);
  await assert.rejects(runCanonicalInboxBackfillPass({ ...options(client), cutoff: at }), /PROGRESS_CONFLICT/);
  await assert.rejects(runCanonicalInboxBackfillPass({ ...options(client), writersReady: false }), /INPUT_INVALID/);
}));

test('source/work/suppression/checkpoint failures roll back one item and restart resumes exactly there', { skip: !url, timeout: 30000 }, () => database(async client => {
  const repository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  await repository.savePlan(plan('plan:00'));
  await repository.savePlan(plan('plan:01'));
  await runCanonicalInboxBackfillPass({ ...options(client), limit: 1 });
  const before = await client.query("select payload from orbit_records where collection_name='notificationProjectionBackfill'");
  const faulty: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ query: async (sql, values) => {
    if (sql.includes('insert into orbit_inbox_projection_work')) throw Error('work unavailable'); return tx.query(sql, values);
  } })) };
  await assert.rejects(runCanonicalInboxBackfillPass(options(faulty)), /work unavailable/);
  assert.deepEqual((await client.query("select payload from orbit_records where collection_name='notificationProjectionBackfill'")).rows, before.rows);
  assert.equal((await client.query("select record_id from orbit_records where collection_name='notificationHistoricalSuppressions'")).rows.length, 1);
  assert.equal((await client.query('select source_id from orbit_inbox_projection_work')).rows.length, 1);
  const resumed = await runCanonicalInboxBackfillPass(options(client));
  assert.equal(resumed.progress?.done, true); assert.equal(resumed.progress?.processed, 2);
}));

test('a concurrent legacy update forces a fresh source read; scan payload never overwrites the current revision', { skip: !url, timeout: 30000 }, () => database(async client => {
  const repository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  const old = plan('plan:00'), changed = { ...old, title: 'New current title', fireAt: '2026-09-27T00:00:00.000Z', updatedAt: now };
  await repository.savePlan(old);
  let injected = false;
  const competing: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ async query<TRow>(sql: string, values?: readonly unknown[]) {
    const rows = await tx.query<TRow>(sql, values);
    if (!injected && sql.includes('order by record_id collate "C" limit 1')) { injected = true; await repository.savePlan(changed); }
    return rows;
  } })) };
  await runCanonicalInboxBackfillPass(options(competing));
  assert.equal(injected, true);
  assert.equal((await client.query<{ source_revision: string }>('select source_revision from orbit_inbox_projection_work')).rows[0].source_revision, canonicalInboxProjectionRevision(changed));
  assert.equal((await client.query("select record_id from orbit_records where collection_name='notificationHistoricalSuppressions'")).rows.length, 0, 'new future event is not suppressed');
  const checkpoint = await createPostgresLiveRecordStore({ client }).getRecord({ workspaceId: 'w', collectionName: 'notificationProjectionBackfill', recordId: deliveryPolicyId('canonical-reminder', 'a', 'history:1') });
  assert.equal(checkpoint?.payload.processed, 1);
}));

test('one backfill batch stays narrow with ten thousand owned historical plans and uses the actor keyset index', { skip: !url, timeout: 30000 }, () => database(async client => {
  const repository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  await repository.savePlan(plan('plan:00')); await repository.savePlan(plan('plan:01'));
  let candidateSql = '', candidateValues: readonly unknown[] = [], rows = 0, bytes = 0;
  const measured: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(tx => operation({ async query<TRow>(sql: string, values?: readonly unknown[]) {
    const result = await tx.query<TRow>(sql, values);
    if (sql.includes('order by record_id collate "C" limit 1')) { candidateSql = sql; candidateValues = values ?? []; }
    if (sql.startsWith('with source as (')) { rows += result.rows.length; bytes += Buffer.byteLength(JSON.stringify(result.rows)); }
    return result;
  } })) };
  assert.equal((await runCanonicalInboxBackfillPass({ ...options(measured), batchId: 'small' })).advanced, 2);
  const small = { rows, bytes };
  await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,payload,created_at,updated_at)
    select 'w','reminderPlans','zz:'||n,'a','system','zz:'||n,'active',jsonb_build_object('entity',$1::jsonb||jsonb_build_object('id','zz:'||n,'body',repeat('x',4000))),$2,$2
    from generate_series(1,10000)n`, [JSON.stringify(plan('template')), at]);
  rows = 0; bytes = 0;
  assert.equal((await runCanonicalInboxBackfillPass({ ...options(measured), batchId: 'large' })).advanced, 2);
  assert.deepEqual({ rows, bytes }, small); assert.equal(rows, 2); assert.ok(bytes < 4096);
  await client.query('analyze orbit_records');
  const explain = await client.query('explain (format json) ' + candidateSql, candidateValues);
  assert.match(JSON.stringify(explain.rows), /orbit_records_reminder_actor_id_idx/);
  console.log(JSON.stringify({ metric: 'canonical_backfill_batch', historicalPlans: 10002, limit: 2, sourceRows: rows, sourceBytes: bytes }));
}));

test('two backfill callers share durable progress and never enqueue a foreign owner record', { skip: !url, timeout: 30000 }, () => database(async client => {
  const repository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  await repository.savePlan(plan('plan:00')); await repository.savePlan(plan('plan:01'));
  await repository.savePlan({ ...plan('foreign'), accountId: 'b', ownerUserId: 'b' });
  const results = await Promise.all([runCanonicalInboxBackfillPass({ ...options(client), limit: 1 }), runCanonicalInboxBackfillPass({ ...options(client), limit: 1 })]);
  assert.deepEqual(results.map(result => result.progress?.processed).sort(), [1, 2]);
  const rows = await client.query<{ source_id: string; generation: string; actor_id: string }>('select source_id,generation::text,actor_id from orbit_inbox_projection_work order by source_id');
  assert.deepEqual(rows.rows, [{ source_id: 'plan:00', generation: '1', actor_id: 'a' }, { source_id: 'plan:01', generation: '1', actor_id: 'a' }]);
  assert.equal((await runCanonicalInboxBackfillPass(options(client))).progress?.done, true);
}));

test('contradictory authority and corrupt checkpoint fail closed without advancing or registering work', { skip: !url, timeout: 30000 }, () => database(async client => {
  const repository = createReminderPlanRepository({ store: createPostgresLiveRecordStore({ client }), workspaceId: 'w' });
  await repository.savePlan({ ...plan('plan:00'), accountId: 'foreign' });
  await assert.rejects(runCanonicalInboxBackfillPass(options(client)), /SOURCE_INVALID/);
  assert.equal((await client.query('select source_id from orbit_inbox_projection_work')).rows.length, 0);
  assert.equal((await client.query("select record_id from orbit_records where collection_name='notificationProjectionBackfill'")).rows.length, 0);
  await repository.savePlan(plan('plan:00'));
  await runCanonicalInboxBackfillPass({ ...options(client), limit: 1 });
  await client.query("update orbit_records set payload=jsonb_set(payload,'{processed}','999'::jsonb) where collection_name='notificationProjectionBackfill'");
  await assert.rejects(runCanonicalInboxBackfillPass(options(client)), /Invalid backfill progress/);
}));
