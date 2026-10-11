import type { IndustryIdCode, SecondaryIndustryIdCode } from "./industries";
import type { SeniorityLevelCode } from "./profile";

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
  /** AI 按受控分类判断的一级行业（提取结构 v2 起）；判断不出、分类外或旧数据为 null/缺省。 */
  primaryIndustryId?: IndustryIdCode | null;
  /** 二级行业，必须属于 primaryIndustryId；规则同上。 */
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
  /** W0045（提取结构 v3 起）：AI 按职位推断的职级（六档）；不合法或旧数据为 null/缺省。 */
  seniorityLevel?: SeniorityLevelCode | null;
  /** W0045：规范地区的 ISO 3166-1 两位国家码（大写）；不合法时与城市一起为 null。 */
  regionCountryCode?: string | null;
  /** W0045：规范英文城市名（如 "Tokyo"）；没有国家码时为 null。 */
  regionCity?: string | null;
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
  /** 名片地址 → 联系人 location。可选：旧客户端不传时按空处理。 */
  address?: string;
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
export type IngestCardSide = "front" | "back";

export interface IngestManifestEntryContract {
  cardId: string;
  side: IngestCardSide;
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
  cardId: string;
  side: IngestCardSide;
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
  /** Null for unconfirmed and legacy confirmed items; present after card-aware confirmation. */
  confirmedFieldSources?: IngestCardFieldSourcesContract | null | undefined;
  /** False for migrated rows and requests using the legacy manifest shape. */
  cardIdentityExplicit?: boolean | undefined;
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

export interface IngestCardConfirmationItemContract {
  itemId: string;
  version: number;
  imageDigest: string;
}

export interface IngestCardFieldSourcesContract {
  displayName: string | null;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
}

/** 复核页「可能是同一个联系人」：已有联系人的结构化字段 + 命中理由。 */
export interface IngestContactCandidateContract {
  contactId: string;
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  address: string;
  matchedOn: readonly ("email" | "phone" | "name_organization")[];
  /** 名片六个字段与该联系人逐一相同：直接并入，不再询问。 */
  identical: boolean;
}

export interface IngestCardConfirmationInputContract extends BusinessCardBatchReviewInputContract {
  /** 用户选了「已有联系人，合并」：并入这个联系人，不新建。 */
  mergeIntoContactId?: string;
  confirmationIntentId: string;
  expectedCardItems: readonly IngestCardConfirmationItemContract[];
  fieldSources: IngestCardFieldSourcesContract;
  /** 审阅页「行业」一行的最终值；旧客户端不传时不写行业。 */
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
  /**
   * W0045：审阅页「职级」「地区」两行的最终值；旧客户端不传时不写。
   * 来源（ai／user）由服务端比较提交值与该卡识别结果判定，客户端不传来源。
   */
  seniorityLevel?: SeniorityLevelCode | null;
  regionCountryCode?: string | null;
  regionCity?: string | null;
}

export type IngestConfirmationResponseContract =
  | { state: "created"; contactId: string; item: IngestItemContract; items: readonly IngestItemContract[]; replayed: boolean; merged?: boolean; metEventId?: string | null }
  | { state: "duplicate_review"; duplicateContactId: string; candidate?: IngestContactCandidateContract | null };
