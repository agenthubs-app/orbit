import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const BUSINESS_CARD_SCAN_OCR_FIXTURE_SOURCE =
  "fixture:features/acquisition/business-card-fixtures.ts" as const;

export const BUSINESS_CARD_SCAN_OCR_ERROR_CODES = [
  "BUSINESS_CARD_IMAGE_REQUIRED",
  "BUSINESS_CARD_DRAFT_NOT_FOUND",
  "BUSINESS_CARD_SCAN_NOT_READY",
  "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED",
] as const;

export type BusinessCardScanOcrErrorCode =
  (typeof BUSINESS_CARD_SCAN_OCR_ERROR_CODES)[number];

export type BusinessCardScanOcrScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type BusinessCardScanOcrState = "success" | "empty" | "pending";
export type BusinessCardOcrStatus = "complete" | "empty" | "pending";
export type BusinessCardDraftStatus = "pending_confirmation";
export type BusinessCardConfirmationState = "pending";

export interface BusinessCardScanOcrInput {
  scenario?: BusinessCardScanOcrScenario | string | null;
  imageText?: string | null;
  imageName?: string | null;
}

export interface BusinessCardDraftLookupInput {
  draftId: string;
  scenario?: string | null;
}

export interface BusinessCardScanOcrErrorDefinition {
  code: BusinessCardScanOcrErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS = {
  BUSINESS_CARD_IMAGE_REQUIRED: {
    code: "BUSINESS_CARD_IMAGE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A readable business card image is required before mock OCR.",
    recovery:
      "Keep the card scan in the empty state and ask the operator for a readable image.",
  },
  BUSINESS_CARD_DRAFT_NOT_FOUND: {
    code: "BUSINESS_CARD_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock business card contact draft matches that id.",
    recovery:
      "Keep the contact graph unchanged and return the missing business card draft failure envelope.",
  },
  BUSINESS_CARD_SCAN_NOT_READY: {
    code: "BUSINESS_CARD_SCAN_NOT_READY",
    appCode: "CONFLICT",
    message: "The mock business card scan is still pending OCR review.",
    recovery:
      "Show the pending OCR state and avoid staging a contact draft until extraction completes.",
  },
  BUSINESS_CARD_SCAN_OCR_MOCK_FAILED: {
    code: "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock business card scan OCR boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live camera, upload storage, OCR, AI, database, calendar, email, or notification work.",
  },
} as const satisfies Record<
  BusinessCardScanOcrErrorCode,
  BusinessCardScanOcrErrorDefinition
>;

export type BusinessCardSourceReference = SourceReferenceDTO & {
  type: "business_card_ocr";
  label: string;
};

export interface BusinessCardScanOcrProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-business-card-scan-ocr-only";
  generationMethod: "fixture" | "rule-based-card-ocr";
}

export interface BusinessCardCapture {
  captureId: string;
  captureMethod: "fixture-camera-frame" | "rule-based-image-text";
  imageName: string;
  imageMimeType: "image/jpeg" | "text/plain";
  imageDigest: string;
  deviceCameraAccessed: false;
  uploadStorageExecuted: false;
  storageWriteExecuted: false;
}

export interface BusinessCardOcrExtraction {
  status: BusinessCardOcrStatus;
  rawText: string;
  rawTextLines: readonly string[];
  extractedFields: readonly string[];
  ocrProviderCalled: false;
  aiExtractionExecuted: false;
}

export interface BusinessCardEvidence {
  evidenceId: string;
  source: BusinessCardSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-business-card-service";
}

export interface BusinessCardDraftConfirmation {
  required: true;
  state: BusinessCardConfirmationState;
  question: string;
}

export interface BusinessCardContactDraft {
  id: string;
  status: BusinessCardDraftStatus;
  source: BusinessCardSourceReference;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  relationshipContext: string;
  suggestedNextAction: string;
  confirmation: BusinessCardDraftConfirmation;
  contactWriteExecuted: false;
  evidence: readonly BusinessCardEvidence[];
  provenance: BusinessCardScanOcrProvenance;
  createdAt: string;
}

export interface BusinessCardScanOcrPayload {
  state: BusinessCardScanOcrState;
  capture: BusinessCardCapture;
  ocr: BusinessCardOcrExtraction;
  draft: BusinessCardContactDraft | null;
  summary: string;
  provenance: BusinessCardScanOcrProvenance;
  nextAction: string;
}

export interface BusinessCardDraftLookupSuccess {
  success: true;
  data: BusinessCardContactDraft;
}

export interface BusinessCardScanOcrSuccess {
  success: true;
  data: BusinessCardScanOcrPayload;
}

export interface BusinessCardScanOcrFailure {
  success: false;
  error: BusinessCardScanOcrErrorDefinition & {
    state: "failure";
    provenance: BusinessCardScanOcrProvenance;
    evidenceIds: readonly string[];
  };
}

export type BusinessCardScanOcrResult =
  | BusinessCardScanOcrSuccess
  | BusinessCardScanOcrFailure;

export type BusinessCardDraftLookupResult =
  | BusinessCardDraftLookupSuccess
  | BusinessCardScanOcrFailure;

export interface BusinessCardScanOcrService {
  scanBusinessCard: (
    input?: BusinessCardScanOcrInput,
  ) => BusinessCardScanOcrResult;
  getBusinessCardDraft: (
    input: BusinessCardDraftLookupInput,
  ) => BusinessCardDraftLookupResult;
}

export function businessCardScanOcrFailureToAppError(
  failure: BusinessCardScanOcrFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function businessCardScanOcrFailureContext(
  failure: BusinessCardScanOcrFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    businessCardScanOcrErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock business card scan OCR failure came from deterministic fixture rules.",
    service: "business-card-scan-ocr-mock",
  };
}
