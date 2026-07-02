import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Followups contract 描述关系跟进任务的生成和展示模型。
// 当前只生成可复核任务建议，不调用调度器、不写任务库、不发送通知。
export const FOLLOWUP_TASK_GENERATION_ERROR_CODES = [
  "FOLLOWUP_TASK_GENERATION_TASK_ID_REQUIRED",
  "FOLLOWUP_TASK_GENERATION_TASK_NOT_FOUND",
  "FOLLOWUP_TASK_GENERATION_EMPTY",
  "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
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

// list 输入用于读取队列；triggerKind/limit 只影响本地 fixture 过滤。
export interface FollowupTaskGenerationListInput {
  scenario?: FollowupTaskGenerationScenario | string | null;
  triggerKind?: FollowupTaskTriggerKind | string | null;
  limit?: number | null;
}

// generate 输入用于从特定触发器或 connection 生成建议任务。
export interface FollowupTaskGenerationGenerateInput {
  scenario?: FollowupTaskGenerationScenario | string | null;
  triggerKinds?: readonly (FollowupTaskTriggerKind | string)[] | null;
  connectionId?: string | null;
  limit?: number | null;
}

// 错误定义区分缺少 task、无 eligible trigger、pending guard 和 mock failure。
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
  FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED: {
    code: "FOLLOWUP_TASK_GENERATION_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The live followup task store is not configured.",
    recovery:
      "Set a live Orbit database URL and workspace id before reading live followup tasks.",
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
  type:
    | "agent_action"
    | "calendar_signal"
    | "email_signal"
    | "event_import"
    | "manual"
    | "system";
  label: string;
  providerRecordId: string;
  generatedBy: string;
};

// Trigger 是任务建议的原因；false 标记说明没有读取真实 scheduler/数据库/provider。
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
  liveDatabaseReadExecuted: boolean;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  externalNetworkRequested: false;
}

// audit 是给 UI/调试页展示的复核提示，提醒任务仍需人工验证证据。
export interface FollowupTaskAudit {
  sourceLabel: string;
  providerBoundary: "scheduler false, AI false, persistence false";
  verificationAction: "Verify evidence";
}

// FollowupTask 是最终建议任务 DTO；它不是已经创建的真实 reminder。
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
  generatedBy: string;
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

// provenance 汇总任务生成方式和所有未触发的外部能力。
export interface FollowupTaskGenerationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-followup-task-generation-only"
    | "live-followup-task-generation";
  generationMethod:
    | "fixture"
    | "live-store-query"
    | "rule-based-task-generation"
    | "rule-based-state"
    | "local-remote-store-query";
  backgroundSchedulerRequested: false;
  liveTaskPersistenceRequested: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// payload 同时返回 triggers 和 tasks，便于 UI 解释每个建议任务从何而来。
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
  const isLive =
    failure.error.provenance.privacy === "live-followup-task-generation";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    followupTaskGenerationErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live followup task generation failure came from shared live storage."
        : "Mock followup task generation failure came from deterministic fixture rules.",
    service: isLive
      ? "followup-task-generation-live"
      : "followup-task-generation-mock",
  };
}
