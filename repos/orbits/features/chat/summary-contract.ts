import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Chat Summary Extraction contract 描述从聊天中生成摘要、需求、任务和 profile 建议的协议。
// mock/live 的具体提取策略和数据由各自实现提供。

export const CHAT_SUMMARY_EXTRACTION_ERROR_CODES = [
  "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED",
  "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
  "CHAT_SUMMARY_EMPTY",
  "CHAT_SUMMARY_PENDING",
  "CHAT_SUMMARY_MOCK_FAILED",
  "CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED",
] as const;

export type ChatSummaryExtractionErrorCode =
  (typeof CHAT_SUMMARY_EXTRACTION_ERROR_CODES)[number];

export type ChatSummaryExtractionScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatSummaryExtractionState = "success" | "empty" | "pending";

// conversationId 决定提取哪段关系聊天；scenario 用于固定测试状态。
export interface ChatSummaryExtractionInput {
  conversationId?: string | null;
  scenario?: ChatSummaryExtractionScenario | string | null;
}

export type ChatSummaryExtractionServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface ChatSummaryExtractionService {
  summarizeConversation: (
    input: ChatSummaryExtractionInput,
  ) => ChatSummaryExtractionServiceResult<ChatSummaryExtractionResult>;
  extractConversationSignals: (
    input: ChatSummaryExtractionInput,
  ) => ChatSummaryExtractionServiceResult<ChatSummaryExtractionResult>;
}

export interface ChatSummaryExtractionErrorDefinition {
  code: ChatSummaryExtractionErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 摘要提取失败时停在本地，不能回退调用 live summarization 或持久化。
export const CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS = {
  CHAT_SUMMARY_CONVERSATION_ID_REQUIRED: {
    code: "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A chat conversation id is required before summary extraction can run.",
    recovery:
      "Keep chat summary controls disabled until a known source-backed conversation is selected.",
  },
  CHAT_SUMMARY_CONVERSATION_NOT_FOUND: {
    code: "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "No mock chat summary fixture matches that conversation id.",
    recovery:
      "Render the missing-conversation envelope and do not call live chat storage, databases, network, device, email, calendar, notification, or AI services.",
  },
  CHAT_SUMMARY_EMPTY: {
    code: "CHAT_SUMMARY_EMPTY",
    appCode: "CONFLICT",
    message:
      "No chat summary can be generated because no source-backed chat messages are available.",
    recovery:
      "Add source-backed chat messages or relationship context before generating a summary or extraction.",
  },
  CHAT_SUMMARY_PENDING: {
    code: "CHAT_SUMMARY_PENDING",
    appCode: "CONFLICT",
    message:
      "The chat summary and extraction mock boundary is waiting on a local extraction guard.",
    recovery:
      "Render the pending state and keep summary extraction local; do not call live providers or mutate the relationship profile automatically.",
  },
  CHAT_SUMMARY_MOCK_FAILED: {
    code: "CHAT_SUMMARY_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat summary and extraction mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live summarization, persistence, email, calendar, notification, network, device, or database services.",
  },
  CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED: {
    code: "CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat summary extraction live store is not configured for this environment.",
    recovery:
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using live chat summary extraction; do not call AI or mutate profiles as a fallback.",
  },
} as const satisfies Record<
  ChatSummaryExtractionErrorCode,
  ChatSummaryExtractionErrorDefinition
>;

export type ChatSummarySourceReference = SourceReferenceDTO & {
  type: "manual" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-summary-extraction-rules" | "live-store-query";
};

// SummaryRecord 是聊天摘要的核心 DTO，同时列出提取出的需求、任务和 profile 建议 ID。
export interface ChatSummaryRecord {
  summaryId: string;
  conversationId: string;
  participantName: string;
  organization: string;
  narrative: string;
  source: ChatSummarySourceReference;
  evidenceIds: readonly string[];
  extractedNeedIds: readonly string[];
  extractedTaskIds: readonly string[];
  relationshipProfileUpdateIds: readonly string[];
  confirmationRequiredSuggestionIds: readonly string[];
  generatedBy: "mock-chat-summary-extraction-rules" | "live-store-query";
  generationMethod:
    | "fixture"
    | "rule-based-chat-summary"
    | "live-store-summary"
    | "live-store-extraction";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  automaticProfileMutationExecuted: false;
}

// ExtractedNeed 是关系需求信号，不会自动写入生产 profile。
export interface ExtractedNeed {
  needId: string;
  conversationId: string;
  contactId: string;
  statement: string;
  priority: "high" | "medium" | "low";
  source: ChatSummarySourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-summary-extraction-rules" | "live-store-query";
  aiProviderRequested: false;
  externalNetworkRequested: false;
}

// ExtractedTask 是建议任务，不会直接创建 reminder 或通知。
export interface ExtractedTask {
  taskId: string;
  conversationId: string;
  title: string;
  dueHint: string;
  rationale: string;
  source: ChatSummarySourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-chat-summary-extraction-rules" | "live-store-query";
  notificationDelivered: false;
  liveDatabaseWriteExecuted: false;
}

// RelationshipProfileUpdate 是建议更新，autoApplied=false 表示必须人工确认。
export interface RelationshipProfileUpdate {
  updateId: string;
  connectionId: string;
  field: string;
  proposedValue: string;
  reason: string;
  source: ChatSummarySourceReference;
  evidenceIds: readonly string[];
  autoApplied: false;
  automaticProfileMutationExecuted: false;
  liveDatabaseWriteExecuted: false;
}

export interface ConfirmationRequiredProfileSuggestion {
  suggestionId: string;
  connectionId: string;
  field: string;
  proposedValue: string;
  reason: string;
  guard: string;
  source: ChatSummarySourceReference;
  evidenceIds: readonly string[];
  confirmationRequired: true;
  autoApplied: false;
  automaticProfileMutationExecuted: false;
  liveDatabaseWriteExecuted: false;
}

export interface ChatSummaryExtractionProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-chat-summary-extraction-only"
    | "live-chat-summary-extraction-preview";
  generationMethod:
    | "fixture"
    | "rule-based-chat-summary"
    | "rule-based-extraction"
    | "rule-based-state"
    | "live-store-summary"
    | "live-store-extraction";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
  automaticProfileMutationExecuted: false;
}

export interface ChatSummaryExtractionPayload {
  state: ChatSummaryExtractionState;
  conversationId: string;
  participantName: string;
  organization: string;
  summary: ChatSummaryRecord | null;
  extractedNeeds: readonly ExtractedNeed[];
  extractedTasks: readonly ExtractedTask[];
  relationshipProfileUpdates: readonly RelationshipProfileUpdate[];
  confirmationRequiredProfileSuggestions: readonly ConfirmationRequiredProfileSuggestion[];
  provenance: ChatSummaryExtractionProvenance;
  nextAction: string;
}

export interface ChatSummaryExtractionSuccess {
  success: true;
  data: ChatSummaryExtractionPayload;
}

export interface ChatSummaryExtractionFailure {
  success: false;
  error: ChatSummaryExtractionErrorDefinition & {
    state: "failure";
    provenance: ChatSummaryExtractionProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatSummaryExtractionResult =
  | ChatSummaryExtractionSuccess
  | ChatSummaryExtractionFailure;

export function chatSummaryExtractionFailureToAppError(
  failure: ChatSummaryExtractionFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatSummaryExtractionFailureContext(
  failure: ChatSummaryExtractionFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatSummaryExtractionErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "chat-summary-and-extraction",
  };
}
