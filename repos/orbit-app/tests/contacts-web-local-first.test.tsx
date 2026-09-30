import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0116: the BROWSER contacts screens (resolved with .web first). With
// the browser mirror active they read the device copy like native (no
// /api/contacts page read, 「截至」 offline); without it (non-secure context)
// they keep the server pages, with no probe and no offline banner.
// Replaced boundaries: useSyncedCollection, useWebMirrorStatus, useApiResource
// and useOrbitApiClient (record requests).
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const detail = (id, name, org, evidence) => ({ state: "success", editableStatusOptions: ["active", "needs_follow_up", "nurture", "archived"], editableTagOptions: [],
  contact: { id, displayName: name, role: "顾问", organization: org, location: "东京", relationshipContext: "在储能论坛认识", nextAction: "下周跟进",
    source: { type: "manual", label: "手动记录" }, status: "active", tags: [], evidence: [{ evidenceId: "ev:" + id, excerpt: evidence }], notes: [],
    publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] },
    lastInteraction: { channel: "manual_note", occurredAt: "2026-09-27T00:00:00.000Z", summary: evidence } } });
const contact = (id, name, org, minute, evidence) => ({ id, card: { id, displayName: name, organization: org, role: "顾问", sourceType: "manual", status: "active",
    pendingInitialization: false, nextActionPreview: "下周跟进", valueTypes: [], updatedAt: "2026-09-27T00:00:00.000Z" }, tags: [],
  search: { text: [name, "顾问", org, "东京", evidence].join(" "), occurredAt: "2026-09-27T00:0" + minute + ":00.000000Z", updatedAt: "2026-09-27T00:0" + minute + ":00.000000Z", error: null },
  detail: detail(id, name, org, evidence) });
const contacts = () => (window.fixture.contacts ?? [
  contact("contact:a", "张伟", "星河能源", 3, "会议上聊过储能试点"),
  contact("contact:b", "佐藤 花子", "東京ベンチャーズ", 2, "名刺交換で知り合った"),
  contact("contact:c", "Émile Zola", "Rougon Labs", 1, "Met at the Tokyo mixer"),
]).map(payload => ({ id: payload.id, payload }));
const note = { id: "note:1", accountId: "account:one", ownerUserId: "account:one", title: "储能论坛会后笔记", body: "和张伟、佐藤聊了储能。", manualContactIds: ["contact:a", "contact:b"],
  mentions: [], contactIds: ["contact:a", "contact:b"], eventIds: [], version: 1, createdAt: "2026-09-27T00:05:00.000Z", updatedAt: "2026-09-27T00:05:00.000Z" };
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, status: "fresh", mirror: "local-mirror", ...window.initialFixture };
export const useWebMirrorStatus = () => state.mirror === "local-mirror" ? { mode: "local-mirror", scopeDigest: "d".repeat(64), domains: ["notes", "tasks", "personal-schedule", "contacts"] } : { mode: "online-only", reason: state.mirror };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/contacts";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace(href) { state.navigation.push("replace"); } });
// Sprint 0131: page copies / row-id reads open the coordinator session; this harness has none.
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "contact" ? contacts() : kind === "note" ? [{ id: note.id, payload: note }] : [],
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => null,
});
const offline = { kind: "offline", error: { code: "NETWORK", message: "Network request failed" }, meta: {}, status: 0, refreshing: false, refresh() {} };
const serverCard = { id: "contact:srv", displayName: "服务器上的联系人", organization: "Server Org", role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-27T00:00:00.000Z" };
export const useApiResource = (path, _isEmpty, options) => {
  if (options?.enabled === false) return { kind: "loading", refreshing: false, refresh() {} };
  state.requests.push("resource:" + path);
  if (state.mirror !== "local-mirror" && path.startsWith("/api/contacts/page")) return { kind: "success", data: { items: [serverCard], nextCursor: null, hasMore: false, asOf: "2026-09-27T00:00:00.000Z" }, meta: {}, status: 200, refreshing: false, refresh() {} };
  if (state.mirror !== "local-mirror" && path.startsWith("/api/contacts/summary")) return { kind: "success", data: { total: 1, sources: { manual: 1 }, statuses: { active: 1 }, values: {}, tags: [], hasMoreTags: false, asOf: "2026-09-27T00:00:00.000Z" }, meta: {}, status: 200, refreshing: false, refresh() {} };
  return offline;
};
// Stable like the real hook (it memoizes one client per scope).
const client = {
  async get(path) { state.requests.push("get:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
  async post(path) { state.requests.push("post:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
  async patch(path) { state.requests.push("patch:" + path); return { success: false, status: 0, error: { message: "offline" } }; },
};
export const useOrbitApiClient = () => client;
const authSession = { ready: true, signedIn: true, accountId: "account:one", actorId: "account:one", cookieHeader: "", user: { id: "account:one" } };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture", ready: true });
const memory = new Map();
export default { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } };
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { ContactsScreen } from "./src/screens/contacts/ContactsScreen";
        import { ContactDetailScreen } from "./src/screens/contacts/ContactDetailScreen";
        import { NoteDetailScreen } from "./src/screens/notes/NoteDetailScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "detail" ? <ContactDetailScreen scopeKey="scope" /> : which === "note" ? <NoteDetailScreen actorId="account:one" noteId="note:1" scopeKey="scope" /> : <ContactsScreen mode="main" scopeKey="scope" />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{screen}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    // Browser resolution: .web variants first.
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "contacts-web-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "contacts-web" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|useWebMirrorStatus|AuthSessionProvider|ApiBaseUrlProvider)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "contacts-web" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$|^expo-camera$|^expo-image-picker$/ }, () => ({ path: "icons", namespace: "contacts-web" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "contacts-web" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "contacts-web" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "contacts-web" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(() => page.close()); await page.goto(url); return page;
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);
const contactReads = async (page: Page) => (await requests(page)).filter((path) => /\/api\/contacts(\/page|\/summary|\/contact%3A|\/contact:|\/labels)/.test(path));

test("with the browser mirror active the list, search and detail read the device copy; offline says 截至 and sends no contacts read", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText("张伟", { exact: true }).waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByRole("textbox", { name: "搜索姓名、公司、资源" }).fill("rougon");
  await page.getByText("Émile Zola", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("张伟"));
  assert.deepEqual(await contactReads(page), [], "no /api/contacts read with the browser mirror");
  const detail = await open(t, { screen: "detail", status: "stale", params: { id: "contact:b" } });
  await detail.getByText("佐藤 花子", { exact: true }).first().waitFor();
  await detail.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
});

test("without the browser mirror (non-secure context) the list reads the server pages: no probe, no offline banner, no error", async (t) => {
  const page = await open(t, { mirror: "insecure-context" });
  await page.getByText("服务器上的联系人", { exact: true }).waitFor();
  assert.equal(await page.getByText("张伟", { exact: true }).count(), 0, "the device copy is not the source");
  assert.equal(await page.getByText(/无法连接/).count(), 0);
  const reads = await contactReads(page);
  assert.ok(reads.some((path) => path.startsWith("resource:/api/contacts/page")) && reads.some((path) => path.startsWith("resource:/api/contacts/summary")));
  assert.equal(await page.evaluate(() => (window as any).fixture.syncs), 0, "no mirror probe");
});
