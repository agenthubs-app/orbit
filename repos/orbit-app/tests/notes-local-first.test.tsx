import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0108: the NATIVE notes screens (resolved without .web) read the
// lease-fed mirror. useSyncedCollection is the only replaced boundary: it
// serves a mirror snapshot and counts syncs, so the tests can prove the list
// and detail render from the device copy with no /api/notes request, and that
// offline disables every write entry.
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const note = (id, title, minute, extra = {}) => ({ id, accountId: "account:one", ownerUserId: "account:one", title, body: title + " 正文", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
  createdAt: "2026-09-27T00:0" + minute + ":00.000Z", updatedAt: "2026-09-27T00:0" + minute + ":00.000Z", ...extra });
const records = () => (window.fixture.notes ?? [
  note("note:1", "发布会准备", 3, { manualContactIds: ["contact:a"], contactIds: ["contact:a"] }),
  note("note:2", "预算确认", 2, { eventIds: ["event:a"] }),
  note("note:3", "午餐 @林玫", 1, { body: "和 @林玫 午餐", contactIds: ["contact:lin"], mentions: [{ contactId: "contact:lin", displayText: "@林玫", start: 2, end: 5 }] }),
]).map(payload => ({ id: payload.id, payload }));
export const state = window.fixture = { requests: [], navigation: [], syncs: 0, invalidations: 0, status: "fresh", ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/notes";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push("replace:" + href); } });
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "lastSyncedAt" in state ? state.lastSyncedAt : "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "note" ? records() : (state.tasks ?? []).map(payload => ({ id: payload.id, payload })),
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => { state.invalidations++; const created = state.created && state.pullSucceeds !== false ? [{ id: state.created.id, payload: state.created }] : []; return { status: "fresh", records: [...records(), ...created], lastSyncedAt: "2026-09-27T05:41:00.000Z", error: null, workspaceId: "workspace:one" }; },
});
export const useApiResource = path => { state.requests.push("resource:" + path); return { kind: "empty", data: [], refreshing: false, refresh() {} }; };
export const useOrbitApiClient = () => ({ async get(path) { state.requests.push("get:" + path); return { success: false, status: 0, error: { message: "offline" } }; }, async post(path, options) { state.requests.push("post:" + path); if (path !== "/api/notes" || !state.online) return { success: false, status: 0, error: { message: "offline" } };
  const body = options.body; state.created = note("note:new", body.title, 5, { body: body.body }); return { success: true, status: 201, data: { note: state.created } }; } });
const memory = new Map();
export default { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); } };
export const SafeAreaView = ({ children, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { NotesScreen } from "./src/screens/notes/NotesScreen";
        import { NoteDetailScreen } from "./src/screens/notes/NoteDetailScreen";
        import { NewNoteScreen } from "./src/screens/notes/NewNoteScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        const which = window.initialFixture?.screen;
        const screen = which === "detail" ? <NoteDetailScreen actorId="account:one" noteId={window.initialFixture.noteId} scopeKey="scope" /> : which === "new" ? <NewNoteScreen actorId="account:one" scopeKey="scope" /> : <NotesScreen actorId="account:one" scopeKey="scope" />;
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{screen}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    // Native resolution: no .web variants.
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "notes-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "notes-native" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "notes-native" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$/ }, () => ({ path: "icons", namespace: "notes-native" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "notes-native" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "notes-native" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "notes-native" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001';", loader: "js" }));
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

test("the notes list renders from the mirror, filters and searches locally, and sends no notes request", async (t) => {
  const page = await open(t);
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByText("预算确认", { exact: true }).waitFor();
  assert.equal(await page.getByText("已是最新内容", { exact: true }).count(), 1, "the mirror's sync label is shown");
  await page.getByRole("tab", { name: "关联活动" }).click();
  await page.getByText("预算确认", { exact: true }).waitFor();
  assert.equal(await page.getByText("发布会准备", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: "全部" }).click();
  await page.getByRole("textbox", { name: "搜索笔记" }).fill("林玫");
  await page.getByText("午餐 @林玫", { exact: true }).waitFor();
  await page.waitForFunction(() => document.body.innerText.includes("已加载 1 / 共 1 篇"));
  assert.deepEqual((await requests(page)).filter((path) => path.includes("/api/notes")), [], "no /api/notes read on native");
  assert.ok(await page.evaluate(() => (window as any).fixture.syncs) >= 1, "opening the page probes for changes (a conditional manifest read), after showing the mirror");
});

test("offline: the list keeps the device copy, says 截至 when, and turns off 新建", async (t) => {
  const page = await open(t, { status: "stale" });
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  const add = page.getByRole("button", { name: "新建笔记，需要联网" });
  assert.equal(await add.isDisabled(), true);
  await add.click({ force: true });
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [], "a disabled entry does not navigate");
});

test("a never-synced mirror shows loading, not an empty history", async (t) => {
  const page = await open(t, { status: "unsynced", lastSyncedAt: null, notes: [] });
  await page.waitForTimeout(100);
  assert.equal(await page.getByText("还没有笔记", { exact: false }).count(), 0);
  assert.equal(await page.getByRole("progressbar").count() + await page.getByText("正在同步最新内容…", { exact: true }).count() > 0, true);
});

test("a mirrored row owned by another account is refused, not shown", async (t) => {
  const page = await open(t, { notes: [{ id: "note:x", accountId: "account:two", ownerUserId: "account:two", title: "别人的笔记", body: "别人的笔记", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" }] });
  await page.getByText("服务返回的笔记不完整，请重新读取。", { exact: true }).waitFor();
  assert.equal(await page.getByText("别人的笔记", { exact: true }).count(), 0);
});

test("the detail reads the mirror; offline it disables 编辑 and the AI entry with 需要联网", async (t) => {
  const online = await open(t, { screen: "detail", noteId: "note:1", tasks: [{ id: "task:from-note", accountId: "account:one", ownerUserId: "account:one", title: "发资料", status: "open", category: "work", priority: "normal", source: "manual", sourceNoteId: "note:1", createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" }] });
  await online.getByText("发布会准备", { exact: true }).waitFor();
  await online.getByText("发资料", { exact: true }).waitFor();
  assert.equal(await online.getByRole("button", { name: "编辑笔记" }).isDisabled(), false);
  assert.deepEqual((await requests(online)).filter((path) => path.includes("/api/notes") || path.includes("note-page")), [], "detail and its source tasks come from the mirrors");
  const offline = await open(t, { screen: "detail", noteId: "note:1", status: "stale" });
  await offline.getByText("发布会准备", { exact: true }).waitFor();
  await offline.getByText(/^无法连接 · 显示截至/).waitFor();
  assert.equal(await offline.getByRole("button", { name: "编辑笔记，需要联网" }).isDisabled(), true);
  assert.equal(await offline.getByRole("button", { name: /，需要联网$/ }).count(), 2);
});

test("a note the mirror does not hold is reported missing after a sync", async (t) => {
  const page = await open(t, { screen: "detail", noteId: "note:gone" });
  await page.getByText("笔记不存在", { exact: false }).waitFor();
});

test("an online save pulls the new note into the mirror before opening it", async (t) => {
  const page = await open(t, { screen: "new", online: true });
  await page.getByRole("textbox", { name: "笔记标题" }).fill("会后要点");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("记下三件事");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["replace:/notes/note%3Anew"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.invalidations), 1, "the write triggered one notes sync");
});

test("if the pull after a save does not bring the note, the page says so and stays", async (t) => {
  const page = await open(t, { screen: "new", online: true, pullSucceeds: false });
  await page.getByRole("textbox", { name: "笔记标题" }).fill("会后要点");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("记下三件事");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.getByText("云端已保存，本地同步待处理。请重试以确认最新内容。", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
});

test("offline, a new note can be typed but not saved", async (t) => {
  const page = await open(t, { screen: "new", status: "stale" });
  await page.getByRole("textbox", { name: "笔记标题" }).fill("会后要点");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("记下三件事");
  await page.getByText(/^无法连接 · 显示截至/).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存笔记" }).isDisabled(), true);
  assert.deepEqual((await requests(page)).filter((path) => path.startsWith("post:/api/notes")), []);
});
