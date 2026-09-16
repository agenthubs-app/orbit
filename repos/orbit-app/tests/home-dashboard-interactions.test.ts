import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
const relationshipInbox = (count: number, actor = "one", id = "current") => {
  const remote = `remote:${actor}`;
  return {
    conversations: [{
      conversationId: id, contactId: `contact:${id}`, participantAccountIds: [actor, remote],
      participantDisplayNames: { [actor]: actor, [remote]: remote }, qualificationVersion: `qualification:${id}`,
      status: "active", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", unreadCount: count,
      messages: Array.from({ length: Math.max(count, 1) }, (_, index) => ({
        messageId: `message:${id}:${index}`, conversationId: id, senderAccountId: remote,
        senderDisplayName: remote, body: `message ${index}`, sentAt: "2026-09-15T00:00:00Z", deliveryState: "delivered"
      }))
    }],
    refreshedAt: "2026-09-15T00:00:00Z"
  };
};
const inputTask = (patch: Record<string, unknown> = {}) => ({
  id: "task:/one", title: "发送项目介绍", category: "work", status: "open", priority: "normal",
  plannedDate: "2026-09-11", source: "manual", ...patch
});
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
import iconGlyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
const listeners = new Set(); const nativeListeners = new Set(); const timers = new Map(); let version = 0, timerId = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => version);
const NativeDate = Date;
window.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [window.fixture?.now || "2026-09-11T05:00:00Z"])); }
  static now() { return new NativeDate(window.fixture?.now || "2026-09-11T05:00:00Z").getTime(); }
};
window.setInterval = (fn, ms) => { const id = ++timerId; timers.set(id, fn); return id; };
window.clearInterval = id => timers.delete(id);
const task = (patch = {}) => ({ id: "task:/one", title: "发送项目介绍", category: "work", status: "open", priority: "normal",
  plannedDate: "2026-09-11", source: "manual", ...patch });
const schedule = (patch = {}) => ({ id: "schedule:one", title: "合作沟通", kind: "meeting", state: "upcoming",
  sourceId: "appointment:one", startsAt: "2026-09-11T05:30:00Z", endsAt: "2026-09-11T06:00:00Z", location: "线上", ...patch });
const recommendation = (patch = {}) => ({ eventId: "event:/one", title: "周末产品交流会", startsAt: "2026-09-12T05:00:00Z",
  location: "东京", venue: "涩谷", valueScore: 92, scoreBand: "high",
  signals: [{ label: "目标一致", detail: "适合交流产品经验", weight: 1 }], recommendedAction: "先查看活动详情", ...patch });
const state = window.fixture = {
  actor: "one", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: true,
  focused: true, appState: "active", mounted: true, fontScale: 1, width: 390,
  requests: [], replies: [], navigation: [], presses: {}, expiries: 0, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); if (patch.appState) nativeListeners.forEach(fn => fn(patch.appState)); version++; listeners.forEach(fn => fn()); },
  tick() { [...timers.values()].forEach(fn => fn()); },
  body(path) {
    if (path.startsWith("/api/inbox/notifications")) return state.typedInbox ?? { enabled: false, items: [], unreadCount: 0, nextCursor: null, asOf: '2026-09-16T00:00:00.000Z' };
    if (state.visual) {
      if (path === "/api/tasks") return { tasks: state.tasks ?? ["发送项目介绍", "确认下周会面时间", "补充合作记录", "整理访谈提纲", "回复活动报名问题"].map((title, index) => task({ id: "visual-task-" + index, title })) };
      if (path === "/api/schedule-items") return { scheduleItems: [
        schedule({ id: "visual-schedule-1", title: "陈默 · 需求复盘", startsAt: "2026-09-11T01:00:00Z", endsAt: "2026-09-11T01:30:00Z" }),
        schedule({ id: "visual-schedule-2", title: "林悦 · 合作沟通" }),
        schedule({ id: "visual-schedule-3", title: "周宁 · 项目讨论", startsAt: "2026-09-11T07:00:00Z", endsAt: "2026-09-11T07:45:00Z" }),
      ] };
      if (path === "/api/recommendations/events") return state.recommendations ?? { state: "success", recommendations: [
        recommendation(), recommendation({ eventId: "event:/two", title: "设计师午间聚会", startsAt: "2026-09-13T03:00:00Z", venue: "代官山" })
      ] };
      if (path === "/api/relationship-communication/conversations") { const actor = state.actor, remote = "remote:" + actor; return { conversations: [{ conversationId: "visual-inbox", contactId: "contact:visual", participantAccountIds: [actor, remote], participantDisplayNames: { [actor]: actor, [remote]: remote }, qualificationVersion: "qualification:visual", status: "active", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", unreadCount: 3, messages: [0, 1, 2].map(index => ({ messageId: "visual-message:" + index, conversationId: "visual-inbox", senderAccountId: remote, senderDisplayName: remote, body: "message " + index, sentAt: "2026-09-15T00:00:00Z", deliveryState: "delivered" })) }], refreshedAt: "2026-09-15T00:00:00Z" }; }
    }
    if (path === "/api/tasks") return { tasks: state.tasks ?? [task(), task({ id: "future", title: "周末整理资料", plannedDate: "2026-09-12" })] };
    if (path === "/api/schedule-items") return { scheduleItems: [schedule(), schedule({ id: "event", title: "设计分享会", kind: "event", sourceId: "event:/one",
      startsAt: "2026-09-11T07:00:00Z", endsAt: "2026-09-11T08:00:00Z" })] };
    if (path === "/api/recommendations/events") return state.recommendations ?? { state: "success", recommendations: [recommendation()] };
    if (path === "/api/relationship-communication/conversations") return { conversations: [], refreshedAt: "2026-09-15T00:00:00Z" };
    return { items: [], notifications: [] };
  },
  reply(index, data, status = 200, success = status === 200) {
    const r = state.requests[index]; r.replied = true;
    state.replies[index](new Response(JSON.stringify(success ? { success: true, data: data ?? state.body(r.path) }
      : { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "暂时无法读取，请重试。" } }),
      { status, headers: { "Content-Type": "application/json" } }));
  },
  replyReads() { state.requests.forEach((r, i) => { if (r.method === "GET" && !r.replied) state.reply(i); }); },
};
onSessionExpired(() => { state.expiries++; });
window.fetch = async (url, init) => {
  state.requests.push({ url: String(url), path: new URL(url).pathname, method: init.method, body: init.body,
    headers: init.headers, actor: state.actor, signal: init.signal });
  return new Promise(resolve => state.replies.push(resolve));
};
export const useFixture = () => { observe(); return state; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: state.baseUrl, ready: state.baseReady }; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, cookieHeader: state.cookieHeader,
  accountId: state.actor || null, actorId: state.actor || null, user: state.actor ? { id: state.actor } : null }; };
export const usePathname = () => "/home";
export const useGlobalSearchParams = () => ({});
export const useIsFocused = () => { observe(); return state.focused; };
export const useFocusEffect = fn => { observe(); useEffect(() => state.focused ? fn() : undefined, [fn, state.focused]); };
const router = { canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } };
export const useRouter = () => router;
export const Redirect = ({ href }) => <div role="status">{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ children, edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: state.safeAreaTop || 0 }]}>{children}</View>;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(iconGlyphs[name])}</span>;
export const AppState = { get currentState() { return state.appState; }, addEventListener(event, fn) {
  nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); } };
} };
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/home"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);',
      loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "home-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "home" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ },
        () => ({ path: "fixture", namespace: "home" }));
      plugin.onLoad({ filter: /.*/, namespace: "home" }, args => ({
        contents: args.path === "native" ? `
import React from "react"; import { Pressable as NativePressable, RefreshControl as NativeRefreshControl, StyleSheet, Text as NativeText, TextInput as NativeTextInput, useWindowDimensions as nativeDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web"; export { AppState } from "fixture";
export const useWindowDimensions = () => { const s = useFixture(); return { ...nativeDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <NativePressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <NativeRefreshControl {...props} />; };
// RNW does not apply the OS font multiplier. Model that native boundary once
// per declared font size, leaving nested inherited text and actual layout real.
const scaled = (props, scale) => {
  const style = StyleSheet.flatten(props.style) || {};
  return props.allowFontScaling === false || !style.fontSize ? props.style : [props.style, { fontSize: style.fontSize * scale,
    ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }];
};
export const Text = props => { const s = useFixture(); return <NativeText {...props} style={scaled(props, s.fontScale)} />; };
export const TextInput = props => { const s = useFixture(); return <NativeTextInput {...props} style={scaled(props, s.fontScale)} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd()
      }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  p.setDefaultTimeout(1500);
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await p.addScriptTag({ content: script }); await settle(p); await p.evaluate(() => document.fonts.ready);
  return p;
}
async function hydrate(p: Page) { await p.evaluate(() => (window as any).fixture.replyReads()); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ path: r.path, body: JSON.parse(r.body), method: r.method, actor: r.actor }))); }
async function writeIndex(p: Page) { return p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.method === "PATCH")); }
async function reply(p: Page, index: number, data: unknown, status = 200) { await p.evaluate(({ index, data, status }) => (window as any).fixture.reply(index, data, status), { index, data, status }); await settle(p); }

test("real home route reads actual sections, shows named skeletons and never redirects or writes on mount", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("textbox", { name: "搜索人脉" }).count(), 1);
  assert.equal(await p.getByRole("progressbar", { name: "正在读取日程" }).count(), 1);
  assert.doesNotMatch(await p.locator("body").innerText(), /\/ai|3 条未读|今日有 5/);
  await hydrate(p);
  assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
  assert.match(await p.locator("body").innerText(), /14:30/);
  assert.match(await p.locator("body").innerText(), /线上 · 30 分钟/);
  assert.match(await p.locator("body").innerText(), /周末产品交流会/);
  assert.match(await p.locator("body").innerText(), /9月12日 周六 14:00/);
  assert.match(await p.locator("body").innerText(), /东京 · 涩谷/);
  assert.doesNotMatch(await p.locator("body").innerText(), /联系跟进|李安|周末整理资料/);
  assert.deepEqual(await writes(p), []);
});

test("search, shortcuts, inbox and real record destinations work without implicit writes", async t => {
  const p = await open(t); await hydrate(p);
  const search = p.getByRole("textbox", { name: "搜索人脉" });
  await search.fill(" 林 悦 "); await search.press("Enter"); await settle(p);
  for (const name of ["收件箱", "扫名片", "查看日程", "新建待办", "记笔记", "查看待办：发送项目介绍", "查看日程：设计分享会", "查看活动：周末产品交流会"]) await press(p, name);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [
    "/contacts/list?q=%E6%9E%97%20%E6%82%A6", "/inbox", "/contacts/new", "/schedule", "/today", "/notes/new",
    "/tasks/task%3A%2Fone", "/schedule/events/event%3A%2Fone", "/events/event%3A%2Fone"
  ]);
  assert.equal(await p.getByRole("button", { name: "联系跟进", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

for (const count of [0, 1, 5, 6]) {
  test("home displays at most five of " + count + " ordered incomplete tasks without changing the real count", async t => {
    const tasks = Array.from({ length: count }, (_, index) => inputTask({ id: "task:" + index, title: "待办 " + index }));
    const p = await open(t, { tasks: [inputTask({ id: "completed", title: "已完成", status: "completed" }), ...tasks] }); await hydrate(p);
    assert.equal(await p.getByRole("button", { name: /^查看待办：待办 / }).count(), Math.min(count, 5));
    assert.match(await p.getByRole("button", { name: "全部待办" }).innerText(), new RegExp("待办\\s*" + count + "\\s"));
    assert.equal(await p.getByRole("button", { name: "查看待办：已完成" }).count(), 0);
    if (count === 6) assert.equal(await p.getByRole("button", { name: "查看待办：待办 5" }).count(), 0);
  });
}

test("successful completion reloads the same ordering and fills the fifth slot", async t => {
  const tasks = Array.from({ length: 6 }, (_, index) => inputTask({ id: "task:" + index, title: "待办 " + index }));
  const p = await open(t, { tasks }); await hydrate(p);
  await press(p, "完成待办：待办 0");
  await reply(p, await writeIndex(p), { task: { id: "task:0", status: "completed" } });
  const read = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.path === "/api/tasks"));
  await reply(p, read, { tasks: tasks.slice(1) });
  assert.equal(await p.getByRole("button", { name: "查看待办：待办 5" }).count(), 1);
  assert.equal(await p.getByRole("button", { name: /^查看待办：待办 / }).count(), 5);
});

test("failed completion keeps the original five rows and does not reveal the sixth", async t => {
  const tasks = Array.from({ length: 6 }, (_, index) => inputTask({ id: "task:" + index, title: "待办 " + index }));
  const p = await open(t, { tasks }); await hydrate(p);
  await press(p, "完成待办：待办 0");
  await reply(p, await writeIndex(p), {}, 503);
  assert.equal(await p.getByRole("button", { name: "查看待办：待办 0" }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "查看待办：待办 5" }).count(), 0);
});

for (const state of ["loading", "empty", "failure"] as const) {
  test("all events remains browsable when recommendations are " + state, async t => {
    const p = await open(t);
    const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.path === "/api/recommendations/events"));
    if (state === "empty") await reply(p, index, { state: "empty", recommendations: [] });
    if (state === "failure") await reply(p, index, {}, 503);
    await press(p, "全部活动");
    assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events");
  });
}

test("selecting another day filters real content and changes the selected accessible date", async t => {
  const p = await open(t); await hydrate(p);
  await press(p, "2026-09-12 周六");
  assert.equal(await p.getByRole("button", { name: "2026-09-12 周六" }).getAttribute("aria-selected"), "true");
  assert.match(await p.locator("body").innerText(), /9\.12/);
  assert.match(await p.locator("body").innerText(), /周末整理资料/);
  assert.match(await p.locator("body").innerText(), /当天没有日程/);
  assert.equal(await p.getByRole("button", { name: "查看日程：合作沟通" }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("task completion is acknowledged, synchronously locked, encoded and followed by a real reload", async t => {
  const p = await open(t); await hydrate(p);
  await p.evaluate(() => { const fn = (window as any).fixture.presses["完成待办：发送项目介绍"]; if (!fn) throw new Error("missing real completion action"); fn(); fn(); });
  await settle(p);
  const sent = await writes(p);
  assert.equal(sent.length, 1); assert.equal(sent[0].method, "PATCH");
  assert.equal(sent[0].path, "/api/tasks/task%3A%2Fone");
  assert.equal(sent[0].body.action, "complete"); assert.match(sent[0].body.idempotencyKey, /^ios:home:complete:/);
  assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
  await reply(p, await writeIndex(p), { task: { id: "task:/one", status: "completed" } });
  const read = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.path === "/api/tasks"));
  await reply(p, read, { tasks: [] });
  assert.match(await p.locator("body").innerText(), /当天没有待办/);
});

for (const failure of ["http", "malformed"] as const) {
  test("completion " + failure + " failure stays visible and never removes the original task", async t => {
    const p = await open(t); await hydrate(p); await press(p, "完成待办：发送项目介绍");
    await reply(p, await writeIndex(p), { task: { id: "another-task", status: "completed" } }, failure === "http" ? 503 : 200);
    assert.equal(await p.getByRole("alert").count(), 1);
    assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
    await press(p, "完成待办：发送项目介绍");
    assert.equal((await writes(p)).length, 2);
  });
}

for (const change of [{ actor: "two" }, { baseUrl: "https://other.example" }, { cookieHeader: "session=new" }]) {
  test("new scope clears private content and rejects retained actions and late writes " + JSON.stringify(change), async t => {
    const p = await open(t); await hydrate(p);
    await p.evaluate(() => { (window as any).oldComplete = (window as any).fixture.presses["完成待办：发送项目介绍"]; });
    await press(p, "完成待办：发送项目介绍"); const index = await writeIndex(p);
    await update(p, change);
    assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 0);
    assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal.aborted, index), true);
    await p.evaluate(() => (window as any).oldComplete()); await settle(p);
    assert.equal((await writes(p)).length, 1);
    await reply(p, index, { task: { id: "task:/one", status: "completed" } });
    assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 0);
    await hydrate(p);
    assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
  });
}

for (const change of [{ focused: false }, { appState: "background" }, { mounted: false }, { signedIn: false }]) {
  test("inactive screen aborts writes and revokes retained callbacks " + JSON.stringify(change), async t => {
    const p = await open(t); await hydrate(p);
    await p.evaluate(() => { (window as any).oldComplete = (window as any).fixture.presses["完成待办：发送项目介绍"]; });
    await press(p, "完成待办：发送项目介绍"); const index = await writeIndex(p);
    await update(p, change); await p.evaluate(() => (window as any).oldComplete());
    assert.equal((await writes(p)).length, 1);
    assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal.aborted, index), true);
    await reply(p, index, { task: { id: "task:/one", status: "completed" } });
    assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 0);
  });
}

test("resume reloads server truth; independent errors retry without losing other sections", async t => {
  const p = await open(t); await hydrate(p);
  await update(p, { appState: "background" }); await update(p, { appState: "active" });
  assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 0);
  const index = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.path === "/api/tasks"));
  await reply(p, index, {}, 503); await hydrate(p);
  assert.equal(await p.getByRole("button", { name: "查看日程：合作沟通" }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "查看活动：周末产品交流会" }).count(), 1);
  assert.doesNotMatch(await p.locator("body").innerText(), /当天没有待办/);
  await press(p, "重试待办"); await hydrate(p);
  assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
});

test("invalid successful reads are errors, not empty counts", async t => {
  const p = await open(t);
  const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.path === "/api/schedule-items"));
  await reply(p, index, { scheduleItems: [{ title: "不完整的日程" }] }); await hydrate(p);
  assert.equal(await p.getByRole("button", { name: "重试日程" }).count(), 1);
  assert.doesNotMatch(await p.locator("body").innerText(), /当天没有日程/);
});

test("large font uses one column; narrow event rows stay within bounds and clear the tabs", async t => {
  const p = await open(t, { fontScale: 1.6, width: 320 }); await hydrate(p);
  const layout = p.getByTestId("home-day-sections");
  assert.equal(await layout.evaluate(el => getComputedStyle(el).flexDirection), "column");
  const last = p.getByRole("button", { name: "查看活动：周末产品交流会" }); await last.evaluate(el => el.scrollIntoView({ block: "start" })); await settle(p);
  const box = (await last.boundingBox())!; const tabs = (await p.getByRole("tablist", { name: "主导航" }).boundingBox())!;
  assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44);
  assert.ok(box.y + box.height <= tabs.y, JSON.stringify({ event: box, tabs }));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 320));
});

test("an unselected date follows Tokyo midnight without inventing writes", async t => {
  const p = await open(t); await hydrate(p);
  await update(p, { now: "2026-09-11T15:01:00Z" }); await p.evaluate(() => (window as any).fixture.tick()); await settle(p);
  assert.equal(await p.getByRole("button", { name: "2026-09-12 周六" }).getAttribute("aria-selected"), "true");
  assert.match(await p.locator("body").innerText(), /周末整理资料/);
  assert.deepEqual(await writes(p), []);
});

for (const patch of [{ baseReady: false }, { ready: false }, { signedIn: false }, { actor: "" }]) {
  test("private home waits for a complete identity and server scope " + JSON.stringify(patch), async t => {
    const p = await open(t, patch);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
    assert.equal(await p.getByRole("button", { name: "完成待办：发送项目介绍" }).count(), 0);
  });
}

test("inbox badge does not coalesce an empty-cookie read from a previous actor", async t => {
  const p = await open(t);
  await p.waitForFunction(() => (window as any).fixture.requests.some((r: any) => /relationship-communication/.test(r.path)));
  const oldInbox = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => /relationship-communication/.test(r.path)));
  assert.ok(oldInbox >= 0, JSON.stringify(await p.evaluate(() => ({ requests: (window as any).fixture.requests.map((r: any) => r.path), body: document.body.innerText }))));
  await update(p, { actor: "two" });
  await p.waitForFunction(oldInbox => (window as any).fixture.requests.findLastIndex((r: any) => /relationship-communication/.test(r.path)) > oldInbox, oldInbox);
  const newInbox = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => /relationship-communication/.test(r.path)));
  assert.ok(newInbox > oldInbox, "new actor needs an independent inbox read");
  await reply(p, oldInbox, relationshipInbox(99, "one", "old"));
  assert.equal(await p.getByTestId("home-inbox-badge").count(), 0);
  await reply(p, newInbox, relationshipInbox(2, "two"));
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
});

test("standard home keeps a two-column editorial layout with real counts and large touch targets", async t => {
  const p = await open(t, { visual: true, safeAreaTop: 48 });
  await p.waitForFunction(() => (window as any).fixture.requests.length === 6);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-home-loading-390-" + (process.env.HOME_QA_PASS ?? "current") + ".png" });
  await hydrate(p);
  assert.equal(await p.getByTestId("home-day-sections").evaluate(el => getComputedStyle(el).flexDirection), "row");
  assert.match(await p.locator("body").innerText(), /3 项日程 · 5 项待办/);
  for (const name of ["收件箱", "扫名片", "查看日程", "新建待办", "记笔记", "完成待办：发送项目介绍", "查看待办：发送项目介绍", "查看活动：周末产品交流会"]) {
    const box = (await p.getByRole("button", { name, exact: true }).boundingBox())!;
    assert.ok(box.width >= 44 && box.height >= 44, name + " is a full touch target");
  }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-home-390-" + (process.env.HOME_QA_PASS ?? "current") + ".png" });
});

test("matched source content retains weekday labels, source font fallback and event rows above the navigation", async t => {
  const p = await open(t, { visual: true, safeAreaTop: 48 });
  await p.waitForFunction(() => (window as any).fixture.requests.length === 6); await hydrate(p);
  assert.equal(await p.getByText("周五", { exact: true }).count(), 1);
  assert.match(await p.getByRole("button", { name: "查看日程：林悦 · 合作沟通" }).getByText("林悦 · 合作沟通").evaluate(el => getComputedStyle(el).fontFamily), /PingFang SC/);
  const last = (await p.getByRole("button", { name: "查看活动：设计师午间聚会" }).boundingBox())!;
  const bar = (await p.getByRole("tablist").boundingBox())!;
  assert.ok(last.y + last.height <= bar.y, JSON.stringify({ event: last, tabs: bar }));
  const heading = (await p.getByRole("button", { name: "全部待办" }).boundingBox())!;
  const firstTask = (await p.getByRole("button", { name: "完成待办：发送项目介绍" }).boundingBox())!;
  assert.ok(heading.height >= 44 && heading.y + heading.height <= firstTask.y, "compact visual rhythm must not overlap touch targets");
});

test("a recommended event uses the full-width image-first row", async t => {
  const p = await open(t); await hydrate(p);
  const event = (await p.getByRole("button", { name: "查看活动：周末产品交流会" }).boundingBox())!;
  assert.ok(event.width >= 350);
  assert.ok(event.height >= 52);
});

test("recommendations without an image retain a left-side thumbnail instead of inventing a photo", async t => {
  const p = await open(t); await hydrate(p);
  const event = p.getByRole("button", { name: "查看活动：周末产品交流会" });
  const thumbnail = event.locator(":scope > div").first();
  const box = (await thumbnail.boundingBox())!;
  assert.equal(box.width, 60);
  assert.equal(box.height, 44);
  assert.equal(await event.locator("img").count(), 0);
});

test("the source large-text setting stacks day sections and keeps the three available shortcuts in one row", async t => {
  const p = await open(t, { visual: true, safeAreaTop: 48, fontScale: 1.2 });
  await p.waitForFunction(() => (window as any).fixture.requests.length === 6); await hydrate(p);
  assert.equal(await p.getByTestId("home-day-sections").evaluate(el => getComputedStyle(el).flexDirection), "column");
  const first = (await p.getByRole("button", { name: "扫名片", exact: true }).boundingBox())!;
  const last = (await p.getByRole("button", { name: "记笔记", exact: true }).boundingBox())!;
  assert.equal(first.y, last.y);
  const textSize = await p.getByRole("button", { name: "查看日程：林悦 · 合作沟通" }).getByText("林悦 · 合作沟通").evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(textSize >= 15.5 && textSize <= 16);
  const firstSchedule = p.getByRole("button", { name: "查看日程：陈默 · 需求复盘" });
  assert.equal(await firstSchedule.evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
  const lastSchedule = (await p.getByRole("button", { name: "查看日程：周宁 · 项目讨论" }).boundingBox())!;
  const taskHeading = (await p.getByRole("button", { name: "全部待办" }).boundingBox())!;
  const lastTask = (await p.getByRole("button", { name: "查看待办：回复活动报名问题" }).boundingBox())!;
  const eventHeading = (await p.getByRole("button", { name: "全部活动" }).boundingBox())!;
  assert.ok(taskHeading.y >= lastSchedule.y + lastSchedule.height, JSON.stringify({ lastSchedule, taskHeading }));
  assert.ok(eventHeading.y >= lastTask.y + lastTask.height, JSON.stringify({ lastTask, eventHeading }));
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-home-large-390-" + (process.env.HOME_QA_PASS ?? "current") + ".png" });
});

test("loading sections use the approved schedule markers and task outlines without invented counts", async t => {
  const p = await open(t);
  const schedule = p.getByRole("progressbar", { name: "正在读取日程" });
  const tasks = p.getByRole("progressbar", { name: "正在读取待办" });
  assert.equal(await schedule.locator(':scope > div').count(), 2);
  assert.equal(await tasks.locator(':scope > div').count(), 3);
  const marker = (await schedule.locator(':scope > div').first().locator(':scope > div').first().boundingBox())!;
  const checkbox = (await tasks.locator(':scope > div').first().locator(':scope > div').first().boundingBox())!;
  assert.equal(marker.width, 3);
  assert.equal(checkbox.width, 16); assert.equal(checkbox.height, 16);
  assert.equal(await p.getByRole("button", { name: "全部日程" }).getByText("0", { exact: true }).count(), 0);
  const shortSummary = (await p.getByTestId("home-summary-loading").boundingBox())!;
  assert.equal(shortSummary.width, 140); assert.equal(shortSummary.height, 12);
  await press(p, "扫名片");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/new"]);
});

for (const change of [{ actor: "two" }, { focused: false }, { appState: "background" }, { mounted: false }]) {
  test("late badge 401 cannot expire a new or inactive home session " + JSON.stringify(change), async t => {
    const p = await open(t);
    await p.waitForFunction(() => (window as any).fixture.requests.length === 6);
    const indices = await p.evaluate(() => (window as any).fixture.requests.flatMap((r: any, index: number) =>
      /relationship-communication|notifications/.test(r.path) ? [index] : []));
    assert.equal(indices.length, 3);
    await update(p, change);
    for (const index of indices) await reply(p, index, {}, 401);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0, "no global expiry notification may escape an invalidated request");
    assert.equal(await p.evaluate(indices => indices.every((index: number) => (window as any).fixture.requests[index].signal?.aborted), indices), true);
  });
}

for (const [path, section] of [["/api/tasks", "待办"], ["/api/schedule-items", "日程"], ["/api/recommendations/events", "活动"]]) {
  test("HTTP 503 with a success envelope never grants a usable " + section + " read", async t => {
    const p = await open(t);
    const index = await p.evaluate(path => (window as any).fixture.requests.findIndex((r: any) => r.path === path), path);
    await p.evaluate(index => (window as any).fixture.reply(index, undefined, 503, true), index); await settle(p);
    await hydrate(p);
    assert.equal(await p.getByRole("button", { name: "重试" + section }).count(), 1);
    assert.deepEqual(await writes(p), []);
  });
}

test("HTTP 503 with a success completion envelope cannot acknowledge the write", async t => {
  const p = await open(t); await hydrate(p); await press(p, "完成待办：发送项目介绍");
  await p.evaluate(index => (window as any).fixture.reply(index, { task: { id: "task:/one", status: "completed" } }, 503, true), await writeIndex(p));
  await settle(p);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByRole("button", { name: "查看待办：发送项目介绍" }).count(), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/tasks").length), 1);
});

test("badge rejects counts carried by an HTTP 503 success envelope", async t => {
  const p = await open(t);
  await p.waitForFunction(() => (window as any).fixture.requests.length === 6);
  const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => /relationship-communication/.test(r.path)));
  await p.evaluate(index => (window as any).fixture.reply(index, { conversations: [], refreshedAt: "2026-09-15T00:00:00Z" }, 503, true), index);
  await settle(p); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").count(), 0);
});

test("pulling home refresh re-reads both badge sources and updates the visible count without writes", async t => {
  const p = await open(t, { visual: true }); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  const reads = await p.evaluate(() => (window as any).fixture.requests.slice(6).map((r: any) => r.path).sort());
  assert.deepEqual(reads, ["/api/inbox/notifications", "/api/notifications", "/api/recommendations/events", "/api/relationship-communication/conversations", "/api/schedule-items", "/api/tasks"]);
  const index = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => /relationship-communication/.test(r.path)));
  await reply(p, index, relationshipInbox(8)); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), ""); assert.deepEqual(await writes(p), []);
});

test("acknowledged home completion re-reads badge sources instead of decrementing them locally", async t => {
  const p = await open(t);
  const inbox = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => /relationship-communication/.test(r.path)));
  await reply(p, inbox, relationshipInbox(3)); await hydrate(p);
  await press(p, "完成待办：发送项目介绍");
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  await reply(p, await writeIndex(p), { task: { id: "task:/one", status: "completed" } });
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.slice(7).map((r: any) => r.path).sort()), ["/api/inbox/notifications", "/api/notifications", "/api/relationship-communication/conversations", "/api/tasks"]);
  await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").count(), 0);
  assert.equal((await writes(p)).length, 1);
});

test("a newer home refresh revokes old badge responses before they can publish session expiry", async t => {
  const p = await open(t, { visual: true }); await hydrate(p);
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  const oldReads = await p.evaluate(() => (window as any).fixture.requests.flatMap((r: any, i: number) => i >= 6 && /relationship-communication|notifications/.test(r.path) ? [i] : []));
  assert.equal(oldReads.length, 3);
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.evaluate(indices => indices.every((i: number) => (window as any).fixture.requests[i].signal.aborted), oldReads), true);
  for (const index of oldReads) await reply(p, index, {}, 401);
  const inbox = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => /relationship-communication/.test(r.path)));
  await reply(p, inbox, relationshipInbox(2)); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0); assert.deepEqual(await writes(p), []);
});

test("an invalid completion receipt neither reloads nor changes the home badge", async t => {
  const p = await open(t, { visual: true }); await hydrate(p);
  await press(p, "完成待办：发送项目介绍");
  await reply(p, await writeIndex(p), { task: { id: "another-task", status: "completed" } });
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => /relationship-communication|notifications/.test(r.path)).length), 3);
  assert.equal((await writes(p)).length, 1);
});

test("home badge re-reads persisted reminder states after returning from inbox", async t => {
  const p = await open(t);
  const reminders = ["notice:one", "notice:two", "notice:three"].map(reminderId => ({ reminderId, title: "准备资料", priority: "normal" }));
  const indices = await p.evaluate(() => { const s = (window as any).fixture; return {
    inbox: s.requests.findIndex((r: any) => /relationship-communication/.test(r.path)),
    notifications: s.requests.findIndex((r: any) => r.path === "/api/notifications"),
  }; });
  await reply(p, indices.inbox, relationshipInbox(2, "one", "thread:one"));
  await reply(p, indices.notifications, { state: "success", reminders, notificationInteractions: {} }); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  await update(p, { focused: false }); await update(p, { focused: true });
  const current = await p.evaluate(() => { const s = (window as any).fixture; return {
    inbox: s.requests.findLastIndex((r: any) => /relationship-communication/.test(r.path)),
    notifications: s.requests.findLastIndex((r: any) => r.path === "/api/notifications"),
  }; });
  assert.ok(current.inbox > indices.inbox && current.notifications > indices.notifications);
  await reply(p, current.inbox, relationshipInbox(2, "one", "thread:one"));
  await reply(p, current.notifications, { state: "success", reminders, notificationInteractions: { "notice:one": "read", "notice:two": "ignored" } }); await hydrate(p);
  assert.equal(await p.getByTestId("home-inbox-badge").innerText(), "");
  assert.deepEqual(await writes(p), []);
});
