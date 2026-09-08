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
const literal = "strategic_fit / CRM mock 案例\n刚刚聊到日本市场。";

// Production screen, notes component, API client, view-model and theme run unchanged.
// Replace only native/navigation/resource boundaries and the client's HTTP transport.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
import { createOrbitApiClient } from "./src/api/client";
const listeners = new Set(); let revision = 0;
const rerender = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
const note = { noteId: "note:1", body: ${JSON.stringify(literal)}, createdAt: "2026-09-08T01:00:00.000Z", privacy: "private", authorLabel: "我" };
const state = window.fixture = {
  requests: [], refreshes: [], reads: [], actorId: "actor:one", contactId: "contact:notes", kind: "success", clientKey: 0,
  data: { contact: { id: "contact:notes", displayName: "林先生", notes: [note,
    { ...note, noteId: "note:2", body: "第二条备注", createdAt: "2026-09-08T02:00:00.000Z" },
    { ...note, noteId: "note:3", body: "第三条备注", createdAt: "2026-09-08T03:00:00.000Z" },
    { ...note, noteId: "note:shared", body: "双方确认的纪要", privacy: "relationship_shared" }] } },
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(listener => listener()); },
  reply(data, status = 200) { state.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })); },
  saved(body) { return { success: true, data: { contact: { ...state.data.contact, notes: [...state.data.contact.notes, { ...note, noteId: "note:saved", body, createdAt: "2026-09-08T04:00:00.000Z" }] } } }; }
};
const transport = async (path, init) => {
  state.requests.push({ method: init.method, path: new URL(path).pathname, body: JSON.parse(init.body) });
  return new Promise(resolve => { state.resolve = resolve; });
};
const clients = [0, 1].map(() => createOrbitApiClient({ baseUrl: "http://fixture", fetchImpl: transport }));
export const useOrbitApiClient = () => { rerender(); return clients[state.clientKey]; };
export const useOrbitAuthSession = () => { rerender(); return { ready: true, signedIn: true, cookieHeader: "", user: { id: state.actorId } }; };
export const useLocalSearchParams = () => { rerender(); return { id: state.contactId }; };
export const usePathname = () => "/contacts/" + state.contactId;
export const useRouter = () => ({ canGoBack: () => true, back() {}, replace() {}, push() {} });
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture" });
export const useApiResource = path => {
  rerender();
  if (state.kind !== "success") return { kind: state.kind, error: { message: "连接暂时失败" }, refreshing: false, refresh() {} };
  return { kind: "success", data: path.startsWith("/api/contacts/") ? state.data : {}, refreshing: false, refresh() { state.refreshes.push(path); state.update({}); } };
};
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { ContactDetailScreen } from "./src/screens/contacts/ContactDetailScreen"; import { ContactNotesSection } from "./src/screens/contacts/ContactNotesSection"; window.notesComponent = ContactNotesSection; createRoot(document.getElementById("root")).render(<ContactDetailScreen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "notes-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "notes-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "notes-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function openNotes(t: { after: (fn: () => Promise<void>) => void }, width = 390): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(3000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  try {
    await page.getByRole("button", { name: "联系人备注", exact: true }).click();
  } catch (error) {
    throw new Error(`Notes screen did not open: ${errors.join("; ")}\n${await page.locator("body").innerText()}`, { cause: error });
  }
  return page;
}

test("screen gives private notes their own section, preserves all literal text and a collapsed draft", { timeout: 15000 }, async t => {
  const page = await openNotes(t, 320);
  await page.getByText(literal, { exact: true }).waitFor();
  assert.equal(await page.getByText("第二条备注", { exact: true }).count(), 1);
  assert.equal(await page.getByText("第三条备注", { exact: true }).count(), 1);
  assert.equal(await page.getByText(literal, { exact: true }).count(), 1);
  const field = page.getByRole("textbox", { name: "添加联系人备注", exact: true });
  await field.fill("先写着，不保存");
  const toggle = page.getByRole("button", { name: "联系人备注", exact: true });
  await toggle.click(); await toggle.click();
  assert.equal(await field.inputValue(), "先写着，不保存");
  for (const target of [field, toggle, page.getByRole("button", { name: "保存备注", exact: true })]) {
    const box = (await target.boundingBox())!;
    assert.ok(box.height >= 44);
    assert.ok(box.x >= 0 && box.x + box.width <= 320);
  }
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  if (process.env.ORBIT_NOTES_QA_SCREENSHOT_DIR) {
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.ORBIT_NOTES_QA_SCREENSHOT_DIR}/app-notes-light.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => {
      const input = document.querySelector('textarea[aria-label="添加联系人备注"]');
      return input && getComputedStyle(input).backgroundColor === "rgb(34, 38, 46)";
    }, undefined, { timeout: 3000, polling: 50 });
    await page.screenshot({ path: `${process.env.ORBIT_NOTES_QA_SCREENSHOT_DIR}/app-notes-dark.png`, fullPage: true });
  }
});

test("empty and duplicate submits do not write; failed or mismatched acknowledgements keep the draft", async t => {
  const page = await openNotes(t);
  const field = page.getByRole("textbox", { name: "添加联系人备注", exact: true });
  const save = page.getByRole("button", { name: "保存备注", exact: true });
  assert.equal(await save.isDisabled(), true);
  await field.fill("  " ); assert.equal(await save.isDisabled(), true);
  await field.fill(`  ${literal}\n`);
  const failures = ["http", "shape", "contact", "body", "privacy", "author", "date"];
  for (let i = 0; i < failures.length; i++) {
    await save.click();
    await page.getByRole("button", { name: "保存中", exact: true }).evaluate(element => { (element as HTMLElement).click(); });
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), i + 1);
    await page.evaluate(([reason, body]) => {
      const state = (window as any).fixture;
      const result = state.saved(body);
      const note = result.data.contact.notes.at(-1);
      if (reason === "http") return state.reply({ success: false, error: { code: "INTERNAL_ERROR", message: "失败" } }, 500);
      if (reason === "shape") result.data = {};
      if (reason === "contact") result.data.contact.id = "another-contact";
      if (reason === "body") note.body = "another-body";
      if (reason === "privacy") note.privacy = "relationship_shared";
      if (reason === "author") note.authorLabel = "Someone else";
      if (reason === "date") note.createdAt = "";
      // Exclude the existing identical body, so only this returned note could acknowledge the draft.
      if (result.data.contact) result.data.contact.notes = [note];
      state.reply(result);
    }, [failures[i], literal]);
    await page.getByRole("alert").waitFor();
    assert.equal(await field.inputValue(), `  ${literal}\n`);
  }
  await save.click();
  await page.evaluate(body => { const state = (window as any).fixture; state.reply(state.saved(body)); }, literal);
  await page.getByText("备注已保存。", { exact: true }).waitFor();
  assert.equal(await field.inputValue(), "");
});

test("confirmed save clears the form and survives stale refresh without another mutation", async t => {
  const page = await openNotes(t);
  const field = page.getByRole("textbox", { name: "添加联系人备注", exact: true });
  await field.fill("  新增联系人备注\n第二行  ");
  await page.getByRole("button", { name: "保存备注", exact: true }).click();
  await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.saved("新增联系人备注\n第二行")); });
  await page.getByText("备注已保存。", { exact: true }).waitFor();
  assert.equal(await field.inputValue(), "");
  assert.equal(await page.getByText("新增联系人备注\n第二行", { exact: true }).count(), 1);
  const result = await page.evaluate(() => ({ requests: (window as any).fixture.requests, refreshes: (window as any).fixture.refreshes }));
  assert.deepEqual(result.requests, [{ method: "PATCH", path: "/api/contacts/contact%3Anotes", body: { note: { authorLabel: "我", body: "新增联系人备注\n第二行" } } }]);
  assert.deepEqual(result.refreshes, ["/api/contacts/contact%3Anotes"]);
});

test("old contact or account responses cannot clear another draft or refresh another account", async t => {
  for (const switchKind of ["contact", "account", "same-client-account", "unmount"]) {
    const page = await openNotes(t);
    const field = page.getByRole("textbox", { name: "添加联系人备注", exact: true });
    await field.fill("旧联系人未确认备注");
    await page.getByRole("button", { name: "保存备注", exact: true }).click();
    await page.evaluate(kind => {
      const state = (window as any).fixture;
      state.oldResult = state.saved("旧联系人未确认备注");
      if (kind === "contact") state.update({ contactId: "contact:other", data: { contact: { id: "contact:other", displayName: "另一位联系人", notes: [] } } });
      if (kind === "account") state.update({ clientKey: 1, data: { contact: { id: state.contactId, displayName: "新账号联系人", notes: [] } } });
      if (kind === "same-client-account") state.update({ actorId: "actor:two", data: { contact: { id: state.contactId, displayName: "新账号联系人", notes: [] } } });
      if (kind === "unmount") state.update({ kind: "offline" });
    }, switchKind);
    if (switchKind !== "unmount") {
      if (!await field.isVisible()) await page.getByRole("button", { name: "联系人备注", exact: true }).click();
      assert.equal(await field.inputValue(), "");
      await field.fill("新输入不能被旧回执清空");
    }
    await page.evaluate(() => { const state = (window as any).fixture; state.reply(state.oldResult); });
    // Let the actual API client's promise and React updates settle, without arbitrary sleeps.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (switchKind !== "unmount") assert.equal(await field.inputValue(), "新输入不能被旧回执清空");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.refreshes), []);
  }
});
