import {
  CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS,
  type ChatConversationListPayload,
  type ChatConversationListResult,
  type ChatConversationMessageService,
  type ChatConversationMockErrorCode,
  type ChatConversationMockFailure,
  type ChatConversationMockProvenance,
  type ChatConversationMockScenario,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessageThreadPayload,
  type ChatMessageThreadResult,
  type ChatSendMessagePayload,
  type ChatSendMessageResult,
} from "./contract";
import {
  chatLocalSendSource,
  mockChatConversationFailureProvenance,
  mockChatConversationListFixture,
  mockChatConversationProvenance,
  mockChatConversations,
  mockChatMessages,
  mockEmptyChatConversationFixture,
  mockEmptyChatThreadFixture,
  mockPendingChatConversationFixture,
  mockPendingChatSendFixture,
  mockPendingChatThreadFixture,
  readySendMessageState,
} from "./fixtures";

const supportedScenarios = new Set<ChatConversationMockScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// Chat conversation mock service 只模拟一对一关系聊天记录。
// sendMessage 会把消息追加到返回 payload，但不写生产消息存储、不发 websocket、不调用 AI。
const mockOnlyExecutionFlags = {
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  aiProviderRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationDelivered: false,
  deviceRequested: false,
} as const;

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // chat payload 包含 messages 数组，返回 clone 防止调用方改共享 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function listSuccess(
  data: ChatConversationListPayload,
): ChatConversationListResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function threadSuccess(
  data: ChatMessageThreadPayload,
): ChatMessageThreadResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function sendSuccess(data: ChatSendMessagePayload): ChatSendMessageResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ChatConversationMockErrorCode,
): ChatConversationMockFailure {
  // chat failure 都保留在 mock conversation 边界内，避免暴露真实传输或存储细节。
  const definition = CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockChatConversationFailureProvenance,
      evidenceIds: mockChatConversationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ChatConversationMockScenario | string | null,
): ChatConversationMockScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatConversationMockScenario)
  ) {
    return scenario as ChatConversationMockScenario;
  }

  return "success";
}

function listScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatConversationListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess(mockEmptyChatConversationFixture);
    case "pending":
      return listSuccess(mockPendingChatConversationFixture);
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function threadScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatMessageThreadResult | null {
  switch (scenario) {
    case "empty":
      return threadSuccess(mockEmptyChatThreadFixture);
    case "pending":
      return threadSuccess(mockPendingChatThreadFixture);
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function sendScenarioResult(
  scenario: ChatConversationMockScenario,
): ChatSendMessageResult | null {
  switch (scenario) {
    case "pending":
      return sendSuccess(mockPendingChatSendFixture);
    case "empty":
      return failure("CHAT_CONVERSATION_EMPTY");
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function conversationById(
  conversationId: string,
): ChatConversationSummary | null {
  // 当前 mock 只查 fixture 中的 conversation summary，不访问生产会话表。
  return (
    mockChatConversations.find(
      (conversation) => conversation.conversationId === conversationId,
    ) ?? null
  );
}

function messagesForConversation(conversationId: string): readonly ChatMessage[] {
  return mockChatMessages.filter(
    (message) => message.conversationId === conversationId,
  );
}

function uniqueEvidenceIds(input: {
  conversation: ChatConversationSummary;
  messages: readonly ChatMessage[];
  extraEvidenceIds?: readonly string[];
}): readonly string[] {
  return [
    ...new Set([
      ...input.conversation.evidenceIds,
      ...input.messages.flatMap((message) => message.evidenceIds),
      ...(input.extraEvidenceIds ?? []),
    ]),
  ];
}

function provenanceFor(input: {
  conversation: ChatConversationSummary;
  messages: readonly ChatMessage[];
  generationMethod: ChatConversationMockProvenance["generationMethod"];
  sourceLabel: string;
  extraEvidenceIds?: readonly string[];
}): ChatConversationMockProvenance {
  // provenance 汇总 conversation、messages 和额外 mock-send evidence。
  return {
    ...mockChatConversationProvenance,
    evidenceIds: uniqueEvidenceIds(input),
    generationMethod: input.generationMethod,
    sourceLabel: input.sourceLabel,
  };
}

function threadPayloadFor(
  conversation: ChatConversationSummary,
): ChatMessageThreadPayload {
  // thread payload 由 conversation summary + 对应 messages 派生，保持一对一上下文一致。
  const messages = messagesForConversation(conversation.conversationId);

  return {
    state: "success",
    conversation,
    messages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversation.oneToOneContext,
    summary: `${conversation.participantName}'s one-to-one thread is assembled from local relationship evidence fixtures.`,
    provenance: provenanceFor({
      conversation,
      messages,
      generationMethod: "rule-based-thread",
      sourceLabel: `Mock chat thread for ${conversation.participantName}`,
    }),
    nextAction:
      "Review source evidence before recording a local mock reply or wiring live delivery.",
  };
}

function buildSentMessage(input: {
  conversation: ChatConversationSummary;
  body: string;
}): ChatMessage {
  // 发送消息只是构造 mock_recorded_locally 记录；mockOnlyExecutionFlags 明确所有外部通道为 false。
  return {
    messageId: `demo-message-local-${input.conversation.conversationId}`,
    conversationId: input.conversation.conversationId,
    senderRole: "orbit_user",
    senderName: "Alex Tan",
    body: input.body,
    createdAt: "2026-06-25T23:55:00.000Z",
    deliveryState: "mock_recorded_locally",
    source: chatLocalSendSource,
    evidenceIds: [
      ...input.conversation.evidenceIds,
      "evidence:chat:mock-send",
    ],
    ...mockOnlyExecutionFlags,
  };
}

function sendPayloadFor(input: {
  conversation: ChatConversationSummary;
  body: string;
}): ChatSendMessagePayload {
  const previousMessages = messagesForConversation(input.conversation.conversationId);
  const message = buildSentMessage(input);
  const messages = [...previousMessages, message];

  return {
    state: "success",
    conversationId: input.conversation.conversationId,
    message,
    messages,
    sendMessageState: readySendMessageState,
    oneToOneContext: input.conversation.oneToOneContext,
    summary:
      "A local mock message was recorded without live transport, websocket subscriptions, or production storage.",
    provenance: provenanceFor({
      conversation: input.conversation,
      messages,
      generationMethod: "rule-based-send",
      sourceLabel: "Mock chat send rule",
      extraEvidenceIds: ["evidence:chat:mock-send"],
    }),
    nextAction:
      "Keep live delivery behind confirmation and provider replacement tests.",
  };
}

export function createMockChatConversationMessageService(): ChatConversationMessageService {
  // public API 对应列表、线程详情和本地发送三类 route。
  return {
    listConversations(input = {}): ChatConversationListResult {
      const scenario = listScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return listSuccess(mockChatConversationListFixture);
    },

    getMessageThread(input): ChatMessageThreadResult {
      const conversationId = readText(input.conversationId);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED");
      }

      const scenario = threadScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversation = conversationById(conversationId);

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND");
      }

      return threadSuccess(threadPayloadFor(conversation));
    },

    sendMessage(input): ChatSendMessageResult {
      const conversationId = readText(input.conversationId);
      const body = readText(input.body);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED");
      }

      if (!body) {
        return failure("CHAT_MESSAGE_BODY_REQUIRED");
      }

      const scenario = sendScenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversation = conversationById(conversationId);

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND");
      }

      return sendSuccess(sendPayloadFor({ conversation, body }));
    },
  };
}

export type {
  ChatConversationListResult,
  ChatMessageThreadResult,
  ChatSendMessageResult,
};
