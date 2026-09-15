import assert from "node:assert/strict";
import test from "node:test";

import { createNoteDraftStorage } from "../src/storage/note-draft-storage";

test("note drafts are isolated by server, account and note", async () => {
  const values = new Map<string, string>();
  const storage = createNoteDraftStorage({
    async getItem(key) { return values.get(key) ?? null; },
    async removeItem(key) { values.delete(key); },
    async setItem(key, value) { values.set(key, value); },
  });
  const scope = { server: "https://one.example", accountId: "account:one", noteId: "note:a" };
  const draft = { title: "草稿", body: "正文", manualContactIds: ["contact:a"], mentions: [], eventIds: [], savedAt: "2026-09-15T01:00:00.000Z" };
  await storage.save(scope, draft);
  assert.deepEqual(await storage.load(scope), draft);
  assert.equal(await storage.load({ ...scope, accountId: "account:two" }), null);
  assert.equal(await storage.load({ ...scope, server: "https://two.example" }), null);
  await storage.clear(scope);
  assert.equal(await storage.load(scope), null);
});
