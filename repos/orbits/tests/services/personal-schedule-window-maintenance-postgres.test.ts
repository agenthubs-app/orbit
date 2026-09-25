import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from '../../features/notifications/storage/inbox-projection-work';
import { createConfiguredCanonicalReminderMaintenanceTask } from '../../features/notifications/configured-canonical-reminder-maintenance';
import { runScheduleReminderWindowPass } from '../../features/personal-schedule/reminder-window-worker';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('maintenance extends recurring reminder horizons without any inbox GET or actor-wide schedule list', { skip: !url, timeout: 20000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'schedule_window_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 3, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const workspaceId = 'w', actorId = 'a'; let clock = '2026-09-25T00:00:00.000Z'; const now = () => clock;
  const store = createPostgresLiveRecordStore({ client });
  const work = createInboxProjectionWorkRepository({ client, workspaceId, now });
  const runtime = { store, client, workspaceId, now, inboxProjection: work };
  const schedule = createPersonalScheduleService(runtime);
  const task = createConfiguredCanonicalReminderMaintenanceTask({ runtime, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
  const run = () => task.run({ now: () => new Date(clock), deadline: Date.parse(clock) + 60000 });
  const count = async () => Number((await pool.query("select count(*)::int as n from orbit_records where collection_name='reminderPlans'")).rows[0].n);
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await schedule.create(actorId, { title: 'Monthly reminder', startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15, recurrence: { frequency: 'monthly' }, idempotencyKey: 'monthly' });
    assert.equal(await count(), 3);
    clock = '2026-11-24T00:00:00.000Z';
    await run();
    assert.equal(await count(), 5, 'background maintenance, not a user GET, extends the 90-day horizon');
    await run(); assert.equal(await count(), 5, 'replay does not generate duplicate plans');
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});

async function withWindowFixture(operation: (fixture: {
  client: TransactionalPostgresClient; pool: Pool; workspaceId: string; actorId: string;
  now: () => string; advance: (at: string) => void;
  schedule: ReturnType<typeof createPersonalScheduleService>;
  work: ReturnType<typeof createInboxProjectionWorkRepository>;
}) => Promise<void>) {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'schedule_window_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  const workspaceId = 'w', actorId = 'a'; let clock = '2026-09-25T00:00:00.000Z'; const now = () => clock;
  const work = createInboxProjectionWorkRepository({ client, workspaceId, now });
  const schedule = createPersonalScheduleService({ client, workspaceId, now, inboxProjection: work, store: createPostgresLiveRecordStore({ client }) });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await pool.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
    await operation({ client, pool, workspaceId, actorId, now, advance: at => { clock = at; }, schedule, work });
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
}

const monthly = (key: string) => ({ title: key, startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15 as const, recurrence: { frequency: 'monthly' as const }, idempotencyKey: key });

test('window failure is visible in maintenance totals and does not stop other reminder work', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  await f.schedule.create(f.actorId, monthly('failure'));
  f.advance('2026-11-24T00:00:00.000Z');
  await f.pool.query(`create function reject_window_extension() returns trigger language plpgsql as $$ begin
    if new.horizon_through>old.horizon_through then raise exception 'Injected window failure'; end if; return new; end $$;
    create trigger reject_window_extension before update on orbit_schedule_reminder_windows for each row execute function reject_window_extension()`);
  const task = createConfiguredCanonicalReminderMaintenanceTask({ runtime: { client: f.client, workspaceId: f.workspaceId, now: f.now, inboxProjection: f.work }, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
  const result = await task.run({ now: () => new Date(f.now()), deadline: Date.parse(f.now()) + 60000 });
  assert.ok(!('skipped' in result));
  assert.equal(result.windowFailed, 1);
  assert.ok(result.projectionCompleted > 0, 'existing due reminders still reach the inbox');
  assert.ok(result.failed >= 1, 'maintenance must not report success after a failed window extension');
  assert.equal((await f.pool.query("select count(*)::int n from orbit_records where collection_name='reminderPlans'")).rows[0].n, 3, 'failed extension rolls back new plans');
  const progress = (await f.pool.query('select * from orbit_schedule_reminder_windows')).rows[0];
  assert.equal(progress.failures, 1); assert.equal(progress.state, 'active');
  assert.equal(progress.horizon_through.toISOString(), '2026-12-24T00:00:00.000Z');
}));

test('failed window discovery cannot prevent independent notification maintenance', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  await f.schedule.create(f.actorId, monthly('scan-failure'));
  f.advance('2026-11-24T00:00:00.000Z');
  const intercept = (executor: TransactionalSqlExecutor): TransactionalSqlExecutor => ({ async query<T>(sql: string, values?: readonly unknown[]) {
    if (/select actor_id,series_id,source_revision,next_refresh_at from orbit_schedule_reminder_windows/.test(sql)) throw Error('Injected discovery failure');
    return executor.query<T>(sql, values);
  } });
  const client: TransactionalPostgresClient = { ...f.client, ...intercept(f.client), transaction: op => f.client.transaction(tx => op(intercept(tx))) };
  const task = createConfiguredCanonicalReminderMaintenanceTask({ runtime: { client, workspaceId: f.workspaceId, now: f.now, inboxProjection: f.work }, env: { ORBIT_CANONICAL_INBOX_PROJECTION: '1' } });
  const result = await task.run({ now: () => new Date(f.now()), deadline: Date.parse(f.now()) + 60000 });
  assert.ok(!('skipped' in result)); assert.equal(result.windowFailed, 1);
  assert.ok(result.projectionCompleted > 0); assert.ok(result.failed >= 1);
}));

test('window and inbox work roll back together, back off, dead-letter, and only a new revision reactivates', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  const { scheduleItem } = await f.schedule.create(f.actorId, monthly('rollback'));
  const initial = (await f.pool.query('select * from orbit_schedule_reminder_windows')).rows[0];
  const beforeWork = (await f.pool.query('select * from orbit_inbox_projection_work order by source_id')).rows;
  const run = () => runScheduleReminderWindowPass({ ...f, inboxProjection: f.work });
  assert.equal((await run()).windowExamined, 0);
  await f.schedule.refreshReminderPlansForSeries({ actorId: f.actorId, id: scheduleItem.id });
  assert.deepEqual((await f.pool.query('select * from orbit_schedule_reminder_windows')).rows[0], initial, 'same revision before due time does not churn progress');
  await f.pool.query(`create function reject_window_extension() returns trigger language plpgsql as $$ begin
    if new.horizon_through>old.horizon_through then raise exception 'Injected progress failure'; end if; return new; end $$;
    create trigger reject_window_extension before update on orbit_schedule_reminder_windows for each row execute function reject_window_extension()`);
  let next = '2026-11-24T00:00:00.000Z';
  for (let attempt = 0; attempt < 8; attempt++) {
    f.advance(next);
    assert.equal((await run()).windowFailed, 1);
    const progress = (await f.pool.query('select * from orbit_schedule_reminder_windows')).rows[0];
    assert.equal(progress.failures, attempt + 1);
    assert.equal(progress.horizon_through.toISOString(), initial.horizon_through.toISOString());
    assert.equal(progress.next_refresh_at.getTime() - Date.parse(next), Math.min(3600, 60 * 2 ** attempt) * 1000);
    assert.equal(progress.state, attempt === 7 ? 'failed' : 'active');
    assert.equal((await run()).windowExamined, 0, 'same heartbeat cannot hot-loop failures');
    assert.deepEqual((await f.pool.query('select * from orbit_inbox_projection_work order by source_id')).rows, beforeWork, 'new inbox work must roll back too');
    assert.equal((await f.pool.query("select count(*)::int n from orbit_records where collection_name='reminderPlans'")).rows[0].n, 3);
    next = progress.next_refresh_at.toISOString();
  }
  await f.pool.query('drop trigger reject_window_extension on orbit_schedule_reminder_windows');
  await f.schedule.refreshReminderPlansForSeries({ actorId: f.actorId, id: scheduleItem.id });
  assert.equal((await f.pool.query('select state from orbit_schedule_reminder_windows')).rows[0].state, 'failed');
  await f.schedule.update(f.actorId, scheduleItem.id, { patch: { title: 'Changed' }, scope: 'series', expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: 'new-revision' });
  const reactivated = (await f.pool.query('select * from orbit_schedule_reminder_windows')).rows[0];
  assert.equal(reactivated.state, 'active'); assert.equal(reactivated.failures, 0);
  assert.notEqual(reactivated.source_revision, initial.source_revision);
}));

test('concurrent window workers serialize on the schedule actor and never list all schedules', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  await f.schedule.create(f.actorId, monthly('concurrent'));
  f.advance('2026-11-24T00:00:00.000Z');
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let ownedReads = 0;
  const guarded = (hold: boolean): TransactionalPostgresClient => ({ ...f.client, transaction: operation => f.client.transaction(tx => operation({
    async query<T>(sql: string, values?: readonly unknown[]) {
      if (/from orbit_records/i.test(sql) && values?.includes('personal_schedule_items')) {
        assert.match(sql.slice(sql.toLowerCase().indexOf('where')), /record_id\s*=\s*\$/i, 'schedule access must be an exact identity, not an actor-wide list');
        ownedReads++;
      }
      if (hold && /select series_id from orbit_schedule_reminder_windows/.test(sql)) { entered(); await gate; }
      return tx.query<T>(sql, values);
    },
  })) });
  const first = runScheduleReminderWindowPass({ ...f, client: guarded(true), inboxProjection: f.work });
  try {
    await started;
    const second = await runScheduleReminderWindowPass({ ...f, client: guarded(false), inboxProjection: f.work });
    assert.equal(second.windowSkipped, 1); assert.equal(second.windowFailed, 0); assert.equal(second.windowExtended, 0);
  } finally { release(); }
  assert.equal((await first).windowExtended, 1);
  assert.ok(ownedReads > 0, 'SQL guard must exercise the real source read');
  assert.equal((await runScheduleReminderWindowPass({ ...f, inboxProjection: f.work })).windowExamined, 0);
  assert.equal((await f.pool.query("select count(*)::int n from orbit_records where collection_name='reminderPlans'")).rows[0].n, 5);
}));

test('cancelled, disabled, removed and foreign schedules cannot extend reminder windows', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  for (const kind of ['cancelled', 'disabled', 'no-repeat', 'removed', 'foreign']) {
    const { scheduleItem: item } = await f.schedule.create(f.actorId, monthly(kind));
    if (kind === 'cancelled') await f.schedule.remove(f.actorId, item.id, { scope: 'series', expectedUpdatedAt: item.updatedAt, idempotencyKey: 'cancel' });
    if (kind === 'disabled' || kind === 'no-repeat') await f.schedule.update(f.actorId, item.id, { scope: 'series', expectedUpdatedAt: item.updatedAt, idempotencyKey: kind + '-edit', patch: kind === 'disabled' ? { reminderMinutes: null } : { recurrence: null } });
    if (kind === 'removed') await f.pool.query("update orbit_records set lifecycle_state='deleted',deleted_at=$2 where collection_name='personal_schedule_items' and record_id=$1", [item.id, f.now()]);
    if (kind === 'foreign') await f.pool.query("update orbit_records set user_id='other' where collection_name='personal_schedule_items' and record_id=$1", [item.id]);
  }
  const count = (await f.pool.query("select count(*)::int n from orbit_records where collection_name='reminderPlans'")).rows[0].n;
  f.advance('2026-11-24T00:00:00.000Z');
  const result = await runScheduleReminderWindowPass({ ...f, inboxProjection: f.work });
  assert.equal(result.windowExamined, 2); assert.equal(result.windowSkipped, 2); assert.equal(result.windowFailed, 0);
  assert.deepEqual((await f.pool.query('select distinct state from orbit_schedule_reminder_windows')).rows, [{ state: 'inactive' }]);
  assert.equal((await f.pool.query("select count(*)::int n from orbit_records where collection_name='reminderPlans'")).rows[0].n, count);
}));

test('idle window discovery is indexed, bounded, and never downloads schedule bodies', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  await f.pool.query(`insert into orbit_schedule_reminder_windows(workspace_id,actor_id,series_id,source_revision,state,horizon_through,next_refresh_at,updated_at)
    select 'w','bulk','series:'||n,'revision',case when n<=10000 then 'active' else 'inactive' end,'2027-01-01','2026-12-01','2026-09-25' from generate_series(1,20000) n`);
  await f.pool.query('analyze orbit_schedule_reminder_windows');
  const read: { sql: string; rows: number }[] = [];
  const client: TransactionalPostgresClient = { ...f.client, transaction: op => f.client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    assert.doesNotMatch(sql, /orbit_records/);
    const result = await tx.query<T>(sql, values); if (!sql.includes('set_config')) read.push({ sql, rows: result.rows.length }); return result;
  } })) };
  assert.equal((await runScheduleReminderWindowPass({ ...f, client, inboxProjection: f.work })).windowExamined, 0);
  assert.equal(read.length, 1); assert.equal(read[0].rows, 0);
  assert.match(read[0].sql, /limit \$3/);
  const plan = await f.pool.query('explain (format json) ' + read[0].sql, ['w', f.now(), 10]);
  assert.match(JSON.stringify(plan.rows), /orbit_schedule_reminder_windows_due_idx/);
  read.length = 0;
  assert.equal((await runScheduleReminderWindowPass({ ...f, client, inboxProjection: f.work, clock: () => new Date(f.now()), deadline: Date.parse(f.now()) })).windowDeferred, 1);
  assert.equal(read.length, 0);
}));

test('serialization retries use fresh transactions and stop starting retries after the deadline', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  await f.schedule.create(f.actorId, monthly('retry'));
  f.advance('2026-11-24T00:00:00.000Z');
  let attempts = 0; const transactionIds = new Set<string>();
  const client: TransactionalPostgresClient = { ...f.client, transaction: op => f.client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    if (/select series_id from orbit_schedule_reminder_windows/.test(sql)) {
      transactionIds.add((await tx.query<{ id: string }>('select txid_current()::text id')).rows[0].id);
      if (++attempts === 1) throw Object.assign(Error('Injected serialization conflict'), { code: '40001' });
    }
    return tx.query<T>(sql, values);
  } })) };
  assert.equal((await runScheduleReminderWindowPass({ ...f, client, inboxProjection: f.work })).windowExtended, 1);
  assert.equal(attempts, 2); assert.equal(transactionIds.size, 2);
  f.advance('2027-01-23T00:00:00.000Z');
  const deadline = Date.parse(f.now()) + 1000;
  let calls = 0;
  const expiring: TransactionalPostgresClient = { ...f.client, transaction: op => {
    calls++;
    return f.client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
      if (/select series_id from orbit_schedule_reminder_windows/.test(sql)) {
        f.advance(new Date(deadline).toISOString());
        throw Object.assign(Error('Injected serialization conflict'), { code: '40001' });
      }
      return tx.query<T>(sql, values);
    } }));
  } };
  const result = await runScheduleReminderWindowPass({ ...f, client: expiring, inboxProjection: f.work, clock: () => new Date(f.now()), deadline });
  assert.equal(result.windowDeferred, 1); assert.equal(result.windowFailed, 0);
  assert.equal(calls, 2, 'one discovery and one attempt, no transaction after deadline');
}));

test('failure-marker outage does not stop an independent due series', { skip: !url, timeout: 20000 }, async () => withWindowFixture(async f => {
  const { scheduleItem: broken } = await f.schedule.create('a', monthly('broken'));
  await f.schedule.create('b', monthly('healthy'));
  f.advance('2026-11-24T00:00:00.000Z');
  const client: TransactionalPostgresClient = { ...f.client, transaction: op => f.client.transaction(tx => op({ async query<T>(sql: string, values?: readonly unknown[]) {
    if (values?.includes(broken.id) && /orbit_schedule_reminder_windows/.test(sql) && (/insert into/.test(sql) || /set failures=failures\+1/.test(sql))) throw Error('Injected write outage');
    return tx.query<T>(sql, values);
  } })) };
  const result = await runScheduleReminderWindowPass({ ...f, client, inboxProjection: f.work });
  assert.equal(result.windowFailed, 1); assert.equal(result.windowDeferred, 1); assert.equal(result.windowExtended, 1);
  const counts = (await f.pool.query("select user_id,count(*)::int n from orbit_records where collection_name='reminderPlans' group by user_id order by user_id")).rows;
  assert.deepEqual(counts, [{ user_id: 'a', n: 3 }, { user_id: 'b', n: 5 }]);
}));
