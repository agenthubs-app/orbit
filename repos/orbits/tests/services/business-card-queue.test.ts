import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../../features/acquisition/business-card-batch-worker";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { isCardQueueWake, withQueuedCardBatches } from "../../features/acquisition/business-card-queue-dispatch";
import { CardWorkPending, processCardQueueTick } from "../../features/acquisition/business-card-queue-worker";

test("card queue accepts only a version and pipeline, never private card content", () => {
  for (const pipeline of ["v1", "v2"]) assert.ok(isCardQueueWake({ version: 1, pipeline }));
  for (const value of [null, [], { version: 2, pipeline: "v1" }, { version: 1, pipeline: "other" },
    { version: 1, pipeline: "v1", image: "private" }]) assert.equal(isCardQueueWake(value), false);
});

test("card queue retains delivery while work or a future lease remains; errors are sanitized", async () => {
  for (const claimed of [0, 1]) {
    await assert.rejects(processCardQueueTick("v1", {
      run: async () => ({ claimed }), pending: async () => true,
    }), (error: unknown) => error instanceof CardWorkPending && error.afterSeconds === (claimed ? 1 : 60));
  }
  await processCardQueueTick("v2", { run: async () => ({ claimed: 0 }), pending: async () => false });
  await assert.rejects(processCardQueueTick("v2", {
    run: async () => { throw new Error("private storage detail"); }, pending: async () => false,
  }), { message: "Business-card background execution unavailable." });
});

test("durable batches survive dispatch failure; internal work never recursively publishes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-card-queue-"));
  try {
    const imageStore = createBusinessCardBatchImageStore({ rootDir, env: {} });
    const service = createBusinessCardBatchService({ imageStore, store: createMemoryLiveRecordStore(), workspaceId: "test" });
    let published = 0;
    const queued = withQueuedCardBatches(service, async () => {
      published++;
      assert.equal((await service.listBatches("actor:test")).length, 1);
      throw new Error("private provider detail");
    });
    const now = "2026-09-07T00:00:00.000Z";
    await assert.rejects(queued.createBatch({ actorId: "actor:test", now, sourceFiles: [], items: [{
      imageDigest: "sha256:test", imageJpegBase64: Buffer.from("jpeg").toString("base64"), seq: 1,
      sourceFileName: "test.jpg", sourcePage: null, uploadMimeType: "image/jpeg",
    }] }), { message: "Business-card changes were saved, but background dispatch is unavailable." });
    const worker = createBusinessCardBatchWorker({ service: queued, imageStore, provider: null, notify: async () => {} });
    assert.equal((await worker.runOnce({ workerId: "test", now })).claimed, 0);
    assert.equal((await queued.claimPendingItems({ workerId: "test", now, limit: 1 })).length, 1);
    assert.equal(published, 1);
    const expired = await worker.runOnce({ workerId: "test", now: "2026-10-07T00:00:00.000Z" });
    assert.equal(expired.swept, 1, "missing OCR must not prevent expiry cleanup");
    assert.equal(published, 1);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
