import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Business Card Review contract 描述名片 OCR 结果的人工复核流程。
// 它负责字段接受/编辑/确认，不直接写联系人库或重跑真实 OCR。
export const BUSINESS_CARD_REVIEW_ERROR_CODES = [
  "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
  "BUSINESS_CARD_REVIEW_FIELDS_REQUIRED",
  "BUSINESS_CARD_REVIEW_PENDING",
  "BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED",
  "BUSINESS_CARD_REVIEW_MOCK_FAILED",
  "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED",
  "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
] as const;

export type BusinessCardReviewErrorCode =
  (typeof BUSINESS_CARD_REVIEW_ERROR_CODES)[number];

export type BusinessCardReviewScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type BusinessCardReviewConfirmationScenario =
  | "success"
  | "pending"
  | "blocked"
  | "failure";

export type BusinessCardReviewState = "success" | "empty" | "pending";
export type BusinessCardReviewStatus =
  | "pending_review"
  | "reviewed"
  | "confirmed";
export type BusinessCardReviewFieldState =
  | "needs_review"
  | "accepted"
  | "edited";
export type BusinessCardReviewConfidence = "high" | "medium" | "low";

// review 错误区分草稿缺失、字段缺失、等待复核、确认被阻止和受控失败。
export interface BusinessCardReviewErrorDefinition {
  code: BusinessCardReviewErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const BUSINESS_CARD_REVIEW_ERROR_DEFINITIONS = {
  BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND: {
    code: "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock business card review draft matches that id.",
    recovery:
      "Keep the contact graph unchanged and return the missing review draft failure envelope.",
  },
  BUSINESS_CARD_REVIEW_FIELDS_REQUIRED: {
    code: "BUSINESS_CARD_REVIEW_FIELDS_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "At least one reviewed business card field is required before updating the review draft.",
    recovery:
      "Keep the review draft open and ask the operator to accept or edit extracted fields.",
  },
  BUSINESS_CARD_REVIEW_PENDING: {
    code: "BUSINESS_CARD_REVIEW_PENDING",
    appCode: "CONFLICT",
    message: "The mock business card review is still pending human field review.",
    recovery:
      "Keep confirmation disabled until extracted card fields have been reviewed.",
  },
  BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED: {
    code: "BUSINESS_CARD_REVIEW_CONFIRMATION_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "The mock business card review cannot be confirmed in this controlled scenario.",
    recovery:
      "Keep the reviewed card draft pending and show the operator why confirmation is blocked.",
  },
  BUSINESS_CARD_REVIEW_MOCK_FAILED: {
    code: "BUSINESS_CARD_REVIEW_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock business card review boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live OCR, AI, persistence, calendar, email, or notification work.",
  },
  BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED: {
    code: "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live business card review store is not configured.",
    recovery:
      "Configure the live record store before reading source-backed business card review drafts.",
  },
  BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED: {
    code: "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live business card review store could not be read.",
    recovery:
      "Keep the contact graph unchanged and return a controlled live storage failure envelope.",
  },
} as const satisfies Record<
  BusinessCardReviewErrorCode,
  BusinessCardReviewErrorDefinition
>;

export const BUSINESS_CARD_REVIEW_LIVE_DRAFT_ID_PREFIX =
  "business-card-review:live:" as const;

export interface BusinessCardReviewLookupInput {
  draftId: string;
  scenario?: BusinessCardReviewScenario | string | null;
}

export interface BusinessCardReviewUpdateInput {
  draftId: string;
  reviewedFields?: Partial<BusinessCardReviewedFields> | null;
  reviewerLabel?: string | null;
  scenario?: BusinessCardReviewScenario | string | null;
}

export interface BusinessCardReviewConfirmInput {
  draftId: string;
  actorLabel?: string | null;
  scenario?: BusinessCardReviewConfirmationScenario | string | null;
}

export type BusinessCardReviewSourceReference = SourceReferenceDTO & {
  type: "business_card_ocr";
  label: string;
};

// provenance 把复核结果固定在 demo 名片边界，避免误认成生产 OCR 数据。
export interface BusinessCardReviewProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-business-card-review-only" | "live-business-card-review";
  generationMethod:
    | "fixture"
    | "live-store-confirmation"
    | "live-store-query"
    | "live-store-review"
    | "rule-based-card-review";
  liveDatabaseReadExecuted?: boolean;
  databaseWriteExecuted?: false;
  contactWriteExecuted?: false;
  externalNetworkRequested?: false;
  ocrProviderRequested?: false;
  aiProviderRequested?: false;
  notificationDelivered?: false;
}

export interface BusinessCardReviewEvidence {
  evidenceId: string;
  source: BusinessCardReviewSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy:
    | "live-business-card-review-service"
    | "mock-business-card-review-service";
}

// 单个字段保留原值、复核值和 confidence，便于 UI 高亮需要人工确认的字段。
export interface BusinessCardReviewField {
  field: keyof BusinessCardReviewedFields;
  label: string;
  value: string;
  reviewedValue: string;
  reviewState: BusinessCardReviewFieldState;
  confidence: BusinessCardReviewConfidence;
  evidenceId: string;
}

export interface BusinessCardReviewedFields {
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
}

// map 类型保证每个可复核字段都有明确的 ReviewField 记录。
export type BusinessCardReviewFieldMap = {
  readonly [FieldName in keyof BusinessCardReviewedFields]: BusinessCardReviewField;
};

export interface BusinessCardReviewConfirmation {
  required: true;
  state: "pending" | "confirmed";
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

export interface BusinessCardReviewDraft {
  id: string;
  status: BusinessCardReviewStatus;
  source: BusinessCardReviewSourceReference;
  extractedFields: BusinessCardReviewFieldMap;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  relationshipContext: string;
  suggestedNextAction: string;
  confirmation: BusinessCardReviewConfirmation;
  contactWriteExecuted: false;
  databaseWriteExecuted: false;
  aiProviderCalled: false;
  ocrProviderCalled: false;
  notificationDelivered: false;
  evidence: readonly BusinessCardReviewEvidence[];
  provenance: BusinessCardReviewProvenance;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface BusinessCardReviewPayload {
  state: BusinessCardReviewState;
  reviewDraft: BusinessCardReviewDraft | null;
  reviewEvidence: BusinessCardReviewEvidence | null;
  summary: string;
  provenance: BusinessCardReviewProvenance;
  nextAction: string;
  contactCandidateReady: boolean;
}

export interface BusinessCardReviewContactCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  relationshipContext: string;
  source: BusinessCardReviewSourceReference;
  evidenceIds: readonly string[];
  readyForContactWrite: true;
  contactWriteExecuted: false;
}

export interface BusinessCardReviewConfirmationPayload {
  state: "confirmed";
  confirmedDraft: BusinessCardReviewDraft;
  contactCandidate: BusinessCardReviewContactCandidate;
  createdEvidence: BusinessCardReviewEvidence;
  confirmedAt: string;
  provenance: BusinessCardReviewProvenance;
  nextAction: string;
}

export interface BusinessCardReviewSuccess {
  success: true;
  data: BusinessCardReviewPayload;
}

export interface BusinessCardReviewConfirmationSuccess {
  success: true;
  data: BusinessCardReviewConfirmationPayload;
}

export interface BusinessCardReviewFailure {
  success: false;
  error: BusinessCardReviewErrorDefinition & {
    state: "failure";
    provenance: BusinessCardReviewProvenance;
    evidenceIds: readonly string[];
  };
}

export type BusinessCardReviewResult =
  | BusinessCardReviewSuccess
  | BusinessCardReviewFailure;

export type BusinessCardReviewConfirmationResult =
  | BusinessCardReviewConfirmationSuccess
  | BusinessCardReviewFailure;

export interface BusinessCardReviewService {
  getReviewDraft: (
    input: BusinessCardReviewLookupInput,
  ) => BusinessCardReviewResult | Promise<BusinessCardReviewResult>;
  updateReviewDraft: (
    input: BusinessCardReviewUpdateInput,
  ) => BusinessCardReviewResult | Promise<BusinessCardReviewResult>;
  confirmReviewedDraft: (
    input: BusinessCardReviewConfirmInput,
  ) =>
    | BusinessCardReviewConfirmationResult
    | Promise<BusinessCardReviewConfirmationResult>;
}

export function businessCardReviewFailureToAppError(
  failure: BusinessCardReviewFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function businessCardReviewFailureContext(
  failure: BusinessCardReviewFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive = failure.error.provenance.privacy === "live-business-card-review";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    businessCardReviewErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live business card review failure came from the source-backed live store boundary."
        : "Mock business card review failure came from deterministic fixture rules.",
    service: isLive
      ? "business-card-review-live"
      : "business-card-review-and-confirm-flow-mock",
  };
}
