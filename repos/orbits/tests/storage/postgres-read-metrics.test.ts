import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostgresReadMetricsRunner,
  type PostgresReadMetric,
} from "../../shared/storage/postgres-read-metrics";
import {
  createTransactionalPostgresClient,
  type TransactionalPostgresPool,
} from "../../shared/storage/transactional-postgres";

const privateRows = [
  {
    actor_id: "actor:private",
    payload: { email: "private@example.test", note: "secret payload" },
  },
  { label: "東京" },
];

test("disabled metrics delegate directly without timing or row serialization", async () => {
  let nowCalls = 0;
  const runner = createPostgresReadMetricsRunner(
    { now: () => { nowCalls += 1; return 10; } },
    {},
  );

  assert.equal(runner, undefined);
  const result = await (async () => ({ rows: privateRows }))();

  assert.deepEqual(result.rows, privateRows);
  assert.equal(nowCalls, 0);
});

test("read metrics report safe scalar measurements and UTF-8 row bytes", async () => {
  const metrics: PostgresReadMetric[] = [];
  const ticks = [100, 112];
  const runner = createPostgresReadMetricsRunner(
    {
      observer: (metric) => { metrics.push(metric); },
      now: () => ticks.shift() ?? 112,
    },
    {},
  );
  if (!runner) throw new Error("metrics runner should be enabled");

  await runner("/* ignored */ SELECT $1", async () => ({ rows: privateRows }));

  assert.match(metrics[0]!.queryFingerprint!, /^[a-f0-9]{24}$/);
  assert.deepEqual(metrics.map(({queryFingerprint: _fingerprint,...metric})=>metric), [{
    queryCount: 1,
    queryKind: "select",
    returnedRows: 2,
    approximateSerializedRowBytes: privateRows.reduce(
      (total, row) => total + Buffer.byteLength(JSON.stringify(row), "utf8"),
      0,
    ),
    elapsedMs: 12,
    failed: false,
  }]);
  assert.doesNotMatch(JSON.stringify(metrics), /actor:private|private@example|secret payload/i);
});

test("environment opt-in logs only the safe metric event", async () => {
  const lines: unknown[] = [];
  const originalInfo = console.info;
  console.info = ((line: unknown) => { lines.push(line); }) as typeof console.info;

  try {
    const runner = createPostgresReadMetricsRunner(undefined, {
      ORBIT_PG_READ_METRICS: "1",
    });
    if (!runner) throw new Error("metrics runner should be enabled");
    await runner("select $1", async () => ({ rows: privateRows }));
  } finally {
    console.info = originalInfo;
  }

  assert.equal(lines.length, 1);
  assert.doesNotMatch(String(lines[0]), /actor:private|private@example|secret payload|select \$1/i);
  assert.equal(JSON.parse(String(lines[0])).event, "postgres_read_metric");
});

test("reads and DML returned rows are measured, empty writes are excluded", async () => {
  const metrics: PostgresReadMetric[] = [];
  let nowCalls = 0;
  const runner = createPostgresReadMetricsRunner(
    {
      observer: (metric) => { metrics.push(metric); },
      now: () => { nowCalls += 1; return nowCalls; },
    },
    {},
  );
  if (!runner) throw new Error("metrics runner should be enabled");

  await runner("update orbit_records set payload = $1", async () => ({ rows: privateRows }));
  await runner("with rows as (select 1) select * from rows", async () => ({ rows: [] }));
  await runner("insert into example values ($1)", async () => ({ rows: [] }));

  assert.equal(metrics.length, 2);
  assert.equal(metrics[0]?.queryKind, "update");
  assert.equal(metrics[0]?.returnedRows, 2);
  assert.equal(metrics[1]?.queryKind, "with");
  assert.equal(nowCalls, 6);
});

test("observer failures and read failures cannot alter database behavior", async () => {
  const observerFailure = new Error("observer failure");
  const metrics = createPostgresReadMetricsRunner(
    { observer: () => { throw observerFailure; } },
    {},
  );
  if (!metrics) throw new Error("metrics runner should be enabled");
  const expectedRows = [{ value: 7 }];

  const result = await metrics("select 7", async () => ({ rows: expectedRows }));
  assert.deepEqual(result.rows, expectedRows);

  const databaseFailure = new Error("database failure");
  const failingMetrics: PostgresReadMetric[] = [];
  const failingRunner = createPostgresReadMetricsRunner(
    {
      observer: (metric) => { failingMetrics.push(metric); },
      now: () => 5,
    },
    {},
  );
  if (!failingRunner) throw new Error("metrics runner should be enabled");
  await assert.rejects(
    failingRunner("select 7", async () => { throw databaseFailure; }),
    (error) => error === databaseFailure,
  );
  const {queryFingerprint:_fingerprint,...failureMetric}=failingMetrics[0]!;
  assert.deepEqual(failureMetric, {
    queryCount: 1,
    queryKind: "select",
    returnedRows: 0,
    approximateSerializedRowBytes: 0,
    elapsedMs: 0,
    failed: true,
  });
});

test("async observer rejection is consumed without delaying the query", async () => {
  const runner = createPostgresReadMetricsRunner(
    {
      observer: async () => {
        throw new Error("async observer failure");
      },
    },
    {},
  );
  if (!runner) throw new Error("metrics runner should be enabled");

  const result = await runner("select 7", async () => ({ rows: [{ value: 7 }] }));
  assert.deepEqual(result.rows, [{ value: 7 }]);
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("transactional client measures direct and in-transaction reads without extra SQL", async () => {
  const calls: string[] = [];
  const metrics: PostgresReadMetric[] = [];
  const pool: TransactionalPostgresPool = {
    async query(sql) {
      calls.push(`pool:${sql}`);
      return { rows: [{ value: 7 }] };
    },
    async connect() {
      calls.push("connect");
      return {
        async query(sql) {
          calls.push(sql);
          return { rows: [{ value: 7 }] };
        },
        release() { calls.push("release"); },
      };
    },
    async end() { calls.push("end"); },
  };
  const client = createTransactionalPostgresClient({
    connectionString: "postgres://test.invalid/db",
    pool,
    readMetrics: {
      observer: (metric) => { metrics.push(metric); },
      now: (() => {
        const ticks = [0, 4, 10, 13];
        return () => ticks.shift() ?? 13;
      })(),
    },
  });

  await client.query("select 7");
  await client.transaction(async (transaction) => {
    await transaction.query("select 8");
    await transaction.query("update test set value = 8");
  });

  assert.deepEqual(calls, [
    "pool:select 7",
    "connect",
    "begin isolation level serializable",
    "select 8",
    "update test set value = 8",
    "commit",
    "release",
  ]);
  assert.deepEqual(metrics.map(({ queryKind, returnedRows, elapsedMs }) => ({
    queryKind,
    returnedRows,
    elapsedMs,
  })), [
    { queryKind: "select", returnedRows: 1, elapsedMs: 4 },
    { queryKind: "select", returnedRows: 1, elapsedMs: 3 },
    { queryKind: "update", returnedRows: 1, elapsedMs: 0 },
  ]);
});
