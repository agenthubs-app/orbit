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
  requests: [], refreshes: 0, failure: false, hold: false, thrown: false, notifications: 0, navigation: [], permissionCalls: 0, holdPermission: false, permission: "denied", reminders: [],
  update(patch) { state.task = { ...state.task, ...patch }; emit(); },
  switchClient() { client = { ...client }; emit(); }
};
export const useLocalSearchParams = () => { rerender(); return { id: state.task.id }; };
export const useRouter = () => ({ replace(path) { state.navigation.push(path); }, push() {} });
export const useApiResource = (path) => {
  rerender();
  return { kind: "success", data: path.endsWith("/activities") ? { activities: [] } : path.startsWith("/api/reminders") ? { reminders: state.reminders } : { task: state.task }, refreshing: false, refresh() { state.refreshes++; emit(); } };
};
async function request(method, path, options) {
    state.requests.push({ method, path, ...options });
    const updated = { ...state.task, ...options.body.patch, updatedAt: "2026-09-07T03:00:00.000Z" };
    if (state.hold) await new Promise(resolve => { state.release = resolve; });
    if (state.thrown) throw Error("unexpected transport failure");
    if (state.failure) return { success: false, error: { message: "连接暂时失败" } };
    return { success: true, data: { task: updated } };
}
let client = {
  patch: (path, options) => request("PATCH", path, options),
  post: (path, options) => request("POST", path, options),
  delete: (path, options) => request("DELETE", path, options)
};
export const useOrbitApiClient = () => client;
export const AppScreen = ({ children }) => <main>{children}</main>;
export const ErrorState = ({ message }) => <div>{message}</div>;
export const LoadingState = () => <div>Loading</div>;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const createThemedStyles = () => () => ({ colors: {}, styles: {} });
export const notifyReminderPlansChanged = () => { state.notifications++; };
export const requestNotificationPermission = async () => {
  state.permissionCalls++;
  if (state.holdPermission) await new Promise(resolve => { state.releasePermission = resolve; });
  return state.permission;
};
export const randomUUID = () => window.crypto.randomUUID();
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { TaskDetailScreen } from "./src/screens/tasks/TaskDetailScreen"; const root = createRoot(document.getElementById("root")); window.unmountScreen = () => root.unmount(); root.render(<TaskDetailScreen />);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{
      name: "task-screen-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons)$|\/(useApiResource|useOrbitApiClient|native-notifications|AppScreen|ErrorState|LoadingState)$|\/design\/theme$/ }, () => ({ path: "fixture", namespace: "task-test" }));
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
  page.setDefaultTimeout(3000);
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

test("failed edits reuse their request key, but a changed draft gets a new key", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.failure = true; });
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  for (const value of ["Retry draft", "Retry draft", "Changed draft"]) {
    await title.fill(value);
    await title.blur();
    await page.getByText("连接暂时失败", { exact: true }).waitFor();
  }
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey);
  assert.notEqual(requests[1].body.idempotencyKey, requests[2].body.idempotencyKey);
});

test("an unexpected mutation rejection unlocks the editor and offers a visible retry", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.thrown = true; });
  await page.getByRole("button", { name: "标记完成", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')?.readOnly, { }, { timeout: 2000 });
  await page.getByText("请重试", { exact: false }).waitFor({ timeout: 2000 });
  await page.evaluate(() => { (window as any).fixture.thrown = false; });
  await page.getByRole("button", { name: "标记完成", exact: true }).click();
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.idempotencyKey, requests[1].body.idempotencyKey);
});

for (const boundary of ["task", "client", "unmount"]) {
  test(`a delayed delete cannot navigate or refresh after changing ${boundary}`, async (t) => {
    const page = await openScreen(t);
    await page.evaluate(() => { (window as any).fixture.hold = true; });
    await page.getByRole("button", { name: "更多待办操作", exact: true }).click();
    await page.getByRole("button", { name: "删除待办", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
    await page.evaluate(boundary => {
      const fixture = (window as any).fixture;
      if (boundary === "task") fixture.update({ id: "task:next", title: "Next task" });
      else if (boundary === "client") fixture.switchClient();
      else (window as any).unmountScreen();
    }, boundary);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.evaluate(() => (window as any).fixture.release());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
    assert.equal(await page.evaluate(() => (window as any).fixture.notifications), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.refreshes), 0);
  });
}

test("reminder permission blocks duplicate taps", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.holdPermission = true; });
  await page.getByRole("button", { name: "更多待办操作", exact: true }).click();
  const option = page.getByText("1 小时后", { exact: true });
  await option.click();
  await option.click();
  assert.equal(await page.evaluate(() => (window as any).fixture.permissionCalls), 1);
});

test("reminder permission completion does not post after leaving the task", async (t) => {
  const page = await openScreen(t);
  await page.evaluate(() => { (window as any).fixture.holdPermission = true; });
  await page.getByRole("button", { name: "更多待办操作", exact: true }).click();
  await page.getByText("1 小时后", { exact: true }).click();
  await page.evaluate(() => (window as any).fixture.update({ id: "task:next", title: "Next task" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await page.evaluate(() => (window as any).fixture.releasePermission());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 0);
});

for (const operation of ["complete", "reopen", "delete", "reminder", "cancel"]) {
  test(`${operation} retries preserve identity and successful completion keeps its side effects`, async (t) => {
    const page = await openScreen(t);
    await page.evaluate(operation => {
      const fixture = (window as any).fixture;
      fixture.failure = true;
      if (operation === "reopen") fixture.update({ status: "completed" });
      if (operation === "cancel") {
        fixture.reminders = [{ id: "reminder:test", accountId: "test", ownerUserId: "test", targetId: "task:edit", targetType: "task", title: "待办提醒", body: "Original title", fireAt: "2026-09-08T00:00:00.000Z", timeZone: "Asia/Tokyo", channels: ["in_app"], status: "scheduled", createdBy: "user", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" }];
        fixture.update({});
      }
    }, operation);
    if (["delete", "reminder", "cancel"].includes(operation)) await page.getByRole("button", { name: "更多待办操作", exact: true }).click();
    const action = operation === "complete" ? page.getByRole("button", { name: "标记完成", exact: true })
      : operation === "reopen" ? page.getByRole("button", { name: "恢复待办", exact: true })
      : operation === "delete" ? page.getByRole("button", { name: "删除待办", exact: true })
      : page.getByText(operation === "reminder" ? "1 小时后" : "取消", { exact: true });
    await action.click();
    await page.getByRole("alert").filter({ hasText: "连接暂时失败" }).waitFor();
    await page.evaluate(() => { (window as any).fixture.failure = false; });
    await action.click();
    await page.waitForFunction(() => (window as any).fixture.notifications === 1);
    const snapshot = await page.evaluate(() => {
      const { requests, refreshes, navigation } = (window as any).fixture;
      return { requests, refreshes, navigation };
    });
    assert.equal(snapshot.requests.length, 2);
    assert.equal(snapshot.requests[0].body.idempotencyKey, snapshot.requests[1].body.idempotencyKey);
    const request = snapshot.requests[1];
    assert.equal(request.method, operation === "delete" ? "DELETE" : operation === "reminder" ? "POST" : "PATCH");
    assert.equal(request.path, operation === "reminder" ? "/api/reminders" : operation === "cancel" ? "/api/reminders/reminder%3Atest" : "/api/tasks/task%3Aedit");
    if (["complete", "reopen", "cancel"].includes(operation)) assert.equal(request.body.action, operation);
    if (operation === "reminder") {
      assert.deepEqual(request.body.channels, ["in_app"]);
      assert.equal(request.body.targetId, "task:edit");
      assert.equal(request.body.deepLink, "/tasks/task%3Aedit");
      assert.equal(request.body.body, "Original title");
    }
    assert.deepEqual(snapshot.navigation, operation === "delete" ? ["/tasks"] : []);
    assert.equal(snapshot.refreshes, operation === "delete" ? 0 : ["reminder", "cancel"].includes(operation) ? 1 : 3);
  });
}
