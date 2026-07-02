import {
  CHAT_WRITING_ASSIST_ERROR_DEFINITIONS,
  type ChatWritingAssistErrorCode,
  type ChatWritingAssistFailure,
  type ChatWritingAssistInput,
  type ChatWritingAssistKind,
  type ChatWritingAssistPayload,
  type ChatWritingAssistProvenance,
  type ChatWritingAssistResult,
  type ChatWritingAssistScenario,
  type ChatWritingAssistService,
  type ChatWritingAssistSuggestion,
  type ChatWritingAssistSourceReference,
} from "./assist-contract";
import type {
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../shared/domain/contracts";
import type { LiveChatConversationGraph } from "./live-service";

type LiveChatWritingAssistProviderResult<TResult> = TResult | Promise<TResult>;

export interface LiveChatWritingAssistProvider {
  source: string;
  sourceLabel: string;
  readChatGraph: () => LiveChatWritingAssistProviderResult<LiveChatConversationGraph>;
}

export interface LiveChatWritingAssistServiceOptions {
  provider?: LiveChatWritingAssistProvider | null;
}

const supportedScenarios = new Set<ChatWritingAssistScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: ChatWritingAssistPayload): ChatWritingAssistResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function normalizeScenario(
  scenario?: ChatWritingAssistInput["scenario"],
): ChatWritingAssistScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatWritingAssistScenario)
  ) {
    return scenario as ChatWritingAssistScenario;
  }

  return "success";
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasSourceContext(input: ChatWritingAssistInput): boolean {
  return Boolean(
    readText(input.conversationId) ||
      readText(input.sourceText) ||
      readText(input.contextNote) ||
      readText(input.preferredWindow),
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

function conversationsForSelection(
  conversations: readonly ConversationDTO[],
): readonly ConversationDTO[] {
  return [...conversations].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.id.localeCompare(right.id),
  );
}

function selectedConversation(input: {
  graph: LiveChatConversationGraph;
  request: ChatWritingAssistInput;
}): ConversationDTO | null {
  const requestedId = readText(input.request.conversationId);

  if (requestedId) {
    return (
      input.graph.conversations.find(
        (conversation) => conversation.id === requestedId,
      ) ?? null
    );
  }

  return conversationsForSelection(input.graph.conversations)[0] ?? null;
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

function executionFlags(input: { readExecuted: boolean }) {
  return {
    aiProviderRequested: false,
    externalSendRequested: false,
    externalNetworkRequested: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
    liveDatabaseReadExecuted: input.readExecuted,
    liveDatabaseWriteExecuted: false,
    productionMessageStorageRequested: false,
    productionAuditLogWriteExecuted: false,
  } as const;
}

function sourceForConversation(input: {
  collectedAt: string;
  conversation: ConversationDTO;
}): ChatWritingAssistSourceReference {
  const supportedTypes = new Set<ChatWritingAssistSourceReference["type"]>([
    "manual",
    "event_import",
    "email_signal",
    "calendar_signal",
    "chat_summary",
    "system",
  ]);
  const type = supportedTypes.has(
    input.conversation.source.type as ChatWritingAssistSourceReference["type"],
  )
    ? (input.conversation.source.type as ChatWritingAssistSourceReference["type"])
    : "system";

  return {
    type,
    id: input.conversation.source.id,
    label: input.conversation.source.label ?? "Live chat writing assist source",
    providerRecordId: input.conversation.source.id,
    collectedAt: input.collectedAt,
    generatedBy: "live-store-query",
  };
}

function provenanceFor(input: {
  conversation: ConversationDTO;
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatWritingAssistProvider;
}): ChatWritingAssistProvenance {
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
        : ["evidence:chat-writing-assist-live-store-empty"],
    collectedAt: input.graph.generatedAt,
    privacy: "live-chat-writing-assist-preview",
    generationMethod: input.generationMethod,
    ...executionFlags({ readExecuted: true }),
  };
}

function failureProvenance(input: {
  graph?: LiveChatConversationGraph;
  provider?: LiveChatWritingAssistProvider | null;
  readExecuted: boolean;
  sourceLabel: string;
}): ChatWritingAssistProvenance {
  return {
    source:
      input.provider?.source ?? "live-record-store:chat-writing-assist:unconfigured",
    sourceLabel: input.sourceLabel,
    evidenceIds: [
      input.readExecuted
        ? "evidence:chat-writing-assist-live-store-failure"
        : "evidence:chat-writing-assist-live-store-unconfigured",
    ],
    collectedAt: input.graph?.generatedAt ?? new Date(0).toISOString(),
    privacy: "live-chat-writing-assist-preview",
    generationMethod: "rule-based-state",
    ...executionFlags({ readExecuted: input.readExecuted }),
  };
}

function failure(input: {
  code: ChatWritingAssistErrorCode;
  graph?: LiveChatConversationGraph;
  provider?: LiveChatWritingAssistProvider | null;
  readExecuted: boolean;
  sourceLabel: string;
}): ChatWritingAssistFailure {
  const definition = CHAT_WRITING_ASSIST_ERROR_DEFINITIONS[input.code];
  const provenance = failureProvenance({
    graph: input.graph,
    provider: input.provider,
    readExecuted: input.readExecuted,
    sourceLabel: input.sourceLabel,
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

function topicFromContext(input: {
  connection: ConnectionDTO | null;
  messages: readonly MessageDTO[];
}): string {
  const summary = input.connection?.summary;
  const throughMatch = summary?.match(/\bthrough\s+(.+?)(?:\.|$)/i);

  if (throughMatch?.[1]?.trim()) {
    return throughMatch[1].trim();
  }

  if (summary?.trim()) {
    return summary.trim();
  }

  const latestMessage = input.messages.at(-1);

  return latestMessage?.body ?? "the source-backed relationship context";
}

function generationMethodFor(
  kind: ChatWritingAssistKind,
): ChatWritingAssistProvenance["generationMethod"] {
  switch (kind) {
    case "polite_rewrite":
      return "rule-based-politeness-rewrite";
    case "follow_up_draft":
      return "rule-based-follow-up-draft";
    case "appointment_suggestion":
      return "rule-based-appointment-suggestion";
    case "quick_greeting":
      return "rule-based-quick-greeting";
  }
}

function labelFor(kind: ChatWritingAssistKind): string {
  switch (kind) {
    case "polite_rewrite":
      return "Polite rewrite";
    case "follow_up_draft":
      return "Follow-up draft";
    case "appointment_suggestion":
      return "Appointment suggestion";
    case "quick_greeting":
      return "Quick greeting";
  }
}

function originalTextFor(input: {
  connection: ConnectionDTO | null;
  kind: ChatWritingAssistKind;
  messages: readonly MessageDTO[];
  request: ChatWritingAssistInput;
  topic: string;
}): string {
  switch (input.kind) {
    case "polite_rewrite":
      return (
        readText(input.request.sourceText) ??
        input.messages.at(-1)?.body ??
        input.connection?.summary ??
        input.topic
      );
    case "follow_up_draft":
      return (
        readText(input.request.contextNote) ??
        input.connection?.summary ??
        input.messages.at(-1)?.body ??
        input.topic
      );
    case "appointment_suggestion":
      return (
        readText(input.request.contextNote) ??
        input.connection?.summary ??
        input.topic
      );
    case "quick_greeting":
      return (
        readText(input.request.contextNote) ??
        input.connection?.summary ??
        "Start a warm chat greeting."
      );
  }
}

function suggestedTextFor(input: {
  kind: ChatWritingAssistKind;
  organization: string;
  participantName: string;
  preferredWindow: string;
  topic: string;
}): string {
  switch (input.kind) {
    case "polite_rewrite":
      return `Hi ${input.participantName}, thanks for the context. I will follow up with the ${input.topic} notes for ${input.organization} and keep the next step concrete.`;
    case "follow_up_draft":
      return `Hi ${input.participantName}, following up on ${input.topic}: I reviewed the latest chat context for ${input.organization}. Would it help if I send a concise next-step note for the PoC review?`;
    case "appointment_suggestion":
      return `Would ${input.preferredWindow} work for a 20-minute review of ${input.topic} with ${input.organization}?`;
    case "quick_greeting":
      return `Hi ${input.participantName}, good to reconnect after our discussion about ${input.topic} with ${input.organization}.`;
  }
}

function buildAssist(input: {
  connection: ConnectionDTO | null;
  contact: ContactDTO | null;
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  kind: ChatWritingAssistKind;
  messages: readonly MessageDTO[];
  request: ChatWritingAssistInput;
}): ChatWritingAssistSuggestion {
  const source = sourceForConversation({
    collectedAt: input.graph.generatedAt,
    conversation: input.conversation,
  });
  const participantName =
    readText(input.request.participantName) ??
    input.contact?.displayName ??
    "Live chat contact";
  const organization =
    readText(input.request.organization) ??
    input.contact?.organization ??
    "their organization";
  const topic = topicFromContext({
    connection: input.connection,
    messages: input.messages,
  });
  const preferredWindow =
    readText(input.request.preferredWindow) ?? "Tuesday afternoon";
  const evidenceIds = evidenceIdsFor({
    conversation: input.conversation,
    messages: input.messages,
  });

  return {
    assistId: `live-chat-assist-${input.kind.replaceAll("_", "-")}-${
      input.conversation.id
    }`,
    kind: input.kind,
    label: labelFor(input.kind),
    conversationId: input.conversation.id,
    participantName,
    organization,
    originalText: originalTextFor({
      connection: input.connection,
      kind: input.kind,
      messages: input.messages,
      request: input.request,
      topic,
    }),
    suggestedText: suggestedTextFor({
      kind: input.kind,
      organization,
      participantName,
      preferredWindow,
      topic,
    }),
    rationale:
      "Uses live chat messages and relationship context to prepare a reviewable draft without sending it.",
    source,
    evidenceIds:
      evidenceIds.length > 0
        ? evidenceIds
        : ["evidence:chat-writing-assist-live-store-empty"],
    generatedBy: "live-store-query",
    audit: {
      sourceLabel: source.label,
      providerBoundary: "AI false, external send false, persistence false",
      verificationAction: `Review ${source.label}`,
    },
    sendActionRequiresConfirmation: true,
    ...executionFlags({ readExecuted: true }),
  };
}

function emptyPayload(input: {
  conversation: ConversationDTO;
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatWritingAssistProvider;
  state: "empty" | "pending";
}): ChatWritingAssistPayload {
  return {
    state: input.state,
    assists: [],
    summary:
      input.state === "empty"
        ? "No live chat writing assists are available because no source-backed chat context is present."
        : "Live chat writing assistance is waiting on a local writing guard.",
    provenance: provenanceFor({
      conversation: input.conversation,
      generationMethod: input.generationMethod,
      graph: input.graph,
      messages: input.messages,
      provider: input.provider,
    }),
    nextAction:
      input.state === "empty"
        ? "Add relationship context, chat evidence, or source notes before generating chat writing assistance."
        : "Resolve the local writing guard before showing assist suggestions.",
  };
}

function buildPayload(input: {
  assist: ChatWritingAssistSuggestion;
  conversation: ConversationDTO;
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatWritingAssistProvider;
}): ChatWritingAssistPayload {
  return {
    state: "success",
    assists: [input.assist],
    summary:
      "Live storage rules prepared one chat writing assist from source-backed chat context.",
    provenance: provenanceFor({
      conversation: input.conversation,
      generationMethod: input.generationMethod,
      graph: input.graph,
      messages: input.messages,
      provider: input.provider,
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

function scenarioResult(input: {
  conversation: ConversationDTO;
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatWritingAssistProvider;
  scenario: ChatWritingAssistScenario;
}): ChatWritingAssistResult | null {
  switch (input.scenario) {
    case "empty":
      return success(
        emptyPayload({
          conversation: input.conversation,
          generationMethod: input.generationMethod,
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
          generationMethod: input.generationMethod,
          graph: input.graph,
          messages: input.messages,
          provider: input.provider,
          state: "pending",
        }),
      );
    case "failure":
      return failure({
        code: "CHAT_WRITING_ASSIST_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        readExecuted: true,
        sourceLabel: "Live chat writing assist controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

async function runLiveAssist(input: {
  kind: ChatWritingAssistKind;
  provider: LiveChatWritingAssistProvider | null;
  request: ChatWritingAssistInput;
}): Promise<ChatWritingAssistResult> {
  if (!input.provider) {
    return failure({
      code: "CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED",
      provider: null,
      readExecuted: false,
      sourceLabel: "Unconfigured chat writing assist live store",
    });
  }

  const graph = await input.provider.readChatGraph();

  if (!hasSourceContext(input.request)) {
    return failure({
      code: "CHAT_WRITING_ASSIST_INPUT_REQUIRED",
      graph,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: "Live chat writing assist validation failure",
    });
  }

  const conversation = selectedConversation({
    graph,
    request: input.request,
  });

  if (!conversation) {
    return failure({
      code: "CHAT_WRITING_ASSIST_EMPTY",
      graph,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: "Live chat writing assist conversation not found",
    });
  }

  const messages = messagesForConversation(conversation.id, graph.messages);
  const generationMethod = generationMethodFor(input.kind);
  const scenario = scenarioResult({
    conversation,
    generationMethod,
    graph,
    messages,
    provider: input.provider,
    scenario: normalizeScenario(input.request.scenario),
  });

  if (scenario) {
    return scenario;
  }

  const contact = participantContact(conversation, graph.contacts);
  const connection = contact
    ? connectionForContact(contact.id, graph.connections)
    : null;

  return success(
    buildPayload({
      assist: buildAssist({
        connection,
        contact,
        conversation,
        graph,
        kind: input.kind,
        messages,
        request: input.request,
      }),
      conversation,
      generationMethod,
      graph,
      messages,
      provider: input.provider,
    }),
  );
}

export function createLiveChatWritingAssistService({
  provider = null,
}: LiveChatWritingAssistServiceOptions = {}): ChatWritingAssistService {
  return {
    rewritePolitely(input: ChatWritingAssistInput = {}) {
      return runLiveAssist({
        kind: "polite_rewrite",
        provider,
        request: input,
      });
    },
    draftFollowup(input: ChatWritingAssistInput = {}) {
      return runLiveAssist({
        kind: "follow_up_draft",
        provider,
        request: input,
      });
    },
    suggestAppointment(input: ChatWritingAssistInput = {}) {
      return runLiveAssist({
        kind: "appointment_suggestion",
        provider,
        request: input,
      });
    },
    createQuickGreeting(input: ChatWritingAssistInput = {}) {
      return runLiveAssist({
        kind: "quick_greeting",
        provider,
        request: input,
      });
    },
  };
}
