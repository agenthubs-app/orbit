import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Real-browser acceptance for notes in the Web mirror (sprint 0125): the App's
// own coordinator + Web lifecycle + sync client against a scripted sync host,
// with the OPFS files read back byte for byte from the page.
// SC-0125-01: note bodies are AES-GCM ciphertext at rest; record ids are the documented plaintext metadata.
// SC-0125-02: switching account or server erases the previous identity's notes; a lease without notes retires them.
// SC-0125-04: a non-secure context stays online-only, touches no OPFS/IndexedDB and reports no error.
// Plus the upgrade path: a browser whose mirror already holds tasks starts pulling notes with no rebuild.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(app, "package.json"));
const A = "actor-notes-a";
const B = "actor-notes-b";
const W = "workspace-notes";

type Row = { id: string; revision: string; payload: Record<string, unknown> };
interface HostState {
  actor: string;
  epoch: string;
  version: number;
  grants: string[];
  rows: Record<string, Record<string, Row[]>>;
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
const coordinator = createSyncCoordinator({ lifecycle, hashPayload: (json: string) => sha256Hex(crypto.subtle, json) });
let session: any = null;
const summarize = (snapshot: any) => snapshot && ({ status: snapshot.status, error: snapshot.error, lastSyncedAt: snapshot.lastSyncedAt, ids: snapshot.records.map((record: any) => record.id).sort(), titles: snapshot.records.map((record: any) => record.payload && (record.payload.title ?? record.payload.task?.title)).sort() });
const latin1 = (bytes: Uint8Array) => { let text = ""; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return text; };

async function opfsFiles(): Promise<{ name: string; text: string }[]> {
  const root = await navigator.storage.getDirectory();
  const files: { name: string; text: string }[] = [];
  async function walk(directory: any, prefix: string) {
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === "directory") await walk(handle, prefix + name + "/");
      else files.push({ name: prefix + name, text: latin1(new Uint8Array(await (await handle.getFile()).arrayBuffer())) });
    }
  }
  await walk(root, "");
  return files;
}

(window as any).__notes = {
  reports,
  secure: () => window.isSecureContext,
  open: async (actorId: string, baseUrl = location.origin) => {
    session?.deactivate();
    session = coordinator.openScope({ baseUrl, actorId, scopeKey: actorId + baseUrl, client: createSyncClient(createOrbitApiClient({ baseUrl })) });
    await session.readCollection("note");
    return lifecycle.status();
  },
  status: () => lifecycle.status(),
  read: async (kind: string) => summarize(await session.readCollection(kind)),
  sync: async (kind: string) => { const request = session.synchronize(kind, { reason: "explicit" }); await request.started; return summarize(await request.promise); },
  raw: () => lifecycle.withDatabase(null, (database) => database.all("SELECT domain_id, record_id, payload_json FROM sync_records ORDER BY domain_id, record_id")),
  /** Every byte of every OPFS file, searched for the given strings. Call before any open() on a fresh page load. */
  scan: async (needles: string[]) => {
    let lastError = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const files = await opfsFiles();
        return { files: files.length, bytes: files.reduce((sum, file) => sum + file.text.length, 0), hits: Object.fromEntries(needles.map((needle) => [needle, files.some((file) => file.text.includes(needle))])) };
      } catch (error) { lastError = String(error); await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    throw new Error("OPFS stayed locked: " + lastError);
  },
  hasOpfsApi: () => typeof (navigator as any).storage?.getDirectory === "function",
  idbNames: async () => typeof (indexedDB as any).databases === "function" ? (await (indexedDB as any).databases()).map((entry: any) => entry.name) : null,
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
      name: "web-notes-test",
      setup(build: { onResolve: Function; onLoad: Function }) {
        build.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        build.onResolve({ filter: /SQLiteModule\.node$/ }, () => ({ path: "node-stub", namespace: "web-notes-test" }));
        build.onLoad({ filter: /.*/, namespace: "web-notes-test" }, () => ({ contents: "module.exports = { default: null };", loader: "js" }));
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

/** Scripted sync host: the signed-in actor is state.actor; grants and rows are per test step. */
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
    const grants = state.grants.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: state.epoch }));
    const rowsOf = (domainId: string) => state.rows[state.actor]?.[domainId] ?? [];
    if (url.pathname === "/api/sync/lease") {
      return json(res, 200, { success: true, data: {
        version: 2, baseUrl: url.searchParams.get("baseUrl"), actorId: state.actor, subject: state.actor,
        sessionExpiresAt: now + 30 * 86_400_000, offlineReadExpiresAt: now + 7 * 86_400_000, lastVerifiedAt: now, grants, databaseKeyRef: "key-ref",
      } });
    }
    if (url.pathname === "/api/sync/manifest") {
      const etag = `W/"${createHash("sha256").update(JSON.stringify([state.actor, state.epoch, state.version, state.grants])).digest("hex")}"`;
      if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
      return json(res, 200, { success: true, data: { registryVersion: 1, domains: grants.map((grant) => ({
        domainId: grant.domainId, schemaVersion: 1, workspaceId: W, authorizationEpoch: state.epoch, generation: `gen-${state.epoch}`,
        watermark: String(rowsOf(grant.domainId).length), history: "complete", membershipCursor: null,
      })) } }, { ETag: etag });
    }
    const page = url.pathname.match(/^\/api\/sync\/domains\/([^/]+)$/);
    if (page) {
      const domainId = decodeURIComponent(page[1]!);
      if (!state.grants.includes(domainId)) return json(res, 403, { success: false, error: { code: "FORBIDDEN", message: "not granted" } });
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
    res.writeHead(404); res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { server, port: address.port, base: `http://127.0.0.1:${address.port}` };
}

async function call<T>(page: Page, expression: string): Promise<T> {
  await page.waitForFunction(() => (window as any).__ready, null, { timeout: 20_000 });
  return page.evaluate(`(async () => (${expression}))()`) as Promise<T>;
}

const note = (actor: string, id: string, secret: string): Row => ({ id, revision: `rev:${id}`, payload: {
  id, accountId: actor, ownerUserId: actor, title: `title ${secret}`, body: `body ${secret} (third-party detail)`,
  manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z",
} });
const task = (actor: string, id: string): Row => ({ id, revision: `rev:${id}`, payload: { id, task: { id, title: id, status: "open", accountId: actor } } });

type Snapshot = { status: string; error: string | null; ids: string[]; titles: string[] };
type Scan = { files: number; bytes: number; hits: Record<string, boolean> };

test("Web notes mirror: ciphertext at rest in OPFS, upgrade pulls notes without a rebuild, switch and revocation erase notes", { timeout: 180_000 }, async (t) => {
  const state: HostState = {
    actor: A, epoch: "e1", version: 1, grants: ["tasks", "personal-schedule"], requests: [],
    rows: {
      [A]: { tasks: [task(A, "task-a1")], notes: [note(A, "note-a1", "SECRET-A1-7f3c"), note(A, "note-a2", "SECRET-A2-91be")] },
      [B]: { tasks: [], notes: [note(B, "note-b1", "SECRET-B1-44d0")] },
    },
  };
  const files = await bundle();
  const { server, base } = await serve(files, state);
  let browser: Browser | null = null;
  t.after(async () => { await browser?.close(); server.close(); });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200)); });
  await page.goto(`${base}/`);

  // 0. The whitelist now carries notes.
  const opened = await call<{ mode: string; domains: string[] }>(page, `window.__notes.open(${JSON.stringify(A)})`);
  assert.equal(opened.mode, "local-mirror");
  assert.deepEqual(opened.domains, ["notes", "tasks", "personal-schedule", "event-registrations", "registered-events", "event-published-results", "contacts", "dashboard-graph", "inbox-notifications", "ai-sessions", "ai-session-messages"]);

  // 1. An existing browser: its mirror holds tasks, and the server has not granted notes yet.
  assert.deepEqual((await call<Snapshot>(page, "window.__notes.sync('task')")).ids, ["task-a1"]);
  assert.deepEqual(state.requests, ["/api/sync/lease", "/api/sync/manifest", "/api/sync/domains/tasks?first", "/api/sync/domains/personal-schedule?first"]);

  // 2. Notes granted: the next sync pulls the notes domain from its first page; tasks cost nothing (no reset, no rebuild).
  state.grants = ["notes", "tasks", "personal-schedule"];
  state.requests.length = 0;
  const pulled = await call<Snapshot>(page, "window.__notes.sync('note')");
  assert.equal(pulled.status, "fresh");
  assert.equal(pulled.error, null);
  assert.deepEqual(pulled.ids, ["note-a1", "note-a2"]);
  assert.deepEqual(pulled.titles, ["title SECRET-A1-7f3c", "title SECRET-A2-91be"]);
  assert.deepEqual(state.requests, ["/api/sync/lease", "/api/sync/manifest", "/api/sync/domains/notes?first"], "only the new domain is downloaded");
  assert.deepEqual((await call<Snapshot>(page, "window.__notes.read('task')")).ids, ["task-a1"], "the existing tasks mirror is untouched");

  // 3. SC-01, SQL view: payload_json of every note row is AES-GCM ciphertext; record ids are plaintext metadata.
  const raw = await call<Array<{ domain_id: string; record_id: string; payload_json: string }>>(page, "window.__notes.raw()");
  const noteRows = raw.filter((row) => row.domain_id === "notes");
  assert.deepEqual(noteRows.map((row) => row.record_id), ["note-a1", "note-a2"]);
  for (const row of noteRows) {
    assert.match(row.payload_json, /^orbit-aesgcm-v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/, `${row.record_id} is not encrypted`);
    assert.ok(!row.payload_json.includes("SECRET"), `${row.record_id} leaked plaintext`);
  }
  const a1Cipher = noteRows[0]!.payload_json;

  // 4. SC-01, disk view: reload (the worker releases its access handles) and read every OPFS byte.
  const digestA = await call<string>(page, "window.__notes.status().scopeDigest");
  await page.reload();
  const atRest = await call<Scan>(page, `window.__notes.scan(["SECRET-A1-7f3c", "SECRET-A2-91be", "third-party detail", "note-a1", "note-a2", ${JSON.stringify(a1Cipher.slice(16, 56))}])`);
  assert.ok(atRest.files > 0 && atRest.bytes > 0, "the mirror lives in OPFS");
  assert.equal(atRest.hits["note-a1"], true, "positive control: plaintext metadata (record id) is found by the scan");
  assert.equal(atRest.hits[a1Cipher.slice(16, 56)], true, "positive control: the ciphertext itself is on disk");
  for (const secret of ["SECRET-A1-7f3c", "SECRET-A2-91be", "third-party detail"]) assert.equal(atRest.hits[secret], false, `${secret} must not be on disk in clear`);

  // 5. Offline after reload: the notes stay readable from the mirror and the failed refresh is reported.
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);
  assert.equal(await call(page, "window.__notes.status().scopeDigest"), digestA);
  await context.setOffline(true);
  const offline = await call<Snapshot>(page, "window.__notes.sync('note')");
  assert.equal(offline.status, "stale");
  assert.ok(offline.error);
  assert.deepEqual(offline.ids, ["note-a1", "note-a2"]);
  await context.setOffline(false);

  // 6. SC-02 revocation: a lease without notes (after a reload, so the previous grant comes from the stored lease) retires the domain.
  await page.reload();
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);
  state.grants = ["tasks", "personal-schedule"];
  state.version += 1;
  state.requests.length = 0;
  const revoked = await call<Snapshot | null>(page, "window.__notes.sync('note')");
  assert.deepEqual(revoked?.ids ?? [], [], "revoked notes are no longer readable");
  assert.ok(!state.requests.includes("/api/sync/domains/notes?first") && !state.requests.includes("/api/sync/domains/notes?cursor"), "a revoked domain is not pulled");
  const afterRevoke = await call<Array<{ domain_id: string; record_id: string }>>(page, "window.__notes.raw()");
  assert.deepEqual(afterRevoke.filter((row) => row.domain_id === "notes"), [], "the notes rows are deleted, not only hidden");
  assert.deepEqual(afterRevoke.filter((row) => row.domain_id === "tasks").map((row) => row.record_id), ["task-a1"], "revoking notes leaves tasks alone");

  await page.reload();
  const afterRevokeDisk = await call<Scan>(page, `window.__notes.scan(["note-a1", "note-a2", ${JSON.stringify(a1Cipher.slice(16, 56))}, "task-a1"])`);
  assert.equal(afterRevokeDisk.hits["task-a1"], true, "positive control: the tasks rows are still on disk");
  assert.deepEqual([afterRevokeDisk.hits["note-a1"], afterRevokeDisk.hits["note-a2"], afterRevokeDisk.hits[a1Cipher.slice(16, 56)]], [false, false, false], "revoked note rows leave no bytes behind in freed pages");
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);

  // 7. Re-granted: pulled again from the first page.
  state.grants = ["notes", "tasks", "personal-schedule"];
  state.version += 1;
  assert.deepEqual((await call<Snapshot>(page, "window.__notes.sync('note')")).ids, ["note-a1", "note-a2"]);

  // 8. SC-02 account switch in the same page session: B's session erases A's database and key; B sees only B's note.
  state.actor = B;
  await call(page, `window.__notes.open(${JSON.stringify(B)})`);
  const digestB = await call<string>(page, "window.__notes.status().scopeDigest");
  assert.notEqual(digestB, digestA);
  assert.equal(await call(page, `window.__notes.keyExists(${JSON.stringify(digestA)})`), false, "A's key is deleted on the switch");
  const bNotes = await call<Snapshot>(page, "window.__notes.sync('note')");
  assert.deepEqual(bNotes.ids, ["note-b1"]);
  await page.reload();
  const afterSwitch = await call<Scan>(page, `window.__notes.scan(["note-a1", "note-a2", ${JSON.stringify(a1Cipher.slice(16, 56))}, "note-b1"])`);
  assert.equal(afterSwitch.hits["note-b1"], true, "positive control: B's mirror is on disk");
  for (const gone of ["note-a1", "note-a2", a1Cipher.slice(16, 56)]) assert.equal(afterSwitch.hits[gone], false, `${gone.slice(0, 12)} must not survive the account switch`);

  // 9. SC-02 account switch on a fresh page: B's session ended without a sign-out (expired cookie, 30-day
  // offline window over), so B's scope is never opened again; A signs in. B's notes must not stay behind.
  state.actor = A;
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);
  const digestA2 = await call<string>(page, "window.__notes.status().scopeDigest");
  assert.equal(digestA2, digestA);
  assert.equal(await call(page, `window.__notes.keyExists(${JSON.stringify(digestB)})`), false, "B's key is deleted when A opens a fresh page");
  assert.deepEqual((await call<Snapshot>(page, "window.__notes.sync('note')")).ids, ["note-a1", "note-a2"]);
  await page.reload();
  const afterFreshSwitch = await call<Scan>(page, `window.__notes.scan(["note-b1", "note-a1"])`);
  assert.deepEqual(afterFreshSwitch.hits, { "note-b1": false, "note-a1": true }, "only the signed-in identity's mirror is on disk");

  // 10. SC-02 server switch in the same page session: the same actor on another server gets another database; A's notes are erased.
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);
  await call(page, `window.__notes.open(${JSON.stringify(A)}, "https://other-server.example")`);
  assert.equal(await call(page, `window.__notes.keyExists(${JSON.stringify(digestA)})`), false, "A's key is deleted when the server changes");
  await page.reload();
  const afterServer = await call<Scan>(page, `window.__notes.scan(["note-a1", "note-a2", "SECRET-A1-7f3c"])`);
  assert.deepEqual(afterServer.hits, { "note-a1": false, "note-a2": false, "SECRET-A1-7f3c": false }, "nothing of A's notes survives the server switch");
  await call(page, `window.__notes.open(${JSON.stringify(A)})`);
  assert.deepEqual((await call<Snapshot | null>(page, "window.__notes.read('note')"))?.ids ?? [], [], "back on the first server, A starts from an empty mirror");

  assert.deepEqual(await call(page, "window.__notes.reports"), []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter((text) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(text)), []);
});

test("Web notes mirror: a non-secure context stays online-only, stores nothing, and reports no error", { timeout: 120_000 }, async (t) => {
  const state: HostState = { actor: A, epoch: "e1", version: 1, grants: ["notes", "tasks", "personal-schedule"], requests: [], rows: { [A]: { notes: [note(A, "note-a1", "SECRET-A1-7f3c")] } } };
  const files = await bundle();
  const { server, port } = await serve(files, state);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  t.after(async () => { await browser?.close(); server.close(); });
  // A hostname that is not localhost over plain HTTP: what a phone sees on a LAN IP.
  browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP insecure-orbit.test 127.0.0.1"] });
  context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200)); });
  await page.goto(`http://insecure-orbit.test:${port}/`);

  assert.equal(await call(page, "window.__notes.secure()"), false, "the page really is a non-secure context");
  assert.deepEqual(await call(page, `window.__notes.open(${JSON.stringify(A)})`), { mode: "online-only", reason: "insecure-context" });
  const synced = await call<Snapshot | null>(page, "window.__notes.sync('note')");
  assert.ok(synced === null || synced.ids.length === 0, "nothing is mirrored");
  assert.deepEqual(state.requests.filter((request) => request.startsWith("/api/sync/domains/")), [], "no domain page is downloaded for a mirror that cannot exist");
  assert.equal(await call(page, "window.__notes.hasOpfsApi()"), false, "OPFS is not exposed to a non-secure context");
  const names = await call<string[] | null>(page, "window.__notes.idbNames()");
  assert.ok(names === null || !names.includes("orbit-sync-keys"), "no key store is created");
  assert.deepEqual(await call(page, "window.__notes.reports"), []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});
