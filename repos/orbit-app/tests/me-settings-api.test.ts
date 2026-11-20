import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { globalSearchPath } from "../src/screens/search/search-model";
const MEMORY = { appliesTo: ["event.recommend"], category: "preference", content: "memo", createdAt: "2026-10-01T00:00:00.000Z", memoryId: "m1", revision: 1, source: "manual", sourceMessageRef: null, status: "active", structured: null, updatedAt: "2026-10-01T00:00:00.000Z", validFrom: null, validUntil: null };
test("R18a private settings transport reads actual data-only envelopes and acknowledges 204 deletion", async () => {
  const module = await import("../src/screens/me/settings-api").catch(() => null); assert.ok(module);
  const calls: string[] = [];
  const fetchImpl = module.settingsFetch(async (url, init) => {
    calls.push(`${init?.method} ${String(url)}`);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ data: String(url).includes("integrations") ? [{ provider: "gmail", status: "active", healthStatus: "healthy" }] : { memories: [MEMORY, { ...MEMORY, memoryId: "unknown", source: "future" }], ruleLimit: 20, settings: { allowConversationLearning: false, enabled: true, updatedAt: "2026-11-20T00:00:00.000Z" } } });
  });
  const api = module.createAccountSettingsApi(createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl }));
  assert.equal((await api.integrations())?.[0]?.provider, "gmail");
  // AG14: the whole list — an entry this build cannot read is left out; the switches and the rule limit come along.
  const list = await api.memories();
  assert.equal(list?.memories.length, 1);
  assert.deepEqual([list?.settings.enabled, list?.settings.allowConversationLearning, list?.ruleLimit], [true, false, 20]);
  assert.equal(await api.removeMemory("m1"), true);
  assert.ok(calls.some(value => value.includes("DELETE http://localhost:3400/api/agent/memory/m1")));
  assert.equal(await api.removeMemory("m1", undefined, 3), true);
  assert.ok(calls.some(value => value.includes("DELETE http://localhost:3400/api/agent/memory/m1?expectedRevision=3")));
  assert.equal(await api.saveMemory({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末", validUntil: null }, null), true);
  assert.equal(await api.saveMemory({ appliesTo: ["all"], category: "constraint", content: "时间一律写 24 小时制", expectedRevision: 1, validUntil: null }, "m1"), true);
  assert.equal(await api.memorySettings({ allowConversationLearning: true }), true);
  assert.ok(calls.includes("POST http://localhost:3400/api/agent/memory"));
  assert.ok(calls.includes("PATCH http://localhost:3400/api/agent/memory/m1"));
  assert.ok(calls.includes("PATCH http://localhost:3400/api/agent/memory/settings"));
  assert.equal(module.integrationState({ status: "active", healthStatus: "healthy" }), "connected");
  assert.equal(module.integrationState({ status: "unavailable", healthStatus: "unavailable" }), "preparing");
});
test("R18a private settings transport never accepts failed HTTP/data-only errors", async () => {
  const module = await import("../src/screens/me/settings-api").catch(() => null); assert.ok(module);
  const api = module.createAccountSettingsApi(createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: module.settingsFetch(async () => Response.json({ error: { code: "FORBIDDEN", message: "no" } }, { status: 403 })) }));
  assert.equal(await api.integrations(), null); assert.equal(await api.removeMemory("m1"), false);
});
test("R18a semantic preference uses exactly the search key and on/off values", async () => {
  const module = await import("../src/screens/me/semantic-preference").catch(() => null); assert.ok(module);
  const values = new Map<string, string>(); const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  assert.equal(await module.readAccountSemantic(storage), true);
  await module.writeAccountSemantic(storage, false); assert.equal(values.get("orbit.search.semantic"), "off");
  assert.ok(globalSearchPath({ query: "x", filter: "all", semantic: await module.readAccountSemantic(storage) }).includes("semantic=0"));
  await module.writeAccountSemantic(storage, true); assert.equal(values.get("orbit.search.semantic"), "on");
});

test("R18a integration disconnect requires the exact provider's revoked receipt", async () => {
  const module = await import("../src/screens/me/settings-api");
  const calls: string[] = []; let receipt: unknown = { provider: "google_calendar", status: "revoked" };
  const api = module.createAccountSettingsApi(createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: module.settingsFetch(async (url, init) => {
    calls.push(`${init?.method} ${new URL(String(url)).pathname}`);
    return Response.json({ data: receipt });
  }) }));
  assert.equal(await api.disconnect("gmail"), false);
  receipt = { provider: "gmail", status: "active" };
  assert.equal(await api.disconnect("gmail"), false);
  receipt = { provider: "gmail", status: "revoked" };
  assert.equal(await api.disconnect("gmail"), true);
  assert.deepEqual(calls, Array(3).fill("DELETE /api/integrations/gmail"));
  assert.equal(module.integrationAuthorizePath("google_calendar"), "/api/integrations/google_calendar/authorize?returnTo=settings");
});

for (const provider of ["gmail", "google_calendar"] as const) test(`R18a native ${provider} connection uses the approved Web-settings fallback`, async () => {
  const module = await import("../src/screens/me/settings-api");
  assert.equal(module.integrationAuthorizePath(provider, true), "/app/settings/integrations");
  assert.equal(module.integrationAuthorizePath(provider), `/api/integrations/${provider}/authorize?returnTo=settings`);
});

test("R18a native settings transport works without the browser-only Response.json static", async () => {
  const module = await import("../src/screens/me/settings-api");
  const original = Response.json;
  Object.defineProperty(Response, "json", { configurable: true, value: undefined });
  try {
    const fetchImpl = module.settingsFetch(async (_url, init) => init?.method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ data: [{ provider: "gmail", status: "unavailable", healthStatus: "unavailable" }] }), { headers: { "content-type": "application/json" } }));
    const api = module.createAccountSettingsApi(createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl }));
    assert.equal((await api.integrations())?.[0]?.provider, "gmail");
    assert.equal(await api.removeMemory("m1"), true);
  } finally {
    Object.defineProperty(Response, "json", { configurable: true, value: original });
  }
});
