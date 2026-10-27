import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, script: string, handlersFactory: any, repositoryFactory: any, serviceFactory: any, lifecycleErrorResponse: any, LifecycleError: any;
const fixture = `
import React, { useSyncExternalStore } from 'react';
import { createTranslator } from './src/i18n/messages';
let revision = 0, next = 0; const listeners = new Set();
const state = window.fixture = { actor: 'owner', signedIn: true, language: window.__language || 'zh', routeTaskId: window.__targetTaskId, routeContactId: window.__targetContactId, requests: [], update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { useFixture(); return { ready: true, signedIn: state.signedIn, actorId: state.actor, cookieHeader: '' }; };
// Sprint 0131: the screen reads the device mirror / page copies; this harness tests the network path (no mirror).
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, workspaceId: null, records: [], refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const useSyncCoordinatorSession = () => null;
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });
export const useLocalSearchParams = () => { const state = useFixture(); return { id: 'connection:1', taskId: state.routeTaskId, contactId: state.routeContactId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => '/tasks/relationship/connection%3A1';
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
export const Redirect = () => <div>Sign in</div>;
export const useOrbitTimeZone = () => ({ timeZone: 'Asia/Shanghai', canSave: true });
export const useOrbitLocale = () => { const state = useFixture(); return { language: state.language, t: createTranslator(state.language) }; };
export const randomUUID = () => 'intent-' + ++next;
export const AppScreen = ({ children, title }) => <main><h1>{title}</h1>{children}</main>;
`;
test.before(async () => {
  const web = path.resolve(process.cwd(), "../orbits");
  const load = (file: string) => import(pathToFileURL(path.join(web, file)).href);
  ({ createRelationshipLifecycleHandlers: handlersFactory, lifecycleErrorResponse } = await load("app/api/connections/[id]/lifecycle/handler.ts"));
  ({ RelationshipLifecycleError: LifecycleError } = await load("features/connections/lifecycle/contract.ts"));
  ({ createMemoryRelationshipLifecycleRepository: repositoryFactory } = await load("features/connections/lifecycle/memory-repository.ts"));
  ({ createRelationshipLifecycleService: serviceFactory } = await load("features/connections/lifecycle/service.ts"));
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { RelationshipLifecycleScreen } from "./src/screens/tasks/RelationshipLifecycleScreen"; createRoot(document.getElementById("root")).render(<RelationshipLifecycleScreen />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "lifecycle-native-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
    plugin.onResolve({ filter: /^(expo-router|expo-crypto)$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider|OrbitLocaleContext|AppScreen|useSyncedCollection)$/ }, () => ({ path: "fixture", namespace: "lifecycle" }));
    plugin.onLoad({ filter: /.*/, namespace: "lifecycle" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

test("App real editor preserves retry intent, persists outcome via HTTP, refreshes history and isolates account switch", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  const now = "2026-09-16T00:00:00.000Z";
  const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: now, updatedAt: now };
  const repository = repositoryFactory({ contacts: [{ actorId: "owner", contactId: "contact:1" }], connections: [{ ...identity, stage: "needs_follow_up", activeGoal: null }], tasks: [{ ...identity, taskId: "task:1", title: "待确认合作", dueAt: now, status: "open", purpose: "follow_up" }] });
  const service = serviceFactory(repository, () => now);
  let loseFirstReceipt = true;
  const bodies: any[] = [];
  await page.route("https://orbit.example/**", async route => {
    const req = route.request();
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "content-type" };
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const actorId = await page.evaluate(() => (window as any).fixture.actor);
    const handlers = handlersFactory({ repository, service, resolveActor: async () => ({ id: actorId }) });
    const context = { params: Promise.resolve({ id: "connection:1" }) };
    const request = new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()!, headers: { "content-type": "application/json" } } : {}) });
    const response = req.method() === "POST" ? await handlers.POST(request, context) : await handlers.GET(request, context);
    if (req.method() === "POST") { bodies.push(JSON.parse(req.postData()!)); if (loseFirstReceipt) { loseFirstReceipt = false; await route.fulfill({ status: 503, headers, json: { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "回执丢失，请重试" } } }); return; } }
    await route.fulfill({ status: response.status, headers, contentType: "application/json", body: await response.text() });
  });
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script });
  await page.getByText("待确认合作", { exact: true }).first().waitFor();
  await page.getByRole("radio", { name: /正在合作/ }).click();
  await page.getByRole("textbox", { name: "在做的事" }).fill("验证同一云端关系");
  await page.getByRole("button", { name: "标记为完成" }).click();
  await page.getByText("回执丢失，请重试").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "在做的事" }).inputValue(), "验证同一云端关系");
  await page.getByRole("button", { name: "标记为完成" }).click();
  await page.getByText("已完成，下一步已保存。").waitFor();
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(repository.audits("owner").length, 1);
  // QA-C2: the saved answer is shown at once — no open follow-up, the closed one under 之前的跟进.
  await page.getByText("没有待处理的跟进").waitFor();
  await page.getByText("之前的跟进").waitFor();
  await page.getByText("待确认合作", { exact: true }).first().waitFor();
  await page.evaluate(() => (window as any).fixture.update({ actor: "other" }));
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByText(/待确认合作/).count(), 0);
});

test("task-addressed relationship detail cannot silently select another open task", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  const now = "2026-09-16T00:00:00.000Z";
  const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: now, updatedAt: now };
  const snapshot = { connection: { ...identity, stage: "needs_follow_up", activeGoal: null }, tasks: [
    { ...identity, taskId: "task:1", title: "一つ目", dueAt: now, status: "open", purpose: "follow_up" },
    { ...identity, taskId: "task:2", title: "二つ目", dueAt: now, status: "open", purpose: "follow_up" },
  ] };
  await page.route("https://orbit.example/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ status: 200, headers, contentType: "application/json", json: { success: true, data: { snapshot } } });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__targetTaskId = "task:2"; (window as any).__targetContactId = "contact:1"; });
  await page.addScriptTag({ content: script });
  await page.getByText("二つ目", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("一つ目", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ routeContactId: "another-contact" }));
  await page.getByText("当前跟进已不可用，请返回任务列表刷新。").waitFor();
  assert.equal(await page.getByText("二つ目", { exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ routeContactId: "contact:1" }));
  await page.getByText("二つ目", { exact: true }).first().waitFor();
  await page.evaluate(() => (window as any).fixture.update({ routeTaskId: "missing" }));
  await page.getByText("当前跟进已不可用，请返回任务列表刷新。").waitFor();
  assert.equal(await page.getByText("二つ目", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "标记为完成" }).count(), 0);
});

test("Japanese lifecycle mismatch shows a Japanese error instead of a Chinese fallback", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  await page.route("https://orbit.example/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ status: 200, headers, contentType: "application/json", json: { success: true, data: {} } });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__language = "ja"; });
  await page.addScriptTag({ content: script });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").textContent(), "返された関係を確認できません。もう一度お試しください。");
});

test("Japanese lifecycle read localizes a Chinese server conflict", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  await page.route("https://orbit.example/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ status: 409, headers, contentType: "application/json", json: { success: false, error: { code: "CONFLICT", message: "关系已变更，请刷新后核对。" } } });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__language = "ja"; });
  await page.addScriptTag({ content: script });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").textContent(), "関係が更新されています。更新して確認してください。");
});

test("Japanese lifecycle rejects an unverified save receipt without Chinese copy", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  const now = "2026-09-16T00:00:00.000Z";
  const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: now, updatedAt: now };
  const snapshot = { connection: { ...identity, stage: "needs_follow_up", activeGoal: null }, tasks: [
    { ...identity, taskId: "task:1", title: "次の連絡", dueAt: now, status: "open", purpose: "follow_up" },
  ] };
  let postCount = 0;
  await page.route("https://orbit.example/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (route.request().method() === "GET") { await route.fulfill({ status: 200, headers, contentType: "application/json", json: { success: true, data: { snapshot } } }); return; }
    postCount++;
    await route.fulfill({ status: postCount === 1 ? 200 : 409, headers, contentType: "application/json", json: postCount === 1 ? { success: true, data: {} } : { success: false, error: { code: "CONFLICT", message: "关系已变更，请刷新后核对。" } } });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__language = "ja"; });
  await page.addScriptTag({ content: script });
  await page.getByText("次の連絡", { exact: true }).first().waitFor();
  await page.getByRole("radio", { name: /いま一緒に進めている/ }).click();
  await page.getByRole("textbox", { name: "進めていること" }).fill("次の面談を決める");
  await page.getByRole("button", { name: "完了にする" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").textContent(), "保存結果を確認できません。入力は残っています。更新して確認してください。");
  await page.getByRole("button", { name: "完了にする" }).click();
  await page.getByText(/関係が更新されています|关系已变更/).waitFor();
  assert.equal(await page.getByRole("alert").textContent(), "関係が更新されています。入力は残っています。更新して確認してください。");
  assert.equal(await page.getByRole("textbox", { name: "進めていること" }).inputValue(), "次の面談を決める");
});

// QA-C2: the Reminders-style page — 保持联系 (a new date, prefilled a week out) and 不再跟进 (after a confirm) both
// persist through the real lifecycle handler and show the saved answer.
async function openWithRepository(t: any, stage: string, tasks: { taskId: string; title: string }[]) {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  const now = "2026-09-16T00:00:00.000Z";
  const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: now, updatedAt: now };
  const repository = repositoryFactory({ contacts: [{ actorId: "owner", contactId: "contact:1" }], connections: [{ ...identity, stage, activeGoal: stage === "active" ? "目标" : null }],
    tasks: tasks.map(task => ({ ...identity, ...task, dueAt: now, status: "open", purpose: "follow_up" })) });
  const service = serviceFactory(repository, () => now);
  await page.route("https://orbit.example/**", async route => {
    const req = route.request();
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "content-type" };
    if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const handlers = handlersFactory({ repository, service, resolveActor: async () => ({ id: "owner" }) });
    const context = { params: Promise.resolve({ id: "connection:1" }) };
    const request = new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()!, headers: { "content-type": "application/json" } } : {}) });
    const response = req.method() === "POST" ? await handlers.POST(request, context) : await handlers.GET(request, context);
    await route.fulfill({ status: response.status, headers, contentType: "application/json", body: await response.text() });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__targetTaskId = undefined; (window as any).__targetContactId = undefined; });
  await page.addScriptTag({ content: script });
  return { page, repository };
}

test("QA-C2: 保持联系 saves the next follow-up on the picked date; 再跟进一次 only shows when the stage allows it", async t => {
  const { page } = await openWithRepository(t, "active", [{ taskId: "task:1", title: "复核下一步" }]);
  await page.getByText("复核下一步", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("radio", { name: /再跟进一次/ }).count(), 0, "an active relationship has no 'follow up again' step");
  assert.equal(await page.getByRole("radio", { name: /保持联系/ }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByText("Asia/Shanghai").count(), 0, "no bare time zone line");
  await page.getByRole("button", { name: "标记为完成" }).click();
  await page.getByText("已完成，下一步已保存。").waitFor();
  // The new follow-up is open and selected; the old one moved to 之前的跟进.
  await page.getByText("之前的跟进").waitFor();
  assert.ok(await page.getByText("复核下一步", { exact: true }).count() >= 2);
});

test("QA-C2: 不再跟进 asks first, then closes the follow-up", async t => {
  const { page } = await openWithRepository(t, "needs_follow_up", [{ taskId: "task:1", title: "约饭" }, { taskId: "task:2", title: "发资料" }]);
  await page.getByRole("radio", { name: "约饭" }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /再跟进一次/ }).getAttribute("aria-checked"), "true");
  await page.getByRole("radio", { name: /不再跟进/ }).click();
  await page.getByRole("button", { name: "不再跟进" }).click();
  const dialog = page.getByRole("alert").filter({ hasText: "不再跟进？" });
  await dialog.getByText("另外 1 条未完成的会关闭", { exact: false }).waitFor();
  await dialog.getByRole("button", { name: "不再跟进" }).click();
  await page.getByText("已完成，下一步已保存。").waitFor();
  await page.getByText("没有待处理的跟进").waitFor();
  await page.getByText("已关闭").waitFor();
});

// QA-C3: the server refuses a lifecycle write for a person saved with more than one relationship record (409);
// the page says so plainly in the reader's language instead of the raw English server text or "refresh to check".
test("QA-C3: a 409 for a person saved more than once reads plainly (zh)", async t => {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); t.after(() => page.close());
  const now = "2026-09-16T00:00:00.000Z";
  const identity = { actorId: "owner", connectionId: "connection:1", contactId: "contact:1", version: 1, createdAt: now, updatedAt: now };
  const snapshot = { connection: { ...identity, stage: "needs_follow_up", activeGoal: null }, tasks: [
    { ...identity, taskId: "task:1", title: "约饭", dueAt: now, status: "open", purpose: "follow_up" },
  ] };
  await page.route("https://orbit.example/**", async route => {
    const headers = { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "content-type" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (route.request().method() === "GET") { await route.fulfill({ status: 200, headers, contentType: "application/json", json: { success: true, data: { snapshot } } }); return; }
    // The real server answer for the refused write (postgres repository guard → handler).
    const response = lifecycleErrorResponse(new LifecycleError("CONFLICT", "This contact has more than one relationship record."));
    await route.fulfill({ status: response.status, headers, contentType: "application/json", body: await response.text() });
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => { (window as any).__language = "zh"; (window as any).__targetTaskId = undefined; (window as any).__targetContactId = undefined; });
  await page.addScriptTag({ content: script });
  await page.getByText("约饭", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "标记为完成" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").textContent(), "这个人在 Orbit 里存了不止一份记录，所以这里无法更新这条跟进。你仍可以在待办里把它勾掉。");
});
