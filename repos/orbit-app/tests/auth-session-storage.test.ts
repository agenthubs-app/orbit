import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthSessionStorage,
  type KeyValueStorage
} from "../src/api/auth-session-storage";

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.failWrites) {
      throw new Error("write failed");
    }

    this.values.set(key, value);
  }
}

const baseUrl = "https://orbit.example";

test("session storage migrates the old AsyncStorage value once", async () => {
  const legacy = new MemoryStorage();
  const secure = new MemoryStorage();
  const storage = createAuthSessionStorage({ legacy, secure });
  legacy.values.set(
    storage.legacyKey(baseUrl),
    "authjs.session-token=old"
  );

  assert.equal(await storage.read(baseUrl), "authjs.session-token=old");
  assert.equal(
    await secure.get(storage.key(baseUrl)),
    "authjs.session-token=old"
  );
  assert.equal(await legacy.get(storage.legacyKey(baseUrl)), null);
});

test("session storage reads SecureStore before legacy storage", async () => {
  const legacy = new MemoryStorage();
  const secure = new MemoryStorage();
  const storage = createAuthSessionStorage({ legacy, secure });
  await secure.set(storage.key(baseUrl), "authjs.session-token=secure");
  await legacy.set(storage.legacyKey(baseUrl), "authjs.session-token=old");

  assert.equal(await storage.read(baseUrl), "authjs.session-token=secure");
  assert.equal(
    await legacy.get(storage.legacyKey(baseUrl)),
    "authjs.session-token=old"
  );
});

test("failed SecureStore writes do not erase the legacy session", async () => {
  const legacy = new MemoryStorage();
  const secure = new MemoryStorage();
  const storage = createAuthSessionStorage({ legacy, secure });
  legacy.values.set(
    storage.legacyKey(baseUrl),
    "authjs.session-token=old"
  );
  secure.failWrites = true;

  await assert.rejects(storage.read(baseUrl));
  assert.equal(
    await legacy.get(storage.legacyKey(baseUrl)),
    "authjs.session-token=old"
  );
});

test("session storage writes only to secure storage and clears both stores", async () => {
  const legacy = new MemoryStorage();
  const secure = new MemoryStorage();
  const storage = createAuthSessionStorage({ legacy, secure });
  await legacy.set(storage.legacyKey(baseUrl), "legacy");

  await storage.write(baseUrl, "authjs.session-token=fresh");
  assert.equal(
    await secure.get(storage.key(baseUrl)),
    "authjs.session-token=fresh"
  );
  assert.equal(await legacy.get(storage.legacyKey(baseUrl)), null);

  await storage.clear(baseUrl);
  assert.equal(await secure.get(storage.key(baseUrl)), null);
  assert.equal(await legacy.get(storage.legacyKey(baseUrl)), null);
});

test("conditional cleanup only deletes the rejected session and serializes against a newer write", async () => {
  const legacy = new MemoryStorage();
  const secure = new MemoryStorage();
  const storage = createAuthSessionStorage({ legacy, secure });
  const clearIfMatches = (storage as any).clearIfMatches;
  assert.equal(typeof clearIfMatches, "function");
  await storage.write(baseUrl, "attempt-A");
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const originalGet = secure.get.bind(secure);
  secure.get = async key => {
    const value = await originalGet(key);
    entered();
    await gate;
    return value;
  };
  const cleanup = clearIfMatches(baseUrl, "attempt-A");
  await ready;
  const replacement = storage.write(baseUrl, "attempt-B");
  release();
  assert.equal(await cleanup, true);
  await replacement;
  assert.equal(await storage.read(baseUrl), "attempt-B");
  assert.equal(await clearIfMatches(baseUrl, "attempt-A"), false);
  assert.equal(await storage.read(baseUrl), "attempt-B");
  assert.equal(await clearIfMatches(baseUrl, "attempt-B"), true);
  assert.equal(await storage.read(baseUrl), null);
});
