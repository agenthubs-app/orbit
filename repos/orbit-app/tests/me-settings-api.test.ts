import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { globalSearchPath } from "../src/screens/search/search-model";
test("R18a private settings transport reads actual data-only envelopes and acknowledges 204 deletion", async () => {
  const module = await import("../src/screens/me/settings-api").catch(() => null); assert.ok(module);
  const calls: string[] = [];
  const fetchImpl = module.settingsFetch(async (url, init) => {
    calls.push(`${init?.method} ${String(url)}`);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ data: String(url).includes("integrations") ? [{ provider: "gmail", status: "active", healthStatus: "healthy" }] : { memories: [{ memoryId: "m1", content: "memo", source: "manual", createdAt: "2026-10-01" }, { memoryId: "unknown", content: "ignore", source: "future", createdAt: "2026-10-01" }] } });
  });
  const api = module.createAccountSettingsApi(createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl }));
  assert.equal((await api.integrations())?.[0]?.provider, "gmail");
  assert.equal((await api.memories())?.length, 1);
  assert.equal(await api.removeMemory("m1"), true);
  assert.ok(calls.some(value => value.includes("DELETE http://localhost:3400/api/agent/memory/m1")));
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
