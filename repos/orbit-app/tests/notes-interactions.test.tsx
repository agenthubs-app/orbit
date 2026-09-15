import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

const fixture = `
import React, { useSyncExternalStore } from "react";
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
  response: "success", requests: [], navigation: [], note: original,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
const contacts = { total: 3, contacts: [
  { id: "contact:a", displayName: "林悦", organization: "Orbit" },
  { id: "contact:b", displayName: "佐藤", organization: "Studio" },
  { id: "contact:c", displayName: "陈默", organization: "Lab" }
] };
function result(kind, body) {
  if (state.response === "failure") return { success: false, status: 409, error: { code: "CONFLICT", message: "当前状态已经变化，请刷新后再试。" }, meta: {} };
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
    ...state.note, body: body.body, contactIds: body.contactIds, version: state.note.version + 1,
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
export const useApiResource = path => {
  rerender();
  return { kind: "success", data: path === "/api/contacts" ? contacts : { note: state.note }, refreshing: false, refresh() { state.update({}); } };
};
export const useLocalSearchParams = () => state.mode === "new" ? { contactId: "contact:a" } : { id: "note:one" };
export const usePathname = () => state.mode === "new" ? "/notes/new" : "/notes/note:one";
export const useRouter = () => ({
  canGoBack: () => true,
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
        const mode = new URLSearchParams(location.search).get("mode") || "new";
        createRoot(document.getElementById("root")).render(mode === "new"
          ? <NewNoteScreen actorId="account:one" scopeKey="scope" />
          : <NoteDetailScreen actorId="account:one" noteId="note:one" scopeKey="scope" />);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "note-screen-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "notes-test" }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: "icons", namespace: "notes-test" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "notes-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
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

async function page(t: { after(fn: () => Promise<void>): void }, mode: "new" | "detail"): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=${mode}`);
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
});

test("detail is read-only and opens the dedicated edit route", async (t) => {
  const value = await page(t, "detail");
  assert.equal(await value.getByRole("textbox").count(), 0);
  await value.getByRole("button", { name: "打开关联人脉 林悦" }).waitFor();
  await value.getByRole("button", { name: "打开关联人脉 佐藤" }).waitFor();
  await value.getByRole("button", { name: "编辑笔记" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["/notes/note%3Aone/edit"]);
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
