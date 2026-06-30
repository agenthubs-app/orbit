import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";
import type { OrbitAgentArtifactPayload } from "./artifact-contract";

// Conversation contract 是 Chat Agent 的对外数据协议。
// API route、UI 组件、mock service 和 live service 都必须通过这里的类型交互。
// 这些是 feature 内部错误码；route 会再映射到 shared AppErrorCode。
// 保留旧 Gemini 错误码是为了兼容已有测试和调用方。
export const ORBIT_AGENT_CONVERSATION_ERROR_CODES = [
  "ORBIT_AGENT_MESSAGE_REQUIRED",
  "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
  "ORBIT_AGENT_CONVERSATION_EMPTY",
  "ORBIT_AGENT_CONVERSATION_PENDING",
  "ORBIT_AGENT_CONVERSATION_MOCK_FAILED",
  "ORBIT_AGENT_PROVIDER_API_KEY_MISSING",
  "ORBIT_AGENT_PROVIDER_REQUEST_FAILED",
  "ORBIT_AGENT_PROVIDER_SCHEMA_INVALID",
  "ORBIT_AGENT_GEMINI_API_KEY_MISSING",
  "ORBIT_AGENT_GEMINI_REQUEST_FAILED",
  "ORBIT_AGENT_GEMINI_SCHEMA_INVALID",
] as const;

export type OrbitAgentConversationErrorCode =
  (typeof ORBIT_AGENT_CONVERSATION_ERROR_CODES)[number];

export type OrbitAgentConversationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type OrbitAgentConversationState = "success" | "empty" | "pending";

export type OrbitAgentMessageRole = "user" | "assistant" | "system";

export interface OrbitAgentConversationInput {
  scenario?: OrbitAgentConversationScenario | string | null;
}

export interface OrbitAgentConversationLookupInput
  extends OrbitAgentConversationInput {
  conversationId?: string | null;
}

export interface OrbitAgentSendMessageInput extends OrbitAgentConversationInput {
  conversationId?: string | null;
  message?: string | null;
  locale?: "zh" | "en" | string | null;
}

export interface OrbitAgentConversationMessage {
  messageId: string;
  conversationId: string;
  role: OrbitAgentMessageRole;
  content: string;
  createdAt: string;
  evidenceIds: readonly string[];
}

export interface OrbitAgentProposedToolIntent {
  intentId: string;
  toolFamily: "relationship_chat" | "events" | "contacts" | "followups";
  label: string;
  reason: string;
  requiresUserConfirmation: boolean;
}

// safety ledger 是每次 conversation payload 的安全审计摘要。
// 当前实现允许模型 provider 请求和 mock artifact 生成；
// 真实数据库写入、邮件/日历/通知和外部副作用必须显式保持 false。
export interface OrbitAgentSafetyLedger {
  externalSideEffectsExecuted: false;
  domainToolCallsExecuted: boolean;
  aiProviderRequested: boolean;
  externalNetworkRequested: boolean;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
}

// provenance 让 UI 和测试知道回复来源。
// 具体 source 字符串由 mock/live/provider 实现提供，contract 不携带 fixture 来源。
export interface OrbitAgentConversationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  generationMethod:
    | "fixture"
    | "rule-based-agent-reply"
    | "rule-based-agent-state"
    | "gemini-live-agent-reply"
    | "gemini-live-agent-state"
    | "model-provider-live-agent-reply"
    | "model-provider-live-agent-state";
  privacy: "demo-orbit-agent-conversation-only";
  safety: OrbitAgentSafetyLedger;
}

export interface OrbitAgentConversationSummary {
  conversationId: string;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  evidenceIds: readonly string[];
}

export interface OrbitAgentConversationTimingSpan {
  phase: string;
  durationMs: number;
  skipped?: boolean;
}

export interface OrbitAgentConversationDiagnostics {
  maxLoopSteps: number;
  model?: string;
  provider?: string;
  timings: readonly OrbitAgentConversationTimingSpan[];
}

// ConversationPayload 是 UI 渲染 Chat Agent 的完整数据包：
// messages 渲染对话气泡，artifacts 渲染右侧/内联结果面板，
// proposedToolIntents 告诉用户哪些动作只是计划，nextAction 给出下一步提示。
export interface OrbitAgentConversationPayload {
  state: OrbitAgentConversationState;
  conversations: readonly OrbitAgentConversationSummary[];
  messages: readonly OrbitAgentConversationMessage[];
  activeConversationId: string | null;
  assistantMessage: string;
  artifacts: readonly OrbitAgentArtifactPayload[];
  proposedToolIntents: readonly OrbitAgentProposedToolIntent[];
  provenance: OrbitAgentConversationProvenance;
  nextAction: string;
  diagnostics?: OrbitAgentConversationDiagnostics;
}

export interface OrbitAgentConversationSuccess {
  success: true;
  data: OrbitAgentConversationPayload;
}

export interface OrbitAgentConversationFailure {
  success: false;
  error: OrbitAgentConversationErrorDefinition & {
    state: "failure";
    provenance: OrbitAgentConversationProvenance;
    evidenceIds: readonly string[];
  };
}

export type OrbitAgentConversationResult =
  | OrbitAgentConversationSuccess
  | OrbitAgentConversationFailure;

export type OrbitAgentConversationMaybePromise<TValue> =
  | TValue
  | Promise<TValue>;

// 所有 conversation service 都实现同一接口。
// mock 可以同步返回，live 可以异步调用 provider，所以返回值允许 Promise。
export interface OrbitAgentConversationService {
  listConversations: (
    input?: OrbitAgentConversationInput,
  ) => OrbitAgentConversationMaybePromise<OrbitAgentConversationResult>;
  getConversation: (
    input: OrbitAgentConversationLookupInput,
  ) => OrbitAgentConversationMaybePromise<OrbitAgentConversationResult>;
  sendMessage: (
    input: OrbitAgentSendMessageInput,
  ) => OrbitAgentConversationMaybePromise<OrbitAgentConversationResult>;
}

export interface OrbitAgentConversationErrorDefinition {
  code: OrbitAgentConversationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const ORBIT_AGENT_CONVERSATION_ERROR_DEFINITIONS = {
  ORBIT_AGENT_MESSAGE_REQUIRED: {
    code: "ORBIT_AGENT_MESSAGE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A non-empty user message is required before Orbit Agent can reply.",
    recovery:
      "Keep the conversation turn local and ask for a message before considering any domain tools.",
  },
  ORBIT_AGENT_CONVERSATION_NOT_FOUND: {
    code: "ORBIT_AGENT_CONVERSATION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock Orbit Agent conversation matches that conversation id.",
    recovery:
      "Start a new local agent conversation instead of reading live storage or running tools.",
  },
  ORBIT_AGENT_CONVERSATION_EMPTY: {
    code: "ORBIT_AGENT_CONVERSATION_EMPTY",
    appCode: "CONFLICT",
    message: "No Orbit Agent conversation is available in the empty scenario.",
    recovery:
      "Render an empty conversation state without calling AI providers, domain tools, or live storage.",
  },
  ORBIT_AGENT_CONVERSATION_PENDING: {
    code: "ORBIT_AGENT_CONVERSATION_PENDING",
    appCode: "CONFLICT",
    message: "The Orbit Agent conversation mock is waiting on a local reply guard.",
    recovery:
      "Render the pending state and do not call domain tools, AI providers, network, or persistence.",
  },
  ORBIT_AGENT_CONVERSATION_MOCK_FAILED: {
    code: "ORBIT_AGENT_CONVERSATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The Orbit Agent conversation mock is pinned to a controlled failure.",
    recovery:
      "Render the controlled failure state and avoid retrying live AI, network, or database services.",
  },
  ORBIT_AGENT_PROVIDER_API_KEY_MISSING: {
    code: "ORBIT_AGENT_PROVIDER_API_KEY_MISSING",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "A configured model provider API key is required before the live Orbit Agent can reply.",
    recovery:
      "Set the selected provider API key on the server or switch ORBIT_AGENT_CONVERSATION_MODE back to mock.",
  },
  ORBIT_AGENT_PROVIDER_REQUEST_FAILED: {
    code: "ORBIT_AGENT_PROVIDER_REQUEST_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The configured model provider did not return a usable Orbit Agent response.",
    recovery:
      "Keep the conversation local, do not execute tools, and retry after checking the selected provider status.",
  },
  ORBIT_AGENT_PROVIDER_SCHEMA_INVALID: {
    code: "ORBIT_AGENT_PROVIDER_SCHEMA_INVALID",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The configured model provider returned an Orbit Agent planner response outside the allowed schema.",
    recovery:
      "Reject the planner output, do not execute tools, and fall back to a safe local explanation.",
  },
  ORBIT_AGENT_GEMINI_API_KEY_MISSING: {
    code: "ORBIT_AGENT_GEMINI_API_KEY_MISSING",
    appCode: "SERVICE_UNAVAILABLE",
    message: "Gemini API key is required before the live Orbit Agent can reply.",
    recovery:
      "Set GEMINI_API_KEY on the server or switch ORBIT_MODULE_MODE back to mock.",
  },
  ORBIT_AGENT_GEMINI_REQUEST_FAILED: {
    code: "ORBIT_AGENT_GEMINI_REQUEST_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "Gemini did not return a usable Orbit Agent planner response.",
    recovery:
      "Keep the conversation local, do not execute tools, and retry after checking the Gemini provider status.",
  },
  ORBIT_AGENT_GEMINI_SCHEMA_INVALID: {
    code: "ORBIT_AGENT_GEMINI_SCHEMA_INVALID",
    appCode: "SERVICE_UNAVAILABLE",
    message: "Gemini returned an Orbit Agent planner response outside the allowed schema.",
    recovery:
      "Reject the planner output, do not execute tools, and fall back to a safe local explanation.",
  },
} as const satisfies Record<
  OrbitAgentConversationErrorCode,
  OrbitAgentConversationErrorDefinition
>;

// route 层只理解 AppError；这里负责把 feature 失败转换成共享错误模型。
export function orbitAgentConversationFailureToAppError(
  result: OrbitAgentConversationFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

// 错误 context 会返回给前端和测试，帮助定位当前 mode、隐私边界和恢复建议。
export function orbitAgentConversationFailureContext(
  result: OrbitAgentConversationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    featureMode: mode,
    orbitFeatureMode: mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    recovery: result.error.recovery,
    runtimeBoundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
  };
}
