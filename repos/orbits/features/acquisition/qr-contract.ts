import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// QR Scan Connect contract 描述通过 Orbit QR 建立关系草稿的流程。
// mock/live 的具体来源标记和执行策略由各自实现提供。

export const QR_SCAN_CONNECT_ERROR_CODES = [
  "QR_SCAN_PAYLOAD_REQUIRED",
  "QR_SCAN_DRAFT_NOT_FOUND",
  "QR_SCAN_CONNECT_PENDING",
  "QR_SCAN_CONNECT_MOCK_FAILED",
  "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
  "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
] as const;

export type QrScanConnectErrorCode =
  (typeof QR_SCAN_CONNECT_ERROR_CODES)[number];

export type QrScanConnectScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type QrScanConnectConfirmationScenario =
  | "success"
  | "pending"
  | "failure";

export type QrScanConnectState = "success" | "empty" | "pending";
export type QrConnectionDraftStatus = "pending_confirmation" | "confirmed";
export type QrConnectionConfirmationState = "pending" | "confirmed";

// qrText 可用来在测试中模拟二维码 payload；scanLabel 用于 UI 来源展示。
export interface QrScanConnectInput {
  scenario?: QrScanConnectScenario | string | null;
  qrText?: string | null;
  scanLabel?: string | null;
}

export interface QrConnectionDraftConfirmInput {
  draftId: string;
  actorLabel?: string | null;
  scenario?: QrScanConnectConfirmationScenario | string | null;
}

export interface QrScanConnectErrorDefinition {
  code: QrScanConnectErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// QR 错误定义覆盖缺 payload、草稿缺失、pending 和受控失败。
export const QR_SCAN_CONNECT_ERROR_DEFINITIONS = {
  QR_SCAN_PAYLOAD_REQUIRED: {
    code: "QR_SCAN_PAYLOAD_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A readable Orbit relationship QR payload is required before staging a connection draft.",
    recovery:
      "Keep the QR scan in the empty state and ask the operator to scan a valid relationship QR code.",
  },
  QR_SCAN_DRAFT_NOT_FOUND: {
    code: "QR_SCAN_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock QR scan connection draft matches that id.",
    recovery:
      "Keep the relationship graph unchanged and return the missing QR draft failure envelope.",
  },
  QR_SCAN_CONNECT_PENDING: {
    code: "QR_SCAN_CONNECT_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock QR scan connection draft is still pending scan validation.",
    recovery:
      "Show the pending scan state and avoid confirming a connection until the mock validation completes.",
  },
  QR_SCAN_CONNECT_MOCK_FAILED: {
    code: "QR_SCAN_CONNECT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock QR scan connect boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live camera, QR decode, validation, database, AI, calendar, email, or notification work.",
  },
  QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED: {
    code: "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live QR scan connect store is not configured.",
    recovery:
      "Configure the live record store before reading source-backed QR scan connection drafts.",
  },
  QR_SCAN_CONNECT_LIVE_STORE_FAILED: {
    code: "QR_SCAN_CONNECT_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live QR scan connect store could not be read.",
    recovery:
      "Keep the contact graph unchanged and return a controlled live storage failure envelope.",
  },
} as const satisfies Record<
  QrScanConnectErrorCode,
  QrScanConnectErrorDefinition
>;

export const QR_SCAN_CONNECT_LIVE_DRAFT_ID_PREFIX = "qr-draft:live:" as const;

export type QrScanSourceReference = SourceReferenceDTO & {
  type: "qr_scan";
  label: string;
};

// provenance 记录 QR 草稿来自 demo 扫码边界。
export interface QrScanConnectProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-qr-scan-connect-only" | "live-qr-scan-connect";
  generationMethod: "fixture" | "live-store-confirmation" | "live-store-query" | "rule-based-qr";
  liveDatabaseReadExecuted?: boolean;
  databaseWriteExecuted?: false;
  contactWriteExecuted?: false;
  connectionWriteExecuted?: false;
  externalNetworkRequested?: false;
  cameraRequested?: false;
  qrDecoderProviderRequested?: false;
  aiProviderRequested?: false;
  notificationDelivered?: false;
}

// QrScanResult 表示扫码解析结果；所有设备、解码、校验和写入副作用为 false。
export interface QrScanResult {
  scanId: string;
  scanMethod:
    | "fixture-camera-frame"
    | "live-store-qr-record"
    | "rule-based-qr-text";
  scanLabel: string;
  payloadFormat: "orbit-demo-qr-v1";
  qrText: string;
  payloadDigest: string;
  deviceCameraAccessed: false;
  qrDecoderProviderCalled: false;
  cryptographicValidationExecuted: false;
  externalLookupExecuted: false;
  databaseWriteExecuted: false;
}

// mutual context 用于解释这段关系的共同活动/共同联系人来源。
export interface QrMutualConnectionContext {
  contextId: string;
  eventId: string;
  eventName: string;
  encounterReason: string;
  mutualConnections: readonly string[];
  sharedTopics: readonly string[];
  introductionPath: string;
  confidence: "fixture-high" | "live-store" | "rule-based";
  evidenceId: string;
  externalGraphLookupExecuted: false;
}

export interface QrConnectionEvidence {
  evidenceId: string;
  source: QrScanSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "live-qr-scan-connect-service" | "mock-qr-service";
}

// QR 草稿进入联系人图谱前仍需要用户确认。
export interface QrConnectionDraftConfirmation {
  required: true;
  state: QrConnectionConfirmationState;
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

export interface QrConnectionDraft {
  id: string;
  status: QrConnectionDraftStatus;
  source: QrScanSourceReference;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  relationshipContext: string;
  suggestedNextAction: string;
  mutualContext: QrMutualConnectionContext;
  confirmation: QrConnectionDraftConfirmation;
  contactWriteExecuted: false;
  connectionWriteExecuted: false;
  notificationDelivered: false;
  evidence: readonly QrConnectionEvidence[];
  provenance: QrScanConnectProvenance;
  createdAt: string;
}

export interface QrScanConnectPayload {
  state: QrScanConnectState;
  scan: QrScanResult;
  mutualContext: QrMutualConnectionContext | null;
  draft: QrConnectionDraft | null;
  summary: string;
  provenance: QrScanConnectProvenance;
  nextAction: string;
}

export interface QrContactCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  relationshipContext: string;
  source: QrScanSourceReference;
  evidenceIds: readonly string[];
  readyForContactWrite: true;
  contactWriteExecuted: false;
}

export interface QrConnectionCandidate {
  candidateId: string;
  displayName: string;
  organization: string;
  mutualContext: QrMutualConnectionContext;
  valueHypothesis: string;
  source: QrScanSourceReference;
  evidenceIds: readonly string[];
  readyForConnectionWrite: true;
  connectionWriteExecuted: false;
}

export interface QrConnectionConfirmationPayload {
  state: "confirmed";
  confirmedDraft: QrConnectionDraft;
  contactCandidate: QrContactCandidate;
  connectionCandidate: QrConnectionCandidate;
  createdEvidence: QrConnectionEvidence;
  confirmedAt: string;
  provenance: QrScanConnectProvenance;
  nextAction: string;
}

export interface QrScanConnectSuccess {
  success: true;
  data: QrScanConnectPayload;
}

export interface QrConnectionConfirmationSuccess {
  success: true;
  data: QrConnectionConfirmationPayload;
}

export interface QrScanConnectFailure {
  success: false;
  error: QrScanConnectErrorDefinition & {
    state: "failure";
    provenance: QrScanConnectProvenance;
    evidenceIds: readonly string[];
  };
}

export type QrScanConnectResult =
  | QrScanConnectSuccess
  | QrScanConnectFailure;

export type QrConnectionConfirmationResult =
  | QrConnectionConfirmationSuccess
  | QrScanConnectFailure;

export interface QrScanConnectService {
  scanQrCode: (
    input?: QrScanConnectInput,
  ) => Promise<QrScanConnectResult> | QrScanConnectResult;
  confirmQrConnectionDraft: (
    input: QrConnectionDraftConfirmInput,
  ) => Promise<QrConnectionConfirmationResult> | QrConnectionConfirmationResult;
}

export function qrScanConnectFailureToAppError(
  failure: QrScanConnectFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function qrScanConnectFailureContext(
  failure: QrScanConnectFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive = failure.error.provenance.privacy === "live-qr-scan-connect";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live QR scan connect failure came from the source-backed live store boundary."
        : "Mock QR scan connect failure came from deterministic fixture rules.",
    qrScanConnectErrorCode: failure.error.code,
    service: isLive ? "qr-scan-connect-live" : "qr-scan-connect-mock",
  };
}
