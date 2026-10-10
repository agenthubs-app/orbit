import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import type { PlanDraftView, PlanIntakeView } from "../src/api/contract/plan-v2";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

// R23 (UI-SPEC ①–③): the App plan screens rendered for real with react-native-web
// in Chromium — Task › プラン (goal input / confirmed card), the flow page and the
// manual edit page. The server is a scripted stand-in (`planServer`, run in Node)
// that answers with the orbits mock service's own payloads and records every
// request, so the tests can assert which actions send nothing.
const root = new URL("..", import.meta.url).pathname;
const mock = JSON.parse(readFileSync(join(root, "tests/fixtures/plan-flow-mock.json"), "utf8"));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; body: unknown };
type Handler = (call: Call, calls: Call[]) => Reply | undefined;

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, code: string, context: Record<string, string>): Reply => ({ body: { error: { code, context, message: "x" }, success: false }, status });

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { PlanSegment } from "./src/screens/plan/PlanSegment";
import { PlanFlowScreen } from "./src/screens/plan/PlanFlowScreen";
import { PlanManualEditScreen } from "./src/screens/plan/PlanManualEditScreen";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
function Root() {
  const [path, setPath] = React.useState(window.planNav.path);
  window.planNav.setPath = setPath;
  const flow = path.match(/^\\/plans\\/flow\\/([^/?]+)/);
  const edit = path.match(/^\\/plans\\/drafts\\/([^/]+)\\/edit/);
  const screen = flow ? <PlanFlowScreen key={path} intakeId={decodeURIComponent(flow[1])} />
    : edit ? <PlanManualEditScreen key={path} draftId={decodeURIComponent(edit[1])} />
    : <PlanSegment key={path} />;
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
    plugins: [nativeUiStubs, { name: "plan-screens", setup(plugin) {
      // react-native-web plus the one thing the dialogs need that the browser lacks (focus moves via findNodeHandle).
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

const summaryEmpty = { current: null, goals: [] };
const intakesEmpty = { activeGoalLimit: 2, activeGoals: 0, intakes: [], newGoalsLeftThisMonth: 9 };
const segmentReads: Handler = (call) => {
  if (call.method === "GET" && call.path === "/api/agent/plans/v2/summary") return ok(summaryEmpty);
  if (call.method === "GET" && call.path === "/api/agent/plans/intakes") return ok(intakesEmpty);
  return undefined;
};
const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);

function intakeAt(stage: "background" | "questions" | "premise" | "drafted"): PlanIntakeView {
  const source = stage === "background" ? mock.intakeBackground : stage === "questions" ? mock.intakeQuestions : mock.intakePremise;
  const intake = clone(source) as PlanIntakeView & { href: string };
  intake.href = "/plans/flow/intake_f1";
  if (stage === "drafted") return { ...intake, draftId: "draft_f2", status: "drafted" };
  return intake;
}
const draftWith = (used: number): PlanDraftView => {
  const draft = clone(used > 0 ? mock.draftFixed : mock.draft) as PlanDraftView;
  return { ...draft, aiFixUsed: used, manualEditAvailable: true };
};

test("goal input: the type is guessed after a pause, a picked chip is never overridden, and the sample card sends nothing", async (t) => {
  const { page, calls } = await open(t, "/task", (call) => segmentReads(call, []) ?? (call.path === "/api/agent/plans/goal-kind" ? ok({ goalKind: "fundraising", source: "ai" }) : undefined));
  await page.getByText("何を達成したいですか？").waitFor();
  await page.getByText("人物タイプは、こう具体的になります").waitFor();
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`).sort(), ["GET /api/agent/plans/intakes", "GET /api/agent/plans/v2/summary"], "opening the segment (and the sample card) only reads");
  for (const call of calls) {
    assert.equal(call.headers["x-orbit-lang"], "ja");
    assert.equal(call.headers["x-orbit-platform"], "app");
  }
  await page.getByLabel("目標", { exact: true }).fill("シリーズA の資金調達をしたい");
  await page.waitForTimeout(1000);
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/goal-kind"]);
  assert.equal(await page.getByRole("radio", { name: "💰 資金調達" }).getAttribute("aria-checked"), "true");
  // The user picks another chip: later guesses never override it (and are not even asked).
  await page.getByRole("radio", { name: "🤝 新規開拓" }).click();
  await page.getByLabel("目標", { exact: true }).fill("シリーズA の資金調達を年内にしたい");
  await page.waitForTimeout(1000);
  assert.deepEqual(writes(calls), ["POST /api/agent/plans/goal-kind"], "no second guess after a manual pick");
  assert.equal(await page.getByRole("radio", { name: "🤝 新規開拓" }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByRole("radio", { name: "💰 資金調達" }).getAttribute("aria-checked"), "false");
});

test("goal input: the monthly limit is explained up front and the button is disabled", async (t) => {
  const { page } = await open(t, "/task", (call) => call.path === "/api/agent/plans/intakes" ? ok({ ...intakesEmpty, newGoalsLeftThisMonth: 0 }) : segmentReads(call, []));
  await page.getByText("今月はこれ以上新しい目標を作れません。").waitFor();
  assert.equal(await page.getByRole("button", { name: "iOrbit と具体化する" }).getAttribute("aria-disabled"), "true");
});

test("background: わたし is open (確認中), チーム and 目的 wait as dashed drafts, in that order", async (t) => {
  const intake = intakeAt("background");
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intake) : undefined);
  await page.getByText("確認中").waitFor();
  const text = await page.locator("#root").innerText();
  const order = await Promise.all(["わたし", "チーム", "目的"].map(async (label) => (await page.locator(`[aria-label="${label}"]`).boundingBox())!.y));
  assert.ok(order[0]! < order[1]! && order[1]! < order[2]!, JSON.stringify(order));
  assert.match(text, /下書き：チーム 2名 · 空き 4/);
  assert.match(text, /下書き：3段目「/);
  assert.equal(await page.getByRole("button", { name: "わたしを確定 → チームへ" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).count(), 0, "questions wait for all three blocks");
});

test("わたし: no stance from the AI → none pre-selected and the confirm button waits for one (m9)", async (t) => {
  const intake = intakeAt("background");
  intake.background.me.value.stance = null;
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intake) : undefined);
  const confirm = page.getByRole("button", { name: "わたしを確定 → チームへ" });
  await confirm.waitFor();
  for (const name of ["代表・オーナー", "共同創業者", "社内の担当者", "個人として"]) assert.equal(await page.getByRole("radio", { name }).getAttribute("aria-checked"), "false", name);
  assert.equal(await confirm.getAttribute("aria-disabled"), "true");
  await page.getByRole("radio", { name: "個人として" }).click();
  assert.equal(await confirm.getAttribute("aria-disabled"), null);
});

test("わたし: a stance from the AI is pre-selected", async (t) => {
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("background")) : undefined);
  await page.getByRole("button", { name: "わたしを確定 → チームへ" }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "共同創業者" }).getAttribute("aria-checked"), "true");
});

test("premise after a draft: with AI revisions a change asks first (history is discarded); without revisions it opens directly (m16)", async (t) => {
  const revised = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("drafted")) : call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(1)) : undefined);
  await revised.page.getByRole("button", { name: "すべて見る" }).click();
  await revised.page.getByRole("button", { name: "現在地を直す" }).click();
  await revised.page.getByText("この案と修正履歴は破棄されます。初版はつくり直しますが、回数には含みません。").waitFor();
  await revised.page.getByRole("button", { name: "直す", exact: true }).click();
  await revised.page.getByRole("button", { name: "この内容にする" }).waitFor();

  const fresh = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("drafted")) : call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(0)) : undefined);
  await fresh.page.getByRole("button", { name: "すべて見る" }).click();
  await fresh.page.getByRole("button", { name: "現在地を直す" }).click();
  await fresh.page.getByRole("button", { name: "この内容にする" }).waitFor();
  assert.equal(await fresh.page.getByText("この案と修正履歴は破棄されます", { exact: false }).count(), 0);
});

test("AI_BUSY: no failure card — 「処理中です…」, then one more read of the intake and draft after 2 s", async (t) => {
  const { page, calls } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intakeAt("drafted"));
    if (call.path === "/api/agent/plans/drafts/draft_f2") return ok(draftWith(0));
    if (call.path === "/api/agent/plans/drafts/draft_f2/fix") return fail(409, "CONFLICT", { reason: "AI_BUSY" });
    return undefined;
  });
  await page.getByText("あと 3 回").waitFor();
  const reads = () => calls.filter((call) => call.method === "GET").length;
  const before = reads();
  await page.getByLabel("AI に頼む修正").fill("営業は 2人で");
  await page.getByRole("button", { name: "修正を頼む" }).click();
  await page.getByText("処理中です。少し待ってから読み直します。").waitFor();
  assert.equal(await page.getByText("修正できませんでした").count(), 0);
  await page.waitForTimeout(1500);
  assert.equal(reads(), before, "nothing is read before 2 s");
  await page.waitForTimeout(1200);
  assert.equal(reads(), before + 2, "one GET of the intake and one of the draft");
});

test("team: ticking a capability updates 空き at once and sends nothing", async (t) => {
  const intake = intakeAt("background");
  intake.background.me.confirmedAt = "2026-10-07T01:00:06.000Z";
  const { page, calls } = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intake) : undefined);
  await page.getByRole("button", { name: "チームを確定 → 目的へ" }).waitFor();
  const gaps = () => page.getByText("空き", { exact: true }).count();
  assert.equal(await gaps(), 4);
  const before = calls.length;
  await page.getByRole("checkbox", { name: "Orbit デモ · ブランド" }).click();
  assert.equal(await gaps(), 3);
  await page.getByRole("checkbox", { name: "Orbit デモ · ブランド" }).click();
  await page.getByRole("tab", { name: "一人" }).click();
  assert.equal(await gaps(), 5, "一人: the co-founder's product and design no longer count");
  assert.equal(calls.length, before, "ticks and the solo switch never send a request");
});

test("questions: guesses are pre-selected, choices send nothing, and 「まとめて回答する」 sends once", async (t) => {
  const intake = intakeAt("questions");
  intake.questions = intake.questions!.map((question) => question.id === "R1" ? { ...question, guess: { text: null, values: ["beta"] } } : question);
  let answers = 0;
  const { page, calls } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intake);
    if (call.path === "/api/agent/plans/intakes/intake_f1/answers") { answers += 1; return ok(intakeAt("premise")); }
    return undefined;
  });
  await page.getByText("あと 5 つだけ、確認させてください").waitFor();
  assert.equal(await page.getByRole("radio", { name: "完成・β 運用中 推測" }).getAttribute("aria-checked"), "true");
  await page.getByRole("checkbox", { name: "仲間に入れる" }).click();
  await page.getByRole("radio", { name: "法人" }).click();
  assert.deepEqual(writes(calls), []);
  const submit = page.getByRole("button", { name: "まとめて回答する（5問）" });
  await submit.dblclick();
  await page.getByText("確定した前提").waitFor();
  assert.equal(answers, 1);
  const body = calls.find((call) => call.path.endsWith("/answers"))!.body as { answers: { questionId: string; values: string[] }[] };
  assert.deepEqual(body.answers.find((answer) => answer.questionId === "R1")!.values, ["beta"]);
  assert.deepEqual(body.answers.find((answer) => answer.questionId === "R7")!.values, ["recruit"]);
  assert.deepEqual(body.answers.find((answer) => answer.questionId === "R2")!.values, ["businesses"]);
});

test("premise: tap a row, pick an option, save → PATCH …/premise with the row key", async (t) => {
  const intake = intakeAt("premise");
  const { page, calls } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intake);
    if (call.path === "/api/agent/plans/intakes/intake_f1/premise") {
      const edited = clone(intake);
      edited.premise = edited.premise!.map((row) => row.key === "R1" ? { ...row, guessed: false, value: "有料あり" } : row);
      edited.premiseVersion += 1;
      return ok(edited);
    }
    return undefined;
  });
  await page.getByRole("button", { name: "現在地を直す" }).click();
  await page.getByRole("radio", { name: "有料あり" }).click();
  await page.getByRole("button", { name: "この内容にする" }).click();
  await page.getByText("有料あり", { exact: true }).waitFor();
  const patch = calls.find((call) => call.method === "PATCH")!;
  assert.equal(patch.path, "/api/agent/plans/intakes/intake_f1/premise");
  assert.deepEqual({ key: (patch.body as { key: string }).key, value: (patch.body as { value: string }).value }, { key: "R1", value: "有料あり" });
  assert.equal(await page.getByRole("button", { name: "この前提で初版をつくる" }).count(), 1);
});

test("first draft hitting AI_LIMIT shows the limit text, not the failure card", async (t) => {
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intakeAt("premise"));
    if (call.path === "/api/agent/plans/intakes/intake_f1/draft") return fail(409, "CONFLICT", { limit: "daily", reason: "AI_LIMIT", retryOn: "2026-10-11" });
    return undefined;
  });
  await page.getByRole("button", { name: "この前提で初版をつくる" }).click();
  await page.getByText("今日はここまでです · 明日また使えます。").waitFor();
  assert.equal(await page.getByText("初版をつくれませんでした").count(), 0);
});

test("first draft failing (AI_FAILED) shows the failure card with 再試行", async (t) => {
  let tries = 0;
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intakeAt("premise"));
    if (call.path === "/api/agent/plans/intakes/intake_f1/draft") { tries += 1; return tries === 1 ? fail(503, "SERVICE_UNAVAILABLE", { reason: "AI_FAILED" }) : ok(draftWith(0), 201); }
    return undefined;
  });
  await page.getByRole("button", { name: "この前提で初版をつくる" }).click();
  await page.getByText("初版をつくれませんでした").waitFor();
  await page.getByText("何も保存していません。").waitFor();
  await page.getByRole("button", { name: "再試行" }).click();
  await page.getByText("AI の初版 · 方案").waitFor();
  assert.equal(tries, 2);
});

test("fix bar: shows the revisions left; at 0 the field is disabled and only edit / confirm remain", async (t) => {
  const left = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("drafted")) : call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(1)) : undefined);
  await left.page.getByText("あと 2 回").waitFor();
  assert.equal(await left.page.getByLabel("AI に頼む修正").isEditable(), true);
  // The citations are collapsed on the App.
  await left.page.getByRole("button", { name: "この案で参考にした業界の現状 2件" }).waitFor();
  assert.equal(await left.page.getByText("L-103", { exact: true }).count(), 0);

  const out = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("drafted")) : call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(3)) : undefined);
  await out.page.getByText("あと 0 回").waitFor();
  await out.page.getByText("修正は使い切りました。手動で編集するか、この内容で確定します。").waitFor();
  assert.equal(await out.page.getByLabel("AI に頼む修正").isEditable(), false);
  assert.equal(await out.page.getByRole("button", { name: "修正を頼む" }).getAttribute("aria-disabled"), "true");
  assert.equal(await out.page.getByRole("button", { name: "手動で編集" }).getAttribute("aria-disabled"), null);
});

test("fix: one revision sends the text once and shows only the diff", async (t) => {
  let fixes = 0;
  const { page, calls } = await open(t, "/plans/flow/intake_f1", (call) => {
    if (call.path === "/api/agent/plans/intakes/intake_f1") return ok(intakeAt("drafted"));
    if (call.path === "/api/agent/plans/drafts/draft_f2") return ok(draftWith(0));
    if (call.path === "/api/agent/plans/drafts/draft_f2/fix") { fixes += 1; return ok(draftWith(1)); }
    return undefined;
  });
  await page.getByText("あと 3 回").waitFor();
  await page.getByLabel("AI に頼む修正").fill("営業は当面 2人でやる");
  await page.getByRole("button", { name: "修正を頼む" }).click();
  await page.getByText("AI 修正 1 / 3 を反映").waitFor();
  await page.getByText("あと 2 回").waitFor();
  assert.equal(fixes, 1);
  assert.equal((calls.find((call) => call.path.endsWith("/fix"))!.body as { text: string }).text, "営業は当面 2人でやる");
  await page.getByText("変わらない点：見立てと結論 · 人物タイプと配点").waitFor();
  await page.getByRole("button", { name: "1：営業は当面 2人でやる" }).waitFor();
});

test("manual edit: an allocation change keeps the total at 100, removing a type shows where its points go", async (t) => {
  const { page, calls } = await open(t, "/plans/drafts/draft_f2/edit", (call) => call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(1)) : undefined);
  await page.getByText("人物タイプと配点").waitFor();
  const points = page.getByLabel("E 足りない専門の配点");
  await points.fill("15");
  await points.press("Enter");
  await page.getByText("10 → 15", { exact: true }).waitFor();
  await page.getByText("25 → 20", { exact: true }).waitFor();
  assert.equal(await page.getByText("100 / 100", { exact: true }).count(), 1);
  await page.getByText("合計 100 / 100 · 変更 2件 · 手動編集は 1回だけ").waitFor();
  // Not a multiple of 5: refused with a note, nothing moves.
  await points.fill("17");
  await points.press("Enter");
  await page.getByText("配点は 5点刻みで入力してください").waitFor();
  // Remove C: the sheet lists the reflow before anything changes.
  await page.getByRole("button", { name: "C 先行プロダクト経験を外す" }).click();
  await page.getByText("タイプ C を外しますか？").waitFor();
  await page.getByText("15点を 5点ずつ、配点の高いタイプから順に配り直します。").waitFor();
  await page.getByRole("button", { name: "外す", exact: true }).click();
  await page.getByText("タイプ C を外しますか？").waitFor({ state: "detached" });
  assert.equal(await page.getByText("100 / 100", { exact: true }).count(), 1);
  assert.equal(await page.getByLabel("C 先行プロダクト経験の配点").count(), 0);
  // 元に戻す: back to the AI plan, locally.
  await page.getByRole("button", { name: "元に戻す" }).click();
  await page.getByLabel("C 先行プロダクト経験の配点").waitFor();
  assert.deepEqual(writes(calls), [], "editing sends nothing until 「このプランで始める」");
});

test("empty state → confirmed: goal, background, questions, premise, first draft, confirm, back to Task › プラン", async (t) => {
  let intake = intakeAt("background");
  let confirmed = false;
  const at = (n: number) => `2026-10-07T02:00:0${n}.000Z`;
  const { page, calls } = await open(t, "/task", (call) => {
    const path = call.path;
    if (call.method === "GET" && path === "/api/agent/plans/v2/summary") {
      return ok(confirmed ? { current: { goal: intake.goal, goalKind: "launch", planId: "plan_1", score: { overflow: 0, remainingToFull: 100, segments: [], skipped: 0, talked: 0, todayDelta: 0, total: 0 } }, goals: [] } : summaryEmpty);
    }
    if (call.method === "GET" && path === "/api/agent/plans/intakes") return ok(intakesEmpty);
    if (path === "/api/agent/plans/goal-kind") return ok({ goalKind: "launch", source: "rule" });
    if (call.method === "POST" && path === "/api/agent/plans/intakes") return ok(intake, 201);
    if (call.method === "GET" && path === "/api/agent/plans/intakes/intake_f1") return ok(intake);
    if (call.method === "PATCH" && path === "/api/agent/plans/intakes/intake_f1") {
      const body = call.body as { block: "me" | "team" | "purpose" };
      intake = clone(intake);
      intake.background[body.block].confirmedAt = at(calls.length % 10);
      intake.updatedAt = at(calls.length % 10);
      return ok(intake);
    }
    if (path === "/api/agent/plans/intakes/intake_f1/questions") { intake = intakeAt("questions"); return ok(intake); }
    if (path === "/api/agent/plans/intakes/intake_f1/answers") { intake = intakeAt("premise"); return ok(intake); }
    if (path === "/api/agent/plans/intakes/intake_f1/draft") { intake = intakeAt("drafted"); return ok(draftWith(0), 201); }
    if (path === "/api/agent/plans/drafts/draft_f2/confirm") { confirmed = true; return ok({ archivedV1PlanId: null, href: "/task?seg=plan&plan=plan_1", planId: "plan_1", replayed: false }, 201); }
    return undefined;
  });
  await page.getByLabel("目標", { exact: true }).fill("Orbit を落地して黒字化したい");
  await page.getByRole("button", { name: "iOrbit と具体化する" }).click();
  await page.getByRole("button", { name: "わたしを確定 → チームへ" }).click();
  await page.getByRole("button", { name: "チームを確定 → 目的へ" }).click();
  await page.getByRole("button", { name: "目的を確定" }).click();
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).click();
  await page.getByRole("button", { name: "まとめて回答する（5問）" }).click();
  await page.getByRole("button", { name: "この前提で初版をつくる" }).click();
  await page.getByRole("button", { name: "この内容で確定" }).click();
  await page.getByText("プランを確定しました。").waitFor();
  const navigation = await page.evaluate(() => (window as unknown as { planNav: { navigation: unknown[] } }).planNav.navigation);
  assert.deepEqual(navigation, [{ href: "/plans/flow/intake_f1", method: "push" }, { href: "/task?seg=plan&plan=plan_1", method: "replace" }]);
  const create = calls.find((call) => call.method === "POST" && call.path === "/api/agent/plans/intakes")!.body as Record<string, unknown>;
  assert.deepEqual({ goalKind: create.goalKind, goalText: create.goalText, source: create.source }, { goalKind: "launch", goalText: "Orbit を落地して黒字化したい", source: "task" });
  assert.equal(typeof create.idempotencyKey, "string");
  assert.deepEqual(writes(calls).filter((line) => line !== "POST /api/agent/plans/goal-kind"), [
    "POST /api/agent/plans/intakes",
    "PATCH /api/agent/plans/intakes/intake_f1",
    "PATCH /api/agent/plans/intakes/intake_f1",
    "PATCH /api/agent/plans/intakes/intake_f1",
    "POST /api/agent/plans/intakes/intake_f1/questions",
    "POST /api/agent/plans/intakes/intake_f1/answers",
    "POST /api/agent/plans/intakes/intake_f1/draft",
    "POST /api/agent/plans/drafts/draft_f2/confirm",
  ]);
});

test("dark theme renders the flow without errors", async (t) => {
  const { page } = await open(t, "/plans/flow/intake_f1", (call) => call.path === "/api/agent/plans/intakes/intake_f1" ? ok(intakeAt("drafted")) : call.path === "/api/agent/plans/drafts/draft_f2" ? ok(draftWith(1)) : undefined, { dark: true });
  await page.getByText("AI の初版 · 方案").waitFor();
  const background = await page.evaluate(() => getComputedStyle(document.querySelector("#root > div") ?? document.body).backgroundColor);
  assert.ok(background, "rendered");
});
