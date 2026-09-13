import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const id = "12345678-1234-1234-1234-123456789abc";
const otherId = "22345678-1234-1234-1234-123456789abc";
const batchId = "32345678-1234-1234-1234-123456789abc";
const hasRoute = existsSync(new URL("../app/contacts/new/import/[id].tsx", import.meta.url));
let browser: Browser;
let script: string;
// Real React, RNW, route, screen, API adapter, theme and auth gate. Only native
// presentation, provider/router state, clock and HTTP are controlled boundaries.
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let version = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => version);
const nativeListeners = new Set(); const timers = new Map(); let timerId = 0;
window.setInterval = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
window.clearInterval = id => timers.delete(id);
const state = window.fixture = { actor: "one", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true,
 focused: true, appState: "active", mounted: true, id: "12345678-1234-1234-1234-123456789abc",
 requests: [], replies: [], rejects: [], navigation: [], alerts: [], presses: {}, ...window.initialFixture,
 update(patch) { Object.assign(state, patch); if (patch.appState) nativeListeners.forEach(fn => fn(patch.appState)); version++; listeners.forEach(fn => fn()); },
 tick() { [...timers.values()].forEach(t => t.fn()); },
 reply(index, patch = {}, status = 200) {
   const request = state.requests[index];
   const job = { id: request.id, state: "processing", sourceCount: 2, completedSources: 1, preparedPages: 3,
     currentSourcePage: 1, currentSourcePageCount: 2, errorCode: null, retryAt: null, batchId: null,
     createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:01Z", expiresAt: "2099-09-12T00:00:00Z",
     ...(["ready", "completed"].includes(patch.state) ? { completedSources: 2, currentSourcePage: null, currentSourcePageCount: null } : {}), ...patch };
   const body = status === 200 ? { data: { job } } : { error: { code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "IMPORT_NOT_FOUND" : status === 409 ? "IMPORT_CONFLICT" : "IMPORT_UNAVAILABLE" } };
   state.replies[index](new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
 },
 confirm(index = 0) { state.alerts[index].buttons.find(b => b.style === "destructive")?.onPress(); },
};
window.fetch = async (url, init) => { const r = { url: String(url), path: new URL(url).pathname, method: init.method, headers: init.headers, body: init.body, actor: state.actor, id: state.id, signal: init.signal };
 state.requests.push(r); return new Promise((resolve, reject) => { state.replies.push(resolve); state.rejects.push(reject); }); };
export const useFixture = () => { observe(); return state; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, cookieHeader: state.cookieHeader, user: state.actor ? { id: state.actor } : null }; };
export const useLocalSearchParams = () => { observe(); return { id: state.id }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/contacts/new/import/" + state.id;
export const useFocusEffect = fn => { observe(); useEffect(() => state.focused ? fn() : undefined, [fn, state.focused]); };
const router = { canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } };
export const useRouter = () => router;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
export const AppState = { get currentState() { return state.appState; }, addEventListener(event, fn) { nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); } }; } };
`;

test.before(async () => {
  const entry = 'import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; ' +
    (hasRoute ? 'import Route from "./app/contacts/new/import/[id]"; ' : 'const Route = () => null; ') +
    'function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);';
  const result = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "import-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "imports" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ },
        () => ({ path: "fixture", namespace: "imports" }));
      plugin.onLoad({ filter: /.*/, namespace: "imports" }, args => ({
        contents: args.path === "native" ?
          'import React from "react"; import { Pressable as NativePressable } from "react-native-web"; export * from "react-native-web"; export { AppState } from "fixture"; export const Alert = { alert(title, message, buttons) { window.fixture.alerts.push({ title, message, buttons }); } }; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };' : fixture,
        loader: "jsx", resolveDir: process.cwd()
      }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch = {}) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(1800);
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort());
  await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await p.addScriptTag({ content: script }); await settle(p);
  if (hasRoute) await p.waitForFunction(() => {
    const s = (window as any).fixture;
    return !s.ready || !s.baseReady || !s.signedIn || !s.actor || !s.focused || s.appState !== "active" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s.id) || s.requests.length > 0;
  });
  return p;
}
async function count(p: Page) { return p.evaluate(() => (window as any).fixture.requests.length); }
async function reply(p: Page, index: number, patch = {}, status = 200) {
  assert.ok(await count(p) > index, "real page must issue the expected request");
  await p.evaluate(({ index, patch, status }) => (window as any).fixture.reply(index, patch, status), { index, patch, status }); await settle(p);
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function tick(p: Page) { await p.evaluate(() => (window as any).fixture.tick()); await settle(p); }
async function press(p: Page, label: string) { await p.getByRole("button", { name: label, exact: true }).click(); await settle(p); }
async function confirm(p: Page, twice = false) { await p.evaluate(twice => { (window as any).fixture.confirm(); if (twice) (window as any).fixture.confirm(); }, twice); await settle(p); }

test("real import route reads progress, polls active work and opens only the completed job's batch", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("heading", { name: "准备名片导入" }).count(), 1);
  assert.equal(await count(p), 1);
  await reply(p, 0);
  assert.match(await p.locator("body").innerText(), /1 \/ 2 个文件/);
  assert.match(await p.locator("body").innerText(), /已准备 3 页/);
  await tick(p); assert.equal(await count(p), 2);
  await reply(p, 1, { state: "completed", completedSources: 2, batchId });
  assert.equal(await p.getByRole("button", { name: "取消导入", exact: true }).count(), 0);
  await tick(p); assert.equal(await count(p), 2);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  await press(p, "查看待确认名片");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/new/batch/" + batchId]);
});

test("cancellation requires confirmation, locks double submission and waits for server acknowledgement", async t => {
  const p = await open(t); await reply(p, 0);
  await press(p, "取消导入");
  assert.equal(await count(p), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.alerts.length), 1);
  await confirm(p, true); assert.equal(await count(p), 2);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].method), "POST");
  assert.doesNotMatch(await p.locator("body").innerText(), /导入已取消/);
  await reply(p, 1, { state: "cancelled" });
  assert.match(await p.locator("body").innerText(), /导入已取消/);
  assert.equal(await p.getByRole("button", { name: "重新选择文件" }).count(), 1);
  await tick(p); assert.equal(await count(p), 2);
});

test("preparation progress has a readable name and distinguishes prepared pages from the next page pointer", async t => {
  const p = await open(t); await reply(p, 0, { currentSourcePage: 2, currentSourcePageCount: 3 });
  const progress = p.getByRole("progressbar", { name: "文件准备进度", exact: true });
  assert.equal(await progress.count(), 1);
  assert.equal(await progress.getAttribute("aria-valuenow"), "1");
  assert.match(await p.locator("body").innerText(), /已准备 1 \/ 3 页/);
});

test("a cancelled job cannot be resurrected by an older in-flight poll", async t => {
  const p = await open(t); await reply(p, 0); await tick(p);
  await press(p, "取消导入"); await confirm(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
  await reply(p, 2, { state: "cancelled" }); await reply(p, 1);
  assert.match(await p.locator("body").innerText(), /导入已取消/);
  assert.equal(await p.getByRole("button", { name: "取消导入", exact: true }).count(), 0);
});

test("cancel conflict reloads server truth instead of announcing success", async t => {
  const p = await open(t); await reply(p, 0); await press(p, "取消导入"); await confirm(p);
  await reply(p, 1, {}, 409); assert.equal(await count(p), 3);
  assert.doesNotMatch(await p.locator("body").innerText(), /导入已取消/);
  await reply(p, 2, { state: "completed", batchId });
  assert.equal(await p.getByRole("button", { name: "查看待确认名片" }).count(), 1);
});

for (const status of [401, 404, 503]) {
  test("read failure " + status + " revokes stale actions and allows explicit recovery", async t => {
    const p = await open(t); await reply(p, 0); await tick(p); await reply(p, 1, {}, status);
    assert.equal(await p.getByRole("button", { name: "取消导入", exact: true }).count(), 0);
    await tick(p); assert.equal(await count(p), 2);
    await press(p, "重新读取进度"); await reply(p, 2, { preparedPages: 4 });
    assert.match(await p.locator("body").innerText(), /已准备 4 页/);
  });
}

for (const change of [{ actor: "two" }, { baseUrl: "https://other.example" }, { cookieHeader: "session=new" }, { id: otherId }]) {
  test("new identity scope discards old reads and deferred cancellation " + JSON.stringify(change), async t => {
    const p = await open(t); await reply(p, 0); await press(p, "取消导入"); await tick(p);
    await update(p, change);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
    assert.equal(await count(p), 3);
    await confirm(p); assert.equal(await count(p), 3);
    await reply(p, 1, { state: "completed", batchId });
    assert.equal(await p.getByRole("button", { name: "查看待确认名片" }).count(), 0);
    await reply(p, 2, { preparedPages: 7 });
    assert.match(await p.locator("body").innerText(), /已准备 7 页/);
  });
}

for (const change of [{ focused: false }, { appState: "background" }, { signedIn: false }, { mounted: false }]) {
  test("inactive scope aborts reads and cannot issue a deferred cancel " + JSON.stringify(change), async t => {
    const p = await open(t); await reply(p, 0); await press(p, "取消导入"); await tick(p);
    await update(p, change); await confirm(p); await tick(p);
    assert.equal(await count(p), 2);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests[1].signal.aborted), true);
    await reply(p, 1, { state: "completed", batchId });
    assert.equal(await p.getByRole("button", { name: "查看待确认名片" }).count(), 0);
  });
}

test("foreground recovery rereads instead of trusting pre-pause state", async t => {
  const p = await open(t); await reply(p, 0); await update(p, { appState: "background" });
  await update(p, { appState: "active" }); assert.equal(await count(p), 2);
  assert.equal(await p.getByRole("button", { name: "取消导入", exact: true }).count(), 0);
  await reply(p, 1, { state: "failed", errorCode: "PDF_INVALID" });
  assert.match(await p.locator("body").innerText(), /PDF/);
  await tick(p); assert.equal(await count(p), 2);
});

test("invalid deep links do not fetch or expose a cancellation", async t => {
  const p = await open(t, { id: "not-a-job" });
  assert.match(await p.locator("body").innerText(), /导入地址无效/);
  assert.equal(await count(p), 0);
  assert.equal(await p.getByRole("button", { name: "取消导入", exact: true }).count(), 0);
});

test("private deep link waits for auth and returns to the same import after login", async t => {
  const p = await open(t, { signedIn: false });
  assert.match(await p.locator("body").innerText(), new RegExp(encodeURIComponent("/contacts/new/import/" + id)));
  assert.equal(await count(p), 0);
  await update(p, { signedIn: true }); assert.equal(await count(p), 1);
});
