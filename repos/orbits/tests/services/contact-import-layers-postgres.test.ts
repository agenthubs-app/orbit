/**
 * W0053 SC-W0053-03（真实 PostgreSQL）：导入提交后走 W0048a 三层更新入口（真实入口 + 真实账本 + 真实计划与匹配表，
 * 模型用 mock enricher，不出网），导入前后 plans／plan_items／plan_log 逐行相等，只新增 pending 的「待确认」候选；
 * 文件里明确的国家按规则写 `card`、模型提议不覆盖；后台池用满时入口顺延，导入记录显示「补全明天继续」、联系人照常可用；
 * 源码扫描：导入模块不直接调用模型、账本或计划写方法。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { Pool } from "pg";

import { BACKGROUND_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { runContactInsightsMigrations } from "../../features/contacts/insights/migrations";
import type { TextEnricher, TextEnrichmentContactInput } from "../../features/contacts/enrichment/text-enrichment";
import { runContactImportMigrations } from "../../features/contacts/import/migrations";
import { createContactImportService, importContactId } from "../../features/contacts/import/service";
import { createNewContactLayersDeps } from "../../features/network-analysis/layers-runtime";
import { runNewContactLayers } from "../../features/network-analysis/new-contact-layers";
import { createNetworkAnalysisRuntime } from "../../features/network-analysis/runtime";
import { createMockSnapshotGenerator } from "../../features/network-analysis/snapshot-generator";
import { runMatchJobForBatch } from "../../features/plans/match-worker";
import { createPostgresPlanMatchRepository } from "../../features/plans/matching-repository";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { steppingClock } from "../support/plan-fixture";
import { matchingPlanInput, NEED_SAAS } from "../support/plan-matching-harness";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../support/network-analysis-harness";

const NOW = new Date("2026-10-03T03:00:00.000Z"); // 东京 2026-10-03 12:00

/** mock 模型：每人都提议 SaaS 行业 + 经理职级 + 一个与文件不同的地区（用来证明 `card` 不被 `ai` 覆盖）。 */
function mockEnricher(): TextEnricher & { calls: number; seen: string[][] } {
  const value = {
    calls: 0,
    model: "mock-text",
    providerName: "mock",
    seen: [] as string[][],
    async enrich({ contacts }: { contacts: readonly TextEnrichmentContactInput[] }) {
      value.calls += 1;
      value.seen.push(contacts.map((contact) => contact.contactId));
      return {
        model: "mock-text",
        proposals: contacts.map((contact) => ({
          contactId: contact.contactId,
          primaryIndustryId: "technology_internet" as const,
          region: { city: "Singapore", countryCode: "SG" },
          secondaryIndustryId: "technology_internet.enterprise_software" as const,
          seniorityLevel: "manager" as const,
        })),
        usage: { inputTokens: 100, latencyMs: 1, outputTokens: 20 },
      };
    },
  };
  return value;
}

async function planRows(pool: Pool) {
  const read = async (table: string) => (await pool.query(`select * from ${table} order by 1, 2, 3`)).rows;
  return { plan_items: await read("plan_items"), plan_log: await read("plan_log"), plans: await read("plans") };
}

async function setup(harness: NetworkHarness, enricher: TextEnricher) {
  await runContactInsightsMigrations(harness.pool);
  await runContactImportMigrations(harness.pool);
  const planService = createPlanService({
    now: steppingClock(),
    references: createPostgresPlanReferenceValidator({ actorId: ALICE, client: harness.pool, eventCore: null, workspaceId: WORKSPACE }),
    repository: createPostgresPlanRepository({ pool: harness.pool }),
    scope: { actorId: ALICE, workspaceId: WORKSPACE },
  });
  const plan = await planService.createVersion(matchingPlanInput());
  const runtime = createNetworkAnalysisRuntime({
    client: harness.client, generator: createMockSnapshotGenerator(), now: () => NOW, readCurrentPlan: async () => null,
    readProfile: async () => ({ goal: "goal", profileSection: { profile: { relationshipGoal: "goal" }, state: "ready" } }), workspaceId: WORKSPACE,
  });
  const store = createPostgresLiveRecordStore({ client: harness.pool as never });
  const layerResults: Awaited<ReturnType<typeof runNewContactLayers>>[] = [];
  const service = createContactImportService({
    client: harness.client,
    log: () => undefined,
    now: () => NOW,
    runLayers: async (input) => {
      const result = await runNewContactLayers(input, createNewContactLayersDeps({ enricher, runtime, store }));
      layerResults.push(result);
      return result;
    },
    schedule: () => undefined, // 由测试显式 runPendingLayers（等同 after()／维护任务）
    workspaceId: WORKSPACE,
  });
  return { layerResults, plan, runtime, service };
}

const CSV = [
  "Name,Company,Title,Email,Country",
  "Ken Sato,Cloudline KK,SaaS Division Head,ken@example.jp,Japan",
  "Mia Chen,Nexa AI,Researcher,mia@example.com,",
  "Leo Park,Tokyo Trading,Channel Manager,leo@example.com,",
].join("\n");

test("SC-03 import → layers: one entry call per write transaction; enrichment through the background pool (1 op, 1 cost row); pending candidates only; plans/plan_items/plan_log unchanged; file country stays `card`", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const enricher = mockEnricher();
    const { layerResults, plan, service } = await setup(harness, enricher);
    const before = await planRows(harness.pool);
    assert.ok(before.plan_items.length >= 3 && before.plans.length === 1 && before.plan_log.length >= 1);

    const uploaded = await service.upload({ actorId: ALICE, bytes: new TextEncoder().encode(CSV), fileName: "team.csv", idempotencyKey: randomUUID(), kind: "csv" });
    const committed = await service.commit(ALICE, uploaded.batch.id, { confirmationIntentId: randomUUID(), mergeConfirmations: [] });
    assert.deepEqual(committed.batch.counts, { created: 3, failed: 0, merged: 0, skipped: 0 });
    assert.equal(committed.batch.followUp.state, "pending");
    assert.equal(await service.runPendingLayers(ALICE, uploaded.batch.id), "done");
    assert.equal(layerResults.length, 1, "one write transaction → one entry call");
    assert.equal(layerResults[0]!.enrichment, "done");
    assert.equal(layerResults[0]!.operations, 1);
    assert.equal(enricher.calls, 1, "≤20 people = 1 enrichment call");
    const ids = [1, 2, 3].map((seq) => importContactId(ALICE, uploaded.batch.id, seq));
    assert.deepEqual([...enricher.seen[0]!].sort(), [...ids].sort());

    const ledger = (await harness.pool.query("select pool, purpose, trigger, status from ai_usage_ledger")).rows;
    assert.deepEqual(ledger, [{ pool: "background", purpose: "enrichment", status: "succeeded", trigger: "auto" }]);
    assert.equal((await harness.pool.query("select count(*)::int as n from ai_usage_calls")).rows[0].n, 1, "one cost row per HTTP");

    const ken = (await harness.pool.query("select payload from orbit_records where record_id = $1", [ids[0]])).rows[0].payload;
    assert.deepEqual(ken.region, { city: null, countryCode: "JP" }, "file country kept; AI region proposal did not overwrite it");
    assert.equal(ken.enrichment.fields.region.origin, "card");
    assert.equal(ken.primaryIndustryId, "technology_internet");
    assert.equal(ken.enrichment.fields.industry.origin, "ai");
    const mia = (await harness.pool.query("select payload from orbit_records where record_id = $1", [ids[1]])).rows[0].payload;
    assert.deepEqual(mia.region, { city: "Singapore", countryCode: "SG" }, "empty region filled by the entry (ai)");

    // 规则匹配：入口按来源键入队；执行这一批后只多出 pending 候选。
    const jobs = (await harness.pool.query("select source_kind, source_key, contact_ids from plan_match_jobs")).rows;
    assert.deepEqual(jobs.map((job) => [job.source_kind, job.source_key, job.contact_ids.length]), [["batch", `contact-import:${uploaded.batch.id}:0`, 3]]);
    const matches = createPostgresPlanMatchRepository({ pool: harness.pool, workspaceId: WORKSPACE });
    const ran = await runMatchJobForBatch({ aiMatcher: null, repository: matches }, { actorId: ALICE, batchId: `contact-import:${uploaded.batch.id}:0` });
    assert.equal(ran.state, "ran");
    const candidates = (await harness.pool.query("select c.status, i.title from plan_match_candidates c join plan_items i on i.id = c.need_item_id")).rows;
    assert.ok(candidates.length >= 1);
    assert.ok(candidates.every((row) => row.status === "pending"));
    assert.ok(candidates.some((row) => row.title === NEED_SAAS));
    assert.equal(plan.plan.status, "active");

    const after = await planRows(harness.pool);
    assert.deepEqual(after, before, "import never writes plans, plan_items or plan_log");

    // W0051：入口把整批标为洞察待更新（本 Sprint 不另外标）。
    assert.equal((await harness.pool.query("select count(*)::int as n from contact_insights where dirty_at is not null")).rows[0].n, 3);
  });
});

test("SC-03 background pool full: the entry defers enrichment to the next Tokyo day; contacts are usable now; the batch shows 「补全明天继续」", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    const enricher = mockEnricher();
    const { layerResults, runtime, service } = await setup(harness, enricher);
    for (let index = 0; index < BACKGROUND_POOL_DAILY_LIMIT; index += 1) {
      await runtime.ledger.reserve({ actorId: ALICE, idempotencyKey: `bg:${index}`, now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
    }
    const uploaded = await service.upload({ actorId: ALICE, bytes: new TextEncoder().encode(CSV), fileName: "team.csv", idempotencyKey: randomUUID(), kind: "csv" });
    await service.commit(ALICE, uploaded.batch.id, { confirmationIntentId: randomUUID(), mergeConfirmations: [] });
    assert.equal(await service.runPendingLayers(ALICE, uploaded.batch.id), "done");
    assert.equal(layerResults[0]!.enrichment, "deferred");
    assert.equal(enricher.calls, 0, "0 model calls today");
    const batch = await service.getBatch(ALICE, uploaded.batch.id);
    assert.equal(batch.followUp.state, "done");
    assert.equal(batch.followUp.enrichmentDeferredUntil, "2026-10-03T15:00:00.000Z");
    assert.equal((await harness.pool.query("select count(*)::int as n from orbit_records where collection_name = 'contacts' and user_id = $1", [ALICE])).rows[0].n, 3);
    const job = (await harness.pool.query("select status, contact_ids from network_analysis_jobs where kind = 'enrichment'")).rows[0];
    assert.equal(job.status, "deferred");
    assert.equal(job.contact_ids.length, 3);
  });
});

test("SC-03 source scan: the import module never calls a model, the quota ledger or plan write methods directly", () => {
  const root = new URL("../../features/contacts/import/", import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk(root);
  assert.ok(files.length >= 10);
  const handlers = new URL("../../app/api/contacts/import/handlers.ts", import.meta.url).pathname;
  for (const file of [...files, handlers]) {
    // 只扫代码（去掉注释）：注释里可以提到入口包住了哪些步骤。
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(source, /ai-quota|createConfiguredTextEnricher|text-enrichment"|deepseek|DEEPSEEK|fetch\(/i, file);
    assert.doesNotMatch(source, /plans\/(repository|service|matching-repository)|enqueuePlanMatchJob|createVersion|plan_items|plan_log/, file);
  }
});
