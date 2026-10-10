import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { redesignMock } from "../../features/redesign-contracts/mock-service";
import { redesignContractRoute } from "../../features/redesign-contracts/route";
import { isNotImplemented } from "../../shared/compute/not-implemented";
import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../shared/api-schema/home-layout";

// R08 (SC-R08-01 / 02): every new redesign contract route answers from the demo
// world in mock mode and with a structured NOT_IMPLEMENTED in live mode — never
// with a fixture.
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
type Case = { file: string; method: string; params?: Record<string, string>; body?: unknown; status?: number };

const key = { idempotencyKey: "k-1" };
const CASES: Case[] = [
  { file: "home/layout", method: "GET" },
  { file: "home/layout", method: "PUT", body: { expectedRevision: 3, mutationId: "m-1", app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web } },
  { file: "contacts/completion-question", method: "GET" },
  { file: "contacts/completion-question/[id]/answer", method: "POST", params: { id: "demo-question-1" }, body: { answer: "イベント", ...key } },
  { file: "contacts/completion-question/[id]/skip", method: "POST", params: { id: "demo-question-1" }, body: key },
  { file: "invite-codes", method: "POST", body: { shared: { displayName: "Orbit デモ" }, maxUses: 5, ...key }, status: 201 },
  { file: "invite-codes/current", method: "GET" },
  { file: "invite-codes/[code]/preview", method: "GET", params: { code: "K7QX-2M9P" } },
  { file: "invite-codes/[code]/redeem", method: "POST", params: { code: "K7QX-2M9P" } },
  { file: "invite-codes/[code]/revoke", method: "POST", params: { code: "K7QX-2M9P" } },
  { file: "events/assessments", method: "GET" },
  { file: "events/assessments", method: "POST", body: { sourceKind: "url", url: "https://example.com/e", ...key }, status: 202 },
  { file: "events/assessments/[id]", method: "GET", params: { id: "demo-assessment-saas-summit" } },
  { file: "events/assessments/[id]", method: "PATCH", params: { id: "demo-assessment-saas-summit" }, body: { facts: { price: "3,000円" } } },
  { file: "events/assessments/[id]/add-to-plan", method: "POST", params: { id: "demo-assessment-saas-summit" } },
  { file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "demo-event-robotics-meetup" }, body: { reason: "distance", ...key } },
  { file: "account/exports", method: "GET" },
  { file: "account/exports", method: "POST", body: { scope: ["contacts", "notes"], ...key }, status: 202 },
  { file: "account/exports/[id]", method: "GET", params: { id: "demo-export-1" } },
  { file: "account/deletion-request", method: "POST", status: 202 },
  { file: "account/deletion-request", method: "GET" },
  { file: "account/deletion-request", method: "DELETE" },
  { file: "app/version", method: "GET" },
  // R22：agent/plans/v2/summary 已由计划 v2 实现（tests/api/plan-v2-routes.test.ts），不再是「尚未实现」。
];

async function call(item: Case): Promise<Response> {
  const routeModule = (await import(`../../app/api/${item.file}/route.ts`)) as Record<string, Handler>;
  const handler = routeModule[item.method];
  assert.ok(handler, `${item.method} /api/${item.file}`);
  const request = new Request(`http://localhost/api/${item.file}`, {
    method: item.method,
    ...(item.body ? { body: JSON.stringify(item.body), headers: { "content-type": "application/json" } } : {}),
  });
  return handler(request, { params: Promise.resolve(item.params ?? {}) });
}

async function withMode<T>(mode: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;
  try { return await run(); } finally {
    if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous;
  }
}

test("mock: every route answers success from the demo world (the handlers parse each answer with the contract schema)", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    for (const item of CASES) {
      const response = await call(item);
      const body = await response.json();
      assert.equal(response.status, item.status ?? 200, `${item.method} ${item.file}: ${JSON.stringify(body)}`);
      assert.equal(body.success, true, `${item.method} ${item.file}`);
      assert.equal(response.headers.get("X-Orbit-Feature-Mode"), "mock");
    }
  });
  redesignMock.reset();
});

test("live (and so production): every route answers 503 NOT_IMPLEMENTED with no fixture in the body", async () => {
  await withMode("live", async () => {
    for (const item of CASES) {
      const response = await call(item);
      const text = await response.text();
      const body = JSON.parse(text);
      assert.equal(response.status, 503, `${item.method} ${item.file}`);
      assert.equal(isNotImplemented(body), true, `${item.method} ${item.file}: ${text}`);
      assert.match(body.error.context.capabilityId, /^[a-z0-9-]+$/u);
      assert.doesNotMatch(text, /demo-|sample|渡辺|K7QX/u, `${item.file} leaked a fixture`);
    }
  });
});

test("PUT home layout: a stale revision is a 409; a fresh one bumps the revision; the same mutationId again returns the first answer", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const put = (expectedRevision: number, mutationId: string) => call({ file: "home/layout", method: "PUT", body: { expectedRevision, mutationId, app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web } });
    const first = await put(3, "m-1");
    assert.equal(homeLayoutSchema.parse((await first.json()).data).revision, 4);
    const replay = await put(3, "m-1");
    assert.equal(replay.status, 200, "a retry after a timeout is not a conflict");
    assert.equal(homeLayoutSchema.parse((await replay.json()).data).revision, 4);
    const stale = await put(3, "m-2");
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.context.currentRevision, "4");
  });
  redesignMock.reset();
});

test("the mock keeps what it was told: revoke stops the code, PATCH persists, idempotency keys replay, exports stay consistent", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const code = { code: "K7QX-2M9P" };
    await call({ file: "invite-codes/[code]/revoke", method: "POST", params: code });
    assert.equal((await call({ file: "invite-codes/[code]/preview", method: "GET", params: code })).status, 404);
    assert.equal((await call({ file: "invite-codes/[code]/redeem", method: "POST", params: code })).status, 404);
    assert.equal((await (await call({ file: "invite-codes/current", method: "GET" })).json()).data, null);

    const id = { id: "demo-assessment-saas-summit" };
    await call({ file: "events/assessments/[id]", method: "PATCH", params: id, body: { facts: { price: "3,000円" } } });
    assert.equal((await (await call({ file: "events/assessments/[id]", method: "GET", params: id })).json()).data.facts.price, "3,000円");
    const create = () => call({ file: "events/assessments", method: "POST", body: { sourceKind: "poster", posterAssetId: "asset-1", idempotencyKey: "same" } });
    assert.equal((await (await create()).json()).data.id, (await (await create()).json()).data.id);

    const exported = (await (await call({ file: "account/exports", method: "POST", body: { scope: ["tasks"], idempotencyKey: "e-1" } })).json()).data;
    const fetched = (await (await call({ file: "account/exports/[id]", method: "GET", params: { id: exported.id } })).json()).data;
    assert.deepEqual([fetched.id, fetched.status, fetched.scope], [exported.id, "queued", ["tasks"]]);
    assert.notEqual(exported.id, "demo-export-1");

    assert.equal((await call({ file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "no-such-event" }, body: { reason: "known", ...key } })).status, 404);
  });
  redesignMock.reset();
});

test("an assessment needs the input its source kind names", async () => {
  await withMode("mock", async () => {
    const bad = await call({ file: "events/assessments", method: "POST", body: { sourceKind: "url", ...key } });
    assert.equal(bad.status, 400, "a url assessment without a url");
    const poster = await call({ file: "events/assessments", method: "POST", body: { sourceKind: "poster", url: "https://example.com", ...key } });
    assert.equal(poster.status, 400, "a poster needs posterAssetId, not url");
  });
});

test("ORBIT_REDESIGN_MOCK turns the demo world on per contract outside production only", async () => {
  const previous = { mock: process.env.ORBIT_REDESIGN_MOCK, env: process.env.NODE_ENV };
  try {
    process.env.ORBIT_REDESIGN_MOCK = "home-layout";
    await withMode("live", async () => {
      assert.equal((await call({ file: "home/layout", method: "GET" })).status, 200);
      assert.equal((await call({ file: "invite-codes/current", method: "GET" })).status, 503, "contracts not listed stay live");
      (process.env as Record<string, string>).NODE_ENV = "production";
      assert.equal((await call({ file: "home/layout", method: "GET" })).status, 503, "production ignores the switch");
    });
  } finally {
    if (previous.mock === undefined) delete process.env.ORBIT_REDESIGN_MOCK; else process.env.ORBIT_REDESIGN_MOCK = previous.mock;
    (process.env as Record<string, string | undefined>).NODE_ENV = previous.env;
  }
});

test("a response that fails its own schema is a 500 in the envelope, never sent", async () => {
  const route = redesignContractRoute("home-layout", homeLayoutSchema, () => ({ data: { revision: -1, app: [], web: [] } }));
  await withMode("mock", async () => {
    const response = await route(new Request("http://localhost/api/home/layout"));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual([body.success, body.error.code], [false, "INTERNAL_ERROR"]);
    assert.doesNotMatch(JSON.stringify(body), /revision/u);
  });
});

test("bad bodies are 400s and unknown ids are 404s, still in the envelope", async () => {
  await withMode("mock", async () => {
    const bad = await call({ file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "x" }, body: { reason: "boring", ...key } });
    assert.equal(bad.status, 400);
    const missing = await call({ file: "invite-codes/[code]/preview", method: "GET", params: { code: "NOPE-NOPE" } });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).success, false);
  });
});

test("the invite preview and the App version are the only new routes open before sign-in", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /\\\/api\\\/invite-codes\\\/\[\^\/\]\+\\\/preview\$/u);
  assert.match(proxy, /pathname === "\/api\/app\/version"/u);
  assert.doesNotMatch(proxy, /\/api\/(home\/layout|account\/exports|account\/deletion-request|events\/assessments)/u);
});
