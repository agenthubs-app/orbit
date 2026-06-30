import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE =
  "fixture:features/chat/summary-contract.ts" as const;
// Chat Summary Extraction contract 描述从聊天中生成摘要、需求、任务和 profile 建议的协议。
// mock/live 的具体提取策略和数据由各自实现提供。

export const CHAT_SUMMARY_EXTRACTION_ERROR_CODES = [
  "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED",
  "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
  "CHAT_SUMMARY_EMPTY",
  "CHAT_SUMMARY_PENDING",
  "CHAT_SUMMARY_MOCK_FAILED",
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

export interface ChatSummaryExtractionService {
  summarizeConversation: (
    input: ChatSummaryExtractionInput,
  ) => ChatSummaryExtractionResult;
  extractConversationSignals: (
    input: ChatSummaryExtractionInput,
  ) => ChatSummaryExtractionResult;
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
} as const satisfies Record<
  ChatSummaryExtractionErrorCode,
  ChatSummaryExtractionErrorDefinition
>;

export type ChatSummarySourceReference = SourceReferenceDTO & {
  type: "manual" | "chat_summary" | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-summary-extraction-rules";
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
  generatedBy: "mock-chat-summary-extraction-rules";
  generationMethod: "fixture" | "rule-based-chat-summary";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
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
  generatedBy: "mock-chat-summary-extraction-rules";
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
  generatedBy: "mock-chat-summary-extraction-rules";
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
  source: typeof CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-chat-summary-extraction-only";
  generationMethod:
    | "fixture"
    | "rule-based-chat-summary"
    | "rule-based-extraction"
    | "rule-based-state";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
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

const fixtureCollectedAt = "2026-06-25T23:59:00.000Z";

const mockOnlyExecutionFlags = {
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
  automaticProfileMutationExecuted: false,
} as const;

function source(input: {
  type: ChatSummarySourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ChatSummarySourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-chat-summary-extraction-rules",
  };
}

const mayaPilotTimingSource = source({
  type: "manual",
  id: "source:chat-summary:maya:pilot-timing",
  label: "Maya pilot timing chat evidence",
  providerRecordId: "conversation:demo-conversation-1",
});

const localExtractionGuardSource = source({
  type: "system",
  id: "source:chat-summary:local-extraction-guard",
  label: "Local chat extraction guard",
  providerRecordId: "mock-extraction-guard:chat-summary",
});

export const mockChatSummaryRecord: ChatSummaryRecord = {
  summaryId: "demo-chat-summary-maya-pilot",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  narrative:
    "Maya Chen asked for a pilot timing comparison tied to operator readiness questions from the Tokyo climate breakfast. The sensible follow-up is to send two pilot windows and ask which operator concern Kumo Grid wants resolved first.",
  source: mayaPilotTimingSource,
  evidenceIds: [
    "evidence:chat:maya:breakfast",
    "evidence:chat:maya:pilot-timing",
  ],
  extractedNeedIds: ["need:chat:maya:pilot-window"],
  extractedTaskIds: ["task:chat:maya:send-pilot-comparison"],
  relationshipProfileUpdateIds: [
    "profile-update:chat:maya:operator-readiness",
  ],
  confirmationRequiredSuggestionIds: [
    "profile-suggestion:chat:maya:priority-topic",
  ],
  generatedBy: "mock-chat-summary-extraction-rules",
  generationMethod: "fixture",
  ...mockOnlyExecutionFlags,
};

export const mockExtractedNeeds: readonly ExtractedNeed[] = [
  {
    needId: "need:chat:maya:pilot-window",
    conversationId: "demo-conversation-1",
    contactId: "demo-contact-maya",
    statement:
      "Maya needs an operator readiness comparison for two pilot timing windows before deciding the next review step.",
    priority: "high",
    source: mayaPilotTimingSource,
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    generatedBy: "mock-chat-summary-extraction-rules",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
];

export const mockExtractedTasks: readonly ExtractedTask[] = [
  {
    taskId: "task:chat:maya:send-pilot-comparison",
    conversationId: "demo-conversation-1",
    title: "Send Maya the pilot timing comparison",
    dueHint: "After the Tokyo climate operator breakfast follow-up",
    rationale:
      "The chat evidence asks for a concrete comparison before Kumo Grid reviews operator readiness.",
    source: mayaPilotTimingSource,
    evidenceIds: ["evidence:chat:maya:pilot-timing"],
    generatedBy: "mock-chat-summary-extraction-rules",
    notificationDelivered: false,
    liveDatabaseWriteExecuted: false,
  },
];

export const mockRelationshipProfileUpdates: readonly RelationshipProfileUpdate[] =
  [
    {
      updateId: "profile-update:chat:maya:operator-readiness",
      connectionId: "demo-connection-maya",
      field: "latestContext",
      proposedValue:
        "Maya is comparing pilot timing windows through the lens of operator readiness.",
      reason:
        "The chat summary has source evidence but the mock must not mutate the live relationship profile.",
      source: mayaPilotTimingSource,
      evidenceIds: ["evidence:chat:maya:pilot-timing"],
      autoApplied: false,
      automaticProfileMutationExecuted: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockConfirmationRequiredProfileSuggestions: readonly ConfirmationRequiredProfileSuggestion[] =
  [
    {
      suggestionId: "profile-suggestion:chat:maya:priority-topic",
      connectionId: "demo-connection-maya",
      field: "priorityTopic",
      proposedValue: "Operator readiness pilot timing",
      reason:
        "Updating a relationship profile from chat extraction requires human review.",
      guard: "profile confirmation guard",
      source: mayaPilotTimingSource,
      evidenceIds: [
        "evidence:chat:maya:breakfast",
        "evidence:chat:maya:pilot-timing",
      ],
      confirmationRequired: true,
      autoApplied: false,
      automaticProfileMutationExecuted: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockChatSummaryExtractionProvenance: ChatSummaryExtractionProvenance =
  {
    source: CHAT_SUMMARY_EXTRACTION_FIXTURE_SOURCE,
    sourceLabel: "Mock chat summary and extraction fixture",
    evidenceIds: [
      "evidence:chat:maya:breakfast",
      "evidence:chat:maya:pilot-timing",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-chat-summary-extraction-only",
    generationMethod: "fixture",
    ...mockOnlyExecutionFlags,
  };

export const mockChatSummaryExtractionFailureProvenance: ChatSummaryExtractionProvenance =
  {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Controlled chat summary and extraction mock failure",
    evidenceIds: ["evidence:chat-summary:controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockChatSummaryFixture: ChatSummaryExtractionPayload = {
  state: "success",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: mockChatSummaryRecord,
  extractedNeeds: mockExtractedNeeds,
  extractedTasks: mockExtractedTasks,
  relationshipProfileUpdates: mockRelationshipProfileUpdates,
  confirmationRequiredProfileSuggestions:
    mockConfirmationRequiredProfileSuggestions,
  provenance: mockChatSummaryExtractionProvenance,
  nextAction:
    "Review extracted needs, tasks, and profile suggestions before any profile confirmation or follow-up action.",
};

export const mockChatExtractionFixture: ChatSummaryExtractionPayload = {
  ...mockChatSummaryFixture,
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Mock chat extraction fixture",
    generationMethod: "rule-based-extraction",
  },
};

export const mockEmptyChatSummaryFixture: ChatSummaryExtractionPayload = {
  state: "empty",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: null,
  extractedNeeds: [],
  extractedTasks: [],
  relationshipProfileUpdates: [],
  confirmationRequiredProfileSuggestions: [],
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Empty chat summary fixture",
    evidenceIds: ["evidence:chat-summary:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add source-backed chat messages or relationship context before generating a summary.",
};

export const mockPendingChatExtractionFixture: ChatSummaryExtractionPayload = {
  state: "pending",
  conversationId: "demo-conversation-1",
  participantName: "Maya Chen",
  organization: "Kumo Grid",
  summary: null,
  extractedNeeds: [],
  extractedTasks: [],
  relationshipProfileUpdates: [],
  confirmationRequiredProfileSuggestions: [],
  provenance: {
    ...mockChatSummaryExtractionProvenance,
    sourceLabel: "Pending chat extraction fixture",
    evidenceIds: ["evidence:chat-summary:pending-local-extraction-guard"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local extraction guard before rendering extracted relationship signals.",
};

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
    provenance:
      "Mock chat summary and extraction failure came from deterministic fixture rules.",
    service: "chat-summary-and-extraction-mock",
  };
}
