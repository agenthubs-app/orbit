import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "../business-card-cloud-ocr";
import {
  INGEST_ITEM_COMPLETED_STATUSES,
  INGEST_V2_COLLECTING_TTL_HOURS,
  INGEST_V2_EXTRACTION_SCHEMA_VERSION,
  INGEST_V2_LEASE_SECONDS,
  INGEST_V2_MAX_ATTEMPTS,
  INGEST_V2_MAX_ITEMS,
  INGEST_V2_REVIEW_TTL_DAYS,
  IngestConflictError,
  isRetryableIngestError,
  type IngestBatchDTO,
  type IngestBatchSummary,
  type IngestCardConfirmationItem,
  type IngestCardFieldSources,
  type IngestItemDTO,
  type IngestItemErrorCode,
  type IngestItemErrorStage,
  type IngestManifestEntry,
} from "./contract";
import { sanitizeIndustryPair } from "../../../shared/domain/industries";
import { enqueuePlanMatchJob } from "../../plans/matching-repository";

// 设计方案：docs/superpowers/plans/2026-08-31-business-card-batch-ingest-v2.md (v2.4)
//
// 锁纪律（方案 §六）：所有批次级生命周期事务由本文件的 withBatchLock 收口——
// 先锁 batch 父行，再动 items，锁内先 expireIfDueLocked，收尾 reconcileBatchStateLocked。
// worker 领取（claimItems）是唯一不持 batch 锁的路径，claim 后不得再申请 batch 锁。
// "CAS 影响 0 行 → 静默丢弃" 仅适用于 worker 结果提交；用户事务一律回滚并抛 409。

interface QueryResultLike {
  rowCount: number | null;
  rows: Array<Record<string, unknown>>;
}

export interface IngestQueryClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResultLike>;
}

export interface IngestPoolLike {
  connect(): Promise<IngestQueryClient & { release(): void }>;
}

export interface BusinessCardIngestRepository {
  createBatch(input: {
    actorId: string;
    idempotencyKey: string;
    manifest: readonly IngestManifestEntry[];
  }): Promise<{ batch: IngestBatchDTO; items: IngestItemDTO[]; reused: boolean }>;
  getBatch(input: {
    actorId: string;
    batchId: string;
  }): Promise<{ batch: IngestBatchDTO; items: IngestItemDTO[] } | null>;
  getBatchSummary(input: {
    actorId: string;
    batchId: string;
  }): Promise<IngestBatchSummary | null>;
  listBatches(input: { actorId: string }): Promise<IngestBatchDTO[]>;
  markItemUploaded(input: {
    actorId: string;
    batchId: string;
    itemId: string;
    imageDigest: string;
    derivativeObjectKey: string;
    derivativeSize: number;
    /** An already-open source-consumption transaction; never commit it here. */
    transactionClient?: IngestQueryClient;
  }): Promise<{ item: IngestItemDTO; alreadyUploaded: boolean }>;
  excludeItem(input: {
    actorId: string;
    batchId: string;
    itemId: string;
  }): Promise<IngestItemDTO>;
  swapDerivative(input: {
    actorId: string;
    batchId: string;
    itemId: string;
    expectedVersion: number;
    imageDigest: string;
    derivativeObjectKey: string;
    derivativeSize: number;
    /** An already-open source-consumption transaction; never commit it here. */
    transactionClient?: IngestQueryClient;
  }): Promise<IngestItemDTO>;
  finalizeBatch(input: {
    actorId: string;
    batchId: string;
  }): Promise<{ batch: IngestBatchDTO; alreadyFinalized: boolean }>;
  claimItems(input: {
    limit: number;
  }): Promise<Array<IngestItemDTO & { leaseToken: string }>>;
  submitExtraction(input: {
    itemId: string;
    leaseToken: string;
    expectedVersion: number;
    extraction: BusinessCardStructuredExtraction;
    reviewIssues: readonly BusinessCardReviewIssue[];
    usage: BusinessCardCloudOcrUsage | null;
    providerRequestId?: string | null;
  }): Promise<{ accepted: boolean }>;
  submitFailure(input: {
    itemId: string;
    leaseToken: string;
    expectedVersion: number;
    errorStage: IngestItemErrorStage;
    errorCode: IngestItemErrorCode;
    retryDelayMs: number;
  }): Promise<{ accepted: boolean }>;
  retryItem(input: {
    actorId: string;
    batchId: string;
    itemId: string;
  }): Promise<IngestItemDTO>;
  skipItem(input: {
    actorId: string;
    batchId: string;
    itemId: string;
  }): Promise<IngestItemDTO>;
  confirmItem(input: {
    actorId: string;
    batchId: string;
    itemId: string;
    allowFrom: readonly ["extracted"] | readonly ["terminal_failed"];
    createContact(client: IngestQueryClient): Promise<string>;
  }): Promise<IngestItemDTO>;
  confirmCard(input: {
    actorId: string;
    batchId: string;
    itemId: string;
    confirmationIntentId: string;
    confirmationFingerprint: string;
    expectedItems: readonly IngestCardConfirmationItem[];
    fieldSources: IngestCardFieldSources;
    allowFrom: readonly ("extracted" | "terminal_failed")[];
    createContact(client: IngestQueryClient): Promise<string>;
  }): Promise<{ items: IngestItemDTO[]; replayed: boolean }>;
  cancelBatch(input: {
    actorId: string;
    batchId: string;
  }): Promise<IngestBatchDTO>;
  /** 只读查询用的连接（复核页查「可能是同一个联系人」）。不开事务、不加锁。 */
  withReadClient?<T>(fn: (client: IngestQueryClient) => Promise<T>): Promise<T>;
  sweepDueBatches(): Promise<{ expiredBatchIds: string[] }>;
  reapExhaustedLeases(): Promise<{ reapedItemIds: string[] }>;
  listPendingNotifications(input: { limit: number }): Promise<
    Array<{
      batchId: string;
      eventType: string;
      reviewGeneration: number;
      actorId: string;
    }>
  >;
  resolveNotification(input: {
    batchId: string;
    eventType: string;
    reviewGeneration: number;
    outcome: "sent" | "superseded";
  }): Promise<void>;
  listPendingCleanupTasks(input: {
    limit: number;
  }): Promise<Array<{ id: number; objectKey: string; batchId: string | null }>>;
  resolveCleanupTask(input: {
    id: number;
    outcome: "done" | "retry";
    retryDelayMs?: number;
  }): Promise<void>;
}

export function computeManifestFingerprint(
  manifest: readonly IngestManifestEntry[],
): string {
  const ordered = [...manifest].sort((a, b) => a.seq - b.seq);
  const legacy = ordered.length > 0 && ordered.every((entry) => entry.legacyIdentity === true);
  const canonical = ordered.map((entry) => (legacy
    ? [entry.seq, entry.fileName, entry.mimeType, entry.rawSize, entry.clientDigest]
    : [entry.seq, entry.cardId, entry.side, entry.fileName, entry.mimeType, entry.rawSize, entry.clientDigest]
  ).join("\u0000")).join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

const ACTIVE_ITEM_STATUSES_SQL = `('awaiting_upload', 'uploaded', 'queued', 'processing', 'extracted', 'terminal_failed')`;
const COMPLETED_SET_SQL = INGEST_ITEM_COMPLETED_STATUSES.map((s) => `'${s}'`).join(", ");

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIso(value);
}

function mapBatch(row: Record<string, unknown>): IngestBatchDTO {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    status: row.status as IngestBatchDTO["status"],
    expectedItems: Number(row.expected_items),
    version: Number(row.version),
    reviewGeneration: Number(row.review_generation),
    idempotencyKey: String(row.idempotency_key),
    manifestFingerprint: String(row.manifest_fingerprint),
    statusReason: (row.status_reason as string | null) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finalizedAt: toIsoOrNull(row.finalized_at),
    expiresAt: toIso(row.expires_at),
  };
}

// 提取结构 v1 没有行业键：读出时统一补成 null（并按分类再校验一次），旧批次照常打开与确认。
function storedExtraction(value: unknown): BusinessCardStructuredExtraction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const extraction = value as BusinessCardStructuredExtraction;
  return {
    ...extraction,
    ...sanitizeIndustryPair(extraction.primaryIndustryId, extraction.secondaryIndustryId),
  };
}

function mapItem(row: Record<string, unknown>): IngestItemDTO {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    cardId: String(row.card_id),
    side: row.card_side as IngestItemDTO["side"],
    seq: Number(row.seq),
    status: row.status as IngestItemDTO["status"],
    version: Number(row.version),
    sourceFileName: String(row.source_file_name),
    rawSize: Number(row.raw_size),
    rawMimeType: String(row.raw_mime_type),
    clientDigest: String(row.client_digest),
    imageDigest: (row.image_digest as string | null) ?? null,
    derivativeObjectKey: (row.derivative_object_key as string | null) ?? null,
    derivativeSize: row.derivative_size === null ? null : Number(row.derivative_size),
    extraction: storedExtraction(row.extraction),
    extractionSchemaVersion:
      row.extraction_schema_version === null
        ? null
        : Number(row.extraction_schema_version),
    reviewIssues: (row.review_issues as BusinessCardReviewIssue[] | null) ?? [],
    usage: (row.usage as BusinessCardCloudOcrUsage | null) ?? null,
    confirmedContactId: (row.confirmed_contact_id as string | null) ?? null,
    confirmedFieldSources: (row.confirmation_field_sources as IngestCardFieldSources | null) ?? null,
    cardIdentityExplicit: row.card_identity_explicit === true,
    attemptCount: Number(row.attempt_count),
    nextRetryAt: toIsoOrNull(row.next_retry_at),
    leaseExpiresAt: toIsoOrNull(row.lease_expires_at),
    errorStage: (row.error_stage as IngestItemDTO["errorStage"]) ?? null,
    errorCode: (row.error_code as IngestItemDTO["errorCode"]) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function createBusinessCardIngestRepository(options: {
  pool: IngestPoolLike;
  workspaceId: string;
}): BusinessCardIngestRepository {
  const { pool, workspaceId } = options;

  async function withClient<T>(
    fn: (client: IngestQueryClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  interface LockedBatchContext {
    client: IngestQueryClient;
    batchRow: Record<string, unknown>;
  }

  /**
   * 唯一生命周期事务入口。锁 batch 父行 → expireIfDueLocked → fn。
   * onExpired = "throw": 过期时先提交过期变更，再抛 BATCH_GONE（用户路径，410）。
   * onExpired = "silent": 过期时提交过期变更并返回 null（worker 提交路径）。
   */
  async function withBatchLock<T>(
    batchId: string,
    onExpired: "throw" | "silent",
    fn: (ctx: LockedBatchContext) => Promise<T>,
    transactionClient?: IngestQueryClient,
  ): Promise<T | null> {
    const execute = async (client: IngestQueryClient, borrowed: boolean) => {
      // SAVEPOINT also rejects accidental use of a client outside a transaction.
      await client.query(borrowed ? "savepoint bc_ingest_upload" : "begin");
      let finalized = false;
      const finish = async () => {
        await client.query(borrowed ? "release savepoint bc_ingest_upload" : "commit");
        finalized = true;
      };
      try {
        const result = await client.query(
          `select * from bc_ingest_batches
           where workspace_id = $1 and id = $2
           for update`,
          [workspaceId, batchId],
        );
        const batchRow = result.rows[0];
        if (!batchRow) throw new IngestConflictError("BATCH_GONE", "batch not found");
        const expired = await expireIfDueLocked(client, batchRow);
        if (expired) {
          await finish();
          if (onExpired === "throw") throw new IngestConflictError("BATCH_GONE", "batch expired");
          return null;
        }
        const value = await fn({ client, batchRow });
        await finish();
        return value;
      } catch (error) {
        if (!finalized) {
          if (borrowed) {
            await client.query("rollback to savepoint bc_ingest_upload");
            await client.query("release savepoint bc_ingest_upload");
          } else await client.query("rollback").catch(() => undefined);
        }
        throw error;
      }
    };
    return transactionClient ? execute(transactionClient, true) : withClient((client) => execute(client, false));
  }

  /** 到期则原地过期（fence items + cleanup outbox），返回 true。调用方决定提交与响应。 */
  async function expireIfDueLocked(
    client: IngestQueryClient,
    batchRow: Record<string, unknown>,
  ): Promise<boolean> {
    const status = String(batchRow.status);
    const isExpirable =
      status === "collecting" || status === "processing" || status === "ready_for_review";
    if (!isExpirable) {
      return false;
    }
    const due = await client.query(
      `select (expires_at < now()) as due from bc_ingest_batches
       where workspace_id = $1 and id = $2`,
      [workspaceId, String(batchRow.id)],
    );
    if (!due.rows[0] || due.rows[0].due !== true) {
      return false;
    }
    await terminateBatchLocked(client, String(batchRow.id), "expired", "deadline elapsed");
    return true;
  }

  /** cancel / expire 共用的终止逻辑：fence 全部非完成集合 items，衍生图入 cleanup outbox。 */
  async function terminateBatchLocked(
    client: IngestQueryClient,
    batchId: string,
    terminalStatus: "cancelled" | "expired",
    reason: string,
  ): Promise<void> {
    await client.query(
      `insert into bc_ingest_cleanup_tasks (workspace_id, object_key, batch_id)
       select workspace_id, derivative_object_key, batch_id
       from bc_ingest_items
       where workspace_id = $1 and batch_id = $2
         and status in ${ACTIVE_ITEM_STATUSES_SQL}
         and derivative_object_key is not null`,
      [workspaceId, batchId],
    );
    await client.query(
      `update bc_ingest_items
       set status = 'excluded', lease_token = null, lease_expires_at = null,
           next_retry_at = null, derivative_object_key = null, derivative_size = null,
           version = version + 1, updated_at = now()
       where workspace_id = $1 and batch_id = $2
         and status in ${ACTIVE_ITEM_STATUSES_SQL}`,
      [workspaceId, batchId],
    );
    await client.query(
      `update bc_ingest_batches
       set status = $3, status_reason = $4, version = version + 1, updated_at = now()
       where workspace_id = $1 and id = $2`,
      [workspaceId, batchId, terminalStatus, reason],
    );
  }

  /**
   * 唯一状态归约函数（方案 §六）。持 batch 锁调用；expireIfDueLocked 由 withBatchLock 前置。
   * 全部 item ∈ 完成集合 → completed；processing 且无 queued/processing → ready_for_review
   * （generation+1，同事务写通知 outbox）。
   */
  async function reconcileBatchStateLocked(
    client: IngestQueryClient,
    batchRow: Record<string, unknown>,
  ): Promise<void> {
    const batchId = String(batchRow.id);
    const counts = await client.query(
      `select
         count(*) filter (where status not in (${COMPLETED_SET_SQL})) as remaining,
         count(*) filter (where status in ('queued', 'processing')) as active,
         count(*) as total
       from bc_ingest_items
       where workspace_id = $1 and batch_id = $2`,
      [workspaceId, batchId],
    );
    const row = counts.rows[0] ?? { remaining: 0, active: 0, total: 0 };
    const remaining = Number(row.remaining);
    const active = Number(row.active);
    const total = Number(row.total);
    const status = String(batchRow.status);

    if (total > 0 && remaining === 0 && (status === "processing" || status === "ready_for_review")) {
      await client.query(
        `update bc_ingest_batches
         set status = 'completed', version = version + 1, updated_at = now()
         where workspace_id = $1 and id = $2`,
        [workspaceId, batchId],
      );
      // W0010：同一事务写人脉需求匹配任务（outbox）。批次行已持锁、completed 只会转入一次；
      // 任务表另有 (actor, batch) 唯一约束兜底重放。一张名片的批次按东京自然日聚合。
      const confirmed = await client.query(
        `select coalesce(array_agg(distinct confirmed_contact_id)
                  filter (where confirmed_contact_id is not null), '{}') as contact_ids,
                count(distinct card_id) as cards
         from bc_ingest_items
         where workspace_id = $1 and batch_id = $2`,
        [workspaceId, batchId],
      );
      const summary = confirmed.rows[0] ?? { contact_ids: [], cards: 0 };
      await enqueuePlanMatchJob(client, {
        actorId: String(batchRow.actor_id),
        batchId,
        contactIds: Array.isArray(summary.contact_ids) ? (summary.contact_ids as string[]) : [],
        singleCard: Number(summary.cards) === 1,
        workspaceId,
      });
      return;
    }
    if (status === "processing" && active === 0) {
      const updated = await client.query(
        `update bc_ingest_batches
         set status = 'ready_for_review', review_generation = review_generation + 1,
             version = version + 1, updated_at = now()
         where workspace_id = $1 and id = $2 and status = 'processing'
         returning review_generation, actor_id`,
        [workspaceId, batchId],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow) {
        await client.query(
          `insert into bc_ingest_notifications
             (workspace_id, batch_id, event_type, review_generation, actor_id)
           values ($1, $2, 'batch_ready', $3, $4)`,
          [
            workspaceId,
            batchId,
            Number(updatedRow.review_generation),
            String(updatedRow.actor_id),
          ],
        );
      }
    }
  }

  async function requireOwnedBatch(
    ctx: LockedBatchContext,
    actorId: string,
  ): Promise<void> {
    if (String(ctx.batchRow.actor_id) !== actorId) {
      throw new IngestConflictError("BATCH_GONE", "batch not found");
    }
  }

  async function lockItem(
    client: IngestQueryClient,
    batchId: string,
    itemId: string,
  ): Promise<Record<string, unknown>> {
    const result = await client.query(
      `select * from bc_ingest_items
       where workspace_id = $1 and batch_id = $2 and id = $3
       for update`,
      [workspaceId, batchId, itemId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new IngestConflictError("ITEM_STATE_CONFLICT", "item not found");
    }
    return row;
  }

  async function readItem(
    client: IngestQueryClient,
    itemId: string,
  ): Promise<IngestItemDTO> {
    const result = await client.query(
      `select * from bc_ingest_items where workspace_id = $1 and id = $2`,
      [workspaceId, itemId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new IngestConflictError("ITEM_STATE_CONFLICT", "item not found");
    }
    return mapItem(row);
  }

  async function enqueueCleanup(
    client: IngestQueryClient,
    batchId: string,
    objectKey: string | null,
  ): Promise<void> {
    if (!objectKey) {
      return;
    }
    await client.query(
      `insert into bc_ingest_cleanup_tasks (workspace_id, object_key, batch_id)
       values ($1, $2, $3)`,
      [workspaceId, objectKey, batchId],
    );
  }

  return {
    async createBatch({ actorId, idempotencyKey, manifest }) {
      if (manifest.length === 0) {
        throw new IngestConflictError("EMPTY_BATCH", "manifest is empty");
      }
      if (manifest.length > INGEST_V2_MAX_ITEMS) {
        throw new IngestConflictError(
          "IDEMPOTENCY_CONFLICT",
          `manifest exceeds ${INGEST_V2_MAX_ITEMS} items`,
        );
      }
      const normalizedManifest = manifest.map((entry) => ({
        ...entry,
        cardId: entry.cardId?.trim() || `legacy:${entry.seq}`,
        side: entry.side ?? "front" as const,
        legacyIdentity: entry.legacyIdentity === true || !entry.cardId || !entry.side,
      }));
      const seqs = new Set(normalizedManifest.map((entry) => entry.seq));
      if (seqs.size !== manifest.length) {
        throw new IngestConflictError("IDEMPOTENCY_CONFLICT", "duplicate seq in manifest");
      }
      const cardGroups = new Map<string, IngestManifestEntry[]>();
      for (const entry of normalizedManifest) {
        cardGroups.set(entry.cardId, [...(cardGroups.get(entry.cardId) ?? []), entry]);
      }
      for (const [cardId, entries] of cardGroups) {
        if (!cardId.trim() || entries.filter((entry) => entry.side === "front").length !== 1 || entries.filter((entry) => entry.side === "back").length > 1) {
          throw new IngestConflictError("IDEMPOTENCY_CONFLICT", `card ${cardId || "<empty>"} must have one front and at most one back`);
        }
      }
      const fingerprint = computeManifestFingerprint(normalizedManifest);
      const batchId = `bcb2:${randomUUID()}`;

      const attemptInsert = async (): Promise<
        { batch: IngestBatchDTO; items: IngestItemDTO[]; reused: boolean } | null
      > =>
        withClient(async (client) => {
          await client.query("begin");
          try {
            const inserted = await client.query(
              `insert into bc_ingest_batches
                 (workspace_id, id, actor_id, status, expected_items,
                  idempotency_key, manifest_fingerprint, expires_at)
               values ($1, $2, $3, 'collecting', $4, $5, $6,
                       now() + make_interval(hours => ${INGEST_V2_COLLECTING_TTL_HOURS}))
               on conflict (workspace_id, actor_id, idempotency_key) do nothing
               returning *`,
              [workspaceId, batchId, actorId, manifest.length, idempotencyKey, fingerprint],
            );
            const batchRow = inserted.rows[0];
            if (!batchRow) {
              await client.query("rollback");
              return null;
            }
            const items: IngestItemDTO[] = [];
            for (const entry of [...normalizedManifest].sort((a, b) => a.seq - b.seq)) {
              const itemId = `bci2:${randomUUID()}`;
              const itemResult = await client.query(
                `insert into bc_ingest_items
                   (workspace_id, id, batch_id, card_id, card_side, card_identity_explicit, seq, status, source_file_name,
                    raw_size, raw_mime_type, client_digest)
                 values ($1, $2, $3, $4, $5, $6, $7, 'awaiting_upload', $8, $9, $10, $11)
                 returning *`,
                [
                  workspaceId,
                  itemId,
                  batchId,
                  entry.cardId,
                  entry.side,
                  !entry.legacyIdentity,
                  entry.seq,
                  entry.fileName,
                  entry.rawSize,
                  entry.mimeType,
                  entry.clientDigest,
                ],
              );
              items.push(mapItem(itemResult.rows[0]!));
            }
            await client.query("commit");
            return { batch: mapBatch(batchRow), items, reused: false };
          } catch (error) {
            await client.query("rollback").catch(() => undefined);
            throw error;
          }
        });

      const insertedResult = await attemptInsert();
      if (insertedResult) {
        return insertedResult;
      }

      // 幂等键命中：读取已提交批次并比对 fingerprint（方案 §二）。
      return withClient(async (client) => {
        const existing = await client.query(
          `select * from bc_ingest_batches
           where workspace_id = $1 and actor_id = $2 and idempotency_key = $3`,
          [workspaceId, actorId, idempotencyKey],
        );
        const batchRow = existing.rows[0];
        if (!batchRow) {
          throw new IngestConflictError("IDEMPOTENCY_CONFLICT", "concurrent create raced");
        }
        if (String(batchRow.manifest_fingerprint) !== fingerprint) {
          throw new IngestConflictError(
            "IDEMPOTENCY_CONFLICT",
            "same idempotency key used with a different manifest",
          );
        }
        const itemsResult = await client.query(
          `select * from bc_ingest_items
           where workspace_id = $1 and batch_id = $2 order by seq`,
          [workspaceId, String(batchRow.id)],
        );
        if (itemsResult.rows.length !== Number(batchRow.expected_items)) {
          throw new IngestConflictError(
            "IDEMPOTENCY_CONFLICT",
            "existing batch is incomplete",
          );
        }
        return {
          batch: mapBatch(batchRow),
          items: itemsResult.rows.map(mapItem),
          reused: true,
        };
      });
    },

    async getBatch({ actorId, batchId }) {
      return withClient(async (client) => {
        const batchResult = await client.query(
          `select * from bc_ingest_batches
           where workspace_id = $1 and id = $2 and actor_id = $3`,
          [workspaceId, batchId, actorId],
        );
        const batchRow = batchResult.rows[0];
        if (!batchRow) {
          return null;
        }
        const itemsResult = await client.query(
          `select * from bc_ingest_items
           where workspace_id = $1 and batch_id = $2 order by seq`,
          [workspaceId, batchId],
        );
        return { batch: mapBatch(batchRow), items: itemsResult.rows.map(mapItem) };
      });
    },

    async getBatchSummary({ actorId, batchId }) {
      // 单条 SQL：batch 行与派生计数同一 MVCC 快照（方案 §三）。
      return withClient(async (client) => {
        const result = await client.query(
          `select b.*,
             (select json_build_object(
                'awaitingUpload', count(*) filter (where i.status = 'awaiting_upload'),
                'uploaded', count(*) filter (where i.status = 'uploaded'),
                'excluded', count(*) filter (where i.status = 'excluded'),
                'queuedReady', count(*) filter (where i.status = 'queued' and i.next_retry_at <= now()),
                'queuedWaitingRetry', count(*) filter (where i.status = 'queued' and i.next_retry_at > now()),
                'processing', count(*) filter (where i.status = 'processing'),
                'extracted', count(*) filter (where i.status = 'extracted'),
                'terminalFailed', count(*) filter (where i.status = 'terminal_failed'),
                'confirmed', count(*) filter (where i.status = 'confirmed'),
                'skipped', count(*) filter (where i.status = 'skipped'))
              from bc_ingest_items i
              where i.workspace_id = b.workspace_id and i.batch_id = b.id) as counts
           from bc_ingest_batches b
           where b.workspace_id = $1 and b.id = $2 and b.actor_id = $3`,
          [workspaceId, batchId, actorId],
        );
        const row = result.rows[0];
        if (!row) {
          return null;
        }
        const rawCounts = row.counts as Record<string, number | string>;
        const counts = Object.fromEntries(
          Object.entries(rawCounts).map(([key, value]) => [key, Number(value)]),
        ) as IngestBatchSummary["counts"];
        return { batch: mapBatch(row), counts };
      });
    },

    async listBatches({ actorId }) {
      return withClient(async (client) => {
        const result = await client.query(
          `select * from bc_ingest_batches
           where workspace_id = $1 and actor_id = $2
           order by created_at desc limit 50`,
          [workspaceId, actorId],
        );
        return result.rows.map(mapBatch);
      });
    },

    async markItemUploaded({
      actorId,
      batchId,
      itemId,
      imageDigest,
      derivativeObjectKey,
      derivativeSize,
      transactionClient,
    }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        if (String(ctx.batchRow.status) !== "collecting") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            "uploads are only accepted while the batch is collecting",
          );
        }
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        const status = String(itemRow.status);
        if (status === "uploaded") {
          if (String(itemRow.image_digest) === imageDigest) {
            return { item: mapItem(itemRow), alreadyUploaded: true };
          }
          throw new IngestConflictError(
            "CONTENT_MISMATCH",
            "item already uploaded with different content; use the replace endpoint",
          );
        }
        if (status !== "awaiting_upload") {
          throw new IngestConflictError(
            "ITEM_STATE_CONFLICT",
            `item is ${status}, expected awaiting_upload`,
          );
        }
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'uploaded', image_digest = $4, derivative_object_key = $5,
               derivative_size = $6, version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and id = $3
             and status = 'awaiting_upload'
           returning *`,
          [workspaceId, batchId, itemId, imageDigest, derivativeObjectKey, derivativeSize],
        );
        return { item: mapItem(updated.rows[0]!), alreadyUploaded: false };
      }, transactionClient);
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async excludeItem({ actorId, batchId, itemId }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        if (String(ctx.batchRow.status) !== "collecting") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            "items can only be excluded while collecting",
          );
        }
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        const locked = await ctx.client.query(
          `select * from bc_ingest_items
           where workspace_id = $1 and batch_id = $2 and card_id = $3
           order by seq for update`,
          [workspaceId, batchId, itemRow.card_id],
        );
        for (const row of locked.rows) {
          const status = String(row.status);
          if (status !== "excluded" && status !== "awaiting_upload" && status !== "uploaded") {
            throw new IngestConflictError("ITEM_STATE_CONFLICT", `card side is ${status}, expected awaiting_upload or uploaded`);
          }
          if (status !== "excluded") await enqueueCleanup(ctx.client, batchId, (row.derivative_object_key as string | null) ?? null);
        }
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'excluded', derivative_object_key = null, derivative_size = null,
               image_digest = null, version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and card_id = $3 and status <> 'excluded'
           returning *`,
          [workspaceId, batchId, itemRow.card_id],
        );
        const selected = updated.rows.find((row) => row.id === itemId) ?? itemRow;
        return mapItem(selected);
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async swapDerivative({
      actorId,
      batchId,
      itemId,
      expectedVersion,
      imageDigest,
      derivativeObjectKey,
      derivativeSize,
      transactionClient,
    }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const batchStatus = String(ctx.batchRow.status);
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        const itemStatus = String(itemRow.status);
        if (Number(itemRow.version) !== expectedVersion) {
          throw new IngestConflictError(
            "VERSION_CONFLICT",
            "item changed since it was last read; refresh and retry",
          );
        }
        await enqueueCleanup(
          ctx.client,
          batchId,
          (itemRow.derivative_object_key as string | null) ?? null,
        );
        if (batchStatus === "collecting" && itemStatus === "uploaded") {
          const updated = await ctx.client.query(
            `update bc_ingest_items
             set image_digest = $4, derivative_object_key = $5, derivative_size = $6,
                 version = version + 1, updated_at = now()
             where workspace_id = $1 and batch_id = $2 and id = $3
             returning *`,
            [workspaceId, batchId, itemId, imageDigest, derivativeObjectKey, derivativeSize],
          );
          return mapItem(updated.rows[0]!);
        }
        if (
          (batchStatus === "ready_for_review" || batchStatus === "processing") &&
          itemStatus === "terminal_failed"
        ) {
          const updated = await ctx.client.query(
            `update bc_ingest_items
             set status = 'queued', image_digest = $4, derivative_object_key = $5,
                 derivative_size = $6, attempt_count = 0, next_retry_at = now(),
                 error_stage = null, error_code = null,
                 extraction = null, extraction_schema_version = null,
                 review_issues = '[]'::jsonb, usage = null,
                 version = version + 1, updated_at = now()
             where workspace_id = $1 and batch_id = $2 and id = $3
             returning *`,
            [workspaceId, batchId, itemId, imageDigest, derivativeObjectKey, derivativeSize],
          );
          await ctx.client.query(
            `update bc_ingest_batches
             set status = 'processing', version = version + 1, updated_at = now()
             where workspace_id = $1 and id = $2 and status = 'ready_for_review'`,
            [workspaceId, batchId],
          );
          return mapItem(updated.rows[0]!);
        }
        throw new IngestConflictError(
          "ITEM_STATE_CONFLICT",
          `replace is not allowed while batch is ${batchStatus} and item is ${itemStatus}`,
        );
      }, transactionClient);
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async finalizeBatch({ actorId, batchId }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const status = String(ctx.batchRow.status);
        // 锁内幂等分支（方案 §四）：并发 finalize 已先成功 → 返回首次结果。
        if (
          ctx.batchRow.finalized_at !== null &&
          (status === "processing" || status === "ready_for_review" || status === "completed")
        ) {
          return { batch: mapBatch(ctx.batchRow), alreadyFinalized: true };
        }
        if (status !== "collecting") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            `batch is ${status} and cannot be finalized`,
          );
        }
        // 权威 item 校验在锁内（终审修正 23）。
        const itemCounts = await ctx.client.query(
          `select
             count(*) filter (where status = 'awaiting_upload') as awaiting,
             count(*) filter (where status = 'uploaded') as uploaded
           from bc_ingest_items
           where workspace_id = $1 and batch_id = $2`,
          [workspaceId, batchId],
        );
        const awaiting = Number(itemCounts.rows[0]?.awaiting ?? 0);
        const uploaded = Number(itemCounts.rows[0]?.uploaded ?? 0);
        if (awaiting > 0) {
          const pending = await ctx.client.query(
            `select id, seq, source_file_name from bc_ingest_items
             where workspace_id = $1 and batch_id = $2 and status = 'awaiting_upload'
             order by seq`,
            [workspaceId, batchId],
          );
          throw new IngestConflictError(
            "AWAITING_UPLOADS",
            "some items have not finished uploading",
            pending.rows.map((row) => ({
              itemId: String(row.id),
              seq: Number(row.seq),
              fileName: String(row.source_file_name),
            })),
          );
        }
        if (uploaded === 0) {
          throw new IngestConflictError(
            "EMPTY_BATCH",
            "every item is excluded; cancel the batch instead",
          );
        }
        await ctx.client.query(
          `update bc_ingest_items
           set status = 'queued', next_retry_at = now(), attempt_count = 0,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and status = 'uploaded'`,
          [workspaceId, batchId],
        );
        const updated = await ctx.client.query(
          `update bc_ingest_batches
           set status = 'processing', finalized_at = now(),
               expires_at = now() + make_interval(days => ${INGEST_V2_REVIEW_TTL_DAYS}),
               version = version + 1, updated_at = now()
           where workspace_id = $1 and id = $2
           returning *`,
          [workspaceId, batchId],
        );
        return { batch: mapBatch(updated.rows[0]!), alreadyFinalized: false };
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async claimItems({ limit }) {
      // 不持 batch 锁；单事务 CTE（方案 §六）。attempt_count 仅在此处递增。
      return withClient(async (client) => {
        const result = await client.query(
          `with candidate as (
             select i.workspace_id, i.id
             from bc_ingest_items i
             join bc_ingest_batches b
               on b.workspace_id = i.workspace_id and b.id = i.batch_id
              and b.status = 'processing'
              and b.expires_at > now()
             where i.workspace_id = $1
               and i.attempt_count < ${INGEST_V2_MAX_ATTEMPTS}
               and (
                 (i.status = 'queued' and i.next_retry_at <= now())
                 or (i.status = 'processing' and i.lease_expires_at < now())
               )
             order by i.next_retry_at nulls first, i.id
             for update of i skip locked
             limit $2
           )
           update bc_ingest_items as items
           set status = 'processing',
               lease_token = gen_random_uuid()::text,
               lease_expires_at = now() + make_interval(secs => ${INGEST_V2_LEASE_SECONDS}),
               attempt_count = items.attempt_count + 1,
               next_retry_at = null,
               version = items.version + 1,
               updated_at = now()
           from candidate
           where items.workspace_id = candidate.workspace_id and items.id = candidate.id
           returning items.*`,
          [workspaceId, limit],
        );
        return result.rows.map((row) => ({
          ...mapItem(row),
          leaseToken: String(row.lease_token),
        }));
      });
    },

    async submitExtraction({
      itemId,
      leaseToken,
      expectedVersion,
      extraction,
      reviewIssues,
      usage,
      providerRequestId,
    }) {
      const located = await withClient(async (client) => {
        const result = await client.query(
          `select batch_id from bc_ingest_items where workspace_id = $1 and id = $2`,
          [workspaceId, itemId],
        );
        return result.rows[0] ? String(result.rows[0].batch_id) : null;
      });
      if (!located) {
        return { accepted: false };
      }
      const outcome = await withBatchLock(located, "silent", async (ctx) => {
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'extracted', extraction = $5, extraction_schema_version = $6,
               review_issues = $7, usage = $8, provider_request_id = $9,
               lease_token = null, lease_expires_at = null,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and id = $2
             and status = 'processing' and lease_token = $3 and version = $4
           returning id`,
          [
            workspaceId,
            itemId,
            leaseToken,
            expectedVersion,
            JSON.stringify(extraction),
            INGEST_V2_EXTRACTION_SCHEMA_VERSION,
            JSON.stringify(reviewIssues),
            usage ? JSON.stringify(usage) : null,
            providerRequestId ?? null,
          ],
        );
        if ((updated.rowCount ?? 0) === 0) {
          // 仅 worker 提交路径允许静默丢弃（lease 被接管 / 批次已取消）。
          return { accepted: false };
        }
        await reconcileBatchStateLocked(ctx.client, ctx.batchRow);
        return { accepted: true };
      });
      return outcome ?? { accepted: false };
    },

    async submitFailure({
      itemId,
      leaseToken,
      expectedVersion,
      errorStage,
      errorCode,
      retryDelayMs,
    }) {
      const located = await withClient(async (client) => {
        const result = await client.query(
          `select batch_id, attempt_count from bc_ingest_items
           where workspace_id = $1 and id = $2`,
          [workspaceId, itemId],
        );
        return result.rows[0] ?? null;
      });
      if (!located) {
        return { accepted: false };
      }
      const batchId = String(located.batch_id);
      const outcome = await withBatchLock(batchId, "silent", async (ctx) => {
        const itemResult = await ctx.client.query(
          `select attempt_count from bc_ingest_items
           where workspace_id = $1 and id = $2
             and status = 'processing' and lease_token = $3 and version = $4
           for update`,
          [workspaceId, itemId, leaseToken, expectedVersion],
        );
        const itemRow = itemResult.rows[0];
        if (!itemRow) {
          return { accepted: false };
        }
        const attemptCount = Number(itemRow.attempt_count);
        const retryable =
          isRetryableIngestError(errorCode) && attemptCount < INGEST_V2_MAX_ATTEMPTS;
        if (retryable) {
          await ctx.client.query(
            `update bc_ingest_items
             set status = 'queued',
                 next_retry_at = now() + make_interval(secs => $5),
                 lease_token = null, lease_expires_at = null,
                 error_stage = $6, error_code = $7,
                 version = version + 1, updated_at = now()
             where workspace_id = $1 and id = $2
               and status = 'processing' and lease_token = $3 and version = $4`,
            [
              workspaceId,
              itemId,
              leaseToken,
              expectedVersion,
              Math.max(0, retryDelayMs) / 1000,
              errorStage,
              errorCode,
            ],
          );
        } else {
          await ctx.client.query(
            `update bc_ingest_items
             set status = 'terminal_failed',
                 lease_token = null, lease_expires_at = null, next_retry_at = null,
                 error_stage = $5, error_code = $6,
                 version = version + 1, updated_at = now()
             where workspace_id = $1 and id = $2
               and status = 'processing' and lease_token = $3 and version = $4`,
            [workspaceId, itemId, leaseToken, expectedVersion, errorStage, errorCode],
          );
        }
        await reconcileBatchStateLocked(ctx.client, ctx.batchRow);
        return { accepted: true };
      });
      return outcome ?? { accepted: false };
    },

    async retryItem({ actorId, batchId, itemId }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const batchStatus = String(ctx.batchRow.status);
        if (batchStatus !== "ready_for_review" && batchStatus !== "processing") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            `retry is not allowed while batch is ${batchStatus}`,
          );
        }
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        if (String(itemRow.status) !== "terminal_failed") {
          throw new IngestConflictError(
            "ITEM_STATE_CONFLICT",
            `item is ${String(itemRow.status)}, expected terminal_failed`,
          );
        }
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'queued', attempt_count = 0, next_retry_at = now(),
               error_stage = null, error_code = null,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and id = $3
           returning *`,
          [workspaceId, batchId, itemId],
        );
        await ctx.client.query(
          `update bc_ingest_batches
           set status = 'processing', version = version + 1, updated_at = now()
           where workspace_id = $1 and id = $2 and status = 'ready_for_review'`,
          [workspaceId, batchId],
        );
        return mapItem(updated.rows[0]!);
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async skipItem({ actorId, batchId, itemId }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const batchStatus = String(ctx.batchRow.status);
        if (batchStatus !== "ready_for_review" && batchStatus !== "processing") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            `skip is not allowed while batch is ${batchStatus}`,
          );
        }
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        const locked = await ctx.client.query(
          `select * from bc_ingest_items
           where workspace_id = $1 and batch_id = $2 and card_id = $3
           order by seq for update`,
          [workspaceId, batchId, itemRow.card_id],
        );
        for (const row of locked.rows) {
          const status = String(row.status);
          if (status !== "skipped" && status !== "extracted" && status !== "terminal_failed") {
            throw new IngestConflictError("ITEM_STATE_CONFLICT", `card side is ${status}, expected extracted or terminal_failed`);
          }
          if (status !== "skipped") await enqueueCleanup(ctx.client, batchId, (row.derivative_object_key as string | null) ?? null);
        }
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'skipped', derivative_object_key = null, derivative_size = null,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and card_id = $3 and status <> 'skipped'
           returning *`,
          [workspaceId, batchId, itemRow.card_id],
        );
        await reconcileBatchStateLocked(ctx.client, ctx.batchRow);
        const selected = updated.rows.find((row) => row.id === itemId) ?? itemRow;
        return mapItem(selected);
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async confirmItem({ actorId, batchId, itemId, allowFrom, createContact }) {
      // 确认事务（方案 §五）：锁 batch → 锁验 item → 插联系人（同事务）→ item →
      // confirmed → cleanup → reconcile。任一失败全回滚。
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const batchStatus = String(ctx.batchRow.status);
        if (batchStatus !== "ready_for_review" && batchStatus !== "processing") {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            `confirm is not allowed while batch is ${batchStatus}`,
          );
        }
        const itemRow = await lockItem(ctx.client, batchId, itemId);
        const status = String(itemRow.status);
        if (!(allowFrom as readonly string[]).includes(status)) {
          throw new IngestConflictError(
            "ITEM_STATE_CONFLICT",
            `item is ${status}, expected ${allowFrom.join(" or ")}`,
          );
        }
        const contactId = await createContact(ctx.client);
        await enqueueCleanup(
          ctx.client,
          batchId,
          (itemRow.derivative_object_key as string | null) ?? null,
        );
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'confirmed', confirmed_contact_id = $4,
               derivative_object_key = null, derivative_size = null,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and id = $3
           returning *`,
          [workspaceId, batchId, itemId, contactId],
        );
        await reconcileBatchStateLocked(ctx.client, ctx.batchRow);
        return mapItem(updated.rows[0]!);
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async confirmCard({
      actorId,
      batchId,
      itemId,
      confirmationIntentId,
      confirmationFingerprint,
      expectedItems,
      fieldSources,
      allowFrom,
      createContact,
    }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const batchStatus = String(ctx.batchRow.status);
        if (batchStatus !== "ready_for_review" && batchStatus !== "processing" && batchStatus !== "completed") {
          throw new IngestConflictError("BATCH_STATE_CONFLICT", `confirm is not allowed while batch is ${batchStatus}`);
        }
        const selected = await lockItem(ctx.client, batchId, itemId);
        const cardId = String(selected.card_id);
        const locked = await ctx.client.query(
          `select * from bc_ingest_items
           where workspace_id = $1 and batch_id = $2 and card_id = $3
           order by seq for update`,
          [workspaceId, batchId, cardId],
        );
        const rows = locked.rows;
        if (rows.length < 1 || rows.length > 2 || rows.filter((row) => row.card_side === "front").length !== 1 || rows.filter((row) => row.card_side === "back").length > 1) {
          throw new IngestConflictError("ITEM_STATE_CONFLICT", "card sides are incomplete or duplicated");
        }
        const confirmed = rows.filter((row) => row.status === "confirmed");
        if (confirmed.length > 0) {
          if (confirmed.length !== rows.length) throw new IngestConflictError("ITEM_STATE_CONFLICT", "card confirmation is partially applied");
          const contactIds = new Set(confirmed.map((row) => String(row.confirmed_contact_id)));
          const fingerprints = new Set(confirmed.map((row) => String(row.confirmation_fingerprint ?? "")));
          if (contactIds.size !== 1 || fingerprints.size !== 1 || !fingerprints.has(confirmationFingerprint)) {
            throw new IngestConflictError("IDEMPOTENCY_CONFLICT", "card was already confirmed with different content");
          }
          return { items: rows.map(mapItem), replayed: true };
        }
        if (!confirmationIntentId.trim() || !confirmationFingerprint.trim()) {
          throw new IngestConflictError("IDEMPOTENCY_CONFLICT", "confirmation intent and fingerprint are required");
        }
        const expected = new Map(expectedItems.map((item) => [item.itemId, item]));
        if (expected.size !== rows.length || rows.some((row) => {
          const snapshot = expected.get(String(row.id));
          return !snapshot || snapshot.version !== Number(row.version) || snapshot.imageDigest !== String(row.image_digest ?? "");
        })) {
          throw new IngestConflictError("VERSION_CONFLICT", "card sides changed since review");
        }
        for (const row of rows) {
          const status = String(row.status);
          if (!(allowFrom as readonly string[]).includes(status)) {
            throw new IngestConflictError("ITEM_STATE_CONFLICT", `card side is ${status}, expected ${allowFrom.join(" or ")}`);
          }
        }
        const contactId = await createContact(ctx.client);
        for (const row of rows) await enqueueCleanup(ctx.client, batchId, (row.derivative_object_key as string | null) ?? null);
        const updated = await ctx.client.query(
          `update bc_ingest_items
           set status = 'confirmed', confirmed_contact_id = $4,
               confirmation_intent_id = $5, confirmation_fingerprint = $6,
               confirmation_field_sources = $7::jsonb,
               derivative_object_key = null, derivative_size = null,
               version = version + 1, updated_at = now()
           where workspace_id = $1 and batch_id = $2 and card_id = $3
           returning *`,
          [workspaceId, batchId, cardId, contactId, confirmationIntentId, confirmationFingerprint, JSON.stringify(fieldSources)],
        );
        await reconcileBatchStateLocked(ctx.client, ctx.batchRow);
        return { items: updated.rows.sort((a, b) => Number(a.seq) - Number(b.seq)).map(mapItem), replayed: false };
      });
      if (!result) throw new IngestConflictError("BATCH_GONE", "batch expired");
      return result;
    },

    withReadClient(fn) {
      return withClient(fn);
    },

    async cancelBatch({ actorId, batchId }) {
      const result = await withBatchLock(batchId, "throw", async (ctx) => {
        await requireOwnedBatch(ctx, actorId);
        const status = String(ctx.batchRow.status);
        if (status === "cancelled") {
          return mapBatch(ctx.batchRow);
        }
        if (
          status !== "collecting" &&
          status !== "processing" &&
          status !== "ready_for_review"
        ) {
          throw new IngestConflictError(
            "BATCH_STATE_CONFLICT",
            `batch is ${status} and cannot be cancelled`,
          );
        }
        await terminateBatchLocked(ctx.client, batchId, "cancelled", "cancelled by user");
        const reread = await ctx.client.query(
          `select * from bc_ingest_batches where workspace_id = $1 and id = $2`,
          [workspaceId, batchId],
        );
        return mapBatch(reread.rows[0]!);
      });
      if (!result) {
        throw new IngestConflictError("BATCH_GONE", "batch expired");
      }
      return result;
    },

    async sweepDueBatches() {
      // 逐批处理，一次只持一个 batch 锁（方案 §七）。
      const dueIds = await withClient(async (client) => {
        const result = await client.query(
          `select id from bc_ingest_batches
           where workspace_id = $1
             and status in ('collecting', 'processing', 'ready_for_review')
             and expires_at < now()
           order by expires_at
           limit 20`,
          [workspaceId],
        );
        return result.rows.map((row) => String(row.id));
      });
      const expiredBatchIds: string[] = [];
      for (const batchId of dueIds) {
        await withClient(async (client) => {
          await client.query("begin");
          try {
            const locked = await client.query(
              `select * from bc_ingest_batches
               where workspace_id = $1 and id = $2
                 and status in ('collecting', 'processing', 'ready_for_review')
                 and expires_at < now()
               for update skip locked`,
              [workspaceId, batchId],
            );
            if (locked.rows[0]) {
              await terminateBatchLocked(client, batchId, "expired", "deadline elapsed");
              expiredBatchIds.push(batchId);
            }
            await client.query("commit");
          } catch (error) {
            await client.query("rollback").catch(() => undefined);
            throw error;
          }
        });
      }
      return { expiredBatchIds };
    },

    async reapExhaustedLeases() {
      // reaper（方案 §六）：第三次 lease 过期后无人领取的 item，batch-first 终态化。
      const targets = await withClient(async (client) => {
        const result = await client.query(
          `select distinct batch_id from bc_ingest_items
           where workspace_id = $1 and status = 'processing'
             and lease_expires_at < now()
             and attempt_count >= ${INGEST_V2_MAX_ATTEMPTS}
           limit 20`,
          [workspaceId],
        );
        return result.rows.map((row) => String(row.batch_id));
      });
      const reapedItemIds: string[] = [];
      for (const batchId of targets) {
        await withClient(async (client) => {
          await client.query("begin");
          try {
            const locked = await client.query(
              `select * from bc_ingest_batches
               where workspace_id = $1 and id = $2
               for update skip locked`,
              [workspaceId, batchId],
            );
            const batchRow = locked.rows[0];
            if (batchRow) {
              const expired = await expireIfDueLocked(client, batchRow);
              if (!expired) {
                const reaped = await client.query(
                  `update bc_ingest_items
                   set status = 'terminal_failed', error_stage = 'lease',
                       error_code = 'LEASE_EXHAUSTED',
                       lease_token = null, lease_expires_at = null, next_retry_at = null,
                       version = version + 1, updated_at = now()
                   where workspace_id = $1 and batch_id = $2 and status = 'processing'
                     and lease_expires_at < now()
                     and attempt_count >= ${INGEST_V2_MAX_ATTEMPTS}
                   returning id`,
                  [workspaceId, batchId],
                );
                for (const row of reaped.rows) {
                  reapedItemIds.push(String(row.id));
                }
                if ((reaped.rowCount ?? 0) > 0) {
                  await reconcileBatchStateLocked(client, batchRow);
                }
              }
            }
            await client.query("commit");
          } catch (error) {
            await client.query("rollback").catch(() => undefined);
            throw error;
          }
        });
      }
      return { reapedItemIds };
    },

    async listPendingNotifications({ limit }) {
      return withClient(async (client) => {
        const result = await client.query(
          `select batch_id, event_type, review_generation, actor_id
           from bc_ingest_notifications
           where workspace_id = $1 and status = 'pending'
           order by created_at
           limit $2`,
          [workspaceId, limit],
        );
        return result.rows.map((row) => ({
          batchId: String(row.batch_id),
          eventType: String(row.event_type),
          reviewGeneration: Number(row.review_generation),
          actorId: String(row.actor_id),
        }));
      });
    },

    async resolveNotification({ batchId, eventType, reviewGeneration, outcome }) {
      await withClient(async (client) => {
        await client.query(
          `update bc_ingest_notifications
           set status = $5, delivered_at = case when $5 = 'sent' then now() else null end
           where workspace_id = $1 and batch_id = $2 and event_type = $3
             and review_generation = $4 and status = 'pending'`,
          [workspaceId, batchId, eventType, reviewGeneration, outcome],
        );
      });
    },

    async listPendingCleanupTasks({ limit }) {
      return withClient(async (client) => {
        const result = await client.query(
          `select id, object_key, batch_id from bc_ingest_cleanup_tasks
           where workspace_id = $1 and status = 'pending' and next_attempt_at <= now()
           order by next_attempt_at
           limit $2`,
          [workspaceId, limit],
        );
        return result.rows.map((row) => ({
          id: Number(row.id),
          objectKey: String(row.object_key),
          batchId: (row.batch_id as string | null) ?? null,
        }));
      });
    },

    async resolveCleanupTask({ id, outcome, retryDelayMs }) {
      await withClient(async (client) => {
        if (outcome === "done") {
          await client.query(
            `update bc_ingest_cleanup_tasks
             set status = 'done', done_at = now()
             where workspace_id = $1 and id = $2`,
            [workspaceId, id],
          );
        } else {
          await client.query(
            `update bc_ingest_cleanup_tasks
             set attempt_count = attempt_count + 1,
                 next_attempt_at = now() + make_interval(secs => $3)
             where workspace_id = $1 and id = $2`,
            [workspaceId, id, Math.max(1, (retryDelayMs ?? 60_000) / 1000)],
          );
        }
      });
    },
  };
}
