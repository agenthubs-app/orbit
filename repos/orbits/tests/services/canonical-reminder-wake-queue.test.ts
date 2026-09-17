import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_REMINDER_WAKE_KIND,
  MAINTENANCE_HEARTBEAT_TOPIC,
  createCanonicalReminderWakePublisher,
  createCanonicalReminderWakeMessage,
  isCanonicalReminderWakeMessage,
  claimCanonicalReminderWakes,
  repairCanonicalReminderWakes,
} from "../../features/notifications/canonical-reminder-wake";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

test("canonical wake is a strict maintenance-topic variant without actor authority or provider delay", async () => {
  const message = createCanonicalReminderWakeMessage({
    workspaceId: "workspace:test",
    planId: "reminder:plan",
    generation: 4,
    leaseEpoch: 2,
    leaseToken: "lease-token",
  });
  assert.equal(message.kind, CANONICAL_REMINDER_WAKE_KIND);
  assert.equal(message.workspaceId, "workspace:test");
  assert.equal("actorId" in message, false);
  assert.equal("now" in message, false);
  assert.equal("delaySeconds" in message, false);
  assert.equal(isCanonicalReminderWakeMessage(message), true);
  assert.equal(isCanonicalReminderWakeMessage({ ...message, actorId: "spoof" }), false);
  assert.equal(isCanonicalReminderWakeMessage({ ...message, planId: "reminder:other" }), false);
  assert.equal(isCanonicalReminderWakeMessage({ ...message, leaseEpoch: 0 }), false);

  const calls: Array<{ topic: string; message: unknown; argumentCount: number }> = [];
  const publisher = createCanonicalReminderWakePublisher({
    enabled: true,
    sendMessage: async (...args: [string, unknown]) => {
      calls.push({ topic: args[0], message: args[1], argumentCount: args.length });
    },
  });
  await publisher.publish(message);
  assert.deepEqual(calls, [{ topic: MAINTENANCE_HEARTBEAT_TOPIC, message, argumentCount: 2 }]);
});

test("the default local publisher is inert and never requests a delayed provider message", async () => {
  const sent: unknown[] = [];
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const publisher = createCanonicalReminderWakePublisher({ sendMessage: async (message) => { sent.push(message); } });
    await publisher.publish(createCanonicalReminderWakeMessage({ workspaceId: "workspace:test", planId: "reminder:plan", generation: 1, leaseEpoch: 1, leaseToken: "lease" }));
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
  assert.deepEqual(sent, []);
});

test("wake claim retries a fresh transaction only for 40001 and fails 40P01 immediately", async () => {
  let serializationAttempts = 0;
  const retryingClient: TransactionalPostgresClient = {
    query: async () => ({ rows: [] }),
    transaction: async <T>(operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> => {
      serializationAttempts += 1;
      if (serializationAttempts === 1) throw Object.assign(new Error("serialization failure"), { code: "40001" });
      return operation({ query: async () => ({ rows: [] }) });
    },
    close: async () => undefined,
  };
  const retried = await claimCanonicalReminderWakes({ runtime: { client: retryingClient, workspaceId: "workspace:retry" }, workerId: "retry", now: "2026-09-17T02:00:00.000Z" });
  assert.deepEqual(retried.messages, []);
  assert.equal(serializationAttempts, 2, "40001 starts a new transaction with a new executor");

  let deadlockAttempts = 0;
  const deadlockClient: TransactionalPostgresClient = {
    query: async () => ({ rows: [] }),
    transaction: async <T>(_operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> => {
      deadlockAttempts += 1;
      throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
    },
    close: async () => undefined,
  };
  await assert.rejects(
    claimCanonicalReminderWakes({ runtime: { client: deadlockClient, workspaceId: "workspace:deadlock" }, workerId: "deadlock", now: "2026-09-17T02:00:00.000Z" }),
    (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "40P01",
  );
  assert.equal(deadlockAttempts, 1, "40P01 is a lock-order failure, not a normal retry");
});

test("repair with an already-expired deadline does not start a wake claim", async () => {
  let transactionCalls = 0;
  let publisherCalls = 0;
  const client: TransactionalPostgresClient = {
    query: async () => ({ rows: [] }),
    transaction: async <T>(_operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> => {
      transactionCalls += 1;
      throw new Error("expired repair must not open a transaction");
    },
    close: async () => undefined,
  };
  const deadline = Date.parse("2026-09-17T02:00:00.000Z");
  const result = await repairCanonicalReminderWakes({
    runtime: {
      client,
      workspaceId: "workspace:expired-deadline",
      publisher: { publish: async () => { publisherCalls += 1; } },
    },
    now: "2026-09-17T02:00:00.000Z",
    deadline,
    clock: () => new Date(deadline),
  });
  assert.equal(transactionCalls, 0);
  assert.equal(publisherCalls, 0);
  assert.equal(result.wakeClaimed, 0);
  assert.equal(result.deferred, 1);
  assert.equal(result.wakeContinuation, 1);
});

test("repair stops before a fresh serializable retry when its existing deadline expires between attempts", async () => {
  let transactionCalls = 0;
  let clockMs = Date.parse("2026-09-17T02:00:00.000Z") - 1;
  const deadline = Date.parse("2026-09-17T02:00:00.000Z");
  const client: TransactionalPostgresClient = {
    query: async () => ({ rows: [] }),
    transaction: async <T>(_operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> => {
      transactionCalls += 1;
      clockMs = deadline;
      throw Object.assign(new Error("serialization failure"), { code: "40001" });
    },
    close: async () => undefined,
  };
  const result = await repairCanonicalReminderWakes({
    runtime: { client, workspaceId: "workspace:retry-deadline", publisher: { publish: async () => undefined } },
    now: "2026-09-17T02:00:00.000Z",
    deadline,
    clock: () => new Date(clockMs),
  });
  assert.equal(transactionCalls, 1, "the expired deadline prevents the second fresh transaction");
  assert.equal(result.wakeClaimed, 0);
  assert.equal(result.deferred, 1);
  assert.equal(result.wakeContinuation, 1);
});
