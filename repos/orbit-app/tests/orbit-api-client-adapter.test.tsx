import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createOrbitApiClient, type FetchLike, type OrbitApiClient } from "../src/api/client";
import { onSessionExpired } from "../src/api/session-expiry";
import { createAccountSettingsApi, settingsFetch } from "../src/screens/me/settings-api";

type Options = { scopeKey?: string; fetchAdapter?: (fetcher: FetchLike) => FetchLike };
function hookClient(fetcher: FetchLike, options?: Options): OrbitApiClient {
  // Run the real hook with real React memoization, API client and adapters. Only
  // provider values and the HTTP boundary are supplied by this SSR fixture.
  const source = readFileSync("src/hooks/useOrbitApiClient.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} as { useOrbitApiClient: (options?: Options) => OrbitApiClient } };
  vm.runInNewContext(code, { module, exports: module.exports, fetch: fetcher, require(name: string) {
    if (name === "react") return React;
    if (name.endsWith("/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ actorId: "actor-1", cookieHeader: "orbit_session=auth" }) };
    if (name.endsWith("/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
    if (name.endsWith("/client")) return { createOrbitApiClient };
    throw new Error(`Unexpected API hook dependency ${name}`);
  } });
  let client!: OrbitApiClient;
  function Fixture() { client = module.exports.useOrbitApiClient(options); return null; }
  renderToStaticMarkup(React.createElement(Fixture));
  return client;
}

test("optional fetch adapter makes legacy settings envelopes readable before client validation", async () => {
  const requests: { path: string; cookie: string | null }[] = [];
  const client = hookClient(async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, cookie: new Headers(init?.headers).get("Cookie") });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ data: path === "/api/integrations"
      ? [{ provider: "gmail", status: "active", healthStatus: "healthy" }]
      : { memories: [{ memoryId: "m1", content: "A memo", source: "manual", createdAt: "2026-10-01" }] } });
  }, { fetchAdapter: settingsFetch });
  const api = createAccountSettingsApi(client);
  assert.equal((await api.integrations())?.[0]?.provider, "gmail");
  assert.equal((await api.memories())?.[0]?.memoryId, "m1");
  assert.equal(await api.removeMemory("m1"), true);
  assert.deepEqual(requests, ["/api/integrations", "/api/agent/memory", "/api/agent/memory/m1"].map(path => ({ path, cookie: "orbit_session=auth" })));
});

test("existing no-options hook callers keep authenticated requests and ordinary Orbit envelopes", async () => {
  let request: { path: string; method?: string; cookie: string | null; body: unknown } | undefined;
  const client = hookClient(async (input, init) => {
    request = { path: String(input), method: init?.method, cookie: new Headers(init?.headers).get("Cookie"), body: JSON.parse(String(init?.body)) };
    return Response.json({ success: true, data: { saved: true } });
  });
  const result = await client.post<{ saved: boolean }>("/api/profile", { body: { displayName: "Member" } });
  assert.equal(result.success && result.data.saved, true);
  assert.deepEqual(request, { path: "https://orbit.test/api/profile", method: "POST", cookie: "orbit_session=auth", body: { displayName: "Member" } });
});

test("scoped fetch adapters cannot publish an aborted response as session expiry", async () => {
  let reply!: (response: Response) => void;
  let adapterHeader: string | null = null;
  const client = hookClient(async (_input, init) => {
    adapterHeader = new Headers(init?.headers).get("X-Adapter");
    return new Promise<Response>(resolve => { reply = resolve; });
  }, { scopeKey: "actor-1", fetchAdapter: fetcher => (input, init) => {
    const headers = new Headers(init?.headers); headers.set("X-Adapter", "settings");
    return fetcher(input, { ...init, headers });
  } });
  let expiries = 0;
  const unsubscribe = onSessionExpired(() => { expiries++; });
  try {
    const controller = new AbortController();
    const pending = client.get("/api/private", { signal: controller.signal });
    controller.abort();
    reply(Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "expired" } }, { status: 401 }));
    assert.equal((await pending).success, false);
    assert.equal(expiries, 0);
    assert.equal(adapterHeader, "settings");
  } finally { unsubscribe(); }
});

test("existing scoped callers still reject late unauthorized responses without an adapter", async () => {
  let reply!: (response: Response) => void;
  const client = hookClient(async () => new Promise<Response>(resolve => { reply = resolve; }), { scopeKey: "legacy-scope" });
  let expiries = 0;
  const unsubscribe = onSessionExpired(() => { expiries++; });
  try {
    const controller = new AbortController();
    const pending = client.get("/api/private", { signal: controller.signal });
    controller.abort();
    reply(Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "expired" } }, { status: 401 }));
    assert.equal((await pending).success, false);
    assert.equal(expiries, 0);
  } finally { unsubscribe(); }
});
