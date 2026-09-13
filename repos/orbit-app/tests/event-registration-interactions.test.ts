import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Real route, screen, hooks, HTTP client, view-models and web snapshot adapter.
// Only device/UI integration, auth/server providers and external fetch are replaced.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor-1", eventId: "event:1", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true,
  requests: [], pending: [], presses: {}, alerts: [], navigation: [], expiries: 0, holdReads: false,
  eventStatus: 200, registrationStatus: 200,
  version: 1, hash: "a".repeat(64), prompt: "Who would you like to meet?", savedAnswer: "Saved answer", registered: true,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  receipt(patch = {}) {
    return { id: "registration:1", eventId: state.eventId, userId: state.actor, status: state.registered ? "rsvped" : "cancelled",
      participantProfileId: "participant:1", registeredAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", cancelledAt: null, reactivatedAt: null,
      participantProfile: { id: "participant:1", eventId: state.eventId, userId: state.actor, answers: { targetAttendees: state.savedAnswer }, createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" },
      sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false }, ...patch };
  },
  data(path) {
    if (path.endsWith("/registration")) return { registration: state.receipt(), questionSet: { questionSetHash: state.hash, questionSetVersion: state.version,
      questions: [{ id: "target_attendees", intent: "target_attendees", participantProfileField: "targetAttendees", prompt: state.prompt, options: [], required: true }],
      provenance: { aiProviderRequested: false, externalNetworkRequested: false, fallbackReason: null, generationMethod: "deterministic-fallback", model: null, provider: null } } };
    return { event: { id: state.eventId, title: "Networking meeting", startsAt: "2026-09-20T10:00:00+09:00", endsAt: "2026-09-20T12:00:00+09:00", status: "confirmed", venue: "Tokyo", location: "Tokyo", description: "Meet local founders", stats: { rsvpCount: state.registered ? 2 : 1, youRsvped: state.registered } } };
  },
  reply(index, status = 200, data) {
    state.pending[index]?.(new Response(JSON.stringify(data === undefined && status !== 200 ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "Request not accepted" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }), { status, headers: { "content-type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input));
  state.requests.push({ method: init.method, path: url.pathname, query: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const response = new Promise(resolve => state.pending[index] = resolve);
  if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index, url.pathname.endsWith("/registration") ? state.registrationStatus : state.eventStatus));
  return response;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return { id: state.eventId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/events/" + encodeURIComponent(state.eventId) + "/register";
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/events/[id]/register"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "registration-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "registration" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "registration" }));
      plugin.onLoad({ filter: /.*/, namespace: "registration" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl } from "react-native-web"; export * from "react-native-web";
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
export const Alert = { alert(title, message, buttons) { window.fixture.alerts.push({ title, message, buttons: buttons.slice(0, 3) }); } };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch = {}, waitForForm = true) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(2000); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  if (waitForForm) await p.getByPlaceholder("写一句具体的补充。", { exact: true }).first().waitFor();
  await settle(p); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function fill(p: Page, value: string, index = 0) { await p.getByPlaceholder("写一句具体的补充。", { exact: true }).nth(index).fill(value); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "POST").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function reply(p: Page, status = 200, patch?: object) { await p.evaluate(({ status, patch }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); s.reply(i, status, patch === undefined ? (status === 200 ? s.receipt() : undefined) : patch); }, { status, patch }); await settle(p); }

test("registration reads canonical public event context without a legacy private detail request", async t => {
  const p = await open(t);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ method: r.method, path: r.path, query: r.query }))), [
    { method: "GET", path: "/api/events/public/event%3A1", query: "" },
    { method: "GET", path: "/api/events/event%3A1/registration", query: "?language=zh" }
  ]);
  assert.equal(await p.getByText("Networking meeting", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

for (const failure of [{ eventStatus: 503 }, { registrationStatus: 500 }]) test(`registration read failure stays visible without a fallback or write ${JSON.stringify(failure)}`, async t => {
  const p = await open(t, failure, false);
  await p.getByText("页面暂时无法加载", { exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path)), ["/api/events/public/event%3A1", "/api/events/event%3A1/registration"]);
  assert.deepEqual(await writes(p), []);
});

test("registration refresh preserves a dirty answer but still adopts clean server changes", async t => {
  const p = await open(t); assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Saved answer");
  await update(p, { savedAnswer: "Remote answer" }); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Remote answer");
  await fill(p, "Local answer"); await update(p, { savedAnswer: "Another remote answer" }); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Local answer");
  assert.deepEqual(await writes(p), []);
});

test("registration refresh preserves the auxiliary question, answer, transcript and generated persona", async t => {
  const p = await open(t); await fill(p, "Local answer"); await press(p, "下一题");
  await reply(p, 200, { done: false, question: { field: "desiredOutcome", prompt: "What outcome?", acknowledgment: "Thanks", options: [] } });
  await fill(p, "Auxiliary answer", 1); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").nth(1).inputValue(), "Auxiliary answer");
  await press(p, "生成活动画像");
  assert.deepEqual((await writes(p)).at(-1)?.body, { language: "zh", transcript: [{ field: "targetAttendees", prompt: "Who would you like to meet?", answer: "Local answer" }, { field: "desiredOutcome", prompt: "What outcome?", answer: "Auxiliary answer" }] });
  await reply(p, 200, { persona: { tagline: "Prepared introduction", tags: [], industryTags: [], openers: [] } }); await refresh(p);
  assert.equal(await p.getByText("Prepared introduction", { exact: true }).count(), 1);
  await press(p, "下一题"); assert.equal((await writes(p)).at(-1)?.body.transcript[1].answer, "Auxiliary answer");
});

test("registration submission is single-flight and refreshes both current resources", async t => {
  const p = await open(t); await fill(p, "  Local answer  ");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["更新报名资料"]; fn(); fn(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/events/event%3A1/registration", body: { answers: { targetAttendees: "Local answer" }, questionSetHash: "a".repeat(64), questionSetVersion: 1 } }]);
  await update(p, { savedAnswer: "Local answer" }); await reply(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.slice(3).map((r: any) => r.path).sort()), ["/api/events/event%3A1/registration", "/api/events/public/event%3A1"]);
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 1);
});

test("registration save acknowledgement and refresh do not overwrite a newer edit", async t => {
  const p = await open(t); await fill(p, "Submitted answer"); await press(p, "更新报名资料"); await fill(p, "Newer answer");
  await update(p, { savedAnswer: "Submitted answer" }); await reply(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Newer answer");
});

test("registration cancellation is single-flight and reads status and event again", async t => {
  const p = await open(t); await fill(p, "Keep unsaved answer");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["取消报名"]; fn(); fn(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/events/event%3A1/registration/cancel", body: null }]);
  await update(p, { registered: false }); await reply(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.slice(3).map((r: any) => r.path).sort()), ["/api/events/event%3A1/registration", "/api/events/public/event%3A1"]);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep unsaved answer");
  assert.equal(await p.getByRole("button", { name: "重新报名", exact: true }).count(), 1);
});

for (const kind of ["error", "empty", "wrong-event", "wrong-actor", "wrong-status", "http-error"]) test(`registration ${kind} receipt cannot claim persistence or discard input`, async t => {
  const p = await open(t); await fill(p, "Keep answer"); await press(p, "更新报名资料");
  if (kind === "error") await reply(p, 409);
  else { const data = await p.evaluate(kind => { const s = (window as any).fixture; return kind === "empty" ? {} : s.receipt(kind === "wrong-event" ? { eventId: "other" } : kind === "wrong-actor" ? { userId: "other" } : kind === "wrong-status" ? { status: "cancelled" } : {}); }, kind); await reply(p, kind === "http-error" ? 503 : 200, data); }
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 0);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep answer");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 3);
});

test("changed registration questions keep old drafts until explicit discard confirmation", async t => {
  const p = await open(t); await fill(p, "Keep old answer"); await update(p, { version: 2, hash: "b".repeat(64), prompt: "What should the new group focus on?" }); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep old answer");
  assert.equal(await p.getByText("Who would you like to meet?", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).isDisabled(), true);
  await press(p, "载入新问题"); await p.evaluate(() => { const a = (window as any).fixture.alerts.at(-1); a.buttons.find((b: any) => b.style === "cancel").onPress?.(); }); await settle(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep old answer");
  await press(p, "载入新问题"); await p.evaluate(() => { const a = (window as any).fixture.alerts.at(-1); const fn = a.buttons.find((b: any) => b.style === "destructive").onPress; fn(); fn(); }); await settle(p);
  assert.equal(await p.getByText("What should the new group focus on?", { exact: true }).count(), 1);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "", "old stored answers must not be attached to changed questions");
  await refresh(p); assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "", "refresh must not restore the old answer after explicit discard");
  assert.deepEqual(await writes(p), []); await fill(p, "New question answer"); await press(p, "更新报名资料");
  assert.equal((await writes(p)).at(-1)?.body.questionSetVersion, 2);
});

test("registration cannot submit a retained callback after its draft changes", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit = s.presses["更新报名资料"]; });
  await fill(p, "Newer intended answer");
  await p.evaluate(() => { (window as any).fixture.oldSubmit(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  await press(p, "更新报名资料"); assert.equal((await writes(p)).at(-1)?.body.answers.targetAttendees, "Newer intended answer");
});

for (const change of ["edit", "version", "actor"]) test(`registration discard confirmation is revoked by subsequent ${change}`, async t => {
  const p = await open(t); await fill(p, "Keep draft"); await update(p, { version: 2, hash: "b".repeat(64), prompt: "New question" }); await refresh(p); await press(p, "载入新问题");
  if (change === "edit") await fill(p, "Newer draft");
  else if (change === "version") { await update(p, { version: 3, hash: "c".repeat(64), prompt: "Third question" }); await refresh(p); }
  else await update(p, { actor: "actor-2", savedAnswer: "Other actor answer" });
  await p.evaluate(() => { const a = (window as any).fixture.alerts[0]; a.buttons.find((b: any) => b.style === "destructive").onPress(); }); await settle(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), change === "edit" ? "Newer draft" : change === "actor" ? "Other actor answer" : "Keep draft");
  assert.deepEqual(await writes(p), []);
});

test("registration auxiliary operations are single-flight and preserve input typed while pending", async t => {
  const p = await open(t);
  await p.evaluate(() => { const fn = (window as any).fixture.presses["下一题"]; fn(); fn(); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  await reply(p, 200, { done: false, question: { field: "desiredOutcome", prompt: "What outcome?", acknowledgment: "", options: [] } });
  await fill(p, "First auxiliary answer", 1); await press(p, "下一题"); await fill(p, "Newer auxiliary answer", 1);
  await reply(p, 200, { done: false, question: { field: "energyStyle", prompt: "What setting?", acknowledgment: "", options: [] } });
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").nth(1).inputValue(), "Newer auxiliary answer");
  assert.equal(await p.getByText("What outcome?", { exact: true }).count(), 1);
});

for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://second.example" }, { eventId: "event:2" }, { mounted: false }]) test(`registration drops stale write completions and callbacks after scope change ${JSON.stringify(patch)}`, async t => {
  const p = await open(t); await fill(p, "Private old answer");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit = s.presses["更新报名资料"]; s.oldRefresh = s.refresh; }); await press(p, "更新报名资料");
  await update(p, { holdReads: true, ...patch });
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit(); s.oldRefresh(); s.reply(2, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[2].signal?.aborted), true);
});
