import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Sprint 0125: the BROWSER notes screens (resolved with .web first). With the
// browser mirror active they read the same mirror hooks as native: no
// /api/notes read, 「截至」 offline, writes disabled with 需要联网. Without it
// (non-secure context) they fall back to the server search, error-free.
// Replaced boundaries: useSyncedCollection (mirror snapshot + sync counters),
// useWebMirrorStatus (what the lifecycle reports), useApiResource/useOrbitApiClient
// (record requests; an `enabled: false` resource stays inert as the real hook does).
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React from "react";
import { View } from "react-native";
const note = (id, title, minute, extra = {}) => ({ id, accountId: "account:one", ownerUserId: "account:one", title, body: title + " 正文", manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1,
  createdAt: "2026-09-27T00:0" + minute + ":00.000Z", updatedAt: "2026-09-27T00:0" + minute + ":00.000Z", ...extra });
const mirrorNotes = () => [note("note:1", "发布会准备", 3, { manualContactIds: ["contact:a"], contactIds: ["contact:a"] }), note("note:2", "预算确认", 2, { eventIds: ["event:a"] })];
const serverNotes = () => [note("note:srv", "服务器上的笔记", 4)];
export const state = window.fixture = { requests: [], apiClientRefs: [], navigation: [], syncs: 0, invalidations: 0, status: "fresh", mirror: "local-mirror", ...window.initialFixture };
export const useLocalSearchParams = () => window.fixture.params ?? {};
export const usePathname = () => "/notes";
export const useRouter = () => ({ canGoBack: () => Boolean(state.canGoBack), back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push("replace:" + href); } });
export const useWebMirrorStatus = () => state.mirror === "local-mirror" ? { mode: "local-mirror", scopeDigest: "d".repeat(64), domains: ["notes", "tasks", "personal-schedule"] } : { mode: "online-only", reason: state.mirror };
// Sprint 0131: page copies / row-id reads open the coordinator session; this harness has none.
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = ({ kind }) => ({
  status: state.status, error: state.status === "stale" ? "Network request failed" : null,
  lastSyncedAt: "2026-09-27T05:40:00.000Z", workspaceId: "workspace:one",
  records: kind === "note" ? mirrorNotes().map(payload => ({ id: payload.id, payload })) : (state.tasks ?? []).map(payload => ({ id: payload.id, payload })),
  refresh: async () => { state.syncs++; return null; },
  invalidate: async () => { state.invalidations++; const created = state.created ? [{ id: state.created.id, payload: state.created }] : []; return { status: "fresh", records: [...mirrorNotes().map(payload => ({ id: payload.id, payload })), ...created], lastSyncedAt: "2026-09-27T05:41:00.000Z", error: null, workspaceId: "workspace:one" }; },
});
export const useApiResource = (path, _validate, options = {}) => {
  if (options.enabled === false) return { kind: "loading", refreshing: false, refresh() {} };
  state.requests.push("resource:" + path);
  if (path.startsWith("/api/notes?") || path.startsWith("/api/notes/search")) return { kind: "success", data: { notes: serverNotes(), total: 1 }, refreshing: false, refresh() {} };
  if (path.startsWith("/api/notes/")) return { kind: "success", data: { note: serverNotes()[0] }, refreshing: false, refresh() {} };
  return { kind: "empty", data: [], refreshing: false, refresh() {} };
};
const apiClient = { async get(path) { state.requests.push("get:" + path); return { success: false, status: 0, error: { message: "offline" } }; }, async post(path, options) { state.requests.push("post:" + path); if (path !== "/api/notes" || state.status === "stale") return { success: false, status: 0, error: { message: "offline" } };
  const body = options.body; state.created = note("note:new", body.title, 5, { body: body.body }); return { success: true, status: 201, data: { note: state.created } }; } };
export const useOrbitApiClient = () => { state.apiClientRefs.push(apiClient); return apiClient; };
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
    // Browser resolution: .web variants first, as Metro does for phoneweb.
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "notes-web-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "notes-web" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|useSyncedCollection|useWebMirrorStatus)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "notes-web" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^react-native-svg$|^expo-crypto$/ }, () => ({ path: "icons", namespace: "notes-web" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "notes-web" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "notes-web" }, () => ({ contents: `export * from "react-native-web";`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "notes-web" }, () => ({ contents: "const Stub=()=>null; export const Ionicons=Stub; export default Stub; export const Svg=Stub, Path=Stub, Circle=Stub, G=Stub, Rect=Stub, Line=Stub, Defs=Stub, LinearGradient=Stub, Stop=Stub, Text=Stub, Ellipse=Stub, Polygon=Stub; export const randomUUID=()=>'00000000-0000-4000-8000-000000000001';", loader: "js" }));
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

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 200)); });
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(() => page.close()); await page.goto(url); return { page, errors };
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as string[]);
const notesReads = async (page: Page) => (await requests(page)).filter((path) => path.includes("/api/notes") || path.includes("note-page"));

test("browser mirror active: the notes list renders from the mirror and sends no notes request", async (t) => {
  const { page, errors } = await open(t);
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByText("预算确认", { exact: true }).waitFor();
  assert.equal(await page.getByText("服务器上的笔记", { exact: true }).count(), 0);
  assert.equal(await page.getByText("已是最新内容", { exact: true }).count(), 1, "the mirror's sync label is shown");
  assert.deepEqual(await notesReads(page), [], "no /api/notes read while the mirror is the source");
  assert.ok(await page.evaluate(() => (window as any).fixture.syncs) >= 1, "opening the page probes for changes");
  assert.deepEqual(errors, []);
});

test("browser mirror active and offline: the list says 截至 and turns off 新建, like native", async (t) => {
  const { page } = await open(t, { status: "stale" });
  await page.getByText("发布会准备", { exact: true }).waitFor();
  await page.getByText(/^无法连接 · 显示截至 .+ 的内容；新建和编辑需要联网$/).waitFor();
  const add = page.getByRole("button", { name: "新建笔记，需要联网" });
  assert.equal(await add.isDisabled(), true);
  await add.click({ force: true });
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
});

test("the list's 「首页」 button goes home even when there is history, online and offline (0125 leftover, 0130)", async (t) => {
  for (const status of ["fresh", "stale"]) {
    const { page } = await open(t, { status, canGoBack: true });
    await page.getByText("发布会准备", { exact: true }).waitFor();
    await page.getByRole("button", { name: "返回首页" }).click();
    // router.back() here returned to an earlier /notes entry, so the first press looked like it did nothing.
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["replace:/home"], status);
  }
});

test("browser mirror active: the detail and its source tasks read the mirrors; offline 编辑 and the AI entry need the network", async (t) => {
  const tasks = [{ id: "task:from-note", accountId: "account:one", ownerUserId: "account:one", title: "发资料", status: "open", category: "work", priority: "normal", source: "manual", sourceNoteId: "note:1", createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" }];
  const { page: online } = await open(t, { screen: "detail", noteId: "note:1", tasks });
  await online.getByText("发布会准备", { exact: true }).waitFor();
  await online.getByText("发资料", { exact: true }).waitFor();
  assert.equal(await online.getByRole("button", { name: "编辑笔记" }).isDisabled(), false);
  assert.deepEqual(await notesReads(online), [], "detail and source tasks come from the mirrors");
  const { page: offline } = await open(t, { screen: "detail", noteId: "note:1", tasks, status: "stale" });
  await offline.getByText("发布会准备", { exact: true }).waitFor();
  await offline.getByText(/^无法连接 · 显示截至/).waitFor();
  assert.equal(await offline.getByRole("button", { name: "编辑笔记，需要联网" }).isDisabled(), true);
  assert.equal(await offline.getByRole("button", { name: /，需要联网$/ }).count(), 2, "编辑 and AI 总结 are both disabled");
});

test("browser mirror active: an online save pulls the new note into the mirror before opening it", async (t) => {
  const { page } = await open(t, { screen: "new" });
  await page.getByRole("textbox", { name: "笔记标题" }).fill("会后要点");
  await page.getByRole("textbox", { name: "笔记内容" }).fill("记下三件事");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.length > 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["replace:/notes/note%3Anew"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.invalidations), 1, "the write triggered one notes sync");
});

test("non-secure context (mirror online-only): list and detail read the server, no probe, no offline banner, no error", async (t) => {
  const { page, errors } = await open(t, { mirror: "insecure-context" });
  await page.getByText("服务器上的笔记", { exact: true }).waitFor();
  assert.equal(await page.getByText("发布会准备", { exact: true }).count(), 0, "the mirror is not the source");
  assert.ok((await notesReads(page)).some((path) => path.startsWith("resource:/api/notes")), "the server search is read");
  assert.equal(await page.evaluate(() => (window as any).fixture.syncs), 0, "no mirror probe while online-only");
  assert.equal(await page.getByText(/无法连接/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "新建笔记，需要联网" }).count(), 0);
  const { page: detail, errors: detailErrors } = await open(t, { mirror: "insecure-context", screen: "detail", noteId: "note:srv" });
  await detail.getByText("服务器上的笔记", { exact: true }).waitFor();
  await detail.waitForFunction(() => (window as any).fixture.apiClientRefs.length >= 2);
  const clientRefs = await detail.evaluate(() => {
    const refs = (window as any).fixture.apiClientRefs as object[];
    return { calls: refs.length, unique: new Set(refs).size };
  });
  assert.ok(clientRefs.calls >= 2, "the detail's empty-contact effect caused another render");
  assert.equal(clientRefs.unique, 1, "the fixture preserves the client identity across renders");
  assert.ok((await notesReads(detail)).includes("resource:/api/notes/note%3Asrv") || (await notesReads(detail)).some((path) => path.startsWith("resource:/api/notes/")));
  assert.deepEqual([...errors, ...detailErrors], []);
});
