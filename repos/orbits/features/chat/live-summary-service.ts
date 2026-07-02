import {
  CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS,
  type ChatSummaryExtractionErrorCode,
  type ChatSummaryExtractionFailure,
  type ChatSummaryExtractionInput,
  type ChatSummaryExtractionPayload,
  type ChatSummaryExtractionProvenance,
  type ChatSummaryExtractionResult,
  type ChatSummaryExtractionScenario,
  type ChatSummaryExtractionService,
  type ChatSummaryRecord,
  type ChatSummarySourceReference,
  type ConfirmationRequiredProfileSuggestion,
  type ExtractedNeed,
  type ExtractedTask,
  type RelationshipProfileUpdate,
} from "./summary-contract";
import type {
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../shared/domain/contracts";
import type { LiveChatConversationGraph } from "./live-service";

type LiveChatSummaryProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveChatSummaryExtractionProvider {
  source: string;
  sourceLabel: string;
  readChatGraph: () => LiveChatSummaryProviderResult<LiveChatConversationGraph>;
}

export interface LiveChatSummaryExtractionServiceOptions {
  provider?: LiveChatSummaryExtractionProvider | null;
}

const supportedScenarios = new Set<ChatSummaryExtractionScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeScenario(
  scenario?: ChatSummaryExtractionInput["scenario"],
): ChatSummaryExtractionScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatSummaryExtractionScenario)
  ) {
    return scenario as ChatSummaryExtractionScenario;
  }

  return "success";
}

function readConversationId(
  input: ChatSummaryExtractionInput,
): string | null {
  return typeof input.conversationId === "string" && input.conversationId.trim()
    ? input.conversationId.trim()
    : null;
}

function executionFlags(input: { readExecuted: boolean; writeExecuted: boolean }) {
  return {
    aiProviderRequested: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: input.readExecuted,
    liveDatabaseWriteExecuted: input.writeExecuted,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    automaticProfileMutationExecuted: false,
  } as const;
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

function evidenceIdsFor(input: {
  conversation: ConversationDTO;
  messages: readonly MessageDTO[];
}): readonly string[] {
  return [
    ...new Set([
      ...input.conversation.evidenceIds,
      ...input.messages.flatMap((message) => message.evidenceIds),
    ]),
  ];
}

function sourceForConversation(input: {
  collectedAt: string;
  conversation: ConversationDTO;
}): ChatSummarySourceReference {
  const type =
    input.conversation.source.type === "manual" ||
    input.conversation.source.type === "chat_summary" ||
    input.conversation.source.type === "system"
      ? input.conversation.source.type
      : "chat_summary";

  return {
    type,
    id: input.conversation.source.id,
    label: input.conversation.source.label ?? "Live chat summary source",
    providerRecordId: input.conversation.source.id,
    collectedAt: input.collectedAt,
    generatedBy: "live-store-query",
  };
}

function provenanceFor(input: {
  collectedAt: string;
  conversation: ConversationDTO;
  generationMethod: ChatSummaryExtractionProvenance["generationMethod"];
  messages: readonly MessageDTO[];
  provider: LiveChatSummaryExtractionProvider;
}): ChatSummaryExtractionProvenance {
  const evidenceIds = evidenceIdsFor({
    conversation: input.conversation,
    messages: input.messages,
  });

  return {
    source: input.provider.source,
    sourceLabel: input.provider.sourceLabel,
    evidenceIds:
      evidenceIds.length > 0
        ? evidenceIds
        : ["evidence:chat-summary-live-store-empty"],
    collectedAt: input.collectedAt,
    privacy: "live-chat-summary-extraction-preview",
    generationMethod: input.generationMethod,
    ...executionFlags({
      readExecuted: true,
      writeExecuted: false,
    }),
  };
}

function unconfiguredProvenance(): ChatSummaryExtractionProvenance {
  return {
    source: "live-record-store:chat-summary-extraction:unconfigured",
    sourceLabel: "Unconfigured chat summary extraction live store",
    evidenceIds: ["evidence:chat-summary-live-store-unconfigured"],
    collectedAt: new Date(0).toISOString(),
    privacy: "live-chat-summary-extraction-preview",
    generationMethod: "live-store-summary",
    ...executionFlags({
      readExecuted: false,
      writeExecuted: false,
    }),
  };
}

function success(
  data: ChatSummaryExtractionPayload,
): ChatSummaryExtractionResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function unconfiguredFailure(): ChatSummaryExtractionFailure {
  const definition =
    CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS
      .CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED;
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
  code: ChatSummaryExtractionErrorCode;
  graph: LiveChatConversationGraph;
  provider: LiveChatSummaryExtractionProvider;
  sourceLabel: string;
}): ChatSummaryExtractionFailure {
  const definition = CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS[input.code];
  const provenance: ChatSummaryExtractionProvenance = {
    source: input.provider.source,
    sourceLabel: input.sourceLabel,
    evidenceIds: ["evidence:chat-summary-live-store-failure"],
    collectedAt: input.graph.generatedAt,
    privacy: "live-chat-summary-extraction-preview",
    generationMethod: "live-store-summary",
    ...executionFlags({
      readExecuted: true,
      writeExecuted: false,
    }),
  };

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

function emptyPayload(input: {
  conversation: ConversationDTO;
  contact: ContactDTO | null;
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatSummaryExtractionProvider;
  state: "empty" | "pending";
}): ChatSummaryExtractionPayload {
  return {
    state: input.state,
    conversationId: input.conversation.id,
    participantName: input.contact?.displayName ?? "Live chat contact",
    organization: input.contact?.organization ?? "",
    summary: null,
    extractedNeeds: [],
    extractedTasks: [],
    relationshipProfileUpdates: [],
    confirmationRequiredProfileSuggestions: [],
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      conversation: input.conversation,
      generationMethod: "live-store-summary",
      messages: input.messages,
      provider: input.provider,
    }),
    nextAction:
      input.state === "empty"
        ? "Add source-backed live chat messages before generating a summary."
        : "Resolve the live chat extraction review guard before rendering signals.",
  };
}

function buildExtraction(input: {
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  generationMethod: "live-store-summary" | "live-store-extraction";
  messages: readonly MessageDTO[];
  provider: LiveChatSummaryExtractionProvider;
}): ChatSummaryExtractionPayload {
  const contactId = input.contact?.id ?? input.conversation.participantContactIds[0] ?? "";
  const connectionId =
    input.connection?.id ?? `connection_for_${contactId || input.conversation.id}`;
  const participantName = input.contact?.displayName ?? "Live chat contact";
  const organization = input.contact?.organization ?? "";
  const first = input.messages[0];
  const latest = input.messages[input.messages.length - 1] ?? first;
  const source = sourceForConversation({
    collectedAt: input.graph.generatedAt,
    conversation: input.conversation,
  });
  const evidenceIds = evidenceIdsFor({
    conversation: input.conversation,
    messages: input.messages,
  });
  const latestBody = latest?.body ?? "No live message body is available.";
  const firstBody = first?.body ?? latestBody;
  const summaryId = `summary:live:${input.conversation.id}`;
  const needId = `need:live:${input.conversation.id}:follow-up`;
  const taskId = `task:live:${input.conversation.id}:review-follow-up`;
  const updateId = `profile-update:live:${input.conversation.id}:latest-context`;
  const suggestionId = `profile-suggestion:live:${input.conversation.id}:priority-topic`;

  const summary: ChatSummaryRecord = {
    summaryId,
    conversationId: input.conversation.id,
    participantName,
    organization,
    narrative:
      `${participantName} has ${input.messages.length} source-backed messages in live chat storage. ` +
      `The earliest signal says: ${firstBody} Latest follow-up context says: ${latestBody}`,
    source,
    evidenceIds,
    extractedNeedIds: [needId],
    extractedTaskIds: [taskId],
    relationshipProfileUpdateIds: [updateId],
    confirmationRequiredSuggestionIds: [suggestionId],
    generatedBy: "live-store-query",
    generationMethod: input.generationMethod,
    ...executionFlags({
      readExecuted: true,
      writeExecuted: false,
    }),
  };

  const extractedNeeds: readonly ExtractedNeed[] = [
    {
      needId,
      conversationId: input.conversation.id,
      contactId,
      statement:
        `${participantName} needs a source-evidence review before the next follow-up: ${latestBody}`,
      priority: input.messages.length >= 5 ? "high" : "medium",
      source,
      evidenceIds,
      generatedBy: "live-store-query",
      aiProviderRequested: false,
      externalNetworkRequested: false,
    },
  ];

  const extractedTasks: readonly ExtractedTask[] = [
    {
      taskId,
      conversationId: input.conversation.id,
      title: `Review live chat follow-up for ${participantName}`,
      dueHint: "After reviewing the latest source-backed live chat message",
      rationale:
        input.connection?.summary ??
        "The live chat thread has source-backed follow-up context.",
      source,
      evidenceIds,
      generatedBy: "live-store-query",
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

  const relationshipProfileUpdates: readonly RelationshipProfileUpdate[] = [
    {
      updateId,
      connectionId,
      field: "latestContext",
      proposedValue:
        input.connection?.summary ??
        `${participantName} has live chat follow-up context from ${input.messages.length} messages.`,
      reason:
        "Live chat summary extraction is review-only and must not mutate the relationship profile automatically.",
      source,
      evidenceIds,
      autoApplied: false,
      automaticProfileMutationExecuted: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

  const confirmationRequiredProfileSuggestions: readonly ConfirmationRequiredProfileSuggestion[] =
    [
      {
        suggestionId,
        connectionId,
        field: "priorityTopic",
        proposedValue: latestBody,
        reason:
          "Updating a relationship profile from live chat extraction requires operator confirmation.",
        guard: "profile confirmation guard",
        source,
        evidenceIds,
        confirmationRequired: true,
        autoApplied: false,
        automaticProfileMutationExecuted: false,
        liveDatabaseWriteExecuted: false,
      },
    ];

  return {
    state: "success",
    conversationId: input.conversation.id,
    participantName,
    organization,
    summary,
    extractedNeeds,
    extractedTasks,
    relationshipProfileUpdates,
    confirmationRequiredProfileSuggestions,
    provenance: provenanceFor({
      collectedAt: input.graph.generatedAt,
      conversation: input.conversation,
      generationMethod: input.generationMethod,
      messages: input.messages,
      provider: input.provider,
    }),
    nextAction:
      "Review extracted live chat needs, tasks, and profile suggestions before confirming any write.",
  };
}

function scenarioResult(input: {
  conversation: ConversationDTO;
  contact: ContactDTO | null;
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatSummaryExtractionProvider;
  scenario: ChatSummaryExtractionScenario;
}): ChatSummaryExtractionResult | null {
  switch (input.scenario) {
    case "empty":
      return success(
        emptyPayload({
          conversation: input.conversation,
          contact: input.contact,
          graph: input.graph,
          messages: input.messages,
          provider: input.provider,
          state: "empty",
        }),
      );
    case "pending":
      return success(
        emptyPayload({
          conversation: input.conversation,
          contact: input.contact,
          graph: input.graph,
          messages: input.messages,
          provider: input.provider,
          state: "pending",
        }),
      );
    case "failure":
      return failure({
        code: "CHAT_SUMMARY_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        sourceLabel: "Live chat summary controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

async function runLiveExtraction(input: {
  generationMethod: "live-store-summary" | "live-store-extraction";
  provider: LiveChatSummaryExtractionProvider | null;
  request: ChatSummaryExtractionInput;
}): Promise<ChatSummaryExtractionResult> {
  if (!input.provider) {
    return unconfiguredFailure();
  }

  const graph = await input.provider.readChatGraph();
  const conversationId = readConversationId(input.request);

  if (!conversationId) {
    return failure({
      code: "CHAT_SUMMARY_CONVERSATION_ID_REQUIRED",
      graph,
      provider: input.provider,
      sourceLabel: "Live chat summary validation failure",
    });
  }

  const conversation = graph.conversations.find(
    (item) => item.id === conversationId,
  );

  if (!conversation) {
    return failure({
      code: "CHAT_SUMMARY_CONVERSATION_NOT_FOUND",
      graph,
      provider: input.provider,
      sourceLabel: "Live chat summary conversation not found",
    });
  }

  const messages = messagesForConversation(conversation.id, graph.messages);
  const contact = participantContact(conversation, graph.contacts);
  const scenario = scenarioResult({
    conversation,
    contact,
    graph,
    messages,
    provider: input.provider,
    scenario: normalizeScenario(input.request.scenario),
  });

  if (scenario) {
    return scenario;
  }

  if (messages.length === 0) {
    return success(
      emptyPayload({
        conversation,
        contact,
        graph,
        messages,
        provider: input.provider,
        state: "empty",
      }),
    );
  }

  return success(
    buildExtraction({
      connection: contact
        ? connectionForContact(contact.id, graph.connections)
        : null,
      contact,
      conversation,
      generationMethod: input.generationMethod,
      graph,
      messages,
      provider: input.provider,
    }),
  );
}

export function createLiveChatSummaryExtractionService({
  provider = null,
}: LiveChatSummaryExtractionServiceOptions = {}): ChatSummaryExtractionService {
  return {
    summarizeConversation(input: ChatSummaryExtractionInput) {
      return runLiveExtraction({
        generationMethod: "live-store-summary",
        provider,
        request: input,
      });
    },
    extractConversationSignals(input: ChatSummaryExtractionInput) {
      return runLiveExtraction({
        generationMethod: "live-store-extraction",
        provider,
        request: input,
      });
    },
  };
}
