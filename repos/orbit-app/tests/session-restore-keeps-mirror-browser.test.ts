import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Sprint 0130: re-running the session restore must not erase the local mirror of the same identity.
// Real Chromium, real OrbitAuthSessionProvider + ApiBaseUrlProvider + AppErrorBoundary +
// useSyncedCollection + sync coordinator + sync lifecycle + mobile-auth/client HTTP code, against a
// scripted Orbit host (auth session, account/me, sync lease/manifest/pages).
// - "web": the browser build (.web files): Web lifecycle on OPFS with the non-extractable AES-GCM key in IndexedDB.
// - "native": the iOS build (non-.web files, Platform.OS "ios"): the native lifecycle, whose SQLite engine is
//   expo-sqlite's wasm build (PRAGMA key/cipher_version answered by the adapter), SecureStore as an in-page map.
// Replaced boundaries: expo-router (records replace), expo-web-browser, notification cleanup, expo-crypto
// (Web Crypto), SecureStore/AsyncStorage/expo-file-system (native only).
// Triggers exercised: provider remount (what an Expo Router root remount does), AppErrorBoundary retry,
// base URL change (native) and re-confirming the same base URL (native).
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(app, "src");
const require = createRequire(path.join(app, "package.json"));
const A = "account-restore-a";
const B = "account-restore-b";
const W = "workspace-restore";
type Mode = "web" | "native";

type Row = { id: string; revision: string; payload: Record<string, unknown> };
interface HostState {
  actor: string;
  session: "valid" | "none";
  epoch: string;
  grants: string[];
  rows: Record<string, Record<string, Row[]>>;
  requests: string[];
  authChecks: number;
}

const ENTRY = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { OrbitApiBaseUrlProvider, useOrbitApiBaseUrl } from "./src/api/ApiBaseUrlProvider";
import { OrbitAuthSessionProvider, useOrbitAuthSession } from "./src/api/AuthSessionProvider";
import { nativeAuthSessionStorage } from "./src/api/native-auth-session-storage";
import { offlineIdentityStorage } from "./src/api/offline-identity-storage";
import { useSyncedCollection } from "./src/hooks/useSyncedCollection";
import { syncLifecycle } from "./src/data/sync/sync-lifecycle";
import { mirrorKeys } from "mirror-probe";

const app = window.__app = { replaces: [], state: null };
function Probe() {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const notes = useSyncedCollection({ kind: "note" });
  const [, rerender] = useState(0);
  app.rerender = () => rerender((value) => value + 1);
  app.signOut = auth.signOut;
  app.setBaseUrl = server.setBaseUrl;
  app.state = {
    ready: auth.ready, signedIn: auth.signedIn, offline: auth.offline, actorId: auth.actorId, baseUrl: server.baseUrl,
    notes: { status: notes.status, error: notes.error, lastSyncedAt: notes.lastSyncedAt, ids: notes.records.map((record) => record.id).sort() },
  };
  app.refreshNotes = () => notes.refresh().then((result) => result && result.status);
  // Keeps failing until the test clears it: React retries a failed render once before the boundary takes over.
  if (app.failing) throw new Error("QA render failure");
  return React.createElement("span", { id: "probe" }, auth.ready ? "ready" : "loading");
}
function Root() {
  const [generation, setGeneration] = useState(0);
  app.remount = () => setGeneration((value) => value + 1);
  return React.createElement(AppErrorBoundary, { key: generation },
    React.createElement(OrbitApiBaseUrlProvider, null,
      React.createElement(OrbitAuthSessionProvider, null, React.createElement(Probe))));
}
app.seedNative = async (baseUrl) => {
  await AsyncStorage.setItem("orbit.apiBaseUrl", baseUrl);
  await nativeAuthSessionStorage.write(baseUrl, "session=qa-restore");
};
app.start = () => { createRoot(document.getElementById("root")).render(React.createElement(Root)); };
app.keys = () => mirrorKeys();
app.identity = (baseUrl) => offlineIdentityStorage.read(baseUrl);
/** A table no sync path knows: it survives only if the very same database file survives. */
app.mark = () => syncLifecycle.withDatabase(null, async (db) => { await db.execute("CREATE TABLE IF NOT EXISTS qa_restore_marker (value TEXT)"); await db.run("INSERT INTO qa_restore_marker (value) VALUES (?)", ["kept"]); return true; });
app.marker = () => syncLifecycle.withDatabase(null, async (db) => (await db.all("SELECT value FROM qa_restore_marker")).map((row) => row.value));
app.rows = () => syncLifecycle.withDatabase(null, (db) => db.all("SELECT domain_id, record_id, payload_json FROM sync_records ORDER BY domain_id, record_id"));
window.__ready = true;
`;

// Web: the key is a non-extractable CryptoKey; AES-GCM with a fixed IV over a fixed text is a stable fingerprint of it.
const WEB_PROBE = `
export async function mirrorKeys() {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open("orbit-sync-keys", 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("keys")) open.result.createObjectStore("keys"); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  });
  const entries = await new Promise((resolve, reject) => {
    const store = db.transaction("keys", "readonly").objectStore("keys");
    const keys = store.getAllKeys(); const values = store.getAll();
    values.onsuccess = () => resolve(keys.result.map((key, index) => [String(key), values.result[index]]));
    values.onerror = () => reject(values.error);
  });
  db.close();
  const result = {};
  for (const [name, value] of entries) {
    if (!name.startsWith("orbit.sync.key.")) continue;
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(12) }, value, new TextEncoder().encode("qa-0130"));
    result[name.slice(15)] = Array.from(new Uint8Array(sealed).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return result;
}
`;
const NATIVE_PROBE = `
export async function mirrorKeys() {
  const result = {};
  for (const [name, value] of window.__secure) {
    if (!name.startsWith("orbit.sync.key.")) continue;
    // Compare a fingerprint, never print the key itself.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("qa-0130:" + value));
    result[name.slice(15)] = Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return result;
}
`;

const STUBS: Record<string, string> = {
  router: "export const router = { replace(href) { window.__app.replaces.push(href); }, push() {}, back() {} };",
  browser: "export async function openAuthSessionAsync() { return { type: 'cancel' }; } export function maybeCompleteAuthSession() {}",
  crypto: `
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" };
const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
export async function digestStringAsync(_, value) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
export async function digest(_, bytes) { return crypto.subtle.digest("SHA-256", bytes); }
export async function getRandomBytesAsync(size) { return crypto.getRandomValues(new Uint8Array(size)); }
export function getRandomBytes(size) { return crypto.getRandomValues(new Uint8Array(size)); }
`,
  asyncStorage: `
const memory = window.__asyncStorage ??= new Map();
const storage = { async getItem(key) { return memory.has(key) ? memory.get(key) : null; }, async setItem(key, value) { memory.set(key, String(value)); }, async removeItem(key) { memory.delete(key); } };
export default storage;
`,
  secureStore: `
const store = window.__secure ??= new Map();
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 7;
export async function getItemAsync(key) { return store.has(key) ? store.get(key) : null; }
export async function setItemAsync(key, value) { store.set(key, value); }
export async function deleteItemAsync(key) { store.delete(key); }
`,
  // The native lifecycle's SQLite: expo-sqlite's wasm engine. SQLCipher's PRAGMA key/cipher_version are answered here.
  nativeSqlite: `
import * as real from "expo-sqlite-real";
const native = window.__native ??= { opened: new Set(), deletes: [] };
export const defaultDatabaseDirectory = "/qa-native";
// OPFS pool paths are limited to 64 bytes; the native file name carries the full 64-hex digest.
const short = (name) => name.replace(/^orbit-sync-([0-9a-f]{32})[0-9a-f]{32}\.db$/, "qa-$1.db");
export async function openDatabaseAsync(name, options) {
  const handle = await real.openDatabaseAsync(short(name), options).catch((error) => { console.warn("QA_OPEN_FAILED", String(error)); throw error; });
  native.opened.add(name);
  const trace = (label, promise) => promise.catch((error) => { console.warn("QA_SQL_FAILED", label, String(error)); throw error; });
  return {
    execAsync: (sql) => /^PRAGMA key = /.test(sql) ? Promise.resolve() : trace(sql, handle.execAsync(sql)),
    runAsync: (sql, params) => trace(sql, handle.runAsync(sql, params)),
    getFirstAsync: (sql, params) => sql === "PRAGMA cipher_version" ? Promise.resolve({ cipher_version: "qa" }) : trace(sql, handle.getFirstAsync(sql, params)),
    getAllAsync: (sql, params) => trace(sql, handle.getAllAsync(sql, params)),
    closeAsync: () => handle.closeAsync(),
  };
}
export async function deleteDatabaseAsync(name) { native.deletes.push(name); native.opened.delete(name); return real.deleteDatabaseAsync(short(name)); }
`,
  fileSystem: `
export class File {
  constructor(...paths) { this.name = paths[paths.length - 1]; }
  get exists() { return window.__native.opened.has(this.name); }
  delete() {}
}
`,
  reactNative: `
export * from "react-native-web-real";
import { AppState as WebAppState } from "react-native-web-real";
export const Platform = { OS: "ios", Version: "26.0", select: (options) => options.ios ?? options.native ?? options.default, isTesting: true };
export const AppState = WebAppState;
`,
  pushQueue: "export async function revokePushDeviceRegistrations() { return true; }",
  pushSession: "export async function revokeRegisteredPushDevice() {}",
  nativeNotifications: "export async function cancelOrbitManagedNotifications() {}",
};

async function bundle(mode: Mode) {
  const stub = (name: string) => ({ path: name, namespace: "restore-stub" });
  const common = {
    absWorkingDir: app, bundle: true, write: false, format: "iife" as const, platform: "browser" as const,
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    jsx: "automatic" as const,
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "session-restore-test",
      setup(plugin: { onResolve: Function; onLoad: Function }) {
        plugin.onResolve({ filter: /SQLiteModule\.node$/ }, () => stub("node-stub"));
        plugin.onResolve({ filter: /^expo-router$/ }, () => stub("router"));
        plugin.onResolve({ filter: /^expo-web-browser$/ }, () => stub("browser"));
        plugin.onResolve({ filter: /^expo-crypto$/ }, () => stub("crypto"));
        plugin.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => stub("asyncStorage"));
        plugin.onResolve({ filter: /^mirror-probe$/ }, () => stub(mode === "web" ? "webProbe" : "nativeProbe"));
        plugin.onResolve({ filter: /(^|\/)push-registration-queue$/ }, () => stub("pushQueue"));
        plugin.onResolve({ filter: /(^|\/)push-device-session$/ }, () => stub("pushSession"));
        plugin.onResolve({ filter: /(^|\/)native-notifications$/ }, () => stub("nativeNotifications"));
        plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: path.join(app, "tests/helpers/stubs/react-native-safe-area-context.js") }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: path.join(app, "tests/helpers/stubs/expo-vector-icons.js") }));
        plugin.onResolve({ filter: /^react-native-web-real$/ }, () => ({ path: require.resolve("react-native-web") }));
        // By package path: under npm test the render hooks redirect a bare "expo-sqlite" resolution to a Node stub.
        plugin.onResolve({ filter: /^expo-sqlite-real$/ }, () => ({ path: path.join(path.dirname(require.resolve("expo-sqlite/package.json")), "build", "index.js") }));
        if (mode === "web") {
          plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        } else {
          plugin.onResolve({ filter: /^react-native$/ }, (args: { importer: string }) => args.importer.includes("react-native-web") ? { path: require.resolve("react-native-web") } : stub("reactNative"));
          plugin.onResolve({ filter: /^expo-secure-store$/ }, () => stub("secureStore"));
          plugin.onResolve({ filter: /^expo-file-system$/ }, () => stub("fileSystem"));
          plugin.onResolve({ filter: /^expo-sqlite$/ }, (args: { importer: string }) => args.importer.startsWith(src) ? stub("nativeSqlite") : undefined);
          // The iOS build: App sources resolve to their non-.web files.
          plugin.onResolve({ filter: /^\./ }, (args: { importer: string; resolveDir: string; path: string }) => {
            if (!(args.importer.startsWith(src) || args.resolveDir === app)) return undefined;
            const base = path.resolve(args.resolveDir, args.path);
            for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
              if (existsSync(candidate) && statSync(candidate).isFile()) return { path: candidate };
            }
            return undefined;
          });
        }
        plugin.onLoad({ filter: /.*/, namespace: "restore-stub" }, (args: { path: string }) => {
          if (args.path === "node-stub") return { contents: "module.exports = { default: null };", loader: "js" };
          if (args.path === "webProbe") return { contents: WEB_PROBE, loader: "js" };
          if (args.path === "nativeProbe") return { contents: NATIVE_PROBE, loader: "js" };
          return { contents: STUBS[args.path], loader: "js", resolveDir: app };
        });
      },
    }],
  };
  const appJs = (await build({ ...common, stdin: { contents: ENTRY, loader: "tsx", resolveDir: app } })).outputFiles?.[0]?.text ?? "";
  const workerBuild = await build({
    ...common, entryPoints: [path.join(path.dirname(require.resolve("expo-sqlite/package.json")), "web", "worker.ts")],
    loader: { ".wasm": "file" }, publicPath: "/", outdir: "/", assetNames: "[name]-[hash]",
  });
  const workerJs = workerBuild.outputFiles?.find((file) => file.path.endsWith(".js"))?.text ?? "";
  const wasm = Buffer.from(workerBuild.outputFiles?.find((file) => file.path.endsWith(".wasm"))?.contents ?? new Uint8Array());
  return { appJs, workerJs, wasm };
}

async function serve(files: Awaited<ReturnType<typeof bundle>>, state: HostState) {
  const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (type: string, body: string | Buffer) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    if (url.pathname === "/") return send("text/html; charset=utf-8", "<!doctype html><html><body><div id=\"root\"></div><script src=\"/app.js\"></script></body></html>");
    if (url.pathname === "/app.js") return send("text/javascript", files.appJs);
    if (url.pathname.split("/").at(-1) === "worker") return send("text/javascript", files.workerJs);
    if (url.pathname.endsWith(".wasm")) return send("application/wasm", files.wasm);
    const signedIn = state.session === "valid";
    if (url.pathname === "/api/auth/session") {
      state.authChecks += 1;
      return json(res, 200, signedIn ? { user: { id: `user:${state.actor}`, email: `${state.actor}@example.test`, name: state.actor }, expires: "2026-12-31T00:00:00.000Z" } : {});
    }
    if (url.pathname === "/api/account/me") {
      if (!signedIn) return json(res, 401, { success: false, error: { code: "UNAUTHENTICATED", message: "sign in" } });
      return json(res, 200, { success: true, data: { account: { id: state.actor }, session: { status: "signed-in" }, user: { id: `profile:${state.actor}` } } });
    }
    if (url.pathname === "/api/account/session/sign-out" && req.method === "POST") {
      state.session = "none";
      return json(res, 200, { success: true, data: { signedOut: true } });
    }
    if (url.pathname.startsWith("/api/sync/")) {
      if (!signedIn) return json(res, 401, { success: false, error: { code: "UNAUTHENTICATED", message: "sign in" } });
      state.requests.push(url.pathname + (url.pathname.includes("/domains/") ? (url.searchParams.has("cursor") ? "?cursor" : "?first") : ""));
    }
    const now = Date.now();
    const grants = state.grants.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: state.epoch }));
    const rowsOf = (domainId: string) => state.rows[state.actor]?.[domainId] ?? [];
    if (url.pathname === "/api/sync/lease") {
      return json(res, 200, { success: true, data: {
        version: 2, baseUrl: url.searchParams.get("baseUrl"), actorId: state.actor, subject: state.actor,
        sessionExpiresAt: now + 30 * 86_400_000, offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now, grants, databaseKeyRef: "key-ref",
      } });
    }
    if (url.pathname === "/api/sync/manifest") {
      const etag = `W/"${createHash("sha256").update(JSON.stringify([state.actor, state.epoch, state.grants, state.rows[state.actor]])).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
      return json(res, 200, { success: true, data: { registryVersion: 1, domains: grants.map((grant) => ({
        domainId: grant.domainId, schemaVersion: 1, workspaceId: W, authorizationEpoch: state.epoch, generation: `gen-${state.epoch}`,
        watermark: String(rowsOf(grant.domainId).length), history: "complete", membershipCursor: null,
      })) } }, { ETag: etag });
    }
    const page = url.pathname.match(/^\/api\/sync\/domains\/([^/]+)$/);
    if (page) {
      const domainId = decodeURIComponent(page[1]!);
      const rows = rowsOf(domainId);
      const cursor = url.searchParams.get("cursor");
      const after = cursor ? Number(cursor.split(":")[1]) : 0;
      const slice = rows.slice(after, after + 100);
      return json(res, 200, { success: true, data: {
        domainId, schemaVersion: 1, registryVersion: 1, authorizationEpoch: state.epoch,
        changes: slice.map((row) => ({ id: row.id, revision: row.revision, operation: "upsert", payload: row.payload })),
        nextCursor: `${state.epoch}:${after + slice.length}`, highWatermark: String(rows.length), hasMore: false,
        generation: `gen-${state.epoch}`, serverTime: new Date(now).toISOString(),
      } });
    }
    res.writeHead(404, { "content-type": "application/json" }); res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

const note = (actor: string, id: string): Row => ({ id, revision: `rev:${id}`, payload: {
  id, accountId: actor, ownerUserId: actor, title: `title ${id}`, body: `body ${id}`,
  manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z",
} });
const task = (actor: string, id: string): Row => ({ id, revision: `rev:${id}`, payload: { id, task: { id, title: id, status: "open", accountId: actor } } });

function freshHost(state: HostState) {
  Object.assign(state, {
    actor: A, session: "valid", epoch: "e1", grants: ["notes", "tasks", "personal-schedule"], requests: [], authChecks: 0,
    rows: { [A]: { notes: [note(A, "note-a1"), note(A, "note-a2")], tasks: [task(A, "task-a1")] }, [B]: { notes: [note(B, "note-b1")] } },
  });
}

type AppState = { ready: boolean; signedIn: boolean; offline: boolean; actorId: string | null; baseUrl: string; notes: { status: string; error: string | null; lastSyncedAt: string | null; ids: string[] } };

async function call<T>(page: Page, expression: string): Promise<T> {
  await page.waitForFunction(() => (window as any).__ready, null, { timeout: 20_000 });
  return page.evaluate(`(async () => (${expression}))()`) as Promise<T>;
}
const appState = (page: Page) => call<AppState>(page, "window.__app.state");
async function waitFor(page: Page, what: string, predicate: string, timeout = 20_000) {
  try {
    await page.waitForFunction(`(() => { const s = window.__app.state; return Boolean(s && (${predicate})); })()`, null, { timeout });
  } catch (error) {
    throw new Error(`${what}: ${JSON.stringify(await appState(page))} — ${(error as Error).message.split("\n")[0]}\nconsole: ${consoleLines.slice(-12).join("\n")}`);
  }
}
const consoleLines: string[] = [];
const settled = "s.ready && s.signedIn && s.notes.status === 'fresh' && s.notes.ids.length > 0";

for (const mode of ["web", "native"] as const) {
  let files: Awaited<ReturnType<typeof bundle>>;
  let host: Awaited<ReturnType<typeof serve>>;
  let browser: Browser;
  const state = {} as HostState;

  test(`${mode}: bundle and host`, { timeout: 120_000 }, async () => {
    files = await bundle(mode);
    freshHost(state);
    host = await serve(files, state);
    browser = await chromium.launch({ headless: true });
  });

  async function openApp(t: { after(fn: () => Promise<void>): void }): Promise<{ page: Page; context: BrowserContext; errors: string[] }> {
    freshHost(state);
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
    consoleLines.length = 0;
    page.on("console", (message) => consoleLines.push(`${message.type()}: ${message.text().slice(0, 300)}`));
    t.after(async () => { await context.close(); });
    await page.goto(`${host.base}/`);
    if (mode === "native") await call(page, `window.__app.seedNative(${JSON.stringify(host.base)})`);
    await call(page, "window.__app.start()");
    await waitFor(page, "first sign-in and sync", settled);
    assert.deepEqual((await appState(page)).notes.ids, ["note-a1", "note-a2"]);
    assert.equal(await call(page, "window.__app.mark()"), true);
    return { page, context, errors };
  }

  async function mirror(page: Page) {
    return {
      keys: await call<Record<string, string>>(page, "window.__app.keys()"),
      marker: await call<string[] | null>(page, "window.__app.marker().catch(() => null)"),
    };
  }

  async function waitForAuthCheck(checks: number) {
    const deadline = Date.now() + 15_000;
    while (state.authChecks <= checks && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async function retryAfterRenderFailure(page: Page) {
    await call(page, "(window.__app.failing = true, window.__app.rerender(), true)");
    const retry = page.getByRole("button", { name: "重试" });
    await retry.waitFor({ timeout: 10_000 });
    await call(page, "(window.__app.failing = false, true)");
    await retry.click();
  }

  test(`${mode}: same identity online — provider remount and error-boundary retry keep the database and key and pull no first pages (SC-0130-02)`, { timeout: 90_000 }, async (t) => {
    const { page, errors } = await openApp(t);
    const before = await mirror(page);
    assert.equal(Object.keys(before.keys).length, 1);
    assert.deepEqual(before.marker, ["kept"]);
    const rowsBefore = await call<unknown[]>(page, "window.__app.rows()");

    for (const [trigger, run] of [["provider remount", () => call(page, "window.__app.remount()")], ["error-boundary retry", () => retryAfterRenderFailure(page)]] as const) {
      const checks = state.authChecks;
      state.requests.length = 0;
      await run();
      await waitForAuthCheck(checks);
      await waitFor(page, `${trigger}: signed in again with the mirror`, settled);
      const after = await mirror(page);
      assert.ok(state.authChecks > checks, `${trigger} re-runs the session restore`);
      assert.deepEqual(after.keys, before.keys, `${trigger}: the same key, not a new one`);
      assert.deepEqual(after.marker, ["kept"], `${trigger}: the same database file`);
      assert.deepEqual(await call(page, "window.__app.rows()"), rowsBefore, `${trigger}: rows untouched (same ciphertext on web)`);
      assert.deepEqual(state.requests.filter((request) => request.endsWith("?first")), [], `${trigger}: no from-scratch domain page`);
      assert.equal((await appState(page)).offline, false);
    }
    assert.deepEqual(errors.filter((message) => !message.includes("QA render failure")), []);
  });

  test(`${mode}: same identity offline — remount and error-boundary retry still show the local notes as of the last sync (SC-0130-03)`, { timeout: 90_000 }, async (t) => {
    const { page, context } = await openApp(t);
    const before = await mirror(page);
    const syncedAt = (await appState(page)).notes.lastSyncedAt;
    assert.ok(syncedAt);
    await context.setOffline(true);
    for (const [trigger, run] of [["provider remount", () => call(page, "window.__app.remount()")], ["error-boundary retry", () => retryAfterRenderFailure(page)]] as const) {
      await run();
      await waitFor(page, `${trigger} offline: signed in offline with the local notes`, "s.ready && s.signedIn && s.offline && s.notes.ids.length === 2");
      // What the notes page does on open (0108 probe): a refresh that fails offline keeps the rows as stale.
      assert.equal(await call(page, "window.__app.refreshNotes()"), "stale", `${trigger}: the offline refresh fails but keeps the mirror`);
      await waitFor(page, `${trigger} offline: stale`, "s.notes.status === 'stale'");
      const s = await appState(page);
      assert.equal(s.actorId, A);
      assert.deepEqual(s.notes.ids, ["note-a1", "note-a2"], `${trigger}: the mirror is still there offline`);
      assert.equal(s.notes.lastSyncedAt, syncedAt, `${trigger}: 「截至」 the last online sync`);
      const after = await mirror(page);
      assert.deepEqual(after.keys, before.keys);
      assert.deepEqual(after.marker, ["kept"]);
    }
    await context.setOffline(false);
  });

  test(`${mode}: an explicit rejection on restore still erases the mirror, key and offline identity (SC-0130-04)`, { timeout: 60_000 }, async (t) => {
    const { page } = await openApp(t);
    assert.ok(await call(page, `window.__app.identity(${JSON.stringify(host.base)})`));
    state.session = "none";
    await call(page, "window.__app.remount()");
    await waitFor(page, "rejected restore", "s.ready && !s.signedIn");
    assert.deepEqual(await call(page, "window.__app.keys()"), {}, "the rejected account's key is deleted");
    assert.equal(await call(page, "window.__app.marker().catch(() => null)"), null, "nothing is readable");
    assert.equal(await call(page, `window.__app.identity(${JSON.stringify(host.base)})`), null);
    if (mode === "native") assert.ok((await call<string[]>(page, "window.__native.deletes")).some((name) => /^orbit-sync-[0-9a-f]{64}\.db$/.test(name)), "the database file is deleted");
  });

  test(`${mode}: another account on restore erases the previous account's mirror (SC-0130-04)`, { timeout: 60_000 }, async (t) => {
    const { page } = await openApp(t);
    const before = await mirror(page);
    state.actor = B;
    state.requests.length = 0;
    await call(page, "window.__app.remount()");
    await waitFor(page, "B signed in", `s.ready && s.signedIn && s.actorId === ${JSON.stringify(B)} && s.notes.status === 'fresh'`);
    const after = await mirror(page);
    assert.equal(Object.keys(after.keys).length, 1);
    assert.notDeepEqual(Object.keys(after.keys), Object.keys(before.keys), "A's key is gone, B has its own");
    assert.equal(after.marker, null, "A's database is not B's");
    assert.deepEqual((await appState(page)).notes.ids, ["note-b1"]);
    assert.ok(state.requests.includes("/api/sync/domains/notes?first"), "B starts from the first page");
  });

  test(`${mode}: signing out erases the mirror, key and offline identity (SC-0130-04)`, { timeout: 60_000 }, async (t) => {
    const { page } = await openApp(t);
    assert.deepEqual(await call(page, "window.__app.signOut().then((result) => result.success)"), true);
    await waitFor(page, "signed out", "s.ready && !s.signedIn");
    assert.deepEqual(await call(page, "window.__app.keys()"), {}, "sign-out deletes the key");
    assert.equal(await call(page, `window.__app.identity(${JSON.stringify(host.base)})`), null);
  });

  if (mode === "native") {
    test("native: a server change erases the previous server's mirror even when the new server is unreachable (SC-0130-04)", { timeout: 60_000 }, async (t) => {
      const { page } = await openApp(t);
      const closed = http.createServer();
      await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
      const port = (closed.address() as { port: number }).port;
      await new Promise<void>((resolve) => closed.close(() => resolve()));
      const other = `http://127.0.0.1:${port}`;
      assert.equal(await call(page, `window.__app.setBaseUrl(${JSON.stringify(other)}).then((result) => result.success)`), true);
      await waitFor(page, "restore against the new server", `s.ready && s.baseUrl === ${JSON.stringify(other)} && !s.signedIn`);
      assert.deepEqual(await call(page, "window.__app.keys()"), {}, "the first server's key is deleted");
      assert.ok((await call<string[]>(page, "window.__native.deletes")).some((name) => /^orbit-sync-[0-9a-f]{64}\.db$/.test(name)));
    });

    test("native: re-confirming the same server address does not re-run the restore (trigger table)", { timeout: 60_000 }, async (t) => {
      const { page } = await openApp(t);
      const checks = state.authChecks;
      assert.equal(await call(page, `window.__app.setBaseUrl(${JSON.stringify(host.base)}).then((result) => result.success)`), true);
      await page.waitForTimeout(1000);
      assert.equal(state.authChecks, checks, "same base URL: no state change, no restore");
      assert.deepEqual((await mirror(page)).marker, ["kept"]);
    });
  }

  test(`${mode}: teardown`, async () => {
    await browser?.close();
    host?.server.close();
  });
}
