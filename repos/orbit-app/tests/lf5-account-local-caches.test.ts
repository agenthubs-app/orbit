import assert from "node:assert/strict";
import test from "node:test";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearAccountLocalCaches, recentSearchKey } from "../src/data/account-local-caches";
import { CONTACT_DELETE_QUEUE_PREFIX } from "../src/screens/network/contact-delete-queue";
import { NETWORK_MERGE_CACHE_PREFIX } from "../src/screens/network/network-merge-cache-key";
import { homeLayoutStorageKey } from "../src/screens/home/home-layout-storage";
import { todoHandoffStorageKey } from "../src/screens/todo/todo-handoff-state";

// AsyncStorage's web build reads window.localStorage at call time; a memory one stands in for the device.
const memory = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = { localStorage: {
  getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, String(value)); },
  removeItem: (key: string) => { memory.delete(key); }, clear: () => memory.clear(), key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
} };

// LF5: sign-out and account deletion clear the account's caches outside the sync database; recent searches are per
// account (before, one device-wide list showed the previous account's searches to the next one).
const scope = { actorId: "actor:one", baseUrl: "https://orbit.example" };
const other = "actor:two";

async function seed(): Promise<Record<string, string>> {
  const keys: Record<string, string> = {
    legacyGlobal: "orbit.search.recent", legacyEvents: "orbit.events.recentSearches",
    global: recentSearchKey("global", scope.actorId)!, events: recentSearchKey("events", scope.actorId)!,
    home: homeLayoutStorageKey(scope.actorId, scope.baseUrl)!, handoff: todoHandoffStorageKey(scope.actorId, scope.baseUrl)!,
    merge: `${NETWORK_MERGE_CACHE_PREFIX}${scope.actorId}`, deletes: `${CONTACT_DELETE_QUEUE_PREFIX}${scope.actorId}`,
    otherGlobal: recentSearchKey("global", other)!,
  };
  for (const key of Object.values(keys)) await AsyncStorage.setItem(key, "[\"x\"]");
  return keys;
}

test("LF5: recent-search keys are per account", () => {
  assert.notEqual(recentSearchKey("global", "actor:one"), recentSearchKey("global", "actor:two"));
  assert.equal(recentSearchKey("events", null), null);
});

test("LF5: sign-out clears the account caches and the legacy device-wide lists, keeps queued deletes and other accounts", async () => {
  const keys = await seed();
  await clearAccountLocalCaches(scope, { discardPendingWrites: false });
  for (const name of ["legacyGlobal", "legacyEvents", "global", "events", "home", "handoff", "merge"]) assert.equal(await AsyncStorage.getItem(keys[name]!), null, name);
  assert.notEqual(await AsyncStorage.getItem(keys.deletes!), null, "unsent deletes stay for the same account");
  assert.notEqual(await AsyncStorage.getItem(keys.otherGlobal!), null, "another account's list is untouched");
});

test("LF5: discarding unsent writes (or deleting the account) also drops the queued contact deletes", async () => {
  const keys = await seed();
  await clearAccountLocalCaches(scope, { discardPendingWrites: true });
  assert.equal(await AsyncStorage.getItem(keys.deletes!), null);
});
