import assert from "node:assert/strict";
import test from "node:test";
import {
  createReadBudgetGate,
  createReadBudgetGatedLiveRecordStore,
  ReadBudgetExceededError,
  resolveReadBudgetGateOptions,
} from "../../features/sync/read-budget-gate";
import { AppError } from "../../shared/errors/app-error";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createPostgresReadMetricsRunner, createEnvReadMetricsObserver } from "../../shared/storage/postgres-read-metrics";

const metric = (returnedRows: number, approximateSerializedRowBytes = returnedRows * 100) => ({
  queryCount: 1 as const, queryKind: "select" as const, returnedRows, approximateSerializedRowBytes, elapsedMs: 1, failed: false,
});

test("the gate is absent unless a threshold is configured", () => {
  assert.equal(resolveReadBudgetGateOptions({}), null);
  assert.deepEqual(resolveReadBudgetGateOptions({ ORBIT_READ_BUDGET_ROWS_PER_MINUTE: "500" }), { windowMs: 60_000, maxRows: 500, maxBytes: null });
  assert.deepEqual(resolveReadBudgetGateOptions({ ORBIT_READ_BUDGET_BYTES_PER_MINUTE: "1048576" }), { windowMs: 60_000, maxRows: null, maxBytes: 1_048_576 });
  assert.throws(() => resolveReadBudgetGateOptions({ ORBIT_READ_BUDGET_ROWS_PER_MINUTE: "lots" }), /ORBIT_READ_BUDGET/);
});

test("non-critical reads fail closed once the window exceeds the budget; critical reads and the window expiry are honoured", () => {
  let now = 0;
  const events: { state: string }[] = [];
  const gate = createReadBudgetGate({ windowMs: 1000, maxRows: 100, maxBytes: null, now: () => now, onStateChange: (event) => events.push(event) });
  gate.observe(metric(60));
  gate.assertAllowed({ collectionName: "contacts" });
  gate.observe(metric(50));
  assert.throws(() => gate.assertAllowed({ collectionName: "contacts" }), (error: unknown) => {
    assert.ok(error instanceof ReadBudgetExceededError);
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    assert.match(error.message, /read budget exceeded: rows 110\/100 in 1000ms window \(collection contacts\)/);
    return true;
  });
  // Critical collections are never gated.
  for (const collectionName of ["accounts", "auth_users", "permissions", "profiles"]) gate.assertAllowed({ collectionName });
  gate.assertAllowed({ critical: true });
  assert.deepEqual(events.map((event) => event.state), ["open"], "one transition log, not one per rejected read");
  now = 1001;
  gate.assertAllowed({ collectionName: "contacts" });
  assert.deepEqual(events.map((event) => event.state), ["open", "closed"]);
  assert.deepEqual(gate.snapshot(), { rows: 0, bytes: 0, windowMs: 1000, maxRows: 100, maxBytes: null, open: false });
});

test("bytes are a second, independent limit", () => {
  const gate = createReadBudgetGate({ windowMs: 1000, maxRows: null, maxBytes: 1000, now: () => 0 });
  gate.observe(metric(1, 999));
  gate.assertAllowed({ collectionName: "events" });
  gate.observe(metric(1, 2));
  assert.throws(() => gate.assertAllowed({ collectionName: "events" }), /bytes 1001\/1000/);
});

test("the gated store rejects non-critical reads but lets writes and critical reads through, and unwraps when no gate is configured", async () => {
  const gate = createReadBudgetGate({ windowMs: 1000, maxRows: 1, maxBytes: null, now: () => 0 });
  const memory = createMemoryLiveRecordStore<Record<string, unknown>>();
  const store = createReadBudgetGatedLiveRecordStore(memory, gate);
  const record = {
    workspaceId: "w", collectionName: "contacts", recordId: "c1", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"],
    createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z", lifecycleState: "active" as const, payload: { id: "c1" },
  };
  await store.upsertRecord(record);
  assert.equal((await store.listRecords({ workspaceId: "w", collectionName: "contacts", limit: "unbounded" })).length, 1);
  gate.observe(metric(2));
  await assert.rejects(async () => store.listRecords({ workspaceId: "w", collectionName: "contacts", limit: "unbounded" }), ReadBudgetExceededError);
  await assert.rejects(async () => store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c1" }), ReadBudgetExceededError);
  await store.upsertRecord({ ...record, recordId: "c2" });
  assert.ok(await store.deleteRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c2", deletedAt: "2026-09-18T00:00:01.000Z" }));
  await store.upsertRecord({ ...record, collectionName: "accounts", recordId: "acc" });
  assert.equal((await store.listRecords({ workspaceId: "w", collectionName: "accounts", limit: "unbounded" })).length, 1, "critical reads bypass the gate");
  assert.equal(createReadBudgetGatedLiveRecordStore(memory, null), memory, "no gate → the store is returned untouched");
});

test("the gate composes with the env console observer instead of replacing it", async () => {
  const gate = createReadBudgetGate({ windowMs: 1000, maxRows: 10, maxBytes: null, now: () => 0 });
  const logged: string[] = [];
  const original = console.info;
  console.info = (line: unknown) => { logged.push(String(line)); };
  try {
    const envObserver = createEnvReadMetricsObserver({ ORBIT_PG_READ_METRICS: "1" });
    assert.ok(envObserver, "env observer must exist when metrics are enabled");
    assert.equal(createEnvReadMetricsObserver({}), undefined);
    const runner = createPostgresReadMetricsRunner({ observer: (m) => { gate.observe(m); envObserver(m); } }, {});
    assert.ok(runner);
    await runner("select 1", async () => ({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }));
    assert.equal(gate.snapshot().rows, 3);
    assert.equal(logged.filter((line) => line.includes('"postgres_read_metric"')).length, 1, "the production metric line is still emitted exactly once");
  } finally {
    console.info = original;
  }
});
