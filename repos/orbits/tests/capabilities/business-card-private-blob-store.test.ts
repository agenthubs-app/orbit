import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivateBlobBatchImageStore,
  createPrivateBlobDerivativeStore,
  usesPrivateBusinessCardBlob,
  type PrivateCardBlobClient,
} from "../../features/acquisition/storage/business-card-private-blob-store";

function sharedTransport() {
  const objects = new Map<string, Buffer>();
  const deleted: string[][] = [];
  const client: PrivateCardBlobClient = {
    async put(pathname, bytes) { objects.set(pathname, Buffer.from(bytes)); },
    async get(pathname) { return objects.get(pathname) ?? null; },
    async delete(pathnames) {
      deleted.push([...pathnames]);
      for (const pathname of pathnames) objects.delete(pathname);
    },
    async list(prefix, cursor) {
      const matches = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
      const offset = Number(cursor ?? 0);
      // A deliberately small, offset-based page catches deletion during paging.
      const pathnames = matches.slice(offset, offset + 1);
      return { pathnames, hasMore: offset + 1 < matches.length, cursor: String(offset + 1) };
    },
  };
  return { client, objects, deleted };
}

test("separate V1 instances share bytes and batch cleanup preserves other batches and workspaces", async () => {
  const { client, objects } = sharedTransport();
  const upload = createPrivateBlobBatchImageStore({ workspaceId: "workspace:A", client });
  const worker = createPrivateBlobBatchImageStore({ workspaceId: "workspace:A", client });
  const other = createPrivateBlobBatchImageStore({ workspaceId: "workspace:B", client });
  const paths = await Promise.all([1, 2, 3].map((n) => upload.save("batch-A", `item-${n}`, Buffer.from(`card-${n}`))));
  const keepBatch = await upload.save("batch-AB", "item-1", Buffer.from("keep batch"));
  const keepWorkspace = await other.save("batch-A", "item-1", Buffer.from("keep workspace"));
  for (const [index, pathname] of paths.entries()) {
    assert.equal((await worker.read(pathname))?.toString(), `card-${index + 1}`);
    assert.doesNotMatch(pathname, /workspace:A|batch-A|item-/);
  }
  assert.throws(() => worker.read(keepWorkspace), /Invalid card image reference/);
  assert.throws(() => worker.removeItemImage("../../outside.jpg"), /Invalid card image reference/);
  await worker.removeBatchImages("batch-A");
  for (const pathname of paths) assert.equal(await upload.read(pathname), null);
  assert.equal(objects.size, 2);
  assert.equal((await worker.read(keepBatch))?.toString(), "keep batch");
  assert.equal((await other.read(keepWorkspace))?.toString(), "keep workspace");
  await worker.removeBatchImages("batch-A");
  assert.equal(objects.size, 2, "repeated cleanup is harmless");
});

test("V2 keeps opaque derivative keys while sharing bytes across independent instances", async () => {
  const { client } = sharedTransport();
  const upload = createPrivateBlobDerivativeStore({ workspaceId: "workspace:A", client });
  const worker = createPrivateBlobDerivativeStore({ workspaceId: "workspace:A", client });
  const other = createPrivateBlobDerivativeStore({ workspaceId: "workspace:B", client });
  const first = await upload.put(Buffer.from("jpeg bytes"));
  const second = await upload.put(Buffer.from("second card"));
  assert.match(first.objectKey, /^[a-f0-9-]{36}\.jpg$/);
  assert.equal(first.size, 10);
  assert.equal((await worker.get(first.objectKey))?.toString(), "jpeg bytes");
  assert.equal(await other.get(first.objectKey), null);
  await other.delete(first.objectKey);
  assert.ok(await worker.get(first.objectKey), "another workspace cannot delete the image");
  assert.throws(() => worker.get(`../${first.objectKey}`), /Invalid card image reference/);
  await worker.delete(first.objectKey);
  await worker.delete(first.objectKey);
  assert.equal(await upload.get(first.objectKey), null);
  assert.equal((await upload.get(second.objectKey))?.toString(), "second card");
});

test("storage outages propagate a safe error and unsafe cleanup listings delete nothing", async () => {
  const transport = sharedTransport();
  const { client, deleted } = transport;
  const other = createPrivateBlobBatchImageStore({ workspaceId: "other", client });
  const foreignPath = await other.save("batch", "item", Buffer.from("private"));
  const malformed: PrivateCardBlobClient = {
    ...client,
    async list() { return { pathnames: [foreignPath], hasMore: false }; },
  };
  const store = createPrivateBlobBatchImageStore({ workspaceId: "own", client: malformed });
  await assert.rejects(store.removeBatchImages("batch"), { message: "Private card image storage unavailable" });
  assert.equal(deleted.length, 0);
  const unavailable: PrivateCardBlobClient = {
    ...client,
    async get() { throw new Error("synthetic private provider diagnostic"); },
    async put() { throw new Error("synthetic private provider diagnostic"); },
  };
  const derivative = createPrivateBlobDerivativeStore({ workspaceId: "own", client: unavailable });
  await assert.rejects(derivative.put(Buffer.from("card")), { message: "Private card image storage unavailable" });
  await assert.rejects(derivative.get("00000000-0000-0000-0000-000000000000.jpg"), { message: "Private card image storage unavailable" });
  const repeating = createPrivateBlobBatchImageStore({ workspaceId: "own", client: {
    ...client,
    async list() { return { pathnames: [], hasMore: true, cursor: "same" }; },
  } });
  await assert.rejects(repeating.removeBatchImages("batch"), /storage unavailable/);
  assert.equal(deleted.length, 0);
});

test("Vercel always selects shared storage and a remote local worker can opt in", () => {
  assert.equal(usesPrivateBusinessCardBlob({ VERCEL: "1", ORBIT_BATCH_IMAGE_STORAGE: "filesystem" }), true);
  assert.equal(usesPrivateBusinessCardBlob({ ORBIT_BATCH_IMAGE_STORAGE: "private-blob" }), true);
  assert.equal(usesPrivateBusinessCardBlob({}), false);
});
