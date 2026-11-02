import assert from "node:assert/strict";
import test from "node:test";

import { createManualContactDraftStorage } from "../src/storage/manual-contact-draft-storage";

// 0146: the 手入力 draft stays on this device only, per server and account.
const draft = {
  form: { displayName: "下書き 花子", email: "", met: { kind: "intro" as const, label: "田中" }, note: "", organization: "星野商事", phone: "", primaryIndustryId: "retail_consumer" as const, role: "" },
  open: ["met" as const],
  savedAt: "2026-11-02T01:00:00.000Z",
};

function memory() {
  const values = new Map<string, string>();
  return { values, adapter: { async getItem(key: string) { return values.get(key) ?? null; }, async removeItem(key: string) { values.delete(key); }, async setItem(key: string, value: string) { values.set(key, value); } } };
}

test("manual-add drafts are isolated by server and account, and clear removes them", async () => {
  const { adapter } = memory();
  const storage = createManualContactDraftStorage(adapter);
  const scope = { accountId: "account:one", server: "https://one.example" };
  await storage.save(scope, draft);
  assert.deepEqual(await storage.load(scope), draft);
  assert.equal(await storage.load({ ...scope, accountId: "account:two" }), null);
  assert.equal(await storage.load({ ...scope, server: "https://two.example" }), null);
  await storage.clear(scope);
  assert.equal(await storage.load(scope), null);
});

test("a stored value that is not a draft (or an industry outside the catalog) reads as no draft", async () => {
  const { adapter, values } = memory();
  const storage = createManualContactDraftStorage(adapter);
  const scope = { accountId: "account:one", server: "https://one.example" };
  await storage.save(scope, draft);
  const key = [...values.keys()][0]!;
  values.set(key, "{not json");
  assert.equal(await storage.load(scope), null);
  values.set(key, JSON.stringify({ ...draft, form: { ...draft.form, primaryIndustryId: "space_travel" } }));
  assert.equal(await storage.load(scope), null);
  await assert.rejects(storage.save(scope, { ...draft, open: ["somewhere" as never] }));
});

test("a delayed autosave finishes before clearing the same draft and cannot bring it back", async () => {
  const { adapter, values } = memory();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const storage = createManualContactDraftStorage({ ...adapter, async setItem(key, value) { await delayed; values.set(key, value); } });
  const scope = { accountId: "account:one", server: "https://one.example" };
  const save = storage.save(scope, draft);
  const clear = storage.clear(scope);
  release();
  await Promise.all([save, clear]);
  assert.equal(await storage.load(scope), null);
});
