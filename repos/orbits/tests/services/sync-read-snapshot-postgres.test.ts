import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool, type PoolClient } from "pg";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

const TEST_URL = process.env.ORBIT_SYNC_PHASE_A_TEST_URL ?? "";
const EXPECTED_DIRECTORY = process.env.ORBIT_SYNC_PHASE_A_TEST_DATA_DIRECTORY ?? "";
const testOptions = {
  timeout: 15000,
  skip: !TEST_URL && process.env.ORBIT_SYNC_PHASE_A_REQUIRE_DB !== "1"
    ? "isolated ORBIT_SYNC_PHASE_A_TEST_URL not provided; not Phase A verification"
    : false,
};
async function fixture(t: TestContext) {
  assert.ok(TEST_URL, "explicit owned fixture URL required; no default connection");
  assert.ok(EXPECTED_DIRECTORY.startsWith("/"), "explicit expected owned data_directory required");
  const target = new URL(TEST_URL);
  assert.equal(target.protocol, "postgresql:"); assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.username, "orbit_phase_a"); assert.equal(target.pathname, "/orbit_sync_phase_a");
  assert.equal(target.password, ""); assert.equal(target.search, ""); assert.equal(target.hash, "");
  const port = Number(target.port);
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535 && ![3000,5432,6543,8082].includes(port) && !(port >= 32000 && port <= 32999), "explicit unprotected fixture port required");
  const pool = new Pool({ connectionString: TEST_URL, max: 8, application_name: "sprint0033-phase-a-read" });
  let schema = "";
  t.after(async () => { try { if (schema) await pool.query(`drop schema if exists ${schema} cascade`); } finally { await pool.end(); } });
  const marker = await pool.query("select current_database() db,current_user actor,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_setting('server_version_num') version");
  assert.deepEqual({ ...marker.rows[0], version: undefined }, { db: "orbit_sync_phase_a", actor: "orbit_phase_a", host: "127.0.0.1", port, directory: EXPECTED_DIRECTORY, version: undefined });
  assert.ok(Number(marker.rows[0].version) >= 180003);
  schema = `phase_a_read_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`create schema ${schema}; create sequence ${schema}.revision;
    create table ${schema}.source(id text primary key,value int);
    create table ${schema}.journal(revision bigint primary key,id text);
    create table ${schema}.epoch(id text primary key,version int);`);
  return { pool, schema };
}
async function pid(client: PoolClient) { return Number((await client.query("select pg_backend_pid() pid")).rows[0].pid); }
async function blocked(pool: Pool, waiter: number, blocker: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await pool.query("select $2::int=any(pg_blocking_pids($1::int)) blocked", [waiter, blocker])).rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`backend ${waiter} did not block on exact backend ${blocker}`);
}
async function syntheticWrite(client: PoolClient, schema: string, id: string) {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock_shared($1,$2)", [1330790996, 2]);
  await client.query(`insert into ${schema}.source values($1,1)`, [id]);
  const revision = String((await client.query(`select nextval('${schema}.revision') revision`)).rows[0].revision);
  await client.query(`insert into ${schema}.journal values($1,$2)`, [revision, id]);
  await client.query(`insert into ${schema}.epoch values($1,1)`, [id]);
  return revision;
}
function snapshotSql(schema: string) {
  return `with high as (select coalesce(max(revision),0)::text watermark from ${schema}.journal),
    source as (select coalesce(jsonb_agg(id order by id),'[]'::jsonb) ids from ${schema}.source),
    policy as (select coalesce(jsonb_object_agg(id,version),'{}'::jsonb) epochs from ${schema}.epoch)
    select high.watermark,source.ids,policy.epochs from high cross join source cross join policy`;
}

test("real old Repeatable Read lock SELECT freezes snapshot before waiting, omitting committed low revision", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const a = await pool.connect(), b = await pool.connect(), reader = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    const low = await syntheticWrite(a, schema, "a");
    const high = await syntheticWrite(b, schema, "b"); await b.query("commit");
    assert.ok(BigInt(high) > BigInt(low));
    const aPid = await pid(a), readerPid = await pid(reader);
    await reader.query("begin isolation level repeatable read");
    pending = reader.query("select pg_advisory_xact_lock($1,$2)", [1330790996, 2]); void pending.catch(() => {});
    await blocked(pool, readerPid, aPid); await a.query("commit"); await pending;
    const old = (await reader.query(snapshotSql(schema))).rows[0];
    assert.equal(old.watermark, high); assert.deepEqual(old.ids, ["b"]); assert.deepEqual(old.epochs, { b: 1 });
    assert.deepEqual((await pool.query(`select id from ${schema}.source order by id`)).rows.map((row) => row.id), ["a", "b"]);
  } finally {
    await Promise.all([a, b, reader].map(async (client) => { await client.query("rollback"); client.release(); }));
    if (pending) await Promise.allSettled([pending]);
  }
});

test("new RC barrier waits for low-revision commit then reads source/journal/epoch in one fresh SQL snapshot", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const { createPostgresSyncReadRuntime } = await import("../../features/sync/postgres-read-runtime");
  const a = await pool.connect(), b = await pool.connect();
  let readerPid = 0, pending: Promise<unknown> | undefined;
  const client = createEventOperationsPostgresClient({ connectionString: TEST_URL, pool: {
    query: pool.query.bind(pool), end: pool.end.bind(pool),
    async connect() { const connection = await pool.connect(); readerPid = await pid(connection); return connection; },
  } });
  try {
    const low = await syntheticWrite(a, schema, "a");
    const high = await syntheticWrite(b, schema, "b"); await b.query("commit"); assert.ok(BigInt(high) > BigInt(low));
    const runtime = createPostgresSyncReadRuntime(client);
    const result = runtime.readPageSnapshot<{ watermark: string; ids: string[]; epochs: Record<string, number> }>(snapshotSql(schema)); pending = result; void pending.catch(() => {});
    const deadline = Date.now() + 3000;
    while (!readerPid && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(readerPid); await blocked(pool, readerPid, await pid(a));
    await a.query("commit");
    const page = (await result).rows[0]; assert.equal(page.watermark, high); assert.deepEqual(page.ids, ["a", "b"]); assert.deepEqual(page.epochs, { a: 1, b: 1 });
    await assert.rejects(runtime.readPageSnapshot(`delete from ${schema}.source`), /read-only transaction/);
    const acquired = await pool.connect();
    try { await acquired.query("begin"); await acquired.query("set local lock_timeout='500ms'"); await acquired.query("select pg_advisory_xact_lock_shared($1,$2)", [1330790996, 2]); }
    finally { await acquired.query("rollback"); acquired.release(); }
  } finally {
    await Promise.all([a, b].map(async (connection) => { await connection.query("rollback"); connection.release(); }));
    if (pending) await Promise.allSettled([pending]);
  }
});

test("RR read-only lease callback shares one consistent snapshot across real concurrent permission commit", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const { createPostgresSyncReadRuntime } = await import("../../features/sync/postgres-read-runtime");
  const client = createEventOperationsPostgresClient({ connectionString: TEST_URL, pool });
  const runtime = createPostgresSyncReadRuntime(client);
  const seen = await runtime.readLeaseSnapshot(async (tx) => {
    const source = await tx.query(`select count(*)::int n from ${schema}.source`);
    const writer = await pool.connect();
    try { await syntheticWrite(writer, schema, "new"); await writer.query("commit"); }
    finally { await writer.query("rollback"); writer.release(); }
    const epoch = await tx.query(`select count(*)::int n from ${schema}.epoch`);
    return { source: source.rows[0].n, epoch: epoch.rows[0].n };
  });
  assert.deepEqual(seen, { source: 0, epoch: 0 });
  const fresh = (await runtime.readPageSnapshot(snapshotSql(schema))).rows[0]; assert.deepEqual(fresh.ids, ["new"]);
  await assert.rejects(runtime.readLeaseSnapshot((tx) => tx.query(`insert into ${schema}.source values('bad',1)`)), /read-only transaction/);
});

test("fresh page watermark ignores a real rolled-back tail revision and later writer advances beyond the hole", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const { createPostgresSyncReadRuntime } = await import("../../features/sync/postgres-read-runtime");
  const runtime = createPostgresSyncReadRuntime(createEventOperationsPostgresClient({ connectionString: TEST_URL, pool }));
  const writer = await pool.connect();
  try {
    const committed = await syntheticWrite(writer, schema, "committed"); await writer.query("commit");
    const hole = await syntheticWrite(writer, schema, "rolled-back"); await writer.query("rollback");
    assert.ok(BigInt(hole) > BigInt(committed));
    assert.equal(String((await pool.query(`select last_value from ${schema}.revision`)).rows[0].last_value), hole);
    const page = (await runtime.readPageSnapshot(snapshotSql(schema))).rows[0];
    assert.equal(page.watermark, committed); assert.deepEqual(page.ids, ["committed"]); assert.deepEqual(page.epochs, { committed: 1 });
    const later = await syntheticWrite(writer, schema, "later"); await writer.query("commit"); assert.ok(BigInt(later) > BigInt(hole));
    const advanced = (await runtime.readPageSnapshot(snapshotSql(schema))).rows[0];
    assert.equal(advanced.watermark, later); assert.deepEqual(advanced.ids, ["committed", "later"]);
  } finally { await writer.query("rollback"); writer.release(); }
});
