import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { runScheduleReminderWindowPass } from '../../features/personal-schedule/reminder-window-worker';
import { runScheduleReminderWindowBootstrapPass } from '../../features/personal-schedule/reminder-window-backfill';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const createdAt = '2026-09-25T00:00:00.000Z', at = '2026-11-24T00:00:00.000Z';
async function database(run: (client: TransactionalPostgresClient) => Promise<void>) {
  assert.ok(url); const address = new URL(url); assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'window_backfill_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  try { await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL); await run(client); }
  finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
}
const options = (client: TransactionalPostgresClient) => ({ client, workspaceId: 'w', actorId: 'a', batchId: 'legacy', cutoff: at, writersReady: true, now: () => at, limit: 2 });
const monthly = { title: 'Monthly', startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15 as const, recurrence: { frequency: 'monthly' as const }, idempotencyKey: 'monthly' };
const item = (id: string) => ({ id, sourceId: id, accountId: 'a', ownerUserId: 'a', kind: 'personal', category: 'personal', state: 'upcoming', title: id,
  startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15, recurrence: { frequency: 'monthly' }, createdAt, updatedAt: createdAt });
async function seed(client: TransactionalPostgresClient, id: string, changes: Record<string, unknown> = {}, owner = 'a') {
  await createPostgresLiveRecordStore({ client }).upsertRecord({ workspaceId: 'w', collectionName: 'personal_schedule_items', recordId: id, userId: owner,
    sourceType: 'manual', sourceId: id, lifecycleState: 'active', evidenceIds: [], createdAt, updatedAt: createdAt, payload: { ...item(id), ...changes } });
}

test('legacy recurring schedules get resumable windows and future reminders without GET or past reminder replay', { skip: !url, timeout: 30000 }, () => database(async client => {
  const schedule = createPersonalScheduleService({ client, store: createPostgresLiveRecordStore({ client }), workspaceId: 'w', now: () => createdAt });
  const { scheduleItem } = await schedule.create('a', monthly);
  const oldPlans = (await client.query("select record_id,payload from orbit_records where collection_name='reminderPlans' order by record_id")).rows;
  assert.equal(oldPlans.length, 3);
  assert.equal((await client.query('select * from orbit_schedule_reminder_windows')).rows.length, 0, 'old writer does not register windows');
  const work = createInboxProjectionWorkRepository({ client, workspaceId: 'w', now: () => at });
  const maintain = () => runScheduleReminderWindowPass({ client, workspaceId: 'w', inboxProjection: work, now: () => at });
  assert.equal((await maintain()).windowExamined, 0, 'unregistered legacy schedules are not discovered');
  const first = await runScheduleReminderWindowBootstrapPass({ ...options(client), limit: 1 });
  assert.equal(first.progress?.registered, 1); assert.equal(first.progress?.afterId, scheduleItem.id); assert.equal(first.progress?.done, false);
  const window = (await client.query<{ horizon_through: Date; next_refresh_at: Date }>('select horizon_through,next_refresh_at from orbit_schedule_reminder_windows')).rows[0];
  assert.equal(window.horizon_through.toISOString(), at, 'bootstrap must not claim a 90-day horizon was generated');
  assert.equal(window.next_refresh_at.toISOString(), at);
  assert.equal((await maintain()).windowExtended, 1);
  const plans = (await client.query<{ record_id: string; payload: { entity: { fireAt: string } } }>("select record_id,payload from orbit_records where collection_name='reminderPlans' order by record_id")).rows;
  const oldIds = new Set(oldPlans.map(row => row.record_id));
  assert.equal(plans.length, 5); assert.ok(plans.filter(row => !oldIds.has(row.record_id)).every(row => row.payload.entity.fireAt >= at));
  assert.deepEqual(plans.filter(row => oldIds.has(row.record_id)), oldPlans, 'existing historical plans remain unchanged');
  const after = (await client.query('select * from orbit_schedule_reminder_windows')).rows;
  assert.equal((await runScheduleReminderWindowBootstrapPass(options(client))).progress?.done, true);
  const noRescan: TransactionalPostgresClient = { ...client, transaction: op => client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    assert.ok(!sql.includes("collection_name='personal_schedule_items'")); return tx.query<T>(sql, values);
  } })) };
  assert.equal((await runScheduleReminderWindowBootstrapPass(options(noRescan))).advanced, 0);
  assert.equal((await runScheduleReminderWindowBootstrapPass({ ...options(client), batchId: 'repeat' })).progress?.registered, 0);
  assert.deepEqual((await client.query('select * from orbit_schedule_reminder_windows')).rows, after);
  await assert.rejects(runScheduleReminderWindowBootstrapPass({ ...options(client), cutoff: createdAt }), /PROGRESS_CONFLICT/);
  await assert.rejects(runScheduleReminderWindowBootstrapPass({ ...options(client), writersReady: false }), /INPUT_INVALID/);
}));

test('bootstrap preserves failed windows, marks expired series inactive, and excludes foreign records', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seed(client, '00-failed'); await seed(client, '01-expired', { recurrence: { frequency: 'monthly', until: '2026-10-01' } });
  await seed(client, '02-cancelled', { state: 'cancelled' }); await seed(client, '03-plain', { recurrence: undefined });
  await seed(client, '04-foreign', { accountId: 'b', ownerUserId: 'b' }, 'b');
  await client.query("insert into orbit_schedule_reminder_windows values('w','a','00-failed','old','failed',$1,$1,8,'WINDOW_REFRESH_FAILED',$1)", [createdAt]);
  const failed = (await client.query("select * from orbit_schedule_reminder_windows where series_id='00-failed'")).rows;
  const result = await runScheduleReminderWindowBootstrapPass({ ...options(client), limit: 10 });
  assert.equal(result.progress?.processed, 4); assert.equal(result.progress?.registered, 2); assert.equal(result.progress?.done, true);
  assert.deepEqual((await client.query("select * from orbit_schedule_reminder_windows where series_id='00-failed'")).rows, failed);
  assert.deepEqual((await client.query("select series_id,state from orbit_schedule_reminder_windows where series_id<>'00-failed' order by series_id")).rows,
    [{ series_id: '01-expired', state: 'inactive' }, { series_id: '02-cancelled', state: 'inactive' }]);
}));

test('checkpoint failure rolls back registration and concurrent callers share durable progress', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seed(client, '00'); await seed(client, '01');
  const faulty: TransactionalPostgresClient = { ...client, transaction: op => client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    if (/insert into orbit_records/i.test(sql) && values?.includes('scheduleWindowBackfill')) throw Error('checkpoint unavailable');
    return tx.query<T>(sql, values);
  } })) };
  await assert.rejects(runScheduleReminderWindowBootstrapPass(options(faulty)), /checkpoint unavailable/);
  assert.equal((await client.query('select * from orbit_schedule_reminder_windows')).rows.length, 0);
  const both = await Promise.all([runScheduleReminderWindowBootstrapPass({ ...options(client), limit: 1 }), runScheduleReminderWindowBootstrapPass({ ...options(client), limit: 1 })]);
  assert.deepEqual(both.map(result => result.progress?.processed).sort(), [1, 2]);
  assert.equal((await client.query('select * from orbit_schedule_reminder_windows')).rows.length, 2);
  assert.equal((await runScheduleReminderWindowBootstrapPass(options(client))).progress?.done, true);
}));

test('source edits during a scan force fresh authority read; inconsistent ownership and oversized payloads fail closed', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seed(client, '00'); let changed = false;
  const competing: TransactionalPostgresClient = { ...client, transaction: op => client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await tx.query<T>(sql, values);
    if (!changed && sql.includes('order by record_id collate "C" limit 1')) { changed = true; await seed(client, '00', { updatedAt: at, state: 'cancelled' }); }
    return result;
  } })) };
  await runScheduleReminderWindowBootstrapPass(options(competing));
  assert.ok(changed);
  assert.deepEqual((await client.query('select source_revision,state from orbit_schedule_reminder_windows')).rows, [{ source_revision: at, state: 'inactive' }]);
  await seed(client, '01', { ownerUserId: 'other' });
  await assert.rejects(runScheduleReminderWindowBootstrapPass({ ...options(client), batchId: 'invalid' }), /SOURCE_INVALID/);
  const progress = (await client.query<{ payload: { afterId: string } }>("select payload from orbit_records where collection_name='scheduleWindowBackfill' and payload->>'batchId'='invalid'")).rows[0].payload;
  assert.equal(progress.afterId, '00');
  await seed(client, '01', { title: 'x'.repeat(70000) });
  let bytes = 0;
  const measured: TransactionalPostgresClient = { ...client, transaction: op => client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await tx.query<T>(sql, values); if (sql.includes('case when octet_length(payload::text)')) bytes += Buffer.byteLength(JSON.stringify(result.rows)); return result;
  } })) };
  await assert.rejects(runScheduleReminderWindowBootstrapPass({ ...options(measured), batchId: 'invalid' }));
  assert.ok(bytes < 200, 'oversized body is not returned');
}));

test('a batch reads only its bounded sources with ten thousand owned series and uses a keyset index', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seed(client, '00'); await seed(client, '01');
  let rows = 0, bytes = 0, candidateSql = '', candidateValues: readonly unknown[] = [];
  const measured: TransactionalPostgresClient = { ...client, transaction: op => client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await tx.query<T>(sql, values);
    if (sql.includes('case when octet_length(payload::text)')) { rows += result.rows.length; bytes += Buffer.byteLength(JSON.stringify(result.rows)); }
    if (sql.includes('order by record_id collate "C" limit 1')) { candidateSql = sql; candidateValues = values ?? []; }
    return result;
  } })) };
  assert.equal((await runScheduleReminderWindowBootstrapPass({ ...options(measured), batchId: 'small' })).advanced, 2);
  const small = { rows, bytes };
  await client.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,payload,created_at,updated_at)
    select 'w','personal_schedule_items','zz:'||n,'a','manual','zz:'||n,'active',$1::jsonb||jsonb_build_object('id','zz:'||n,'sourceId','zz:'||n),$2,$2
    from generate_series(1,10000)n`, [JSON.stringify(item('template')), createdAt]);
  rows = 0; bytes = 0;
  assert.equal((await runScheduleReminderWindowBootstrapPass({ ...options(measured), batchId: 'large' })).advanced, 2);
  assert.deepEqual({ rows, bytes }, small); assert.equal(rows, 2); assert.ok(bytes < 4096);
  await client.query('analyze orbit_records');
  const explain = await client.query('explain (format json) ' + candidateSql, candidateValues);
  assert.match(JSON.stringify(explain.rows), /orbit_records_schedule_actor_id_idx/);
  console.log(JSON.stringify({ metric: 'schedule_window_backfill_batch', totalSeries: 10002, limit: 2, sourceRows: rows, sourceBytes: bytes }));
}));

test('cutoff, workspace, deleted source and corrupt checkpoint boundaries are enforced', { skip: !url, timeout: 30000 }, () => database(async client => {
  await seed(client, '00-deleted'); await seed(client, '01-after-cutoff'); await seed(client, '02-other-workspace'); await seed(client, '03-owned');
  await client.query("update orbit_records set lifecycle_state='deleted',deleted_at=$1 where record_id='00-deleted'", [at]);
  await client.query("update orbit_records set created_at='2026-11-25' where record_id='01-after-cutoff'");
  await client.query("update orbit_records set workspace_id='other' where record_id='02-other-workspace'");
  const result = await runScheduleReminderWindowBootstrapPass({ ...options(client), limit: 10 });
  assert.equal(result.progress?.processed, 2); assert.equal(result.progress?.registered, 1); assert.equal(result.progress?.done, true);
  assert.deepEqual((await client.query('select series_id from orbit_schedule_reminder_windows')).rows, [{ series_id: '03-owned' }]);
  await client.query("update orbit_records set payload=jsonb_set(payload,'{processed}','999') where collection_name='scheduleWindowBackfill'");
  await assert.rejects(runScheduleReminderWindowBootstrapPass(options(client)), /Invalid schedule backfill progress/);
  await client.query("update orbit_records set user_id='other' where collection_name='scheduleWindowBackfill'");
  await assert.rejects(runScheduleReminderWindowBootstrapPass(options(client)), /PROGRESS_INVALID/);
}));
