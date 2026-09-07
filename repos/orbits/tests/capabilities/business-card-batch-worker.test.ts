import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../../features/acquisition/business-card-batch-worker";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { BusinessCardCloudOcrProviderError } from "../../features/acquisition/business-card-ocr-validation";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:batch-worker-test";
const NOW = "2026-08-26T12:00:00.000Z";

const EXTRACTION = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: ["ja"],
  emails: [],
  fullName: "青空 太郎",
  nativeFullName: "青空 太郎",
  organization: "架空技研株式会社",
  romanizedFullName: null,
  title: "室長",
  website: null,
};

async function setup(
  extract: (input: { imageBase64: string; mimeType: string }) => Promise<unknown>,
) {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-worker-"));
  const imageStore = createBusinessCardBatchImageStore({ rootDir });
  const service = createBusinessCardBatchService({
    imageStore,
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  const notifications: { actorId: string; batchId: string; now: string }[] = [];
  const worker = createBusinessCardBatchWorker({
    imageStore,
    notify: async (input) => {
      notifications.push(input);
    },
    provider: {
      extract: extract as never,
      model: "test-model",
      providerName: "test-provider",
    },
    service,
  });
  return { notifications, service, worker };
}

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    imageDigest: `sha256:${index}`,
    imageJpegBase64: Buffer.from(`jpeg-${index}`).toString("base64"),
    seq: index + 1,
    sourceFileName: `card-${index + 1}.jpg`,
    sourcePage: null,
    uploadMimeType: "image/jpeg",
  }));
}

test("worker extracts claimed items and notifies once when the batch becomes ready", async () => {
  const { notifications, service, worker } = await setup(async () => ({
    extraction: EXTRACTION,
    usage: { inputTokens: 10, latencyMs: 5, outputTokens: 5 },
  }));
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: items(2),
    now: NOW,
    sourceFiles: [],
  });

  const first = await worker.runOnce({ now: NOW, workerId: "w" });
  assert.equal(first.completed, 2);

  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.batch.status, "ready_for_review");
  assert.equal(detail?.items[0]?.extraction?.fullName, "青空 太郎");
  assert.deepEqual(notifications, [{ actorId: ACTOR, batchId: batch.id, now: NOW }]);

  const idle = await worker.runOnce({ now: NOW, workerId: "w" });
  assert.equal(idle.claimed, 0, "no re-processing after ready");
  assert.equal(notifications.length, 1, "notify fires exactly once");
});

test("worker retries a timeout once and then marks the item failed", async () => {
  let calls = 0;
  const { service, worker } = await setup(async () => {
    calls += 1;
    throw new BusinessCardCloudOcrProviderError("PROVIDER_TIMEOUT", "timed out");
  });
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: items(1),
    now: NOW,
    sourceFiles: [],
  });

  await worker.runOnce({ now: NOW, workerId: "w" });
  await worker.runOnce({ now: NOW, workerId: "w" });

  assert.equal(calls, 2);
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items[0]?.status, "failed");
  assert.equal(detail?.items[0]?.errorCode, "OCR_PROVIDER_TIMEOUT");
  assert.equal(detail?.batch.status, "ready_for_review");
});
