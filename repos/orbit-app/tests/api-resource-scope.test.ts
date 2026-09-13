import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";

const require = createRequire(import.meta.url);
let server: Server;
let browser: Browser;
let url: string;

// Run the actual resource hook and API client. Only auth and SQLite-backed
// snapshots are replaced; HTTP replies can arrive in a deliberate order.
const boundaries = `
import { useSyncExternalStore } from "react";
let revision = 0; const listeners = new Set();
const state = window.fixture = {
  actorId: "actor:A", requests: [], writes: [], snapshotReads: [],
  switchActor(actorId) { state.actorId = actorId; revision++; listeners.forEach(listener => listener()); },
  reply(index, data, status = 200) { state.requests[index].resolve(new Response(JSON.stringify({ success: status === 200, data, error: { code: "INTERNAL_ERROR", message: "失败" } }), { status, headers: { "content-type": "application/json" } })); },
  fail(index, mode) { if (mode === "offline") state.requests[index].reject(new TypeError("Network unavailable")); else state.requests[index].resolve(new Response("upstream unavailable", { status: 500 })); }
};
window.fetch = (path, options) => new Promise((resolve, reject) => state.requests.push({ path: String(path), actorId: state.actorId, resolve, reject }));
export const useOrbitAuthSession = () => { useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision); return { ready: true, cookieHeader: "", user: { id: state.actorId } }; };
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture" });
export const readSnapshot = async (baseUrl, actorId, path) => { state.snapshotReads.push({ baseUrl, actorId, path }); return location.search.includes("cached") ? { result: { success: true, status: 200, data: { value: "上次缓存内容" }, meta: { featureMode: null, privacy: null, runtimeBoundary: null } }, syncedAt: "2026-09-12T00:00:00Z" } : null; };
export const writeSnapshot = async (baseUrl, actorId, path, result) => { state.writes.push({ actorId, data: result.data }); };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useApiResource } from "./src/hooks/useApiResource"; import { useOrbitAuthSession } from "./src/api/AuthSessionProvider";
      function Screen() { const auth = useOrbitAuthSession(); const state = useApiResource("/api/contacts/same-contact", () => false, { ...(location.search.includes("scoped") ? { scopeKey: auth.user.id } : {}), ...(location.search.includes("network-only") ? { cachePolicy: "network-only" } : {}) }); return <><output>{state.kind === "success" ? state.data.value : state.kind}</output><button onClick={state.refresh}>刷新</button></>; }
      createRoot(document.getElementById("root")).render(<Screen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
    plugins: [{ name: "resource-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "resource-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "resource-test" }, () => ({ contents: boundaries, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, timeout: 15000, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("scoped contact reads clear prior-account data and never reuse that account's pending GET after refresh", { timeout: 15000 }, async t => {
  const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(2000);
  await page.goto(url + "?scoped");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.reply(0, { value: "A 的私有备注" }));
  await page.getByText("A 的私有备注", { exact: true }).waitFor();
  await page.getByRole("button", { name: "刷新" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.switchActor("actor:B"));
  await page.getByText("loading", { exact: true }).waitFor();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => (window as any).fixture.reply(2, { value: "B 的私有备注" }));
  await page.getByText("B 的私有备注", { exact: true }).waitFor();
  await page.evaluate(() => (window as any).fixture.reply(1, { value: "A 的迟到备注" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("output").innerText(), "B 的私有备注");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), [
    { actorId: "actor:A", data: { value: "A 的私有备注" } }, { actorId: "actor:B", data: { value: "B 的私有备注" } }
  ]);
});

test("existing unscoped resources still retain same-account content when refresh fails", { timeout: 15000 }, async t => {
  const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(2000);
  await page.goto(url);
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.reply(0, { value: "已读取的内容" }));
  await page.getByText("已读取的内容", { exact: true }).waitFor();
  await page.getByRole("button", { name: "刷新" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.reply(1, null, 500));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("output").innerText(), "已读取的内容");
});

test("default resources still show cached content when the initial network read fails", async t => {
  const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(2000);
  await page.goto(url + "?scoped&cached");
  await page.getByText("上次缓存内容", { exact: true }).waitFor();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.reply(0, null, 500));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator("output").innerText(), "上次缓存内容");
  assert.equal(await page.evaluate(() => (window as any).fixture.snapshotReads.length), 1);
});

test("network-only resources cannot confirm a cached result before or after a failed initial read", async t => {
  const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(2000);
  await page.goto(url + "?scoped&cached&network-only");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  assert.equal(await page.locator("output").innerText(), "loading");
  await page.evaluate(() => (window as any).fixture.reply(0, null, 500));
  await page.getByText("failure", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.snapshotReads), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
});

for (const mode of ["server", "non-json", "offline"]) test(`network-only refresh exposes ${mode} failure until an explicit retry succeeds`, async t => {
  const page = await browser.newPage(); t.after(() => page.close()); page.setDefaultTimeout(2000);
  await page.goto(url + "?scoped&network-only");
  await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
  await page.evaluate(() => (window as any).fixture.reply(0, { value: "首次联网内容" }));
  await page.getByText("首次联网内容", { exact: true }).waitFor();
  await page.getByRole("button", { name: "刷新" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  assert.equal(await page.locator("output").innerText(), "loading");
  await page.evaluate(mode => { const s = (window as any).fixture; if (mode === "server") s.reply(1, null, 500); else s.fail(1, mode); }, mode);
  await page.getByText(mode === "offline" ? "offline" : "failure", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), 2);
  await page.getByRole("button", { name: "刷新" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 3);
  await page.evaluate(() => (window as any).fixture.reply(2, { value: "重试联网内容" }));
  await page.getByText("重试联网内容", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.snapshotReads), []);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes), []);
});
