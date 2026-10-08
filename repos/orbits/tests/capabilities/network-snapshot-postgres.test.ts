/**
 * W0048a SC-W0048a-01（真实 PostgreSQL）：快照存储与读取 + 两个接口。
 *
 * - 主证据：本机测试库跑迁移后写入一份新快照，`GET /api/network/snapshot?lang=zh` 返回请求语言的 blocks、
 *   freshness、quota；每人恰好一份 current，他人读不到；
 * - 迁移可重复执行（第二次 no-op，改 SQL 报 checksum）；写新快照在一个事务里归档旧版并修剪到 12 版；
 * - GET 只取 narrative_<lang> 与 evidence、不取 included_contact_ids；已删除联系人从依据剔除、剔空的块不返回；
 *   quota.manual／user／background 当日用量正确；示例模式 0 次读写；
 * - 手动重新分析：第 4 次 429 MANUAL_REFRESH_LIMIT、用户池 10 次用满 429 USER_DAILY_LIMIT，都 0 次调用。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createNetworkSnapshotRouteHandlers } from "../../app/api/network/snapshot/handlers";
import { NETWORK_ANALYSIS_MIGRATIONS, networkAnalysisMigrationDefinitions, runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { createNetworkAnalysisRuntime, type NetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import type { NetworkSnapshotGenerator, SnapshotInput } from "../../features/network-analysis/snapshot-generator";
import { buildMockSnapshotContent } from "../../features/network-analysis/snapshot-generator";
import type { NetworkSnapshotView } from "../../features/network-analysis/contract";
import { ALICE, BOB, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z");

function generatorOf(content: (input: SnapshotInput) => string, billable = true): NetworkSnapshotGenerator & { calls: number } {
  const generator = {
    billable,
    calls: 0,
    model: "fake-model",
    promptVersion: "test-v1",
    provider: "deepseek" as const,
    async generate(input: SnapshotInput) {
      generator.calls += 1;
      return { content: content(input), usage: billable ? { inputTokens: 300, outputTokens: 60 } : null };
    },
  };
  return generator;
}

function runtimeFor(harness: NetworkHarness, generator: NetworkSnapshotGenerator): NetworkAnalysisRuntime {
  return createNetworkAnalysisRuntime({
    client: harness.client, generator, now: () => NOW, readCurrentPlan: async () => null,
    readProfile: async () => ({ goal: "goal", profileSection: { profile: { relationshipGoal: "goal" }, state: "ready" } }), workspaceId: WORKSPACE,
  });
}

function routes(runtime: NetworkAnalysisRuntime | null, options: { demo?: boolean; actor?: string; resolved?: { count: number }; goalMarks?: string[] } = {}) {
  const tasks: (() => Promise<void>)[] = [];
  const handlers = createNetworkSnapshotRouteHandlers({
    after: (task) => { tasks.push(task); },
    // W0051：手动重新分析成功后统一标目标已变的洞察（这里只记录调用；真实标记见 contact-insights-postgres）。
    markInsightsGoalDirty: async (_runtime, actorId) => { options.goalMarks?.push(actorId); },
    isDemo: async () => options.demo ?? false,
    resolveActor: async () => ({ id: options.actor ?? ALICE }),
    runtime: () => {
      if (options.resolved) options.resolved.count += 1;
      return runtime;
    },
  });
  return { handlers, runAfter: async () => { while (tasks.length) await tasks.shift()!(); } };
}

async function getView(handlers: ReturnType<typeof createNetworkSnapshotRouteHandlers>, lang = "zh"): Promise<NetworkSnapshotView> {
  const response = await handlers.GET(new Request(`http://localhost/api/network/snapshot?lang=${lang}`));
  assert.equal(response.status, 200);
  return ((await response.json()) as { data: NetworkSnapshotView }).data;
}

async function seedContacts(harness: NetworkHarness, actorId: string, count: number) {
  for (let index = 0; index < count; index += 1) await harness.addContact(actorId, `${actorId}:c${index}`, { primaryIndustryId: "technology_internet" });
}

test("SC-01 main: after migrating the local test database a snapshot is written; GET returns the requested language, freshness and quota; one current per person; others read nothing", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 4);
    const generator = generatorOf(buildMockSnapshotContent);
    const runtime = runtimeFor(harness, generator);
    const { handlers, runAfter } = routes(runtime);
    const first = await getView(handlers);
    assert.equal(first.state, "none");
    assert.equal(first.freshness.job, "queued");
    await runAfter(); // after()：worker 领取并生成
    const zh = await getView(handlers, "zh");
    assert.equal(zh.state, "ready");
    assert.equal(zh.contactCount, 4);
    assert.ok(zh.blocks.length >= 3);
    assert.ok(zh.blocks.every((block) => typeof block.text === "string" && /[一-鿿]/.test(block.text)));
    assert.deepEqual(zh.freshness, { job: "none", newContactCount: 0, stale: false });
    assert.deepEqual(zh.quota, { background: { limit: 60, usedToday: 1 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } });
    const en = await getView(handlers, "en");
    assert.ok(en.blocks.every((block) => !/[一-鿿]/.test(block.text) || block.text.includes("Name")));
    assert.deepEqual(en.blocks.map((block) => block.key), zh.blocks.map((block) => block.key));
    // 每人恰好一份 current（部分唯一索引）；Bob 读不到。
    assert.equal((await runtime.service.recomputeManually(ALICE)).status, "succeeded");
    const statuses = (await harness.pool.query(`select status from network_analysis_snapshots where actor_id = $1 order by version`, [ALICE])).rows.map((row) => row.status);
    assert.deepEqual(statuses, ["superseded", "current"]);
    await assert.rejects(harness.pool.query(`update network_analysis_snapshots set status = 'current' where workspace_id = $1`, [WORKSPACE]), /network_analysis_snapshots_one_current/);
    const bob = routes(runtime, { actor: BOB });
    const bobView = await getView(bob.handlers);
    assert.equal(bobView.state, "insufficient");
    assert.deepEqual(bobView.blocks, []);
  });
});

test("SC-01 migrations are repeatable (second run is a no-op) and a changed published SQL fails the checksum", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await runNetworkAnalysisMigrations(harness.pool);
    const rows = (await harness.pool.query(`select version, checksum from network_analysis_schema_migrations`)).rows;
    assert.deepEqual(rows, NETWORK_ANALYSIS_MIGRATIONS.map((migration) => ({ checksum: migration.checksum, version: migration.version })));
    const tampered = networkAnalysisMigrationDefinitions().map((migration) => ({ ...migration, sql: `${migration.sql}\n-- edited` }));
    await assert.rejects(runNetworkAnalysisMigrations(harness.pool, tampered), /checksum mismatch/);
    for (const table of ["ai_usage_ledger", "ai_usage_calls", "network_analysis_snapshots", "network_analysis_jobs"]) {
      assert.equal((await harness.pool.query(`select to_regclass($1) is not null as present`, [table])).rows[0].present, true, table);
    }
  });
});

test("SC-01 writing a new snapshot archives the old one and prunes to 12 versions in one transaction", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const runtime = runtimeFor(harness, generatorOf(buildMockSnapshotContent));
    const write = (index: number, provider: string = "mock") => runtime.repository.writeSnapshot({
      actorId: ALICE,
      blocks: [{ evidence: { contactIds: ["c1"], recordIds: [] }, key: "diagnosis-1", kind: "diagnosis", text: { en: `v${index}`, zh: `第${index}版` } }],
      generatedAt: new Date(NOW.getTime() + index),
      generator: { model: "m", promptVersion: "p", provider: provider as "mock" },
      goalDigest: "a".repeat(64),
      includedContactIds: ["c1", "c2", "c1"],
      operationId: null,
      origin: "standalone",
      planId: null,
      sourceDataVersion: "b".repeat(64),
      trigger: "manual",
    });
    for (let index = 1; index <= 13; index += 1) await write(index);
    const rows = (await harness.pool.query(`select version, status, contact_count from network_analysis_snapshots where actor_id = $1 order by version`, [ALICE])).rows;
    assert.equal(rows.length, 12);
    assert.deepEqual(rows.map((row) => row.version), Array.from({ length: 12 }, (_, index) => index + 2));
    assert.deepEqual(rows.filter((row) => row.status === "current").map((row) => row.version), [13]);
    assert.equal(rows[0].contact_count, 2, "contact_count = cardinality(included_contact_ids)");
    // 同一事务：插入失败（违反 CHECK）时归档与修剪一起回滚，current 仍是第 13 版。
    await assert.rejects(write(14, "bogus"));
    const after = (await harness.pool.query(`select version, status from network_analysis_snapshots where actor_id = $1 order by version`, [ALICE])).rows;
    assert.equal(after.length, 12);
    assert.deepEqual(after.filter((row) => row.status === "current").map((row) => row.version), [13]);
    const current = await runtime.repository.getCurrent(ALICE, { languages: ["zh"] });
    assert.equal(current?.blocks[0]?.text.zh, "第13版");
    assert.equal(current?.blocks[0]?.text.en, "", "only the requested language column is read");
  });
});

test("SC-01 GET reads only narrative_<lang> + evidence (never included_contact_ids); deleted contacts are removed from evidence and an emptied block is dropped; quota is per operation", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 6);
    const id = (index: number) => `${ALICE}:c${index}`;
    const generator = generatorOf(() => JSON.stringify({ blocks: [
      { contactIds: [id(0), id(1)], en: "Diagnosis", kind: "diagnosis", zh: "诊断" },
      { contactIds: [id(2)], en: "Only c2", kind: "insight", zh: "只有 c2" },
      { contactIds: [id(3)], en: "Only c3", kind: "insight", zh: "只有 c3" },
    ] }));
    const runtime = runtimeFor(harness, generator);
    const { handlers, runAfter } = routes(runtime);
    await getView(handlers);
    await runAfter();
    await harness.deleteRecord("contacts", id(2));
    await harness.deleteRecord("contacts", id(1));
    harness.meter.statements.length = 0;
    harness.meter.bytes = 0;
    const view = await getView(handlers, "zh");
    assert.deepEqual(view.blocks.map((block) => [block.key, block.evidence.contactIds]), [["diagnosis-1", [id(0)]], ["insight-2", [id(3)]]]);
    const viewStatements = harness.meter.statements.filter((statement) => statement.includes("network-snapshot:view"));
    assert.equal(viewStatements.length, 1);
    assert.ok(!viewStatements[0]!.includes("included_contact_ids"));
    assert.ok(!viewStatements[0]!.includes("narrative_en"));
    assert.ok(harness.meter.statements.every((statement) => !/select[^;]*\bincluded_contact_ids\b[^;]*from network_analysis_snapshots s/.test(statement) || statement.includes("refresh-state")));
    // 当日用量（单位「次操作」）：后台 1（自动）+ 2；用户池手动 1 + 计划 1。
    for (const key of ["bg:a", "bg:b"]) await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: key, now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
    await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "m", now: NOW, pool: "user", purpose: "snapshot", trigger: "manual" });
    await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "p", now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
    await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: "s", now: NOW, pool: "system", purpose: "enrichment", trigger: "auto" });
    const quota = (await getView(handlers)).quota;
    assert.deepEqual(quota, { background: { limit: 60, usedToday: 3 }, manual: { limit: 3, usedToday: 1 }, user: { limit: 10, usedToday: 2 } });
  });
});

test("SC-01 demo mode: GET and recompute read and write nothing and reserve nothing", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 4);
    const generator = generatorOf(buildMockSnapshotContent);
    const runtime = runtimeFor(harness, generator);
    const resolved = { count: 0 };
    const { handlers } = routes(runtime, { demo: true, resolved });
    harness.meter.statements.length = 0;
    const view = await getView(handlers);
    assert.equal(view.state, "unavailable");
    const recompute = await handlers.recompute(new Request("http://localhost/api/network/snapshot/recompute", { body: "{}", method: "POST" }));
    assert.equal(recompute.status, 403);
    assert.equal(resolved.count, 0, "the runtime is never resolved");
    assert.deepEqual(harness.meter.statements, [], "0 database statements");
    assert.equal(generator.calls, 0);
  });
});

test("SC-04 recompute: the 4th manual run is 429 MANUAL_REFRESH_LIMIT and the full user pool is 429 USER_DAILY_LIMIT, both with 0 calls; fewer than 3 contacts is 409", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await seedContacts(harness, ALICE, 4);
    await seedContacts(harness, BOB, 4);
    await harness.addContact("actor:carol", "carol:c0");
    const generator = generatorOf(buildMockSnapshotContent);
    const runtime = runtimeFor(harness, generator);
    const goalMarks: string[] = [];
    const post = (actor: string) => routes(runtime, { actor, goalMarks }).handlers.recompute(new Request("http://localhost/api/network/snapshot/recompute?lang=zh", { body: "{}", method: "POST" }));
    for (let index = 0; index < 3; index += 1) {
      const response = await post(ALICE);
      assert.equal(response.status, 200);
      const body = (await response.json()) as { data: NetworkSnapshotView };
      assert.equal(body.data.state, "ready");
      assert.equal(body.data.quota.manual.usedToday, index + 1);
    }
    assert.equal(generator.calls, 3);
    // W0051（W51-1）：每次成功的手动重新分析后统一标一次目标已变的洞察；被拒的请求不标。
    assert.deepEqual(goalMarks, [ALICE, ALICE, ALICE]);
    const fourth = await post(ALICE);
    assert.equal(fourth.status, 429);
    assert.equal(((await fourth.json()) as { error: { context: { reason: string } } }).error.context.reason, "MANUAL_REFRESH_LIMIT");
    assert.equal(generator.calls, 3, "0 calls on the 4th");
    // Bob：用户池 10 次操作用满（计划、洞察重新生成），手动重新分析 → USER_DAILY_LIMIT。
    for (let index = 0; index < 10; index += 1) {
      await runtime.ledger.reserve({ actorId: BOB, idempotencyKey: `plan:${index}`, now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
    }
    const bob = await post(BOB);
    assert.equal(bob.status, 429);
    assert.equal(((await bob.json()) as { error: { context: { reason: string } } }).error.context.reason, "USER_DAILY_LIMIT");
    assert.equal(generator.calls, 3);
    const carol = await post("actor:carol");
    assert.equal(carol.status, 409);
    assert.deepEqual(goalMarks, [ALICE, ALICE, ALICE]);
    assert.equal((await harness.pool.query(`select count(*)::int as n from ai_usage_ledger where actor_id = 'actor:carol'`)).rows[0].n, 0);
  });
});
