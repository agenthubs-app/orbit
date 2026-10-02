/**
 * W0054 SC-03（真实 PostgreSQL，`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）：人脉分析门槛。
 *
 * - 门槛计数 = 引导第 1 步同一条语句（`createPostgresConfirmedContactCounter`／`CONFIRMED_CONTACT_COUNT_SQL`）、同一常量；
 * - 已确认联系人删到 2 位、计划正处阶段边界时打开结构／机会／概览：快照读取 0 次、快照生成 0 次、计划生成器（补细器）0 次、
 *   任何表 0 次 INSERT／UPDATE／DELETE（R-6、D46③）、付费 AI 0 次；返回的数据里没有旧快照句子，统计（高亮、覆盖度、待唤醒）照常；
 * - 补回到 3 位（W54-4）：按 W0048a 恢复规则排队重算，完成前结构标签是「正在更新分析」、不回显旧快照；后台池顺延时是「明天更新」。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadOpportunitiesTab, readDormantCandidates, type OpportunitiesTabLoaderDeps } from "../../app/(app)/app/contacts/analysis/opportunities-route-service";
import { loadOverviewCockpit, type OverviewCockpitLoaderDeps } from "../../app/(app)/app/contacts/analysis/overview-cockpit-loader";
import { loadStructureTabExtras, type StructureTabLoaderDeps } from "../../app/(app)/app/contacts/analysis/structure-tab-loader";
import { buildNetworkOverviewData } from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { createStorageGuideStateService, type GuideStatePayload } from "../../features/guide/guide-state";
import { CONFIRMED_CONTACT_COUNT_SQL, createPostgresConfirmedContactCounter, createPostgresConfirmedContactSampler, GUIDE_REQUIRED_CONTACTS, readGuideStatusForActor, readStartGuideForActor } from "../../features/guide/progress";
import { confirmedContactPredicate } from "../../features/contacts/confirmed-contact-predicate";
import { confirmedContactPredicate as snapshotPredicate } from "../../features/network-analysis/repository";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { NETWORK_ANALYSIS_MIN_CONTACTS } from "../../features/network-analysis/analysis-threshold";
import { readAnalysisThreshold } from "../../features/network-analysis/analysis-threshold-reader";
import { readEvidenceContactNames } from "../../features/network-analysis/evidence-contacts";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import type { PlanService } from "../../features/plans/contract";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

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
  await harness.pool.query(`create table w54_write_log (table_name text not null, op text not null)`);
  await harness.pool.query(`create function w54_count_write() returns trigger language plpgsql as $$ begin insert into w54_write_log values (TG_TABLE_NAME, TG_OP); return null; end $$`);
  const tables = (await harness.pool.query(`select tablename from pg_tables where schemaname = $1 and tablename <> 'w54_write_log'`, [harness.schema])).rows.map((row) => String(row.tablename));
  for (const table of tables) {
    await harness.pool.query(`create trigger w54_count after insert or update or delete on ${table} for each statement execute function w54_count_write()`);
  }
  return {
    tables,
    async reset() { await harness.pool.query(`truncate w54_write_log`); },
    async byTable() {
      return (await harness.pool.query(`select table_name, op, count(*)::int as n from w54_write_log group by 1, 2 order by 1, 2`)).rows;
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

test("W0054 SC-03 (review P2-1): guide count, threshold and snapshot share one confirmed-contact predicate (name required) and constant", () => {
  assert.equal(NETWORK_ANALYSIS_MIN_CONTACTS, GUIDE_REQUIRED_CONTACTS);
  assert.match(CONFIRMED_CONTACT_COUNT_SQL, /select count\(\*\)::integer as total/);
  assert.ok(CONFIRMED_CONTACT_COUNT_SQL.includes(confirmedContactPredicate("c")));
  assert.equal(snapshotPredicate, confirmedContactPredicate, "the snapshot repository re-exports the same predicate");
  assert.match(confirmedContactPredicate("c"), /displayName'\), ''\) <> ''/);
});

test("W0054 review P2-1: 2 named + 1 nameless contact — guide step 1 stays open, the threshold card shows and the snapshot also says insufficient", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await harness.addContact(ALICE, `${ALICE}:n1`);
    await harness.addContact(ALICE, `${ALICE}:n2`);
    await harness.addContact(ALICE, `${ALICE}:blank`, { displayName: "   " });
    const count = createPostgresConfirmedContactCounter({ client: harness.client, workspaceId: WORKSPACE });
    assert.equal(await count(ALICE), 2, "a nameless record is not a confirmed contact");

    // 引导：新用户（创建晚于 SINCE）、有目标与计划，第 1 步仍未完成 → 仍在示例里，/app/start 停在第 1 步。
    const guideState = createStorageGuideStateService({ actorId: ALICE, store: createMemoryLiveRecordStore<GuideStatePayload>(), workspaceId: WORKSPACE });
    const deps = {
      config: { enabled: true, since: new Date("2026-09-01T00:00:00.000Z") },
      countConfirmedContacts: count,
      guideState,
      hasActivePlan: async () => true,
      readAccountCreatedAt: async () => "2026-09-20T00:00:00.000Z",
      sampleConfirmedContacts: createPostgresConfirmedContactSampler({ client: harness.client, workspaceId: WORKSPACE }),
    };
    const status = await readGuideStatusForActor({ actorId: ALICE, relationshipGoal: "认识 SaaS 决策人" }, deps);
    assert.equal(status?.inDemo, true);
    assert.equal(status?.progress?.steps.contacts, false);
    assert.equal(status?.progress?.confirmedContacts, 2);
    const start = await readStartGuideForActor({ actorId: ALICE, relationshipGoal: "认识 SaaS 决策人" }, deps);
    assert.equal(start.kind, "ready");
    if (start.kind === "ready") {
      assert.equal(start.snapshot.confirmedContacts, 2);
      assert.equal(start.snapshot.completedAt, null);
      assert.deepEqual(start.snapshot.contactSamples.map((sample) => sample.displayName).sort(), ["Name n1", "Name n2"]);
    }

    // 门槛与结构标签：还差 1 位，结构页是门槛卡；快照服务同一口径也是 insufficient（两边不再一个认 3、一个认 2）。
    const threshold = await readAnalysisThreshold(ALICE, count);
    assert.deepEqual(threshold, { confirmed: 2, met: false, missing: 1 });
    const generator = countingGenerator();
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client, generator, now: () => NOW, readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "认识 SaaS 决策人", profileSection: { profile: { relationshipGoal: "认识 SaaS 决策人" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    assert.equal((await runtime.service.readView(ALICE, "zh")).state, "insufficient");
    const structure = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null, threshold }, {
      readContactNames: async () => new Map(), readPlan: async () => null, readSnapshot: (actorId, language) => runtime.service.readView(actorId, language),
    });
    assert.deepEqual(structure.gate, { kind: "threshold", missing: 1 });
    assert.equal(generator.calls, 0);
  });
});

test("W0054 SC-03 main: 2 confirmed contacts on a phase-boundary plan — structure / opportunities / overview read no snapshot, write nothing, resolve no generator and leak no old sentence; back to 3 shows 「正在更新」 then 「明天更新」 when deferred", databaseTest, async (t) => {
  const paid = countPaidFetch(t);
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 5; index += 1) {
      await harness.addContact(ALICE, `${ALICE}:c${index}`, { primaryIndustryId: index < 3 ? "technology_internet" : "finance_investment" });
    }
    const generator = countingGenerator();
    const refinements = { count: 0 };
    const plans = guardedPlanService(harness, refinements);
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator,
      now: () => NOW,
      readCurrentPlan: async () => plans.service.getCurrent(),
      readProfile: async () => ({ goal: "认识 SaaS 决策人", profileSection: { profile: { relationshipGoal: "认识 SaaS 决策人" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    // 后台先生成一版快照（5 人）。
    assert.equal((await runtime.service.readView(ALICE, "zh")).freshness.job, "queued");
    assert.equal((await runtime.service.runWorker(ALICE)).status, "succeeded");
    const oldTexts = (await runtime.service.readView(ALICE, "zh")).blocks.map((block) => block.text);
    assert.ok(oldTexts.length > 0);
    // 阶段边界计划：需求 A 关联 c0。
    await plans.raw.createVersion({
      analysis: { summary: "s" }, goalSnapshot: "认识 SaaS 决策人", horizon: "quarter", sourceSessionId: null, startsOn: "2026-08-24",
      phases: [{ endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "一" }, { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "二" }],
      items: [{ criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: [] }, kind: "network_need", phaseKey: "p1", title: "A" }],
    } as never);
    // 删到 2 位。
    for (const index of [0, 1, 2]) await harness.deleteRecord("contacts", `${ALICE}:c${index}`);

    const counter = await installWriteCounter(harness);
    await counter.reset();
    const guideCount = createPostgresConfirmedContactCounter({ client: harness.client, workspaceId: WORKSPACE });
    const threshold = await readAnalysisThreshold(ALICE, guideCount);
    assert.deepEqual(threshold, { confirmed: 2, met: false, missing: 1 });

    const snapshotReads: string[] = [];
    const generatorCalls = generator.calls;
    const readSnapshot = (actorId: string, language: "zh" | "en") => { snapshotReads.push(language); return runtime.service.readView(actorId, language, { enqueue: false }); };
    const names = (actorId: string, ids: readonly string[]) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids);
    const insightReads: string[][] = [];
    const structure = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null, threshold }, {
      readContactNames: names, readPlan: () => plans.service.getCurrent(), readSnapshot,
    } satisfies StructureTabLoaderDeps);
    const opportunities = await loadOpportunitiesTab({ actorId: ALICE, goal: "认识 SaaS 决策人", language: "zh", now: NOW, threshold }, {
      readBookableEvents: async () => [],
      readContactNames: names,
      readDormant: (actorId) => readDormantCandidates({ client: harness.client, workspaceId: WORKSPACE }, actorId),
      readInsights: async (_actorId, ids) => { insightReads.push([...ids]); return new Map(); },
      readPending: null,
      readPlan: () => plans.service.getCurrent(),
      readSnapshot,
    } satisfies OpportunitiesTabLoaderDeps);
    const overviewParts = await loadOverviewCockpit({ actorId: ALICE, language: "zh", now: NOW, threshold }, {
      readBoard: async () => ({ columns: { active: [], core: [], dormant: [], new: [] } }) as never,
      readContactNames: names,
      readPending: null,
      readPlan: () => plans.service.getCurrent(),
      readSnapshot,
      readTimeline: async () => ({ items: [], unavailableSources: [] }),
    } satisfies OverviewCockpitLoaderDeps);

    assert.deepEqual(snapshotReads, [], "no snapshot read below the threshold");
    assert.deepEqual(insightReads, [], "no dormant insight read below the threshold");
    assert.deepEqual(await counter.byTable(), [], "0 INSERT/UPDATE/DELETE on any table");
    assert.equal(refinements.count, 0, "no plan generator (phase refiner) resolved");
    assert.equal(generator.calls, generatorCalls, "no snapshot generation");
    assert.deepEqual(paid, [], "no paid AI request");

    assert.deepEqual(structure.gate, { kind: "threshold", missing: 1 });
    assert.deepEqual(structure.snapshot, { state: "none" });
    assert.deepEqual(structure.highlights, { primary: ["technology_internet"], secondary: [] }, "plan highlights still computed");
    assert.deepEqual(opportunities.gate, { kind: "threshold", missing: 1 });
    assert.equal(opportunities.report.state, "insufficient");
    assert.equal(opportunities.coverage.state, "ready", "coverage numbers still shown");
    const overview = buildNetworkOverviewData({ ...overviewParts, sourceFacets: null }, { state: "pending" });
    assert.deepEqual(overview.gate, { kind: "threshold", missing: 1 });
    assert.ok(overview.cards.every((card) => card.sentence === null || !oldTexts.includes(card.sentence.zh)));
    const serialized = JSON.stringify([structure, opportunities, overview]);
    for (const text of oldTexts) assert.ok(!serialized.includes(text), `old snapshot sentence leaked: ${text}`);

    // W54-4：补回到 3 位 → 恢复，结构标签排队重算并显示「正在更新分析」，不回显旧快照。
    await harness.addContact(ALICE, `${ALICE}:c9`, { primaryIndustryId: "technology_internet" });
    const recovered = await readAnalysisThreshold(ALICE, guideCount);
    assert.deepEqual(recovered, { confirmed: 3, met: true, missing: 0 });
    const updating = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null, threshold: recovered }, {
      readContactNames: names, readPlan: () => plans.service.getCurrent(), readSnapshot: (actorId, language) => runtime.service.readView(actorId, language),
    });
    assert.deepEqual(updating.gate, { kind: "updating" });
    assert.deepEqual(updating.snapshot, { state: "none" });
    for (const text of oldTexts) assert.ok(!JSON.stringify(updating).includes(text));
    assert.equal((await harness.pool.query(`select status from network_analysis_jobs where actor_id = $1 and kind = 'snapshot'`, [ALICE])).rows[0]?.status, "pending", "recompute queued");
    // 后台池用完 → 顺延到明天：「明天更新」。
    await harness.pool.query(`update network_analysis_jobs set status = 'deferred', not_before = $2 where actor_id = $1 and kind = 'snapshot'`, [ALICE, "2026-10-03T15:00:00.000Z"]);
    const deferred = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null, threshold: recovered }, {
      readContactNames: names, readPlan: () => plans.service.getCurrent(), readSnapshot: (actorId, language) => runtime.service.readView(actorId, language),
    });
    assert.deepEqual(deferred.gate, { kind: "deferred", retryOn: "2026-10-03T15:00:00.000Z" });
    assert.equal(generator.calls, generatorCalls, "the page path never generates");
  });
});
