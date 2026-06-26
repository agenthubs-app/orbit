import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const AGENT_ACTION_QUEUE_FIXTURE_SOURCE =
  "fixture:features/agent/fixtures.ts" as const;

export const AGENT_ACTION_QUEUE_ACTION_TYPES = [
  "event_reminder",
  "post_event_followup",
  "dormant_activation",
  "message_draft_suggestion",
  "appointment_suggestion",
] as const;

export const AGENT_ACTION_QUEUE_ERROR_CODES = [
  "AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED",
  "AGENT_ACTION_QUEUE_ACTION_NOT_FOUND",
  "AGENT_ACTION_QUEUE_EMPTY",
  "AGENT_ACTION_QUEUE_PENDING",
  "AGENT_ACTION_QUEUE_MOCK_FAILED",
] as const;

export type AgentActionType =
  (typeof AGENT_ACTION_QUEUE_ACTION_TYPES)[number];

export type AgentActionQueueErrorCode =
  (typeof AGENT_ACTION_QUEUE_ERROR_CODES)[number];

export type AgentActionQueueScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type AgentActionQueueState = "success" | "empty" | "pending";

export type AgentActionDecision = "accepted" | "dismissed";

export type AgentActionPriority = "high" | "medium" | "low";

export interface AgentActionQueueListInput {
  scenario?: AgentActionQueueScenario | string | null;
  actionType?: AgentActionType | string | null;
}

export interface AgentActionDecisionInput {
  actionId?: string | null;
  scenario?: AgentActionQueueScenario | string | null;
  actorLabel?: string | null;
}

export interface AgentActionQueueErrorDefinition {
  code: AgentActionQueueErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const AGENT_ACTION_QUEUE_ERROR_DEFINITIONS = {
  AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED: {
    code: "AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An agent action id is required before resolving a queue fixture.",
    recovery:
      "Keep action decision controls disabled until a known local action fixture is selected.",
  },
  AGENT_ACTION_QUEUE_ACTION_NOT_FOUND: {
    code: "AGENT_ACTION_QUEUE_ACTION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock agent action queue fixture matches that action id.",
    recovery:
      "Render the missing-action envelope and avoid autonomous execution, external side effects, providers, devices, databases, or external networks.",
  },
  AGENT_ACTION_QUEUE_EMPTY: {
    code: "AGENT_ACTION_QUEUE_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock agent actions can be queued because no relationship context, event evidence, or source-backed next step is available.",
    recovery:
      "Add relationship context, event evidence, or a sourced follow-up before showing agent action queue suggestions.",
  },
  AGENT_ACTION_QUEUE_PENDING: {
    code: "AGENT_ACTION_QUEUE_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock agent action queue is waiting for a local confirmation review.",
    recovery:
      "Render the pending state and do not call agent jobs, AI providers, calendars, email, notifications, devices, databases, or external networks.",
  },
  AGENT_ACTION_QUEUE_MOCK_FAILED: {
    code: "AGENT_ACTION_QUEUE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock agent action queue boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry autonomous agent execution, external actions, AI providers, calendars, email, notifications, devices, databases, or external networks.",
  },
} as const satisfies Record<
  AgentActionQueueErrorCode,
  AgentActionQueueErrorDefinition
>;

export type AgentActionSourceReference = SourceReferenceDTO & {
  type:
    | "manual"
    | "event_import"
    | "email_signal"
    | "calendar_signal"
    | "chat_summary"
    | "agent_action"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-agent-action-rules";
};

export interface AgentActionQueueProvenance {
  source: typeof AGENT_ACTION_QUEUE_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-agent-action-queue-only";
  generationMethod:
    | "fixture"
    | "rule-based-agent-action"
    | "rule-based-user-decision"
    | "rule-based-state";
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

export interface AgentActionQueueItem {
  actionId: string;
  actionType: AgentActionType;
  title: string;
  contactName: string;
  organization: string;
  priority: AgentActionPriority;
  recommendedAction: string;
  reason: string;
  dueLabel: string;
  confirmationRequired: boolean;
  sourceRefs: readonly AgentActionSourceReference[];
  evidenceIds: readonly string[];
  provenance: AgentActionQueueProvenance;
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface AgentActionQueuePayload {
  state: AgentActionQueueState;
  actions: readonly AgentActionQueueItem[];
  summary: string;
  provenance: AgentActionQueueProvenance;
  nextAction: string;
}

export interface AgentActionDecisionPayload {
  state: AgentActionQueueState;
  actionId: string;
  actionTitle: string;
  decision: AgentActionDecision;
  actorLabel: string;
  decidedAt: string;
  confirmationRequired: boolean;
  externalSideEffectExecuted: false;
  autonomousExecutionStarted: false;
  evidenceIds: readonly string[];
  provenance: AgentActionQueueProvenance;
  nextAction: string;
}

export interface AgentActionQueueSuccess {
  success: true;
  data: AgentActionQueuePayload;
}

export interface AgentActionDecisionSuccess {
  success: true;
  data: AgentActionDecisionPayload;
}

export interface AgentActionQueueFailure {
  success: false;
  error: AgentActionQueueErrorDefinition & {
    state: "failure";
    provenance: AgentActionQueueProvenance;
    evidenceIds: readonly string[];
  };
}

export type AgentActionQueueResult =
  | AgentActionQueueSuccess
  | AgentActionQueueFailure;

export type AgentActionDecisionResult =
  | AgentActionDecisionSuccess
  | AgentActionQueueFailure;

export function agentActionQueueFailureToAppError(
  failure: AgentActionQueueFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function agentActionQueueFailureContext(
  failure: AgentActionQueueFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    agentActionQueueErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock agent action queue failure came from deterministic fixture rules.",
    service: "agent-action-queue-mock",
  };
}
