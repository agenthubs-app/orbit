import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Chat Writing Assist contract 描述聊天文案辅助的结果协议。
// mock/live 的具体生成策略和数据由各自实现提供。

export const CHAT_WRITING_ASSIST_KINDS = [
  "polite_rewrite",
  "follow_up_draft",
  "appointment_suggestion",
  "quick_greeting",
] as const;

export const CHAT_WRITING_ASSIST_ERROR_CODES = [
  "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
  "CHAT_WRITING_ASSIST_EMPTY",
  "CHAT_WRITING_ASSIST_PENDING",
  "CHAT_WRITING_ASSIST_MOCK_FAILED",
  "CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED",
] as const;

export type ChatWritingAssistKind =
  (typeof CHAT_WRITING_ASSIST_KINDS)[number];

export type ChatWritingAssistErrorCode =
  (typeof CHAT_WRITING_ASSIST_ERROR_CODES)[number];

export type ChatWritingAssistScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatWritingAssistState = "success" | "empty" | "pending";
export type ChatWritingAssistServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

// 输入既可以来自已有会话，也可以来自用户给出的 sourceText/contextNote。
export interface ChatWritingAssistInput {
  scenario?: ChatWritingAssistScenario | string | null;
  conversationId?: string | null;
  participantName?: string | null;
  organization?: string | null;
  sourceText?: string | null;
  contextNote?: string | null;
  preferredWindow?: string | null;
}

export interface ChatWritingAssistService {
  rewritePolitely: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistServiceResult<ChatWritingAssistResult>;
  draftFollowup: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistServiceResult<ChatWritingAssistResult>;
  suggestAppointment: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistServiceResult<ChatWritingAssistResult>;
  createQuickGreeting: (
    input?: ChatWritingAssistInput,
  ) => ChatWritingAssistServiceResult<ChatWritingAssistResult>;
}

export interface ChatWritingAssistErrorDefinition {
  code: ChatWritingAssistErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 写作辅助失败时必须停在本地，不能补调用 live AI 或发送通道。
export const CHAT_WRITING_ASSIST_ERROR_DEFINITIONS = {
  CHAT_WRITING_ASSIST_INPUT_REQUIRED: {
    code: "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A non-empty chat source text or relationship context is required before the mock writing assist can respond.",
    recovery:
      "Keep writing assist controls disabled until local chat text, relationship context, or source evidence is present.",
  },
  CHAT_WRITING_ASSIST_EMPTY: {
    code: "CHAT_WRITING_ASSIST_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock chat writing assist can be generated because no source-backed chat context is available.",
    recovery:
      "Add relationship context, chat evidence, or source notes before generating chat writing assistance.",
  },
  CHAT_WRITING_ASSIST_PENDING: {
    code: "CHAT_WRITING_ASSIST_PENDING",
    appCode: "CONFLICT",
    message:
      "The chat writing assist mock boundary is waiting on a local writing guard.",
    recovery:
      "Render the pending state and do not call AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  CHAT_WRITING_ASSIST_MOCK_FAILED: {
    code: "CHAT_WRITING_ASSIST_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat writing assist mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live AI writing providers, external send channels, email, calendar, notification, network, device, or database services.",
  },
  CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED: {
    code: "CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat writing assist live store is not configured for this workspace.",
    recovery:
      "Configure the shared live database before enabling live chat writing assistance. Do not fall back to mock writing assists in live mode.",
  },
} as const satisfies Record<
  ChatWritingAssistErrorCode,
  ChatWritingAssistErrorDefinition
>;

export type ChatWritingAssistSourceReference = SourceReferenceDTO & {
  type: "manual" | "event_import" | "email_signal" | "calendar_signal" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-writing-assist-rules" | "live-store-query";
};

// audit 提醒 UI：生成结果只是草稿，需要人工复核。
export interface ChatWritingAssistAudit {
  sourceLabel: string;
  providerBoundary: "AI false, external send false, persistence false";
  verificationAction: `Review ${string}`;
}

// Suggestion 是可编辑草稿；sendActionRequiresConfirmation=true 表示不能直接发送。
export interface ChatWritingAssistSuggestion {
  assistId: string;
  kind: ChatWritingAssistKind;
  label: string;
  conversationId: string;
  participantName: string;
  organization: string;
  originalText: string;
  suggestedText: string;
  rationale: string;
  source: ChatWritingAssistSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-writing-assist-rules" | "live-store-query";
  audit: ChatWritingAssistAudit;
  sendActionRequiresConfirmation: true;
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionMessageStorageRequested: false;
  productionAuditLogWriteExecuted: false;
}

// provenance 记录草稿生成方法和所有未触发的外部能力。
export interface ChatWritingAssistProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-chat-writing-assist-only"
    | "live-chat-writing-assist-preview";
  generationMethod:
    | "fixture"
    | "rule-based-politeness-rewrite"
    | "rule-based-follow-up-draft"
    | "rule-based-appointment-suggestion"
    | "rule-based-quick-greeting"
    | "rule-based-state";
  aiProviderRequested: false;
  externalSendRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionMessageStorageRequested: false;
  productionAuditLogWriteExecuted: false;
}

export interface ChatWritingAssistPayload {
  state: ChatWritingAssistState;
  assists: readonly ChatWritingAssistSuggestion[];
  summary: string;
  provenance: ChatWritingAssistProvenance;
  nextAction: string;
}

export interface ChatWritingAssistSuccess {
  success: true;
  data: ChatWritingAssistPayload;
}

export interface ChatWritingAssistFailure {
  success: false;
  error: ChatWritingAssistErrorDefinition & {
    state: "failure";
    provenance: ChatWritingAssistProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatWritingAssistResult =
  | ChatWritingAssistSuccess
  | ChatWritingAssistFailure;

export function chatWritingAssistFailureToAppError(
  failure: ChatWritingAssistFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatWritingAssistFailureContext(
  failure: ChatWritingAssistFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatWritingAssistErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "chat-writing-assist",
  };
}
