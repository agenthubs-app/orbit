import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";

export const BUSINESS_CARD_BATCH_MAX_ITEMS = 500;
export const BUSINESS_CARD_BATCH_MAX_PDF_BYTES = 50 * 1024 * 1024;
export const BUSINESS_CARD_BATCH_EXPIRY_DAYS = 7;
export const BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS = 30_000;
export const BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS = 2;

export type BusinessCardBatchStatus =
  | "processing"
  | "ready_for_review"
  | "completed";
export type BusinessCardBatchItemStatus =
  | "pending"
  | "processing"
  | "extracted"
  | "failed"
  | "confirmed"
  | "skipped";
export type BusinessCardBatchItemErrorCode =
  | "OCR_PROVIDER_FAILED"
  | "OCR_PROVIDER_TIMEOUT"
  | "OCR_INVALID_OUTPUT";

export interface BusinessCardBatchSourceFile {
  fileName: string;
  kind: "image" | "pdf";
  itemCount: number;
}

export interface BusinessCardBatchDTO {
  id: string;
  actorId: string;
  status: BusinessCardBatchStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  confirmedItems: number;
  skippedItems: number;
  sourceFiles: readonly BusinessCardBatchSourceFile[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface BusinessCardBatchItemDTO {
  id: string;
  batchId: string;
  actorId: string;
  seq: number;
  sourceFileName: string;
  sourcePage: number | null;
  status: BusinessCardBatchItemStatus;
  imagePath: string | null;
  /** 图片 item = 上传原始文件字节的 sha256:<hex>；PDF item = 该页渲染 JPEG 字节的摘要。 */
  imageDigest: string;
  uploadMimeType: string;
  extraction: BusinessCardStructuredExtraction | null;
  reviewIssues: readonly BusinessCardReviewIssue[];
  usage: BusinessCardCloudOcrUsage | null;
  errorCode: BusinessCardBatchItemErrorCode | null;
  attempts: number;
  leaseOwner: string | null;
  leasedAt: string | null;
  confirmedContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewBusinessCardBatchItemInput {
  seq: number;
  sourceFileName: string;
  sourcePage: number | null;
  imageJpegBase64: string;
  imageDigest: string;
  uploadMimeType: string;
}
