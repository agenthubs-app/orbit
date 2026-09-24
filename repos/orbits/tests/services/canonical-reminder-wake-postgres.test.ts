import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool, type PoolClient } from "pg";
import { createConfiguredReminderPlanService } from "../../features/notifications/reminder-plan-service-factory";
import { dispatchActor } from "../../features/notifications/configured-canonical-reminder-maintenance";
import {
  claimCanonicalReminderWakes,
  canonicalReminderDeliveryId,
  canonicalReminderWakeId,
  canonicalReminderWakeRecord,
  createCanonicalReminderWakeIntent,
  processCanonicalReminderWakeMessage,
  repairCanonicalReminderWakes,
  CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID,
  CANONICAL_REMINDER_WAKE_SCHEDULER_KIND,
  parseCanonicalReminderWakeScheduler,
} from "../../features/notifications/canonical-reminder-wake";
import type { ReminderPlanDTO } from "../../features/notifications/reminder-plan-contract";
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
  schema: string;
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
  const schema = `b5_wake_${randomUUID().replaceAll("-", "")}`;
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
      schema,
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
  const task = { id, accountId: actorId, ownerUserId: actorId, title: "Race target", status: "open" as const, category: "work" as const, priority: "normal" as const, source: "manual" as const, createdAt: NOW, updatedAt: NOW };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "tasks", recordId: id, userId: actorId, sourceType: "manual", sourceId: id, targetType: "task", targetId: id, evidenceIds: [], occurredAt: NOW, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { version: 1, task, activities: [{ id: `activity:${randomUUID()}`, accountId: actorId, ownerUserId: actorId, taskId: id, type: "created" as const, actorType: "user" as const, actorId, occurredAt: NOW, taskSnapshot: { title: task.title, category: task.category } }] } });
  return id;
}

async function deliveryCount(db: TestDatabase): Promise<number> {
  const result = await db.client.query<{ count: string }>("select count(*) as count from orbit_records where workspace_id=$1 and collection_name='notificationDeliveries'", [db.workspaceId]);
  return Number(result.rows[0]?.count ?? 0);
}

async function seedCanonicalPlan(db: TestDatabase, actorId: string, targetId: string, index: number, fireAt = NOW): Promise<ReminderPlanDTO> {
  const id = `reminder:test:${actorId}:${index}:${randomUUID()}`;
  const plan: ReminderPlanDTO = { accountId: actorId, body: "Wake body", channels: ["in_app"], createdAt: NOW, createdBy: "user", deepLink: "/wake", fireAt, id, ownerUserId: actorId, status: "scheduled", targetId, targetType: "task", timeZone: "UTC", title: "Wake title", updatedAt: NOW };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: id, userId: actorId, sourceType: "system", sourceId: id, evidenceIds: [], occurredAt: fireAt, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: plan } });
  const wake = createCanonicalReminderWakeIntent({ plan, workspaceId: db.workspaceId, now: NOW });
  await db.store.upsertRecord(canonicalReminderWakeRecord(wake));
  return plan;
}

async function seedScheduleItem(db: TestDatabase, actorId: string, id = `schedule:${randomUUID()}`): Promise<string> {
  const item = {
    id,
    sourceId: id,
    accountId: actorId,
    ownerUserId: actorId,
    kind: "personal" as const,
    category: "personal" as const,
    state: "upcoming" as const,
    title: "Schedule target",
    startsAt: "2026-09-17T03:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    timeZone: "UTC",
  };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "personal_schedule_items", recordId: id, userId: actorId, sourceType: "manual", sourceId: id, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: item });
  return id;
}

async function seedCancelledScheduleOccurrence(db: TestDatabase, actorId: string): Promise<string> {
  const seriesId = `schedule:series:${randomUUID()}`;
  const occurrenceDate = "2026-09-18";
  const series = {
    id: seriesId,
    sourceId: seriesId,
    accountId: actorId,
    ownerUserId: actorId,
    kind: "personal" as const,
    category: "personal" as const,
    state: "upcoming" as const,
    title: "Recurring schedule target",
    startsAt: "2026-09-17T03:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
    timeZone: "UTC",
    recurrence: { frequency: "daily" as const, until: "2026-09-19" },
  };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "personal_schedule_items", recordId: seriesId, userId: actorId, sourceType: "manual", sourceId: seriesId, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: series });
  const occurrenceId = `${seriesId}:occurrence:${occurrenceDate}`;
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "personal_schedule_occurrence_exceptions", recordId: occurrenceId, userId: actorId, sourceType: "manual", sourceId: seriesId, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { seriesId, occurrenceDate, cancelled: true, patch: {}, updatedAt: NOW } });
  return `schedule:${occurrenceId}`;
}

async function seedSchedulePlan(db: TestDatabase, actorId: string, targetId: string, index: number): Promise<ReminderPlanDTO> {
  const id = `reminder:schedule:${actorId}:${index}:${randomUUID()}`;
  const plan: ReminderPlanDTO = { accountId: actorId, body: "Schedule body", channels: ["in_app"], createdAt: NOW, createdBy: "user", deepLink: "/schedule", fireAt: NOW, id, ownerUserId: actorId, status: "scheduled", targetId, targetType: "schedule_item", timeZone: "UTC", title: "Schedule title", updatedAt: NOW };
  await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: id, userId: actorId, sourceType: "system", sourceId: id, evidenceIds: [], occurredAt: NOW, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: plan } });
  await db.store.upsertRecord(canonicalReminderWakeRecord(createCanonicalReminderWakeIntent({ plan, workspaceId: db.workspaceId, now: NOW })));
  return plan;
}

function cursorFields(record: {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  userId?: string | null;
  sourceType: string;
  sourceId: string;
  evidenceIds: readonly string[];
  targetType?: string | null;
  targetId?: string | null;
  occurredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lifecycleState: string;
  searchText?: string | null;
  payload: unknown;
}): Record<string, unknown> {
  return {
    workspaceId: record.workspaceId,
    collectionName: record.collectionName,
    recordId: record.recordId,
    userId: record.userId,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    evidenceIds: record.evidenceIds,
    targetType: record.targetType,
    targetId: record.targetId,
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    lifecycleState: record.lifecycleState,
    searchText: record.searchText,
    payload: record.payload,
  };
}

type QueryHook = {
  before?: (statement: string, values?: readonly unknown[]) => Promise<void> | void;
  after?: (statement: string, values: readonly unknown[] | undefined, rows: readonly unknown[]) => Promise<void> | void;
  error?: (statement: string, error: unknown) => Promise<void> | void;
};

function gatedClient(base: TransactionalPostgresClient, hooks: QueryHook): TransactionalPostgresClient {
  return {
    ...base,
    transaction: (operation) => base.transaction((tx) => operation({
      query: async <TRow = Record<string, unknown>>(statement: string, values?: readonly unknown[]) => {
        await hooks.before?.(statement, values);
        try {
          const result = await tx.query<TRow>(statement, values);
          await hooks.after?.(statement, values, result.rows);
          return result;
        } catch (error) {
          await hooks.error?.(statement, error);
          throw error;
        }
      },
    })),
  };
}

function sqlState(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

async function retrySerializable<T>(operation: () => Promise<T>, label: string, observed: Array<{ label: string; code: string }>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = sqlState(error);
      if (code === "40P01") throw error;
      if (code !== "40001" || attempt === 2) throw error;
      observed.push({ label, code });
    }
  }
  throw new Error(`${label} serializable retry limit reached`);
}

function isBlockingActorLock(statement: string): boolean {
  return statement.toLowerCase().includes("select pg_advisory_xact_lock(hashtextextended");
}

function isTryActorLock(statement: string): boolean {
  return statement.toLowerCase().includes("select pg_try_advisory_xact_lock(hashtextextended");
}

function isTaskTargetRead(statement: string, values: readonly unknown[] | undefined): boolean {
  const sql = statement.toLowerCase();
  return sql.includes("from orbit_records") && sql.includes("collection_name = $2") && values?.[1] === "tasks";
}

function isScheduleTargetRead(statement: string, values: readonly unknown[] | undefined): boolean {
  const sql = statement.toLowerCase();
  return sql.includes("from orbit_records") && sql.includes("collection_name = $2") && values?.[1] === "personal_schedule_items";
}

test("the real legacy dispatcher and the new wake consumer have deterministic races in both start orders", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const observedRetries: Array<{ label: string; code: string }> = [];
    const observedSqlErrors: Array<{ label: string; code: string | undefined; statement: string }> = [];

    const oldFirstActor = `actor:${randomUUID()}:old-first`;
    const oldFirstTarget = await seedTask(db, oldFirstActor);
    const oldFirstService = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher: { publish: async () => undefined } });
    const oldFirstPlan = await oldFirstService.create({ actorId: oldFirstActor, targetType: "task", targetId: oldFirstTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Old first", body: "One only", deepLink: "/app/tasks/old-first", createdBy: "user", idempotencyKey: "race-old-first" });
    const oldFirstClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-old-first", now: NOW, intentId: canonicalReminderWakeId(oldFirstPlan.id), planId: oldFirstPlan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(oldFirstClaim.messages.length, 1);
    const oldFirstMessage = oldFirstClaim.messages[0]!;
    let oldFirstGateUsed = false;
    let releaseOldFirst!: () => void;
    const oldFirstRelease = new Promise<void>((resolve) => { releaseOldFirst = resolve; });
    let oldFirstLocked!: () => void;
    const oldFirstActorLocked = new Promise<void>((resolve) => { oldFirstLocked = resolve; });
    let wakeOldFirstAttempted!: () => void;
    const wakeOldFirstAboutToLock = new Promise<void>((resolve) => { wakeOldFirstAttempted = resolve; });
    const oldFirstClient = gatedClient(db.client, {
      after: async (statement, _values, rows) => {
        if (!oldFirstGateUsed && isTryActorLock(statement) && (rows[0] as { acquired?: boolean } | undefined)?.acquired === true) {
          oldFirstGateUsed = true;
          oldFirstLocked();
          await oldFirstRelease;
        }
      },
      error: async (statement, error) => { observedSqlErrors.push({ label: "old-first-legacy", code: sqlState(error), statement }); },
    });
    let wakeOldFirstGateUsed = false;
    const wakeOldFirstClient = gatedClient(db.client, {
      before: async (statement) => {
        if (!wakeOldFirstGateUsed && isBlockingActorLock(statement)) {
          wakeOldFirstGateUsed = true;
          wakeOldFirstAttempted();
        }
      },
      error: async (statement, error) => { observedSqlErrors.push({ label: "old-first-wake", code: sqlState(error), statement }); },
    });
    const oldFirstLegacy = retrySerializable(
      () => dispatchActor({ client: oldFirstClient, workspaceId: db.workspaceId }, oldFirstActor, NOW),
      "old-first-legacy",
      observedRetries,
    );
    await oldFirstActorLocked;
    const oldFirstWake = retrySerializable(
      () => processCanonicalReminderWakeMessage(oldFirstMessage, { client: wakeOldFirstClient, workspaceId: db.workspaceId, now: () => NOW }),
      "old-first-wake",
      observedRetries,
    );
    await wakeOldFirstAboutToLock;
    releaseOldFirst();
    const oldFirstResults = await Promise.allSettled([oldFirstLegacy, oldFirstWake]);
    assert.equal(oldFirstResults[0]?.status, "fulfilled", "old-first legacy dispatcher must finish");
    assert.equal(oldFirstResults[1]?.status, "fulfilled", "old-first wake must finish after bounded fresh-snapshot retry");
    if (oldFirstResults[0]?.status === "fulfilled") assert.ok("claimed" in oldFirstResults[0].value && "inAppDelivered" in oldFirstResults[0].value);
    if (oldFirstResults[1]?.status === "fulfilled") assert.ok(["delivered", "already_delivered"].includes(oldFirstResults[1].value.outcome));
    const oldFirstReplay = await processCanonicalReminderWakeMessage(oldFirstMessage, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(oldFirstReplay.outcome, "stale");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: oldFirstPlan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: oldFirstPlan.id }))!.payload as { entity: { status: string } }).entity.status, "delivered");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(oldFirstPlan.id) }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(oldFirstPlan.id) }))!.payload as { state: string }).state, "delivered");

    const wakeFirstActor = `actor:${randomUUID()}:wake-first`;
    const wakeFirstTarget = await seedTask(db, wakeFirstActor);
    const wakeFirstPlan = await oldFirstService.create({ actorId: wakeFirstActor, targetType: "task", targetId: wakeFirstTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Wake first", body: "One only", deepLink: "/app/tasks/wake-first", createdBy: "user", idempotencyKey: "race-wake-first" });
    const wakeFirstClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-first", now: NOW, intentId: canonicalReminderWakeId(wakeFirstPlan.id), planId: wakeFirstPlan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(wakeFirstClaim.messages.length, 1);
    const wakeFirstMessage = wakeFirstClaim.messages[0]!;
    let wakeFirstGateUsed = false;
    let releaseWakeFirst!: () => void;
    const wakeFirstRelease = new Promise<void>((resolve) => { releaseWakeFirst = resolve; });
    let wakeFirstLocked!: () => void;
    const wakeFirstActorLocked = new Promise<void>((resolve) => { wakeFirstLocked = resolve; });
    let oldWakeFirstBusy!: () => void;
    const oldWakeFirstIsBusy = new Promise<void>((resolve) => { oldWakeFirstBusy = resolve; });
    const wakeFirstClient = gatedClient(db.client, {
      after: async (statement) => {
        if (!wakeFirstGateUsed && isBlockingActorLock(statement)) {
          wakeFirstGateUsed = true;
          wakeFirstLocked();
          await wakeFirstRelease;
        }
      },
      error: async (statement, error) => { observedSqlErrors.push({ label: "wake-first-wake", code: sqlState(error), statement }); },
    });
    const oldWakeFirstClient = gatedClient(db.client, {
      after: async (statement, _values, rows) => {
        if (isTryActorLock(statement) && (rows[0] as { acquired?: boolean } | undefined)?.acquired === false) oldWakeFirstBusy();
      },
      error: async (statement, error) => { observedSqlErrors.push({ label: "wake-first-legacy", code: sqlState(error), statement }); },
    });
    const wakeFirstWake = retrySerializable(
      () => processCanonicalReminderWakeMessage(wakeFirstMessage, { client: wakeFirstClient, workspaceId: db.workspaceId, now: () => NOW }),
      "wake-first-wake",
      observedRetries,
    );
    await wakeFirstActorLocked;
    const wakeFirstLegacy = dispatchActor({ client: oldWakeFirstClient, workspaceId: db.workspaceId }, wakeFirstActor, NOW);
    await oldWakeFirstIsBusy;
    releaseWakeFirst();
    const wakeFirstResults = await Promise.allSettled([wakeFirstWake, wakeFirstLegacy]);
    assert.equal(wakeFirstResults[0]?.status, "fulfilled", "wake-first consumer must finish while holding the actor lock");
    assert.equal(wakeFirstResults[1]?.status, "rejected", "wake-first legacy dispatcher must observe actor contention");
    if (wakeFirstResults[0]?.status === "fulfilled") assert.ok(["delivered", "already_delivered"].includes(wakeFirstResults[0].value.outcome));
    if (wakeFirstResults[1]?.status === "rejected") {
      assert.match(String(wakeFirstResults[1].reason), /Canonical reminder actor is busy/);
      assert.notEqual(sqlState(wakeFirstResults[1].reason), "40P01");
    }
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: wakeFirstPlan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: wakeFirstPlan.id }))!.payload as { entity: { status: string } }).entity.status, "delivered");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(wakeFirstPlan.id) }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(wakeFirstPlan.id) }))!.payload as { state: string }).state, "delivered");

    for (const error of observedSqlErrors) {
      assert.notEqual(error.code, "40P01", `${error.label} observed deadlock at ${error.statement}`);
      if (error.code !== undefined) assert.equal(error.code, "40001", `${error.label} unexpected SQLSTATE at ${error.statement}`);
    }
    assert.equal(await deliveryCount(db), 2, "both deterministic start orders produce exactly one delivery per plan");
  } finally {
    await db.close();
  }
});

test("a publisher ACK failure and duplicate leased message converge through the delivery fence", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const producerMessages: unknown[] = [];
    const service = createConfiguredReminderPlanService({
      runtime: {
        client: db.client,
        workspaceId: db.workspaceId,
        publisher: { publish: async (message) => { producerMessages.push(message); throw new Error("producer ACK lost"); } },
      },
      now: () => NOW,
    });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "ACK", body: "Retry", deepLink: "/ack", createdBy: "user", idempotencyKey: "ack-1" });
    assert.equal(producerMessages.length, 1, "configured producer attempts its post-commit hint");
    let captured: unknown;
    const repair = await repairCanonicalReminderWakes({
      runtime: {
        client: db.client,
        workspaceId: db.workspaceId,
        now: () => NOW,
        publisher: { publish: async (message) => { captured = message; throw new Error("repair ACK lost"); } },
      },
      workerId: "ack-worker",
      now: NOW,
      maxActors: 1,
      maxPlansPerActor: 1,
    });
    assert.equal(repair.wakeClaimed, 1);
    assert.equal(repair.wakePublishFailed, 1);
    assert.ok(captured, "repair fake publisher must capture the accepted leased message before ACK failure");
    const replay = await processCanonicalReminderWakeMessage(captured, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(replay.outcome, "stale");
    assert.equal(repair.wakeDelivered, 1, "repair must finish the durable intent even when publish ACK is lost");
    assert.equal(await deliveryCount(db), 1);
    const storedIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.equal((storedIntent?.payload as { state: string }).state, "delivered");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))!.payload as { entity: { status: string } }).entity.status, "delivered");
  } finally {
    await db.close();
  }
});

test("two repair workers can initialize the durable cursor concurrently and deliver each claimed plan once", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actors = ["actor:p2-init-race:a", "actor:p2-init-race:b"];
    const plans: ReminderPlanDTO[] = [];
    const service = createConfiguredReminderPlanService({
      runtime: { client: db.client, workspaceId: db.workspaceId },
      now: () => NOW,
      publisher: { publish: async () => undefined },
    });
    for (const [index, actorId] of actors.entries()) {
      const targetId = await seedTask(db, actorId);
      plans.push(await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: `Init race ${index}`, body: "One", deepLink: "/init-race", createdBy: "user", idempotencyKey: `init-race-${index}` }));
    }
    let barrierReached = 0;
    const backendPids = new Set<number>();
    let releaseBarrier!: () => void;
    const barrierRelease = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    let bothReached!: () => void;
    const bothEligible = new Promise<void>((resolve) => { bothReached = resolve; });
    const barrierClient = (base: TransactionalPostgresClient): TransactionalPostgresClient => ({
      ...base,
      transaction: (operation) => base.transaction(async (tx) => {
        const pid = Number((await tx.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid);
        backendPids.add(pid);
        let waited = false;
        return operation({
          query: async <TRow = Record<string, unknown>>(statement: string, values?: readonly unknown[]) => {
            if (!waited && statement.toLowerCase().includes("select exists")) {
              waited = true;
              barrierReached += 1;
              if (barrierReached === 2) bothReached();
              await barrierRelease;
            }
            return tx.query<TRow>(statement, values);
          },
        });
      }),
    });
    const runtimes = [barrierClient(db.client), barrierClient(db.client)].map((client) => ({ client, workspaceId: db.workspaceId, now: () => NOW, publisher: { publish: async () => undefined } }));
    const workers = [
      repairCanonicalReminderWakes({ runtime: runtimes[0]!, workerId: "init-race-1", now: NOW }),
      repairCanonicalReminderWakes({ runtime: runtimes[1]!, workerId: "init-race-2", now: NOW }),
    ];
    await bothEligible;
    assert.equal(barrierReached, 2, "both real transactions reached the first eligible EXISTS before release");
    assert.equal(backendPids.size, 2, "initialization race uses two independent PostgreSQL connections");
    releaseBarrier();
    const results = await Promise.allSettled(workers);
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : "");
    }
    const summaries = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof repairCanonicalReminderWakes>>> => result.status === "fulfilled").map((result) => result.value);
    assert.equal(summaries.reduce((total, result) => total + result.wakeClaimed, 0), 2);
    assert.equal(summaries.reduce((total, result) => total + result.wakeDelivered, 0), 2);
    assert.equal(await deliveryCount(db), 2, "cursor initialization contention cannot duplicate delivery");
    for (const plan of plans) {
      const storedPlan = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id });
      assert.equal((storedPlan?.payload as { entity: { status: string } }).entity.status, "delivered", `plan ${plan.id} must reach delivered once`);
      const deliveries = await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "notificationDeliveries", userId: plan.accountId });
      assert.equal(deliveries.filter((record) => (record.payload as { entity: { reminderPlanId: string } }).entity.reminderPlanId === plan.id).length, 1, `plan ${plan.id} has one delivery`);
    }
    const cursor = await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    );
    assert.equal(Number(cursor.rows[0]?.count ?? 0), 1);
  } finally {
    await db.close();
  }
});

test("a wake from another workspace is ignored before any delivery read or write", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Workspace", body: "Spoof", deepLink: "/workspace", createdBy: "user", idempotencyKey: "workspace-spoof" });
    const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "workspace-worker", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    const message = claim.messages[0]!;
    const spoofed = { ...message, workspaceId: "workspace:foreign" };
    const ignored = await processCanonicalReminderWakeMessage(spoofed, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(ignored.outcome, "ignored");
    assert.equal(ignored.reason, "workspace_mismatch");
    assert.equal(await deliveryCount(db), 0);
    assert.equal((await processCanonicalReminderWakeMessage(message, { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");
    assert.equal((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))?.payload && ((await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: plan.id }))!.payload as { entity: { status: string } }).entity.status, "delivered");
  } finally {
    await db.close();
  }
});

test("missing, foreign, and cancelled schedule occurrences finish as terminal target failures without delivery", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  const foreignActorId = `${actorId}:foreign`;
  let publisherCalls = 0;
  try {
    const foreignTargetId = await seedScheduleItem(db, foreignActorId);
    const cases = [
      { name: "missing", targetId: `schedule:missing:${randomUUID()}` },
      { name: "foreign", targetId: `schedule:${foreignTargetId}` },
      { name: "cancelled-occurrence", targetId: await seedCancelledScheduleOccurrence(db, actorId) },
    ] as const;
    const plans: ReminderPlanDTO[] = [];
    for (const [index, item] of cases.entries()) plans.push(await seedSchedulePlan(db, actorId, item.targetId, index));
    for (const plan of plans) {
      const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: `schedule-target-${plan.id}`, now: NOW, intentId: canonicalReminderWakeId(plan.id), planId: plan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
      const message = claim.messages[0];
      assert.ok(message && "leaseEpoch" in message);
      const result = await processCanonicalReminderWakeMessage(message, { client: db.client, workspaceId: db.workspaceId, now: () => NOW, publisher: { publish: async () => { publisherCalls += 1; } } });
      assert.equal(result.outcome, "failed");
      const storedIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
      const payload = storedIntent?.payload as { state?: string; lastErrorCode?: string; leaseToken?: string } | undefined;
      assert.equal(payload?.state, "failed", `${plan.id} must reach a terminal failed state`);
      assert.equal(payload?.lastErrorCode, "TARGET_NOT_OWNED");
      assert.equal(payload?.leaseToken, undefined);
    }
    assert.equal(await deliveryCount(db), 0);
    assert.equal(publisherCalls, 0, "target rejection must not publish or invoke a provider");
  } finally {
    await db.close();
  }
});

test("schedule target reads preserve serialization retry and deadlock errors", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedScheduleItem(db, actorId);
    const plan = await seedSchedulePlan(db, actorId, `schedule:${targetId}`, 1);
    const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "schedule-target-retry", now: NOW, intentId: canonicalReminderWakeId(plan.id), planId: plan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    const message = claim.messages[0];
    assert.ok(message && "leaseEpoch" in message);
    let retryTransactions = 0;
    let retrySuccessfulTransactions = 0;
    let retryTargetReads = 0;
    const retryClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        retryTransactions += 1;
        return db.client.transaction(async (tx) => {
          const result = await operation({
            query: async <TRow>(statement: string, values?: readonly unknown[]) => {
              if (isScheduleTargetRead(statement, values)) {
                retryTargetReads += 1;
                if (retryTargetReads === 1) await tx.query("do $$ begin raise exception 'schedule target read serialization failure' using errcode = '40001'; end $$;");
              }
              return tx.query<TRow>(statement, values);
            },
          });
          retrySuccessfulTransactions += 1;
          return result;
        });
      },
    };
    const retryResult = await processCanonicalReminderWakeMessage(message, { client: retryClient, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(retryResult.outcome, "delivered");
    assert.equal(retryTargetReads, 2);
    assert.equal(retryTransactions, 3, "resolveWakeActor plus two consumer transactions");
    assert.equal(retrySuccessfulTransactions, 2);
    assert.equal(await deliveryCount(db), 1);

    const deadlockActorId = `${actorId}:deadlock`;
    const deadlockTargetId = await seedScheduleItem(db, deadlockActorId);
    const deadlockPlan = await seedSchedulePlan(db, deadlockActorId, `schedule:${deadlockTargetId}`, 2);
    const deadlockClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "schedule-target-deadlock", now: NOW, intentId: canonicalReminderWakeId(deadlockPlan.id), planId: deadlockPlan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    const deadlockMessage = deadlockClaim.messages[0];
    assert.ok(deadlockMessage && "leaseEpoch" in deadlockMessage);
    let deadlockTransactions = 0;
    let deadlockSuccessfulTransactions = 0;
    let deadlockTargetReads = 0;
    const deadlockClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        deadlockTransactions += 1;
        return db.client.transaction(async (tx) => {
          const result = await operation({
            query: async <TRow>(statement: string, values?: readonly unknown[]) => {
              if (isScheduleTargetRead(statement, values)) {
                deadlockTargetReads += 1;
                await tx.query("do $$ begin raise exception 'schedule target read deadlock' using errcode = '40P01'; end $$;");
                throw new Error("schedule target read deadlock injection returned unexpectedly");
              }
              return tx.query<TRow>(statement, values);
            },
          });
          deadlockSuccessfulTransactions += 1;
          return result;
        });
      },
    };
    await assert.rejects(
      () => processCanonicalReminderWakeMessage(deadlockMessage, { client: deadlockClient, workspaceId: db.workspaceId, now: () => NOW }),
      (error: unknown) => sqlState(error) === "40P01",
    );
    assert.equal(deadlockTargetReads, 1);
    assert.equal(deadlockTransactions, 2, "resolveWakeActor commits, then the original consumer transaction fails");
    assert.equal(deadlockSuccessfulTransactions, 1);
    assert.equal(await deliveryCount(db), 1, "the deadlock plan must not create a delivery");
    const deadlockIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(deadlockPlan.id) });
    assert.equal((deadlockIntent?.payload as { state?: string } | undefined)?.state, "leased");
  } finally {
    await db.close();
  }
});

test("consumer preserves target-read serialization errors for its fresh-transaction retry", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher: { publish: async () => undefined } });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Target read retry", body: "Retry the target read", deepLink: "/target-read-retry", createdBy: "user", idempotencyKey: "target-read-retry" });
    const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "target-read-retry", now: NOW, intentId: canonicalReminderWakeId(plan.id), planId: plan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    const message = claim.messages[0];
    assert.ok(message && "leaseEpoch" in message);
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
                  await tx.query("do $$ begin raise exception 'consumer target read serialization failure' using errcode = '40001'; end $$;");
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
    const result = await processCanonicalReminderWakeMessage(message, { client: retryClient, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(result.outcome, "delivered");
    assert.equal(targetReads, 2);
    assert.equal(transactions, 3, "one actor lookup plus two fresh consumer transactions are expected");
    assert.equal(successfulTransactions, 2, "only the actor lookup and the retried consumer transaction commit");
    assert.equal(await deliveryCount(db), 1);
    const deliveredIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.equal((deliveredIntent?.payload as { state: string } | undefined)?.state, "delivered");
  } finally {
    await db.close();
  }
});

test("consumer does not translate a target-read deadlock into target not owned", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher: { publish: async () => undefined } });
    const plan = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Target read deadlock", body: "Preserve deadlock", deepLink: "/target-read-deadlock", createdBy: "user", idempotencyKey: "target-read-deadlock" });
    const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "target-read-deadlock", now: NOW, intentId: canonicalReminderWakeId(plan.id), planId: plan.id, generation: 1, maxActors: 1, maxPlansPerActor: 1 });
    const message = claim.messages[0];
    assert.ok(message && "leaseEpoch" in message);
    let transactions = 0;
    let successfulTransactions = 0;
    let targetReads = 0;
    const deadlockClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        transactions += 1;
        return db.client.transaction(async (tx) => {
          const result = await operation({
            query: async <TRow>(statement: string, values?: readonly unknown[]) => {
              if (isTaskTargetRead(statement, values)) {
                targetReads += 1;
                await tx.query("do $$ begin raise exception 'consumer target read deadlock' using errcode = '40P01'; end $$;");
                throw new Error("target read deadlock injection returned unexpectedly");
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
      () => processCanonicalReminderWakeMessage(message, { client: deadlockClient, workspaceId: db.workspaceId, now: () => NOW }),
      (error: unknown) => sqlState(error) === "40P01",
    );
    assert.equal(targetReads, 1);
    assert.equal(transactions, 2, "40P01 must fail the consumer transaction without retry");
    assert.equal(successfulTransactions, 1, "only resolveWakeActor may commit before the deadlock");
    assert.equal(await deliveryCount(db), 0);
    const leasedIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.equal((leasedIntent?.payload as { state: string } | undefined)?.state, "leased", "deadlock rollback must not finalize the lease as target-not-owned");
  } finally {
    await db.close();
  }
});

test("a claimed wake becomes a no-op after cancellation and repair continues past a poison target", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const goodTarget = await seedTask(db, actorId);
    const poisonTarget = await seedTask(db, actorId);
    const sameActorGoodTarget = await seedTask(db, actorId);
    const attemptsPoisonTarget = await seedTask(db, actorId);
    const otherActor = `${actorId}:other`;
    const otherTarget = await seedTask(db, otherActor);
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher: { publish: async () => undefined } });
    const goodPlan = await service.create({ actorId, targetType: "task", targetId: goodTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Good", body: "Good", deepLink: "/good", createdBy: "user", idempotencyKey: "good" });
    const poisonPlan = await service.create({ actorId, targetType: "task", targetId: poisonTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Poison", body: "Poison", deepLink: "/poison", createdBy: "user", idempotencyKey: "poison" });
    const sameActorGoodPlan = await service.create({ actorId, targetType: "task", targetId: sameActorGoodTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Same actor good", body: "Good", deepLink: "/same-actor-good", createdBy: "user", idempotencyKey: "same-actor-good" });
    const attemptsPoisonPlan = await service.create({ actorId, targetType: "task", targetId: attemptsPoisonTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Attempts poison", body: "Poison", deepLink: "/attempts-poison", createdBy: "user", idempotencyKey: "attempts-poison" });
    const otherPlan = await service.create({ actorId: otherActor, targetType: "task", targetId: otherTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Other", body: "Other", deepLink: "/other", createdBy: "user", idempotencyKey: "other" });
    const poisonRecord = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: poisonPlan.id });
    assert.ok(poisonRecord);
    await db.store.upsertRecord({ ...poisonRecord, payload: { entity: { ...poisonPlan, targetId: "task:not-owned" } } });
    const attemptsPoisonRecord = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(attemptsPoisonPlan.id) });
    assert.ok(attemptsPoisonRecord);
    await db.store.upsertRecord({ ...attemptsPoisonRecord, payload: { ...(attemptsPoisonRecord.payload as Record<string, unknown>), attempts: Number.MAX_SAFE_INTEGER } });
    const claim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-b", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal(claim.messages.length, 4);
    assert.equal(claim.malformed, 1, "an unsafe attempts increment is isolated as a failed wake");
    assert.equal(claim.messages.some((message) => message.planId === attemptsPoisonPlan.id), false);
    const failedAttemptsRecord = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(attemptsPoisonPlan.id) });
    assert.ok(failedAttemptsRecord);
    assert.equal((failedAttemptsRecord.payload as { state: string }).state, "failed");
    assert.equal((failedAttemptsRecord.payload as { lastErrorCode: string }).lastErrorCode, "ATTEMPTS_OVERFLOW");
    assert.equal((failedAttemptsRecord.payload as { attempts: number }).attempts, Number.MAX_SAFE_INTEGER);
    const cancelledClaim = claim.messages.find((message) => message.planId === goodPlan.id)!;
    await service.cancel({ actorId, reminderId: goodPlan.id, idempotencyKey: "cancel-good" });
    await processCanonicalReminderWakeMessage(cancelledClaim, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    const poisonClaim = claim.messages.find((message) => message.planId === poisonPlan.id)!;
    const sameActorGoodClaim = claim.messages.find((message) => message.planId === sameActorGoodPlan.id)!;
    const otherClaim = claim.messages.find((message) => message.planId === otherPlan.id)!;
    const poisonResult = await processCanonicalReminderWakeMessage(poisonClaim, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    const sameActorResult = await processCanonicalReminderWakeMessage(sameActorGoodClaim, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    const otherResult = await processCanonicalReminderWakeMessage(otherClaim, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(poisonResult.outcome, "failed");
    assert.equal(sameActorResult.outcome, "delivered");
    assert.equal(otherResult.outcome, "delivered");
    assert.equal(await deliveryCount(db), 2, "one bad target does not block same-actor or other-actor good plans");
  } finally {
    await db.close();
  }
});

test("in-app preferences and delivery fences use the real LiveRecord shape, including recovery and deleted plans", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  const publisher = { publish: async () => undefined };
  try {
    const targetId = await seedTask(db, actorId);
    await db.store.upsertRecord({
      workspaceId: db.workspaceId,
      collectionName: "notificationPreferences",
      recordId: actorId,
      userId: actorId,
      sourceType: "manual",
      sourceId: actorId,
      evidenceIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      lifecycleState: "active",
      payload: { entity: { accountId: actorId, ownerUserId: actorId, inAppEnabled: true, iosPushEnabled: true, lockScreenContent: "private", quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" }, updatedAt: NOW } },
    });
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher });
    const first = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Preference", body: "Enabled", deepLink: "/enabled", createdBy: "user", idempotencyKey: "preference-enabled" });
    const firstClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-pref", now: NOW });
    assert.equal((await processCanonicalReminderWakeMessage(firstClaim.messages.find((message) => message.planId === first.id), { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");

    const fenced = await service.create({ actorId, targetType: "task", targetId, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Existing fence", body: "Recover", deepLink: "/fence", createdBy: "user", idempotencyKey: "delivery-fence" });
    const fencedDelivery = { id: canonicalReminderDeliveryId(fenced), accountId: actorId, ownerUserId: actorId, reminderPlanId: fenced.id, channel: "in_app" as const, fireAt: fenced.fireAt, status: "delivered" as const, deliveredAt: NOW, createdAt: NOW, updatedAt: NOW };
    await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "notificationDeliveries", recordId: fencedDelivery.id, userId: actorId, sourceType: "system", sourceId: fenced.id, evidenceIds: [], targetType: "reminder_plan", targetId: fenced.id, occurredAt: fenced.fireAt, createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: fencedDelivery } });
    const preferenceClosedAt = "2026-09-17T02:00:01.000Z";
    await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "notificationPreferences", recordId: actorId, userId: actorId, sourceType: "manual", sourceId: actorId, evidenceIds: [], createdAt: NOW, updatedAt: preferenceClosedAt, lifecycleState: "active", payload: { entity: { accountId: actorId, ownerUserId: actorId, inAppEnabled: false, iosPushEnabled: true, lockScreenContent: "private", quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" }, updatedAt: preferenceClosedAt } } });
    const fencedClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-fence", now: NOW });
    assert.equal((await processCanonicalReminderWakeMessage(fencedClaim.messages.find((message) => message.planId === fenced.id), { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "already_delivered");
    assert.equal((await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "notificationDeliveries", userId: actorId })).length, 2);

    const disabledActor = `${actorId}:disabled`;
    const disabledTarget = await seedTask(db, disabledActor);
    await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "notificationPreferences", recordId: disabledActor, userId: disabledActor, sourceType: "manual", sourceId: disabledActor, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: { accountId: disabledActor, ownerUserId: disabledActor, inAppEnabled: false, iosPushEnabled: true, lockScreenContent: "private", quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" }, updatedAt: NOW } } });
    const disabled = await service.create({ actorId: disabledActor, targetType: "task", targetId: disabledTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Disabled", body: "Disabled", deepLink: "/disabled", createdBy: "user", idempotencyKey: "disabled" });

    const spoofActor = `${actorId}:spoof-pref`;
    const spoofTarget = await seedTask(db, spoofActor);
    await db.store.upsertRecord({ workspaceId: db.workspaceId, collectionName: "notificationPreferences", recordId: spoofActor, userId: spoofActor, sourceType: "manual", sourceId: spoofActor, evidenceIds: [], createdAt: NOW, updatedAt: NOW, lifecycleState: "active", payload: { entity: { accountId: "actor:foreign", ownerUserId: "actor:foreign", inAppEnabled: true, iosPushEnabled: true, lockScreenContent: "private", quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" }, updatedAt: NOW } } });
    const spoof = await service.create({ actorId: spoofActor, targetType: "task", targetId: spoofTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Spoof pref", body: "Spoof", deepLink: "/spoof", createdBy: "user", idempotencyKey: "spoof-pref" });

    const deletedActor = `${actorId}:deleted`;
    const deletedTarget = await seedTask(db, deletedActor);
    const deleted = await service.create({ actorId: deletedActor, targetType: "task", targetId: deletedTarget, fireAt: NOW, timeZone: "UTC", channels: ["in_app"], title: "Deleted", body: "Deleted", deepLink: "/deleted", createdBy: "user", idempotencyKey: "deleted-plan" });
    const allClaims = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "wake-faults", now: NOW });
    await db.store.deleteRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: deleted.id, deletedAt: NOW, userId: deletedActor });
    const disabledResult = await processCanonicalReminderWakeMessage(allClaims.messages.find((message) => message.planId === disabled.id), { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    const spoofResult = await processCanonicalReminderWakeMessage(allClaims.messages.find((message) => message.planId === spoof.id), { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    const deletedResult = await processCanonicalReminderWakeMessage(allClaims.messages.find((message) => message.planId === deleted.id), { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(disabledResult.outcome, "failed");
    assert.equal(spoofResult.outcome, "failed");
    assert.equal(deletedResult.outcome, "failed");
    assert.equal(await deliveryCount(db), 2);
  } finally {
    await db.close();
  }
});

test("future and unrelated intents keep claim continuation bounded without returning payloads", async (t) => {
  const db = await database(t);
  if (!db) return;
  const actorId = `actor:${randomUUID()}`;
  try {
    const targetId = await seedTask(db, actorId);
    const service = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => NOW, publisher: { publish: async () => undefined } });
    const future = await service.create({ actorId, targetType: "task", targetId, fireAt: "2030-01-01T00:00:00.000Z", timeZone: "UTC", channels: ["in_app"], title: "Future", body: "A large future payload must stay in storage", deepLink: "/future", createdBy: "user", idempotencyKey: "future" });
    const futureRecord = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(future.id) });
    assert.ok(futureRecord);
    await db.store.upsertRecord({ ...futureRecord, payload: { ...futureRecord.payload, unrelatedPayload: "x".repeat(100_000) } });
    type Observation = { statement: string; rows: number; jsonBytes: number };
    const observeClaim = async (workerId: string): Promise<{ result: Awaited<ReturnType<typeof claimCanonicalReminderWakes>>; observations: readonly Observation[] }> => {
      const observations: Observation[] = [];
      const observingClient: TransactionalPostgresClient = {
        ...db.client,
        transaction: (operation) => db.client.transaction((tx) => operation({
          query: async <TRow>(statement: string, values?: readonly unknown[]) => {
            const result = await tx.query<TRow>(statement, values);
            observations.push({ statement, rows: result.rows.length, jsonBytes: Buffer.byteLength(JSON.stringify(result.rows), "utf8") });
            return result;
          },
        })),
      };
      const result = await claimCanonicalReminderWakes({ runtime: { client: observingClient, workspaceId: db.workspaceId }, workerId, now: NOW });
      return { result, observations };
    };
    const cursorBefore = await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    );
    assert.equal(Number(cursorBefore.rows[0]?.count ?? 0), 0, "future-only claim starts without a scheduler row");
    const first = await observeClaim("bounded-one");
    assert.deepEqual(first.result.messages, []);
    assert.equal(first.result.continuation, 0);

    for (let index = 0; index < 3; index += 1) {
      await service.create({ actorId, targetType: "task", targetId, fireAt: "2030-01-01T00:00:00.000Z", timeZone: "UTC", channels: ["in_app"], title: `Future ${index}`, body: "Future", deepLink: "/future", createdBy: "user", idempotencyKey: `future-extra-${index}` });
      const foreignActor = `${actorId}:future-foreign:${index}`;
      const foreignTarget = await seedTask(db, foreignActor);
      await service.create({ actorId: foreignActor, targetType: "task", targetId: foreignTarget, fireAt: "2030-01-01T00:00:00.000Z", timeZone: "UTC", channels: ["in_app"], title: `Foreign future ${index}`, body: "Future", deepLink: "/foreign-future", createdBy: "user", idempotencyKey: `foreign-future-${index}` });
    }
    const second = await observeClaim("bounded-two");
    assert.deepEqual(second.result.messages, []);
    assert.equal(second.result.continuation, 0);
    const observations = [...first.observations, ...second.observations];
    assert.ok(observations.some(({ statement }) => statement.includes("select exists (select 1 from orbit_records r")));
    assert.equal(observations.some(({ statement }) => statement.includes("select payload from orbit_records where workspace_id")), false);
    for (const observation of observations) {
      assert.ok(observation.jsonBytes < 1_000, "no-due query result rows must not contain unrelated payload bytes");
      const command = observation.statement.trim().toLowerCase();
      assert.equal(/^(insert|update|delete)\b/u.test(command), false, "no-due claim must not write");
    }
    for (const observation of observations.filter(({ statement }) => statement.includes("with eligible"))) {
      assert.equal(observation.rows, 0, "future-only candidate query returns no payload rows");
    }
    const queryShape = (items: readonly Observation[]) => items.map(({ rows, jsonBytes }) => ({ rows, jsonBytes }));
    assert.deepEqual(queryShape(first.observations), queryShape(second.observations), "future and foreign payload counts must not change SQL result rows or bytes");
    assert.ok(JSON.stringify(first.result).length < 1_000 && JSON.stringify(second.result).length < 1_000, "claim result must not scale with unrelated payload bytes");
    const cursorAfter = await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    );
    assert.equal(Number(cursorAfter.rows[0]?.count ?? 0), 0, "future-only claims never initialize idle scheduler state");
  } finally {
    await db.close();
  }
});

test("generation-only claim is rejected before SQL and leaves intents and the cursor unchanged", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorOne = "actor:p2-generation-only:a";
    const actorTwo = "actor:p2-generation-only:b";
    const targetOne = await seedTask(db, actorOne);
    const targetTwo = await seedTask(db, actorTwo);
    await seedCanonicalPlan(db, actorOne, targetOne, 1);
    const planTwo = await seedCanonicalPlan(db, actorTwo, targetTwo, 1);
    const intentTwo = await db.store.getRecord({
      workspaceId: db.workspaceId,
      collectionName: "canonical_reminder_wakes",
      recordId: canonicalReminderWakeId(planTwo.id),
    });
    assert.ok(intentTwo);
    await db.store.upsertRecord({
      ...intentTwo,
      payload: { ...(intentTwo.payload as Record<string, unknown>), generation: 2 },
    });
    const beforeIntents = (await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes" }))
      .map((record) => ({ recordId: record.recordId, payload: record.payload, updatedAt: record.updatedAt }))
      .sort((left, right) => left.recordId.localeCompare(right.recordId));
    const beforeCursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID, includeDeleted: true });
    let transactionCalls = 0;
    let queryCalls = 0;
    let publisherCalls = 0;
    const guardedClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => {
        transactionCalls += 1;
        return db.client.transaction((tx) => operation({
          query: async <TRow>(statement: string, values?: readonly unknown[]) => {
            queryCalls += 1;
            return tx.query<TRow>(statement, values);
          },
        }));
      },
    };
    await assert.rejects(
      () => claimCanonicalReminderWakes({
        runtime: { client: guardedClient, workspaceId: db.workspaceId, publisher: { publish: async () => { publisherCalls += 1; } } },
        workerId: "generation-only-rejected",
        now: NOW,
        generation: 1,
        maxActors: 25,
        maxPlansPerActor: 10,
      }),
      /generation requires intentId and planId/i,
    );
    assert.equal(transactionCalls, 0, "generation-only rejection must happen before transaction creation");
    assert.equal(queryCalls, 0, "generation-only rejection must execute zero SQL");
    assert.equal(publisherCalls, 0, "generation-only rejection must not publish");
    const afterIntents = (await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes" }))
      .map((record) => ({ recordId: record.recordId, payload: record.payload, updatedAt: record.updatedAt }))
      .sort((left, right) => left.recordId.localeCompare(right.recordId));
    const afterCursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID, includeDeleted: true });
    assert.deepEqual(afterIntents, beforeIntents);
    assert.deepEqual(afterCursor, beforeCursor, "generation-only rejection must not create or change the reserved cursor");
  } finally {
    await db.close();
  }
});

test("targeted wake claim bypasses the durable round-robin cursor, while global claim initializes its reserved row", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorA = "actor:p2-targeted:a";
    const actorB = "actor:p2-targeted:b";
    const targetA = await seedTask(db, actorA);
    const targetB = await seedTask(db, actorB);
    const planA = await seedCanonicalPlan(db, actorA, targetA, 1);
    const planB = await seedCanonicalPlan(db, actorB, targetB, 1);
    const cursorCount = async (): Promise<number> => Number((await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    )).rows[0]?.count ?? 0);

    assert.equal(await cursorCount(), 0);
    const targeted = await claimCanonicalReminderWakes({
      runtime: { client: db.client, workspaceId: db.workspaceId },
      workerId: "targeted-p2",
      now: NOW,
      intentId: canonicalReminderWakeId(planA.id),
      planId: planA.id,
      generation: 1,
      maxActors: 25,
      maxPlansPerActor: 10,
    });
    assert.deepEqual(targeted.messages.map((message) => message.planId), [planA.id]);
    assert.equal(await cursorCount(), 0, "direct intent/plan/generation claim does not create or advance global RR state");

    const global = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "global-p2", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(global.messages.map((message) => message.planId), [planB.id], "the targeted lease is not reselected while still live");
    assert.equal(await cursorCount(), 1);
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursor);
    assert.equal(cursor.userId, null);
    assert.equal(cursor.sourceType, "system");
    assert.equal(cursor.sourceId, db.workspaceId);
    assert.equal(cursor.targetType, null);
    assert.equal(cursor.targetId, null);
    assert.equal("planId" in cursor.payload, false);
    assert.equal("fireAt" in cursor.payload, false);
    const state = parseCanonicalReminderWakeScheduler(cursor.payload, db.workspaceId);
    assert.ok(state);
    assert.equal(state.kind, CANONICAL_REMINDER_WAKE_SCHEDULER_KIND);
    assert.equal(state.lastVisitedActorId, actorB);
    assert.equal(state.sequence, 1);

    const deleted = await db.store.deleteRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(planB.id), userId: actorB, deletedAt: NOW });
    assert.ok(deleted);
    assert.equal(await cursorCount(), 1, "terminal intent retention cannot remove the reserved scheduler row");
    const actorC = "actor:p2-targeted:c";
    const targetC = await seedTask(db, actorC);
    const planC = await seedCanonicalPlan(db, actorC, targetC, 1);
    const afterDeletedCursorActor = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "global-after-delete", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(afterDeletedCursorActor.messages.map((message) => message.planId), [planC.id], "a deleted cursor actor remains only a string boundary and the ring continues");
  } finally {
    await db.close();
  }
});

test("global actor ordering uses C collation and wraps past a deleted actor boundary", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actors = ["actor:A:p2-collation", "actor:a:p2-collation", "actor:ß:p2-collation", "actor:é:p2-collation"];
    const plans = new Map<string, string>();
    for (const [index, actor] of actors.entries()) {
      const target = await seedTask(db, actor);
      const plan = await seedCanonicalPlan(db, actor, target, index);
      plans.set(plan.id, actor);
    }
    const first = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-collation-one", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(first.messages.map((message) => plans.get(message.planId)), actors, "actor rank follows bytewise C ordering");
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursor);
    const state = parseCanonicalReminderWakeScheduler(cursor.payload, db.workspaceId);
    assert.ok(state);
    assert.equal(state.lastVisitedActorId, actors[3]);
    assert.equal(state.sequence, 1);
    for (const message of first.messages) {
      assert.equal((await processCanonicalReminderWakeMessage(message, { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");
    }

    const deletedIntent = await db.store.deleteRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(first.messages[3]!.planId), userId: actors[3], deletedAt: NOW });
    assert.ok(deletedIntent);
    const wrappedTarget = await seedTask(db, actors[0]);
    const wrappedPlan = await seedCanonicalPlan(db, actors[0], wrappedTarget, 99);
    const wrapped = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-collation-wrap", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(wrapped.messages.map((message) => message.planId), [wrappedPlan.id], "an eligible actor before a deleted boundary is found after wrap");
  } finally {
    await db.close();
  }
});

test("sequence zero, rather than a sentinel actor id, controls the initial round-robin ordering", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const sentinelActor = "canonical-reminder-round-robin:start";
    const otherActor = "zzzz:p2-sentinel-collision";
    const sentinelTarget = await seedTask(db, sentinelActor);
    const otherTarget = await seedTask(db, otherActor);
    const sentinelFirst = await seedCanonicalPlan(db, sentinelActor, sentinelTarget, 1);
    const sentinelSecond = await seedCanonicalPlan(db, sentinelActor, sentinelTarget, 2);
    const otherPlan = await seedCanonicalPlan(db, otherActor, otherTarget, 1);

    const first = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-sentinel-one", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(first.messages.length, 1);
    assert.ok(new Set([sentinelFirst.id, sentinelSecond.id]).has(first.messages[0]?.planId), "the colliding actor is visited on the initial sequence");
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursor);
    const state = parseCanonicalReminderWakeScheduler(cursor.payload, db.workspaceId);
    assert.ok(state);
    assert.equal(state.lastVisitedActorId, sentinelActor);
    assert.equal(state.sequence, 1);

    const second = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-sentinel-two", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    assert.deepEqual(second.messages.map((message) => message.planId), [otherPlan.id], "a real actor whose id equals the boundary sentinel does not restart the ring");
  } finally {
    await db.close();
  }
});

test("an old runtime dispatches before restart, then terminal intent cleanup preserves cursor fields and continuation", async (t) => {
  const db = await database(t);
  if (!db) return;
  assert.ok(DATABASE_URL);
  let oldClient: TransactionalPostgresClient | undefined;
  let restartedClient: TransactionalPostgresClient | undefined;
  const createRuntimeClient = (): TransactionalPostgresClient => createTransactionalPostgresClient({
    connectionString: DATABASE_URL,
    max: 2,
    pool: new Pool({ connectionString: DATABASE_URL, max: 2, options: `-c search_path=${db.schema} -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000` }),
  });
  try {
    oldClient = createRuntimeClient();
    const actorOne = "actor:p2-restart:one";
    const targetOne = await seedTask(db, actorOne);
    const planOne = await seedCanonicalPlan(db, actorOne, targetOne, 1);
    const first = await claimCanonicalReminderWakes({ runtime: { client: oldClient, workspaceId: db.workspaceId }, workerId: "p2-restart-old", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(first.messages.map((message) => message.planId), [planOne.id]);
    const dispatch = await processCanonicalReminderWakeMessage(first.messages[0], { client: oldClient, workspaceId: db.workspaceId, now: () => NOW });
    assert.equal(dispatch.outcome, "delivered", "the old runtime must perform the real terminal dispatch before restart");
    const storedPlan = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "reminderPlans", recordId: planOne.id });
    assert.ok(storedPlan);
    assert.equal((storedPlan.payload as { entity: { status: string } }).entity.status, "delivered");
    const storedIntent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(planOne.id) });
    assert.ok(storedIntent);
    assert.equal((storedIntent.payload as { state: string }).state, "delivered");
    assert.equal(await deliveryCount(db), 1);

    const cursorBefore = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorBefore);
    const stateBefore = parseCanonicalReminderWakeScheduler(cursorBefore.payload, db.workspaceId);
    assert.ok(stateBefore);
    await oldClient.close();
    oldClient = undefined;
    restartedClient = createRuntimeClient();

    const deleted = await db.store.deleteRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(planOne.id), userId: actorOne, deletedAt: NOW });
    assert.ok(deleted);
    const cursorAfterCleanup = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorAfterCleanup);
    assert.deepEqual(cursorFields(cursorAfterCleanup), cursorFields(cursorBefore), "terminal intent cleanup preserves every scheduler record field");

    const actorTwo = "actor:p2-restart:two";
    const targetTwo = await seedTask(db, actorTwo);
    const planTwo = await seedCanonicalPlan(db, actorTwo, targetTwo, 2);
    const continued = await claimCanonicalReminderWakes({ runtime: { client: restartedClient, workspaceId: db.workspaceId }, workerId: "p2-restart-new", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(continued.messages.map((message) => message.planId), [planTwo.id], "the restarted runtime continues after the stored boundary");
    const cursorAfterContinue = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorAfterContinue);
    const stateAfterContinue = parseCanonicalReminderWakeScheduler(cursorAfterContinue.payload, db.workspaceId);
    assert.ok(stateAfterContinue);
    assert.equal(stateAfterContinue.sequence, stateBefore.sequence + 1, "restart does not reset the round-robin sequence");
    assert.equal(stateAfterContinue.lastVisitedActorId, actorTwo);
  } finally {
    await oldClient?.close();
    await restartedClient?.close();
    await db.close();
  }
});

test("a physically missing cursor is lazily recreated in a separate recovery path", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorOne = "actor:p2-missing-cursor:one";
    const targetOne = await seedTask(db, actorOne);
    const planOne = await seedCanonicalPlan(db, actorOne, targetOne, 1);
    const first = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-missing-seed", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(first.messages.map((message) => message.planId), [planOne.id]);
    assert.equal((await processCanonicalReminderWakeMessage(first.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");
    await db.client.query(
      "delete from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    );
    const actorTwo = "actor:p2-missing-cursor:two";
    const targetTwo = await seedTask(db, actorTwo);
    const planTwo = await seedCanonicalPlan(db, actorTwo, targetTwo, 2);
    const recovered = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-missing-recovered", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(recovered.messages.map((message) => message.planId), [planTwo.id], "a missing physical cursor is initialized only when due work exists");
    const recoveredCursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(recoveredCursor);
    assert.ok(parseCanonicalReminderWakeScheduler(recoveredCursor.payload, db.workspaceId));
  } finally {
    await db.close();
  }
});

test("an existing idle cursor is read without scheduler DML or an updated sequence", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorId = `actor:p2-idle:${randomUUID()}`;
    const targetId = await seedTask(db, actorId);
    const plan = await seedCanonicalPlan(db, actorId, targetId, 1);
    const claimed = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-idle-seed", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal((await processCanonicalReminderWakeMessage(claimed.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");
    const cursorBefore = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorBefore);
    const stateBefore = parseCanonicalReminderWakeScheduler(cursorBefore.payload, db.workspaceId);
    assert.ok(stateBefore);
    const statements: string[] = [];
    const observingClient = gatedClient(db.client, {
      before: async (statement) => { statements.push(statement); },
    });
    const idle = await claimCanonicalReminderWakes({ runtime: { client: observingClient, workspaceId: db.workspaceId }, workerId: "p2-idle", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(idle.messages, []);
    assert.equal(idle.continuation, 0);
    assert.ok(statements.some((statement) => statement.toLowerCase().includes("select exists")));
    assert.equal(statements.length, 4, "an already-existing idle cursor uses the measured 3 SETs plus one EXISTS");
    for (const statement of statements) {
      assert.equal(/^(insert|update|delete)\b/u.test(statement.trim().toLowerCase()), false, "idle claim must not write");
    }
    const cursorAfter = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorAfter);
    assert.deepEqual(parseCanonicalReminderWakeScheduler(cursorAfter.payload, db.workspaceId), stateBefore);
    assert.equal(plan.status, "scheduled", "the helper plan object is not used as a write fence");
  } finally {
    await db.close();
  }
});

test("all SKIP LOCKED actor intents still advance lastVisited and the next pass reaches the cold actor", async (t) => {
  const db = await database(t);
  if (!db) return;
  let held: PoolClient | undefined;
  try {
    const actors = Array.from({ length: 26 }, (_, index) => `actor:p2-locked:${String(index).padStart(2, "0")}`);
    const plans = new Map<string, string>();
    for (const [index, actor] of actors.entries()) {
      const target = await seedTask(db, actor);
      const plan = await seedCanonicalPlan(db, actor, target, index);
      plans.set(plan.id, actor);
    }
    held = await db.pool.connect();
    await held.query("begin isolation level serializable");
    const locked = await held.query<{ record_id: string }>(
      `select record_id from orbit_records
       where workspace_id=$1 and collection_name='canonical_reminder_wakes'
         and user_id = any($2::text[]) and payload->>'state'='pending'
       order by user_id collate "C", record_id collate "C"
       for update`,
      [db.workspaceId, actors.slice(0, 25)],
    );
    assert.equal(locked.rows.length, 25);

    const empty = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-locked", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal(empty.claimed, 0, "all selected intents are held by another worker");
    assert.equal(empty.hasMore, true);
    assert.equal(empty.continuation, 1);
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursor);
    const state = parseCanonicalReminderWakeScheduler(cursor.payload, db.workspaceId);
    assert.ok(state);
    assert.equal(state.lastVisitedActorId, actors[24]);
    assert.equal(state.sequence, 1);

    await held.query("rollback");
    const next = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-cold", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal(next.messages.length, 25);
    assert.ok(next.messages.some((message) => plans.get(message.planId) === actors[25]), "the actor after the visited ring is selected next");
  } finally {
    if (held) {
      await held.query("rollback").catch(() => undefined);
      held.release();
    }
    await db.close();
  }
});

test("partial SKIP LOCKED rows are skipped without losing the visited ring, then reclaimed on the next pass", async (t) => {
  const db = await database(t);
  if (!db) return;
  let held: PoolClient | undefined;
  try {
    const actors = Array.from({ length: 26 }, (_, index) => `actor:p2-partial:${String(index).padStart(2, "0")}`);
    const plans = new Map<string, string>();
    for (const [index, actor] of actors.entries()) {
      const target = await seedTask(db, actor);
      const plan = await seedCanonicalPlan(db, actor, target, index);
      plans.set(plan.id, actor);
    }
    held = await db.pool.connect();
    await held.query("begin isolation level serializable");
    const locked = await held.query<{ record_id: string }>(
      `select record_id from orbit_records
       where workspace_id=$1 and collection_name='canonical_reminder_wakes'
         and user_id = any($2::text[]) and payload->>'state'='pending'
       order by user_id collate "C", record_id collate "C"
       for update`,
      [db.workspaceId, actors.slice(0, 3)],
    );
    assert.equal(locked.rows.length, 3);

    const first = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-partial-one", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal(first.claimed, 22, "three locked rows are skipped while the other selected actors are leased");
    assert.equal(first.hasMore, true);
    for (const planId of first.messages.map((message) => message.planId)) assert.notEqual(plans.get(planId), actors[0]);
    assert.equal(first.messages.some((message) => plans.get(message.planId) === actors[1]), false);
    assert.equal(first.messages.some((message) => plans.get(message.planId) === actors[2]), false);
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursor);
    const state = parseCanonicalReminderWakeScheduler(cursor.payload, db.workspaceId);
    assert.ok(state);
    assert.equal(state.lastVisitedActorId, actors[24]);
    assert.equal(state.sequence, 1);

    await held.query("rollback");
    const second = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-partial-two", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.equal(second.claimed, 4, "the next ring includes the three released actors and actor 25");
    assert.deepEqual(new Set(second.messages.map((message) => plans.get(message.planId))), new Set([actors[0], actors[1], actors[2], actors[25]]));
    assert.equal(second.hasMore, false);
  } finally {
    if (held) {
      await held.query("rollback").catch(() => undefined);
      held.release();
    }
    await db.close();
  }
});

test("a lease write failure rolls back both the candidate lease and first cursor initialization", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorId = `actor:p2-lease-rollback:${randomUUID()}`;
    const targetId = await seedTask(db, actorId);
    const plan = await seedCanonicalPlan(db, actorId, targetId, 1);
    const failingClient = gatedClient(db.client, {
      before: async (statement) => {
        const normalized = statement.toLowerCase();
        if (normalized.includes("jsonb_to_recordset") && normalized.includes("'state', 'leased'")) {
          throw new Error("injected lease write failure");
        }
      },
    });
    await assert.rejects(
      claimCanonicalReminderWakes({ runtime: { client: failingClient, workspaceId: db.workspaceId }, workerId: "p2-lease-rollback", now: NOW }),
      /injected lease write failure/,
    );
    const intent = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.ok(intent);
    assert.equal((intent.payload as { state: string }).state, "pending");
    assert.equal((intent.payload as { attempts: number }).attempts, 0);
    const cursor = await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    );
    assert.equal(Number(cursor.rows[0]?.count ?? 0), 0, "cursor initialization is in the same transaction as lease writes");
  } finally {
    await db.close();
  }
});

test("an actual scheduler cursor UPDATE failure rolls back the preceding lease and preserves every existing cursor field", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorOne = "actor:p2-cursor-failure:one";
    const targetOne = await seedTask(db, actorOne);
    const planOne = await seedCanonicalPlan(db, actorOne, targetOne, 1);
    const first = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-cursor-seed", now: NOW, maxActors: 25, maxPlansPerActor: 10 });
    assert.deepEqual(first.messages.map((message) => message.planId), [planOne.id]);
    assert.equal((await processCanonicalReminderWakeMessage(first.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "delivered");
    const cursorBefore = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorBefore);

    const actorTwo = "actor:p2-cursor-failure:two";
    const targetTwo = await seedTask(db, actorTwo);
    const planTwo = await seedCanonicalPlan(db, actorTwo, targetTwo, 2);
    let cursorUpdateExecuted = false;
    const failingClient = gatedClient(db.client, {
      after: async (statement) => {
        const normalized = statement.toLowerCase();
        if (normalized.includes("set payload=$1::jsonb") && normalized.includes("where workspace_id=$3") && normalized.includes("record_id=$4")) {
          cursorUpdateExecuted = true;
          throw new Error("injected post-update scheduler cursor failure");
        }
      },
    });
    await assert.rejects(
      claimCanonicalReminderWakes({ runtime: { client: failingClient, workspaceId: db.workspaceId }, workerId: "p2-cursor-failure", now: NOW }),
      /injected post-update scheduler cursor failure/,
    );
    assert.equal(cursorUpdateExecuted, true, "the database UPDATE must execute before the transaction is failed");
    const intentAfter = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(planTwo.id) });
    assert.ok(intentAfter);
    assert.equal((intentAfter.payload as { state: string }).state, "pending", "the preceding bulk lease is rolled back");
    assert.equal((intentAfter.payload as { attempts: number }).attempts, 0);
    const cursorAfter = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.ok(cursorAfter);
    assert.deepEqual(cursorFields(cursorAfter), cursorFields(cursorBefore), "a failed cursor UPDATE leaves the existing cursor byte-for-byte equivalent");
  } finally {
    await db.close();
  }
});

test("a slow client that exceeds the local wake budget fails without claiming and recovers on the next attempt", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorId = `actor:p2-slow-budget:${randomUUID()}`;
    const targetId = await seedTask(db, actorId);
    const plan = await seedCanonicalPlan(db, actorId, targetId, 1);
    let delayed = false;
    const slowClient: TransactionalPostgresClient = {
      ...db.client,
      transaction: (operation) => db.client.transaction((tx) => operation({
        query: async <TRow = Record<string, unknown>>(statement: string, values?: readonly unknown[]) => {
          const slow = !delayed && statement.toLowerCase().includes("select exists");
          if (slow) delayed = true;
          const slowedStatement = slow ? statement.replace("select exists", "select pg_sleep(4.2), exists") : statement;
          const result = await tx.query<TRow>(slowedStatement, values);
          if (slow) await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
          return result;
        },
      })),
    };
    await assert.rejects(
      claimCanonicalReminderWakes({ runtime: { client: slowClient, workspaceId: db.workspaceId }, workerId: "p2-slow-budget", now: NOW }),
      /transaction budget exceeded/,
    );
    const afterSlow = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.ok(afterSlow);
    assert.equal((afterSlow.payload as { state: string }).state, "pending");
    assert.equal((await db.client.query<{ count: string }>(
      "select count(*) as count from orbit_records where workspace_id=$1 and collection_name='canonical_reminder_wakes' and record_id=$2",
      [db.workspaceId, CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID],
    )).rows[0]?.count, "0");

    const recovered = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-slow-recovery", now: NOW });
    assert.deepEqual(recovered.messages.map((message) => message.planId), [plan.id]);
  } finally {
    await db.close();
  }
});

test("corrupt and out-of-range scheduler state fails closed without claiming the intent", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actorId = "actor:p2-corrupt";
    const targetId = await seedTask(db, actorId);
    const plan = await seedCanonicalPlan(db, actorId, targetId, 1);
    const baseCursor = {
      workspaceId: db.workspaceId,
      collectionName: "canonical_reminder_wakes",
      recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID,
      userId: null,
      sourceType: "system",
      sourceId: db.workspaceId,
      evidenceIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      lifecycleState: "active" as const,
      payload: { version: 1, kind: "wrong-kind", workspaceId: db.workspaceId, lastVisitedActorId: actorId, sequence: 0, updatedAt: NOW },
    };
    await db.store.upsertRecord(baseCursor);
    await assert.rejects(
      claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-corrupt", now: NOW }),
      /scheduler cursor is corrupt/,
    );
    const afterCorrupt = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.equal((afterCorrupt?.payload as { state: string }).state, "pending");

    await db.store.upsertRecord({
      ...baseCursor,
      payload: { version: 1, kind: CANONICAL_REMINDER_WAKE_SCHEDULER_KIND, workspaceId: db.workspaceId, lastVisitedActorId: actorId, sequence: Number.MAX_SAFE_INTEGER, updatedAt: NOW },
    });
    await assert.rejects(
      claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "p2-overflow", now: NOW }),
      /sequence overflow/,
    );
    const afterOverflow = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: canonicalReminderWakeId(plan.id) });
    assert.equal((afterOverflow?.payload as { state: string }).state, "pending", "cursor failure rolls back the candidate lease");
    const cursor = await db.store.getRecord({ workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes", recordId: CANONICAL_REMINDER_WAKE_SCHEDULER_RECORD_ID });
    assert.equal((cursor?.payload as { sequence: number }).sequence, Number.MAX_SAFE_INTEGER);
  } finally {
    await db.close();
  }
});

test("expired leases are fenced and reclaimed, old generations stay stale, and the 25x10 continuation is fair", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const leaseActor = `actor:${randomUUID()}`;
    const leaseTarget = await seedTask(db, leaseActor);
    const leasePlan = await seedCanonicalPlan(db, leaseActor, leaseTarget, 1);
    const firstClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "lease-one", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(firstClaim.messages.length, 1);
    const firstMessage = firstClaim.messages[0]!;
    if (!("leaseEpoch" in firstMessage)) throw new Error("claim did not return a leased wake");
    const expired = await processCanonicalReminderWakeMessage(firstMessage, { client: db.client, workspaceId: db.workspaceId, now: () => "2026-09-17T08:00:00.000Z" });
    assert.equal(expired.outcome, "stale");
    const secondClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "lease-two", now: "2026-09-17T08:00:00.000Z", maxActors: 1, maxPlansPerActor: 1 });
    assert.equal(secondClaim.messages.length, 1);
    const secondMessage = secondClaim.messages[0]!;
    if (!("leaseEpoch" in secondMessage)) throw new Error("reclaim did not return a leased wake");
    assert.ok(secondMessage.leaseEpoch > firstMessage.leaseEpoch);
    assert.equal((await processCanonicalReminderWakeMessage(secondMessage, { client: db.client, workspaceId: db.workspaceId, now: () => "2026-09-17T08:00:00.000Z" })).outcome, "delivered");
    assert.equal(await deliveryCount(db), 1);

    let clock = NOW;
    const generationActor = `actor:${randomUUID()}`;
    const generationTarget = await seedTask(db, generationActor);
    const generationPlan = await seedCanonicalPlan(db, generationActor, generationTarget, 1);
    const oldClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "generation-old", now: NOW, maxActors: 1, maxPlansPerActor: 1 });
    const command = createConfiguredReminderPlanService({ runtime: { client: db.client, workspaceId: db.workspaceId }, now: () => clock, publisher: { publish: async () => undefined } });
    const moved = await command.reschedule({ actorId: generationActor, reminderId: generationPlan.id, fireAt: "2026-09-17T08:01:00.000Z", timeZone: "UTC", expectedUpdatedAt: generationPlan.updatedAt, idempotencyKey: "move-generation" });
    assert.notEqual(moved.fireAt, generationPlan.fireAt);
    assert.equal((await processCanonicalReminderWakeMessage(oldClaim.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => NOW })).outcome, "stale");
    clock = "2026-09-17T08:02:00.000Z";
    const movedClaim = await claimCanonicalReminderWakes({ runtime: { client: db.client, workspaceId: db.workspaceId }, workerId: "generation-new", now: clock, maxActors: 1, maxPlansPerActor: 1 });
    assert.equal((await processCanonicalReminderWakeMessage(movedClaim.messages[0], { client: db.client, workspaceId: db.workspaceId, now: () => clock })).outcome, "delivered");
    assert.equal(await deliveryCount(db), 2);

    const farActor = `actor:${randomUUID()}`;
    const farTarget = await seedTask(db, farActor);
    await seedCanonicalPlan(db, farActor, farTarget, 1, "2030-01-01T00:00:00.000Z");
    const farRuntime = { client: db.client, workspaceId: db.workspaceId, now: () => "2026-09-17T08:02:00.000Z", publisher: { publish: async () => undefined } };
    assert.equal((await repairCanonicalReminderWakes({ runtime: farRuntime, workerId: "far", now: "2026-09-17T08:02:00.000Z" })).wakeClaimed, 0);
    assert.equal((await repairCanonicalReminderWakes({ runtime: { ...farRuntime, now: () => "2030-01-01T00:00:00.000Z" }, workerId: "far", now: "2030-01-01T00:00:00.000Z" })).wakeDelivered, 1);
    assert.equal(await deliveryCount(db), 3);

    const actors = Array.from({ length: 26 }, (_, index) => `actor:fair:${String(index).padStart(2, "0")}`);
    const fairPlanActors = new Map<string, string>();
    const fairPlanLabels = new Map<string, string>();
    for (const [actorIndex, actor] of actors.entries()) {
      const target = await seedTask(db, actor);
      for (let index = 0; index < 11; index += 1) {
        const plan = await seedCanonicalPlan(db, actor, target, actorIndex * 11 + index);
        fairPlanActors.set(plan.id, actor);
        fairPlanLabels.set(plan.id, `${actor}#${index}`);
      }
    }
    const fairRuntime = { client: db.client, workspaceId: db.workspaceId, now: () => NOW, publisher: { publish: async () => undefined } };
    const assertFairBatch = (messages: readonly { planId: string }[]): void => {
      const counts = new Map<string, number>();
      for (const message of messages) {
        const actor = fairPlanActors.get(message.planId);
        assert.ok(actor, "every fair message maps to a seeded actor");
        counts.set(actor, (counts.get(actor) ?? 0) + 1);
      }
      assert.ok(counts.size <= 25, "one pass must cap actors at 25");
      for (const count of counts.values()) assert.ok(count <= 10, "one pass must cap plans per actor at 10");
    };
    let fairTotal = 0;
    let fairPasses = 0;
    let first;
    const fairTrace: Array<{ claimed: number; actorCounts: readonly (readonly [string, number])[]; planIds: readonly string[]; hasMore: boolean; continuation: number }> = [];
    do {
      const claim = await claimCanonicalReminderWakes({ runtime: fairRuntime, workerId: `fair-${fairPasses + 1}`, now: NOW, maxActors: 25, maxPlansPerActor: 10 });
      const actorCounts = new Map<string, number>();
      const planIds = claim.messages.map((message) => {
        const actor = fairPlanActors.get(message.planId);
        assert.ok(actor, "every fair message maps to a seeded actor");
        const label = fairPlanLabels.get(message.planId);
        assert.ok(label, "every fair message maps to a seeded plan");
        actorCounts.set(actor, (actorCounts.get(actor) ?? 0) + 1);
        return label;
      });
      assertFairBatch(claim.messages);
      fairTrace.push({ claimed: claim.claimed, actorCounts: [...actorCounts.entries()], planIds, hasMore: claim.hasMore, continuation: claim.continuation });
      if (fairPasses === 0) {
        first = claim;
        assert.equal(claim.claimed, 250);
        assert.equal(claim.continuation, 1);
      }
      for (const message of claim.messages) {
        assert.equal((await processCanonicalReminderWakeMessage(message, fairRuntime)).outcome, "delivered");
      }
      fairTotal += claim.claimed;
      fairPasses += 1;
      if (claim.claimed === 0) {
        assert.equal(claim.continuation, 0);
        break;
      }
      assert.ok(fairPasses < 6, "fair continuation must converge in bounded passes");
    } while (true);
    assert.ok(first);
    assert.deepEqual(fairTrace.map((pass) => pass.claimed), [250, 34, 2, 0], "26x11 has three non-empty capped passes followed by one empty pass");
    assert.equal(fairPasses, 4);
    const expectedFairActorCounts: readonly (readonly (readonly [string, number])[])[] = [
      actors.slice(0, 25).map((actor): readonly [string, number] => [actor, 10]),
      [[actors[25]!, 10], ...actors.slice(0, 24).map((actor): readonly [string, number] => [actor, 1])],
      [[actors[24]!, 1], [actors[25]!, 1]],
      [],
    ];
    assert.deepEqual(fairTrace.map((pass) => pass.actorCounts), expectedFairActorCounts, "each pass keeps the observed actor ring order and per-actor cap");
    const fairPlanIds = fairTrace.flatMap((pass) => pass.planIds);
    assert.equal(fairPlanIds.length, 286);
    assert.equal(new Set(fairPlanIds).size, 286, "a plan is listed in exactly one fair pass");
    assert.deepEqual(new Set(fairPlanIds), new Set(fairPlanLabels.values()), "the fixed 26x11 plan set is completely drained");
    assert.equal(fairTotal, 286);
    assert.equal(await deliveryCount(db), 289);
    const remaining = await db.store.listRecords({ limit: "unbounded", workspaceId: db.workspaceId, collectionName: "canonical_reminder_wakes" });
    assert.equal(remaining.filter((record) => (record.payload as { state: string }).state === "pending" || (record.payload as { state: string }).state === "leased").length, 0);
    assert.equal(leasePlan.status, "scheduled");
    t.diagnostic(JSON.stringify({ fairPasses: fairTrace.map(({ claimed, actorCounts, planIds, hasMore, continuation }) => ({ claimed, actorCounts, planCount: planIds.length, hasMore, continuation })) }));
  } finally {
    await db.close();
  }
});

test("real wake dispatch visits the cold actor while hot actors continuously replenish", async (t) => {
  const db = await database(t);
  if (!db) return;
  try {
    const actors = Array.from({ length: 26 }, (_, index) => `actor:dispatch-fair:${String(index).padStart(2, "0")}`);
    const targets = new Map<string, string>();
    const planActors = new Map<string, string>();
    for (const [actorIndex, actor] of actors.entries()) {
      const target = await seedTask(db, actor);
      targets.set(actor, target);
      for (let index = 0; index < 11; index += 1) {
        const plan = await seedCanonicalPlan(db, actor, target, actorIndex * 11 + index);
        planActors.set(plan.id, actor);
      }
    }
    const visited = new Set<string>();
    const costs: Array<{ queryCount: number; jsonBytes: number; cumulativeQueryCount: number; cumulativeJsonBytes: number }> = [];
    let cumulativeQueryCount = 0;
    let cumulativeJsonBytes = 0;
    const publisher = { publish: async (message: { planId: string }) => { visited.add(planActors.get(message.planId) ?? "unknown"); } };
    for (let pass = 0; pass < 4 && !visited.has(actors[25]!); pass += 1) {
      if (pass > 0) {
        for (const actor of actors.slice(0, 25)) {
          const target = targets.get(actor)!;
          for (let index = 0; index < 10; index += 1) {
            const plan = await seedCanonicalPlan(db, actor, target, 10_000 + pass * 250 + index, NOW);
            planActors.set(plan.id, actor);
          }
        }
      }
      const observations: Array<{ rows: number; jsonBytes: number }> = [];
      const observingClient = gatedClient(db.client, {
        after: async (_statement, _values, rows) => {
          observations.push({ rows: rows.length, jsonBytes: Buffer.byteLength(JSON.stringify(rows), "utf8") });
        },
      });
      const claim = await claimCanonicalReminderWakes({ runtime: { client: observingClient, workspaceId: db.workspaceId }, workerId: `dispatch-fair-${pass}`, now: NOW, maxActors: 25, maxPlansPerActor: 10 });
      const actorCounts = new Map<string, number>();
      for (const message of claim.messages) {
        const actor = planActors.get(message.planId);
        assert.ok(actor);
        actorCounts.set(actor, (actorCounts.get(actor) ?? 0) + 1);
      }
      assert.ok(actorCounts.size <= 25);
      for (const count of actorCounts.values()) assert.ok(count <= 10);
      const queryCount = observations.length;
      const jsonBytes = observations.reduce((total, observation) => total + observation.jsonBytes, 0);
      cumulativeQueryCount += queryCount;
      cumulativeJsonBytes += jsonBytes;
      costs.push({ queryCount, jsonBytes, cumulativeQueryCount, cumulativeJsonBytes });
      for (const message of claim.messages) {
        await publisher.publish(message);
        const outcome = await processCanonicalReminderWakeMessage(message, { client: db.client, workspaceId: db.workspaceId, now: () => NOW });
        assert.ok(["delivered", "already_delivered"].includes(outcome.outcome));
      }
    }
    assert.ok(visited.has(actors[25]!), "continuous replenishment must not starve the cold actor");
    assert.ok(costs.every((cost) => cost.queryCount > 0));
    assert.ok(costs.every((cost) => cost.jsonBytes >= 0));
    assert.equal(costs.at(-1)?.cumulativeJsonBytes, cumulativeJsonBytes, "cumulative SQL result bytes are tracked separately from each pass");
    assert.equal(costs.at(-1)?.cumulativeQueryCount, cumulativeQueryCount, "cumulative SQL query counts are tracked separately from each pass");
    assert.ok(cumulativeJsonBytes >= costs[0]!.jsonBytes, "cumulative SQL result bytes do not undercount a pass");
    assert.ok(cumulativeQueryCount >= costs.length, "cumulative SQL query count does not undercount a pass");
    assert.deepEqual(costs.map((cost) => cost.queryCount), [14, 12], "hot dispatch records the measured first-init and steady-state SQL counts");
    t.diagnostic(JSON.stringify({ hotCosts: costs }));
  } finally {
    await db.close();
  }
});
