import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import type { PlanHomeView, PlanV2Detail } from "../../shared/contract/plan-v2";
import { fixturesE } from "../../features/plans/v2/design-fixtures/e";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { overridePlansV2MockSeed, resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R37a SC-04：v3 计划主页（PlanHomeV3）真实渲染。fetch 在页内打桩并记录，断言每个点击发出的请求。
// 基础数据 = mock v2 接口读出的 v16 主页 fixture（契约形状）。
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Call = { url: string; method: string; body?: any };
const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });

let browser: Browser;
let code: { js: string; css: string };
const details: Record<string, PlanV2Detail> = {};
let v2Detail: PlanV2Detail;

type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
async function call(handler: RouteHandler, url: string, params: Record<string, string> = {}) {
  const response = await handler(new Request(`http://localhost${url}`, { headers: { "content-type": "application/json", "x-orbit-lang": "ja" } }), { params: Promise.resolve(params) });
  return (await response.json()) as { success: boolean; data: any };
}

test.before(async () => {
  resetPlansV2MockRepositoryForTests();
  overridePlansV2MockSeed(fixturesE["v16-home-all"]!());
  const v2 = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock", schedulePlanHome: () => undefined });
  for (const goal of ["fund", "sales", "hire"]) details[goal] = (await call(v2.detail, `/api/agent/plans/v2/plan_v16_${goal}`, { planId: `plan_v16_${goal}` })).data;
  v2Detail = (await call(v2.detail, "/api/agent/plans/v2/demo-plan-series-a", { planId: "demo-plan-series-a" })).data;
  overridePlansV2MockSeed(null);
  resetPlansV2MockRepositoryForTests();
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PlanOverview } from "./app/(app)/app/orbit-2026/plan/PlanOverview";
    const f = window.shellFixture;
    const counts = {};
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : undefined;
      f.fetches.push({ url: String(url), method, body });
      const index = f.handlers.findIndex((h) => h.method === method && new RegExp(h.url).test(String(url)));
      if (index === -1) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404 });
      const handler = f.handlers[index];
      const n = counts[index] = (counts[index] ?? -1) + 1;
      const reply = handler.replies[Math.min(n, handler.replies.length - 1)];
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
    };
    createRoot(document.getElementById("root")).render(<PlanOverview planId={f.planId} />);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function screen(t: { after: (fn: () => Promise<void>) => void }, detail: PlanV2Detail, extra: Handler[] = [], width = 1440): Promise<Page> {
  const handlers: Handler[] = [
    ...extra,
    { method: "GET", replies: [ok(detail)], url: `/api/agent/plans/v2/${detail.planId}$` },
    { method: "GET", replies: [ok({ goals: [] })], url: "/api/agent/plans/v2$" },
  ];
  const page = await open(browser, code, { width, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], handlers, lang: "ja", path: "/app/tasks", planId: detail.planId })}</script>` });
  await page.evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied = text; } } })`);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}
const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const writes = async (page: Page) => (await fetches(page)).filter((item) => item.method !== "GET").map((item) => `${item.method} ${item.url}`);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("v3 plan renders the home: stage first, route with done flags, checklist, seats, evidence collapsed; v2 plan keeps the R24 overview", async (t) => {
  for (const goal of ["fund", "sales", "hire"]) {
    const detail = details[goal]!;
    assert.equal(detail.home!.state, "ready");
    const page = await screen(t, detail);
    await page.waitForSelector("[data-plan-home-v3]");
    const head = await page.textContent("[data-plan-home-head]");
    assert.match(head!, /ステージ 1/u);
    assert.match(head!, /人脈にいる \d+ \/ \d+ 人 · \d+ \/ 100 点/u);
    assert.equal(await page.locator("[data-plan-v3-route] em").count(), detail.content.steps.length, "every stage shows its done flag");
    assert.equal(await page.locator("[data-plan-home-action]").count(), 3);
    assert.equal(await page.locator("[data-plan-home-prep]").count(), 0, "prep cards start closed");
    assert.equal(await page.locator("[data-plan-home-seat]").count(), detail.content.personTypes.length + 1);
    assert.equal(await page.locator("[data-plan-home-evidence=closed]").count(), 1);
    assert.equal(await page.locator("[data-plan-overview-v3] [data-plan-steps]").count(), 0, "no R24 grid on a v3 plan");
  }
  const old = await screen(t, v2Detail);
  await old.waitForSelector("[data-plan-steps]");
  assert.equal(await old.locator("[data-plan-home-v3]").count(), 0);
});

test("prep card: opens one at a time, rows without records are not drawn, underlines, copy, gaps; regenerate when stale", async (t) => {
  const detail = clone(details.fund!);
  const yamamoto = detail.home!.actions.find((action) => action.contactId === "c_v16_yamamoto")!;
  yamamoto.prep!.staleSince = "2026-11-02T00:00:00.000Z";
  const regenerated: PlanHomeView = clone(detail.home!);
  regenerated.actions.find((action) => action.contactId === "c_v16_yamamoto")!.prep!.staleSince = null;
  delete (regenerated as { seats?: unknown }).seats;
  const page = await screen(t, detail, [{ method: "POST", replies: [ok(regenerated)], url: "/home/actions/.*/regenerate$" }]);
  await page.waitForSelector("[data-plan-home-v3]");
  const sato = page.locator('[data-plan-home-action="c:c_v16_sato"]');
  await sato.locator("[data-plan-home-prep-toggle]").click();
  const card = page.locator('[data-plan-home-prep="c:c_v16_sato"]');
  assert.deepEqual(await card.locator("[data-plan-home-row]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-plan-home-row"))), ["who", "met", "common"], "no last contact → no row");
  assert.equal(await card.locator("[data-plan-home-fact]").count(), 1);
  assert.ok(await card.locator("u").count() >= 3, "underlined parts come from the details above");
  assert.equal(await card.getAttribute("data-fallback"), null);
  assert.equal(await card.locator("[data-plan-home-gaps]").getAttribute("data-plan-home-gaps"), "interaction");
  await card.getByRole("button", { name: "コピー" }).click();
  assert.match(String(await page.evaluate(() => (window as any).copied)), /^佐藤さん/u);
  // 另一张打开时前一张收起。
  await page.locator('[data-plan-home-action="c:c_v16_yamamoto"] [data-plan-home-prep-toggle]').click();
  assert.equal(await page.locator("[data-plan-home-prep]").count(), 1);
  const other = page.locator('[data-plan-home-prep="c:c_v16_yamamoto"]');
  assert.equal(await other.locator("[data-plan-home-fact]").count(), 0, "no facts → no memo rows");
  assert.equal(await other.locator("[data-plan-home-gaps]").getAttribute("data-plan-home-gaps"), "memo,interaction");
  await other.locator("[data-plan-home-regenerate]").click();
  await page.waitForSelector("[data-plan-home-stale]", { state: "detached" });
  assert.deepEqual(await writes(page), ["POST /api/agent/plans/v2/plan_v16_fund/home/actions/c%3Ac_v16_yamamoto/regenerate"]);
  assert.equal(await page.locator("[data-plan-home-seat-detail]").count(), 0);
  assert.equal(await page.locator("[data-plan-home-seat]").count(), detail.content.personTypes.length + 1, "seats survive a response without them");
});

test("checking an action posts done and stays checked; a failed write rolls back", async (t) => {
  const detail = clone(details.sales!);
  const after: PlanHomeView = clone(detail.home!);
  after.actions[0]!.done = true;
  const page = await screen(t, detail, [{ method: "POST", replies: [ok(after), { body: { error: { code: "INTERNAL_ERROR" }, success: false }, status: 500 }], url: "/home/actions/.*/done$" }]);
  await page.waitForSelector("[data-plan-home-v3]");
  const first = page.locator("[data-plan-home-action]").first();
  await first.locator("[data-plan-home-done]").click();
  await page.waitForFunction(() => document.querySelector("[data-plan-home-action]")?.getAttribute("data-done") === "true");
  const sent = (await fetches(page)).filter((item) => item.method === "POST");
  assert.equal(sent[0]!.body.done, true);
  assert.match(sent[0]!.body.idempotencyKey, /^web:plan:/u);
  const second = page.locator("[data-plan-home-action]").nth(1);
  await second.locator("[data-plan-home-done]").click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.filter((item: Call) => item.method === "POST").length === 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-plan-home-action]")[1]?.getAttribute("data-done") === "false");
});

test("「+ そのとき話したことを一言書く」 adds a manual fact; seats expand to who / where to meet / questions; evidence opens", async (t) => {
  const detail = clone(details.hire!);
  const page = await screen(t, detail, [{ method: "POST", replies: [{ body: { data: { factId: "f1", staleCards: 1, text: "x" }, success: true }, status: 201 }], url: "/api/contacts/.*/facts$" }]);
  await page.waitForSelector("[data-plan-home-v3]");
  await page.locator('[data-plan-home-action="c:c_v16_chen"] [data-plan-home-prep-toggle]').click();
  await page.locator('[data-plan-home-gap="memo"]').click();
  await page.locator("[data-plan-home-fact-input]").fill("Go の求人に興味がある");
  await page.getByRole("button", { name: "追加" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((item: Call) => item.url.includes("/facts")));
  const fact = (await fetches(page)).find((item) => item.url.includes("/facts"))!;
  assert.equal(fact.url, "/api/contacts/c_v16_chen/facts");
  assert.equal(fact.body.text, "Go の求人に興味がある");
  assert.equal(await page.locator('[data-plan-home-gap="interaction"]').getAttribute("href"), "/app/contacts/c_v16_chen");

  await page.locator('[data-plan-home-seat="recruiter"]').click();
  const empty = page.locator('[data-plan-home-seat-detail="recruiter"]');
  assert.match((await empty.textContent())!, /近いイベントにもこのタイプの参加者は明記されていません/u);
  assert.equal(await empty.locator("li").count(), 3);
  await page.locator('[data-plan-home-seat="candidate"]').click();
  assert.match((await page.locator('[data-plan-home-seat-detail="candidate"]').textContent())!, /小林 翔/u);

  await page.getByRole("button", { name: /なぜこの順番か/u }).click();
  assert.equal(await page.locator("[data-plan-home-evidence=open] [data-plan-v3-evidence]").count(), 1);
});

test("pending home shows the preparing line and reloads the overview; an empty ready home shows the go-meet hint", async (t) => {
  const pending = clone(details.fund!);
  pending.home = { actions: [], lead: null, seats: pending.home!.seats, state: "pending" };
  const page = await screen(t, pending);
  await page.waitForSelector("[data-plan-home-todo=pending]");
  assert.match((await page.textContent("[data-plan-home-todo]"))!, /準備しています/u);
  const empty = clone(details.fund!);
  empty.home = { actions: [], lead: null, seats: empty.home!.seats, state: "ready" };
  const second = await screen(t, empty);
  await second.waitForSelector("[data-plan-home-todo=ready]");
  assert.match((await second.textContent("[data-plan-home-todo]"))!, /人脈にまだ合う人がいません/u);
});
