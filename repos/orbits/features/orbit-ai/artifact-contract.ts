import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE =
  "fixture:features/orbit-ai/artifact-contract.ts" as const;

export const ORBIT_AGENT_ARTIFACT_KINDS = [
  "event_recommendations",
  "contact_recommendations",
  "email_context",
  "followup_queue",
  "relationship_chat_context",
  "generic",
] as const;

export const ORBIT_AGENT_ARTIFACT_STATUSES = [
  "pending",
  "ready",
  "failed",
] as const;

export const ORBIT_AGENT_ARTIFACT_SURFACES = [
  "side_panel",
  "inline_card",
  "full_page",
] as const;

export const ORBIT_AGENT_ARTIFACT_SUB_AGENTS = [
  "event_recommendation_agent",
  "contact_recommendation_agent",
  "followup_review_agent",
  "relationship_chat_review_agent",
] as const;

export const ORBIT_AGENT_ARTIFACT_ERROR_CODES = [
  "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED",
  "ORBIT_AGENT_ARTIFACT_NOT_FOUND",
  "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
  "ORBIT_AGENT_ARTIFACT_PENDING",
  "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
] as const;

export const ORBIT_AGENT_ARTIFACT_SCENARIOS = [
  "ready",
  "pending",
  "failure",
] as const;

export type OrbitAgentArtifactKind =
  (typeof ORBIT_AGENT_ARTIFACT_KINDS)[number];

export type OrbitAgentArtifactStatus =
  (typeof ORBIT_AGENT_ARTIFACT_STATUSES)[number];

export type OrbitAgentArtifactSurface =
  (typeof ORBIT_AGENT_ARTIFACT_SURFACES)[number];

export type OrbitAgentArtifactSubAgent =
  (typeof ORBIT_AGENT_ARTIFACT_SUB_AGENTS)[number];

export type OrbitAgentArtifactErrorCode =
  (typeof ORBIT_AGENT_ARTIFACT_ERROR_CODES)[number];

export type OrbitAgentArtifactScenario =
  (typeof ORBIT_AGENT_ARTIFACT_SCENARIOS)[number];

export type OrbitAgentArtifactWidthHint = "half" | "wide";

export type OrbitAgentArtifactSourceModule =
  | "orbit-ai"
  | "events"
  | "contacts"
  | "followups"
  | "chat";

export interface OrbitAgentArtifactPresentation {
  preferredSurface: OrbitAgentArtifactSurface;
  title: string;
  subtitle?: string;
  widthHint?: OrbitAgentArtifactWidthHint;
}

export interface OrbitAgentArtifactTaskRequest {
  kind: OrbitAgentArtifactKind;
  query: string;
  conversationId?: string | null;
  locale?: "zh" | "en" | string | null;
  presentation?: Partial<OrbitAgentArtifactPresentation>;
  scenario?: OrbitAgentArtifactScenario | string | null;
  subAgent?: OrbitAgentArtifactSubAgent;
}

export interface OrbitAgentArtifactLookupInput {
  artifactId: string;
  scenario?: OrbitAgentArtifactScenario | string | null;
}

export interface OrbitAgentArtifactTask {
  artifactId: string;
  taskId: string;
  conversationId: string | null;
  kind: OrbitAgentArtifactKind;
  status: OrbitAgentArtifactStatus;
  query: string;
  subAgent: OrbitAgentArtifactSubAgent;
  presentation: OrbitAgentArtifactPresentation;
  createdAt: string;
  updatedAt: string;
}

export interface OrbitAgentArtifactGeneratedViewAction {
  actionId: string;
  label: string;
  requiresConfirmation: boolean;
}

export interface OrbitAgentArtifactGeneratedViewMetadata {
  label: string;
  value: string;
}

export interface OrbitAgentArtifactGeneratedViewItem {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  reason?: string;
  confidenceLabel?: string;
  metadata: readonly OrbitAgentArtifactGeneratedViewMetadata[];
  actions: readonly OrbitAgentArtifactGeneratedViewAction[];
  evidenceIds: readonly string[];
}

export interface OrbitAgentArtifactGeneratedViewSection {
  title: string;
  body?: string;
  items: readonly OrbitAgentArtifactGeneratedViewItem[];
}

export interface OrbitAgentArtifactGeneratedView {
  summary: string;
  sections: readonly OrbitAgentArtifactGeneratedViewSection[];
  emptyState?: string;
}

export interface OrbitAgentArtifactToolCallTrace {
  toolCallId: string;
  toolName: string;
  status: "planned" | "completed" | "skipped" | "failed";
  reason: string;
  evidenceIds: readonly string[];
}

export interface OrbitAgentArtifactProvenance {
  source: typeof ORBIT_AGENT_ARTIFACT_FIXTURE_SOURCE;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  evidenceIds: readonly string[];
  toolCalls: readonly OrbitAgentArtifactToolCallTrace[];
  generatedAt: string;
  generationMethod:
    | "fixture"
    | "rule-based-artifact-task"
    | "sub-agent-generated-view";
}

export interface OrbitAgentArtifactSafety {
  externalSideEffectsExecuted: false;
  domainWritesExecuted: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  actionsRequireConfirmation: true;
}

export interface OrbitAgentArtifactResult {
  artifactId: string;
  taskId: string;
  kind: OrbitAgentArtifactKind;
  status: OrbitAgentArtifactStatus;
  presentation: OrbitAgentArtifactPresentation;
  generatedView: OrbitAgentArtifactGeneratedView | null;
  provenance: OrbitAgentArtifactProvenance;
  safety: OrbitAgentArtifactSafety;
  nextAction: string;
}

export interface OrbitAgentArtifactPayload {
  task: OrbitAgentArtifactTask;
  result: OrbitAgentArtifactResult;
}

export interface OrbitAgentArtifactSuccess {
  success: true;
  data: OrbitAgentArtifactPayload;
}

export interface OrbitAgentArtifactErrorDefinition {
  code: OrbitAgentArtifactErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export interface OrbitAgentArtifactFailure {
  success: false;
  error: OrbitAgentArtifactErrorDefinition & {
    artifactId?: string;
    taskId?: string;
    state: "failure";
    evidenceIds: readonly string[];
  };
}

export type OrbitAgentArtifactResultEnvelope =
  | OrbitAgentArtifactSuccess
  | OrbitAgentArtifactFailure;

export const ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS = {
  ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED: {
    code: "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A non-empty artifact query is required before a sub-agent task can start.",
    recovery:
      "Ask the user for the recommendation or review goal before creating an artifact task.",
  },
  ORBIT_AGENT_ARTIFACT_NOT_FOUND: {
    code: "ORBIT_AGENT_ARTIFACT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No Orbit Agent artifact task matches that artifact id.",
    recovery:
      "Render an artifact recovery state and let the user retry the request from the chat turn.",
  },
  ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND: {
    code: "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
    appCode: "VALIDATION_ERROR",
    message: "The requested Orbit Agent artifact kind is not supported by the mock sub-agent boundary.",
    recovery:
      "Use a supported artifact kind or render the generic artifact fallback.",
  },
  ORBIT_AGENT_ARTIFACT_PENDING: {
    code: "ORBIT_AGENT_ARTIFACT_PENDING",
    appCode: "CONFLICT",
    message: "The Orbit Agent artifact task is still pending.",
    recovery:
      "Keep the side panel in a loading state and do not execute external actions.",
  },
  ORBIT_AGENT_ARTIFACT_MOCK_FAILED: {
    code: "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The Orbit Agent artifact mock is pinned to a controlled failure.",
    recovery:
      "Render the controlled failure state and avoid retrying live providers or external actions.",
  },
} as const satisfies Record<
  OrbitAgentArtifactErrorCode,
  OrbitAgentArtifactErrorDefinition
>;

export function orbitAgentArtifactFailureToAppError(
  result: OrbitAgentArtifactFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function orbitAgentArtifactFailureContext(
  result: OrbitAgentArtifactFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    artifactId: result.error.artifactId ?? "",
    featureMode: mode,
    orbitFeatureMode: mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    recovery: result.error.recovery,
    runtimeBoundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
  };
}
