import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

// 0127: the browser's offline identity lives next to the mirror keys in IndexedDB
// ("orbit-sync-keys"), survives a reload, and is cleared together with the cached language.
// Real Chromium, real IndexedDB, served from http://127.0.0.1 (a secure context).
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENTRY = `
import { offlineIdentityStorage } from "./src/api/offline-identity-storage";
(window as any).__identity = offlineIdentityStorage;
(window as any).__keyStoreKeys = () => new Promise((resolve, reject) => {
  const open = indexedDB.open("orbit-sync-keys", 1);
  open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("keys")) open.result.createObjectStore("keys"); };
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const request = open.result.transaction("keys", "readonly").objectStore("keys").getAllKeys();
    request.onsuccess = () => { open.result.close(); resolve(request.result.map(String)); };
    request.onerror = () => reject(request.error);
  };
});
`;

test("browser offline identity: persisted in the mirror key store, survives reload, cleared as one", { timeout: 60_000 }, async (t) => {
  const bundle = (await build({
    stdin: { contents: ENTRY, loader: "ts", resolveDir: app },
    bundle: true, write: false, format: "iife", platform: "browser",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
  })).outputFiles[0]!.text;
  const server = http.createServer((request, response) => {
    if (request.url === "/app.js") { response.writeHead(200, { "content-type": "text/javascript" }); response.end(bundle); return; }
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><script src="/app.js"></script>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => Boolean((window as any).__identity));
  assert.equal(await page.evaluate(() => window.isSecureContext), true);

  const record = { version: 1, baseUrl: origin, accountId: "account:alex", user: { id: "user:alex", email: "alex@example.test", name: "Alex" }, validatedAt: 1_789_000_000_000 };
  await page.evaluate(async (value) => {
    const storage = (window as any).__identity;
    await storage.write(value);
    await storage.writeLanguage(value.baseUrl, value.accountId, { mode: "manual", language: "en", updatedAt: "2026-09-27T00:00:00.000Z" });
  }, record);

  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__identity));
  assert.deepEqual(await page.evaluate((baseUrl) => (window as any).__identity.read(baseUrl), origin), record);
  assert.equal((await page.evaluate((baseUrl) => (window as any).__identity.readLanguage(baseUrl, "account:alex"), origin))?.language, "en");
  const keys: string[] = await page.evaluate(() => (window as any).__keyStoreKeys());
  assert.equal(keys.filter((key) => key.startsWith("orbit.offline")).length, 2, "identity and language sit in the mirror key store");

  await page.evaluate((baseUrl) => (window as any).__identity.clear(baseUrl), origin);
  assert.equal(await page.evaluate((baseUrl) => (window as any).__identity.read(baseUrl), origin), null);
  assert.equal(await page.evaluate((baseUrl) => (window as any).__identity.readLanguage(baseUrl, "account:alex"), origin), null);
  assert.deepEqual((await page.evaluate(() => (window as any).__keyStoreKeys()) as string[]).filter((key) => key.startsWith("orbit.offline")), []);
});
