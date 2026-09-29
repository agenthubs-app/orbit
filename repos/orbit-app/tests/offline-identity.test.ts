import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { validateAuthSession } from "../src/api/mobile-auth";
import {
  OFFLINE_IDENTITY_MAX_AGE_MS,
  accountStatusConfirmsRejection,
  classifyAccountCheck,
  classifySessionCheck,
  createOfflineIdentityStorage,
  purgeSyncScope,
  trustedOfflineIdentity,
  type OfflineIdentityRecord,
} from "../src/api/offline-identity";
import { createSyncLifecycle } from "../src/data/sync/sync-lifecycle";

// 0127 decision: offline cold start trusts the last online-validated identity for at most
// 30 days; only an explicit server rejection counts as rejected, everything else is unreachable.

const day = 24 * 60 * 60 * 1000;
const validatedAt = Date.parse("2026-09-01T09:00:00.000Z");
const record: OfflineIdentityRecord = {
  version: 1,
  baseUrl: "http://127.0.0.1:3100",
  accountId: "account:alex",
  user: { id: "user:alex", email: "alex@example.test", name: "Alex" },
  validatedAt,
};

test("the cached identity is trusted up to 30 days after the last online validation, never beyond", () => {
  assert.equal(OFFLINE_IDENTITY_MAX_AGE_MS, 30 * day);
  const at = (days: number) => trustedOfflineIdentity({ record, baseUrl: "http://127.0.0.1:3100/", now: validatedAt + days * day });
  assert.deepEqual(at(0), record);
  assert.deepEqual(at(29), record);
  assert.deepEqual(at(30), record, "exactly 30 days is still inside the window");
  assert.equal(trustedOfflineIdentity({ record, baseUrl: record.baseUrl, now: validatedAt + 30 * day + 1 }), null);
  assert.equal(at(31), null);
  assert.equal(at(-1), null, "a validation time in the future cannot prove its age");
  assert.equal(trustedOfflineIdentity({ record, baseUrl: "http://127.0.0.1:3000", now: validatedAt }), null, "another server's identity is never reused");
  assert.equal(trustedOfflineIdentity({ record: null, baseUrl: record.baseUrl, now: validatedAt }), null);
});

test("session checks: 401/403 and an empty Auth.js session are rejections; network errors, 5xx and non-JSON are unreachable", () => {
  const fail = (code: string, status: number) => ({ success: false as const, error: { code, message: "x", status } });
  assert.equal(classifySessionCheck({ success: true, data: { expiresAt: "", user: record.user } }), "valid");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_NETWORK_ERROR", 0)), "unreachable");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SESSION_INVALID", 401)), "rejected");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SESSION_INVALID", 403)), "rejected");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SESSION_INVALID", 200)), "rejected");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SESSION_INVALID", 503)), "unreachable");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SESSION_INVALID", 404)), "unreachable");
  assert.equal(classifySessionCheck(fail("ORBIT_APP_AUTH_SERVER_UNAVAILABLE", 200)), "unreachable");
  assert.equal(classifyAccountCheck({ success: false, status: 401 }), "rejected");
  assert.equal(classifyAccountCheck({ success: false, status: 403 }), "rejected");
  assert.equal(classifyAccountCheck({ success: false, status: 0 }), "unreachable");
  assert.equal(classifyAccountCheck({ success: false, status: 503 }), "unreachable");
});

test("account status only confirms rejection for explicit disable/password-change or an unreadable token", () => {
  assert.equal(accountStatusConfirmsRejection({ success: true, data: { status: "active" } }), false);
  assert.equal(accountStatusConfirmsRejection({ success: true, data: { status: "disabled" } }), true);
  assert.equal(accountStatusConfirmsRejection({ success: true, data: { status: "password_changed" } }), true);
  assert.equal(accountStatusConfirmsRejection({ success: false, error: { code: "unavailable", message: "x", status: 503 } }), false);
  assert.equal(accountStatusConfirmsRejection({ success: false, error: { code: "rejected", message: "x", status: 401 } }), true);
});

async function serve(t: { after(fn: () => Promise<void>): void }, respond: (path: string) => { status: number; type: string; body: string }) {
  const server: Server = createServer((request, response) => {
    const answer = respond(request.url ?? "");
    response.writeHead(answer.status, { "content-type": answer.type });
    response.end(answer.body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("real HTTP: each server answer to /api/auth/session maps to exactly one verdict", async t => {
  const cases: Array<[string, { status: number; type: string; body: string }, string]> = [
    ["valid session", { status: 200, type: "application/json", body: JSON.stringify({ user: record.user, expires: "2026-10-27T00:00:00Z" }) }, "valid"],
    ["Auth.js null session (revoked, disabled, password changed)", { status: 200, type: "application/json", body: "null" }, "rejected"],
    ["empty session object", { status: 200, type: "application/json", body: "{}" }, "rejected"],
    ["401", { status: 401, type: "application/json", body: "{}" }, "rejected"],
    ["403", { status: 403, type: "application/json", body: "{}" }, "rejected"],
    ["captive portal HTML", { status: 200, type: "text/html", body: "<html>Sign in to Wi-Fi</html>" }, "unreachable"],
    ["503", { status: 503, type: "text/plain", body: "down" }, "unreachable"],
    ["502 gateway", { status: 502, type: "text/html", body: "<html>bad gateway</html>" }, "unreachable"],
  ];
  for (const [name, answer, verdict] of cases) {
    const baseUrl = await serve(t, () => answer);
    const result = await validateAuthSession({ baseUrl, cookieHeader: "session=stored" });
    assert.equal(classifySessionCheck(result), verdict, name);
  }
  // A closed port is a network failure, not a rejection.
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const refused = await validateAuthSession({ baseUrl: `http://127.0.0.1:${port}`, cookieHeader: "session=stored" });
  assert.equal(classifySessionCheck(refused), "unreachable");
});

function memorySecureStore() {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      async delete(key: string) { values.delete(key); },
      async get(key: string) { return values.get(key) ?? null; },
      async set(key: string, value: string) { values.set(key, value); },
    },
  };
}

test("storage keeps one identity per server, returns language only to the same actor, and clears both together", async () => {
  const secure = memorySecureStore();
  const storage = createOfflineIdentityStorage(secure.store);
  await storage.write(record);
  assert.deepEqual(await storage.read("http://127.0.0.1:3100/"), record);
  assert.equal(await storage.read("http://127.0.0.1:3000"), null);
  const preference = { mode: "manual" as const, language: "en" as const, updatedAt: "2026-09-27T00:00:00.000Z" };
  await storage.writeLanguage(record.baseUrl, record.accountId, preference);
  assert.deepEqual(await storage.readLanguage(record.baseUrl, record.accountId), preference);
  assert.equal(await storage.readLanguage(record.baseUrl, "account:other"), null);
  assert.ok([...secure.values.values()].every(value => !value.includes("session=")), "no cookie is copied into the identity record");
  await storage.clear(record.baseUrl);
  assert.equal(await storage.read(record.baseUrl), null);
  assert.equal(await storage.readLanguage(record.baseUrl, record.accountId), null);
  assert.equal(secure.values.size, 0);
  secure.values.set(storage.key(record.baseUrl), "{not json");
  assert.equal(await storage.read(record.baseUrl), null, "a corrupt record is not trusted");
});

function nativeFixture() {
  const keys = new Map<string, string>();
  const files = new Map<string, DatabaseSync>();
  const native = {
    crypto: {
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digestStringAsync: async (_: string, value: string) => createHash("sha256").update(value).digest("hex"),
      getRandomBytesAsync: async (size: number) => randomBytes(size),
    },
    secureStore: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
      async getItemAsync(key: string) { return keys.get(key) ?? null; },
      async setItemAsync(key: string, value: string) { keys.set(key, value); },
      async deleteItemAsync(key: string) { keys.delete(key); },
    },
    sqlite: {
      async deleteDatabaseAsync(name: string) { files.get(name)?.close(); files.delete(name); },
      async openDatabaseAsync(name: string) {
        const database = files.get(name) ?? new DatabaseSync(":memory:");
        files.set(name, database);
        return {
          async execAsync(sql: string) { if (!sql.startsWith("PRAGMA key")) database.exec(sql); },
          async getFirstAsync(sql: string, params: any[] = []) {
            if (sql === "PRAGMA cipher_version") return { cipher_version: "4.0" };
            return database.prepare(sql).get(...params) ?? null;
          },
          async getAllAsync(sql: string, params: any[] = []) { return database.prepare(sql).all(...params); },
          async runAsync(sql: string, params: any[] = []) { return database.prepare(sql).run(...params); },
          async closeAsync() {},
        };
      },
    },
  };
  return { keys, files, native };
}

test("a rejection at cold start erases the rejected actor's mirror and key through the account-switch purge", async t => {
  const f = nativeFixture();
  t.after(() => { for (const database of f.files.values()) database.close(); });
  const scope = { baseUrl: record.baseUrl, actorId: record.accountId };
  const other = { baseUrl: record.baseUrl, actorId: "account:someone-else" };
  // Previous process: two actors left encrypted mirrors behind.
  const before = createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: () => undefined });
  assert.equal(await before.setScope(other), true);
  assert.equal(await before.setScope(null), true);
  assert.equal(await before.setScope(scope), true);
  await before.withDatabase(scope, db => db.run("INSERT INTO sync_cursors VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["w", "notes", "e1", "c", "2026-09-16T00:00:00Z", "complete", "complete", "g1"]));
  assert.equal(f.files.size, 1);
  assert.equal([...f.keys.keys()].filter(key => key.startsWith("orbit.sync.key.")).length, 1);

  // New process: nothing is open when the server rejects the stored session.
  const coldStart = createSyncLifecycle({ platform: "ios", loadNative: async () => f.native as any, report: () => undefined });
  assert.equal(await purgeSyncScope(coldStart, scope), true);
  assert.equal(f.files.size, 0, "mirror file deleted");
  assert.deepEqual([...f.keys.keys()].filter(key => key.startsWith("orbit.sync.")), [], "key and pending-cleanup marker gone");
  assert.equal(coldStart.isScopeReadable(scope), false);
});
