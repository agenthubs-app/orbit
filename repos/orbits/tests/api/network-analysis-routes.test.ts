import assert from "node:assert/strict";
import test from "node:test";

import { createNetworkAnalysisRouteHandlers } from "../../features/network-analysis/analysis-handlers";
import type { NetworkAnalysisReadDeps } from "../../features/network-analysis/analysis-reader";
import { designNetworkNeeds, designNetworkPeople } from "../../features/network-analysis/design-fixtures";
import { NETWORK_FIXTURE_NOW } from "../../features/network-analysis/analysis-fixtures";
import { networkAnalysisPeopleSchema, networkAnalysisViewSchema } from "../../shared/api-schema/network-analysis-view";

// R11b SC-03 / SC-07：<10 人只读一个人数（0 次行读取、0 次计划读取）；下钻直链也绕不过锁；读不到人数是错误不是 0 人。
function deps(variant: "locked5" | "few14" | "many286", spy: { rows: number; needs: number }, overrides: Partial<NetworkAnalysisReadDeps> = {}): NetworkAnalysisReadDeps {
  const rows = designNetworkPeople(variant);
  return {
    readTotal: async () => rows.length,
    readRows: async () => { spy.rows += 1; return rows; },
    readNeeds: async () => { spy.needs += 1; return designNetworkNeeds(variant); },
    now: () => NETWORK_FIXTURE_NOW,
    ...overrides,
  };
}
const actor = async () => ({ id: "actor-1" });

test("below 10 people the view is locked after one count: no rows, no plan read", async () => {
  const spy = { rows: 0, needs: 0 };
  const handlers = createNetworkAnalysisRouteHandlers({ resolveActor: actor, deps: () => deps("locked5", spy) });
  const body = await (await handlers.GET()).json();
  assert.deepEqual(networkAnalysisViewSchema.parse(body.data).lock, { state: "locked", total: 5, required: 10, missing: 5 });
  assert.equal(body.data.structure, undefined);
  assert.deepEqual(spy, { rows: 0, needs: 0 });
  const people = await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=industry&bucket=finance_investment"));
  assert.equal(people.status, 409, "a direct drill-down link does not get around the lock");
  assert.equal((await people.json()).error.context?.reason ?? "LOCKED", "LOCKED");
  assert.deepEqual(spy, { rows: 0, needs: 0 });
});

test("from 10 people the view and a drill-down list reconcile", async () => {
  const spy = { rows: 0, needs: 0 };
  const handlers = createNetworkAnalysisRouteHandlers({ resolveActor: actor, deps: () => deps("many286", spy) });
  const view = networkAnalysisViewSchema.parse((await (await handlers.GET()).json()).data);
  const finance = view.structure!.industries.buckets[0]!;
  const response = await handlers.people(new Request(`http://localhost/api/network/analysis/people?dimension=industry&bucket=${finance.id}&limit=10`));
  assert.equal(response.status, 200);
  const list = networkAnalysisPeopleSchema.parse((await response.json()).data);
  assert.equal(list.total, finance.count);
  assert.equal(list.items.length, 10);
  assert.ok(list.nextCursor);
  const stalled = view.opportunities!.find((card) => card.kind === "stalled")!;
  const stalledList = networkAnalysisPeopleSchema.parse((await (await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=opportunity&bucket=stalled"))).json()).data);
  assert.equal(stalledList.total, stalled.count);
});

test("errors: sign-in required, strict list query, unknown bucket 404, an unreadable count is 503 (never a 0-person lock)", async () => {
  const signedOut = createNetworkAnalysisRouteHandlers({ resolveActor: async () => null, deps: () => deps("few14", { rows: 0, needs: 0 }) });
  assert.equal((await signedOut.GET()).status, 401);
  const handlers = createNetworkAnalysisRouteHandlers({ resolveActor: actor, deps: () => deps("few14", { rows: 0, needs: 0 }) });
  assert.equal((await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=industry"))).status, 400);
  assert.equal((await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=industry&bucket=x&contactIds=a"))).status, 400, "no contactIds query");
  assert.equal((await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=opportunity&bucket=nope"))).status, 404);
  assert.equal((await handlers.people(new Request("http://localhost/api/network/analysis/people?dimension=industry&bucket=finance_investment&cursor=%25%25"))).status, 400);
  const broken = createNetworkAnalysisRouteHandlers({ resolveActor: actor, deps: () => deps("few14", { rows: 0, needs: 0 }, { readTotal: async () => { throw new Error("db down"); } }) });
  const failed = await broken.GET();
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).success, false);
});

test("an analysis read error logs only a safe category and code", async () => {
  const privateDetail = "private-contact@example.test";
  const handlers = createNetworkAnalysisRouteHandlers({ resolveActor: actor, deps: () => deps("few14", { rows: 0, needs: 0 }, { readTotal: async () => { throw new TypeError(privateDetail); } }) });
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.join(" ")); };
  try { assert.equal((await handlers.GET()).status, 503); }
  finally { console.error = original; }
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), { event: "network_analysis_read_failed", errorCategory: "TypeError", errorCode: "SERVICE_UNAVAILABLE" });
  assert.equal(lines[0]!.includes(privateDetail), false);
});
