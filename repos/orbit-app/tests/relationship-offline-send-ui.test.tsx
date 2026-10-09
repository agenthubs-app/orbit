import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0135 (message plan M4): the NATIVE inbox conversation, the inbox list
// and the chat detail with the device queue of messages written offline.
// react-native resolves to react-native-web with Platform.OS = "ios" (offline
// sending is native only); useSyncedCollection is the replaced mirror boundary
// and its session is the queue. Offline, 「发送消息」 queues the message (no
// request), it is shown last with 「待发送」, a refused one says 「未发送 · 重试 ·
// 复制 · 放弃」, and a queued message whose conversation left the device is listed
// once at the top of the inbox as 「N 条消息未能发送」.
const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native-web";
const ACTOR = "account:me";
const NativeDate = Date;
window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-09-28T09:00:00Z"])); } static now() { return NativeDate.parse("2026-09-28T09:00:00Z"); } };
const B = "account:wang", C = "account:li";
const cid = (other) => "relationship-conversation:" + other.slice(8);
const at = (seq) => "2026-09-28T07:" + String(seq).padStart(2, "0") + ":00.000Z";
const body = (other, seq) => (other === B ? "王小明的第 " : "李雷的第 ") + seq + " 条";
const conversation = (other, name, last, unread, from) => ({ id: cid(other), payload: {
  conversationId: cid(other), contactId: "contact:" + other.slice(8), participantAccountIds: [ACTOR, other], participantDisplayNames: { [ACTOR]: "我自己", [other]: name },
  qualificationVersion: "qv_1", status: "active", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: at(last), unreadCount: unread, readSeq: last - unread, lastMessageSeq: last,
  lastMessage: { messageId: "m:" + other + ":" + last, senderAccountId: from, sentAt: at(last), bodyPreview: body(other, last) } } });
const message = (other, name, seq) => ({ id: cid(other) + "/" + seq, payload: { conversationId: cid(other), seq, messageId: "m:" + other + ":" + seq,
  senderAccountId: seq % 3 === 0 ? ACTOR : other, senderDisplayName: seq % 3 === 0 ? "我自己" : name, body: body(other, seq), sentAt: at(seq) } });
const conversations = () => [conversation(B, "王小明", 40, 2, B), conversation(C, "李雷", 41, 1, C)];
const messages = () => [...Array.from({ length: 40 }, (_, i) => message(B, "王小明", i + 1)), message(C, "李雷", 41)];
export const state = window.fixture = { requests: [], navigation: [], syncs: {}, status: "fresh", ...window.initialFixture };
const records = (kind) => kind === "relationship_conversation" ? conversations() : kind === "relationship_message" ? messages() : [];
const refreshers = {};
const refresherFor = (kind) => refreshers[kind] ??= async () => { state.syncs[kind] = (state.syncs[kind] ?? 0) + 1; return null; };
const row = (r) => ({ actorId: ACTOR, workspaceId: "workspace:one", domainId: "relationship-messages", kind: "relationship_message", operation: "send", patch: { body: r.body },
  baseRevision: null, dependsOn: null, retryCount: 0, nextRetryAt: null, lastErrorCode: null, attemptCount: 0, firstAttemptAt: null, serverSnapshot: null,
  mutationId: r.requestId, id: r.conversationId, state: r.state ?? "queued", createdAt: r.createdAt ?? "2026-09-28T08:50:00.000Z",
  requestJson: JSON.stringify({ body: r.body, qualificationVersion: "qv_1", requestId: r.requestId, retireDraftThrough: r.retireDraftThrough ?? null }) });
state.outbox = (state.outbox ?? []).map(row);
state.enqueued = []; state.retried = []; state.discarded = [];
const session = { isCurrent: () => true,
  readOutboxOverlay: async (kind) => ({ serverRecords: [], queuedMutations: kind === "relationship_message" ? state.outbox : [] }),
  enqueueOfflineMessageMutation: async (mutation) => { state.enqueued.push(mutation); state.outbox = [...state.outbox, { ...mutation, actorId: ACTOR, workspaceId: "workspace:one", dependsOn: null, state: "queued", attemptCount: 0, firstAttemptAt: null, serverSnapshot: null }]; },
  retryOfflineMessage: async (id) => { state.retried.push(id); },
  discardOfflineMessages: async (ids) => { state.discarded.push(...ids); state.outbox = state.outbox.filter((item) => !ids.includes(item.mutationId)); return ids.length; },
};
const currentSession = () => session;
const snapshots = {};
// Sprint 0131: a conversation page is read by row id from the device (the relationship_message rows of this fixture).
const rowSession = { isCurrent: () => true, readRecordsById: async (kind, ids) => records(kind).filter((row) => ids.includes(row.id)), readPageCopy: async () => null, savePageCopy: async () => {} };
export const useSyncCoordinatorSession = () => rowSession;
export const useSyncedCollection = ({ kind }) => {
  // Stable per kind while nothing changes, like the real hook's snapshot.
  const key = kind + ":" + state.status;
  return snapshots[key] ??= { status: state.status, error: state.status === "stale" ? "Network request failed" : null,
    lastSyncedAt: "2026-09-28T08:40:00.000Z", workspaceId: "workspace:one", records: records(kind), refresh: refresherFor(kind), invalidate: async () => null, currentSession };
};
window.fetch = async (input, init) => {
  const u = new URL(String(input)); const method = (init && init.method) || "GET";
  state.requests.push(method + " " + u.pathname + u.search);
  if (state.status === "stale") throw new TypeError("Network request failed");
  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  if (method === "GET" && u.pathname.endsWith("/draft")) return ok({ conversationId: decodeURIComponent(u.pathname.split("/")[4]), body: "联网时存的草稿", updatedAt: "2026-09-28T08:55:00.000Z" });
  if (method === "POST" && u.pathname.endsWith("/read")) { const sent = JSON.parse(init.body); return ok({ conversationId: decodeURIComponent(u.pathname.split("/")[4]), lastReadMessageId: sent.lastReadMessageId, readAt: "2026-09-28T09:00:00.000Z" }); }
  if (u.pathname === "/api/inbox/summary") return ok({ actorId: ACTOR, messagesUnread: 3, notificationsUnread: 0, notificationMode: "typed", notificationRead: "ready", asOf: "2026-09-28T09:00:00Z" });
  return new Response(JSON.stringify({ success: false, error: { code: "UNAVAILABLE", message: "暂时不可用" } }), { status: 503, headers: { "content-type": "application/json" } });
};
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, cookieHeader: "", accountId: ACTOR, actorId: ACTOR, user: { id: ACTOR, name: "我自己", email: "me@example.test" }, notificationSessionRevision: 0 });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const useIsFocused = () => true;
export const useGlobalSearchParams = () => ({});
export const useLocalSearchParams = () => state.params ?? {};
export const usePathname = () => "/";
export const useRouter = () => ({ canGoBack: () => false, back() {}, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); } });
export const Redirect = () => null;
export const Stack = () => null;
let uuid = 0;
export const randomUUID = () => "00000000-0000-4000-8000-00000000000" + (++uuid);
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { RelationshipInboxScreen, RelationshipInboxThreadScreen } from "./src/screens/inbox/RelationshipInboxScreen";
        import { RelationshipChatScreen } from "./src/screens/chat/RelationshipChatScreen";
        import { RelationshipChatDetailScreen } from "./src/screens/chat/RelationshipChatDetailScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "thread" ? <RelationshipInboxThreadScreen /> : which === "chat" ? <RelationshipChatScreen /> : which === "chat-detail" ? <RelationshipChatDetailScreen /> : <RelationshipInboxScreen />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><div style={{ height: 844, display: "flex", flexDirection: "column" }}>{screen}</div></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".ttf": "dataurl" },
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "relationship-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, (args) => args.importer.endsWith("native-shim.js") ? { path: require.resolve("react-native-web") } : { path: "native-shim.js", namespace: "native-shim" });
        plugin.onLoad({ filter: /.*/, namespace: "native-shim" }, () => ({ contents: 'export * from "react-native"; import { Platform as WebPlatform } from "react-native"; export const Platform = { ...WebPlatform, OS: "ios", select: (options) => options.ios ?? options.native ?? options.default };', loader: "js", resolveDir: process.cwd() }));
        plugin.onResolve({ filter: /^react-native-svg($|\/)|^expo-camera$|^expo-image-picker$|^expo-clipboard$|^expo-haptics$/ }, () => ({ path: "icons", namespace: "relationship-icons" }));
        plugin.onLoad({ filter: /.*/, namespace: "relationship-icons" }, () => ({ contents: "const Stub=()=>null; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub, Polyline=Stub, ClipPath=Stub, Mask=Stub; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false}); export const setStringAsync=async()=>true; export const impactAsync=async()=>{}; export const ImpactFeedbackStyle={};", loader: "js" }));
        plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons)$|^react-native-safe-area-context($|\/)|\/(useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "relationship" }));
        plugin.onLoad({ filter: /.*/, namespace: "relationship" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  page.setDefaultTimeout(4000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], "no page errors"); });
  await page.goto(url);
  return page;
}
const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);
const fixtureValue = (page: Page, key: string) => page.evaluate((name) => (window as any).fixture[name], key);
const messageReads = (list: string[]) => list.filter((request) => /conversation-summaries|unread-summary|\/messages/.test(request) && request.startsWith("GET"));
const B_ID = "relationship-conversation:wang";

const posts = (list: string[]) => list.filter((request) => request.startsWith("POST") && request.endsWith("/messages"));

test("conversation offline: 发送消息 queues the message without a request; it is shown last with 待发送 and the banner says it sends when online", async (t) => {
  const page = await open(t, { screen: "thread", status: "stale", params: { id: B_ID } });
  await page.getByText("无法连接 · 显示截至 9月28日 16:40；消息会在联网后发送").or(page.getByText(/^无法连接 · 显示截至 .+；消息会在联网后发送$/)).first().waitFor();
  await page.getByText("王小明的第 40 条", { exact: true }).waitFor();
  await page.getByLabel("回复正文").fill("断网时写的第一条");
  const send = page.getByRole("button", { name: "发送消息", exact: true });
  assert.notEqual(await send.getAttribute("aria-disabled"), "true", "sending is available offline");
  await send.click();
  await page.getByText("断网时写的第一条", { exact: true }).waitFor();
  await page.getByText("待发送", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("回复正文").inputValue(), "", "the composer is cleared once the message is queued");
  const enqueued = await fixtureValue(page, "enqueued") as Array<{ id: string; mutationId: string; requestJson: string }>;
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0]!.id, B_ID);
  assert.deepEqual(JSON.parse(enqueued[0]!.requestJson), { body: "断网时写的第一条", qualificationVersion: "qv_1", requestId: enqueued[0]!.mutationId, retireDraftThrough: null }, "offline the composer knew no server draft");
  // The queued message is after the newest server message.
  const order = await page.getByText(/^(王小明的第 40 条|断网时写的第一条)$/).allTextContents();
  assert.deepEqual(order, ["王小明的第 40 条", "断网时写的第一条"]);
  assert.deepEqual(posts(await requests(page)), [], "nothing is sent offline");
  assert.equal(await page.getByRole("button", { name: "保存草稿 · 需要联网" }).getAttribute("aria-disabled"), "true", "drafts still need the network");
  await page.getByText("标为已读 · 需要联网").waitFor();
});

test("conversation online behind a queued message: the reply queues too (order kept) and carries the server time of the draft it knew", async (t) => {
  const page = await open(t, { screen: "thread", params: { id: B_ID }, outbox: [{ requestId: "queued-1", conversationId: B_ID, body: "还在队列里的" }] });
  await page.getByText("还在队列里的", { exact: true }).waitFor();
  await page.getByLabel("回复正文").waitFor();
  await page.waitForFunction(() => (document.querySelector('[aria-label="回复正文"]') as HTMLTextAreaElement | null)?.value === "联网时存的草稿");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.enqueued.length === 1);
  const enqueued = await fixtureValue(page, "enqueued") as Array<{ requestJson: string }>;
  assert.equal(JSON.parse(enqueued[0]!.requestJson).retireDraftThrough, "2026-09-28T08:55:00.000Z", "only the draft known when the message was written may be retired");
  assert.deepEqual(posts(await requests(page)), [], "not sent ahead of the queued message");
});

test("a refused message says 未发送 · 重试 · 复制 · 放弃; retry and discard act on that one row", async (t) => {
  const page = await open(t, { screen: "thread", status: "stale", params: { id: B_ID }, outbox: [{ requestId: "failed-1", conversationId: B_ID, body: "被拒绝的一条", state: "conflict" }] });
  await page.getByText("被拒绝的一条", { exact: true }).waitFor();
  await page.getByText("未发送", { exact: true }).waitFor();
  assert.equal(await page.getByText("待发送", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "复制", exact: true }).waitFor();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.retried.length === 1);
  assert.deepEqual(await fixtureValue(page, "retried"), ["failed-1"]);
  await page.getByRole("button", { name: "放弃", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.discarded.length === 1);
  await page.getByText("被拒绝的一条", { exact: true }).waitFor({ state: "detached" });
});

test("inbox: a queued message whose conversation left the device is one top line 1 条消息未能发送 with copy and discard; another queued message overlays its conversation", async (t) => {
  const page = await open(t, { outbox: [
    { requestId: "ended-1", conversationId: "relationship-conversation:gone", body: "对方撤销前没发出去的" },
    { requestId: "queued-b", conversationId: B_ID, body: "给王小明的待发送", createdAt: "2026-09-28T08:59:00.000Z" },
  ] });
  await page.getByText("1 条消息未能发送：这段关系已结束", { exact: true }).waitFor();
  await page.getByRole("button", { name: "复制内容" }).waitFor();
  assert.equal(await page.getByText("对方撤销前没发出去的").count(), 0, "the text is not shown in the list, only kept on this phone");
  await page.getByText(/给王小明的待发送/).first().waitFor();
  const names = await page.getByText(/^(李雷|王小明)$/).allTextContents();
  assert.deepEqual(names, ["王小明", "李雷"], "the conversation with the newest queued message moves up");
  await page.getByRole("tab", { name: /^消息 3/ }).waitFor();
  await page.getByRole("button", { name: "放弃" }).click();
  await page.waitForFunction(() => (window as any).fixture.discarded.length === 1);
  assert.deepEqual(await fixtureValue(page, "discarded"), ["ended-1"]);
  await page.getByText("1 条消息未能发送：这段关系已结束").waitFor({ state: "detached" });
});

test("chat detail offline: sending queues the message and shows it last with 待发送", async (t) => {
  const page = await open(t, { screen: "chat-detail", status: "stale", params: { id: B_ID } });
  await page.getByText("王小明的第 40 条").first().waitFor();
  await page.getByPlaceholder("写给已验证联系人").fill("详情页断网发送");
  const send = page.getByRole("button", { name: "发送消息", exact: true });
  await send.click();
  await page.getByText("待发送", { exact: true }).waitFor();
  await page.getByText("详情页断网发送", { exact: true }).waitFor();
  const enqueued = await fixtureValue(page, "enqueued") as Array<{ requestJson: string }>;
  assert.equal(JSON.parse(enqueued[0]!.requestJson).retireDraftThrough, null);
  assert.deepEqual(posts(await requests(page)), []);
});
