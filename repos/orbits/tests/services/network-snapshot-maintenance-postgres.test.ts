/**
 * W0048a SC-W0048a-04（真实 PostgreSQL）：`network-snapshot` 维护任务。
 *
 * - 后台池满时三层入口的补全顺延到次日 00:00 东京（job kind=enrichment，0 次调用）；次日维护任务领取后补全写回、
 *   job 删除、计入次日后台池；
 * - memo 提取有界补扫：没有提取记录的 memo 被补跑一次（后台池 1 次操作），再跑一轮没有候选；
 * - 表未迁移时整轮 skipped。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { BACKGROUND_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { runMemoExtraction } from "../../features/contacts/memo-extraction/job";
import type { MemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { listMemoExtractionRescanCandidates } from "../../features/contacts/memo-extraction/rescan";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import type { TextEnricher, TextEnrichmentContactInput } from "../../features/contacts/enrichment/text-enrichment";
import { createNewContactLayersDeps } from "../../features/network-analysis/layers-runtime";
import { createNetworkSnapshotMaintenanceTask } from "../../features/network-analysis/maintenance-task";
import { runNewContactLayers } from "../../features/network-analysis/new-contact-layers";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { createMockSnapshotGenerator } from "../../features/network-analysis/snapshot-generator";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-02T03:00:00.000Z");
const TOMORROW = new Date("2026-10-02T15:00:05.000Z");

function enricher(): TextEnricher & { calls: number } {
  const value = {
    calls: 0,
    model: "fake-text",
    providerName: "deepseek-chat-completions",
    async enrich({ contacts }: { contacts: readonly TextEnrichmentContactInput[] }) {
      value.calls += 1;
      return {
        model: "fake-text",
        proposals: contacts.map((contact) => ({ contactId: contact.contactId, primaryIndustryId: "finance_investment" as const, region: null, secondaryIndustryId: null, seniorityLevel: null })),
        usage: { inputTokens: 90, latencyMs: 1, outputTokens: 12 },
      };
    },
  };
  return value;
}

function runtimeAt(harness: NetworkHarness, at: Date) {
  return createNetworkAnalysisRuntime({
    client: harness.client, generator: createMockSnapshotGenerator(), now: () => at, readCurrentPlan: async () => null,
    readProfile: async () => ({ goal: "goal", profileSection: { profile: { relationshipGoal: "goal" }, state: "ready" } }), workspaceId: WORKSPACE,
  });
}

test("SC-04 maintenance: enrichment deferred by a full background pool runs the next Tokyo day (0 calls today, written tomorrow)", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    for (let index = 0; index < 5; index += 1) await harness.addContact(ALICE, `c${index}`);
    const store = createPostgresLiveRecordStore({ client: harness.pool as never });
    const text = enricher();
    const today = runtimeAt(harness, NOW);
    for (let index = 0; index < BACKGROUND_POOL_DAILY_LIMIT; index += 1) {
      await today.ledger.reserve({ actorId: ALICE, idempotencyKey: `bg:${index}`, now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
    }
    const layersToday = createNewContactLayersDeps({ enricher: text, runtime: today, store });
    const result = await runNewContactLayers({ actorId: ALICE, contactIds: ["c0", "c1", "c2", "c3", "c4"], now: NOW, sourceKey: "import:1" }, layersToday);
    assert.equal(result.enrichment, "deferred");
    assert.equal(result.retryOn, "2026-10-02T15:00:00.000Z");
    assert.equal(text.calls, 0);
    const job = (await harness.pool.query(`select kind, status, not_before, contact_ids from network_analysis_jobs where kind = 'enrichment'`)).rows[0];
    assert.equal(job.status, "deferred");
    assert.equal(new Date(job.not_before).toISOString(), "2026-10-02T15:00:00.000Z");
    assert.equal(job.contact_ids.length, 5);
    assert.equal((await harness.pool.query(`select count(*)::int as n from plan_match_jobs`)).rows[0].n, 1, "rule matching enqueued (0 AI)");

    // 今天再跑维护任务：job 未到期，不领取。
    const tomorrowRuntime = runtimeAt(harness, TOMORROW);
    const task = (runtime: typeof today) => createNetworkSnapshotMaintenanceTask({
      resolve: () => ({ layers: createNewContactLayersDeps({ enricher: text, runtime, store }), runtime }),
    });
    const todayPass = await task(today).run({ deadline: Date.now() + 30_000, now: () => NOW });
    assert.equal((todayPass as Record<string, number>).enrichment, 0);
    assert.equal(text.calls, 0);
    const tomorrowPass = await task(tomorrowRuntime).run({ deadline: Date.now() + 30_000, now: () => TOMORROW });
    assert.equal((tomorrowPass as Record<string, number>).enrichment, 1);
    assert.equal(text.calls, 1);
    const written = (await harness.pool.query(`select payload->>'primaryIndustryId' as industry from orbit_records where collection_name = 'contacts' and user_id = $1 order by record_id`, [ALICE])).rows;
    assert.ok(written.every((row) => row.industry === "finance_investment"));
    assert.equal((await harness.pool.query(`select count(*)::int as n from network_analysis_jobs where kind = 'enrichment'`)).rows[0].n, 0);
    const ops = (await harness.pool.query(`select usage_day::text as day, pool, purpose, status from ai_usage_ledger where purpose = 'enrichment'`)).rows;
    assert.deepEqual(ops, [{ day: "2026-10-03", pool: "background", purpose: "enrichment", status: "succeeded" }]);
  });
});

test("SC-04 maintenance: bounded memo-extraction rescan runs memos without an extraction record once, in the background pool", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await harness.addContact(ALICE, "c1", { organization: "Cloudline", role: "CTO" });
    await harness.insertRecord({
      collection: "contact_detail_states", id: `contact-detail:${ALICE}:c1`, userId: ALICE,
      payload: { actorId: ALICE, contactId: "c1", notes: [{ body: "Met at the expo; they build SaaS.", createdAt: "2026-10-01T00:00:00.000Z", kind: "memo", noteId: "note:live-contact-detail-update:m1" }] },
    });
    const pgStore = createPostgresLiveRecordStore({ client: harness.pool as never });
    const memoStore = createLiveRecordMemoExtractionStore({ store: pgStore as never, workspaceId: WORKSPACE });
    let providerCalls = 0;
    const provider = {
      model: "fake-memo", providerName: "deepseek-chat-completions",
      async extract() { providerCalls += 1; return { output: { eventTypes: ["met"], offering: ["SaaS"], seeking: [], topics: [] }, usage: { inputTokens: 150, latencyMs: 2, outputTokens: 20 } }; },
    } as unknown as MemoExtractionProvider;
    const runtime = runtimeAt(harness, NOW);
    const task = createNetworkSnapshotMaintenanceTask({
      resolve: () => ({
        layers: createNewContactLayersDeps({ enricher: null, runtime, store: pgStore }),
        listMemoCandidates: (now) => listMemoExtractionRescanCandidates(harness.client, { now, workspaceId: WORKSPACE }),
        runMemoExtraction: (job) => runMemoExtraction(job, { applyValues: async () => ["offering"], gate: runtime.ledger, now: () => NOW, provider, store: memoStore }),
        runtime,
      }),
    });
    const first = await task.run({ deadline: Date.now() + 30_000, now: () => NOW });
    assert.equal((first as Record<string, number>).memoRescanned, 1);
    assert.equal(providerCalls, 1);
    const second = await task.run({ deadline: Date.now() + 30_000, now: () => NOW });
    assert.equal((second as Record<string, number>).memoRescanned, 0);
    assert.equal(providerCalls, 1);
    assert.deepEqual((await harness.pool.query(`select pool, purpose, status from ai_usage_ledger`)).rows, [{ pool: "background", purpose: "memo_extraction", status: "succeeded" }]);
  });
});

test("SC-04 maintenance: without the tables the pass is skipped (schema_missing)", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await harness.pool.query("drop table network_analysis_jobs");
    const runtime = runtimeAt(harness, NOW);
    const task = createNetworkSnapshotMaintenanceTask({ resolve: () => ({ layers: createNewContactLayersDeps({ enricher: null, runtime, store: createPostgresLiveRecordStore({ client: harness.pool as never }) }), runtime }) });
    assert.deepEqual(await task.run({ deadline: Date.now() + 30_000, now: () => NOW }), { skipped: "schema_missing" });
  });
});
