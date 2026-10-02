/**
 * W0049 服务端加载（真实 PostgreSQL，`ORBIT_EVENT_DATABASE_URL` 回环库、随机 schema）：
 *
 * - SC-03（R-6）：计划正处阶段边界（「进入新阶段」还没写）时打开结构标签：计划三表前后不变、对计划 INSERT／UPDATE 0 条、
 *   补细器（计划生成器）0 次解析；A 一级、B1 二级高亮，已建立联系的 C 不高亮；
 * - SC-01：依据姓名读取只带本人 actor，他人联系人、已删除联系人、不存在的 id 都不出现；ja 界面请求 en 快照；
 *   整个加载对付费 AI 主机 0 次请求、快照生成器 0 次调用；
 * - 失败隔离：快照读失败 → ①④ unavailable，高亮照常；计划读失败 → 无高亮，快照照常；快照服务不可用 → unavailable。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadStructureTabExtras, type StructureTabLoaderDeps } from "../../app/(app)/app/contacts/analysis/structure-tab-loader";
import { readEvidenceContactNames } from "../../features/network-analysis/evidence-contacts";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { buildMockSnapshotContent, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import type { PlanService } from "../../features/plans/contract";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { PAID_AI_HOSTS } from "../../scripts/test-paid-ai-boundary.mjs";
import { ALICE, BOB, contactPayload, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";
import { evidenceNames, snapshotFixture } from "../support/structure-tab-fixture";

const NOW = new Date("2026-10-02T03:00:00.000Z");

function countingGenerator(): NetworkSnapshotGenerator & { calls: number } {
  const generator = {
    billable: true,
    calls: 0,
    model: "fake-model",
    promptVersion: "test-v1",
    provider: "deepseek" as const,
    async generate(input: SnapshotInput) {
      generator.calls += 1;
      return { content: buildMockSnapshotContent(input), usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return generator;
}

async function planTables(harness: NetworkHarness) {
  const read = async (table: string) => (await harness.pool.query(`select * from ${table} order by id`)).rows.map((row) => JSON.stringify(row));
  return { items: await read("plan_items"), log: await read("plan_log"), plans: await read("plans") };
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

/** 统计付费 AI 主机请求（scripts/test-paid-ai-boundary.mjs 的同一主机表）。 */
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

test("SC-03 / SC-01: on a phase-boundary plan the structure loader writes nothing to the plan, never resolves a generator or calls paid AI, and highlights A and B1 only", databaseTest, async (t) => {
  const paid = countPaidFetch(t);
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 5; index += 1) {
      await harness.addContact(ALICE, `${ALICE}:c${index}`, { primaryIndustryId: index < 3 ? "technology_internet" : "finance_investment" });
    }
    await harness.addContact(BOB, `${BOB}:c0`, { primaryIndustryId: "technology_internet" });
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
    // 先有一版快照（后台流程生成；不在被测的打开路径里）。
    const first = await runtime.service.readView(ALICE, "zh");
    assert.equal(first.freshness.job, "queued");
    assert.equal((await runtime.service.runWorker(ALICE)).status, "succeeded");
    // 五周前开始的计划：今天在第 2 阶段，「进入新阶段」还没写（阶段边界）。A open、B linked、C established。
    const need = (title: string, primaryIndustryId: string, secondaryIndustryId: string | null) => ({
      criteria: { description: null, primaryIndustryId, secondaryIndustryId, titleKeywords: [] }, kind: "network_need" as const, phaseKey: "p1", title,
    });
    await plans.raw.createVersion({
      analysis: { summary: "s" }, goalSnapshot: "认识 SaaS 决策人", horizon: "quarter", sourceSessionId: null, startsOn: "2026-08-24",
      phases: [
        { endWeek: 4, granularity: "week", key: "p1", startWeek: 1, title: "一" },
        { endWeek: 8, granularity: "week", key: "p2", startWeek: 5, title: "二" },
      ],
      items: [
        need("A", "technology_internet", null),
        need("B", "finance_investment", "finance_investment.banking"),
        need("C", "retail_consumer", "retail_consumer.ecommerce"),
      ],
    } as never);
    await harness.pool.query(`update plan_items set status = 'linked' where title = 'B'`);
    await harness.pool.query(`update plan_items set status = 'established' where title = 'C'`);
    const before = await planTables(harness);
    const generatorCalls = generator.calls;
    harness.meter.writes.length = 0;
    harness.meter.statements.length = 0;
    const languages: string[] = [];
    const deps: StructureTabLoaderDeps = {
      readSnapshot: (actorId, language) => { languages.push(language); return runtime.service.readView(actorId, language); },
      readPlan: () => plans.service.getCurrent(),
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
    };
    const extras = await loadStructureTabExtras({ actorId: ALICE, language: "ja", strengthState: null }, deps);

    assert.deepEqual(languages, ["en"], "ja requests the English snapshot view");
    assert.deepEqual(await planTables(harness), before, "plans / plan_items / plan_log unchanged");
    assert.deepEqual(harness.meter.writes.filter((statement) => /\b(plans|plan_items|plan_log)\b/.test(statement)), [], "no plan INSERT/UPDATE");
    assert.equal(refinements.count, 0, "no phase refiner (plan generator) resolved");
    assert.equal(generator.calls, generatorCalls, "no snapshot generation on the page path");
    assert.deepEqual(paid, [], "no paid AI request");
    assert.deepEqual(extras.highlights, { primary: ["finance_investment", "technology_internet"], secondary: ["finance_investment.banking"] });
    assert.equal(extras.snapshot.state, "ready");
    if (extras.snapshot.state !== "ready") return;
    assert.ok(extras.snapshot.diagnosis);
    const evidence = [extras.snapshot.diagnosis, ...extras.snapshot.insights].flatMap((block) => block!.evidence);
    assert.ok(evidence.length > 0);
    assert.ok(evidence.every((person) => person.id.startsWith(`${ALICE}:`) && person.href === `/app/contacts/${encodeURIComponent(person.id)}`));
    // 计量：打开路径的写语句（如有）只可能是快照的排队，不碰计划。
    assert.ok(harness.meter.writes.every((statement) => /network_analysis_jobs/.test(statement)), harness.meter.writes.join("\n"));
    // 对照：同一夹具上会写的 getCurrentView 确实写「进入新阶段」——证明这是阶段边界。
    await plans.raw.getCurrentView();
    assert.notDeepEqual((await planTables(harness)).log, before.log);
  });
});

test("SC-01: evidence names are read only within the actor's scope; other actors', deleted and unknown ids are silently dropped", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await harness.addContact(ALICE, "c00", { displayName: "王敏" });
    await harness.addContact(ALICE, "c15", { displayName: "李雷" });
    await harness.addContact(ALICE, "c01", { displayName: "佐藤", accountId: BOB }); // payload 属于他人账号
    await harness.addContact(BOB, "bob:c99", { displayName: "Bob 的联系人" });
    await harness.addContact(ALICE, "deleted:c50", { displayName: "已删除" });
    await harness.deleteRecord("contacts", "deleted:c50");
    // 记录 id 与领域 id 不同的合法联系人：快照依据用记录 id，链接用领域 id（review P2-1）。
    await harness.insertRecord({ collection: "contacts", id: "record:c77", payload: { ...contactPayload("contact:c77", ALICE), displayName: "高桥" }, userId: ALICE });
    // 反过来：领域 id 恰好等于某个依据 id、但记录 id 不同 → 不能按领域 id 命中。
    await harness.insertRecord({ collection: "contacts", id: "record:shadow", payload: { ...contactPayload("c88", ALICE), displayName: "影子" }, userId: ALICE });
    const values: unknown[][] = [];
    const client = { query: (text: string, params?: readonly unknown[]) => { values.push([...(params ?? [])]); return harness.client.query(text, params); } };
    const names = await readEvidenceContactNames({ client: client as never, workspaceId: WORKSPACE }, ALICE, ["c00", "c15", "c01", "bob:c99", "deleted:c50", "missing", "record:c77", "c88", "c00"]);
    assert.deepEqual([...names.entries()].sort(), [
      ["c00", { contactId: "c00", name: "王敏" }],
      ["c15", { contactId: "c15", name: "李雷" }],
      ["record:c77", { contactId: "contact:c77", name: "高桥" }],
    ]);
    assert.equal(values.length, 1, "one bounded read");
    assert.equal(values[0]![1], ALICE, "the read carries only the actor");
    assert.deepEqual(values[0]![2], ["c00", "c15", "c01", "bob:c99", "deleted:c50", "missing", "record:c77", "c88"]);
    // 加载器把解析结果交给视图：他人与已删除的 id 不进依据。
    const extras = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null }, {
      readSnapshot: async () => ({ ...snapshotFixture(), quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } } }),
      readPlan: async () => null,
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
    });
    assert.equal(extras.snapshot.state, "ready");
    assert.doesNotMatch(JSON.stringify(extras), /bob:c99|deleted:c50|佐藤/);
    const withRecordId = snapshotFixture();
    withRecordId.blocks = [{ key: "diagnosis", kind: "diagnosis", text: "诊断", evidence: { contactIds: ["record:c77"], recordIds: [] } }];
    const linked = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null }, {
      readSnapshot: async () => ({ ...withRecordId, quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } } }),
      readPlan: async () => null,
      readContactNames: (actorId, ids) => readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, actorId, ids),
    });
    assert.ok(linked.snapshot.state === "ready" && linked.snapshot.diagnosis);
    assert.deepEqual(linked.snapshot.diagnosis.evidence, [{ id: "contact:c77", name: "高桥", href: "/app/contacts/contact%3Ac77" }]);
    assert.deepEqual(extras.highlights, { primary: [], secondary: [] }, "no plan → no highlight");
    assert.equal(await readEvidenceContactNames({ client: harness.client, workspaceId: WORKSPACE }, ALICE, []).then((map) => map.size), 0);
  });
});

test("failure isolation: snapshot or evidence-name failure → ①④ unavailable with highlights intact; plan failure → no highlight with the snapshot intact; no runtime → unavailable", async () => {
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (line: string) => { errors.push(String(line)); };
  try {
    const snapshot = { ...snapshotFixture(), quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } } };
    const plan = { items: [{ kind: "network_need", status: "open", criteria: { primaryIndustryId: "technology_internet", secondaryIndustryId: null } }] };
    const names = async () => evidenceNames([["c00", "王敏"]]);
    const snapshotFailed = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null }, {
      readSnapshot: async () => { throw new Error("db down"); }, readPlan: async () => plan, readContactNames: names,
    });
    assert.deepEqual(snapshotFailed.snapshot, { state: "unavailable" });
    assert.deepEqual(snapshotFailed.highlights, { primary: ["technology_internet"], secondary: [] });
    const planFailed = await loadStructureTabExtras({ actorId: ALICE, language: "en", strengthState: null }, {
      readSnapshot: async () => snapshot, readPlan: async () => { throw new Error("plan down"); }, readContactNames: names,
    });
    assert.equal(planFailed.highlights, null);
    assert.equal(planFailed.snapshot.state, "ready");
    const namesFailed = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null }, {
      readSnapshot: async () => snapshot, readPlan: async () => plan, readContactNames: async () => { throw new Error("names down"); },
    });
    assert.deepEqual(namesFailed.snapshot, { state: "unavailable" }, "no unsupported sentence when names cannot be read");
    assert.deepEqual(namesFailed.highlights, { primary: ["technology_internet"], secondary: [] });
    const noRuntime = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: null }, {
      readSnapshot: null, readPlan: async () => null, readContactNames: names,
    });
    assert.deepEqual(noRuntime.snapshot, { state: "unavailable" });
    const state = { actorId: ALICE, sourceStamp: "s", tokyoDate: "2026-10-02", rulesVersion: "rs", computedAt: NOW.toISOString(), contactCount: 3,
      tierCountsAt30d: { asOf: "2026-09-02T03:00:00.000Z", counts: { new: 1, active: 0, core: 0, dormant: 0 }, contactCount: 1 }, earliestCaptureAt: "2026-08-01T00:00:00.000Z" };
    const withHistory = await loadStructureTabExtras({ actorId: ALICE, language: "zh", strengthState: state }, { readSnapshot: null, readPlan: async () => null, readContactNames: names });
    assert.deepEqual(withHistory.tierHistory, { tierCountsAt30d: state.tierCountsAt30d, earliestCaptureAt: state.earliestCaptureAt });
  } finally {
    console.error = originalError;
  }
  assert.ok(errors.some((line) => line.includes("structure_tab_snapshot_failed")));
  assert.ok(errors.some((line) => line.includes("structure_tab_plan_failed")));
  assert.ok(errors.some((line) => line.includes("structure_tab_evidence_failed")));
});
