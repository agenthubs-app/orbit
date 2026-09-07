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

// Only replace device/navigation and I/O boundaries. React, RN Web, the screen,
// its event handlers and the task decoder all execute normally in Chromium.
const fixture = `
import React, { useSyncExternalStore } from "react";
const listeners = new Set();
let revision = 0;
const emit = () => { revision++; listeners.forEach(listener => listener()); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const rerender = () => useSyncExternalStore(subscribe, () => revision);
const state = window.fixture = {
  task: { id: "task:edit", accountId: "test", ownerUserId: "test", title: "Original title", notes: "Original notes", status: "open", category: "work", priority: "normal", source: "manual", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" },
  requests: [], refreshes: 0, failure: false, hold: false,
  update(patch) { state.task = { ...state.task, ...patch }; emit(); }
};
export const useLocalSearchParams = () => { rerender(); return { id: state.task.id }; };
export const useRouter = () => ({ replace() {}, push() {} });
export const useApiResource = (path) => {
  rerender();
  return { kind: "success", data: path.endsWith("/activities") ? { activities: [] } : path.startsWith("/api/reminders") ? { plans: [] } : { task: state.task }, refreshing: false, refresh() { state.refreshes++; emit(); } };
};
const client = {
  async patch(path, options) {
    state.requests.push({ path, ...options });
    const updated = { ...state.task, ...options.body.patch, updatedAt: "2026-09-07T03:00:00.000Z" };
    if (state.hold) await new Promise(resolve => { state.release = resolve; });
    if (state.failure) return { success: false, error: { message: "连接暂时失败" } };
    return { success: true, data: { task: updated } };
  },
  async post() { throw Error("unexpected POST"); },
  async delete() { throw Error("unexpected DELETE"); }
};
export const useOrbitApiClient = () => client;
export const AppScreen = ({ children }) => <main>{children}</main>;
export const ErrorState = ({ message }) => <div>{message}</div>;
export const LoadingState = () => <div>Loading</div>;
export const Ionicons = () => null;
export const createThemedStyles = () => () => ({ colors: {}, styles: {} });
export const notifyReminderPlansChanged = () => {};
export const requestNotificationPermission = async () => "denied";
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { TaskDetailScreen } from "./src/screens/tasks/TaskDetailScreen"; createRoot(document.getElementById("root")).render(<TaskDetailScreen />);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{
      name: "task-screen-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons)$|\/(useApiResource|useOrbitApiClient|native-notifications|AppScreen|ErrorState|LoadingState)$|\/design\/theme$/ }, () => ({ path: "fixture", namespace: "task-test" }));
        plugin.onLoad({ filter: /.*/, namespace: "task-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const bundle = result.outputFiles[0]!.text;
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<div id="root"></div><script>${bundle}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function openScreen(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.value === "Original title");
  return page;
}

test("task refresh preserves a dirty draft and prevents stale writes", async (t) => {
  const page = await openScreen(t);
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  await title.fill("Unsaved draft");
  await page.evaluate(() => (window as any).fixture.update({ title: "Remote title", updatedAt: "2026-09-07T02:00:00.000Z" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await title.inputValue(), "Unsaved draft");
  await page.getByText("草稿已保留", { exact: false }).waitFor({ timeout: 2000 });
  await title.blur();
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
});

test("clearing existing task notes is visibly rejected without a misleading save", async (t) => {
  const page = await openScreen(t);
  const notes = page.getByRole("textbox", { name: "备注", exact: true });
  await notes.fill("");
  await notes.blur();
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
  await page.getByText("暂不支持清空已有备注", { exact: false }).waitFor({ timeout: 2000 });
  assert.equal(await notes.inputValue(), "");
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
});

test("clean refresh adopts the latest task and uses its version for the next save", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => (window as any).fixture.update({ title: "Remote title", updatedAt: "2026-09-07T02:00:00.000Z" }));
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.value === "Remote title");
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  await title.fill("Edited latest");
  await title.blur();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  const request = await page.evaluate(() => (window as any).fixture.requests[0]);
  assert.equal(request.body.expectedUpdatedAt, "2026-09-07T02:00:00.000Z");
  assert.equal(request.body.patch.title, "Edited latest");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await title.inputValue(), "Edited latest", "the old GET snapshot must not overwrite the acknowledged save");
  assert.equal(await page.getByText("草稿已保留", { exact: false }).count(), 0);
});

test("explicitly discarding a stale draft loads the latest content without writing", async (t) => {
  const page = await openScreen(t);
  await page.getByRole("textbox", { name: "待办标题", exact: true }).fill("Unsaved draft");
  await page.evaluate(() => (window as any).fixture.update({ title: "Remote title", notes: "Remote notes", updatedAt: "2026-09-07T02:00:00.000Z" }));
  await page.getByRole("button", { name: "放弃草稿并载入最新内容", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "待办标题", exact: true }).inputValue(), "Remote title");
  assert.equal(await page.getByRole("textbox", { name: "备注", exact: true }).inputValue(), "Remote notes");
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
});

test("pending saves lock the editor and a failed save restores the editable draft", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.hold = true; (window as any).fixture.failure = true; });
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  await title.fill("Retry this draft");
  await title.blur();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  assert.equal(await title.isEditable(), false);
  await page.evaluate(() => (window as any).fixture.release());
  await page.getByText("连接暂时失败", { exact: true }).waitFor();
  assert.equal(await title.isEditable(), true);
  assert.equal(await title.inputValue(), "Retry this draft");
});

test("a delayed save acknowledgement does not hide a newer revision already received", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.hold = true; });
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  await title.fill("Our saved title");
  await title.blur();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.update({ title: "Newer remote title", updatedAt: "2026-09-07T04:00:00.000Z" }));
  await page.getByText("草稿已保留", { exact: false }).waitFor();
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => !document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.readOnly);
  assert.equal(await page.getByText("草稿已保留", { exact: false }).count(), 1);
  await page.getByRole("button", { name: "放弃草稿并载入最新内容", exact: true }).click();
  assert.equal(await title.inputValue(), "Newer remote title");
});

test("a delayed save does not fill the editor of a different task", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.hold = true; });
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  await title.fill("Old task edit");
  await title.blur();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.update({ id: "task:next", title: "Next task", updatedAt: "2026-09-07T04:00:00.000Z" }));
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.value === "Next task");
  await page.evaluate(() => (window as any).fixture.release());
  await page.waitForFunction(() => !document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.readOnly);
  assert.equal(await title.inputValue(), "Next task");
});
