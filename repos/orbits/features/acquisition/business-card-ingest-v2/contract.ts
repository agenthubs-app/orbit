import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "../business-card-cloud-ocr";

// 设计方案：docs/superpowers/plans/2026-08-31-business-card-batch-ingest-v2.md (v2.4)

export const INGEST_V2_MAX_ITEMS = 100;
export const INGEST_V2_MAX_RAW_BYTES = 10 * 1024 * 1024;
export const INGEST_V2_LEASE_SECONDS = 300;
export const INGEST_V2_OCR_DEADLINE_MS = 240_000;
export const INGEST_V2_MAX_ATTEMPTS = 3;
export const INGEST_V2_COLLECTING_TTL_HOURS = 24;
export const INGEST_V2_REVIEW_TTL_DAYS = 7;
export const INGEST_V2_EXTRACTION_SCHEMA_VERSION = 1;
export const INGEST_V2_DERIVATIVE_TARGET_EDGE_PX = 2048;
export const INGEST_V2_DERIVATIVE_HARD_MAX_BYTES = 2 * 1024 * 1024;

export type IngestBatchStatus =
  | "collecting"
  | "processing"
  | "ready_for_review"
  | "completed"
  | "cancelled"
  | "expired";

export type IngestItemStatus =
  | "awaiting_upload"
  | "uploaded"
  | "excluded"
  | "queued"
  | "processing"
  | "extracted"
  | "terminal_failed"
  | "confirmed"
  | "skipped";

/** OCR 收敛集合：批次可从 processing 转 ready_for_review 的判定依据。 */
export const INGEST_ITEM_SETTLED_STATUSES: readonly IngestItemStatus[] = [
  "extracted",
  "terminal_failed",
  "confirmed",
  "skipped",
  "excluded",
];

/** 批次完成集合：全部满足则批次转 completed。 */
export const INGEST_ITEM_COMPLETED_STATUSES: readonly IngestItemStatus[] = [
  "confirmed",
  "skipped",
  "excluded",
];

export type IngestItemErrorStage = "normalize" | "ocr" | "lease";

export type IngestItemErrorCode =
  | "IMAGE_INVALID"
  | "OCR_PROVIDER_FAILED"
  | "OCR_PROVIDER_TIMEOUT"
  | "OCR_INVALID_OUTPUT"
  | "LEASE_EXHAUSTED";

/** 是否可重试由 error_code 集中判定，不落冗余字段（方案决策 27）。 */
export function isRetryableIngestError(code: IngestItemErrorCode): boolean {
  switch (code) {
    case "OCR_PROVIDER_FAILED":
    case "OCR_PROVIDER_TIMEOUT":
    case "OCR_INVALID_OUTPUT":
      return true;
    case "IMAGE_INVALID":
    case "LEASE_EXHAUSTED":
      return false;
  }
}

export interface IngestManifestEntry {
  fileName: string;
  mimeType: string;
  rawSize: number;
  seq: number;
  clientDigest: string;
}

export interface IngestBatchDTO {
  id: string;
  actorId: string;
  status: IngestBatchStatus;
  expectedItems: number;
  version: number;
  reviewGeneration: number;
  idempotencyKey: string;
  manifestFingerprint: string;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  expiresAt: string;
}

export interface IngestItemDTO {
  id: string;
  batchId: string;
  seq: number;
  status: IngestItemStatus;
  version: number;
  sourceFileName: string;
  rawSize: number;
  rawMimeType: string;
  clientDigest: string;
  imageDigest: string | null;
  derivativeObjectKey: string | null;
  derivativeSize: number | null;
  extraction: BusinessCardStructuredExtraction | null;
  extractionSchemaVersion: number | null;
  reviewIssues: readonly BusinessCardReviewIssue[];
  usage: BusinessCardCloudOcrUsage | null;
  confirmedContactId: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  leaseExpiresAt: string | null;
  errorStage: IngestItemErrorStage | null;
  errorCode: IngestItemErrorCode | null;
  createdAt: string;
  updatedAt: string;
}

/** ?view=summary 的派生计数——单条 SQL 同快照返回，batch 不落计数字段。 */
export interface IngestBatchSummary {
  batch: IngestBatchDTO;
  counts: {
    awaitingUpload: number;
    uploaded: number;
    excluded: number;
    queuedReady: number;
    queuedWaitingRetry: number;
    processing: number;
    extracted: number;
    terminalFailed: number;
    confirmed: number;
    skipped: number;
  };
}

export class IngestConflictError extends Error {
  constructor(
    public readonly code:
      | "IDEMPOTENCY_CONFLICT"
      | "CONTENT_MISMATCH"
      | "BATCH_STATE_CONFLICT"
      | "ITEM_STATE_CONFLICT"
      | "VERSION_CONFLICT"
      | "EMPTY_BATCH"
      | "AWAITING_UPLOADS"
      | "BATCH_GONE",
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "IngestConflictError";
  }
}
