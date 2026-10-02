/**
 * W0052 SC-01 主证据（服务端加载）：真实 PostgreSQL（`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）上的 `loadOverviewCockpit`。
 *
 * 夹具（与 W0050 机会标签同一构造）：生效计划正处阶段边界（「进入新阶段」还没写）、2 条需求共关联 3 人；
 * 快照已生成且新增 3 位联系人后判定为「自动重算」；有核心／有往来强度行；Bob 的数据混在同一 workspace。
 *
 * - 整个加载对**任何表** 0 次 INSERT／UPDATE／DELETE（statement 级触发器按表计数，含计划三表、network_analysis_jobs）；
 *   计划生成器（阶段补细器）0 次解析、快照生成器 0 次、付费 AI 主机 0 次请求；
 * - 4 卡数字与机会标签同一函数结果相等（覆盖「已有 a／共 b」、本周建议动作）；
 * - 对照：同一夹具上默认 `readView` 确实会排队、`getCurrentView` 确实会写（证明夹具处在自动重算与阶段边界）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadOpportunitiesTab, readDormantCandidates } from "../../app/(app)/app/contacts/analysis/opportunities-route-service";
import { loadOverviewCockpit, type OverviewCockpitLoaderDeps } from "../../app/(app)/app/contacts/analysis/overview-cockpit-loader";
import { buildNetworkOverviewData } from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { readEvidenceContactNames } from "../../features/network-analysis/evidence-contacts";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import type { PlanService } from "../../features/plans/contract";
import { createPostgresPlanMatchRepository } from "../../features/plans/matching-repository";
import { createPlanMatchingService } from "../../features/plans/matching-service";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { createPostgresRelationshipStrengthStore, readRelationshipTierBoard } from "../../features/relationship-strength/read-model";
import { readRecentRelationshipTimelineForActor } from "../../features/relationship-timeline/reader";
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

async function installWriteCounter(harness: NetworkHarness) {
  await harness.pool.query(`create table w52_write_log (table_name text not null, op text not null)`);
  await harness.pool.query(`create function w52_count_write() returns trigger language plpgsql as $$ begin insert into w52_write_log values (TG_TABLE_NAME, TG_OP); return null; end $$`);
  const tables = (await harness.pool.query(`select tablename from pg_tables where schemaname = $1 and tablename <> 'w52_write_log'`, [harness.schema])).rows.map((row) => String(row.tablename));
  for (const table of tables) {
    await harness.pool.query(`create trigger w52_count after insert or update or delete on ${table} for each statement execute function w52_count_write()`);
  }
  return {
    tables,
    async reset() { await harness.pool.query(`truncate w52_write_log`); },
    async byTable() {
      return (await harness.pool.query(`select table_name, op, count(*)::int as n from w52_write_log group by 1, 2 order by 1, 2`)).rows as Array<{ table_name: string; op: string; n: number }>;
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

async function insertStrength(harness: NetworkHarness, actorId: string, contactId: string, input: { tier: "new" | "active" | "core"; dormant?: boolean; lastSignalAt: string }) {
  await harness.insertRecord({
    collection: "relationship_strengths",
    id: `relationship-strength:${actorId}:${contactId}`,
    payload: {
      computedAt: NOW.toISOString(), contactId, dormant: input.dormant === true, lastSignalAt: input.lastSignalAt, peakScore: 80, rulesVersion: "rs-2026-10-v1", score: 75,
      signals: [{ basePoints: 20, occurredAt: input.lastSignalAt, points: 20, source: "memo", timelineItemId: `memo:${contactId}:1` }],
      tier: input.tier,
    },
    userId: actorId,
  });
}

test("SC-W0052-01 main: at a phase boundary with an auto-recompute due, loading the overview cockpit writes nothing to any table, resolves no generator, calls no paid AI, and its numbers equal the opportunities tab's", databaseTest, async (t) => {
  const paid = countPaidFetch(t);
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 5; index += 1) {
      await harness.addContact(ALICE, `${ALICE}:c${index}`, { displayName: `Alice 联系人 ${index}`, primaryIndustryId: index < 3 ? "technology_internet" : "finance_investment" });
    }
    await harness.addContact(BOB, `${BOB}:c0`, { displayName: "Bob 的人", primaryIndustryId: "finance_investment" });
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
    assert.equal((await runtime.service.readView(ALICE, "zh")).freshness.job, "queued");
    assert.equal((await runtime.service.runWorker(ALICE)).status, "succeeded");
    for (let index = 5; index < 8; index += 1) await harness.addContact(ALICE, `${ALICE}:c${index}`, { displayName: `Alice 联系人 ${index}`, primaryIndustryId: "retail_consumer" });
    assert.equal((await runtime.service.evaluate(ALICE)).decision.kind, "auto");

    const need = (title: string, targetCount?: number) => ({
      criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: [], ...(targetCount ? { targetCount } : {}) },
      kind: "network_need" as const, phaseKey: "p1", title,
    });
    await plans.raw.createVersion({
      analysis: { summary: "s" }, goalSnapshot: "拿到天使轮融资", horizon: "quarter", sourceSessionId: null, startsOn: "2026-08-24",
      phases: [{ endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "一" }, { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "二" }],
      items: [need("A", 3), need("B"), { kind: "action", phaseKey: "p2", suggestedWeek: 5, title: "约人" }],
    } as never);
    const links = (ids: string[]) => JSON.stringify(ids.map((contactId) => ({ contactId, establishedAt: null, linkedAt: "2026-09-01T00:00:00.000Z", state: "linked" })));
    await harness.pool.query(`update plan_items set status = 'linked', contact_links = $1::jsonb, linked_contact_ids = $2 where title = 'A'`, [links([`${ALICE}:c0`, `${ALICE}:c1`]), [`${ALICE}:c0`, `${ALICE}:c1`]]);
    await harness.pool.query(`update plan_items set status = 'linked', contact_links = $1::jsonb, linked_contact_ids = $2 where title = 'B'`, [links([`${ALICE}:c2`]), [`${ALICE}:c2`]]);
    await insertStrength(harness, ALICE, `${ALICE}:c0`, { lastSignalAt: "2026-09-20T00:00:00.000Z", tier: "core" });
    await insertStrength(harness, ALICE, `${ALICE}:c1`, { lastSignalAt: "2026-09-30T00:00:00.000Z", tier: "core" });
    await insertStrength(harness, ALICE, `${ALICE}:c2`, { lastSignalAt: "2026-09-25T00:00:00.000Z", tier: "active" });
    await insertStrength(harness, BOB, `${BOB}:c0`, { lastSignalAt: "2026-10-01T00:00:00.000Z", tier: "core" });

    const matches = createPostgresPlanMatchRepository({ pool: harness.pool, workspaceId: WORKSPACE });
    const matching = createPlanMatchingService({ planServiceFor: () => plans.service, repository: matches, worker: { aiMatcher: null, repository: matches } });
    const store = createPostgresRelationshipStrengthStore({ client: harness.client, workspaceId: WORKSPACE });
    const counter = await installWriteCounter(harness);
    assert.ok(["network_analysis_jobs", "plans", "plan_items", "plan_log", "orbit_records"].every((table) => counter.tables.includes(table)));
    await counter.reset();
    const generatorCalls = generator.calls;

    const deps: OverviewCockpitLoaderDeps = {
      readBoard: (actorId) => readRelationshipTierBoard({ actorId, perColumn: 2 }, { store }),
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
      readPending: (actorId) => matching.listPending({ actorId }),
      readPlan: () => plans.service.getCurrent(),
      readSnapshot: (actorId, language) => runtime.service.readView(actorId, language, { enqueue: false }),
      readTimeline: (actorId, now) => readRecentRelationshipTimelineForActor({ actorId, limit: 5, now }, { runtime: { client: harness.pool, workspaceId: WORKSPACE } }),
    };
    const parts = await loadOverviewCockpit({ actorId: ALICE, language: "zh", now: NOW }, deps);

    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table (incl. plans, plan_log, network_analysis_jobs)");
    assert.equal(refinements.count, 0, "no plan generator (phase refiner) resolved");
    assert.equal(generator.calls, generatorCalls, "no snapshot generation");
    assert.deepEqual(paid, [], "no paid AI request");

    // 与机会标签同一函数：同一夹具上 loadOpportunitiesTab 的覆盖度与本周动作。
    const opportunities = await loadOpportunitiesTab({ actorId: ALICE, goal: null, language: "zh", now: NOW }, {
      readBookableEvents: async () => [],
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
      readDormant: (actorId) => readDormantCandidates({ client: harness.client, workspaceId: WORKSPACE }, actorId),
      readPending: (actorId) => matching.listPending({ actorId }),
      readPlan: () => plans.service.getCurrent(),
      readSnapshot: (actorId, language) => runtime.service.readView(actorId, language, { enqueue: false }),
    });
    assert.equal(opportunities.coverage.state, "ready");
    if (opportunities.coverage.state !== "ready") return;
    const analysis = { metrics: { contacts: 8 }, state: "ready", structure: { data: { health: [{ count: 2, id: "core" }, { count: 1, id: "active" }] }, state: "ready" } } as never;
    const data = buildNetworkOverviewData({ ...parts, sourceFacets: {} }, analysis);
    const [structure, gap, week] = data.cards;
    const covered = opportunities.coverage.needs.reduce((sum, row) => sum + Math.min(row.have, row.target), 0);
    const target = opportunities.coverage.needs.reduce((sum, row) => sum + row.target, 0);
    assert.deepEqual([gap!.n, gap!.value?.zh], [covered, `已有 ${covered}／共 ${target}`]);
    assert.deepEqual([covered, target], [3, 4]);
    assert.equal(week!.n, (opportunities.weekActions.planActions?.length ?? 0) + (opportunities.weekActions.pendingMatches ?? 0));
    assert.equal(structure!.n, 8);
    // 快照只读：仍报告 stale 但这次读取没有排队；meta = 生成于 · 基于 N 人。
    assert.equal(parts.snapshot.state, "ready");
    assert.equal(parts.snapshot.freshness.job, "none");
    assert.equal(data.meta.kind, "snapshot");
    // 重点联系人：Alice 核心档最近信号最新的两位（Bob 的核心不出现）。
    assert.deepEqual(data.highlights?.map((row) => [row.name, row.tier]), [["Alice 联系人 1", "core"], ["Alice 联系人 0", "core"]]);
    // 最近动态：只有 Alice 的人，按时间倒序，至多 5 条，姓名已解析。
    assert.equal(data.activity.state, "ready");
    if (data.activity.state !== "ready") return;
    assert.ok(data.activity.rows.length > 0 && data.activity.rows.length <= 5);
    assert.ok(data.activity.rows.every((row) => row.name?.startsWith("Alice")), JSON.stringify(data.activity.rows.map((row) => row.name)));

    // 对照：默认 readView 会排队（夹具确实处在「自动重算」）；getCurrentView 会写「进入新阶段」（夹具确实处在阶段边界）。
    await runtime.service.readView(ALICE, "zh");
    await plans.raw.getCurrentView();
    const control = (await counter.byTable()).map((row) => row.table_name);
    assert.ok(control.includes("network_analysis_jobs"), control.join(","));
    assert.ok(control.includes("plan_log"), control.join(","));
  });
});

test("SC-W0052-01: each part fails on its own — plan, snapshot, timeline, board and name failures only blank their own part", async () => {
  const calls: string[] = [];
  const parts = await loadOverviewCockpit({ actorId: ALICE, language: "en", now: NOW }, {
    readBoard: async () => { throw new Error("board down"); },
    readContactNames: async () => { calls.push("names"); throw new Error("names down"); },
    readPending: async () => { calls.push("pending"); throw new Error("not reached"); },
    readPlan: async () => { throw new Error("plan down"); },
    readSnapshot: async (_actor, language) => { calls.push(`snapshot:${language}`); throw new Error("snapshot down"); },
    readTimeline: async () => ({ items: [{ contactId: "rec:1", id: "memo:1", occurredAt: NOW.toISOString(), occurredAtPrecision: "instant", ref: { recordId: "1", store: "contacts" }, source: "memo", title: { en: "Wrote a memo", zh: "写了 memo" } }], unavailableSources: [] }),
  });
  assert.equal(parts.plan, undefined);
  assert.equal(parts.pendingMatches, null);
  assert.equal(parts.snapshot.state, "unavailable");
  assert.equal(parts.board, null);
  assert.equal(parts.names, null);
  assert.equal(parts.timeline?.items.length, 1);
  assert.deepEqual(calls, ["snapshot:en", "names"], "no plan → no pending read");
  const data = buildNetworkOverviewData({ ...parts, sourceFacets: null }, { state: "pending" });
  assert.deepEqual(data.meta, { kind: "ai_unavailable" });
  assert.equal(data.activity.state, "ready", "timeline still renders with its own data");
  if (data.activity.state === "ready") assert.equal(data.activity.rows[0]!.name, null);

  // 没有计划：不读待确认（0），也不读姓名（没有需要解析的 id）。
  const noPlan: string[] = [];
  const empty = await loadOverviewCockpit({ actorId: ALICE, language: "zh", now: NOW }, {
    readBoard: async () => ({ columns: { active: [], core: [], dormant: [], new: [] } }),
    readContactNames: async () => { noPlan.push("names"); return new Map(); },
    readPending: async () => { noPlan.push("pending"); return { candidates: [], contactCount: 0, pendingByNeed: {} }; },
    readPlan: async () => null,
    readSnapshot: null,
    readTimeline: async () => ({ items: [], unavailableSources: [] }),
  });
  assert.deepEqual([empty.plan, empty.pendingMatches, empty.snapshot.state], [null, 0, "unavailable"]);
  assert.deepEqual(noPlan, []);
});
