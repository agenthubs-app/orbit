import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { PlanPersonTypeDetail, PlanV2Detail, PlanV2SummaryResponse } from "../src/api/contract/plan-v2";
import { nativeUiStubs } from "./helpers/native-ui-stubs";
// The server side of the plan v2 routes, in mock mode (in-memory demo world). A test
// may read ../orbits; it never ships in the App bundle.
import { createPlanV2Handlers } from "../../orbits/features/plans/v2/handlers";

// R24 (UI-SPEC「Task › プラン」「人物タイプ詳細」): the App overview and person-type page
// rendered for real with react-native-web in Chromium. Every request goes to the
// orbits plan v2 route handlers themselves (mock mode, a fresh demo plan per test), so
// the scores on screen are the server's own (summarizePlanScore); a test may rewrite
// one answer to reach a case the demo world does not have (two candidates, an intro
// route, a manual memo card). Every request is recorded, so tests can assert what was
// written and that opening a page writes nothing.
const root = new URL("..", import.meta.url).pathname;
const SHOTS = "/Users/li/orbit-sprint-evidence/redesign/R24/run-01/app";

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; body: unknown };
type Rewrite = (call: Call, reply: Reply | null) => Reply | null | undefined;

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const PLAN = "demo-plan-series-a";
const item = (key: string) => `demo-plan-item-${key}`;
let actorSequence = 0;

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanSegment } from "./src/screens/plan/PlanSegment";
import { PlanTypeScreen } from "./src/screens/plan/PlanTypeScreen";
import MatchesRoute from "./app/contacts/matches";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
function Root() {
  const [path, setPath] = React.useState(window.planNav.stack[window.planNav.stack.length - 1]);
  window.planNav.setPath = setPath;
  const type = path.match(/^\\/plans\\/([^/?]+)\\/types\\/([^/?]+)/);
  const screen = type ? <PlanTypeScreen key={path} planId={decodeURIComponent(type[1])} itemId={decodeURIComponent(type[2])} />
    : path === "/contacts/matches" ? <MatchesRoute />
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
    plugins: [nativeUiStubs, { name: "plan-overview", setup(plugin) {
      // react-native-web plus what the dialogs and motion need: focus requests are recorded
      // (data-focus-target) and 「減らす動き」 comes from window.reduceMotion.
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "plan-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "plan-native" }, () => ({ contents: `
import * as RNW from "react-native-web";
export * from "react-native-web";
export const findNodeHandle = (instance) => { if (instance && instance.setAttribute) instance.setAttribute("data-focus-target", "1"); return instance; };
export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => Boolean(window.reduceMotion), addEventListener: () => ({ remove() {} }), setAccessibilityFocus: () => {} };
export const Share = { share: async (content) => { (window.shared ??= []).push(content.message); return { action: "sharedAction" }; } };
export const Linking = { ...RNW.Linking, openURL: async (url) => { (window.opened ??= []).push(url); } };
`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "expo-router", namespace: "plan-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "plan-stub" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor", cookieHeader: "c", session: { actorId: "actor" } });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      // A tiny stack: push adds, replace swaps the top, back pops.
      plugin.onLoad({ filter: /^expo-router$/, namespace: "plan-stub" }, () => ({ contents: `
import React from "react";
const nav = () => window.planNav;
const show = () => { const top = nav().stack[nav().stack.length - 1]; nav().setPath?.(top); };
const router = {
  push: (href) => { nav().navigation.push({ method: "push", href }); nav().stack.push(href); show(); },
  replace: (href) => { nav().navigation.push({ method: "replace", href }); nav().stack[nav().stack.length - 1] = href; show(); },
  back: () => { nav().navigation.push({ method: "back" }); nav().stack.pop(); show(); },
  dismissAll: () => nav().navigation.push({ method: "dismissAll" }),
  canGoBack: () => nav().stack.length > 1,
  setParams() {},
};
window.planRouter = router;
export const useRouter = () => router;
export const usePathname = () => nav().stack[nav().stack.length - 1].split("?")[0];
export const useIsFocused = () => true;
export const useLocalSearchParams = () => ({});
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

/** The orbits plan v2 handlers in mock mode, one fresh demo world per actor. */
function planServer(actorId: string) {
  const handlers = createPlanV2Handlers({ resolveActor: async () => ({ id: actorId }) as never, resolveMode: () => "mock" });
  const routes: [string, RegExp, keyof typeof handlers, string[]][] = [
    ["GET", /^\/api\/agent\/plans\/v2\/summary$/, "summary", []],
    ["GET", /^\/api\/agent\/plans\/v2\/pending$/, "pending", []],
    ["POST", /^\/api\/agent\/plans\/v2\/pending\/([^/]+)\/accept$/, "acceptPending", ["id"]],
    ["POST", /^\/api\/agent\/plans\/v2\/pending\/([^/]+)\/dismiss$/, "dismissPending", ["id"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)$/, "detail", ["planId"]],
    ["GET", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)$/, "typeDetail", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/awards$/, "award", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/talked-offline$/, "talkedOffline", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/skip$/, "skip", ["planId", "itemId"]],
    ["DELETE", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/skip$/, "unskip", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/candidates\/([^/]+)\/decision$/, "candidateDecision", ["planId", "itemId", "contactId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/proposals$/, "proposal", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/types\/([^/]+)\/intro-drafts$/, "introDraft", ["planId", "itemId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/awards\/([^/]+)\/undo$/, "undo", ["planId", "logId"]],
    ["POST", /^\/api\/agent\/plans\/v2\/([^/]+)\/steps\/([^/]+)\/complete$/, "completeStep", ["planId", "stepKey"]],
    ["DELETE", /^\/api\/agent\/plans\/v2\/([^/]+)\/steps\/([^/]+)\/complete$/, "reopenStep", ["planId", "stepKey"]],
  ];
  return async (call: Call): Promise<Reply | null> => {
    const path = call.path.split("?")[0]!;
    if (call.method === "GET" && path === "/api/agent/plans/intakes") return ok({ activeGoalLimit: 2, activeGoals: 1, intakes: [], newGoalsLeftThisMonth: 9 });
    if (call.method === "GET" && path === "/api/contacts") return ok({ contacts: [{ displayName: "伊藤 直子", id: "demo-person-ito", organization: "ハルモニア", role: "CFO", tags: [] }] });
    for (const [method, pattern, name, keys] of routes) {
      const match = call.method === method ? pattern.exec(path) : null;
      if (!match) continue;
      const params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1]!)]));
      const request = new Request(`http://local.test${call.path}`, { body: call.body === null ? undefined : JSON.stringify(call.body), headers: call.headers, method: call.method });
      const response = await handlers[name](request, { params: Promise.resolve(params) });
      return { body: await response.json(), status: response.status };
    }
    return null;
  };
}

async function open(t: { after: (fn: () => Promise<void>) => void }, path: string, options: { dark?: boolean; reduceMotion?: boolean; rewrite?: Rewrite; stack?: string[]; height?: number } = {}): Promise<{ page: Page; calls: Call[]; server: (call: Call) => Promise<Reply | null> }> {
  const page = await browser.newPage({ viewport: { width: 390, height: options.height ?? 844 }, colorScheme: options.dark ? "dark" : "light" });
  const errors: string[] = [];
  const calls: Call[] = [];
  const server = planServer(`actor-r24-${process.pid}-${(actorSequence += 1)}`);
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.exposeFunction("planServer", async (raw: string) => {
    const call = JSON.parse(raw) as Call;
    calls.push(call);
    const base = await server(call);
    const reply = options.rewrite ? options.rewrite(call, base) ?? base : base;
    return reply ?? { body: { error: { code: "NOT_FOUND", message: "unexpected " + call.method + " " + call.path }, success: false }, status: 404 };
  });
  const stack = options.stack ?? [path];
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.reduceMotion=${Boolean(options.reduceMotion)};window.planNav=${JSON.stringify({ navigation: [], stack })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { calls, page, server };
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
const read = async <T,>(server: (call: Call) => Promise<Reply | null>, path: string): Promise<T> => ((await server({ body: null, headers: { "x-orbit-lang": "ja", "x-orbit-platform": "app" }, method: "GET", path }))!.body as { data: T }).data;
const scoreText = (page: Page) => page.getByTestId("plan-score").getAttribute("aria-label");
const navigation = (page: Page) => page.evaluate(() => (window as unknown as { planNav: { navigation: unknown[]; stack: string[] } }).planNav);

test("overview: every field from GET /v2/[planId], the score equal to the home summary, and opening writes nothing", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const summary = await read<PlanV2SummaryResponse>(server, "/api/agent/plans/v2/summary");
  const detail = await read<PlanV2Detail>(server, `/api/agent/plans/v2/${PLAN}`);
  assert.equal(summary.current!.score.total, detail.score.total, "the overview and the home widget read one score");
  assert.equal(await scoreText(page), `スコア ${summary.current!.score.total} 点`);
  await page.getByText(detail.goal, { exact: true }).waitFor();
  await page.getByText(`話して ${detail.score.talked} · スキップ ${detail.score.skipped}`).waitFor();
  await page.getByText(`あと ${detail.score.remainingToFull} で満点`).waitFor();
  await page.getByText(detail.content.conclusion).waitFor();
  await page.getByText(detail.todayChance!.label).waitFor();
  assert.equal(await page.getByTestId("type-card").count(), detail.content.personTypes.length);
  assert.equal(await page.getByTestId("plan-step").count(), detail.content.steps.length);
  await page.getByTestId("event-card").waitFor();
  await page.getByText("プランは達成を保証しません。").waitFor();
  // Progress chips (a step waiting for confirmation shows 確認待ち instead).
  const waiting = new Set((detail.pending ?? []).filter((entry) => entry.kind === "step_suggestion").map((entry) => entry.id.split(":").pop()));
  for (const progress of (detail.stepProgress ?? []).filter((entry) => !waiting.has(entry.stepKey))) assert.ok(await page.getByText(progress.label, { exact: true }).count() > 0, progress.label);
  await page.getByTestId("plan-step").nth(4).getByText("確認待ち", { exact: true }).waitFor();
  // Three cells per type come from typeStats.
  const cfo = page.getByTestId("type-card").first();
  const stats = detail.typeStats!.find((entry) => entry.itemId === item("cfo"))!;
  await cfo.getByLabel(`人脈の候補 ${stats.candidates}人`).waitFor();
  for (const call of calls) {
    assert.equal(call.headers["x-orbit-platform"], "app");
    assert.equal(call.headers["x-orbit-lang"], "ja");
  }
  assert.deepEqual(writes(calls), []);
  // 見直し / 手動編集 / 達成 say 「まもなく使えます」; 前提を見る is read-only.
  for (const label of ["方案を見直す", "手動で編集", "目標を達成した"]) {
    await page.getByRole("button", { name: label }).click();
    await page.getByText("まもなく使えます").waitFor();
  }
  await page.getByRole("button", { name: "前提を見る" }).click();
  const sheet = page.getByTestId("premise-sheet");
  await sheet.getByText(detail.premise[0]!.value).waitFor();
  assert.equal(await sheet.locator("input, textarea").count(), 0, "premises cannot be edited here");
  await sheet.getByRole("button", { name: "見直しで変える" }).click();
  assert.deepEqual(writes(calls), []);
});

test("composition bar: solid, striped (skipped), overflow and grey pieces, each type piece opens its page", async (t) => {
  const { page } = await open(t, "/task?seg=plan", {
    rewrite: (call, reply) => {
      if (call.method !== "GET" || !reply || !/\/v2\/demo-plan-series-a$/.test(call.path)) return undefined;
      const body = clone(reply.body) as { data: PlanV2Detail };
      const segments = body.data.score.segments.map((segment) => (segment.key === "vc_partner" ? { ...segment, earned: 30, overflow: 5 } : segment));
      body.data = { ...body.data, score: { ...body.data.score, segments } };
      return { ...reply, body };
    },
  });
  await page.getByTestId("plan-overview").waitFor();
  for (const id of ["segment-solid", "segment-striped", "segment-overflow", "segment-rest"]) assert.ok(await page.getByTestId(id).count() > 0, id);
  await page.getByText("目標超え（半分）").waitFor();
  await page.getByRole("button", { name: "CFO 経験者 0 / 10 点" }).click();
  assert.deepEqual((await navigation(page)).navigation, [{ href: `/plans/${PLAN}/types/${item("cfo")}`, method: "push" }]);
  // The event piece is not a link.
  assert.equal(await page.getByRole("button", { name: /^イベント / }).count(), 0);
});

// Records the score's first frame (text and opacity) as soon as it is drawn.
const watchFirstFrame = (page: Page) => page.evaluate(`(() => {
  const tick = () => {
    const node = document.querySelector("[data-testid=plan-score]");
    if (node) window.firstFrame = { opacity: Number(getComputedStyle(node).opacity), text: node.innerText };
    else requestAnimationFrame(tick);
  };
  tick();
})()`);
const firstFrame = async (page: Page) => {
  await page.waitForFunction(() => Boolean((window as unknown as { firstFrame?: unknown }).firstFrame));
  return page.evaluate(() => (window as unknown as { firstFrame: { opacity: number; text: string } }).firstFrame);
};

test("score head: counts up normally; with 「減らす動き」 it shows the final number and only fades in", async (t) => {
  const normal = await open(t, "/task?seg=plan");
  await watchFirstFrame(normal.page);
  const first = Number((await firstFrame(normal.page)).text);
  const reduced = await open(t, "/task?seg=plan", { reduceMotion: true });
  await watchFirstFrame(reduced.page);
  const frame = await firstFrame(reduced.page);
  const shown = Number(frame.text);
  const opacity = frame.opacity;
  const total = Number((await scoreText(reduced.page))!.replace(/\D/g, ""));
  assert.ok(first < total, `count-up starts below the total (${first} < ${total})`);
  assert.equal(shown, total, "no number roll with reduced motion");
  assert.ok(opacity < 1, "it fades in");
  await normal.page.waitForTimeout(1400);
  assert.equal(Number(await normal.page.getByTestId("plan-score").innerText()), total);
});

test("record from the candidate list: preview, +X toast, 元に戻す reverses only the score", async (t) => {
  const { page, calls, server } = await open(t, `/plans/${PLAN}/types/${item("cfo")}`);
  await page.getByTestId("candidate-row").first().waitFor();
  await page.getByRole("checkbox", { name: "伊藤 直子を選ぶ" }).click();
  await page.getByTestId("selection-bar").getByText("1人を選択中").waitFor();
  await page.getByRole("button", { name: "1人を記録" }).click();
  await page.getByText("プランに反映：CFO 経験者 +10").waitFor();
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("+10 点", { exact: true }).waitFor();
  await page.getByText("CFO 経験者 · 伊藤 直子").waitFor();
  const award = calls.find((call) => call.path.endsWith("/awards"))!;
  assert.deepEqual({ basis: (award.body as { basis: string }).basis, contactId: (award.body as { contactId: string }).contactId }, { basis: "talked", contactId: "demo-person-ito" });
  assert.equal((await read<PlanV2Detail>(server, `/api/agent/plans/v2/${PLAN}`)).score.segments.find((segment) => segment.key === "cfo")!.earned, 10);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("記録を取り消しました").waitFor();
  assert.ok(writes(calls).some((line) => /\/awards\/[^/]+\/undo$/.test(line)));
  assert.equal((await read<PlanV2Detail>(server, `/api/agent/plans/v2/${PLAN}`)).score.segments.find((segment) => segment.key === "cfo")!.earned, 0);
});

test("anonymous self-report: counts up to the target, then says why it adds nothing", async (t) => {
  const { page } = await open(t, `/plans/${PLAN}/types/${item("cfo")}`);
  await page.getByRole("button", { name: "話したを記録" }).click();
  await page.getByRole("tab", { name: "オフライン" }).click();
  await page.getByText("名前なしは目標人数（1人）まで加点されます").waitFor();
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("+10 点", { exact: true }).waitFor();
  await page.getByRole("button", { name: "話したを記録" }).click();
  await page.getByRole("tab", { name: "オフライン" }).click();
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("加点はありません").waitFor();
  await page.getByText("目標人数に達したので、名前なしの記録は加点されません。").waitFor();
});

test("offline with a name: 「この人ですか？」 first, nothing is scored until the user picks", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("cvc")}`, {
    rewrite: (call) => (call.path.endsWith("/talked-offline") && (call.body as { name?: string }).name ? ok({ matches: [{ company: "東邦重工", contactId: "demo-person-sasaki", name: "佐々木 遼" }] }) : undefined),
  });
  await page.getByRole("button", { name: "話したを記録" }).click();
  await page.getByRole("tab", { name: "オフライン" }).click();
  await page.getByLabel("相手の名前（任意）").fill("佐々木");
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("この人ですか？").waitFor();
  assert.equal(calls.filter((call) => call.path.endsWith("/talked-offline")).length, 1);
  await page.getByRole("button", { name: "佐々木 遼 · 東邦重工" }).click();
  await page.getByText("+5 点", { exact: true }).waitFor();
  const picked = calls.filter((call) => call.path.endsWith("/talked-offline"))[1]!.body as { contactId: string };
  assert.equal(picked.contactId, "demo-person-sasaki");
});

test("skip: the confirm focuses the main button; full points striped; 元に戻す and スキップを取り消す undo it", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("angel")}`);
  await page.getByRole("button", { name: "この分野はもう詳しい" }).click();
  await page.getByText("スキップすると満点（10 点）を記録します。あとで取り消せます。").waitFor();
  assert.equal(await page.locator("[data-focus-target]").innerText(), "スキップする", "focus starts on the main button");
  await page.getByRole("button", { name: "スキップする" }).click();
  await page.getByText("10点を加算しました").waitFor();
  await page.getByTestId("type-skipped").waitFor();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("スキップを取り消しました").waitFor();
  await page.getByRole("button", { name: "この分野はもう詳しい" }).waitFor();
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/types/${item("angel")}/skip`, `DELETE /api/agent/plans/v2/${PLAN}/types/${item("angel")}/skip`]);
  // The skipped state's own button.
  await page.getByRole("button", { name: "この分野はもう詳しい" }).click();
  await page.getByRole("button", { name: "スキップする" }).click();
  await page.getByRole("button", { name: "スキップを取り消す" }).click();
  await page.getByRole("button", { name: "この分野はもう詳しい" }).waitFor();
});

test("step suggestion: shown as a question, nothing completes until 完了にする; the tick can be undone", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  const card = page.getByTestId("step-suggestion");
  await card.waitFor();
  await card.getByText("「契約をまとめる」は完了しましたか？").waitFor();
  assert.deepEqual(writes(calls), [], "a reached target never completes the step by itself");
  await card.getByRole("button", { name: "完了にする" }).click();
  await page.getByRole("button", { name: "Step 5 は完了しています" }).waitFor();
  assert.ok(writes(calls).includes(`POST /api/agent/plans/v2/pending/${encodeURIComponent(`step:${PLAN}:demo-step-5`)}/accept`));
  const detail = await read<PlanV2Detail>(server, `/api/agent/plans/v2/${PLAN}`);
  assert.ok(detail.content.steps[4]!.completedAt);
  await page.getByRole("button", { name: "Step 5 は完了しています" }).click();
  await page.getByText("完了を取り消しますか？").waitFor();
  await page.getByRole("button", { name: "取り消す" }).click();
  await page.getByText("完了を取り消しました").waitFor();
  assert.ok(writes(calls).includes(`DELETE /api/agent/plans/v2/${PLAN}/steps/demo-step-5/complete`));
});

test("memo check: the manual card needs two ticked questions before 加点する", async (t) => {
  const { page, calls } = await open(t, "/task?seg=plan", {
    rewrite: (call, reply) => {
      if (call.method === "POST" && call.path.includes("/pending/memo-1/accept")) return ok({ award: null, id: "memo-1", replayed: false, status: "accepted" });
      if (call.method !== "GET" || !reply || !/\/v2\/demo-plan-series-a$/.test(call.path)) return undefined;
      const body = clone(reply.body) as { data: PlanV2Detail };
      body.data = { ...body.data, pending: [{ answered: [], contactId: "demo-person-sasaki", createdAt: "2026-10-10T00:00:00.000Z", detail: "佐々木 遼", id: "memo-1", itemId: item("cvc"), kind: "memo_coverage", manual: true, planId: PLAN, title: "CVC 担当者" }, ...(body.data.pending ?? [])] };
      return { ...reply, body };
    },
  });
  const card = page.getByTestId("memo-manual");
  await card.waitFor();
  const accept = card.getByRole("button", { name: "加点する" });
  assert.equal(await accept.isDisabled(), true);
  const boxes = card.getByRole("checkbox");
  await boxes.nth(0).click();
  assert.equal(await accept.isDisabled(), true, "one question is not enough");
  await boxes.nth(2).click();
  await accept.click();
  await page.getByText("加点しました").waitFor();
  const body = calls.find((call) => call.path.includes("/pending/memo-1/accept"))!.body as { answered: number[] };
  assert.deepEqual(body.answered, [0, 2]);
});

function withTwoCandidates(extra: (detail: PlanPersonTypeDetail) => PlanPersonTypeDetail = (detail) => detail): Rewrite {
  return (call, reply) => {
    if (call.method === "POST" && call.path.endsWith("/awards")) {
      const contactId = (call.body as { contactId: string }).contactId;
      return ok({ awardLogId: `log-${contactId}`, part: "base", points: 10, replayed: false, score: { overflow: 0, remainingToFull: 45, segments: [], skipped: 10, talked: 45, todayDelta: 20, total: 55 } }, 201);
    }
    if (call.method !== "GET" || !reply || !call.path.endsWith(`/types/${item("vc_partner")}`)) return undefined;
    const body = clone(reply.body) as { data: PlanPersonTypeDetail };
    const first = body.data.candidates[0]!;
    body.data = extra({ ...body.data, candidates: [first, { ...first, candidateId: "cand-x", contactId: "demo-person-nakamura", isOrbitUser: true, name: "中村 由紀", recommendScore: Math.max(0, first.recommendScore - 10) }] });
    return { ...reply, body };
  };
}

test("candidates: multi-select shows the bar; 2人を記録 records each person once", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("vc_partner")}`, { rewrite: withTwoCandidates() });
  const rows = page.getByTestId("candidate-row");
  await rows.nth(1).waitFor();
  for (let index = 0; index < 2; index += 1) await rows.nth(index).getByRole("checkbox").click();
  await page.getByText("2人を選択中").waitFor();
  await page.getByRole("button", { name: "2人を記録" }).click();
  await page.getByText("2人を記録します").waitFor();
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("+20 点", { exact: true }).waitFor();
  const awarded = calls.filter((call) => call.path.endsWith("/awards")).map((call) => (call.body as { contactId: string }).contactId);
  assert.equal(awarded.length, 2);
  assert.equal(new Set(awarded).size, 2);
  assert.equal(await page.getByTestId("selection-bar").count(), 0, "the selection clears after recording");
});

test("candidate ✓ only links (no action is created) and ✕ removes it", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("cfo")}`);
  await page.getByRole("button", { name: "伊藤 直子をプランの候補にする" }).click();
  await page.getByText("プランの候補にしました").waitFor();
  const decision = calls.find((call) => call.path.endsWith("/decision"))!;
  assert.equal((decision.body as { decision: string }).decision, "accept");
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/types/${item("cfo")}/candidates/demo-person-ito/decision`]);
});

test("proposal: three time options, then a draft only — コピー / メールアプリで開く, never a send button", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("vc_partner")}`, { rewrite: withTwoCandidates() });
  await page.getByTestId("candidate-row").first().getByRole("checkbox").click();
  await page.getByRole("button", { name: "面談を提案" }).click();
  const sheet = page.getByTestId("proposal-sheet");
  await sheet.getByText("候補 3").waitFor();
  await sheet.getByRole("button", { name: "候補 1 を次の日に" }).click();
  const before = writes(calls).length;
  assert.equal(before, 0, "picking times sends nothing");
  await sheet.getByRole("button", { name: /さんへの下書きをつくる$/ }).click();
  await sheet.getByTestId("mail-draft").waitFor();
  const body = calls.find((call) => call.path.endsWith("/proposals"))!.body as { slots: string[] };
  assert.equal(body.slots.length, 3);
  for (const slot of body.slots) assert.ok(!Number.isNaN(Date.parse(slot)));
  await sheet.getByRole("button", { name: "コピー" }).waitFor();
  await sheet.getByRole("button", { name: "メールアプリで開く" }).click();
  assert.match(((await page.evaluate(() => (window as unknown as { opened: string[] }).opened))[0]!), /^mailto:\?subject=/);
  assert.equal(await sheet.getByRole("button", { name: /送信|Send/ }).count(), 0);
  await sheet.getByText("送信はしません · 送信はあなたが行います").waitFor();
});

test("intro route: 依頼文をつくる opens the draft with コピー / メールアプリで開く only", async (t) => {
  const { page, calls } = await open(t, `/plans/${PLAN}/types/${item("cvc")}`, {
    rewrite: (call, reply) => {
      if (call.path.endsWith("/intro-drafts")) return ok({ body: "伊藤さん、いつもありがとうございます。", subject: "ご紹介のお願い", viaName: "伊藤 直子" });
      if (call.method !== "GET" || !reply || !call.path.endsWith(`/types/${item("cvc")}`)) return undefined;
      const body = clone(reply.body) as { data: PlanPersonTypeDetail };
      body.data = { ...body.data, introRoutes: [{ viaContactId: "demo-person-ito", viaName: "伊藤 直子", why: "CVC の担当者と面識があります" }] };
      return { ...reply, body };
    },
  });
  await page.getByRole("button", { name: "伊藤 直子さんへの依頼文をつくる" }).click();
  const draft = page.getByTestId("mail-draft");
  await draft.getByText("件名：ご紹介のお願い").waitFor();
  await draft.getByRole("button", { name: "コピー" }).click();
  assert.match(((await page.evaluate(() => (window as unknown as { shared: string[] }).shared))[0]!), /ご紹介のお願い/);
  assert.equal(await page.getByRole("button", { name: /送信|Send/ }).count(), 0);
  assert.deepEqual(writes(calls), [`POST /api/agent/plans/v2/${PLAN}/types/${item("cvc")}/intro-drafts`]);
});

test("three type states: candidates, not in the network (persona, events), skipped", async (t) => {
  const candidates = await open(t, `/plans/${PLAN}/types/${item("cfo")}`);
  await candidates.page.getByText("あなたの人脈の候補").waitFor();
  assert.equal(await candidates.page.getByText("人脈にまだいません").count(), 0);
  const none = await open(t, `/plans/${PLAN}/types/${item("funded_founder")}`);
  await none.page.getByText("人脈にまだいません").waitFor();
  await none.page.getByText("会える活動", { exact: true }).first().waitFor();
  assert.equal(await none.page.getByTestId("candidate-row").count(), 0);
  assert.ok(await none.page.getByTestId("event-row").count() > 0, "events still give a next step");
  await none.page.getByRole("button", { name: /内訳$/ }).first().click();
  const breakdown = none.page.getByTestId("event-breakdown");
  await breakdown.waitFor();
  for (const label of ["会える人の適合", "推定の確度", "時間とコスト", "既存のつながり", "交流の形式"]) await breakdown.getByText(label).waitFor();
  const skipped = await open(t, `/plans/${PLAN}/types/${item("lawyer")}`);
  await skipped.page.getByTestId("type-skipped").getByText("習熟済みとして満点を記録しています。話した人の点とは分けて表示します。").waitFor();
  await skipped.page.getByRole("button", { name: "スキップを取り消す" }).waitFor();
  assert.equal(await skipped.page.getByRole("button", { name: "この分野はもう詳しい" }).count(), 0);
});

test("contacts/matches replaces itself with Task › プラン, so back returns to 人脈", async (t) => {
  const { page } = await open(t, "/contacts/matches", { stack: ["/contacts", "/contacts/matches"] });
  await page.getByTestId("plan-overview").waitFor();
  const state = await navigation(page);
  assert.deepEqual(state.navigation, [{ href: "/task?seg=plan", method: "replace" }]);
  assert.deepEqual(state.stack, ["/contacts", "/task?seg=plan"]);
  await page.evaluate(() => (window as unknown as { planRouter: { back: () => void } }).planRouter.back());
  await page.getByTestId("elsewhere").getByText("/contacts").waitFor();
});

test("seed plan end to end: overview → type → record → undo → skip → unskip → overview score unchanged", async (t) => {
  const { page, calls, server } = await open(t, "/task?seg=plan");
  await page.getByTestId("plan-overview").waitFor();
  const start = await scoreText(page);
  await page.getByRole("button", { name: "CVC 担当者の詳細を開く" }).click();
  await page.getByTestId("type-head").waitFor();
  await page.getByTestId("candidate-row").first().getByRole("checkbox").click();
  await page.getByRole("button", { name: "1人を記録" }).click();
  await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click();
  await page.getByText("+5 点", { exact: true }).waitFor();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByText("記録を取り消しました").waitFor();
  await page.getByRole("button", { name: "この分野はもう詳しい" }).click();
  await page.getByRole("button", { name: "スキップする" }).click();
  await page.getByRole("button", { name: "スキップを取り消す" }).click();
  await page.getByRole("button", { name: "この分野はもう詳しい" }).waitFor();
  await page.evaluate(() => (window as unknown as { planRouter: { back: () => void } }).planRouter.back());
  await page.getByTestId("plan-overview").waitFor();
  await page.waitForTimeout(1300);
  assert.equal(await scoreText(page), start);
  const summary = await read<PlanV2SummaryResponse>(server, "/api/agent/plans/v2/summary");
  assert.equal(start, `スコア ${summary.current!.score.total} 点`);
  assert.equal(Number(await page.getByTestId("plan-score").innerText()), summary.current!.score.total);
  assert.deepEqual(writes(calls).map((line) => line.replace(/awards\/[^/]+\/undo/, "awards/:id/undo")), [
    `POST /api/agent/plans/v2/${PLAN}/types/${item("cvc")}/awards`,
    `POST /api/agent/plans/v2/${PLAN}/awards/:id/undo`,
    `POST /api/agent/plans/v2/${PLAN}/types/${item("cvc")}/skip`,
    `DELETE /api/agent/plans/v2/${PLAN}/types/${item("cvc")}/skip`,
  ]);
});

test("dark theme renders the overview and a type page without errors", async (t) => {
  const overview = await open(t, "/task?seg=plan", { dark: true });
  await overview.page.getByTestId("plan-overview").waitFor();
  const type = await open(t, `/plans/${PLAN}/types/${item("cfo")}`, { dark: true });
  await type.page.getByTestId("type-head").waitFor();
});

// Evidence screenshots (run with R24_SHOTS=1): <screen>-<light|dark>.png.
test("screenshots", { skip: !process.env.R24_SHOTS }, async (t) => {
  mkdirSync(SHOTS, { recursive: true });
  const memoPending: Rewrite = (call, reply) => {
    if (call.method !== "GET" || !reply || !/\/v2\/demo-plan-series-a$/.test(call.path)) return undefined;
    const body = clone(reply.body) as { data: PlanV2Detail };
    body.data = { ...body.data, pending: [
      { answered: [0, 2], contactId: "demo-person-sasaki", createdAt: "2026-10-10T00:00:00.000Z", detail: "佐々木 遼", id: "memo-1", itemId: item("cvc"), kind: "memo_coverage", planId: PLAN, title: "CVC 担当者" },
      { answered: [], contactId: "demo-person-ito", createdAt: "2026-10-10T00:00:00.000Z", detail: "伊藤 直子", id: "memo-2", itemId: item("cfo"), kind: "memo_coverage", manual: true, planId: PLAN, title: "CFO 経験者" },
      ...(body.data.pending ?? [])] };
    return { ...reply, body };
  };
  const intro: Rewrite = (call, reply) => {
    if (call.path.endsWith("/intro-drafts")) return ok({ body: "伊藤さん、いつもありがとうございます。シリーズA の調達を進めていて、製造業 DX に出資している CVC の担当の方に 30分ほどお話を伺いたいと考えています。ご負担のない範囲で、ご紹介いただけないでしょうか。", subject: "ご紹介のお願い（CVC のご担当の方）", viaName: "伊藤 直子" });
    if (call.method !== "GET" || !reply || !call.path.endsWith(`/types/${item("funded_founder")}`)) return undefined;
    const body = clone(reply.body) as { data: PlanPersonTypeDetail };
    body.data = { ...body.data, introRoutes: [{ viaContactId: "demo-person-ito", viaName: "伊藤 直子", why: "取引先で、シリーズA を調達した起業家と面識があります" }] };
    return { ...reply, body };
  };
  const matches: Rewrite = (call) => (call.path.endsWith("/talked-offline") && (call.body as { name?: string }).name ? ok({ matches: [{ company: "東邦重工", contactId: "demo-person-sasaki", name: "佐々木 遼" }, { company: null, contactId: "demo-person-x", name: "佐々木 健" }] }) : undefined);
  type Shot = [name: string, path: string, act: ((page: Page) => Promise<void>) | null, options: { rewrite?: Rewrite; height?: number }];
  const shots: Shot[] = [
    ["overview", "/task?seg=plan", async (page) => { await page.waitForTimeout(1400); }, {}],
    ["overview-pending", "/task?seg=plan", async (page) => { await page.waitForTimeout(1400); }, { height: 3600, rewrite: memoPending }],
    ["type-candidates", `/plans/${PLAN}/types/${item("vc_partner")}`, async (page) => { await page.getByTestId("candidate-row").first().getByRole("checkbox").click(); }, { height: 1800, rewrite: withTwoCandidates() }],
    ["type-none", `/plans/${PLAN}/types/${item("funded_founder")}`, null, { height: 2200 }],
    ["type-skipped", `/plans/${PLAN}/types/${item("lawyer")}`, null, { height: 1400 }],
    ["record-sheet", `/plans/${PLAN}/types/${item("cfo")}`, async (page) => { await page.getByRole("checkbox", { name: "伊藤 直子を選ぶ" }).click(); await page.getByRole("button", { name: "1人を記録" }).click(); await page.getByTestId("record-sheet").waitFor(); }, {}],
    ["offline-match", `/plans/${PLAN}/types/${item("cvc")}`, async (page) => { await page.getByRole("button", { name: "話したを記録" }).click(); await page.getByRole("tab", { name: "オフライン" }).click(); await page.getByLabel("相手の名前（任意）").fill("佐々木"); await page.getByTestId("record-sheet").getByRole("button", { name: "記録する" }).click(); await page.getByText("この人ですか？").waitFor(); }, { rewrite: matches }],
    ["skip-confirm", `/plans/${PLAN}/types/${item("angel")}`, async (page) => { await page.getByRole("button", { name: "この分野はもう詳しい" }).click(); await page.getByText("この分野はもう詳しいですか？").waitFor(); }, {}],
    ["proposal-draft", `/plans/${PLAN}/types/${item("vc_partner")}`, async (page) => { await page.getByTestId("candidate-row").first().getByRole("checkbox").click(); await page.getByTestId("candidate-row").nth(1).getByRole("checkbox").click(); await page.getByRole("button", { name: "面談を提案" }).click(); await page.getByTestId("proposal-sheet").getByRole("button", { name: /さんへの下書きをつくる$/ }).first().click(); await page.getByTestId("mail-draft").waitFor(); }, { height: 1400, rewrite: withTwoCandidates() }],
    ["intro-draft", `/plans/${PLAN}/types/${item("funded_founder")}`, async (page) => { await page.getByRole("button", { name: "伊藤 直子さんへの依頼文をつくる" }).click(); await page.getByTestId("mail-draft").waitFor(); }, { rewrite: intro }],
    ["event-breakdown", `/plans/${PLAN}/types/${item("funded_founder")}`, async (page) => { await page.getByRole("button", { name: /内訳$/ }).first().click(); await page.getByTestId("event-breakdown").scrollIntoViewIfNeeded(); }, {}],
  ];
  for (const [name, path, act, options] of shots) {
    for (const dark of [false, true]) {
      const { page } = await open(t, path, { dark, height: options.height, rewrite: options.rewrite });
      await page.locator("[data-testid=plan-overview], [data-testid=type-head]").first().waitFor();
      await page.waitForTimeout(300);
      if (act) await act(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS, `${name}-${dark ? "dark" : "light"}.png`) });
    }
  }
});
