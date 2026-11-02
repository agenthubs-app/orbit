import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { PlanDraftView, PlanIntakeView } from "../src/api/contract/plan-v2";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

// R36b (SC-02 / 03 / 05): the v3 first-draft page (plan-draft-v5-proposal.html v16「手机」·「初稿 · 确认」) rendered
// for real with react-native-web in Chromium, the same harness as plan-screens.test.tsx. The server is a scripted
// stand-in answering with the orbits mock service's own v3 payloads (tests/fixtures/plan-draft-v3-mock.json) and
// recording every request, so the tests can assert the confirm body (adjustments only when something changed) and
// that adjusting sends nothing.
const root = new URL("..", import.meta.url).pathname;
const mock = JSON.parse(readFileSync(join(root, "tests/fixtures/plan-draft-v3-mock.json"), "utf8"));
const v2 = JSON.parse(readFileSync(join(root, "tests/fixtures/plan-flow-mock.json"), "utf8"));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; body: unknown };
type Handler = (call: Call, calls: Call[]) => Reply | undefined;
const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanFlowScreen } from "./src/screens/plan/PlanFlowScreen";
import { ToastProvider, UiFeedbackHost, UiPortalHost } from "./src/components/ui";
function Root() {
  const [path, setPath] = React.useState(window.planNav.path);
  window.planNav.setPath = setPath;
  const flow = path.match(/^\\/plans\\/flow\\/([^/?]+)/);
  const screen = flow ? <PlanFlowScreen key={path} intakeId={decodeURIComponent(flow[1])} /> : null;
  return <ToastProvider><UiPortalHost>{screen}<UiFeedbackHost /></UiPortalHost></ToastProvider>;
}
window.fetch = async (input, init) => {
  const url = new URL(String(input));
  const reply = await window.planServer(JSON.stringify({ method: init?.method ?? "GET", path: url.pathname + url.search, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers ?? {} }));
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
};
createRoot(document.getElementById("root")).render(<Root />);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "plan-draft-v3-screens", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "plan-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "plan-native" }, () => ({ contents: `export * from "react-native-web"; export const findNodeHandle = (instance) => instance;`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "expo-router", namespace: "plan-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "plan-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor", cookieHeader: "c" });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      plugin.onLoad({ filter: /^expo-router$/, namespace: "plan-stub" }, () => ({ contents: `
const nav = () => window.planNav;
const go = (method, href) => { nav().navigation.push({ method, href }); if (href) { nav().path = href; nav().setPath?.(href); } };
const router = { push: (href) => go("push", href), replace: (href) => go("replace", href), back: () => go("back"), dismissAll: () => nav().navigation.push({ method: "dismissAll" }), canGoBack: () => false, setParams() {} };
export const useRouter = () => router;
export const usePathname = () => nav().path.split("?")[0];
export const useIsFocused = () => true;
export const useLocalSearchParams = () => ({});
export const useGlobalSearchParams = () => ({});
export const Redirect = () => null;
export const Stack = { Screen: () => null };
`, loader: "js" }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, handler: Handler, options: { dark?: boolean } = {}): Promise<{ page: Page; calls: Call[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: options.dark ? "dark" : "light" });
  const errors: string[] = [];
  const calls: Call[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.exposeFunction("planServer", (raw: string) => {
    const call = JSON.parse(raw) as Call;
    calls.push(call);
    return handler(call, calls) ?? { body: { error: { code: "NOT_FOUND", message: "unexpected " + call.method + " " + call.path }, success: false }, status: 404 };
  });
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.planNav=${JSON.stringify({ path, navigation: [] })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { calls, page };
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
const fixture = (kind: "fundraising" | "sales" | "hiring") => ({ draft: clone(mock[kind].draft) as PlanDraftView, intake: clone(mock[kind].intake) as PlanIntakeView });
const confirmed = { archivedV1PlanId: null, href: "/task?seg=plan&plan=plan_v3", planId: "plan_v3", replayed: false };

/** The usual server: the intake, its draft, and a confirm that records its body. */
function serverFor(intake: PlanIntakeView, draft: PlanDraftView, extra?: Handler): Handler {
  return (call, calls) => {
    if (call.path === `/api/agent/plans/intakes/${intake.intakeId}`) return ok(intake);
    if (call.method === "GET" && call.path === `/api/agent/plans/drafts/${draft.draftId}`) return ok(draft);
    if (call.method === "POST" && call.path === `/api/agent/plans/drafts/${draft.draftId}/confirm`) return ok(confirmed, 201);
    return extra?.(call, calls);
  };
}

test("v3 draft: the design's page replaces the chat — hero, route, grouped type table, evidence, dock; nothing sent", async (t) => {
  const { draft, intake } = fixture("fundraising");
  const { page, calls } = await open(t, "/plans/flow/intake_v3_fund", serverFor(intake, draft));
  const v3 = page.getByTestId("draft-v3");
  await v3.waitFor();
  assert.equal(await page.getByTestId("draft-card").count(), 0, "the v2.2 card is not rendered");
  assert.equal(await page.getByText("確定した前提").count(), 0, "the premise card is folded into the hero's kick");
  assert.equal(await page.getByText("背景を確認しました").count(), 0);
  const text = await v3.innerText();
  assert.match(text, /目標 · リード投資家が 1 社決まる/);
  assert.match(text, new RegExp(draft.content.conclusion.slice(0, 12)));
  assert.match(text, /実現できる/);
  assert.match(text, /確信度 中/);
  // Route: one node per step (4 in the mock, the event-only step included).
  assert.equal(await page.getByTestId("draft-v3-route").locator("div", { hasText: /^[1-4]$/ }).count() >= 4, true);
  // Type table grouped by stage (steps[].personTypeKeys): 1 cfo + funded_founder, 2 angel + vc_partner, 3 cvc + lawyer; no header for the event-only step.
  for (const n of [1, 2, 3]) assert.equal(await page.getByTestId(`draft-v3-stage-${n}`).count(), 1, `stage ${n}`);
  assert.equal(await page.getByTestId("draft-v3-stage-4").count(), 0);
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="draft-v3-stage-"],[data-testid^="draft-v3-type-"],[data-testid="draft-v3-event"]')].map((node) => node.getAttribute("data-testid")));
  assert.deepEqual(order, ["draft-v3-stage-1", "draft-v3-type-cfo", "draft-v3-type-funded_founder", "draft-v3-stage-2", "draft-v3-type-angel", "draft-v3-type-vc_partner", "draft-v3-stage-3", "draft-v3-type-cvc", "draft-v3-type-lawyer", "draft-v3-event"]);
  assert.match(await page.getByTestId("draft-v3-total").innerText(), /6 タイプ · 13 人 · イベント 2 回[\s\S]*合計 100 \/ 100 点/);
  // Evidence: order reasons with source badges, the ladder, and the fold.
  const evidence = page.getByTestId("draft-v3-evidence");
  assert.match(await evidence.innerText(), /なぜこの順番か[\s\S]*先に会う投資家[\s\S]*第一候補[\s\S]*おすすめしない/);
  assert.equal(await page.getByTestId("draft-v3-more").count(), 0);
  await page.getByTestId("draft-v3-toggle").click();
  const more = page.getByTestId("draft-v3-more");
  await more.waitFor();
  assert.equal(await page.getByTestId("draft-v3-risk-unverified").count(), 1, "the unverified risk has its own tag");
  assert.match(await more.innerText(), /要確認[\s\S]*今年の CVC の PoC 予算/);
  assert.equal(await more.getByRole("link").count(), 7, "every source has 原文を見る");
  assert.equal(await page.getByTestId("draft-v3-dock").count(), 1);
  assert.equal(await page.getByTestId("draft-confirm").getAttribute("aria-disabled"), null, "100 → confirm enabled");
  assert.deepEqual(writes(calls), [], "rendering and unfolding send nothing");
  if (process.env.R36B_SHOT) {
    // A sanity look while no simulator runtime is installed (not the gate): the whole page in one tall viewport.
    mkdirSync(process.env.R36B_SHOT, { recursive: true });
    await page.setViewportSize({ height: 3200, width: 390 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(process.env.R36B_SHOT, "rnw-fund-light.png") });
  }
});

test("v2 draft (no schemaVersion) still renders the R23 card with its edit / confirm buttons", async (t) => {
  const intake = clone(v2.intakePremise) as PlanIntakeView & { href: string };
  const draft = clone(v2.draft) as PlanDraftView;
  const { page } = await open(t, "/plans/flow/intake_f1", serverFor({ ...intake, draftId: "draft_f2", status: "drafted" }, { ...draft, manualEditAvailable: true }));
  await page.getByTestId("draft-card").waitFor();
  assert.equal(await page.getByTestId("draft-v3").count(), 0);
  assert.equal(await page.getByTestId("draft-manual").count(), 1);
  assert.equal(await page.getByTestId("draft-confirm").count(), 1);
});

test("missing optional blocks are not rendered: no evidence card, no key numbers; unknown source refs get no badge; a stale web source is marked", async (t) => {
  const { draft, intake } = fixture("sales");
  draft.content.orderReasons = [];
  draft.content.comparison = null;
  draft.content.keyNumbers = [];
  draft.content.risks = [];
  draft.content.summary = { ...draft.content.summary!, refs: [{ end: 10, ref: { kind: "source", sourceId: "nope" }, start: 0 }] };
  const { page } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, draft));
  await page.getByTestId("draft-v3").waitFor();
  assert.equal(await page.getByTestId("draft-v3-evidence").count(), 0, "no order reasons and no comparison → the whole evidence section is gone");
  assert.equal(await page.getByTestId("draft-v3-summary").locator("div").count(), 0, "no badge for an unknown source");
  // Only the sources are left to fold out, with the one fetched long ago marked.
  const stale = fixture("sales");
  const firstWeb = stale.draft.content.sources!.find((source) => source.kind === "web")!.id;
  stale.draft.content.sources = stale.draft.content.sources!.map((source) => source.kind === "web" && source.id === firstWeb ? { ...source, fetchedAt: "2025-01-01T00:00:00.000Z" } : source);
  stale.draft.content.keyNumbers = [];
  stale.draft.content.risks = [];
  const second = await open(t, "/plans/flow/intake_v3_sales", serverFor(stale.intake, stale.draft));
  await second.page.getByTestId("draft-v3-toggle").click();
  const more = second.page.getByTestId("draft-v3-more");
  await more.waitFor();
  assert.equal(await more.getByText("更新の可能性あり", { exact: true }).count(), 1);
  assert.equal(await more.getByText("要確認", { exact: true }).count(), 0);
});

test("adjust: points / people / drop change the total at once and send nothing; ≠100 disables confirm; confirm carries adjustments", async (t) => {
  const { draft, intake } = fixture("fundraising");
  const { page, calls } = await open(t, "/plans/flow/intake_v3_fund", serverFor(intake, draft));
  await page.getByTestId("draft-v3").waitFor();
  const total = page.getByTestId("draft-v3-total");
  const confirm = page.getByTestId("draft-confirm");
  await page.getByRole("button", { name: "VC パートナーの配点を増やす" }).click();
  assert.match(await total.innerText(), /合計 105 \/ 100 点、確定する前に 100 にしてください/);
  assert.equal(await confirm.getAttribute("aria-disabled"), "true");
  assert.equal(await page.getByTestId("draft-v3-type-vc_partner").getByText("変更あり").count(), 1);
  await page.getByRole("button", { name: "VC パートナーの配点を減らす" }).click();
  assert.equal(await confirm.getAttribute("aria-disabled"), null);
  assert.equal(await page.getByTestId("draft-v3-type-vc_partner").getByText("変更あり").count(), 0, "back to the AI's value → not marked");
  // People: the stepper stops at 1 and 5 (CFO 経験者 starts at 1 → its − is disabled from the start).
  assert.equal(await page.getByRole("button", { name: "CFO 経験者を減らす" }).getAttribute("aria-disabled"), "true");
  await page.getByRole("button", { name: "調達経験のある起業家を減らす" }).click();
  await page.getByRole("button", { name: "調達経験のある起業家を減らす" }).click();
  assert.match(await total.innerText(), /11 人/);
  assert.equal(await page.getByRole("button", { name: "調達経験のある起業家を減らす" }).getAttribute("aria-disabled"), "true");
  for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "調達経験のある起業家を増やす" }).click();
  assert.match(await total.innerText(), /15 人/);
  assert.equal(await page.getByRole("button", { name: "調達経験のある起業家を増やす" }).getAttribute("aria-disabled"), "true");
  for (let i = 0; i < 2; i += 1) await page.getByRole("button", { name: "調達経験のある起業家を減らす" }).click();
  // Drop a type: its 10 points leave the total; restore brings them back.
  await page.getByTestId("draft-v3-remove-lawyer").click();
  assert.match(await total.innerText(), /5 タイプ · 12 人[\s\S]*合計 90/);
  assert.equal(await confirm.getAttribute("aria-disabled"), "true");
  assert.equal(await page.getByRole("button", { name: "弁護士（投資契約）を戻す" }).count(), 1);
  await page.getByRole("button", { name: "弁護士（投資契約）を戻す" }).click();
  assert.match(await total.innerText(), /6 タイプ · 13 人[\s\S]*合計 100/);
  // Drop it again and move its points to VC パートナー → 100 again.
  await page.getByTestId("draft-v3-remove-lawyer").click();
  await page.getByRole("button", { name: "VC パートナーの配点を増やす" }).click();
  await page.getByRole("button", { name: "VC パートナーの配点を増やす" }).click();
  assert.match(await total.innerText(), /合計 100 \/ 100 点/);
  assert.equal(await confirm.getAttribute("aria-disabled"), null);
  assert.deepEqual(writes(calls), [], "adjusting sends nothing");
  await confirm.click();
  await page.waitForFunction(() => (window as unknown as { planNav: { navigation: unknown[] } }).planNav.navigation.length === 1);
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/drafts/draft_v3_fund/confirm"], "confirm, not manual-edit");
  const body = calls.find((call) => call.method === "POST")!.body as { idempotencyKey: string; adjustments: { expectedRevision: string; personTypes: { key: string; targetCount: number; allocation: number }[]; event: { targetCount: number; allocation: number } } };
  assert.ok(body.idempotencyKey);
  assert.deepEqual(body.adjustments, {
    event: { allocation: 10, targetCount: 2 },
    expectedRevision: draft.revision,
    personTypes: [
      { allocation: 10, key: "cfo", targetCount: 1 },
      { allocation: 15, key: "funded_founder", targetCount: 3 },
      { allocation: 10, key: "angel", targetCount: 2 },
      { allocation: 40, key: "vc_partner", targetCount: 3 },
      { allocation: 15, key: "cvc", targetCount: 3 },
    ],
  });
  assert.deepEqual(await page.evaluate(() => (window as unknown as { planNav: { navigation: { href: string }[] } }).planNav.navigation.map((item) => item.href)), ["/task?seg=plan&plan=plan_v3"]);
});

test("confirm without any change sends the same body as before (idempotencyKey only); the last type cannot be dropped", async (t) => {
  const { draft, intake } = fixture("hiring");
  const { page, calls } = await open(t, "/plans/flow/intake_v3_hire", serverFor(intake, draft));
  await page.getByTestId("draft-v3").waitFor();
  const keys = draft.content.personTypes.map((type) => type.key);
  for (const key of keys.slice(1)) await page.getByTestId(`draft-v3-remove-${key}`).click();
  assert.equal(await page.getByTestId(`draft-v3-remove-${keys[0]}`).getAttribute("aria-disabled"), "true", "the only type left cannot be taken off");
  for (const key of keys.slice(1)) await page.getByTestId(`draft-v3-remove-${key}`).click();
  await page.getByTestId("draft-confirm").click();
  await page.waitForFunction(() => (window as unknown as { planNav: { navigation: unknown[] } }).planNav.navigation.length === 1);
  const body = calls.find((call) => call.method === "POST")!.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["idempotencyKey"]);
});

test("grouping follows steps[].personTypeKeys after a hand edit moved a type, not the stale stepKey (SC-05)", async (t) => {
  const { draft, intake } = fixture("fundraising");
  draft.content.steps = draft.content.steps.map((step) => step.key === "step-1" ? { ...step, personTypeKeys: ["cfo"] } : step.key === "step-2" ? { ...step, personTypeKeys: ["funded_founder", ...step.personTypeKeys] } : step);
  assert.equal(draft.content.personTypes.find((type) => type.key === "funded_founder")!.stepKey, "step-1", "the server kept the old stepKey");
  const { page } = await open(t, "/plans/flow/intake_v3_fund", serverFor(intake, draft));
  await page.getByTestId("draft-v3").waitFor();
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="draft-v3-stage-"],[data-testid^="draft-v3-type-"]')].map((node) => node.getAttribute("data-testid")));
  assert.deepEqual(order.slice(0, 5), ["draft-v3-stage-1", "draft-v3-type-cfo", "draft-v3-stage-2", "draft-v3-type-funded_founder", "draft-v3-type-angel"]);
});

test("AI fix from the page: the pill opens the composer in place of the dock, the revision card follows the page", async (t) => {
  const { draft, intake } = fixture("sales");
  const fixed: PlanDraftView = { ...clone(draft), aiFixUsed: 1, turns: clone(v2.draftFixed.turns) };
  const { page, calls } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, draft, (call) => call.method === "POST" && call.path === "/api/agent/plans/drafts/draft_v3_sales/fix" ? ok(fixed) : undefined));
  await page.getByTestId("draft-v3").waitFor();
  assert.equal(await page.getByPlaceholder("直したいこと（あと 3 回）").count(), 0, "the composer waits behind the pill");
  await page.getByTestId("draft-v3-ai").click();
  await page.getByPlaceholder("直したいこと（あと 3 回）").waitFor();
  assert.equal(await page.getByTestId("draft-v3-dock").count(), 0, "the dock steps aside while the composer is open");
  await page.getByLabel("AI に頼む修正").fill("営業は当面 2人でやる");
  await page.getByRole("button", { name: "修正を頼む" }).click();
  await page.getByTestId("draft-turn").waitFor();
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/drafts/draft_v3_sales/fix"]);
  assert.equal(await page.getByTestId("draft-v3").count(), 1, "the page stays above the revision card");
  assert.equal(await page.getByTestId("draft-turn").getByTestId("draft-confirm").count(), 0, "no v2 buttons under the card: the dock confirms");
  assert.match(await page.getByTestId("draft-v3-ai").innerText(), /あと 2 回/);
});

test("redraft (R36b, 用户拍板): the dock button posts idempotencyKey only, the page swaps to the new draft, the AI count drops", async (t) => {
  const { draft, intake } = fixture("sales");
  const next = fixture("hiring").draft;
  const redrafted: PlanDraftView = { ...clone(next), aiFixUsed: 1, draftId: draft.draftId, intakeId: draft.intakeId, revision: "rev_redraft" };
  const { page, calls } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, draft, (call) => call.method === "POST" && call.path === "/api/agent/plans/drafts/draft_v3_sales/redraft" ? ok(redrafted) : undefined));
  await page.getByTestId("draft-v3").waitFor();
  const before = await page.getByTestId("draft-v3-summary").innerText();
  const redraft = page.getByTestId("draft-v3-redraft");
  assert.equal(await redraft.getAttribute("aria-disabled"), null, "open v3 draft with fixes left → enabled");
  await redraft.click();
  await page.waitForFunction((text) => document.querySelector('[data-testid="draft-v3-summary"]')?.textContent !== text, before);
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/drafts/draft_v3_sales/redraft"]);
  assert.deepEqual(Object.keys(calls.find((call) => call.method === "POST")!.body as Record<string, unknown>), ["idempotencyKey"]);
  assert.match(await page.getByTestId("draft-v3-ai").innerText(), /あと 2 回/, "one AI fix spent, shared with 「AI に直してもらう」");
  assert.equal(await page.getByTestId("draft-v3-redrafting").count(), 0, "the generating line leaves with the answer");
  assert.equal(await page.getByTestId("draft-v3-dock").count(), 1);
});

test("redraft with pending adjustments asks first: cancel sends nothing and keeps the changes; confirm sends and the changes are gone", async (t) => {
  const { draft, intake } = fixture("fundraising");
  const redrafted: PlanDraftView = { ...clone(draft), aiFixUsed: 1, revision: "rev_redraft" };
  const { page, calls } = await open(t, "/plans/flow/intake_v3_fund", serverFor(intake, draft, (call) => call.method === "POST" && call.path === "/api/agent/plans/drafts/draft_v3_fund/redraft" ? ok(redrafted) : undefined));
  await page.getByTestId("draft-v3").waitFor();
  await page.getByRole("button", { name: "VC パートナーの配点を増やす" }).click();
  assert.equal(await page.getByTestId("draft-v3-type-vc_partner").getByText("変更あり").count(), 1);
  await page.getByTestId("draft-v3-redraft").click();
  await page.getByRole("alert").getByText("変えた人数と配点は消えます").waitFor();
  await page.getByRole("alert").getByRole("button", { name: "キャンセル" }).click();
  await page.getByRole("alert").waitFor({ state: "detached" });
  assert.deepEqual(writes(calls), [], "cancel → nothing sent");
  assert.equal(await page.getByTestId("draft-v3-type-vc_partner").getByText("変更あり").count(), 1, "the change stays");
  await page.getByTestId("draft-v3-redraft").click();
  await page.getByRole("alert").getByRole("button", { name: "書き直す" }).click();
  await page.waitForFunction(() => /あと 2 回/.test(document.querySelector('[data-testid="draft-v3-ai"]')?.textContent ?? ""));
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/drafts/draft_v3_fund/redraft"]);
  assert.equal(await page.getByTestId("draft-v3-type-vc_partner").getByText("変更あり").count(), 0, "the new draft starts from the AI's values");
  assert.match(await page.getByTestId("draft-v3-total").innerText(), /合計 100 \/ 100 点/);
});

test("redraft is off when the AI fixes are used up or after a manual edit; a failed attempt shows the retry card and spends nothing", async (t) => {
  const { draft, intake } = fixture("sales");
  const usedUp: PlanDraftView = { ...clone(draft), aiFixUsed: draft.aiFixLimit };
  const { page: pageA } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, usedUp));
  await pageA.getByTestId("draft-v3").waitFor();
  assert.equal(await pageA.getByTestId("draft-v3-redraft").getAttribute("aria-disabled"), "true", "no fixes left → off");
  const edited: PlanDraftView = { ...clone(draft), manualEditAvailable: false };
  const { page: pageB } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, edited));
  await pageB.getByTestId("draft-v3").waitFor();
  assert.equal(await pageB.getByTestId("draft-v3-redraft").getAttribute("aria-disabled"), "true", "manual edit used → off (the server would answer DRAFT_CLOSED)");
  const { page: pageC, calls } = await open(t, "/plans/flow/intake_v3_sales", serverFor(intake, draft, (call) => call.method === "POST" && call.path === "/api/agent/plans/drafts/draft_v3_sales/redraft" ? { body: { error: { code: "SERVICE_UNAVAILABLE", context: { reason: "AI_FAILED" }, message: "ai" }, success: false }, status: 503 } : undefined));
  await pageC.getByTestId("draft-v3").waitFor();
  await pageC.getByTestId("draft-v3-redraft").click();
  await pageC.getByText("書き直せませんでした").waitFor();
  assert.equal(writes(calls).length, 1);
  assert.match(await pageC.getByTestId("draft-v3-ai").innerText(), /あと 3 回/, "nothing spent");
  assert.equal(await pageC.getByTestId("draft-v3-redraft").getAttribute("aria-disabled"), null, "可以再试");
});

test("dark theme renders the v3 page without errors", async (t) => {
  const { draft, intake } = fixture("hiring");
  const { page } = await open(t, "/plans/flow/intake_v3_hire", serverFor(intake, draft), { dark: true });
  await page.getByTestId("draft-v3").waitFor();
  await page.getByTestId("draft-v3-toggle").click();
  await page.getByTestId("draft-v3-more").waitFor();
  if (process.env.R36B_SHOT) { await page.setViewportSize({ height: 3200, width: 390 }); await page.waitForTimeout(300); await page.screenshot({ path: join(process.env.R36B_SHOT, "rnw-hire-dark.png") }); }
});
