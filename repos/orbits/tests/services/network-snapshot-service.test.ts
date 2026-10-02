/**
 * W0048a SC-W0048a-03 / 02 / 04（真实 PostgreSQL + 纯函数）：快照服务。
 *
 * - 主证据：计数假生成器下「连开 3 次（版本不变）→ 新增 2 人 → 再新增 1 人」调用次数 0、0、1，newContactCount 正确；
 * - decideSnapshotRefresh 全分支（含从不足 3 人恢复）；目标改了恰 1 次；<3 人 0 次；两次并发打开只 1 次；
 * - R-3：外部持有 operationId 时 generateSnapshotNow 只登记子账、不预留、不 finish；
 * - R-6：阶段边界夹具上重算与三层入口前后计划三表不变、INSERT／UPDATE 0 条、补细器 0 次；
 * - R-2：排队后崩溃、预留后崩溃（复用操作）、二次判定 fresh（0 次预留）、租约回收与完成并发（只一方写、各操作只结算一次）；
 * - DeepSeek 生成器：请求体 thinking 禁用 + json_object；HTTP 前已有 started 子账、响应后写 token、超时记 no_response。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresAiUsageLedger, type AiUsageLedger } from "../../features/ai-quota/ledger";
import { createDeepseekSnapshotGenerator } from "../../features/network-analysis/deepseek-snapshot-generator";
import { decideSnapshotRefresh } from "../../features/network-analysis/refresh-policy";
import { createNetworkAnalysisRuntime, type NetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { runNewContactLayers } from "../../features/network-analysis/new-contact-layers";
import { createPostgresSnapshotInputSource } from "../../features/network-analysis/input-source";
import { createNetworkSnapshotService } from "../../features/network-analysis/service";
import { createSnapshotSourceVersionReader } from "../../features/network-analysis/source-version";
import { buildMockSnapshotContent, SnapshotGeneratorError, type NetworkSnapshotGenerator, type SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPlanService } from "../../features/plans/service";
import type { PlanService } from "../../features/plans/contract";
import { planInput } from "../support/plan-fixture";
import { ALICE, BOB, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z");
const PROFILE = (goal: string) => async () => ({ goal, profileSection: { profile: { relationshipGoal: goal }, state: "ready" } });

type Gate = { wait?: Promise<void>; started?: () => void };

function countingGenerator(gate: Gate = {}): NetworkSnapshotGenerator & { calls: number; inputs: SnapshotInput[] } {
  const generator = {
    billable: true,
    calls: 0,
    inputs: [] as SnapshotInput[],
    model: "fake-model",
    promptVersion: "test-v1",
    provider: "deepseek" as const,
    async generate(input: SnapshotInput) {
      generator.calls += 1;
      generator.inputs.push(input);
      if (gate.wait && generator.calls === 1) {
        gate.started?.();
        await gate.wait;
      }
      return { content: buildMockSnapshotContent(input), usage: { inputTokens: 500, outputTokens: 80 } };
    },
  };
  return generator;
}

function runtimeFor(harness: NetworkHarness, generator: NetworkSnapshotGenerator, options: { goal?: () => string; plan?: () => PlanService | null; now?: () => Date } = {}): NetworkAnalysisRuntime {
  return createNetworkAnalysisRuntime({
    client: harness.client,
    generator,
    now: options.now ?? (() => NOW),
    readCurrentPlan: async () => (options.plan?.() ? options.plan()!.getCurrent() : null),
    readProfile: async () => PROFILE(options.goal?.() ?? "认识 SaaS 决策人")(),
    workspaceId: WORKSPACE,
  });
}

async function seedContacts(harness: NetworkHarness, actorId: string, from: number, count: number) {
  for (let index = from; index < from + count; index += 1) {
    await harness.addContact(actorId, `${actorId}:c${index}`, { primaryIndustryId: index % 2 ? "technology_internet" : "finance_investment" });
  }
}

/** 打开一次分析页：读视图，若排了队就让 worker 领取（模拟 after()）。返回本次生成器调用次数。 */
async function openOnce(runtime: NetworkAnalysisRuntime, generator: { calls: number }, actorId = ALICE) {
  const before = generator.calls;
  const view = await runtime.service.readView(actorId, "zh");
  if (view.freshness.job === "queued") await runtime.service.runWorker(actorId);
  return { calls: generator.calls - before, view };
}

async function ledgerRows(harness: NetworkHarness) {
  return (await harness.pool.query(`select id, pool, purpose, trigger, status from ai_usage_ledger where workspace_id = $1 order by created_at, id`, [WORKSPACE])).rows;
}

test("SC-03 main: open ×3 with an unchanged version → +2 contacts → +1 contact: generator calls 0, 0, 1 and newContactCount is right", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 20);
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator);
    const first = await openOnce(runtime, generator);
    assert.equal(first.calls, 1, "first snapshot generated once");
    let opens = 0;
    for (let index = 0; index < 3; index += 1) opens += (await openOnce(runtime, generator)).calls;
    const ready = await runtime.service.readView(ALICE, "zh");
    assert.equal(ready.state, "ready");
    assert.equal(ready.contactCount, 20);
    assert.equal(ready.freshness.stale, false);
    await seedContacts(harness, ALICE, 20, 2);
    const plusTwo = await openOnce(runtime, generator);
    assert.equal(plusTwo.view.freshness.stale, true);
    assert.equal(plusTwo.view.freshness.newContactCount, 2);
    assert.equal(plusTwo.view.freshness.job, "none");
    await seedContacts(harness, ALICE, 22, 1);
    const plusThree = await openOnce(runtime, generator);
    assert.deepEqual([opens, plusTwo.calls, plusThree.calls], [0, 0, 1]);
    const after = await runtime.service.readView(ALICE, "zh");
    assert.equal(after.contactCount, 23);
    assert.equal(after.freshness.newContactCount, 0);
    const triggers = (await harness.pool.query(`select version, trigger, status from network_analysis_snapshots where workspace_id = $1 order by version`, [WORKSPACE])).rows;
    assert.deepEqual(triggers.map((row) => [row.version, row.trigger, row.status]), [[1, "first", "superseded"], [2, "threshold", "current"]]);
    // 自动路径 2 次操作都在后台池、各 1 次 HTTP。
    assert.deepEqual((await ledgerRows(harness)).map((row) => [row.pool, row.purpose, row.trigger, row.status]), [
      ["background", "snapshot", "auto", "succeeded"], ["background", "snapshot", "auto", "succeeded"],
    ]);
  });
});

test("SC-03 decideSnapshotRefresh: every branch in order (pure)", () => {
  const current = { goalDigest: "g1", sourceDataVersion: "v2" };
  const snap = (extra: Partial<{ sourceDataVersion: string; goalDigest: string; contactCount: number; retainedCount: number; newContactCount: number }> = {}) =>
    ({ contactCount: 20, goalDigest: "g1", newContactCount: 0, retainedCount: 20, sourceDataVersion: "v1", ...extra });
  assert.deepEqual(decideSnapshotRefresh({ confirmedCount: 2, current, snapshot: snap() }), { kind: "insufficient" });
  assert.deepEqual(decideSnapshotRefresh({ confirmedCount: 3, current, snapshot: null }), { kind: "auto", newContactCount: 3, trigger: "first" });
  assert.deepEqual(decideSnapshotRefresh({ confirmedCount: 20, current, snapshot: snap({ goalDigest: "g0", sourceDataVersion: "v2" }) }), { kind: "fresh" });
  assert.equal((decideSnapshotRefresh({ confirmedCount: 20, current, snapshot: snap({ goalDigest: "g0" }) }) as { trigger: string }).trigger, "goal_changed");
  // 从不足 3 人恢复：快照 30 人里只剩 2 人，新增 1 人（不够 3 也不够 20%）仍自动。
  assert.deepEqual(decideSnapshotRefresh({ confirmedCount: 3, current, snapshot: snap({ contactCount: 30, newContactCount: 1, retainedCount: 2 }) }), { kind: "auto", newContactCount: 1, trigger: "threshold" });
  assert.deepEqual(decideSnapshotRefresh({ confirmedCount: 22, current, snapshot: snap({ newContactCount: 2 }) }), { kind: "stale", newContactCount: 2 });
  assert.equal(decideSnapshotRefresh({ confirmedCount: 23, current, snapshot: snap({ newContactCount: 3 }) }).kind, "auto");
  assert.equal(decideSnapshotRefresh({ confirmedCount: 6, current, snapshot: snap({ contactCount: 5, newContactCount: 1, retainedCount: 5 }) }).kind, "auto", "≥20% of 5 is 1");
  assert.equal(decideSnapshotRefresh({ confirmedCount: 20, current, snapshot: snap({ newContactCount: 0 }) }).kind, "stale", "version moved without new contacts: stale, no call");
});

test("SC-03 goal changed → exactly 1 call; fewer than 3 contacts → insufficient with 0 calls; recovery from 2 back to 3 → exactly 1 call", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 2);
    let goal = "认识 SaaS 决策人";
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator, { goal: () => goal });
    const tooFew = await openOnce(runtime, generator);
    assert.equal(tooFew.calls, 0);
    assert.equal(tooFew.view.state, "insufficient");
    assert.deepEqual(tooFew.view.blocks, []);
    await seedContacts(harness, ALICE, 2, 1);
    assert.equal((await openOnce(runtime, generator)).calls, 1);
    assert.equal((await openOnce(runtime, generator)).calls, 0);
    goal = "找到早期投资人";
    assert.equal((await openOnce(runtime, generator)).calls, 1);
    assert.equal((await harness.pool.query(`select trigger from network_analysis_snapshots where status = 'current'`)).rows[0].trigger, "goal_changed");
    // 快照引用者删到 2 人 → insufficient，0 次；补回到 3 人 → 恰 1 次。
    await harness.deleteRecord("contacts", `${ALICE}:c0`);
    const dropped = await openOnce(runtime, generator);
    assert.equal(dropped.calls, 0);
    assert.equal(dropped.view.state, "insufficient");
    await seedContacts(harness, ALICE, 10, 1);
    assert.equal((await openOnce(runtime, generator)).calls, 1);
    assert.equal((await openOnce(runtime, generator)).calls, 0);
  });
});

test("SC-03 two concurrent opens generate once (single-flight job)", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 5);
    const generator = countingGenerator();
    const a = runtimeFor(harness, generator);
    const b = runtimeFor(harness, generator);
    await Promise.all([openOnce(a, generator), openOnce(b, generator)]);
    await Promise.all([a.service.runWorker(ALICE), b.service.runWorker(ALICE)]);
    assert.equal(generator.calls, 1);
    assert.equal((await ledgerRows(harness)).length, 1);
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_snapshots`)).rows[0].n, 1);
  });
});

function spyLedger(ledger: AiUsageLedger) {
  const counts = { beginCall: 0, endCall: 0, finish: 0, reserve: 0, reserveWith: 0 };
  const spy: AiUsageLedger = {
    ...ledger,
    beginCall: (...args) => { counts.beginCall += 1; return ledger.beginCall(...args); },
    endCall: (...args) => { counts.endCall += 1; return ledger.endCall(...args); },
    finish: (...args) => { counts.finish += 1; return ledger.finish(...args); },
    reserve: (...args) => { counts.reserve += 1; return ledger.reserve(...args); },
    reserveWith: (...args) => { counts.reserveWith += 1; return ledger.reserveWith(...args); },
  };
  return { counts, spy };
}

test("SC-02 R-3: with an externally held operationId generateSnapshotNow records calls only — no reserve, no finish, operation stays reserved", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const generator = countingGenerator();
    const base = runtimeFor(harness, generator);
    const { counts, spy } = spyLedger(base.ledger);
    // 用 spy 账本组装服务（W0048b 计划流水线的形状：调用方已预留用户池计划操作）。
    const service = createNetworkSnapshotService({
      generator,
      inputSource: createPostgresSnapshotInputSource({ client: harness.client, readCurrentPlan: async () => null, workspaceId: WORKSPACE }),
      ledger: spy,
      now: () => NOW,
      readProfile: PROFILE("goal"),
      repository: base.repository,
      versionReader: createSnapshotSourceVersionReader({ client: harness.client, workspaceId: WORKSPACE }),
    });
    const held = await base.ledger.reserve({ actorId: ALICE, idempotencyKey: "plan:bootstrap:1", now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
    assert.ok(held.ok);
    const operationId = held.ok ? held.operationId : "";
    const before = await base.ledger.readOperation(operationId);
    const result = await service.generateSnapshotNow({ actorId: ALICE, now: NOW, operationId, origin: "plan", planId: "plan:1", trigger: "plan" });
    assert.ok(result.snapshot);
    assert.equal(result.snapshot!.origin, "plan");
    assert.equal(result.snapshot!.planId, "plan:1");
    assert.equal(result.callsResponded, 1);
    assert.deepEqual(counts, { beginCall: 1, endCall: 1, finish: 0, reserve: 0, reserveWith: 0 });
    const after = await base.ledger.readOperation(operationId);
    assert.equal(before?.status, "reserved");
    assert.equal(after?.status, "reserved", "the holder settles, not generateSnapshotNow");
    assert.equal(after?.calls, 1);
  });
});

async function planTables(harness: NetworkHarness) {
  const read = async (table: string) => (await harness.pool.query(`select * from ${table} order by id`)).rows.map((row) => JSON.stringify(row));
  return { items: await read("plan_items"), log: await read("plan_log"), plans: await read("plans") };
}

test("SC-03 R-6: on a phase-boundary plan, recompute and the three-layer entry write nothing to plans / plan_items / plan_log and never refine a phase", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 6);
    let refinements = 0;
    const iso = () => NOW.toISOString();
    const planService = createPlanService({
      now: iso,
      phaseRefiner: async () => { refinements += 1; return { inserts: [], weekUpdates: [] }; },
      references: createPostgresPlanReferenceValidator({ actorId: ALICE, client: harness.pool, eventCore: null, workspaceId: WORKSPACE }),
      repository: createPostgresPlanRepository({ pool: harness.pool }),
      scope: { actorId: ALICE, workspaceId: WORKSPACE },
    });
    // 五周前开始：今天在第 2 阶段，「进入新阶段」还没写（阶段边界）。
    await planService.createVersion(planInput({
      items: [{ criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: [] }, kind: "network_need", phaseKey: "p1", title: "SaaS 决策人" }],
      startsOn: "2026-08-24",
    }));
    const guarded: PlanService = {
      ...planService,
      enterCurrentPhase: async () => { throw new Error("enterCurrentPhase must not be called"); },
      getCurrentView: async () => { throw new Error("getCurrentView must not be called"); },
    };
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator, { plan: () => guarded });
    const before = await planTables(harness);
    harness.meter.writes.length = 0;
    await openOnce(runtime, generator);
    assert.equal(generator.calls, 1);
    assert.equal(generator.inputs[0]!.needs.length, 1, "needs come from the read-only getCurrent()");
    const manual = await runtime.service.recomputeManually(ALICE);
    assert.equal(manual.status, "succeeded");
    await runNewContactLayers({ actorId: ALICE, contactIds: [`${ALICE}:c0`], now: NOW, sourceKey: "import:1" }, {
      deferEnrichment: async () => undefined,
      enqueuePlanMatch: async () => ({ state: "enqueued" }),
      enricher: null,
      gate: runtime.ledger,
      readContacts: async () => [],
      refreshSnapshot: (actorId) => runtime.service.refreshAfterChange(actorId),
      writeContact: async () => false,
    });
    assert.deepEqual(await planTables(harness), before);
    assert.deepEqual(harness.meter.writes.filter((statement) => /\b(plans|plan_items|plan_log)\b/.test(statement)), []);
    assert.equal(refinements, 0);
    // 对照：同一夹具上调用会写的 getCurrentView 确实会写「进入新阶段」——证明这是阶段边界。
    await planService.getCurrentView();
    assert.notDeepEqual((await planTables(harness)).log, before.log);
  });
});

test("SC-04 R-2 ① crash after queueing (job without operation_id) → the next worker reserves exactly once", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator);
    const view = await runtime.service.readView(ALICE, "zh"); // 只排队（请求路径不预留）
    assert.equal(view.freshness.job, "queued");
    assert.equal((await ledgerRows(harness)).length, 0, "the request path never reserves");
    // 请求实例在 after() 之前崩溃：job 留在 pending、没有 operation_id。
    const job = (await harness.pool.query(`select status, operation_id from network_analysis_jobs`)).rows[0];
    assert.deepEqual(job, { operation_id: null, status: "pending" });
    assert.equal((await runtime.service.runWorker(ALICE, { owner: "w2" })).status, "succeeded");
    assert.deepEqual((await ledgerRows(harness)).map((row) => row.status), ["succeeded"]);
    assert.equal(generator.calls, 1);
  });
});

test("SC-04 R-2 ② crash after reserving (job holds operation_id, lease expired) → the reclaiming worker reuses that operation; one ledger row in total", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator);
    await runtime.service.readView(ALICE, "zh");
    const claimed = await runtime.repository.claimJob(ALICE, "snapshot", "crashed-worker", NOW, 1_000);
    assert.ok(claimed);
    await runtime.repository.transaction(async (tx) => {
      const reservation = await runtime.ledger.reserveWith(tx, { actorId: ALICE, idempotencyKey: "snapshot:auto:crashed", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" });
      assert.ok(reservation.ok);
      assert.ok(await runtime.repository.setJobOperation(tx, ALICE, "snapshot", "crashed-worker", reservation.ok ? reservation.operationId : ""));
    });
    // 崩溃：租约过期。
    const later = new Date(NOW.getTime() + 5_000);
    const reclaimer = runtimeFor(harness, generator, { now: () => later });
    const outcome = await reclaimer.service.runWorker(ALICE, { owner: "reclaimer" });
    assert.equal(outcome.status, "succeeded");
    const rows = await ledgerRows(harness);
    assert.equal(rows.length, 1, "the operation is reused, not reserved again");
    assert.equal(rows[0].status, "succeeded");
    assert.equal(generator.calls, 1);
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs`)).rows[0].n, 0);
  });
});

test("SC-04 R-2 ③ the second decision is fresh → 0 reservations (a held operation is released) and the job is deleted", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator);
    await openOnce(runtime, generator);
    const rowsBefore = (await ledgerRows(harness)).length;
    // 一条过时的 job（例如另一实例在快照写入前排的队）。
    await runtime.repository.enqueueSnapshotJob(ALICE, "threshold", NOW);
    assert.deepEqual(await runtime.service.runWorker(ALICE, { owner: "w3" }), { reason: "fresh", status: "skipped" });
    assert.equal((await ledgerRows(harness)).length, rowsBefore, "0 new reservations");
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs`)).rows[0].n, 0);
    // 带着操作的 job 二次判定 fresh：该操作按 0 次响应结算为 released。
    await runtime.repository.enqueueSnapshotJob(ALICE, "threshold", NOW);
    await runtime.repository.claimJob(ALICE, "snapshot", "w4", NOW, 1);
    await runtime.repository.transaction(async (tx) => {
      const reservation = await runtime.ledger.reserveWith(tx, { actorId: ALICE, idempotencyKey: "stale-op", now: NOW, pool: "background", purpose: "snapshot", trigger: "auto" });
      await runtime.repository.setJobOperation(tx, ALICE, "snapshot", "w4", reservation.ok ? reservation.operationId : null);
    });
    const later = runtimeFor(harness, generator, { now: () => new Date(NOW.getTime() + 1_000) });
    assert.equal((await later.service.runWorker(ALICE, { owner: "w5" })).status, "skipped");
    const stale = (await harness.pool.query(`select status from ai_usage_ledger where idempotency_key = 'stale-op'`)).rows[0];
    assert.equal(stale.status, "released");
    assert.equal((await later.ledger.readUsageToday(ALICE, NOW)).background, rowsBefore);
    assert.equal(generator.calls, 1);
  });
});

test("SC-04 R-2 ④ lease expired while the first worker is mid-call → no reclaim (the call is in flight), the first worker finishes; exactly 1 HTTP and 1 operation", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const generator = countingGenerator({ started: () => started(), wait: new Promise<void>((resolve) => { release = resolve; }) });
    const runtime = runtimeFor(harness, generator);
    await runtime.service.readView(ALICE, "zh");
    const slow = runtime.service.runWorker(ALICE, { owner: "slow" });
    await startedPromise; // slow 已预留并发出 HTTP（子账 started）
    await harness.pool.query(`update network_analysis_jobs set lease_expires_at = $1 where workspace_id = $2`, [new Date(NOW.getTime() - 1).toISOString(), WORKSPACE]);
    const fast = runtimeFor(harness, generator, { now: () => new Date(NOW.getTime() + 1_000) });
    assert.deepEqual(await fast.service.runWorker(ALICE, { owner: "fast" }), { status: "not_claimed" }, "an in-flight call blocks the reclaim");
    assert.deepEqual(await fast.repository.claimDueJobs("maint", new Date(NOW.getTime() + 1_000), 180_000, 10), [], "the maintenance claim is blocked too");
    release();
    assert.equal((await slow).status, "succeeded");
    assert.equal(generator.calls, 1, "only one paid HTTP request");
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_snapshots`)).rows[0].n, 1);
    assert.deepEqual((await ledgerRows(harness)).map((row) => row.status), ["succeeded"]);
    assert.deepEqual((await harness.pool.query(`select status from ai_usage_calls`)).rows.map((row) => row.status), ["responded"]);
  });
});

test("SC-04 P1-2 an unexpected error after the provider responded (writeSnapshot throws) settles the operation and stops: 1 HTTP, job removed, no endless retries", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const generator = countingGenerator();
    const base = runtimeFor(harness, generator);
    const repository = { ...base.repository, writeSnapshot: async () => { throw new Error("database write failed"); } };
    const service = createNetworkSnapshotService({
      generator,
      inputSource: createPostgresSnapshotInputSource({ client: harness.client, readCurrentPlan: async () => null, workspaceId: WORKSPACE }),
      ledger: base.ledger, log: () => undefined, now: () => NOW, readProfile: PROFILE("goal"), repository,
      versionReader: createSnapshotSourceVersionReader({ client: harness.client, workspaceId: WORKSPACE }),
    });
    await service.readView(ALICE, "zh");
    const outcomes = [];
    for (let index = 0; index < 5; index += 1) outcomes.push((await service.runWorker(ALICE)).status);
    assert.deepEqual(outcomes.slice(0, 3), ["error", "failed", "not_claimed"]);
    assert.equal(generator.calls, 1);
    assert.deepEqual((await ledgerRows(harness)).map((row) => row.status), ["failed"], "the responded call is counted once");
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs`)).rows[0].n, 0);
  });
});

test("SC-04 P2-6 0-response retries reuse the same operation (reopened per attempt) and the job is dropped at the 3rd attempt", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    let calls = 0;
    const failing: NetworkSnapshotGenerator = {
      billable: true, model: "m", promptVersion: "test-v1", provider: "deepseek",
      async generate() { calls += 1; throw new SnapshotGeneratorError("PROVIDER_TIMEOUT", "timeout", null); },
    };
    const runtime = runtimeFor(harness, failing);
    await runtime.service.readView(ALICE, "zh");
    const outcomes = [];
    for (let index = 0; index < 4; index += 1) outcomes.push(await runtime.service.runWorker(ALICE));
    assert.deepEqual(outcomes.map((outcome) => outcome.status), ["retry", "retry", "retry", "not_claimed"]);
    assert.deepEqual(outcomes.slice(0, 3).map((outcome) => (outcome as { dropped: boolean }).dropped), [false, false, true]);
    assert.equal(calls, 3);
    const ledger = await ledgerRows(harness);
    assert.equal(ledger.length, 1, "one operation, reopened per attempt");
    assert.equal(ledger[0].status, "released");
    assert.deepEqual((await harness.pool.query(`select epoch, status from ai_usage_calls order by seq`)).rows, [
      { epoch: 1, status: "no_response" }, { epoch: 2, status: "no_response" }, { epoch: 3, status: "no_response" },
    ]);
  });
});

test("SC-02 DeepSeek generator: request has thinking disabled + json_object; a started call row exists before HTTP; tokens after; timeout → no_response → released", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const seen: { body: Record<string, unknown>; callsAtSend: unknown[] }[] = [];
    let mode: "ok" | "hang" = "ok";
    const fetchImplementation = (async (_url: string, init: RequestInit) => {
      const callsAtSend = (await harness.pool.query(`select status from ai_usage_calls`)).rows;
      seen.push({ body: JSON.parse(String(init.body)), callsAtSend });
      if (mode === "hang") {
        await new Promise<void>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      const input = JSON.parse((JSON.parse(String(init.body)).messages[1] as { content: string }).content) as { contacts: { id: string; name: string }[] };
      const ids = input.contacts.map((contact) => contact.id);
      const content = JSON.stringify({ blocks: [
        { contactIds: ids.slice(0, 2), en: "Diagnosis", kind: "diagnosis", zh: "诊断" },
        { contactIds: [ids[0]], en: "Insight one", kind: "insight", zh: "洞察一", score: 99 },
        { contactIds: [ids[1], "invented"], en: "Insight two", kind: "insight", zh: "洞察二" },
      ] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { completion_tokens: 222, prompt_tokens: 1111 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const generator = createDeepseekSnapshotGenerator({ apiKey: "test-key", fetchImplementation, timeoutMs: 200 });
    const runtime = runtimeFor(harness, generator);
    const held = await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "manual:1", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    const operationId = held.ok ? held.operationId : "";
    const result = await runtime.service.generateSnapshotNow({ actorId: ALICE, now: NOW, operationId, origin: "standalone", trigger: "manual" });
    assert.ok(result.snapshot);
    assert.equal(seen[0]!.body.thinking && (seen[0]!.body.thinking as { type: string }).type, "disabled");
    assert.deepEqual(seen[0]!.body.response_format, { type: "json_object" });
    assert.deepEqual(seen[0]!.callsAtSend, [{ status: "started" }], "the call row is inserted before the HTTP request");
    assert.deepEqual((await harness.pool.query(`select status, input_tokens, output_tokens from ai_usage_calls where operation_id = $1`, [operationId])).rows, [{ input_tokens: 1111, output_tokens: 222, status: "responded" }]);
    await runtime.ledger.finish(operationId, "succeeded");

    mode = "hang";
    const second = await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "manual:2", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    const secondId = second.ok ? second.operationId : "";
    const timedOut = await runtime.service.generateSnapshotNow({ actorId: ALICE, now: NOW, operationId: secondId, origin: "standalone", trigger: "manual" });
    assert.equal(timedOut.snapshot, null);
    assert.equal(timedOut.callsResponded, 0);
    assert.equal(timedOut.error, "provider_failed");
    assert.deepEqual((await harness.pool.query(`select status from ai_usage_calls where operation_id = $1`, [secondId])).rows, [{ status: "no_response" }]);
    await runtime.ledger.finish(secondId, "failed");
    assert.equal((await runtime.ledger.readOperation(secondId))?.status, "released");
    assert.equal((await runtime.ledger.readUsageToday(ALICE, NOW)).manual, 1);
  });
});

test("SC-01 other actors never see Alice's snapshot", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    await seedContacts(harness, BOB, 0, 1);
    const generator = countingGenerator();
    const runtime = runtimeFor(harness, generator);
    await openOnce(runtime, generator);
    const bob = await runtime.service.readView(BOB, "zh");
    assert.equal(bob.state, "insufficient");
    assert.deepEqual(bob.blocks, []);
    assert.equal(await runtime.repository.getCurrent(BOB), null);
  });
});

test("SC-02 P2-2 a non-2xx provider response counts as responded (tokens 0) and is billed; only a missing response is no_response", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    const fetchImplementation = (async () => new Response("upstream busy", { status: 503 })) as unknown as typeof fetch;
    const runtime = runtimeFor(harness, createDeepseekSnapshotGenerator({ apiKey: "k", fetchImplementation, timeoutMs: 500 }));
    const held = await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "m503", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    const operationId = held.ok ? held.operationId : "";
    const result = await runtime.service.generateSnapshotNow({ actorId: ALICE, now: NOW, operationId, origin: "standalone", trigger: "manual" });
    assert.equal(result.callsResponded, 1);
    assert.equal(result.error, "provider_failed");
    await runtime.ledger.finish(operationId, "failed");
    assert.deepEqual((await harness.pool.query(`select status, input_tokens, output_tokens from ai_usage_calls`)).rows, [{ input_tokens: 0, output_tokens: 0, status: "responded" }]);
    assert.equal((await runtime.ledger.readOperation(operationId))?.status, "failed");
    assert.equal((await runtime.ledger.readUsageToday(ALICE, NOW)).manual, 1, "billed");
  });
});

test("SC-02 P2-3 the model only sees aliases; the response is mapped back to real ids before validation", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 0, 4);
    let sent = "";
    const fetchImplementation = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      const content = JSON.stringify({ blocks: [
        { contactIds: ["C1", "C2"], en: "Two of your contacts lead the way.", kind: "diagnosis", zh: "两位联系人走在前面。" },
        { contactIds: ["C1"], en: "One insight.", kind: "insight", zh: "一条洞察。" },
        { contactIds: ["C2"], en: "Another insight.", kind: "insight", zh: "另一条洞察。" },
        { contactIds: ["C3"], en: "Mentions C3 in text.", kind: "insight", zh: "提到了 C3。" },
      ] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { completion_tokens: 10, prompt_tokens: 20 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const runtime = runtimeFor(harness, createDeepseekSnapshotGenerator({ apiKey: "k", fetchImplementation }));
    const held = await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "alias", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    const result = await runtime.service.generateSnapshotNow({ actorId: ALICE, now: NOW, operationId: held.ok ? held.operationId : "", origin: "standalone", trigger: "manual" });
    assert.ok(!sent.includes(`${ALICE}:c`), "no raw contact id leaves the server");
    assert.ok(result.snapshot);
    const evidence = result.snapshot!.blocks.flatMap((block) => block.evidence.contactIds);
    assert.ok(evidence.every((id) => id.startsWith(`${ALICE}:c`)));
    assert.equal(result.snapshot!.blocks.filter((block) => block.kind === "insight").length, 2, "the block that wrote an alias into its text is dropped");
  });
});
