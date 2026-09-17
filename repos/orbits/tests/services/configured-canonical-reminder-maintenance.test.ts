import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createConfiguredCanonicalReminderMaintenanceTask, canonicalReminderActorLockKey } from "../../features/notifications/configured-canonical-reminder-maintenance";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";
import type { ReminderChannel } from "../../features/notifications/reminder-plan-contract";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { runMaintenancePass, type MaintenanceTaskOutcome } from "../../features/operations/maintenance/pass";

const NOW = "2026-09-16T02:00:00.000Z";
const context = () => ({ now: () => new Date(NOW), deadline: Date.parse(NOW) + 60_000 });
function counts(value: MaintenanceTaskOutcome): Record<string, number> {
  if ("skipped" in value) throw new Error(`Unexpected skip ${value.skipped}`);
  return value;
}

test("configured canonical reminder task handles missing configuration and exhausted budgets without connecting", async () => {
  const task = createConfiguredCanonicalReminderMaintenanceTask({ env: {} });
  assert.deepEqual(await task.run(context()), { skipped: "database_unconfigured" });
  assert.deepEqual(await task.run({ ...context(), deadline: Date.parse(NOW) }), { skipped: "budget_exhausted" });
});

// Deliberately never load .env or use any application's database URL. These
// transaction/lock tests are allowed only against an explicit local test DB.
const url = process.env.R2_CANONICAL_REMINDER_TEST_DATABASE_URL;
test("canonical in-app maintenance against real local PostgreSQL", { skip: !url }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname), "local database required");
  assert.equal(parsed.pathname, "/orbit_reminder_test");
  const schema = `r2_reminder_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  // The crash test deliberately kills a backend. pg can report the transport
  // shutdown both through the awaited query and an asynchronous pool event.
  const transportErrors: Error[] = [];
  pool.on("error", (error) => { transportErrors.push(error); });
  pool.on("connect", (connection) => {
    connection.on("error", (error) => { transportErrors.push(error); });
  });
  const client = createTransactionalPostgresClient({ connectionString: url!, pool });
  const workspaceId = "workspace:r2-test";
  const store = createPostgresLiveRecordStore({ client });
  const repository = createReminderPlanRepository({ store, workspaceId });
  const reminders = createReminderPlanService({ repository, now: () => NOW });
  const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId }) });
  const task = (override = client) => createConfiguredCanonicalReminderMaintenanceTask({ runtime: { client: override, workspaceId } });
  const run = async (override = client) => counts(await task(override).run(context()));
  async function target(actorId = "actor:a") {
    return (await tasks.create({ actorId, title: "Test target", category: "work", now: NOW, idempotencyKey: actorId })).task.id;
  }
  async function plan(key: string, actorId = "actor:a", channels: readonly ReminderChannel[] = ["in_app"], targetId?: string, fireAt = NOW) {
    return reminders.create({ actorId, channels, targetId: targetId ?? await target(actorId), targetType: "task", fireAt,
      timeZone: "UTC", title: "Test reminder", body: "Local test", deepLink: "/app/tasks/test", createdBy: "user", idempotencyKey: key });
  }
  async function deliveryCount() {
    return Number((await client.query<{ count: string }>("select count(*) as count from orbit_records where collection_name = 'notificationDeliveries'")).rows[0].count);
  }
  function intercept(hook: (tx: TransactionalSqlExecutor, sql: string, values?: readonly unknown[]) => Promise<void>): TransactionalPostgresClient {
    return { ...client, transaction: (operation) => client.transaction((tx) => operation({
      async query<T>(sql: string, values?: readonly unknown[]) {
        await hook(tx, sql, values);
        return tx.query<T>(sql, values);
      },
    })) };
  }
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    t.beforeEach(async () => { await pool.query("truncate orbit_records"); });

    await t.test("SQL excludes future, deleted, archived, foreign ownership, mixed and push plans", async () => {
      const valid = await plan("valid");
      await plan("future", "actor:a", ["in_app"], undefined, "2026-10-16T02:00:00.000Z");
      const mixed = await plan("mixed", "actor:a", ["in_app", "ios_push"]);
      const push = await plan("push", "actor:a", ["ios_push"]);
      for (const state of ["deleted", "archived"]) {
        const p = await plan(state);
        await client.query("update orbit_records set lifecycle_state=$1 where record_id=$2", [state, p.id]);
      }
      const malformed = await plan("wrong-owner");
      await client.query("update orbit_records set payload=jsonb_set(payload,'{entity,ownerUserId}','\"actor:foreign\"') where record_id=$1", [malformed.id]);
      const wrongAccount = await plan("wrong-account");
      await client.query("update orbit_records set payload=jsonb_set(payload,'{entity,accountId}','\"actor:foreign\"') where record_id=$1", [wrongAccount.id]);
      const otherWorkspace = await plan("other-workspace");
      await client.query("update orbit_records set workspace_id='workspace:foreign' where record_id=$1", [otherWorkspace.id]);
      const result = await run();
      assert.equal(result.inAppDelivered, 1);
      assert.equal(result.pushDelivered, 0);
      assert.equal(result.failed, 0);
      assert.equal((await repository.getPlan("actor:a", valid.id))?.status, "delivered");
      for (const p of [mixed, push]) assert.equal((await repository.getPlan("actor:a", p.id))?.status, "scheduled");
      assert.equal(await deliveryCount(), 1);
      assert.equal((await run()).claimed, 0);
      assert.equal((await client.query("select 1 from orbit_records where collection_name='notifications'")).rows.length, 0);
    });

    await t.test("actual SQL bounds each actor at 10 plans and leaves overflow for next heartbeat", async () => {
      for (let i = 0; i < 11; i++) await plan(`a:${i}`);
      await plan("b", "actor:b");
      const result = await run();
      assert.equal(result.actorsScanned, 2);
      assert.equal(result.inAppDelivered, 11);
      assert.equal((await reminders.list({ actorId: "actor:a" })).filter((p) => p.status === "scheduled").length, 1);
      assert.equal((await run()).inAppDelivered, 1);
      assert.equal(await deliveryCount(), 12);
    });

    await t.test("actual SQL returns at most 25 distinct actors", async () => {
      for (let i = 0; i < 26; i++) await plan("one", `actor:${String(i).padStart(2, "0")}`);
      const result = await run();
      assert.equal(result.actorsScanned, 25);
      assert.equal(result.inAppDelivered, 25);
      assert.equal((await run()).inAppDelivered, 1);
    });

    await t.test("invalid target ownership fails only its actor; the pass reports failure", async () => {
      const foreignTask = await target("actor:b");
      const invalid = await plan("foreign-target", "actor:a", ["in_app"], foreignTask);
      await plan("valid", "actor:b");
      const pass = await runMaintenancePass({ tasks: [task()], now: context().now, log() {} });
      assert.equal(pass.failed, 1);
      assert.equal(pass.tasks[0].summary?.actorsFailed, 1);
      assert.equal(pass.tasks[0].summary?.inAppDelivered, 1);
      assert.equal((await repository.getPlan("actor:a", invalid.id))?.status, "scheduled");
      assert.equal(await deliveryCount(), 1);
    });

    await t.test("preferences cannot cross actor boundaries and disabled in-app still honors existing behavior", async () => {
      await plan("disabled");
      await reminders.updatePreferences({ actorId: "actor:a", inAppEnabled: false, iosPushEnabled: true, lockScreenContent: "private",
        quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" } });
      assert.equal((await run()).inAppDelivered, 0);
      assert.equal((await reminders.list({ actorId: "actor:a" }))[0].status, "failed");
      await plan("forged-pref");
      await client.query("update orbit_records set payload=jsonb_set(payload,'{entity,ownerUserId}','\"actor:foreign\"') where collection_name='notificationPreferences'");
      assert.equal((await run()).actorsFailed, 1);
      assert.equal(await deliveryCount(), 0);
    });

    await t.test("owned canonical personal schedule target dispatches through the same service", async () => {
      const schedules = createPersonalScheduleService({ store, workspaceId, now: () => NOW });
      const { scheduleItem } = await schedules.create("actor:a", { title: "Local schedule", startsAt: NOW, idempotencyKey: "schedule" });
      await reminders.create({ actorId: "actor:a", channels: ["in_app"], targetId: `schedule:${scheduleItem.id}`, targetType: "schedule_item",
        fireAt: NOW, timeZone: "UTC", title: "Schedule", body: "Body", deepLink: "/app/schedule", createdBy: "user", idempotencyKey: "schedule" });
      assert.equal((await run()).inAppDelivered, 1);
    });

    await t.test("delivery write then plan failure rolls back the actor and next heartbeat recovers", async () => {
      await plan("rollback");
      const broken = intercept(async (_tx, sql, values) => {
        if (/insert into orbit_records/i.test(sql) && values?.[1] === "reminderPlans") throw new Error("Injected plan write failure");
      });
      assert.equal((await run(broken)).actorsFailed, 1);
      assert.equal(await deliveryCount(), 0);
      assert.equal((await run()).inAppDelivered, 1);
      assert.equal(await deliveryCount(), 1);
    });

    await t.test("backend death releases the transaction lock and rolls back partial delivery", async () => {
      await plan("crash");
      const killed = intercept(async (tx, sql, values) => {
        if (/insert into orbit_records/i.test(sql) && values?.[1] === "reminderPlans") {
          const pid = (await tx.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
          await pool.query("select pg_terminate_backend($1)", [pid]);
        }
      });
      assert.equal((await run(killed)).actorsFailed, 1);
      assert.equal(await deliveryCount(), 0);
      assert.equal((await run()).inAppDelivered, 1);
      assert.ok(transportErrors.every((error) => /terminat/i.test(error.message)));
    });

    await t.test("pre-existing committed in-app delivery repairs scheduled plan without duplication", async () => {
      const p = await plan("old-partial");
      const partialService = createReminderPlanService({ now: () => NOW, repository: {
        ...repository, async savePlan() { throw new Error("Old worker stopped"); },
      } });
      await assert.rejects(partialService.dispatchDue({ now: NOW, provider: { async send() { throw new Error("No sends"); } } }), /Old worker stopped/);
      const before = await reminders.listDeliveries({ actorId: "actor:a" });
      assert.equal(before.length, 1);
      const result = await run();
      assert.equal(result.claimed, 1);
      assert.equal(result.inAppDelivered, 0);
      assert.equal((await repository.getPlan("actor:a", p.id))?.status, "delivered");
      assert.deepEqual(await reminders.listDeliveries({ actorId: "actor:a" }), before);
    });

    await t.test("two independent workers coordinate on the actor transaction, then replay no-ops", async () => {
      await plan("race");
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const held = intercept(async (_tx, sql) => {
        if (/select record_id, user_id, payload/.test(sql)) { entered(); await gate; }
      });
      const first = run(held);
      try {
        await started;
        const second = await run();
        assert.equal(second.actorsFailed, 1);
        assert.equal(second.claimed, 0);
        assert.equal(await deliveryCount(), 0);
      } finally { release(); }
      assert.equal((await first).inAppDelivered, 1);
      assert.equal((await run()).claimed, 0);
      assert.equal(await deliveryCount(), 1);
      assert.notEqual(canonicalReminderActorLockKey("a:b", "c"), canonicalReminderActorLockKey("a", "b:c"));
    });
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
