/**
 * W0055 SC-01：回填编排脚本（mock provider + 内存 store）。真实依赖装配只在 CLI main 里；这里用内存实现驱动同一套编排：
 * 预演 0 写 0 调用 → 首次执行按 补全 → 强度 → 洞察 → 快照 写入 → 第二次执行 0 写 0 调用；`origin=user` 不被覆盖；
 * `--max-ai-calls`（按 HTTP 子账计）到上限即停并写检查点、续跑从检查点继续；账本操作全部 `pool='system'`；目标库不是本机验收库即拒绝。
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { AiQuotaGate, AiQuotaReserveInput } from "../../features/ai-quota/gate";
import {
  applyBackfillEntry,
  type EnrichmentBackfillApplyResult,
  type EnrichmentBackfillPlan,
  type EnrichmentBackfillRecord,
} from "../../features/contacts/enrichment/backfill";
import type { TextEnricher } from "../../features/contacts/enrichment/text-enrichment";
import {
  assertCheckpointOutsideRepository,
  emptyCheckpoint,
  parseBackfillArgs,
  runNetworkAnalysisBackfill,
  type BackfillCheckpoint,
  type NetworkAnalysisBackfillDeps,
  type NetworkAnalysisBackfillOptions,
} from "../../scripts/backfill-network-analysis";
import { assertVerifyDatabaseTarget } from "../../scripts/lib/verify-database-target";

const ACTOR = "user_verify_network";
const NOW = new Date("2026-10-03T03:00:00.000Z");

interface LedgerRow {
  key: string;
  pool: string;
  purpose: string;
  trigger: string;
  status: "reserved" | "succeeded" | "failed" | "released";
  calls: { usage: { inputTokens: number; outputTokens: number } | null }[];
}

function memoryLedger() {
  const rows = new Map<string, LedgerRow>();
  let seq = 0;
  const gate: AiQuotaGate = {
    async reserve(input: AiQuotaReserveInput) {
      const existing = [...rows.entries()].find(([, row]) => row.key === input.idempotencyKey);
      if (existing && existing[1].status !== "released") return { ok: true, operationId: existing[0], owner: false, status: existing[1].status as "reserved" | "succeeded" | "failed" };
      const id = existing?.[0] ?? `op${++seq}`;
      rows.set(id, { calls: existing?.[1].calls ?? [], key: input.idempotencyKey, pool: input.pool, purpose: input.purpose, status: "reserved", trigger: input.trigger });
      return { ok: true, operationId: id, owner: true, status: "reserved" };
    },
    async beginCall(operationId) {
      const row = rows.get(operationId);
      if (!row || row.status !== "reserved") throw new Error("OPERATION_NOT_OPEN");
      row.calls.push({ usage: null });
      return { callId: `${operationId}#${row.calls.length - 1}` };
    },
    async endCall(callId, usage) {
      const [operationId, index] = callId.split("#");
      rows.get(operationId!)!.calls[Number(index)]!.usage = usage;
    },
    async finish(operationId, outcome) {
      const row = rows.get(operationId)!;
      if (row.status !== "reserved") return;
      row.status = row.calls.some((call) => call.usage) ? outcome : "released";
    },
  };
  return { gate, rows };
}

function contact(index: number, extra: Record<string, unknown> = {}): EnrichmentBackfillRecord {
  return {
    payload: { displayName: `联系人${index}`, id: `c${index}`, location: index % 2 ? "東京都港区" : "", organization: `公司${index}`, role: "事業開発マネージャー", ...extra },
    recordId: `c${index}`,
    updatedAt: "2026-09-01T00:00:00.000Z",
    userId: ACTOR,
  };
}

/** 内存世界：联系人、强度缓存、洞察行、快照与各种计数。 */
function world(input: { contacts: EnrichmentBackfillRecord[]; goal?: boolean }) {
  const records = new Map(input.contacts.map((record) => [record.recordId, structuredClone(record)]));
  const counters = { enrichHttp: 0, insightHttp: 0, snapshotHttp: 0, writes: 0, order: [] as string[] };
  const strength = { stamp: "", state: null as string | null };
  const insights = new Map<string, { dirty: boolean; version: string | null }>();
  let snapshotVersion: string | null = null;
  const stampOf = () => [...records.values()].map((record) => `${record.recordId}@${record.updatedAt}`).join("|");
  const versionOf = (id: string) => records.get(id)!.updatedAt;
  const snapshotSource = () => `${stampOf()}#${strength.state}`;
  let checkpoint: BackfillCheckpoint = emptyCheckpoint();

  const enricher: TextEnricher = {
    model: "mock-enricher",
    providerName: "mock-enricher",
    async enrich({ contacts }) {
      counters.enrichHttp += 1;
      return {
        model: "mock-enricher",
        proposals: contacts.map((entry) => ({
          contactId: entry.contactId,
          primaryIndustryId: "finance_investment",
          region: { city: "Osaka", countryCode: "JP" },
          secondaryIndustryId: "finance_investment.fintech",
          seniorityLevel: "manager",
        })),
        usage: { inputTokens: 100, latencyMs: 1, outputTokens: 40 },
      };
    },
  };

  const deps: NetworkAnalysisBackfillDeps = {
    checkpoint: { load: () => structuredClone(checkpoint), save: (next) => { checkpoint = structuredClone(next); } },
    enrichment: {
      async apply(plan: EnrichmentBackfillPlan): Promise<EnrichmentBackfillApplyResult> {
        counters.order.push("enrichment.apply");
        const result = { alreadyApplied: 0, applied: 0, skippedChanged: 0, skippedMissing: 0 };
        for (const entry of plan.entries) {
          const record = records.get(entry.recordId)!;
          const payload = structuredClone(record.payload);
          if (!applyBackfillEntry(payload, entry, plan.appliedAt)) { result.alreadyApplied += 1; continue; }
          record.payload = payload;
          record.updatedAt = new Date(Date.parse(record.updatedAt) + 1000).toISOString();
          insights.set(entry.recordId, { dirty: true, version: insights.get(entry.recordId)?.version ?? null });
          result.applied += 1;
          counters.writes += 1;
        }
        return result;
      },
      enricher,
      async listRecords() {
        return [...records.values()].map((record) => structuredClone(record));
      },
      workspaceId: "workspace:test",
    },
    insights: {
      billable: true,
      hasGoal: async () => input.goal !== false,
      async listPending() {
        const missing = [...records.keys()].filter((id) => !insights.has(id));
        const dirty = [...insights.entries()].filter(([, row]) => row.dirty).map(([id]) => id);
        return { dirty, missing };
      },
      async markMissing(_actorId, contactIds) {
        counters.order.push("insights.mark");
        for (const id of contactIds) insights.set(id, { dirty: true, version: null });
        counters.writes += contactIds.length;
        return contactIds.length;
      },
      async processBatch(actorId, contactIds, gate) {
        counters.order.push("insights.batch");
        const changed = contactIds.filter((id) => insights.get(id)!.version !== versionOf(id));
        if (!changed.length) {
          for (const id of contactIds) insights.get(id)!.dirty = false;
          return { contacts: contactIds.length, status: "nothing", writes: contactIds.length };
        }
        // 故意按后台池请求：闸门必须改记 system。
        const reservation = await gate.reserve({ actorId, idempotencyKey: `insight:${changed.join(",")}:${changed.map(versionOf).join(",")}`, now: NOW, pool: "background", purpose: "insight", trigger: "auto" });
        assert.equal(reservation.ok, true);
        if (reservation.ok !== true || !reservation.owner) return { contacts: 0, status: "not_owner", writes: 0 };
        const { callId } = await gate.beginCall(reservation.operationId, { model: "mock", provider: "mock" });
        counters.insightHttp += 1;
        await gate.endCall(callId, { inputTokens: 300, outputTokens: 120 });
        for (const id of contactIds) insights.set(id, { dirty: false, version: versionOf(id) });
        await gate.finish(reservation.operationId, "succeeded");
        counters.writes += contactIds.length;
        return { contacts: contactIds.length, status: "succeeded", writes: contactIds.length };
      },
    },
    log: () => undefined,
    now: () => NOW,
    sleep: async () => undefined,
    snapshot: {
      billable: true,
      async evaluate() {
        if (records.size < 3) return { kind: "insufficient", sourceDataVersion: "x", trigger: null };
        if (snapshotVersion === null) return { kind: "auto", sourceDataVersion: snapshotSource(), trigger: "first" };
        return snapshotVersion === snapshotSource() ? { kind: "fresh", sourceDataVersion: snapshotVersion, trigger: null } : { kind: "stale", sourceDataVersion: snapshotSource(), trigger: "threshold" };
      },
      async generate(_actorId, { operationId }, gate) {
        counters.order.push("snapshot.generate");
        const { callId } = await gate.beginCall(operationId, { model: "mock", provider: "mock" });
        counters.snapshotHttp += 1;
        await gate.endCall(callId, { inputTokens: 900, outputTokens: 400 });
        snapshotVersion = snapshotSource();
        counters.writes += 1;
        return { callsResponded: 1, written: true };
      },
    },
    strength: {
      async ensure() {
        counters.order.push("strength.ensure");
        if (strength.state === stampOf()) return "fresh";
        strength.state = stampOf();
        counters.writes += 1;
        return "recomputed";
      },
      async isFresh() {
        return strength.state === stampOf();
      },
    },
  };
  return { checkpoint: () => checkpoint, counters, deps, insights, records };
}

const options = (overrides: Partial<NetworkAnalysisBackfillOptions> = {}): NetworkAnalysisBackfillOptions => ({
  actorIds: [ACTOR],
  apply: false,
  batchSize: 20,
  maxAiCalls: 50,
  sleepMs: 1000,
  ...overrides,
});

const totalHttp = (counters: { enrichHttp: number; insightHttp: number; snapshotHttp: number }) => counters.enrichHttp + counters.insightHttp + counters.snapshotHttp;

test("dry-run reports per-stage contacts and predicted AI operations with zero writes and zero provider calls", async () => {
  const contacts = Array.from({ length: 25 }, (_, index) => contact(index + 1));
  const { counters, deps } = world({ contacts });
  const ledger = memoryLedger();
  const result = await runNetworkAnalysisBackfill(options(), deps, ledger.gate);
  assert.equal(result.mode, "dry-run");
  assert.equal(counters.writes, 0);
  assert.equal(totalHttp(counters), 0);
  assert.equal(ledger.rows.size, 0);
  const stages = Object.fromEntries(result.actors[0]!.stages.map((stage) => [stage.stage, stage]));
  assert.deepEqual(Object.keys(stages), ["enrichment", "strength", "insights", "snapshot"]);
  // 25 人都缺职级等 → 2 批（20 + 5）按文字补全；13 人有可识别地址 → 规则补地区。
  assert.equal(stages.enrichment!.aiOperations, 2);
  assert.equal(stages.enrichment!.aiHttpCalls, 2);
  assert.equal(stages.enrichment!.detail.aiCandidates, 25);
  assert.equal(stages.insights!.contacts, 25);
  assert.equal(stages.insights!.aiHttpCalls, 2);
  assert.equal(stages.snapshot!.aiHttpCalls, 1);
  assert.equal(result.totals.aiHttpCalls, 5);
  assert.equal(result.totals.writes, 0);
});

test("apply runs enrichment → strength → insights → snapshot on the system pool, and a second apply makes 0 writes and 0 calls", async () => {
  const contacts = Array.from({ length: 25 }, (_, index) => contact(index + 1));
  const { counters, deps, records } = world({ contacts });
  const ledger = memoryLedger();
  const first = await runNetworkAnalysisBackfill(options({ apply: true }), deps, ledger.gate);
  assert.equal(first.status, "completed");
  const firstOrder = counters.order.filter((step, index, all) => all.indexOf(step) === index);
  assert.deepEqual(firstOrder, ["enrichment.apply", "strength.ensure", "insights.batch", "snapshot.generate"]);
  assert.equal(counters.enrichHttp, 2);
  assert.equal(counters.insightHttp, 2);
  assert.equal(counters.snapshotHttp, 1);
  assert.equal(first.totals.aiHttpCalls, 5);
  assert.ok(first.totals.writes > 0);
  assert.ok([...records.values()].every((record) => (record.payload.publicProfile as { seniorityLevel?: string } | undefined)?.seniorityLevel === "manager"));
  // 账本：5 次操作全部记在 system 池、trigger auto；每次一条带用量的子账。
  assert.equal(ledger.rows.size, 5);
  for (const row of ledger.rows.values()) {
    assert.equal(row.pool, "system");
    assert.equal(row.trigger, "auto");
    assert.equal(row.status, "succeeded");
    assert.equal(row.calls.length, 1);
  }
  assert.deepEqual([...ledger.rows.values()].map((row) => row.purpose).sort(), ["enrichment", "enrichment", "insight", "insight", "snapshot"]);

  const writesBefore = counters.writes;
  const httpBefore = totalHttp(counters);
  const second = await runNetworkAnalysisBackfill(options({ apply: true }), deps, ledger.gate);
  assert.equal(second.status, "completed");
  assert.equal(counters.writes - writesBefore, 0);
  assert.equal(totalHttp(counters) - httpBefore, 0);
  assert.equal(second.totals.aiHttpCalls, 0);
  assert.equal(second.totals.writes, 0);
  assert.equal(ledger.rows.size, 5);
});

test("contacts the model already saw are not sent again even when it left a field empty", async () => {
  const { counters, deps } = world({ contacts: [contact(1), contact(2), contact(3)] });
  deps.enrichment.enricher = {
    model: "mock",
    providerName: "mock",
    async enrich({ contacts }) {
      counters.enrichHttp += 1;
      return { model: "mock", proposals: contacts.map((entry) => ({ contactId: entry.contactId, primaryIndustryId: null, region: null, secondaryIndustryId: null, seniorityLevel: null })), usage: { inputTokens: 10, latencyMs: 1, outputTokens: 2 } };
    },
  };
  const ledger = memoryLedger();
  await runNetworkAnalysisBackfill(options({ apply: true }), deps, ledger.gate);
  assert.equal(counters.enrichHttp, 1);
  const again = await runNetworkAnalysisBackfill(options({ apply: true }), deps, ledger.gate);
  assert.equal(counters.enrichHttp, 1);
  assert.equal(again.totals.aiHttpCalls, 0);
  assert.equal(again.totals.writes, 0);
});

test("a value the user set (origin=user) is never overwritten by the backfill", async () => {
  const userEdited = contact(1, {
    enrichment: { fields: { industry: { origin: "user", updatedAt: "2026-08-01T00:00:00.000Z", via: "contact_edit" } }, version: 1 },
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
  });
  const { deps, records } = world({ contacts: [userEdited, contact(2), contact(3)] });
  await runNetworkAnalysisBackfill(options({ apply: true }), deps, memoryLedger().gate);
  const payload = records.get("c1")!.payload;
  assert.equal(payload.primaryIndustryId, "technology_internet");
  assert.equal(payload.secondaryIndustryId, "technology_internet.enterprise_software");
  assert.equal((payload.enrichment as { fields: Record<string, { origin: string }> }).fields.industry!.origin, "user");
  // 其余空栏照常补齐（职级来自模型）。
  assert.equal((payload.publicProfile as { seniorityLevel?: string }).seniorityLevel, "manager");
  assert.equal(records.get("c2")!.payload.primaryIndustryId, "finance_investment");
});

test("--max-ai-calls stops at the limit with a checkpoint and the rerun resumes without repeating calls", async () => {
  const contacts = Array.from({ length: 25 }, (_, index) => contact(index + 1));
  const { checkpoint, counters, deps } = world({ contacts });
  const ledger = memoryLedger();
  // 补全 2 次 + 洞察 2 次 + 快照 1 次 = 5；上限 3 → 补全 2 次、洞察 1 次后停在洞察。
  const first = await runNetworkAnalysisBackfill(options({ apply: true, maxAiCalls: 3 }), deps, ledger.gate);
  assert.equal(first.status, "stopped_at_limit");
  assert.deepEqual(first.stoppedAt, { actorId: ACTOR, stage: "insights" });
  assert.equal(totalHttp(counters), 3);
  assert.equal(checkpoint().stoppedAt?.stage, "insights");
  assert.equal(checkpoint().httpCallsTotal, 3);
  assert.equal(Object.keys(checkpoint().enrichmentAttempted[ACTOR] ?? {}).length, 25);

  const resumed = await runNetworkAnalysisBackfill(options({ apply: true, maxAiCalls: 10 }), deps, ledger.gate);
  assert.equal(resumed.status, "completed");
  assert.equal(counters.enrichHttp, 2);
  assert.equal(counters.insightHttp, 2);
  assert.equal(counters.snapshotHttp, 1);
  assert.equal(checkpoint().stoppedAt, null);
  assert.equal(checkpoint().httpCallsTotal, 5);
  for (const row of ledger.rows.values()) assert.equal(row.pool, "system");
});

test("a zero budget makes no provider call and stops before the first AI unit", async () => {
  const { counters, deps } = world({ contacts: [contact(1), contact(2), contact(3)] });
  const result = await runNetworkAnalysisBackfill(options({ apply: true, maxAiCalls: 0 }), deps, memoryLedger().gate);
  assert.equal(result.status, "stopped_at_limit");
  assert.equal(result.stoppedAt?.stage, "enrichment");
  assert.equal(totalHttp(counters), 0);
});

test("the backfill refuses anything but the local verify database, needs --max-ai-calls and keeps checkpoints outside the repository", () => {
  const base = { ORBIT_DATABASE_TARGET: "", ORBIT_LOCAL_WORKSPACE_ID: "workspace:orbit-small-staging-20260917" };
  assert.throws(() => assertVerifyDatabaseTarget({ ...base, ORBIT_EVENT_DATABASE_URL: "postgresql://u@db.example.com:5432/orbit_newui_events_20260922" }), /拒绝执行/);
  assert.throws(() => assertVerifyDatabaseTarget({ ...base, ORBIT_EVENT_DATABASE_URL: "postgresql://u@localhost:5432/orbit_production" }), /拒绝执行/);
  assert.throws(() => assertVerifyDatabaseTarget({ ORBIT_EVENT_DATABASE_URL: "" }), /拒绝执行/);
  assert.throws(() => parseBackfillArgs(["--email=verify-network@orbit.test"]), /--max-ai-calls/);
  assert.throws(() => parseBackfillArgs(["--max-ai-calls=1", "--production"]), /Unknown argument/);
  assert.equal(parseBackfillArgs(["--email=a@x.test", "--max-ai-calls=2"]).apply, false);
  const repo = path.resolve(process.cwd(), "..", "..");
  assert.throws(() => assertCheckpointOutsideRepository(path.join(repo, "build", "cp.json"), repo), /outside the repository/);
  assert.doesNotThrow(() => assertCheckpointOutsideRepository("/tmp/orbit-backfill/cp.json", repo));
});

test("options are validated: batch size ≤20, sleep ≥1000 ms, an explicit account", async () => {
  const { deps } = world({ contacts: [contact(1)] });
  const gate = memoryLedger().gate;
  await assert.rejects(runNetworkAnalysisBackfill(options({ batchSize: 21 }), deps, gate), /--batch-size/);
  await assert.rejects(runNetworkAnalysisBackfill(options({ sleepMs: 10 }), deps, gate), /--sleep-ms/);
  await assert.rejects(runNetworkAnalysisBackfill(options({ actorIds: [] }), deps, gate), /no target account/);
});
