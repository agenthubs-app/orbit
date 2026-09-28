import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0119 (offline 3b = message plan M3): the NATIVE inbox threads, the
// inbox conversation, the chat list and the chat detail (resolved without
// .web) read the device copy of the sync domains relationship-conversations
// and relationship-messages. useSyncedCollection is the replaced mirror
// boundary; the network is window.fetch and records every request. Online,
// opening the threads or a conversation sends no summaries, unread or
// messages request (only the sync probe; a conversation with unread messages
// is marked read once). Offline the screens keep the device copy, say 「截至」,
// page back through the whole history, and turn off what needs the server
// (send, save draft, mark read).
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
const session = { isCurrent: () => true };
const currentSession = () => session;
const snapshots = {};
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
export const randomUUID = () => "00000000-0000-4000-8000-000000000001";
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
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "relationship-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
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

test("inbox threads: the list and the unread count come from the device copy; no summaries or unread request, one sync probe", async (t) => {
  const page = await open(t);
  await page.getByText("李雷", { exact: true }).waitFor();
  await page.getByText("王小明", { exact: true }).waitFor();
  const names = await page.getByText(/^(李雷|王小明)$/).allTextContents();
  assert.deepEqual(names, ["李雷", "王小明"], "newest first, the server's order");
  await page.getByRole("tab", { name: /^消息 3/ }).waitFor();
  assert.deepEqual(messageReads(await requests(page)), [], "no conversation list, unread or messages read");
  assert.ok(((await fixtureValue(page, "syncs")) as Record<string, number>).relationship_conversation >= 1, "opening probes for changes");
});

test("inbox threads offline: 截至, the list stays, marking the page read needs the network and sends nothing", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText(/^无法连接 · 显示截至 .+/).first().waitFor();
  await page.getByText("王小明", { exact: true }).waitFor();
  const markRead = page.getByRole("button", { name: "本页已读 · 需要联网" });
  await markRead.waitFor();
  assert.equal(await markRead.getAttribute("aria-disabled"), "true");
  await markRead.click({ force: true });
  assert.deepEqual((await requests(page)).filter((request) => request.startsWith("POST")), [], "no write offline");
});

test("conversation online: the history is the device copy; an unread conversation is marked read once, nothing else is requested", async (t) => {
  const page = await open(t, { screen: "thread", params: { id: B_ID } });
  await page.getByText("王小明的第 40 条", { exact: true }).waitFor();
  await page.waitForFunction(() => (window as any).fixture.requests.some((request: string) => request.startsWith("POST")));
  await page.waitForTimeout(400);
  const list = await requests(page);
  assert.deepEqual(list.filter((request) => request.startsWith("POST")), [`POST /api/relationship-communication/conversations/${encodeURIComponent(B_ID)}/read`], "one read receipt");
  assert.deepEqual(messageReads(list), [], "no summaries or messages read");
  assert.equal(await page.getByText(/显示截至/).count(), 0);
});

test("conversation offline: 截至, the whole history pages back from the device; send, save draft and mark read need the network", async (t) => {
  const page = await open(t, { screen: "thread", status: "stale", params: { id: B_ID } });
  await page.getByText(/^无法连接 · 显示截至 .+/).first().waitFor();
  await page.getByText("王小明的第 40 条", { exact: true }).waitFor();
  assert.equal(await page.getByText("王小明的第 1 条", { exact: true }).count(), 0, "the first page is the latest window");
  await page.getByText("标为已读 · 需要联网").waitFor();
  const send = page.getByRole("button", { name: "发送消息 · 需要联网" });
  const save = page.getByRole("button", { name: "保存草稿 · 需要联网" });
  assert.equal(await send.getAttribute("aria-disabled"), "true");
  assert.equal(await save.getAttribute("aria-disabled"), "true");
  await page.getByRole("button", { name: "更早的消息" }).click();
  await page.getByText("王小明的第 1 条", { exact: true }).waitFor();
  assert.deepEqual(await requests(page), [], "nothing is requested offline, older messages included");
});

test("a conversation no longer on the device (revoked) says so instead of loading", async (t) => {
  const page = await open(t, { screen: "thread", params: { id: "relationship-conversation:gone" } });
  await page.getByText("这段对话已不在本机：关系已撤销，或对话已不可用。").waitFor();
  assert.deepEqual(messageReads(await requests(page)), []);
});

test("chat list and chat detail read the device copy too; offline the detail keeps the history and sending needs the network", async (t) => {
  const list = await open(t, { screen: "chat" });
  await list.getByText("王小明").first().waitFor();
  assert.deepEqual(messageReads(await requests(list)), []);
  const detail = await open(t, { screen: "chat-detail", status: "stale", params: { id: B_ID } });
  await detail.getByText(/^无法连接 · 显示截至 .+/).first().waitFor();
  await detail.getByText("王小明的第 40 条", { exact: true }).waitFor();
  const send = detail.getByRole("button", { name: "发送消息 · 需要联网" });
  assert.equal(await send.getAttribute("aria-disabled"), "true");
  await detail.getByRole("button", { name: "更早的消息" }).click();
  await detail.getByText("王小明的第 1 条", { exact: true }).waitFor();
  assert.deepEqual(await requests(detail), []);
});
