import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("local export ZIP store preserves first complete file and scopes actor access", async () => {
  const { createLocalAccountExportStore } = await import("../../features/account/data-rights/storage/local-zip");
  const root = await mkdtemp(join(tmpdir(), "r18c-local-zip-"));
  try {
    const store = createLocalAccountExportStore({ workspaceId: "w", root });
    const key = await store.put("actor", "export", Buffer.from("first"));
    assert.equal(await store.put("actor", "export", Buffer.from("second")), key);
    assert.equal((await store.get("actor", key))?.toString(), "first");
    await assert.rejects(() => store.get("other", key), /Invalid export file reference/);
    await assert.rejects(() => store.delete("other", key), /Invalid export file reference/);
    await store.delete("actor", key);
    assert.equal(await store.get("actor", key), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("configured storage uses local disk only for an explicit non-production local target", async () => {
  const { createConfiguredAccountExportFileStore } = await import("../../features/account/data-rights/storage/configured");
  const root = await mkdtemp(join(tmpdir(), "r18c-configured-zip-"));
  try {
    const store = createConfiguredAccountExportFileStore("w", { ORBIT_DATABASE_TARGET: "local", ORBIT_LOCAL_EXPORT_STORAGE_DIR: root, NODE_ENV: "test" });
    const key = await store.put("actor", "export", Buffer.from("local"));
    assert.equal((await store.get("actor", key))?.toString(), "local");
  } finally { await rm(root, { recursive: true, force: true }); }
});
