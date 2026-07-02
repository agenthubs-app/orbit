import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Chat Privacy Controls contract 描述聊天分析、删除请求和敏感分享的控制面协议。
// mock/live 的具体隐私状态和执行策略由各自实现提供。

export const CHAT_PRIVACY_CONTROLS_ERROR_CODES = [
  "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
  "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
  "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
  "CHAT_PRIVACY_EMPTY",
  "CHAT_PRIVACY_PENDING",
  "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
  "CHAT_PRIVACY_MOCK_FAILED",
  "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED",
] as const;

export type ChatPrivacyControlsErrorCode =
  (typeof CHAT_PRIVACY_CONTROLS_ERROR_CODES)[number];

export type ChatPrivacyControlsScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatPrivacyControlsState = "success" | "empty" | "pending";
export type ChatPrivacyControlsServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

// 三类输入分别服务读取控制、切换 AI 分析、准备敏感分享。
export interface ChatPrivacyControlsInput {
  conversationId?: string | null;
  scenario?: ChatPrivacyControlsScenario | string | null;
}

export interface ChatAnalysisOptInInput extends ChatPrivacyControlsInput {
  enabled?: boolean | null;
}

export interface ChatSensitiveShareInput extends ChatPrivacyControlsInput {
  confirmed?: boolean | null;
}

export interface ChatPrivacyControlsService {
  getPrivacyControls: (
    input?: ChatPrivacyControlsInput,
  ) => ChatPrivacyControlsServiceResult<ChatPrivacyControlsResult>;
  setAnalysisOptIn: (
    input: ChatAnalysisOptInInput,
  ) => ChatPrivacyControlsServiceResult<ChatPrivacyControlsResult>;
  requestAnalysisDeletion: (
    input?: ChatPrivacyControlsInput,
  ) => ChatPrivacyControlsServiceResult<ChatPrivacyControlsResult>;
  prepareSensitiveShare: (
    input: ChatSensitiveShareInput,
  ) => ChatPrivacyControlsServiceResult<ChatPrivacyControlsResult>;
}

export interface ChatPrivacyControlsErrorDefinition {
  code: ChatPrivacyControlsErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 隐私错误定义强调本地 guard：缺确认时不能泄露私密笔记或执行删除。
export const CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS = {
  CHAT_PRIVACY_CONVERSATION_ID_REQUIRED: {
    code: "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A chat conversation id is required before privacy controls can be evaluated.",
    recovery:
      "Keep privacy controls disabled until a known source-backed chat conversation is selected.",
  },
  CHAT_PRIVACY_CONVERSATION_NOT_FOUND: {
    code: "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "No mock chat privacy controls fixture matches that conversation id.",
    recovery:
      "Render the missing-conversation envelope and avoid live chat storage, deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED: {
    code: "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A boolean analysis opt-in value is required before the mock can update privacy controls.",
    recovery:
      "Render validation feedback and do not write live analysis settings, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_EMPTY: {
    code: "CHAT_PRIVACY_EMPTY",
    appCode: "CONFLICT",
    message:
      "No chat privacy controls can be rendered because no source-backed chat conversation is available.",
    recovery:
      "Add a source-backed chat conversation before rendering AI analysis, private-note, deletion, or sensitive-share controls.",
  },
  CHAT_PRIVACY_PENDING: {
    code: "CHAT_PRIVACY_PENDING",
    appCode: "CONFLICT",
    message:
      "The chat privacy controls mock boundary is waiting on a local privacy confirmation.",
    recovery:
      "Render the pending state and keep all privacy controls local; do not call live deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED: {
    code: "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
    appCode: "FORBIDDEN",
    message:
      "Sensitive chat context requires explicit confirmation before any share preview can proceed.",
    recovery:
      "Route the attempted share through a confirmation guard and keep private notes hidden until the user confirms.",
  },
  CHAT_PRIVACY_MOCK_FAILED: {
    code: "CHAT_PRIVACY_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat privacy controls mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live deletion workers, privacy audit logs, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED: {
    code: "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat privacy controls live store is not configured for this workspace.",
    recovery:
      "Configure the shared live database before enabling live chat privacy controls. Do not fall back to mock privacy controls in live mode.",
  },
} as const satisfies Record<
  ChatPrivacyControlsErrorCode,
  ChatPrivacyControlsErrorDefinition
>;

export type ChatPrivacyControlsSourceReference = SourceReferenceDTO & {
  type: "manual" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-privacy-controls-rules" | "live-store-query";
};

// AnalysisOptInState 描述当前是否允许聊天分析，但写入仍只在 mock 边界内。
export interface ChatAnalysisOptInState {
  enabled: boolean;
  status: "opted_in" | "opted_out" | "pending_confirmation";
  confirmationRequiredToDisable: true;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules" | "live-store-query";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionPrivacyAuditLogWritten: false;
}

// DeletionState 是 demo 删除状态，不代表生产数据删除已经完成。
export interface ChatAnalysisDeletionState {
  status: "available" | "pending" | "deleted_mock_only";
  deletedInMock?: true;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules" | "live-store-query";
  productionDataDeletionExecuted: false;
  productionPrivacyAuditLogWritten: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

// PrivateNote 默认对 AI 分析和分享预览都不可见。
export interface ChatPrivateNote {
  noteId: string;
  conversationId: string;
  visibility: "hidden";
  bodyRedacted: true;
  redactedPreview: string;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules" | "live-store-query";
  visibleToAiAnalysis: false;
  visibleInSharePreview: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
}

// SensitiveShareConfirmation 是共享前的确认门。
export interface ChatSensitiveShareConfirmation {
  confirmationRequired: boolean;
  status: "required" | "pending_confirmation" | "confirmed_mock_only";
  canShareWithoutConfirmation: false;
  source: ChatPrivacyControlsSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-privacy-controls-rules" | "live-store-query";
  externalActionExecuted: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionPrivacyAuditLogWritten: false;
}

export interface ChatPrivacyControlsProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-chat-privacy-controls-only"
    | "live-chat-privacy-controls-preview";
  generationMethod:
    | "fixture"
    | "rule-based-analysis-toggle"
    | "rule-based-analysis-deletion"
    | "rule-based-sensitive-share"
    | "rule-based-state";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionDataDeletionExecuted: false;
  productionPrivacyAuditLogWritten: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

export interface ChatPrivacyControlsPayload {
  state: ChatPrivacyControlsState;
  conversationId: string;
  participantName: string;
  organization: string;
  analysisOptIn: ChatAnalysisOptInState;
  analysisDeletion: ChatAnalysisDeletionState;
  privateNotes: readonly ChatPrivateNote[];
  sensitiveShareConfirmation: ChatSensitiveShareConfirmation;
  provenance: ChatPrivacyControlsProvenance;
  nextAction: string;
}

export interface ChatPrivacyControlsSuccess {
  success: true;
  data: ChatPrivacyControlsPayload;
}

export interface ChatPrivacyControlsFailure {
  success: false;
  error: ChatPrivacyControlsErrorDefinition & {
    state: "failure";
    provenance: ChatPrivacyControlsProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatPrivacyControlsResult =
  | ChatPrivacyControlsSuccess
  | ChatPrivacyControlsFailure;

export function chatPrivacyControlsFailureToAppError(
  failure: ChatPrivacyControlsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatPrivacyControlsFailureContext(
  failure: ChatPrivacyControlsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatPrivacyControlsErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "chat-privacy-controls",
  };
}
