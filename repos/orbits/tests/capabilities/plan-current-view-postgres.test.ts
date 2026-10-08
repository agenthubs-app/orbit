/**
 * W0021 SC-W0021-02（真实 PostgreSQL）：页面读取的「进入新阶段」判定与投影快照。
 *
 * - 东京阶段边界前后各读一次：边界前不进入；边界后第一次打开这次就看到补充的行动与「进入新阶段」记录；
 * - 同一阶段后续读取不再进写事务，语句数与字节都比旧路径（enterCurrentPhase + getCurrent）少；
 * - 同周重新分析出的新计划（新 id）照常执行首次进入；
 * - 并发读取结果一致、只写一次；
 * - API（`GET /api/agent/plans/current`）与计划页 SSR（`readCurrentPlan`）两个入口结果一致；首页 `?view=home` 不读进展记录。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的回环库，随机 schema，用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { readCurrentPlan } from "../../app/(app)/app/agent/plan/read-current-plan";
import { createPlanRouteHandlers } from "../../app/api/agent/plans/route-handlers";
import type { PlanService } from "../../features/plans/contract";
import { runPlanMigrations } from "../../features/plans/migrations";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { AI_PLAN_GENERATOR_ID, createPhaseRefiner, defaultPhaseRefiner } from "../../features/plans/phase-refinement";
import { createPostgresPlanMatchRepository } from "../../features/plans/matching-repository";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository, type PlanPoolLike } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { planInput } from "../support/plan-fixture";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WORKSPACE = "workspace:plan-current-view";
const ALICE = "actor:alice";

interface Meter {
  statements: number;
  bytes: number;
  writes: number;
}

function meteredPool(pool: Pool, meter: Meter): PlanPoolLike {
  return {
    async connect() {
      const client: PoolClient = await pool.connect();
      return {
        async query(text: string, values?: readonly unknown[]) {
          const result = await client.query(text, values as unknown[]);
          meter.statements += 1;
          if (/^\s*(insert|update|delete)/i.test(text)) meter.writes += 1;
          for (const row of result.rows) meter.bytes += Buffer.byteLength(JSON.stringify(row), "utf8");
          return result;
        },
        release: (destroy?: boolean) => client.release(destroy),
      };
    },
  } as unknown as PlanPoolLike;
}

async function withPlansDatabase(run: (pool: Pool) => Promise<void>) {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `plan_view_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 6,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  try {
    await admin.query(`create schema ${schema}`);
    await runPlanMigrations(pool);
    await run(pool);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

function serviceFor(pool: PlanPoolLike, clock: { now: string }): PlanService {
  let tick = 0;
  return createPlanService({
    now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
    phaseRefiner: createPhaseRefiner(createMockPlanGenerator()),
    references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } }),
    repository: createPostgresPlanRepository({ pool }),
    scope: { actorId: ALICE, workspaceId: WORKSPACE },
  });
}

/** 一年期计划（季度段，进入新段时补周级行动），从 2026-09-28（周一）开始：第 14 周 = 2026-12-28（东京）。 */
const YEAR_PLAN = planInput({
  horizon: "year",
  items: [
    { kind: "action", phaseKey: "q1", suggestedWeek: 1, title: "列出 10 位目标客户" },
    { kind: "action", phaseKey: "q2", title: "完成 8 次 20 分钟的交流" },
  ],
  phases: [
    { endWeek: 13, granularity: "quarter", key: "q1", startWeek: 1, title: "摸清需求" },
    { endWeek: 26, granularity: "quarter", key: "q2", startWeek: 14, title: "集中接触" },
    { endWeek: 39, granularity: "quarter", key: "q3", startWeek: 27, title: "推进落地" },
    { endWeek: 52, granularity: "quarter", key: "q4", startWeek: 40, title: "复盘放大" },
  ],
  startsOn: "2026-09-28",
});

async function phaseEnteredRows(pool: Pool, planId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from plan_log where workspace_id = $1 and actor_id = $2 and idempotency_key like $3`,
    [WORKSPACE, ALICE, `phase-entered:${planId}:%`],
  );
  return result.rows[0]!.count;
}

test("phase entry happens on the first read after the Tokyo boundary, never again in the same phase, with fewer statements", databaseTest, async () => {
  await withPlansDatabase(async (pool) => {
    const clock = { now: "2026-09-28T03:00:00.000Z" };
    const meter: Meter = { bytes: 0, statements: 0, writes: 0 };
    const plans = serviceFor(meteredPool(pool, meter), clock);
    const created = await plans.createVersion(YEAR_PLAN);

    // 边界前一刻：东京 12/27 23:59:59（UTC 12/27 14:59:59）还是第 13 周（q1）。
    clock.now = "2026-12-27T14:59:59.000Z";
    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    const before = await plans.getCurrentView();
    assert.equal(meter.writes, 0);
    assert.equal(meter.statements, 5, "begin, plan, items, log, commit — no phase check in phase 1");
    assert.equal(await phaseEnteredRows(pool, created.plan.id), 0);
    const itemsBefore = before!.items.length;

    // 边界：东京 12/28 00:00（UTC 仍是 12/27 15:00）→ 第 14 周（q2）。第一次打开就写入并看到补充的行动。
    clock.now = "2026-12-27T15:00:00.000Z";
    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    const entered = await plans.getCurrentView();
    assert.ok(meter.writes > 0);
    assert.equal(entered!.log[0]!.event, "phase_entered");
    assert.equal(entered!.log[0]!.toStatus, "q2");
    assert.ok(entered!.items.length > itemsBefore, "refined week actions are visible in the same read");
    assert.equal(await phaseEnteredRows(pool, created.plan.id), 1);

    // 同一阶段后续读取：不进写事务，只多一条存在性查询。
    clock.now = "2026-12-29T03:00:00.000Z";
    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    const stable = await plans.getCurrentView();
    const stableMeter = { ...meter };
    assert.equal(stableMeter.writes, 0);
    assert.equal(stableMeter.statements, 6, "begin, plan, phase-entered exists, items, log, commit");
    assert.equal(await phaseEnteredRows(pool, created.plan.id), 1);
    assert.deepEqual(stable, entered);

    // 旧路径（W0017 口径：enterCurrentPhase + getCurrent，两个事务、整行读取）的语句数与字节都更多。
    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    await plans.enterCurrentPhase();
    await plans.getCurrent();
    assert.ok(stableMeter.statements < meter.statements, `${stableMeter.statements} < ${meter.statements}`);
    assert.ok(stableMeter.bytes < meter.bytes, `${stableMeter.bytes} < ${meter.bytes}`);
    console.log(`[W0021 SC-02] stable read: ${stableMeter.statements} statements / ${stableMeter.bytes} B; old path: ${meter.statements} / ${meter.bytes} B`);
  });
});

test("a plan re-analysed in the same week (new plan id) still gets its first phase entry", databaseTest, async () => {
  await withPlansDatabase(async (pool) => {
    const clock = { now: "2026-09-28T03:00:00.000Z" };
    const meter: Meter = { bytes: 0, statements: 0, writes: 0 };
    const plans = serviceFor(meteredPool(pool, meter), clock);
    const v1 = await plans.createVersion(YEAR_PLAN);
    clock.now = "2026-12-28T03:00:00.000Z";
    await plans.getCurrentView();
    assert.equal(await phaseEnteredRows(pool, v1.plan.id), 1);

    // 同一周里换版本（同一个 startsOn）：新计划 id 还没有「已进入」记录，第一次打开照常进入。
    const v2 = await plans.createVersion({ ...YEAR_PLAN, basePlanId: v1.plan.id, goalSnapshot: "新的目标" });
    assert.notEqual(v2.plan.id, v1.plan.id);
    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    const view = await plans.getCurrentView();
    assert.ok(meter.writes > 0);
    assert.equal(view!.plan.id, v2.plan.id);
    assert.equal(view!.log.find((entry) => entry.event === "phase_entered")?.toStatus, "q2");
    assert.equal(await phaseEnteredRows(pool, v2.plan.id), 1);
    assert.equal(await phaseEnteredRows(pool, v1.plan.id), 1);
  });
});

test("concurrent first reads after the boundary agree and write the entry once", databaseTest, async () => {
  await withPlansDatabase(async (pool) => {
    const clock = { now: "2026-09-28T03:00:00.000Z" };
    const meter: Meter = { bytes: 0, statements: 0, writes: 0 };
    const plans = serviceFor(meteredPool(pool, meter), clock);
    const created = await plans.createVersion(YEAR_PLAN);
    clock.now = "2026-12-28T03:00:00.000Z";
    const views = await Promise.all([plans.getCurrentView(), plans.getCurrentView(), plans.getCurrentView(), plans.getCurrentView()]);
    assert.equal(await phaseEnteredRows(pool, created.plan.id), 1);
    for (const view of views.slice(1)) assert.deepEqual(view, views[0]);
    assert.equal(views[0]!.log.filter((entry) => entry.event === "phase_entered").length, 1);
  });
});

test("the API and the plan page SSR read the same snapshot; the home view skips the log", databaseTest, async () => {
  await withPlansDatabase(async (pool) => {
    const clock = { now: "2026-09-28T03:00:00.000Z" };
    const meter: Meter = { bytes: 0, statements: 0, writes: 0 };
    const plans = serviceFor(meteredPool(pool, meter), clock);
    await plans.createVersion(YEAR_PLAN);
    clock.now = "2026-12-29T03:00:00.000Z";
    const resolve = () => ({ mode: "live" as const, service: plans, success: true as const });
    const routes = createPlanRouteHandlers({ resolveActor: async () => ({ id: ALICE }) as never, serviceForActor: resolve as never });

    // 先让 API 入口完成进入（第一次打开），再比较两个入口的稳定读取。
    const first = await (await routes.GET_CURRENT(new Request("http://test/api/agent/plans/current"))).json();
    const ssr = await readCurrentPlan(ALICE, resolve as never);
    assert.notEqual(ssr.snapshot, "unavailable");
    assert.deepEqual(JSON.parse(JSON.stringify(ssr.snapshot)), first.data);
    const api = await (await routes.GET_CURRENT(new Request("http://test/api/agent/plans/current"))).json();
    assert.deepEqual(api.data, first.data);
    assert.equal(await phaseEnteredRows(pool, first.data.plan.id), 1);

    Object.assign(meter, { bytes: 0, statements: 0, writes: 0 });
    const home = await (await routes.GET_CURRENT(new Request("http://test/api/agent/plans/current?view=home"))).json();
    assert.deepEqual(home.data.log, []);
    assert.deepEqual(home.data.items, first.data.items);
    assert.deepEqual(home.data.plan, first.data.plan);
    assert.equal(meter.statements, 5, "begin, plan, phase-entered exists, items, commit");
    // 投影里没有界面用不到的列。
    assert.equal("updatedAt" in home.data.plan, false);
    assert.equal("planId" in home.data.items[0], false);
    assert.equal("idempotencyKey" in first.data.log[0], false);
  });
});

/* ------------------------------------------------------------------ */
/* W0048b SC-03：AI 计划的读取路径 0 次模型调用；补细候选 SQL                   */
/* ------------------------------------------------------------------ */

/** 一份一年期 AI 计划：前 2 段已细化，第 3、4 段是骨架（`analysis.phases[i].detailed = false`、无条目）。 */
const AI_YEAR_PLAN = planInput({
  analysis: {
    generator: AI_PLAN_GENERATOR_ID,
    kind: "plan_bootstrap",
    locale: "zh",
    phases: [
      { detailed: true, followups: [], key: "p1", who: [] },
      { detailed: true, followups: [], key: "p2", who: [] },
      { detailed: false, followups: [], key: "p3", who: [] },
      { detailed: false, followups: [], key: "p4", who: [] },
    ],
  },
  horizon: "year",
  items: [
    { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "列出 10 位目标客户" },
    { kind: "action", phaseKey: "p2", suggestedWeek: 14, title: "完成 8 次 20 分钟的交流" },
  ],
  phases: [
    { endWeek: 13, granularity: "quarter", key: "p1", startWeek: 1, title: "摸清需求" },
    { endWeek: 26, granularity: "quarter", key: "p2", startWeek: 14, title: "集中接触" },
    { endWeek: 39, granularity: "quarter", key: "p3", startWeek: 27, summary: "推进落地", title: "推进落地" },
    { endWeek: 52, granularity: "quarter", key: "p4", startWeek: 40, summary: "复盘放大", title: "复盘放大" },
  ],
  startsOn: "2026-09-28",
});

test("W0048b SC-03: GET current and the plan page SSR on an AI plan make 0 model calls and only log the phase entry", databaseTest, async () => {
  await withPlansDatabase(async (pool) => {
    const clock = { now: "2026-09-28T03:00:00.000Z" };
    const spy = { calls: 0 };
    const mock = createMockPlanGenerator();
    let tick = 0;
    const plans = createPlanService({
      now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
      phaseRefiner: defaultPhaseRefiner({
        id: mock.id,
        phaseDetail: async (input, phase) => {
          spy.calls += 1;
          return mock.phaseDetail(input, phase);
        },
        skeleton: async (input) => {
          spy.calls += 1;
          return mock.skeleton(input);
        },
      }),
      references: createAllowListPlanReferenceValidator({ actorId: ALICE, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository: createPostgresPlanRepository({ pool: pool as unknown as PlanPoolLike }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    const created = await plans.createVersion(AI_YEAR_PLAN);
    clock.now = "2026-12-29T03:00:00.000Z"; // 第 14 周（第 2 段）
    const resolve = () => ({ mode: "live" as const, service: plans, success: true as const });
    const ssr = await readCurrentPlan(ALICE, resolve as never);
    const routes = createPlanRouteHandlers({ resolveActor: async () => ({ id: ALICE }) as never, serviceForActor: resolve as never });
    const api = await (await routes.GET_CURRENT(new Request("http://test/api/agent/plans/current"))).json();
    assert.equal(spy.calls, 0, "opening the page never calls a generator for an AI plan");
    assert.notEqual(ssr.snapshot, "unavailable");
    assert.equal(await phaseEnteredRows(pool, created.plan.id), 1);
    assert.equal(api.data.items.filter((item: { phaseKey: string }) => item.phaseKey === "p2").length, 1, "nothing was refined on read");
    assert.ok(api.data.log.some((entry: { event: string }) => entry.event === "phase_entered"));

    // 补细候选（维护任务用）：第 2 段已开始 → 第 3 段待补；第 4 段的前一阶段还没开始 → 不在列。
    const matching = createPostgresPlanMatchRepository({ pool: pool as never, workspaceId: WORKSPACE });
    const today = "2026-12-29";
    assert.deepEqual(await matching.listActorsNeedingPhaseRefinement!({ aiGeneratorId: AI_PLAN_GENERATOR_ID, limit: 10, today }), [ALICE]);
    const targets = await plans.phaseRefinementTargets();
    assert.deepEqual(targets?.targets, [2]);
    const applied = await plans.applyPhaseRefinement({
      items: [{ kind: "action", phaseKey: "ignored", suggestedWeek: 27, title: "约 3 位采购负责人" }],
      phaseIndex: 2,
      planId: created.plan.id,
    });
    assert.equal(applied.applied, true);
    assert.equal(applied.items[0]!.phaseKey, "p3");
    // 幂等：同一阶段再写不生效；候选里不再出现。
    assert.equal((await plans.applyPhaseRefinement({ items: [], phaseIndex: 2, planId: created.plan.id })).reason, "already_refined");
    assert.deepEqual(await matching.listActorsNeedingPhaseRefinement!({ aiGeneratorId: AI_PLAN_GENERATOR_ID, limit: 10, today }), []);
    assert.equal(await plans.phaseRefinementTargets(), null);
    // mock 计划不在候选里。
    assert.deepEqual(await matching.listActorsNeedingPhaseRefinement!({ aiGeneratorId: "mock-template-v1", limit: 10, today }), []);
  });
});
