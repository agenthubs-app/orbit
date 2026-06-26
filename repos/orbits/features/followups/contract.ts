import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE =
  "fixture:features/followups/fixtures.ts" as const;

export const FOLLOWUP_TASK_GENERATION_ERROR_CODES = [
  "FOLLOWUP_TASK_GENERATION_TASK_ID_REQUIRED",
  "FOLLOWUP_TASK_GENERATION_TASK_NOT_FOUND",
  "FOLLOWUP_TASK_GENERATION_EMPTY",
  "FOLLOWUP_TASK_GENERATION_PENDING",
  "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
] as const;

export type FollowupTaskGenerationErrorCode =
  (typeof FOLLOWUP_TASK_GENERATION_ERROR_CODES)[number];

export type FollowupTaskGenerationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type FollowupTaskGenerationState = "success" | "empty" | "pending";

export type FollowupTaskTriggerKind =
  | "new_connection"
  | "event_encounter"
  | "promised_action"
  | "dormant_relationship";

export type FollowupTaskPriority = "today" | "this_week" | "nurture";

export interface FollowupTaskGenerationListInput {
  scenario?: FollowupTaskGenerationScenario | string | null;
  triggerKind?: FollowupTaskTriggerKind | string | null;
  limit?: number | null;
}

export interface FollowupTaskGenerationGenerateInput {
  scenario?: FollowupTaskGenerationScenario | string | null;
  triggerKinds?: readonly (FollowupTaskTriggerKind | string)[] | null;
  connectionId?: string | null;
  limit?: number | null;
}

export interface FollowupTaskGenerationErrorDefinition {
  code: FollowupTaskGenerationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS = {
  FOLLOWUP_TASK_GENERATION_TASK_ID_REQUIRED: {
    code: "FOLLOWUP_TASK_GENERATION_TASK_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A followup task id is required before resolving a task fixture.",
    recovery:
      "Keep task-specific actions disabled until a known local task fixture is selected.",
  },
  FOLLOWUP_TASK_GENERATION_TASK_NOT_FOUND: {
    code: "FOLLOWUP_TASK_GENERATION_TASK_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock followup task fixture matches that task id.",
    recovery:
      "Render the missing-task envelope and avoid querying task persistence, schedulers, calendars, email, notification, network, database, or AI services.",
  },
  FOLLOWUP_TASK_GENERATION_EMPTY: {
    code: "FOLLOWUP_TASK_GENERATION_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock followup task can be generated because no relationship trigger is eligible.",
    recovery:
      "Add a new connection, record an event encounter, capture promised actions, or review dormant relationships before generating tasks.",
  },
  FOLLOWUP_TASK_GENERATION_PENDING: {
    code: "FOLLOWUP_TASK_GENERATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock followup task generation request is waiting for a local confirmation guard.",
    recovery:
      "Render the pending state and do not call schedulers, task persistence, calendars, email, notifications, external networks, databases, or AI providers.",
  },
  FOLLOWUP_TASK_GENERATION_MOCK_FAILED: {
    code: "FOLLOWUP_TASK_GENERATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock followup task generation boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry background scheduler, live persistence, AI task generation, calendar, email, notification, database, or external network services.",
  },
} as const satisfies Record<
  FollowupTaskGenerationErrorCode,
  FollowupTaskGenerationErrorDefinition
>;

export type FollowupTaskGenerationSourceReference = SourceReferenceDTO & {
  type: "manual" | "event_import" | "calendar_signal" | "email_signal" | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-followup-rules";
};

export interface FollowupTaskTrigger {
  triggerId: string;
  kind: FollowupTaskTriggerKind;
  label: string;
  detail: string;
  occurredAt: string;
  connectionId: string;
  contactName: string;
  organization: string;
  source: FollowupTaskGenerationSourceReference;
  evidenceIds: readonly string[];
  backgroundSchedulerRequested: false;
  liveDatabaseReadExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
}

export interface FollowupTaskAudit {
  sourceLabel: string;
  providerBoundary: "scheduler false, AI false, persistence false";
  verificationAction: "Verify evidence";
}

export interface FollowupTask {
  taskId: string;
  title: string;
  triggerKind: FollowupTaskTriggerKind;
  priority: FollowupTaskPriority;
  dueInDays: number;
  connectionId: string;
  contactName: string;
  organization: string;
  recommendedAction: string;
  rationale: string;
  source: FollowupTaskGenerationSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-followup-rules";
  audit: FollowupTaskAudit;
  backgroundSchedulerRequested: false;
  liveTaskPersistenceRequested: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
}

export interface FollowupTaskGenerationProvenance {
  source: typeof FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-followup-task-generation-only";
  generationMethod:
    | "fixture"
    | "rule-based-task-generation"
    | "rule-based-state";
  backgroundSchedulerRequested: false;
  liveTaskPersistenceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface FollowupTaskGenerationPayload {
  state: FollowupTaskGenerationState;
  triggers: readonly FollowupTaskTrigger[];
  tasks: readonly FollowupTask[];
  summary: string;
  provenance: FollowupTaskGenerationProvenance;
  nextAction: string;
}

export interface FollowupTaskGenerationSuccess {
  success: true;
  data: FollowupTaskGenerationPayload;
}

export interface FollowupTaskGenerationFailure {
  success: false;
  error: FollowupTaskGenerationErrorDefinition & {
    state: "failure";
    provenance: FollowupTaskGenerationProvenance;
    evidenceIds: readonly string[];
  };
}

export type FollowupTaskGenerationResult =
  | FollowupTaskGenerationSuccess
  | FollowupTaskGenerationFailure;

export function followupTaskGenerationFailureToAppError(
  failure: FollowupTaskGenerationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function followupTaskGenerationFailureContext(
  failure: FollowupTaskGenerationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    followupTaskGenerationErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock followup task generation failure came from deterministic fixture rules.",
    service: "followup-task-generation-mock",
  };
}
