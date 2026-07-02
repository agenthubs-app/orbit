import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Chat contract 描述传统聊天页的 mock-first 会话模型。
// 它不是 live Orbit Agent：这里不调用模型、不走 websocket、不写生产消息存储。
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
  "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
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

// 三类输入分别对应侧栏列表、消息线程、发送消息。
// scenario 用于测试 empty/pending/failure；conversationId/body 先做本地校验。
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

// 这里保留 service interface 是为了让 contract 和 service.ts 使用同一能力形状。
export interface ChatConversationMessageService {
  listConversations: (
    input?: ChatConversationListInput,
  ) => ChatConversationListResult | Promise<ChatConversationListResult>;
  getMessageThread: (
    input: ChatMessageThreadInput,
  ) => ChatMessageThreadResult | Promise<ChatMessageThreadResult>;
  sendMessage: (
    input: ChatSendMessageInput,
  ) => ChatSendMessageResult | Promise<ChatSendMessageResult>;
}

// 聊天错误定义显式列出恢复方式，防止调用方在失败时误触发真实传输层。
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
  CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED: {
    code: "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The chat conversation live store is not configured for this environment.",
    recovery:
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using live chat storage; do not fall back to external transport.",
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
  generatedBy:
    | "mock-chat-conversation-rules"
    | "live-store-query"
    | "live-store-send";
};

// one-to-one context 是聊天页和关系图之间的桥梁：
// 每个会话都附带联系人、关系阶段、推荐跟进和证据来源。
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

// 会话摘要包含大量 false 标记，表示 mock 聊天没有打开实时传输或外部 provider。
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
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  aiProviderRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

// ChatMessage 是线程里的单条消息 DTO；deliveryState 只描述 mock 层接收/记录状态。
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
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
  aiProviderRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  deviceRequested: false;
}

// 发送状态用于控制 UI 按钮：pending/blocked 时不应该允许“真实发送”。
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
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-chat-conversation-only" | "live-chat-conversation-preview";
  generationMethod:
    | "fixture"
    | "rule-based-list"
    | "rule-based-thread"
    | "rule-based-send"
    | "rule-based-state"
    | "local-remote-store-query"
    | "live-store-query"
    | "live-store-send";
  realtimeTransportRequested: false;
  websocketSubscriptionRequested: false;
  productionMessageStorageRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
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
    provenance: failure.error.provenance.sourceLabel,
    service: "chat-conversation-message",
  };
}
