import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createConfiguredReminderPlanService } from "../../features/notifications/reminder-plan-service-factory";
import { canonicalReminderWakeId, canonicalReminderWakeRecord, claimCanonicalReminderWakes, createCanonicalReminderWakeIntent, processCanonicalReminderWakeMessage } from "../../features/notifications/canonical-reminder-wake";
import type { ReminderPlanDTO } from "../../features/notifications/reminder-plan-contract";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const DATABASE_URL = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const NOW = "2026-09-17T02:00:00.000Z";

type TestDatabase = {
  admin: Pool;
  pool: Pool;
  client: TransactionalPostgresClient;
  workspaceId: string;
  store: ReturnType<typeof createPostgresLiveRecordStore>;
  close: () => Promise<void>;
};

async function database(t: TestContext): Promise<TestDatabase | null> {
  if (!DATABASE_URL) {
    t.skip("ORBIT_LIFECYCLE_TEST_DATABASE_URL is not configured");
    return null;
  }
  const parsed = new URL(DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname), "local database required");
  assert.equal(parsed.pathname, "/orbit_cutover_test_20260917", "cutover test database required");
  const schema = `b5_command_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: DATABASE_URL, max: 1 });
  let pool: Pool | undefined;
  try {
    await admin.query("select 1");
    await admin.query(`create schema "${schema}"`);
    pool = new Pool({ connectionString: DATABASE_URL, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000` });
    const client = createTransactionalPostgresClient({ connectionString: DATABASE_URL, max: 2, pool });
    const workspaceId = `workspace:${randomUUID()}`;
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    return {
      admin,
      pool,
      client,
      store,
      workspaceId,
      close: async () => {
        try {
          await client.close();
        } finally {
          try {
            await admin.query(`drop schema "${schema}" cascade`);
          } finally {
            await admin.end();
          }
        }
      },
    };
  } catch (error) {
    await pool?.end().catch(() => undefined);
    await admin.query(`drop schema if exists "${schema}" cascade`).catch(() => undefined);
    await admin.end();
    throw error;
  }
}

async function seedTask(db: TestDatabase, actorId: string): Promise<string> {
  const id = `task:${randomUUID()}`;
  const task = {
    id,
    accountId: actorId,
    ownerUserId: actorId,
    title: "Canonical reminder target",
    status: "open" as const,
    category: "work" as const,
    priority: "normal" as const,
    source: "manual" as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await db.store.upsertRecord({
    workspaceId: db.workspaceId,
    collectionName: "tasks",
    recordId: id,
    userId: actorId,
    sourceType: "manual",
    sourceId: id,
    targetType: "task",
    targetId: id,
    evidenceIds: [],
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    lifecycleState: "active",
    payload: {
      version: 1,
      task,
      activities: [{
        id: `task-activity:${randomUUID()}`,
        accountId: actorId,
        ownerUserId: actorId,
        taskId: id,
        type: "created" as const,
        actorType: "user" as const,
        actorId,
        occurredAt: NOW,
        taskSnapshot: { title: task.title, category: task.category },
      }],
    },
  });
  return id;
}

async function seedScheduleItem(db: TestDatabase, actorId: string): Promise<string> {
  const id = `schedule:${randomUUID()}`;
  const item = {
    id,
    sourceId: id,
    accountId: actorId,
    ownerUserId: actorId,
    kind: "personal" as const,
    category: "personal" as const,
    state: "upcoming" as const,
    title: "Create schedule target",
    startsAt: "2026-09-17T03:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    timeZone: "UTC",
  };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "personal_schedule_items", recordId: id, userId: actorId, sourceType: "manual", sourceId: id, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: item });
  return id;
}

async function seedSchedulePlan(db: TestDatabase, actorId: string, targetId: string, index: number): Promise<ReminderPlanDTO> {
  const id = `reminder:schedule:${actorId}:${index}:${randomUUID()}`;
  const plan: ReminderPlanDTO = { accountId: actorId, body: "Schedule body", channels: ["in_app"], createdAt: NOW, createdBy: "user", deepLink: "/schedule", fireAt: NOW, id, ownerUserId: actorId, status: "scheduled", targetId, targetType: "schedule_item", timeZone: "UTC", title: "Schedule title", updatedAt: NOW };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: id, userId: actorId, sourceType: "system", sourceId: id, evidenceIds: [], occurredAt: NOW, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: plan } });
  await db.store.upsertRecord(canonicalReminderWakeRecord(createCanonicalReminderWakeIntent({ plan, workspaceId: db.workspaceId, now: NOW })));
  return plan;
}

function createService(db: TestDatabase, publisher: { publish: (message: unknown) => Promise<void> }, client = db.client) {
  return createConfiguredReminderPlanService({
    now: () => NOW,
    publisher,
    runtime: { client, workspaceId: db.workspaceId },
  });
}

async function intent(db: TestDatabase, planId: string) {
  return db.store.getRecord({
    workspaceId: db.workspaceId,
    collectionName: "canonical_reminder_wakes",
    recordId: canonicalReminderWakeId(planId),
    includeDeleted: true,
  });
}

function isTaskTargetRead(statement: string, values: readonly unknown[] | undefined): boolean {
  const sql = statement.toLowerCase();
  return sql.includes("from orbit_records") && sql.includes("collection_name = $2") && values?.[1] === "tasks";
}

function isScheduleTargetRead(statement: string, values: readonly unknown[] | undefined): boolean {
  const sql = statement.toLowerCase();
  return sql.includes("from orbit_records") && sql.includes("collection_name = $2") && values?.[1] === "personal_schedule_items";
}

function sqlState(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

test("configured pure in-app commands save plan and wake intent atomically, replay safely, and cancel the current generation", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  const published: unknown[] = [];
  const publisher = { publish: async (message: unknown) => { published.push(message); throw new Error("publisher unavailable"); } };
  try {
    const targetId = await seedTask(db, actorId);
    const service = createService(db, publisher);
    const created = await service.create({
      actorId,
      targetType: "task",
      targetId,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app"],
      title: "Wake me",
      body: "A local reminder",
      deepLink: `/app/tasks/${targetId}`,
      createdBy: "user",
      idempotencyKey: "command-1",
    });
    const createdIntent = await intent(db, created.id);
    assert.ok(createdIntent);
    assert.equal((createdIntent.payload as { generation: number }).generation, 1);
    assert.equal((createdIntent.payload as { state: string }).state, "pending");
    assert.equal(published.length, 1, "near-term publish is attempted after commit");

    const claimed = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "command-replay-lease", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(claimed.messages.length, 1);
    const intentBeforeReplay = await intent(db, created.id);
    assert.equal((intentBeforeReplay?.payload as { state: string }).state, "leased");
    const replaySql: string[] = [];
    const replayClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => db.client.transaction((tx) => operation({
        query: async <TRow>(sql: string, values?: readonly unknown[]) => {
          replaySql.push(sql);
          return tx.query<TRow>(sql, values);
        },
      })),
    };
    const replayService = createService(db, publisher, replayClient);
    const replay = await replayService.create({
      actorId,
      targetType: "task",
      targetId,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app"],
      title: "Wake me",
      body: "A local reminder",
      deepLink: `/app/tasks/${targetId}`,
      createdBy: "user",
      idempotencyKey: "command-1",
    });
    assert.deepEqual(replay, created);
    const intentAfterReplay = await intent(db, created.id);
    assert.deepEqual(intentAfterReplay?.payload, intentBeforeReplay?.payload, "idempotent replay must not rewrite an active lease");
    assert.equal(intentAfterReplay?.updatedAt, intentBeforeReplay?.updatedAt);
    assert.equal(replaySql.some((sql) => sql.toLowerCase().includes("insert into orbit_records")), false, "replay must not upsert plan or intent");
    assert.equal(published.length, 1, "replay must not publish another wake hint");

    const rescheduled = await service.reschedule({
      actorId,
      reminderId: created.id,
      fireAt: "2026-09-17T02:05:00.000Z",
      timeZone: "UTC",
      expectedUpdatedAt: created.updatedAt,
      idempotencyKey: "command-2",
    });
    assert.equal((await intent(db, created.id))?.payload && ((await intent(db, created.id))!.payload as { generation: number }).generation, 2);
    assert.equal((await intent(db, created.id))?.payload && ((await intent(db, created.id))!.payload as { fireAt: string }).fireAt, rescheduled.fireAt);

    const cancelled = await service.cancel({ actorId, reminderId: created.id, idempotencyKey: "command-3" });
    assert.equal(cancelled.status, "cancelled");
    const cancelledIntent = await intent(db, created.id);
    assert.equal((cancelledIntent?.payload as { state: string }).state, "cancelled");
    assert.equal((cancelledIntent?.payload as { generation: number }).generation, 3);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "notificationDeliveries" })).length, 0);

    const mixedTarget = await seedTask(db, `${actorId}:mixed`);
    const mixed = await service.create({
      actorId: `${actorId}:mixed`,
      targetType: "task",
      targetId: mixedTarget,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app", "ios_push"],
      title: "Mixed",
      body: "Keep push",
      deepLink: "/app/tasks/mixed",
      createdBy: "user",
      idempotencyKey: "mixed-1",
    });
    assert.deepEqual(mixed.channels, ["in_app", "ios_push"]);
    assert.equal(await intent(db, mixed.id), null, "mixed channels never enter the pure in-app wake protocol");
    const mixedClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "mixed-check", now: NOW, planId: mixed.id, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(mixedClaim.messages.length, 0, "mixed channels are not consumed by the in-app wake worker");
  } finally {
    await db.close();
  }
});

test("command serializable retry starts a fresh transaction while deadlock errors fail immediately", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const retryActor = `actor:${randomUUID()}`;
    const retryTarget = await seedTask(db, retryActor);
    let retryTransactions = 0;
    const retryClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        retryTransactions += 1;
        return db.client.transaction(async (tx) => {
          if (retryTransactions === 1) {
            await tx.query("select 1");
            throw Object.assign(new Error("serialization retry"), { code: "40001" });
          }
          return operation(tx);
        });
      },
    };
    const retried = await createService(db, { publish: async () => undefined }, retryClient).create({ actorId: retryActor, targetType: "task", targetId: retryTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Fresh snapshot", body: "Retry", deepLink: "/retry", createdBy: "user", idempotencyKey: "retry-40001" });
    assert.equal(retryTransactions, 2, "40001 must reopen a new serializable transaction");
    assert.equal((await intent(db, retried.id))?.payload && ((await intent(db, retried.id))!.payload as { generation: number }).generation, 1);

    const deadlockActor = `actor:${randomUUID()}`;
    const deadlockTarget = await seedTask(db, deadlockActor);
    let deadlockTransactions = 0;
    const deadlockClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        deadlockTransactions += 1;
        return db.client.transaction(async (tx) => {
          await tx.query("select 1");
          throw Object.assign(new Error("lock order deadlock"), { code: "40P01" });
        });
      },
    };
    await assert.rejects(
      () => createService(db, { publish: async () => undefined }, deadlockClient).create({ actorId: deadlockActor, targetType: "task", targetId: deadlockTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Deadlock", body: "Must fail", deepLink: "/deadlock", createdBy: "user", idempotencyKey: "retry-40p01" }),
      (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "40P01",
    );
    assert.equal(deadlockTransactions, 1, "40P01 must not be retried as normal contention");
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans", userId: deadlockActor })).length, 0);
  } finally {
    await db.close();
  }
});

test("reschedule preserves target-read serialization errors for the command retry boundary", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createService(db, { publish: async () => undefined });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Reschedule target read", body: "Retry the target read", deepLink: "/reschedule-target-read", createdBy: "user", idempotencyKey: "reschedule-target-read" });
    let transactions = 0;
    let successfulTransactions = 0;
    let targetReads = 0;
    const retryClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        transactions += 1;
        return db.client.transaction(async (tx) => {
          const result = await operation({
            query: async <TRow>(statement: string, values?: readonly unknown[]) => {
              if (isTaskTargetRead(statement, values)) {
                targetReads += 1;
                if (targetReads === 1) {
                  await tx.query("do $$ begin raise exception 'target read serialization failure' using errcode = '40001'; end $$;");
                }
              }
              return tx.query<TRow>(statement, values);
            },
          });
          successfulTransactions += 1;
          return result;
        });
      },
    };
    const moved = await createService(db, { publish: async () => undefined }, retryClient).reschedule({ actorId, reminderId: plan.id, fireAt: "2026-09-17T03:00:00.000Z", timeZone: "UTC", expectedUpdatedAt: plan.updatedAt, idempotencyKey: "reschedule-target-read-retry" });
    assert.equal(targetReads, 2, "the target read must be retried after the injected serialization failure");
    assert.equal(transactions, 2, "40001 at target authorization must reach the outer retry boundary");
    assert.equal(successfulTransactions, 1, "exactly one fresh transaction may commit the reschedule");
    assert.equal(moved.fireAt, "2026-09-17T03:00:00.000Z");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))!.payload as { entity: { fireAt: string } }).entity.fireAt, "2026-09-17T03:00:00.000Z");
  } finally {
    await db.close();
  }
});

test("reschedule does not translate a target-read deadlock into target not owned", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createService(db, { publish: async () => undefined });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Reschedule deadlock", body: "Preserve deadlock", deepLink: "/reschedule-deadlock", createdBy: "user", idempotencyKey: "reschedule-deadlock" });
    let transactions = 0;
    let targetReads = 0;
    const deadlockClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        transactions += 1;
        return db.client.transaction((tx) => operation({
          query: async <TRow>(statement: string, values?: readonly unknown[]) => {
            if (isTaskTargetRead(statement, values)) {
              targetReads += 1;
              await tx.query("do $$ begin raise exception 'target read deadlock' using errcode = '40P01'; end $$;");
            }
            return tx.query<TRow>(statement, values);
          },
        }));
      },
    };
    await assert.rejects(
      () => createService(db, { publish: async () => undefined }, deadlockClient).reschedule({ actorId, reminderId: plan.id, fireAt: "2026-09-17T03:00:00.000Z", timeZone: "UTC", expectedUpdatedAt: plan.updatedAt, idempotencyKey: "reschedule-deadlock-retry" }),
      (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "40P01",
    );
    assert.equal(targetReads, 1);
    assert.equal(transactions, 1, "40P01 must fail at the original transaction boundary without retry");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))!.payload as { entity: { fireAt: string } }).entity.fireAt, NOW);
  } finally {
    await db.close();
  }
});

test("create retries task and schedule target reads on 40001 and commits one plan plus one wake intent", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const taskActorId = `actor:${randomUUID()}:task`;
    const taskTargetId = await seedTask(db, taskActorId);
    const cases: Array<{ actorId: string; targetId: string; targetType: "task" | "schedule_item" }> = [
      { actorId: taskActorId, targetId: taskTargetId, targetType: "task" },
    ];
    const scheduleActorId = `actor:${randomUUID()}:schedule`;
    const scheduleTargetId = await seedScheduleItem(db, scheduleActorId);
    cases.push({ actorId: scheduleActorId, targetId: `schedule:${scheduleTargetId}`, targetType: "schedule_item" });

    for (const [index, item] of cases.entries()) {
      let transactions = 0;
      let successfulTransactions = 0;
      let targetReads = 0;
      const retryClient: TransactionalPostgresClient = {
        ...db.client,
        transaction: (operation) => {
          transactions += 1;
          return db.client.transaction(async (tx) => {
            const result = await operation({
              query: async <TRow>(statement: string, values?: readonly unknown[]) => {
                const matched = item.targetType === "task" ? isTaskTargetRead(statement, values) : isScheduleTargetRead(statement, values);
                if (matched) {
                  targetReads += 1;
                  if (targetReads === 1) await tx.query("do $$ begin raise exception 'create target read serialization failure' using errcode = '40001'; end $$;");
                }
                return tx.query<TRow>(statement, values);
              },
            });
            successfulTransactions += 1;
            return result;
          });
        },
      };
      const plan = await createService(db, { publish: async () => undefined }, retryClient).create({ actorId: item.actorId, targetType: item.targetType, targetId: item.targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: `Create target ${index}`, body: "Fresh target snapshot", deepLink: "/create-target", createdBy: "user", idempotencyKey: `create-target-retry-${index}` });
      assert.equal(targetReads, 2, `${item.targetType} target read must run again in the fresh transaction`);
      assert.equal(transactions, 2, `${item.targetType} create must use one retry after 40001`);
      assert.equal(successfulTransactions, 1);
      assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans", userId: item.actorId })).length, 1);
      const storedIntent = await intent(db, plan.id);
      assert.equal((storedIntent?.payload as { generation?: number } | undefined)?.generation, 1);
    }
  } finally {
    await db.close();
  }
});

test("create preserves task and schedule target-read 40P01 and performs no plan or wake write", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const taskActorId = `actor:${randomUUID()}:task-deadlock`;
    const taskTargetId = await seedTask(db, taskActorId);
    const scheduleActorId = `actor:${randomUUID()}:schedule-deadlock`;
    const scheduleTargetId = await seedScheduleItem(db, scheduleActorId);
    const cases = [
      { actorId: taskActorId, targetId: taskTargetId, targetType: "task" as const },
      { actorId: scheduleActorId, targetId: `schedule:${scheduleTargetId}`, targetType: "schedule_item" as const },
    ];
    for (const [index, item] of cases.entries()) {
      let transactions = 0;
      let successfulTransactions = 0;
      let targetReads = 0;
      let publisherCalls = 0;
      const deadlockClient: TransactionalPostgresClient = {
        ...db.client,
        transaction: (operation) => {
          transactions += 1;
          return db.client.transaction(async (tx) => {
            const result = await operation({
              query: async <TRow>(statement: string, values?: readonly unknown[]) => {
                const matched = item.targetType === "task" ? isTaskTargetRead(statement, values) : isScheduleTargetRead(statement, values);
                if (matched) {
                  targetReads += 1;
                  await tx.query("do $$ begin raise exception 'create target read deadlock' using errcode = '40P01'; end $$;");
                  throw new Error("create target read deadlock injection returned unexpectedly");
                }
                return tx.query<TRow>(statement, values);
              },
            });
            successfulTransactions += 1;
            return result;
          });
        },
      };
      await assert.rejects(
        () => createService(db, { publish: async () => { publisherCalls += 1; } }, deadlockClient).create({ actorId: item.actorId, targetType: item.targetType, targetId: item.targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: `Create deadlock ${index}`, body: "Preserve SQLSTATE", deepLink: "/create-deadlock", createdBy: "user", idempotencyKey: `create-target-deadlock-${index}` }),
        (error: unknown) => sqlState(error) === "40P01",
      );
      assert.equal(targetReads, 1);
      assert.equal(transactions, 1, `${item.targetType} deadlock must not be retried`);
      assert.equal(successfulTransactions, 0);
      assert.equal(publisherCalls, 0);
      assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans", userId: item.actorId })).length, 0);
      assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", userId: item.actorId })).length, 0);
    }
  } finally {
    await db.close();
  }
});

test("create rejects a missing schedule target as a domain error without writing a plan or wake", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}:missing-schedule`;
  let transactions = 0;
  let publisherCalls = 0;
  const client: TransactionalPostgresClient = {
    ...db.client,
    transaction: (operation) => {
      transactions += 1;
      return db.client.transaction(operation);
    },
  };
  try {
    await assert.rejects(
      () => createService(db, { publish: async () => { publisherCalls += 1; } }, client).create({ actorId, targetType: "schedule_item", targetId: `schedule:missing:${randomUUID()}`, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Missing schedule", body: "Reject", deepLink: "/missing-schedule", createdBy: "user", idempotencyKey: "create-missing-schedule" }),
      (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "TARGET_NOT_OWNED",
    );
    assert.equal(transactions, 1);
    assert.equal(publisherCalls, 0);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans", userId: actorId })).length, 0);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", userId: actorId })).length, 0);
  } finally {
    await db.close();
  }
});

test("reschedule maps a missing schedule target AppError to the domain target error", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const plan = await seedSchedulePlan(db, actorId, `schedule:missing:${randomUUID()}`, 1);
    let transactions = 0;
    const commandClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        transactions += 1;
        return db.client.transaction(operation);
      },
    };
    await assert.rejects(
      () => createService(db, { publish: async () => undefined }, commandClient).reschedule({ actorId, reminderId: plan.id, fireAt: "2026-09-17T03:00:00.000Z", timeZone: "UTC", expectedUpdatedAt: plan.updatedAt, idempotencyKey: "schedule-target-not-found" }),
      (error: unknown) => error && typeof error === "object" && "code" in error && error.code === "TARGET_NOT_OWNED",
    );
    assert.equal(transactions, 1, "a domain target rejection completes one rolled-back mutation transaction");
    const storedPlan = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id });
    assert.equal((storedPlan?.payload as { entity: { fireAt: string } }).entity.fireAt, NOW, "domain target rejection must roll back the reschedule");
  } finally {
    await db.close();
  }
});

test("real task termination accepts its owned tombstone and cancels reminders exactly once", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  const otherActorId = `${actorId}:other`;
  const future = "2026-09-17T03:00:00.000Z";
  const publisher = { publish: async () => undefined };
  const callbackCalls: Array<{ actorId: string; taskId: string; reason: string }> = [];
  try {
    const reminders = createService(db, publisher);
    const tasks = createTaskService({
      repository: createTaskRepository({ store: db.store, workspaceId: db.workspaceId, transactionClient: db.client }),
      onTaskTerminated: async (input) => {
        callbackCalls.push(input);
        await reminders.cancelFutureForTarget({ actorId: input.actorId, targetType: "task", targetId: input.taskId, idempotencyKey: `task:${input.reason}:${input.taskId}` });
      },
    });
    const createTask = (owner: string, idempotencyKey: string) => tasks.create({ actorId: owner, title: "Termination target", category: "work", priority: "normal", source: "manual", idempotencyKey, now: NOW });
    const createReminder = (owner: string, targetId: string, idempotencyKey: string, channels: readonly ["in_app"] | readonly ["in_app", "ios_push"], fireAt = future) => reminders.create({ actorId: owner, targetType: "task", targetId, fireAt, timeZone: "UTC", channels, title: "Cancel with task", body: "Task termination", deepLink: "/termination", createdBy: "user", idempotencyKey });

    const noReminder = await createTask(actorId, "task:no-reminder");
    const noReminderDelete = { actorId, taskId: noReminder.task.id, idempotencyKey: "delete:no-reminder", now: NOW };
    const deletedNoReminder = await tasks.delete(noReminderDelete);
    assert.equal(deletedNoReminder.activity.type, "deleted");
    assert.equal(callbackCalls.length, 1, "first deletion invokes the termination receipt callback");
    assert.deepEqual(await tasks.delete(noReminderDelete), deletedNoReminder, "receipt replay returns the original deletion");
    assert.equal(callbackCalls.length, 1, "receipt replay must not invoke termination cleanup again");
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "task_mutations", userId: actorId })).length, 2, "create and delete each leave one receipt");
    assert.equal(await reminders.cancelFutureForTarget({ actorId, targetType: "task", targetId: noReminder.task.id, idempotencyKey: "cleanup:owned-deleted-replay" }), 0, "the same actor may replay terminal cleanup on its deleted task");
    await assert.rejects(
      () => reminders.cancelFutureForTarget({ actorId: otherActorId, targetType: "task", targetId: noReminder.task.id, idempotencyKey: "cleanup:foreign-deleted" }),
      /not owned/i,
      "includeDeleted cleanup must not transfer tombstone ownership",
    );
    await assert.rejects(
      () => reminders.create({ actorId, targetType: "task", targetId: noReminder.task.id, fireAt: future, timeZone: "UTC", channels: ["in_app"], title: "Deleted create", body: "Must reject", deepLink: "/deleted-create", createdBy: "user", idempotencyKey: "reminder:deleted-create" }),
      /not owned/i,
      "create must keep the active-target gate",
    );

    const dueTask = await createTask(actorId, "task:due-deleted");
    const duePlan = await createReminder(actorId, dueTask.task.id, "reminder:due-deleted", ["in_app"], NOW);
    await tasks.delete({ actorId, taskId: dueTask.task.id, idempotencyKey: "delete:due-deleted", now: NOW });
    const dueStored = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: duePlan.id });
    assert.equal((dueStored?.payload as { entity: { status: string } }).entity.status, "scheduled", "terminal cleanup must not cancel an already-due plan");
    await assert.rejects(
      () => reminders.reschedule({ actorId, reminderId: duePlan.id, fireAt: future, timeZone: "UTC", expectedUpdatedAt: duePlan.updatedAt, idempotencyKey: "reschedule:deleted-target" }),
      /not owned/i,
      "reschedule must keep the active-target gate",
    );
    const dueClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "deleted-target-consumer", now: NOW, intentId: canonicalReminderWakeId(duePlan.id), planId: duePlan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(dueClaim.messages.length, 1);
    const dueResult = await processCanonicalReminderWakeMessage(dueClaim.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(dueResult.outcome, "failed", "consumer must keep the active target gate");
    assert.equal((await intent(db, duePlan.id))?.payload && ((await intent(db, duePlan.id))!.payload as { lastErrorCode?: string }).lastErrorCode, "TARGET_NOT_OWNED");

    const pureTask = await createTask(actorId, "task:pure-delete");
    const purePlan = await createReminder(actorId, pureTask.task.id, "reminder:pure-delete", ["in_app"]);
    await tasks.delete({ actorId, taskId: pureTask.task.id, idempotencyKey: "delete:pure", now: NOW });
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: purePlan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: purePlan.id }))!.payload as { entity: { status: string } }).entity.status, "cancelled");
    assert.equal((await intent(db, purePlan.id))?.payload && ((await intent(db, purePlan.id))!.payload as { state: string }).state, "cancelled");

    const mixedTask = await createTask(actorId, "task:mixed-delete");
    const mixedPlan = await createReminder(actorId, mixedTask.task.id, "reminder:mixed-delete", ["in_app", "ios_push"]);
    await tasks.delete({ actorId, taskId: mixedTask.task.id, idempotencyKey: "delete:mixed", now: NOW });
    const mixedStored = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: mixedPlan.id });
    assert.equal((mixedStored?.payload as { entity: { status: string; channels: readonly string[] } }).entity.status, "cancelled");
    assert.deepEqual((mixedStored?.payload as { entity: { channels: readonly string[] } }).entity.channels, ["in_app", "ios_push"], "termination cleanup must not strip mixed channels");
    assert.equal(await intent(db, mixedPlan.id), null, "mixed plans never enter the pure in-app wake collection");

    const cancelledTask = await createTask(actorId, "task:cancelled");
    const cancelledPlan = await createReminder(actorId, cancelledTask.task.id, "reminder:cancelled", ["in_app"]);
    const cancelled = await tasks.cancel({ actorId, taskId: cancelledTask.task.id, idempotencyKey: "cancel:task", now: NOW });
    assert.equal(cancelled.task.status, "cancelled");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: cancelledPlan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: cancelledPlan.id }))!.payload as { entity: { status: string } }).entity.status, "cancelled");
    assert.equal((await intent(db, cancelledPlan.id))?.payload && ((await intent(db, cancelledPlan.id))!.payload as { state: string }).state, "cancelled");
    assert.deepEqual(await tasks.cancel({ actorId, taskId: cancelledTask.task.id, idempotencyKey: "cancel:task", now: NOW }), cancelled, "cancel receipt replay is stable");

    const protectedTask = await createTask(actorId, "task:foreign");
    const protectedPlan = await createReminder(actorId, protectedTask.task.id, "reminder:foreign", ["in_app"]);
    await assert.rejects(() => tasks.delete({ actorId: otherActorId, taskId: protectedTask.task.id, idempotencyKey: "delete:foreign", now: NOW }), /not found/i);
    assert.equal(callbackCalls.filter((call) => call.taskId === protectedTask.task.id).length, 0, "an unauthorized actor cannot reach termination cleanup");
    const protectedStored = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: protectedPlan.id });
    assert.equal((protectedStored?.payload as { entity: { status: string } }).entity.status, "scheduled");
    assert.equal((await intent(db, protectedPlan.id))?.payload && ((await intent(db, protectedPlan.id))!.payload as { state: string }).state, "pending");
  } finally {
    await db.close();
  }
});

test("plan write rolls back when the durable wake intent write fails", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const failingClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => db.client.transaction((tx) => operation({
        query: async <TRow>(sql: string, values?: readonly unknown[]) => {
          if (sql.toLowerCase().includes("insert into orbit_records") && values?.includes("canonical_reminder_wakes")) {
            throw new Error("injected intent write failure");
          }
          return tx.query<TRow>(sql, values);
        },
      })),
    };
    const service = createService(db, { publish: async () => undefined }, failingClient);
    await assert.rejects(() => service.create({
      actorId,
      targetType: "task",
      targetId,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app"],
      title: "Must roll back",
      body: "Atomic",
      deepLink: "/app/tasks/rollback",
      createdBy: "user",
      idempotencyKey: "rollback-1",
    }), /injected intent write failure/);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans" })).length, 0);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes" })).length, 0);
  } finally {
    await db.close();
  }
});

test("factory preserves an explicitly injected runtime publisher", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const published: unknown[] = [];
    const service = createConfiguredReminderPlanService({
      now: () => NOW,
      runtime: {
        client: db.client,
        workspaceId: db.workspaceId,
        publisher: { publish: async (message) => { published.push(message); } },
      },
    });
    await service.create({
      actorId,
      targetType: "task",
      targetId,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app"],
      title: "Runtime publisher",
      body: "Must be retained",
      deepLink: "/app/tasks/runtime-publisher",
      createdBy: "user",
      idempotencyKey: "runtime-publisher-1",
    });
    assert.equal(published.length, 1, "runtime.publisher is an explicit internal injection");
  } finally {
    await db.close();
  }
});

test("wake intent is not left behind when the plan write fails", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const failingClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => db.client.transaction((tx) => operation({
        query: async <TRow>(sql: string, values?: readonly unknown[]) => {
          if (sql.toLowerCase().includes("insert into orbit_records") && values?.includes("reminderPlans")) {
            throw new Error("injected plan write failure");
          }
          return tx.query<TRow>(sql, values);
        },
      })),
    };
    const service = createService(db, { publish: async () => undefined }, failingClient);
    await assert.rejects(() => service.create({
      actorId,
      targetType: "task",
      targetId,
      fireAt: NOW,
      timeZone: "UTC",
      channels: ["in_app"],
      title: "Plan must roll back",
      body: "Atomic plan write",
      deepLink: "/app/tasks/plan-rollback",
      createdBy: "user",
      idempotencyKey: "plan-rollback-1",
    }), /injected plan write failure/);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "reminderPlans" })).length, 0);
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes" })).length, 0);
  } finally {
    await db.close();
  }
});
