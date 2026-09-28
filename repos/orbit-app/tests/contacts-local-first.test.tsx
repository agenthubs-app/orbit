import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0116: the NATIVE contacts screens (resolved without .web) read the
// device copy of the contacts (sync domain "contacts"). useSyncedCollection is
// the replaced mirror boundary, useApiResource / useOrbitApiClient the network
// boundary: they record every request and answer "offline" unless the test
// says the server is reachable. The list, its search, the detail and the
// linked-contact names on a note must render from the device copy with no
// per-open contacts request, and offline they say 「截至」 and turn off what
// needs the server.
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
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, status: "fresh", ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/contacts";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, replace(href) { state.navigation.push("replace"); } });
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "contact" ? contacts() : kind === "note" ? [{ id: note.id, payload: note }] : [],
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => null,
});
const offline = { kind: "offline", error: { code: "NETWORK", message: "Network request failed" }, meta: {}, status: 0, refreshing: false, refresh() {} };
export const useApiResource = (path, _isEmpty, options) => {
  if (options?.enabled !== false) state.requests.push("resource:" + path);
  return options?.enabled === false ? { kind: "loading", refreshing: false, refresh() {} } : offline;
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
    // Native resolution: no .web variants.
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "contacts-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "contacts-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "contacts-native" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$|^expo-camera$|^expo-image-picker$/ }, () => ({ path: "icons", namespace: "contacts-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "contacts-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "contacts-native" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "contacts-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001'; export const CameraView=Stub; export const useCameraPermissions=()=>[null,async()=>null]; export const launchImageLibraryAsync=async()=>({canceled:true}); export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});", loader: "js" }));
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

test("the contacts list and its search read the device copy with the server's rules and send no page, summary or per-contact request", async (t) => {
  const page = await open(t);
  await page.getByText("张伟", { exact: true }).waitFor();
  await page.getByText("佐藤 花子", { exact: true }).waitFor();
  await page.getByText("Émile Zola", { exact: true }).waitFor();
  const search = page.getByRole("textbox", { name: "搜索姓名、公司、资源" });
  // A cited source's text finds its contact (the server's search text), case-insensitively.
  await search.fill("储能");
  await page.waitForFunction(() => !document.body.innerText.includes("佐藤 花子"));
  assert.equal(await page.getByText("张伟", { exact: true }).count(), 1);
  await search.fill("TOKYO MIXER");
  await page.getByText("Émile Zola", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("张伟"));
  assert.deepEqual(await contactReads(page), [], "no /api/contacts read on native");
  assert.ok(await page.evaluate(() => (window as any).fixture.syncs) >= 1, "opening the page probes for changes (a conditional manifest read)");
});

test("offline: the list keeps the device copy with 截至, and the server-only searches say 需要联网 and are off", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText("张伟", { exact: true }).waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByRole("button", { name: "搜索选项" }).click();
  const deep = page.getByRole("button", { name: /深度搜索 · 需要联网/ });
  const relationship = page.getByRole("button", { name: /关系搜索 · 需要联网/ });
  assert.equal(await deep.isDisabled(), true);
  assert.equal(await relationship.isDisabled(), true);
  await deep.click({ force: true });
  assert.deepEqual((await requests(page)).filter((path) => path.startsWith("post:")), [], "a disabled search sends nothing");
});

test("offline detail: the device copy with its source records, 截至, no edit entry, and the AI draft needs the network", async (t) => {
  const page = await open(t, { screen: "detail", status: "stale", params: { id: "contact:a" } });
  await page.getByText("张伟", { exact: true }).first().waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  await page.getByText("星河能源", { exact: false }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "编辑资料" }).count(), 0, "editing needs the network");
  const draft = page.getByRole("button", { name: /起草消息 · 需要联网/ });
  assert.equal(await draft.isDisabled(), true);
  await page.getByText("聊天资格 · 需要联网", { exact: true }).waitFor();
  assert.equal(await page.getByText("暂时连不上服务器", { exact: false }).count(), 0, "no error block over the device copy");
});

test("a note's linked contacts are named from the device copy, offline, with no /api/contacts/:id request", async (t) => {
  const page = await open(t, { screen: "note", status: "stale" });
  await page.getByText("储能论坛会后笔记", { exact: true }).waitFor();
  await page.getByText("张伟", { exact: false }).first().waitFor();
  await page.getByText("佐藤 花子", { exact: false }).first().waitFor();
  assert.deepEqual(await contactReads(page), [], "linked contacts read no contact detail");
});

test("a linked contact the device does not hold yet is the only one asked of the server", async (t) => {
  const page = await open(t, { screen: "note", contacts: [
    { id: "contact:a", card: { id: "contact:a", displayName: "张伟", organization: "星河能源", role: "顾问", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-09-27T00:00:00.000Z" }, tags: [],
      search: { text: "张伟", occurredAt: "2026-09-27T00:00:00.000000Z", updatedAt: "2026-09-27T00:00:00.000000Z", error: null },
      detail: { state: "success", editableStatusOptions: ["active"], editableTagOptions: [], contact: { id: "contact:a", displayName: "张伟", role: "", organization: "星河能源", location: "", relationshipContext: "", nextAction: "", source: { type: "manual", label: "手动记录" }, status: "active", tags: [], evidence: [], notes: [], publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "manual_note", occurredAt: "", summary: "" } } } },
  ] });
  await page.getByText("张伟", { exact: false }).first().waitFor();
  await page.waitForFunction(() => (window as any).fixture.requests.some((path: string) => path.includes("contact%3Ab") || path.includes("contact:b")));
  assert.deepEqual(await contactReads(page), ["get:/api/contacts/contact%3Ab"], "only the contact missing from the device is read");
});
