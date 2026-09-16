import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser, script: string, handlersFactory: any, repositoryFactory: any, serviceFactory: any;
const fixture = `
import React, { useSyncExternalStore } from 'react';
let revision = 0, next = 0; const listeners = new Set();
const state = window.fixture = { actor: 'owner', signedIn: true, requests: [], update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return state; };
export const useOrbitAuthSession = () => { useFixture(); return { ready: true, signedIn: state.signedIn, actorId: state.actor, cookieHeader: '' }; };
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: 'https://orbit.example' });
export const useLocalSearchParams = () => ({ id: 'connection:1' });
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => '/tasks/relationship/connection%3A1';
export const useRouter = () => ({ canGoBack: () => false, back() {}, push() {}, replace() {} });
export const Redirect = () => <div>Sign in</div>;
export const useOrbitTimeZone = () => ({ timeZone: 'Asia/Shanghai', canSave: true });
export const useOrbitLocale = () => ({ language: 'zh', t: key => key });
export const randomUUID = () => 'intent-' + ++next;
export const AppScreen = ({ children, title }) => <main><h1>{title}</h1>{children}</main>;
`;
test.before(async () => {
  const web = path.resolve(process.cwd(), "../orbits");
  const load = (file: string) => import(pathToFileURL(path.join(web, file)).href);
  ({ createRelationshipLifecycleHandlers: handlersFactory } = await load("app/api/connections/[id]/lifecycle/handler.ts"));
  ({ createMemoryRelationshipLifecycleRepository: repositoryFactory } = await load("features/connections/lifecycle/memory-repository.ts"));
  ({ createRelationshipLifecycleService: serviceFactory } = await load("features/connections/lifecycle/service.ts"));
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { RelationshipLifecycleScreen } from "./src/screens/tasks/RelationshipLifecycleScreen"; createRoot(document.getElementById("root")).render(<RelationshipLifecycleScreen />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "lifecycle-native-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
    plugin.onResolve({ filter: /^(expo-router|expo-crypto)$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider|OrbitLocaleContext|AppScreen)$/ }, () => ({ path: "fixture", namespace: "lifecycle" }));
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
  await page.getByText("待确认合作", { exact: false }).waitFor();
  await page.getByRole("radio", { name: /转为进行中/ }).click();
  await page.getByRole("textbox", { name: "关系目标" }).fill("验证同一云端关系");
  await page.getByRole("button", { name: "完成并保存下一步" }).click();
  await page.getByText("回执丢失，请重试").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "关系目标" }).inputValue(), "验证同一云端关系");
  await page.getByRole("button", { name: "完成并保存下一步" }).click();
  await page.getByText("跟进已完成，关系下一步已保存。").waitFor();
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(repository.audits("owner").length, 1);
  await page.getByRole("button", { name: "刷新关系状态" }).click();
  await page.getByText("没有待处理的跟进").waitFor();
  await page.getByText(/待确认合作 · 已完成/).waitFor();
  await page.evaluate(() => (window as any).fixture.update({ actor: "other" }));
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByText(/待确认合作/).count(), 0);
});
