import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";
import type { OrbitAgentArtifactPayload } from "./artifact-contract";

export const ORBIT_AGENT_CONVERSATION_FIXTURE_SOURCE =
  "fixture:features/orbit-ai/mock-conversation-service.ts" as const;

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

export interface OrbitAgentConversationProvenance {
  source:
    | typeof ORBIT_AGENT_CONVERSATION_FIXTURE_SOURCE
    | "local:orbit-agent-privacy-boundary"
    | "provider:deepseek-chat-completions-api"
    | "provider:gemini-interactions-api"
    | "provider:openai-responses-api";
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

export function orbitAgentConversationFailureToAppError(
  result: OrbitAgentConversationFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

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
