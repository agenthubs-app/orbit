import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { entityArtifactToDisplay } from "../src/api/schema/ai-artifacts";

// Sprint 0118 (offline 3a = AI B3): the NATIVE inbox, notification detail, AI
// home (session list) and AI conversation (resolved without .web) read the
// device copy of the sync domains inbox-notifications, ai-sessions and
// ai-session-messages. useSyncedCollection is the replaced mirror boundary; the
// network is window.fetch and records every request. Online, opening the
// inbox or the AI list sends no list request (only the sync probe); offline
// the screens keep the device copy, say 「截至」 and turn off what needs the
// server (mark read, actions, a new question).
const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

const fixtures = JSON.parse(readFileSync(new URL("./helpers/ai-entity-artifact-fixtures.json", import.meta.url), "utf8")) as Record<string, {
  taskKind: string; presentation: Record<string, unknown>; sections: Array<{ items: Array<Record<string, unknown>> }>;
}>;
const contactFixture = fixtures.contact!;
const shared = { artifactId: "artifact:1", taskId: "task:1", status: "ready", presentation: contactFixture.presentation };
const CARD = entityArtifactToDisplay({
  task: { ...shared, conversationId: "runtime:local", kind: contactFixture.taskKind, artifactProducer: "contact_recommendation_producer", query: "q", createdAt: "2026-09-20", updatedAt: "2026-09-20" },
  result: { ...shared, kind: contactFixture.taskKind, generatedView: { summary: "摘要", sections: [{ ...contactFixture.sections[0], items: [{ ...contactFixture.sections[0]!.items[0], id: "contact-recommendation:contact_1", title: "本机缓存的候选人" }] }] }, nextAction: "" },
});

const fixture = `
import React from "react";
import { View } from "react-native-web";
const ACTOR = "account:one";
const NativeDate = Date;
window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-09-28T09:00:00Z"])); } static now() { return NativeDate.parse("2026-09-28T09:00:00Z"); } };
const copy = (id) => ({ zh: { title: "提醒 " + id, reason: "原因 " + id }, en: { title: "Note " + id, reason: "Reason " + id }, ja: { title: "通知 " + id, reason: "理由 " + id } });
const notice = (id, fields = {}) => ({ id, payload: { id, revision: 1, kind: "suggestion", origin: "automation", semanticKey: "k:" + id, title: "提醒 " + id, reason: "原因 " + id, copy: copy(id),
  sources: [{ sourceKind: "contact", sourceId: "c:" + id, sourceRevision: "1", occurredAt: "2026-09-27T00:00:00.000Z", readAt: "2026-09-27T00:00:00.000Z", excerpt: "来源摘要 " + id }],
  target: { kind: "source", id: "c:" + id, href: "/contacts/c:" + id, status: "available" }, actions: ["read", "dismiss", "accept"],
  occurredAt: "2026-09-28T0" + id.slice(-1) + ":00:00.000Z", updatedAt: "2026-09-28T08:00:00.000Z", readAt: null, disposition: "open", sourceState: "available", ...fields } });
const inbox = () => [
  notice("n1"), notice("n2"), notice("n3", { readAt: "2026-09-28T08:30:00.000Z" }),
  notice("n4", { sourceState: "unavailable", title: "来源已不可用", reason: "来源已变更、不可访问，或此通知已不再适用。", copy: undefined, actions: [], target: { kind: "source", id: "c:n4", href: null, status: "unavailable" } }),
];
const sessions = () => [
  { id: "s1", payload: { id: "s1", title: "东京投资人名单", firstUserText: "帮我列东京投资人", lastMessagePreview: "已列出 3 位", createdAt: "2026-09-27T01:00:00.000Z", updatedAt: "2026-09-27T02:00:00.000Z", messageCount: 2, messageRevision: 2, organization: { customTitle: null, groupId: null, pinned: false, revision: 0 } } },
  { id: "s2", payload: { id: "s2", title: "置顶的会话", firstUserText: "储能", lastMessagePreview: "好的", createdAt: "2026-09-20T01:00:00.000Z", updatedAt: "2026-09-20T02:00:00.000Z", messageCount: 2, messageRevision: 2, organization: { customTitle: null, groupId: null, pinned: true, revision: 1 } } },
];
const messages = () => [
  { id: "s1:m0", payload: { sessionId: "s1", id: "user:0", role: "user", text: "帮我列东京投资人", index: 0, createdAt: "2026-09-27T01:00:00.000Z" } },
  { id: "s1:m1", payload: { sessionId: "s1", id: "assistant:request:1", role: "assistant", text: "已列出 3 位东京投资人", index: 1, createdAt: "2026-09-27T01:00:05.000Z" } },
];
export const state = window.fixture = { requests: [], navigation: [], syncs: {}, opened: [], savedCards: [], status: "fresh", pendingNoteChanges: 0, ...window.initialFixture };
const records = (kind) => kind === "inbox_notification" ? inbox().map(r => JSON.parse(JSON.stringify(r))) : kind === "ai_session" ? sessions() : kind === "ai_session_message" ? messages() : [];
const session = { isCurrent: () => true,
  async openAiSession(id) { state.opened.push(id); return { opened: [id], evicted: [], added: false }; },
  async readAiSessionCards(id) { return state.cards ?? null; },
  async saveAiSessionCards(id, cards) { state.savedCards.push(id); },
  async readOutboxOverlay(domainId) {
    const counts = { note: state.pendingNoteChanges, task: state.pendingTasks ?? 0, personal_schedule: state.pendingSchedule ?? 0, relationship_message: state.pendingMessages ?? 0 };
    return { queuedMutations: Array.from({ length: counts[domainId] ?? 0 }, (_, index) => ({ mutationId: domainId + "-mutation:" + index, requestJson: JSON.stringify({ body: state.privateNoteBody ?? "private fixture note" }) })) };
  },
};
// Stable per kind, like the real hook (its refresh and currentSession are memoized).
const refreshers = {};
const refresherFor = (kind) => refreshers[kind] ??= async () => { state.syncs[kind] = (state.syncs[kind] ?? 0) + 1; return null; };
const currentSession = () => session;
// Sprint 0131: a conversation page is read by row id from the device (the relationship_message rows of this fixture).
const rowSession = { isCurrent: () => true, readRecordsById: async (kind, ids) => records(kind).filter((row) => ids.includes(row.id)), readPageCopy: async () => null, savePageCopy: async () => {} };
export const useSyncCoordinatorSession = () => rowSession;
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-28T08:40:00.000Z", workspaceId: "workspace:one", records: records(kind),
  refresh: refresherFor(kind),
  invalidate: async () => null,
  currentSession,
});
export const useMirrorProbe = (refresh, enabled = true) => { React.useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]); };
window.fetch = async (input, init) => {
  const u = new URL(String(input)); const method = (init && init.method) || "GET";
  state.requests.push(method + " " + u.pathname + u.search);
  if (state.status === "stale") throw new TypeError("Network request failed");
  const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.pathname === "/api/inbox/summary") return ok({ actorId: ACTOR, messagesUnread: 1, notificationsUnread: 9, notificationMode: "typed", notificationRead: "ready", asOf: "2026-09-28T09:00:00Z" });
  if (u.pathname.startsWith("/api/ai/conversations/sessions/s1")) return ok({ session: { id: "s1", title: "东京投资人名单", createdAt: "2026-09-27T01:00:00.000Z", updatedAt: "2026-09-27T02:00:00.000Z", messageRevision: 2, messages: [
    { id: "user:0", role: "user", text: "帮我列东京投资人" }, { id: "assistant:request:1", role: "assistant", text: "服务器上的最新回答" }] },
    page: { hasMore: false, nextCursor: null, limit: 20 }, artifactRecovery: { turns: [], truncated: false }, storage: { configured: true, persisted: true } });
  return new Response(JSON.stringify({ success: false, error: { code: "UNAVAILABLE", message: "暂时不可用" } }), { status: 503, headers: { "content-type": "application/json" } });
};
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, cookieHeader: "", accountId: ACTOR, actorId: ACTOR, user: { id: ACTOR, name: "测试", email: "t@example.test" }, notificationSessionRevision: 0 });
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
        import { RelationshipInboxScreen } from "./src/screens/inbox/RelationshipInboxScreen";
        import { NotificationDetailScreen } from "./src/screens/inbox/NotificationDetailScreen";
        import { AiScreen } from "./src/screens/ai/AiScreen";
        import { AiConversationScreen } from "./src/screens/ai/AiConversationScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "detail" ? <NotificationDetailScreen /> : which === "ai" ? <AiScreen /> : which === "conversation" ? <AiConversationScreen /> : <RelationshipInboxScreen />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><div style={{ height: 844, display: "flex", flexDirection: "column" }}>{screen}</div></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".ttf": "dataurl" },
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "inbox-ai-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^react-native-svg($|\/)|^expo-camera$|^expo-image-picker$|^expo-clipboard$|^expo-haptics$/ }, () => ({ path: "icons", namespace: "inbox-ai-icons" }));
        plugin.onLoad({ filter: /.*/, namespace: "inbox-ai-icons" }, () => ({ contents: "const Stub=()=>null; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub, Polyline=Stub, ClipPath=Stub, Mask=Stub; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false}); export const setStringAsync=async()=>true; export const impactAsync=async()=>{}; export const ImpactFeedbackStyle={};", loader: "js" }));
        plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons)$|^react-native-safe-area-context($|\/)|\/(useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useMirrorProbe)$/ }, () => ({ path: "fixture", namespace: "inbox-ai" }));
        plugin.onLoad({ filter: /.*/, namespace: "inbox-ai" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
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

test("inbox: the notification list, filters and unread count come from the device copy; no list request, one sync probe", async (t) => {
  const page = await open(t);
  await page.getByRole("tab", { name: /^通知/ }).click();
  await page.getByText("提醒 n1", { exact: true }).waitFor();
  await page.getByText("提醒 n2", { exact: true }).waitFor();
  assert.equal(await page.getByText("来源已不可用", { exact: true }).count(), 0, "an unavailable notification is not in the default list");
  await page.getByRole("tab", { name: /^通知 2/ }).waitFor();
  await page.getByRole("tab", { name: "历史" }).click();
  await page.getByText("来源已不可用", { exact: true }).waitFor();
  assert.deepEqual((await requests(page)).filter((request) => request.includes("/api/inbox/notifications")), [], "no inbox list read");
  assert.ok(((await fixtureValue(page, "syncs")) as Record<string, number>).inbox_notification >= 1, "opening probes for changes");
});

test("inbox offline: 截至, mark-all-read needs the network and sends nothing", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByRole("tab", { name: /^通知/ }).click();
  await page.getByText(/^无法连接 · 显示截至 .+/).first().waitFor();
  await page.getByText("提醒 n1", { exact: true }).waitFor();
  const markAll = page.getByRole("button", { name: /全部标为已读 · 需要联网|全部已读 · 需要联网/ });
  await markAll.waitFor();
  await markAll.click({ force: true });
  assert.deepEqual((await requests(page)).filter((request) => request.startsWith("POST")), [], "no write offline");
});

test("notification detail offline: read from the device copy; actions need the network", async (t) => {
  const page = await open(t, { status: "stale", screen: "detail", params: { id: "n1" } });
  await page.getByText(/^无法连接 · 显示截至 .+/).waitFor();
  await page.getByRole("heading", { name: "提醒 n1" }).waitFor();
  await page.getByText("来源摘要 n1").waitFor();
  const dismiss = page.getByRole("button", { name: /· 需要联网/ }).first();
  assert.equal(await dismiss.isDisabled(), true);
  assert.deepEqual((await requests(page)).filter((request) => request.includes("/api/inbox/notifications")), [], "no detail read");
});

test("AI home: the session list comes from the device copy (pinned first) without a list request; offline a question needs the network", async (t) => {
  const page = await open(t, { screen: "ai" });
  await page.getByText("置顶的会话").first().waitFor();
  await page.getByText("东京投资人名单").first().waitFor();
  assert.deepEqual((await requests(page)).filter((request) => request.includes("/api/ai/conversations/sessions")), [], "no session list read");
  const offline = await open(t, { screen: "ai", status: "stale" });
  await offline.getByText(/^无法连接 · 显示截至 .+/).first().waitFor();
  await offline.getByText("东京投资人名单").first().waitFor();
  await offline.getByRole("textbox").first().fill("明天见谁");
  await offline.getByRole("button", { name: /发送/ }).first().click();
  await offline.getByText("需要联网").first().waitFor();
  assert.deepEqual(await fixtureValue(offline, "navigation"), [], "no conversation is started offline");
});

test("AI conversation offline: the opened session shows its device messages and the cached cards; sending needs the network", async (t) => {
  const cards = { turns: [{ sessionId: "s1", requestId: "request:1", userMessageId: "user:0", assistantMessageId: "assistant:request:1", status: "ready", artifacts: [CARD] }], truncated: false };
  const page = await open(t, { status: "stale", screen: "conversation", params: { id: "s1", source: "session" }, cards });
  await page.getByText(/^无法连接 · 显示截至 .+/).waitFor();
  await page.getByText("已列出 3 位东京投资人").waitFor();
  await page.getByText("本机缓存的候选人").waitFor();
  await page.getByText(/发送.* · 需要联网/).first().waitFor();
  assert.deepEqual(await fixtureValue(page, "opened"), ["s1"], "opening marks the session opened on this device");
  assert.deepEqual((await requests(page)).filter((request) => request.startsWith("POST")), []);
});

test("AI conversation online: pending note changes show only a count; offline and empty queues show no notice", async (t) => {
  const page = await open(t, { screen: "conversation", params: { id: "s1", source: "session" }, pendingNoteChanges: 2, privateNoteBody: "不应出现在提示里的笔记正文" });
  await page.getByText("服务器上的最新回答").waitFor();
  await page.getByText("有 2 项笔记修改还没同步，AI 暂时看不到", { exact: true }).waitFor();
  assert.equal(await page.getByText("不应出现在提示里的笔记正文", { exact: true }).count(), 0);

  const offline = await open(t, { status: "stale", screen: "conversation", params: { id: "s1", source: "session" }, pendingNoteChanges: 2 });
  await offline.getByText("已列出 3 位东京投资人").waitFor();
  assert.equal(await offline.getByText("有 2 项笔记修改还没同步，AI 暂时看不到", { exact: true }).count(), 0);

  const empty = await open(t, { screen: "conversation", params: { id: "s1", source: "session" }, pendingNoteChanges: 0 });
  await empty.getByText("服务器上的最新回答").waitFor();
  assert.equal(await empty.getByText(/还没同步/).count(), 0);
});

test("AI conversation online: the pending line counts every kind still on the phone, by kind, including unsent messages (0136)", async (t) => {
  const page = await open(t, { screen: "conversation", params: { id: "s1", source: "session" }, pendingNoteChanges: 2, pendingTasks: 1, pendingSchedule: 3, pendingMessages: 2 });
  await page.getByText("服务器上的最新回答").waitFor();
  await page.getByText("有 2 项笔记修改、1 项待办修改、3 项日程修改、2 条待发送消息还没同步，AI 暂时看不到", { exact: true }).waitFor();
  const messagesOnly = await open(t, { screen: "conversation", params: { id: "s1", source: "session" }, pendingNoteChanges: 0, pendingMessages: 1 });
  await messagesOnly.getByText("服务器上的最新回答").waitFor();
  await messagesOnly.getByText("有 1 条待发送消息还没同步，AI 暂时看不到", { exact: true }).waitFor();
});

test("AI conversation online: the server page replaces the device copy and its cards are kept for offline", async (t) => {
  const page = await open(t, { screen: "conversation", params: { id: "s1", source: "session" } });
  await page.getByText("服务器上的最新回答").waitFor();
  assert.equal(await page.getByText(/显示截至/).count(), 0);
  await page.waitForFunction(() => (window as any).fixture.savedCards.includes("s1"));
  await page.waitForTimeout(500);
  assert.deepEqual(await fixtureValue(page, "savedCards"), ["s1"], "one server read saves its cards once (no write loop per render)");
});

test("AI history search says it covers only titles, first questions and latest messages; 搜索更多 asks the server online and needs the network offline (0131)", async (t) => {
  const page = await open(t, { screen: "ai" });
  await page.getByText("置顶的会话").first().waitFor();
  await page.getByRole("button", { name: "全部会话" }).click();
  await page.getByPlaceholder("搜索历史").fill("投资人");
  await page.getByText("本机只搜标题、第一个问题和最近一条消息。").waitFor();
  assert.deepEqual((await requests(page)).filter((request) => request.includes("/api/ai/conversations/sessions?")), [], "typing searches the device only");
  await page.getByRole("button", { name: "搜索更多" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.some((request: string) => request.includes("/api/ai/conversations/sessions?") && request.includes("q=")));
  const offline = await open(t, { screen: "ai", status: "stale" });
  await offline.getByText("东京投资人名单").first().waitFor();
  await offline.getByRole("button", { name: "全部会话" }).click();
  await offline.getByPlaceholder("搜索历史").fill("投资人");
  assert.equal(await offline.getByRole("button", { name: "搜索更多 · 需要联网" }).isDisabled(), true);
});

test("the Today block offline shows that it is not on this device yet instead of 暂时无法连接 (0131)", async (t) => {
  const offline = await open(t, { screen: "ai", status: "stale" });
  await offline.getByText("东京投资人名单").first().waitFor();
  assert.equal(await offline.getByText("暂时无法连接 Orbit 服务，请检查网络后再试。").count(), 0);
});
