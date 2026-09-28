/**
 * W0017 SC-01 / SC-03（维护层，注入时钟）：3 个计划日任务在同一个东京自然日内连续多轮 pass 各只真正执行一次
 * （`hasMore` 续批除外），跨东京午夜（UTC 15:00）后再次执行；当天已完成时一轮 pass 只有一次当日状态读取；
 * 运行失败不记为完成、下一轮重试，当天满上限后不再重试。
 *
 * 存储用内存实现，语义与 `createPostgresPlanDailyRunStore` 相同（跨实例并发与租约过期在
 * `tests/capabilities/plan-maintenance-daily-gate-postgres.test.ts` 用真实 PostgreSQL 证明）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runMaintenancePass, type MaintenanceTask } from "../../features/operations/maintenance/pass";
import {
  createPlanEventAttendanceMaintenanceTask,
  PLAN_EVENT_ATTENDANCE_TASK,
} from "../../features/plans/event-attendance-reconcile";
import {
  createPlanEventRegistrationMaintenanceTask,
  PLAN_EVENT_REGISTRATION_TASK,
} from "../../features/plans/event-registration-reconcile";
import {
  createPlanDailyRunGate,
  PLAN_DAILY_RUN_MAX_FAILURES,
  type PlanDailyRunState,
  type PlanDailyRunStore,
} from "../../features/plans/maintenance-daily-gate";
import { createPlanPhaseMaintenanceTask, PLAN_PHASE_TASK } from "../../features/plans/phase-refinement";
import { planTokyoDate } from "../../features/plans/week";

const TASKS = [PLAN_EVENT_ATTENDANCE_TASK, PLAN_PHASE_TASK, PLAN_EVENT_REGISTRATION_TASK];

interface Row {
  status: PlanDailyRunState["status"];
  leaseToken: string | null;
  leaseExpiresAt: number;
  cursor: string | null;
  failures: number;
}

/** 与 PostgreSQL 实现同一语义的内存存储；`calls` 记录每次存储读写（= 一次 SQL）。 */
function memoryStore(clock: { now: number }) {
  const rows = new Map<string, Row>();
  const calls: string[] = [];
  const key = (day: string, task: string) => `${day}|${task}`;
  const store: PlanDailyRunStore = {
    async readDay({ day, taskNames }) {
      calls.push("readDay");
      const result = new Map<string, PlanDailyRunState>();
      for (const task of taskNames) {
        const row = rows.get(key(day, task));
        if (row) result.set(task, { leaseActive: row.status === "running" && row.leaseExpiresAt > clock.now, status: row.status });
      }
      return result;
    },
    async claim({ day, leaseSeconds, leaseToken, taskName }) {
      calls.push("claim");
      const row = rows.get(key(day, taskName));
      if (row && !(row.status === "pending" || (row.status === "running" && row.leaseExpiresAt <= clock.now))) return null;
      const next: Row = row ?? { cursor: null, failures: 0, leaseExpiresAt: 0, leaseToken: null, status: "pending" };
      Object.assign(next, { leaseExpiresAt: clock.now + leaseSeconds * 1000, leaseToken, status: "running" });
      rows.set(key(day, taskName), next);
      return { cursor: next.cursor };
    },
    async release({ day, leaseToken, maxFailures, result, taskName }) {
      calls.push("release");
      const row = rows.get(key(day, taskName));
      if (!row || row.status !== "running" || row.leaseToken !== leaseToken) return false;
      row.leaseToken = null;
      if (result.kind === "completed") Object.assign(row, { cursor: null, status: "completed" });
      else if (result.kind === "continue") Object.assign(row, { cursor: result.cursor, status: "pending" });
      else {
        row.failures += 1;
        row.status = row.failures >= maxFailures ? "failed" : "pending";
      }
      return true;
    },
  };
  return { calls, rows, store };
}

/** 3 个真实的计划日任务，业务依赖都是计数的假实现。 */
function dailyTasks(clock: { now: number }, options: { phaseActors?: string[][]; failPhase?: () => boolean } = {}) {
  const businessQueries: string[] = [];
  const phaseBatches = options.phaseActors ?? [[]];
  const { calls, rows, store } = memoryStore(clock);
  let seq = 0;
  const gate = createPlanDailyRunGate({
    id: () => `lease-${++seq}`,
    resolveStore: () => store,
    taskNames: TASKS,
    tokyoDate: planTokyoDate,
  });
  const planService = {
    async enterCurrentPhase() {
      return { entered: null, refined: [] };
    },
    async markEventAttended() {
      return { logs: [] };
    },
  } as never;
  const tasks: MaintenanceTask[] = [
    createPlanEventAttendanceMaintenanceTask({
      gate,
      resolve: () => ({
        planServiceFor: () => planService,
        repository: {
          async listUnattendedAttributedEvents() {
            businessQueries.push(PLAN_EVENT_ATTENDANCE_TASK);
            return [];
          },
        },
      }),
    }),
    createPlanPhaseMaintenanceTask({
      gate,
      limit: 2,
      resolve: () => ({
        async listActorsEnteringPhase({ afterActorId }) {
          businessQueries.push(`${PLAN_PHASE_TASK}:${afterActorId ?? "start"}`);
          if (options.failPhase?.()) throw new Error("database down");
          const index = businessQueries.filter((entry) => entry.startsWith(PLAN_PHASE_TASK)).length - 1;
          return phaseBatches[Math.min(index, phaseBatches.length - 1)] ?? [];
        },
        planServiceFor: () => planService,
      }),
      tokyoDate: planTokyoDate,
    }),
    createPlanEventRegistrationMaintenanceTask({
      gate,
      resolve: () => ({
        async listActiveEventItems() {
          businessQueries.push(PLAN_EVENT_REGISTRATION_TASK);
          return [];
        },
        planServiceFor: () => planService,
        async readRegistrations() {
          businessQueries.push("readRegistrations");
          return [];
        },
      }),
    }),
  ];
  const pass = () =>
    runMaintenancePass({ log: () => undefined, now: () => new Date(clock.now), tasks });
  return { businessQueries, calls, pass, rows };
}

const at = (iso: string) => Date.parse(iso);

test("SC-W0017-01: repeated passes on one Tokyo day run each daily task once; the Tokyo midnight (UTC 15:00) starts a new day", async () => {
  const clock = { now: at("2026-10-01T03:00:00.000Z") }; // 12:00 JST
  const { businessQueries, pass } = dailyTasks(clock);

  const first = await pass();
  assert.deepEqual(
    first.tasks.map((task) => [task.name, task.status]),
    TASKS.map((name) => [name, "ok"]),
  );
  assert.deepEqual(businessQueries, [PLAN_EVENT_ATTENDANCE_TASK, `${PLAN_PHASE_TASK}:start`, PLAN_EVENT_REGISTRATION_TASK]);

  // 同一东京日：10 分钟一轮，直到 14:59:59 UTC（23:59:59 JST），业务查询一次也不再发生。
  for (const iso of ["2026-10-01T03:10:00.000Z", "2026-10-01T09:00:00.000Z", "2026-10-01T14:59:59.000Z"]) {
    clock.now = at(iso);
    const later = await pass();
    assert.deepEqual(later.tasks.map((task) => [task.name, task.status, task.reason]), TASKS.map((name) => [name, "skipped", "done_today"]));
  }
  assert.equal(businessQueries.length, 3);

  // 15:00 UTC = 次日 00:00 JST：每个任务再真正执行一次，之后同一天又不再执行。
  clock.now = at("2026-10-01T15:00:00.000Z");
  await pass();
  assert.equal(businessQueries.length, 6);
  clock.now = at("2026-10-01T15:10:00.000Z");
  await pass();
  assert.equal(businessQueries.length, 6);
});

test("SC-W0017-01: a capped batch (hasMore) continues from its cursor the same day, then the day is done", async () => {
  const clock = { now: at("2026-10-01T03:00:00.000Z") };
  const { businessQueries, pass, rows } = dailyTasks(clock, { phaseActors: [["actor:a", "actor:b"], ["actor:c"]] });
  const first = await pass();
  assert.equal(first.tasks.find((task) => task.name === PLAN_PHASE_TASK)?.summary?.hasMore, 1);
  assert.deepEqual(rows.get(`2026-10-01|${PLAN_PHASE_TASK}`), {
    cursor: "actor:b", failures: 0, leaseExpiresAt: rows.get(`2026-10-01|${PLAN_PHASE_TASK}`)!.leaseExpiresAt, leaseToken: null, status: "pending",
  });
  clock.now = at("2026-10-01T03:10:00.000Z");
  const second = await pass();
  assert.equal(second.tasks.find((task) => task.name === PLAN_PHASE_TASK)?.summary?.hasMore, 0);
  clock.now = at("2026-10-01T03:20:00.000Z");
  await pass();
  assert.deepEqual(
    businessQueries.filter((entry) => entry.startsWith(PLAN_PHASE_TASK)),
    [`${PLAN_PHASE_TASK}:start`, `${PLAN_PHASE_TASK}:actor:b`],
  );
  assert.equal(rows.get(`2026-10-01|${PLAN_PHASE_TASK}`)?.status, "completed");
});

test("SC-W0017-03: once the day is done, a pass touches the store once for all three daily tasks and runs no business query", async () => {
  const clock = { now: at("2026-10-01T03:00:00.000Z") };
  const { businessQueries, calls, pass } = dailyTasks(clock);
  await pass();
  assert.deepEqual(calls, ["readDay", "claim", "release", "claim", "release", "claim", "release"]);
  calls.length = 0;
  businessQueries.length = 0;
  clock.now = at("2026-10-01T03:10:00.000Z");
  await pass();
  assert.deepEqual(calls, ["readDay"]);
  assert.deepEqual(businessQueries, []);
});

test("SC-W0017-02 (logic): a failed run is not recorded as done and retries next pass, up to the daily cap", async () => {
  const clock = { now: at("2026-10-01T03:00:00.000Z") };
  let failing = true;
  const { businessQueries, pass, rows } = dailyTasks(clock, { failPhase: () => failing });
  const phaseRuns = () => businessQueries.filter((entry) => entry.startsWith(PLAN_PHASE_TASK)).length;
  const phaseResult = async () => (await pass()).tasks.find((task) => task.name === PLAN_PHASE_TASK)!;

  assert.equal((await phaseResult()).status, "failed");
  assert.equal(rows.get(`2026-10-01|${PLAN_PHASE_TASK}`)?.status, "pending");
  clock.now += 600_000;
  failing = false;
  assert.equal((await phaseResult()).status, "ok");
  assert.equal(phaseRuns(), 2);
  assert.equal(rows.get(`2026-10-01|${PLAN_PHASE_TASK}`)?.status, "completed");

  // 次日一直失败：满上限后当天不再重试（不会每 10 分钟都来一次）。
  failing = true;
  clock.now = at("2026-10-02T03:00:00.000Z");
  for (let attempt = 0; attempt < PLAN_DAILY_RUN_MAX_FAILURES; attempt += 1) {
    assert.equal((await phaseResult()).status, "failed");
    clock.now += 600_000;
  }
  const capped = await phaseResult();
  assert.deepEqual([capped.status, capped.reason], ["skipped", "failed_today"]);
  assert.equal(phaseRuns(), 2 + PLAN_DAILY_RUN_MAX_FAILURES);
});

test("without a gate the tasks keep their per-call behaviour (tests and direct callers)", async () => {
  let listed = 0;
  const task = createPlanPhaseMaintenanceTask({
    resolve: () => ({
      async listActorsEnteringPhase() {
        listed += 1;
        return [];
      },
      planServiceFor: () => ({}) as never,
    }),
    tokyoDate: planTokyoDate,
  });
  const context = { deadline: Date.now() + 10_000, now: () => new Date() };
  assert.deepEqual(await task.run(context), { entered: 0, examined: 0, failed: 0 });
  assert.deepEqual(await task.run(context), { entered: 0, examined: 0, failed: 0 });
  assert.equal(listed, 2);
});

test("an unmigrated gate table (42P01) falls back to running the task, flagged as ungated", async () => {
  const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
  const gate = createPlanDailyRunGate({
    resolveStore: () => ({
      readDay: async () => {
        throw missing;
      },
      claim: async () => null,
      release: async () => false,
    }),
    taskNames: TASKS,
    tokyoDate: planTokyoDate,
  });
  const task = createPlanPhaseMaintenanceTask({
    gate,
    resolve: () => ({ listActorsEnteringPhase: async () => [], planServiceFor: () => ({}) as never }),
    tokyoDate: planTokyoDate,
  });
  assert.deepEqual(await task.run({ deadline: Date.now() + 10_000, now: () => new Date() }), {
    entered: 0,
    examined: 0,
    failed: 0,
    ungated: 1,
  });
});
