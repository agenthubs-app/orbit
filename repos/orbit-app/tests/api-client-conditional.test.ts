import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";

// Conditional GETs: the client remembers the last ETag + envelope per request identity,
// sends If-None-Match, and replays the remembered envelope on 304. Memory only.
function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

test("second GET sends If-None-Match and replays the remembered envelope on 304", async () => {
  const seen: { url: string; ifNoneMatch: string | null }[] = [];
  let calls = 0;
  const client = createOrbitApiClient({
    conditionalCache: new Map(),
    fetchImpl: async (url, init) => {
      calls += 1;
      seen.push({ url: String(url), ifNoneMatch: new Headers(init?.headers).get("If-None-Match") });
      if (calls === 1) return json({ success: true, data: { tasks: [{ id: "t1" }] } }, { ETag: 'W/"abc"', "X-Orbit-Feature-Mode": "live" });
      return new Response(null, { status: 304, headers: { ETag: 'W/"abc"' } });
    },
  });
  const first = await client.get<{ tasks: { id: string }[] }>("/api/tasks");
  assert.equal(first.success, true);
  assert.equal(seen[0]!.ifNoneMatch, null);
  const second = await client.get<{ tasks: { id: string }[] }>("/api/tasks");
  assert.equal(seen[1]!.ifNoneMatch, 'W/"abc"');
  assert.equal(second.success, true);
  if (!second.success || !first.success) assert.fail();
  assert.deepEqual(second.data, first.data, "replayed body equals the remembered one");
  assert.equal(second.status, 200, "a replay reads as a fresh 200 to callers");
  assert.equal(second.meta.fromCache, true);
  assert.ok(!first.meta.fromCache, "a fresh body is not marked as replayed");
  assert.equal(second.meta.featureMode, "live", "meta is replayed with the body");
});

test("a 200 with a new ETag replaces the remembered envelope; different query strings and paths are separate entries", async () => {
  let n = 0;
  const client = createOrbitApiClient({
    conditionalCache: new Map(),
    fetchImpl: async (url, init) => {
      n += 1;
      const tag = new Headers(init?.headers).get("If-None-Match");
      if (String(url).endsWith("?status=open")) return json({ success: true, data: { n } }, { ETag: 'W/"open"' });
      if (tag === 'W/"v1"') return json({ success: true, data: { n, version: 2 } }, { ETag: 'W/"v2"' });
      return json({ success: true, data: { n, version: 1 } }, { ETag: 'W/"v1"' });
    },
  });
  const a = await client.get<{ version: number }>("/api/tasks");
  const b = await client.get<{ version: number }>("/api/tasks");
  assert.ok(a.success && b.success);
  assert.equal(b.data.version, 2, "server said changed → new body used");
  const filtered = await client.get<{ n: number }>("/api/tasks?status=open");
  assert.ok(filtered.success);
  assert.ok(!filtered.meta.fromCache);
});

test("only successful JSON GETs are remembered; a 304 without a remembered body is an error, not a crash", async () => {
  let n = 0;
  const client = createOrbitApiClient({
    conditionalCache: new Map(),
    fetchImpl: async () => {
      n += 1;
      if (n === 1) return json({ success: false, error: { code: "X", message: "no" } }, { ETag: 'W/"err"' }, 503);
      return new Response(null, { status: 304, headers: { ETag: 'W/"err"' } });
    },
  });
  const failed = await client.get("/api/tasks");
  assert.equal(failed.success, false);
  const orphan = await client.get("/api/tasks");
  assert.equal(orphan.success, false);
  if (orphan.success) assert.fail();
  assert.equal(orphan.error.code, "ORBIT_APP_STALE_CONDITIONAL_RESPONSE");
});

test("the cache is keyed by the session cookie so a different account never replays another account's body", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? json({ success: true, data: { owner: "a" } }, { ETag: 'W/"same"' })
      : json({ success: true, data: { owner: "b" } }, { ETag: 'W/"same"' });
  };
  const shared = new Map();
  const a = createOrbitApiClient({ authCookieHeader: "session=a", fetchImpl, conditionalCache: shared });
  const b = createOrbitApiClient({ authCookieHeader: "session=b", fetchImpl, conditionalCache: shared });
  const ra = await a.get<{ owner: string }>("/api/tasks");
  const rb = await b.get<{ owner: string }>("/api/tasks");
  assert.ok(ra.success && rb.success);
  assert.equal(rb.data.owner, "b");
  assert.ok(!rb.meta.fromCache);
});

test("clients created separately (one per screen) share the remembered response", async () => {
  let calls = 0;
  const fetchImpl = async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    return new Headers(init?.headers).get("If-None-Match") === 'W/"x"'
      ? new Response(null, { status: 304, headers: { ETag: 'W/"x"' } })
      : json({ success: true, data: { calls } }, { ETag: 'W/"x"' });
  };
  const shared = new Map();
  const first = await createOrbitApiClient({ fetchImpl, conditionalCache: shared }).get<{ calls: number }>("/api/tasks");
  const second = await createOrbitApiClient({ fetchImpl, conditionalCache: shared }).get<{ calls: number }>("/api/tasks");
  assert.ok(first.success && second.success);
  assert.equal(second.meta.fromCache, true, "a second client instance must replay the first one's body");
  assert.deepEqual(second.data, first.data);
});

test("POST responses are never cached and never send If-None-Match", async () => {
  const headers: (string | null)[] = [];
  const client = createOrbitApiClient({ fetchImpl: async (_url, init) => { headers.push(new Headers(init?.headers).get("If-None-Match")); return json({ success: true, data: {} }, { ETag: 'W/"p"' }); } });
  await client.post("/api/tasks", { body: {} });
  await client.post("/api/tasks", { body: {} });
  assert.deepEqual(headers, [null, null]);
});
