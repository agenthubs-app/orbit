import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { nativeUiStubs } from "./helpers/native-ui-stubs";

const require = createRequire(import.meta.url);
let browser: Browser;
let script = "";
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0, keyIndex = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = { actor: "actor:one", baseUrl: "https://orbit.example", open: true, offline: false,
  available: true, appointmentId: undefined, requests: [], pending: [], sent: [], failOnce: false, hold: false,
  tamperReadback: false, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  reply(index, status = 200) {
    const request = state.requests[index];
    const proposal = request.body.proposal;
    const previous = state.appointmentId ? state.meeting.proposals : [];
    const item = { ...state.meeting, status: state.appointmentId ? "reschedule_pending" : "awaiting_response",
      confirmed: state.appointmentId ? state.meeting.confirmed : null, version: state.appointmentId ? 5 : 2,
      pendingProposalRevision: state.appointmentId ? 2 : 1, replayed: false,
      proposals: [...previous, { ...proposal, createdAt: new Date().toISOString(), proposedBy: "you",
        revision: state.appointmentId ? 2 : 1, candidateTimes: proposal.candidateTimes.map((value, i) => ({ ...value, candidateId: "candidate:" + i })) }] };
    if (status === 200) state.receipt = item;
    state.pending[index]?.(new Response(JSON.stringify(status === 200 ? { success: true, data: item } : { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Retry" } }),
      { status, headers: { "content-type": "application/json" } }));
  }
};
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = init.method ?? "GET";
  const index = state.requests.length;
  state.requests.push({ url: String(input), method, path: url.pathname, signal: init.signal,
    body: init.body ? JSON.parse(init.body) : null, headers: Object.fromEntries(new Headers(init.headers).entries()) });
  if (method === "GET") {
    const data = url.pathname.endsWith("initial-proposal") ? { contactId: "contact:one", available: state.available }
      : state.receipt ? { ...state.receipt, ...(state.tamperReadback ? { version: 99 } : {}) } : state.meeting;
    return Response.json({ success: true, data });
  }
  return new Promise(resolve => { state.pending[index] = resolve; if (!state.hold) queueMicrotask(() => {
    const status = state.failOnce ? 503 : 200; state.failOnce = false; state.reply(index, status);
  }); });
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: true, signedIn: true, actorId: state.actor, accountId: state.actor, offline: state.offline, cookieHeader: "" }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: true, baseUrl: state.baseUrl }; };
export const useOrbitTimeZone = () => ({ timeZone: "Asia/Tokyo", canSave: true });
export const randomUUID = () => "proposal-key-" + ++keyIndex;
export const Ionicons = () => <span />;
export const useSafeAreaInsets = () => ({ top: 24, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = View;
`;

test.before(async () => {
  const built = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
      import { MeetingProposalSheet } from "./src/screens/calendar/MeetingProposalSheet"; import { useFixture } from "fixture";
      function App() { const state = useFixture(); return <MeetingProposalSheet open={state.open} contactId="contact:one"
        appointmentId={state.appointmentId} initialCandidates={state.candidates} onSent={id => state.sent.push(id)} onClose={() => state.update({ open: false })} />; }
      createRoot(document.getElementById("root")).render(<App />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __DEV__: "false", "process.env.NODE_ENV": '"test"', "process.env": "{}" },
    plugins: [nativeUiStubs, { name: "proposal-browser-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider)$/ }, () => ({ path: "fixture", namespace: "proposal" }));
      plugin.onLoad({ filter: /.*/, namespace: "proposal" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = built.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

const slot = (days: number) => {
  const startsAt = new Date(Date.now() + days * 86_400_000).toISOString();
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() };
};

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", locale: "ja-JP" });
  page.setDefaultTimeout(3_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  const meeting = { appointmentId: "appointment:one", contactId: "contact:one", eventId: "event:one", title: "Meeting", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
    confirmed: { startsAtUtc: slot(-2).startsAt, durationMinutes: 30, medium: { kind: "phone", phoneHint: null }, timezone: "Asia/Tokyo" },
    proposals: [{ createdAt: new Date().toISOString(), durationMinutes: 30, medium: { kind: "phone", phoneHint: null }, note: "", proposedBy: "you", revision: 1, timezone: "Asia/Tokyo" }],
    status: "confirmed", updatedAt: new Date().toISOString(), version: 4, visibility: "participants" };
  await page.evaluate(value => { (window as unknown as { initialFixture: unknown }).initialFixture = value; }, { meeting, candidates: [slot(1), slot(2), slot(3)], ...patch });
  await page.addScriptTag({ content: script });
  return page;
}

async function review(page: Page) {
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("textbox", { name: "場所", exact: true }).fill("Tokyo");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
}

test("initial sheet requires accepted authority and does not expose candidates when unavailable", async t => {
  const page = await open(t, { available: false });
  await page.getByText("この連絡先からはまだ面談を送れません。面談の作成に必要な情報がありません。", { exact: true }).waitFor();
  assert.equal(await page.getByText("候補 1", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((value: any) => value.method === "POST").length), 0);
});

for (const mode of ["initial", "reschedule"] as const) {
  test(`${mode} close/reopen revokes an uncertain send but retries its original identity`, async t => {
    const page = await open(t, { hold: true, ...(mode === "reschedule" ? { appointmentId: "appointment:one" } : {}) });
    await review(page);
    const sendLabel = mode === "initial" ? "候補を提案" : "改期を提案";
    await page.getByRole("button", { name: sendLabel, exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.requests.some((value: any) => value.method === "POST"));
    await page.evaluate(() => (window as any).fixture.update({ open: false }));
    await page.getByText("面談の日程提案", { exact: true }).waitFor({ state: "detached" });
    await page.waitForFunction(() => (window as any).fixture.requests.find((value: any) => value.method === "POST").signal.aborted);
    await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.requests.findIndex((value: any) => value.method === "POST")); });
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.sent), [], "closed/aborted acknowledgement cannot publish success");
    await page.evaluate(() => (window as any).fixture.update({ open: true, hold: false }));
    await page.getByRole("button", { name: sendLabel, exact: true }).click();
    await page.getByText("面談の日程提案", { exact: true }).waitFor({ state: "detached" });
    const result = await page.evaluate(() => { const state = (window as any).fixture; return { sent: state.sent,
      writes: state.requests.filter((value: any) => value.method === "POST").map((value: any) => ({ body: value.body, key: value.headers["idempotency-key"] })) }; });
    assert.equal(result.writes.length, 2);
    assert.deepEqual(result.writes[0], result.writes[1]);
    assert.deepEqual(result.sent, ["appointment:one"]);
  });

  test(`${mode} sheet retries a lost acknowledgement with the same key across same-account reconnect`, async t => {
    const page = await open(t, { failOnce: true, ...(mode === "reschedule" ? { appointmentId: "appointment:one" } : {}) });
    await review(page);
    const sendLabel = mode === "initial" ? "候補を提案" : "改期を提案";
    await page.getByRole("button", { name: sendLabel, exact: true }).click();
    await page.getByText("提案を送れませんでした。候補は残しています。", { exact: true }).waitFor();
    await page.evaluate(() => (window as any).fixture.update({ offline: true }));
    await page.getByText("面談の提案には接続が必要です。候補は送っていません。", { exact: true }).waitFor();
    await page.evaluate(() => (window as any).fixture.update({ offline: false }));
    await page.getByRole("button", { name: sendLabel, exact: true }).click();
    await page.getByText("面談の日程提案", { exact: true }).waitFor({ state: "detached" });
    const result = await page.evaluate(() => { const state = (window as any).fixture; return { sent: state.sent,
      writes: state.requests.filter((value: any) => value.method === "POST").map((value: any) => ({ body: value.body, key: value.headers["idempotency-key"] })),
      lastMethod: state.requests.at(-1).method }; });
    assert.equal(result.writes.length, 2);
    assert.deepEqual(result.writes[0], result.writes[1]);
    assert.deepEqual(result.sent, ["appointment:one"]);
    assert.equal(result.lastMethod, "GET", "success requires a separate native read");
  });
}

test("mismatched independent readback keeps the sheet open without reporting sent", async t => {
  const page = await open(t, { tamperReadback: true });
  await review(page);
  await page.getByRole("button", { name: "候補を提案", exact: true }).click();
  await page.getByText("送信結果を確認できません。候補は残しています。", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.sent), []);
});

for (const identity of [{ actor: "actor:two" }, { baseUrl: "https://other.example" }]) {
  test(`changed ${"actor" in identity ? "actor" : "server"} aborts old send and does not revive its private proposal`, async t => {
    const page = await open(t, { hold: true });
    await review(page);
    await page.getByRole("button", { name: "候補を提案", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.requests.some((value: any) => value.method === "POST"));
    await page.evaluate(patch => (window as any).fixture.update(patch), identity);
    await page.getByText("候補 1", { exact: true }).waitFor();
    await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.requests.findIndex((value: any) => value.method === "POST")); });
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.find((value: any) => value.method === "POST").signal.aborted), true);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.sent), []);
    await page.evaluate(() => (window as any).fixture.update({ actor: "actor:one", baseUrl: "https://orbit.example", hold: false }));
    await page.getByText("候補 1", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "場所", exact: true }).count(), 0, "old review/private location is not restored");
  });
}
