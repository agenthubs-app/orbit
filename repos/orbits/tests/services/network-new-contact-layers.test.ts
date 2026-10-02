/**
 * W0048a SC-W0048a-03／04：三层更新入口 runNewContactLayers。
 *
 * - 按 ≤20 人一批补全，每批 1 次操作（后台池 enrichment；budget=system 记 system 池）；
 * - 写入只走 canWriteEnrichedValue：user 值不被覆盖，ai 值只补空或替换 ai；
 * - 入队一次「待确认」规则匹配（0 次 AI），随后快照判定一次；
 * - 后台池不够时剩余 id 顺延到次日 00:00 东京（enrichment: deferred + retryOn），0 次额外调用；
 * - 维护任务次日消化顺延行（真实 PostgreSQL）：补全写回联系人、job 删除；memo 有界补扫计入后台池。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate, AiQuotaReserveInput } from "../../features/ai-quota/gate";
import { nextTokyoMidnight } from "../../features/ai-quota/constants";
import type { TextEnricher, TextEnrichmentContactInput } from "../../features/contacts/enrichment/text-enrichment";
import { runNewContactLayers, type LayerContactRecord, type NewContactLayersDeps } from "../../features/network-analysis/new-contact-layers";

const NOW = new Date("2026-10-02T03:00:00.000Z");

function fakeGate(options: { allow?: number } = {}) {
  const reserves: AiQuotaReserveInput[] = [];
  const finishes: string[] = [];
  let calls = 0;
  const gate: AiQuotaGate = {
    async beginCall(operationId) { calls += 1; return { callId: `${operationId}#1` }; },
    async endCall() { /* recorded */ },
    async finish(operationId, outcome) { finishes.push(`${operationId}:${outcome}`); },
    async reserve(input) {
      if (options.allow !== undefined && reserves.length >= options.allow) {
        return { limit: "background", ok: false, reason: "daily_limit", retryOn: nextTokyoMidnight(input.now) };
      }
      reserves.push(input);
      return { ok: true, operationId: `op-${reserves.length}`, owner: true, status: "reserved" };
    },
  };
  return { calls: () => calls, finishes, gate, reserves };
}

function fakeEnricher(): TextEnricher & { batches: TextEnrichmentContactInput[][] } {
  const enricher = {
    batches: [] as TextEnrichmentContactInput[][],
    model: "fake-text",
    providerName: "deepseek-chat-completions",
    async enrich({ contacts }: { contacts: readonly TextEnrichmentContactInput[] }) {
      enricher.batches.push([...contacts]);
      return {
        model: "fake-text",
        proposals: contacts.map((contact) => ({
          contactId: contact.contactId,
          primaryIndustryId: "finance_investment" as const,
          region: { city: "Tokyo", countryCode: "JP" },
          secondaryIndustryId: null,
          seniorityLevel: "director" as const,
        })),
        usage: { inputTokens: 100, latencyMs: 3, outputTokens: 20 },
      };
    },
  };
  return enricher;
}

function contacts(count: number): LayerContactRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    contactId: `c${index}`,
    payload: index === 0
      ? { displayName: "User-set", enrichment: { fields: { industry: { origin: "user", updatedAt: "2026-09-01T00:00:00.000Z", via: "contact_edit" } }, version: 1 }, organization: "Org", primaryIndustryId: "technology_internet" }
      : { displayName: `C${index}`, organization: `Org ${index}`, role: "Director" },
    updatedAt: "2026-09-01T00:00:00.000Z",
  }));
}

function deps(input: { gate: AiQuotaGate; enricher: TextEnricher | null; records: LayerContactRecord[] }) {
  const writes = new Map<string, Record<string, unknown>>();
  const deferred: { ids: readonly string[]; notBefore: string }[] = [];
  const enqueued: { batchId: string; contactIds: readonly string[] }[] = [];
  let refreshes = 0;
  const value: NewContactLayersDeps = {
    async deferEnrichment(_actorId, ids, _sourceKey, notBefore) { deferred.push({ ids, notBefore }); },
    enricher: input.enricher,
    async enqueuePlanMatch({ batchId, contactIds }) { enqueued.push({ batchId, contactIds }); return { state: "enqueued" }; },
    gate: input.gate,
    async readContacts(_actorId, ids) { return input.records.filter((record) => ids.includes(record.contactId)); },
    async refreshSnapshot() { refreshes += 1; return { decision: "auto" }; },
    async writeContact(_actorId, record, next) { writes.set(record.contactId, next); return true; },
  };
  return { deferred, deps: value, enqueued, refreshes: () => refreshes, writes };
}

test("SC-03 layers: 45 contacts enrich in batches of ≤20 (one operation each), user values survive, one rule-match enqueue (0 AI) and one snapshot decision", async () => {
  const gate = fakeGate();
  const enricher = fakeEnricher();
  const records = contacts(45);
  const harness = deps({ enricher, gate: gate.gate, records });
  const result = await runNewContactLayers({ actorId: "actor:a", contactIds: records.map((record) => record.contactId), now: NOW, sourceKey: "import:csv-1" }, harness.deps);
  assert.deepEqual(enricher.batches.map((batch) => batch.length), [20, 20, 5]);
  assert.equal(gate.reserves.length, 3);
  assert.ok(gate.reserves.every((reserve) => reserve.pool === "background" && reserve.purpose === "enrichment" && reserve.trigger === "auto"));
  assert.deepEqual(gate.finishes, ["op-1:succeeded", "op-2:succeeded", "op-3:succeeded"]);
  assert.equal(result.operations, 3);
  assert.equal(result.enrichment, "done");
  // c0 的行业是用户填的：不被 ai 覆盖（只补了职级与地区）。
  const c0 = harness.writes.get("c0")!;
  assert.equal(c0.primaryIndustryId, "technology_internet");
  assert.equal((c0.enrichment as { fields: Record<string, { origin: string }> }).fields.industry!.origin, "user");
  assert.equal((c0.region as { countryCode: string }).countryCode, "JP");
  const c1 = harness.writes.get("c1")!;
  assert.equal(c1.primaryIndustryId, "finance_investment");
  assert.equal((c1.enrichment as { fields: Record<string, { origin: string; via: string }> }).fields.industry!.via, "text_enrichment");
  assert.deepEqual(harness.enqueued, [{ batchId: "import:csv-1", contactIds: records.map((record) => record.contactId) }]);
  assert.equal(result.planMatch, "enqueued");
  assert.equal(harness.refreshes(), 1);
});

test("SC-04 layers: when the background pool runs out the rest is deferred to next 00:00 Tokyo with 0 extra calls; budget=system uses the system pool", async () => {
  const gate = fakeGate({ allow: 1 });
  const enricher = fakeEnricher();
  const records = contacts(45);
  const harness = deps({ enricher, gate: gate.gate, records });
  const result = await runNewContactLayers({ actorId: "actor:a", contactIds: records.map((record) => record.contactId), now: NOW, sourceKey: "import:csv-2" }, harness.deps);
  assert.equal(enricher.batches.length, 1);
  assert.equal(result.enrichment, "deferred");
  assert.equal(result.retryOn, "2026-10-02T15:00:00.000Z");
  assert.equal(harness.deferred.length, 1);
  assert.equal(harness.deferred[0]!.ids.length, 25);
  assert.equal(harness.deferred[0]!.notBefore, "2026-10-02T15:00:00.000Z");
  assert.equal(harness.enqueued.length, 1, "rule matching still enqueued (0 AI)");

  const system = fakeGate();
  const systemHarness = deps({ enricher: fakeEnricher(), gate: system.gate, records: contacts(3) });
  await runNewContactLayers({ actorId: "actor:a", budget: "system", contactIds: ["c1", "c2"], now: NOW, sourceKey: "backfill" }, systemHarness.deps);
  assert.deepEqual(system.reserves.map((reserve) => reserve.pool), ["system"]);
});

test("SC-03 layers: no enricher configured → enrichment skipped, still one enqueue and one snapshot decision; no candidates → 0 operations", async () => {
  const gate = fakeGate();
  const harness = deps({ enricher: null, gate: gate.gate, records: contacts(3) });
  const result = await runNewContactLayers({ actorId: "actor:a", contactIds: ["c1", "c2"], now: NOW, sourceKey: "s" }, harness.deps);
  assert.equal(result.enrichment, "skipped");
  assert.equal(gate.reserves.length, 0);
  assert.equal(harness.enqueued.length, 1);
  const full = deps({ enricher: fakeEnricher(), gate: gate.gate, records: [{ contactId: "c9", payload: { primaryIndustryId: "other", publicProfile: { seniorityLevel: "manager" }, region: { city: null, countryCode: "JP" } }, updatedAt: "x" }] });
  const none = await runNewContactLayers({ actorId: "actor:a", contactIds: ["c9"], now: NOW, sourceKey: "s2" }, full.deps);
  assert.equal(none.operations, 0);
});
