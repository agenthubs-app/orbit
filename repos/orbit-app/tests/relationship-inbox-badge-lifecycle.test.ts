import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
// Since fc0569649 the badge reads only the bounded /api/inbox/summary. The old
// per-source fallback (message unread summary + legacy notifications + typed
// list probe) was removed, so every case reads exactly one summary per refresh.
const summaryPath = "/api/inbox/summary";
const summary = (messages: number, notices = 1, actor = "actor:one", mode: "legacy" | "typed" = "legacy") => ({
  actorId: actor, messagesUnread: messages, notificationsUnread: notices, notificationMode: mode, notificationRead: "ready", asOf: "2026-09-25T00:00:00Z"
});

// Real badge hook, HTTP client and view-model. Only auth, navigation focus,
// native lifecycle, snapshot I/O and network transport are controlled here.
const fixture = `
// Sprint 0118: this harness exercises the network path; the device mirror is not available here.
export const useLocalInbox = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalRelationshipConversations = () => ({ available: false, conversations: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalRelationshipThread = () => ({ available: false, conversations: [], messages: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiSessions = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiConversation = () => ({ available: false, messages: [], cards: null, saveCards() {}, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });

import { useSyncExternalStore } from "react";
import { onSessionExpired } from "./src/api/session-expiry";
let revision = 0; const subscribers = new Set(); const nativeListeners = new Set();
const observe = () => useSyncExternalStore(fn => { subscribers.add(fn); return () => subscribers.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor:one", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, signedIn: true, baseReady: true,
  focused: true, appState: "active", scopeKey: "initial", mounted: true, requests: [], pending: [], expiries: 0, snapshots: 0,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); if (patch.appState) nativeListeners.forEach(fn => fn(patch.appState)); revision++; subscribers.forEach(fn => fn()); },
  reply(index, data, status = 200, success = status === 200) {
    state.requests[index].replied = true;
    state.pending[index](new Response(JSON.stringify(success ? { success: true, data } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取。" } }), { status, headers: { "Content-Type": "application/json" } }));
  },
  listenerCount() { return nativeListeners.size; },
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => {
  const index = state.requests.length;
  state.requests.push({ path: new URL(String(input)).pathname, url: String(input), method: init.method, headers: init.headers, signal: init.signal });
  if (state.oldDeployment) return new Response(JSON.stringify({success:false,error:{code:"NOT_FOUND",message:"old deployment"}}), {status:404,headers:{"Content-Type":"application/json"}});
  return new Promise(resolve => state.pending[index] = resolve);
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.actor || null, actorId: state.actor || null, cookieHeader: state.cookieHeader, user: state.actor ? { id: state.actor } : null }; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const AppState = { get currentState() { return state.appState; }, addEventListener(event, fn) { nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); } }; } };
export const readSnapshot = async (baseUrl, actorId, path) => { state.snapshots++; return state.cached ? { result: { success: true, status: 200, meta: {}, data: path.includes("relationship-communication") ? { conversations: [], refreshedAt: "2026-09-15T00:00:00Z" } : { reminders: [] } } } : null; };
export const writeSnapshot = async () => { state.snapshots++; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React, { useState } from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { useRelationshipInboxBadgeCount } from "./src/hooks/useRelationshipInboxBadgeCount"; import { emitMessageStateInvalidation } from "./src/api/message-state"; window.invalidateMessageState = emitMessageStateInvalidation;
function Badge({second=false}) { const s = useFixture(); const count = useRelationshipInboxBadgeCount(second ? "another-screen-scope" : s.scopeKey); const [draft, setDraft] = useState(""); return <><output aria-label="未读数量">{count ?? "unknown"}</output><input aria-label="草稿" value={draft} onChange={e => setDraft(e.target.value)} /></>; }
function App() { const s = useFixture(); return s.mounted ? <><Badge />{s.multiple && <Badge second />}</> : null; } createRoot(document.getElementById("root")).render(<App />);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "badge-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^(fixture|expo-router|react-native)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store|useLocalInbox|useLocalRelationshipMessages)$/ }, () => ({ path: "fixture", namespace: "badge" }));
      plugin.onLoad({ filter: /.*/, namespace: "badge" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage(); const errors: string[] = [];
  p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", route => route.abort()); await p.setContent('<div id="root"></div>');
  if (patch.clock) await p.clock.install();
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script }); await settle(p); return p;
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function count(p: Page) { return p.getByLabel("未读数量", { exact: true }).innerText(); }
async function reads(p: Page): Promise<{ path: string; method: string; aborted: boolean }[]> { return p.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ path: r.path, method: r.method, aborted: Boolean(r.signal?.aborted) }))); }
async function reply(p: Page, index: number, data: unknown, status = 200, success = status === 200) { await p.evaluate(args => (window as any).fixture.reply(...args), [index, data, status, success]); await settle(p); }
async function hydrate(p: Page, amount = 2, notices = 1) {
  const current = await p.evaluate(() => { const s = (window as any).fixture; return { actor: s.actor, index: s.requests.findLastIndex((r: any) => r.path === "/api/inbox/summary") }; });
  await reply(p, current.index, summary(amount, notices, current.actor));
}

test("badge reads one authoritative inbox summary", async t => {
  const p = await open(t); assert.equal(await count(p), "unknown");
  assert.deepEqual((await reads(p)).map(({ path, method }) => ({ path, method })), [{ path: summaryPath, method: "GET" }]);
  await hydrate(p); assert.equal(await count(p), "3");
});

test("an old deployment without the summary shows no count and never falls back to list reads", async t => {
  const p = await open(t, { oldDeployment: true }); await settle(p);
  assert.deepEqual((await reads(p)).map(r => r.path), [summaryPath]);
  assert.equal(await count(p), "unknown");
});

test("two real hooks with different screen keys share one summary and one foreground timer", async t => {
  const p = await open(t, { multiple: true, clock: true });
  assert.equal((await reads(p)).length, 1);
  const data = summary(2, 3);
  await reply(p, 0, data);
  assert.deepEqual(await p.getByLabel("未读数量", { exact: true }).allTextContents(), ["5", "5"]);
  await p.clock.fastForward(15_001); await settle(p);
  assert.equal((await reads(p)).length, 2);
  await update(p, { multiple: false });
  assert.equal((await reads(p))[1]?.aborted, false, "one unmount must not cancel the other subscriber");
  await reply(p, 1, { ...data, messagesUnread: 6 });
  assert.equal(await count(p), "9");
  await update(p, { appState: "background" });
  await p.clock.fastForward(60_000); await settle(p);
  assert.equal((await reads(p)).length, 2);
});

test("foreground polling refreshes within fifteen seconds without clearing the visible count or draft", async t => {
  const p = await open(t, { clock: true });
  await hydrate(p, 2); assert.equal(await count(p), "3");
  await p.getByLabel("草稿").fill("正在写的内容");
  await p.clock.fastForward(15_001); await settle(p);
  assert.equal((await reads(p)).length, 2);
  assert.equal(await count(p), "3");
  await hydrate(p, 5);
  assert.equal(await count(p), "6");
  assert.equal(await p.getByLabel("草稿").inputValue(), "正在写的内容");
});

test("a confirmed message or reminder state invalidates the badge immediately", async t => {
  const p = await open(t);
  await hydrate(p, 2); assert.equal(await count(p), "3");
  await p.evaluate(() => (window as any).invalidateMessageState()); await settle(p);
  assert.equal((await reads(p)).length, 2);
  assert.equal(await count(p), "3");
  await hydrate(p, 0, 0);
  assert.equal(await count(p), "unknown");
});

for (const patch of [{ ready: false }, { baseReady: false }, { signedIn: false }, { actor: "" }, { focused: false }, { appState: "background" }, { appState: "inactive" }]) {
  test("badge does not read a private count before the active identity is ready " + JSON.stringify(patch), async t => {
    const p = await open(t, patch); assert.deepEqual(await reads(p), []); assert.equal(await count(p), "unknown");
  });
}

test("cached counts are never presented as the current unread state", async t => {
  const p = await open(t, { cached: true }); assert.equal(await count(p), "unknown");
  await reply(p, 0, {}, 503);
  assert.equal(await count(p), "unknown"); assert.equal(await p.evaluate(() => (window as any).fixture.snapshots), 0);
});

for (const patch of [{ actor: "actor:two" }, { cookieHeader: "session=changed" }, { baseUrl: "https://other.example" }, { scopeKey: "refreshed" }]) {
  test("identity and explicit refresh revoke old badge responses even with an empty cookie " + JSON.stringify(patch), async t => {
    const p = await open(t); await update(p, patch);
    const requests = await reads(p); assert.equal(requests.length, 2); assert.ok(requests[0]!.aborted);
    await hydrate(p, 5); assert.equal(await count(p), "6");
    await reply(p, 0, {}, 401);
    assert.equal(await count(p), "6"); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  });
}

for (const [pause, resume] of [[{ focused: false }, { focused: true }], [{ appState: "background" }, { appState: "active" }], [{ signedIn: false }, { signedIn: true }], [{ baseReady: false }, { baseReady: true }]] as const) {
  test("pause hides the old count and resume requires a new network read " + JSON.stringify(pause), async t => {
    const p = await open(t); await hydrate(p); assert.equal(await count(p), "3");
    await p.getByLabel("草稿").fill("未发送的问题");
    await update(p, pause); assert.equal(await count(p), "unknown"); assert.equal((await reads(p)).length, 1);
    await update(p, resume); assert.equal(await count(p), "unknown"); assert.equal((await reads(p)).length, 2);
    await hydrate(p, 7); assert.equal(await count(p), "8"); assert.equal(await p.getByLabel("草稿").inputValue(), "未发送的问题");
  });
}

test("background abort happens synchronously before a stale 401 can expire the session", async t => {
  const p = await open(t);
  const aborted = await p.evaluate(() => { const s = (window as any).fixture; s.update({ appState: "background" }); const result = s.requests.every((r: any) => r.signal?.aborted); s.reply(0, {}, 401, false); return result; });
  assert.equal(aborted, true); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0); assert.equal(await count(p), "unknown");
});

test("batched inactive-active events still invalidate the read while repeated active events do not refetch", async t => {
  const p = await open(t); await hydrate(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.update({ appState: "inactive" }); s.update({ appState: "active" }); }); await settle(p);
  assert.equal(await count(p), "unknown"); assert.equal((await reads(p)).length, 2);
  await hydrate(p, 4); await update(p, { appState: "active" });
  assert.equal((await reads(p)).length, 2); assert.equal(await count(p), "5");
});

test("returning to foreground while unfocused does not read until the page is focused", async t => {
  const p = await open(t); await update(p, { focused: false }); await update(p, { appState: "background" }); await update(p, { appState: "active" });
  assert.equal((await reads(p)).length, 1); assert.equal(await count(p), "unknown");
  await update(p, { focused: true }); assert.equal((await reads(p)).length, 2); await hydrate(p); assert.equal(await count(p), "3");
});

test("failed resumed reads never restore the previous count", async t => {
  const p = await open(t); await hydrate(p);
  await update(p, { appState: "background" }); await update(p, { appState: "active" });
  assert.equal((await reads(p)).length, 2);
  await reply(p, 1, summary(80), 503, true);
  assert.equal(await count(p), "unknown");
});

test("a failed refreshed summary does not keep the previous count", async t => {
  const p = await open(t); await hydrate(p, 8); assert.equal(await count(p), "9");
  await update(p, { scopeKey: "refreshed" });
  await reply(p, 1, {}, 403);
  assert.equal(await count(p), "unknown");
});

test("a summary for another actor is not shown", async t => {
  const p = await open(t);
  await reply(p, 0, summary(4, 1, "actor:other"));
  assert.equal(await count(p), "unknown");
});

test("unmount releases native listeners and aborts the pending badge reads", async t => {
  const p = await open(t); await update(p, { mounted: false });
  assert.equal(await p.evaluate(() => (window as any).fixture.listenerCount()), 0);
  assert.ok((await reads(p)).every(r => r.aborted));
  await reply(p, 0, {}, 401); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

for (const [amount, expected] of [[0, "unknown"], [105, "99"]] as const) {
  test("badge retains its zero and upper-bound display rules " + amount, async t => {
    const p = await open(t); await hydrate(p, amount, 0); assert.equal(await count(p), expected);
  });
}
test('a typed-mode summary counts typed notifications independently of real messages',async t=>{
 const p=await open(t);
 await reply(p,0,summary(2,4,'actor:one','typed'));assert.equal(await count(p),'6');
 assert.deepEqual((await reads(p)).map(r=>r.path),[summaryPath],'typed mode never probes the typed list');
});

test('new legacy summary renders with one request and refreshes without reading lists',async t=>{
 const p=await open(t,{clock:true});
 assert.deepEqual((await reads(p)).map(r=>r.path),['/api/inbox/summary']);
 const data=summary(2,3);
 await reply(p,0,data);assert.equal(await count(p),'5');
 await p.clock.fastForward(15001);await settle(p);assert.equal((await reads(p)).length,2);
 await reply(p,1,{...data,messagesUnread:6});assert.equal(await count(p),'9');
 await update(p,{actor:'actor:two'});assert.equal(await count(p),'unknown');
 await reply(p,2,data);assert.equal(await count(p),'unknown');
});
test('new summary failures do not request old lists or expire a revoked identity',async t=>{
 const p=await open(t);await update(p,{appState:'background'});
 assert.ok((await reads(p))[0]!.aborted);await reply(p,0,{},401);
 assert.equal(await p.evaluate(()=>(window as any).fixture.expiries),0);
 await update(p,{appState:'active'});await reply(p,1,{},503);
 assert.equal((await reads(p)).length,2);assert.equal(await count(p),'unknown');
});
