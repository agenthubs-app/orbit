import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import type { PlanAchievementView, PlanGoalListItem, PlanLegacyDetail, PlanNextGoalsResponse, PlanQuotaResponse, PlanReviewView, PlanV2Detail } from "../../shared/contract/plan-v2";
import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R25 (UI-SPEC 画面): 見直し (entry, page, used up, STALE, AI failure, ✓ / ✕), 達成 →
// 完了 → 次の目標, the goal switcher / edit, `new=1` and 以前のプラン, rendered for real.
// fetch is stubbed in the page and every call recorded, so each test asserts exactly
// which requests a click makes. Base fixtures come from the mock v2 handlers.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type View = "overview" | "review" | "done" | "legacy-card" | "legacy" | "goal" | "edit";
type Fixture = { view: View; planId?: string; draftId?: string | null; backHref?: string; legacy?: unknown; lang?: string; handlers: Handler[]; bridge?: boolean; flash?: string };
type Call = { url: string; method: string; body?: any };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, reason: string, extra: Record<string, string> = {}): Reply => ({ body: { error: { code: status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", context: { reason, ...extra }, message: reason }, success: false }, status });
const PLAN = "demo-plan-series-a";
const PAID = /ご利用プラン|料金|Pro に|アップグレード|有料/u;

let browser: Browser;
let code: { js: string; css: string };
let base: { detail: PlanV2Detail; goals: PlanGoalListItem[]; quota: PlanQuotaResponse; review0: PlanReviewView; review1: PlanReviewView; review1Off: PlanReviewView };

type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const mocks = () => ({ flow: createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" }), v2: createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" }) });

async function call(handler: RouteHandler, params: Record<string, string> = {}, body?: unknown, method = body ? "POST" : "GET") {
  const response = await handler(new Request("http://localhost/api/agent/plans", { body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json", "x-orbit-lang": "ja" }, method }), { params: Promise.resolve(params) });
  return (await response.json()).data;
}

test.before(async () => {
  resetPlansV2MockRepositoryForTests();
  const { flow, v2 } = mocks();
  const detail = await call(v2.detail, { planId: PLAN }) as PlanV2Detail;
  const goals = (await call(v2.list)).goals as PlanGoalListItem[];
  const quota = await call(flow.quota) as PlanQuotaResponse;
  const review0 = await call(flow.startReview, { planId: PLAN }, { idempotencyKey: "fx-start" }) as PlanReviewView;
  const review1 = await call(flow.reviewFix, { draftId: review0.draft.draftId }, { idempotencyKey: "fx-fix", premise: [{ key: "F2", value: "ARR 1億円の見込み" }], text: "CVC にも並行で当たりたい" }) as PlanReviewView;
  const change = review1.draft.turns[0]!.changes[0]!;
  const review1Off = await call(flow.toggleChange, { changeId: change.id!, draftId: review0.draft.draftId }, { accepted: false, idempotencyKey: "fx-toggle" }) as PlanReviewView;
  base = { detail, goals, quota, review0, review1, review1Off };
  resetPlansV2MockRepositoryForTests();
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PlanOverview } from "./app/(app)/app/orbit-2026/plan/PlanOverview";
    import { PlanReviewScreen } from "./app/(app)/app/orbit-2026/plan/PlanReviewScreen";
    import { PlanDoneScreen } from "./app/(app)/app/orbit-2026/plan/PlanDoneScreen";
    import { PlanLegacyCard, PlanLegacyScreen } from "./app/(app)/app/orbit-2026/plan/PlanLegacy";
    import { PlanGoalEntry } from "./app/(app)/app/orbit-2026/plan/PlanGoalEntry";
    import { PlanManualEditScreen } from "./app/(app)/app/orbit-2026/plan/PlanManualEditScreen";
    const f = window.shellFixture;
    // The page is about:blank (no storage): a memory session store carries the flash.
    const store = new Map(f.flash ? [["orbit:plan-flash", f.flash]] : []);
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } });
    window.flashStore = store;
    const counts = {};
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : undefined;
      f.fetches.push({ url: String(url), method, body });
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
    const view = {
      overview: () => <PlanOverview planId={f.planId} />,
      review: () => <PlanReviewScreen planId={f.planId} draftId={f.draftId ?? null} />,
      done: () => <PlanDoneScreen planId={f.planId} />,
      "legacy-card": () => <PlanLegacyCard plan={f.legacy} />,
      legacy: () => <PlanLegacyScreen planId={f.planId} />,
      goal: () => <PlanGoalEntry backHref={f.backHref} />,
      edit: () => <PlanManualEditScreen draftId={f.draftId} />,
    }[f.view];
    createRoot(document.getElementById("root")).render(view());
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); resetPlansV2MockRepositoryForTests(); });

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture, options: { width?: number; dark?: boolean } = {}, setup?: (page: Page) => Promise<void>): Promise<Page> {
  const page = await open(browser, code, { ...options, html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], fetches: [], lang: "ja", path: "/app/tasks", planId: PLAN, ...fixture })}</script>` });
  if (setup) await setup(page);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  return page;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const pushes = async (page: Page): Promise<string[]> => ((await page.evaluate(() => (window as any).shellFixture.calls)) as { push?: string; replace?: string }[]).map((entry) => entry.push ?? entry.replace ?? "").filter(Boolean);
const path = (item: Call) => item.url.replace(/^\/api\/agent\/plans/u, "");
const writes = async (page: Page) => (await fetches(page)).filter((item) => item.method !== "GET");
const waitPush = (page: Page, n = 1) => page.waitForFunction((count) => (window as any).shellFixture.calls.length >= count, n);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const detailRead = (detail: PlanV2Detail = base.detail): Handler => ({ method: "GET", replies: [ok(detail)], url: `/v2/${PLAN}$` });
const goalsRead = (goals: PlanGoalListItem[] = base.goals): Handler => ({ method: "GET", replies: [ok({ goals })], url: "/plans/v2$" });
const quotaRead = (quota: Partial<PlanQuotaResponse> = {}): Handler => ({ method: "GET", replies: [ok({ ...base.quota, ...quota })], url: "/v2/quota$" });
const reviewRead = (view: PlanReviewView): Handler => ({ method: "GET", replies: [ok(view)], url: "/review$" });
const withLeft = (view: PlanReviewView, left: number): PlanReviewView => ({ ...clone(view), reviewLeftThisMonth: left });

/* ---------- 見直し入口（A4 ① ②） ---------- */

test("review entry: 3 cells, reset date and the data read; opening only reads; 「iOrbit で見直す」 starts once and opens the page", async (t) => {
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), quotaRead({ reviewLeftThisMonth: 2 }), { method: "GET", replies: [fail(404, "DRAFT_NOT_FOUND")], url: "/reviews/current$" },
    { method: "POST", replies: [ok(base.review0, 201)], url: "/reviews$" }], view: "overview" });
  await page.getByRole("button", { name: "方案を見直す", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "方案を見直しますか？" });
  await dialog.locator("[data-plan-review-entry]").waitFor();
  assert.deepEqual(await dialog.locator("[data-plan-quota-bar] [data-cell]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-cell"))), ["used", "left", "left"]);
  await dialog.getByText("今月あと 2 回").waitFor();
  await dialog.getByText("11月1日に戻ります").waitFor();
  await dialog.locator("[data-plan-review-data]").getByText("イベント", { exact: false }).first().waitFor();
  assert.deepEqual(await writes(page), [], "opening the entry writes nothing");
  await dialog.getByRole("button", { name: "iOrbit で見直す" }).dblclick();
  await waitPush(page);
  const sent = await writes(page);
  assert.deepEqual(sent.map((item) => `${item.method} ${path(item)}`), [`POST /v2/${PLAN}/reviews`]);
  assert.ok(sent[0]!.body.idempotencyKey);
  assert.deepEqual(await pushes(page), [`/app/plans/${PLAN}/review?draft=${encodeURIComponent(base.review0.draft.draftId)}`]);
});

test("review entry, used up (A4 ②): what still works, the reset date, 「わかりました」 — and no paid plan anywhere", async (t) => {
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), quotaRead({ reviewLeftThisMonth: 0 })], view: "overview" });
  await page.getByRole("button", { name: "方案を見直す", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "今月の見直しは使い切りました" });
  await dialog.locator("[data-plan-review-used-up]").waitFor();
  await dialog.getByText("3 / 3 回 · 11月1日に戻ります", { exact: false }).waitFor();
  await dialog.getByText("面談の記録・加点・スキップ、iOrbit への質問は、これまでどおり使えます。").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "iOrbit で見直す" }).count(), 0);
  assert.doesNotMatch(await dialog.innerText(), PAID);
  await dialog.getByRole("button", { name: "わかりました" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(await writes(page), []);
});

/* ---------- 見直し画面（A3） ---------- */

test("review page: marked rows (rose + evidence), in-place edit with strikethrough, a suggestion fills; send carries only the changed rows + text", async (t) => {
  const review = clone(base.review0);
  review.premiseMarks = [{ evidenceIds: ["e1", "e2"], key: "F2", reason: "面談メモ 10/5「ARR 1億円の見込み」", suggested: "ARR 1億円の見込み（年内）" }, { evidenceIds: ["e3"], key: "F3", reason: null, suggested: null }];
  const page = await screen(t, { draftId: review.draft.draftId, handlers: [reviewRead(review), detailRead(), { method: "POST", replies: [ok(base.review1)], url: "/review/fix$" }], view: "review" });
  await page.locator("[data-plan-review-premise]").waitFor();
  assert.equal(await page.locator("[data-premise][data-marked]").count(), 2);
  const background = await page.locator('[data-premise="F2"]').evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(background, "rgba(0, 0, 0, 0)", "a marked row has the rose fill");
  await page.locator('[data-premise-mark="F2"]').getByText("根拠：面談メモ 10/5「ARR 1億円の見込み」").waitFor();
  await page.locator('[data-premise-mark="F3"]').getByText("根拠：記録 1件").waitFor();
  await page.locator('[data-plan-review-send-note]').getByText("前提を直すか、変わったことを書いてください").waitFor();
  // Suggested value → the row shows old (struck) and new.
  await page.locator('[data-premise-suggest="F2"]').click();
  await page.locator('[data-premise="F2"][data-edited]').waitFor();
  assert.equal(await page.locator('[data-premise="F2"] [class*="before"]').textContent(), "ARR 8,000万円 · 前年比 2.4倍");
  // In-place edit of another row.
  await page.getByRole("button", { name: "使える時間を直す" }).click();
  const input = page.locator('[data-premise-input="F7"]');
  await input.fill("週 15時間 · 本業と並行");
  await input.press("Enter");
  await page.locator('[data-premise="F7"][data-edited]').waitFor();
  await page.getByText("2行を直しました").waitFor();
  await page.locator("[data-plan-review-text]").fill("CVC にも並行で当たりたい");
  await page.locator("[data-plan-review-send-note]").getByText("今月あと 3 → 2 回 · 変更がなくても 1回").waitFor();
  assert.deepEqual(await writes(page), [], "editing is local");
  await page.locator("[data-plan-review-send]").dblclick();
  await page.locator('[data-turn="1"]').waitFor();
  const sent = await writes(page);
  assert.equal(sent.length, 1, "a double click sends once");
  assert.deepEqual(sent[0]!.body.premise, [{ key: "F2", value: "ARR 1億円の見込み（年内）" }, { key: "F7", value: "週 15時間 · 本業と並行" }]);
  assert.equal(sent[0]!.body.text, "CVC にも並行で当たりたい");
  await page.locator("[data-plan-review-quota]").getByText("2", { exact: true }).waitFor();
  await page.locator("[data-stage='1']").waitFor();
});

test("review turn: changes struck / new, 変わらない点 and 獲得済み; ✕ sends exactly one toggle and shows the server's plan; ✓ again sends one more", async (t) => {
  const page = await screen(t, { draftId: base.review1.draft.draftId, handlers: [reviewRead(base.review1), detailRead(),
    { method: "POST", replies: [ok(base.review1Off), ok(base.review1)], url: "/toggle$" }], view: "review" });
  const change = base.review1.draft.turns[0]!.changes[0]!;
  const row = page.locator(`[data-change="${change.id}"]`);
  await row.waitFor();
  assert.equal(await row.locator('[class*="before"]').textContent(), change.before);
  await page.locator("[data-turn-unchanged]").getByText("変わらない点：", { exact: false }).waitFor();
  await page.locator("[data-turn-earned]").getByText(`獲得済み ${base.detail.score.total} → ${base.detail.score.total}`).waitFor();
  await row.getByRole("button", { name: "この変更を採用", exact: true }).click();
  assert.deepEqual(await writes(page), [], "✓ on an accepted change sends nothing");
  await row.getByRole("button", { name: "この変更を採用しない" }).dblclick();
  await page.locator(`[data-change="${change.id}"][data-accepted="false"]`).waitFor();
  let sent = await writes(page);
  assert.equal(sent.length, 1, "one ✕ → one request");
  assert.equal(sent[0]!.url, `/api/agent/plans/drafts/${encodeURIComponent(base.review1.draft.draftId)}/changes/${change.id}/toggle`);
  assert.equal(sent[0]!.body.accepted, false);
  await row.getByText("採用しない").waitFor();
  await row.getByRole("button", { name: "この変更を採用", exact: true }).click();
  await page.locator(`[data-change="${change.id}"][data-accepted="true"]`).waitFor();
  sent = await writes(page);
  assert.equal(sent.length, 2);
  assert.equal(sent[1]!.body.accepted, true);
  assert.notEqual(sent[0]!.body.idempotencyKey, sent[1]!.body.idempotencyKey);
  // After a turn: もう一度直す / 手動で編集 / この内容で確定.
  await page.getByRole("button", { name: "もう一度直す（あと 2 回）" }).waitFor();
  await page.locator("[data-plan-review-confirm]").waitFor();
});

test("no change this time (A3 ④): 「今回は変更しません」 with the reason; 「このままにする」 goes back without writing", async (t) => {
  const review = withLeft(base.review1, 0);
  review.draft.turns = [{ ...review.draft.turns[0]!, changes: [], noChangeReason: "リードが決まっても、ほかの VC とも並行で話すのが一般的です。" }];
  // m1: the draft's premise equals the plan's, so nothing changes at all.
  const plan = clone(base.detail);
  plan.premise = review.draft.premise;
  const page = await screen(t, { draftId: review.draft.draftId, handlers: [reviewRead(review), detailRead(plan)], view: "review" });
  await page.locator("[data-turn-no-change]").getByText("今回は変更しません").waitFor();
  await page.getByText("リードが決まっても、", { exact: false }).waitFor();
  await page.getByText("変更なしでも 1回").waitFor();
  await page.locator("[data-plan-review-composer='off']").waitFor();
  assert.equal(await page.locator("[data-plan-review-again]").count(), 0, "no もう一度直す at 0");
  await page.locator("[data-plan-review-keep]").click();
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&plan=demo-plan-series-a"]);
  assert.deepEqual(await writes(page), []);
});

test("review used up (A4 ②): the input is grey, says what still works, 「わかりました」; no paid plan", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(withLeft(base.review0, 0)), detailRead()], view: "review" });
  const off = page.locator("[data-plan-review-composer='off']");
  await off.getByText("今月の見直しは使い切りました").waitFor();
  await off.getByText("面談の記録・加点・スキップ、iOrbit への質問は、これまでどおり使えます。").waitFor();
  assert.equal(await page.locator("[data-plan-review-send]").count(), 0);
  assert.doesNotMatch(await page.locator("[data-plan-review]").innerText(), PAID);
  await off.getByRole("button", { name: "わかりました" }).click();
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&plan=demo-plan-series-a"]);
});

test("REVIEW_LIMIT on send turns the page to the used-up state", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(base.review0), detailRead(), { method: "POST", replies: [fail(409, "REVIEW_LIMIT", { limit: "monthly", retryOn: "2026-10-31T15:00:00.000Z" })], url: "/review/fix$" }], view: "review" });
  await page.locator("[data-plan-review-text]").fill("変わりました");
  await page.locator("[data-plan-review-send]").click();
  await page.locator("[data-plan-review-composer='off']").waitFor();
});

test("STALE: 「最新を読み込む」 reopens the review on the current plan (opening uses nothing)", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(base.review0), detailRead(),
    { method: "POST", replies: [fail(409, "STALE")], url: "/review/fix$" }, { method: "POST", replies: [ok(base.review0, 201)], url: "/reviews$" }], view: "review" });
  await page.locator("[data-plan-review-text]").fill("変わりました");
  await page.locator("[data-plan-review-send]").click();
  const stale = page.locator("[data-plan-review-stale]");
  await stale.getByText("別の端末で方案が変わりました").waitFor();
  await stale.getByRole("button", { name: "最新を読み込む" }).click();
  await stale.waitFor({ state: "detached" });
  assert.deepEqual((await writes(page)).map((item) => `${item.method} ${path(item)}`), [`POST /drafts/${encodeURIComponent(base.review0.draft.draftId)}/review/fix`, `POST /v2/${PLAN}/reviews`]);
});

test("AI failure: the failure card says nothing was used and 「もう一度」 sends again with a new key", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(base.review0), detailRead(),
    { method: "POST", replies: [fail(503, "AI_FAILED"), ok(base.review1)], url: "/review/fix$" }], view: "review" });
  await page.locator("[data-plan-review-text]").fill("CVC も");
  await page.locator("[data-plan-review-send]").click();
  await page.locator("[data-plan-failure='fix']").waitFor();
  await page.locator("[data-plan-review-free]").getByText("今月の回数は使っていません。もう一度お試しください。").waitFor();
  await page.locator("[data-plan-failure='fix']").getByRole("button", { name: "もう一度" }).click();
  await page.locator('[data-turn="1"]').waitFor();
  const sent = await writes(page);
  assert.equal(sent.length, 2);
  assert.equal(sent[1]!.body.text, "CVC も", "the same input is sent again");
  assert.notEqual(sent[0]!.body.idempotencyKey, sent[1]!.body.idempotencyKey);
});

test("review page with no open review: the entry content and 「iOrbit で見直す」 (reads only until clicked)", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [fail(404, "DRAFT_NOT_FOUND")], url: "/reviews/current$" }, detailRead(), quotaRead(), { method: "POST", replies: [ok(base.review0, 201)], url: "/reviews$" }], view: "review" });
  await page.locator("[data-plan-review-start-card]").getByText("進めている見直しはありません").waitFor();
  assert.deepEqual(await writes(page), []);
  await page.locator("[data-plan-review-start]").click();
  await waitPush(page);
  assert.deepEqual(await pushes(page), [`/app/plans/${PLAN}/review?draft=${encodeURIComponent(base.review0.draft.draftId)}`]);
});

/* ---------- 手動で編集 / 達成 ---------- */

test("手動で編集: off with 「見直すと 1回つきます」 when used; otherwise opens a review draft and the R23 edit page", async (t) => {
  const used = clone(base.detail);
  used.quota = { ...used.quota, manualEditAvailable: false };
  const off = await screen(t, { handlers: [detailRead(used), goalsRead()], view: "overview" });
  await off.locator("[data-plan-manual-note]").getByText("見直すと 1回つきます").waitFor();
  assert.equal(await off.locator("[data-plan-action='edit']").isDisabled(), true);

  const draft = base.review0.draft;
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), { method: "POST", replies: [ok(draft, 201)], url: "/manual-edit$" }], view: "overview" });
  await page.locator("[data-plan-action='edit']").click();
  await waitPush(page);
  assert.deepEqual((await writes(page)).map((item) => `${item.method} ${path(item)}`), [`POST /v2/${PLAN}/manual-edit`]);
  assert.deepEqual(await pushes(page), [`/app/plans/drafts/${encodeURIComponent(draft.draftId)}/edit`]);
});

test("manual edit page with a review draft: back to the plan; saving confirms and carries 「方案を更新しました」", async (t) => {
  // efb2f858: `GET /drafts/[id]` now carries the plan's goal for a review draft, so the page reads it once.
  const plain = clone(base.review0.draft);
  const page = await screen(t, { draftId: plain.draftId, handlers: [
    { method: "GET", replies: [ok(plain)], url: `/drafts/${plain.draftId}$` },
    { method: "POST", replies: [ok({ archivedV1PlanId: null, href: `/app/tasks?tab=plan&plan=${PLAN}`, planId: PLAN, replayed: false }, 201)], url: "/manual-edit$" },
  ], view: "edit" });
  await page.locator("[data-plan-edit]").waitFor();
  await page.locator("[data-plan-edit]").getByText(base.review0.draft.purposeText ?? base.review0.draft.goal).waitFor();
  await page.locator("[data-plan-edit-back]").first().click();
  assert.deepEqual(await pushes(page), [`/app/tasks?tab=plan&plan=${PLAN}`]);
  assert.deepEqual(await writes(page), []);
  await page.getByRole("button", { name: "このプランで始める" }).click();
  await waitPush(page, 2);
  assert.deepEqual((await writes(page)).map((item) => `${item.method} ${path(item)}`), [`POST /drafts/${encodeURIComponent(plain.draftId)}/manual-edit`]);
  assert.deepEqual(await pushes(page), [`/app/tasks?tab=plan&plan=${PLAN}`, `/app/tasks?tab=plan&plan=${PLAN}`]);
  assert.equal(await page.evaluate(() => (window as any).flashStore.get("orbit:plan-flash")), "updated", "the overview will say 「方案を更新しました」");
});

test("達成: the confirm says the score stops; 達成を記録 sends achieve with the revision once and opens the done page", async (t) => {
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), { method: "POST", replies: [ok({ achievedAt: "2026-10-11T00:00:00.000Z", planId: PLAN })], url: "/achieve$" }], view: "overview" });
  await page.locator("[data-plan-action='achieve']").click();
  const dialog = page.getByRole("dialog", { name: "目標を達成として記録しますか？" });
  await dialog.locator("[data-plan-achieve-stats]").getByText(`スコア ${base.detail.score.total} · 話した人 ${base.goals[0]!.talkedPeople}人`).waitFor();
  await dialog.getByText("達成にすると点数はこれ以上増えません。", { exact: false }).waitFor();
  assert.deepEqual(await writes(page), []);
  await dialog.locator("[data-plan-achieve-confirm]").dblclick();
  await waitPush(page);
  const sent = await writes(page);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.body.expectedRevision, base.detail.revision);
  assert.deepEqual(await pushes(page), [`/app/plans/${PLAN}/done`]);
});

/* ---------- 完了 → 次の目標（A5） ---------- */

const achievement: PlanAchievementView = { achievedAt: "2026-10-07T03:00:00.000Z", bestMove: { basis: [{ kind: "record", label: "面談メモ 9/24", ref: "r1" }], text: "渡辺さんからの紹介で会った VC 2社が、リードとフォローに。" }, events: 6, goal: "シリーズA 資金調達（3億円）", goalKind: "fundraising", planId: PLAN, skippedAreas: ["弁護士（投資契約）"], talkedPeople: 21, total: 128 };
const nextGoals: PlanNextGoalsResponse = { candidates: [
  { basis: [{ kind: "record", label: "話した CVC 担当者 3人のうち 2社が PoC に関心", ref: "r2" }], goalKind: "partnership", goalText: "大手製造業との事業提携" },
  { basis: [], goalKind: "hiring", goalText: "営業責任者の採用" },
], source: "ai" };
const doneHandlers = (extra: Handler[] = [], next: PlanNextGoalsResponse = nextGoals, quota: Partial<PlanQuotaResponse> = { activeGoals: 1 }): Handler[] => [
  { method: "GET", replies: [ok(achievement)], url: "/achievement$" }, { method: "GET", replies: [ok(next)], url: "/next-goals$" }, quotaRead(quota), ...extra,
];

test("done: three big numbers, いちばん効いたこと with basis, skipped areas; no confetti; a candidate starts the flow with source next_goal", async (t) => {
  const page = await screen(t, { handlers: doneHandlers([{ method: "POST", replies: [ok({ href: "/app/plans/flow/in-9", intakeId: "in-9" }, 201)], url: "/intakes$" }]), view: "done" });
  await page.locator(`[data-plan-done="${PLAN}"]`).waitFor();
  for (const [key, value] of [["total", 128], ["talked", 21], ["events", 6]] as const) await page.waitForFunction(([k, v]) => document.querySelector(`[data-plan-done-stat="${k}"]`)?.textContent?.startsWith(String(v)), [key, value] as const);
  await page.locator("[data-plan-done-best]").getByText(achievement.bestMove!.text).waitFor();
  await page.locator("[data-plan-done-skipped]").getByText("スキップした分野：弁護士（投資契約）").waitFor();
  assert.equal(await page.locator("canvas, [data-confetti]").count(), 0, "no confetti");
  // R25 复核 m3: C10 only after 「次の目標を決める」.
  assert.equal((await fetches(page)).filter((item) => path(item).endsWith("/next-goals")).length, 0, "opening the done page asks no AI");
  await page.locator("[data-plan-next-decide]").click();
  assert.equal(await page.locator("[data-plan-next-candidate]").count(), 2);
  await page.locator("[data-plan-next-basis]").getByText("話した CVC 担当者 3人のうち 2社が PoC に関心").waitFor();
  assert.deepEqual(await writes(page), [], "the done page only reads");
  await page.locator("[data-plan-next-start]").dblclick();
  await waitPush(page);
  const sent = await writes(page);
  assert.equal(sent.length, 1);
  assert.deepEqual({ ...sent[0]!.body, idempotencyKey: undefined }, { goalKind: "partnership", goalText: "大手製造業との事業提携", idempotencyKey: undefined, source: "next_goal" });
  assert.deepEqual(await pushes(page), ["/app/plans/flow/in-9"]);
});

test("done: no best move and no AI ideas → only 「自分で決める」, which opens the goal input; at 2 goals the start is off with the reason", async (t) => {
  const plain = { ...achievement, bestMove: null, skippedAreas: [] };
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(plain)], url: "/achievement$" }, { method: "GET", replies: [ok({ candidates: [], source: "none" })], url: "/next-goals$" }, quotaRead({ activeGoals: 1 })], view: "done" });
  await page.locator("[data-plan-next-decide]").click();
  await page.locator("[data-plan-next-own][aria-checked='true']").waitFor();
  assert.equal(await page.locator("[data-plan-done-best]").count(), 0);
  assert.equal(await page.locator("[data-plan-next-candidate]").count(), 0);
  await page.locator("[data-plan-next-start]").click();
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&new=1"]);

  const full = await screen(t, { handlers: doneHandlers([], nextGoals, { activeGoals: 2 }), view: "done" });
  await full.locator("[data-plan-next-decide]").click();
  await full.locator("[data-plan-next-limit]").getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.equal(await full.locator("[data-plan-next-start]").isDisabled(), true);
  assert.doesNotMatch(await full.locator(`[data-plan-done="${PLAN}"]`).innerText(), PAID);
});

/* ---------- 目標の切替と編集（A6） ---------- */

const twoGoals = (): PlanGoalListItem[] => [
  { ...base.goals[0]! },
  { goal: "製造業の新規顧客開拓", goalKind: "sales", planId: "plan-2", status: "active", talkedPeople: 14, total: 72 },
  { goal: "シードの資金調達", goalKind: "fundraising", planId: "plan-0", status: "achieved", talkedPeople: 9, total: 104 },
];

test("goal switcher: active goals with score and people (current ticked), finished → done, 以前のプラン, add off at 2 with the reason; picking another calls open", async (t) => {
  const detail = clone(base.detail);
  detail.quota = { ...detail.quota, activeGoals: 2 };
  const page = await screen(t, { handlers: [detailRead(detail), goalsRead(twoGoals()), { method: "GET", replies: [ok({ plans: [{ actionsDone: 3, actionsTotal: 8, archivedAt: "2026-09-01T00:00:00.000Z", goal: "以前の目標", needs: 4, planId: "v1-1", startsOn: "2026-06-01", status: "archived" }] })], url: "/legacy$" },
    { method: "POST", replies: [ok({ planId: "plan-2" })], url: "/plan-2/open$" }], view: "overview" });
  await page.locator("[data-plan-goal-switcher]").click();
  const menu = page.locator("[data-plan-goal-menu]");
  await menu.locator(`[data-plan-goal-option="${PLAN}"][aria-current="true"]`).waitFor();
  await menu.locator('[data-plan-goal-option="plan-2"]').getByText("スコア 72 · 話した人 14").waitFor();
  assert.equal(await menu.locator('[data-plan-goal-done="plan-0"]').getAttribute("href"), "/app/plans/plan-0/done");
  assert.equal(await menu.locator('[data-plan-goal-legacy="v1-1"]').getAttribute("href"), "/app/plans/legacy/v1-1");
  assert.equal(await menu.locator("[data-plan-add-goal]").isDisabled(), true);
  await menu.locator("[data-plan-goal-limit]").getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.doesNotMatch(await menu.innerText(), PAID);
  await page.getByText("目標 1 / 2").waitFor();
  assert.deepEqual(await writes(page), [], "opening the switcher only reads");
  await menu.locator('[data-plan-goal-option="plan-2"]').click();
  await waitPush(page);
  assert.deepEqual((await writes(page)).map((item) => `${item.method} ${path(item)}`), ["POST /v2/plan-2/open"]);
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&plan=plan-2"]);
});

test("goal switcher with room: 「＋ 目標を追加」 opens the goal input (new=1)", async (t) => {
  const page = await screen(t, { handlers: [detailRead(), goalsRead()], view: "overview" });
  await page.locator("[data-plan-goal-switcher]").click();
  await page.locator("[data-plan-add-goal]").click();
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&new=1"]);
});

test("goal edit: unchanged → 保存 just closes; a change offers three exits — キャンセル sends nothing, 目標だけ保存 / 保存して作り直す send their mode", async (t) => {
  const edited = { planId: PLAN, reviewDraftId: null, revision: base.detail.revision + 1 };
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), { method: "PATCH", replies: [ok(edited), ok({ ...edited, reviewDraftId: "draft-r9" })], url: "/goal$" }], view: "overview" });
  const openEdit = async () => { await page.locator("[data-plan-goal-switcher]").click(); await page.locator("[data-plan-edit-goal]").click(); };
  await openEdit();
  const dialog = page.getByRole("dialog", { name: "目標を編集" });
  // Nothing changed: 保存 just closes, no request.
  await dialog.locator("[data-plan-goal-save]").click();
  await dialog.waitFor({ state: "detached" });
  await openEdit();
  await dialog.getByLabel("目標", { exact: true }).fill("シリーズA 資金調達（5億円）");
  await dialog.locator("[data-plan-goal-rebuild-note]").getByText("獲得済みの点・面談の記録・スキップはそのまま残ります").waitFor();
  await dialog.locator("[data-plan-goal-diff='text']").waitFor();
  await dialog.locator("[data-plan-goal-cancel]").click();
  assert.deepEqual(await writes(page), [], "キャンセル sends nothing");
  await openEdit();
  await dialog.getByLabel("目標", { exact: true }).fill("シリーズA 資金調達（5億円）");
  await dialog.locator("[data-plan-goal-save-only]").click();
  await page.getByText("目標を保存しました").waitFor();
  await openEdit();
  await dialog.getByRole("button", { name: /事業提携/u }).click();
  await dialog.locator("[data-plan-goal-rebuild]").click();
  await waitPush(page);
  const sent = await writes(page);
  assert.deepEqual(sent.map((item) => item.body.mode), ["save_only", "save_and_rebuild"]);
  assert.equal(sent[0]!.body.goalText, "シリーズA 資金調達（5億円）");
  assert.equal(sent[0]!.body.expectedRevision, base.detail.revision);
  assert.equal(sent[1]!.body.goalKind, "partnership");
  assert.equal("goalText" in sent[1]!.body, false, "only the changed field is sent");
  assert.deepEqual(await pushes(page), [`/app/plans/${PLAN}/review?draft=draft-r9`]);
});

/* ---------- new=1 / 以前のプラン ---------- */

test("new=1: the goal input with a way back; at 2 active goals it explains the limit instead", async (t) => {
  const page = await screen(t, { backHref: `/app/tasks?tab=plan&plan=${PLAN}`, handlers: [{ method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 2, intakes: [], newGoalsLeftThisMonth: 9 })], url: "/intakes$" }], view: "goal" });
  await page.locator("[data-plan-notice='activeGoals']").getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.equal(await page.getByRole("button", { name: "iOrbit と具体化する" }).isDisabled(), true);
  assert.doesNotMatch(await page.locator("body").innerText(), PAID);
  await page.locator("[data-plan-entry-back]").click();
  assert.deepEqual(await pushes(page), [`/app/tasks?tab=plan&plan=${PLAN}`]);
});

const legacyDetail: PlanLegacyDetail = {
  actionsDone: 2, actionsTotal: 5, analysisSummary: "製造業向けの販路を、紹介とイベントで広げる計画です。", archivedAt: null, goal: "製造業の販路を広げる",
  items: [
    { kind: "action", phase: "第1週", status: "done", title: "既存顧客に紹介を頼む" },
    { kind: "action", phase: "p2", status: "in_progress", title: "展示会の出展を決める" },
    { kind: "network_need", phase: null, status: "linked", title: "工場長クラスの決裁者" },
    { kind: "event", phase: null, status: "recommended", title: "製造業DXカンファレンス" },
  ],
  needs: 1, planId: "v1-1", startsOn: "2026-06-01", status: "active",
};

test("以前のプラン card: goal, start, Step progress and people to meet; 「新しいプランを作る」 opens the goal input", async (t) => {
  const { items: _items, analysisSummary: _summary, ...item } = legacyDetail;
  const page = await screen(t, { handlers: [], legacy: item, view: "legacy-card" });
  const card = page.locator('[data-plan-legacy-card="v1-1"]');
  await card.locator("[data-legacy-goal]").getByText("製造業の販路を広げる").waitFor();
  await card.locator("[data-legacy-steps]").getByText("Step 2 / 5").waitFor();
  await card.locator("[data-legacy-needs]").getByText("会いたい人 1").waitFor();
  assert.equal(await card.locator("[data-plan-legacy-open]").getAttribute("href"), "/app/plans/legacy/v1-1");
  await card.locator("[data-plan-legacy-new]").click();
  assert.deepEqual(await pushes(page), ["/app/tasks?tab=plan&new=1"]);
  assert.deepEqual(await fetches(page), [], "the card is drawn from the slot's read");
});

test("以前のプラン detail: read only — items grouped by kind with status chips; no input, no edit or re-analysis, only a read", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(legacyDetail)], url: "/legacy/v1-1$" }], planId: "v1-1", view: "legacy" });
  await page.locator('[data-plan-legacy="v1-1"]').waitFor();
  assert.deepEqual(await page.locator("[data-legacy-group]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-legacy-group"))), ["action", "network_need", "event"]);
  await page.locator('[data-legacy-group="action"]').getByText("完了").waitFor();
  // 模拟器走查：旧计划的阶段 id「p2」显示成「フェーズ 2」，其他写法（第1週）原样。
  await page.locator('[data-legacy-group="action"]').getByText("フェーズ 2", { exact: true }).waitFor();
  await page.locator('[data-legacy-group="action"]').getByText("第1週", { exact: true }).waitFor();
  await page.locator('[data-legacy-group="network_need"]').getByText("候補あり").waitFor();
  await page.locator("[data-legacy-summary]").getByText(legacyDetail.analysisSummary!).waitFor();
  await page.getByText("見るだけ", { exact: true }).waitFor();
  assert.equal(await page.locator("input, textarea, select").count(), 0);
  assert.equal(await page.getByRole("button", { name: /編集|再分析|分析し直す/u }).count(), 0);
  assert.deepEqual((await fetches(page)).map((item) => `${item.method} ${path(item)}`), ["GET /legacy/v1-1"]);
});

test("以前のプラン detail: an unknown id is 「見つかりません」, a failed read offers retry", async (t) => {
  const missing = await screen(t, { handlers: [{ method: "GET", replies: [fail(404, "PLAN_NOT_FOUND")], url: "/legacy/" }], planId: "nope", view: "legacy" });
  await missing.locator("[data-plan-legacy-missing]").getByText("このプランは見つかりません").waitFor();
  const broken = await screen(t, { handlers: [{ method: "GET", replies: [fail(503, "DOWN")], url: "/legacy/" }], planId: "x", view: "legacy" });
  await broken.locator("[data-plan-legacy-error]").waitFor();
});

/* ---------- mock end to end ---------- */

function bridge(page: Page) {
  const { flow, v2 } = mocks();
  const routes: [string, RegExp, RouteHandler, string[]][] = [
    ["GET", /^\/v2$/u, v2.list, []],
    ["GET", /^\/v2\/quota$/u, flow.quota, []],
    ["GET", /^\/v2\/summary$/u, v2.summary, []],
    ["GET", /^\/v2\/([^/]+)$/u, v2.detail, ["planId"]],
    ["POST", /^\/v2\/([^/]+)\/reviews$/u, flow.startReview, ["planId"]],
    ["GET", /^\/v2\/([^/]+)\/reviews\/current$/u, flow.currentReview, ["planId"]],
    ["GET", /^\/drafts\/([^/]+)\/review$/u, flow.getReview, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/review\/fix$/u, flow.reviewFix, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/changes\/([^/]+)\/toggle$/u, flow.toggleChange, ["draftId", "changeId"]],
    ["POST", /^\/drafts\/([^/]+)\/confirm$/u, flow.confirm, ["draftId"]],
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

test("mock end to end: overview → 見直し entry → page → send → ✕ one change → 確定 → overview (updated, toast)", async (t) => {
  resetPlansV2MockRepositoryForTests();
  t.after(() => resetPlansV2MockRepositoryForTests());
  const { v2 } = mocks();
  const before = await call(v2.detail, { planId: PLAN }) as PlanV2Detail;

  const overview = await screen(t, { bridge: true, handlers: [], view: "overview" }, {}, bridge);
  await overview.getByRole("button", { name: "方案を見直す", exact: true }).click();
  await overview.getByRole("dialog", { name: "方案を見直しますか？" }).getByText("今月あと 3 回").waitFor();
  await overview.getByRole("button", { name: "iOrbit で見直す" }).click();
  await waitPush(overview);
  const [href] = await pushes(overview);
  const draftId = decodeURIComponent(/\?draft=(.+)$/u.exec(href!)![1]!);

  const review = await screen(t, { bridge: true, draftId, handlers: [], view: "review" }, {}, bridge);
  await review.locator("[data-plan-review-premise]").waitFor();
  await review.getByRole("button", { name: "直近の数字を直す" }).click();
  await review.locator('[data-premise-input="F2"]').fill("ARR 1億円の見込み");
  await review.locator('[data-premise-input="F2"]').press("Enter");
  await review.locator("[data-plan-review-text]").fill("CVC にも並行で当たりたい");
  await review.locator("[data-plan-review-send]").click();
  await review.locator('[data-turn="1"]').waitFor();
  await review.locator("[data-plan-review-quota]").getByText("2", { exact: true }).waitFor();
  const first = review.locator('[data-turn="1"] [data-change]').first();
  const changeId = await first.getAttribute("data-change");
  await first.getByRole("button", { name: "この変更を採用しない" }).click();
  await review.locator(`[data-change="${changeId}"][data-accepted="false"]`).waitFor();
  // Every ✕ left: nothing changes → 「このままにする」; ✓ it back and confirm.
  await review.locator(`[data-change="${changeId}"]`).getByRole("button", { name: "この変更を採用", exact: true }).click();
  await review.locator(`[data-change="${changeId}"][data-accepted="true"]`).waitFor();
  await review.locator("[data-plan-review-confirm]").click();
  await waitPush(review);
  assert.deepEqual(await pushes(review), [`/app/tasks?tab=plan&plan=${PLAN}`]);
  assert.equal(await review.evaluate(() => (window as any).flashStore.get("orbit:plan-flash")), "updated");
  assert.deepEqual((await writes(review)).map((item) => `${item.method} ${path(item).replace(encodeURIComponent(draftId), ":d").replace(draftId, ":d")}`), [
    "POST /drafts/:d/review/fix", `POST /drafts/:d/changes/${changeId}/toggle`, `POST /drafts/:d/changes/${changeId}/toggle`, "POST /drafts/:d/confirm",
  ]);

  const after = await call(v2.detail, { planId: PLAN }) as PlanV2Detail;
  assert.ok(after.revision > before.revision, "confirming bumped the plan revision");
  assert.equal(after.quota.reviewLeftThisMonth, 2, "one send used one review");
  assert.equal(after.score.total, before.score.total, "earned points did not change");
  const back = await screen(t, { bridge: true, flash: "updated", handlers: [], view: "overview" }, {}, bridge);
  await back.getByText("方案を更新しました").waitFor();
  await back.locator("[data-plan-step]").first().waitFor();
  const firstStep = after.content.steps[0]!;
  await back.getByText(firstStep.doneCriteria).first().waitFor();
});

/* ---------- 中文 ---------- */

test("Chinese UI: the review page speaks Chinese", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(base.review0), detailRead()], lang: "zh", view: "review" });
  await page.getByText("已确定的前提").waitFor();
  await page.getByRole("button", { name: "发送前提并生成修改方案" }).waitFor();
});

/* ---------- efb2f858 の新フィールド ---------- */

test("entry numbers come from the overview's sinceConfirmed (no extra read); a mark shows the server's evidence summaries", async (t) => {
  const detail = clone(base.detail);
  detail.sinceConfirmed = { events: 6, stepsDone: 2, talkedPeople: 12 };
  const page = await screen(t, { handlers: [detailRead(detail), goalsRead(), quotaRead()], view: "overview" });
  await page.getByRole("button", { name: "方案を見直す", exact: true }).click();
  const data = page.locator("[data-plan-review-data]");
  await data.getByText("話した人 12人").waitFor();
  await data.getByText("イベント 6回").waitFor();
  await data.getByText("Step 完了 2").waitFor();
  assert.equal((await fetches(page)).filter((item) => path(item).endsWith("/reviews/current")).length, 0);

  const review = clone(base.review0);
  review.premiseMarks = [{ evidence: [{ at: "2026-10-05T01:00:00.000Z", id: "e1", text: "面談メモ「ARR 1億円の見込み」" }], evidenceIds: ["e1"], key: "F2", reason: "最近の記録で変わったかもしれません。", suggested: null }];
  const reviewPage = await screen(t, { draftId: review.draft.draftId, handlers: [reviewRead(review), detailRead()], view: "review" });
  await reviewPage.locator('[data-premise-evidence="F2"]').getByText("根拠：面談メモ「ARR 1億円の見込み」（10月5日）").waitFor();
});

/* ---------- R25 复核（REVIEW.md S1 / m1 / m3 / ai_budget / STALE） ---------- */

test("m1: 「このままにする」 follows the whole draft — a sent premise change still confirms; nothing changed → back without a write", async (t) => {
  // Every change ✕ but the premise F2 was changed and sent: the draft changes the plan.
  const page = await screen(t, { draftId: base.review1Off.draft.draftId, handlers: [reviewRead(base.review1Off), detailRead()], view: "review" });
  await page.locator("[data-plan-review-confirm]").waitFor();
  assert.equal(await page.locator("[data-plan-review-keep]").count(), 0);
  // Same draft against a plan that already has that premise: nothing changes → このままにする, no write.
  const same = clone(base.detail);
  same.premise = base.review1Off.draft.premise;
  const keep = await screen(t, { draftId: base.review1Off.draft.draftId, handlers: [reviewRead(base.review1Off), detailRead(same)], view: "review" });
  await keep.locator("[data-plan-review-keep]").click();
  assert.deepEqual(await pushes(keep), [`/app/tasks?tab=plan&plan=${PLAN}`]);
  assert.deepEqual(await writes(keep), []);
});

test("m1: send needs a changed premise or a line — empty input sends nothing", async (t) => {
  const page = await screen(t, { draftId: base.review0.draft.draftId, handlers: [reviewRead(base.review0), detailRead()], view: "review" });
  await page.locator("[data-plan-review-send]").waitFor();
  assert.equal(await page.locator("[data-plan-review-send]").isDisabled(), true);
  await page.locator("[data-plan-review-text]").fill("   ");
  assert.equal(await page.locator("[data-plan-review-send]").isDisabled(), true, "spaces are not a line");
});

test("ai_budget: the used-up state says the month's AI limit (entry and page), still no paid plan", async (t) => {
  const page = await screen(t, { handlers: [detailRead(), goalsRead(), quotaRead({ reviewLeftThisMonth: 0, reviewLimitReason: "ai_budget" })], view: "overview" });
  await page.getByRole("button", { name: "方案を見直す", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "今月の AI 利用上限に達しました" });
  await dialog.locator("[data-plan-review-used-up='ai_budget']").getByText("11月1日に戻ります", { exact: false }).waitFor();
  assert.doesNotMatch(await dialog.innerText(), PAID);
  const view = { ...withLeft(base.review0, 0), reviewLimitReason: "ai_budget" as const };
  const review = await screen(t, { draftId: view.draft.draftId, handlers: [reviewRead(view), detailRead()], view: "review" });
  await review.locator("[data-plan-review-composer='off']").getByText("今月の AI 利用上限に達しました").waitFor();
  assert.doesNotMatch(await review.locator("[data-plan-review]").innerText(), PAID);
});

test("STALE on 確定 and on ✓ / ✕ (draft voided by a plan change) → 「最新を読み込む」", async (t) => {
  const page = await screen(t, { draftId: base.review1.draft.draftId, handlers: [reviewRead(base.review1), detailRead(),
    { method: "POST", replies: [fail(409, "STALE")], url: "/confirm$" }, { method: "POST", replies: [fail(409, "STALE")], url: "/toggle$" }], view: "review" });
  await page.locator("[data-plan-review-confirm]").click();
  await page.locator("[data-plan-review-stale]").getByRole("button", { name: "最新を読み込む" }).waitFor();
  const change = base.review1.draft.turns[0]!.changes[0]!;
  await page.locator(`[data-change="${change.id}"]`).getByRole("button", { name: "この変更を採用しない" }).click();
  await page.locator("[data-plan-review-stale]").waitFor();
  assert.equal(await page.getByText("保存できませんでした").count(), 0);
});

test("S1 (mock end to end): with a skipped type, +5 on another type never takes from the skipped one, and saving confirms", async (t) => {
  resetPlansV2MockRepositoryForTests();
  t.after(() => resetPlansV2MockRepositoryForTests());
  const { flow, v2 } = mocks();
  const before = await call(v2.detail, { planId: PLAN }) as PlanV2Detail;
  const types = [...before.content.personTypes].filter((type) => !type.skipped);
  const skipped = types.reduce((top, type) => (type.allocation > top.allocation ? type : top));
  await call(v2.skip, { itemId: skipped.itemId, planId: PLAN }, { idempotencyKey: "s1-skip" });
  const draft = await call(flow.openManualEdit, { planId: PLAN }, { idempotencyKey: "s1-open" }) as PlanReviewView["draft"];
  assert.ok(draft.slotState?.some((item) => item.skipped), "the server says which slot is skipped");
  const target = types.find((type) => type.itemId !== skipped.itemId && type.allocation <= 90)!;

  const routes: [string, RegExp, RouteHandler, string[]][] = [
    ["GET", /^\/drafts\/([^/]+)$/u, flow.getDraft, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/manual-edit$/u, flow.manualEdit, ["draftId"]],
  ];
  const page = await screen(t, { bridge: true, draftId: draft.draftId, handlers: [], view: "edit" }, {}, async (p) => {
    await p.exposeFunction("planServer", async (url: string, method: string, body: string | null, lang: string) => {
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
  });
  await page.locator("[data-plan-edit]").waitFor();
  await page.locator("[data-slot-skipped]").first().waitFor();
  assert.equal(await page.locator("[data-slot-skipped]").first().isDisabled(), true, "a skipped type's points are locked");
  const points = page.getByLabel(new RegExp(`${target.shortLabel}の配点$`, "u"));
  await points.fill(String(target.allocation + 5));
  await points.press("Enter");
  assert.equal(await page.locator("[data-plan-total]").textContent(), "100");
  await page.getByRole("button", { name: "このプランで始める" }).click();
  await waitPush(page);
  assert.deepEqual(await pushes(page), [`/app/tasks?tab=plan&plan=${PLAN}`]);
  const after = await call(v2.detail, { planId: PLAN }) as PlanV2Detail;
  const allocation = (itemId: string) => after.content.personTypes.find((type) => type.itemId === itemId)!.allocation;
  assert.equal(allocation(skipped.itemId), skipped.allocation, "the skipped type keeps its points");
  assert.equal(allocation(target.itemId), target.allocation + 5);
  assert.equal(after.content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + after.content.event.allocation, 100);
});

test("manual edit of a review draft voided by a plan change (STALE) → 読み直す goes to the plan", async (t) => {
  const draft = clone(base.review0.draft);
  const page = await screen(t, { draftId: draft.draftId, handlers: [{ method: "GET", replies: [ok(draft)], url: `/drafts/${draft.draftId}$` }, { method: "POST", replies: [fail(409, "STALE")], url: "/manual-edit$" }], view: "edit" });
  await page.getByRole("button", { name: "このプランで始める" }).click();
  await page.locator("[data-plan-notice='stale']").getByRole("button", { name: "読み直す" }).click();
  assert.deepEqual(await pushes(page), [`/app/tasks?tab=plan&plan=${PLAN}`]);
});
