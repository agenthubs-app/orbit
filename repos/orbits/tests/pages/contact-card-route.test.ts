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
