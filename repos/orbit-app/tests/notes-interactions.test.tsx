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
  id: "note:one", accountId: "account:one", ownerUserId: "account:one", body: "原始笔记",
  contactIds: ["contact:a", "contact:b"], version: 2,
  createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:01:00.000Z"
};
const state = window.fixture = {
  mode: new URLSearchParams(location.search).get("mode") || "new",
  response: "success", requests: [], navigation: [], note: original,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); }
};
const contacts = { contacts: [
  { id: "contact:a", displayName: "林悦", organization: "Orbit" },
  { id: "contact:b", displayName: "佐藤", organization: "Studio" },
  { id: "contact:c", displayName: "陈默", organization: "Lab" }
] };
function result(kind, body) {
  if (state.response === "failure") return { success: false, status: 409, error: { code: "CONFLICT", message: "当前状态已经变化，请刷新后再试。" }, meta: {} };
  if (state.response === "mismatch") return { success: true, status: 200, data: { note: { ...original, body: "其他正文" } }, meta: {} };
  if (kind === "create") return { success: true, status: 201, data: { note: {
    ...original, id: "note:created", body: body.body, contactIds: body.contactIds, version: 1,
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
  async post(path, options) { state.requests.push({ method: "POST", path, body: options.body }); return result("create", options.body); },
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

test("new note does not write before save, cancel is empty, and failed acknowledgement preserves the draft", async (t) => {
  const value = await page(t, "new");
  const editor = value.getByRole("textbox", { name: "笔记内容" });
  assert.equal(await value.getByRole("checkbox", { name: /林悦/ }).count(), 1);
  await editor.fill("  多人会议结论\n下周确认  ");
  await value.getByRole("checkbox", { name: /佐藤/ }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests), []);
  await value.evaluate(() => (window as any).fixture.update({ response: "mismatch" }));
  await value.getByRole("button", { name: "保存笔记" }).click();
  await value.getByRole("alert").waitFor();
  assert.equal(await editor.inputValue(), "  多人会议结论\n下周确认  ");
  const first = await value.evaluate(() => (window as any).fixture.requests[0]);
  await value.getByRole("button", { name: "保存笔记" }).click();
  const second = await value.evaluate(() => (window as any).fixture.requests[1]);
  assert.equal(first.body.idempotencyKey, second.body.idempotencyKey);
  assert.deepEqual(first.body.contactIds, ["contact:a", "contact:b"]);
});

test("confirmed create navigates to the server note and cancel never creates an empty record", async (t) => {
  const value = await page(t, "new");
  await value.getByRole("button", { name: "取消新建笔记" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests), []);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["back"]);
  await value.getByRole("textbox", { name: "笔记内容" }).fill("确认保存");
  await value.getByRole("button", { name: "保存笔记" }).click();
  await value.waitForFunction(() => (window as any).fixture.navigation.length === 2);
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.navigation), ["back", "/notes/note%3Acreated"]);
});

test("detail conflict keeps edits and unlink removes only one relation with expected version", async (t) => {
  const value = await page(t, "detail");
  const editor = value.getByRole("textbox", { name: "笔记内容" });
  await editor.fill("本地未保存版本");
  await value.evaluate(() => (window as any).fixture.update({ response: "failure" }));
  await value.getByRole("button", { name: "保存修改" }).click();
  await value.getByRole("alert").waitFor();
  assert.equal(await editor.inputValue(), "本地未保存版本");
  await value.evaluate(() => (window as any).fixture.update({ response: "success" }));
  await value.getByRole("button", { name: "解除关联 contact:b" }).click();
  const request = await value.evaluate(() => (window as any).fixture.requests.at(-1));
  assert.equal(request.method, "DELETE");
  assert.equal(request.path, "/api/notes/note%3Aone/contacts/contact%3Ab");
  assert.equal(request.body.expectedVersion, 2);
  assert.equal(await editor.inputValue(), "本地未保存版本");
});

test("note detail opens an editable IORBIT template without making a write request", async (t) => {
  const value = await page(t, "detail");
  await value.getByRole("button", { name: "从这篇笔记整理待办" }).click();
  assert.deepEqual(await value.evaluate(() => (window as any).fixture.requests), []);
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
