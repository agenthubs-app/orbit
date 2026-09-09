import assert from "node:assert/strict";
import test from "node:test";
import {
  createTransactionalPostgresClient,
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresPool,
} from "../../shared/storage/transactional-postgres";

function fakePool(failures: Record<string, Error> = {}) {
  const calls: { sql: string; values?: readonly unknown[] }[] = [];
  const pool: TransactionalPostgresPool = {
    async query(sql, values) {
      calls.push({ sql: `pool:${sql}`, values });
      return { rows: [{ value: 7 }] };
    },
    async connect() {
      calls.push({ sql: "connect" });
      if (failures.connect) throw failures.connect;
      return {
        async query(sql, values) {
          calls.push({ sql, values });
          if (failures[sql]) throw failures[sql];
          return { rows: [{ value: 7 }] };
        },
        release(destroy) { calls.push({ sql: destroy ? "release:destroy" : "release" }); },
      };
    },
    async end() { calls.push({ sql: "end" }); },
  };
  return { pool, calls };
}

test("transaction uses one checked-out connection and commits serializably before release", async () => {
  const { pool, calls } = fakePool();
  const client = createTransactionalPostgresClient({ connectionString: "postgres://test.invalid/db", pool });
  const value = await client.transaction(async (tx) => {
    const result = await tx.query<{ value: number }>("select $1 as value", [7]);
    return result.rows[0].value;
  });
  assert.equal(value, 7);
  assert.deepEqual(calls.map(({ sql }) => sql), ["connect", "begin isolation level serializable", "select $1 as value", "commit", "release"]);
  assert.deepEqual(calls[2].values, [7]);
  await client.query("select 7");
  assert.equal(calls.at(-1)?.sql, "pool:select 7");
  await client.close();
  assert.equal(calls.at(-1)?.sql, "end");
});

test("operation failure rolls back and preserves the original error", async () => {
  const { pool, calls } = fakePool();
  const client = createTransactionalPostgresClient({ connectionString: "postgres://test.invalid/db", pool });
  const failure = new Error("operation failure");
  await assert.rejects(client.transaction(async (tx) => { await tx.query("update test"); throw failure; }), (error) => error === failure);
  assert.deepEqual(calls.map(({ sql }) => sql), ["connect", "begin isolation level serializable", "update test", "rollback", "release"]);
});

test("rollback failure preserves the operation error and destroys the poisoned connection", async () => {
  const { pool, calls } = fakePool({ rollback: new Error("rollback failure") });
  const client = createTransactionalPostgresClient({ connectionString: "postgres://test.invalid/db", pool });
  const failure = new Error("original failure");
  await assert.rejects(client.transaction(async () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(calls.map(({ sql }) => sql), ["connect", "begin isolation level serializable", "rollback", "release:destroy"]);
});

for (const sql of ["begin isolation level serializable", "commit"]) {
  test(`${sql} failure rolls back and releases the connection`, async () => {
    const failure = new Error(sql);
    const { pool, calls } = fakePool({ [sql]: failure });
    const client = createTransactionalPostgresClient({ connectionString: "postgres://test.invalid/db", pool });
    await assert.rejects(client.transaction(async () => 1), (error) => error === failure);
    assert.deepEqual(calls.slice(-2).map(({ sql }) => sql), ["rollback", "release"]);
  });
}

test("configuration fails closed and validates connection strings and pool limits", () => {
  assert.equal(createConfiguredTransactionalPostgresRuntime({ env: {} }), null);
  assert.throws(() => createTransactionalPostgresClient({ connectionString: "  " }), /connection string/i);
  for (const max of [0, -1, 1.5, NaN]) {
    assert.throws(() => createTransactionalPostgresClient({ connectionString: "postgres://test.invalid/db", max }), /pool/i);
  }
});

test("configured runtimes cache by connection, workspace and pool limit with default 2", async () => {
  const configs: { connectionString: string; max?: number }[] = [];
  const createClient = (options: { connectionString: string; max?: number }) => {
    configs.push(options);
    return createTransactionalPostgresClient({ ...options, pool: fakePool().pool });
  };
  const env = { ORBIT_LIVE_DATABASE_URL: "postgres://cache-test.invalid/db", ORBIT_WORKSPACE_ID: "workspace:one" };
  const first = createConfiguredTransactionalPostgresRuntime({ env, createClient })!;
  assert.equal(createConfiguredTransactionalPostgresRuntime({ env, createClient }), first);
  assert.equal(first.workspaceId, "workspace:one");
  assert.equal(configs[0].max, 2);
  const otherWorkspace = createConfiguredTransactionalPostgresRuntime({ env: { ...env, ORBIT_WORKSPACE_ID: "workspace:two" }, createClient })!;
  const otherPool = createConfiguredTransactionalPostgresRuntime({ env, max: 3, createClient })!;
  const otherUrl = createConfiguredTransactionalPostgresRuntime({ env: { ...env, ORBIT_LIVE_DATABASE_URL: "postgres://cache-test.invalid/other" }, createClient })!;
  assert.equal(configs.length, 4);
  assert.notEqual(otherWorkspace, first);
  assert.notEqual(otherPool, first);
  assert.notEqual(otherUrl, first);
  await Promise.all([first, otherWorkspace, otherPool, otherUrl].map(({ client }) => client.close()));
  const reopened = createConfiguredTransactionalPostgresRuntime({ env, createClient })!;
  assert.notEqual(reopened, first);
  await reopened.client.close();
});
