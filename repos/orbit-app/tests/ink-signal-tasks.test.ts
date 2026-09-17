import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser, script: string;
const task = { id: "task:1", accountId: "test", ownerUserId: "test", title: "给山田发介绍资料", notes: "把 Orbit 的简短介绍和合作方向发给山田。\n先确认对方最关心的点，避免发太长。", status: "open", category: "relationship", priority: "normal", source: "manual", relatedContactId: "contact:1", dueAt: "2026-09-11T18:00:00+09:00", plannedDate: "2026-09-11", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" };
const tasks = [task,
  { ...task, id: "task:2", title: "确认周五活动报名", category: "event", dueAt: undefined },
  { ...task, id: "task:3", title: "整理与陈雨辰的会面记录", category: "meeting", dueAt: undefined },
  { ...task, id: "task:4", title: "联系李美玲约咖啡", dueAt: undefined, plannedDate: "2026-09-12" },
  { ...task, id: "task:5", title: "更新个人简介", category: "personal", dueAt: undefined, plannedDate: "2026-09-14" },
  { ...task, id: "done:1", title: "发送上次活动总结", status: "completed", completedAt: "2026-09-10T09:00:00Z" },
  { ...task, id: "cancel:1", title: "已取消的事项", status: "cancelled" },
];
// Real screens, theme, view models and RNW. Only navigation/device and external
// resource/client boundaries are replaced; this is not an HTTP/native QA claim.
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
export const useFocusEffect = effect => useEffect(effect, []);
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
let revision = 0, nextId = 0; const listeners = new Set();
const state = window.fixture = { width: 390, fontScale: 1, screen: "list", navigation: [], requests: [], reads: [], httpReads: [], refreshes: [], permissionCalls: 0, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useApiResource = path => { useFixture(); if (!state.reads.includes(path)) state.reads.push(path); return { kind: state.kinds?.[path] || "success", data: path === "/api/schedule-items?scope=personal" ? { scheduleItems: [] } : path === "/api/tasks" ? { tasks: state.tasks } : path.startsWith("/api/tasks?") ? { tasks: state.tasks.filter(t => t.status === new URLSearchParams(path.split("?")[1]).get("status")) } : path.endsWith("/activities") ? { activities: [] } : path.startsWith("/api/reminders") ? { reminders: [] } : { task: state.task }, error: { message: "暂时无法读取，请重试。" }, refreshing: false, refresh() { state.refreshes.push(path); } }; };
async function request(method, path, options) { state.requests.push({ method, path, ...options }); if (state.hold) await new Promise(resolve => state.release = resolve); if (state.thrown) throw Error("transport"); if (state.failure) return { success: false, error: { message: "保存失败，请重试。" } }; const record = state.tasks.find(task => path === "/api/tasks/" + encodeURIComponent(task.id)) ?? state.task; return { success: true, status: 200, data: { task: { ...record, ...options.body.patch, status: options.body.action === "complete" ? "completed" : options.body.action === "reopen" ? "open" : record.status, updatedAt: "2026-09-11T05:30:00Z" } } }; }
const client = { async get(path, options) {
  const url = new URL(path, "https://orbit.example");
  if (url.pathname !== "/api/schedule-items" || url.searchParams.get("scope") !== "personal") throw Error("Unsupported task fixture GET");
  const read = { method: "GET", path, headers: options?.headers, hasSignal: options?.signal instanceof AbortSignal, aborted: options?.signal?.aborted ?? false, body: options?.body };
  state.httpReads.push(read);
  options?.signal?.addEventListener("abort", () => { read.aborted = true; }, { once: true });
  const kind = state.kinds?.["/api/schedule-items?scope=personal"] ?? "success";
  if (kind === "loading") return new Promise(resolve => options?.signal?.addEventListener("abort", () => resolve({ success: false, status: 0, error: { code: "ABORTED", message: "Aborted" } }), { once: true }));
  return { success: kind === "success" || kind === "empty", status: kind === "success" || kind === "empty" ? 200 : 503, data: { scheduleItems: [] }, error: { code: "READ_FAILED", message: "暂时无法读取，请重试。" } };
}, patch: (p, o) => request("PATCH", p, o), post: (p, o) => request("POST", p, o), delete: (p, o) => request("DELETE", p, o) };
export const useOrbitApiClient = () => client;
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, accountId: "test", actorId: "test", user: { id: "test" }, cookieHeader: "" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const useLocalSearchParams = () => { useFixture(); return state.screen === "detail" ? { id: state.task.id } : { view: state.view }; };
export const useRouter = () => ({ canGoBack: () => false, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); }, back() { state.navigation.push("back"); } });
export const usePathname = () => { useFixture(); return state.screen === "detail" ? "/tasks/" + state.task.id : "/tasks"; };
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes("top") && { paddingTop: 48 }]} />;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
export const notifyReminderPlansChanged = () => {};
export const requestNotificationPermission = async () => { state.permissionCalls++; return "denied"; };
export const randomUUID = () => "fixture-task-" + ++nextId;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { TasksScreen } from "./src/screens/tasks/TasksScreen"; import { TaskDetailScreen } from "./src/screens/tasks/TaskDetailScreen"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.screen === "detail" ? <TaskDetailScreen /> : <TasksScreen />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "task-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-tasks" }));
    plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
    plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|AuthSessionProvider|ApiBaseUrlProvider|useRelationshipInboxBadgeCount|native-notifications)$/ }, () => ({ path: "fixture", namespace: "ink-tasks" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-tasks" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
const scaled = (style, scale) => { const s = StyleSheet.flatten(style) || {}; return [style, s.fontSize && { fontSize: s.fontSize * scale, ...(s.lineHeight ? { lineHeight: s.lineHeight * scale } : {}) }]; };
export const Text = props => <RealText {...props} style={scaled(props.style, useFixture().fontScale)} />;
export const TextInput = React.forwardRef((props, ref) => <RealInput {...props} ref={ref} style={scaled(props.style, useFixture().fontScale)} />);
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light", timezoneId: String(patch.timezoneId ?? "Asia/Tokyo") });
  page.setDefaultTimeout(1500); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.clock.install({ time: new Date("2026-09-11T05:20:00Z") });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, { tasks, task, ...patch });
  await page.addScriptTag({ content: script }); await page.getByRole("heading", { name: /待办/ }).waitFor(); await page.evaluate(() => document.fonts.ready);
  return page;
}
async function requests(page: Page) { return page.evaluate(() => (window as any).fixture.requests); }
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-tasks-${name}.png`, fullPage: true }); }

test("personal schedule GET is bounded, versioned and abortable without entering task mutation requests", async t => {
  const page = await open(t);
  await page.waitForFunction(() => (window as any).fixture.httpReads.some((read: any) => !read.aborted));
  const reads = await page.evaluate(() => (window as any).fixture.httpReads);
  for (const read of reads) {
    assert.equal(read.method, "GET");
    assert.equal(read.body, undefined);
    assert.equal(read.hasSignal, true);
    assert.equal(read.headers["x-orbit-personal-schedule-version"], "3");
    const query = new URL(read.path, "https://fixture.invalid").searchParams;
    assert.equal(query.get("scope"), "personal");
    assert.equal(Date.parse(query.get("to")!) - Date.parse(query.get("from")!), 90 * 86_400_000);
  }
  assert.equal(reads.some((read: any) => read.aborted), true, "focus refresh aborts the superseded initial GET");
  assert.deepEqual(await requests(page), []);
});

test("task list has truthful counts and due-date groups without completed history in the open view", async t => {
  const page = await open(t);
  const pending = page.getByRole("tab", { name: "未完成 5", exact: true }); await pending.waitFor();
  assert.equal(await pending.getAttribute("aria-selected"), "true");
  assert.equal(await pending.evaluate(el => getComputedStyle(el).borderBottomColor), "rgb(11, 18, 32)");
  for (const label of ["今天 3", "之后 2"]) await page.getByRole("heading", { name: label, exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 5);
  assert.equal(await page.getByRole("heading", { name: "已完成 1", exact: true }).count(), 0);
  assert.equal(await page.getByText("已取消的事项", { exact: true }).count(), 0);
  for (const checkbox of await page.getByRole("checkbox").all()) assert.ok((await checkbox.boundingBox())!.height >= 44);
  await shot(page, "list");
  await page.getByRole("tab", { name: "已完成 1", exact: true }).click();
  assert.equal(await page.getByRole("checkbox").count(), 1);
  assert.equal(await page.getByRole("checkbox").getAttribute("aria-checked"), "true");
  assert.deepEqual(await requests(page), []);
});

test("completed view restores its own selected record", async t => {
  const page = await open(t);
  await page.getByRole("tab", { name: "已完成 1", exact: true }).click();
  await page.getByRole("checkbox", { name: "恢复：发送上次活动总结", exact: true }).click();
  const writes = await requests(page); assert.equal(writes.length, 1); assert.equal(writes[0].body.action, "reopen");
  assert.equal(writes[0].path, "/api/tasks/done%3A1"); assert.ok(writes[0].body.idempotencyKey);
});

test("list completion and detail navigation have separate full-size touch areas", async t => {
  const page = await open(t);
  const checkbox = (await page.getByRole("checkbox", { name: "完成：给山田发介绍资料", exact: true }).boundingBox())!;
  const details = (await page.getByRole("button", { name: /给山田发介绍资料/ }).boundingBox())!;
  assert.ok(checkbox.width >= 44 && details.x >= checkbox.x + checkbox.width, "the row navigation must not cover the checkbox hit area");
});

test("list blocks same-turn double completion and keeps the row after a rejected write", async t => {
  const page = await open(t, { hold: true, failure: true });
  const initialReads = await page.evaluate(() => (window as any).fixture.httpReads);
  const checkbox = page.getByRole("checkbox", { name: "完成：给山田发介绍资料", exact: true });
  await checkbox.evaluate(el => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  assert.equal((await requests(page)).length, 1);
  await page.evaluate(() => (window as any).fixture.release());
  await page.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.refreshes), ["/api/relationship-tasks"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.httpReads), initialReads);
});

test("list transport rejection unlocks actions and visibly preserves the unchanged task", async t => {
  const page = await open(t, { thrown: true });
  const initialReads = await page.evaluate(() => (window as any).fixture.httpReads);
  const checkbox = page.getByRole("checkbox", { name: "完成：给山田发介绍资料", exact: true });
  await checkbox.click();
  await page.getByRole("alert").filter({ hasText: "操作未完成" }).waitFor();
  assert.equal(await checkbox.isEnabled(), true);
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  await page.evaluate(() => (window as any).fixture.update({ thrown: false }));
  await checkbox.click(); assert.equal((await requests(page)).length, 2);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.refreshes), ["/api/relationship-tasks", "/api/tasks"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.httpReads), initialReads);
});

test("list retains overdue and undated work, navigates canonical task IDs and existing creation", async t => {
  const page = await open(t, { tasks: [...tasks, { ...task, id: "overdue", title: "前一天未完成", dueAt: undefined, plannedDate: "2026-09-10" }, { ...task, id: "undated", title: "没有日期", dueAt: undefined, plannedDate: undefined }] });
  await page.getByRole("heading", { name: "已逾期 1", exact: true }).waitFor();
  await page.getByRole("heading", { name: "未安排 1", exact: true }).waitFor();
  await page.getByRole("button", { name: /给山田发介绍资料/ }).click();
  await page.getByRole("button", { name: "添加待办（前往今天）", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3A1", "/today"]);
  assert.deepEqual(await requests(page), []);
});

test("completed deep link and list load failure do not invent zero counts or empty success", async t => {
  const page = await open(t, { view: "completed" });
  assert.equal(await page.getByRole("tab", { name: "已完成 1", exact: true }).getAttribute("aria-selected"), "true");
  await page.evaluate(() => (window as any).fixture.update({ kinds: { "/api/tasks": "failure" } }));
  await page.getByText("待办暂时打不开", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.equal(await page.getByRole("tab", { name: / 0$/ }).count(), 0);
  assert.equal(await page.getByText("暂无完成记录", { exact: true }).count(), 0);
});

test("detail displays real metadata, source hierarchy and a pinned action area", async t => {
  const page = await open(t, { screen: "detail" });
  await page.getByText("手动创建", { exact: true }).waitFor();
  await page.getByText("9月10日 09:00", { exact: true }).waitFor();
  await page.getByText("今天 18:00", { exact: true }).first().waitFor();
  await page.getByRole("heading", { name: "内容", exact: true }).waitFor();
  const title = page.getByRole("textbox", { name: "待办标题", exact: true });
  assert.equal(await title.inputValue(), task.title);
  assert.equal(await title.evaluate(el => getComputedStyle(el).fontSize), "24px");
  assert.equal(await page.getByRole("textbox", { name: "备注", exact: true }).inputValue(), task.notes);
  const footer = page.getByTestId("task-detail-actions"); const before = (await footer.boundingBox())!;
  assert.ok(before.y + before.height <= 844 && before.y > 600);
  await shot(page, "detail");
  await page.getByRole("button", { name: "查看关联人脉", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A1"]);
  await page.getByRole("button", { name: "编辑待办", exact: true }).last().click();
  assert.equal(await title.evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await requests(page), []);
});

test("detail checkbox completes the task and editor keeps failed drafts with existing update protocol", async t => {
  const page = await open(t, { screen: "detail" });
  await page.getByRole("checkbox", { name: "完成：给山田发介绍资料", exact: true }).click();
  let writes = await requests(page); assert.equal(writes[0].body.action, "complete");
  await page.evaluate(() => (window as any).fixture.update({ failure: true }));
  const title = page.getByRole("textbox", { name: "待办标题", exact: true }); await title.fill("修改后仍保留的标题"); await title.blur();
  await page.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
  assert.equal(await title.inputValue(), "修改后仍保留的标题");
  writes = await requests(page); assert.equal(writes[1].body.action, "update");
  assert.equal(writes[1].body.expectedUpdatedAt, task.updatedAt);
  assert.equal(writes[1].body.patch.title, "修改后仍保留的标题");
});

test("double text keeps header edit and metadata labels on readable single lines", async t => {
  const page = await open(t, { screen: "detail", width: 320, fontScale: 2 });
  assert.ok((await page.getByRole("button", { name: "编辑待办", exact: true }).first().boundingBox())!.height <= 44.1, "header edit should be a compact icon at large sizes");
  assert.ok((await page.getByText("创建于", { exact: true }).boundingBox())!.height <= 40.1, "metadata labels should not strand a character");
  assert.ok((await page.getByText("相关人脉", { exact: true }).boundingBox())!.height <= 40.1);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, dark: true }]) {
  test(`${variant.name}: task views preserve long text, touch areas and contained actions`, async t => {
    const page = await open(t, variant);
    for (const row of await page.getByRole("checkbox").all()) { const b = (await row.boundingBox())!; assert.ok(b.width >= 44 && b.height >= 44); }
    assert.deepEqual(await page.locator('[dir="auto"]').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.textContent)), []);
    await shot(page, `${variant.name}-list`);
    await page.evaluate(() => (window as any).fixture.update({ screen: "detail" }));
    await page.getByTestId("task-detail-actions").waitFor();
    const complete = (await page.getByRole("button", { name: "标记完成", exact: true }).boundingBox())!;
    assert.ok(complete.height >= 50 && complete.x >= 0 && complete.x + complete.width <= variant.width && complete.y + complete.height <= 844);
    assert.equal(complete.x, (await page.getByText("截止", { exact: true }).boundingBox())!.x, "pinned actions align with the readable content column");
    await shot(page, `${variant.name}-detail-top`);
    for (const label of ["待办标题", "备注"]) {
      const input = page.getByRole("textbox", { name: label, exact: true }); await input.scrollIntoViewIfNeeded();
      assert.ok(await input.evaluate(el => el.scrollHeight <= el.clientHeight + 2), label + " must show all lines");
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot(page, `${variant.name}-detail`);
    assert.deepEqual(await requests(page), []);
  });
}
