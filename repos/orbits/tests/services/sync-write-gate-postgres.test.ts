import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool, type PoolClient } from "pg";

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
  const pool = new Pool({ connectionString: TEST_URL, max: 8, application_name: "sprint0033-phase-a-gate" });
  let schema = "";
  t.after(async () => { try { if (schema) await pool.query(`drop schema if exists ${schema} cascade`); } finally { await pool.end(); } });
  const marker = await pool.query("select current_database() db,current_user actor,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_setting('server_version_num') version");
  assert.deepEqual({ ...marker.rows[0], version: undefined }, { db: "orbit_sync_phase_a", actor: "orbit_phase_a", host: "127.0.0.1", port, directory: EXPECTED_DIRECTORY, version: undefined });
  assert.ok(Number(marker.rows[0].version) >= 180003);
  schema = `phase_a_gate_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`create schema ${schema}; create sequence ${schema}.revision;
    create table ${schema}.source(actor text,domain text,id text,value int,primary key(actor,domain,id));
    create table ${schema}.journal(revision bigint primary key,actor text,domain text,id text);
    create table ${schema}.epoch(actor text,domain text,version int,primary key(actor,domain));
    create table ${schema}.receipt(id text primary key,fingerprint text,revision bigint);`);
  return { pool, schema };
}
const lockExecutor = (client: PoolClient) => ({ query: (sql: string, values?: readonly unknown[]) => client.query(sql, values ? [...values] : undefined) });
async function pid(client: PoolClient) { return Number((await client.query("select pg_backend_pid() pid")).rows[0].pid); }
async function blocked(pool: Pool, waiter: number, blocker: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await pool.query("select $2::int=any(pg_blocking_pids($1::int)) blocked", [waiter, blocker])).rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`backend ${waiter} did not block on exact backend ${blocker}`);
}
async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("begin"); const value = await fn(client); await client.query("commit"); return value; }
  catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
async function applySyntheticGrantChange(client: PoolClient, schema: string, rows: readonly { actor: string; domain: string; id: string }[], receipt: string, failAfter?: string) {
  // Test-local synthetic permissions, not any production authorizer or registered source.
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`phase-a-receipt:${schema}:${receipt}`]);
  const prior = await client.query(`select revision,fingerprint from ${schema}.receipt where id=$1`, [receipt]);
  const fingerprint = JSON.stringify(rows);
  if (prior.rows.length) { assert.equal(prior.rows[0].fingerprint, fingerprint); return String(prior.rows[0].revision); }
  const { acquireSharedSyncWriteGate } = await import("../../features/sync/write-gate");
  await acquireSharedSyncWriteGate(lockExecutor(client));
  let revision = "";
  for (const row of [...rows].sort((a, b) => `${a.actor}:${a.domain}:${a.id}`.localeCompare(`${b.actor}:${b.domain}:${b.id}`))) {
    await client.query(`insert into ${schema}.source values($1,$2,$3,1) on conflict(actor,domain,id) do update set value=${schema}.source.value+1`, [row.actor, row.domain, row.id]);
    if (failAfter === "source") throw new Error("injected:source");
    revision = String((await client.query(`select nextval('${schema}.revision') revision`)).rows[0].revision);
    await client.query(`insert into ${schema}.journal values($1,$2,$3,$4)`, [revision, row.actor, row.domain, row.id]);
    if (failAfter === "journal") throw new Error("injected:journal");
    await client.query(`insert into ${schema}.epoch values($1,$2,1) on conflict(actor,domain) do update set version=${schema}.epoch.version+1`, [row.actor, row.domain]);
    if (failAfter === "epoch") throw new Error("injected:epoch");
  }
  await client.query(`insert into ${schema}.receipt values($1,$2,$3)`, [receipt, fingerprint, revision]);
  if (failAfter === "receipt") throw new Error("injected:receipt");
  return revision;
}

test("shared writers coexist across actors/domains/batch; exclusive blocks later revision allocation", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const { acquireSharedSyncWriteGate, acquireExclusiveSyncReadBarrier } = await import("../../features/sync/write-gate");
  const a = await pool.connect(), b = await pool.connect(), reader = await pool.connect(), later = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await a.query("begin"); await b.query("begin");
    await acquireSharedSyncWriteGate(lockExecutor(a)); await acquireSharedSyncWriteGate(lockExecutor(b));
    const low = String((await a.query(`select nextval('${schema}.revision') revision`)).rows[0].revision);
    const high = await applySyntheticGrantChange(b, schema, [{ actor: "b", domain: "notes", id: "1" }, { actor: "c", domain: "tasks", id: "2" }], "batch");
    assert.ok(BigInt(high) > BigInt(low)); await b.query("commit");
    const readerPid = await pid(reader), aPid = await pid(a);
    await reader.query("begin"); pending = acquireExclusiveSyncReadBarrier(lockExecutor(reader)); void pending.catch(() => {});
    await blocked(pool, readerPid, aPid); await a.query("commit"); await pending;
    await later.query("begin"); const laterPid = await pid(later);
    pending = acquireSharedSyncWriteGate(lockExecutor(later)); void pending.catch(() => {});
    await blocked(pool, laterPid, readerPid);
    const before = String((await pool.query(`select last_value from ${schema}.revision`)).rows[0].last_value);
    await reader.query("commit"); await pending;
    const after = String((await later.query(`select nextval('${schema}.revision') revision`)).rows[0].revision);
    assert.ok(BigInt(after) > BigInt(before)); await later.query("commit");
  } finally {
    await Promise.all([a, b, reader, later].map(async (client) => { await client.query("rollback"); client.release(); }));
    if (pending) await Promise.allSettled([pending]);
  }
});

test("source/journal/epoch/receipt injected failures roll back atomically, leaving real sequence holes", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const rows = [{ actor: "a", domain: "notes", id: "1" }, { actor: "b", domain: "tasks", id: "2" }];
  for (const stage of ["source", "journal", "epoch", "receipt"]) {
    await assert.rejects(transaction(pool, (client) => applySyntheticGrantChange(client, schema, rows, stage, stage)), new RegExp(`injected:${stage}`));
    for (const table of ["source", "journal", "epoch", "receipt"]) assert.equal(Number((await pool.query(`select count(*) n from ${schema}.${table}`)).rows[0].n), 0, stage + ":" + table);
  }
  const gap = BigInt((await pool.query(`select last_value from ${schema}.revision`)).rows[0].last_value);
  const committed = BigInt(await transaction(pool, (client) => applySyntheticGrantChange(client, schema, rows, "success")));
  assert.ok(committed > gap);
  const revisions = (await pool.query(`select revision from ${schema}.journal order by revision`)).rows.map((row) => BigInt(row.revision));
  assert.equal(revisions.length, 2); assert.ok(revisions.every((revision) => revision > gap));
  assert.equal(Number((await pool.query(`select count(*) n from ${schema}.epoch`)).rows[0].n), 2);
});

test("completed receipt replay bypasses shared writer gate and has no new source/epoch/revision effects", testOptions, async (t) => {
  const { pool, schema } = await fixture(t);
  const rows = [{ actor: "a", domain: "notes", id: "1" }];
  const first = await transaction(pool, (client) => applySyntheticGrantChange(client, schema, rows, "same"));
  const reader = await pool.connect();
  try {
    const { acquireExclusiveSyncReadBarrier } = await import("../../features/sync/write-gate");
    await reader.query("begin"); await acquireExclusiveSyncReadBarrier(lockExecutor(reader));
    const before = await pool.query(`select last_value from ${schema}.revision`);
    const replay = await transaction(pool, async (client) => { await client.query("set local statement_timeout='500ms'"); return applySyntheticGrantChange(client, schema, rows, "same"); });
    assert.equal(replay, first); assert.deepEqual((await pool.query(`select last_value from ${schema}.revision`)).rows, before.rows);
    assert.equal((await pool.query(`select value from ${schema}.source`)).rows[0].value, 1);
    assert.equal((await pool.query(`select version from ${schema}.epoch`)).rows[0].version, 1);
    await assert.rejects(transaction(pool, (client) => applySyntheticGrantChange(client, schema, [{ ...rows[0], id: "other" }], "same")), /Expected values/);
  } finally { await reader.query("rollback"); reader.release(); }
});
