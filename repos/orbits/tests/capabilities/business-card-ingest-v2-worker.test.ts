import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Pool } from "pg";

import type {
  BusinessCardCloudOcrProvider,
  BusinessCardStructuredExtraction,
} from "../../features/acquisition/business-card-cloud-ocr";
import { createFilesystemDerivativeStore } from "../../features/acquisition/business-card-ingest-v2/derivative-store";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import {
  createBusinessCardIngestRepository,
  type BusinessCardIngestRepository,
} from "../../features/acquisition/business-card-ingest-v2/repository";
import { createIngestV2Worker } from "../../features/acquisition/business-card-ingest-v2/worker";
import type { IngestDerivativeStore } from "../../features/acquisition/business-card-ingest-v2/derivative-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";

const ACTOR = "actor:test";

const EXTRACTION: BusinessCardStructuredExtraction = {
  fullName: "山田 花子",
  nativeFullName: null,
  romanizedFullName: null,
  organization: "Orbit KK",
  departments: [],
  title: null,
  emails: [{ label: null, value: "hanako@example.com" }],
  contactPoints: [],
  website: null,
  addresses: [],
  certifications: [],
  detectedLanguages: ["ja"],
};

function providerReturning(extraction: BusinessCardStructuredExtraction): BusinessCardCloudOcrProvider {
  return {
    model: "fake-model",
    providerName: "fake",
    async extract() {
      return {
        extraction,
        usage: { inputTokens: 1, outputTokens: 1, latencyMs: 5 },
      };
    },
  };
}

const hangingProvider: BusinessCardCloudOcrProvider = {
  model: "fake-model",
  providerName: "fake",
  extract() {
    return new Promise(() => undefined);
  },
};

interface Harness {
  repo: BusinessCardIngestRepository;
  store: IngestDerivativeStore;
  pool: Pool;
  rootDir: string;
}

async function withHarness(fn: (harness: Harness) => Promise<void>): Promise<void> {
  const schema = `bc_ingest_worker_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await admin.query(`create schema ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      options: `-c search_path=${schema}`,
    });
    try {
      const client = await pool.connect();
      try {
        await runBusinessCardIngestV2Migrations(client);
      } finally {
        client.release();
      }
      const rootDir = await mkdtemp(join(tmpdir(), "orbit-ingest-v2-worker-"));
      await fn({
        repo: createBusinessCardIngestRepository({ pool, workspaceId: "workspace:test" }),
        store: createFilesystemDerivativeStore({ rootDir }),
        pool,
        rootDir,
      });
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`drop schema ${schema} cascade`).catch(() => undefined);
    await admin.end();
  }
}

async function readyBatch(harness: Harness, count: number) {
  const { repo, store } = harness;
  const created = await repo.createBatch({
    actorId: ACTOR,
    idempotencyKey: `key:${randomUUID()}`,
    manifest: Array.from({ length: count }, (_, index) => ({
      fileName: `card-${index + 1}.jpg`,
      mimeType: "image/jpeg",
      rawSize: 1000,
      seq: index + 1,
      clientDigest: `sha256:${"0".repeat(63)}${index}`,
    })),
  });
  for (const item of created.items) {
    const stored = await store.put(Buffer.from(`fake-jpeg-${item.seq}`));
    await repo.markItemUploaded({
      actorId: ACTOR,
      batchId: created.batch.id,
      itemId: item.id,
      imageDigest: item.clientDigest,
      derivativeObjectKey: stored.objectKey,
      derivativeSize: stored.size,
    });
  }
  await repo.finalizeBatch({ actorId: ACTOR, batchId: created.batch.id });
  return created;
}

test("worker extracts, reconciles, and delivers exactly one generation-1 notification", { skip }, async () => {
  await withHarness(async (harness) => {
    const created = await readyBatch(harness, 2);
    const sent: Array<{ batchId: string; reviewGeneration: number }> = [];
    const worker = createIngestV2Worker({
      repository: harness.repo,
      store: harness.store,
      provider: providerReturning(EXTRACTION),
      notify: async (input) => {
        sent.push({ batchId: input.batchId, reviewGeneration: input.reviewGeneration });
      },
    });

    const first = await worker.runOnce();
    assert.equal(first.claimed, 2);
    assert.equal(first.extracted, 2);
    assert.equal(first.notificationsSent, 1);
    assert.deepEqual(sent, [{ batchId: created.batch.id, reviewGeneration: 1 }]);

    const detail = await harness.repo.getBatch({ actorId: ACTOR, batchId: created.batch.id });
    assert.equal(detail?.batch.status, "ready_for_review");
    assert.ok(detail?.items.every((item) => item.status === "extracted"));
    assert.ok(detail?.items.every((item) => item.extraction?.fullName === "山田 花子"));

    // 第二轮无事可做，也不重复通知
    const second = await worker.runOnce();
    assert.equal(second.claimed, 0);
    assert.equal(second.notificationsSent, 0);
  });
});

test("worker deadline turns a hanging provider into a retryable failure", { skip }, async () => {
  await withHarness(async (harness) => {
    const created = await readyBatch(harness, 1);
    const worker = createIngestV2Worker({
      repository: harness.repo,
      store: harness.store,
      provider: hangingProvider,
      notify: async () => undefined,
      ocrDeadlineMs: 50,
    });
    const result = await worker.runOnce();
    assert.equal(result.claimed, 1);
    assert.equal(result.failed, 1);
    const detail = await harness.repo.getBatch({ actorId: ACTOR, batchId: created.batch.id });
    assert.equal(detail?.items[0]?.status, "queued");
    assert.equal(detail?.items[0]?.errorCode, "OCR_PROVIDER_TIMEOUT");
    assert.equal(detail?.items[0]?.attemptCount, 1);
  });
});

test("stale generation notifications are superseded, current ones delivered", { skip }, async () => {
  await withHarness(async (harness) => {
    const created = await readyBatch(harness, 1);
    // 第一轮：衍生图缺失 → terminal_failed → ready gen1 + pending 通知
    const [claimed] = await harness.repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    await harness.repo.submitFailure({
      itemId: claimed.id,
      leaseToken: claimed.leaseToken,
      expectedVersion: claimed.version,
      errorStage: "normalize",
      errorCode: "IMAGE_INVALID",
      retryDelayMs: 0,
    });
    // 用户抢在投递前重试 → 批次回 processing，gen1 通知过时
    await harness.repo.retryItem({
      actorId: ACTOR,
      batchId: created.batch.id,
      itemId: claimed.id,
    });

    const sent: number[] = [];
    const worker = createIngestV2Worker({
      repository: harness.repo,
      store: harness.store,
      provider: providerReturning(EXTRACTION),
      notify: async (input) => {
        sent.push(input.reviewGeneration);
      },
    });
    const result = await worker.runOnce();
    assert.equal(result.extracted, 1);
    assert.equal(result.notificationsSuperseded, 1);
    assert.equal(result.notificationsSent, 1);
    assert.deepEqual(sent, [2]);
  });
});

test("worker executes cleanup outbox tasks and deletes derivative files", { skip }, async () => {
  await withHarness(async (harness) => {
    const created = await readyBatch(harness, 1);
    const worker = createIngestV2Worker({
      repository: harness.repo,
      store: harness.store,
      provider: providerReturning(EXTRACTION),
      notify: async () => undefined,
    });
    await worker.runOnce();

    const detail = await harness.repo.getBatch({ actorId: ACTOR, batchId: created.batch.id });
    await harness.repo.skipItem({
      actorId: ACTOR,
      batchId: created.batch.id,
      itemId: detail!.items[0]!.id,
    });

    const before = await readdir(harness.rootDir);
    assert.equal(before.length, 1);
    const result = await worker.runOnce();
    assert.equal(result.cleanupDeleted, 1);
    const after = await readdir(harness.rootDir);
    assert.equal(after.length, 0);

    const finalDetail = await harness.repo.getBatch({ actorId: ACTOR, batchId: created.batch.id });
    assert.equal(finalDetail?.batch.status, "completed");
  });
});
