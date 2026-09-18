import assert from "node:assert/strict";
import test from "node:test";
import { conditionalJsonRead, type ConditionalReadDependencies } from "../../app/api/_shared/conditional-read";
import type { DomainWatermarkSqlClient } from "../../shared/storage/domain-watermark";

// The helper decides 304 vs produce() purely from the watermark row, the
// request identity and the code version; no business read happens on a hit.
function fakeClient(state: { max: string; count: number; calls: number }): DomainWatermarkSqlClient {
  return { async query<T>() { state.calls += 1; return { rows: [{ max_updated_at: state.max, count: String(state.count) } as T] }; } };
}

function deps(state: { max: string; count: number; calls: number }, version = "v1"): ConditionalReadDependencies {
  return { client: fakeClient(state), version };
}

const scope = (url = "https://orbit.local/api/tasks", actorId = "actor:a") => ({
  routeKey: "tasks.list", request: new Request(url), actorId, workspaceId: "w", collections: ["tasks"], userScoped: true,
});

test("first read produces the body with a weak ETag and private no-cache headers", async () => {
  const state = { max: "2026-09-18T04:00:00Z", count: 3, calls: 0 };
  let produced = 0;
  const response = await conditionalJsonRead(scope(), deps(state), async () => { produced += 1; return Response.json({ success: true, data: { tasks: [] } }); });
  assert.equal(response.status, 200);
  assert.equal(produced, 1);
  assert.match(response.headers.get("ETag") ?? "", /^W\/"[a-f0-9]{64}"$/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-cache");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.deepEqual(await response.json(), { success: true, data: { tasks: [] } });
  assert.equal(state.calls, 1, "one watermark query");
});

test("a matching If-None-Match returns 304 without calling produce and with the same ETag", async () => {
  const state = { max: "2026-09-18T04:00:00Z", count: 3, calls: 0 };
  const first = await conditionalJsonRead(scope(), deps(state), async () => Response.json({ success: true, data: 1 }));
  const etag = first.headers.get("ETag")!;
  let produced = 0;
  const second = await conditionalJsonRead(
    { ...scope(), request: new Request("https://orbit.local/api/tasks", { headers: { "If-None-Match": etag } }) },
    deps(state),
    async () => { produced += 1; return Response.json({ success: true, data: 2 }); },
  );
  assert.equal(second.status, 304);
  assert.equal(produced, 0, "no business read on a hit");
  assert.equal(second.headers.get("ETag"), etag);
  assert.equal(await second.text(), "");
  // Multiple candidates and the wildcard-free list form are honoured.
  const third = await conditionalJsonRead(
    { ...scope(), request: new Request("https://orbit.local/api/tasks", { headers: { "If-None-Match": `"other", ${etag}` } }) },
    deps(state), async () => Response.json({ success: true }),
  );
  assert.equal(third.status, 304);
});

test("the ETag changes with the watermark, the query string, the actor, the workspace and the code version", async () => {
  const base = { max: "2026-09-18T04:00:00Z", count: 3, calls: 0 };
  const etagOf = async (s = scope(), d = deps(base)) => (await conditionalJsonRead(s, d, async () => Response.json({ success: true }))).headers.get("ETag");
  const reference = await etagOf();
  assert.equal(await etagOf(), reference, "deterministic");
  assert.notEqual(await etagOf(scope(), deps({ ...base, max: "2026-09-18T05:00:00Z" })), reference, "watermark time");
  assert.notEqual(await etagOf(scope(), deps({ ...base, count: 2 })), reference, "watermark count");
  assert.notEqual(await etagOf(scope("https://orbit.local/api/tasks?status=open")), reference, "query string");
  assert.notEqual(await etagOf(scope(undefined, "actor:b")), reference, "actor");
  assert.notEqual(await etagOf({ ...scope(), workspaceId: "w2" }), reference, "workspace");
  assert.notEqual(await etagOf(scope(), deps(base, "v2")), reference, "code version");
  assert.notEqual(await etagOf({ ...scope(), routeKey: "notes.list" }), reference, "route");
});

test("a stale If-None-Match after a change produces a fresh body with a new ETag", async () => {
  const state = { max: "2026-09-18T04:00:00Z", count: 3, calls: 0 };
  const first = await conditionalJsonRead(scope(), deps(state), async () => Response.json({ success: true, data: 1 }));
  const stale = first.headers.get("ETag")!;
  state.max = "2026-09-18T04:30:00Z";
  const second = await conditionalJsonRead(
    { ...scope(), request: new Request("https://orbit.local/api/tasks", { headers: { "If-None-Match": stale } }) },
    deps(state), async () => Response.json({ success: true, data: 2 }),
  );
  assert.equal(second.status, 200);
  assert.notEqual(second.headers.get("ETag"), stale);
  assert.deepEqual(await second.json(), { success: true, data: 2 });
});

test("without a SQL client (mock mode) the read passes through untouched, and non-200 bodies carry no ETag", async () => {
  const passthrough = await conditionalJsonRead(scope(), { client: null }, async () => Response.json({ success: true }, { status: 200 }));
  assert.equal(passthrough.status, 200);
  assert.equal(passthrough.headers.get("ETag"), null);
  const state = { max: "x", count: 1, calls: 0 };
  const failure = await conditionalJsonRead(scope(), deps(state), async () => Response.json({ success: false }, { status: 503 }));
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("ETag"), null);
});

test("a watermark failure never breaks the read: it degrades to an uncached 200", async () => {
  const broken: DomainWatermarkSqlClient = { async query() { throw new Error("db down"); } };
  const response = await conditionalJsonRead(scope(), { client: broken, version: "v1" }, async () => Response.json({ success: true }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("ETag"), null);
});
