import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import config from "../app.config";
import { readSnapshot, writeSnapshot, clearSnapshots } from "../src/data/snapshot-store";
import { syncLifecycle } from "../src/data/sync/sync-lifecycle";

const scope = { baseUrl: "https://first.example", actorId: "account-private-fixture" };

function fixture() {
  const events: string[] = [];
  const keys = new Map<string, string>();
  const files = new Map<string, DatabaseSync>();
  const logs: unknown[][] = [];
  const options: unknown[] = [];
  const state = { keyDeleteFails: false, fileDeleteFails: false, corrupt: false, cipher: true, keyWriteFails: false, closeFails: false };
  const native = {
    crypto: {
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_: string, value: string) => createHash("sha256").update(value).digest("hex"),
      getRandomBytesAsync: async (size: number) => { events.push("random"); return randomBytes(size); },
    },
    secureStore: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
      async getItemAsync(key: string, option: unknown) { options.push(option); return keys.get(key) ?? null; },
      async setItemAsync(key: string, value: string, option: unknown) {
        options.push(option);
        if (state.keyWriteFails && key.startsWith("orbit.sync.key.")) throw Error("secret-shaped-key-and-payload");
        keys.set(key, value); events.push("key-stored");
      },
      async deleteItemAsync(key: string, option: unknown) {
        options.push(option); events.push("key-delete");
        if (state.keyDeleteFails) throw Error("secret-shaped-key-and-payload");
        keys.delete(key);
      },
    },
    sqlite: {
      async listDatabaseNames() { events.push("list"); return [...files.keys()]; },
      async deleteDatabaseAsync(name: string) {
        events.push(`delete:${name}`);
        if (state.fileDeleteFails && name !== "orbit-cache.db") throw Error("secret-shaped-key-and-payload");
        files.get(name)?.close(); files.delete(name);
      },
      async openDatabaseAsync(name: string) {
        events.push(`open:${name}`);
        let keyed = false;
        const database = files.get(name) ?? new DatabaseSync(":memory:");
        files.set(name, database);
        return {
          async execAsync(sql: string) {
            if (sql.startsWith("PRAGMA key")) {
              assert.ok(/^PRAGMA key = "x'[a-f0-9]{64}'";$/u.test(sql), "key must be a validated 256-bit raw key");
              assert.ok([...keys.values()].some(key => sql.includes(key)), "persist key before opening schema");
              keyed = true; events.push("key-applied"); return;
            }
            assert.equal(keyed, true, "no SQL before key");
            events.push(sql);
            if (state.corrupt) throw Error("secret-shaped-key-and-payload");
            database.exec(sql);
          },
          async getFirstAsync(sql: string, params: any[] = []) {
            assert.equal(keyed, true);
            if (sql === "PRAGMA cipher_version") { events.push("cipher-check"); return state.cipher ? { cipher_version: "4.0" } : null; }
            return database.prepare(sql).get(...params) ?? null;
          },
          async getAllAsync(sql: string, params: any[] = []) { return database.prepare(sql).all(...params); },
          async runAsync(sql: string, params: any[] = []) { return database.prepare(sql).run(...params); },
          async closeAsync() { events.push("close"); if (state.closeFails) throw Error("injected close failure"); },
        };
      },
    },
  };
  return { native, events, keys, files, logs, options, state };
}

async function lifecycle(t: { after(fn: () => void): void }, platform = "ios") {
  const f = fixture();
  t.after(() => { for (const database of f.files.values()) database.close(); });
  const module = await import("../src/data/sync/sync-lifecycle").catch(() => null);
  assert.equal(typeof module?.createSyncLifecycle, "function", "native lifecycle coordinator must exist");
  const coordinator = module!.createSyncLifecycle({
    platform,
    loadNative: async () => f.native as any,
    report: (...args: unknown[]) => f.logs.push(args),
  });
  return { ...f, coordinator };
}

test("native build requests SQLCipher support", () => {
  assert.ok(config.plugins?.some(plugin => Array.isArray(plugin) && plugin[0] === "expo-sqlite" && plugin[1].useSQLCipher === true));
});

test("scope keys are random, persisted this-device-only, with irreversible file names and key-before-schema order", async t => {
  const f = await lifecycle(t);
  assert.equal(await f.coordinator.setScope(scope), true);
  const firstKey = [...f.keys.values()][0];
  assert.equal(firstKey?.length, 64);
  const name = [...f.files.keys()][0];
  assert.match(name!, /^orbit-sync-[a-f0-9]{64}\.db$/u);
  assert.ok(!name!.includes(scope.actorId));
  assert.ok(f.events.indexOf("key-stored") < f.events.indexOf("key-applied"));
  assert.ok(f.events.indexOf("key-applied") < f.events.indexOf("cipher-check"));
  assert.ok(f.events.indexOf("cipher-check") < f.events.indexOf("BEGIN IMMEDIATE"));
  assert.ok(f.options.every(option => (option as any).keychainAccessible === 7));
  await f.coordinator.setScope(scope);
  assert.equal(f.events.filter(event => event === "random").length, 1);
  await f.coordinator.setScope({ ...scope, actorId: "other-private-fixture" });
  assert.ok([...f.keys.values()][0] !== firstKey, "each scope uses independent randomness");
  assert.ok(!f.files.has(name!));
});

test("legacy plaintext is deleted unopened and cannot migrate unverifiable payloads", async t => {
  const f = await lifecycle(t);
  f.files.set("orbit-cache.db", new DatabaseSync(":memory:"));
  await f.coordinator.setScope(scope);
  assert.equal(f.files.has("orbit-cache.db"), false);
  assert.equal(f.events[0], "delete:orbit-cache.db");
  assert.equal(f.events.includes("open:orbit-cache.db"), false);
  const rows = await f.coordinator.withDatabase(scope, db => db.all("SELECT * FROM legacy_api_snapshots"));
  assert.deepEqual(rows, []);
});

test("logout closes the handle and purges all mirror, outbox, cursor, snapshot data and key", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  await f.coordinator.withDatabase(scope, db => db.run("INSERT INTO sync_cursors VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["workspace", "notes", "fixture-e1", "cursor", "2026-09-16T00:00:00Z", "complete", "complete", "g1"]));
  const name = [...f.files.keys()][0]!;
  assert.equal(await f.coordinator.setScope(null), true);
  assert.equal(f.files.size, 0);
  assert.equal(f.keys.size, 0);
  assert.ok(f.events.indexOf("close") < f.events.indexOf("key-delete"));
  assert.ok(f.events.indexOf("key-delete") < f.events.lastIndexOf(`delete:${name}`));
  assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
});

test("key deletion failure blocks switching even after the old handle was closed", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  f.state.keyDeleteFails = true;
  const next = { ...scope, actorId: "other-private-fixture" };
  assert.equal(await f.coordinator.setScope(next), false);
  assert.equal(await f.coordinator.setScope(next), false);
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1);
  assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
  f.state.keyDeleteFails = false;
  assert.equal(await f.coordinator.setScope(next), true);
});

test("pending key cleanup survives process restart and blocks new identity until recovery", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  const oldName = [...f.files.keys()][0]!;
  f.state.keyDeleteFails = true;
  assert.equal(await f.coordinator.setScope(null), false);
  const restarted = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({
    platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args),
  });
  const next = { ...scope, actorId: "other-private-fixture" };
  assert.equal(await restarted.setScope(next), false);
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1);
  assert.equal(await restarted.withDatabase(next, async () => "private"), null);
  const marker = f.keys.get("orbit.sync.pending-cleanup");
  assert.ok(typeof marker === "string" && /^[a-f0-9]{64}$/u.test(marker));
  assert.ok(!marker!.includes(scope.actorId));
  f.state.keyDeleteFails = false;
  assert.equal(await restarted.setScope(next), true);
  assert.equal(f.files.has(oldName), false);
  assert.equal(f.keys.has("orbit.sync.pending-cleanup"), false);
  assert.equal(await restarted.withDatabase(next, async () => "ready"), "ready");
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
  assert.ok(!JSON.stringify(f.logs).includes(scope.actorId));
});

test("unavailable cleanup storage cannot bypass a pending key after restart", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  f.state.keyDeleteFails = true;
  await f.coordinator.setScope(null);
  const restarted = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({
    platform: "ios", loadNative: async () => { throw Error("secret-shaped-key-and-payload"); }, report: (...args) => f.logs.push(args),
  });
  assert.equal(await restarted.setScope({ ...scope, actorId: "other-private-fixture" }), false);
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
});

test("file deletion failure after crypto erasure permits a separate scope but never reopens the orphan", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  const name = [...f.files.keys()][0]!;
  f.state.fileDeleteFails = true;
  assert.equal(await f.coordinator.setScope(null), true);
  assert.equal(f.keys.size, 0);
  assert.ok(f.files.has(name));
  f.state.fileDeleteFails = false;
  assert.equal(await f.coordinator.setScope({ ...scope, actorId: "other-private-fixture" }), true);
  assert.equal(f.events.filter(event => event === `open:${name}`).length, 1);
  assert.ok(f.logs.length > 0);
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
});

test("corruption locks the scope without erasing recovery evidence and stays online-only", async t => {
  const f = await lifecycle(t);
  f.state.corrupt = true;
  assert.equal(await f.coordinator.setScope(scope), true);
  assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
  assert.equal(f.keys.size, 1);
  assert.equal(f.files.size, 1);
  assert.equal(f.coordinator.isScopeReadable(scope), false);
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1);
  assert.ok(!JSON.stringify(f.logs).includes(scope.actorId));
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
});

test("initialization failure locks storage while preserving the keyed database for recovery", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  await f.coordinator.withDatabase(scope, db => db.run("INSERT INTO legacy_api_snapshots VALUES(?,?,?,?)", ["/device/note-drafts", ' { "ink": [1,2] } ', 200, "2026-09-16T00:00:00Z"]));
  const name = [...f.files.keys()][0]!;
  const key = [...f.keys.values()][0]!;
  f.state.corrupt = true;
  const second = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args) });
  await second.setScope(scope);
  assert.equal(f.files.has(name), true, "failed migration must not delete local evidence");
  assert.equal([...f.keys.values()][0], key);
  assert.equal(await second.withDatabase(scope, async () => "private"), null);
  assert.equal(typeof (second as any).isScopeReadable, "function");
  assert.equal((second as any).isScopeReadable(scope), false);
  f.state.corrupt = false;
  const third = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args) });
  await third.setScope(scope);
  assert.equal((third as any).isScopeReadable(scope), true);
  assert.equal((await third.withDatabase(scope, db => db.get<{ payload: string }>("SELECT payload FROM legacy_api_snapshots")))?.payload, ' { "ink": [1,2] } ');
});

test("close failure during initialization cannot turn a same-identity retry into data erasure", async t => {
  const f = await lifecycle(t); await f.coordinator.setScope(scope);
  await f.coordinator.withDatabase(scope, db => db.run("INSERT INTO legacy_api_snapshots VALUES(?,?,?,?)", ["/device/note-drafts", "draft bytes", 200, "2026-09-16T00:00:00Z"]));
  const name = [...f.files.keys()][0]!;
  f.state.corrupt = true; f.state.closeFails = true;
  const second = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args) });
  assert.equal(await second.setScope(scope), false);
  f.state.corrupt = false; f.state.closeFails = false;
  await second.setScope(scope);
  assert.equal(f.files.has(name), true);
  assert.equal(f.files.get(name)!.prepare("SELECT payload FROM legacy_api_snapshots").get()?.payload, "draft bytes");
});

test("a missing key removes orphan payloads before creating the replacement database", async t => {
  const f = await lifecycle(t);
  const digest = createHash("sha256").update(JSON.stringify([scope.baseUrl, scope.actorId])).digest("hex");
  const name = `orbit-sync-${digest}.db`;
  const orphan = new DatabaseSync(":memory:");
  orphan.exec("CREATE TABLE unverifiable (payload TEXT)");
  f.files.set(name, orphan);
  await f.coordinator.setScope(scope);
  assert.ok(f.events.indexOf(`delete:${name}`) < f.events.indexOf(`open:${name}`));
  const rows = await f.coordinator.withDatabase(scope, db => db.all("SELECT name FROM sqlite_master WHERE name = 'unverifiable'"));
  assert.deepEqual(rows, []);
});

test("the same device scope reuses its persisted key on a fresh coordinator", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  const second = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({
    platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args),
  });
  await second.setScope(scope);
  assert.equal(f.events.filter(event => event === "random").length, 1);
  assert.equal(f.keys.size, 1);
});

test("server and workspace switches reject stale scopes; only server/actor changes rotate the file", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope({ ...scope, workspaceId: "first" });
  await f.coordinator.setScope({ ...scope, workspaceId: "second" });
  assert.equal(f.events.filter(event => event === "random").length, 1);
  assert.equal(await f.coordinator.withDatabase({ ...scope, workspaceId: "first" }, async () => "private"), null);
  assert.equal(await f.coordinator.withDatabase({ ...scope, workspaceId: "second" }, async () => "private"), "private");
  await f.coordinator.setScope({ ...scope, baseUrl: "https://second.example" });
  assert.equal(f.events.filter(event => event === "random").length, 2);
  assert.equal(await f.coordinator.withDatabase(scope, async () => "private"), null);
});

test("storage readiness invalidates immediately on transition and normalized server aliases share one key", async t => {
  const f = await lifecycle(t);
  assert.equal(f.coordinator.isScopeReadable(scope), false);
  await f.coordinator.setScope(scope);
  assert.equal(f.coordinator.isScopeReadable(scope), true);
  const change = f.coordinator.setScope({ ...scope, baseUrl: ` ${scope.baseUrl}/ ` });
  assert.equal(f.coordinator.isScopeReadable(scope), false);
  await change;
  assert.equal(f.events.filter(event => event === "random").length, 1);
  assert.equal(f.coordinator.isScopeReadable(scope), true);
  assert.equal(f.coordinator.isScopeReadable({ ...scope, actorId: "other" }), false);
});

test("SQLCipher absence and key storage failures perform no schema writes or plaintext fallback", async t => {
  for (const fault of ["cipher", "keyWriteFails"] as const) {
    const f = await lifecycle(t);
    if (fault === "cipher") f.state.cipher = false;
    else f.state.keyWriteFails = true;
    assert.equal(await f.coordinator.setScope(scope), true);
    assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
    assert.equal(f.events.includes("BEGIN IMMEDIATE"), false);
    assert.equal(f.events.some(event => event.startsWith("CREATE")), false);
    assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
  }
});

test("scope tokens discard stale results and queued writes after logout", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const read = f.coordinator.withDatabase(scope, async () => { started(); await barrier; return "private"; });
  await ready;
  let wrote = false;
  const write = f.coordinator.withDatabase(scope, async () => { wrote = true; });
  const logout = f.coordinator.setScope(null);
  release();
  assert.equal(await read, null);
  await write;
  assert.equal(wrote, false);
  assert.equal(await logout, true);
});

test("Web remains online-only without loading native dependencies", async t => {
  const f = await lifecycle(t, "web");
  assert.equal(await f.coordinator.setScope(scope), true);
  assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
  assert.deepEqual(f.events, []);
});

test("the explicit Web lifecycle entry accepts online sessions without invoking database work", async () => {
  const web = await import("../src/data/sync/sync-lifecycle.web").catch(() => null);
  assert.equal(typeof web?.syncLifecycle?.setScope, "function");
  assert.equal(await web!.syncLifecycle.setScope(scope), true);
  assert.equal(await web!.syncLifecycle.withDatabase(scope, async () => assert.fail("Web database work is forbidden")), null);
});

test("native binding rejects bigint instead of silently losing integer precision", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  const result = await f.coordinator.withDatabase(scope, db => db.get("SELECT ? AS value", [1n]));
  assert.equal(result, null);
  assert.equal(f.logs.length, 1);
});

test("native deletion tolerates missing files and deletes exact SQLite sidecars", async () => {
  const module = await import("../src/data/sync/sync-lifecycle");
  const files = new Set(["orbit-cache.db-wal", "orbit-cache.db-shm", "orbit-cache.db-journal", "unrelated.db"]);
  const removed: string[] = [];
  const remove = (module as any).deleteSyncDatabaseFiles;
  assert.equal(typeof remove, "function");
  await remove("orbit-cache.db", {
    defaultDatabaseDirectory: "/test-only",
    deleteDatabaseAsync: async () => assert.fail("absent main file must not be passed to Expo deletion"),
  }, class {
    constructor(_: string, public name: string) {}
    get exists() { return files.has(this.name); }
    delete() { removed.push(this.name); files.delete(this.name); }
  });
  assert.deepEqual(removed, ["orbit-cache.db-wal", "orbit-cache.db-shm", "orbit-cache.db-journal"]);
  assert.deepEqual([...files], ["unrelated.db"]);
});

test("legacy snapshot interface reads and writes only the active encrypted scope and clears snapshots without purging sync records", async t => {
  const f = await lifecycle(t);
  t.mock.method(syncLifecycle, "withDatabase", f.coordinator.withDatabase);
  await f.coordinator.setScope(scope);
  const result = { data: { title: "private fixture payload" }, status: 200, success: true as const, meta: { featureMode: null, privacy: null, runtimeBoundary: null } };
  await writeSnapshot(scope.baseUrl, scope.actorId, "/api/notes", result);
  const snapshot = await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes");
  assert.deepEqual(snapshot?.result, result);
  assert.ok(snapshot?.syncedAt);
  await writeSnapshot(scope.baseUrl, scope.actorId, "/api/notes", {
    success: false, status: 503, error: { code: "SERVICE_UNAVAILABLE", message: "offline" },
    meta: { featureMode: null, privacy: null, runtimeBoundary: null },
  });
  assert.deepEqual((await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"))?.result, result);
  assert.equal(await readSnapshot(scope.baseUrl, "other", "/api/notes"), null);
  await writeSnapshot(scope.baseUrl, "other", "/api/notes", result);
  assert.equal((await f.coordinator.withDatabase(scope, db => db.all("SELECT * FROM legacy_api_snapshots")))?.length, 1);
  await clearSnapshots();
  assert.equal(await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"), null);
  assert.equal(f.keys.size, 1);
});

test("legacy snapshots isolate active workspaces and preserve each workspace until logout", async t => {
  const f = await lifecycle(t);
  t.mock.method(syncLifecycle, "withDatabase", f.coordinator.withDatabase);
  const first = { ...scope, workspaceId: "first|_%" };
  const second = { ...scope, workspaceId: "second" };
  const result = { data: { title: "workspace A fixture" }, status: 200, success: true as const, meta: { featureMode: null, privacy: null, runtimeBoundary: null } };
  await f.coordinator.setScope(first);
  await writeSnapshot(scope.baseUrl, scope.actorId, "/api/notes", result);
  await f.coordinator.setScope(second);
  assert.equal(await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"), null);
  const secondResult = { ...result, data: { title: "workspace B fixture" } };
  await writeSnapshot(scope.baseUrl, scope.actorId, "/api/notes", secondResult);
  assert.deepEqual((await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"))?.result, secondResult);
  await f.coordinator.setScope(first);
  assert.deepEqual((await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"))?.result, result);
  await f.coordinator.setScope(null);
  for (const workspace of [first, second]) {
    await f.coordinator.setScope(workspace);
    assert.equal(await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"), null);
  }
});

test("clearing snapshots affects only the active workspace, including the default workspace", async t => {
  const f = await lifecycle(t);
  t.mock.method(syncLifecycle, "withDatabase", f.coordinator.withDatabase);
  const workspaces = [scope, { ...scope, workspaceId: "null" }, { ...scope, workspaceId: "first|_%" }];
  const result = { data: { title: "private fixture" }, status: 200, success: true as const, meta: { featureMode: null, privacy: null, runtimeBoundary: null } };
  for (const workspace of workspaces) {
    await f.coordinator.setScope(workspace);
    await writeSnapshot(scope.baseUrl, scope.actorId, "/api/notes", result);
  }
  await f.coordinator.withDatabase(workspaces[2]!, db => db.run("INSERT INTO sync_cursors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["first|_%", "notes", "fixture-e1", "cursor", "2026-09-16T00:00:00Z", "complete", "complete", "g1", null]));
  for (let index = 0; index < workspaces.length; index++) {
    await f.coordinator.setScope(workspaces[index]!);
    assert.deepEqual((await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"))?.result, result);
    await clearSnapshots();
    assert.equal(await readSnapshot(scope.baseUrl, scope.actorId, "/api/notes"), null);
    const remaining = await f.coordinator.withDatabase(workspaces[index]!, db => db.all("SELECT * FROM legacy_api_snapshots"));
    assert.equal(remaining?.length, workspaces.length - index - 1);
  }
  assert.equal((await f.coordinator.withDatabase(workspaces[2]!, db => db.all("SELECT * FROM sync_cursors")))?.length, 1);
  assert.equal(f.keys.size, 1);
});

// Sprint 0130: the session restore suspends instead of purging.
test("suspending for a re-validation keeps the same identity's file, key and rows, and pauses reads until it is confirmed", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  assert.equal(await f.coordinator.withDatabase(scope, async db => { await db.execute("CREATE TABLE qa_marker (value TEXT)"); await db.run("INSERT INTO qa_marker VALUES (?)", ["kept"]); return true; }), true);
  const name = [...f.files.keys()][0]!;
  const key = [...f.keys.values()][0];
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const inFlight = f.coordinator.withDatabase(scope, async () => { started(); await barrier; return "private"; });
  await running;
  const suspend = f.coordinator.suspendScope(`${scope.baseUrl}/`);
  assert.equal(f.coordinator.isScopeReadable(scope), false, "readiness drops at once");
  release();
  assert.equal(await inFlight, null, "a read that started before the suspension returns nothing");
  assert.equal(await suspend, true);
  assert.equal(await f.coordinator.withDatabase(scope, async () => "private"), null, "no reads while suspended");
  assert.deepEqual([f.files.has(name), [...f.keys.values()][0], f.events.includes("key-delete"), f.events.includes("close")], [true, key, false, false], "nothing was closed or deleted");
  assert.equal(await f.coordinator.setScope(scope), true);
  assert.equal(f.coordinator.isScopeReadable(scope), true);
  assert.deepEqual(await f.coordinator.withDatabase(scope, async db => (await db.all<{ value: string }>("SELECT value FROM qa_marker")).map(row => row.value)), ["kept"], "the same rows are back");
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1, "the database was never reopened");
});

test("a suspension for another server purges; after a suspension another identity or none purges too", async t => {
  const other = await lifecycle(t);
  await other.coordinator.setScope(scope);
  assert.equal(await other.coordinator.suspendScope("https://second.example"), true);
  assert.deepEqual([other.files.size, other.keys.size], [0, 0], "a server change never keeps the old mirror");
  for (const next of [{ ...scope, actorId: "other-private-fixture" }, null]) {
    const f = await lifecycle(t);
    await f.coordinator.setScope(scope);
    const name = [...f.files.keys()][0]!;
    await f.coordinator.suspendScope(scope.baseUrl);
    assert.equal(await f.coordinator.setScope(next), true);
    assert.equal(f.files.has(name), false, "the suspended identity's file is deleted");
    assert.equal([...f.keys.keys()].filter(key => key.startsWith("orbit.sync.key.")).length, next ? 1 : 0);
    assert.equal(await f.coordinator.withDatabase(scope, async () => "private"), null);
  }
});

test("a suspension still finishes a pending erasure first and refuses while it cannot", async t => {
  const f = await lifecycle(t);
  await f.coordinator.setScope(scope);
  f.state.keyDeleteFails = true;
  assert.equal(await f.coordinator.setScope(null), false);
  const restarted = (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({
    platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args),
  });
  assert.equal(await restarted.suspendScope(scope.baseUrl), false);
  f.state.keyDeleteFails = false;
  assert.equal(await restarted.suspendScope(scope.baseUrl), true);
  assert.equal(f.keys.has("orbit.sync.pending-cleanup"), false);
});

// Sprint 0113 (from 0130): one identity per device on native, as in the browser since 0125.
const otherScope = { baseUrl: "https://first.example", actorId: "other-private-fixture" };

async function restartedLifecycle(f: Awaited<ReturnType<typeof lifecycle>>) {
  return (await import("../src/data/sync/sync-lifecycle")).createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: (...args) => f.logs.push(args) });
}

test("opening an identity erases every other identity's database and key on the device, even one this process never opened", async t => {
  const f = await lifecycle(t);
  // A previous process opened another identity and was killed without a logout.
  assert.equal(await f.coordinator.setScope(otherScope), true);
  const otherFile = [...f.files.keys()][0]!;
  const otherKey = [...f.keys.keys()].find(key => key.startsWith("orbit.sync.key."))!;
  f.files.set("unrelated-app.db", new DatabaseSync(":memory:"));
  const next = await restartedLifecycle(f);
  assert.equal(await next.setScope(scope), true);
  assert.equal(f.files.has(otherFile), false, "the other identity's database file is gone");
  assert.equal(f.keys.has(otherKey), false, "and its key");
  assert.equal([...f.files.keys()].filter(name => name.startsWith("orbit-sync-")).length, 1, "only the open identity's file remains");
  assert.equal([...f.keys.keys()].filter(key => key.startsWith("orbit.sync.key.")).length, 1);
  assert.equal(f.files.has("unrelated-app.db"), true, "files that are not identity mirrors are left alone");
  assert.equal(f.keys.has("orbit.sync.pending-cleanup"), false, "no erasure is left pending");
  assert.equal(next.isScopeReadable(scope), true);
});

test("an interrupted erasure of another identity blocks opening and resumes after a restart", async t => {
  const f = await lifecycle(t);
  assert.equal(await f.coordinator.setScope(otherScope), true);
  const otherFile = [...f.files.keys()][0]!;
  f.state.keyDeleteFails = true;
  const first = await restartedLifecycle(f);
  assert.equal(await first.setScope(scope), false, "a new identity is not opened while another's key cannot be erased");
  assert.ok(f.keys.has("orbit.sync.pending-cleanup"), "the erasure intent is persisted before deleting");
  assert.equal(f.files.has(otherFile), true);
  f.state.keyDeleteFails = false;
  const second = await restartedLifecycle(f);
  assert.equal(await second.setScope(scope), true, "a restarted process finishes the erasure, then opens");
  assert.equal(f.files.has(otherFile), false);
  assert.equal(f.keys.has("orbit.sync.pending-cleanup"), false);
  assert.equal([...f.keys.keys()].filter(key => key.startsWith("orbit.sync.key.")).length, 1);
});

test("resuming the same identity after a suspension erases nothing, and a cold open of the same identity keeps its own file (0130 kept)", async t => {
  const f = await lifecycle(t);
  assert.equal(await f.coordinator.setScope(scope), true);
  const ownFile = [...f.files.keys()][0]!;
  await f.coordinator.withDatabase(scope, async db => { await db.execute("CREATE TABLE qa_marker (value TEXT)"); await db.run("INSERT INTO qa_marker VALUES (?)", ["kept"]); });
  assert.equal(await f.coordinator.suspendScope(scope.baseUrl), true);
  assert.equal(await f.coordinator.setScope(scope), true);
  assert.equal(f.files.has(ownFile), true);
  assert.deepEqual(await f.coordinator.withDatabase(scope, async db => (await db.all<{ value: string }>("SELECT value FROM qa_marker")).map(row => row.value)), ["kept"]);
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1, "the database was never reopened");
  // A cold start of the same identity keeps its own file and key.
  const cold = await restartedLifecycle(f);
  assert.equal(await cold.setScope(scope), true);
  assert.equal(f.files.has(ownFile), true);
  assert.deepEqual(await cold.withDatabase(scope, async db => (await db.all<{ value: string }>("SELECT value FROM qa_marker")).map(row => row.value)), ["kept"], "the same identity's rows survive a cold open");
});

test("the native loader lists the SQLite directory's file names, and nothing when the directory does not exist yet", async () => {
  const { listSyncDatabaseNames } = await import("../src/data/sync/sync-lifecycle");
  const seen: string[] = [];
  class Present { exists = true; constructor(path: string) { seen.push(path); } list() { return [{ name: "orbit-sync-a.db" }, { name: "orbit-sync-a.db-wal" }]; } }
  class Absent { exists = false; list(): { name: string }[] { throw new Error("must not list a missing directory"); } }
  assert.deepEqual(await listSyncDatabaseNames({ defaultDatabaseDirectory: "/db" }, Present), ["orbit-sync-a.db", "orbit-sync-a.db-wal"]);
  assert.deepEqual(seen, ["/db"]);
  assert.deepEqual(await listSyncDatabaseNames({ defaultDatabaseDirectory: "/db" }, Absent), []);
});

// Sprint 0137: SYNC_CLEANUP_STATE_FAILED blocked a Simulator login with no cause recorded.
// Every refusal now carries which step failed plus a secret-free error description.
test("a native-module load failure reports its stage, error name and code, never the raw message", async t => {
  const f = fixture();
  t.after(() => { for (const database of f.files.values()) database.close(); });
  const { createSyncLifecycle } = await import("../src/data/sync/sync-lifecycle");
  const failure = Object.assign(new TypeError("secret-shaped-key-and-payload"), { code: "ERR_MODULE_NOT_FOUND" });
  const coordinator = createSyncLifecycle({ platform: "ios", loadNative: async () => { throw failure; }, report: (...args: unknown[]) => f.logs.push(args) });
  assert.equal(await coordinator.setScope(scope), false);
  assert.deepEqual(f.logs, [["SYNC_CLEANUP_STATE_FAILED", undefined, { stage: "load-native", name: "TypeError", code: "ERR_MODULE_NOT_FOUND", message: "[redacted]" }]]);
});

test("a missing native module keeps the module name, which identifies an outdated binary", async t => {
  const f = fixture();
  t.after(() => { for (const database of f.files.values()) database.close(); });
  const { createSyncLifecycle } = await import("../src/data/sync/sync-lifecycle");
  const coordinator = createSyncLifecycle({
    platform: "ios",
    loadNative: async () => { throw new Error("Cannot find native module 'ExpoSecureStore'"); },
    report: (...args: unknown[]) => f.logs.push(args),
  });
  assert.equal(await coordinator.setScope(scope), false);
  assert.deepEqual(f.logs[0]?.[2], { stage: "load-native", name: "Error", code: null, message: "Cannot find native module 'ExpoSecureStore'" });
});

test("an unreadable pending-cleanup marker reports the read stage and a keychain status without the key name", async t => {
  const f = await lifecycle(t);
  f.native.secureStore.getItemAsync = async (key: string) => {
    if (key === "orbit.sync.pending-cleanup") throw Object.assign(new Error("Calling the 'getValueWithKeyAsync' function has failed\n→ Caused by: orbit.sync.pending-cleanup secret-shaped"), { code: "ERR_KEY_CHAIN" });
    return f.keys.get(key) ?? null;
  };
  assert.equal(await f.coordinator.setScope(scope), false);
  assert.deepEqual(f.logs, [["SYNC_CLEANUP_STATE_FAILED", undefined, { stage: "read-pending-cleanup", name: "Error", code: "ERR_KEY_CHAIN", message: "[redacted]" }]]);
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
});

test("a malformed pending-cleanup marker is reported as such", async t => {
  const f = await lifecycle(t);
  f.keys.set("orbit.sync.pending-cleanup", "not-a-digest");
  assert.equal(await f.coordinator.setScope(scope), false);
  assert.deepEqual(f.logs[0], ["SYNC_CLEANUP_STATE_FAILED", undefined, { stage: "read-pending-cleanup", name: "Error", code: null, message: "SYNC_CLEANUP_STATE_INVALID" }]);
  assert.ok(!JSON.stringify(f.logs).includes("not-a-digest"));
});
