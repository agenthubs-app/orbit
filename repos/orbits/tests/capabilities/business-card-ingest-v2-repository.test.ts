import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  INGEST_V2_MAX_ATTEMPTS,
  IngestConflictError,
  type IngestManifestEntry,
} from "../../features/acquisition/business-card-ingest-v2/contract";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import {
  computeManifestFingerprint,
  createBusinessCardIngestRepository,
  type BusinessCardIngestRepository,
} from "../../features/acquisition/business-card-ingest-v2/repository";
import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";

const ACTOR = "actor:test";

const EXTRACTION: BusinessCardStructuredExtraction = {
  fullName: "测试 太郎",
  nativeFullName: null,
  romanizedFullName: null,
  organization: "Orbit",
  departments: [],
  title: null,
  emails: [],
  contactPoints: [],
  website: null,
  addresses: [],
  certifications: [],
  detectedLanguages: ["ja"],
};

interface Harness {
  repo: BusinessCardIngestRepository;
  pool: Pool;
}

async function withRepo(fn: (harness: Harness) => Promise<void>): Promise<void> {
  const schema = `bc_ingest_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await admin.query(`create schema ${schema}`);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    try {
      const client = await pool.connect();
      try {
        await runBusinessCardIngestV2Migrations(client);
      } finally {
        client.release();
      }
      const repo = createBusinessCardIngestRepository({
        pool,
        workspaceId: "workspace:test",
      });
      await fn({ repo, pool });
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`drop schema ${schema} cascade`).catch(() => undefined);
    await admin.end();
  }
}

function manifest(count: number): IngestManifestEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    fileName: `card-${index + 1}.heic`,
    mimeType: "image/heic",
    rawSize: 1_500_000 + index,
    seq: index + 1,
    clientDigest: `sha256:client-${index + 1}`,
  }));
}

async function createUploadedBatch(
  repo: BusinessCardIngestRepository,
  count: number,
  idempotencyKey = `key:${randomUUID()}`,
) {
  const { batch, items } = await repo.createBatch({
    actorId: ACTOR,
    idempotencyKey,
    manifest: manifest(count),
  });
  for (const item of items) {
    await repo.markItemUploaded({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: item.id,
      imageDigest: item.clientDigest,
      derivativeObjectKey: `obj/${item.id}.jpg`,
      derivativeSize: 500_000,
    });
  }
  return { batch, items };
}

async function assertConflict(
  promise: Promise<unknown>,
  code: IngestConflictError["code"],
): Promise<IngestConflictError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof IngestConflictError, `expected IngestConflictError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected IngestConflictError(${code}) to be thrown`);
}

async function forceLeaseExpired(pool: Pool, itemId: string): Promise<void> {
  await pool.query(
    `update bc_ingest_items set lease_expires_at = now() - interval '1 second'
     where id = $1`,
    [itemId],
  );
}

async function forceRetryDue(pool: Pool, itemId: string): Promise<void> {
  await pool.query(
    `update bc_ingest_items set next_retry_at = now() - interval '1 second'
     where id = $1 and status = 'queued'`,
    [itemId],
  );
}

async function forceBatchExpired(pool: Pool, batchId: string): Promise<void> {
  await pool.query(
    `update bc_ingest_batches set expires_at = now() - interval '1 second'
     where id = $1`,
    [batchId],
  );
}

async function notificationRows(pool: Pool, batchId: string) {
  const result = await pool.query(
    `select event_type, review_generation, status from bc_ingest_notifications
     where batch_id = $1 order by review_generation`,
    [batchId],
  );
  return result.rows as Array<{
    event_type: string;
    review_generation: string | number;
    status: string;
  }>;
}

test("create batch is atomic and idempotent by key + fingerprint", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const key = `key:${randomUUID()}`;
    const first = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: key,
      manifest: manifest(3),
    });
    assert.equal(first.reused, false);
    assert.equal(first.batch.status, "collecting");
    assert.equal(first.items.length, 3);
    assert.ok(first.items.every((item) => item.status === "awaiting_upload"));

    const replay = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: key,
      manifest: manifest(3),
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.batch.id, first.batch.id);
    assert.equal(replay.items.length, 3);

    await assertConflict(
      repo.createBatch({ actorId: ACTOR, idempotencyKey: key, manifest: manifest(4) }),
      "IDEMPOTENCY_CONFLICT",
    );
  });
});

test("manifest fingerprint is order-insensitive but content-sensitive", { skip }, () => {
  const base = manifest(3);
  const shuffled = [base[2]!, base[0]!, base[1]!];
  assert.equal(computeManifestFingerprint(base), computeManifestFingerprint(shuffled));
  const altered = manifest(3);
  altered[1] = { ...altered[1]!, clientDigest: "sha256:other" };
  assert.notEqual(computeManifestFingerprint(base), computeManifestFingerprint(altered));
});

test("upload is idempotent on same digest and 409 on different digest", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch, items } = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: `key:${randomUUID()}`,
      manifest: manifest(1),
    });
    const item = items[0]!;
    const first = await repo.markItemUploaded({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: item.id,
      imageDigest: "sha256:aaa",
      derivativeObjectKey: "obj/a.jpg",
      derivativeSize: 1,
    });
    assert.equal(first.alreadyUploaded, false);
    assert.equal(first.item.status, "uploaded");

    const replay = await repo.markItemUploaded({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: item.id,
      imageDigest: "sha256:aaa",
      derivativeObjectKey: "obj/other.jpg",
      derivativeSize: 2,
    });
    assert.equal(replay.alreadyUploaded, true);

    await assertConflict(
      repo.markItemUploaded({
        actorId: ACTOR,
        batchId: batch.id,
        itemId: item.id,
        imageDigest: "sha256:bbb",
        derivativeObjectKey: "obj/b.jpg",
        derivativeSize: 3,
      }),
      "CONTENT_MISMATCH",
    );
  });
});

test("finalize queues uploads, is idempotent, and rejects empty batches", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch, items } = await createUploadedBatch(repo, 2);
    const first = await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(first.alreadyFinalized, false);
    assert.equal(first.batch.status, "processing");
    assert.ok(first.batch.finalizedAt);

    const replay = await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(replay.alreadyFinalized, true);

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.ok(detail);
    assert.ok(detail.items.every((item) => item.status === "queued"));
    assert.ok(detail.items.every((item) => item.nextRetryAt !== null));
    assert.equal(items.length, 2);

    // awaiting_upload 阻止 finalize，并返回待处理明细
    const partial = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: `key:${randomUUID()}`,
      manifest: manifest(2),
    });
    await repo.markItemUploaded({
      actorId: ACTOR,
      batchId: partial.batch.id,
      itemId: partial.items[0]!.id,
      imageDigest: "sha256:x",
      derivativeObjectKey: "obj/x.jpg",
      derivativeSize: 1,
    });
    const awaiting = await assertConflict(
      repo.finalizeBatch({ actorId: ACTOR, batchId: partial.batch.id }),
      "AWAITING_UPLOADS",
    );
    assert.equal((awaiting.detail as unknown[]).length, 1);

    // 全排除 → EMPTY_BATCH（终审修正 23 的锁内权威判断）
    const empty = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: `key:${randomUUID()}`,
      manifest: manifest(1),
    });
    await repo.excludeItem({
      actorId: ACTOR,
      batchId: empty.batch.id,
      itemId: empty.items[0]!.id,
    });
    await assertConflict(
      repo.finalizeBatch({ actorId: ACTOR, batchId: empty.batch.id }),
      "EMPTY_BATCH",
    );
  });
});

test("concurrent finalize succeeds exactly once and replays for the loser", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch } = await createUploadedBatch(repo, 3);
    const [a, b] = await Promise.all([
      repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id }),
      repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id }),
    ]);
    const flags = [a.alreadyFinalized, b.alreadyFinalized].sort();
    assert.deepEqual(flags, [false, true]);
  });
});

test("claim grants per-item lease tokens and counts attempts at claim time", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 2);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const claimed = await repo.claimItems({ limit: 10 });
    assert.equal(claimed.length, 2);
    assert.ok(claimed.every((item) => item.status === "processing"));
    assert.ok(claimed.every((item) => item.attemptCount === 1));
    assert.notEqual(claimed[0]!.leaseToken, claimed[1]!.leaseToken);

    // 已领取项不会被重复领取
    const again = await repo.claimItems({ limit: 10 });
    assert.equal(again.length, 0);

    // 过期批次即使 sweep 未跑也不授予新 lease（终审修正 24）
    const other = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: other.batch.id });
    await forceBatchExpired(pool, other.batch.id);
    const expiredClaim = await repo.claimItems({ limit: 10 });
    assert.equal(expiredClaim.length, 0);
  });
});

test("two workers finishing the last two items produce exactly one ready notification", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 2);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const claimed = await repo.claimItems({ limit: 2 });
    assert.equal(claimed.length, 2);

    const results = await Promise.all(
      claimed.map((item) =>
        repo.submitExtraction({
          itemId: item.id,
          leaseToken: item.leaseToken,
          expectedVersion: item.version,
          extraction: EXTRACTION,
          reviewIssues: [],
          usage: null,
        }),
      ),
    );
    assert.ok(results.every((result) => result.accepted));

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "ready_for_review");
    assert.equal(detail?.batch.reviewGeneration, 1);

    const notifications = await notificationRows(pool, batch.id);
    assert.equal(notifications.length, 1);
    assert.equal(Number(notifications[0]!.review_generation), 1);
  });
});

test("stale lease submissions are silently rejected after takeover", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const [first] = await repo.claimItems({ limit: 1 });
    assert.ok(first);

    await forceLeaseExpired(pool, first.id);
    const [takeover] = await repo.claimItems({ limit: 1 });
    assert.ok(takeover);
    assert.equal(takeover.id, first.id);
    assert.equal(takeover.attemptCount, 2);

    const stale = await repo.submitExtraction({
      itemId: first.id,
      leaseToken: first.leaseToken,
      expectedVersion: first.version,
      extraction: EXTRACTION,
      reviewIssues: [],
      usage: null,
    });
    assert.equal(stale.accepted, false);

    const fresh = await repo.submitExtraction({
      itemId: takeover.id,
      leaseToken: takeover.leaseToken,
      expectedVersion: takeover.version,
      extraction: EXTRACTION,
      reviewIssues: [],
      usage: null,
    });
    assert.equal(fresh.accepted, true);
  });
});

test("retryable failures back off and exhaust into terminal_failed", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });

    for (let attempt = 1; attempt <= INGEST_V2_MAX_ATTEMPTS; attempt += 1) {
      const [claimed] = await repo.claimItems({ limit: 1 });
      assert.ok(claimed, `attempt ${attempt} should be claimable`);
      assert.equal(claimed.attemptCount, attempt);
      const failure = await repo.submitFailure({
        itemId: claimed.id,
        leaseToken: claimed.leaseToken,
        expectedVersion: claimed.version,
        errorStage: "ocr",
        errorCode: "OCR_PROVIDER_TIMEOUT",
        retryDelayMs: 60_000,
      });
      assert.equal(failure.accepted, true);
      if (attempt < INGEST_V2_MAX_ATTEMPTS) {
        await forceRetryDue(pool, claimed.id);
      }
    }

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.items[0]?.status, "terminal_failed");
    assert.equal(detail?.items[0]?.errorCode, "OCR_PROVIDER_TIMEOUT");
    // 部分失败仍进入 ready_for_review（方案 §六）
    assert.equal(detail?.batch.status, "ready_for_review");
  });
});

test("non-retryable failures go terminal immediately", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch } = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const [claimed] = await repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    await repo.submitFailure({
      itemId: claimed.id,
      leaseToken: claimed.leaseToken,
      expectedVersion: claimed.version,
      errorStage: "normalize",
      errorCode: "IMAGE_INVALID",
      retryDelayMs: 60_000,
    });
    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.items[0]?.status, "terminal_failed");
    assert.equal(detail?.items[0]?.attemptCount, 1);
  });
});

test("reaper terminalizes poison items whose final lease expired unclaimed", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });

    // 三次领取全部超时（模拟毒图把 worker 拖死）
    let itemId = "";
    for (let attempt = 1; attempt <= INGEST_V2_MAX_ATTEMPTS; attempt += 1) {
      const [claimed] = await repo.claimItems({ limit: 1 });
      assert.ok(claimed, `attempt ${attempt}`);
      itemId = claimed.id;
      await forceLeaseExpired(pool, claimed.id);
    }
    // attempt_count 已达上限：领取 SQL 不再匹配
    const empty = await repo.claimItems({ limit: 1 });
    assert.equal(empty.length, 0);

    const { reapedItemIds } = await repo.reapExhaustedLeases();
    assert.deepEqual(reapedItemIds, [itemId]);

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.items[0]?.status, "terminal_failed");
    assert.equal(detail?.items[0]?.errorCode, "LEASE_EXHAUSTED");
    assert.equal(detail?.batch.status, "ready_for_review");
    const notifications = await notificationRows(pool, batch.id);
    assert.equal(notifications.length, 1);
  });
});

test("review retry re-queues, re-processes, and notifies under a new generation", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const [claimed] = await repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    await repo.submitFailure({
      itemId: claimed.id,
      leaseToken: claimed.leaseToken,
      expectedVersion: claimed.version,
      errorStage: "normalize",
      errorCode: "IMAGE_INVALID",
      retryDelayMs: 0,
    });
    let detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "ready_for_review");
    assert.equal(detail?.batch.reviewGeneration, 1);

    const retried = await repo.retryItem({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: claimed.id,
    });
    assert.equal(retried.status, "queued");
    assert.equal(retried.attemptCount, 0);
    detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "processing");

    const [reclaimed] = await repo.claimItems({ limit: 1 });
    assert.ok(reclaimed);
    await repo.submitExtraction({
      itemId: reclaimed.id,
      leaseToken: reclaimed.leaseToken,
      expectedVersion: reclaimed.version,
      extraction: EXTRACTION,
      reviewIssues: [],
      usage: null,
    });
    detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "ready_for_review");
    assert.equal(detail?.batch.reviewGeneration, 2);
    const notifications = await notificationRows(pool, batch.id);
    assert.equal(notifications.length, 2);
    assert.deepEqual(
      notifications.map((row) => Number(row.review_generation)),
      [1, 2],
    );
  });
});

test("confirm runs contact creation inside the transaction and rolls back together", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 2);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const claimed = await repo.claimItems({ limit: 2 });
    for (const item of claimed) {
      await repo.submitExtraction({
        itemId: item.id,
        leaseToken: item.leaseToken,
        expectedVersion: item.version,
        extraction: EXTRACTION,
        reviewIssues: [],
        usage: null,
      });
    }
    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    const [first, second] = detail!.items;

    // 失败的 createContact 让整个事务回滚：item 仍是 extracted，无 cleanup 任务
    await assert.rejects(
      repo.confirmItem({
        actorId: ACTOR,
        batchId: batch.id,
        itemId: first!.id,
        allowFrom: ["extracted"] as const,
        async createContact() {
          throw new Error("contact write failed");
        },
      }),
      /contact write failed/,
    );
    const afterRollback = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(
      afterRollback?.items.find((item) => item.id === first!.id)?.status,
      "extracted",
    );
    const cleanupAfterRollback = await pool.query(
      `select count(*)::int as n from bc_ingest_cleanup_tasks where batch_id = $1`,
      [batch.id],
    );
    assert.equal(cleanupAfterRollback.rows[0].n, 0);

    // 成功确认：同事务写入联系人标记（用事务内 SQL 证明同一事务）
    const confirmed = await repo.confirmItem({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: first!.id,
      allowFrom: ["extracted"] as const,
      async createContact(client) {
        await client.query(
          `insert into bc_ingest_cleanup_tasks (workspace_id, object_key, batch_id)
           values ('workspace:test', 'marker/contact-write', $1)`,
          [batch.id],
        );
        return "contact:test-1";
      },
    });
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.confirmedContactId, "contact:test-1");

    // 跳过最后一项 → 批次自动 completed
    const skipped = await repo.skipItem({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: second!.id,
    });
    assert.equal(skipped.status, "skipped");
    const finalDetail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(finalDetail?.batch.status, "completed");
  });
});

test("cancel fences in-flight leases and preserves confirmed contacts", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch } = await createUploadedBatch(repo, 3);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const claimed = await repo.claimItems({ limit: 3 });
    assert.equal(claimed.length, 3);

    // 先完成并确认一项
    const [done, inflight, other] = claimed;
    await repo.submitExtraction({
      itemId: done!.id,
      leaseToken: done!.leaseToken,
      expectedVersion: done!.version,
      extraction: EXTRACTION,
      reviewIssues: [],
      usage: null,
    });
    await repo.confirmItem({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: done!.id,
      allowFrom: ["extracted"] as const,
      async createContact() {
        return "contact:kept";
      },
    });

    const cancelled = await repo.cancelBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(cancelled.status, "cancelled");

    // 在途 worker 的迟到提交被静默拒绝
    const stale = await repo.submitExtraction({
      itemId: inflight!.id,
      leaseToken: inflight!.leaseToken,
      expectedVersion: inflight!.version,
      extraction: EXTRACTION,
      reviewIssues: [],
      usage: null,
    });
    assert.equal(stale.accepted, false);

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    const byId = new Map(detail!.items.map((item) => [item.id, item]));
    assert.equal(byId.get(done!.id)?.status, "confirmed");
    assert.equal(byId.get(done!.id)?.confirmedContactId, "contact:kept");
    assert.equal(byId.get(inflight!.id)?.status, "excluded");
    assert.equal(byId.get(other!.id)?.status, "excluded");
  });
});

test("expired batches reject user operations and expire in place", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    // collecting 过期：上传被拒，批次转 expired
    const collecting = await repo.createBatch({
      actorId: ACTOR,
      idempotencyKey: `key:${randomUUID()}`,
      manifest: manifest(1),
    });
    await forceBatchExpired(pool, collecting.batch.id);
    await assertConflict(
      repo.markItemUploaded({
        actorId: ACTOR,
        batchId: collecting.batch.id,
        itemId: collecting.items[0]!.id,
        imageDigest: "sha256:a",
        derivativeObjectKey: "obj/a.jpg",
        derivativeSize: 1,
      }),
      "BATCH_GONE",
    );
    const detail = await repo.getBatch({ actorId: ACTOR, batchId: collecting.batch.id });
    assert.equal(detail?.batch.status, "expired");

    // finalize 也不能给已过期批次续命（终审修正 24）
    const dueForFinalize = await createUploadedBatch(repo, 1);
    await forceBatchExpired(pool, dueForFinalize.batch.id);
    await assertConflict(
      repo.finalizeBatch({ actorId: ACTOR, batchId: dueForFinalize.batch.id }),
      "BATCH_GONE",
    );

    // 已 finalize 的批次超期：复核操作被拒
    const reviewing = await createUploadedBatch(repo, 1);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: reviewing.batch.id });
    const [claimed] = await repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    await repo.submitFailure({
      itemId: claimed.id,
      leaseToken: claimed.leaseToken,
      expectedVersion: claimed.version,
      errorStage: "ocr",
      errorCode: "OCR_INVALID_OUTPUT",
      retryDelayMs: 0,
    });
    // 耗尽剩余尝试，进入 terminal_failed
    for (let attempt = 2; attempt <= INGEST_V2_MAX_ATTEMPTS; attempt += 1) {
      await forceRetryDue(pool, claimed.id);
      const [again] = await repo.claimItems({ limit: 1 });
      assert.ok(again);
      await repo.submitFailure({
        itemId: again.id,
        leaseToken: again.leaseToken,
        expectedVersion: again.version,
        errorStage: "ocr",
        errorCode: "OCR_INVALID_OUTPUT",
        retryDelayMs: 0,
      });
    }
    await forceBatchExpired(pool, reviewing.batch.id);
    await assertConflict(
      repo.retryItem({ actorId: ACTOR, batchId: reviewing.batch.id, itemId: claimed.id }),
      "BATCH_GONE",
    );
  });
});

test("sweep expires due batches and enqueues derivative cleanup", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    const { batch } = await createUploadedBatch(repo, 2);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    await forceBatchExpired(pool, batch.id);
    const { expiredBatchIds } = await repo.sweepDueBatches();
    assert.deepEqual(expiredBatchIds, [batch.id]);

    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "expired");
    assert.ok(detail?.items.every((item) => item.status === "excluded"));

    const cleanup = await repo.listPendingCleanupTasks({ limit: 10 });
    assert.equal(cleanup.length, 2);
    await repo.resolveCleanupTask({ id: cleanup[0]!.id, outcome: "done" });
    const remaining = await repo.listPendingCleanupTasks({ limit: 10 });
    assert.equal(remaining.length, 1);
  });
});

test("swap derivative enforces version and per-phase preconditions", { skip }, async () => {
  await withRepo(async ({ repo, pool }) => {
    // collecting 期换图
    const { batch, items } = await createUploadedBatch(repo, 1);
    const uploaded = (await repo.getBatch({ actorId: ACTOR, batchId: batch.id }))!.items[0]!;
    await assertConflict(
      repo.swapDerivative({
        actorId: ACTOR,
        batchId: batch.id,
        itemId: uploaded.id,
        expectedVersion: uploaded.version + 5,
        imageDigest: "sha256:new",
        derivativeObjectKey: "obj/new.jpg",
        derivativeSize: 2,
      }),
      "VERSION_CONFLICT",
    );
    const swapped = await repo.swapDerivative({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: uploaded.id,
      expectedVersion: uploaded.version,
      imageDigest: "sha256:new",
      derivativeObjectKey: "obj/new.jpg",
      derivativeSize: 2,
    });
    assert.equal(swapped.status, "uploaded");
    assert.equal(swapped.imageDigest, "sha256:new");
    // 旧对象进入 cleanup
    const cleanup = await repo.listPendingCleanupTasks({ limit: 10 });
    assert.equal(cleanup.length, 1);
    assert.equal(cleanup[0]!.objectKey, `obj/${items[0]!.id}.jpg`);

    // review 期换图：terminal_failed → queued 且批次回 processing
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const [claimed] = await repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    await repo.submitFailure({
      itemId: claimed.id,
      leaseToken: claimed.leaseToken,
      expectedVersion: claimed.version,
      errorStage: "normalize",
      errorCode: "IMAGE_INVALID",
      retryDelayMs: 0,
    });
    const failed = (await repo.getBatch({ actorId: ACTOR, batchId: batch.id }))!.items[0]!;
    assert.equal(failed.status, "terminal_failed");
    const requeued = await repo.swapDerivative({
      actorId: ACTOR,
      batchId: batch.id,
      itemId: failed.id,
      expectedVersion: failed.version,
      imageDigest: "sha256:replacement",
      derivativeObjectKey: "obj/replacement.jpg",
      derivativeSize: 3,
    });
    assert.equal(requeued.status, "queued");
    assert.equal(requeued.attemptCount, 0);
    const detail = await repo.getBatch({ actorId: ACTOR, batchId: batch.id });
    assert.equal(detail?.batch.status, "processing");
    void pool;
  });
});

test("summary derives counts in a single snapshot", { skip }, async () => {
  await withRepo(async ({ repo }) => {
    const { batch } = await createUploadedBatch(repo, 3);
    await repo.finalizeBatch({ actorId: ACTOR, batchId: batch.id });
    const [claimed] = await repo.claimItems({ limit: 1 });
    assert.ok(claimed);
    const summary = await repo.getBatchSummary({ actorId: ACTOR, batchId: batch.id });
    assert.ok(summary);
    assert.equal(summary.counts.processing, 1);
    assert.equal(summary.counts.queuedReady, 2);
    assert.equal(summary.counts.uploaded, 0);
    assert.equal(summary.batch.status, "processing");
  });
});
