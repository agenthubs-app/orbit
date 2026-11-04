import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { PlanHomeView, PlanV2Detail } from "../src/api/contract/plan-v2";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

// R37b (SC-02 / 03): the v3 plan home (plan-draft-v5-proposal.html v16「手机」·「计划主页 · 执行」) in the Task › プラン
// segment, rendered for real with react-native-web in Chromium (same harness as plan-overview-screens). The server is a
// scripted stand-in answering with the orbits mock server's own overview answers for the three v16 plans
// (tests/fixtures/plan-home-v3-mock.json) and recording every request, so the tests assert the tick / regenerate /
// manual-fact requests (action keys URL-encoded), the 409 LIMIT state, the 準備中 poll and that opening writes nothing.
const root = new URL("..", import.meta.url).pathname;
const mock = JSON.parse(readFileSync(join(root, "tests/fixtures/plan-home-v3-mock.json"), "utf8")) as Record<"fund" | "sales" | "hire", PlanV2Detail>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; body: unknown };
type Handler = (call: Call, calls: Call[]) => Reply | undefined;
const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, reason: string): Reply => ({ body: { error: { code, context: { reason }, message: reason }, success: false }, status });

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanSegment } from "./src/screens/plan/PlanSegment";
import { ToastProvider, UiFeedbackHost, UiPortalHost } from "./src/components/ui";
function Root() {
  const [path, setPath] = React.useState(window.planNav.path);
  window.planNav.setPath = setPath;
  const screen = path.startsWith("/task") ? <PlanSegment /> : <div data-testid="elsewhere">{path}</div>;
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
    plugins: [nativeUiStubs, { name: "plan-home-v3-screens", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "plan-native" }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onLoad({ filter: /.*/, namespace: "plan-native" }, () => ({ contents: `export * from "react-native-web"; export const findNodeHandle = (instance) => instance;`, loader: "js", resolveDir: root }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-clipboard$/ }, () => ({ path: "expo-clipboard", namespace: "plan-stub" }));
      plugin.onLoad({ filter: /^expo-clipboard$/, namespace: "plan-stub" }, () => ({ contents: `export const setStringAsync = async (text) => { (window.copied ??= []).push(text); return true; };`, loader: "js" }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: "expo-router", namespace: "plan-stub" }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider|usePageCopySession)$/ }, (args) => ({ path: args.path, namespace: "plan-stub" }));
      plugin.onLoad({ filter: /usePageCopySession$/, namespace: "plan-stub" }, () => ({ contents: `const none = { session: null, whenReady: async () => null }; export const usePageCopySession = () => none;`, loader: "js" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "plan-stub" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor", cookieHeader: "c", session: { actorId: "actor" } });`, loader: "js" }));
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

async function open(t: { after: (fn: () => Promise<void>) => void }, handler: Handler, options: { clock?: boolean } = {}): Promise<{ page: Page; calls: Call[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  if (options.clock) await page.clock.install();
  const errors: string[] = [];
  const calls: Call[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.exposeFunction("planServer", (raw: string) => {
    const call = JSON.parse(raw) as Call;
    calls.push(call);
    return handler(call, calls) ?? { body: { error: { code: "NOT_FOUND", message: "unexpected " + call.method + " " + call.path }, success: false }, status: 404 };
  });
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.planNav=${JSON.stringify({ path: "/task?seg=plan", navigation: [] })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  return { calls, page };
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
const overviewReads = (calls: Call[], planId: string) => calls.filter((call) => call.method === "GET" && call.path === `/api/agent/plans/v2/${planId}`).length;

/** Summary / intakes / the overview of `plan` (a getter, so a test can change what the next read returns), plus `extra`. */
function serverFor(plan: () => PlanV2Detail, extra?: Handler): Handler {
  return (call, calls) => {
    const current = plan();
    const path = call.path.split("?")[0]!;
    if (call.method === "GET" && path === "/api/agent/plans/v2/summary") {
      return ok({ current: { goal: current.goal, goalKind: current.goalKind, planId: current.planId, score: current.score }, goals: [{ goal: current.goal, goalKind: current.goalKind, planId: current.planId, status: "active", talkedPeople: 0, total: current.score.total }] });
    }
    if (call.method === "GET" && path === "/api/agent/plans/intakes") return ok({ activeGoalLimit: 2, activeGoals: 1, intakes: [], newGoalsLeftThisMonth: 9 });
    if (call.method === "GET" && path === `/api/agent/plans/v2/${current.planId}`) return ok(current);
    return extra?.(call, calls);
  };
}

for (const goal of ["fund", "sales", "hire"] as const) {
  test(`${goal}: the v3 home replaces the R24 overview — head stage first, route, checklist, seats, evidence link; R24 entries below; nothing sent`, async (t) => {
    const plan = clone(mock[goal]);
    const { page, calls } = await open(t, serverFor(() => plan));
    const home = page.getByTestId("plan-home-v3");
    await home.waitFor();
    assert.equal(await page.getByTestId("score-head").count(), 0, "the R24 score head is not drawn");
    assert.equal(await page.getByTestId("plan-step").count(), 0, "the R24 step list is not drawn");
    const head = page.getByTestId("plan-home-head");
    assert.match(await head.innerText(), new RegExp(`目標 · ${plan.content.outcome}`));
    assert.match(await head.innerText(), /ステージ 1/);
    assert.match(await head.innerText(), new RegExp(`/ ${plan.content.steps.length}`));
    const found = plan.content.personTypes.filter((type) => !type.skipped).reduce((sum, type) => sum + Math.min(type.targetCount, plan.home!.seats!.find((seat) => seat.typeKey === type.key)?.people.length ?? 0), 0);
    const need = plan.content.personTypes.filter((type) => !type.skipped).reduce((sum, type) => sum + type.targetCount, 0);
    assert.equal(await page.getByTestId("plan-home-progress").innerText(), `人脈にいる ${found} / ${need} 人 · ${plan.score.total} / 100 点`);
    assert.equal(await page.getByTestId("plan-home-route").getByText(plan.content.steps[0]!.title, { exact: true }).count(), 1);
    assert.match(await home.innerText(), new RegExp(`まずはこの ${plan.home!.actions.length} 件から`));
    assert.match(await home.innerText(), new RegExp(plan.home!.lead!.slice(0, 12)));
    for (const action of plan.home!.actions) {
      const row = page.getByTestId(`plan-home-action-${action.actionKey}`);
      assert.match(await row.innerText(), new RegExp(action.title));
      assert.equal(await row.getByText(`ステージ ${action.stepNumber} · 先にやってもよい`).count(), action.stepNumber > 1 ? 1 : 0);
      assert.equal(await row.getByText(action.meta).count(), 1);
      assert.equal(await page.getByTestId(`plan-home-prep-${action.actionKey}`).count(), 0, "prep cards start folded (the design's default)");
    }
    for (const type of plan.content.personTypes) assert.equal(await page.getByTestId(`plan-home-seat-${type.key}`).count(), 1);
    assert.equal(await page.getByTestId("plan-home-seat-event").count(), 1);
    assert.match(await page.getByTestId("plan-home-evlink").innerText(), new RegExp(`${plan.content.sources!.length} 個の情報源`));
    // the R24 entry rows stay below the page body
    assert.equal(await page.getByTestId("plan-card").count(), 1, "見直し / 手動編集 / 達成 stay reachable");
    assert.deepEqual(writes(calls), []);
  });
}

test("no home block or a v2 plan: the R24 overview as before", async (t) => {
  const plan = clone(mock.fund);
  plan.home = null;
  const { page } = await open(t, serverFor(() => plan));
  await page.getByTestId("plan-overview").waitFor();
  assert.equal(await page.getByTestId("plan-home-v3").count(), 0);
  assert.equal(await page.getByTestId("score-head").count(), 1);
});

test("tick: optimistic, the action key URL-encoded in the path, kept on success, rolled back on failure", async (t) => {
  const plan = clone(mock.fund);
  const key = plan.home!.actions[0]!.actionKey;
  let failNext = false;
  const { page, calls } = await open(t, serverFor(() => plan, (call) => {
    if (call.method === "POST" && call.path === `/api/agent/plans/v2/plan_v16_fund/home/actions/${encodeURIComponent(key)}/done`) {
      if (failNext) return fail(500, "INTERNAL", "INTERNAL");
      const body = call.body as { done: boolean };
      const { seats: _seats, ...answer } = { ...plan.home!, actions: plan.home!.actions.map((action) => (action.actionKey === key ? { ...action, done: body.done } : action)) } as PlanHomeView;
      return ok(answer);
    }
    return undefined;
  }));
  const box = page.getByTestId(`plan-home-done-${key}`);
  await box.waitFor();
  assert.equal(key.includes(":"), true);
  await box.click();
  await page.getByTestId(`plan-home-tick-${key}`).waitFor();
  const done = calls.find((call) => call.method === "POST")!;
  assert.equal(done.path, `/api/agent/plans/v2/plan_v16_fund/home/actions/c%3Ac_v16_sato/done`);
  assert.deepEqual(Object.keys(done.body as object).sort(), ["done", "idempotencyKey"]);
  assert.equal((done.body as { done: boolean }).done, true);
  // the answer has no seats: the seat table keeps its people
  assert.match(await page.getByTestId("plan-home-progress").innerText(), /人脈にいる [1-9]/);

  failNext = true;
  await box.click();
  for (let step = 0; step < 40 && calls.filter((call) => call.method === "POST").length < 2; step++) await page.waitForTimeout(25);
  await page.getByTestId(`plan-home-tick-${key}`).waitFor();
  assert.equal(calls.filter((call) => call.method === "POST").length, 2);
  assert.equal((calls.filter((call) => call.method === "POST")[1]!.body as { done: boolean }).done, false, "the failed untick is rolled back to ticked");
});

test("prep card: one open at a time; rows / fact chip / why / underlined opener / copy; gaps go to the contact or the fact sheet", async (t) => {
  const plan = clone(mock.fund);
  const [sato, yamamoto, event] = plan.home!.actions as [PlanHomeView["actions"][number], PlanHomeView["actions"][number], PlanHomeView["actions"][number]];
  const { page, calls } = await open(t, serverFor(() => plan));
  await page.getByTestId(`plan-home-prep-toggle-${sato.actionKey}`).click();
  const card = page.getByTestId(`plan-home-prep-${sato.actionKey}`);
  await card.waitFor();
  assert.equal(await card.getByTestId("plan-home-row-who").count(), 1);
  assert.equal(await card.getByTestId("plan-home-row-met").count(), 1);
  assert.equal(await card.getByTestId("plan-home-row-last_contact").count(), 0, "no last contact → no row");
  assert.equal(await card.getByTestId(`plan-home-fact-${sato.prep!.usedFacts[0]!.id}`).count(), 1);
  assert.match(await card.innerText(), /あなたのメモ 09\/18/);
  assert.match(await card.innerText(), /なぜこう切り出すか/);
  assert.match(await card.innerText(), new RegExp(sato.prep!.hook.reason.slice(0, 10)));
  assert.equal(await card.getByTestId(`plan-home-draft-${sato.actionKey}`).innerText(), sato.prep!.draft.text);
  assert.equal(await card.getByTestId(`plan-home-stale-${sato.actionKey}`).count(), 0, "staleSince null → no 「情報が更新」");
  await card.getByTestId(`plan-home-copy-${sato.actionKey}`).click();
  await page.waitForFunction(() => (window as unknown as { copied?: string[] }).copied?.length === 1);
  assert.deepEqual(await page.evaluate(() => (window as unknown as { copied: string[] }).copied), [sato.prep!.draft.text]);
  assert.equal(await card.getByTestId("plan-home-gap-memo").count(), 0);

  // opening another closes the first
  await page.getByTestId(`plan-home-prep-toggle-${event.actionKey}`).click();
  await page.getByTestId(`plan-home-prep-${event.actionKey}`).waitFor();
  assert.equal(await page.getByTestId(`plan-home-prep-${sato.actionKey}`).count(), 0);
  assert.match(await page.getByTestId(`plan-home-prep-${event.actionKey}`).innerText(), /このイベントの準備|会場での切り出し/);
  assert.equal(await page.getByTestId(`plan-home-prep-${event.actionKey}`).getByTestId("plan-home-gap-interaction").count(), 0, "no gaps on an event");

  await page.getByTestId(`plan-home-prep-toggle-${yamamoto.actionKey}`).click();
  const second = page.getByTestId(`plan-home-prep-${yamamoto.actionKey}`);
  await second.getByTestId("plan-home-gap-memo").waitFor();
  await second.getByTestId("plan-home-gap-interaction").click();
  await page.getByTestId("elsewhere").waitFor();
  assert.equal(await page.getByTestId("elsewhere").innerText(), `/contacts/${encodeURIComponent(yamamoto.contactId!)}`);
  assert.deepEqual(writes(calls), []);
});

test("「+ そのとき話したことを一言書く」: the sheet saves ≤80 characters to /api/contacts/[id]/facts, then the card turns stale", async (t) => {
  let plan = clone(mock.fund);
  const yamamoto = plan.home!.actions[1]!;
  const { page, calls } = await open(t, serverFor(() => plan, (call) => {
    if (call.method === "POST" && call.path === `/api/contacts/${encodeURIComponent(yamamoto.contactId!)}/facts`) {
      plan = clone(plan);
      plan.home!.actions[1]!.prep!.staleSince = "2026-11-03T00:00:00.000Z";
      return ok({ factId: "fx_new", staleCards: 1, text: (call.body as { text: string }).text }, 201);
    }
    return undefined;
  }));
  await page.getByTestId(`plan-home-prep-toggle-${yamamoto.actionKey}`).click();
  await page.getByTestId("plan-home-gap-memo").click();
  const sheet = page.getByTestId("plan-home-fact-sheet");
  await sheet.waitFor();
  const save = sheet.getByRole("button", { name: "追加" });
  assert.equal(await save.getAttribute("aria-disabled"), "true", "empty → cannot save");
  await page.getByTestId("plan-home-fact-input").fill("あ".repeat(81));
  assert.equal(await save.getAttribute("aria-disabled"), "true", "81 characters → cannot save");
  await page.getByTestId("plan-home-fact-input").fill("  上海で 3 年働いていた  ");
  await save.click();
  await page.getByTestId(`plan-home-stale-${yamamoto.actionKey}`).waitFor();
  const post = calls.find((call) => call.method === "POST")!;
  assert.equal(post.path, `/api/contacts/c_v16_yamamoto/facts`);
  assert.equal((post.body as { text: string }).text, "上海で 3 年働いていた");
  assert.deepEqual(Object.keys(post.body as object).sort(), ["idempotencyKey", "text"]);
});

test("stale card: 作り直す sends regenerate; 409 LIMIT keeps the card and says the limit instead of the button", async (t) => {
  const plan = clone(mock.sales);
  const action = plan.home!.actions[0]!;
  action.prep!.staleSince = "2026-11-03T00:00:00.000Z";
  const { page, calls } = await open(t, serverFor(() => plan, (call) => {
    if (call.method === "POST" && call.path === `/api/agent/plans/v2/${plan.planId}/home/actions/${encodeURIComponent(action.actionKey)}/regenerate`) return fail(409, "CONFLICT", "LIMIT");
    return undefined;
  }));
  await page.getByTestId(`plan-home-prep-toggle-${action.actionKey}`).click();
  const stale = page.getByTestId(`plan-home-stale-${action.actionKey}`);
  await stale.waitFor();
  assert.match(await stale.innerText(), /情報が更新されました/);
  await page.getByTestId(`plan-home-regenerate-${action.actionKey}`).click();
  await page.waitForFunction((testId) => !document.querySelector(`[data-testid="${testId}"]`), `plan-home-regenerate-${action.actionKey}`);
  assert.match(await stale.innerText(), /今日の AI の回数を使い切りました/);
  assert.equal(await page.getByTestId(`plan-home-draft-${action.actionKey}`).innerText(), action.prep!.draft.text, "the card is unchanged");
  assert.deepEqual(Object.keys(calls.find((call) => call.method === "POST")!.body as object), ["idempotencyKey"]);
});

test("stale card: a successful regenerate clears 「情報が更新」", async (t) => {
  const plan = clone(mock.hire);
  const action = plan.home!.actions[0]!;
  action.prep!.staleSince = "2026-11-03T00:00:00.000Z";
  const { page } = await open(t, serverFor(() => plan, (call) => {
    if (call.method === "POST" && call.path.endsWith(`/home/actions/${encodeURIComponent(action.actionKey)}/regenerate`)) {
      const { seats: _seats, ...answer } = clone(plan.home!);
      answer.actions[0]!.prep!.staleSince = null;
      return ok(answer);
    }
    return undefined;
  }));
  await page.getByTestId(`plan-home-prep-toggle-${action.actionKey}`).click();
  await page.getByTestId(`plan-home-regenerate-${action.actionKey}`).click();
  await page.waitForFunction((testId) => !document.querySelector(`[data-testid="${testId}"]`), `plan-home-stale-${action.actionKey}`);
  assert.equal(await page.getByTestId(`plan-home-prep-${action.actionKey}`).count(), 1, "the card stays open");
});

test("seats: a row opens who they are, the people already met or where to meet, and the three questions; one at a time", async (t) => {
  const plan = clone(mock.fund);
  const met = plan.content.personTypes.find((type) => (plan.home!.seats!.find((seat) => seat.typeKey === type.key)?.people.length ?? 0) > 0)!;
  const where = plan.content.personTypes.find((type) => { const seat = plan.home!.seats!.find((entry) => entry.typeKey === type.key); return seat && !seat.people.length && seat.meetAt; })!;
  const none = plan.content.personTypes.find((type) => { const seat = plan.home!.seats!.find((entry) => entry.typeKey === type.key); return seat && !seat.people.length && !seat.meetAt; })!;
  const { page } = await open(t, serverFor(() => plan));
  await page.getByTestId(`plan-home-seat-${met.key}`).click();
  const detail = page.getByTestId(`plan-home-seat-detail-${met.key}`);
  await detail.waitFor();
  assert.match(await detail.innerText(), /どんな人か/);
  assert.match(await detail.innerText(), /すでに人脈にいる/);
  assert.match(await detail.innerText(), new RegExp(plan.home!.seats!.find((seat) => seat.typeKey === met.key)!.people[0]!.name));
  for (const question of met.questions) assert.match(await detail.innerText(), new RegExp(question.slice(0, 6)));
  await page.getByTestId(`plan-home-seat-${where.key}`).click();
  assert.equal(await page.getByTestId(`plan-home-seat-detail-${met.key}`).count(), 0);
  assert.match(await page.getByTestId(`plan-home-seat-detail-${where.key}`).innerText(), new RegExp(`「${plan.home!.seats!.find((seat) => seat.typeKey === where.key)!.meetAt}」で知り合えます`));
  await page.getByTestId(`plan-home-seat-${none.key}`).click();
  assert.match(await page.getByTestId(`plan-home-seat-detail-${none.key}`).innerText(), /近いイベントにもこのタイプの参加者は明記されていません/);
});

test("evidence: the link opens the draft's evidence card (order reasons, ladder) and 閉じる folds it back", async (t) => {
  const plan = clone(mock.fund);
  const { page } = await open(t, serverFor(() => plan));
  await page.getByTestId("plan-home-evlink").click();
  const evidence = page.getByTestId("plan-home-evidence");
  await evidence.waitFor();
  assert.match(await evidence.innerText(), new RegExp(plan.content.orderReasons![0]!.text.slice(0, 10)));
  await page.getByTestId("plan-home-evidence-close").click();
  await page.getByTestId("plan-home-evlink").waitFor();
});

test("evidence: a library source shows the title from citations and links to its source (R38-04)", async (t) => {
  const citation = { id: "L-101", sourceLabel: "JETRO", sourcePublishedOn: "2026-04-01", sourceUrl: "https://example.com/l-101", summary: "概要", title: "日本の VC 投資額の推移", updatedOn: "2026-05-01", version: 2 };
  const plan = { ...clone(mock.fund), citations: [citation] };
  plan.content = { ...plan.content, sources: [{ id: "S1", kind: "landscape", landscapeId: "L-101", version: 2 }] };
  const { page } = await open(t, serverFor(() => plan));
  await page.getByTestId("plan-home-evlink").click();
  await page.getByTestId("draft-v3-toggle").click();
  const more = page.getByTestId("draft-v3-more");
  await more.waitFor();
  const text = await more.innerText();
  assert.match(text, /日本の VC 投資額の推移/);
  assert.doesNotMatch(text, /L-101/);
});

test("準備中: the overview is read again every 3 s, at most 10 times", async (t) => {
  const plan = clone(mock.fund);
  plan.home = { actions: [], lead: null, seats: plan.home!.seats, state: "pending" };
  const { page, calls } = await open(t, serverFor(() => plan), { clock: true });
  await page.getByTestId("plan-home-preparing").waitFor();
  assert.equal(await page.getByTestId("plan-home-go-meet").count(), 0);
  const first = overviewReads(calls, plan.planId);
  await page.clock.runFor(3100);
  await page.clock.runFor(3100);
  for (let step = 0; step < 40 && overviewReads(calls, plan.planId) < first + 2; step++) await page.waitForTimeout(25);
  assert.equal(overviewReads(calls, plan.planId), first + 2);
  for (let index = 0; index < 12; index++) {
    await page.clock.runFor(3100);
    for (let step = 0; step < 10; step++) await page.waitForTimeout(10);
  }
  assert.equal(overviewReads(calls, plan.planId), first + 10, "stops after 10 reads");
  assert.deepEqual(writes(calls), []);
});

test("ready with nothing to do: only the 「去认识」 hint", async (t) => {
  const plan = clone(mock.hire);
  plan.home = { ...plan.home!, actions: [], lead: null };
  const { page } = await open(t, serverFor(() => plan));
  await page.getByTestId("plan-home-go-meet").waitFor();
  assert.match(await page.getByTestId("plan-home-v3").innerText(), /まずはこの 0 件から/);
  assert.equal(await page.getByTestId("plan-home-preparing").count(), 0);
});
