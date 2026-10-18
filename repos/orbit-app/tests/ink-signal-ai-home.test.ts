import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { aiSessionSummaryPageSchema } from "../src/api/schema/ai-session-page";
import { aiConversationPayload, aiReadPayloads, aiSession, aiSessionListPayload, emptyAiConversationPayload, emptyAiSessionListPayload } from "./helpers/ai-fixtures";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
const relationshipInbox = (count: number, actor = "actor-1", notificationsUnread = 0) => ({
  actorId: actor, messagesUnread: count, notificationsUnread,
  notificationMode: "legacy", notificationRead: "ready", asOf: "2026-09-25T00:00:00Z",
});
// Actual private route, hooks, HTTP client, screen and native-web controls.
// Auth/device capabilities, network transport and local snapshot I/O are external boundaries.
const fixture = `
// Sprint 0118: this harness exercises the network path; the device mirror of the inbox and AI sessions is not available here.
export const useLocalInbox = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalRelationshipConversations = () => ({ available: false, conversations: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalRelationshipThread = () => ({ available: false, conversations: [], messages: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiSessions = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiConversation = () => ({ available: false, messages: [], cards: null, saveCards() {}, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });

import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
let revision = 0; const listeners = new Set(); const nativeListeners = new Set();
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const NativeDate = Date;
window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-09-12T03:00:00Z"])); } static now() { return NativeDate.parse("2026-09-12T03:00:00Z"); } };
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, expiries: 0, actor: "actor-1", name: "程川", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true, focused: true, appState: "active", mounted: true, width: 390, fontScale: 1, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); if (patch.appState) nativeListeners.forEach(fn => fn(patch.appState)); revision++; listeners.forEach(fn => fn()); },
  reply(index, status = 200, payload) {
    const r = state.requests[index]; const params = new URL(r.url).searchParams;
    const cursor = params.get("cursor") ?? "first"; const pageKey = [params.get("q") ?? "", params.get("groupId") ?? "", cursor].join("|");
    const configuredPage = state.pagePayloads?.[pageKey] ?? state.pagePayloads?.[cursor];
    let paged = r.path === "/api/ai/conversations/sessions" ? configuredPage ?? state.payloads[r.path] : undefined;
    if (r.path === "/api/ai/conversations/sessions" && !configuredPage && paged && Array.isArray(paged.items) && cursor === "first") {
      const query = params.get("q")?.trim().toLocaleLowerCase() ?? ""; const groupId = params.get("groupId");
      paged = { ...paged, items: paged.items.filter(item => (!query || [item.id, item.title, item.firstUserText, item.lastMessagePreview, item.organization.customTitle ?? ""].join(" ").toLocaleLowerCase().includes(query)) && (!groupId || item.organization.groupId === groupId)) };
    }
    r.replied = true;
    state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? paged ?? state.payloads[r.path] ?? (r.path === "/api/inbox/notifications" ? {enabled:false,items:[],unreadCount:0,nextCursor:null,asOf:"2026-09-16T00:00:00.000Z"} : undefined) : payload } : { success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取，请重试。" } }), { status, headers: { "Content-Type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input)); state.requests.push({ path: url.pathname, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => state.reply(index, init.method !== "GET" ? 503 : (state.failPaths?.includes(url.pathname) ? 503 : 200))); return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.actor, name: state.name, email: "person@example.test" } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
// Sprint 0131: the screen also reads the device mirror / page copies; this harness tests the network path (no mirror).
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, workspaceId: null, records: [], refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const useSyncCoordinatorSession = () => null;
export const useIsFocused = () => { observe(); return state.focused; };
export const AppState = { get currentState() { return state.appState; }, addEventListener(event, fn) { nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); } }; } };
export const useGlobalSearchParams = () => ({});
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/ai";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); } });
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }, edges?.includes?.("bottom") && { paddingBottom: 24 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const readSnapshot = async () => null; export const writeSnapshot = async () => {};
export const randomUUID = () => { if (state.failIntent) throw new Error("Device random source unavailable"); return "test-send-intent"; };
`;
test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/(app)/ai"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ai-http-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ai" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store|useLocalInbox|useLocalAiSessions|useLocalRelationshipMessages|useSyncedCollection)$/ }, () => ({ path: "fixture", namespace: "ai" }));
      plugin.onLoad({ filter: /.*/, namespace: "ai" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, RefreshControl as RealRefreshControl, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web"; export { AppState } from "fixture";
export const findNodeHandle = () => null;
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
const scaled = (props, scale) => { const style = StyleSheet.flatten(props.style) || {}; return !style.fontSize || props.allowFontScaling === false ? props.style : [props.style, { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]; };
export const Text = props => { const s = useFixture(); return <RealText {...props} style={scaled(props, s.fontScale)} />; };
export const TextInput = props => { const s = useFixture(); return <RealTextInput {...props} style={scaled(props, s.fontScale)} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light", locale: "zh-CN" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); }); await p.route("**/*", r => r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { payloads: aiReadPayloads, ...patch }); await p.addScriptTag({ content: "window.global = window;" }); await p.addScriptTag({ content: script }); await settle(p); await p.evaluate(() => document.fonts.ready); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function navigation(p: Page) { return p.evaluate(() => (window as any).fixture.navigation); }
async function twice(p: Page, label: string) { await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p); }

test("R21 start shows four direct-send suggestions, an editable composer, and no implicit write", async t => {
  const p = await open(t);
  await p.getByRole("heading", { name: "何をお手伝いしましょう？" }).waitFor();
  for (const name of ["今天先处理哪些事？", "最近有哪些活动适合我？", "回看与某位人脉的讨论", "帮我规划新目标"]) {
    assert.equal(await p.getByRole("button", { name, exact: true }).count(), 1);
  }
  assert.equal(await p.getByRole("textbox", { name: "iOrbit に聞く" }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("R21 starter sends one explicit intent even when tapped twice", async t => {
  const p = await open(t);
  await p.getByRole("button", { name: "今天先处理哪些事？" }).waitFor();
  await twice(p, "今天先处理哪些事？");
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: "new", initialMessage: "今天先处理哪些事？", sendIntent: "test-send-intent" } }]);
  assert.deepEqual(await writes(p), []);
});

test("R21 composer keeps an edited draft and submits it only after a user action", async t => {
  const p = await open(t);
  const input = p.getByRole("textbox", { name: "iOrbit に聞く" });
  await input.fill("  我自己修改的问题  ");
  assert.deepEqual(await navigation(p), []);
  await twice(p, "送信");
  assert.equal(await input.inputValue(), "  我自己修改的问题  ");
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: "new", initialMessage: "我自己修改的问题", sendIntent: "test-send-intent" } }]);
  assert.deepEqual(await writes(p), []);
});

test("R21 composer retains a draft if the device cannot create a send intent", async t => {
  const p = await open(t, { failIntent: true });
  const input = p.getByRole("textbox", { name: "iOrbit に聞く" });
  await input.fill("这条问题不能丢");
  await press(p, "送信");
  assert.equal(await input.inputValue(), "这条问题不能丢");
  assert.deepEqual(await navigation(p), []);
  assert.deepEqual(await writes(p), []);
  await update(p, { failIntent: false });
  await press(p, "送信");
  assert.equal((await navigation(p)).length, 1);
});

test("R21 history requests one page and loads its cursor only when asked", async t => {
  const later = { ...aiSessionListPayload.items[0], id: "session:later", title: "第 51 条会话", firstUserText: "第 51 条会话", lastMessagePreview: "后续会话预览", organization: { ...aiSession.organization, customTitle: "第 51 条会话", groupId: null }, updatedAt: "2026-09-08T01:00:00Z" };
  const p = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, items: [aiSessionListPayload.items[0]], nextCursor: "page-two", hasMore: true },
    "page-two": { ...aiSessionListPayload, items: [later], nextCursor: null, hasMore: false },
  } });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/ai/conversations/sessions"));
  const initial = await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/ai/conversations/sessions"));
  assert.equal(initial.length, 1);
  assert.equal(new URL(initial[0].url).searchParams.get("limit"), "20");
  await press(p, "会話リスト");
  await press(p, "もっと見る");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "page-two"));
  assert.ok(await p.getByRole("button", { name: "第 51 条会话", exact: true }).count() >= 1);
});

test("R21 history search sends the final query to the server", async t => {
  const p = await open(t);
  await press(p, "会話リスト");
  await p.getByPlaceholder("タイトルと本文を検索").pressSequentially("产品试点", { delay: 25 });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("q") === "产品试点"));
  const queries = await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/ai/conversations/sessions").map((request: any) => new URL(request.url).searchParams.get("q")).filter(Boolean));
  assert.deepEqual(queries, ["产品试点"]);
  assert.deepEqual(await writes(p), []);
});

test("R21 history deletion requires confirmation and starts one server write", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "会話リスト");
  await press(p, "产品试点讨论 の操作");
  await press(p, "削除");
  assert.deepEqual(await writes(p), []);
  await p.getByRole("heading", { name: "この会話を削除しますか？" }).waitFor();
  await twice(p, "削除");
  assert.deepEqual(await writes(p), [{ method: "DELETE", path: "/api/ai/conversations/sessions/session%3A1", body: null }]);
});

test("R21 sixth pin shows the distinct server PIN_LIMIT message", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "会話リスト");
  await press(p, "产品试点讨论 の操作");
  await press(p, "ピン留め");
  const patch = await writes(p);
  assert.deepEqual(patch, [{ method: "PATCH", path: "/api/ai/conversations/sessions/session%3A1", body: { expectedRevision: 2, mutationId: "test-send-intent", patch: { pinned: true } } }]);
  await p.evaluate(() => {
    const s = (window as any).fixture;
    const index = s.requests.findLastIndex((request: any) => request.method === "PATCH");
    s.pending[index](new Response(JSON.stringify({ success: false, error: { code: "PIN_LIMIT", message: "Only five conversations can be pinned" } }), { status: 409, headers: { "Content-Type": "application/json" } }));
  });
  await p.getByText("ピン留めは5件までです。別の会話のピン留めを外してください。").first().waitFor();
});

test("R21 private route makes no reads before auth, focus, or server readiness", async t => {
  for (const patch of [{ ready: false }, { baseReady: false }, { focused: false }, { signedIn: false }, { actor: "" }]) {
    const p = await open(t, patch);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
  }
});

test("R21 stale reads from an old identity do not expire the new account", async t => {
  const p = await open(t, { holdReads: true });
  const count = await p.evaluate(() => (window as any).fixture.requests.length);
  await update(p, { actor: "actor-2" });
  await p.evaluate(count => { const s = (window as any).fixture; for (let i = 0; i < count; i++) s.reply(i, 401); }, count);
  await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});
