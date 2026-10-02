import assert from "node:assert/strict";
import test from "node:test";
import { loadContactCardRoute } from "../../app/(app)/app/contacts/contact-card-route-service";
import { fetchContactCardView } from "../../app/(app)/app/contacts/contact-card-view-model";
test("Web live loader uses bounded page and separate global facets, never page-length counts", async () => {
  const queries: unknown[] = [];
  const result = await loadContactCardRoute({ sourceGroup: "scan", query: "東京" }, { id: "a", workspaceId: "w" }, { live: true, service: {
    page: async (q, id) => { queries.push(q); assert.equal(id, "a"); return { items: [], hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" }; },
    summary: async (q) => { queries.push(q); return { total: 10, sources: { business_card_ocr: 1000, qr_scan: 90 }, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }; },
  } });
  assert.equal(result?.state, "ready");
  if (result?.state !== "ready") throw Error("Missing result");
  assert.equal(result.view.counts.scan, 1000); assert.equal(result.view.counts.all, 1090);
  assert.equal(result.view.total, 10); assert.equal(result.view.list.items.length, 0);
  assert.deepEqual(queries[0], queries[1]);
  assert.deepEqual((queries[0] as { sourceFilters: string[] }).sourceFilters, ["business_card_ocr"]);
});
test("loader errors are explicit, not an unbounded legacy fallback", async () => {
  const result = await loadContactCardRoute({}, { id: "a" }, { live: true, service: {
    page: async () => { throw Error("CONTACT_SEARCH_RUNTIME_UNSUPPORTED"); },
    summary: async () => { throw Error("CONTACT_SEARCH_RUNTIME_UNSUPPORTED"); },
  } });
  assert.equal(result?.state, "error");
  assert.equal(await loadContactCardRoute({}, { id: "a" }, { live: false }), null);
  assert.equal(typeof fetchContactCardView, "function");
});

test("W0047 review P1-2: the live loader merges one tier lookup for the page's contact ids; cards show tiers, never the manual stage", async () => {
  const lookups: (readonly string[])[] = [];
  const card = (id: string, status: "active" | "archived", pendingInitialization = false) => ({ id, displayName: id, organization: "", role: "", sourceType: "manual" as const, status, pendingInitialization, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-25T00:00:00Z" });
  const result = await loadContactCardRoute({}, { id: "a" }, { live: true, readThreshold: async () => ({ confirmed: 5, met: true, missing: 0 }), 
    readTiers: async (actorId, ids) => { assert.equal(actorId, "a"); lookups.push(ids); return [{ contactId: "c1", tier: "core", dormant: false }, { contactId: "c2", tier: "active", dormant: true }]; },
    service: {
      page: async () => ({ items: [card("c1", "active"), card("c2", "archived"), card("c3", "active", true)], hasMore: true, nextCursor: "signed", asOf: "2026-09-25T00:00:00Z" }),
      summary: async () => ({ total: 3, sources: { manual: 3 }, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }),
    } });
  if (result?.state !== "ready") throw Error("Missing result");
  assert.deepEqual(lookups, [["c1", "c2", "c3"]]);
  assert.deepEqual(result.view.list.items.map((item) => [item.id, item.tier]), [["c1", "core"], ["c2", "dormant"], ["c3", null]]);
  assert.equal("stage" in result.view.list.items[0]!, false);
  assert.match(result.view.list.nextPath ?? "", /cursor=signed/);
  assert.match(result.view.list.nextPath ?? "", /tiers=1/);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { NetworkCards } = await import("../../app/(app)/app/contacts/network-0918/network-cards");
  const html = renderToStaticMarkup(createElement(NetworkCards, { view: result.view }));
  assert.match(html, /data-network-tier="core"[\s\S]*?核心/);
  assert.match(html, /data-network-tier="dormant"[\s\S]*?待唤醒/);
  assert.match(html, /data-network-tier="unscored"[\s\S]*?未评估/);
  assert.doesNotMatch(html, /待设置关系|正在推进|已归档/);
  // 空页不读档位。
  lookups.length = 0;
  await loadContactCardRoute({}, { id: "a" }, { live: true, readTiers: async (_a, ids) => { lookups.push([...ids]); return []; }, service: {
    page: async () => ({ items: [], hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" }),
    summary: async () => ({ total: 0, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }),
  } });
  assert.deepEqual(lookups, []);
});

test("W0051 SC-04: 所有人脉 replaces 下一步（预览） with the insight sentence (≤60) next to the tier; the tier filter is a server param kept in source links", async () => {
  const card = (id: string) => ({ id, displayName: id, organization: "", role: "", sourceType: "manual" as const, status: "active" as const, pendingInitialization: false, nextActionPreview: "Review the next follow-up", valueTypes: [], updatedAt: "2026-09-25T00:00:00Z" });
  const queries: unknown[] = [];
  const previewReads: (readonly string[])[] = [];
  const result = await loadContactCardRoute({ sourceGroup: "scan", tier: "core" }, { id: "a" }, { live: true, readThreshold: async () => ({ confirmed: 5, met: true, missing: 0 }), 
    readInsightPreviews: async (_actorId, ids) => { previewReads.push(ids); return new Map([["c1", { en: "Opens channels in Japan.", zh: "能打开日本渠道。" }]]); },
    readTiers: async () => [{ contactId: "c1", tier: "core", dormant: false }],
    service: {
      page: async (q) => { queries.push(q); return { items: [card("c1"), card("c2")], hasMore: true, nextCursor: "signed", asOf: "2026-09-25T00:00:00Z" }; },
      summary: async (q) => { queries.push(q); return { total: 2, sources: { business_card_ocr: 2 }, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }; },
    } });
  if (result?.state !== "ready") throw Error("Missing result");
  assert.deepEqual(queries.map((q) => (q as { tierFilters?: string[] }).tierFilters), [["core"], ["core"]]);
  assert.deepEqual(previewReads, [["c1", "c2"]]);
  assert.equal(result.view.tier, "core");
  assert.deepEqual(result.view.list.items.map((item) => item.insight), [{ en: "Opens channels in Japan.", zh: "能打开日本渠道。" }, null]);
  assert.match(result.view.list.nextPath ?? "", /tier=core/);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { NetworkCards } = await import("../../app/(app)/app/contacts/network-0918/network-cards");
  const html = renderToStaticMarkup(createElement(NetworkCards, { view: result.view }));
  assert.doesNotMatch(html, /下一步（预览）|Review the next follow-up/);
  assert.match(html, /<span>关系档位<\/span><span><\/span><span>洞察<\/span>/);
  assert.match(html, /data-network-insight="ready"[^>]*>能打开日本渠道。/);
  assert.match(html, /data-network-insight="none"[^>]*>暂无洞察/);
  assert.match(html, /<select name="tier"[^>]*data-network-tier-filter="true"[\s\S]*?<option value="core" selected="">核心/);
  assert.match(html, /href="\/app\/contacts\?query=&amp;sourceGroup=event&amp;tier=core"/);
  // 未知档位回到「全部」；空页不读洞察。
  previewReads.length = 0;
  const unknown = await loadContactCardRoute({ tier: "vip" }, { id: "a" }, { live: true, readInsightPreviews: async (_a, ids) => { previewReads.push([...ids]); return new Map(); }, readTiers: async () => [], service: {
    page: async (q) => { assert.equal("tierFilters" in (q as object), false); return { items: [], hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" }; },
    summary: async () => ({ total: 0, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }),
  } });
  assert.equal(unknown?.state === "ready" ? unknown.view.tier : null, "all");
  assert.deepEqual(previewReads, []);
});

test("W0054 SC-03（W54-3）: below 3 confirmed contacts the list reads no insight previews and hides the insight column (no 「暂无洞察」 either)", async () => {
  const card = (id: string) => ({ id, displayName: id, organization: "", role: "", sourceType: "manual" as const, status: "active" as const, pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-25T00:00:00Z" });
  const previewReads: (readonly string[])[] = [];
  const thresholdReads: string[] = [];
  const service = {
    page: async () => ({ items: [card("c1"), card("c2")], hasMore: false, nextCursor: null, asOf: "2026-09-25T00:00:00Z" }),
    summary: async () => ({ total: 2, sources: { manual: 2 }, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-25T00:00:00Z" }),
  };
  const readInsightPreviews = async (_actorId: string, ids: readonly string[]) => { previewReads.push(ids); return new Map([["c1", { en: "Old insight sentence.", zh: "旧的洞察一句。" }]]); };
  const result = await loadContactCardRoute({}, { id: "a" }, { live: true, readInsightPreviews, readTiers: async () => [], service,
    readThreshold: async (actorId) => { thresholdReads.push(actorId); return { confirmed: 2, met: false, missing: 1 }; } });
  if (result?.state !== "ready") throw Error("Missing result");
  assert.deepEqual(thresholdReads, ["a"]);
  assert.deepEqual(previewReads, [], "previews are not read below the threshold");
  assert.equal(result.view.insightsHidden, true);
  assert.deepEqual(result.view.list.items.map((item) => item.insight), [null, null]);
  assert.doesNotMatch(JSON.stringify(result), /旧的洞察一句|Old insight sentence/);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { NetworkCards } = await import("../../app/(app)/app/contacts/network-0918/network-cards");
  const html = renderToStaticMarkup(createElement(NetworkCards, { view: result.view }));
  assert.doesNotMatch(html, /<span>洞察<\/span>|暂无洞察|旧的洞察一句/);
  assert.match(html, /data-network-insight="hidden"/);

  // 门槛读不到 = 未知：照旧读洞察一句。
  previewReads.length = 0;
  const unknown = await loadContactCardRoute({}, { id: "a" }, { live: true, readInsightPreviews, readTiers: async () => [], service, readThreshold: async () => null });
  if (unknown?.state !== "ready") throw Error("Missing result");
  assert.deepEqual(previewReads, [["c1", "c2"]]);
  assert.equal(unknown.view.insightsHidden, undefined);
});

test("W0054: the paged API (tiers=1) uses the same gate — below 3 contacts no preview is read or attached", async () => {
  const { readGatedInsightPreviews } = await import("../../app/(app)/app/contacts/contact-card-route-service");
  const reads: (readonly string[])[] = [];
  const below = await readGatedInsightPreviews("a", ["c1"], { readPreviews: async (_a, ids) => { reads.push(ids); return new Map(); }, readThreshold: async () => ({ confirmed: 0, met: false, missing: 3 }) });
  assert.deepEqual(below, { hidden: true, previews: new Map() });
  assert.deepEqual(reads, []);
  const met = await readGatedInsightPreviews("a", ["c1"], { readPreviews: async (_a, ids) => { reads.push(ids); return new Map([["c1", { en: "x", zh: "x" }]]); }, readThreshold: async () => ({ confirmed: 3, met: true, missing: 0 }) });
  assert.equal(met.hidden, false);
  assert.equal(met.previews.size, 1);
});
