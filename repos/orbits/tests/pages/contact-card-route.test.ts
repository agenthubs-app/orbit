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
  const result = await loadContactCardRoute({}, { id: "a" }, { live: true,
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
