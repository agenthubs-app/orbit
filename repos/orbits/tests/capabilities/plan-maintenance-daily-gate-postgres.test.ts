/**
 * W0017 SC-02 / SC-03（真实 PostgreSQL，本机 `orbit_test`）：计划日任务的逐任务、按东京日持久领取带租约——
 * 两个实例同时触发只有一个执行；执行中崩溃，租约过期后可重新领取；运行失败不记为完成，下一轮重试。
 * 当天已完成时，一轮 pass 对 3 个日任务合计只有 1 次轻查询；`plan-match` 空闲时只有 1 次 due-claim 语句，
 * 实测返回字节。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Pool } from "pg";

import { runMaintenancePass, type MaintenanceTask } from "../../features/operations/maintenance/pass";
import { createPlanEventAttendanceMaintenanceTask } from "../../features/plans/event-attendance-reconcile";
import { createPlanEventRegistrationMaintenanceTask } from "../../features/plans/event-registration-reconcile";
import {
  createPlanDailyRunGate,
  createPostgresPlanDailyRunStore,
  PLAN_DAILY_RUN_MAX_FAILURES,
  type PlanDailyBatch,
} from "../../features/plans/maintenance-daily-gate";
import { createPlanMatchMaintenanceTask } from "../../features/plans/match-maintenance-task";
import { createPostgresPlanMatchRepository, type PlanMatchQueryClient } from "../../features/plans/matching-repository";
import { createPlanPhaseMaintenanceTask } from "../../features/plans/phase-refinement";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { planTokyoDate } from "../../features/plans/week";
import { createPostgresReadMetricsRunner, type PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";
import { planInput } from "../support/plan-fixture";
import { ALICE, BOB, databaseTest, withMatchingDatabase, WORKSPACE } from "../support/plan-matching-harness";

const TASK = "plan-phase";
const TASKS = ["plan-event-attendance", "plan-phase", "plan-event-registration"];
const NOON_JST = new Date("2026-10-01T03:00:00.000Z");

function context(now = NOON_JST) {
  return { deadline: now.getTime() + 60_000, now: () => now };
}

function gateOn(pool: PlanMatchQueryClient, id?: () => string) {
  return createPlanDailyRunGate({
    id,
    resolveStore: () => createPostgresPlanDailyRunStore({ pool, workspaceId: WORKSPACE }),
    taskNames: TASKS,
    tokyoDate: planTokyoDate,
  });
}

/** 活动引用走允许列表（夹具库里没有活动主数据），其余与生产的计划服务相同。 */
function plansFor(pool: Pool, actorId: string) {
  return createPlanService({
    references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
    repository: createPostgresPlanRepository({ pool }),
    scope: { actorId, workspaceId: WORKSPACE },
  });
}

const done: PlanDailyBatch = { cursor: null, hasMore: false, summary: { examined: 0 } };

async function runRow(pool: Pool, day = "2026-10-01", task = TASK) {
  const result = await pool.query(
    `select status, cursor, run_count, failure_count, lease_token is not null as leased
       from plan_maintenance_daily_runs where workspace_id = $1 and run_day = $2::date and task_name = $3`,
    [WORKSPACE, day, task],
  );
  return result.rows[0] as { status: string; cursor: string | null; run_count: number; failure_count: number; leased: boolean } | undefined;
}

test("SC-W0017-02: cron and the queue heartbeat firing together run the daily task once", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    let executions = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = async () => {
      executions += 1;
      await held;
      return done;
    };
    // 两个实例：各自的把关与存储对象（不共享任何内存），同一个库。
    const cron = gateOn(pool).run(TASK, context(), execute);
    const heartbeat = gateOn(pool).run(TASK, context(), execute);
    const settled = await Promise.race([
      Promise.all([cron, heartbeat]),
      new Promise((resolve) => setTimeout(resolve, 300, "waiting")),
    ]);
    assert.equal(settled, "waiting");
    release();
    const outcomes = await Promise.all([cron, heartbeat]);
    assert.equal(executions, 1);
    assert.deepEqual(outcomes.filter((outcome) => "skipped" in outcome), [{ skipped: "claimed_elsewhere" }]);
    assert.deepEqual(await runRow(pool), { cursor: null, failure_count: 0, leased: false, run_count: 1, status: "completed" });

    // 并发领取本身：8 个同时发起，只有 1 个拿到租约。
    const store = createPostgresPlanDailyRunStore({ pool, workspaceId: WORKSPACE });
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        store.claim({ day: "2026-10-02", leaseSeconds: 300, leaseToken: `lease-${index}`, taskName: TASK }),
      ),
    );
    assert.equal(claims.filter(Boolean).length, 1);
  });
});

test("SC-W0017-02: a crashed run keeps its lease until it expires, then the next pass reclaims it from the saved cursor", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    let executions = 0;
    const cursors: Array<string | null> = [];
    // 第一批到上限：留下 cursor，当天续批。
    assert.deepEqual(
      await gateOn(pool).run(TASK, context(), async (cursor) => {
        cursors.push(cursor);
        return { cursor: "actor:m", hasMore: true, summary: { examined: 50 } };
      }),
      { examined: 50, hasMore: 1 },
    );
    // 续批的实例领到后崩溃：只领取、不释放（进程消失）。
    const store = createPostgresPlanDailyRunStore({ pool, workspaceId: WORKSPACE });
    assert.deepEqual(await store.claim({ day: "2026-10-01", leaseSeconds: 300, leaseToken: "crashed", taskName: TASK }), { cursor: "actor:m" });

    const execute = async (cursor: string | null) => {
      executions += 1;
      cursors.push(cursor);
      return done;
    };
    assert.deepEqual(await gateOn(pool).run(TASK, context(), execute), { skipped: "claimed_elsewhere" });
    assert.equal(executions, 0);

    await pool.query(`update plan_maintenance_daily_runs set lease_expires_at = now() - interval '1 second' where lease_token = 'crashed'`);
    assert.deepEqual(await gateOn(pool).run(TASK, context(), execute), { examined: 0, hasMore: 0 });
    assert.equal(executions, 1);
    assert.deepEqual(cursors, [null, "actor:m"]);
    // 崩溃实例迟到的释放不能覆盖接手者的结果。
    assert.equal(await store.release({ day: "2026-10-01", leaseToken: "crashed", maxFailures: 3, result: { kind: "failed" }, taskName: TASK }), false);
    assert.deepEqual(await runRow(pool), { cursor: null, failure_count: 0, leased: false, run_count: 3, status: "completed" });
  });
});

test("SC-W0017-02: a failed run is not recorded as done, retries next pass, and stops for the day at the cap", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    let attempts = 0;
    const failing = async (): Promise<PlanDailyBatch> => {
      attempts += 1;
      throw new Error("statement timeout");
    };
    await assert.rejects(gateOn(pool).run(TASK, context(), failing), /statement timeout/);
    assert.deepEqual(await runRow(pool), { cursor: null, failure_count: 1, leased: false, run_count: 1, status: "pending" });
    assert.deepEqual(await gateOn(pool).run(TASK, context(), async () => done), { examined: 0, hasMore: 0 });
    assert.equal((await runRow(pool))?.status, "completed");

    // 第二天一直失败：满上限记 failed，之后当天不再执行。
    const nextDay = new Date("2026-10-02T03:00:00.000Z");
    for (let index = 0; index < PLAN_DAILY_RUN_MAX_FAILURES; index += 1) {
      await assert.rejects(gateOn(pool).run(TASK, context(nextDay), failing));
    }
    assert.deepEqual(await gateOn(pool).run(TASK, context(nextDay), failing), { skipped: "failed_today" });
    assert.equal(attempts, 1 + PLAN_DAILY_RUN_MAX_FAILURES);
    assert.equal((await runRow(pool, "2026-10-02"))?.status, "failed");
  });
});

/** 计数 + 读取计量的查询客户端（计量用生产同一个 `createPostgresReadMetricsRunner`）。 */
function meteredClient(pool: Pool) {
  const statements: Array<{ sql: string; rows: number }> = [];
  const metrics: PostgresReadMetric[] = [];
  const runner = createPostgresReadMetricsRunner({ observer: (metric) => void metrics.push(metric) }, {})!;
  const client: PlanMatchQueryClient = {
    async query(text, values) {
      const result = await runner(text, () => pool.query(text, values as unknown[]));
      statements.push({ rows: result.rows.length, sql: text.trim().split(/\s+/).slice(0, 3).join(" ") });
      return result as never;
    },
  };
  return { client, metrics, statements };
}

test("SC-W0017-03: once today is done a pass reads the database once for the three daily tasks; idle plan-match is the W0050 backfill scan plus one due-claim, both returning 0 rows", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    const planServiceFor = (actorId: string) => plansFor(pool, actorId);
    // 真实数据：alice 与 bob 各一份计划（含一场活动），alice 的联系人记着「在这场活动认识」。
    await planServiceFor(ALICE).createVersion(planInput());
    await planServiceFor(BOB).createVersion(planInput());
    await pool.query(
      `update orbit_records set payload = payload || '{"metEventId":"event:tokyo-saas-night"}'::jsonb where record_id = 'contact:saas'`,
    );
    const metered = meteredClient(pool);
    const repository = createPostgresPlanMatchRepository({ pool: metered.client, workspaceId: WORKSPACE });
    const gate = gateOn(metered.client);
    let registrationReads = 0;
    let planWrites = 0;
    const countedService = (actorId: string) => {
      const service = planServiceFor(actorId);
      return new Proxy(service, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            planWrites += 1;
            return value.apply(target, args);
          };
        },
      });
    };
    const tasks = (): MaintenanceTask[] => [
      createPlanMatchMaintenanceTask({ resolveWorker: () => ({ aiMatcher: null, repository }) }),
      createPlanEventAttendanceMaintenanceTask({ gate, resolve: () => ({ planServiceFor: countedService, repository }) }),
      createPlanPhaseMaintenanceTask({
        gate,
        resolve: () => ({ listActorsEnteringPhase: (input) => repository.listActorsEnteringPhase(input), planServiceFor: countedService }),
        tokyoDate: planTokyoDate,
      }),
      createPlanEventRegistrationMaintenanceTask({
        gate,
        resolve: () => ({
          listActiveEventItems: (input) => repository.listActiveEventItems(input),
          planServiceFor: countedService,
          async readRegistrations() {
            registrationReads += 1;
            return [];
          },
        }),
      }),
    ];

    const first = await runMaintenancePass({ log: () => undefined, now: () => NOON_JST, tasks: tasks() });
    assert.deepEqual(first.tasks.map((task) => task.status), ["ok", "ok", "ok", "ok"]);
    assert.equal(first.tasks[1]!.summary?.marked, 1, "the attendance reconcile really ran");
    assert.ok(registrationReads >= 1);

    for (const minutes of [10, 20]) {
      metered.statements.length = 0;
      metered.metrics.length = 0;
      registrationReads = 0;
      planWrites = 0;
      const now = new Date(NOON_JST.getTime() + minutes * 60_000);
      const later = await runMaintenancePass({ log: () => undefined, now: () => now, tasks: tasks() });
      assert.deepEqual(later.tasks.map((task) => task.reason ?? task.status), ["ok", "done_today", "done_today", "done_today"]);
      assert.deepEqual(metered.statements.map((statement) => statement.sql), [
        "/* plan-match:enqueue-missing-plan */", // W0050（insert … select，空闲时 0 行、不计入读取计量）（D46③）：每轮先补入队缺 'plan' 任务的生效计划；都已入队时返回 0 行
        "update plan_match_jobs set", // plan-match：空闲时一条 due-claim，返回 0 行
        "select task_name, status,", // 3 个日任务合计一次当日状态读取
      ]);
      assert.equal(metered.statements[0]!.rows, 0);
      assert.equal(metered.statements[1]!.rows, 0);
      assert.equal(registrationReads + planWrites, 0);
      // 读取计量：空的 DML 没有返回行，不计入；日任务的状态读取返回 3 行小记录。
      assert.deepEqual(metered.metrics.map((metric) => [metric.queryKind, metric.returnedRows]), [["select", 3]]);
      assert.ok(metered.metrics[0]!.approximateSerializedRowBytes < 300, `status read returned ${metered.metrics[0]!.approximateSerializedRowBytes} bytes`);
    }
  });
});

test("SC-W0017-01 (PostgreSQL): the registration sweep pages in a fixed order so one day covers every item", databaseTest, async () => {
  await withMatchingDatabase(async ({ pool }) => {
    const planServiceFor = (actorId: string) => plansFor(pool, actorId);
    await planServiceFor(ALICE).createVersion(planInput());
    await planServiceFor(BOB).createVersion(planInput());
    const repository = createPostgresPlanMatchRepository({ pool, workspaceId: WORKSPACE });
    const first = await repository.listActiveEventItems({ limit: 1 });
    assert.equal(first[0]?.actorId, ALICE);
    const second = await repository.listActiveEventItems({ after: first[0], limit: 1 });
    assert.equal(second[0]?.actorId, BOB);
    assert.deepEqual(await repository.listActiveEventItems({ after: second[0], limit: 1 }), []);
    assert.deepEqual(await repository.listActorsEnteringPhase({ limit: 10, today: "2026-10-26" }), [ALICE, BOB]);
    assert.deepEqual(await repository.listActorsEnteringPhase({ afterActorId: ALICE, limit: 10, today: "2026-10-26" }), [BOB]);
  });
});
