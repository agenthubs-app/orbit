import {
  CHAT_SUMMARY_EXTRACTION_ERROR_DEFINITIONS,
  type ChatSummaryExtractionErrorCode,
  type ChatSummaryExtractionFailure,
  type ChatSummaryExtractionInput,
  type ChatSummaryExtractionPayload,
  type ChatSummaryExtractionResult,
  type ChatSummaryExtractionScenario,
  type ChatSummaryExtractionService,
} from "./summary-contract";
import {
  mockChatExtractionFixture,
  mockChatSummaryExtractionFailureProvenance,
  mockChatSummaryFixture,
  mockEmptyChatSummaryFixture,
  mockPendingChatExtractionFixture,
} from "./summary-fixtures";
import { mockChatConversations, mockChatMessages } from "./fixtures";

const supportedScenarios = new Set<ChatSummaryExtractionScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const knownConversationIds = new Set(
  mockChatConversations.map((conversation) => conversation.conversationId),
);

// Chat summary/extraction mock 模拟从会话中生成摘要和关系信号。
// 它不调用模型，只根据 conversationId 和 scenario 返回稳定 fixture。
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
  // 摘要和信号提取都必须绑定到已知 demo conversation。
  const conversationId = readConversationId(input);

  if (!conversationId) {
    return failure("CHAT_SUMMARY_CONVERSATION_ID_REQUIRED");
  }

  if (!knownConversationIds.has(conversationId)) {
    return failure("CHAT_SUMMARY_CONVERSATION_NOT_FOUND");
  }

  return null;
}

function payloadForConversation(
  payload: ChatSummaryExtractionPayload,
  conversationId: string,
): ChatSummaryExtractionPayload | null {
  if (conversationId === mockChatSummaryFixture.conversationId) {
    return payload;
  }

  const conversation = mockChatConversations.find(
    (candidate) => candidate.conversationId === conversationId,
  );

  if (!conversation) {
    return null;
  }

  const evidenceIds = Array.from(
    new Set([
      ...conversation.evidenceIds,
      ...mockChatMessages
        .filter((message) => message.conversationId === conversationId)
        .flatMap((message) => message.evidenceIds),
    ]),
  );

  return {
    ...payload,
    conversationId,
    participantName: conversation.participantName,
    organization: conversation.organization,
    summary: null,
    extractedNeeds: [],
    extractedTasks: [],
    relationshipProfileUpdates: [],
    confirmationRequiredProfileSuggestions: [],
    provenance: {
      ...payload.provenance,
      source: conversation.source.id,
      sourceLabel: conversation.source.label,
      evidenceIds,
    },
    nextAction:
      "Review the source-backed conversation before confirming any extracted relationship work.",
  };
}

function resultForScenario(
  scenario: ChatSummaryExtractionScenario,
  successPayload: ChatSummaryExtractionPayload,
  conversationId: string,
): ChatSummaryExtractionResult {
  // summarize/extract 共用 scenario 分支，只是 success payload 不同。
  let payload: ChatSummaryExtractionPayload;

  switch (scenario) {
    case "empty":
      payload = mockEmptyChatSummaryFixture;
      break;
    case "pending":
      payload = mockPendingChatExtractionFixture;
      break;
    case "failure":
      return failure("CHAT_SUMMARY_MOCK_FAILED");
    case "success":
    default:
      payload = successPayload;
      break;
  }

  const conversationPayload = payloadForConversation(payload, conversationId);

  return conversationPayload
    ? success(conversationPayload)
    : failure("CHAT_SUMMARY_CONVERSATION_NOT_FOUND");
}

export function createMockChatSummaryExtractionService(): ChatSummaryExtractionService {
  return {
    summarizeConversation(
      input: ChatSummaryExtractionInput,
    ): ChatSummaryExtractionResult {
      // 返回会话摘要 fixture。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      return resultForScenario(
        normalizeScenario(input.scenario),
        mockChatSummaryFixture,
        readConversationId(input) as string,
      );
    },
    extractConversationSignals(
      input: ChatSummaryExtractionInput,
    ): ChatSummaryExtractionResult {
      // 返回关系信号 extraction fixture。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      return resultForScenario(
        normalizeScenario(input.scenario),
        mockChatExtractionFixture,
        readConversationId(input) as string,
      );
    },
  };
}
