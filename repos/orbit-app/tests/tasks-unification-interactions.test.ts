import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { INBOX_NOTIFICATIONS_PATH } from "../src/api/inbox-notifications";
import { aiConversationPayload, emptyAiConversationPayload, emptyAiSessionListPayload } from "./helpers/ai-fixtures";
import { taskPageFixture } from "./helpers/task-page-fixture";

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
// Sprint 0118: this harness exercises the network path; the device mirror of the inbox and AI sessions is not available here.
export const useLocalInbox = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiSessions = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiConversation = () => ({ available: false, messages: [], cards: null, saveCards() {}, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });

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
// Sprint 0078: the Web task source is mirror-first; these screen fixtures keep the network read authoritative.
export const useWebMirrorStatus = () => ({ mode: "online-only", reason: "no-opfs" });
const noCoordinatorSession = () => null;
export const useSyncedCollection = () => ({ status: "local-ready", records: [], error: null, lastSyncedAt: null, workspaceId: null, refresh: async () => null, invalidate: async () => null, currentSession: noCoordinatorSession });
// Sprint 0131: page copies open the coordinator session; this harness has no device mirror.
export const useSyncCoordinatorSession = () => null;
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
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { withOrbitPrivateRoute } from "./src/components/OrbitRouteAccessBoundary"; import { TasksScreen } from "./src/screens/tasks/TasksScreen"; /* R05: /tasks redirects to the Task page; its To-do slot is this screen. */ const Route = withOrbitPrivateRoute(TasksScreen); import AiRoute from "./app/ai/[id]"; import { useFixture } from "c0022-fixture"; function App() { const state = useFixture(); return state.screen === "ai" ? <AiRoute /> : <Route />; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "unified-tasks-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(c0022-fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useRelationshipInboxBadgeCount|useWebMirrorStatus|useSyncedCollection|useLocalInbox|useLocalAiSessions)$/ }, () => ({ path: "fixture", namespace: "unified-tasks" }));
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
  for (const task of tasks) await repository.save({ version: 1, task: patch.overdueTask && task.id === "task:0" ? { ...task, plannedDate: "2020-01-01" } : task, activities: [] });
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
    else if (url.pathname === "/api/task-suggestions/page") response = Response.json({success:true,data:{actorId:session.actor,scope:"relationship",items:[],total:0,nextCursor:null,hasMore:false,asOf:"2026-09-25T00:00:00Z"}});
    else if (url.pathname === "/api/relationship-tasks/page") {
      const followUps = url.searchParams.get("mode") === "open" && session.actor === "owner" && Array.isArray(patch.followUps) ? patch.followUps as any[] : [];
      const total = typeof patch.followUpTotal === "number" ? patch.followUpTotal : followUps.length;
      response = Response.json({ success: true, data: { actorId: session.actor, mode: url.searchParams.get('mode'), items: followUps, total, hasMore: total > followUps.length, nextCursor: total > followUps.length ? "follow-ups-next" : null, asOf: '2026-09-25T00:00:00.000Z' } });
    }
    else if (url.pathname === "/api/tasks/page") response = Response.json({success:true,data:taskPageFixture(await service.list({actorId:session.actor}),session.actor,url.searchParams)});
    else if (url.pathname === "/api/contacts/labels") response=Response.json({success:true,data:{actorId:session.actor,items:session.actor==="owner"&&url.searchParams.getAll("id").includes("contact:22")?[{id:"contact:22",namePreview:"真实联系人",organizationPreview:"真实机构"}]:[],asOf:"2026-09-25T00:00:00Z"}});
    else if (url.pathname === "/api/tasks") response = await createTaskCollectionHandlers(dependencies).GET(nativeRequest);
    else if (url.pathname.startsWith("/api/tasks/") && method === "PATCH") response = await createTaskDetailHandlers(dependencies).PATCH(nativeRequest, { params: Promise.resolve({ id: decodeURIComponent(url.pathname.slice("/api/tasks/".length)) }) });
    else response = Response.json({ success: true, data: url.pathname === "/api/contacts" ? { contacts: [{ id: "contact:22", name: "真实联系人", organization: "真实机构", role: "负责人" }] } : { scheduleItems: [] } });
    let payload = await response.json();
    if (method !== "GET" && control.wrongReceipt && payload.data?.task) payload.data.task.ownerUserId = "wrong";
    if (method !== "GET" && control.holdWrites) await new Promise<void>(resolve => { control.release = resolve; });
    if (!page.isClosed()) await route.fulfill({ status: response.status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(payload) });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(patch => { (window as any).global = window; (window as any).initialFixture = patch; }, { tasks: [...tasks, tasks[0], { taskId: "candidate:1", title: "未确认候选", category: "relationship" }], ...patch });
  await page.addScriptTag({ content: script });
  return page;
}

test("one list keeps 61 task IDs: 31 open across pages and 30 completed in the fold, without tabs or candidate counts", async t => {
  const page = await open(t);
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).first().waitFor();
  // UX-7: no scope tabs and no open/completed tabs.
  assert.equal(await page.getByRole("tablist").count(), 0);
  assert.equal(await page.getByRole("tab").count(), 0);
  await page.getByRole("heading", { name: "未安排 30", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 30);
  const fold = page.getByRole("button", { name: "展开已完成任务", exact: true });
  assert.equal(await fold.getByText("30", { exact: true }).count(), 1);
  const firstNames=await page.getByRole("checkbox").evaluateAll(elements=>elements.map(e=>e.getAttribute("aria-label")));
  await page.getByRole("button",{name:"下一页待办",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[role="checkbox"]').length===1);
  const secondNames=await page.getByRole("checkbox").evaluateAll(elements=>elements.map(e=>e.getAttribute("aria-label")));
  assert.equal(new Set([...firstNames,...secondNames]).size,31);
  await page.getByRole("button",{name:"返回待办第一页",exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[role="checkbox"]').length===30);
  assert.equal(await page.getByText("未确认候选", { exact: true }).count(), 0);
  await fold.click();
  await page.getByRole("checkbox", {name:"恢复：事项 1",exact:true}).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /^恢复：/ }).count(), 30);
  assert.equal(await page.getByRole("checkbox", { name: /^完成：/ }).count(), 30);
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 22", exact: true }).count(), 1);
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 60", exact: true }).count(), 1);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("an overdue task row colors its group title and date without coloring ordinary rows", async t => {
  const page = await open(t, { overdueTask: true });
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).waitFor();
  await page.getByRole("heading", { name: "已逾期 1", exact: true }).waitFor();
  const warningColor = await page.getByText("已逾期", { exact: true }).evaluate(element => getComputedStyle(element).color);
  const overdueTitleColor = await page.getByText("事项 0", { exact: true }).evaluate(element => getComputedStyle(element).color);
  const ordinaryTitleColor = await page.getByText("事项 2", { exact: true }).evaluate(element => getComputedStyle(element).color);
  const overdueDetail = page.getByText("事项 0", { exact: true }).locator("..").locator(":scope > *").nth(1);
  const ordinaryDetail = page.getByText("事项 2", { exact: true }).locator("..").locator(":scope > *").nth(1);
  assert.match((await overdueDetail.textContent()) ?? "", /1月1日/);
  assert.ok((await ordinaryDetail.textContent())?.trim());
  const overdueDateColor = await overdueDetail.getByText(/1月1日/).evaluate(element => getComputedStyle(element).color);
  const ordinaryDetailColor = await ordinaryDetail.evaluate(element => getComputedStyle(element).color);
  const ordinaryDateColor = await ordinaryDetail.locator(":scope > *").first().evaluate(element => getComputedStyle(element).color);
  assert.equal(overdueDateColor, warningColor);
  // Only the date carries the warning; the title stays ordinary ink like other rows.
  assert.equal(overdueTitleColor, ordinaryTitleColor);
  assert.notEqual(overdueTitleColor, warningColor);
  assert.notEqual(ordinaryDetailColor, warningColor);
  assert.notEqual(ordinaryDateColor, warningColor);
});

test("route scope/view parameters cannot narrow the one list or open completed history", async t => {
  const page = await open(t, { params: { scope: ["personal", "all"], view: ["completed", "open"] } });
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 30);
  // Relationship-category, contact-linked and personal work all stay in the one list.
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 22", exact: true }).count(), 1);
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 60", exact: true }).count(), 1);
  assert.equal(await page.getByRole("checkbox", { name: /^恢复：/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "展开已完成任务", exact: true }).count(), 1);
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("completed section expands below open groups without replacing the open task list", async t => {
  const page = await open(t);
  await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "恢复：事项 1", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/tasks/page" && request.method === "GET").length), 1);
  await page.getByRole("button", { name: "展开已完成任务", exact: true }).click();
  await page.getByRole("checkbox", { name: "恢复：事项 1", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "完成：事项 0", exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.path === "/api/tasks/page" && request.method === "GET").length), 2);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
});

test("a linked contact's name is the row's one detail line and accessible label, read from contact labels only", async t => {
  const page = await open(t);
  const body = page.getByRole("button", { name: "事项 22，未安排日期，真实联系人", exact: true });
  await body.waitFor(); assert.ok((await body.boundingBox())!.height >= 44);
  await page.getByText("未安排日期  ·  真实联系人", { exact: true }).waitFor();
  // The separate contact link row and the category label are gone.
  assert.equal(await page.getByRole("button", { name: /^查看人脉：/ }).count(), 0);
  assert.equal(await page.getByText("真实联系人 · 真实机构", { exact: true }).count(), 0);
  await body.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3A22"]);
  const paths=await page.evaluate(()=>(window as any).fixture.requests.map((r:any)=>r.path));
  assert.ok(paths.includes("/api/contacts/labels"));assert.ok(!paths.includes("/api/contacts"));
});

test("relationship follow-ups sit in the date groups, open their own page from either tap and never complete in place", async t => {
  const day = 24 * 60 * 60 * 1000;
  const followUp = (key: string, title: string, dueAt: string | null) => ({ itemKey: key, taskId: `rt:${key}`, connectionId: `connection:${key}`, contactId: `contact:${key}`, contactNamePreview: `联系人${key}`, titlePreview: title, status: "open", dueAt });
  const page = await open(t, { followUpTotal: 5, followUps: [
    followUp("a", "跟进逾期", new Date(Date.now() - 3 * day).toISOString()),
    followUp("b", "跟进今天", new Date().toISOString()),
    followUp("c", "跟进无日期", null),
  ] });
  await page.getByRole("checkbox", { name: "完成：跟进逾期", exact: true }).waitFor();
  const headings = await page.getByRole("heading").evaluateAll(elements => elements.map(e => e.textContent));
  assert.deepEqual(headings.filter(text => /^(已逾期|今天|之后|未安排)/.test(text ?? "")), ["已逾期1", "今天1", "未安排31+"]);
  for (const [title, connection] of [["跟进逾期", "a"], ["跟进今天", "b"], ["跟进无日期", "c"]]) {
    const checkbox = page.getByRole("checkbox", { name: `完成：${title}`, exact: true });
    const box = (await checkbox.boundingBox())!; assert.ok(box.width >= 40 && box.height >= 52);
    await checkbox.click();
    await page.getByRole("button", { name: new RegExp(`^${title}(，|$)`) }).click();
    const navigation = await page.evaluate(() => (window as any).fixture.navigation.splice(0));
    // QA-C2: the page opens on the tapped follow-up (task + contact), not on whatever the relationship has open.
    const href = `/tasks/relationship/connection%3A${connection}?taskId=rt%3A${connection}&contactId=contact%3A${connection}`;
    assert.deepEqual(navigation, [href, href]);
  }
  assert.ok(await page.getByRole("button", { name: /^跟进逾期，.+，联系人a$/ }).count());
  const warningColor = await page.getByText("已逾期", { exact: true }).evaluate(element => getComputedStyle(element).color);
  const overdueDate = page.getByText("跟进逾期", { exact: true }).locator("..").locator(":scope > *").nth(1).locator(":scope > *").first();
  assert.equal(await overdueDate.evaluate(element => getComputedStyle(element).color), warningColor);
  // The first page holds 3 of 5; the rest stay behind an explicit link to the old list.
  assert.equal(await page.getByRole("heading", { name: "人脉跟进", exact: true }).count(), 0);
  await page.getByRole("button", { name: "还有 2 条跟进", exact: true }).click();
  await page.getByRole("button", { name: "刷新人脉跟进", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "还有 2 条跟进", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests.filter((request: any) => request.method !== "GET")), []);
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

test("completion and reopen change one real route/service record with separate checkbox and detail taps", async t => {
  const page = await open(t);
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 22", exact: true }); await checkbox.waitFor();
  const box = (await checkbox.boundingBox())!; assert.ok(box.width >= 40 && box.height >= 52);
  await page.getByRole("button", { name: /^事项 22，/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/tasks/task%3A22"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH").length), 0);
  const control = backends.get(page)!; control.holdWrites = true;
  // UX T3: the circle fills at once and the write follows about a second later (Reminders); a tap while it is held adds nothing.
  await checkbox.dispatchEvent("click");
  assert.equal(await checkbox.getAttribute("aria-checked"), "true");
  await page.waitForTimeout(1100); await waitForHeld(page);
  await checkbox.dispatchEvent("click");
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH").length), 1);
  control.holdWrites = false; control.release!();
  await checkbox.waitFor({ state: "detached" });
  const fold = page.getByRole("button", { name: "展开已完成任务", exact: true });
  await fold.getByText("31", { exact: true }).waitFor();
  await fold.click();
  await page.getByRole("checkbox", { name: "恢复：事项 22", exact: true }).click();
  await page.getByRole("button", { name: "收起已完成任务", exact: true }).getByText("30", { exact: true }).waitFor();
  await checkbox.waitFor();
  const persisted = await control.repository.get("owner", "task:22");
  assert.equal(persisted.payload.task.status, "open");
  assert.deepEqual(persisted.payload.activities.map((item: any) => item.type), ["completed", "reopened"]);
  assert.equal((await control.service.list({ actorId: "owner" })).length, 61);
});

test("failed completion retains the row and reuses its intent key on explicit retry", async t => {
  const page = await open(t), control = backends.get(page)!; control.failWrites = true;
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 0", exact: true }); await checkbox.waitFor(); await checkbox.click();
  await page.getByRole("alert").filter({ hasText: "操作未完成，请重试。" }).waitFor();
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  control.failWrites = false; await checkbox.click(); await checkbox.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "展开已完成任务", exact: true }).getByText("31", { exact: true }).waitFor();
  const writes = await page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "PATCH"));
  assert.equal(writes.length, 2); assert.equal(writes[0].body.idempotencyKey, writes[1].body.idempotencyKey);
  assert.equal((await control.repository.get("owner", "task:0")).payload.activities.length, 1);
});

test("a mismatched receipt is not accepted, and retry reads the original committed result once", async t => {
  const page = await open(t), control = backends.get(page)!; control.wrongReceipt = true;
  const checkbox = page.getByRole("checkbox", { name: "完成：事项 0", exact: true }); await checkbox.waitFor(); await checkbox.click();
  await page.getByRole("alert").filter({ hasText: "未能确认操作结果" }).waitFor();
  assert.equal(await checkbox.getAttribute("aria-checked"), "false");
  control.wrongReceipt = false; await checkbox.click(); await checkbox.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "展开已完成任务", exact: true }).getByText("31", { exact: true }).waitFor();
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
