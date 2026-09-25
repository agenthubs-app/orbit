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
  response: "success", requests: [], reads: [], navigation: [], drafts: [], note: original,
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
  useEffect(() => { state.reads.push({ path, options }); }, [path]);
  if (path.startsWith("/api/tasks/note-page?")) {
    const params = new URLSearchParams(path.split("?")[1]), next = params.has("cursor");
    if (state.taskResponse === "failure") return { kind: "failure", refreshing: false, refresh() { state.update({taskResponse:"success"}); }, error: { message: "关联待办暂不可用" } };
    return { kind: "success", refreshing: false, refresh() { state.update({}); }, data: {
      actorId: state.taskResponse === "foreign" ? "foreign" : "account:one", noteId: state.taskResponse === "wrong-note" ? "note:other" : "note:one", total: 25, hasMore: !next, nextCursor: next ? null : "next", asOf: "2026-09-25T00:00:00Z",
      items: Array.from({length: next ? 5 : 20}, (_, i) => ({id:"task:"+(i+(next?20:0)),titlePreview:"关联事项 "+(i+(next?20:0)),status:"open",sourceNoteVersion:2}))
    } };
  }
  return { kind: "success", data: path === "/api/contacts" ? contacts : { note: state.note }, refreshing: false, refresh() { state.update({}); } };
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
        import { AppScreen } from "./src/components/AppScreen";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const params = new URLSearchParams(location.search); const mode = params.get("mode") || "new"; const language = params.get("language") || "zh";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}>{mode === "new"
          ? <NewNoteScreen actorId="account:one" scopeKey="scope" />
          : mode === "default" || mode === "fallback" ? <AppScreen title="Default screen" />
          : mode === "edit" ? <EditNoteScreen actorId="account:one" noteId="note:one" scopeKey="scope" />
          : <NoteDetailScreen actorId="account:one" noteId="note:one" scopeKey="scope" />}</OrbitLocaleContext.Provider>);`,
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
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|\/(useApiResource|useOrbitApiClient|note-draft-storage)$/ }, () => ({ path: "fixture", namespace: "notes-test" }));
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

async function page(t: { after(fn: () => Promise<void>): void }, mode: "new" | "detail" | "edit" | "default" | "fallback", language = "zh", restore = ""): Promise<Page> {
  const value = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => value.close());
  await value.goto(`${url}?mode=${mode}&language=${language}&restore=${restore}`);
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
  await fallback.getByRole("button", { name: "返回首页", exact: true }).click();
  assert.deepEqual(await fallback.evaluate(() => (window as any).fixture.navigation), ["/home"]);
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
