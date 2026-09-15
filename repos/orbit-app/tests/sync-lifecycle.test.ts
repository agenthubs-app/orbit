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
  const state = { keyDeleteFails: false, fileDeleteFails: false, corrupt: false, cipher: true, keyWriteFails: false };
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
          async closeAsync() { events.push("close"); },
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
  await f.coordinator.withDatabase(scope, db => db.run("INSERT INTO sync_cursors VALUES (?, ?, ?, ?)", ["workspace", "cursor", "2026-09-16T00:00:00Z", "complete"]));
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

test("corruption resets the scope and stays online-only", async t => {
  const f = await lifecycle(t);
  f.state.corrupt = true;
  assert.equal(await f.coordinator.setScope(scope), true);
  assert.equal(await f.coordinator.withDatabase(scope, () => Promise.resolve("private")), null);
  assert.equal(f.keys.size, 0);
  assert.equal(f.files.size, 0);
  assert.equal(f.events.filter(event => event.startsWith("open:")).length, 1);
  assert.ok(!JSON.stringify(f.logs).includes(scope.actorId));
  assert.ok(!JSON.stringify(f.logs).includes("secret-shaped"));
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
