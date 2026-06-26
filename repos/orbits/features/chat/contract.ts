import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE =
  "fixture:features/chat/fixtures.ts" as const;

export const CHAT_CONVERSATION_MOCK_DEFAULT_MESSAGE_BODY =
  "Let's compare pilot windows next week." as const;

export const CHAT_CONVERSATION_STATUSES = [
  "active",
  "paused",
  "needs_followup",
] as const;

export const SEND_MESSAGE_STATUSES = [
  "ready",
  "pending_confirmation",
  "blocked",
] as const;

export const CHAT_CONVERSATION_MOCK_ERROR_CODES = [
  "CHAT_CONVERSATION_ID_REQUIRED",
  "CHAT_CONVERSATION_NOT_FOUND",
  "CHAT_MESSAGE_BODY_REQUIRED",
  "CHAT_CONVERSATION_EMPTY",
  "CHAT_CONVERSATION_PENDING",
  "CHAT_CONVERSATION_MOCK_FAILED",
] as const;

export type ChatConversationStatus =
  (typeof CHAT_CONVERSATION_STATUSES)[number];

export type SendMessageStatus = (typeof SEND_MESSAGE_STATUSES)[number];

export type ChatConversationMockErrorCode =
  (typeof CHAT_CONVERSATION_MOCK_ERROR_CODES)[number];

export type ChatConversationMockScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ChatConversationMockState = "success" | "empty" | "pending";

export type ChatParticipantRole = "orbit_user" | "contact";

export type ChatMessageDeliveryState =
  | "mock_received"
  | "mock_recorded_locally"
  | "not_sent";

export interface ChatConversationListInput {
  scenario?: ChatConversationMockScenario | string | null;
}

export interface ChatMessageThreadInput {
  conversationId?: string | null;
  scenario?: ChatConversationMockScenario | string | null;
}

export interface ChatSendMessageInput {
  conversationId?: string | null;
  body?: string | null;
  scenario?: ChatConversationMockScenario | string | null;
}

export interface ChatConversationMessageService {
  listConversations: (
    input?: ChatConversationListInput,
  ) => ChatConversationListResult;
  getMessageThread: (
    input: ChatMessageThreadInput,
  ) => ChatMessageThreadResult;
  sendMessage: (input: ChatSendMessageInput) => ChatSendMessageResult;
}

export interface ChatConversationMockErrorDefinition {
  code: ChatConversationMockErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS = {
  CHAT_CONVERSATION_ID_REQUIRED: {
    code: "CHAT_CONVERSATION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A chat conversation id is required for the mock chat boundary.",
    recovery:
      "Keep thread and send-message controls disabled until a known fixture conversation is selected.",
  },
  CHAT_CONVERSATION_NOT_FOUND: {
    code: "CHAT_CONVERSATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock chat conversation fixture matches that conversation id.",
    recovery:
      "Render the missing-conversation envelope and avoid real-time transport, websocket subscriptions, production message storage, network, device, database, AI, email, calendar, or notification services.",
  },
  CHAT_MESSAGE_BODY_REQUIRED: {
    code: "CHAT_MESSAGE_BODY_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A non-empty message body is required before recording a mock message.",
    recovery:
      "Keep send controls disabled until local message text exists; do not call production message storage or external delivery.",
  },
  CHAT_CONVERSATION_EMPTY: {
    code: "CHAT_CONVERSATION_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock chat conversation can be rendered because no one-to-one relationship context or source evidence is available.",
    recovery:
      "Add one-to-one relationship context or source evidence before rendering chat conversations.",
  },
  CHAT_CONVERSATION_PENDING: {
    code: "CHAT_CONVERSATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock chat conversation boundary is waiting on a local transport handshake fixture.",
    recovery:
      "Render the pending state and do not call real-time transport, websocket subscriptions, production message storage, network, device, database, AI, email, calendar, or notification services.",
  },
  CHAT_CONVERSATION_MOCK_FAILED: {
    code: "CHAT_CONVERSATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat conversation and message mock boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry live chat transport, websocket subscriptions, production message storage, network, device, database, AI, email, calendar, or notification services.",
  },
} as const satisfies Record<
  ChatConversationMockErrorCode,
  ChatConversationMockErrorDefinition
>;

export type ChatSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "referral"
    | "chat_summary"
    | "system";
  label: string;
  providerRecordId: string;
  collectedAt: string;
  generatedBy: "mock-chat-conversation-rules";
};

export interface ChatOneToOneContext {
  contactId: string;
  participantName: string;
  organization: string;
  relationshipStage: string;
  relationshipReason: string;
  latestContext: string;
  recommendedFollowup: string;
  source: ChatSourceReference;
  evidenceIds: readonly string[];
}

export interface ChatConversationSummary {
  conversationId: string;
  status: ChatConversationStatus;
  title: string;
  participantContactId: string;
  participantName: string;
  organization: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  oneToOneContext: ChatOneToOneContext;
  source: ChatSourceReference;
  evidenceIds: readonly string[];
  realtimeTransportRequested: false;
  websocketSubscriptionRequested: false;
  productionMessageStorageRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderRole: ChatParticipantRole;
  senderName: string;
  body: string;
  createdAt: string;
  deliveryState: ChatMessageDeliveryState;
  source: ChatSourceReference;
  evidenceIds: readonly string[];
  realtimeTransportRequested: false;
  websocketSubscriptionRequested: false;
  productionMessageStorageRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

export interface ChatSendMessageState {
  status: SendMessageStatus;
  canSendInMock: boolean;
  reason: string;
  confirmationRequiredBeforeLiveSend: true;
  realtimeTransportRequested: false;
  websocketSubscriptionRequested: false;
  productionMessageStorageRequested: false;
  externalSendRequested: false;
}

export interface ChatConversationMockProvenance {
  source: typeof CHAT_CONVERSATION_MOCK_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-chat-conversation-only";
  generationMethod:
    | "fixture"
    | "rule-based-list"
    | "rule-based-thread"
    | "rule-based-send"
    | "rule-based-state";
  realtimeTransportRequested: false;
  websocketSubscriptionRequested: false;
  productionMessageStorageRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

export interface ChatConversationListPayload {
  state: ChatConversationMockState;
  conversations: readonly ChatConversationSummary[];
  summary: string;
  provenance: ChatConversationMockProvenance;
  nextAction: string;
}

export interface ChatMessageThreadPayload {
  state: ChatConversationMockState;
  conversation: ChatConversationSummary;
  messages: readonly ChatMessage[];
  sendMessageState: ChatSendMessageState;
  oneToOneContext: ChatOneToOneContext;
  summary: string;
  provenance: ChatConversationMockProvenance;
  nextAction: string;
}

export interface ChatSendMessagePayload {
  state: ChatConversationMockState;
  conversationId: string;
  message: ChatMessage;
  messages: readonly ChatMessage[];
  sendMessageState: ChatSendMessageState;
  oneToOneContext: ChatOneToOneContext;
  summary: string;
  provenance: ChatConversationMockProvenance;
  nextAction: string;
}

export interface ChatConversationListSuccess {
  success: true;
  data: ChatConversationListPayload;
}

export interface ChatMessageThreadSuccess {
  success: true;
  data: ChatMessageThreadPayload;
}

export interface ChatSendMessageSuccess {
  success: true;
  data: ChatSendMessagePayload;
}

export interface ChatConversationMockFailure {
  success: false;
  error: ChatConversationMockErrorDefinition & {
    state: "failure";
    provenance: ChatConversationMockProvenance;
    evidenceIds: readonly string[];
  };
}

export type ChatConversationListResult =
  | ChatConversationListSuccess
  | ChatConversationMockFailure;

export type ChatMessageThreadResult =
  | ChatMessageThreadSuccess
  | ChatConversationMockFailure;

export type ChatSendMessageResult =
  | ChatSendMessageSuccess
  | ChatConversationMockFailure;

export type ChatConversationMessageResult =
  | ChatConversationListResult
  | ChatMessageThreadResult
  | ChatSendMessageResult;

export function chatConversationMockFailureToAppError(
  failure: ChatConversationMockFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function chatConversationMockFailureContext(
  failure: ChatConversationMockFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    chatConversationMockErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock chat conversation failure came from deterministic fixture rules.",
    service: "chat-conversation-and-message-mock",
  };
}
