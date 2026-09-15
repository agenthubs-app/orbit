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
const listeners = new Set(); const nativeListeners = new Set(); let revision = 0, uuid = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const effects = { calendarEntryCreated: false, externalMessageSent: false, networkRequestMade: false, notificationDelivered: false, savedRecordCreated: false };
const state = window.fixture = {
  actor: "actor:one", cookieHeader: "", ready: true, signedIn: true, baseReady: true, baseUrl: "https://orbit.example", mounted: true,
  detail: false, detailUnread: 0, conversationId: "thread:one", seed: {}, requests: [], replies: [], presses: {}, navigation: [], expiries: 0, holdReads: false, notifications: undefined, focused: true, appState: "active",
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  emit(appState) { state.appState = appState; nativeListeners.forEach(fn => fn(appState)); },
  conversation(unreadCount = 2, body = "已有消息") { const remote = "remote:" + state.actor; return { conversationId: state.conversationId, contactId: "contact:one", participantAccountIds: [state.actor, remote], participantDisplayNames: { [state.actor]: "当前用户", [remote]: state.actor }, qualificationVersion: "qualification:one", status: "active", createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:01:00Z", unreadCount, messages: [
    { messageId: "message:one", conversationId: state.conversationId, senderAccountId: remote, senderDisplayName: state.actor, body, sentAt: "2026-09-13T00:00:00Z", deliveryState: "delivered" },
    ...(unreadCount > 1 ? [{ messageId: "message:two", conversationId: state.conversationId, senderAccountId: remote, senderDisplayName: state.actor, body: "已有消息", sentAt: "2026-09-13T00:01:00Z", deliveryState: "delivered" }] : [])
  ] }; },
  thread(body = "已有消息") { return state.conversation(state.detailUnread, body); },
  data(path) {
    if (path.endsWith("/read")) return { conversationId: state.conversationId, lastReadMessageId: state.detailUnread > 1 ? "message:two" : "message:one", readAt: "2026-09-15T00:02:00Z" };
    if (path.includes("/notifications/deliveries/") && state.delivery !== undefined) return state.delivery;
    if (path.includes("/notifications/deliveries/")) return { deliveryId: state.seed.deliveryId, signalId: "signal:one", signalRevision: "one", phase: "pre_event", channel: "in_app", status: "scheduled", title: "当前提醒", body: "确认提醒内容", target: { kind: "inbox", deliveryId: state.seed.deliveryId }, data: { deliveryId: state.seed.deliveryId }, scheduledFor: "2026-09-13T00:00:00Z", availableAt: "2026-09-13T00:00:00Z", attempt: 0, maxAttempts: 3, createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" };
    if (path === "/api/notifications") return state.notifications !== undefined ? state.notifications : { state: "success", reminders: [{ reminderId: "reminder:one", title: "需要准备资料", organization: "Example", priority: "normal", dueAt: "2026-09-13T00:00:00Z" }] };
    if (path.includes("relationship-signals")) return state.signals || { signals: [] };
    if (path === "/api/chat/privacy") return { conversationId: state.conversationId, participantName: state.actor, organization: "Example", analysisOptIn: { enabled: state.allowPrivateAnalysis ?? true, status: state.allowPrivateAnalysis === false ? "opted_out" : "opted_in" }, analysisDeletion: { status: "available" }, sensitiveShareConfirmation: { confirmationRequired: true, status: "required" }, privateNotes: [], provenance: { sourceLabel: "对话记录" }, state: "success" };
    if (path === "/api/relationship-communication/conversations") return { conversations: [state.conversation()], refreshedAt: "2026-09-15T00:00:00Z" };
    if (path.includes("/api/relationship-communication/conversations/")) return state.thread(state.serverDraftReply || "已有消息");
    return { inbox: { conversations: [state.conversation()] }, selectedThread: state.detail ? state.thread() : null, currentUser: { displayName: "当前用户" }, draftReply: { body: state.serverDraftReply || "" }, sideEffects: effects };
  },
  preview() { const r = state.requests.findLast(r => r.method === "POST"); return { inboxItem: { conversationId: "draft:one", contactId: "contact:one", participantName: r.body.participantName, organization: r.body.organization, subject: r.body.subject, preview: r.body.body, unreadCount: 0, lastCorrespondenceAt: "2026-09-15T00:00:00Z", nextActionLabel: "", sourceContextLabels: [] }, thread: { conversationId: "draft:one", subject: r.body.subject, summary: "", sourceContextLabels: [], messages: [{ messageId: "draft-message:one", senderRole: "orbit_user", senderName: "当前用户", body: r.body.body, occurredAt: "2026-09-15T00:00:00Z" }] }, sideEffects: effects }; },
  reply(index, status = 200, data) { state.replies[index]?.(new Response(JSON.stringify(status >= 400 && data === undefined ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE", message: "测试服务暂不可用" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }), { status, headers: { "content-type": "application/json" } })); }
};
onSessionExpired(() => state.expiries++);
window.fetch = (input, init) => { const url = new URL(String(input)); const index = state.requests.length; state.requests.push({ method: init.method, path: url.pathname, search: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal }); const reply = new Promise(resolve => state.replies[index] = resolve); if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index)); return reply; };
export const useFixture = () => { observe(); return state; };
export const useIsFocused = () => { observe(); return state.focused; };
export const AppState = { get currentState() { return state.appState; }, addEventListener(_event, fn) { nativeListeners.add(fn); return { remove() { nativeListeners.delete(fn); } }; } };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.actor || null, actorId: state.actor || null, user: state.actor ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { observe(); return state.detail ? { id: state.conversationId } : state.seed; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => state.detail ? "/inbox/" + encodeURIComponent(state.conversationId) : "/inbox";
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const randomUUID = () => "test-inbox-scope-" + (++uuid);
export const readSnapshot = async (_baseUrl, _actorId, path) => { const cached = path === "/api/notifications" ? state.cachedNotifications : state.cachedInbox; return cached ? { result: { success: true, status: 200, data: cached, meta: { featureMode: null, privacy: null, runtimeBoundary: null } }, syncedAt: "2026-09-12T00:00:00Z" } : null; };
export const writeSnapshot = async () => {};
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Inbox from "./app/(app)/inbox"; import Thread from "./app/inbox/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? s.detail ? <Thread /> : <Inbox /> : null; } createRoot(document.getElementById("root")).render(window.initialFixture?.strict ? <React.StrictMode><App /></React.StrictMode> : <App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "inbox-lifecycle-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "inbox-lifecycle" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "inbox-lifecycle" }));
      plugin.onLoad({ filter: /.*/, namespace: "inbox-lifecycle" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, RefreshControl as RealRefreshControl } from "react-native-web"; export * from "react-native-web";
export { AppState } from "fixture";
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
  if (patch.clock) await p.clock.install();
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

test("moving to another thread clears the previous local reply after an opaque IORBIT handoff", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("旧会话回复");
  await p.getByRole("button", { name: "润色草稿", exact: true }).click(); await settle(p);
  const navigation = await p.evaluate(() => (window as any).fixture.navigation);
  assert.equal(navigation[0].pathname, "/ai/[id]"); assert.match(navigation[0].params.prefillIntent, /^ai-prefill-/);
  assert.doesNotMatch(JSON.stringify(navigation[0]), /旧会话回复|contact:one/);
  assert.deepEqual(await writes(p), []);
  await update(p, { conversationId: "thread:two" });
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "");
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("missing thread identity shows an error without reading a generic inbox", async t => {
  const p = await open(t, { detail: true, conversationId: "" });
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
  assert.match(await p.locator("body").innerText(), /缺少对话 ID/u);
});

test("opening an unread real thread persists the delivered tail before clearing unread state", async t => {
  const p = await open(t, { detail: true, detailUnread: 1 });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path.endsWith("/read")));
  const write = await p.evaluate(() => { const s = (window as any).fixture; const index = s.requests.findLastIndex((request: any) => request.path.endsWith("/read")); return { index, request: s.requests[index] }; });
  assert.equal(write.request.path, "/api/relationship-communication/conversations/thread%3Aone/read");
  assert.deepEqual(write.request.body, { lastReadMessageId: "message:one" });
  await p.evaluate(index => { const s = (window as any).fixture; s.detailUnread = 0; s.reply(index, 200, { conversationId: s.conversationId, lastReadMessageId: "message:one", readAt: "2026-09-15T00:02:00Z" }); }, write.index);
  await settle(p);
  assert.equal((await writes(p)).filter((request: any) => request.path.endsWith("/read")).length, 1);
  assert.doesNotMatch(await p.locator("body").innerText(), /已读状态未能确认/u);
});

test("a mismatched read receipt keeps unread state visible and retries after a fresh detail read", async t => {
  const p = await open(t, { detail: true, detailUnread: 1 });
  await p.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path.endsWith("/read")));
  await p.evaluate(() => { const s = (window as any).fixture; const index = s.requests.findLastIndex((request: any) => request.path.endsWith("/read")); s.reply(index, 200, { conversationId: "thread:other", lastReadMessageId: "message:one", readAt: "2026-09-15T00:02:00Z" }); });
  await p.getByText("已读状态未能确认，消息仍保留为未读。稍后会重试。", { exact: true }).waitFor();
  assert.match(await p.locator("body").innerText(), /已有消息/u);
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  await p.waitForFunction(() => (window as any).fixture.requests.filter((request: any) => request.path.endsWith("/read")).length === 2);
  await p.evaluate(() => { const s = (window as any).fixture; const index = s.requests.findLastIndex((request: any) => request.path.endsWith("/read")); s.detailUnread = 0; s.reply(index, 200, { conversationId: s.conversationId, lastReadMessageId: "message:one", readAt: "2026-09-15T00:03:00Z" }); });
  await settle(p);
  assert.doesNotMatch(await p.locator("body").innerText(), /已读状态未能确认/u);
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

// Foreground regression: removing the screen's native revocation or reusing a
// previous read lifetime would allow old content/actions or discard local input.
test("inbox polls real conversations within fifteen seconds without replacing an unsent draft", async t => {
  const p = await open(t, { clock: true });
  await p.getByRole("button", { name: "写消息", exact: true }).click();
  await p.getByRole("textbox", { name: "正文", exact: true }).fill("十五秒内不能丢的草稿");
  await p.evaluate(() => { (window as any).fixture.holdReads = true; });
  await p.clock.fastForward(15_001); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/relationship-communication/conversations").length), 2);
  assert.equal(await p.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "十五秒内不能丢的草稿");
  await p.evaluate(() => { const s = (window as any).fixture; const index = s.requests.findLastIndex((request: any) => request.path === "/api/relationship-communication/conversations"); s.reply(index); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "十五秒内不能丢的草稿");
});

for (const detail of [false, true]) {
  test(`inbox foreground permits the committed ${detail ? "thread" : "list"} read after Strict Mode effect replay`, async t => {
    const p = await open(t, { detail, strict: true });
    assert.match(await p.locator("body").innerText(), /已有消息/u);
    assert.deepEqual(await writes(p), []);
  });

  for (const patch of [{ focused: false }, { appState: "background" }, { appState: "inactive" }]) test(`inbox foreground waits while ${detail ? "thread" : "list"} is inactive ${JSON.stringify(patch)}`, async t => {
    const p = await open(t, { detail, ...patch });
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 0);
    assert.doesNotMatch(await p.locator("body").innerText(), /已有消息|actor:one/u);
  });

  test(`inbox foreground revokes pending ${detail ? "thread" : "list"} GET synchronously and ignores its 401`, async t => {
    const p = await open(t, { detail, holdReads: true });
    const revoked = await p.evaluate(() => { const s = (window as any).fixture; s.emit("inactive"); const allAborted = s.requests.every((r: any) => r.signal?.aborted); s.requests.forEach((_r: any, i: number) => s.reply(i, 401)); return allAborted; });
    assert.equal(revoked, true);
    await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
    assert.deepEqual(await writes(p), []);
  });

  test(`inbox foreground rereads ${detail ? "thread" : "list"} after background without restoring unconfirmed content`, async t => {
    const p = await open(t, { detail });
    assert.match(await p.locator("body").innerText(), /已有消息/u);
    await p.evaluate(() => { const s = (window as any).fixture; s.holdReads = true; s.emit("background"); }); await settle(p);
    assert.doesNotMatch(await p.locator("body").innerText(), /已有消息|actor:one/u);
    await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
    const count = detail ? 1 : 3;
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), count * 2);
    assert.doesNotMatch(await p.locator("body").innerText(), /已有消息|actor:one/u);
    await p.evaluate(count => { const s = (window as any).fixture; for (let i = count; i < s.requests.length; i++) s.reply(i); }, count); await settle(p);
    assert.match(await p.locator("body").innerText(), /已有消息/u);
    assert.deepEqual(await writes(p), []);
  });

  test(`inbox foreground catches batched inactive-active once for ${detail ? "thread" : "list"}`, async t => {
    const p = await open(t, { detail });
    await p.evaluate(() => { const s = (window as any).fixture; s.emit("inactive"); s.emit("active"); }); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), detail ? 2 : 6);
    await p.evaluate(() => { const s = (window as any).fixture; s.emit("active"); s.emit("active"); }); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), detail ? 2 : 6);
  });

  test(`inbox foreground rereads ${detail ? "thread" : "list"} on focus restoration and does not read while blurred`, async t => {
    const p = await open(t, { detail });
    await update(p, { focused: false });
    assert.doesNotMatch(await p.locator("body").innerText(), /已有消息/u);
    await p.evaluate(() => { const s = (window as any).fixture; s.emit("background"); s.emit("active"); s.refresh(); }); await settle(p);
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), detail ? 1 : 3);
    await update(p, { focused: true });
    assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), detail ? 2 : 6);
    assert.match(await p.locator("body").innerText(), /已有消息/u);
  });
}

test("inbox foreground never authorizes a cached conversation while the network is unconfirmed", async t => {
  const p = await open(t, { detail: true, holdReads: true, cachedInbox: { inbox: { conversations: [{ conversationId: "thread:one", participantName: "缓存联系人", subject: "缓存主题" }] }, selectedThread: { conversationId: "thread:one", subject: "缓存主题", messages: [] }, draftReply: { body: "缓存回复" } } });
  assert.doesNotMatch(await p.locator("body").innerText(), /缓存联系人|缓存主题|缓存回复/u);
  assert.equal(await p.getByRole("button", { name: "润色草稿", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("inbox foreground preserves an unsent composer and never replays an interrupted preview", async t => {
  const p = await open(t); await preview(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); s.oldReceipt = s.preview(); s.oldAction = s.presses["正在准备"]; s.emit("background"); }); await settle(p);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "不能进入另一个账号的正文");
  assert.equal(await p.getByRole("textbox", { name: "主题", exact: true }).inputValue(), "需要保留的主题");
  assert.equal(await p.getByRole("button", { name: "预览草稿", exact: true }).isEnabled(), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAction(); s.reply(s.oldWrite, 200, s.oldReceipt); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.getByRole("heading", { name: "草稿预览", exact: true }).count(), 0);
  assert.equal(await p.getByRole("textbox", { name: "正文", exact: true }).inputValue(), "不能进入另一个账号的正文");
  await p.getByRole("button", { name: "预览草稿", exact: true }).click(); await settle(p);
  assert.equal((await writes(p)).length, 2);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 200, s.preview()); }); await settle(p);
  assert.equal(await p.getByRole("heading", { name: "草稿预览", exact: true }).count(), 1);
});

test("inbox foreground preserves reply input and does not replay an IORBIT handoff", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("离开前未发送的回复");
  await p.getByRole("button", { name: "润色草稿", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldAction = s.presses["润色草稿"]; s.emit("inactive"); }); await settle(p);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "离开前未发送的回复");
  assert.equal(await p.getByRole("button", { name: "润色草稿", exact: true }).isEnabled(), true);
  await p.evaluate(() => (window as any).fixture.oldAction()); await settle(p);
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.navigation.length), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "离开前未发送的回复");
});

test("inbox foreground rejects old conversation callbacks even after the next read succeeds", async t => {
  const p = await open(t);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldOpen = Object.entries(s.presses).find(([name]) => name.startsWith("actor:one，"))?.[1]; s.emit("background"); s.oldOpen(); }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  await p.evaluate(() => (window as any).fixture.oldOpen()); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});

test("inbox foreground cancels a reminder read action and requires current state after resume", async t => {
  const p = await open(t, { notifications: persistentNotifications }); await alerts(p);
  await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); s.holdReads = true; s.emit("background"); }); await settle(p);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.emit("active"); s.reply(s.oldWrite, 200, { notificationId: "reminder:one", state: "read", updatedAt: "2026-09-13T00:01:00Z" }); }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.doesNotMatch(await p.locator("body").innerText(), /需要准备资料/u);
  await p.evaluate(() => { const s = (window as any).fixture; s.requests.forEach((r: any, i: number) => { if (i > s.oldWrite && r.method === "GET") s.reply(i); }); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "搜索姓名、主题或内容", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "打开提醒：需要准备资料", exact: true }).isEnabled(), true);
});

test("inbox foreground invalidates a delivery action before a late 401 and rereads its detail", async t => {
  const p = await open(t, { seed: { deliveryId: "delivery:one" }, delivery });
  await p.getByRole("button", { name: "查看建议", exact: true }).click(); await settle(p);
  const revoked = await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "PATCH"); s.emit("background"); const aborted = s.requests[s.oldWrite].signal.aborted; s.reply(s.oldWrite, 401); return aborted; });
  assert.equal(revoked, true); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.doesNotMatch(await p.locator("body").innerText(), /确认提醒内容/u);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path.includes("/notifications/deliveries/")).length), 2);
  assert.equal(await p.getByRole("button", { name: "查看建议", exact: true }).isEnabled(), true);
  assert.equal((await writes(p)).length, 1);
});

test("inbox foreground read failure keeps the reply draft recoverable without showing old messages", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("读取失败也要保留的回复");
  await p.evaluate(() => { const s = (window as any).fixture; s.holdReads = true; s.emit("background"); }); await settle(p);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.length - 1, 403); }); await settle(p);
  assert.doesNotMatch(await p.locator("body").innerText(), /已有消息/u);
  assert.match(await p.locator("body").innerText(), /暂不可用/u);
  assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const s = (window as any).fixture; s.holdReads = false; s.refresh(); }); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "读取失败也要保留的回复");
  assert.match(await p.locator("body").innerText(), /已有消息/u);
});

test("inbox foreground preserves a dirty reply when remote message content changes", async t => {
  const p = await open(t, { detail: true, serverDraftReply: "原来的服务端草稿" });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("本机还没提交的回复");
  await p.evaluate(() => { const s = (window as any).fixture; s.emit("background"); s.serverDraftReply = "另一端更新了草稿"; }); await settle(p);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "本机还没提交的回复");
  assert.deepEqual(await writes(p), []);
});

test("real message refresh never invents a server-side reply draft", async t => {
  const p = await open(t, { detail: true, serverDraftReply: "原来的服务端草稿" });
  await p.evaluate(() => { const s = (window as any).fixture; s.emit("background"); s.serverDraftReply = "另一端更新了草稿"; }); await settle(p);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "");
  assert.match(await p.locator("body").innerText(), /另一端更新了草稿/u);
  assert.deepEqual(await writes(p), []);
});

test("inbox foreground refreshes disclosed privacy controls and rejects its interrupted toggle", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("保留我的回复");
  await p.getByRole("button", { name: "隐私设置", exact: true }).click(); await settle(p);
  await p.getByRole("button", { name: "停止分析", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); s.oldPrivacy = s.data("/api/chat/privacy"); s.emit("background"); s.allowPrivateAnalysis = false; }); await settle(p);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/chat/privacy").length), 2);
  assert.equal(await p.getByRole("button", { name: "允许分析", exact: true }).isEnabled(), true);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.oldWrite, 200, s.oldPrivacy); }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "允许分析", exact: true }).isEnabled(), true);
  assert.equal(await p.getByRole("button", { name: "停止分析", exact: true }).count(), 0);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "保留我的回复");
  assert.equal((await writes(p)).length, 1);
});

test("inbox foreground revokes a relationship signal confirmation and rereads the current list", async t => {
  const signal = { id: "signal:mail", displayName: "待核对联系人", organization: "Example", role: "负责人", sourceKind: "email", signalKind: "introduction", relationshipContext: "需要核对交流背景", suggestedNextAction: "确认来源", occurredAt: "2026-09-13T00:00:00Z", confirmation: { state: "pending" }, permission: { state: "granted" }, confidence: "high", evidence: [{ excerpt: "已有交流记录" }] };
  const p = await open(t, { signals: { signals: [signal] } }); await alerts(p);
  await p.getByRole("button", { name: "确认线索", exact: true }).click(); await settle(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrite = s.requests.findLastIndex((r: any) => r.method === "POST"); s.oldAction = s.presses["确认线索"]; s.emit("background"); }); await settle(p);
  assert.equal(await p.evaluate(() => { const s = (window as any).fixture; return s.requests[s.oldWrite].signal.aborted; }), true);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("button", { name: "确认线索", exact: true }).isEnabled(), true);
  await p.evaluate(signal => { const s = (window as any).fixture; s.oldAction(); s.reply(s.oldWrite, 200, { confirmedSignal: signal, confirmedAt: "2026-09-13T00:00:00Z", externalActionExecuted: false, relationshipWriteExecuted: false }); }, signal); await settle(p);
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.getByText("线索已确认", { exact: true }).count(), 0);
});

test("inbox foreground clears the hidden draft when identity changes in the background", async t => {
  const p = await open(t, { detail: true });
  await p.getByRole("textbox", { name: "回复正文", exact: true }).fill("原账号的回复");
  await p.evaluate(() => (window as any).fixture.emit("background")); await settle(p);
  await update(p, { actor: "actor:two" });
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 1);
  await p.evaluate(() => (window as any).fixture.emit("active")); await settle(p);
  assert.equal(await p.getByRole("textbox", { name: "回复正文", exact: true }).inputValue(), "");
  assert.match(await p.locator("body").innerText(), /actor:two/u);
  assert.doesNotMatch(await p.locator("body").innerText(), /actor:one/u);
});
