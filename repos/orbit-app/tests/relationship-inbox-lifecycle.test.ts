import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Keep the private routes, resources, client and screen real. Native identity,
// navigation, snapshots and the remote HTTP service are the test boundaries.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let revision = 0, uuid = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const effects = { calendarEntryCreated: false, externalMessageSent: false, networkRequestMade: false, notificationDelivered: false, savedRecordCreated: false };
const state = window.fixture = {
  actor: "actor:one", cookieHeader: "", ready: true, signedIn: true, baseReady: true, baseUrl: "https://orbit.example", mounted: true,
  detail: false, conversationId: "thread:one", seed: {}, requests: [], replies: [], presses: {}, navigation: [], expiries: 0, holdReads: false, notifications: undefined,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  conversation() { return { conversationId: state.conversationId, contactId: "contact:one", participantName: state.actor, organization: "Example", subject: "会话主题", preview: "已有消息", unreadCount: 2, lastCorrespondenceAt: "2026-09-13T00:00:00Z", nextActionLabel: "", sourceContextLabels: [] }; },
  thread(body = "已有消息") { return { conversationId: state.conversationId, subject: "会话主题", summary: "", sourceContextLabels: [], messages: [{ messageId: "message:one", senderRole: "contact", senderName: state.actor, body, occurredAt: "2026-09-13T00:00:00Z" }] }; },
  data(path) {
    if (path.includes("/notifications/deliveries/") && state.delivery !== undefined) return state.delivery;
    if (path.includes("/notifications/deliveries/")) return { deliveryId: state.seed.deliveryId, signalId: "signal:one", signalRevision: "one", phase: "pre_event", channel: "in_app", status: "scheduled", title: "当前提醒", body: "确认提醒内容", target: { kind: "inbox", deliveryId: state.seed.deliveryId }, data: { deliveryId: state.seed.deliveryId }, scheduledFor: "2026-09-13T00:00:00Z", availableAt: "2026-09-13T00:00:00Z", attempt: 0, maxAttempts: 3, createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" };
    if (path === "/api/notifications") return state.notifications !== undefined ? state.notifications : { state: "success", reminders: [{ reminderId: "reminder:one", title: "需要准备资料", organization: "Example", priority: "normal", dueAt: "2026-09-13T00:00:00Z" }] };
    if (path.includes("relationship-signals")) return { signals: [] };
    return { inbox: { conversations: [state.conversation()] }, selectedThread: state.detail ? state.thread() : null, currentUser: { displayName: "当前用户" }, draftReply: { body: "" }, sideEffects: effects };
  },
  preview() { const r = state.requests.findLast(r => r.method === "POST"); return { inboxItem: { ...state.conversation(), participantName: r.body.participantName, subject: r.body.subject }, thread: { ...state.thread(r.body.body), subject: r.body.subject }, sideEffects: effects }; },
  reply(index, status = 200, data) { state.replies[index]?.(new Response(JSON.stringify(status >= 400 && data === undefined ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE", message: "测试服务暂不可用" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }), { status, headers: { "content-type": "application/json" } })); }
};
onSessionExpired(() => state.expiries++);
window.fetch = (input, init) => { const url = new URL(String(input)); const index = state.requests.length; state.requests.push({ method: init.method, path: url.pathname, search: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal }); const reply = new Promise(resolve => state.replies[index] = resolve); if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index)); return reply; };
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, user: state.actor ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return state.detail ? { id: state.conversationId } : state.seed; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => state.detail ? "/inbox/" + encodeURIComponent(state.conversationId) : "/inbox";
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const randomUUID = () => "test-inbox-scope-" + (++uuid);
export const readSnapshot = async (_baseUrl, _actorId, path) => path === "/api/notifications" && state.cachedNotifications ? { result: { success: true, status: 200, data: state.cachedNotifications, meta: { featureMode: null, privacy: null, runtimeBoundary: null } }, syncedAt: "2026-09-12T00:00:00Z" } : null;
export const writeSnapshot = async () => {};
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Inbox from "./app/(app)/inbox"; import Thread from "./app/inbox/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? s.detail ? <Thread /> : <Inbox /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "inbox-lifecycle-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "inbox-lifecycle" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "inbox-lifecycle" }));
      plugin.onLoad({ filter: /.*/, namespace: "inbox-lifecycle" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl } from "react-native-web"; export * from "react-native-web";
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(1500);
  const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script }); await settle(p); return p;
}
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function preview(p: Page) {
  await p.getByRole("button", { name: "写消息", exact: true }).click();
  await p.getByRole("textbox", { name: "收件人", exact: true }).fill("旧账号联系人");
  await p.getByRole("textbox", { name: "主题", exact: true }).fill("需要保留的主题");
  await p.getByRole("textbox", { name: "正文", exact: true }).fill("不能进入另一个账号的正文");
  await p.getByRole("button", { name: "预览草稿", exact: true }).click(); await settle(p);
}

for (const detail of [false, true]) {
  for (const patch of [{ ready: false }, { baseReady: false }, { actor: "" }]) test(`inbox ${detail ? "thread" : "list"} waits for full identity ${JSON.stringify(patch)}`, async t => {
    const p = await open(t, { detail, ...patch });
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
    assert.equal(await p.getByRole("textbox").count(), 0);
  });

  test(`inbox ${detail ? "thread" : "list"} never coalesces a new empty-cookie actor with old pending reads`, async t => {
    const p = await open(t, { detail, holdReads: true });
    const oldCount = await p.evaluate(() => (window as any).fixture.requests.length);
    assert.equal(oldCount, detail ? 1 : 3);
    await update(p, { actor: "actor:two" });
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), oldCount * 2);
    await p.evaluate(oldCount => { const s = (window as any).fixture; for (let i = 0; i < oldCount; i++) s.reply(i, 401); }, oldCount); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
    await p.evaluate(oldCount => { const s = (window as any).fixture; for (let i = oldCount; i < s.requests.length; i++) s.reply(i); }, oldCount); await settle(p);
    assert.match(await p.locator("body").innerText(), /actor:two/);
    assert.doesNotMatch(await p.locator("body").innerText(), /actor:one/);
  });

  for (const patch of [{ cookieHeader: "session=two" }, { baseUrl: "https://other.example" }, { ready: false }, { baseReady: false }, { mounted: false }]) test(`inbox ${detail ? "thread" : "list"} aborts late reads ${JSON.stringify(patch)}`, async t => {
    const p = await open(t, { detail, holdReads: true });
    const oldCount = await p.evaluate(() => (window as any).fixture.requests.length);
    await update(p, patch);
    assert.equal(await p.evaluate(oldCount => (window as any).fixture.requests.slice(0, oldCount).every((r: any) => r.signal?.aborted), oldCount), true);
    await p.evaluate(oldCount => { const s = (window as any).fixture; for (let i = 0; i < oldCount; i++) s.reply(i, 401); }, oldCount); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
    assert.deepEqual(await writes(p), []);
  });
}

for (const patch of [{ actor: "actor:two" }, { seed: { participantName: "新目标" } }, { seed: { deliveryId: "delivery:two" } }, { cookieHeader: "session=two" }]) test(`old preview cannot publish into the new inbox ${JSON.stringify(patch)}`, async t => {
  const p = await open(t); await preview(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldPreview = s.requests.findLastIndex((r: any) => r.method === "POST"); s.oldAction = s.presses["正在准备"]; s.oldReceipt = s.preview(); });
  await update(p, patch);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldPreview].signal?.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAction(); s.reply(s.oldPreview, 200, s.oldReceipt); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  assert.doesNotMatch(await p.locator("body").innerText(), /不能进入另一个账号的正文/);
  assert.equal(await p.getByRole("heading", { name: "草稿预览", exact: true }).count(), 0);
});

test("ordinary inbox refresh retains the in-progress preview and its draft", async t => {
  const p = await open(t); await preview(p);
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "不能进入另一个账号的正文");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "POST").signal?.aborted), false);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, s.preview()); }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "草稿预览", exact: true }).count(), 1);
});

test("a retained inbox conversation callback cannot navigate after account change", async t => {
  const p = await open(t);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldOpen = Object.entries(s.presses).find(([name]) => name.startsWith("actor:one，"))?.[1]; });
  await update(p, { actor: "actor:two" });
  await p.evaluate(() => (window as any).fixture.oldOpen()); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});

test("a notification target change revokes the old delivery action and late expiry", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" } });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "PATCH"); s.oldAction = s.presses["处理中"]; });
  await update(p, { seed: { deliveryId: "delivery:two" } });
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal?.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAction(); s.reply(s.oldWrite, 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1); assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByText("已记录为查看建议。", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).isEnabled(), true);
});

test("moving to another thread revokes rewrite results and clears the previous local reply", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("旧会话回复");
  await p.getByRole("button", { name: "润色草稿", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); });
  await update(p, { conversationId: "thread:two" });
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal?.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.oldWrite, 401); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "");
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("missing thread identity shows an error without reading a generic inbox", async t => {
  const p = await open(t, { detail: true, conversationId: "" });
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
  assert.match(await p.locator("body").innerText(), /缺少对话 ID/u);
});

const persistentReminder = { reminderId: "reminder:one", title: "需要准备资料", organization: "Example", priority: "normal", dueAt: "2026-09-13T00:00:00Z", href: "/tasks/task%3Aone" };
const persistentNotifications = { state: "success", reminders: [persistentReminder], notificationInteractions: {} };
const readReceipt = { notificationId: "reminder:one", state: "read", updatedAt: "2026-09-13T00:01:00Z" };
async function alerts(p: Page) { await p.getByRole("tab", { name: /^提醒/u }).click(); await settle(p); }

test("opening a reminder waits for a single valid read receipt before navigating and rereading", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; s.presses["打开提醒：需要准备资料"](); s.presses["打开提醒：需要准备资料"](); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/notifications/reminder%3Aone/state", body: { state: "read" } }]);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  await p.evaluate(receipt => { const s = (window as any).fixture; s.notifications.notificationInteractions["reminder:one"] = "read"; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, receipt); }, readReceipt); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3Aone"]);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/notifications").length), 2);
  assert.equal(await p.getByText("已读", { exact: true }).count(), 1);
});

test("ignoring a persistent reminder waits for its receipt and confirms removal by GET", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.getByRole("button", { name: "忽略", exact: true }).click(); await settle(p);
  assert.equal(await p.getByText("需要准备资料", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/notifications/reminder%3Aone/state", body: { state: "ignored" } }]);
  await p.evaluate(() => { const s = (window as any).fixture; s.notifications = { state: "empty", reminders: [], notificationInteractions: { "reminder:one": "ignored" } }; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, { notificationId: "reminder:one", state: "ignored", updatedAt: "2026-09-13T00:01:00Z" }); }); await settle(p);
  assert.equal(await p.getByText("需要准备资料", { exact: true }).count(), 0);
  assert.equal(await p.getByText("暂无提醒", { exact: true }).count(), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/notifications").length), 2);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});

for (const [status, receipt] of [
  [500, readReceipt], [200, null], [200, {}],
  [200, { ...readReceipt, notificationId: "reminder:other" }],
  [200, { ...readReceipt, state: "ignored" }],
  [200, { ...readReceipt, updatedAt: "not-a-date" }],
  [200, { notificationId: "reminder:one", state: "read" }],
] as const) test(`unconfirmed read keeps the reminder and never navigates: ${status} ${JSON.stringify(receipt)}`, async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).click(); await settle(p);
  await p.evaluate(({ status, receipt }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), status, receipt); }, { status, receipt }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.getByText("需要准备资料", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByText("已读", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).isEnabled(), true);
});

test("ignore failure does not turn into a local dismissal", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.getByRole("button", { name: "忽略", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 503); }); await settle(p);
  assert.equal(await p.getByText("需要准备资料", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByRole("button", { name: "忽略", exact: true }).isEnabled(), true);
});

test("already-read and legacy targets open without manufacturing a second state write", async t => {
  for (const notifications of [
    { ...persistentNotifications, notificationInteractions: { "reminder:one": "read" } },
    { state: "success", reminders: [persistentReminder] },
  ]) {
    const p = await open(t, { notifications }); await alerts(p);
    await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).click(); await settle(p);
    assert.deepEqual(await writes(p), []);
    assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3Aone"]);
  }
});

test("unsupported reminder targets are visible without being silently marked read", async t => {
  const p = await open(t, { notifications: { ...persistentNotifications, reminders: [{ ...persistentReminder, href: "https://outside.example" }] } }); await alerts(p);
  assert.equal(await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /目标暂不支持在 App 中打开/u);
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByText("已读", { exact: true }).count(), 0);
});

test("refresh immediately revokes an old reminder callback and read failure stays visible", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldOpen = s.presses["打开提醒：需要准备资料"]; s.holdReads = true; s.refresh(); s.oldOpen(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.path === "/api/notifications"), 503); }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "重试读取提醒", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).count(), 0);
  assert.equal(await p.getByText("暂无提醒", { exact: true }).count(), 0);
});

test("late reminder read across an account change cannot navigate or expire the new account", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); });
  await update(p, { actor: "actor:two" });
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.oldWrite, 401); }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("cached reminders cannot authorize persistent writes before a fresh network read", async t => {
  const p = await open(t, { cachedNotifications: persistentNotifications, holdReads: true });
  await p.evaluate(() => { const s = (window as any).fixture; s.requests.forEach((r: any, i: number) => { if (r.path !== "/api/notifications") s.reply(i); }); }); await settle(p);
  await alerts(p);
  assert.equal(await p.getByText("需要准备资料", { exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /正在读取提醒/u);
  assert.deepEqual(await writes(p), []);
});

for (const notifications of [null, {}, { state: "pending", reminders: [], notificationInteractions: {} }, { ...persistentNotifications, notificationInteractions: { "reminder:one": "unknown" } }]) test(`invalid reminder read is an error, not a successful empty result: ${JSON.stringify(notifications)}`, async t => {
  const p = await open(t, { notifications }); await alerts(p);
  assert.equal(await p.getByRole("button", { name: "重试读取提醒", exact: true }).count(), 1);
  assert.equal(await p.getByText("暂无提醒", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

const delivery = { deliveryId: "delivery:one", signalId: "signal:one", signalRevision: "one", phase: "pre_event", channel: "in_app", status: "scheduled", title: "当前提醒", body: "确认提醒内容", target: { kind: "inbox", deliveryId: "delivery:one" }, data: { deliveryId: "delivery:one" }, scheduledFor: "2026-09-13T00:00:00Z", availableAt: "2026-09-13T00:00:00Z", attempt: 0, maxAttempts: 3, createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" };
const signalReceipt = { signal: { signalId: "signal:one", status: "acknowledged", lastObservedAt: "2026-09-13T01:00:00Z" } };

for (const [label, status, feedback] of [["查看建议", "acknowledged", "已记录为查看建议。"], ["稍后", "snoozed", "已稍后提醒。"], ["忽略", "dismissed", "已忽略这条建议。"]] as const) test(`delivery action ${status} is single-flight and requires a matching receipt`, async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  assert.deepEqual(await writes(p), []);
  await p.evaluate(label => { const fn = (window as any).fixture.presses[label]; fn(); fn(); }, label); await settle(p);
  const sent = await writes(p);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "PATCH"); assert.equal(sent[0].path, "/api/agent/signals/signal%3Aone"); assert.equal(sent[0].body.status, status);
  if (status === "snoozed") assert.ok(Math.abs(Date.parse(sent[0].body.snoozedUntil) - Date.now() - 86_400_000) < 60_000);
  else assert.deepEqual(sent[0].body, { status });
  assert.equal(await p.getByText(feedback, { exact: true }).count(), 0);
  await p.evaluate(({ status, until }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "PATCH"), 200,
    { signal: { signalId: "signal:one", status, lastObservedAt: "2026-09-13T01:00:00Z", ...(until ? { snoozedUntil: until } : {}) } }); }, { status, until: sent[0].body.snoozedUntil }); await settle(p);
  assert.equal(await p.getByText(feedback, { exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});

for (const [status, receipt] of [[503, signalReceipt], [200, null], [200, {}],
  [200, { signal: { ...signalReceipt.signal, signalId: "signal:other" } }],
  [200, { signal: { ...signalReceipt.signal, status: "dismissed" } }],
  [200, { signal: { ...signalReceipt.signal, lastObservedAt: "invalid" } }],
  [200, { signal: { signalId: "signal:one", status: "acknowledged" } }],
] as const) test(`delivery rejects an unconfirmed signal receipt: ${status} ${JSON.stringify(receipt)}`, async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  await p.evaluate(({ status, receipt }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "PATCH"), status, receipt); }, { status, receipt }); await settle(p);
  assert.equal(await p.getByText("已记录为查看建议。", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).isEnabled(), true);
});

test("delivery snooze rejects a receipt for a different reminder time", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "稍后", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "PATCH"), 200,
    { signal: { signalId: "signal:one", status: "snoozed", lastObservedAt: "2026-09-13T01:00:00Z", snoozedUntil: "2026-09-20T00:00:00Z" } }); }); await settle(p);
  assert.equal(await p.getByText("已稍后提醒。", { exact: true }).count(), 0); assert.equal(await p.getByRole("alert").count(), 1);
});

for (const invalid of [null, {}, { ...delivery, deliveryId: "delivery:other" }, { ...delivery, target: { kind: "task", deliveryId: "delivery:one" } }, { ...delivery, data: { deliveryId: "delivery:other" } }]) test(`delivery identity must match the requested route before any action: ${JSON.stringify(invalid)}`, async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery: invalid });
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /提醒.*无法/u);
  assert.deepEqual(await writes(p), []);
});

test("delivery refresh revokes old actions immediately and failed reads do not restore them", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAction = s.presses["查看建议"]; s.holdReads = true; s.refresh(); s.oldAction(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  const index = await p.evaluate(() => (window as any).fixture.requests.findLastIndex((r: any) => r.path.includes("/notifications/deliveries/")));
  assert.ok(index >= 4, "refresh must issue another delivery GET");
  await p.evaluate(index => (window as any).fixture.reply(index, 503), index); await settle(p);
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /提醒暂时打不开/u);
});

test("delivery refresh drops the old action receipt instead of reporting stale success", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "PATCH"); s.refresh(); }); await settle(p);
  await p.evaluate(receipt => { const s = (window as any).fixture; s.reply(s.oldWrite, 200, receipt); }, signalReceipt); await settle(p);
  assert.equal(await p.getByText("已记录为查看建议。", { exact: true }).count(), 0);
});

test("delivery HTTP failure cannot grant actions even with an otherwise valid success body", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery, holdReads: true });
  await p.evaluate(delivery => { const s = (window as any).fixture; s.requests.forEach((r: any, i: number) => s.reply(i, r.path.includes("/notifications/deliveries/") ? 503 : 200, r.path.includes("/notifications/deliveries/") ? delivery : undefined)); }, delivery); await settle(p);
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).count(), 0);
  assert.match(await p.locator("body").innerText(), /提醒暂时打不开/u);
});

test("delivery refresh cancels an in-flight action before its late 401 can expire the current account", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "PATCH"); s.refresh(); }); await settle(p);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.oldWrite, 401); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("delivery clears an earlier success before reporting the next failed action", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  await p.evaluate(receipt => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "PATCH"), 200, receipt); }, signalReceipt); await settle(p);
  await p.getByRole("button", { name: "忽略", exact: true }).click(); await settle(p);
  assert.equal(await p.getByText("已记录为查看建议。", { exact: true }).count(), 0);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "PATCH"), 503); }); await settle(p);
  assert.equal(await p.getByRole("alert").count(), 1);
  assert.equal(await p.getByText("已忽略这条建议。", { exact: true }).count(), 0);
});
