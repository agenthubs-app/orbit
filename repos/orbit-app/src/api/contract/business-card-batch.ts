export type BusinessCardContactPointType =
  | "phone" | "mobile" | "fax" | "wechat" | "line" | "whatsapp" | "website" | "other";

export interface BusinessCardLabeledValueContract {
  label: string | null;
  value: string;
}

export interface BusinessCardContactPointContract extends BusinessCardLabeledValueContract {
  type: BusinessCardContactPointType;
}

export interface BusinessCardStructuredExtractionContract {
  fullName: string | null;
  nativeFullName: string | null;
  romanizedFullName: string | null;
  organization: string | null;
  departments: readonly string[];
  title: string | null;
  emails: readonly BusinessCardLabeledValueContract[];
  contactPoints: readonly BusinessCardContactPointContract[];
  website: string | null;
  addresses: readonly BusinessCardLabeledValueContract[];
  certifications: readonly string[];
  detectedLanguages: readonly string[];
}

export type BusinessCardReviewIssueCode =
  | "IDENTITY_MISSING" | "INVALID_EMAIL" | "INVALID_PHONE" | "MULTIPLE_OFFICES"
  | "SHARED_CONTACT_VALUE" | "NATIVE_ROMANIZED_NAME_CONFLICT" | "ORG_SUFFIX_MISSING" | "VERIFICATION_MISMATCH";

export interface BusinessCardReviewIssueContract {
  code: BusinessCardReviewIssueCode;
  field: string;
  message: string;
}

export interface BusinessCardCloudOcrUsageContract {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export type BusinessCardBatchStatus = "processing" | "ready_for_review" | "completed" | "cancelled";
export type BusinessCardBatchItemStatus = "pending" | "processing" | "extracted" | "failed" | "confirmed" | "skipped";
export type BusinessCardBatchItemErrorCode = "OCR_PROVIDER_FAILED" | "OCR_PROVIDER_TIMEOUT" | "OCR_INVALID_OUTPUT";

export interface BusinessCardBatchSourceFileContract {
  fileName: string;
  kind: "image" | "pdf";
  itemCount: number;
}

export interface BusinessCardBatchContract {
  id: string;
  actorId: string;
  status: BusinessCardBatchStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  confirmedItems: number;
  skippedItems: number;
  sourceFiles: readonly BusinessCardBatchSourceFileContract[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  imagesDeletedAt?: string;
}

export interface BusinessCardBatchItemContract {
  id: string;
  batchId: string;
  actorId: string;
  seq: number;
  sourceFileName: string;
  sourcePage: number | null;
  status: BusinessCardBatchItemStatus;
  imagePath: string | null;
  imageDigest: string;
  uploadMimeType: string;
  extraction: BusinessCardStructuredExtractionContract | null;
  reviewIssues: readonly BusinessCardReviewIssueContract[];
  usage: BusinessCardCloudOcrUsageContract | null;
  errorCode: BusinessCardBatchItemErrorCode | null;
  attempts: number;
  leaseOwner: string | null;
  leasedAt: string | null;
  confirmedContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Only the processing GET projection may omit extraction; the base DTO cannot.
export interface BusinessCardBatchDetailContract {
  batch: BusinessCardBatchContract;
  items: readonly (Omit<BusinessCardBatchItemContract, "extraction"> & {
    extraction?: BusinessCardBatchItemContract["extraction"];
  })[];
}

export interface BusinessCardBatchReviewInputContract {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  notes: string;
  allowDuplicate?: boolean;
}

export type BusinessCardBatchConfirmationResponseContract =
  | { state: "created"; contactId: string }
  | { state: "duplicate_review"; duplicateContactId: string };

export interface BusinessCardBatchRetryResponseContract { state: "pending"; }
export interface BusinessCardBatchSkipResponseContract { state: "skipped"; }
export interface BusinessCardBatchFinishResponseContract { state: "completed"; }

export type IngestBatchStatus = "collecting" | "processing" | "ready_for_review" | "completed" | "cancelled" | "expired";
export type IngestItemStatus =
  | "awaiting_upload" | "uploaded" | "excluded" | "queued" | "processing"
  | "extracted" | "terminal_failed" | "confirmed" | "skipped";
export type IngestItemErrorStage = "normalize" | "ocr" | "lease";
export type IngestItemErrorCode =
  | "IMAGE_INVALID" | "OCR_PROVIDER_FAILED" | "OCR_PROVIDER_TIMEOUT" | "OCR_INVALID_OUTPUT" | "LEASE_EXHAUSTED";

export interface IngestManifestEntryContract {
  fileName: string;
  mimeType: string;
  rawSize: number;
  seq: number;
  clientDigest: string;
}

export interface IngestBatchContract {
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

export interface IngestItemContract {
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
  extraction: BusinessCardStructuredExtractionContract | null;
  extractionSchemaVersion: number | null;
  reviewIssues: readonly BusinessCardReviewIssueContract[];
  usage: BusinessCardCloudOcrUsageContract | null;
  confirmedContactId: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  leaseExpiresAt: string | null;
  errorStage: IngestItemErrorStage | null;
  errorCode: IngestItemErrorCode | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestBatchSummaryContract {
  batch: IngestBatchContract;
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

export interface IngestBatchDetailContract {
  batch: IngestBatchContract;
  items: readonly IngestItemContract[];
}

export interface IngestBatchCollectionResponseContract { batches: readonly IngestBatchContract[]; }
export interface IngestBatchCreateResponseContract extends IngestBatchDetailContract { reused: boolean; }
export interface IngestItemActionResponseContract { item: IngestItemContract; }
export interface IngestUploadResponseContract extends IngestItemActionResponseContract { alreadyUploaded: boolean; }
export interface IngestBatchActionResponseContract { batch: IngestBatchContract; }
export interface IngestFinalizeResponseContract extends IngestBatchActionResponseContract { alreadyFinalized: boolean; }
export type IngestConfirmationResponseContract =
  | { state: "created"; contactId: string; item: IngestItemContract }
  | { state: "duplicate_review"; duplicateContactId: string };
