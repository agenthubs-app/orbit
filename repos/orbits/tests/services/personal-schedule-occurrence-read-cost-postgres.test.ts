import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTransactionalPostgresClient, type TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';
import { createPersonalScheduleService } from '../../features/personal-schedule/service';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('exact moved occurrence reads never download the series exception history', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url); assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'occurrence_cost_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  let reads: { sql: string; values?: readonly unknown[]; rows: number; bytes: number }[] = [];
  const measured: TransactionalSqlExecutor = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await client.query<T>(sql, values);
    if (/^\s*select/i.test(sql) && values?.includes('personal_schedule_occurrence_exceptions')) {
      reads.push({ sql, values, rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)) });
    }
    return result;
  } };
  const at = '2026-09-25T00:00:00.000Z', workspaceId = 'w', actorId = 'a';
  const store = createPostgresLiveRecordStore({ client: measured });
  const service = createPersonalScheduleService({ store, client, workspaceId, now: () => at });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { scheduleItem } = await service.create(actorId, { title: 'Daily', startsAt: '1990-01-01T09:00:00.000Z', endsAt: '1990-01-01T10:00:00.000Z',
      timeZone: 'UTC', recurrence: { frequency: 'daily' }, idempotencyKey: 'create' });
    const occurrenceId = scheduleItem.id + ':occurrence:2026-09-26';
    const moved = await service.update(actorId, occurrenceId, { scope: 'occurrence', expectedUpdatedAt: scheduleItem.updatedAt, idempotencyKey: 'move',
      patch: { startsAt: '2026-10-02T11:00:00.000Z', endsAt: '2026-10-02T12:00:00.000Z', title: 'Moved' } });
    reads = [];
    const before = await service.get({ actorId, id: occurrenceId });
    assert.equal(before.startsAt, '2026-10-02T11:00:00.000Z'); assert.equal(before.title, 'Moved');
    const baseline = reads.reduce((n, read) => n + read.bytes, 0);
    assert.equal(reads.length, 2); assert.ok(reads.every(read => read.rows === 1));
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
      select $1,'personal_schedule_occurrence_exceptions',$2||':occurrence:'||occurrence_date,$3,'manual',$2,array[]::text[],'active',
        jsonb_build_object('seriesId',$2::text,'occurrenceDate',occurrence_date,'cancelled',false,'patch',jsonb_build_object('title',repeat('t',200),'location',repeat('l',400)),'updatedAt',$4::text),$4::timestamptz,$4::timestamptz
      from (select to_char(date '1990-01-01'+n,'YYYY-MM-DD') as occurrence_date from generate_series(0,9999)n) dates`, [workspaceId, scheduleItem.id, actorId, at]);
    reads = [];
    assert.deepEqual(await service.get({ actorId, id: occurrenceId }), before);
    assert.equal(reads.length, 2); assert.ok(reads.every(read => read.rows === 1));
    assert.equal(reads.reduce((n, read) => n + read.bytes, 0), baseline);
    await pool.query('analyze orbit_records');
    const explain = await pool.query('explain (analyze, buffers, format json) ' + reads[0].sql, [...reads[0].values!]);
    assert.match(JSON.stringify(explain.rows), /orbit_records_pkey/); assert.doesNotMatch(JSON.stringify(explain.rows), /Seq Scan/);
    await assert.rejects(service.get({ actorId: 'other', id: occurrenceId }), /not found/);
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{cancelled}','true') where collection_name='personal_schedule_occurrence_exceptions' and record_id=$1", [occurrenceId]);
    await assert.rejects(service.get({ actorId, id: occurrenceId }), /not found/);
    assert.equal(moved.scheduleItem.id, occurrenceId);
    console.log(JSON.stringify({ metric: 'exact_schedule_occurrence', historicalExceptions: 10000, exceptionQueries: 2, exceptionRows: 2, exceptionBytes: baseline }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await client.close(); }
});
