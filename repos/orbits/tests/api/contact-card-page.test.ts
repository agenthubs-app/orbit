import assert from "node:assert/strict";
import test from "node:test";
import { createContactCardGetHandler } from "../../app/api/contacts/page/handler";
const actor = { id: "a", accountId: "a", userId: "u", workspaceId: "w", name: "Test", email: "a@example.test" };
const empty = { items: [], nextCursor: null, hasMore: false, asOf: "2026-09-25T00:00:00Z" };
test("card HTTP reader resolves identity once and never trusts query actor", async () => {
  let auth = 0; let calls = 0;
  const handler = createContactCardGetHandler({ resolveActor: async () => { auth++; return actor; }, service: () => ({
    page: async (query, actorId) => { calls++; assert.equal(actorId, "a"); assert.equal(query.limit, 30); return empty; },
    summary: async () => { throw Error("Must not aggregate on each page"); },
  }) });
  const response = await handler(new Request("http://localhost/api/contacts/page?actorId=foreign"));
  assert.equal(response.status, 200); assert.equal(auth, 1); assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).data, empty);
});
test("card errors fail closed; duplicate inputs and unsigned cursors are not silently reset", async () => {
  assert.equal((await createContactCardGetHandler({ resolveActor: async () => null })(new Request("http://localhost"))).status, 401);
  for (const [message, status] of [["CONTACT_CURSOR_INVALID", 400], ["CONTACT_PAGE_INPUT_INVALID", 400], ["CONTACT_SEARCH_RUNTIME_UNSUPPORTED", 503], ["private database failure", 503]] as const) {
    const response = await createContactCardGetHandler({ resolveActor: async () => actor, service: () => ({ page: async () => { throw Error(message); }, summary: async () => { throw Error(message); } }) })(new Request("http://localhost"));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private database failure/);
  }
});

test("W0047: the page response carries this page's tiers only when the Web client asks (tiers=1); the App's response is unchanged", async () => {
  const page = { items: [{ id: "c1", displayName: "A", organization: "", role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-25T00:00:00Z" }], nextCursor: null, hasMore: false, asOf: "2026-09-25T00:00:00Z" };
  const lookups: (readonly string[])[] = [];
  const handler = createContactCardGetHandler({ resolveActor: async () => actor,
    readTiers: async (actorId, ids) => { assert.equal(actorId, "a"); lookups.push(ids); return [{ contactId: "c1", tier: "core", dormant: false }]; },
    service: () => ({ page: async () => page as never, summary: async () => { throw Error("unused"); } }) });
  const plain = await (await handler(new Request("http://localhost/api/contacts/page"))).json();
  assert.deepEqual(plain.data, page);
  assert.deepEqual(lookups, []);
  const withTiers = await (await handler(new Request("http://localhost/api/contacts/page?tiers=1"))).json();
  assert.deepEqual(withTiers.data, { ...page, relationshipTiers: [{ contactId: "c1", tier: "core", dormant: false }] });
  assert.deepEqual(lookups, [["c1"]]);
});

test("W0051: the Web page request (tiers=1) also carries this page's insight sentence as the optional insightPreview; App requests read nothing extra; tier=… reaches the reader as tierFilters", async () => {
  const card = { id: "c1", displayName: "A", organization: "", role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "keep me", valueTypes: [], updatedAt: "2026-09-25T00:00:00Z" };
  const page = { items: [card, { ...card, id: "c2" }], nextCursor: null, hasMore: false, asOf: "2026-09-25T00:00:00Z" };
  const previewReads: (readonly string[])[] = [];
  const queries: unknown[] = [];
  const handler = createContactCardGetHandler({ resolveActor: async () => actor,
    readInsightPreviews: async (actorId, ids) => { assert.equal(actorId, "a"); previewReads.push(ids); return new Map([["c1", { en: "Opens channels in Japan.", zh: "能打开日本渠道。" }]]); },
    readTiers: async () => [],
    service: () => ({ page: async (query) => { queries.push(query); return page as never; }, summary: async () => { throw Error("unused"); } }) });
  const app = await (await handler(new Request("http://localhost/api/contacts/page"))).json();
  assert.deepEqual(app.data, page);
  assert.deepEqual(previewReads, []);
  const web = await (await handler(new Request("http://localhost/api/contacts/page?tiers=1&tier=core"))).json();
  assert.deepEqual(web.data.items[0].insightPreview, { en: "Opens channels in Japan.", zh: "能打开日本渠道。" });
  assert.equal(web.data.items[0].nextActionPreview, "keep me", "nextActionPreview keeps its meaning");
  assert.equal("insightPreview" in web.data.items[1], false);
  assert.deepEqual(previewReads, [["c1", "c2"]]);
  assert.deepEqual((queries[1] as { tierFilters?: string[] }).tierFilters, ["core"]);
  assert.equal("tierFilters" in (queries[0] as object), false);
});
