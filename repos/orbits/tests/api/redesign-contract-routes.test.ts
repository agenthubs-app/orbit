import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { redesignMock } from "../../features/redesign-contracts/mock-service";
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
  { file: "invite-codes", method: "POST", status: 201 },
  { file: "invite-codes/current", method: "GET" },
  { file: "invite-codes/[code]/revoke", method: "POST", params: { code: "K7QX-2M9P" } },
  { file: "invite-codes/[code]/preview", method: "GET", params: { code: "K7QX-2M9P" } },
  { file: "invite-codes/[code]/redeem", method: "POST", params: { code: "K7QX-2M9P" } },
  { file: "events/assessments", method: "GET" },
  { file: "events/assessments", method: "POST", body: { sourceKind: "url", url: "https://example.com/e", ...key }, status: 202 },
  { file: "events/assessments/[id]", method: "GET", params: { id: "demo-assessment-saas-summit" } },
  { file: "events/assessments/[id]", method: "PATCH", params: { id: "demo-assessment-saas-summit" }, body: { facts: { price: "3,000円" } } },
  { file: "events/assessments/[id]/add-to-plan", method: "POST", params: { id: "demo-assessment-saas-summit" } },
  { file: "recommendations/events/[id]/dismiss", method: "POST", params: { id: "demo-event-robotics-meetup" }, body: { reason: "distance", ...key } },
  { file: "account/exports", method: "GET" },
  { file: "account/exports", method: "POST", status: 202 },
  { file: "account/exports/[id]", method: "GET", params: { id: "demo-export-1" } },
  { file: "account/deletion-request", method: "POST", status: 202 },
  { file: "account/deletion-request", method: "GET" },
  { file: "account/deletion-request", method: "DELETE" },
  { file: "app/version", method: "GET" },
  { file: "agent/plans/v2/summary", method: "GET" },
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

test("PUT home layout: a stale revision is a 409 conflict; a fresh one bumps the revision", async () => {
  redesignMock.reset();
  await withMode("mock", async () => {
    const put = (expectedRevision: number) => call({ file: "home/layout", method: "PUT", body: { expectedRevision, mutationId: "m", app: DEFAULT_HOME_LAYOUT.app, web: DEFAULT_HOME_LAYOUT.web } });
    const first = await put(3);
    assert.equal(homeLayoutSchema.parse((await first.json()).data).revision, 4);
    const stale = await put(3);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.context.currentRevision, "4");
  });
  redesignMock.reset();
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
