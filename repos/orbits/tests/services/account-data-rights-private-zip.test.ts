import assert from "node:assert/strict";
import test from "node:test";

test("private export ZIP keys are actor scoped and cannot be read or removed across actors", async () => {
  const { createPrivateAccountExportStore } = await import("../../features/account/data-rights/storage/private-zip");
  const objects = new Map<string, Buffer>();
  const writes: { key: string; options: { access: string; contentType: string; allowOverwrite: boolean } }[] = [];
  const client = {
    async put(key: string, bytes: Buffer, options: { access: string; contentType: string; allowOverwrite: boolean }) {
      writes.push({ key, options });
      objects.set(key, bytes);
    },
    async get(key: string) { return objects.get(key) ?? null; },
    async delete(keys: string[]) { keys.forEach(key => objects.delete(key)); },
  };
  const store = createPrivateAccountExportStore({ workspaceId: "test", client });
  const bytes = Buffer.from("PK\u0003\u0004archive");
  const key = await store.put("actor-1", "export:one", bytes);
  assert.equal(writes[0]?.options.access, "private");
  assert.equal(writes[0]?.options.contentType, "application/zip");
  assert.equal(writes[0]?.options.allowOverwrite, false);
  assert.match(key, /^account-exports\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.zip$/);
  assert.deepEqual(await store.get("actor-1", key), bytes);
  await assert.rejects(() => store.get("actor-2", key), /Invalid export file reference/);
  await assert.rejects(() => store.delete("actor-2", key), /Invalid export file reference/);
  assert.deepEqual(await store.get("actor-1", key), bytes);
  await store.delete("actor-1", key);
  assert.equal(await store.get("actor-1", key), null);
});

test("repeated writes preserve the first ZIP and provider errors do not leak secrets", async () => {
  const { createPrivateAccountExportStore } = await import("../../features/account/data-rights/storage/private-zip");
  const keys: string[] = [];
  const objects = new Map<string, Buffer>();
  const store = createPrivateAccountExportStore({ workspaceId: "test", client: {
    async put(key, bytes) { keys.push(key); if (keys.length === 2) throw new Error("BLOB_READ_WRITE_TOKEN=secret"); objects.set(key, bytes); },
    async get(key) { return objects.get(key) ?? null; },
    async delete() { throw new Error("BLOB_READ_WRITE_TOKEN=secret"); },
  } });
  const first = await store.put("actor", "export", Buffer.from("one"));
  const second = await store.put("actor", "export", Buffer.from("two"));
  assert.equal(first, second);
  assert.equal(keys.length, 1);
  assert.equal((await store.get("actor", first))?.toString(), "one");
  await assert.rejects(() => store.put("actor", "another", Buffer.from("three")), /^Error: Private export storage unavailable$/);
  await assert.rejects(() => store.delete("actor", first), /^Error: Private export storage unavailable$/);
});
