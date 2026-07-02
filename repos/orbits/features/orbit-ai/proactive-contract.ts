import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES = [
  "calendar_event_upcoming",
  "calendar_event_changed",
  "followup_due",
  "relationship_opportunity",
  "system_status",
] as const;

export const ORBIT_AI_PROACTIVE_AGENT_DELIVERY_SURFACES = [
  "orbit_ai_chat",
] as const;

export const ORBIT_AI_PROACTIVE_AGENT_ERROR_CODES = [
  "ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED",
  "ORBIT_AI_PROACTIVE_AGENT_SIGNAL_ID_REQUIRED",
  "ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE",
  "ORBIT_AI_PROACTIVE_AGENT_MOCK_FAILED",
  "ORBIT_AI_PROACTIVE_AGENT_LIVE_POLICY_FAILED",
] as const;

export type OrbitAiProactiveAgentSignalType =
  (typeof ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES)[number];

export type OrbitAiProactiveAgentDeliverySurface =
  (typeof ORBIT_AI_PROACTIVE_AGENT_DELIVERY_SURFACES)[number];

export type OrbitAiProactiveAgentErrorCode =
  (typeof ORBIT_AI_PROACTIVE_AGENT_ERROR_CODES)[number];

export type OrbitAiProactiveAgentScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type OrbitAiProactiveAgentSeverity = "high" | "normal" | "low";

export type OrbitAiProactiveAgentSourceModule =
  | "calendar"
  | "events"
  | "contacts"
  | "followups"
  | "system";

export interface OrbitAiProactiveAgentSignalSourceReference {
  id: string;
  label: string;
  type: string;
}

export interface OrbitAiProactiveAgentSignal {
  signalId?: string | null;
  type?: OrbitAiProactiveAgentSignalType | string | null;
  title?: string | null;
  body?: string | null;
  occursAt?: string | null;
  severity?: OrbitAiProactiveAgentSeverity | string | null;
  sourceModule?: OrbitAiProactiveAgentSourceModule | string | null;
  sourceRef?: OrbitAiProactiveAgentSignalSourceReference | null;
  evidenceIds?: readonly string[] | null;
}

export interface OrbitAiProactiveAgentInput {
  scenario?: OrbitAiProactiveAgentScenario | string | null;
  signal?: OrbitAiProactiveAgentSignal | null;
}

export interface OrbitAiProactiveAgentSuggestedAction {
  actionId: string;
  label: string;
  targetSurface: "orbit_ai_chat" | "events" | "contacts" | "followups" | "messages";
  requiresConfirmation: true;
}

export interface OrbitAiProactiveAgentChatMessage {
  messageId: string;
  conversationId: string;
  role: "assistant";
  turnKind: "proactive";
  content: string;
  createdAt: string;
  sourceSignalId: string;
  deliverySurface: OrbitAiProactiveAgentDeliverySurface;
  evidenceIds: readonly string[];
}

export interface OrbitAiProactiveAgentSafetyLedger {
  externalSideEffectsExecuted: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  pushProviderRequested: false;
  notificationDelivered: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
}

export interface OrbitAiProactiveAgentProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  generationMethod:
    | "fixture"
    | "rule-based-proactive-turn"
    | "rule-based-proactive-state"
    | "live-policy-proactive-turn"
    | "live-policy-proactive-state";
  privacy:
    | "demo-orbit-ai-proactive-agent-only"
    | "live-orbit-ai-proactive-agent-policy-only";
  safety: OrbitAiProactiveAgentSafetyLedger;
}

export interface OrbitAiProactiveAgentPayload {
  message: OrbitAiProactiveAgentChatMessage;
  signal: Required<
    Pick<OrbitAiProactiveAgentSignal, "signalId" | "type">
  > &
    OrbitAiProactiveAgentSignal;
  suggestedActions: readonly OrbitAiProactiveAgentSuggestedAction[];
  provenance: OrbitAiProactiveAgentProvenance;
  nextAction: string;
}

export interface OrbitAiProactiveAgentSuccess {
  success: true;
  data: OrbitAiProactiveAgentPayload;
}

export interface OrbitAiProactiveAgentFailure {
  success: false;
  error: OrbitAiProactiveAgentErrorDefinition & {
    state: "failure";
    provenance: OrbitAiProactiveAgentProvenance;
    evidenceIds: readonly string[];
  };
}

export type OrbitAiProactiveAgentResult =
  | OrbitAiProactiveAgentSuccess
  | OrbitAiProactiveAgentFailure;

export interface OrbitAiProactiveAgentService {
  createProactiveTurn: (
    input?: OrbitAiProactiveAgentInput,
  ) => OrbitAiProactiveAgentResult;
}

export interface OrbitAiProactiveAgentErrorDefinition {
  code: OrbitAiProactiveAgentErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS = {
  ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED: {
    appCode: "VALIDATION_ERROR",
    code: "ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED",
    message:
      "A structured signal is required before Orbit AI can create a proactive assistant turn.",
    recovery:
      "Ask the source feature to emit an AgentSignal and keep the user-facing Orbit AI chat unchanged.",
  },
  ORBIT_AI_PROACTIVE_AGENT_SIGNAL_ID_REQUIRED: {
    appCode: "VALIDATION_ERROR",
    code: "ORBIT_AI_PROACTIVE_AGENT_SIGNAL_ID_REQUIRED",
    message:
      "A signal id is required before Orbit AI can create a proactive assistant turn.",
    recovery:
      "Keep the signal out of the Orbit AI chat window until it has a stable source id for audit and dedupe.",
  },
  ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE: {
    appCode: "VALIDATION_ERROR",
    code: "ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE",
    message:
      "The signal type is not supported by the mock Orbit AI proactive agent.",
    recovery:
      "Do not generate user-facing copy; add an explicit signal mapping before routing this signal to Orbit AI.",
  },
  ORBIT_AI_PROACTIVE_AGENT_MOCK_FAILED: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "ORBIT_AI_PROACTIVE_AGENT_MOCK_FAILED",
    message: "The Orbit AI proactive agent mock is pinned to a failure state.",
    recovery:
      "Render a controlled failure state without calling AI providers, push providers, notifications, email, calendar, storage, or network services.",
  },
  ORBIT_AI_PROACTIVE_AGENT_LIVE_POLICY_FAILED: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "ORBIT_AI_PROACTIVE_AGENT_LIVE_POLICY_FAILED",
    message: "The Orbit AI proactive agent live policy is unavailable.",
    recovery:
      "Keep the proactive turn out of the Orbit AI chat window and avoid AI providers, push providers, notifications, email, calendar, storage writes, or network services.",
  },
} as const satisfies Record<
  OrbitAiProactiveAgentErrorCode,
  OrbitAiProactiveAgentErrorDefinition
>;

export function orbitAiProactiveAgentFailureToAppError(
  failure: OrbitAiProactiveAgentFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function orbitAiProactiveAgentFailureContext(
  failure: OrbitAiProactiveAgentFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    evidenceIds: failure.error.evidenceIds.join(","),
    orbitAiProactiveAgentErrorCode: failure.error.code,
    recovery: failure.error.recovery,
    runtimeBoundary: RUNTIME_BOUNDARY_HEADER_VALUES[mode],
    service: "orbit-ai-proactive-agent-mock",
    source: failure.error.provenance.source,
  };
}
