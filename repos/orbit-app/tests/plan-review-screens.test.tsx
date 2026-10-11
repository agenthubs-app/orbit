import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { PlanLegacyDetail, PlanQuotaResponse, PlanReviewView, PlanV2Detail, PlanV2SummaryResponse } from "../src/api/contract/plan-v2";
import { nativeUiStubs } from "./helpers/native-ui-stubs";
// The server side of the plan v2 routes, in mock mode (in-memory demo world). A test
// may read ../orbits; it never ships in the App bundle.
import { createPlanFlowHandlers } from "../../orbits/features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../orbits/features/plans/v2/handlers";

// R25 (UI-SPEC「概要按钮接线」「見直し页」「達成 → 完成页」「目标下拉」「以前のプラン」):
// the App screens rendered for real with react-native-web in Chromium. Every request
// goes to the orbits plan v2 route handlers themselves (mock mode, a fresh demo world
// per test), so quota, review turns, toggles and scores are the server's own; a test
// may rewrite one answer to reach a case the demo world does not have (two active
// goals, a v1 plan, an AI failure). Every request is recorded, so tests can assert what
// was written and that opening a page writes nothing.
const root = new URL("..", import.meta.url).pathname;
const SHOTS = "/Users/li/orbit-sprint-evidence/redesign/R25/run-01/app";

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; body: unknown };
type Rewrite = (call: Call, reply: Reply | null) => Reply | null | undefined;
type Server = (call: Call) => Promise<Reply | null>;

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, reason: string): Reply => ({ body: { error: { code: "CONFLICT", context: { reason }, message: reason }, success: false }, status });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const PLAN = "demo-plan-series-a";
const PAID = /ご利用プラン|料金|Pro に|有料|アップグレード/;
let actorSequence = 0;

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanSegment } from "./src/screens/plan/PlanSegment";
import { PlanReviewScreen } from "./src/screens/plan/PlanReviewScreen";
import { PlanDoneScreen } from "./src/screens/plan/PlanDoneScreen";
import { PlanLegacyScreen } from "./src/screens/plan/PlanLegacy";
import { PlanManualEditScreen } from "./src/screens/plan/PlanManualEditScreen";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
function Root() {
  const [path, setPath] = React.useState(window.planNav.stack[window.planNav.stack.length - 1]);
  window.planNav.setPath = setPath;
  const review = path.match(/^\\/plans\\/([^/?]+)\\/review/);
  const done = path.match(/^\\/plans\\/([^/?]+)\\/done/);
  const legacy = path.match(/^\\/plans\\/legacy\\/([^/?]+)/);
  const edit = path.match(/^\\/plans\\/drafts\\/([^/?]+)\\/edit/);
  const screen = legacy ? <PlanLegacyScreen key={path} planId={decodeURIComponent(legacy[1])} />
    : review ? <PlanReviewScreen key={path} planId={decodeURIComponent(review[1])} />
    : done ? <PlanDoneScreen key={path} planId={decodeURIComponent(done[1])} />
    : edit ? <PlanManualEditScreen key={path} draftId={decodeURIComponent(edit[1])} />
    : path.startsWith("/task") ? <PlanSegment key={path} />
    : <div data-testid="elsewhere">{path}</div>;
  return <ToastProvider><UiPortalHost>{screen}</UiPortalHost></ToastProvider>;
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
    plugins: [nativeUiStubs, { name: "plan-review", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "plan-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "plan-native" }, () => ({ contents: `
import * as RNW from "react-native-web";
export * from "react-native-web";
export const findNodeHandle = (instance) => { if (instance && instance.setAttribute) instance.setAttribute("data-focus-target", "1"); return instance; };
export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => Boolean(window.reduceMotion), addEventListener: () => ({ remove() {} }), setAccessibilityFocus: () => {} };
export const Linking = { ...RNW.Linking, openURL: async (url) => { (window.opened ??= []).push(url); } };
`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "expo-router", namespace: "plan-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "plan-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor", cookieHeader: "c", session: { actorId: "actor" } });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      // A tiny stack: push adds, replace swaps the top, back pops; the search params come from the top path.
      plugin.onLoad({ filter: /^expo-router$/, namespace: "plan-stub" }, () => ({ contents: `
import React from "react";
const nav = () => window.planNav;
const top = () => nav().stack[nav().stack.length - 1];
const show = () => { nav().setPath?.(top()); };
const router = {
  push: (href) => { nav().navigation.push({ method: "push", href }); nav().stack.push(href); show(); },
  replace: (href) => { nav().navigation.push({ method: "replace", href }); nav().stack[nav().stack.length - 1] = href; show(); },
  back: () => { nav().navigation.push({ method: "back" }); nav().stack.pop(); show(); },
  dismissAll: () => nav().navigation.push({ method: "dismissAll" }),
  canGoBack: () => nav().stack.length > 1,
  setParams: (params) => nav().navigation.push({ method: "setParams", params }),
};
window.planRouter = router;
export const useRouter = () => router;
export const usePathname = () => top().split("?")[0];
export const useIsFocused = () => true;
export const useLocalSearchParams = () => Object.fromEntries(new URLSearchParams(top().split("?")[1] ?? ""));
export const useGlobalSearchParams = () => ({});
export const Redirect = ({ href }) => { React.useEffect(() => { router.replace(href); }, [href]); return null; };
export const Stack = { Screen: () => null };
`, loader: "js", resolveDir: root }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

/** The orbits plan v2 + flow handlers in mock mode, one fresh demo world per actor. */
function planServer(actorId: string): Server {
  const dependencies = { resolveActor: async () => ({ id: actorId }) as never, resolveMode: () => "mock" as const };
  const plans = createPlanV2Handlers(dependencies);
  const flow = createPlanFlowHandlers(dependencies);
  type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const routes: [string, RegExp, Handler, string[]][] = [
    ["GET", /^\/api\/agent\/plans\/v2\/summary$/, plans.summary, []],
    ["GET", /^\/api\/agent\/plans\/v2\/quota$/, flow.quota, []],
    ["GET", /^\/api\/agent\/plans\/legacy$/, plans.legacyList, []],
    ["GET", /^\/api\/agent\/plans\/legacy\/([^/]+)$/, plans.legacyDetail, ["planId"]],
    ["GET", /^\/api\/agent\/plans\/intakes$/, flow.listIntakes, []],
    ["POST", /^\/api\/agent\/plans\/intakes$/, flow.createIntake, []],
    ["POST", /^\/api\/agent\/plans\/v2\/pending\/([^/]+)\/accept$/, plans.acceptPending, ["id"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)$/, plans.detail, ["planId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/open$/, plans.open, ["planId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/reviews$/, flow.startReview, ["planId"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)\/reviews\/current$/, flow.currentReview, ["planId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/manual-edit$/, flow.openManualEdit, ["planId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/achieve$/, flow.achieve, ["planId"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)\/achievement$/, plans.achievement, ["planId"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)\/next-goals$/, flow.nextGoals, ["planId"]],
    ["PATCH", /^\/api\/agent\/plans\/v2\/([^/]+)\/goal$/, flow.editGoal, ["planId"]],
    ["GET", /^\/api\/agent\/plans\/drafts\/([^/]+)$/, flow.getDraft, ["draftId"]],
    ["GET", /^\/api\/agent\/plans\/drafts\/([^/]+)\/review$/, flow.getReview, ["draftId"]],
    ["POST", /^\/api\/agent\/plans\/drafts\/([^/]+)\/review\/fix$/, flow.reviewFix, ["draftId"]],
    ["POST", /^\/api\/agent\/plans\/drafts\/([^/]+)\/changes\/([^/]+)\/toggle$/, flow.toggleChange, ["draftId", "changeId"]],
    ["POST", /^\/api\/agent\/plans\/drafts\/([^/]+)\/manual-edit$/, flow.manualEdit, ["draftId"]],
    ["POST", /^\/api\/agent\/plans\/drafts\/([^/]+)\/confirm$/, flow.confirm, ["draftId"]],
  ];
  return async (call: Call): Promise<Reply | null> => {
    const path = call.path.split("?")[0]!;
    for (const [method, pattern, handler, keys] of routes) {
      const match = call.method === method ? pattern.exec(path) : null;
      if (!match) continue;
      const params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1]!)]));
      const request = new Request(`http://local.test${call.path}`, { body: call.body === null ? undefined : JSON.stringify(call.body), headers: { "content-type": "application/json", ...call.headers }, method: call.method });
      const response = await handler(request, { params: Promise.resolve(params) });
      return { body: await response.json(), status: response.status };
    }
    return null;
  };
}

const HEADERS = { "x-orbit-lang": "ja", "x-orbit-platform": "app" };
/** Drives the same server directly (for setting up a case before the page opens). */
const direct = async <T,>(server: Server, method: string, path: string, body: unknown = null): Promise<{ status: number; data: T }> => {
  const reply = (await server({ body, headers: HEADERS, method, path }))!;
  return { data: (reply.body as { data: T }).data, status: reply.status };
};

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, options: { dark?: boolean; rewrite?: Rewrite; intercept?: (call: Call) => Reply | undefined; stack?: string[]; height?: number; prepare?: (server: Server) => Promise<void> } = {}): Promise<{ page: Page; calls: Call[]; server: Server }> {
  const page = await browser.newPage({ viewport: { width: 390, height: options.height ?? 844 }, colorScheme: options.dark ? "dark" : "light" });
  const errors: string[] = [];
  const calls: Call[] = [];
  const server = planServer(`actor-r25-${process.pid}-${(actorSequence += 1)}`);
  if (options.prepare) await options.prepare(server);
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.exposeFunction("planServer", async (raw: string) => {
    const call = JSON.parse(raw) as Call;
    calls.push(call);
    // An intercepted call never reaches the server (e.g. an AI failure that must not use a review).
    const early = options.intercept?.(call);
    if (early) return early;
    const base = await server(call);
    const reply = options.rewrite ? options.rewrite(call, base) ?? base : base;
    return reply ?? { body: { error: { code: "NOT_FOUND", message: "unexpected " + call.method + " " + call.path }, success: false }, status: 404 };
  });
  const stack = options.stack ?? [path];
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.reduceMotion=true;window.planNav=${JSON.stringify({ navigation: [], stack })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { calls, page, server };
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
const navigation = (page: Page) => page.evaluate(() => (window as unknown as { planNav: { navigation: { method: string; href?: string }[]; stack: string[] } }).planNav);
const startReview = async (server: Server) => (await direct<PlanReviewView>(server, "POST", `/api/agent/plans/v2/${PLAN}/reviews`, { idempotencyKey: `prep-${Math.random()}` })).data;
const sendReview = (server: Server, draftId: string, text: string) => direct<PlanReviewView>(server, "POST", `/api/agent/plans/drafts/${draftId}/review/fix`, { idempotencyKey: `prep-${Math.random()}`, premise: [], text });
const useAllReviews = async (server: Server) => {
  const view = await startReview(server);
  for (let n = 0; n < 3; n += 1) await sendReview(server, view.draft.draftId, "そのままでいい");
  return view;
};
/** Two active goals and one achieved one in the summary (the demo world has one goal). */
const withGoals: Rewrite = (call, reply) => {
  if (call.method === "POST" && /\/v2\/demo-plan-second\/open$/.test(call.path)) return ok({ planId: "demo-plan-second" });
  if (call.method === "GET" && call.path.endsWith("/v2/quota") && reply) return ok({ ...(reply.body as { data: PlanQuotaResponse }).data, activeGoals: 2 });
  if (call.method === "GET" && call.path === "/api/agent/plans/intakes" && reply) return ok({ ...(reply.body as { data: object }).data, activeGoals: 2 });
  if (call.method === "GET" && call.path.endsWith("/v2/summary") && reply) {
    const body = clone(reply.body) as { data: PlanV2SummaryResponse };
    body.data = { ...body.data, goals: [...body.data.goals,
      { goal: "製造業の新規顧客開拓", goalKind: "sales", planId: "demo-plan-second", status: "active", talkedPeople: 14, total: 72 },
      { goal: "シード調達（5,000万円）", goalKind: "fundraising", planId: "demo-plan-old", status: "achieved", talkedPeople: 9, total: 104 }] };
    return { ...reply, body };
  }
  return undefined;
};
const LEGACY: PlanLegacyDetail = {
  actionsDone: 3, actionsTotal: 7, analysisSummary: "既存顧客の紹介から商談をつくる流れが強み。展示会経由の新規は弱い。", archivedAt: null, goal: "製造業向けの新規顧客を 5社増やす", needs: 4, planId: "v1-plan-1", startsOn: "2026-06-02", status: "active",
  items: [
    { kind: "action", phase: "準備", status: "done", title: "事例資料を 2本つくる" },
    { kind: "action", phase: "p2", status: "todo", title: "展示会のリストから 10社に連絡" },
    { kind: "network_need", phase: null, status: "open", title: "製造業 DX の購買担当者" },
    { kind: "info", phase: null, status: "skipped", title: "補助金の締切" },
    { kind: "event", phase: null, status: "dismissed", title: "ものづくり DX 展" },
  ],
};
/** No v2 goal, one v1 plan (the demo world has a v2 goal and no v1). */
const withLegacyOnly: Rewrite = (call, reply) => {
  if (call.method === "GET" && call.path.endsWith("/v2/summary")) return ok({ current: null, goals: [] });
  if (call.method === "GET" && call.path === "/api/agent/plans/intakes" && reply) return ok({ ...(reply.body as { data: object }).data, activeGoals: 0 });
  if (call.method === "GET" && call.path === "/api/agent/plans/legacy") {
    const { analysisSummary, items, ...item } = LEGACY;
    void analysisSummary; void items;
    return ok({ plans: [item] });
  }
  if (call.method === "GET" && call.path === "/api/agent/plans/legacy/v1-plan-1") return ok(LEGACY);
  return undefined;
};

test("overview buttons: no 「まもなく」; 方案を見直す reads the quota only, then opens the review without using one", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  await page.getByRole("button", { name: "方案を見直す" }).first().click();
  const sheet = page.getByTestId("review-entry");
  await sheet.getByText("方案を見直しますか？").waitFor();
  await sheet.getByText("あと 3 回").waitFor();
  assert.equal(await sheet.getByTestId("quota-left").count(), 3);
  assert.equal(await sheet.getByTestId("quota-used").count(), 0);
  await sheet.getByText(/毎月1日に 3回へ戻ります（次は \d+月\d+日）/).waitFor();
  const since = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data.sinceConfirmed!;
  await sheet.getByText(`確定以降の記録：話した ${since.talkedPeople}人 · イベント ${since.events}回 · Step 完了 ${since.stepsDone}`).waitFor();
  assert.equal(await page.getByText("まもなく使えます").count(), 0);
  assert.equal(await page.getByText(PAID).count(), 0);
  assert.deepEqual(writes(calls), [], "opening the sheet writes nothing");
  assert.ok(calls.some((call) => call.path === "/api/agent/plans/v2/quota"));
  await sheet.getByRole("button", { name: "iOrbit で見直す" }).click();
  await page.getByTestId("premise-card").waitFor();
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/reviews`]);
  assert.deepEqual((await navigation(page)).navigation, [{ href: `/plans/${PLAN}/review`, method: "push" }]);
  assert.equal((await direct<PlanQuotaResponse>(server, "GET", "/api/agent/plans/v2/quota")).data.reviewLeftThisMonth, 3, "opening a review uses none");
});

test("review: AI marks, edit in place, send uses one (3 → 2); ✕ sends exactly one toggle and shows the server's plan", async (t) => {
  const { page, calls, server } = await open(t, `/plans/${PLAN}/review`, { prepare: async (server) => { await startReview(server); } });
  const card = page.getByTestId("premise-card");
  await card.waitFor();
  await page.getByRole("progressbar", { name: "進み具合：前提" }).waitFor();
  const marked = page.getByTestId("premise-marked");
  assert.equal(await marked.count(), 1);
  await marked.getByText("変わったかも", { exact: true }).waitFor();
  await marked.getByText("最近の記録で変わったかもしれません。").waitFor();
  await marked.getByText("根拠：調達経験のある起業家：+5").waitFor();
  assert.deepEqual(writes(calls), [], "opening the page writes nothing");
  // Edit a row in place: the old value is struck through, the new one shown.
  await page.getByRole("button", { name: "直近の数字を直す" }).click();
  const input = page.getByLabel("直近の数字の新しい内容");
  await input.fill("ARR 1億円の見込み（年内）· 前年比 2.4倍");
  await page.getByLabel("ほかに変わったこと（任意）").click();
  await card.getByText("1行を直しました").waitFor();
  await card.getByText("ARR 8,000万円 · 前年比 2.4倍").waitFor();
  await page.getByText("見直し 今月あと 3 → 2回 · 変更がなくても 1回").waitFor();
  await page.getByLabel("ほかに変わったこと（任意）").fill("CVC にも並行で当たりたい");
  await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click();
  const turn = page.getByTestId("review-turn");
  await turn.waitFor();
  await turn.getByText("見直し · AI 修正を反映（今月 1 / 3 回目）").waitFor();
  await page.getByText("あと 2 回").first().waitFor();
  const fix = calls.find((call) => call.path.endsWith("/review/fix"))!.body as { premise: { key: string; value: string }[]; text: string };
  assert.deepEqual(fix.premise, [{ key: "F2", value: "ARR 1億円の見込み（年内）· 前年比 2.4倍" }]);
  assert.equal(fix.text, "CVC にも並行で当たりたい");
  await turn.getByText("変わらない点：見立てと結論 · 人物タイプと配点").waitFor();
  await turn.getByText(/^獲得済み \d+ → \d+/).waitFor();
  // ✕ one change: one request, the answer is the server's rebuilt plan.
  const before = writes(calls).length;
  await turn.getByRole("radio", { name: "「Step 1 の目安」を採用しない" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="「Step 1 の目安」を採用しない"]')?.getAttribute("aria-checked") === "true");
  assert.deepEqual(writes(calls).slice(before), [`POST /api/agent/plans/drafts/${calls.find((call) => call.path.endsWith("/review/fix"))!.path.split("/")[5]}/changes/t1-1/toggle`]);
  const view = await direct<PlanReviewView>(server, "GET", `/api/agent/plans/v2/${PLAN}/reviews/current`);
  assert.equal(view.data.draft.turns[0]!.changes[0]!.accepted, false);
  assert.equal(view.data.draft.content.steps[0]!.doneCriteria, view.data.draft.originContent.steps[0]!.doneCriteria, "✕ puts the old text back");
  await page.getByRole("button", { name: "手動で編集（1回）" }).waitFor();
  await page.getByRole("button", { name: "この内容で確定" }).waitFor();
  await page.getByRole("button", { name: "もう一度直す（あと 2 回）" }).waitFor();
  assert.equal(await page.getByText(PAID).count(), 0);
});

test("used up: the input is grey, 「わかりました」, what still works — and no paid entry", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/review`, { prepare: async (server) => { await useAllReviews(server); } });
  await page.getByTestId("review-used-up").waitFor();
  await page.getByText("⏳ 今月の見直しは使い切りました").waitFor();
  await page.getByText("面談の記録・加点・スキップは、これまでどおり使えます。獲得済みの点も、そのまま増え続けます。").waitFor();
  await page.getByText(/^3 \/ 3 回 · \d+月\d+日に戻ります（あと \d+日）$/).waitFor();
  assert.equal(await page.getByLabel("ほかに変わったこと（任意）").count(), 0, "no input once used up");
  assert.equal(await page.getByRole("button", { name: /前提を送って|もう一度直す/ }).count(), 0);
  await page.getByText("今月 3 / 3 回目").first().waitFor();
  await page.getByRole("button", { name: "このままにする" }).waitFor();
  assert.equal(await page.getByText(PAID).count(), 0);
  assert.deepEqual(writes(calls), []);
  // The entry sheet from the overview says the same, with 「わかりました」 as the main button.
  const overview = await open(t, "/task?seg=plan", { prepare: async (server) => { await useAllReviews(server); } });
  await overview.page.getByTestId("plan-overview").waitFor();
  await overview.page.getByRole("button", { name: "方案を見直す" }).first().click();
  await overview.page.getByTestId("review-entry").getByTestId("review-used-up").waitFor();
  await overview.page.getByRole("button", { name: "わかりました" }).click();
  assert.equal(await overview.page.getByText(PAID).count(), 0);
  assert.deepEqual(writes(overview.calls), []);
});

test("STALE: confirming after the plan changed elsewhere offers 「最新を読み込む」 (a fresh review)", async (t) => {
  const { page, calls, server } = await open(t, `/plans/${PLAN}/review`, { prepare: async (server) => { await startReview(server); } });
  await page.getByTestId("premise-card").waitFor();
  await page.getByLabel("ほかに変わったこと（任意）").fill("CVC も");
  await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click();
  await page.getByTestId("review-turn").waitFor();
  const detail = await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`);
  await direct(server, "PATCH", `/api/agent/plans/v2/${PLAN}/goal`, { expectedRevision: detail.data.revision, goalText: "シリーズA 資金調達（5億円）", idempotencyKey: "elsewhere", mode: "save_only" });
  await page.getByRole("button", { name: "この内容で確定" }).click();
  await page.getByTestId("review-stale").getByText("ほかの画面でプランが変わりました。最新のプランで見直しをやり直します。").waitFor();
  await page.getByRole("button", { name: "最新を読み込む" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=review-turn]"));
  assert.deepEqual(writes(calls).filter((line) => line.endsWith("/reviews") || line.endsWith("/confirm")).map((line) => line.replace(/drafts\/[^/]+/, "drafts/:id")), [
    "POST /api/agent/plans/drafts/:id/confirm",
    `POST /api/agent/plans/v2/${PLAN}/reviews`,
  ]);
  const fresh = await direct<PlanReviewView>(server, "GET", `/api/agent/plans/v2/${PLAN}/reviews/current`);
  assert.equal(fresh.data.draft.turns.length, 0, "the fresh review starts on the latest plan");
});

test("AI failure: 「もう一度」 and the count is not used", async (t) => {
  let failOnce = true;
  const { page, calls, server } = await open(t, `/plans/${PLAN}/review`, {
    prepare: async (server) => { await startReview(server); },
    intercept: (call) => {
      if (call.method === "POST" && call.path.endsWith("/review/fix") && failOnce) { failOnce = false; return fail(502, "AI_FAILED"); }
      return undefined;
    },
  });
  await page.getByTestId("premise-card").waitFor();
  await page.getByLabel("ほかに変わったこと（任意）").fill("CVC も");
  await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click();
  // 模拟器走查：失败提示在发送按钮旁（底部栏里），不在正文底部。
  await page.getByTestId("review-footer").getByText("修正案をつくれませんでした").waitFor();
  await page.getByTestId("review-footer").getByText("見直しの回数は減っていません。もう一度お試しください。").waitFor();
  assert.equal((await direct<PlanQuotaResponse>(server, "GET", "/api/agent/plans/v2/quota")).data.reviewLeftThisMonth, 3);
  await page.getByRole("button", { name: "もう一度" }).click();
  await page.getByTestId("review-turn").waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/review/fix")).length, 2);
  assert.equal((await direct<PlanQuotaResponse>(server, "GET", "/api/agent/plans/v2/quota")).data.reviewLeftThisMonth, 2);
});

test("manual edit from the overview: a review draft in the editor; saving returns with 「方案を更新しました」, then it is greyed", async (t) => {
  const { page, calls } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  await page.getByRole("button", { name: "手動で編集" }).click();
  await page.getByRole("progressbar", { name: "進み具合：手動編集" }).waitFor();
  await page.getByText("見直しごとに 1回 · 保存すると確定").waitFor();
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/manual-edit`]);
  const pushed = (await navigation(page)).navigation[0]!;
  assert.match(pushed.href!, /^\/plans\/drafts\/[^/]+\/edit$/);
  await page.getByRole("button", { name: "保存して確定" }).click();
  await page.getByText("方案を更新しました").waitFor();
  await page.getByTestId("plan-overview").waitFor();
  assert.equal((await navigation(page)).stack.at(-1), `/task?seg=plan&plan=${PLAN}`);
  await page.getByText("手動編集は使いました · 見直すと 1回つきます").waitFor();
  assert.equal(await page.getByRole("button", { name: "手動で編集" }).isDisabled(), true);
});

test("achieve: the question → 完了 (three numbers, best move, skipped) → next goals → a new intake (source next_goal)", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const summary = await direct<PlanV2SummaryResponse>(server, "GET", "/api/agent/plans/v2/summary");
  const goal = summary.data.goals[0]!;
  await page.getByRole("button", { name: "目標を達成した" }).click();
  await page.getByText("目標を達成したとして記録しますか？").waitFor();
  await page.getByText(`スコア ${goal.total} · 話した人 ${goal.talkedPeople}人で確定し、このプランを完了にします。達成にすると点数はこれ以上増えません。完了したプランはいつでも見返せます。`).waitFor();
  assert.deepEqual(writes(calls), [], "asking writes nothing");
  await page.getByRole("button", { name: "達成を記録" }).click();
  await page.getByTestId("done-hero").waitFor();
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/achieve`]);
  assert.equal((calls.find((call) => call.path.endsWith("/achieve"))!.body as { expectedRevision: number }).expectedRevision, (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data.revision);
  const hero = page.getByTestId("done-hero");
  await hero.getByText(`${goal.goal}を達成`).waitFor();
  await hero.getByLabel(`スコア ${goal.total}`).waitFor();
  await hero.getByLabel(`話した人 ${goal.talkedPeople}`).waitFor();
  await page.getByTestId("best-move").getByText("VC パートナーとの対話（20 点）").waitFor();
  await page.getByTestId("skipped-areas").getByText("スキップした分野：弁護士（投資契約）").waitFor();
  // R25 review m3: looking back never asks for candidates; only 「次の目標を決める」 does.
  assert.equal(calls.filter((call) => call.path.endsWith("/next-goals")).length, 0);
  await page.getByRole("button", { name: "次の目標を決める" }).click();
  const candidates = page.getByTestId("next-candidate");
  await candidates.first().waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/next-goals")).length, 1);
  assert.equal(await candidates.count(), 2);
  await page.getByTestId("next-self").waitFor();
  await candidates.nth(1).click();
  await page.getByRole("button", { name: "この目標で具体化する" }).click();
  await page.getByTestId("elsewhere").waitFor();
  const intake = calls.find((call) => call.method === "POST" && call.path === "/api/agent/plans/intakes")!.body as { goalText: string; goalKind: string; source: string };
  assert.deepEqual({ goalKind: intake.goalKind, goalText: intake.goalText, source: intake.source }, { goalKind: "hiring", goalText: "次は採用に取り組む", source: "next_goal" });
  assert.match((await navigation(page)).stack.at(-1)!, /^\/plans\/flow\/[^/]+$/);
  assert.equal(await page.getByText(PAID).count(), 0);
});

test("done: 自分で決める opens the goal input; with two active goals the limit is explained and the choice is disabled", async (t) => {
  const self = await open(t, `/plans/${PLAN}/done`, { prepare: async (server) => { const detail = await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`); await direct(server, "POST", `/api/agent/plans/v2/${PLAN}/achieve`, { expectedRevision: detail.data.revision, idempotencyKey: "a" }); } });
  await self.page.getByRole("button", { name: "次の目標を決める" }).click();
  await self.page.getByTestId("next-self").click();
  await self.page.getByRole("button", { name: "この目標で具体化する" }).click();
  assert.deepEqual((await navigation(self.page)).navigation.at(-1), { href: "/task?seg=plan&new=1", method: "replace" });
  const full = await open(t, `/plans/${PLAN}/done`, {
    prepare: async (server) => { const detail = await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`); await direct(server, "POST", `/api/agent/plans/v2/${PLAN}/achieve`, { expectedRevision: detail.data.revision, idempotencyKey: "a" }); },
    rewrite: withGoals,
  });
  await full.page.getByRole("button", { name: "次の目標を決める" }).click();
  await full.page.getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.equal(await full.page.getByRole("button", { name: "この目標で具体化する" }).isDisabled(), true);
  assert.equal(await full.page.getByText(PAID).count(), 0);
  assert.deepEqual(writes(full.calls), []);
});

test("goal switcher: score, people, tick; switching calls open; achieved → 完了; 以前のプラン only with v1; add greyed at two", async (t) => {
  const { page, calls } = await open(t, "/task?seg=plan", { rewrite: withGoals });
  await page.getByTestId("plan-overview").waitFor();
  await page.getByText("目標 1 / 2").waitFor();
  await page.getByTestId("goal-switcher-open").click();
  const sheet = page.getByTestId("goal-switcher");
  await sheet.waitFor();
  const rows = sheet.getByTestId("goal-row");
  assert.equal(await rows.count(), 2);
  assert.equal(await rows.first().getAttribute("aria-checked"), "true");
  await rows.nth(1).getByText("スコア 72 · 話した人 14").waitFor();
  await sheet.getByText("完了した目標 1件").waitFor();
  assert.equal(await sheet.getByTestId("goal-legacy").count(), 0, "no v1 plan, no 以前のプラン");
  assert.equal(await sheet.getByRole("button", { name: "目標を追加" }).isDisabled(), true);
  await sheet.getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.equal(await page.getByText(PAID).count(), 0);
  const reads = calls.filter((call) => call.path.endsWith("/v2/summary")).length;
  await rows.nth(1).click();
  for (let tries = 0; tries < 60 && calls.filter((call) => call.path.endsWith("/v2/summary")).length <= reads; tries += 1) await page.waitForTimeout(50);
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/v2/demo-plan-second/open"]);
  assert.ok(calls.filter((call) => call.path.endsWith("/v2/summary")).length > reads, "the segment reads the summary again (home follows)");
  await page.getByTestId("goal-switcher-open").click();
  await page.getByTestId("goal-achieved").click();
  assert.deepEqual((await navigation(page)).navigation.at(-1), { href: "/plans/demo-plan-old/done", method: "push" });
  // With a v1 plan, 以前のプラン sits at the bottom of the sheet.
  const legacy = await open(t, "/task?seg=plan", { rewrite: (call, reply) => (call.path === "/api/agent/plans/legacy" ? ok({ plans: [{ actionsDone: 3, actionsTotal: 7, archivedAt: "2026-10-01T00:00:00.000Z", goal: LEGACY.goal, needs: 4, planId: "v1-plan-1", startsOn: "2026-06-02", status: "archived" }] }) : undefined) });
  await legacy.page.getByTestId("plan-overview").waitFor();
  await legacy.page.getByTestId("goal-switcher-open").click();
  await legacy.page.getByTestId("goal-legacy").getByText(LEGACY.goal).click();
  assert.deepEqual((await navigation(legacy.page)).navigation.at(-1), { href: "/plans/legacy/v1-plan-1", method: "push" });
});

test("goal edit: unchanged cannot be saved; a change asks 作り直す / 目標だけ保存 / キャンセル", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const detail = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  const openEdit = async () => {
    await page.getByTestId("goal-switcher-open").click();
    await page.getByRole("button", { name: "この目標を編集" }).click();
    await page.getByTestId("goal-edit").waitFor();
  };
  await openEdit();
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  await page.getByTestId("goal-edit").getByLabel("目標", { exact: true }).fill("シリーズA 資金調達（5億円）");
  await page.getByText(`元：${detail.goal}`).waitFor();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByText("方案を作り直しますか？").waitFor();
  await page.getByText("獲得済みの点・面談の記録・スキップはそのまま残ります").waitFor();
  await page.getByText("修正案を送るときに見直しを 1回使います（今月あと 3 回）").waitFor();
  await page.getByRole("button", { name: "キャンセル" }).last().click();
  assert.deepEqual(writes(calls), [], "キャンセル writes nothing");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "目標だけ保存" }).click();
  await page.getByText("目標を保存しました").waitFor();
  const saveOnly = calls.find((call) => call.method === "PATCH")!.body as { mode: string; goalText: string; expectedRevision: number };
  assert.deepEqual({ expectedRevision: saveOnly.expectedRevision, goalText: saveOnly.goalText, mode: saveOnly.mode }, { expectedRevision: detail.revision, goalText: "シリーズA 資金調達（5億円）", mode: "save_only" });
  const after = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  assert.deepEqual(after.content.personTypes.map((type) => type.allocation), detail.content.personTypes.map((type) => type.allocation), "目標だけ保存 keeps the points");
  await page.getByText("シリーズA 資金調達（5億円）").first().waitFor();
  // 作り直す: saves and opens the review page on the rebuild draft.
  await openEdit();
  await page.getByTestId("goal-edit").getByLabel("目標", { exact: true }).fill("シリーズA 資金調達（6億円）");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "方案を作り直す" }).click();
  await page.getByTestId("premise-card").waitFor();
  assert.equal((calls.filter((call) => call.method === "PATCH").at(-1)!.body as { mode: string }).mode, "save_and_rebuild");
  assert.deepEqual((await navigation(page)).navigation.at(-1), { href: `/plans/${PLAN}/review`, method: "push" });
  await page.getByTestId("premise-card").getByText("シリーズA 資金調達（6億円）").waitFor();
  assert.equal((await direct<PlanQuotaResponse>(server, "GET", "/api/agent/plans/v2/quota")).data.reviewLeftThisMonth, 3, "rebuilding opens a review; only sending uses one");
});

test("new=1 opens the goal input directly; with two active goals it explains the limit instead", async (t) => {
  const { page, calls } = await open(t, "/task?seg=plan&new=1");
  await page.getByText("何を達成したいですか？").waitFor();
  assert.equal(await page.getByTestId("plan-overview").count(), 0);
  await page.getByRole("button", { name: "プランに戻る" }).click();
  await page.getByTestId("plan-overview").waitFor();
  assert.deepEqual(writes(calls), []);
  const full = await open(t, "/task?seg=plan&new=1", { rewrite: withGoals });
  await full.page.getByTestId("new-goal-full").waitFor();
  await full.page.getByText("同時に進められる目標は 2 つまでです。").waitFor();
  assert.equal(await full.page.getByLabel("目標", { exact: true }).count(), 0, "no input at the limit");
  assert.equal(await full.page.getByText(PAID).count(), 0);
});

test("以前のプラン: the card replaces the goal input for a v1 user; the page is read only", async (t) => {
  const { page, calls } = await open(t, "/task?seg=plan", { rewrite: withLegacyOnly });
  const card = page.getByTestId("legacy-card");
  await card.waitFor();
  await card.getByText(LEGACY.goal).waitFor();
  await card.getByText("2026年6月2日 開始").waitFor();
  await card.getByText("Step 3 / 7").waitFor();
  await card.getByText("会いたい人 4").waitFor();
  assert.equal(await page.getByText("何を達成したいですか？").count(), 0);
  await card.getByRole("button", { name: "新しいプランを作る" }).click();
  await page.getByText("何を達成したいですか？").waitFor();
  await page.getByRole("button", { name: "プランに戻る" }).click();
  await page.getByTestId("legacy-row").click();
  await page.getByTestId("legacy-detail").waitFor();
  assert.deepEqual((await navigation(page)).navigation.at(-1), { href: "/plans/legacy/v1-plan-1", method: "push" });
  const groups = page.getByTestId("legacy-group");
  assert.equal(await groups.count(), 4);
  for (const label of ["行動", "会いたい人", "情報", "イベント"]) await page.getByRole("heading", { name: label }).waitFor();
  await groups.first().getByText("完了", { exact: true }).waitFor();
  await groups.first().getByText("未完了", { exact: true }).waitFor();
  // 模拟器走查：旧计划的阶段 id「p2」显示成「フェーズ 2」，其他写法原样。
  await groups.first().getByText("フェーズ 2", { exact: true }).waitFor();
  await groups.first().getByText("準備", { exact: true }).waitFor();
  assert.equal(await groups.first().getByText("p2", { exact: true }).count(), 0);
  await page.getByText(LEGACY.analysisSummary!).waitFor();
  await page.getByText("以前のプランは閲覧のみです。編集や再分析はできません。").waitFor();
  assert.equal(await page.locator("input, textarea").count(), 0, "nothing to edit");
  assert.equal(await page.getByRole("button", { name: /編集|再分析|見直/ }).count(), 0);
  assert.deepEqual(writes(calls), []);
});

test("end to end (mock): overview → 見直し → send → ✕ one → confirm → overview updated", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const before = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  await page.getByRole("button", { name: "方案を見直す" }).first().click();
  await page.getByTestId("review-entry").getByRole("button", { name: "iOrbit で見直す" }).click();
  await page.getByTestId("premise-card").waitFor();
  await page.getByRole("button", { name: "使える時間を直す" }).click();
  await page.getByLabel("使える時間の新しい内容").fill("週 15時間 · 本業と並行");
  await page.getByLabel("ほかに変わったこと（任意）").fill("CVC にも並行で当たりたい");
  await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click();
  await page.getByTestId("review-turn").waitFor();
  await page.getByRole("radio", { name: "「Step 1 の目安」を採用しない" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="「Step 1 の目安」を採用しない"]')?.getAttribute("aria-checked") === "true");
  await page.getByRole("button", { name: "この内容で確定" }).click();
  await page.getByText("方案を更新しました").waitFor();
  await page.getByTestId("plan-overview").waitFor();
  const after = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  assert.equal(after.revision, before.revision + 1, "the plan was updated");
  assert.equal(after.premise.find((row) => row.key === "F7")!.value, "週 15時間 · 本業と並行");
  assert.equal(after.content.steps[0]!.doneCriteria, before.content.steps[0]!.doneCriteria, "the ✕ change was not applied");
  assert.equal(after.score.total, before.score.total, "earned points do not move");
  await page.getByRole("button", { name: "前提を見る" }).click();
  await page.getByTestId("premise-sheet").getByText("週 15時間 · 本業と並行").waitFor();
  assert.equal(after.quota.reviewLeftThisMonth, 2);
  assert.deepEqual(writes(calls).map((line) => line.replace(/drafts\/[^/]+/, "drafts/:id").replace(/changes\/[^/]+/, "changes/:id")), [
    `POST /api/agent/plans/v2/${PLAN}/reviews`,
    "POST /api/agent/plans/drafts/:id/review/fix",
    "POST /api/agent/plans/drafts/:id/changes/:id/toggle",
    "POST /api/agent/plans/drafts/:id/confirm",
  ]);
  for (const call of calls) assert.equal(call.headers["x-orbit-platform"], "app");
});

test("optional server field: PlanV2Detail.sinceConfirmed gives the entry sheet its counts", async (t) => {
  const overview = await open(t, "/task?seg=plan", { rewrite: (call, reply) => (call.method === "GET" && reply && call.path === `/api/agent/plans/v2/${PLAN}`
    ? ok({ ...(reply.body as { data: object }).data, sinceConfirmed: { events: 2, stepsDone: 1, talkedPeople: 5 } }) : undefined) });
  await overview.page.getByTestId("plan-overview").waitFor();
  await overview.page.getByRole("button", { name: "方案を見直す" }).first().click();
  await overview.page.getByTestId("review-entry").getByText("確定以降の記録：話した 5人 · イベント 2回 · Step 完了 1").waitFor();
});

test("optional server field: evidence summaries under a mark replace the bare count", async (t) => {
  const review = await open(t, `/plans/${PLAN}/review`, {
    prepare: async (server) => { await startReview(server); },
    rewrite: (call, reply) => {
      if (call.method !== "GET" || !reply || !call.path.endsWith("/reviews/current")) return undefined;
      const body = clone(reply.body) as { data: PlanReviewView };
      body.data = { ...body.data, premiseMarks: body.data.premiseMarks.map((mark) => ({ ...mark, evidence: [{ at: "2026-10-05T10:00:00+09:00", id: mark.evidenceIds[0]!, text: "10/5 面談メモ「ARR 1億円の見込み」" }] })) };
      return { ...reply, body };
    },
  });
  await review.page.getByTestId("premise-marked").getByText("根拠：10/5 面談メモ「ARR 1億円の見込み」").waitFor();
  assert.equal(await review.page.getByText(/確定以降の記録 \d+件/).count(), 0, "summaries replace the bare count");
});

test("S1: manual edit on a plan with a skipped type — +5 to one type leaves the skipped one alone and confirms", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const before = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  const lawyer = before.content.personTypes.find((type) => type.key === "lawyer")!;
  const cfo = before.content.personTypes.find((type) => type.key === "cfo")!;
  assert.ok(before.score.segments.find((segment) => segment.key === "lawyer")!.skipped, "the demo plan has a skipped type");
  await page.getByRole("button", { name: "手動で編集" }).click();
  await page.getByRole("progressbar", { name: "進み具合：手動編集" }).waitFor();
  const draftId = (await navigation(page)).navigation[0]!.href!.split("/")[3]!;
  const draft = await direct<PlanReviewView>(server, "GET", `/api/agent/plans/drafts/${draftId}/review`);
  assert.ok((draft.data.draft.slotState ?? []).some((slot) => slot.skipped), "the server sends slotState");
  // The skipped type and a type with points cannot be removed.
  assert.equal(await page.getByRole("button", { name: /弁護士.*を外す$/ }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: /VC パートナーを外す$/ }).isDisabled(), true);
  const points = page.getByLabel(/CFO 経験者の配点$/);
  await points.fill(String(cfo.allocation + 5));
  await points.press("Enter");
  await page.getByText(new RegExp(`${cfo.allocation} → ${cfo.allocation + 5}`)).first().waitFor();
  assert.equal(await page.getByLabel(/弁護士.*の配点$/).inputValue(), String(lawyer.allocation), "the skipped type keeps its points");
  await page.getByRole("button", { name: "保存して確定" }).click();
  await page.getByText("方案を更新しました").waitFor();
  const after = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  assert.equal(after.content.personTypes.find((type) => type.key === "cfo")!.allocation, cfo.allocation + 5);
  assert.equal(after.content.personTypes.find((type) => type.key === "lawyer")!.allocation, lawyer.allocation);
  for (const type of after.content.personTypes) {
    const earned = after.score.segments.find((segment) => segment.key === type.key)!;
    assert.ok(type.allocation >= earned.earned - (earned.skipped ? type.allocation : 0), `${type.key} not below earned`);
  }
  assert.ok(writes(calls).some((line) => line.endsWith("/manual-edit") && line.includes("/drafts/")));
});

test("m1: 「このままにする」 only when the whole draft is unchanged, and it never confirms; sending needs a premise change or a sentence", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/review`, { prepare: async (server) => {
    const view = await startReview(server);
    await sendReview(server, view.draft.draftId, "CVC も");
    await sendReview(server, view.draft.draftId, "そのままでいい");
  } });
  await page.getByTestId("review-turn").nth(1).waitFor();
  // The last turn changed nothing, but the first one did (and is still accepted): confirm.
  await page.getByRole("button", { name: "この内容で確定" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "このままにする" }).count(), 0);
  // Nothing typed, nothing edited: no send.
  assert.equal(await page.getByRole("button", { name: /もう一度直す/ }).isDisabled(), true);
  await page.getByLabel("ほかに変わったこと（任意）").fill("もう少し");
  assert.equal(await page.getByRole("button", { name: /もう一度直す/ }).isDisabled(), false);
  // A draft that equals the plan → 「このままにする」 goes back without confirming.
  const unchanged = await open(t, `/plans/${PLAN}/review`, { prepare: async (server) => {
    const view = await startReview(server);
    await sendReview(server, view.draft.draftId, "そのままでいい");
  } });
  await unchanged.page.getByRole("button", { name: "このままにする" }).click();
  assert.equal(writes(unchanged.calls).filter((line) => line.endsWith("/confirm")).length, 0, "このまま never confirms");
  assert.deepEqual((await navigation(unchanged.page)).navigation.at(-1), { href: `/task?seg=plan&plan=${PLAN}`, method: "replace" });
  assert.equal(writes(calls).filter((line) => line.endsWith("/confirm")).length, 0);
});

test("ai_budget: the used-up note says the AI limit (no paid entry)", async (t) => {
  const { page } = await open(t, `/plans/${PLAN}/review`, {
    prepare: async (server) => { await startReview(server); },
    rewrite: (call, reply) => (call.method === "GET" && reply && call.path.endsWith("/reviews/current")
      ? ok({ ...(reply.body as { data: PlanReviewView }).data, reviewLeftThisMonth: 0, reviewLimitReason: "ai_budget" }) : undefined),
  });
  await page.getByText("⏳ 今月の AI 利用上限に達しました").waitFor();
  await page.getByText(/^見直しは \d+月\d+日から使えます（あと \d+日）$/).waitFor();
  assert.equal(await page.getByText("⏳ 今月の見直しは使い切りました").count(), 0);
  assert.equal(await page.getByText(PAID).count(), 0);
});

test("STALE on a manual edit of a review draft: 「最新を読み込む」 opens a fresh review", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  await page.getByRole("button", { name: "手動で編集" }).click();
  await page.getByRole("button", { name: "保存して確定" }).waitFor();
  const detail = (await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`)).data;
  await direct(server, "PATCH", `/api/agent/plans/v2/${PLAN}/goal`, { expectedRevision: detail.revision, goalText: "シリーズA 資金調達（5億円）", idempotencyKey: "elsewhere", mode: "save_only" });
  await page.getByRole("button", { name: "保存して確定" }).click();
  await page.getByTestId("manual-stale").getByText("ほかの画面でプランが変わりました。最新のプランで見直しをやり直します。").waitFor();
  await page.getByRole("button", { name: "最新を読み込む" }).click();
  await page.getByTestId("premise-card").waitFor();
  assert.ok(writes(calls).includes(`POST /api/agent/plans/v2/${PLAN}/reviews`));
  assert.deepEqual((await navigation(page)).navigation.at(-1), { href: `/plans/${PLAN}/review`, method: "replace" });
});

test("dark theme renders the review, done and legacy pages without errors", async (t) => {
  const review = await open(t, `/plans/${PLAN}/review`, { dark: true, prepare: async (server) => { await startReview(server); } });
  await review.page.getByTestId("premise-card").waitFor();
  const legacy = await open(t, "/plans/legacy/v1-plan-1", { dark: true, rewrite: withLegacyOnly });
  await legacy.page.getByTestId("legacy-detail").waitFor();
});

// Evidence screenshots (run with R25_SHOTS=1): <screen>-<light|dark>.png.
test("screenshots", { skip: !process.env.R25_SHOTS }, async (t) => {
  mkdirSync(SHOTS, { recursive: true });
  const achieved = async (server: Server) => { const detail = await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`); await direct(server, "POST", `/api/agent/plans/v2/${PLAN}/achieve`, { expectedRevision: detail.data.revision, idempotencyKey: "a" }); };
  type Shot = [name: string, path: string, act: ((page: Page, server: Server) => Promise<void>) | null, options: { rewrite?: Rewrite; height?: number; prepare?: (server: Server) => Promise<void> }];
  const shots: Shot[] = [
    ["review-entry", "/task?seg=plan", async (page) => { await page.getByRole("button", { name: "方案を見直す" }).first().click(); await page.getByText("あと 3 回").waitFor(); }, {}],
    ["review", `/plans/${PLAN}/review`, async (page) => { await page.getByRole("button", { name: "直近の数字を直す" }).click(); await page.getByLabel("直近の数字の新しい内容").fill("ARR 1億円の見込み（年内）· 前年比 2.4倍"); await page.getByLabel("ほかに変わったこと（任意）").fill("リード候補は青葉ベンチャーズ。CVC にも並行で当たりたい"); }, { height: 1500, prepare: async (server) => { await startReview(server); } }],
    ["review-turn", `/plans/${PLAN}/review`, async (page) => { await page.getByLabel("ほかに変わったこと（任意）").fill("CVC にも並行で当たりたい"); await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click(); await page.getByTestId("review-turn").waitFor(); await page.getByTestId("review-turn").scrollIntoViewIfNeeded(); }, { height: 1500, prepare: async (server) => { await startReview(server); } }],
    ["review-used-up", `/plans/${PLAN}/review`, async (page) => { await page.getByTestId("review-used-up").scrollIntoViewIfNeeded(); }, { height: 1500, prepare: async (server) => { await useAllReviews(server); } }],
    ["review-stale", `/plans/${PLAN}/review`, async (page, server) => {
      await page.getByLabel("ほかに変わったこと（任意）").fill("CVC も");
      await page.getByRole("button", { name: "前提を送って修正案をつくる" }).click();
      await page.getByTestId("review-turn").waitFor();
      const detail = await direct<PlanV2Detail>(server, "GET", `/api/agent/plans/v2/${PLAN}`);
      await direct(server, "PATCH", `/api/agent/plans/v2/${PLAN}/goal`, { expectedRevision: detail.data.revision, goalText: "シリーズA 資金調達（5億円）", idempotencyKey: "elsewhere", mode: "save_only" });
      await page.getByRole("button", { name: "この内容で確定" }).click();
      await page.getByTestId("review-stale").waitFor();
    }, { prepare: async (server) => { await startReview(server); } }],
    ["achieve-confirm", "/task?seg=plan", async (page) => { await page.getByRole("button", { name: "目標を達成した" }).click(); await page.getByText("目標を達成したとして記録しますか？").waitFor(); }, {}],
    ["done", `/plans/${PLAN}/done`, async (page) => { await page.getByRole("button", { name: "次の目標を決める" }).click(); await page.getByTestId("next-candidate").first().waitFor(); }, { height: 1400, prepare: achieved }],
    ["done-goal-limit", `/plans/${PLAN}/done`, async (page) => { await page.getByRole("button", { name: "次の目標を決める" }).click(); await page.getByText("同時に進められる目標は 2 つまでです。").scrollIntoViewIfNeeded(); }, { height: 1400, prepare: achieved, rewrite: withGoals }],
    ["goal-switcher", "/task?seg=plan", async (page) => { await page.getByTestId("goal-switcher-open").click(); await page.getByTestId("goal-switcher").waitFor(); }, { rewrite: withGoals }],
    ["goal-edit", "/task?seg=plan", async (page) => { await page.getByTestId("goal-switcher-open").click(); await page.getByRole("button", { name: "この目標を編集" }).click(); await page.getByTestId("goal-edit").getByLabel("目標", { exact: true }).fill("シリーズA 資金調達（5億円）"); await page.getByRole("button", { name: "保存", exact: true }).click(); await page.getByText("方案を作り直しますか？").waitFor(); }, {}],
    ["legacy-card", "/task?seg=plan", async (page) => { await page.getByTestId("legacy-card").waitFor(); }, { rewrite: withLegacyOnly }],
    ["legacy-detail", "/plans/legacy/v1-plan-1", async (page) => { await page.getByTestId("legacy-detail").waitFor(); }, { height: 1200, rewrite: withLegacyOnly }],
  ];
  for (const [name, path, act, options] of shots) {
    for (const dark of [false, true]) {
      const { page, server } = await open(t, path, { dark, ...options });
      await page.locator("[data-testid=plan-overview], [data-testid=premise-card], [data-testid=done-hero], [data-testid=legacy-card], [data-testid=legacy-detail]").first().waitFor();
      await page.waitForTimeout(300);
      if (act) await act(page, server);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, `${name}-${dark ? "dark" : "light"}.png`) });
    }
  }
});
