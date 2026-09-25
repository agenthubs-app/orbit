import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('schedule windows do not download unrelated exception history but retain moved-in, moved-out and cancelled occurrences', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url);
  const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname));
  assert.equal(address.search, '');
  const schema = 'schedule_window_cost_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  let reads: { rows: number; bytes: number }[] = [];
  const observe = (executor: TransactionalSqlExecutor): TransactionalSqlExecutor => ({ async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await executor.query<T>(sql, values);
    if (/^\s*(select|with)\b/i.test(sql) && (sql.includes('personal_schedule_occurrence_exceptions') || values?.includes('personal_schedule_occurrence_exceptions'))) {
      reads.push({ rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)) });
    }
    return result;
  } });
  const measured: TransactionalPostgresClient = { ...observe(client), close: () => client.close(), transaction: operation => client.transaction(tx => operation(observe(tx))) };
  const at = '2026-09-25T00:00:00.000Z', workspaceId = 'w', actorId = 'a';
  const service = createPersonalScheduleService({ store: createPostgresLiveRecordStore({ client: measured }), client: measured, workspaceId, now: () => at });
  const window = { actorId, from: at, to: '2026-09-28T00:00:00.000Z' };
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { scheduleItem: series } = await service.create(actorId, {
      title: 'Daily', startsAt: '1990-01-01T09:00:00.000Z', timeZone: 'UTC', recurrence: { frequency: 'daily' }, idempotencyKey: 'create',
    });
    const add = (date: string, patch: Record<string, unknown>, cancelled = false, owner = actorId) => pool.query(`
      insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values($1,'personal_schedule_occurrence_exceptions',$2,$3,'manual',$4,$5::jsonb,$6,$6)`, [workspaceId, `${series.id}:occurrence:${date}`, owner, series.id,
      JSON.stringify({ seriesId: series.id, occurrenceDate: date, cancelled, patch, updatedAt: at }), at]);
    await add('1989-12-31', { startsAt: '2026-09-26T00:30:00+01:00', title: 'Before series: must not materialize' });
    await add('1990-01-01', { startsAt: '2026-09-26T00:30:00+01:00', title: 'Moved into window' });
    await add('2026-09-25', { startsAt: '2026-10-01T09:00:00Z' });
    await add('2026-09-26', {}, true);
    await add('2026-09-27', { title: 'Current title' });
    await add('1990-01-02', { startsAt: '2026-09-26T00:00:00Z', title: 'Foreign' }, false, 'other');
    reads = [];
    const before = await service.list(window);
    assert.deepEqual(before.map(item => item.title), ['Moved into window', 'Current title']);
    const baseline = reads.reduce((sum, row) => sum + row.bytes, 0);
    assert.equal(reads.length, 1);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select $1,'personal_schedule_occurrence_exceptions',$2||':occurrence:'||d,$3,'manual',$2,
        jsonb_build_object('seriesId',$2::text,'occurrenceDate',d,'cancelled',false,'patch',jsonb_build_object('title',repeat('t',200),'location',repeat('l',400)),'updatedAt',$4::text),$4::timestamptz,$4::timestamptz
      from (select to_char(date '1991-01-01'+n,'YYYY-MM-DD') d from generate_series(0,9999)n) dates`, [workspaceId, series.id, actorId, at]);
    reads = [];
    assert.deepEqual(await service.list(window), before);
    assert.equal(reads.length, 1);
    assert.equal(reads.reduce((sum, row) => sum + row.bytes, 0), baseline);
    assert.ok(reads[0]!.rows <= 5);
    console.log(JSON.stringify({ metric: 'schedule_window_exception_history', unrelatedExceptions: 10000, exceptionQueries: reads.length, exceptionRows: reads[0]!.rows, exceptionBytes: baseline }));
    // Stored ISO offsets can put their date outside the UTC window. Selection
    // must retain the exact lower boundary and final membership exclude `to`.
    await add('1990-01-03', { startsAt: '2026-09-24T00:01:00-23:59', title: 'Exactly from' });
    await add('1990-01-04', { startsAt: '2026-09-28T23:59:00+23:59', title: 'Exactly to' });
    await add('1990-01-05', { startsAt: '2026-09-28T23:58:59+23:59', title: 'Just before to' });
    assert.deepEqual((await service.list(window)).map(item => item.title), ['Exactly from', 'Moved into window', 'Current title', 'Just before to']);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});
