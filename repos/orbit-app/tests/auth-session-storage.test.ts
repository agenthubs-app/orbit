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
