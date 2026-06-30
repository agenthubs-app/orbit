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
} from "../contract";
import type {
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { MockRuntimeFixtures } from "../../../shared/mock/fixtures";
import type { ChatConversationMessageService } from "../service";

interface LocalRemoteChatGraph {
  connections: readonly ConnectionDTO[];
  contacts: readonly ContactDTO[];
  conversations: readonly ConversationDTO[];
  generatedAt: string;
  messages: readonly MessageDTO[];
  profileId: string;
}

interface ChatLocalRemoteRepository {
  readChatGraph: () => LocalRemoteChatGraph;
  appendMessage: (input: {
    body: string;
    conversationId: string;
  }) => LocalRemoteChatGraph;
}

interface HybridChatConversationMessageServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: ChatLocalRemoteRepository;
}

const supportedScenarios = new Set<ChatConversationMockScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const noExternalExecutionFlags = {
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

const readySendMessageState: ChatSendMessageState = {
  status: "ready",
  canSendInMock: true,
  reason:
    "The hybrid service can record a local message, but live delivery still requires a provider replacement.",
  confirmationRequiredBeforeLiveSend: true,
  realtimeTransportRequested: false,
  websocketSubscriptionRequested: false,
  productionMessageStorageRequested: false,
  externalSendRequested: false,
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function localRemoteSource(): string {
  return `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`;
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

function sourceForConversation(
  conversation: ConversationDTO,
  collectedAt: string,
): ChatSourceReference {
  const supportedTypes = new Set<ChatSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "referral",
    "chat_summary",
    "system",
  ]);
  const type = supportedTypes.has(
    conversation.source.type as ChatSourceReference["type"],
  )
    ? (conversation.source.type as ChatSourceReference["type"])
    : "system";

  return {
    type,
    id: conversation.source.id,
    label: conversation.source.label ?? "Hybrid local remote chat source",
    providerRecordId: conversation.source.id,
    collectedAt,
    generatedBy: "mock-chat-conversation-rules",
  };
}

function sourceForMessage(
  message: MessageDTO,
  collectedAt: string,
): ChatSourceReference {
  const supportedTypes = new Set<ChatSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "referral",
    "chat_summary",
    "system",
  ]);
  const type = supportedTypes.has(message.source.type as ChatSourceReference["type"])
    ? (message.source.type as ChatSourceReference["type"])
    : "system";

  return {
    type,
    id: message.source.id,
    label: message.source.label ?? "Hybrid local remote chat message source",
    providerRecordId: message.source.id,
    collectedAt,
    generatedBy: "mock-chat-conversation-rules",
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
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
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
  graph: LocalRemoteChatGraph,
) {
  const contact = participantContact(conversation, graph.contacts);
  const connection = contact
    ? connectionForContact(contact.id, graph.connections)
    : null;
  const source = sourceForConversation(conversation, graph.generatedAt);

  return {
    contactId: contact?.id ?? conversation.participantContactIds[0] ?? "",
    participantName: contact?.displayName ?? "Hybrid local remote contact",
    organization: contact?.organization ?? "",
    relationshipStage: contact?.stage ?? "active",
    relationshipReason:
      connection?.summary ??
      "Hybrid local remote conversation has source-backed relationship context.",
    latestContext:
      connection?.summary ??
      "Review the local remote database messages before follow-up.",
    recommendedFollowup:
      "Review source evidence before recording another local message.",
    source,
    evidenceIds: conversation.evidenceIds,
  };
}

function toConversationSummary(
  conversation: ConversationDTO,
  graph: LocalRemoteChatGraph,
): ChatConversationSummary {
  const contact = participantContact(conversation, graph.contacts);
  const messages = messagesForConversation(conversation.id, graph.messages);
  const latest = messages[messages.length - 1];
  const context = oneToOneContext(conversation, graph);
  const source = sourceForConversation(conversation, graph.generatedAt);

  return {
    conversationId: conversation.id,
    status: statusFor(messages),
    title: contact
      ? `${contact.displayName} conversation`
      : "Hybrid local remote conversation",
    participantContactId: contact?.id ?? conversation.participantContactIds[0] ?? "",
    participantName: contact?.displayName ?? "Hybrid local remote contact",
    organization: contact?.organization ?? "",
    lastMessagePreview:
      latest?.body ?? "No messages recorded in this local conversation.",
    lastMessageAt: latest?.occurredAt ?? conversation.updatedAt,
    unreadCount: latest?.direction === "inbound" ? 1 : 0,
    oneToOneContext: context,
    source,
    evidenceIds: conversation.evidenceIds,
    ...noExternalExecutionFlags,
  };
}

function toChatMessage(
  message: MessageDTO,
  graph: LocalRemoteChatGraph,
): ChatMessage {
  const conversation = graph.conversations.find(
    (item) => item.id === message.conversationId,
  );
  const contact = conversation
    ? participantContact(conversation, graph.contacts)
    : null;
  const isInbound = message.direction === "inbound";

  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderRole: isInbound ? "contact" : "orbit_user",
    senderName: isInbound
      ? contact?.displayName ?? "Hybrid local remote contact"
      : "Orbit operator",
    body: message.body,
    createdAt: message.occurredAt,
    deliveryState: isInbound ? "mock_received" : "mock_recorded_locally",
    source: sourceForMessage(message, graph.generatedAt),
    evidenceIds: message.evidenceIds,
    ...noExternalExecutionFlags,
  };
}

function provenanceFor(input: {
  collectedAt: string;
  conversations: readonly ConversationDTO[];
  messages: readonly MessageDTO[];
  sourceLabel: string;
}): ChatConversationMockProvenance {
  const evidenceIds = [
    ...input.conversations.flatMap((conversation) => conversation.evidenceIds),
    ...input.messages.flatMap((message) => message.evidenceIds),
  ];

  return {
    source: localRemoteSource(),
    sourceLabel: input.sourceLabel,
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : ["evidence:chat-local-remote-empty"],
    collectedAt: input.collectedAt,
    privacy: "demo-chat-conversation-only",
    generationMethod: "local-remote-store-query",
    ...noExternalExecutionFlags,
  };
}

function listPayload(graph: LocalRemoteChatGraph): ChatConversationListPayload {
  const conversations = graph.conversations.map((conversation) =>
    toConversationSummary(conversation, graph),
  );

  return {
    state: conversations.length > 0 ? "success" : "empty",
    conversations,
    summary:
      conversations.length > 0
        ? `${conversations.length} conversations were loaded from the hybrid local remote database.`
        : "No conversations are available in the hybrid local remote database.",
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      conversations: graph.conversations,
      messages: graph.messages,
      sourceLabel: "Hybrid local remote chat conversations",
    }),
    nextAction:
      conversations.length > 0
        ? "Open a local thread and review source evidence before live delivery."
        : "Add conversations to the local remote database before chat testing.",
  };
}

function threadPayload(
  graph: LocalRemoteChatGraph,
  conversation: ConversationDTO,
): ChatMessageThreadPayload {
  const messages = messagesForConversation(conversation.id, graph.messages);
  const chatMessages = messages.map((message) => toChatMessage(message, graph));
  const conversationSummary = toConversationSummary(conversation, graph);

  return {
    state: chatMessages.length > 0 ? "success" : "empty",
    conversation: conversationSummary,
    messages: chatMessages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversationSummary.oneToOneContext,
    summary:
      chatMessages.length > 0
        ? "Hybrid local remote messages were loaded for this conversation."
        : "This hybrid local remote conversation has no messages yet.",
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      conversations: [conversation],
      messages,
      sourceLabel: "Hybrid local remote chat thread",
    }),
    nextAction:
      "Review local message evidence before recording another local reply.",
  };
}

function sendPayload(
  graph: LocalRemoteChatGraph,
  conversation: ConversationDTO,
): ChatSendMessagePayload {
  const messages = messagesForConversation(conversation.id, graph.messages);
  const latest = messages[messages.length - 1];
  const chatMessages = messages.map((message) => toChatMessage(message, graph));
  const conversationSummary = toConversationSummary(conversation, graph);

  return {
    state: "success",
    conversationId: conversation.id,
    message: toChatMessage(latest, graph),
    messages: chatMessages,
    sendMessageState: readySendMessageState,
    oneToOneContext: conversationSummary.oneToOneContext,
    summary:
      "A local chat message was recorded in the hybrid local remote database.",
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      conversations: [conversation],
      messages,
      sourceLabel: "Hybrid local remote chat send",
    }),
    nextAction:
      "Keep live delivery behind explicit provider replacement and confirmation.",
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

function failure(
  code: ChatConversationMockErrorCode,
  graph: LocalRemoteChatGraph,
): ChatConversationMockFailure {
  const definition = CHAT_CONVERSATION_MOCK_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    collectedAt: graph.generatedAt,
    conversations: [],
    messages: [],
    sourceLabel: "Hybrid local remote chat failure",
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

function listScenarioResult(
  graph: LocalRemoteChatGraph,
  scenario: ChatConversationMockScenario,
): ChatConversationListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess({
        ...listPayload(graph),
        conversations: [],
        state: "empty",
        summary: "The hybrid local remote chat database returned no rows.",
      });
    case "pending":
      return listSuccess({
        ...listPayload(graph),
        conversations: [],
        state: "pending",
        summary:
          "The hybrid local remote chat database is waiting for seed review.",
      });
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function threadScenarioResult(
  graph: LocalRemoteChatGraph,
  conversation: ConversationDTO,
  scenario: ChatConversationMockScenario,
): ChatMessageThreadResult | null {
  switch (scenario) {
    case "empty":
      return threadSuccess({
        ...threadPayload(graph, conversation),
        messages: [],
        state: "empty",
        summary: "The hybrid local remote chat thread returned no messages.",
      });
    case "pending":
      return threadSuccess({
        ...threadPayload(graph, conversation),
        messages: [],
        state: "pending",
        summary:
          "The hybrid local remote chat thread is waiting for seed review.",
      });
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function sendScenarioResult(
  graph: LocalRemoteChatGraph,
  scenario: ChatConversationMockScenario,
): ChatSendMessageResult | null {
  switch (scenario) {
    case "empty":
      return failure("CHAT_CONVERSATION_EMPTY", graph);
    case "pending":
      return failure("CHAT_CONVERSATION_PENDING", graph);
    case "failure":
      return failure("CHAT_CONVERSATION_MOCK_FAILED", graph);
    case "success":
    default:
      return null;
  }
}

function createChatLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): ChatLocalRemoteRepository {
  function graphFromState(state: MockRuntimeFixtures): LocalRemoteChatGraph {
    return {
      connections: state.connections,
      contacts: state.contacts,
      conversations: state.conversations,
      generatedAt: state.generatedAt,
      messages: state.messages,
      profileId: state.profiles[0]?.id ?? "hybrid-chat-conversation-service",
    };
  }

  return {
    readChatGraph() {
      return graphFromState(database.getState());
    },
    appendMessage(input) {
      return graphFromState(
        database.updateState((draft) => {
          const conversation = draft.conversations.find(
            (item) => item.id === input.conversationId,
          );
          const evidenceIds = conversation?.evidenceIds ?? [
            "evidence:chat-local-remote-send",
          ];
          const messageId = `message:hybrid:${input.conversationId}:${draft.messages.length + 1}`;

          draft.messages = [
            ...draft.messages,
            {
              id: messageId,
              conversationId: input.conversationId,
              direction: "outbound",
              body: input.body,
              occurredAt: draft.generatedAt,
              createdBy:
                draft.profiles[0]?.id ?? "hybrid-chat-conversation-service",
              source: {
                type: "system",
                id: `source:chat:hybrid-send:${messageId}`,
                label: "Hybrid local remote chat send",
              },
              evidenceIds,
            },
          ];
          draft.conversations = draft.conversations.map((item) =>
            item.id === input.conversationId
              ? {
                  ...item,
                  updatedAt: draft.generatedAt,
                }
              : item,
          );
        }),
      );
    },
  };
}

export function createHybridChatConversationMessageService(
  options: HybridChatConversationMessageServiceOptions = {},
): ChatConversationMessageService {
  const repository =
    options.repository ?? createChatLocalRemoteRepository(options.database);

  return {
    listConversations(input: ChatConversationListInput = {}) {
      const graph = repository.readChatGraph();
      const scenario = listScenarioResult(graph, normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return listSuccess(listPayload(graph));
    },

    getMessageThread(input: ChatMessageThreadInput) {
      const graph = repository.readChatGraph();
      const conversationId = readText(input.conversationId);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED", graph);
      }

      const conversation = graph.conversations.find(
        (item) => item.id === conversationId,
      );

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND", graph);
      }

      const scenario = threadScenarioResult(
        graph,
        conversation,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return threadSuccess(threadPayload(graph, conversation));
    },

    sendMessage(input: ChatSendMessageInput) {
      const graph = repository.readChatGraph();
      const conversationId = readText(input.conversationId);
      const body = readText(input.body);

      if (!conversationId) {
        return failure("CHAT_CONVERSATION_ID_REQUIRED", graph);
      }

      if (!body) {
        return failure("CHAT_MESSAGE_BODY_REQUIRED", graph);
      }

      const scenario = sendScenarioResult(graph, normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const conversation = graph.conversations.find(
        (item) => item.id === conversationId,
      );

      if (!conversation) {
        return failure("CHAT_CONVERSATION_NOT_FOUND", graph);
      }

      const nextGraph = repository.appendMessage({
        body,
        conversationId,
      });
      const nextConversation =
        nextGraph.conversations.find((item) => item.id === conversationId) ??
        conversation;

      return sendSuccess(sendPayload(nextGraph, nextConversation));
    },
  };
}
