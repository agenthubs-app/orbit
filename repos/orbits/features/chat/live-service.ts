import {
  CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS,
  type ChatConversationListInput,
  type ChatConversationListPayload,
  type ChatConversationListResult,
  type ChatConversationMockErrorCode,
  type ChatConversationMockFailure,
  type ChatConversationMockProvenance,
  type ChatConversationMockScenario,
  type ChatConversationStatus,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessageThreadInput,
  type ChatMessageThreadPayload,
  type ChatMessageThreadResult,
  type ChatSendMessageInput,
  type ChatSendMessagePayload,
  type ChatSendMessageResult,
  type ChatSendMessageState,
  type ChatSourceReference,
} from "./contract";
import type {
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../shared/domain/contracts";
import type { ChatConversationMessageService } from "./service";

type LiveChatProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveChatConversationGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  conversations: readonly ConversationDTO[];
  generatedAt: string;
  messages: readonly MessageDTO[];
  profileId: string;
}

export interface LiveChatAppendMessageInput {
  body: string;
  conversationId: string;
  evidenceIds: readonly string[];
  sentAt: string;
}

export interface LiveChatConversationMessageProvider {
  source: string;
  sourceLabel: string;
  appendMessage: (
    input: LiveChatAppendMessageInput,
  ) => LiveChatProviderResult<LiveChatConversationGraph>;
  readChatGraph: () => LiveChatProviderResult<LiveChatConversationGraph>;
}

export interface LiveChatConversationMessageServiceOptions {
  provider?: LiveChatConversationMessageProvider | null;
}

const supportedScenarios = new Set<ChatConversationMockScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const readySendMessageState: ChatSendMessageState = {
  status: "ready",
  canSendInMock: true,
  reason:
    "The live chat store can record a message, but external delivery still requires an explicit transport provider.",
  confirmationRequiredBeforeLiveSend: true,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalSendRequested: false,
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
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

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function executionFlags(input: {
  readExecuted: boolean;
  writeExecuted: boolean;
}) {
  return {
    realtimeTransportRequested: false,
    websocketSubscriptionRequested: false,
    productionMessageStorageRequested: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: input.readExecuted,
    liveDatabaseWriteExecuted: input.writeExecuted,
    aiProviderRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
  } as const;
}

function sourceForConversation(
  conversation: ConversationDTO,
  collectedAt: string,
): ChatSourceReference {
  return sourceReference({
    collectedAt,
    defaultLabel: "Live chat conversation source",
    generatedBy: "live-store-query",
    source: conversation.source,
  });
}

function sourceForMessage(input: {
  collectedAt: string;
  generatedBy: ChatSourceReference["generatedBy"];
  message: MessageDTO;
}): ChatSourceReference {
  return sourceReference({
    collectedAt: input.collectedAt,
    defaultLabel: "Live chat message source",
    generatedBy: input.generatedBy,
    source: input.message.source,
  });
}

function sourceReference(input: {
  collectedAt: string;
  defaultLabel: string;
  generatedBy: ChatSourceReference["generatedBy"];
  source: ConversationDTO["source"] | MessageDTO["source"];
}): ChatSourceReference {
  const supportedTypes = new Set<ChatSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "referral",
    "chat_summary",
    "system",
  ]);
  const type = supportedTypes.has(input.source.type as ChatSourceReference["type"])
    ? (input.source.type as ChatSourceReference["type"])
    : "system";

  return {
    type,
    id: input.source.id,
    label: input.source.label ?? input.defaultLabel,
    providerRecordId: input.source.id,
    collectedAt: input.collectedAt,
    generatedBy: input.generatedBy,
  };
}

function participantContact(
  conversation: ConversationDTO,
  contacts: readonly ContactDTO[],
): ContactDTO | null {
  const contactId = conversation.participantContactIds[0];

  return contacts.find((contact) => contact.id === contactId) ?? null;
}

function connectionForContact(
  contactId: string,
  connections: readonly ConnectionDTO[],
): ConnectionDTO | null {
  return (
    connections.find((connection) => connection.contactId === contactId) ?? null
  );
}

function messagesForConversation(
  conversationId: string,
  messages: readonly MessageDTO[],
): readonly MessageDTO[] {
  return messages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.id.localeCompare(right.id),
    );
}

function conversationsForList(
  conversations: readonly ConversationDTO[],
): readonly ConversationDTO[] {
  return [...conversations].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id),
  );
}

function statusFor(messages: readonly MessageDTO[]): ChatConversationStatus {
  const latest = messages[messages.length - 1];

  if (latest?.direction === "inbound") {
    return "needs_followup";
  }

  return "active";
}

function oneToOneContext(
  conversation: ConversationDTO,
  graph: LiveChatConversationGraph,
) {
  const contact = participantContact(conversation, graph.contacts);
  const connection = contact
    ? connectionForContact(contact.id, graph.connections)
    : null;
  const source = sourceForConversation(conversation, graph.generatedAt);

  return {
    contactId: contact?.id ?? conversation.participantContactIds[0] ?? "",
    participantName: contact?.displayName ?? "Live chat contact",
    organization: contact?.organization ?? "",
    relationshipStage: contact?.stage ?? "active",
    relationshipReason:
      connection?.summary ??
      "Live chat conversation has source-backed relationship context.",
    latestContext:
      connection?.summary ??
      "Review live storage messages before follow-up.",
    recommendedFollowup:
      "Review source evidence before recording another live-storage message.",
    source,
    evidenceIds: conversation.evidenceIds,
  };
}

function toConversationSummary(input: {
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  writeExecuted?: boolean;
}): ChatConversationSummary {
  const contact = participantContact(input.conversation, input.graph.contacts);
  const messages = messagesForConversation(
    input.conversation.id,
    input.graph.messages,
  );
  const latest = messages[messages.length - 1];
  const context = oneToOneContext(input.conversation, input.graph);
  const source = sourceForConversation(input.conversation, input.graph.generatedAt);

  return {
    conversationId: input.conversation.id,
    status: statusFor(messages),
    title: contact
      ? `${contact.displayName} conversation`
      : "Live chat conversation",
    participantContactId:
      contact?.id ?? input.conversation.participantContactIds[0] ?? "",
    participantName: contact?.displayName ?? "Live chat contact",
    organization: contact?.organization ?? "",
    lastMessagePreview:
      latest?.body ?? "No messages recorded in this live conversation.",
    lastMessageAt: latest?.occurredAt ?? input.conversation.updatedAt,
    unreadCount: latest?.direction === "inbound" ? 1 : 0,
    oneToOneContext: context,
    source,
    evidenceIds: input.conversation.evidenceIds,
    ...executionFlags({
      readExecuted: true,
      writeExecuted: input.writeExecuted === true,
    }),
  };
}

function toChatMessage(input: {
  generatedBy?: ChatSourceReference["generatedBy"];
  graph: LiveChatConversationGraph;
  message: MessageDTO;
  writeExecuted?: boolean;
}): ChatMessage {
  const conversation = input.graph.conversations.find(
    (item) => item.id === input.message.conversationId,
  );
  const contact = conversation
    ? participantContact(conversation, input.graph.contacts)
    : null;
  const isInbound = input.message.direction === "inbound";

  return {
    messageId: input.message.id,
    conversationId: input.message.conversationId,
    senderRole: isInbound ? "contact" : "orbit_user",
    senderName: isInbound
      ? contact?.displayName ?? "Live chat contact"
      : "Orbit operator",
    body: input.message.body,
    createdAt: input.message.occurredAt,
    deliveryState: isInbound ? "mock_received" : "mock_recorded_locally",
    source: sourceForMessage({
      collectedAt: input.graph.generatedAt,
      generatedBy: input.generatedBy ?? "live-store-query",
      message: input.message,
    }),
    evidenceIds: input.message.evidenceIds,
    ...executionFlags({
      readExecuted: true,
      writeExecuted: input.writeExecuted === true,
    }),
  };
}

function provenanceFor(input: {
  collectedAt: string;
  conversations: readonly ConversationDTO[];
  generationMethod: ChatConversationMockProvenance["generationMethod"];
  messages: readonly MessageDTO[];
  provider: LiveChatConversationMessageProvider;
  readExecuted: boolean;
  sourceLabel: string;
  writeExecuted: boolean;
}): ChatConversationMockProvenance {
  const evidenceIds = [
    ...input.conversations.flatMap((conversation) => conversation.evidenceIds),
    ...input.messages.flatMap((message) => message.evidenceIds),
  ];

  return {
    source: input.provider.source,
    sourceLabel: input.sourceLabel,
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : ["evidence:chat-live-store-empty"],
    collectedAt: input.collectedAt,
    privacy: "live-chat-conversation-preview",
    generationMethod: input.generationMethod,
    ...executionFlags({
      readExecuted: input.readExecuted,
      writeExecuted: input.writeExecuted,
    }),
  };
}

function unconfiguredProvenance(): ChatConversationMockProvenance {
  return {
    source: "live-record-store:chat-conversation-message:unconfigured",
    sourceLabel: "Unconfigured chat conversation live store",
    evidenceIds: ["evidence:chat-live-store-unconfigured"],
    collectedAt: new Date(0).toISOString(),
    privacy: "live-chat-conversation-preview",
    generationMethod: "live-store-query",
    ...executionFlags({
      readExecuted: false,
      writeExecuted: false,
    }),
  };
}

function unconfiguredFailure(): ChatConversationMockFailure {
  const definition =
    CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS
      .CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED;
  const provenance = unconfiguredProvenance();

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function failure(input: {
  code: ChatConversationMockErrorCode;
  graph: LiveChatConversationGraph;
  provider: LiveChatConversationMessageProvider;
  sourceLabel: string;
  writeExecuted?: boolean;
}): ChatConversationMockFailure {
  const definition = CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS[input.code];
  const provenance = provenanceFor({
    collectedAt: input.graph.generatedAt,
    conversations: [],
    generationMethod: "live-store-query",
    messages: [],
    provider: input.provider,
    readExecuted: true,
    sourceLabel: input.sourceLabel,
    writeExecuted: input.writeExecuted === true,
  });

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function listPayload(input: {
  graph: LiveChatConversationGraph;
  provider: LiveChatConversationMessageProvider;
}): ChatConversationListPayload {
  const conversations = conversationsForList(input.graph.conversations).map(
    (conversation) =>
      toConversationSummary({
        conversation,
        graph: input.graph,
      }),
  );

  return {
    state: conversations.length > 0 ? "success" : "empty",
    conversations,
    summary:
      conversations.length > 0
        ? `${conversations.length} conversations were loaded from live chat storage.`
        : "No conversations are available in live chat storage.",
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      conversations: input.graph.conversations,
      generationMethod: "live-store-query",
      messages: input.graph.messages,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: input.provider.sourceLabel,
      writeExecuted: false,
    }),
    nextAction:
      conversations.length > 0
        ? "Open a live-storage thread and review source evidence before delivery."
        : "Seed conversations into live storage before chat testing.",
  };
}

function threadPayload(input: {
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  provider: LiveChatConversationMessageProvider;
}): ChatMessageThreadPayload {
  const messages = messagesForConversation(
    input.conversation.id,
    input.graph.messages,
  );
  const chatMessages = messages.map((message) =>
    toChatMessage({ graph: input.graph, message }),
  );
  const conversationSummary = toConversationSummary({
    conversation: input.conversation,
    graph: input.graph,
  });

  return {
    state: chatMessages.length > 0 ? "success" : "empty",
    conversation: conversationSummary,
    messages: chatMessages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversationSummary.oneToOneContext,
    summary:
      chatMessages.length > 0
        ? "Live chat storage messages were loaded for this conversation."
        : "This live chat conversation has no messages yet.",
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      conversations: [input.conversation],
      generationMethod: "live-store-query",
      messages,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: input.provider.sourceLabel,
      writeExecuted: false,
    }),
    nextAction:
      "Review live source evidence before recording another storage-only reply.",
  };
}

function sendPayload(input: {
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  provider: LiveChatConversationMessageProvider;
  writtenMessageId: string;
}): ChatSendMessagePayload {
  const messages = messagesForConversation(
    input.conversation.id,
    input.graph.messages,
  );
  const latest = messages[messages.length - 1];
  const written =
    messages.find((message) => message.id === input.writtenMessageId) ?? latest;

  if (!written) {
    throw new Error("Live chat send payload requires a written message.");
  }

  const chatMessages = messages.map((message) =>
    toChatMessage({
      graph: input.graph,
      message,
      writeExecuted: message.id === input.writtenMessageId,
      generatedBy:
        message.id === input.writtenMessageId
          ? "live-store-send"
          : "live-store-query",
    }),
  );
  const conversationSummary = toConversationSummary({
    conversation: input.conversation,
    graph: input.graph,
    writeExecuted: true,
  });

  return {
    state: "success",
    conversationId: input.conversation.id,
    message: toChatMessage({
      generatedBy: "live-store-send",
      graph: input.graph,
      message: written,
      writeExecuted: true,
    }),
    messages: chatMessages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversationSummary.oneToOneContext,
    summary:
      "A chat message was recorded in live storage without external delivery.",
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      conversations: [input.conversation],
      generationMethod: "live-store-send",
      messages,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: input.provider.sourceLabel,
      writeExecuted: true,
    }),
    nextAction:
      "Keep transport delivery behind explicit provider replacement and confirmation.",
  };
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

function listScenarioResult(
  input: {
    graph: LiveChatConversationGraph;
    provider: LiveChatConversationMessageProvider;
  },
  scenario: ChatConversationMockScenario,
): ChatConversationListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess({
        ...listPayload(input),
        conversations: [],
        state: "empty",
        summary: "The live chat store returned no conversation rows.",
      });
    case "pending":
      return listSuccess({
        ...listPayload(input),
        conversations: [],
        state: "pending",
        summary: "The live chat store is waiting for seed review.",
      });
    case "failure":
      return failure({
        code: "CHAT_CONVERSATION_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat conversation controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

function threadScenarioResult(
  input: {
    conversation: ConversationDTO;
    graph: LiveChatConversationGraph;
    provider: LiveChatConversationMessageProvider;
  },
  scenario: ChatConversationMockScenario,
): ChatMessageThreadResult | null {
  switch (scenario) {
    case "empty":
      return threadSuccess({
        ...threadPayload(input),
        messages: [],
        state: "empty",
        summary: "The live chat store returned no message rows.",
      });
    case "pending":
      return threadSuccess({
        ...threadPayload(input),
        messages: [],
        state: "pending",
        summary: "The live chat thread is waiting for seed review.",
      });
    case "failure":
      return failure({
        code: "CHAT_CONVERSATION_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat conversation controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

function sendScenarioResult(
  input: {
    graph: LiveChatConversationGraph;
    provider: LiveChatConversationMessageProvider;
  },
  scenario: ChatConversationMockScenario,
): ChatSendMessageResult | null {
  switch (scenario) {
    case "empty":
      return failure({
        code: "CHAT_CONVERSATION_EMPTY",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat conversation empty send state",
      });
    case "pending":
      return failure({
        code: "CHAT_CONVERSATION_PENDING",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat conversation pending send state",
      });
    case "failure":
      return failure({
        code: "CHAT_CONVERSATION_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat conversation controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

function nextTimestampAfter(timestamp: string): string {
  const graphTime = Date.parse(timestamp);
  const now = Date.now();
  const next = Number.isFinite(graphTime) ? graphTime + 1000 : 0;

  return new Date(Math.max(now, next)).toISOString();
}

export function createLiveChatConversationMessageService({
  provider = null,
}: LiveChatConversationMessageServiceOptions = {}): ChatConversationMessageService {
  return {
    async listConversations(input: ChatConversationListInput = {}) {
      if (!provider) {
        return unconfiguredFailure();
      }

      const graph = await provider.readChatGraph();
      const scenario = listScenarioResult(
        { graph, provider },
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return listSuccess(listPayload({ graph, provider }));
    },

    async getMessageThread(input: ChatMessageThreadInput) {
      if (!provider) {
        return unconfiguredFailure();
      }

      const graph = await provider.readChatGraph();
      const conversationId = readText(input.conversationId);

      if (!conversationId) {
        return failure({
          code: "CHAT_CONVERSATION_ID_REQUIRED",
          graph,
          provider,
          sourceLabel: "Live chat conversation validation failure",
        });
      }

      const conversation = graph.conversations.find(
        (item) => item.id === conversationId,
      );

      if (!conversation) {
        return failure({
          code: "CHAT_CONVERSATION_NOT_FOUND",
          graph,
          provider,
          sourceLabel: "Live chat conversation not found",
        });
      }

      const scenario = threadScenarioResult(
        { conversation, graph, provider },
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return threadSuccess(threadPayload({ conversation, graph, provider }));
    },

    async sendMessage(input: ChatSendMessageInput) {
      if (!provider) {
        return unconfiguredFailure();
      }

      const graph = await provider.readChatGraph();
      const conversationId = readText(input.conversationId);
      const body = readText(input.body);

      if (!conversationId) {
        return failure({
          code: "CHAT_CONVERSATION_ID_REQUIRED",
          graph,
          provider,
          sourceLabel: "Live chat conversation validation failure",
        });
      }

      if (!body) {
        return failure({
          code: "CHAT_MESSAGE_BODY_REQUIRED",
          graph,
          provider,
          sourceLabel: "Live chat conversation validation failure",
        });
      }

      const scenario = sendScenarioResult(
        { graph, provider },
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      const conversation = graph.conversations.find(
        (item) => item.id === conversationId,
      );

      if (!conversation) {
        return failure({
          code: "CHAT_CONVERSATION_NOT_FOUND",
          graph,
          provider,
          sourceLabel: "Live chat conversation not found",
        });
      }

      const nextGraph = await provider.appendMessage({
        body,
        conversationId,
        evidenceIds: conversation.evidenceIds,
        sentAt: nextTimestampAfter(graph.generatedAt),
      });
      const nextConversation =
        nextGraph.conversations.find((item) => item.id === conversationId) ??
        conversation;
      const written = messagesForConversation(conversationId, nextGraph.messages)
        .filter((message) => message.body === body)
        .at(-1);

      if (!written) {
        return failure({
          code: "CHAT_CONVERSATION_EMPTY",
          graph: nextGraph,
          provider,
          sourceLabel: "Live chat conversation write verification failure",
          writeExecuted: true,
        });
      }

      return sendSuccess(
        sendPayload({
          conversation: nextConversation,
          graph: nextGraph,
          provider,
          writtenMessageId: written.id,
        }),
      );
    },
  };
}
