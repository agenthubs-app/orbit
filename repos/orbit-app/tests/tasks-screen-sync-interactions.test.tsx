import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser, server: Server, url: string;
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const task = { id: "task:mirror", accountId: "actor", ownerUserId: "actor", title: "Mirror task", status: "open", category: "relationship", priority: "normal", source: "manual", relatedContactId: "contact:one", createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z" };
export const state = window.fixture = { records: [{ id: task.id, payload: task, revision: "1" }], status: "stale", reads: [], writes: [], syncs: [], ...window.initialFixture, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useSyncedCollection = () => { observe(); return { records: state.records, status: state.status, error: state.error || null, lastSyncedAt: "2026-09-16T00:00:00Z", refresh() { state.syncs.push("refresh"); }, async invalidate() { state.syncs.push("invalidate"); } }; };
export const useApiResource = path => { state.reads.push(path); return { kind: "success", data: { contacts: [{ id: "contact:one", displayName: "Ada", organization: "Orbit" }] }, refreshing: false, refresh() { state.reads.push(path); } }; };
const client = { async patch(path, options) { state.writes.push({ path, body: options.body }); const payload = { ...task, status: "completed", updatedAt: "2026-09-16T01:00:00Z" }; return { success: true, status: 200, data: { task: payload } }; } };
export const useOrbitApiClient = () => client;
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://example.test" });
export const useOrbitTimeZone = () => ({ timeZone: "Asia/Tokyo" });
export const useLocalSearchParams = () => ({});
export const useRouter = () => ({ push() {} });
export const AppScreen = ({ children, refreshControl }) => <main>{refreshControl}{children}</main>;
export const EmptyState = ({ title }) => <div>{title}</div>;
export const ErrorState = ({ message }) => <div role="alert">{message}</div>;
export const LoadingState = () => <div>loading</div>;
export const PersonalScheduleList = () => null;
export const RelationshipTaskTools = () => null;
export const Ionicons = () => null;
export const randomUUID = () => "fixed";
export const createThemedStyles = () => () => ({ colors: {}, styles: {} });
export const SafeAreaView = ({ children }) => <View>{children}</View>;
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { TasksScreen } from "./src/screens/tasks/TasksScreen"; import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext"; import { createTranslator } from "./src/i18n/messages"; const locale = { language: "en", t: createTranslator("en") }; createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><TasksScreen /></OrbitLocaleContext.Provider>);', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "tasks-sync", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
    plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(useSyncedCollection|useApiResource|useOrbitApiClient|AuthSessionProvider|ApiBaseUrlProvider|OrbitTimeZoneProvider|AppScreen|EmptyState|ErrorState|LoadingState|PersonalScheduleList|RelationshipTaskTools)$|\/design\/theme$/ }, () => ({ path: "fixture", namespace: "tasks-sync" }));
    plugin.onLoad({ filter: /.*/, namespace: "tasks-sync" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  server = createServer((_req, response) => { response.setHeader("content-type", "text/html"); response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> { const page = await browser.newPage(); t.after(() => page.close()); await page.goto(url); return page; }

test("TasksScreen is mirror-first, preserves stale content, invalidates after PATCH and removes tombstones", async t => {
  const page = await open(t); await page.getByText("Mirror task", { exact: true }).waitFor();
  assert.equal(await page.getByText("Showing saved content. Refresh when online.", { exact: false }).isVisible(), true);
  assert.equal(await page.evaluate(() => (window as any).fixture.reads.includes("/api/tasks")), false);
  await page.getByRole("checkbox", { name: "Complete: Mirror task" }).dispatchEvent("click");
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.syncs), ["invalidate"]);
  assert.equal(await page.evaluate(() => (window as any).fixture.writes.length), 1);
  await page.evaluate(() => (window as any).fixture.update({ records: [], status: "fresh" }));
  await page.getByText("Mirror task", { exact: true }).waitFor({ state: "detached" });
  await page.evaluate(() => (window as any).fixture.update({ status: "failure", error: "Offline sync failed" }));
  await page.getByRole("alert").filter({ hasText: "Offline sync failed" }).waitFor();
});
