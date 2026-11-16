import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_REMINDER_WAKE_KIND,
  CANONICAL_REMINDER_WAKE_TOPIC,
  canonicalReminderWakeDelaySeconds,
  createConfiguredCanonicalReminderWakePublisher,
  scheduleUpcomingCanonicalReminderWakes,
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

  const calls: Array<{ topic: string; message: unknown; options: unknown }> = [];
  const publisher = createCanonicalReminderWakePublisher({
    enabled: true,
    sendMessage: async (...args: [string, unknown, unknown]) => {
      calls.push({ topic: args[0], message: args[1], options: args[2] });
    },
  });
  await publisher.publish(message);
  await publisher.publish(message, { delaySeconds: 90.2 });
  assert.equal(CANONICAL_REMINDER_WAKE_TOPIC, "maintenance-heartbeat", "the topic vercel.json binds to /api/queues/maintenance");
  assert.deepEqual(calls, [
    { topic: CANONICAL_REMINDER_WAKE_TOPIC, message, options: {} },
    { topic: CANONICAL_REMINDER_WAKE_TOPIC, message, options: { delaySeconds: 91 } },
  ]);
});

test("the configured publisher is live only where the queue exists (VERCEL=1)", async () => {
  const message = createCanonicalReminderWakeMessage({ workspaceId: "workspace:test", planId: "reminder:plan", generation: 1 });
  const local = createConfiguredCanonicalReminderWakePublisher({});
  await local.publish(message); // inert: no queue client is touched locally
  assert.ok(createConfiguredCanonicalReminderWakePublisher({ VERCEL: "1" }));
});

test("wake delay lands just after fireAt and is never negative", () => {
  assert.equal(canonicalReminderWakeDelaySeconds("2026-11-16T10:30:00.000Z", "2026-11-16T10:00:00.000Z"), 1_802);
  assert.equal(canonicalReminderWakeDelaySeconds("2026-11-16T10:00:00.500Z", "2026-11-16T10:00:00.000Z"), 3);
  assert.equal(canonicalReminderWakeDelaySeconds("2026-11-16T09:59:00.000Z", "2026-11-16T10:00:00.000Z"), 0);
  assert.equal(canonicalReminderWakeDelaySeconds("not-a-date", "2026-11-16T10:00:00.000Z"), 0);
});

test("the hourly pass queues one delayed wake per pending intent inside the lookahead", async () => {
  const now = "2026-11-16T10:00:00.000Z";
  const intent = (planId: string, nextAttemptAt: string, extra: Record<string, unknown> = {}) => ({ payload: {
    version: 1, kind: CANONICAL_REMINDER_WAKE_KIND, workspaceId: "workspace:test", actorId: "actor", planId,
    targetType: "task", targetId: "task:1", fireAt: nextAttemptAt, sourceRevision: now, generation: 3, channels: ["in_app"],
    state: "pending", nextAttemptAt, attempts: 0, leaseEpoch: 0, createdAt: now, updatedAt: now, ...extra,
  } });
  const queries: Array<{ statement: string; values?: readonly unknown[] }> = [];
  const rows = [
    intent("reminder:a", "2026-11-16T10:20:00.000Z"),
    intent("reminder:b", "2026-11-16T11:10:00.000Z"),
    intent("reminder:other-workspace", "2026-11-16T10:30:00.000Z", { workspaceId: "workspace:other" }),
    { payload: { broken: true } },
  ];
  const client: TransactionalPostgresClient = {
    query: async () => ({ rows: [] }),
    transaction: async <T>(operation: (tx: TransactionalSqlExecutor) => Promise<T>): Promise<T> => operation({
      query: async <TRow>(statement: string, values?: readonly unknown[]) => {
        queries.push({ statement, values });
        return { rows: (statement.includes("orbit_records") ? rows : []) as unknown as TRow[] };
      },
    }),
    close: async () => undefined,
  };
  const sent: Array<{ planId: string; generation: number; delaySeconds?: number; leased: boolean }> = [];
  const result = await scheduleUpcomingCanonicalReminderWakes({
    runtime: { client, workspaceId: "workspace:test" },
    publisher: { async publish(message, options) {
      if (message.planId === "reminder:b") throw new Error("queue offline");
      sent.push({ planId: message.planId, generation: message.generation, delaySeconds: options?.delaySeconds, leased: "leaseEpoch" in message });
    } },
    now,
  });
  assert.deepEqual(sent, [{ planId: "reminder:a", generation: 3, delaySeconds: 1_202, leased: false }]);
  assert.deepEqual(result, { wakeScheduled: 1, wakeScheduleFailed: 1 });
  const select = queries.find((query) => query.statement.includes("orbit_records"));
  assert.deepEqual(select?.values, ["workspace:test", now, "2026-11-16T11:15:00.000Z", 500]);
  assert.ok(queries.some((query) => query.statement.includes("statement_timeout")), "bounded like every wake transaction");
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
