/**
 * W0050 SC-01 主证据（真实 PostgreSQL，`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）：`loadOpportunitiesTab`。
 *
 * 夹具：生效计划正处阶段边界（「进入新阶段」还没写）、2 条需求（targetCount 2 与缺省 1）、共关联 3 人；
 * 快照已生成且新增 3 位联系人后判定为「自动重算」；有一位 dormant 且与目标相关的联系人；生效计划还没有 'plan' 匹配任务。
 *
 * - 覆盖度 = round(Σmin(a,t)/Σt) = round((2 + 1) / 3) = 100%，每行「已有 a／还缺 b」；
 * - 整个加载对**任何表** 0 次 INSERT／UPDATE／DELETE（statement 级触发器按表计数，含 network_analysis_jobs 与
 *   plan_match_jobs）；计划生成器（阶段补细器）0 次解析、快照生成器 0 次、付费 AI 主机 0 次请求；
 * - 对照：同一夹具上 W0048a 默认 `readView` 确实会排队（证明夹具处在「自动重算」），`getCurrentView` 确实会写（阶段边界）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadOpportunitiesTab, readDormantCandidates, type OpportunitiesTabLoaderDeps } from "../../app/(app)/app/contacts/analysis/opportunities-route-service";
import { readEvidenceContactNames } from "../../features/network-analysis/evidence-contacts";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import type { PlanService } from "../../features/plans/contract";
import { createPostgresPlanMatchRepository } from "../../features/plans/matching-repository";
import { createPlanMatchingService } from "../../features/plans/matching-service";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, BOB, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z");

function countingGenerator(): NetworkSnapshotGenerator & { calls: number } {
  const generator = {
    billable: true, calls: 0, model: "fake-model", promptVersion: "test-v1", provider: "deepseek" as const,
    async generate(input: SnapshotInput) {
      generator.calls += 1;
      return { content: buildMockSnapshotContent(input), usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return generator;
}

/** 给 schema 里每张表装一个 statement 级写入计数触发器（INSERT／UPDATE／DELETE，即使影响 0 行也计）。 */
async function installWriteCounter(harness: NetworkHarness) {
  await harness.pool.query(`create table w50_write_log (table_name text not null, op text not null)`);
  await harness.pool.query(`create function w50_count_write() returns trigger language plpgsql as $$ begin insert into w50_write_log values (TG_TABLE_NAME, TG_OP); return null; end $$`);
  const tables = (await harness.pool.query(`select tablename from pg_tables where schemaname = $1 and tablename <> 'w50_write_log'`, [harness.schema])).rows.map((row) => String(row.tablename));
  for (const table of tables) {
    await harness.pool.query(`create trigger w50_count after insert or update or delete on ${table} for each statement execute function w50_count_write()`);
  }
  return {
    tables,
    async reset() { await harness.pool.query(`truncate w50_write_log`); },
    async byTable() {
      return (await harness.pool.query(`select table_name, op, count(*)::int as n from w50_write_log group by 1, 2 order by 1, 2`)).rows as Array<{ table_name: string; op: string; n: number }>;
    },
  };
}

function guardedPlanService(harness: NetworkHarness, refinements: { count: number }): { service: PlanService; raw: PlanService } {
  const raw = createPlanService({
    now: () => NOW.toISOString(),
    phaseRefiner: async () => { refinements.count += 1; return { inserts: [], weekUpdates: [] }; },
    references: createPostgresPlanReferenceValidator({ actorId: ALICE, client: harness.pool, eventCore: null, workspaceId: WORKSPACE }),
    repository: createPostgresPlanRepository({ pool: harness.pool }),
    scope: { actorId: ALICE, workspaceId: WORKSPACE },
  });
  return {
    raw,
    service: {
      ...raw,
      enterCurrentPhase: async () => { throw new Error("enterCurrentPhase must not be called"); },
      getCurrentView: async () => { throw new Error("getCurrentView must not be called"); },
    },
  };
}

function countPaidFetch(t: { after: (fn: () => void) => void }) {
  const original = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : (input as Request).url;
    if (PAID_AI_HOSTS.includes(new URL(url).hostname)) hits.push(url);
    return original(input as never, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  return hits;
}

async function insertDormantStrength(harness: NetworkHarness, actorId: string, contactId: string) {
  await harness.insertRecord({
    collection: "relationship_strengths",
    id: `relationship-strength:${actorId}:${contactId}`,
    payload: {
      computedAt: NOW.toISOString(), contactId, dormant: true, lastSignalAt: "2026-07-01T03:00:00.000Z", peakScore: 60, rulesVersion: "rs-2026-10-v1", score: 30,
      signals: [
        { basePoints: 10, occurredAt: "2026-05-01T03:00:00.000Z", points: 3, source: "capture", timelineItemId: `capture:${contactId}` },
        { basePoints: 20, occurredAt: "2026-07-01T03:00:00.000Z", points: 10, source: "memo", timelineItemId: `memo:${contactId}:1` },
      ],
      tier: "active",
    },
    userId: actorId,
  });
}

test("SC-01 main: at a phase boundary with an auto-recompute due, opening the opportunities tab computes rule coverage and writes nothing to any table, resolves no generator and calls no paid AI", databaseTest, async (t) => {
  const paid = countPaidFetch(t);
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 5; index += 1) {
      await harness.addContact(ALICE, `${ALICE}:c${index}`, { primaryIndustryId: index < 3 ? "technology_internet" : "finance_investment", role: index === 4 ? "Partner" : "Manager" });
    }
    await harness.addContact(BOB, `${BOB}:c0`, { primaryIndustryId: "finance_investment" });
    const generator = countingGenerator();
    const refinements = { count: 0 };
    const plans = guardedPlanService(harness, refinements);
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator,
      now: () => NOW,
      readCurrentPlan: async () => plans.service.getCurrent(),
      readProfile: async () => ({ goal: "拿到天使轮融资", profileSection: { profile: { relationshipGoal: "拿到天使轮融资" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    // 后台流程先生成一版快照（不在被测的打开路径里），之后再加 3 位 → 判定为自动重算。
    assert.equal((await runtime.service.readView(ALICE, "zh")).freshness.job, "queued");
    assert.equal((await runtime.service.runWorker(ALICE)).status, "succeeded");
    for (let index = 5; index < 8; index += 1) await harness.addContact(ALICE, `${ALICE}:c${index}`, { primaryIndustryId: "retail_consumer" });
    assert.equal((await runtime.service.evaluate(ALICE)).decision.kind, "auto");

    // 五周前开始的计划：今天在第 2 阶段，「进入新阶段」还没写（阶段边界）。A（targetCount 2）关联 c0、c1；B（缺省 1）关联 c2。
    const need = (title: string, targetCount?: number) => ({
      criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: [], ...(targetCount ? { targetCount } : {}) },
      kind: "network_need" as const, phaseKey: "p1", title,
    });
    const created = await plans.raw.createVersion({
      analysis: { summary: "s" }, goalSnapshot: "拿到天使轮融资", horizon: "quarter", sourceSessionId: null, startsOn: "2026-08-24",
      phases: [{ endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "一" }, { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "二" }],
      items: [need("A", 2), need("B"), { kind: "action", phaseKey: "p2", suggestedWeek: 5, title: "约人" }],
    } as never);
    const links = (ids: string[]) => JSON.stringify(ids.map((contactId) => ({ contactId, establishedAt: null, linkedAt: "2026-09-01T00:00:00.000Z", state: "linked" })));
    await harness.pool.query(`update plan_items set status = 'linked', contact_links = $1::jsonb, linked_contact_ids = $2 where title = 'A'`, [links([`${ALICE}:c0`, `${ALICE}:c1`]), [`${ALICE}:c0`, `${ALICE}:c1`]]);
    await harness.pool.query(`update plan_items set status = 'linked', contact_links = $1::jsonb, linked_contact_ids = $2 where title = 'B'`, [links([`${ALICE}:c2`]), [`${ALICE}:c2`]]);
    await insertDormantStrength(harness, ALICE, `${ALICE}:c4`);
    await insertDormantStrength(harness, BOB, `${BOB}:c0`);

    const matches = createPostgresPlanMatchRepository({ pool: harness.pool, workspaceId: WORKSPACE });
    const matching = createPlanMatchingService({ planServiceFor: () => plans.service, repository: matches, worker: { aiMatcher: null, repository: matches } });
    const counter = await installWriteCounter(harness);
    assert.ok(counter.tables.includes("network_analysis_jobs") && counter.tables.includes("plan_match_jobs") && counter.tables.includes("plans"));
    await counter.reset();
    const generatorCalls = generator.calls;

    const deps: OpportunitiesTabLoaderDeps = {
      readBookableEvents: async () => [],
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
      readDormant: (actorId) => readDormantCandidates({ client: harness.client, workspaceId: WORKSPACE }, actorId),
      readPending: (actorId) => matching.listPending({ actorId }),
      readPlan: () => plans.service.getCurrent(),
      readSnapshot: (actorId, language) => runtime.service.readView(actorId, language, { enqueue: false }),
    };
    const view = await loadOpportunitiesTab({ actorId: ALICE, goal: null, language: "zh", now: NOW }, deps);

    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table (incl. network_analysis_jobs, plan_match_jobs)");
    assert.equal(refinements.count, 0, "no plan generator (phase refiner) resolved");
    assert.equal(generator.calls, generatorCalls, "no snapshot generation");
    assert.deepEqual(paid, [], "no paid AI request");

    assert.equal(view.coverage.state, "ready");
    if (view.coverage.state !== "ready") return;
    assert.equal(view.coverage.percent, 100);
    assert.deepEqual(view.coverage.needs.map((row) => [row.title, row.have, row.target, row.missing]), [["A", 2, 2, 0], ["B", 1, 1, 0]]);
    assert.equal(view.report.state, "ready");
    assert.equal(view.report.freshness.stale, true, "stale is still reported");
    assert.equal(view.report.freshness.job, "none", "but no job was queued by the read");
    assert.equal(view.report.freshness.newContactCount, 3);
    assert.deepEqual(view.dormant?.map((row) => [row.contactId, row.evidence.recordId]), [[`${ALICE}:c4`, `memo:${ALICE}:c4:1`]], "only the actor's dormant, goal-related contact; evidence = the latest record");
    assert.match(view.dormant?.[0]?.why ?? "", /^上次往来：2026\/7\/1 备忘；与目标相关：同属金融与投资$/);
    assert.equal(view.weekActions.planActions?.length, 1);
    assert.equal(view.weekActions.pendingMatches, 0);
    assert.equal(created.plan.id.length > 0, true);

    // 对照：默认 readView 会排队（夹具确实处在「自动重算」）；getCurrentView 会写「进入新阶段」（夹具确实处在阶段边界）。
    await runtime.service.readView(ALICE, "zh");
    await plans.raw.getCurrentView();
    const control = (await counter.byTable()).map((row) => row.table_name);
    assert.ok(control.includes("network_analysis_jobs"), control.join(","));
    assert.ok(control.includes("plan_log"), control.join(","));
    assert.equal((await harness.pool.query(`select count(*)::int as n from plan_match_jobs`)).rows[0]!.n, 0, "the read path never enqueued a 'plan' job");
  });
});

test("SC-01: each part fails on its own — a failed plan read shows coverage unavailable and a failed dormant read shows unavailable while the report still renders", async () => {
  const report = { blocks: [], contactCount: 5, freshness: { job: "none" as const, newContactCount: 0, stale: false }, generatedAt: NOW.toISOString(), quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } }, state: "ready" as const };
  const calls: string[] = [];
  const view = await loadOpportunitiesTab({ actorId: ALICE, goal: Promise.resolve("拿到天使轮融资"), language: "en", now: NOW }, {
    readBookableEvents: async () => { calls.push("events"); return []; },
    readContactNames: async () => { calls.push("names"); return new Map(); },
    readDormant: async () => { throw new Error("boom"); },
    readPending: async () => { calls.push("pending"); throw new Error("not reached"); },
    readPlan: async () => { throw new Error("plan down"); },
    readSnapshot: async (_actor, language) => { calls.push(`snapshot:${language}`); return report; },
  });
  assert.deepEqual(view.coverage, { state: "unavailable" });
  assert.equal(view.dormant, null);
  assert.equal(view.report.state, "ready");
  assert.deepEqual(view.weekActions, { pendingMatches: null, planActions: null });
  assert.deepEqual(calls, ["snapshot:en"], "no plan → no pending or event reads; no gap evidence → no name read");
});
