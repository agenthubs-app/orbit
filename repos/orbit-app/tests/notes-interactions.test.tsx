import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
// Sprint 0125: these tests cover the browser network source (no browser mirror available).
export const useWebMirrorStatus = () => ({ mode: "online-only", reason: "no-opfs" });
// Sprint 0131: page copies / row-id reads open the coordinator session; this harness has none.
export const useSyncCoordinatorSession = () => null;
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, records: [], workspaceId: null, refresh: async () => null, invalidate: async () => null });
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
const rerender = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
const original = {
  id: "note:one", accountId: "account:one", ownerUserId: "account:one", title: "原始标题", body: "原始笔记",
  manualContactIds: ["contact:a", "contact:b"], mentions: [], contactIds: ["contact:a", "contact:b"], eventIds: [], version: 2,
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:01:00.000Z"
};
const state = window.fixture = {
  mode: new URLSearchParams(location.search).get("mode") || "new",
  routeNoteId: new URLSearchParams(location.search).get("noteId") || "note:one",
  offline: new URLSearchParams(location.search).has("offline"), response: "success", requests: [], reads: [], navigation: [], drafts: [], queued: [], queueStarted: false, holdQueue: false, releaseQueue: null, note: original,
  localContacts: [{ id: "contact:local", card: { id: "contact:local", displayName: "镜像联系人", organization: "本地组织", role: "顾问", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-15T00:00:00.000Z" }, tags: [], search: { text: "镜像联系人 本地组织", occurredAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", error: null }, detail: null }],
  localEvents: [{ id: "event:local", deletedAt: null, payload: { eventId: "event:local", participantId: null, title: "镜像活动", description: null, venue: "本地会场", timeZone: "Asia/Tokyo", startsAt: "2026-10-01T01:00:00.000Z", endsAt: "2026-10-01T02:00:00.000Z", lifecycleState: "published", checkInOpensAt: null, eventStartsAt: null, eventEndsAt: null, profileEditDeadlineAt: null, resultsAvailableAt: null, roundOneStartsAt: null, roundTwoStartsAt: null } }],
  remoteEvents: [{ id: "event:remote", title: "在线活动", startsAt: "2026-10-02T01:00:00.000Z", status: "published" }],
  conflictMutation: null, resolutions: [],
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
const contacts = { total: 3, contacts: [
  { id: "contact:a", displayName: "林悦", organization: "Orbit" },
  { id: "contact:b", displayName: "佐藤", organization: "Studio" },
  { id: "contact:c", displayName: "陈默", organization: "Lab" }
] };
function result(kind, body) {
  if (state.response === "failure") return { success: false, status: 409, error: { code: "CONFLICT", message: "当前状态已经变化，请刷新后再试。" }, meta: {} };
  if (state.response === "network") return { success: false, status: 0, error: { code: "ORBIT_APP_NETWORK_ERROR", message: "network unavailable" }, meta: {} };
  if (state.response === "mismatch") return { success: true, status: 200, data: { note: { ...original, body: "其他正文" } }, meta: {} };
  if (kind === "create") return { success: true, status: 201, data: { note: {
    ...original, id: "note:created", title: body.title, body: body.body, manualContactIds: body.manualContactIds, mentions: body.mentions, contactIds: body.manualContactIds, eventIds: body.eventIds, version: 1,
    createdAt: "2026-09-15T00:02:00.000Z", updatedAt: "2026-09-15T00:02:00.000Z"
  } }, meta: {} };
  if (kind === "unlink") return { success: true, status: 200, data: { note: {
    ...state.note, contactIds: state.note.contactIds.filter(id => id !== kind.contactId), version: state.note.version + 1,
    updatedAt: "2026-09-15T00:03:00.000Z"
  } }, meta: {} };
  return { success: true, status: 200, data: { note: {
    ...state.note, title: body.title, body: body.body, manualContactIds: body.manualContactIds, mentions: body.mentions, eventIds: body.eventIds, contactIds: [...new Set([...body.manualContactIds, ...body.mentions.map(item => item.contactId)])], version: state.note.version + 1,
    updatedAt: "2026-09-15T00:03:00.000Z"
  } }, meta: {} };
}
const client = {
  async get(path) {
    state.requests.push({ method: "GET", path });
    const contactId = decodeURIComponent(path.split("/").at(-1));
    const contact = contacts.contacts.find(item => item.id === contactId);
    return contact
      ? { success: true, status: 200, data: { contact }, meta: {} }
      : { success: false, status: 404, error: { code: "NOT_FOUND", message: "没有找到联系人。" }, meta: {} };
  },
  async post(path, options) {
    state.requests.push({ method: "POST", path, body: options.body });
    if (path === "/api/contacts/search") return { success: true, status: 200, data: { ...contacts, contacts: contacts.contacts.filter(contact => (contact.displayName + " " + contact.organization).includes(options.body.query)) }, meta: {} };
    return result("create", options.body);
  },
  async patch(path, options) { state.requests.push({ method: "PATCH", path, body: options.body }); return result("update", options.body); },
  async delete(path, options) {
    state.requests.push({ method: "DELETE", path, body: options.body });
    const contactId = decodeURIComponent(path.split("/").at(-1));
    if (state.response === "failure") return result("update", options.body);
    return { success: true, status: 200, data: { note: { ...state.note, contactIds: state.note.contactIds.filter(id => id !== contactId), version: state.note.version + 1, updatedAt: "2026-09-15T00:04:00.000Z" } }, meta: {} };
  }
};
export const useOrbitApiClient = () => client;
export const useLocalContacts = () => ({ available: true, rows: state.localContacts, freshness: { readable: true, loading: false, failure: null, refreshing: false, offline: true, lastSyncedAt: "2026-09-15T00:00:00.000Z", syncLabelKey: "sync.stale" }, refresh() {} });
export const useLocalEventDay = () => ({ records: { registrations: [], events: state.localEvents, results: [] }, freshness: { readable: true, loading: false, failure: null, refreshing: false, offline: true, lastSyncedAt: "2026-09-15T00:00:00.000Z", syncLabelKey: "sync.stale" }, refresh() {} });
export const noteDraftStorage = {
  async load() {
    if (new URLSearchParams(location.search).get("restore") === "late") return new Promise(resolve => { state.releaseDraft = () => resolve({ title: "旧草稿标题", body: "旧草稿正文", manualContactIds: [], mentions: [], eventIds: [], savedAt: "2026-09-15T00:00:00.000Z" }); });
    return null;
  },
  async save(_scope, draft) { state.drafts.push({ kind: "save", body: draft.body }); },
  async clear() { state.drafts.push({ kind: "clear" }); if (new URLSearchParams(location.search).get("restore") === "slow-clear") await new Promise(resolve => { state.releaseClear = resolve; }); }
};
export const useApiResource = (path, _empty, options = {}) => {
  rerender();
  useEffect(() => { if (options.enabled !== false) state.reads.push({ path, options }); }, [path, options.enabled]);
  if (path.startsWith("/api/tasks/note-page?")) {
    const params = new URLSearchParams(path.split("?")[1]), next = params.has("cursor");
    if (state.taskResponse === "failure") return { kind: "failure", refreshing: false, refresh() { state.update({taskResponse:"success"}); }, error: { message: "关联待办暂不可用" } };
    return { kind: "success", refreshing: false, refresh() { state.update({}); }, data: {
      actorId: state.taskResponse === "foreign" ? "foreign" : "account:one", noteId: state.taskResponse === "wrong-note" ? "note:other" : "note:one", total: 25, hasMore: !next, nextCursor: next ? null : "next", asOf: "2026-09-25T00:00:00Z",
      items: Array.from({length: next ? 5 : 20}, (_, i) => ({id:"task:"+(i+(next?20:0)),titlePreview:"关联事项 "+(i+(next?20:0)),status:"open",sourceNoteVersion:2}))
    } };
  }
  return { kind: "success", data: path === "/api/contacts" ? contacts : path === "/api/events" ? { events: state.remoteEvents } : { note: state.note }, refreshing: false, refresh() { state.update({}); } };
};
export const useLocalSearchParams = () => state.mode === "new" ? { contactId: "contact:a" } : { id: "note:one" };
export const usePathname = () => state.mode === "new" ? "/notes/new" : "/notes/note:one";
export const useRouter = () => ({
  canGoBack: () => state.mode !== "fallback",
  back() { state.navigation.push("back"); },
  push(href) { state.navigation.push(href); },
  replace(href) { state.navigation.push(href); }
});
export const SafeAreaView = ({ children, ...props }) => <View {...props}>{children}</View>;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { NewNoteScreen } from "./src/screens/notes/NewNoteScreen";
        import { NoteDetailScreen } from "./src/screens/notes/NoteDetailScreen";
        import { EditNoteScreen } from "./src/screens/notes/EditNoteScreen";
        import { NotesScreen } from "./src/screens/notes/NotesScreen";
        import { AppScreen } from "./src/components/AppScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const params = new URLSearchParams(location.search); const mode = params.get("mode") || "new"; const language = params.get("language") || "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{mode === "new"
          ? <NewNoteScreen actorId="account:one" scopeKey="scope" />
          : mode === "list" ? <NotesScreen actorId="account:one" scopeKey="scope" />
          : mode === "default" || mode === "fallback" ? <AppScreen title="Default screen" />
          : mode === "edit" ? <EditNoteScreen actorId="account:one" noteId={window.fixture.routeNoteId} scopeKey="scope" />
          : <NoteDetailScreen actorId="account:one" noteId={window.fixture.routeNoteId} scopeKey="scope" />}</OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "note-screen-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "react-native", namespace: "notes-test" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|^\.\/notes-source$|\/(useApiResource|useOrbitApiClient|useLocalContacts|useLocalEventDay|note-draft-storage|useWebMirrorStatus|useSyncedCollection)$/ }, args => ({ path: args.path === "./notes-source" ? "notes-source" : "fixture", namespace: "notes-test" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: "icons", namespace: "notes-test" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "notes-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^react-native$/, namespace: "notes-test" }, () => ({ contents: `export * from "react-native-web"; export const Platform = { get OS() { return new URLSearchParams(location.search).has("native") ? "ios" : "web"; } };`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^notes-source$/, namespace: "notes-test" }, () => ({ contents: `export const useNotesWriteStatus = () => ({ offline: window.fixture.offline, lastSyncedAt: "2026-09-15T00:00:00.000Z", syncLabelKey: null, queuedCount: 0, async enqueueOfflineMutation(mutation) { const s = window.fixture; s.queueStarted = true; if (s.holdQueue) await new Promise(resolve => { s.releaseQueue = resolve; }); s.queued.push(mutation); }, async confirmSaved() { return true; } }); export const useNotesListSource = () => ({ notes: [window.fixture.note], total: 1, hasMore: false, loadingMore: false, pageError: "", loadMore() {}, loading: false, failure: null, invalid: false, refreshing: false, refresh() {}, offline: window.fixture.offline, lastSyncedAt: "2026-09-15T00:00:00.000Z", syncLabelKey: null }); export const useNoteDetailSource = () => ({ note: window.fixture.note, conflictMutation: window.fixture.conflictMutation, failedMutation: window.fixture.failedMutation ?? null, async retryFailed(id) { window.fixture.settled = [...(window.fixture.settled ?? []), ["retry", id]]; }, async discardFailed(id) { window.fixture.settled = [...(window.fixture.settled ?? []), ["discard", id]]; }, baseRevision: "mirror-revision-two", loading: false, failure: null, missing: !window.fixture.note, refreshing: false, offline: window.fixture.offline, lastSyncedAt: "2026-09-15T00:00:00.000Z", syncLabelKey: null, refresh() {}, async confirmSaved() { return true; }, async resolveConflict(input) { window.fixture.resolutions.push(input); } });`, loader: "js" }));
        plugin.onLoad({ filter: /^icons$/, namespace: "notes-test" }, () => ({ contents: 'export const Ionicons=()=>null;', loader: "js" }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function page(t: { after(fn: () => Promise<void>): void }, mode: "new" | "detail" | "edit" | "list" | "default" | "fallback", language = "zh", restore = ""): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=${mode}&language=${language}&restore=${restore}`);
  return value;
}

async function offlinePage(t: { after(fn: () => Promise<void>): void }, mode: "list" | "detail", native: boolean): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=${mode}&language=zh&offline=1${native ? "&native=1" : ""}`);
  return value;
}

async function nativePage(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=new&language=zh&native=1`);
  return value;
}

async function nativeEditPage(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=edit&language=zh&native=1`);
  return value;
}

test("new note searches only after a word, selects by id, and preserves a failed draft", async (t) => {
  const value = await page(t, "new");
  const editor = value.getByRole("textbox", { name: "笔记内容" });
  assert.equal(await value.getByRole("checkbox").count(), 0);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
  await value.getByRole("button", { name: "添加相关人脉" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests), []);
  await value.getByRole("textbox", { name: "搜索相关人脉" }).fill("佐");
  await value.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.path === "/api/contacts/search"));
  await value.getByRole("checkbox", { name: /佐藤/ }).click();
  await value.getByRole("textbox", { name: "笔记标题" }).fill("多人会议");
  await editor.fill("  多人会议结论\n下周确认  ");
  assert.equal((await value.evaluate(() => (window as any).fixture.requests)).filter((request: any) => request.path === "/api/notes").length, 0);
  await value.evaluate(() => (window as any).fixture.update({ response: "mismatch" }));
  await value.getByRole("button", { name: "保存笔记" }).click();
  await value.getByRole("alert").waitFor();
  assert.equal(await editor.inputValue(), "  多人会议结论\n下周确认  ");
  const first = await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/notes")[0]);
  await value.getByRole("button", { name: "保存笔记" }).click();
  const second = await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/notes")[1]);
  assert.equal(first.body.idempotencyKey, second.body.idempotencyKey);
  assert.deepEqual(first.body.manualContactIds, ["contact:a", "contact:b"]);
});

test("native note pickers use only mirrored contacts and registered events", async (t) => {
  const value = await nativePage(t);
  await value.getByRole("button", { name: "添加相关人脉" }).click();
  await value.getByRole("textbox", { name: "搜索相关人脉" }).fill("镜像");
  await value.getByRole("checkbox", { name: /镜像联系人/ }).waitFor();
  await value.getByRole("button", { name: "添加相关活动" }).click();
  await value.getByRole("checkbox", { name: /镜像活动/ }).waitFor();
  assert.equal(await value.getByRole("checkbox", { name: /在线活动/ }).count(), 0);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/contacts/search" || request.path === "/api/events")), []);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.reads.filter((read: any) => read.path === "/api/events")), []);
});

test("native edit note pickers do not search contacts or events over the network", async (t) => {
  const value = await nativeEditPage(t);
  await value.getByRole("button", { name: "添加相关人脉" }).click();
  await value.getByRole("textbox", { name: "搜索相关人脉" }).fill("镜像");
  await value.getByRole("checkbox", { name: /镜像联系人/ }).waitFor();
  await value.getByRole("button", { name: "添加相关活动" }).click();
  await value.getByRole("checkbox", { name: /镜像活动/ }).waitFor();
  assert.equal(await value.getByRole("checkbox", { name: /在线活动/ }).count(), 0);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/contacts/search" || request.path === "/api/events")), []);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.reads.filter((read: any) => read.path === "/api/events")), []);
});

test("an offline edit without a local note shows the needs-network message", async (t) => {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=edit&language=zh&native=1`);
  await value.evaluate(() => (window as any).fixture.update({ offline: true, note: null }));
  await value.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。", { exact: true }).waitFor();
  assert.equal(await value.getByText("未找到这篇笔记。", { exact: true }).count(), 0);
});

test("conflicted notes show both versions and offer keep, use-server, and save-as-new choices", async (t) => {
  for (const [choice, label] of [["keep-local", "保留本机版本"], ["server", "使用服务器版本"], ["save-as-new", "另存为新笔记"]] as const) {
    const value = await page(t, "detail");
    await value.evaluate(() => {
      const state = (window as any).fixture;
      const server = { ...state.note, body: "服务器版本正文", version: 3 };
      const local = { ...state.note, body: "本机修改正文", version: 2, localMutationState: "conflict" };
      state.update({ note: local, conflictMutation: {
        actorId: "account:one", workspaceId: "workspace-notes", domainId: "notes", mutationId: "mutation:conflict",
        kind: "note", id: "note:one", operation: "update", patch: { body: "本机修改正文" },
        requestJson: JSON.stringify({ title: local.title, body: local.body, manualContactIds: local.manualContactIds, mentions: [], eventIds: [], expectedVersion: 2, idempotencyKey: "mutation:conflict" }),
        baseRevision: "mirror-revision-two", dependsOn: null, createdAt: local.updatedAt, retryCount: 1, nextRetryAt: null,
        lastErrorCode: "CONFLICT", requestAttemptedAt: local.updatedAt, state: "conflict", attemptCount: 1,
        firstAttemptAt: local.updatedAt, serverSnapshot: server,
      } });
    });
    await value.getByText("本机修改正文", { exact: true }).first().waitFor();
    await value.getByText("服务器版本正文", { exact: true }).waitFor();
    await value.getByRole("button", { name: label }).click();
    await value.waitForFunction(() => (window as any).fixture.resolutions.length === 1);
    const resolution = await value.evaluate(() => (window as any).fixture.resolutions[0]);
    assert.equal(resolution.resolution, choice === "server" ? "server" : "replace");
    if (choice === "keep-local") {
      const request = JSON.parse(resolution.replacement.requestJson);
      assert.equal(resolution.replacement.operation, "update");
      assert.equal(request.expectedVersion, 3);
      assert.notEqual(request.idempotencyKey, "mutation:conflict");
    } else if (choice === "save-as-new") {
      const request = JSON.parse(resolution.replacement.requestJson);
      assert.equal(resolution.replacement.operation, "create");
      assert.match(resolution.replacement.id, /^local:[0-9a-f-]{36}$/i);
      assert.equal(request.expectedVersion, undefined);
      assert.equal(request.body, "本机修改正文");
    } else {
      assert.equal(resolution.replacement, undefined);
    }
  }
});

test("a refused note write shows 未能保存 with 重试 and 放弃; discarding a note that exists only on this phone returns to the list (0136)", async (t) => {
  const value = await page(t, "detail");
  await value.evaluate(() => {
    const state = (window as any).fixture;
    const local = { ...state.note, id: "local:00000000-0000-4000-8000-000000000001", localMutationState: "failed" };
    state.update({ note: local, failedMutation: { actorId: "account:one", workspaceId: "workspace-notes", domainId: "notes", mutationId: "mutation:refused", kind: "note", id: local.id,
      operation: "create", patch: { body: local.body }, requestJson: JSON.stringify({ title: local.title, body: local.body, idempotencyKey: "mutation:refused" }), baseRevision: null, dependsOn: null,
      createdAt: local.updatedAt, retryCount: 1, nextRetryAt: null, lastErrorCode: "INVALID_REQUEST", state: "failed", attemptCount: 1, firstAttemptAt: local.updatedAt, serverSnapshot: null } });
  });
  await value.getByText("未能保存", { exact: true }).waitFor();
  await value.getByRole("button", { name: /^重试保存：/u }).click();
  await value.waitForFunction(() => ((window as any).fixture.settled ?? []).length === 1);
  await value.getByRole("button", { name: /^放弃这次修改：/u }).click();
  await value.waitForFunction(() => ((window as any).fixture.settled ?? []).length === 2);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.settled), [["retry", "mutation:refused"], ["discard", "mutation:refused"]]);
  await value.waitForFunction(() => JSON.stringify((window as any).fixture.navigation ?? []).includes("/notes"));
});

test("opening a resolved local note replaces the stale local route with its canonical server id", async (t) => {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=detail&language=zh&noteId=local%3A123e4567-e89b-42d3-a456-426614174000`);
  await value.getByText("原始标题", { exact: true }).waitFor();
  await value.waitForFunction(() => (window as any).fixture.navigation.includes("/notes/note%3Aone"));
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["/notes/note%3Aone"]);
});

test("offline edits opened from a stale local alias enqueue against the canonical note id", async (t) => {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=edit&language=zh&native=1&offline=1&noteId=local%3A123e4567-e89b-42d3-a456-426614174000`);
  await value.getByRole("textbox", { name: "笔记标题" }).fill("规范目标标题");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("规范目标正文");
  await value.getByRole("button", { name: "保存修改" }).click();
  await value.waitForFunction(() => (window as any).fixture.queued.length === 1);
  assert.equal(await value.evaluate(() => (window as any).fixture.queued[0].id), "note:one");
});

test("confirmed create navigates to the server note and cancel never creates an empty record", async (t) => {
  const value = await page(t, "new");
  await value.getByRole("button", { name: "取消新建笔记" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests), []);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["back"]);
  await value.getByRole("textbox", { name: "笔记标题" }).fill("确认标题");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("确认保存");
  await value.getByRole("button", { name: "保存笔记" }).click();
  await value.waitForFunction(() => (window as any).fixture.navigation.length === 2);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["back", "/notes/note%3Acreated"]);
  assert.match((await value.evaluate(() => (window as any).fixture.requests.find((request: any) => request.path === "/api/notes").body.idempotencyKey)), /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("native create with a lost POST response queues through the coordinator into real SQLite", async (t) => {
  const value = await nativePage(t);
  await value.getByRole("textbox", { name: "笔记标题" }).fill("回执未知");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("保留原始请求");
  await value.evaluate(() => (window as any).fixture.update({ response: "network", holdQueue: true }));
  await value.getByRole("button", { name: "保存笔记" }).click();
  await value.waitForFunction(() => (window as any).fixture.queueStarted);
  assert.equal(await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/notes").length), 0, "native first POST must not begin before the frozen outbox request commits");
  await value.evaluate(() => { (window as any).fixture.releaseQueue?.(); });
  await value.waitForFunction(() => (window as any).fixture.queued.length === 1);
  const snapshot = await value.evaluate(() => ({ requests: (window as any).fixture.requests.filter((request: any) => request.path === "/api/notes"), mutation: (window as any).fixture.queued[0] }));
  const requestBody = JSON.parse(snapshot.mutation.requestJson);
  assert.deepEqual(snapshot.requests, [], "native notes use the durable outbox uploader rather than an unrecorded direct POST");
  assert.match(requestBody.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(snapshot.mutation.mutationId, requestBody.idempotencyKey);
  assert.equal(snapshot.mutation.requestJson, JSON.stringify(requestBody));

  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const now = Date.parse("2026-09-29T00:00:00.000Z");
  const workspaceId = "workspace-notes";
  const authorizationEpoch = "notes-epoch-1";
  const baseUrl = "https://notes-host.example";
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) {
      return operation(database, scope ?? { baseUrl, actorId: "account:one" });
    },
  };
  const coordinator = createSyncCoordinator({
    lifecycle,
    now: () => now,
    hashPayload: async json => createHash("sha256").update(json).digest("hex"),
  });
  const syncClient: SyncClient = {
    async getLease() {
      return {
        version: 2, baseUrl, actorId: "account:one", subject: "fixture-user",
        sessionExpiresAt: now + 30 * 86_400_000, offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now,
        grants: [{ workspaceId, domainId: "notes", authorizationEpoch }], databaseKeyRef: "fixture-key-ref",
      };
    },
    async getManifest() {
      return { registryVersion: 1, domains: [{ domainId: "notes", schemaVersion: 1, workspaceId, authorizationEpoch, generation: "notes-gen-1", watermark: "0", history: "complete", membershipCursor: null }] };
    },
    async getDomainPage({ domainId }) {
      return { domainId, schemaVersion: 1, registryVersion: 1, authorizationEpoch, changes: [], nextCursor: "notes-epoch-1:0", highWatermark: "0", hasMore: false, generation: "notes-gen-1", serverTime: new Date(now).toISOString() };
    },
    async getPage() { throw new Error("legacy sync endpoint is not used"); },
  };
  const session = coordinator.openScope({ actorId: "account:one", baseUrl, client: syncClient, scopeKey: "screen-to-sqlite" });
  const request = session.synchronize("note", { reason: "explicit" });
  await request.started;
  assert.equal((await request.promise)?.error, null);
  await session.enqueueOfflineNoteMutation(snapshot.mutation as never);
  const queued = await createLocalSyncRepository({ actorId: "account:one", database }).listQueuedMutations({ workspaceId });
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.mutationId, requestBody.idempotencyKey);
  assert.equal(queued[0]?.requestJson, JSON.stringify(requestBody));
  assert.equal(queued[0]?.attemptCount, 0, "a persisted, not-yet-claimed request stays queued until uploader claim");
  assert.equal(queued[0]?.firstAttemptAt, null);
  const repository = createLocalSyncRepository({ actorId: "account:one", database, baseUrl, registeredDomainIds: ["notes"], activeReadScopes: () => [{ baseUrl, actorId: "account:one", workspaceId, domainId: "notes", authorizationEpoch }] });
  const attemptedAt = new Date(now).toISOString();
  const sending = await repository.beginOutboxMutationAttempt({ mutationId: requestBody.idempotencyKey, attemptedAt });
  assert.equal(sending?.state, "sending");
  assert.equal(sending?.requestJson, JSON.stringify(requestBody));
  assert.equal(sending?.attemptCount, 1, "the durable request is frozen before the uploader's first network attempt");
  session.deactivate();

  const restored = createSyncCoordinator({ lifecycle, now: () => now, hashPayload: async json => createHash("sha256").update(json).digest("hex") })
    .openScope({ actorId: "account:one", baseUrl, client: syncClient, scopeKey: "screen-to-sqlite-cold-start" });
  const reopened = await restored.readOutboxOverlay("note");
  assert.equal(reopened?.queuedMutations.length, 1);
  assert.equal(reopened?.queuedMutations[0]?.mutationId, requestBody.idempotencyKey);
  assert.equal(reopened?.queuedMutations[0]?.requestJson, JSON.stringify(requestBody));
  assert.equal(reopened?.queuedMutations[0]?.state, "queued", "a cold coordinator must recover an interrupted in-flight request");
  assert.equal(reopened?.queuedMutations[0]?.attemptCount, 1);
  assert.equal(reopened?.queuedMutations[0]?.firstAttemptAt, attemptedAt);
  assert.equal(reopened?.queuedMutations[0]?.attemptCount, 1);
  restored.deactivate();
});

test("native note edits enqueue a frozen PATCH instead of writing directly", async (t) => {
  const value = await nativeEditPage(t);
  await value.getByRole("textbox", { name: "笔记标题" }).fill("离线更新标题");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("离线更新正文");
  await value.getByRole("button", { name: "保存修改" }).click();
  await value.waitForFunction(() => (window as any).fixture.queued.length === 1 || (window as any).fixture.requests.some((request: any) => request.method === "PATCH"));

  const state = await value.evaluate(() => ({
    requests: (window as any).fixture.requests.filter((request: any) => request.method === "PATCH"),
    mutation: (window as any).fixture.queued[0],
  }));
  assert.deepEqual(state.requests, []);
  assert.equal(state.mutation.operation, "update");
  assert.equal(state.mutation.id, "note:one");
  assert.equal(state.mutation.baseRevision, "mirror-revision-two");
  const requestBody = JSON.parse(state.mutation.requestJson);
  assert.equal(requestBody.title, "离线更新标题");
  assert.equal(requestBody.body, "离线更新正文");
  assert.equal(requestBody.expectedVersion, 2);
  assert.equal(requestBody.idempotencyKey, state.mutation.mutationId);
  assert.match(requestBody.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("native offline notes can enter create and edit while browser writes stay online-only", async (t) => {
  const nativeList = await offlinePage(t, "list", true);
  const nativeCreate = nativeList.getByRole("button", { name: "新建笔记" });
  assert.equal(await nativeCreate.isEnabled(), true);
  await nativeCreate.click();
  assert.deepEqual(await nativeList.evaluate(() => (window as any).fixture.navigation), ["/notes/new"]);

  const browserList = await offlinePage(t, "list", false);
  const browserCreate = browserList.getByRole("button", { name: /新建笔记/ });
  assert.equal(await browserCreate.isDisabled(), true);
  await browserCreate.click({ force: true });
  assert.deepEqual(await browserList.evaluate(() => (window as any).fixture.navigation), []);

  const nativeDetail = await offlinePage(t, "detail", true);
  const edit = nativeDetail.getByRole("button", { name: "编辑笔记" });
  assert.equal(await edit.isEnabled(), true);
  await edit.click();
  assert.deepEqual(await nativeDetail.evaluate(() => (window as any).fixture.navigation), ["/notes/note%3Aone/edit"]);
  assert.equal(await nativeDetail.getByRole("button", { name: /IORBIT 总结/ }).isDisabled(), true, "AI remains online-only");
});

test("two native edits of one mirrored note keep one SQLite update at the original server version", async (t) => {
  const value = await nativeEditPage(t);
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const baseUrl = "https://notes-host.example";
  const workspaceId = "workspace-notes";
  const repository = createLocalSyncRepository({ actorId: "account:one", database, baseUrl, registeredDomainIds: ["notes"], activeReadScopes: () => [{
    baseUrl, actorId: "account:one", workspaceId, domainId: "notes", authorizationEpoch: "notes-epoch-1",
  }] });
  const persistScreenMutation = async (index: number) => {
    const mutations = await value.evaluate(() => (window as any).fixture.queued);
    const mutation = mutations[index];
    assert.equal(typeof mutation.mutationId, "string", "the rendered edit must enqueue its stable UUID");
    await repository.enqueueOutboxMutation({
      ...mutation, actorId: "account:one", workspaceId,
    });
  };

  await value.getByRole("textbox", { name: "笔记标题" }).fill("第一次本机标题");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("第一次本机正文");
  await value.getByRole("button", { name: "保存修改" }).click();
  await value.waitForFunction(() => (window as any).fixture.queued.length === 1);
  const firstBody = await value.evaluate(() => JSON.parse((window as any).fixture.queued[0].requestJson));
  assert.equal(firstBody.expectedVersion, 2);
  await persistScreenMutation(0);

  await value.evaluate(() => {
    const note = (window as any).fixture.note;
    (window as any).fixture.update({ note: { ...note, title: "第一次本机标题", body: "第一次本机正文", version: 3 } });
  });
  await value.getByRole("textbox", { name: "笔记标题" }).fill("最终本机标题");
  await value.getByRole("textbox", { name: "笔记内容" }).fill("最终本机正文");
  await value.getByRole("button", { name: "保存修改" }).click();
  await value.waitForFunction(() => (window as any).fixture.queued.length === 2);
  const secondBody = await value.evaluate(() => JSON.parse((window as any).fixture.queued[1].requestJson));
  assert.equal(secondBody.expectedVersion, 3, "the screen edits the pending overlay version");
  await persistScreenMutation(1);

  const queued = await repository.listQueuedMutations({ workspaceId, domainId: "notes", kind: "note" });
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.attemptCount, 0);
  assert.equal(queued[0]?.baseRevision, "mirror-revision-two");
  assert.equal(queued[0]?.requestJson && JSON.parse(queued[0].requestJson).expectedVersion, 2);
  assert.equal(queued[0]?.requestJson && JSON.parse(queued[0].requestJson).title, "最终本机标题");
  assert.equal(queued[0]?.requestJson && JSON.parse(queued[0].requestJson).body, "最终本机正文");
});

test("detail is read-only and opens the dedicated edit route", async (t) => {
  const value = await page(t, "detail");
  assert.equal(await value.getByRole("textbox").count(), 0);
  await value.getByRole("button", { name: "打开关联人脉 林悦" }).waitFor();
  await value.getByRole("button", { name: "打开关联人脉 佐藤" }).waitFor();
  await value.getByRole("button", { name: "编辑笔记" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["/notes/note%3Aone/edit"]);
});

test("note task links read one bounded page, replace it on navigation, and reject foreign receipts", async (t) => {
  const value = await page(t, "detail");
  await value.getByRole("button", { name: "打开来源待办 关联事项 0", exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await value.getByRole("button", { name: /^打开来源待办 关联事项 / }).count(), 20);
  await value.getByRole("button", { name: "下一页", exact: true }).click();
  await value.getByRole("button", { name: "打开来源待办 关联事项 20", exact: true }).waitFor();
  assert.equal(await value.getByRole("button", { name: /^打开来源待办 关联事项 / }).count(), 5);
  assert.equal(await value.getByRole("button", { name: "打开来源待办 关联事项 0", exact: true }).count(), 0);
  await value.getByRole("button", { name: "打开来源待办 关联事项 20", exact: true }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3A20"]);
  await value.getByRole("button", { name: "返回第一页", exact: true }).click();
  await value.getByRole("button", { name: "打开来源待办 关联事项 0", exact: true }).waitFor();
  assert.equal(await value.getByRole("button", { name: /^打开来源待办 关联事项 / }).count(), 20);
  const reads = await value.evaluate(() => (window as any).fixture.reads);
  assert.equal(reads.some((r: any) => r.path === "/api/tasks"), false);
  assert.ok(reads.filter((r: any) => r.path.startsWith("/api/tasks/note-page?")).every((r: any) => r.options.cachePolicy === "network-only" && r.path.includes("limit=20")));
  await value.evaluate(() => (window as any).fixture.update({ taskResponse: "foreign" }));
  await value.getByText("未能确认关联待办，请重试。", { exact: true }).waitFor();
  assert.equal(await value.getByRole("button", { name: /^打开来源待办 关联事项 / }).count(), 0);
  await value.evaluate(() => (window as any).fixture.update({ taskResponse: "wrong-note" }));
  await value.getByText("未能确认关联待办，请重试。", { exact: true }).waitFor();
  assert.equal(await value.getByRole("button", { name: /^打开来源待办 关联事项 / }).count(), 0);
});

test("note task request failures are visible and retry restores the list", async (t) => {
  const value = await page(t, "detail");
  await value.evaluate(() => (window as any).fixture.update({ taskResponse: "failure" }));
  await value.getByText("关联待办暂不可用", { exact: true }).waitFor({ timeout: 5000 });
  await value.getByRole("button", { name: "重试", exact: true }).click();
  await value.getByRole("button", { name: "打开来源待办 关联事项 0", exact: true }).waitFor();
});

test("note detail opens an editable IORBIT template without making a write request", async (t) => {
  const value = await page(t, "detail");
  await value.getByRole("button", { name: "IORBIT 总结" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), [{
    pathname: "/ai/[id]",
    params: {
      id: "new",
      initialMessage: "请根据这篇笔记整理一个待办，并明确标题和日期。",
      sourceNoteId: "note:one",
      sourceNoteVersion: "2",
    },
  }]);
});

test("English note create and detail translate controls while preserving note content", async (t) => {
  const create = await page(t, "new", "en");
  await create.getByRole("textbox", { name: "Note title" }).waitFor();
  await create.getByRole("textbox", { name: "Note body" }).waitFor();
  await create.getByRole("button", { name: "Add related people" }).waitFor();
  await create.getByRole("button", { name: "Add related event" }).waitFor();

  const detail = await page(t, "detail", "en");
  await detail.getByRole("button", { name: "Edit note" }).waitFor();
  await detail.getByText("原始标题", { exact: true }).waitFor();
  await detail.getByText("原始笔记", { exact: true }).waitFor();
  assert.equal(await detail.getByText("仅自己可见", { exact: true }).count(), 0);
});

test("an English account can edit a note without fixed Chinese chrome", async (t) => {
  const edit = await page(t, "edit", "en");
  const title = edit.getByRole("textbox", { name: "Note title" });
  await title.waitFor();
  await edit.getByRole("textbox", { name: "Note body" }).waitFor();
  await edit.getByRole("button", { name: "Cancel editing note" }).waitFor();
  assert.equal(await title.inputValue(), "原始标题");
  await edit.getByText("Only visible to you · Version 2", { exact: true }).waitFor();
});

test("top back preserves an unsaved note until the user chooses and detail returns to global history", async (t) => {
  const create = await page(t, "new");
  await create.getByRole("textbox", { name: "笔记内容" }).fill("不可丢弃的草稿");
  await create.getByRole("button", { name: "返回笔记", exact: true }).click();
  assert.deepEqual(await create.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await create.getByRole("textbox", { name: "笔记内容" }).inputValue(), "不可丢弃的草稿");
  const detail = await page(t, "detail");
  await detail.getByRole("button", { name: "返回笔记", exact: true }).click();
  assert.deepEqual(await detail.evaluate(() => (window as any).fixture.navigation), ["/notes"]);
});

test("new-note history navigation and edited-note top back require a draft decision", async (t) => {
  const create = await page(t, "new");
  await create.getByRole("textbox", { name: "笔记内容" }).fill("历史入口草稿");
  assert.equal(await create.getByRole("button", { name: "查看过往笔记", exact: true }).count(), 1);
  await create.getByRole("button", { name: "查看过往笔记", exact: true }).click();
  assert.deepEqual(await create.evaluate(() => (window as any).fixture.navigation), []);
  await create.getByRole("button", { name: "保留并退出" }).click();
  await create.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual(await create.evaluate(() => (window as any).fixture.navigation), ["/notes"]);
  const edit = await page(t, "edit");
  await edit.getByRole("textbox", { name: "笔记内容" }).fill("修改但未保存");
  await edit.getByRole("button", { name: "返回笔记", exact: true }).click();
  assert.deepEqual(await edit.evaluate(() => (window as any).fixture.navigation), []);
});

test("AppScreen without an override preserves back and parent fallback navigation", async (t) => {
  const back = await page(t, "default");
  await back.getByRole("button", { name: "返回", exact: true }).click();
  assert.deepEqual(await back.evaluate(() => (window as any).fixture.navigation), ["back"]);
  const fallback = await page(t, "fallback");
  // R05: a note page opened directly goes back to the Task page's メモ segment.
  await fallback.getByRole("button", { name: "返回笔记", exact: true }).click();
  assert.deepEqual(await fallback.evaluate(() => (window as any).fixture.navigation), ["/task?seg=memo"]);
});

test("continuing after opening history does not redirect a later ordinary cancel", async (t) => {
  const create = await page(t, "new");
  await create.getByRole("textbox", { name: "笔记内容" }).fill("保留草稿");
  await create.getByRole("button", { name: "查看过往笔记", exact: true }).click();
  await create.getByRole("button", { name: "继续编辑" }).click();
  await create.getByRole("button", { name: "取消新建笔记" }).click();
  await create.getByRole("button", { name: "保留并退出" }).click();
  await create.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  assert.deepEqual(await create.evaluate(() => (window as any).fixture.navigation), ["back"]);
});

test("a scheduled autosave cannot write after a confirmed create or explicit discard", async (t) => {
  for (const discard of [false, true]) {
    const create = await page(t, "new");
    await create.getByRole("textbox", { name: "笔记标题" }).fill("马上退出");
    await create.getByRole("textbox", { name: "笔记内容" }).fill("不应复活");
    if (discard) {
      await create.getByRole("button", { name: "查看过往笔记", exact: true }).click();
      await create.getByRole("button", { name: "放弃", exact: true }).click();
    } else await create.getByRole("button", { name: "保存笔记" }).click();
    await create.waitForFunction(() => (window as any).fixture.navigation.length === 1);
    await create.waitForTimeout(650);
    const writes = await create.evaluate(() => (window as any).fixture.drafts);
    assert.equal(writes.at(-1)?.kind, "clear");
  }
});

for (const mode of ["new", "edit"] as const) test(`late restored drafts never overwrite current user edits in ${mode}`, async (t) => {
    const editor = await page(t, mode, "zh", "late");
    await editor.waitForFunction(() => typeof (window as any).fixture.releaseDraft === "function");
    await editor.getByRole("textbox", { name: "笔记标题" }).fill("当前正在编辑");
    await editor.getByRole("textbox", { name: "笔记内容" }).fill("不可被恢复覆盖");
    await editor.evaluate(() => (window as any).fixture.releaseDraft());
    await editor.waitForTimeout(50);
    assert.equal(await editor.getByRole("textbox", { name: "笔记标题" }).inputValue(), "当前正在编辑");
    assert.equal(await editor.getByRole("textbox", { name: "笔记内容" }).inputValue(), "不可被恢复覆盖");
});

test("discarding changed edits clears the draft without a later timer resurrection", async (t) => {
  const edit = await page(t, "edit");
  await edit.getByRole("textbox", { name: "笔记内容" }).fill("丢弃本次修改");
  await edit.getByRole("button", { name: "取消编辑笔记" }).click();
  await edit.getByRole("button", { name: "放弃", exact: true }).click();
  await edit.waitForFunction(() => (window as any).fixture.navigation.length === 1);
  await edit.waitForTimeout(650);
  assert.equal(await edit.evaluate(() => (window as any).fixture.drafts.at(-1)?.kind), "clear");
});

test("clearing a newly typed title still prevents a late draft from restoring it", async (t) => {
  const create = await page(t, "new", "zh", "late");
  await create.waitForFunction(() => typeof (window as any).fixture.releaseDraft === "function");
  const title = create.getByRole("textbox", { name: "笔记标题" });
  await title.fill("用户主动清空");
  await title.fill("");
  await create.evaluate(() => (window as any).fixture.releaseDraft());
  await create.waitForTimeout(50);
  assert.equal(await title.inputValue(), "");
});

test("a slow confirmed edit clear blocks stale autosave but later editing can save a new draft", async (t) => {
  const edit = await page(t, "edit", "zh", "slow-clear");
  await edit.getByRole("textbox", { name: "笔记内容" }).fill("确认本次修改");
  await edit.getByRole("button", { name: "保存修改" }).click();
  await edit.waitForFunction(() => typeof (window as any).fixture.releaseClear === "function");
  await edit.waitForTimeout(650);
  assert.equal(await edit.evaluate(() => (window as any).fixture.drafts.at(-1)?.kind), "clear");
  await edit.evaluate(() => (window as any).fixture.releaseClear());
  await edit.getByText("笔记已更新。", { exact: true }).waitFor();
  await edit.getByRole("textbox", { name: "笔记内容" }).fill("第二次编辑");
  await edit.waitForTimeout(650);
  assert.equal(await edit.evaluate(() => (window as any).fixture.drafts.at(-1)?.body), "第二次编辑");
});
