import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalSqlExecutor, type TransactionalPostgresClient } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('schedule reconciliation does not download unrelated plans or historical revisions and cancels beyond one page', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'schedule_reminder_cost_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const raw = createTransactionalPostgresClient({ connectionString: url, pool });
  let reads: { sql: string; rows: number; bytes: number; values?: readonly unknown[] }[] = [];
  const measure = (executor: TransactionalSqlExecutor): TransactionalSqlExecutor => ({
    async query<TRow>(sql: string, values?: readonly unknown[]) {
      const result = await executor.query<TRow>(sql, values);
      if (/^\s*(select|with)\b/i.test(sql)) reads.push({ sql, rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)), values });
      return result;
    },
  });
  const client: TransactionalPostgresClient = { ...measure(raw), close: () => raw.close(), transaction: operation => raw.transaction(tx => operation(measure(tx))) };
  const workspaceId = 'w', actorId = 'a'; let clock = '2026-09-25T00:00:00.000Z';
  const store = createPostgresLiveRecordStore({ client });
  const service = createPersonalScheduleService({ store, client, workspaceId, now: () => clock });
  const refresh = async () => { reads = []; await service.refreshReminderPlans({ actorId }); return reads.reduce((n, r) => n + r.bytes, 0); };
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { scheduleItem } = await service.create(actorId, { title: 'Daily', startsAt: '2026-09-26T09:00:00.000Z', timeZone: 'UTC', reminderMinutes: 15, recurrence: { frequency: 'daily' }, idempotencyKey: 'create' });
    const baseline = await refresh();
    assert.ok(baseline < 15000, 'unchanged plans need batched identity checks, not repeated full body downloads');
    // Local-only expansion: other plans owned by this actor, not just foreign
    // actors. The old actor-wide list downloaded every 4 KB body per series.
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,created_at,updated_at,lifecycle_state,payload)
      select $1,'reminderPlans','manual:'||n,$2,'system','manual:'||n,array[]::text[],$3::timestamptz,$3::timestamptz,'active',
        jsonb_build_object('entity',payload->'entity'||jsonb_build_object('id','manual:'||n,'body',repeat('x',4096)))
      from (select payload from orbit_records where workspace_id=$1 and collection_name='reminderPlans' limit 1) template cross join generate_series(1,10000) n`, [workspaceId, actorId, clock]);
    const expanded = await refresh();
    assert.equal(expanded, baseline, 'unrelated reminder growth must add zero downloaded payload');
    const original = await pool.query<{ record_id: string }>(`select record_id from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id like 'schedule-reminder:%'`, [workspaceId]);
    assert.ok(original.rows.length > 50, 'fixture crosses the cancellation page boundary');
    clock = '2026-09-25T00:01:00.000Z';
    const renamed = await service.update(actorId, scheduleItem.id, { expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: 'rename', scope: 'series', patch: { title: 'Renamed' } });
    const cancelled = await pool.query<{ count: string }>(`select count(*) from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=any($2::text[]) and payload->'entity'->>'status'='cancelled'`, [workspaceId, original.rows.map(r => r.record_id)]);
    assert.equal(Number(cancelled.rows[0].count), original.rows.length, 'changing rows while keyset paging must not skip the second page');
    const withHistory = await refresh();
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,created_at,updated_at,lifecycle_state,payload)
      select workspace_id,collection_name,record_id||':history:'||n,user_id,source_type,record_id||':history:'||n,evidence_ids,created_at,updated_at,lifecycle_state,
        jsonb_build_object('entity',payload->'entity'||jsonb_build_object('id',record_id||':history:'||n,'body',repeat('h',4096),'status','delivered'))
      from (select * from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=any($2::text[]) limit 1) template cross join generate_series(1,10000) n`, [workspaceId, original.rows.map(r => r.record_id)]);
    assert.equal(await refresh(), withHistory, 'history within the same series must also stay out of cancellation reads');
    const cancellation = reads.find(read => read.sql.includes("record_id like $3 || '%'")); assert.ok(cancellation);
    await pool.query('analyze orbit_records');
    const explanation = await pool.query('explain (analyze, buffers, format json) ' + cancellation.sql, [...cancellation.values!]);
    const planText = JSON.stringify(explanation.rows);
    assert.match(planText, /orbit_records_schedule_pending_series_idx/, 'the real planner must use the series range index, without disabling sequential scans');
    assert.doesNotMatch(planText, /Seq Scan/, 'unrelated/history growth must not require a full table scan');
    const untouched = await pool.query<{ count: string }>(`select count(*) from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id like 'manual:%' and payload->'entity'->>'status'='scheduled'`, [workspaceId]);
    assert.equal(Number(untouched.rows[0].count), 10000);
    const identity = (await pool.query<{ record_id: string }>(`select record_id from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id like 'schedule-reminder:%' and payload->'entity'->>'status'='scheduled' limit 1`, [workspaceId])).rows[0].record_id;
    await pool.query(`update orbit_records set user_id='foreign' where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2`, [workspaceId, identity]);
    await assert.rejects(refresh(), /identity is unavailable/, 'matching identity never allows taking another owner’s record');
    assert.equal((await pool.query(`select user_id from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2`, [workspaceId, identity])).rows[0].user_id, 'foreign');
    await pool.query(`update orbit_records set user_id=$3,lifecycle_state='deleted' where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2`, [workspaceId, identity, actorId]);
    await refresh();
    assert.equal((await pool.query(`select lifecycle_state from orbit_records where workspace_id=$1 and collection_name='reminderPlans' and record_id=$2`, [workspaceId, identity])).rows[0].lifecycle_state, 'deleted', 'refresh does not resurrect tombstoned plans');
    await pool.query(`create function reject_plan_change() returns trigger language plpgsql as $$ begin if new.collection_name='reminderPlans' then raise exception 'plan unavailable'; end if; return new; end $$`);
    await pool.query(`create trigger reject_plan_change before insert or update on orbit_records for each row execute function reject_plan_change()`);
    await assert.rejects(service.update(actorId, scheduleItem.id, { expectedUpdatedAt: renamed.scheduleItem.updatedAt, idempotencyKey: 'rollback', scope: 'series', patch: { title: 'Must roll back' } }), /plan unavailable/);
    assert.equal((await service.get({ actorId, id: scheduleItem.id })).title, 'Renamed', 'cancellation and the schedule remain in the same transaction');
    console.info(JSON.stringify({ scheduleReminderReadBytes: { baseline, with10000OtherPlans: expanded, withHistory } }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});
