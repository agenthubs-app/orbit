import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Business Card OCR contract 描述名片扫描到联系人草稿的流程。
// mock/live 的具体来源标记和执行策略由各自实现提供。

export const BUSINESS_CARD_SCAN_OCR_ERROR_CODES = [
  "BUSINESS_CARD_IMAGE_REQUIRED",
  "BUSINESS_CARD_DRAFT_NOT_FOUND",
  "BUSINESS_CARD_SCAN_NOT_READY",
  "BUSINESS_CARD_SCAN_OCR_MOCK_FAILED",
  "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED",
  "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED",
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

// imageText 允许测试用纯文本模拟名片图像内容；imageName 只用于展示来源。
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

// OCR 失败定义覆盖缺图、草稿不存在、pending 和受控失败。
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
  BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED: {
    code: "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live business card scan OCR store is not configured.",
    recovery:
      "Configure the live record store before reading source-backed business card OCR drafts.",
  },
  BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED: {
    code: "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live business card scan OCR store could not be read.",
    recovery:
      "Keep the contact graph unchanged and return a controlled live storage failure envelope.",
  },
} as const satisfies Record<
  BusinessCardScanOcrErrorCode,
  BusinessCardScanOcrErrorDefinition
>;

export type BusinessCardSourceReference = SourceReferenceDTO & {
  type: "business_card_ocr";
  label: string;
};

// provenance 记录名片扫描的 fixture 来源和生成方式。
export interface BusinessCardScanOcrProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-business-card-scan-ocr-only"
    | "live-business-card-scan-ocr";
  generationMethod: "fixture" | "live-store-query" | "rule-based-card-ocr";
  liveDatabaseReadExecuted?: boolean;
  databaseWriteExecuted?: false;
  contactWriteExecuted?: false;
  cameraRequested?: false;
  uploadStorageRequested?: false;
  storageWriteExecuted?: false;
  externalNetworkRequested?: false;
  ocrProviderRequested?: false;
  aiProviderRequested?: false;
  notificationDelivered?: false;
}

// capture 表示输入图像的 mock 捕获记录，所有设备/存储副作用固定为 false。
export interface BusinessCardCapture {
  captureId: string;
  captureMethod:
    | "fixture-camera-frame"
    | "live-store-business-card-record"
    | "rule-based-image-text";
  imageName: string;
  imageMimeType: "image/jpeg" | "text/plain";
  imageDigest: string;
  deviceCameraAccessed: false;
  uploadStorageExecuted: false;
  storageWriteExecuted: false;
}

// OCR extraction 保存原始文本和提取字段，但不代表真实 OCR 或 AI 已执行。
export interface BusinessCardOcrExtraction {
  status: BusinessCardOcrStatus;
  rawText: string;
  rawTextLines: readonly string[];
  extractedFields: readonly string[];
  ocrProviderCalled: false;
  aiExtractionExecuted: false;
}

// Evidence 把提取字段和来源片段关联起来，供复核界面解释字段来源。
export interface BusinessCardEvidence {
  evidenceId: string;
  source: BusinessCardSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "live-business-card-scan-service" | "mock-business-card-service";
}

// 名片草稿默认处于 pending confirmation，不会直接写联系人。
export interface BusinessCardDraftConfirmation {
  required: true;
  state: BusinessCardConfirmationState;
  question: string;
}

// ContactDraft 是扫描后形成的待确认联系人草稿。
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

// payload 同时返回 capture、ocr 和 draft，方便 UI 展示完整采集链路。
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
  ) => Promise<BusinessCardScanOcrResult> | BusinessCardScanOcrResult;
  getBusinessCardDraft: (
    input: BusinessCardDraftLookupInput,
  ) => Promise<BusinessCardDraftLookupResult> | BusinessCardDraftLookupResult;
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
  const isLive =
    failure.error.provenance.privacy === "live-business-card-scan-ocr";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    businessCardScanOcrErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live business card scan OCR failure came from the source-backed live store boundary."
        : "Mock business card scan OCR failure came from deterministic fixture rules.",
    service: isLive
      ? "business-card-scan-ocr-live"
      : "business-card-scan-ocr-mock",
  };
}
