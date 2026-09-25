import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createTodayCompletedCounter } from '../../features/tasks/today-completed-counter';
import { createTodayService } from '../../features/tasks/today-service';
import { createTodayGetHandler } from '../../app/api/today/handler';
import { createTaskService } from '../../features/tasks/service';
import { createTaskRepository } from '../../features/tasks/repository';
import { createTaskSuggestionService } from '../../features/tasks/suggestion-service';
import { createTaskSuggestionRepository } from '../../features/tasks/suggestion-repository';
import { createPostgresLiveRecordStore } from '../../shared/storage/postgres-live-record-store';
import { ORBIT_RECORDS_SCHEMA_SQL } from '../../shared/storage/migrations';

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('Today completion count preserves owned historical facts, timezone boundaries and constant result size', { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(address.hostname)); assert.equal(address.search, '');
  const schema = 'today_count_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ connectionString: url, max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const store = createPostgresLiveRecordStore({ client: pool });
  const taskService = createTaskService({ repository: createTaskRepository({ store, workspaceId: 'w' }) });
  let bytes = 0, queries = 0;
  const measured = { async query<T>(sql: string, values?: readonly unknown[]) {
    const response = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(response.rows));
    return { rows: response.rows as T[] };
  } };
  const counter = createTodayCompletedCounter({ client: measured, workspaceId: 'w' });
  const at = '2026-09-25T00:00:00.000Z';
  const activity = (taskId: string, stamp = at, id = 'completed') => ({ id, taskId, accountId: 'a', ownerUserId: 'a', type: 'completed', actorType: 'user', occurredAt: stamp, taskSnapshot: { title: taskId, category: 'work' } });
  const insert = async (id: string, activities: unknown[] = [activity(id)], patch: Record<string, unknown> = {}, record: { owner?: string; workspace?: string; state?: string } = {}) => {
    const task = { id, accountId: 'a', ownerUserId: 'a', title: id, category: 'work', status: 'open', priority: 'normal', source: 'manual', createdAt: at, updatedAt: at, ...patch };
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,payload,created_at,updated_at)
      values($1,'tasks',$2,$3,'manual',$2,$4,$5::jsonb,now(),now())`, [record.workspace ?? 'w', id, record.owner ?? 'a', record.state ?? 'active', JSON.stringify({ version: 1, task, activities })]);
  };
  const localDate = (stamp: string, timeZone: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const expected = async (now: string, timeZone: string) => new Set((await taskService.history({ actorId: 'a' }))
    .filter(a => a.type === 'completed' && localDate(a.occurredAt, timeZone) === localDate(now, timeZone)).map(a => a.taskId)).size;
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await insert('reopened');
    await insert('twice', [activity('twice', at, 'first'), activity('twice', '2026-09-25T01:00:00Z', 'second')]);
    await insert('deleted', undefined, {}, { state: 'deleted' });
    await insert('archived', undefined, {}, { state: 'archived' });
    await insert('cancelled', undefined, { status: 'cancelled' });
    await insert('foreign-row', undefined, {}, { owner: 'b' });
    await insert('foreign-workspace', undefined, {}, { workspace: 'other' });
    await insert('foreign-account', undefined, { accountId: 'b' });
    await insert('foreign-owner', undefined, { ownerUserId: 'b' });
    await insert('foreign-history', [{ ...activity('foreign-history'), ownerUserId: 'b' }]);
    await insert('bad-id', undefined, { id: 'different' });
    await insert('bad-date', [{ ...activity('bad-date'), occurredAt: 'invalid' }]);
    await insert('bad-title', undefined, { title: '\uFEFF\u00A0' });
    await insert('bad-snapshot', [{ ...activity('bad-snapshot'), taskSnapshot: { title: 'x', category: 'unknown' } }]);
    await insert('bad-duplicate', [activity('bad-duplicate'), activity('bad-duplicate')]);
    await insert('bad-order', [activity('bad-order', '2026-09-26T00:00:00Z', 'later'), activity('bad-order', at, 'earlier')]);
    const timestamps = ['2026-09-24T14:59:59.999Z', '2026-09-24T15:00:00Z', '2026-09-25T14:59:59.999Z', '2026-09-25T15:00:00Z',
      '2026-02-31T00:00:00Z', '2026-03-03T24:00:00Z', '2026-09-25T01:00:00+23:59',
      '2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z', '2026-03-09T03:59:59Z', '2026-03-09T04:00:00Z',
      '2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z', '2026-11-02T04:59:59Z', '2026-11-02T05:00:00Z', '0001-01-01T00:00:00Z', '0000-01-01T00:00:00Z'];
    for (const [n, stamp] of timestamps.entries()) await insert(`time:${n}`, [activity(`time:${n}`, stamp)]);
    for (const [now, timeZone] of [[at, 'Asia/Tokyo'], [at, 'UTC'], [at, '+09:30'], [at, '-09:30'], [at, 'Asia/Calcutta'], ['2026-03-08T12:00:00Z', 'America/New_York'],
      ['2026-11-01T12:00:00Z', 'America/New_York'], ['2026-03-03T12:00:00Z', 'UTC'], ['2026-03-04T12:00:00Z', 'UTC'], ['0001-01-01T00:00:00Z', 'UTC']]) {
      assert.equal(await counter.count({ actorId: 'a', now, timeZone }), await expected(now, timeZone), `${now} ${timeZone}`);
    }
    assert.equal(await createTodayCompletedCounter({ client: measured, workspaceId: 'absent' }).count({ actorId: 'a', now: at, timeZone: 'UTC' }), 0);
    assert.equal(await counter.count({ actorId: 'b', now: at, timeZone: 'UTC' }), 0);
    const baseline = await expected(at, 'Asia/Tokyo');
    bytes = 0; queries = 0;
    assert.equal(await counter.count({ actorId: 'a', now: at, timeZone: 'Asia/Tokyo' }), baseline);
    const beforeBytes = bytes;
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','growth:'||n,'a','manual','growth:'||n,jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','growth:'||n,'accountId','a','ownerUserId','a','title','Growth '||n,'notes',repeat('x',4096),'status','open','category','work','priority','normal','source','manual','createdAt',$1::text,'updatedAt',$1::text)),now(),now()
      from generate_series(1,10000) n`, [at]);
    const legacyMeasured = createTaskService({ repository: createTaskRepository({ store: createPostgresLiveRecordStore({ client: measured }), workspaceId: 'w' }) });
    bytes = 0; queries = 0;
    await legacyMeasured.history({ actorId: 'a' });
    const legacyBytes = bytes;
    assert.ok(legacyBytes > 40_000_000, 'legacy count input includes all unrelated private bodies');
    bytes = 0; queries = 0;
    assert.equal(await counter.count({ actorId: 'a', now: at, timeZone: 'Asia/Tokyo' }), baseline);
    assert.equal(bytes, beforeBytes); assert.equal(queries, 1);
    console.log(JSON.stringify({ metric: 'today_completed_count', tasks: 10000 + timestamps.length + 16, bytes, queries, legacyBytes }));
    const today = createTodayService({ taskService: { ...taskService, async list() { return []; }, async history() { throw Error('History body download forbidden'); } }, completedCounter: counter,
      suggestionService: createTaskSuggestionService({ taskService, repository: createTaskSuggestionRepository({ store, workspaceId: 'w' }) }), scheduleProvider: { async list() { return []; } } });
    const response = await createTodayGetHandler({ resolveActor: async () => ({ id: 'a' }), now: () => at, service: today })(new Request('http://localhost/api/today?timeZone=Asia%2FTokyo'));
    assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.data.completedCount, baseline); assert.equal(body.data.summary.completedCount, baseline);
    const fail = createTodayService({ taskService: { ...taskService, async list() { return []; } }, completedCounter: { async count() { throw Error('Database unavailable'); } },
      suggestionService: createTaskSuggestionService({ taskService, repository: createTaskSuggestionRepository({ store, workspaceId: 'w' }) }), scheduleProvider: { async list() { return []; } } });
    const unavailable = await createTodayGetHandler({ resolveActor: async () => ({ id: 'a' }), now: () => at, service: fail })(new Request('http://localhost/api/today'));
    assert.equal(unavailable.status, 503);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});

test('completion counter rejects invalid query and corrupt aggregate receipts instead of inventing zero', async () => {
  let calls = 0;
  const client = { async query<T>() { calls++; return { rows: [] as T[] }; } };
  assert.throws(() => createTodayCompletedCounter({ client, workspaceId: ' ' }), /SCOPE_INVALID/);
  const counter = createTodayCompletedCounter({ client, workspaceId: 'w' });
  for (const query of [{ actorId: '', now: '2026-09-25', timeZone: 'UTC' }, { actorId: 'a', now: 'invalid', timeZone: 'UTC' }, { actorId: 'a', now: '2026-09-25', timeZone: 'not-a-zone' }]) await assert.rejects(counter.count(query));
  assert.equal(calls, 0);
  const query = { actorId: 'a', now: '2026-09-25', timeZone: 'UTC' };
  await assert.rejects(counter.count(query), /RESULT_INVALID/);
  for (const value of [null, -1, 0, 'NaN', '-1', '01', '9007199254740992']) {
    const invalid = createTodayCompletedCounter({ workspaceId: 'w', client: { async query<T>() { return { rows: [{ count: value }] as T[] }; } } });
    await assert.rejects(invalid.count(query), /RESULT_INVALID/);
  }
});
