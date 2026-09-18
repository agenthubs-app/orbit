import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Real-browser acceptance for the Web task mirror (sprint 0078): the App's own
// coordinator + Web lifecycle + sync client run against a scripted sync host.
// Covers SC-0078-01/02/03/04: manifest-gated second sync, whitelist binding,
// offline stale reads, empty-mirror failure (never an empty list), sign-out purge.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(app, "package.json"));
const ACTOR = "actor-web";
const W = "workspace-web";

interface HostState {
  epoch: string;
  version: number;
  rows: Record<string, { id: string; revision: string; payload: Record<string, unknown> }[]>;
  failLease: boolean;
  requests: string[];
}

const ENTRY = `
import * as sqlite from "expo-sqlite";
import { createOrbitApiClient } from "./src/api/client";
import { createSyncClient } from "./src/data/sync/sync-client";
import { createSyncCoordinator } from "./src/data/sync/sync-coordinator";
import { createWebSyncLifecycle } from "./src/data/sync/sync-lifecycle.web";
import { browserMirrorEnvironment, sha256Hex } from "./src/data/sync/web-mirror-storage";

const reports: string[] = [];
const lifecycle = createWebSyncLifecycle({
  environment: browserMirrorEnvironment,
  loadSqlite: async () => ({ openDatabaseAsync: sqlite.openDatabaseAsync, deleteDatabaseAsync: sqlite.deleteDatabaseAsync }),
  report: (code, _scope, error) => { reports.push(error instanceof Error ? code + ": " + error.message : code); },
});
const manifestOutages: string[] = [];
const coordinator = createSyncCoordinator({
  lifecycle,
  hashPayload: (json: string) => sha256Hex(crypto.subtle, json),
  onManifestUnavailable: (error) => manifestOutages.push(String(error)),
});
const baseUrl = location.origin;
let session: any = null;
const summarize = (snapshot: any) => snapshot && ({ status: snapshot.status, error: snapshot.error, lastSyncedAt: snapshot.lastSyncedAt, ids: snapshot.records.map((record: any) => record.id).sort() });

(window as any).__tasks = {
  reports, manifestOutages,
  open: async (actorId: string) => {
    const ok = await lifecycle.setScope({ baseUrl, actorId });
    session = coordinator.openScope({ baseUrl, actorId, scopeKey: actorId, client: createSyncClient(createOrbitApiClient({ baseUrl })) });
    return ok;
  },
  status: () => lifecycle.status(),
  read: async () => summarize(await session.readCollection("task")),
  sync: async () => { const request = session.synchronize("task", { reason: "explicit" }); await request.started; return summarize(await request.promise); },
  signOut: async () => { session?.deactivate(); session = null; return lifecycle.setScope(null); },
  keyExists: async (digest: string) => new Promise((resolve, reject) => {
    const open = indexedDB.open("orbit-sync-keys", 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("keys")) open.result.createObjectStore("keys"); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const get = open.result.transaction("keys", "readonly").objectStore("keys").get("orbit.sync.key." + digest);
      get.onsuccess = () => { open.result.close(); resolve(get.result !== undefined); };
      get.onerror = () => reject(get.error);
    };
  }),
};
(window as any).__ready = true;
`;

async function bundle() {
  const common = {
    absWorkingDir: app, bundle: true, write: false, format: "iife" as const, platform: "browser" as const,
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "web-tasks-test",
      setup(build: { onResolve: Function; onLoad: Function }) {
        build.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        build.onResolve({ filter: /SQLiteModule\.node$/ }, () => ({ path: "node-stub", namespace: "web-tasks-test" }));
        build.onLoad({ filter: /.*/, namespace: "web-tasks-test" }, () => ({ contents: "module.exports = { default: null };", loader: "js" }));
      },
    }],
  };
  const appJs = (await build({ ...common, stdin: { contents: ENTRY, loader: "ts", resolveDir: app } })).outputFiles?.[0]?.text ?? "";
  const workerBuild = await build({
    ...common, entryPoints: [path.join(path.dirname(require.resolve("expo-sqlite/package.json")), "web", "worker.ts")],
    loader: { ".wasm": "file" }, publicPath: "/", outdir: "/", assetNames: "[name]-[hash]",
  });
  const workerJs = workerBuild.outputFiles?.find((file) => file.path.endsWith(".js"))?.text ?? "";
  const wasm = Buffer.from(workerBuild.outputFiles?.find((file) => file.path.endsWith(".wasm"))?.contents ?? new Uint8Array());
  return { appJs, workerJs, wasm };
}

/** A scripted sync host: lease, manifest (ETag/304), domain pages; notes are granted but the browser must never bind them. */
async function serve(files: Awaited<ReturnType<typeof bundle>>, state: HostState) {
  const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (type: string, body: string | Buffer) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    if (url.pathname === "/") return send("text/html; charset=utf-8", "<!doctype html><html><body><script src=\"/app.js\"></script></body></html>");
    if (url.pathname === "/app.js") return send("text/javascript", files.appJs);
    if (url.pathname.split("/").at(-1) === "worker") return send("text/javascript", files.workerJs);
    if (url.pathname.endsWith(".wasm")) return send("application/wasm", files.wasm);
    if (url.pathname.startsWith("/api/sync/")) state.requests.push(url.pathname + (url.pathname.includes("/domains/") ? (url.searchParams.has("cursor") ? "?cursor" : "?first") : ""));
    const now = Date.now();
    const grants = ["notes", "tasks", "personal-schedule"].map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: state.epoch }));
    if (url.pathname === "/api/sync/lease") {
      if (state.failLease) return json(res, 503, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "sync host down" } });
      return json(res, 200, { success: true, data: {
        version: 2, baseUrl: url.searchParams.get("baseUrl"), actorId: ACTOR, subject: ACTOR,
        sessionExpiresAt: now + 30 * 86_400_000, offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now, grants, databaseKeyRef: "key-ref",
      } });
    }
    if (url.pathname === "/api/sync/manifest") {
      const etag = `W/"${createHash("sha256").update(JSON.stringify([state.epoch, state.version])).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
      return json(res, 200, { success: true, data: { registryVersion: 1, domains: grants.map((grant) => ({
        domainId: grant.domainId, schemaVersion: 1, workspaceId: W, authorizationEpoch: state.epoch, generation: `gen-${state.epoch}`,
        watermark: String((state.rows[grant.domainId] ?? []).length), history: "complete", membershipCursor: null,
      })) } }, { ETag: etag });
    }
    const page = url.pathname.match(/^\/api\/sync\/domains\/([^/]+)$/);
    if (page) {
      const domainId = decodeURIComponent(page[1]!);
      const rows = state.rows[domainId] ?? [];
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

const task = (id: string) => ({ id, revision: `rev:${id}`, payload: { id, task: { id, title: id, status: "open", accountId: ACTOR } } });

test("Web tasks mirror: whitelist binding, manifest-gated delta, offline stale, empty-mirror failure, sign-out purge", { timeout: 120_000 }, async (t) => {
  const state: HostState = { epoch: "e1", version: 1, failLease: false, requests: [], rows: { tasks: [task("t1"), task("t2")], notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }] } };
  const files = await bundle();
  const { server, base } = await serve(files, state);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  t.after(async () => { await browser?.close(); server.close(); });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
  await page.goto(`${base}/`);

  // 1. First sync: lease → manifest → pages for the browser whitelist only (notes are granted but never bound).
  assert.equal(await call(page, `window.__tasks.open(${JSON.stringify(ACTOR)})`), true);
  const first = await call<{ status: string; ids: string[]; error: string | null }>(page, "window.__tasks.sync()");
  assert.equal(first.error, null);
  assert.deepEqual(first.ids, ["t1", "t2"]);
  assert.equal(first.status, "fresh");
  assert.deepEqual(state.requests, ["/api/sync/lease", "/api/sync/manifest", "/api/sync/domains/tasks?first", "/api/sync/domains/personal-schedule?first"]);

  // 2. Unchanged host: the second explicit sync is lease + manifest (304 replayed from the client cache), no page.
  state.requests.length = 0;
  const second = await call<{ status: string; ids: string[]; error: string | null }>(page, "window.__tasks.sync()");
  assert.equal(second.error, null);
  assert.deepEqual(second.ids, ["t1", "t2"]);
  assert.deepEqual(state.requests, ["/api/sync/lease", "/api/sync/manifest"]);
  assert.deepEqual(await call(page, "window.__tasks.manifestOutages"), []);

  // 3. Only tasks moved: manifest 200, one tasks page from the stored cursor, nothing for personal-schedule.
  state.rows.tasks!.push(task("t3"));
  state.version += 1;
  state.requests.length = 0;
  const third = await call<{ ids: string[] }>(page, "window.__tasks.sync()");
  assert.deepEqual(third.ids, ["t1", "t2", "t3"]);
  assert.deepEqual(state.requests, ["/api/sync/lease", "/api/sync/manifest", "/api/sync/domains/tasks?cursor"]);

  // 4. Offline: the mirror stays readable and says so.
  await context.setOffline(true);
  const offline = await call<{ status: string; ids: string[]; error: string | null }>(page, "window.__tasks.sync()");
  assert.equal(offline.status, "stale");
  assert.deepEqual(offline.ids, ["t1", "t2", "t3"]);
  assert.ok(offline.error, "the failed refresh is reported next to the local content");
  assert.deepEqual(await call<{ ids: string[] }>(page, "window.__tasks.read()").then((snapshot) => snapshot.ids), ["t1", "t2", "t3"]);
  await context.setOffline(false);

  // 5. Sign-out purges the key and the file; the next session starts empty.
  const digest = await call<string>(page, "window.__tasks.status().scopeDigest");
  assert.equal(await call(page, `window.__tasks.keyExists(${JSON.stringify(digest)})`), true);
  assert.equal(await call(page, "window.__tasks.signOut()"), true);
  assert.equal(await call(page, `window.__tasks.keyExists(${JSON.stringify(digest)})`), false, "sign-out deletes the mirror key");
  assert.equal(await call(page, `window.__tasks.open(${JSON.stringify(ACTOR)})`), true);
  assert.deepEqual(await call<{ ids: string[] }>(page, "window.__tasks.read()").then((snapshot) => snapshot.ids), []);

  // 6. Empty mirror and a failing download: a failure, never an empty list presented as content.
  state.failLease = true;
  const failed = await call<{ status: string; ids: string[]; error: string | null }>(page, "window.__tasks.sync()");
  assert.equal(failed.status, "failure");
  assert.deepEqual(failed.ids, []);
  assert.ok(failed.error);
  state.failLease = false;
  const recovered = await call<{ status: string; ids: string[] }>(page, "window.__tasks.sync()");
  assert.equal(recovered.status, "fresh");
  assert.deepEqual(recovered.ids, ["t1", "t2", "t3"]);

  assert.deepEqual(await call(page, "window.__tasks.reports"), []);
  assert.deepEqual(pageErrors, []);
});
