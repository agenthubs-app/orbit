import assert from "node:assert/strict";
import test from "node:test";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";

interface FakeConnectionOptions {
  rollbackError?: Error;
}

function createFakePool(options: FakeConnectionOptions = {}) {
  const calls: string[] = [];
  const releasedWith: (Error | undefined)[] = [];
  const connection = {
    async query(text: string) {
      calls.push(text);
      if (text === "rollback" && options.rollbackError) {
        throw options.rollbackError;
      }
      return { rowCount: 1, rows: [{ ok: true }] };
    },
    release(error?: Error) {
      releasedWith.push(error);
    },
  };
  const pool = {
    async connect() {
      return connection;
    },
    async end() {},
    async query(text: string) {
      calls.push(text);
      return { rowCount: 1, rows: [{ ok: true }] };
    },
  };

  return { calls, pool, releasedWith };
}

test("event operations transaction commits on its pinned connection", async () => {
  const fake = createFakePool();
  const client = createEventOperationsPostgresClient({
    connectionString: "postgres://event-operations-test",
    pool: fake.pool as never,
  });

  const value = await client.transaction(async (transaction) => {
    const result = await transaction.query<{ ok: boolean }>("select true as ok");
    return result.rows[0]?.ok;
  });

  assert.equal(value, true);
  assert.deepEqual(fake.calls, [
    "begin isolation level serializable",
    "select true as ok",
    "commit",
  ]);
  assert.deepEqual(fake.releasedWith, [undefined]);
});

test("event operations transaction rolls back and preserves the operation error", async () => {
  const fake = createFakePool();
  const client = createEventOperationsPostgresClient({
    connectionString: "postgres://event-operations-test",
    pool: fake.pool as never,
  });
  const operationError = new Error("operation failed");

  await assert.rejects(
    client.transaction(async () => {
      throw operationError;
    }),
    (error) => error === operationError,
  );

  assert.deepEqual(fake.calls, [
    "begin isolation level serializable",
    "rollback",
  ]);
  assert.deepEqual(fake.releasedWith, [undefined]);
});

test("event operations transaction destroys a connection whose rollback failed", async () => {
  const rollbackError = new Error("connection lost during rollback");
  const fake = createFakePool({ rollbackError });
  const client = createEventOperationsPostgresClient({
    connectionString: "postgres://event-operations-test",
    pool: fake.pool as never,
  });
  const operationError = new Error("operation failed");

  await assert.rejects(
    client.transaction(async () => {
      throw operationError;
    }),
    (error) => error === operationError,
  );

  assert.deepEqual(fake.calls, [
    "begin isolation level serializable",
    "rollback",
  ]);
  assert.deepEqual(fake.releasedWith, [rollbackError]);
});
