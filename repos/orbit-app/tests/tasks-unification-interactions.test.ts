import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { aiConversationPayload, emptyAiConversationPayload, emptyAiSessionListPayload } from "./helpers/ai-fixtures";

const require = createRequire(import.meta.url);
let browser: Browser, script: string;
let createTaskCollectionHandlers: any, createTaskDetailHandlers: any, createTaskRepository: any, createTaskService: any, createMemoryLiveRecordStore: any;
const backends = new WeakMap<Page, { service: any; repository: any; failWrites: boolean; holdWrites: boolean; wrongReceipt: boolean; release?: () => void }>();
const tasks = Array.from({ length: 61 }, (_, index) => ({
  id: `task:${index}`, accountId: "owner", ownerUserId: "owner", title: `事项 ${index}`,
  category: index < 21 ? "relationship" : index < 42 ? "work" : "personal",
  ...(index >= 21 && index < 42 ? { relatedContactId: `contact:${index}` } : {}),
  status: index % 2 === 0 ? "open" : "completed",
  ...(index % 2 ? { completedAt: "2026-09-14T00:00:00Z", completedBy: "owner", completionSource: "user" } : {}), priority: "normal", source: "manual",
  createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
}));
// Actual private route, screen, resource hook, HTTP client and decoders. Only
// native/session integrations, snapshot persistence and transport are fixtures.
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
let revision = 0, nextId = 0; const listeners = new Set();
const state = window.fixture = { actor: "owner", rawUserId: "user:raw-login", signedIn: true, ready: true, baseUrl: "https://orbit.example", params: {}, requests: [], navigation: [], ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { useFixture(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.rawUserId } : null, cookieHeader: "" }; };
export const useOrbitApiBaseUrl = () => { useFixture(); return { ready: true, baseUrl: state.baseUrl }; };
export const useLocalSearchParams = () => { useFixture(); return state.params; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => state.screen === "ai" ? "/ai/" + state.params.id : "/tasks";
export const useIsFocused = () => true;
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); if (state.followNavigation && href.pathname === "/ai/[id]") state.update({ screen: "ai", params: href.params }); }, replace(href) { state.navigation.push(href); }, setParams(patch) { state.update({ params: { ...state.params, ...patch } }); } });
export const useFocusEffect = callback => useEffect(callback, []);
export const Redirect = ({ href }) => <div role="status">Sign in {JSON.stringify(href)}</div>;
export const Stack = () => null;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const useSafeAreaInsets = () => ({ top: 48, bottom: 24, left: 0, right: 0 });
export const SafeAreaView = ({ style, ...props }) => <View {...props} style={style} />;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const useRelationshipInboxBadgeCount = () => 0;
export const randomUUID = () => "unified-task-test-" + ++nextId;
`;

test.before(async () => {
  const web = path.resolve(process.cwd(), "../orbits");
  const load = (file: string) => import(pathToFileURL(path.join(web, file)).href);
  ({ createTaskCollectionHandlers } = await load("app/api/tasks/collection-handler.ts"));
  ({ createTaskDetailHandlers } = await load("app/api/tasks/[id]/handler.ts"));
  ({ createTaskRepository } = await load("features/tasks/repository.ts"));
  ({ createTaskService } = await load("features/tasks/service.ts"));
  ({ createMemoryLiveRecordStore } = await load("shared/storage/live-record-store.ts"));
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/tasks"; import AiRoute from "./app/ai/[id]"; import { useFixture } from "c0022-fixture"; function App() { const state = useFixture(); return state.screen === "ai" ? <AiRoute /> : <Route />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "unified-tasks-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(c0022-fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "unified-tasks" }));
      plugin.onLoad({ filter: /.*/, namespace: "unified-tasks" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: typeof patch.timeZone === "string" ? patch.timeZone : "Asia/Tokyo" }); page.setDefaultTimeout(1800);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { backends.get(page)?.release?.(); await page.unrouteAll({ behavior: "wait" }); await page.close(); assert.deepEqual(errors, []); });
  const repository = createTaskRepository({ store: createMemoryLiveRecordStore(), workspaceId: "test:c0022" });
  const service = createTaskService({ repository });
  for (const task of tasks) await repository.save({ version: 1, task, activities: [] });
  await repository.save({ version: 1, task: { ...tasks[0], id: "task:actor2", title: "其他账号的事项", ownerUserId: "other", accountId: "other" }, activities: [] });
  const control = { repository, service, failWrites: false, holdWrites: false, wrongReceipt: false } as NonNullable<ReturnType<typeof backends.get>>;
  backends.set(page, control);
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,PATCH", "Access-Control-Allow-Headers": "content-type" } }); return; }
    const session = await page.evaluate(() => { const s = (window as any).fixture; return { actor: s.actor, signedIn: s.signedIn, failure: s.failure }; });
    const body = request.postData();
    await page.evaluate(record => (window as any).fixture.requests.push(record), { path: url.pathname, method, body: body ? JSON.parse(body) : null });
    const dependencies = { service, now: () => "2026-09-15T00:00:00Z", resolveActor: async () => session.signedIn ? { id: session.actor } : null };
    const nativeRequest = new Request(url.href, { method, ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}) });
    let response: Response;
    if (session.failure || (method !== "GET" && control.failWrites)) response = Response.json({ success: false, error: { code: "UNAVAILABLE", message: "暂时无法读取" } }, { status: 503 });
    else if (url.pathname === "/api/ai/conversations" && method === "GET") response = Response.json({ success: true, data: emptyAiConversationPayload });
    else if (url.pathname === "/api/ai/conversations" && method === "POST") {
      const input = JSON.parse(body!);
      response = Response.json({ success: true, data: { ...aiConversationPayload, assistantMessage: "待复核的联系草稿", messages: [{ ...aiConversationPayload.messages[0], content: input.message }, { ...aiConversationPayload.messages[1], content: "待复核的联系草稿" }] } });
    }
    else if (url.pathname === "/api/ai/conversations/sessions") response = Response.json({ success: true, data: method === "GET" ? emptyAiSessionListPayload : { session: JSON.parse(body!).session, storage: emptyAiSessionListPayload.storage } });
    else if (url.pathname === "/api/tasks") response = await createTaskCollectionHandlers(dependencies).GET(nativeRequest);
    else if (url.pathname.startsWith("/api/tasks/") && method === "PATCH") response = await createTaskDetailHandlers(dependencies).PATCH(nativeRequest, { params: Promise.resolve({ id: decodeURIComponent(url.pathname.slice("/api/tasks/".length)) }) });
    else response = Response.json({ success: true, data: url.pathname === "/api/contacts" ? { contacts: [{ id: "contact:22", name: "真实联系人", organization: "真实机构", role: "负责人" }] } : { scheduleItems: [] } });
    let payload = await response.json();
    if (method !== "GET" && control.wrongReceipt && payload.data?.task) payload.data.task.ownerUserId = "wrong";
    if (method !== "GET" && control.holdWrites) await new Promise<void>(resolve => { control.release = resolve; });
    if (!page.isClosed()) await route.fulfill({ status: response.status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(payload) });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, { tasks: [...tasks, tasks[0], { taskId: "candidate:1", title: "未确认候选", category: "relationship" }], ...patch });
  await page.addScriptTag({ content: script });
  return page;
}

test("actual list keeps 61 task IDs in four scope/status combinations without candidate counts", async t => {
  const page = await open(t);
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).first().waitFor();
  await page.getByRole("tab", { name: "全部", exact: true }).waitFor();
  await page.getByRole("tab", { name: "未完成 31", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 31);
  assert.equal(await page.getByText("未确认候选", { exact: true }).count(), 0);
  await page.getByRole("tab", { name: "已完成 30", exact: true }).click();
  assert.equal(await page.getByRole("checkbox").count(), 30);
  await page.getByRole("tab", { name: "人脉", exact: true }).click();
  await page.getByRole("tab", { name: "已完成 21", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 21);
  await page.getByRole("tab", { name: "未完成 21", exact: true }).click();
  assert.equal(await page.getByRole("checkbox").count(), 21);
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 22", exact: true }).count(), 1);
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 60", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("route parameters use first values and preserve a distinct contact navigation target", async t => {
  const page = await open(t, { params: { scope: ["relationship", "all"], view: ["completed", "open"] } });
  await page.getByRole("tab", { name: "已完成 21", exact: true }).waitFor();
  await page.getByRole("tab", { name: "未完成 21", exact: true }).click();
  const contact = page.getByRole("button", { name: "查看人脉：真实联系人", exact: true });
  await contact.waitFor(); assert.ok((await contact.boundingBox())!.height >= 44);
  await contact.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A22"]);
});

test("private route blocks signed-out reads rather than displaying a personal task list", async t => {
  const page = await open(t, { signedIn: false });
  await page.getByRole("status").filter({ hasText: "Sign in" }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

async function waitForHeld(page: Page) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (backends.get(page)?.release) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("The real handler did not reach the held response boundary");
}

test("completion and reopen change one real route/service record with separate task and contact taps", async t => {
  const page = await open(t, { params: { scope: "relationship" } });
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 22", exact: true }); await checkbox.waitFor();
  await page.getByRole("button", { name: /^事项 22，/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3A22"]);
  const control = backends.get(page)!; control.holdWrites = true;
  await checkbox.evaluate(element => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await waitForHeld(page);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH").length), 1);
  control.holdWrites = false; control.release!();
  await page.getByRole("tab", { name: "未完成 20", exact: true }).waitFor();
  await page.getByRole("tab", { name: "已完成 22", exact: true }).click();
  await page.getByRole("checkbox", { name: "恢复：事项 22", exact: true }).click();
  await page.getByRole("tab", { name: "已完成 21", exact: true }).waitFor();
  const persisted = await control.repository.get("owner", "task:22");
  assert.equal(persisted.payload.task.status, "open");
  assert.deepEqual(persisted.payload.activities.map((item: any) => item.type), ["completed", "reopened"]);
  assert.equal((await control.service.list({ actorId: "owner" })).length, 61);
});

test("failed completion retains the row and reuses its intent key on explicit retry", async t => {
  const page = await open(t), control = backends.get(page)!; control.failWrites = true;
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 0", exact: true }); await checkbox.waitFor(); await checkbox.click();
  await page.getByRole("alert").filter({ hasText: "暂时无法读取" }).waitFor();
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  control.failWrites = false; await checkbox.click(); await page.getByRole("tab", { name: "未完成 30", exact: true }).waitFor();
  const writes = await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH"));
  assert.equal(writes.length, 2); assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.equal((await control.repository.get("owner", "task:0")).payload.activities.length, 1);
});

test("a mismatched receipt is not accepted, and retry reads the original committed result once", async t => {
  const page = await open(t), control = backends.get(page)!; control.wrongReceipt = true;
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 0", exact: true }); await checkbox.waitFor(); await checkbox.click();
  await page.getByRole("alert").filter({ hasText: "未能确认操作结果" }).waitFor();
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  control.wrongReceipt = false; await checkbox.click(); await page.getByRole("tab", { name: "未完成 30", exact: true }).waitFor();
  const writes = await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH"));
  assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.equal((await control.repository.get("owner", "task:0")).payload.activities.length, 1);
});

test("an old actor's late completion cannot refresh or publish into the new account list", async t => {
  const page = await open(t), control = backends.get(page)!; control.holdWrites = true;
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).click(); await waitForHeld(page);
  await page.evaluate(() => (window as any).fixture.update({ actor: "other" }));
  await page.getByRole("checkbox", { name: "完成：其他账号的事项", exact: true }).waitFor();
  control.holdWrites = false; control.release!();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole("checkbox").count(), 1);
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.equal((await control.repository.get("other", "task:actor2")).payload.task.status, "open");
});

test("relationship tools require an explicit accessible contact and cancellation performs no writes", async t => {
  const page = await open(t, { params: { scope: "relationship" } });
  await page.getByRole("checkbox", { name: "完成：事项 22", exact: true }).waitFor();
  await page.getByRole("heading", { name: "建议与草稿", exact: true }).waitFor();
  await page.getByRole("button", { name: "选择联系人或事项", exact: true }).click();
  await page.getByRole("button", { name: "真实联系人 · 真实机构 · 事项 22", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: / · 事项 24$/ }).count(), 0);
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "真实联系人 · 真实机构 · 事项 22", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("real task handlers deny unauthenticated and foreign-actor writes without touching the record", async () => {
  const repository = createTaskRepository({ store: createMemoryLiveRecordStore(), workspaceId: "test:c0022-auth" });
  const service = createTaskService({ repository });
  await repository.save({ version: 1, task: tasks[0], activities: [] });
  for (const [actor, status] of [[null, 401], [{ id: "other" }, 404]] as const) {
    const dependencies = { service, resolveActor: async () => actor, now: () => "2026-09-15T00:00:00Z" };
    const handlers = createTaskDetailHandlers(dependencies);
    const context = { params: Promise.resolve({ id: tasks[0]!.id }) };
    const read = await handlers.GET(new Request("https://orbit.example/api/tasks/task%3A0"), context);
    assert.equal(read.status, status);
    const write = await handlers.PATCH(new Request("https://orbit.example/api/tasks/task%3A0", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", idempotencyKey: "unauthorized-completion" }),
    }), context);
    assert.equal(write.status, status);
    const stored = await repository.get("owner", tasks[0]!.id);
    assert.equal(stored.payload.task.status, "open");
    assert.deepEqual(stored.payload.activities, []);
  }
});

test("legacy suggestions and reminder queue remain readable without becoming saved tasks", async t => {
  const page = await open(t, { params: { scope: "relationship" } });
  await page.getByRole("checkbox", { name: "完成：事项 22", exact: true }).waitFor();
  // Explicit legacy read-response fixture; canonical mutation tests above keep
  // using the actual collection/detail handlers and storage service.
  const legacy = { taskId: "legacy:1", title: "原有待确认建议", contactName: "未选择的联系人", organization: "旧来源", contactId: "missing-contact", priority: "today", dueInDays: 0, recommendedAction: "先确认合作方向", rationale: "旧记录", triggerKind: "event_encounter", source: { label: "历史来源" }, evidenceIds: [] };
  for (const [endpoint, data] of [["tasks", { tasks: [...tasks, legacy] }], ["notifications", { reminders: [{ reminderId: "legacy-reminder:1", title: "原有提醒候选", contactName: "旧联系人", organization: "旧来源", dueInDays: 0, priority: "high", recommendedWindow: "复核后安排" }], notificationQueue: [] }]] as const) {
    await page.route(`**/api/${endpoint}`, async route => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify({ success: true, data }) });
    });
  }
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://legacy.example" }));
  await page.getByText("联系 未选择的联系人", { exact: true }).waitFor();
  await page.getByText("原有提醒候选", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "未完成 21", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 21);
  assert.equal(await page.getByRole("checkbox", { name: /未选择的联系人/ }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("an unavailable reminder queue is shown as an error instead of an empty count", async t => {
  const page = await open(t, { params: { scope: "relationship" } });
  await page.getByRole("heading", { name: "建议与草稿", exact: true }).waitFor();
  await page.route("**/api/notifications", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 503, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify({ success: false, error: { code: "UNAVAILABLE", message: "提醒暂时无法读取" } }) });
  });
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://unavailable.example" }));
  await page.getByText("提醒暂不可用", { exact: true }).waitFor();
  assert.equal(await page.getByText("暂无待复核提醒。", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "提醒队列 0", exact: true }).count(), 0);
  assert.equal(await page.getByRole("checkbox").count(), 21);
});

test("migrated reminder instants follow the device zone across midnight", async t => {
  const page = await open(t, { params: { scope: "relationship" }, timeZone: "America/New_York" });
  await page.getByRole("heading", { name: "建议与草稿", exact: true }).waitFor();
  await page.route("**/api/notifications", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const data = { reminders: [{ reminderId: "zone-reminder", title: "跨日提醒", dueAt: "2026-09-15T00:30:00Z", organization: "原有机构", priority: "normal" }], notificationQueue: [] };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify({ success: true, data }) });
  });
  await page.evaluate(() => (window as any).fixture.update({ baseUrl: "https://new-york.example" }));
  await page.getByText("跨日提醒", { exact: true }).waitFor();
  await page.getByText(/2026-09-14 20:30/).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("selected task template opens actual IORBIT, waits for edited manual send and retains the contact reference", async t => {
  const page = await open(t, { params: { scope: "relationship" }, followNavigation: true });
  await page.getByRole("heading", { name: "建议与草稿", exact: true }).waitFor();
  const draft = page.getByRole("button", { name: "起草联系消息", exact: true });
  await draft.waitFor(); assert.equal(await draft.isEnabled(), false);
  await page.getByRole("button", { name: "选择联系人或事项", exact: true }).click();
  await page.getByRole("button", { name: "真实联系人 · 真实机构 · 事项 22", exact: true }).click();
  await draft.click();
  const composer = page.getByRole("textbox", { name: "消息", exact: true }); await composer.waitFor();
  assert.match(await composer.inputValue(), /真实联系人.*邮件/s);
  assert.match(await composer.inputValue(), /事项 22/);
  const navigation = await page.evaluate(() => (window as any).fixture.navigation);
  assert.equal(navigation[0].pathname, "/ai/[id]");
  assert.match(navigation[0].params.prefillIntent, /^ai-prefill-/);
  assert.doesNotMatch(JSON.stringify(navigation[0]), /真实联系人|事项 22|contact:22/);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
  await composer.fill("我修改后的联系草稿需求");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByText("待复核的联系草稿", { exact: true }).first().waitFor();
  await page.waitForFunction(() => (window as any).fixture.requests.some((r: any) => r.path === "/api/ai/conversations/sessions" && r.method === "POST"));
  const writes = await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET"));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].path, "/api/ai/conversations");
  assert.equal(writes[0].body.message, "我修改后的联系草稿需求");
  assert.deepEqual(writes[0].body.references, [{ id: "contact:22", type: "contact" }]);
  assert.equal(writes[0].body.origin.entryPointId, "contact.followup_draft");
  assert.deepEqual(writes[0].body.origin.template, { id: "contact.followup_email_draft", version: 1 });
  assert.deepEqual(writes[1].body.session.messages.find((message: any) => message.role === "user").references, [{ id: "contact:22", type: "contact" }]);
});

for (const [button, content] of [["生成候选", /待复核的联系任务候选/], ["生成提醒候选", /待复核的提醒候选/]] as const) {
  test(`${button} enters actual IORBIT as editable text with no automatic send`, async t => {
    const page = await open(t, { params: { scope: "relationship" }, followNavigation: true });
    await page.getByRole("button", { name: button, exact: true }).click();
    const composer = page.getByRole("textbox", { name: "消息", exact: true }); await composer.waitFor();
    assert.match(await composer.inputValue(), content);
    assert.equal(await page.getByRole("button", { name: /^移除联系人：/ }).count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
  });
}

test("existing drafts and calendar remain reachable through navigation without business writes", async t => {
  const page = await open(t, { params: { scope: "relationship" } });
  await page.getByRole("button", { name: "查看已有草稿与候选", exact: true }).click();
  await page.getByRole("button", { name: "回到日程", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/ai?drawer=1", "/schedule"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});
