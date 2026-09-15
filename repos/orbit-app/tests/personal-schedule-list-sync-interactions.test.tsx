import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser, server: Server, url: string;
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const item = { id: "personal:mirror", sourceId: "personal:mirror", accountId: "actor", ownerUserId: "actor", title: "Mirror lunch", kind: "personal", category: "personal", state: "upcoming", startsAt: "2026-09-17T03:00:00Z", createdAt: "2026-09-16T00:00:00Z", updatedAt: "2026-09-16T00:00:00Z" };
export const state = window.fixture = { records: [{ id: item.id, payload: item, revision: "1" }], status: "stale", error: null, syncs: 0, networkGets: 0, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
export const useSyncedCollection = () => { observe(); return { records: state.records, status: state.status, error: state.error, lastSyncedAt: item.updatedAt, refresh() { state.syncs++; }, async invalidate() { state.syncs++; } }; };
export const useOrbitAuthSession = () => ({ actorId: "actor" });
export const useOrbitTimeZone = () => ({ timeZone: "Asia/Tokyo" });
export const useFocusEffect = callback => useEffect(callback, [callback]);
export const useRouter = () => ({ push() {} });
export const LoadingState = () => <div>loading</div>;
export const ErrorState = ({ message }) => <div role="alert">{message}</div>;
export const createThemedStyles = () => () => ({ styles: {} });
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { PersonalScheduleList } from "./src/screens/schedule/PersonalScheduleList"; import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext"; import { createTranslator } from "./src/i18n/messages"; const locale = { language: "en", t: createTranslator("en") }; createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><PersonalScheduleList /></OrbitLocaleContext.Provider>);', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" }, plugins: [{ name: "schedule-list-sync", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
    plugin.onResolve({ filter: /^expo-router$|\/(useSyncedCollection|AuthSessionProvider|OrbitTimeZoneProvider|LoadingState|ErrorState)$|\/design\/theme$/ }, () => ({ path: "fixture", namespace: "schedule-list-sync" }));
    plugin.onLoad({ filter: /.*/, namespace: "schedule-list-sync" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  server = createServer((_req, response) => { response.setHeader("content-type", "text/html"); response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> { const page = await browser.newPage(); t.after(() => page.close()); await page.goto(url); return page; }

test("PersonalScheduleList keeps stale mirror content, never issues the legacy GET and removes tombstones", async t => {
  const page = await open(t); await page.getByText("Mirror lunch", { exact: true }).waitFor();
  assert.equal(await page.getByText("Showing saved content. Refresh when online.", { exact: false }).isVisible(), true);
  assert.equal(await page.evaluate(() => (window as any).fixture.networkGets), 0);
  assert.ok(await page.evaluate(() => (window as any).fixture.syncs >= 1));
  await page.evaluate(() => (window as any).fixture.update({ records: [], status: "fresh" }));
  await page.getByText("Mirror lunch", { exact: true }).waitFor({ state: "detached" });
  await page.evaluate(() => (window as any).fixture.update({ status: "failure", error: "Schedule sync failed" }));
  await page.getByRole("alert").filter({ hasText: "Schedule sync failed" }).waitFor();
});
