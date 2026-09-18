import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Real-browser acceptance for the Web local mirror: expo-sqlite's web worker
// (wa-sqlite over OPFS) under an esbuild bundle of the App's own lifecycle and
// repository, served over http://127.0.0.1 (a secure context), driven by Playwright.
// Covers: open + AES-GCM at rest, persistence across reload, orphan file without
// key is discarded, sign-out purges everything.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(app, "package.json"));

const ENTRY = `
import * as sqlite from "expo-sqlite";
import { createWebSyncLifecycle } from "./src/data/sync/sync-lifecycle.web";
import { createLocalSyncRepository } from "./src/data/sync/local-sync-repository";
import { browserMirrorEnvironment, sha256Hex } from "./src/data/sync/web-mirror-storage";
import { loadWebMirrorKey } from "./src/data/sync/web-mirror-key";
import { getLocalSyncDatabaseCapability } from "./src/data/sync/local-sync-database.web";

const reports: string[] = [];
const loadSqlite = async () => ({ openDatabaseAsync: sqlite.openDatabaseAsync, deleteDatabaseAsync: sqlite.deleteDatabaseAsync });
const describe = (code: string, error: unknown) => (error instanceof Error ? code + ": " + error.message : code);
const lifecycle = createWebSyncLifecycle({
  environment: browserMirrorEnvironment,
  loadSqlite,
  report: (code, _scope, error) => { reports.push(describe(code, error)); },
});
const brokenIndexedDB = { open() {
  const request: any = { error: new DOMException("quota", "QuotaExceededError") };
  setTimeout(() => request.onerror && request.onerror(), 0);
  return request;
} } as unknown as IDBFactory;
const scope = { baseUrl: "https://host.example", actorId: "actor-a" };
const readScope = { ...scope, workspaceId: "ws", domainId: "tasks", authorizationEpoch: "epoch-a" };
const hashPayload = (json: string) => sha256Hex(crypto.subtle, json);

function repository(database: any) {
  return createLocalSyncRepository({
    actorId: scope.actorId, database, baseUrl: scope.baseUrl, registeredDomainIds: lifecycle.registeredDomainIds,
    activeReadScopes: () => [readScope], hashPayload, payloadCodec: lifecycle.payloadCodec,
  });
}

(window as any).__mirror = {
  reports,
  open: () => lifecycle.setScope(scope),
  signOut: () => lifecycle.setScope(null),
  status: () => lifecycle.status(),
  readable: () => lifecycle.isScopeReadable(scope),
  apply: (ids: string[]) => lifecycle.withDatabase(scope, async (database) => {
    await repository(database).applyDomainPage(readScope, {
      domainId: "tasks", authorizationEpoch: "epoch-a", schemaVersion: 1, registryVersion: 1,
      changes: ids.map((id) => ({ id, revision: "rev:" + id, operation: "upsert", payload: { id, title: "secret title " + id } })),
      nextCursor: "cursor:tasks", highWatermark: "hw1", hasMore: false, generation: "g1", serverTime: "2026-09-18T01:00:00Z",
    });
    return "applied";
  }),
  list: () => lifecycle.withDatabase(scope, async (database) =>
    (await repository(database).listRecords({ workspaceId: "ws", kind: "task" })).map((record: any) => [record.id, record.payload.title])),
  raw: () => lifecycle.withDatabase(scope, (database) => database.all<{ record_id: string; payload_json: string }>("SELECT record_id, payload_json FROM sync_records ORDER BY record_id")),
  exportAttempt: async () => {
    const digest = lifecycle.status().mode === "local-mirror" ? (lifecycle.status() as any).scopeDigest : null;
    const key = await loadWebMirrorKey(digest, { indexedDB, subtle: crypto.subtle }, async () => { throw new Error("orphan discard must not run"); });
    try { await crypto.subtle.exportKey("raw", key); return "exported"; } catch (error) { return (error as Error).name; }
  },
  switchTo: (actorId: string, baseUrl: string) => lifecycle.setScope({ baseUrl, actorId }),
  degrade: async (mode: string) => {
    const env = browserMirrorEnvironment();
    const patched = mode === "no-opfs" ? { ...env, storage: undefined } : mode === "insecure" ? { ...env, isSecureContext: false } : { ...env, indexedDB: brokenIndexedDB };
    const degradedReports: string[] = [];
    const degraded = createWebSyncLifecycle({ environment: () => patched, loadSqlite, report: (code, _scope, error) => { degradedReports.push(describe(code, error)); } });
    const ok = await degraded.setScope(scope);
    const opened = await degraded.withDatabase(scope, async () => "opened");
    return { ok, opened, readable: degraded.isScopeReadable(scope), status: degraded.status(), capability: await getLocalSyncDatabaseCapability(patched), reports: degradedReports };
  },
  dropKeys: () => new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase("orbit-sync-keys"); request.onsuccess = () => resolve("dropped"); request.onerror = () => reject(request.error); }),
};
(window as any).__ready = true;
`;

async function bundle() {
  const common = {
    absWorkingDir: app, bundle: true, write: false, format: "iife" as const, platform: "browser" as const,
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "web-mirror-test",
      setup(build: { onResolve: Function; onLoad: Function }) {
        build.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        build.onResolve({ filter: /SQLiteModule\.node$/ }, () => ({ path: "node-stub", namespace: "web-mirror-test" }));
        build.onLoad({ filter: /.*/, namespace: "web-mirror-test" }, () => ({ contents: "module.exports = { default: null };", loader: "js" }));
      },
    }],
  };
  const appJs = (await build({ ...common, stdin: { contents: ENTRY, loader: "ts", resolveDir: app } })).outputFiles?.[0]?.text ?? "";
  // Metro builds the worker for the App; this harness builds it the same way expo-sqlite does (wasm as a file asset).
  const workerBuild = await build({
    ...common, entryPoints: [path.join(path.dirname(require.resolve("expo-sqlite/package.json")), "web", "worker.ts")],
    loader: { ".wasm": "file" }, publicPath: "/", outdir: "/", assetNames: "[name]-[hash]",
  });
  const workerJs = workerBuild.outputFiles?.find((file) => file.path.endsWith(".js"))?.text ?? "";
  const wasm = Buffer.from(workerBuild.outputFiles?.find((file) => file.path.endsWith(".wasm"))?.contents ?? new Uint8Array());
  return { appJs, workerJs, wasm };
}

async function serve(files: Awaited<ReturnType<typeof bundle>>) {
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    const send = (type: string, body: string | Buffer) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    if (url === "/" || url === "/index.html") return send("text/html; charset=utf-8", "<!doctype html><html><body><script src=\"/app.js\"></script></body></html>");
    if (url === "/app.js") return send("text/javascript", files.appJs);
    if (url.split("/").at(-1) === "worker") return send("text/javascript", files.workerJs);
    if (url.endsWith(".wasm")) return send("application/wasm", files.wasm);
    res.writeHead(404); res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function call<T>(page: Page, expression: string): Promise<T> {
  await page.waitForFunction(() => (window as any).__ready, null, { timeout: 20_000 });
  return page.evaluate(`(async () => (${expression}))()`) as Promise<T>;
}

test("Web mirror: OPFS-backed, encrypted at rest, survives reload, isolates identities, purges on sign-out, degrades gracefully", { timeout: 120_000 }, async (t) => {
  const files = await bundle();
  const { server, base } = await serve(files);
  let browser: Browser | null = null;
  t.after(async () => { await browser?.close(); server.close(); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200)); });
  await page.goto(`${base}/`);

  // 1. Open in a secure context: mirror available, whitelist bound, scope readable.
  assert.equal(await call(page, "window.__mirror.open()"), true);
  assert.deepEqual(await call(page, "window.__mirror.reports"), []);
  const digest = await call<string>(page, "window.__mirror.status().scopeDigest");
  assert.deepEqual(await call(page, "window.__mirror.status()"), { mode: "local-mirror", scopeDigest: digest, domains: ["tasks", "personal-schedule"] });
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(await call(page, "window.__mirror.readable()"), true);

  // 2. Apply a canonical page: reads decode, the stored column is AES-GCM ciphertext.
  assert.equal(await call(page, "window.__mirror.apply(['task:1','task:2'])"), "applied");
  assert.deepEqual(await call(page, "window.__mirror.list()"), [["task:1", "secret title task:1"], ["task:2", "secret title task:2"]]);
  const raw = await call<Array<{ record_id: string; payload_json: string }>>(page, "window.__mirror.raw()");
  assert.equal(raw.length, 2);
  for (const row of raw) {
    assert.match(row.payload_json, /^orbit-aesgcm-v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/, `${row.record_id} is not encrypted at rest`);
    assert.ok(!row.payload_json.includes("secret title"), `${row.record_id} leaked plaintext`);
  }

  // 3. Reload: OPFS file and IndexedDB key persist, rows still decode under the same digest.
  await page.reload();
  assert.equal(await call(page, "window.__mirror.open()"), true);
  assert.equal(await call(page, "window.__mirror.status().scopeDigest"), digest);
  assert.deepEqual(await call(page, "window.__mirror.list()"), [["task:1", "secret title task:1"], ["task:2", "secret title task:2"]]);
  assert.equal(await call(page, "window.__mirror.exportAttempt()"), "InvalidAccessError", "the mirror key must not be exportable");

  // 4. Key store wiped while the file remains: the orphan file is discarded, never opened with a new key.
  await call(page, "window.__mirror.dropKeys()");
  await page.reload();
  assert.equal(await call(page, "window.__mirror.open()"), true);
  assert.deepEqual(await call(page, "window.__mirror.list()"), []);
  assert.equal(await call(page, "window.__mirror.apply(['task:3'])"), "applied");
  assert.deepEqual(await call(page, "window.__mirror.list()"), [["task:3", "secret title task:3"]]);

  // 5. Isolation: another actor or another server means another database and key; A's rows are purged on the switch.
  assert.equal(await call(page, "window.__mirror.switchTo('actor-b', 'https://host.example')"), true);
  const digestB = await call<string>(page, "window.__mirror.status().scopeDigest");
  assert.match(digestB, /^[a-f0-9]{64}$/);
  assert.notEqual(digestB, digest);
  assert.equal(await call(page, "window.__mirror.list()"), null, "B's session must not read A's scope");
  assert.equal(await call(page, "window.__mirror.switchTo('actor-a', 'https://other.example')"), true);
  const digestOtherServer = await call<string>(page, "window.__mirror.status().scopeDigest");
  assert.ok(digestOtherServer !== digest && digestOtherServer !== digestB);
  assert.equal(await call(page, "window.__mirror.open()"), true);
  assert.equal(await call(page, "window.__mirror.status().scopeDigest"), digest);
  assert.deepEqual(await call(page, "window.__mirror.list()"), [], "A's rows were purged when the identity changed");
  assert.equal(await call(page, "window.__mirror.apply(['task:4'])"), "applied");

  // 6. Sign-out purges key and file; a fresh session starts empty.
  assert.equal(await call(page, "window.__mirror.signOut()"), true);
  assert.equal(await call(page, "window.__mirror.readable()"), false);
  assert.equal(await call(page, "window.__mirror.list()"), null);
  await page.reload();
  assert.equal(await call(page, "window.__mirror.open()"), true);
  assert.deepEqual(await call(page, "window.__mirror.list()"), []);

  // 7. Degradation is a reported state, not an error: setScope true, withDatabase null, reason visible.
  for (const [mode, reason, capabilityReason] of [["no-opfs", "no-opfs", "no-opfs"], ["insecure", "insecure-context", "insecure-context"], ["broken-indexeddb", "open-failed", null]] as const) {
    const outcome = await call<{ ok: boolean; opened: unknown; readable: boolean; status: unknown; capability: { mode: string; reason?: string }; reports: string[] }>(page, `window.__mirror.degrade('${mode}')`);
    assert.equal(outcome.ok, true, mode);
    assert.equal(outcome.opened, null, mode);
    assert.equal(outcome.readable, false, mode);
    assert.deepEqual(outcome.status, { mode: "online-only", reason }, mode);
    if (capabilityReason) assert.deepEqual(outcome.capability, { mode: "online-only", reason: capabilityReason }, mode);
    else assert.deepEqual(outcome.reports, ["SYNC_CLEANUP_STATE_FAILED: quota"]);
  }

  assert.deepEqual(await call(page, "window.__mirror.reports"), []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});
