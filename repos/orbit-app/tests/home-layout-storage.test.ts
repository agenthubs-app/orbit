import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";
import { createHomeLayoutStorage, homeLayoutStorageKey } from "../src/screens/home/home-layout-storage";

test("home layout snapshots and offline drafts are isolated by actor and server", async () => {
  const values = new Map<string, string>();
  const storage = createHomeLayoutStorage({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } });
  const scope = ["actor:a", "http://localhost:3510"] as const;
  assert.notEqual(homeLayoutStorageKey(...scope), homeLayoutStorageKey("actor:b", scope[1]));
  assert.notEqual(homeLayoutStorageKey(...scope), homeLayoutStorageKey(scope[0], "http://localhost:3511"));
  const draft = { baseRevision: 0, app: [{ key: "memo" as const, size: "m" as const }], mutationId: "offline-1", savedAt: "2026-10-20T00:00:00Z", hintDismissedAt: "2026-10-20T00:00:00Z" };
  await storage.write(...scope, { snapshot: DEFAULT_HOME_LAYOUT, fetchedAt: "2026-10-20T00:00:00Z", draft });
  assert.deepEqual((await storage.read(...scope)).draft, draft);
  assert.deepEqual(await storage.read("actor:b", scope[1]), { snapshot: null, fetchedAt: null, draft: null });
  assert.deepEqual(await storage.read(scope[0], "http://localhost:3511"), { snapshot: null, fetchedAt: null, draft: null });
});

test("an unreadable cache does not leak another layout or make a bogus draft", async () => {
  const storage = createHomeLayoutStorage({ getItem: async () => "{broken", setItem: async () => undefined });
  assert.deepEqual(await storage.read("actor:a", "http://localhost:3510"), { snapshot: null, fetchedAt: null, draft: null });
});
