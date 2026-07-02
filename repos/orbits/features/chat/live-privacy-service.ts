import {
  CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS,
  type ChatAnalysisDeletionState,
  type ChatAnalysisOptInInput,
  type ChatAnalysisOptInState,
  type ChatPrivacyControlsErrorCode,
  type ChatPrivacyControlsFailure,
  type ChatPrivacyControlsInput,
  type ChatPrivacyControlsPayload,
  type ChatPrivacyControlsProvenance,
  type ChatPrivacyControlsResult,
  type ChatPrivacyControlsScenario,
  type ChatPrivacyControlsService,
  type ChatPrivacyControlsSourceReference,
  type ChatPrivateNote,
  type ChatSensitiveShareConfirmation,
  type ChatSensitiveShareInput,
} from "./privacy-contract";
import type {
  ContactDTO,
  ConversationDTO,
  MessageDTO,
} from "../../shared/domain/contracts";
import type { LiveChatConversationGraph } from "./live-service";

type LiveChatPrivacyControlsProviderResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface LiveChatPrivacyControlsProvider {
  source: string;
  sourceLabel: string;
  readChatGraph: () => LiveChatPrivacyControlsProviderResult<LiveChatConversationGraph>;
}

export interface LiveChatPrivacyControlsServiceOptions {
  provider?: LiveChatPrivacyControlsProvider | null;
}

const supportedScenarios = new Set<ChatPrivacyControlsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: ChatPrivacyControlsPayload): ChatPrivacyControlsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeScenario(
  scenario?: ChatPrivacyControlsInput["scenario"],
): ChatPrivacyControlsScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatPrivacyControlsScenario)
  ) {
    return scenario as ChatPrivacyControlsScenario;
  }

  return "success";
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
  request?: ChatPrivacyControlsInput;
}): ConversationDTO | null {
  if (
    input.request &&
    Object.prototype.hasOwnProperty.call(input.request, "conversationId")
  ) {
    const conversationId = readText(input.request.conversationId);

    if (!conversationId) {
      return null;
    }

    return (
      input.graph.conversations.find(
        (conversation) => conversation.id === conversationId,
      ) ?? null
    );
  }

  return conversationsForSelection(input.graph.conversations)[0] ?? null;
}

function requestedConversationIdWasBlank(
  request?: ChatPrivacyControlsInput,
): boolean {
  return Boolean(
    request &&
      Object.prototype.hasOwnProperty.call(request, "conversationId") &&
      !readText(request.conversationId),
  );
}

function participantContact(
  conversation: ConversationDTO,
  contacts: readonly ContactDTO[],
): ContactDTO | null {
  const contactId = conversation.participantContactIds[0];

  return contacts.find((contact) => contact.id === contactId) ?? null;
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
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: input.readExecuted,
    liveDatabaseWriteExecuted: false,
    productionDataDeletionExecuted: false,
    productionPrivacyAuditLogWritten: false,
    emailProviderRequested: false,
    calendarProviderRequested: false,
    notificationDelivered: false,
    deviceRequested: false,
  } as const;
}

function sourceForConversation(input: {
  collectedAt: string;
  conversation: ConversationDTO;
}): ChatPrivacyControlsSourceReference {
  const type =
    input.conversation.source.type === "manual" ||
    input.conversation.source.type === "chat_summary" ||
    input.conversation.source.type === "system"
      ? input.conversation.source.type
      : "system";

  return {
    type,
    id: input.conversation.source.id,
    label: input.conversation.source.label ?? "Live chat privacy controls source",
    providerRecordId: input.conversation.source.id,
    collectedAt: input.collectedAt,
    generatedBy: "live-store-query",
  };
}

function provenanceFor(input: {
  conversation: ConversationDTO;
  generationMethod: ChatPrivacyControlsProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatPrivacyControlsProvider;
}): ChatPrivacyControlsProvenance {
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
        : ["evidence:chat-privacy-live-store-empty"],
    collectedAt: input.graph.generatedAt,
    privacy: "live-chat-privacy-controls-preview",
    generationMethod: input.generationMethod,
    ...executionFlags({ readExecuted: true }),
  };
}

function failureProvenance(input: {
  graph?: LiveChatConversationGraph;
  provider?: LiveChatPrivacyControlsProvider | null;
  readExecuted: boolean;
  sourceLabel: string;
}): ChatPrivacyControlsProvenance {
  return {
    source:
      input.provider?.source ?? "live-record-store:chat-privacy-controls:unconfigured",
    sourceLabel: input.sourceLabel,
    evidenceIds: [
      input.readExecuted
        ? "evidence:chat-privacy-live-store-failure"
        : "evidence:chat-privacy-live-store-unconfigured",
    ],
    collectedAt: input.graph?.generatedAt ?? new Date(0).toISOString(),
    privacy: "live-chat-privacy-controls-preview",
    generationMethod: "rule-based-state",
    ...executionFlags({ readExecuted: input.readExecuted }),
  };
}

function failure(input: {
  code: ChatPrivacyControlsErrorCode;
  graph?: LiveChatConversationGraph;
  provider?: LiveChatPrivacyControlsProvider | null;
  readExecuted: boolean;
  sourceLabel: string;
}): ChatPrivacyControlsFailure {
  const definition = CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS[input.code];
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

function analysisOptInState(input: {
  enabled: boolean;
  evidenceIds: readonly string[];
  source: ChatPrivacyControlsSourceReference;
  status?: ChatAnalysisOptInState["status"];
}): ChatAnalysisOptInState {
  return {
    enabled: input.enabled,
    status:
      input.status ?? (input.enabled ? "opted_in" : "opted_out"),
    confirmationRequiredToDisable: true,
    source: input.source,
    evidenceIds: input.evidenceIds,
    generatedBy: "live-store-query",
    aiProviderRequested: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: false,
    productionPrivacyAuditLogWritten: false,
  };
}

function analysisDeletionState(input: {
  evidenceIds: readonly string[];
  source: ChatPrivacyControlsSourceReference;
  status?: ChatAnalysisDeletionState["status"];
}): ChatAnalysisDeletionState {
  return {
    status: input.status ?? "available",
    ...(input.status === "deleted_mock_only" ? { deletedInMock: true } : {}),
    source: input.source,
    evidenceIds: input.evidenceIds,
    generatedBy: "live-store-query",
    productionDataDeletionExecuted: false,
    productionPrivacyAuditLogWritten: false,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function privateNotes(input: {
  conversation: ConversationDTO;
  evidenceIds: readonly string[];
  source: ChatPrivacyControlsSourceReference;
}): readonly ChatPrivateNote[] {
  return [
    {
      noteId: `private-note:live:${input.conversation.id}`,
      conversationId: input.conversation.id,
      visibility: "hidden",
      bodyRedacted: true,
      redactedPreview: "[private note hidden from AI analysis and share preview]",
      source: input.source,
      evidenceIds: input.evidenceIds,
      generatedBy: "live-store-query",
      visibleToAiAnalysis: false,
      visibleInSharePreview: false,
      aiProviderRequested: false,
      externalNetworkRequested: false,
      liveDatabaseReadExecuted: true,
      liveDatabaseWriteExecuted: false,
    },
  ];
}

function sensitiveShareConfirmation(input: {
  evidenceIds: readonly string[];
  source: ChatPrivacyControlsSourceReference;
  status?: ChatSensitiveShareConfirmation["status"];
}): ChatSensitiveShareConfirmation {
  return {
    confirmationRequired: true,
    status: input.status ?? "required",
    canShareWithoutConfirmation: false,
    source: input.source,
    evidenceIds: input.evidenceIds,
    generatedBy: "live-store-query",
    externalActionExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: false,
    productionPrivacyAuditLogWritten: false,
  };
}

function buildPayload(input: {
  analysisEnabled?: boolean;
  analysisStatus?: ChatAnalysisOptInState["status"];
  conversation: ConversationDTO;
  deletionStatus?: ChatAnalysisDeletionState["status"];
  generationMethod: ChatPrivacyControlsProvenance["generationMethod"];
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatPrivacyControlsProvider;
  shareStatus?: ChatSensitiveShareConfirmation["status"];
  state?: "success" | "empty" | "pending";
}): ChatPrivacyControlsPayload {
  const source = sourceForConversation({
    collectedAt: input.graph.generatedAt,
    conversation: input.conversation,
  });
  const evidenceIds = evidenceIdsFor({
    conversation: input.conversation,
    messages: input.messages,
  });
  const ids =
    evidenceIds.length > 0 ? evidenceIds : ["evidence:chat-privacy-live-empty"];
  const contact = participantContact(input.conversation, input.graph.contacts);
  const state = input.state ?? "success";

  return {
    state,
    conversationId: input.conversation.id,
    participantName: contact?.displayName ?? "Live chat contact",
    organization: contact?.organization ?? "",
    analysisOptIn: analysisOptInState({
      enabled: input.analysisEnabled ?? true,
      evidenceIds: ids,
      source,
      status: input.analysisStatus,
    }),
    analysisDeletion: analysisDeletionState({
      evidenceIds: ids,
      source,
      status: input.deletionStatus,
    }),
    privateNotes:
      state === "empty"
        ? []
        : privateNotes({
            conversation: input.conversation,
            evidenceIds: ids,
            source,
          }),
    sensitiveShareConfirmation: sensitiveShareConfirmation({
      evidenceIds: ids,
      source,
      status: input.shareStatus,
    }),
    provenance: provenanceFor({
      conversation: input.conversation,
      generationMethod: input.generationMethod,
      graph: input.graph,
      messages: input.messages,
      provider: input.provider,
    }),
    nextAction:
      "Review analysis opt-in, hidden private notes, deletion availability, and sensitive-share confirmation before exposing chat context to AI or external actions.",
  };
}

function scenarioResult(input: {
  conversation: ConversationDTO;
  graph: LiveChatConversationGraph;
  messages: readonly MessageDTO[];
  provider: LiveChatPrivacyControlsProvider;
  scenario: ChatPrivacyControlsScenario;
}): ChatPrivacyControlsResult | null {
  switch (input.scenario) {
    case "empty":
      return success(
        buildPayload({
          analysisEnabled: false,
          conversation: input.conversation,
          generationMethod: "rule-based-state",
          graph: input.graph,
          messages: input.messages,
          provider: input.provider,
          state: "empty",
        }),
      );
    case "pending":
      return success(
        buildPayload({
          analysisStatus: "pending_confirmation",
          conversation: input.conversation,
          deletionStatus: "pending",
          generationMethod: "rule-based-state",
          graph: input.graph,
          messages: input.messages,
          provider: input.provider,
          shareStatus: "pending_confirmation",
          state: "pending",
        }),
      );
    case "failure":
      return failure({
        code: "CHAT_PRIVACY_MOCK_FAILED",
        graph: input.graph,
        provider: input.provider,
        readExecuted: true,
        sourceLabel: "Live chat privacy controls controlled failure",
      });
    case "success":
    default:
      return null;
  }
}

async function readConversationContext(input: {
  provider: LiveChatPrivacyControlsProvider | null;
  request?: ChatPrivacyControlsInput;
}): Promise<
  | {
      conversation: ConversationDTO;
      graph: LiveChatConversationGraph;
      messages: readonly MessageDTO[];
      provider: LiveChatPrivacyControlsProvider;
      success: true;
    }
  | ChatPrivacyControlsFailure
> {
  if (!input.provider) {
    return failure({
      code: "CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED",
      provider: null,
      readExecuted: false,
      sourceLabel: "Unconfigured chat privacy controls live store",
    });
  }

  const graph = await input.provider.readChatGraph();

  if (requestedConversationIdWasBlank(input.request)) {
    return failure({
      code: "CHAT_PRIVACY_CONVERSATION_ID_REQUIRED",
      graph,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: "Live chat privacy controls validation failure",
    });
  }

  const conversation = selectedConversation({
    graph,
    request: input.request,
  });

  if (!conversation) {
    return failure({
      code: "CHAT_PRIVACY_CONVERSATION_NOT_FOUND",
      graph,
      provider: input.provider,
      readExecuted: true,
      sourceLabel: "Live chat privacy controls conversation not found",
    });
  }

  return {
    conversation,
    graph,
    messages: messagesForConversation(conversation.id, graph.messages),
    provider: input.provider,
    success: true,
  };
}

export function createLiveChatPrivacyControlsService({
  provider = null,
}: LiveChatPrivacyControlsServiceOptions = {}): ChatPrivacyControlsService {
  return {
    async getPrivacyControls(input: ChatPrivacyControlsInput = {}) {
      const context = await readConversationContext({
        provider,
        request: input,
      });

      if (context.success === false) {
        return context;
      }

      const scenario = scenarioResult({
        conversation: context.conversation,
        graph: context.graph,
        messages: context.messages,
        provider: context.provider,
        scenario: normalizeScenario(input.scenario),
      });

      if (scenario) {
        return scenario;
      }

      return success(
        buildPayload({
          conversation: context.conversation,
          generationMethod: "fixture",
          graph: context.graph,
          messages: context.messages,
          provider: context.provider,
        }),
      );
    },
    async setAnalysisOptIn(input: ChatAnalysisOptInInput) {
      const context = await readConversationContext({
        provider,
        request: input,
      });

      if (context.success === false) {
        return context;
      }

      if (normalizeScenario(input.scenario) === "failure") {
        return failure({
          code: "CHAT_PRIVACY_MOCK_FAILED",
          graph: context.graph,
          provider: context.provider,
          readExecuted: true,
          sourceLabel: "Live chat privacy controls controlled failure",
        });
      }

      if (typeof input.enabled !== "boolean") {
        return failure({
          code: "CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED",
          graph: context.graph,
          provider: context.provider,
          readExecuted: true,
          sourceLabel: "Live chat privacy controls toggle validation failure",
        });
      }

      return success(
        buildPayload({
          analysisEnabled: input.enabled,
          conversation: context.conversation,
          generationMethod: "rule-based-analysis-toggle",
          graph: context.graph,
          messages: context.messages,
          provider: context.provider,
        }),
      );
    },
    async requestAnalysisDeletion(input: ChatPrivacyControlsInput = {}) {
      const context = await readConversationContext({
        provider,
        request: input,
      });

      if (context.success === false) {
        return context;
      }

      if (normalizeScenario(input.scenario) === "failure") {
        return failure({
          code: "CHAT_PRIVACY_MOCK_FAILED",
          graph: context.graph,
          provider: context.provider,
          readExecuted: true,
          sourceLabel: "Live chat privacy controls controlled failure",
        });
      }

      return success(
        buildPayload({
          conversation: context.conversation,
          deletionStatus: "deleted_mock_only",
          generationMethod: "rule-based-analysis-deletion",
          graph: context.graph,
          messages: context.messages,
          provider: context.provider,
        }),
      );
    },
    async prepareSensitiveShare(input: ChatSensitiveShareInput) {
      const context = await readConversationContext({
        provider,
        request: input,
      });

      if (context.success === false) {
        return context;
      }

      if (normalizeScenario(input.scenario) === "failure") {
        return failure({
          code: "CHAT_PRIVACY_MOCK_FAILED",
          graph: context.graph,
          provider: context.provider,
          readExecuted: true,
          sourceLabel: "Live chat privacy controls controlled failure",
        });
      }

      if (input.confirmed !== true) {
        return failure({
          code: "CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED",
          graph: context.graph,
          provider: context.provider,
          readExecuted: true,
          sourceLabel: "Live chat privacy controls confirmation required",
        });
      }

      return success(
        buildPayload({
          conversation: context.conversation,
          generationMethod: "rule-based-sensitive-share",
          graph: context.graph,
          messages: context.messages,
          provider: context.provider,
          shareStatus: "confirmed_mock_only",
        }),
      );
    },
  };
}
