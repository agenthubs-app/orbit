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
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ai-http-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ai" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "ai" }));
      plugin.onLoad({ filter: /.*/, namespace: "ai" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, RefreshControl as RealRefreshControl, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web"; export { AppState } from "fixture";
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
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, { payloads: aiReadPayloads, ...patch }); await p.addScriptTag({ content: script }); await settle(p); await p.evaluate(() => document.fonts.ready); return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function navigation(p: Page) { return p.evaluate(() => (window as any).fixture.navigation); }
async function twice(p: Page, label: string) { await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p); }

test("AI home presents editable prompts and real recent conversations before its own next actions", async t => {
  const p = await open(t);
  await p.getByText("整理访谈记录", { exact: true }).waitFor();
  const todayRequests = await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/today").map((request: any) => request.url));
  assert.equal(todayRequests.length, 1);
  assert.equal(new URL(todayRequests[0]).searchParams.get("taskMode"), "summary");
  assert.equal(new URL(todayRequests[0]).searchParams.has("limit"), false, "the real summary endpoint rejects a client limit");
  assert.equal(await p.getByRole("heading", { name: "今天想 整理什么？" }).count(), 1);
  assert.equal(await p.getByRole("button", { name: /^填入问题：/ }).count(), 3);
  const rows = p.getByRole("button", { name: /^继续会话：/ });
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(element => { const copy = element.cloneNode(true) as HTMLElement; copy.querySelectorAll('[aria-hidden="true"]').forEach(icon => icon.remove()); return copy.textContent; })), ["交流会准备讨论了活动主题、嘉宾邀请和场地安排。今天", "产品试点讨论梳理了试点范围、时间节点和资源需求。昨天", "本周安排汇总本周重点工作与待办事项。9月9日"]);
  const recent = await rows.last().boundingBox(), next = await p.getByText("下一步", { exact: true }).boundingBox();
  assert.ok(recent && next && next.y >= recent.y + recent.height);
  assert.equal(await p.getByRole("tab").count(), 0); assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) { await p.getByRole("textbox", { name: "消息", exact: true }).fill("帮我整理明天交流会的准备事项"); await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-home-390.png" }); }
});
test("AI history reads one summary page, then follows its cursor only on explicit request", async t => {
  const later = { ...aiSessionListPayload.items[0], id: "session:later", title: "第 51 条会话", firstUserText: "第 51 条会话", lastMessagePreview: "后续会话预览", organization: { ...aiSession.organization, customTitle: "第 51 条会话", groupId: null }, updatedAt: "2026-09-08T01:00:00Z" };
  const p = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, items: [aiSessionListPayload.items[0]], nextCursor: "page-two", hasMore: true },
    "page-two": { ...aiSessionListPayload, items: [later], nextCursor: null, hasMore: false },
  } });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/ai/conversations/sessions"));
  const firstRequest = await p.evaluate(() => (window as any).fixture.requests.find((request: any) => request.path === "/api/ai/conversations/sessions"));
  assert.equal(new URL(firstRequest.url).searchParams.get("limit"), "20");
  assert.equal(new URL(firstRequest.url).searchParams.has("v"), false);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/ai/conversations/sessions").length), 1, "entering the screen must not auto-fetch continuation pages");
  await press(p, "全部会话");
  await press(p, "加载更多历史记录");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "page-two"));
  assert.equal(await p.getByRole("button", { name: "继续会话：第 51 条会话", exact: true }).count(), 1);
});
test("AI session summary limits count Unicode code points", () => {
  const item = aiSessionListPayload.items[0]!;
  const makePage = (title: string, preview: string) => ({
    ...aiSessionListPayload,
    items: [{ ...item, title, firstUserText: preview, lastMessagePreview: preview }],
  });
  assert.equal(aiSessionSummaryPageSchema.safeParse(makePage("😀".repeat(120), "🌱".repeat(240))).success, true);
  assert.equal(aiSessionSummaryPageSchema.safeParse(makePage("😀".repeat(121), "🌱".repeat(240))).success, false);
  assert.equal(aiSessionSummaryPageSchema.safeParse(makePage("😀".repeat(120), "🌱".repeat(241))).success, false);
});
test("AI home uses the supplied brand asset", async t => {
  const p = await open(t); const mark = p.getByTestId("iorbit-brand-mark"); assert.equal(await mark.count(), 1);
  const logo = await mark.boundingBox(); assert.ok(logo && logo.width === 18 && logo.height === 18);
});

for (const [state, dotCount] of [[undefined, 1], ["read", 0], ["ignored", 0]] as const) test(`AI drawer unread indicator respects server reminder state: ${state}`, async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads,
    "/api/inbox/summary": relationshipInbox(0, "actor-1", state ? 0 : 1),
  } });
  await press(p, "更多操作"); await press(p, "常用入口");
  const inbox = p.getByRole("button", { name: "打开收件箱", exact: true });
  // The indicator is the only native View beside the icon in this button.
  // Assert the rendered unread signal, without depending on theme colors.
  assert.equal(await inbox.locator(":scope > div").count(), dotCount);
  await press(p, "打开收件箱");
  assert.deepEqual(await navigation(p), ["/inbox"]);
  assert.deepEqual(await writes(p), []);
});
test("AI home uses the source section rhythm", async t => {
  const p = await open(t);
  const question = await p.getByRole("button", { name: "填入问题：回看与某位人脉的讨论", exact: true }).boundingBox();
  const row = await p.getByRole("button", { name: "继续会话：交流会准备", exact: true }).boundingBox();
  assert.ok(question && row && row.y - (question.y + question.height) <= 47, "recent history follows the source's compact heading gap while preserving 44pt actions");
});
test("AI home uses a compact one-line composer until more content is entered", async t => {
  const p = await open(t);
  const input = await p.getByRole("textbox", { name: "消息", exact: true }).boundingBox(); assert.equal(input?.height, 44);
});
for (const patch of [{}, { width: 320, fontScale: 1.6 }]) test("AI composer grows for long drafts and shrinks without clipping a line " + JSON.stringify(patch), async t => {
  const p = await open(t, patch); const input = p.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("可以继续编辑和发送的问题。".repeat(12)); await settle(p);
  const expanded = await input.boundingBox(); assert.ok(expanded && expanded.height >= 100 && expanded.height <= 120);
  await input.fill(""); await settle(p); const collapsed = await input.boundingBox();
  assert.ok(collapsed && collapsed.height >= ("fontScale" in patch ? 47.2 : 44) && collapsed.height < 60, JSON.stringify(collapsed));
});
test("AI history search distinguishes no match from an empty history", async t => {
  const p = await open(t, { pagePayloads: { "不存在的讨论||first": { ...emptyAiSessionListPayload } } }); await press(p, "全部会话");
  await p.getByPlaceholder("搜索历史", { exact: true }).fill("不存在的讨论"); await settle(p);
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("q") === "不存在的讨论"));
  assert.equal(await p.getByText("还没有匹配的对话。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("还没有历史记录", { exact: true }).count(), 0);
});
test("AI history search debounces rapid input to one final server query", async t => {
  const p = await open(t); await press(p, "全部会话");
  await p.getByPlaceholder("搜索历史", { exact: true }).pressSequentially("产品试点", { delay: 25 });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => {
    const url = new URL(request.url); return request.path === "/api/ai/conversations/sessions" && url.searchParams.get("q") === "产品试点";
  }));
  const queries = await p.evaluate(() => (window as any).fixture.requests
    .filter((request: any) => request.path === "/api/ai/conversations/sessions")
    .map((request: any) => new URL(request.url).searchParams.get("q"))
    .filter((query: string | null) => query !== null));
  assert.deepEqual(queries, ["产品试点"]);
});
test("AI history filters on the server and a changed filter restarts from the first cursor", async t => {
  const product = aiSessionListPayload.items[0]!;
  const weekly = aiSessionListPayload.items[1]!;
  const p = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, items: [product], nextCursor: "all-next", hasMore: true },
    "||all-next": { ...aiSessionListPayload, items: [weekly], nextCursor: null, hasMore: false },
    "产品试点||first": { ...aiSessionListPayload, items: [product], nextCursor: "product-next", hasMore: true },
    "产品试点||product-next": { ...aiSessionListPayload, items: [{ ...product, id: "session:product-next", title: "第二页产品讨论", organization: { ...product.organization, customTitle: "第二页产品讨论" } }], nextCursor: null, hasMore: false },
    "本周||first": { ...aiSessionListPayload, items: [weekly], nextCursor: null, hasMore: false },
  } });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/ai/conversations/sessions"));
  await press(p, "全部会话");
  const search = p.getByPlaceholder("搜索历史", { exact: true });
  await search.fill("产品试点");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => {
    const url = new URL(request.url); return request.path === "/api/ai/conversations/sessions" && url.searchParams.get("q") === "产品试点";
  }));
  await press(p, "加载更多历史记录");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "product-next"));
  await p.getByRole("button", { name: "打开历史记录：第二页产品讨论", exact: true }).waitFor();
  await search.fill("本周");
  await p.getByRole("button", { name: "打开历史记录：本周安排", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "打开历史记录：第二页产品讨论", exact: true }).count(), 0);
  const filteredRequests = await p.evaluate(() => (window as any).fixture.requests
    .filter((request: any) => request.path === "/api/ai/conversations/sessions")
    .map((request: any) => { const params = new URL(request.url).searchParams; return { q: params.get("q"), cursor: params.get("cursor") }; }));
  assert.equal(filteredRequests.some((params: { q: string | null; cursor: string | null }) => params.cursor === "product-next" && params.q === "本周"), false);
  assert.equal(filteredRequests.at(-1)?.q, "本周");
  assert.equal(filteredRequests.at(-1)?.cursor, null);
});
test("AI history keeps the active query and group when an organization mutation refreshes page one", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "全部会话"); await press(p, "管理分组"); await press(p, "打开分组：工作");
  await p.getByPlaceholder("搜索历史", { exact: true }).fill("产品试点");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => {
    const url = new URL(request.url); return request.path === "/api/ai/conversations/sessions" && url.searchParams.get("q") === "产品试点" && url.searchParams.get("groupId") === "group:work";
  }));
  await p.getByRole("button", { name: "整理会话", exact: true }).first().click(); await settle(p); await press(p, "置顶会话");
  const patchIndex = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((request: any) => request.method === "PATCH" && request.path.includes("/sessions/")));
  assert.notEqual(patchIndex, -1);
  const beforeRefresh = await p.evaluate(() => (window as any).fixture.requests.length);
  await p.evaluate(({ index, session }) => (window as any).fixture.reply(index, 200, { session, storage: { configured: true, persisted: true, source: "session-store" } }), { index: patchIndex, session: { ...aiSession, organization: { ...aiSession.organization, pinned: true } } });
  await p.waitForFunction(before => (window as any).fixture.requests.slice(before).some((request: any) => {
    const url = new URL(request.url); return request.path === "/api/ai/conversations/sessions" && url.searchParams.get("q") === "产品试点" && url.searchParams.get("groupId") === "group:work" && !url.searchParams.has("cursor");
  }), beforeRefresh);
  const refresh = await p.evaluate(before => (window as any).fixture.requests.slice(before).filter((request: any) => request.path === "/api/ai/conversations/sessions").map((request: any) => request.url), beforeRefresh);
  assert.equal(refresh.length, 1);
});
test("AI continuation failure keeps the loaded page and retries the same cursor", async t => {
  const weekly = aiSessionListPayload.items[1]!;
  const later = { ...weekly, id: "session:after-retry", title: "重试后会话", organization: { ...weekly.organization, customTitle: "重试后会话" } };
  const p = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, items: [aiSessionListPayload.items[0]], nextCursor: "retry-cursor", hasMore: true },
    "||retry-cursor": { ...aiSessionListPayload, items: [later], nextCursor: null, hasMore: false },
  } });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/ai/conversations/sessions"));
  await press(p, "全部会话"); await update(p, { holdReads: true }); await press(p, "加载更多历史记录");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "retry-cursor"));
  const failedIndex = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((request: any) => new URL(request.url).searchParams.get("cursor") === "retry-cursor"));
  await p.evaluate(index => (window as any).fixture.reply(index, 503), failedIndex); await settle(p);
  assert.equal(await p.getByRole("button", { name: "打开历史记录：产品试点讨论", exact: true }).count(), 1);
  assert.equal(await p.getByText("历史记录未能读取", { exact: true }).count(), 1);
  await update(p, { holdReads: false }); await press(p, "重试加载更多");
  await p.getByRole("button", { name: "打开历史记录：重试后会话", exact: true }).waitFor();
  const cursors = await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/ai/conversations/sessions").map((request: any) => new URL(request.url).searchParams.get("cursor")));
  assert.deepEqual(cursors, [null, "retry-cursor", "retry-cursor"]);
});
for (const patch of [{ actor: "actor-2" }, { cookieHeader: "orbit_session=changed" }, { baseUrl: "https://other.example" }]) test("AI late continuation from a prior scope cannot appear after scope changes " + JSON.stringify(patch), async t => {
  const weekly = aiSessionListPayload.items[1]!;
  const later = { ...weekly, id: "session:old-account", title: "旧账号会话", organization: { ...weekly.organization, customTitle: "旧账号会话" } };
  const p = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, items: [aiSessionListPayload.items[0]], nextCursor: "old-account-cursor", hasMore: true },
    "||old-account-cursor": { ...aiSessionListPayload, items: [later], nextCursor: null, hasMore: false },
  } });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/ai/conversations/sessions"));
  await press(p, "全部会话"); await update(p, { holdReads: true }); await press(p, "加载更多历史记录");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "old-account-cursor"));
  const pendingIndex = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((request: any) => new URL(request.url).searchParams.get("cursor") === "old-account-cursor"));
  await update(p, patch);
  await p.evaluate(index => (window as any).fixture.reply(index, 200), pendingIndex); await settle(p);
  assert.equal(await p.getByRole("button", { name: "打开历史记录：旧账号会话", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "打开历史记录：产品试点讨论", exact: true }).count(), 0);
});

test("AI home prompt selection never sends and its editable draft submits only once", async t => {
  const p = await open(t); await press(p, "填入问题：今天先处理哪些事？");
  const input = p.getByRole("textbox", { name: "消息", exact: true }); assert.equal(await input.inputValue(), "今天先处理哪些事？");
  assert.deepEqual(await writes(p), []); assert.deepEqual(await navigation(p), []);
  await input.fill("  我自己修改的问题  "); await twice(p, "发送");
  assert.equal(await input.inputValue(), "  我自己修改的问题  ", "retain the draft until navigation hands it to the conversation");
  assert.deepEqual(await navigation(p), [{ pathname: "/ai/[id]", params: { id: "new", initialMessage: "我自己修改的问题", sendIntent: "test-send-intent" } }]); assert.deepEqual(await writes(p), []);
});

test("AI home preserves the draft when a send intent cannot be created", async t => {
  const p = await open(t, { failIntent: true });
  const input = p.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("这条问题不能丢"); await press(p, "发送");
  assert.equal(await input.inputValue(), "这条问题不能丢");
  assert.equal(await p.getByText("暂时无法发送，问题已保留，请重试。", { exact: true }).count(), 1);
  assert.deepEqual(await navigation(p), []); assert.deepEqual(await writes(p), []);
  await update(p, { failIntent: false }); await press(p, "发送");
  assert.equal((await navigation(p)).length, 1);
});

for (const [label, target] of [["交流会准备", "/ai/conversation%3A1"], ["产品试点讨论", { pathname: "/ai/[id]", params: { id: "session:1", source: "session" } }]] as const) test("AI recent row preserves its real source " + label, async t => {
  const p = await open(t); await press(p, "继续会话：" + label); assert.deepEqual(await navigation(p), [target]); assert.deepEqual(await writes(p), []);
});
test("AI home returns to the real home without any data write", async t => { const p = await open(t); await press(p, "首页"); assert.deepEqual(await navigation(p), ["/home"]); assert.deepEqual(await writes(p), []); });
test("AI foreground badge refresh leaves the unsent composer intact and does not read other sources again", async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads,
    "/api/inbox/summary": relationshipInbox(2),
  } });
  await p.getByRole("textbox", { name: "消息", exact: true }).fill("切回应用后仍未发送的问题");
  await press(p, "更多操作"); await press(p, "常用入口");
  const inbox = p.getByRole("button", { name: "打开收件箱", exact: true });
  assert.equal(await inbox.locator(":scope > div").count(), 1);
  const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await update(p, { appState: "background", holdReads: true });
  assert.equal(await inbox.locator(":scope > div").count(), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), before);
  await update(p, { appState: "active" });
  assert.equal(await inbox.locator(":scope > div").count(), 0);
  assert.deepEqual(await p.evaluate(before => (window as any).fixture.requests.slice(before).map((r: any) => [r.method, r.path]).sort(), before), [["GET", "/api/inbox/summary"]]);
  await p.evaluate(before => { const s = (window as any).fixture; s.requests.forEach((r: any, i: number) => { if (i >= before) s.reply(i); }); }, before); await settle(p);
  assert.equal(await inbox.locator(":scope > div").count(), 1);
  await p.getByRole("button", { name: "关闭侧栏", exact: true }).last().click(); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), "切回应用后仍未发送的问题");
  assert.deepEqual(await writes(p), []); assert.deepEqual(await navigation(p), []);
});
test("AI home more menu retains scanning and the existing capability drawer", async t => {
  const p = await open(t); await press(p, "更多操作"); await press(p, "扫名片"); assert.deepEqual(await navigation(p), ["/contacts/new"]);
  await press(p, "更多操作"); await press(p, "常用入口"); await press(p, "打开个人档案"); assert.deepEqual(await navigation(p), ["/contacts/new", "/profile"]);
});
for (const [actor, name, expected] of [
  ["user_mry5y200_58jpi8", "Alex Chen", "Alex Chen"],
  ["actor-1", "  ", "账号"],
  ["user_mry5y200_58jpi8", "", "账号"]
]) test(`AI drawer shows the real login identity or a generic fallback: ${actor} ${expected}`, async t => {
  const p = await open(t, { actor, name });
  await p.getByRole("textbox", { name: "消息", exact: true }).fill("尚未发送的问题");
  await press(p, "更多操作"); await press(p, "常用入口");
  const account = p.getByRole("button", { name: "打开个人档案", exact: true });
  assert.equal(await account.getByText(expected!, { exact: true }).count(), 1);
  assert.equal(await account.getByText("小雨", { exact: true }).count(), 0);
  await press(p, "打开个人档案");
  assert.deepEqual(await navigation(p), ["/profile"]);
  assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), "尚未发送的问题");
  assert.deepEqual(await writes(p), []);
});
test("AI opening and closing history preserves draft and history search is real", async t => {
  const p = await open(t); await p.getByRole("textbox", { name: "消息", exact: true }).fill("尚未发送"); await press(p, "全部会话");
  await p.getByPlaceholder("搜索历史").fill("产品试点");
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("q") === "产品试点"));
  assert.equal(await p.getByRole("button", { name: /^打开历史记录：/ }).count(), 1);
  await press(p, "关闭历史"); assert.equal(await p.getByRole("textbox", { name: "消息", exact: true }).inputValue(), "尚未发送"); assert.deepEqual(await writes(p), []);
});
test("AI history preserves multilingual titles containing ordinary implementation-like words", async t => {
  const title = "Live music provider · 東京で会いましょう？";
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations/sessions": { ...aiSessionListPayload, items: [{ ...aiSessionListPayload.items[0], title, organization: { ...aiSession.organization, customTitle: title } }] } } });
  assert.equal(await p.getByRole("button", { name: "继续会话：" + title, exact: true }).count(), 1);
});
test("AI home retains actual assistant business text below recent history", async t => {
  const text = "We compared Live music provider options for 東京.\nNext: discuss the generated sound.";
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": { ...aiConversationPayload, assistantMessage: text, messages: [{ ...aiConversationPayload.messages[1], content: text }] } } });
  assert.equal(await p.getByText(text, { exact: true }).count(), 1);
});
test("AI loading history is not shown as an empty list", async t => {
  const p = await open(t, { holdReads: true }); assert.equal(await p.getByText("正在读取最近会话", { exact: true }).count(), 1); assert.equal(await p.getByText("还没有会话", { exact: true }).count(), 0);
});
for (const [path, title, retry, other] of [["/api/ai/conversations", "会话记录未能读取", "重试会话记录", "产品试点讨论"], ["/api/ai/conversations/sessions", "历史记录未能读取", "重试历史记录", "交流会准备"]] as const) test("AI full history shows partial failure and retries only its failed source " + path, async t => {
  const p = await open(t, { failPaths: [path] }); await press(p, "全部会话");
  const panel = p.getByText("历史记录", { exact: true }).locator("..").locator("..");
  assert.equal(await panel.getByText(title, { exact: true }).count(), 1); assert.equal(await panel.getByRole("button", { name: "打开历史记录：" + other, exact: true }).count(), 1);
  const count = await p.evaluate(() => (window as any).fixture.requests.length); await update(p, { failPaths: [] }); await panel.getByRole("button", { name: retry, exact: true }).click(); await settle(p);
  assert.deepEqual(await p.evaluate(count => (window as any).fixture.requests.slice(count).map((r: any) => [r.method, r.path]), count), [["GET", path]]);
  assert.equal(await panel.getByText(title, { exact: true }).count(), 0);
});
test("AI full history never calls a failed conversation source an empty history", async t => {
  const p = await open(t, { failPaths: ["/api/ai/conversations"], payloads: { ...aiReadPayloads, "/api/ai/conversations/sessions": emptyAiSessionListPayload } }); await press(p, "全部会话");
  const panel = p.getByText("历史记录", { exact: true }).locator("..").locator("..");
  assert.equal(await panel.getByText("会话记录未能读取", { exact: true }).count(), 1); assert.equal(await panel.getByText("还没有历史记录", { exact: true }).count(), 0);
});
for (const [patch, notice] of [
  [{ holdReads: true }, "正在读取最近会话"],
  [{ failPaths: ["/api/ai/conversations"], payloads: { ...aiReadPayloads, "/api/ai/conversations/sessions": emptyAiSessionListPayload } }, "会话记录未能读取"],
  [{ failPaths: ["/api/ai/conversations/sessions"], payloads: { ...aiReadPayloads, "/api/ai/conversations": emptyAiConversationPayload } }, "历史记录未能读取"]
] as const) test("AI capability drawer does not hide an incomplete history source " + notice, async t => {
  const p = await open(t, patch); await press(p, "更多操作"); await press(p, "常用入口"); await p.getByRole("button", { name: "扫名片", exact: true }).waitFor({ state: "hidden" });
  const drawer = p.getByRole("button", { name: "关闭侧栏", exact: true }).last().locator("..").locator("..").locator("..");
  assert.equal(await drawer.getByText(notice, { exact: true }).count(), 1);
  assert.equal(await drawer.getByText("还没有匹配的对话。", { exact: true }).count(), 0);
  if (!("holdReads" in patch)) assert.equal(await drawer.getByRole("button", { name: notice.startsWith("会话") ? "重试会话记录" : "重试历史记录", exact: true }).count(), 1);
});
test("AI only genuine empty sources show an empty history", async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": emptyAiConversationPayload, "/api/ai/conversations/sessions": emptyAiSessionListPayload } });
  assert.equal(await p.getByText("还没有会话", { exact: true }).count(), 1); assert.equal(await p.getByRole("button", { name: /^继续会话：/ }).count(), 0);
});
for (const item of [{ ...aiSessionListPayload.items[0], id: "" }, { ...aiSessionListPayload.items[0], messages: aiSession.messages }]) test("AI malformed session summary cannot disappear into an empty history " + JSON.stringify(item), async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": emptyAiConversationPayload, "/api/ai/conversations/sessions": { ...aiSessionListPayload, items: [item] } } });
  assert.equal(await p.getByText("历史记录未能读取", { exact: true }).count(), 1); assert.equal(await p.getByText("还没有会话", { exact: true }).count(), 0);
});
for (const payload of [{ ...emptyAiConversationPayload, state: "success" }, { ...emptyAiConversationPayload, state: "pending" }, { ...emptyAiConversationPayload, activeConversationId: "not-empty" }, { ...aiConversationPayload, messages: [] }]) test("AI inconsistent conversation read state cannot become empty success " + JSON.stringify(payload), async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": payload, "/api/ai/conversations/sessions": emptyAiSessionListPayload } });
  assert.equal(await p.getByText("会话记录未能读取", { exact: true }).count(), 1); assert.equal(await p.getByText("还没有会话", { exact: true }).count(), 0);
});
test("AI pending conversation records do not claim that history is empty", async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": { ...aiConversationPayload, state: "pending" }, "/api/ai/conversations/sessions": emptyAiSessionListPayload } });
  assert.equal(await p.getByText("会话记录正在准备", { exact: true }).count(), 1); assert.equal(await p.getByText("还没有会话", { exact: true }).count(), 0);
});
test("AI confirmed deletion removes only the acknowledged session and refreshes its source", async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "全部会话"); await p.getByRole("button", { name: "删除历史记录", exact: true }).first().click(); await settle(p); await press(p, "确认删除");
  const count = await p.evaluate(() => (window as any).fixture.requests.length);
  await update(p, { payloads: { ...aiReadPayloads, "/api/ai/conversations/sessions": { ...aiSessionListPayload, items: aiSessionListPayload.items.slice(1) } } });
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "DELETE"), 200, { deleted: true, storage: { configured: true, persisted: true, source: "session-store" } }); }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "打开历史记录：产品试点讨论", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "打开历史记录：本周安排", exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(count => (window as any).fixture.requests.slice(count).map((r: any) => [r.method, r.path]), count), [["GET", "/api/ai/conversations/sessions"]]);
});
test("AI stale next action cannot navigate with a previous account's task", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.oldOpen = s.presses["打开待办：整理访谈记录"]; }); await update(p, { actor: "actor-2", holdReads: true });
  await p.evaluate(() => { (window as any).fixture.oldOpen(); }); await settle(p); assert.deepEqual(await navigation(p), []);
});
for (const patch of [{ actor: "actor-2" }, { focused: false }, { mounted: false }]) test("AI stale delete result cannot expire a new route " + JSON.stringify(patch), async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "全部会话"); await p.getByRole("button", { name: "删除历史记录", exact: true }).first().click(); await settle(p); await press(p, "确认删除"); await update(p, patch);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "DELETE"), 401); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0); assert.equal((await writes(p)).length, 1);
});
for (const payload of [{}, { ...aiSessionListPayload, items: [{ ...aiSessionListPayload.items[0], id: "" }] }, { ...aiSessionListPayload, items: [aiSessionListPayload.items[0], aiSessionListPayload.items[0]] }, { ...aiSessionListPayload, nextCursor: "orphaned-cursor" }]) test("AI invalid history stays retryable " + JSON.stringify(payload), async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations/sessions": payload } });
  assert.equal(await p.getByText("历史记录未能读取", { exact: true }).count(), 1); assert.equal(await p.getByRole("button", { name: "继续会话：交流会准备", exact: true }).count(), 1);
  await update(p, { payloads: aiReadPayloads }); await press(p, "重试历史记录"); await p.getByRole("button", { name: "继续会话：产品试点讨论", exact: true }).waitFor(); assert.deepEqual(await writes(p), []);
});
for (const payload of [{}, { ...aiConversationPayload, conversations: [{ ...aiConversationPayload.conversations[0], conversationId: "" }] }]) test("AI invalid conversation list does not fabricate empty success " + JSON.stringify(payload), async t => {
  const p = await open(t, { payloads: { ...aiReadPayloads, "/api/ai/conversations": payload } }); assert.equal(await p.getByText("会话记录未能读取", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "继续会话：产品试点讨论", exact: true }).count(), 1);
});
for (const patch of [{ ready: false }, { baseReady: false }, { focused: false }, { signedIn: false }, { actor: "" }]) test("AI inactive route makes no private reads " + JSON.stringify(patch), async t => {
  const p = await open(t, patch); assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
});
for (const patch of [{ actor: "actor-2" }, { cookieHeader: "orbit_session=changed" }, { baseUrl: "https://other.example" }, { focused: false }, { signedIn: false }, { mounted: false }]) test("AI stale reads cannot expire a new account " + JSON.stringify(patch), async t => {
  const p = await open(t, { holdReads: true }); const count = await p.evaluate(() => (window as any).fixture.requests.length); await update(p, patch);
  await p.evaluate(count => { const s = (window as any).fixture; for (let i = 0; i < count; i++) s.reply(i, 401); }, count); await settle(p); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});
test("AI history deletion requires confirmation and ignores repeated clicks", async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "全部会话"); await p.getByRole("button", { name: "删除历史记录", exact: true }).first().click(); await settle(p);
  assert.deepEqual(await writes(p), []); await press(p, "取消删除"); assert.deepEqual(await writes(p), []);
  await p.getByRole("button", { name: "删除历史记录", exact: true }).first().click(); await settle(p); await twice(p, "确认删除");
  assert.deepEqual(await writes(p), [{ method: "DELETE", path: "/api/ai/conversations/sessions/session%3A1", body: null }]);
});
test("AI history organization menu persists pin and move through revisioned PATCH without model calls", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "全部会话");
  await p.getByRole("button", { name: "整理会话", exact: true }).first().click();
  await settle(p);
  assert.equal(await p.getByRole("heading", { name: "整理会话", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "移动到分组：工作", exact: true }).count(), 1);
  await press(p, "置顶会话");
  assert.deepEqual(await writes(p), [{
    method: "PATCH",
    path: "/api/ai/conversations/sessions/session%3A1",
    body: { expectedRevision: 2, mutationId: "test-send-intent", patch: { pinned: true } }
  }]);
  assert.equal((await writes(p)).some((item: { path: string }) => item.path === "/api/ai/conversations"), false);
});
test("AI organization delete returns to a visible history confirmation", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "全部会话");
  await p.getByRole("button", { name: "整理会话", exact: true }).first().click();
  await settle(p);
  await press(p, "删除会话");
  await p.waitForTimeout(350);
  assert.equal(await p.getByRole("button", { name: "确认删除", exact: true }).isVisible(), true);
  assert.deepEqual(await writes(p), []);
});
test("AI group manager creates, opens, and starts a grouped chat without sending automatically", async t => {
  const p = await open(t, { holdWrites: true });
  await press(p, "全部会话");
  await press(p, "管理分组");
  await p.waitForTimeout(350);
  assert.equal(await p.getByText("历史记录", { exact: true }).isVisible(), false, "group manager replaces the native history modal instead of stacking a second modal behind it");
  await p.getByRole("textbox", { name: "新分组名称", exact: true }).fill("客户 A");
  await press(p, "创建分组");
  assert.deepEqual(await writes(p), [{
    method: "POST",
    path: "/api/ai/conversations/groups",
    body: { id: "group:test-send-intent", mutationId: "test-send-intent", name: "客户 A" }
  }]);

  const p2 = await open(t, { pagePayloads: {
    first: { ...aiSessionListPayload, nextCursor: "all-groups-next", hasMore: true },
    "all-groups-next": { ...emptyAiSessionListPayload },
  } });
  await press(p2, "全部会话"); await press(p2, "加载更多历史记录");
  await p2.waitForFunction(() => (window as any).fixture.requests.some((request: any) => new URL(request.url).searchParams.get("cursor") === "all-groups-next"));
  await press(p2, "管理分组"); await press(p2, "打开分组：工作");
  assert.equal(await p2.getByText("历史记录 · 工作", { exact: true }).count(), 1);
  await p2.waitForFunction(() => (window as any).fixture.requests.some((request: any) => {
    const url = new URL(request.url); return request.path === "/api/ai/conversations/sessions" && url.searchParams.get("groupId") === "group:work";
  }));
  const groupedRead = await p2.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/ai/conversations/sessions").map((request: any) => request.url).at(-1));
  assert.equal(new URL(groupedRead).searchParams.has("cursor"), false, "changing group must read the first filtered page, not reuse an earlier cursor");
  await press(p2, "管理分组"); await press(p2, "在分组中新建：工作");
  assert.equal(await p2.getByRole("textbox", { name: "消息", exact: true }).inputValue(), "");
  assert.deepEqual(await writes(p2), []);
});
for (const [payload, status] of [[{}, 200], [{ deleted: false, storage: { configured: true, persisted: true } }, 200], [{ deleted: true, storage: { configured: false, persisted: false } }, 200], [{ deleted: true, storage: { configured: true, persisted: true } }, 503]] as const) test("AI history deletion rejects an unconfirmed receipt " + JSON.stringify([payload, status]), async t => {
  const p = await open(t, { holdWrites: true }); await press(p, "全部会话"); await p.getByRole("button", { name: "删除历史记录", exact: true }).first().click(); await settle(p); await press(p, "确认删除");
  await p.evaluate(({ payload, status }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "DELETE"), status, payload); }, { payload, status }); await settle(p);
  assert.equal(await p.getByText("尚未确认删除，请重试。", { exact: true }).count(), 1); assert.equal(await p.getByRole("button", { name: "打开历史记录：产品试点讨论", exact: true }).count(), 1);
});
for (const patch of [{ width: 320, fontScale: 1.6 }, { width: 820 }, { dark: true }]) test("AI composer and final actions remain reachable " + JSON.stringify(patch), async t => {
  const p = await open(t, patch); const input = p.getByRole("textbox", { name: "消息", exact: true }); await input.fill("可以继续编辑和发送的问题。".repeat(12));
  const box = await input.boundingBox(); assert.ok(box && box.width > 100 && box.y >= 0 && box.y + box.height <= 820);
  for (const name of ["发送", "更多操作", "首页", "对话历史"]) { const b = await p.getByRole("button", { name, exact: true }).boundingBox(); assert.ok(b && b.width >= 43.999 && b.height >= 43.999, name); }
  assert.equal(await p.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await p.getByRole("button", { name: "打开待办：整理访谈记录", exact: true }).scrollIntoViewIfNeeded(); await press(p, "打开待办：整理访谈记录"); assert.equal((await navigation(p)).length, 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-ai-home-" + (patch.dark ? "dark" : patch.width) + ".png" });
});
