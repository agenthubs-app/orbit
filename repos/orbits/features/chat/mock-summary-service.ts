import {
  CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS,
  mockChatExtractionFixture,
  mockChatSummaryExtractionFailureProvenance,
  mockChatSummaryFixture,
  mockEmptyChatSummaryFixture,
  mockPendingChatExtractionFixture,
  type ChatSummaryExtractionErrorCode,
  type ChatSummaryExtractionFailure,
  type ChatSummaryExtractionInput,
  type ChatSummaryExtractionPayload,
  type ChatSummaryExtractionResult,
  type ChatSummaryExtractionScenario,
  type ChatSummaryExtractionService,
} from "./summary-contract";

const supportedScenarios = new Set<ChatSummaryExtractionScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const knownConversationIds = new Set(["demo-conversation-1"]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  data: ChatSummaryExtractionPayload,
): ChatSummaryExtractionResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ChatSummaryExtractionErrorCode,
): ChatSummaryExtractionFailure {
  const definition = CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockChatSummaryExtractionFailureProvenance,
      evidenceIds: mockChatSummaryExtractionFailureProvenance.evidenceIds,
    },
  };
}

function readConversationId(
  input: ChatSummaryExtractionInput,
): string | null {
  return typeof input.conversationId === "string" && input.conversationId.trim()
    ? input.conversationId.trim()
    : null;
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

function validateConversation(
  input: ChatSummaryExtractionInput,
): ChatSummaryExtractionFailure | null {
  const conversationId = readConversationId(input);

  if (!conversationId) {
    return failure("CHAT_SUMMARY_CONVERSATION_ID_REQUIRED");
  }

  if (!knownConversationIds.has(conversationId)) {
    return failure("CHAT_SUMMARY_CONVERSATION_NOT_FOUND");
  }

  return null;
}

function resultForScenario(
  scenario: ChatSummaryExtractionScenario,
  successPayload: ChatSummaryExtractionPayload,
): ChatSummaryExtractionResult {
  switch (scenario) {
    case "empty":
      return success(mockEmptyChatSummaryFixture);
    case "pending":
      return success(mockPendingChatExtractionFixture);
    case "failure":
      return failure("CHAT_SUMMARY_MOCK_FAILED");
    case "success":
    default:
      return success(successPayload);
  }
}

export function createMockChatSummaryExtractionService(): ChatSummaryExtractionService {
  return {
    summarizeConversation(
      input: ChatSummaryExtractionInput,
    ): ChatSummaryExtractionResult {
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      return resultForScenario(
        normalizeScenario(input.scenario),
        mockChatSummaryFixture,
      );
    },
    extractConversationSignals(
      input: ChatSummaryExtractionInput,
    ): ChatSummaryExtractionResult {
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      return resultForScenario(
        normalizeScenario(input.scenario),
        mockChatExtractionFixture,
      );
    },
  };
}
