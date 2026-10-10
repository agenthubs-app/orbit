import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import type { PlanAwardResult, PlanPersonTypeDetail, PlanScoreView, PlanV2Detail } from "../../shared/contract/plan-v2";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R24 (UI-SPEC 画面): the Web プラン概要 and 人物タイプ詳細 rendered for real. fetch is
// stubbed in the page and every call is recorded, so each test asserts which requests a
// click makes — and that opening, ticking and expanding make none. Base fixtures come
// from the mock v2 handlers (the demo world's plan), so every shape is the contract's.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Fixture = { view: "overview" | "type"; planId: string; itemId?: string; lang?: string; handlers: Handler[]; bridge?: boolean };
type Call = { url: string; method: string; body?: any; lang?: string };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const PLAN = "demo-plan-series-a";
const VC = "demo-plan-item-vc_partner";
const FOUNDER = "demo-plan-item-funded_founder";
const LAWYER = "demo-plan-item-lawyer";

let browser: Browser;
let code: { js: string; css: string };
let base: { detail: PlanV2Detail; summaryTotal: number; types: Record<string, PlanPersonTypeDetail> };

const mock = () => createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: RouteHandler, url: string, params: Record<string, string> = {}, init: RequestInit = {}) {
  const response = await handler(new Request(`http://localhost${url}`, { ...init, headers: { "content-type": "application/json", "x-orbit-lang": "ja" } }), { params: Promise.resolve(params) });
  return (await response.json()) as { success: boolean; data: any };
}

test.before(async () => {
  resetPlansV2MockRepositoryForTests();
  const v2 = mock();
  const detail = (await call(v2.detail, `/api/agent/plans/v2/${PLAN}`, { planId: PLAN })).data as PlanV2Detail;
  const summary = (await call(v2.summary, "/api/agent/plans/v2/summary")).data;
  const types: Record<string, PlanPersonTypeDetail> = {};
  for (const type of detail.content.personTypes) types[type.itemId] = (await call(v2.typeDetail, "/x", { itemId: type.itemId, planId: PLAN })).data;
  base = { detail, summaryTotal: summary.current.score.total, types };
  resetPlansV2MockRepositoryForTests();
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PlanOverview } from "./app/(app)/app/orbit-2026/plan/PlanOverview";
    import { PlanTypeDetailScreen } from "./app/(app)/app/orbit-2026/plan/PlanTypeDetailScreen";
    const f = window.shellFixture;
    const counts = {};
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : undefined;
      f.fetches.push({ url: String(url), method, body, lang: init.headers && init.headers["x-orbit-lang"] });
      if (f.bridge && String(url).startsWith("/api/agent/plans")) {
        while (!window.planServer) await new Promise((resolve) => setTimeout(resolve, 10));
        const reply = await window.planServer(String(url), method, init.body || null, (init.headers && init.headers["x-orbit-lang"]) || "ja");
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
      }
      const index = f.handlers.findIndex((h) => h.method === method && new RegExp(h.url).test(String(url)));
      if (index === -1) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404 });
      const handler = f.handlers[index];
      const n = counts[index] = (counts[index] ?? -1) + 1;
      const reply = handler.replies[Math.min(n, handler.replies.length - 1)];
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
    };
    const view = f.view === "overview" ? <PlanOverview planId={f.planId} /> : <PlanTypeDetailScreen planId={f.planId} itemId={f.itemId} />;
    createRoot(document.getElementById("root")).render(view);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); resetPlansV2MockRepositoryForTests(); });

type ScreenOptions = { width?: number; dark?: boolean; reducedMotion?: boolean };

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture, options: ScreenOptions = {}, setup?: (page: Page) => Promise<void>): Promise<Page> {
  const page = await open(browser, code, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], lang: "ja", path: "/app/tasks", ...fixture })}</script>` });
  await page.evaluate(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied = text; } } })`);
  if (setup) await setup(page);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const path = (item: Call) => item.url.replace(/^\/api\/agent\/plans/u, "");
const writes = async (page: Page) => (await fetches(page)).filter((item) => item.method !== "GET").map((item) => `${item.method} ${path(item)}`);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const detailRead = (detail: PlanV2Detail): Handler => ({ method: "GET", replies: [ok(detail)], url: `/v2/${PLAN}$` });
const typeRead = (type: PlanPersonTypeDetail): Handler => ({ method: "GET", replies: [ok(type)], url: `/v2/${PLAN}/types/${type.itemId}$` });
const award = (points: number, part: PlanAwardResult["part"], extra: Partial<PlanAwardResult> = {}): PlanAwardResult => ({ awardLogId: part === "none" ? null : `log-${points}-${Math.random()}`, part, points, replayed: false, score: base.detail.score as PlanScoreView, ...extra });

/** The mock v2 handlers behind the page's fetch (mock mode, the demo world's plan). */
function bridge(page: Page) {
  const v2 = mock();
  const routes: [string, RegExp, RouteHandler, string[]][] = [
    ["GET", /^\/v2\/summary$/u, v2.summary, []],
    ["GET", /^\/v2\/pending$/u, v2.pending, []],
    ["POST", /^\/v2\/pending\/([^/]+)\/accept$/u, v2.acceptPending, ["id"]],
    ["POST", /^\/v2\/pending\/([^/]+)\/dismiss$/u, v2.dismissPending, ["id"]],
    ["GET", /^\/v2\/([^/]+)$/u, v2.detail, ["planId"]],
    ["POST", /^\/v2\/([^/]+)\/awards\/([^/]+)\/undo$/u, v2.undo, ["planId", "logId"]],
    ["POST", /^\/v2\/([^/]+)\/steps\/([^/]+)\/complete$/u, v2.completeStep, ["planId", "stepKey"]],
    ["DELETE", /^\/v2\/([^/]+)\/steps\/([^/]+)\/complete$/u, v2.reopenStep, ["planId", "stepKey"]],
    ["GET", /^\/v2\/([^/]+)\/types\/([^/]+)$/u, v2.typeDetail, ["planId", "itemId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/awards$/u, v2.award, ["planId", "itemId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/talked-offline$/u, v2.talkedOffline, ["planId", "itemId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/skip$/u, v2.skip, ["planId", "itemId"]],
    ["DELETE", /^\/v2\/([^/]+)\/types\/([^/]+)\/skip$/u, v2.unskip, ["planId", "itemId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/candidates\/([^/]+)\/decision$/u, v2.candidateDecision, ["planId", "itemId", "contactId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/proposals$/u, v2.proposal, ["planId", "itemId"]],
    ["POST", /^\/v2\/([^/]+)\/types\/([^/]+)\/intro-drafts$/u, v2.introDraft, ["planId", "itemId"]],
  ];
  return page.exposeFunction("planServer", async (url: string, method: string, body: string | null, lang: string) => {
    const sub = url.replace(/^\/api\/agent\/plans/u, "");
    for (const [verb, pattern, handler, names] of routes) {
      const match = verb === method ? pattern.exec(sub) : null;
      if (!match) continue;
      const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]));
      const response = await handler(new Request(`http://localhost${url}`, { body: body ?? undefined, headers: { "content-type": "application/json", "x-orbit-lang": lang }, method }), { params: Promise.resolve(params) });
      return { body: await response.json(), status: response.status };
    }
    return { body: { error: { code: "NOT_FOUND", message: sub }, success: false }, status: 404 };
  });
}

/* ---------- プラン概要 ---------- */

test("overview: the demo plan's score is the summary's; fields, segments, chance, steps, types, event and footnote render; opening writes nothing", async (t) => {
  resetPlansV2MockRepositoryForTests();
  const page = await screen(t, { bridge: true, handlers: [], planId: PLAN, view: "overview" }, {}, bridge);
  const root = page.locator(`[data-plan-overview="${PLAN}"]`);
  await root.waitFor();
  assert.equal(await page.locator("[data-plan-score]").getAttribute("data-plan-score"), String(base.summaryTotal), "overview total = GET /v2/summary total");
  await page.waitForFunction((total) => document.querySelector("[data-plan-score] [aria-hidden]")?.textContent === `${total}`, base.summaryTotal);
  await root.getByText(base.detail.goal).waitFor();
  assert.equal(await page.locator("[data-plan-bar] [data-seg]").count(), base.detail.score.segments.length);
  await page.getByText(`あと ${base.detail.score.remainingToFull} で満点`).waitFor();
  await page.getByText(`話して ${base.detail.score.talked} · スキップ ${base.detail.score.skipped}`).waitFor();
  await page.locator("[data-plan-chance]").getByText(base.detail.todayChance!.label).waitFor();
  assert.equal(await page.locator("[data-plan-chance] a").getAttribute("href"), base.detail.todayChance!.href);
  assert.equal(await page.locator("[data-plan-step]").count(), base.detail.content.steps.length);
  await page.locator('[data-plan-step="demo-step-3"]').getByText("2 / 3").waitFor();
  assert.equal(await page.locator("[data-type-card]").count(), base.detail.content.personTypes.length);
  await page.locator('[data-type-card="lawyer"]').getByText("習熟済み · スキップ（満額）").waitFor();
  await page.locator('[data-type-card="funded_founder"] [data-cell="candidates"]').getByText("人脈にいない").waitFor();
  assert.equal(await page.locator('[data-type-card="vc_partner"]').getAttribute("href"), `/app/plans/${PLAN}/types/${VC}`);
  await page.locator("[data-plan-event]").getByText("1 / 2回 · 1回 5点").waitFor();
  await page.locator("[data-plan-footnote]").getByText("Orbit は目標の達成を保証しません。", { exact: false }).waitFor();
  // 前提を見る: read-only rows; 「見直しで変える」 opens the R25 見直し entry (reads only).
  await page.getByRole("button", { name: "前提を見る" }).click();
  const dialog = page.getByRole("dialog", { name: "確定した前提" });
  await dialog.getByText(base.detail.premise[0]!.value).waitFor();
  assert.equal(await dialog.locator("input, textarea, select").count(), 0, "premises are read-only");
  await dialog.getByRole("button", { name: "見直しで変える" }).click();
  await page.getByRole("dialog", { name: "方案を見直しますか？" }).waitFor();
  assert.equal(await page.getByText("まもなく使えます").count(), 0, "R25: no まもなく placeholder is left");
  assert.deepEqual(await writes(page), [], "opening, the premise card and the review entry write nothing");
});

test("segment bar: solid earned, striped skip, red-bean overflow after the scale, grey rest; the event segment is not a link", async (t) => {
  const detail = clone(base.detail);
  const score = detail.score as unknown as { segments: { key: string; earned: number; overflow: number; skipped: boolean }[]; overflow: number; total: number };
  score.segments[0]!.earned = 10; score.segments[0]!.overflow = 5; score.overflow = 5; score.total += 15;
  const page = await screen(t, { handlers: [detailRead(detail)], planId: PLAN, view: "overview" });
  await page.locator("[data-plan-bar]").waitFor();
  const kinds = await page.locator("[data-plan-bar] [data-seg-kind]").evaluateAll((nodes) => nodes.map((node) => `${node.closest("[data-seg]")!.getAttribute("data-seg")}:${node.getAttribute("data-seg-kind")}`));
  assert.ok(kinds.includes("cfo:earned"), kinds.join());
  assert.ok(kinds.includes("lawyer:skipped"));
  assert.ok(kinds.includes("overflow-cfo:overflow"), "overflow drawn after the scale");
  assert.ok(kinds.includes("vc_partner:earned") && kinds.includes("vc_partner:rest"));
  assert.equal(await page.locator('[data-seg="event"]').evaluate((node) => node.tagName), "SPAN", "no event type page");
  assert.equal(await page.locator('[data-seg="cvc"]').evaluate((node) => node.tagName), "A");
  await page.getByText("目標超えの分（半分）").waitFor();
});

test("reduced motion: the score shows its value at once and the bar does not grow; without it the number counts up", async (t) => {
  const reduced = await screen(t, { handlers: [detailRead(base.detail)], planId: PLAN, view: "overview" }, { reducedMotion: true });
  await reduced.locator("[data-plan-score]").waitFor();
  assert.equal(await reduced.locator("[data-plan-score] [aria-hidden]").first().textContent(), String(base.detail.score.total), "no count-up under Reduce Motion");
  assert.equal(await reduced.locator('[data-seg-kind="earned"]').first().evaluate((node) => getComputedStyle(node).animationName), "none");
  assert.equal(await reduced.locator("[data-orbit-2026]").first().getAttribute("data-motion"), "reduce");
  const moving = await screen(t, { handlers: [detailRead(base.detail)], planId: PLAN, view: "overview" });
  await moving.locator("[data-plan-score]").waitFor();
  const first = Number(await moving.locator("[data-plan-score] [aria-hidden]").first().textContent());
  assert.ok(first < base.detail.score.total, `counting up from 0 (saw ${first})`);
  assert.notEqual(await moving.locator('[data-seg-kind="earned"]').first().evaluate((node) => getComputedStyle(node).animationName), "none");
  await moving.waitForFunction((total) => document.querySelector("[data-plan-score] [aria-hidden]")?.textContent === `${total}`, base.detail.score.total);
});

test("step suggestion: a dashed card asks first; まだ dismisses it, 完了にする completes the step — nothing happens on its own", async (t) => {
  const detail = clone(base.detail);
  const done = clone(detail);
  (done.content.steps as unknown as { key: string; completedAt?: string | null }[]).find((step) => step.key === "demo-step-5")!.completedAt = "2026-10-11T00:00:00.000Z";
  done.stepSuggestions = [];
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(detail), ok(detail), ok(done)], url: `/v2/${PLAN}$` },
    { method: "POST", replies: [ok({ id: "x", replayed: false, status: "dismissed" })], url: "/v2/pending/.+/dismiss$" },
    { method: "POST", replies: [ok({ completedAt: "2026-10-11T00:00:00.000Z", replayed: false, score: detail.score })], url: "/steps/demo-step-5/complete$" },
  ], planId: PLAN, view: "overview" });
  const card = page.locator('[data-plan-step-suggestion="demo-step-5"]');
  await card.getByText("「契約をまとめる」は完了しましたか？").waitFor();
  await card.getByText("完了はあなたが決めます").waitFor();
  assert.deepEqual(await writes(page), [], "no automatic completion");
  await card.getByRole("button", { name: "まだ" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((item: { url: string }) => item.url.includes("/dismiss")));
  const dismiss = (await fetches(page)).find((item) => item.url.includes("/dismiss"))!;
  assert.equal(path(dismiss), `/v2/pending/${encodeURIComponent(`step:${PLAN}:demo-step-5`)}/dismiss`);
  assert.match(dismiss.body.idempotencyKey, /^web:plan:/u);
  await page.locator('[data-plan-step-suggestion="demo-step-5"]').getByRole("button", { name: "完了にする" }).click();
  await page.getByText("完了にしました").waitFor();
  assert.deepEqual(await writes(page), [`POST /v2/pending/${encodeURIComponent(`step:${PLAN}:demo-step-5`)}/dismiss`, `POST /v2/${PLAN}/steps/demo-step-5/complete`]);
  await page.locator('[data-plan-step="demo-step-5"][data-done]').waitFor();
});

test("1024: score across, step-grouped type rows on the left; today's chance, recent awards and the event on the right", async (t) => {
  const page = await screen(t, { handlers: [detailRead(base.detail)], planId: PLAN, view: "overview" }, { width: 1024 });
  await page.locator('[data-tier="medium"]').waitFor();
  const recent = page.locator("[data-plan-recent]");
  await recent.getByText("最近の加点").waitFor();
  assert.equal(await recent.locator("li").count(), base.detail.recentAwards!.length);
  await recent.getByText("山本 彩", { exact: false }).waitFor();
  assert.equal(await page.locator("[data-type-row]").count(), base.detail.content.personTypes.length);
  await page.locator("[data-plan-event]").waitFor();
  assert.equal(await page.locator("[data-type-card]").count(), 0, "1024 uses rows, not the 1440 card grid");
  const [left, right] = await Promise.all([page.locator("[data-type-row]").first().boundingBox(), recent.boundingBox()]);
  assert.ok(left && right && left.x < right.x, "rows left, rail right");
});

test("390: steps become a horizontal snap carousel and 見直し is the ↻ icon (opens the review entry)", async (t) => {
  const page = await screen(t, { handlers: [detailRead(base.detail)], planId: PLAN, view: "overview" }, { width: 390 });
  await page.locator('[data-tier="narrow"]').waitFor();
  const carousel = page.locator("[data-plan-carousel]");
  assert.equal(await carousel.evaluate((node) => getComputedStyle(node).scrollSnapType), "x mandatory");
  assert.equal(await carousel.locator("[data-plan-step]").count(), base.detail.content.steps.length);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no page-level horizontal scroll");
  await page.getByRole("button", { name: "方案を見直す" }).first().click();
  await page.getByRole("dialog", { name: "方案を見直しますか？" }).waitFor();
});

test("memo coverage: a proposal card adds only on 加点する; the manual card needs two ticks; the award toast can undo", async (t) => {
  const detail = clone(base.detail);
  detail.pending = [
    { answered: [0, 2], contactId: "demo-person-okada", createdAt: "2026-10-10T00:00:00Z", detail: "岡田 紗希", id: "memo-1", itemId: VC, kind: "memo_coverage", planId: PLAN, points: 10, title: "VC パートナー" },
    { answered: [], contactId: "demo-person-ito", createdAt: "2026-10-10T00:00:00Z", detail: "伊藤 直子", id: "memo-2", itemId: "demo-plan-item-cfo", kind: "memo_coverage", manual: true, planId: PLAN, points: 10, title: "CFO 経験者" },
  ];
  const page = await screen(t, { handlers: [
    detailRead(detail),
    { method: "POST", replies: [ok({ award: award(10, "base", { awardLogId: "log-memo" }), id: "memo-1", replayed: false, status: "accepted" })], url: "/v2/pending/memo-1/accept$" },
    { method: "POST", replies: [ok({ award: award(10, "base", { awardLogId: "log-memo-2" }), id: "memo-2", replayed: false, status: "accepted" })], url: "/v2/pending/memo-2/accept$" },
    { method: "POST", replies: [ok({ replayed: false, score: detail.score })], url: "/awards/log-memo/undo$" },
  ], planId: PLAN, view: "overview" });
  await page.getByText("岡田 紗希さんとの面談で 3 問中 2 問を話せました · +10点にしますか？").waitFor();
  const manual = page.locator('[data-plan-memo="memo-2"]');
  const add = manual.getByRole("button", { name: "加点する" });
  assert.equal(await add.isDisabled(), true);
  await manual.getByRole("checkbox", { name: "問 1" }).click();
  assert.equal(await add.isDisabled(), true, "one tick is not enough");
  await manual.getByRole("checkbox", { name: "問 3" }).click();
  assert.equal(await add.isDisabled(), false);
  assert.deepEqual(await writes(page), [], "ticking writes nothing");
  await page.locator('[data-plan-memo="memo-1"]').getByRole("button", { name: "加点する" }).click();
  const toast = page.getByRole("status").filter({ hasText: "+10点" });
  await toast.waitFor();
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("取り消しました").waitFor();
  await add.click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.filter((item: { method: string }) => item.method === "POST").length === 3);
  const all = (await fetches(page)).filter((item) => item.method === "POST");
  assert.deepEqual(all.map(path), ["/v2/pending/memo-1/accept", `/v2/${PLAN}/awards/log-memo/undo`, "/v2/pending/memo-2/accept"]);
  assert.deepEqual(all[2]!.body.answered, [0, 2], "the manual card sends the ticked questions");
});

/* ---------- 人物タイプ詳細 ---------- */

test("type detail: candidates / not in network / skipped are three different pages", async (t) => {
  const vc = await screen(t, { handlers: [typeRead(base.types[VC]!), detailRead(base.detail)], itemId: VC, planId: PLAN, view: "type" });
  await vc.locator('[data-plan-type][data-state="candidates"]').waitFor();
  await vc.locator("[data-plan-candidates]").getByText("岡田 紗希").waitFor();
  await vc.getByText("あなたの人脈の候補").waitFor();
  await vc.getByText("1人 10点", { exact: false }).first().waitFor();
  await vc.locator("[data-plan-overflow-note]").getByText("4人目からは半分（+5）ずつ、上限なし").waitFor();

  const none = clone(base.types[FOUNDER]!);
  none.persona = "30〜40代。技術系スタートアップでシリーズ A を経験した創業者";
  none.opener = "最初の調達で、リードはどう見つけましたか？";
  none.introRoutes = [{ viaContactId: "demo-person-ito", viaName: "伊藤 直子", why: "起業家コミュニティで創業者と面識がある" }];
  const founder = await screen(t, { handlers: [typeRead(none), detailRead(base.detail)], itemId: FOUNDER, planId: PLAN, view: "type" });
  await founder.locator('[data-plan-type][data-state="none"]').waitFor();
  await founder.locator('[data-plan-banner="none"]').getByText("人脈にまだいません").waitFor();
  await founder.locator("[data-plan-persona]").getByText(none.persona).waitFor();
  await founder.locator("[data-plan-opener]").getByText(none.opener).waitFor();
  await founder.locator('[data-plan-route="demo-person-ito"]').getByText("伊藤 直子さん経由").waitFor();
  assert.equal(await founder.locator("[data-plan-events] [data-plan-event-option]").count(), none.events.length);

  const lawyer = await screen(t, { handlers: [typeRead(base.types[LAWYER]!), detailRead(base.detail)], itemId: LAWYER, planId: PLAN, view: "type" });
  await lawyer.locator('[data-plan-type][data-state="skipped"]').waitFor();
  await lawyer.locator('[data-plan-banner="skipped"]').getByText("習熟済みとして満点を記録しています").waitFor();
  await lawyer.locator('[data-plan-type-bar="skipped"]').waitFor();
  assert.equal(await lawyer.getByRole("button", { name: "オフラインで話した" }).isDisabled(), true);
  assert.deepEqual(await writes(lawyer), [], "opening writes nothing");
});

test("events: the score ring is toned by threshold and 内訳 opens the five items with facts and 推定", async (t) => {
  const type = clone(base.types[VC]!);
  (type.events[0]!.score.scoreBreakdown[1] as { estimated: boolean }).estimated = true;
  const page = await screen(t, { handlers: [typeRead(type), detailRead(base.detail)], itemId: VC, planId: PLAN, view: "type" });
  const row = page.locator(`[data-plan-event-option="${type.events[0]!.eventId}"]`);
  await row.waitFor();
  assert.equal(await row.locator("[data-ring]").getAttribute("data-ring"), "mid", "57 → mid plum");
  assert.equal(await row.locator("[data-plan-breakdown]").count(), 0);
  await row.getByRole("button", { name: "内訳" }).click();
  const items = row.locator("[data-criterion]");
  assert.equal(await items.count(), 5);
  await row.locator('[data-criterion="fit"]').getByText(`${type.events[0]!.score.scoreBreakdown[0]!.score} / 45`).waitFor();
  await row.locator('[data-criterion="confidence"][data-estimated]').getByText("推定").waitFor();
  await row.getByText(type.events[0]!.score.scoreBreakdown[0]!.facts[0]!, { exact: false }).waitFor();
  assert.deepEqual(await writes(page), []);
});

test("record: 「話した人」 adds the server's points with 元に戻す; undo sends one undo; a repeat says already counted", async (t) => {
  const type = base.types[VC]!;
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(type)], url: `/types/${VC}$` },
    detailRead(base.detail),
    { method: "POST", replies: [ok(award(10, "base", { awardLogId: "log-a" }), 201), ok(award(0, "none", { reason: "already_counted" }))], url: `/types/${VC}/awards$` },
    { method: "POST", replies: [ok({ replayed: false, score: base.detail.score })], url: "/awards/log-a/undo$" },
  ], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  const dialog = page.getByRole("dialog", { name: "話したことを記録" });
  // R24 复核 m7: the toolbar opens in 名前で記録; pick 話した人 for a contact.
  await dialog.getByRole("tab", { name: "話した人" }).click();
  await dialog.getByText("プランに反映：VC パートナー +10").waitFor();
  await dialog.getByText("同じ人は同じタイプで 1回だけ数えます。", { exact: false }).waitFor();
  await dialog.getByRole("radio", { name: /岡田 紗希/u }).click();
  await dialog.getByRole("button", { name: "記録する" }).click();
  const toast = page.getByRole("status").filter({ hasText: "+10点" });
  await toast.waitFor();
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("取り消しました").waitFor();
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "話した人" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /岡田 紗希/u }).click();
  await page.getByRole("dialog").getByRole("button", { name: "記録する" }).click();
  await page.getByText("この人は記録済みです（点数は 1 回だけ）").waitFor();
  const posts = (await fetches(page)).filter((item) => item.method === "POST");
  assert.deepEqual(posts.map(path), [`/v2/${PLAN}/types/${VC}/awards`, `/v2/${PLAN}/awards/log-a/undo`, `/v2/${PLAN}/types/${VC}/awards`]);
  assert.deepEqual({ basis: posts[0]!.body.basis, contactId: posts[0]!.body.contactId }, { basis: "talked", contactId: "demo-person-okada" });
  assert.notEqual(posts[0]!.body.idempotencyKey, posts[2]!.body.idempotencyKey, "a new key per click");
});

test("record without a name: past the target the modal says no points, and the server's reason is shown", async (t) => {
  const type = clone(base.types[VC]!);
  type.metCount = type.targetCount;
  type.next = { part: "overflow", points: 5 };
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok({ award: award(0, "none", { reason: "anonymous_over_target" }) })], url: "/talked-offline$" },
  ], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  const dialog = page.getByRole("dialog", { name: "話したことを記録" });
  await dialog.getByRole("tab", { name: "名前なし" }).click();
  await dialog.locator("[data-plan-preview]").getByText("目標人数に達したので、名前なしの記録は加点されません").waitFor();
  await dialog.getByRole("button", { name: "記録する" }).click();
  await page.getByRole("status").getByText("目標人数に達したので、名前なしの記録は加点されません").waitFor();
  const post = (await fetches(page)).find((item) => item.method === "POST")!;
  assert.equal(path(post), `/v2/${PLAN}/types/${VC}/talked-offline`);
  assert.equal(post.body.anonymous, true);
});

test("offline with a name: 「この人ですか？」 first; picking one records that contact, 新しく登録 creates", async (t) => {
  const page = await screen(t, { handlers: [
    typeRead(base.types[FOUNDER]!), detailRead(base.detail),
    { method: "POST", replies: [ok({ matches: [{ company: "Nexa Robotics", contactId: "demo-person-watanabe", name: "渡辺 翔" }] }), ok({ award: award(5, "base", { awardLogId: "log-w" }) })], url: "/talked-offline$" },
  ], itemId: FOUNDER, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  const dialog = page.getByRole("dialog", { name: "話したことを記録" });
  await dialog.getByLabel("相手の名前（任意）").fill("渡辺");
  await dialog.getByRole("button", { name: "記録する" }).click();
  await dialog.getByText("この人ですか？").waitFor();
  await dialog.getByRole("button", { name: "新しく登録" }).waitFor();
  await dialog.getByRole("button", { name: /渡辺 翔/u }).click();
  await page.getByRole("status").filter({ hasText: "+5点" }).waitFor();
  const posts = (await fetches(page)).filter((item) => item.method === "POST").map((item) => ({ ...item.body, idempotencyKey: undefined }));
  assert.deepEqual(posts, [{ idempotencyKey: undefined, name: "渡辺" }, { contactId: "demo-person-watanabe", idempotencyKey: undefined }]);
});

test("skip: the confirmation focuses the primary button; skipping records full points with 元に戻す (DELETE skip)", async (t) => {
  const type = base.types[VC]!;
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok({ replayed: false, score: base.detail.score })], url: `/types/${VC}/skip$` },
    { method: "DELETE", replies: [ok({ replayed: false, score: base.detail.score })], url: `/types/${VC}/skip$` },
  ], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "この分野はもう詳しい" }).click();
  const dialog = page.getByRole("dialog", { name: "この分野をスキップしますか？" });
  await dialog.getByText(`スキップすると満点（${type.allocation - type.earned}点）を記録します。あとで取り消せます。`).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === "スキップする");
  assert.deepEqual(await writes(page), [], "opening the confirmation writes nothing");
  await page.keyboard.press("Enter");
  const toast = page.getByRole("status").filter({ hasText: `${type.allocation - type.earned}点を加算しました` });
  await toast.waitFor();
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("スキップを取り消しました").waitFor();
  assert.deepEqual(await writes(page), [`POST /v2/${PLAN}/types/${VC}/skip`, `DELETE /v2/${PLAN}/types/${VC}/skip`]);
});

test("candidates: ✓ only links (one decision request), multi-select shows the bar and records each person", async (t) => {
  const type = clone(base.types[VC]!);
  type.candidates = [
    { ...type.candidates[0]!, recommendScore: 65 },
    { basis: [], candidateId: "c-2", company: "Kibo Ventures", contactId: "p-2", isOrbitUser: true, lastContactAt: "2026-10-01T00:00:00Z", name: "山口 大樹", opener: "シリーズA のリード条件を 30分だけ聞きたい", reason: "シリーズA のリード実績 4件", recommendScore: 88, role: "パートナー" },
  ];
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok({ candidateId: "c-2", replayed: false, status: "accepted" })], url: "/decision$" },
    { method: "POST", replies: [ok(award(10, "base", { awardLogId: "l1" }), 201), ok(award(10, "base", { awardLogId: "l2" }), 201)], url: `/types/${VC}/awards$` },
  ], itemId: VC, planId: PLAN, view: "type" });
  const rows = page.locator("[data-candidate]");
  await rows.first().waitFor();
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-candidate"))), ["p-2", "demo-person-okada"], "by 推薦度, highest first");
  await page.locator('[data-candidate="p-2"]').getByText("Orbit 利用中").waitFor();
  await page.locator('[data-candidate="p-2"]').getByRole("button", { name: "プランの候補にする" }).click();
  await page.getByText("候補にしました").waitFor();
  assert.deepEqual(await writes(page), [`POST /v2/${PLAN}/types/${VC}/candidates/p-2/decision`]);
  assert.equal((await fetches(page)).find((item) => item.url.endsWith("/decision"))!.body.decision, "accept");
  await page.getByRole("checkbox", { name: "山口 大樹さんを選ぶ" }).click();
  await page.getByRole("checkbox", { name: "岡田 紗希さんを選ぶ" }).click();
  const bar = page.locator("[data-plan-select-bar]");
  await bar.getByText("2人を選択中").waitFor();
  await bar.getByRole("button", { name: "2人を記録" }).click();
  await page.getByRole("status").filter({ hasText: "2人 · +20点" }).waitFor();
  const awards = (await fetches(page)).filter((item) => item.url.endsWith("/awards"));
  assert.deepEqual(awards.map((item) => item.body.contactId), ["p-2", "demo-person-okada"]);
});

test("紹介ルート: the request is a draft with コピー and メールアプリで開く — no send", async (t) => {
  const type = clone(base.types[FOUNDER]!);
  type.introRoutes = [{ viaContactId: "demo-person-ito", viaName: "伊藤 直子", why: "起業家コミュニティで創業者と面識がある" }];
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok({ body: "伊藤さん、いつもありがとうございます。", subject: "ご紹介のお願い", viaName: "伊藤 直子" })], url: "/intro-drafts$" },
  ], itemId: FOUNDER, planId: PLAN, view: "type" });
  await page.locator('[data-plan-route="demo-person-ito"]').getByRole("button", { name: "依頼文をつくる" }).click();
  const drawer = page.getByRole("dialog", { name: "紹介の依頼文" });
  await drawer.getByText("ご紹介のお願い").waitFor();
  await drawer.getByText("送信はしません · 送信はあなたが行います").waitFor();
  assert.match((await drawer.locator("[data-plan-mailto]").getAttribute("href"))!, /^mailto:\?subject=/u);
  await drawer.getByRole("button", { name: "コピー" }).click();
  await page.getByText("コピーしました").waitFor();
  assert.equal(await page.evaluate(() => (window as any).copied), "ご紹介のお願い\n\n伊藤さん、いつもありがとうございます。");
  assert.equal(await page.getByRole("button", { name: /送信|Send/u }).count(), 0, "no send button");
  const post = (await fetches(page)).find((item) => item.method === "POST")!;
  assert.equal(post.body.viaContactId, "demo-person-ito");
});

test("面談を提案: three slots go to the server, and only a draft comes back (コピー / メールアプリ, no send)", async (t) => {
  const type = base.types[VC]!;
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok({ draft: { body: "岡田さん、面談のお願いです。", subject: "面談のお願い" }, kind: "draft", requestId: null })], url: "/proposals$" },
  ], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("checkbox", { name: "岡田 紗希さんを選ぶ" }).click();
  await page.locator("[data-plan-select-bar]").getByRole("button", { name: "面談を提案" }).click();
  const drawer = page.getByRole("dialog", { name: "面談を提案" });
  assert.equal(await drawer.locator('input[type="date"]').count(), 3);
  await drawer.getByLabel("候補 2 時間").fill("15:30");
  assert.deepEqual(await writes(page), [], "choosing slots writes nothing");
  await drawer.getByRole("button", { name: "下書きをつくる" }).click();
  await drawer.locator("[data-plan-draft]").getByText("面談のお願い", { exact: true }).waitFor();
  await drawer.getByText("送信はしません · 送信はあなたが行います").waitFor();
  assert.equal(await page.getByRole("button", { name: /送信|Send/u }).count(), 0);
  const post = (await fetches(page)).find((item) => item.method === "POST")!;
  assert.equal(post.body.contactId, "demo-person-okada");
  assert.equal(post.body.slots.length, 3);
  for (const slot of post.body.slots) assert.ok(!Number.isNaN(Date.parse(slot)), slot);
  assert.equal(new Date(post.body.slots[1]).getMinutes(), 30);
});

test("Chinese UI: the type page speaks Chinese and sends x-orbit-lang: zh", async (t) => {
  const page = await screen(t, { handlers: [typeRead(base.types[VC]!), detailRead(base.detail)], itemId: VC, lang: "zh", planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "线下聊过" }).waitFor();
  await page.getByText("要问的").waitFor();
  assert.ok((await fetches(page)).every((item) => item.lang === "zh"));
});

/* ---------- mock end to end ---------- */

test("mock end to end: plan → type → record → undo → skip → unskip → the overview score is back where it was", async (t) => {
  resetPlansV2MockRepositoryForTests();
  t.after(() => resetPlansV2MockRepositoryForTests());
  const before = (await call(mock().summary, "/api/agent/plans/v2/summary")).data.current.score.total as number;

  const page = await screen(t, { bridge: true, handlers: [], itemId: VC, planId: PLAN, view: "type" }, {}, bridge);
  const earned = page.locator("[data-plan-type-earned]");
  await earned.waitFor();
  const start = Number(await earned.getAttribute("data-plan-type-earned"));
  // record 岡田 紗希 (a candidate) → +10
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "話した人" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /岡田 紗希/u }).click();
  await page.getByRole("dialog").getByRole("button", { name: "記録する" }).click();
  const toast = page.getByRole("status").filter({ hasText: "+10点" });
  await toast.waitFor();
  await page.waitForFunction((value) => document.querySelector("[data-plan-type-earned]")?.getAttribute("data-plan-type-earned") === String(value), start + 10);
  assert.equal((await call(mock().summary, "/x")).data.current.score.total, before + 10, "the summary moved with the record");
  // undo from the toast
  await toast.getByRole("button", { name: "元に戻す" }).click();
  await page.waitForFunction((value) => document.querySelector("[data-plan-type-earned]")?.getAttribute("data-plan-type-earned") === String(value), start);
  // skip (full points) → unskip
  await page.getByRole("button", { name: "この分野はもう詳しい" }).click();
  await page.getByRole("dialog", { name: "この分野をスキップしますか？" }).getByRole("button", { name: "スキップする" }).click();
  await page.locator('[data-plan-type][data-state="skipped"]').waitFor();
  assert.equal((await call(mock().summary, "/x")).data.current.score.total, before - start + 30, "skip records the full allocation");
  await page.locator('[data-plan-banner="skipped"]').getByRole("button", { name: "スキップを取り消す" }).click();
  // Recording linked 岡田 to the type (undo keeps the link, DESIGN §2.7), so the page may now read 「人脈にいない」.
  await page.locator('[data-plan-type]:not([data-state="skipped"])').waitFor();

  const overview = await screen(t, { bridge: true, handlers: [], planId: PLAN, view: "overview" }, {}, bridge);
  await overview.locator("[data-plan-score]").waitFor();
  assert.equal(await overview.locator("[data-plan-score]").getAttribute("data-plan-score"), String(before), "record + undo + skip + unskip leaves the score where it was");
  assert.equal((await call(mock().summary, "/x")).data.current.score.total, before);
  assert.deepEqual((await writes(page)).map((item) => item.replace(/awards\/[^/]+\/undo/u, "awards/:id/undo")), [
    `POST /v2/${PLAN}/types/${VC}/awards`, `POST /v2/${PLAN}/awards/:id/undo`, `POST /v2/${PLAN}/types/${VC}/skip`, `DELETE /v2/${PLAN}/types/${VC}/skip`,
  ]);
});

/* ---------- R24 独立复核（REVIEW.md）Web 修复 ---------- */

const fail = (status: number, reason: string): Reply => ({ body: { error: { code: status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", context: { reason }, message: reason }, success: false }, status });

test("M6: a failed undo never says 「取り消しました」; withdraw buttons are off while a write runs", async (t) => {
  const type = clone(base.types[VC]!);
  assert.ok(type.talked.length, "the demo VC type has a talked person");
  const page = await screen(t, { handlers: [typeRead(type), detailRead(base.detail), { method: "POST", replies: [fail(503, "DOWN")], url: "/undo$" }], itemId: VC, planId: PLAN, view: "type" });
  await page.locator("[data-plan-talked] button").first().click();
  const row = page.locator("[data-plan-talked-row]").first();
  await row.getByRole("button", { name: "取り消す" }).click();
  await page.getByText("保存できませんでした").waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("取り消しました").count(), 0, "no success toast when the undo failed");
});

test("m4: today's chance with 0 points draws no 「+0」 chip", async (t) => {
  const detail = clone(base.detail);
  detail.todayChance = { href: detail.todayChance!.href, label: "製造業DXカンファレンス 大阪", points: 0 };
  const page = await screen(t, { handlers: [detailRead(detail)], planId: PLAN, view: "overview" });
  const chance = page.locator("[data-plan-chance]");
  await chance.getByText("製造業DXカンファレンス 大阪").waitFor();
  assert.equal(await chance.getByText("+0").count(), 0);
});

test("m7: each candidate row has 「すでに話した」 (one talked award); the toolbar opens 名前で記録", async (t) => {
  const type = base.types[VC]!;
  const page = await screen(t, { handlers: [typeRead(type), detailRead(base.detail), { method: "POST", replies: [ok(award(10, "base", { awardLogId: "log-row" }), 201)], url: `/types/${VC}/awards$` }], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  await page.locator('[data-plan-record="offline"]').waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "キャンセル" }).click();
  const first = type.candidates[0]!;
  await page.locator(`[data-plan-already-talked="${first.contactId}"]`).dblclick();
  await page.getByRole("status").filter({ hasText: "+10点" }).waitFor();
  const posts = await writes(page);
  assert.deepEqual(posts, [`POST /v2/${PLAN}/types/${VC}/awards`], "one click → one award");
  const body = (await fetches(page)).find((item) => item.method === "POST")!.body;
  assert.deepEqual({ basis: body.basis, contactId: body.contactId }, { basis: "talked", contactId: first.contactId });
});

function stepsDetail(): PlanV2Detail {
  const detail = clone(base.detail);
  const [first, second] = detail.content.steps;
  const shared = first!.personTypeKeys[0]!;
  detail.content.steps = [
    { ...first!, completedAt: "2026-10-05T00:00:00.000Z" },
    { ...second!, personTypeKeys: [...second!.personTypeKeys, shared] },
    ...detail.content.steps.slice(2),
    { doneCriteria: "資料を整える", key: "step-empty", personTypeKeys: [], title: "社内の準備", why: null },
  ];
  return detail;
}

test("m8 1024: every step shows (also one with no type), a type can sit under two steps; ✓ opens 完了を取り消す first", async (t) => {
  const detail = stepsDetail();
  const firstKey = detail.content.steps[0]!.key;
  const shared = detail.content.steps[0]!.personTypeKeys[0]!;
  const page = await screen(t, { handlers: [detailRead(detail), { method: "DELETE", replies: [ok({ completedAt: null, replayed: false, score: detail.score })], url: "/complete$" }], planId: PLAN, view: "overview" }, { width: 1024 });
  await page.locator('[data-tier="medium"]').waitFor();
  await page.locator('[data-plan-step="step-empty"]').getByText("社内の準備").waitFor();
  assert.equal(await page.locator(`[data-type-row="${shared}"]`).count(), 2, "the shared type shows under both steps");
  await page.locator(`[data-step-done-mark="${firstKey}"]`).click();
  assert.deepEqual(await writes(page), [], "the ✓ only opens the choice");
  await page.locator(`[data-step-reopen="${firstKey}"]`).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((item: { method: string }) => item.method === "DELETE"));
  assert.deepEqual(await writes(page), [`DELETE /v2/${PLAN}/steps/${firstKey}/complete`]);
});

test("m8 390: a done step can be reopened the same way (✓ → 完了を取り消す)", async (t) => {
  const detail = stepsDetail();
  const firstKey = detail.content.steps[0]!.key;
  const page = await screen(t, { handlers: [detailRead(detail), { method: "DELETE", replies: [ok({ completedAt: null, replayed: false, score: detail.score })], url: "/complete$" }], planId: PLAN, view: "overview" }, { width: 390 });
  await page.locator('[data-tier="narrow"]').waitFor();
  await page.locator(`[data-plan-carousel] [data-step-done-mark="${firstKey}"]`).click();
  assert.deepEqual(await writes(page), []);
  await page.locator(`[data-plan-carousel] [data-step-reopen="${firstKey}"]`).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.some((item: { method: string }) => item.method === "DELETE"));
});

test("m9: the memo card shows the server's points only; no contact → no 「さんとの」; PENDING_DECIDED re-reads quietly", async (t) => {
  const detail = clone(base.detail);
  detail.pending = [
    { answered: [0, 1], contactId: "demo-person-okada", createdAt: "2026-10-10T00:00:00Z", detail: "岡田 紗希", id: "memo-a", itemId: VC, kind: "memo_coverage", planId: PLAN, title: "VC パートナー" },
    { answered: [0, 1], contactId: null, createdAt: "2026-10-10T00:00:00Z", detail: null, id: "memo-b", itemId: VC, kind: "memo_coverage", planId: PLAN, points: 7, title: "VC パートナー" },
  ];
  const page = await screen(t, { handlers: [detailRead(detail), { method: "POST", replies: [fail(409, "PENDING_DECIDED")], url: "/v2/pending/memo-a/accept$" }], planId: PLAN, view: "overview" });
  await page.locator('[data-plan-memo="memo-a"]').getByText("岡田 紗希さんとの面談で 3 問中 2 問を話せました · 加点しますか？").waitFor();
  await page.locator('[data-plan-memo="memo-b"]').getByText("面談で 3 問中 2 問を話せました · +7点にしますか？").waitFor();
  assert.equal(await page.getByText("さんとの面談で", { exact: false }).count(), 1, "only the card with a contact names someone");
  const reads = async () => (await fetches(page)).filter((item) => item.method === "GET" && path(item) === `/v2/${PLAN}`).length;
  const before = await reads();
  await page.locator('[data-plan-memo="memo-a"]').getByRole("button", { name: "加点する" }).click();
  await page.waitForFunction((n) => (window as any).shellFixture.fetches.filter((item: { method: string; url: string }) => item.method === "GET" && item.url.endsWith("/v2/demo-plan-series-a")).length > n, before);
  assert.equal(await page.getByText("保存できませんでした").count(), 0, "decided elsewhere is not a failure");
});

test("m10: with reduced motion the +N only fades in and out (no float)", async (t) => {
  const type = base.types[VC]!;
  const page = await screen(t, { handlers: [typeRead(type), detailRead(base.detail), { method: "POST", replies: [ok(award(10, "base", { awardLogId: "log-r" }), 201)], url: `/types/${VC}/awards$` }], itemId: VC, planId: PLAN, view: "type" }, { reducedMotion: true });
  await page.locator(`[data-plan-already-talked="${type.candidates[0]!.contactId}"]`).click();
  const plus = page.locator('[data-plan-type-head] [aria-hidden]').filter({ hasText: "+10" });
  await plus.waitFor();
  assert.match(await plus.evaluate((node) => getComputedStyle(node).animationName), /fadeInOut/u);
  await page.waitForFunction(() => { const node = [...document.querySelectorAll("[data-plan-type-head] [aria-hidden]")].find((item) => item.textContent === "+10"); return node && getComputedStyle(node).opacity === "0"; }, null, { timeout: 4000 });
});

test("m11: after 「この人ですか？」 another mode still has 記録する; CONTACT_CREATE_FAILED offers 名前なしで記録 (new key)", async (t) => {
  const page = await screen(t, { handlers: [
    typeRead(base.types[FOUNDER]!), detailRead(base.detail),
    { method: "POST", replies: [ok({ matches: [{ company: "Nexa Robotics", contactId: "demo-person-watanabe", name: "渡辺 翔" }] }), fail(503, "CONTACT_CREATE_FAILED"), ok({ award: award(5, "base", { awardLogId: "log-anon" }) })], url: "/talked-offline$" },
  ], itemId: FOUNDER, planId: PLAN, view: "type" });
  await page.getByRole("button", { name: "オフラインで話した" }).click();
  const dialog = page.getByRole("dialog", { name: "話したことを記録" });
  await dialog.getByLabel("相手の名前（任意）").fill("渡辺");
  await dialog.getByRole("button", { name: "記録する" }).click();
  await dialog.getByText("この人ですか？").waitFor();
  await dialog.getByRole("tab", { name: "名前なし" }).click();
  await dialog.getByRole("button", { name: "記録する" }).waitFor();
  await dialog.getByRole("tab", { name: "名前で記録" }).click();
  await dialog.getByRole("button", { name: "新しく登録" }).click();
  const failed = dialog.locator("[data-plan-create-failed]");
  await failed.getByText("登録できませんでした · 名前なしで記録しますか？").waitFor();
  assert.equal(await page.getByText("保存できませんでした").count(), 0);
  await failed.getByRole("button", { name: "名前なしで記録" }).click();
  await page.getByRole("status").filter({ hasText: "+5点" }).waitFor();
  const posts = (await fetches(page)).filter((item) => item.method === "POST");
  assert.deepEqual(posts.map((item) => ({ ...item.body, idempotencyKey: undefined })), [{ idempotencyKey: undefined, name: "渡辺" }, { createContact: true, idempotencyKey: undefined, name: "渡辺" }, { anonymous: true, idempotencyKey: undefined }]);
  assert.notEqual(posts[1]!.body.idempotencyKey, posts[2]!.body.idempotencyKey);
});

test("m11: a multi-record toast marks the half part; a proposal answered as a request says so; the button reads 達成にする", async (t) => {
  const type = clone(base.types[VC]!);
  type.candidates = [type.candidates[0]!, { ...type.candidates[0]!, candidateId: "c-2", contactId: "p-2", isOrbitUser: true, name: "山口 大樹" }];
  const page = await screen(t, { handlers: [
    typeRead(type), detailRead(base.detail),
    { method: "POST", replies: [ok(award(10, "base", { awardLogId: "l1" }), 201), ok(award(5, "overflow", { awardLogId: "l2" }), 201)], url: `/types/${VC}/awards$` },
    { method: "POST", replies: [ok({ draft: null, kind: "request", requestId: "req-1" })], url: "/proposals$" },
  ], itemId: VC, planId: PLAN, view: "type" });
  await page.getByRole("checkbox", { name: "山口 大樹さんを選ぶ" }).click();
  await page.locator("[data-plan-select-bar]").getByRole("button", { name: "面談を提案" }).click();
  const drawer = page.getByRole("dialog", { name: "面談を提案" });
  await drawer.getByRole("button", { name: "下書きをつくる" }).click();
  await drawer.locator('[data-plan-proposal-requested="p-2"]').getByText("Orbit 上で面談を依頼しました").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "岡田 紗希さんを選ぶ" }).click();
  await page.locator("[data-plan-select-bar]").getByRole("button", { name: "2人を記録" }).click();
  await page.getByRole("status").filter({ hasText: "2人 · +15点（一部は半分）" }).waitFor();

  const overview = await screen(t, { handlers: [detailRead(base.detail)], planId: PLAN, view: "overview" });
  await overview.getByRole("button", { name: "達成にする" }).waitFor();
  assert.equal(await overview.getByText("目標を達成した").count(), 0);
});
