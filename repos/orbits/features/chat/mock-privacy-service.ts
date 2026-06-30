import {
  CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS,
  type ChatAnalysisOptInInput,
  type ChatPrivacyControlsErrorCode,
  type ChatPrivacyControlsFailure,
  type ChatPrivacyControlsInput,
  type ChatPrivacyControlsPayload,
  type ChatPrivacyControlsResult,
  type ChatPrivacyControlsScenario,
  type ChatPrivacyControlsService,
  type ChatSensitiveShareInput,
} from "./privacy-contract";
import {
  mockChatPrivacyAnalysisDeletedFixture,
  mockChatPrivacyControlsFailureProvenance,
  mockChatPrivacyControlsFixture,
  mockChatPrivacyControlsToggleOffFixture,
  mockChatPrivacyControlsToggleOnFixture,
  mockChatPrivacySensitiveShareConfirmedFixture,
  mockEmptyChatPrivacyControlsFixture,
  mockPendingChatPrivacyControlsFixture,
} from "./privacy-fixtures";

const supportedScenarios = new Set<ChatPrivacyControlsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const defaultConversationId = "demo-conversation-privacy-1";
const knownConversationIds = new Set([defaultConversationId]);

// Chat privacy mock 模拟隐私控制面板、分析开关、删除请求和敏感分享确认。
// 它只返回 fixture，不执行真实删除、共享或持久权限变更。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: ChatPrivacyControlsPayload): ChatPrivacyControlsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ChatPrivacyControlsErrorCode,
): ChatPrivacyControlsFailure {
  const definition = CHAT_PRIVACY_CONTROLS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockChatPrivacyControlsFailureProvenance,
      evidenceIds: mockChatPrivacyControlsFailureProvenance.evidenceIds,
    },
  };
}

function readConversationId(
  input?: ChatPrivacyControlsInput,
): string | null {
  // 未传 conversationId 时使用默认 demo conversation；显式空字符串才触发 required failure。
  if (
    !input ||
    !Object.prototype.hasOwnProperty.call(input, "conversationId") ||
    input.conversationId === null ||
    typeof input.conversationId === "undefined"
  ) {
    return defaultConversationId;
  }

  return typeof input.conversationId === "string" &&
    input.conversationId.trim()
    ? input.conversationId.trim()
    : null;
}

function validateConversation(
  input?: ChatPrivacyControlsInput,
): ChatPrivacyControlsFailure | null {
  // 所有 privacy 操作都必须落在已知 demo conversation 上。
  const conversationId = readConversationId(input);

  if (!conversationId) {
    return failure("CHAT_PRIVACY_CONVERSATION_ID_REQUIRED");
  }

  if (!knownConversationIds.has(conversationId)) {
    return failure("CHAT_PRIVACY_CONVERSATION_NOT_FOUND");
  }

  return null;
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

function resultForScenario(
  scenario: ChatPrivacyControlsScenario,
): ChatPrivacyControlsResult {
  switch (scenario) {
    case "empty":
      return success(mockEmptyChatPrivacyControlsFixture);
    case "pending":
      return success(mockPendingChatPrivacyControlsFixture);
    case "failure":
      return failure("CHAT_PRIVACY_MOCK_FAILED");
    case "success":
    default:
      return success(mockChatPrivacyControlsFixture);
  }
}

export function createMockChatPrivacyControlsService(): ChatPrivacyControlsService {
  return {
    getPrivacyControls(
      input?: ChatPrivacyControlsInput,
    ): ChatPrivacyControlsResult {
      // 读取控制面板只做 conversation 校验和 scenario 切换。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      return resultForScenario(normalizeScenario(input?.scenario));
    },
    setAnalysisOptIn(
      input: ChatAnalysisOptInInput,
    ): ChatPrivacyControlsResult {
      // 切换分析开关要求 enabled 是 boolean，避免字符串/缺省造成歧义。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      const scenario = normalizeScenario(input.scenario);

      if (scenario === "failure") {
        return failure("CHAT_PRIVACY_MOCK_FAILED");
      }

      if (typeof input.enabled !== "boolean") {
        return failure("CHAT_PRIVACY_TOGGLE_VALUE_REQUIRED");
      }

      return success(
        input.enabled
          ? mockChatPrivacyControlsToggleOnFixture
          : mockChatPrivacyControlsToggleOffFixture,
      );
    },
    requestAnalysisDeletion(
      input?: ChatPrivacyControlsInput,
    ): ChatPrivacyControlsResult {
      // 删除请求返回“已请求删除”的 fixture，不执行真实存储删除。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      if (normalizeScenario(input?.scenario) === "failure") {
        return failure("CHAT_PRIVACY_MOCK_FAILED");
      }

      return success(mockChatPrivacyAnalysisDeletedFixture);
    },
    prepareSensitiveShare(
      input: ChatSensitiveShareInput,
    ): ChatPrivacyControlsResult {
      // 敏感分享必须 confirmed=true；否则返回确认要求失败。
      const validation = validateConversation(input);

      if (validation) {
        return validation;
      }

      if (normalizeScenario(input.scenario) === "failure") {
        return failure("CHAT_PRIVACY_MOCK_FAILED");
      }

      if (input.confirmed !== true) {
        return failure("CHAT_PRIVACY_SENSITIVE_SHARE_CONFIRMATION_REQUIRED");
      }

      return success(mockChatPrivacySensitiveShareConfirmedFixture);
    },
  };
}
