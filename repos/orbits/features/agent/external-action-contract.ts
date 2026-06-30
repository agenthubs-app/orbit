import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// External Action Sandbox contract 描述外部副作用的 no-op 沙盒。
// 它模拟发送消息、创建日历和通知投递的审计结果，但绝不调用真实 provider。
export const EXTERNAL_ACTION_SANDBOX_ACTION_TYPES = [
  "send_message",
  "create_calendar_event",
  "deliver_notification",
] as const;

export const EXTERNAL_ACTION_SANDBOX_ERROR_CODES = [
  "EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED",
  "EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND",
  "EXTERNAL_ACTION_SANDBOX_EMPTY",
  "EXTERNAL_ACTION_SANDBOX_PENDING",
  "EXTERNAL_ACTION_SANDBOX_MOCK_FAILED",
] as const;

export type ExternalActionSandboxActionType =
  (typeof EXTERNAL_ACTION_SANDBOX_ACTION_TYPES)[number];

export type ExternalActionSandboxErrorCode =
  (typeof EXTERNAL_ACTION_SANDBOX_ERROR_CODES)[number];

export type ExternalActionSandboxScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ExternalActionSandboxState = "success" | "empty" | "pending";

export type ExternalActionSandboxProviderKind =
  | "message_provider"
  | "calendar_provider"
  | "notification_provider";

export type ExternalActionSandboxGenerationMethod =
  | "fixture"
  | "rule-based-no-op"
  | "rule-based-state";

// actionId 指向已确认的本地动作；targetLabel/actorLabel 只用于审计展示。
export interface ExternalActionSandboxInput {
  actionId?: string | null;
  actorLabel?: string | null;
  scenario?: ExternalActionSandboxScenario | string | null;
  targetLabel?: string | null;
}

export interface ExternalActionAuditListInput {
  scenario?: ExternalActionSandboxScenario | string | null;
}

export interface ExternalActionSandboxErrorDefinition {
  code: ExternalActionSandboxErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// sandbox 错误定义强调“返回 envelope，不碰外部 provider”。
export const EXTERNAL_ACTION_SANDBOX_ERROR_DEFINITIONS = {
  EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED: {
    code: "EXTERNAL_ACTION_SANDBOX_ACTION_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "An external action id is required before resolving a sandbox fixture.",
    recovery:
      "Keep sandbox controls disabled until a confirmed local action fixture is selected.",
  },
  EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND: {
    code: "EXTERNAL_ACTION_SANDBOX_ACTION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock external action sandbox fixture matches that action id.",
    recovery:
      "Return the missing-action envelope and keep message, calendar, email, push, device, database, and external network providers untouched.",
  },
  EXTERNAL_ACTION_SANDBOX_EMPTY: {
    code: "EXTERNAL_ACTION_SANDBOX_EMPTY",
    appCode: "CONFLICT",
    message:
      "No side-effect audit record is available because no source-backed confirmed action has entered the sandbox.",
    recovery:
      "Collect a confirmed action and source-backed audit record before showing external action sandbox history.",
  },
  EXTERNAL_ACTION_SANDBOX_PENDING: {
    code: "EXTERNAL_ACTION_SANDBOX_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock external action sandbox is waiting for an explicit confirmation checkpoint.",
    recovery:
      "Render the pending state and do not call message, calendar, email, notification, push, device, database, AI, or external network providers.",
  },
  EXTERNAL_ACTION_SANDBOX_MOCK_FAILED: {
    code: "EXTERNAL_ACTION_SANDBOX_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock external action sandbox boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry message sends, calendar writes, email sends, push delivery, device access, database writes, AI providers, or external networks.",
  },
} as const satisfies Record<
  ExternalActionSandboxErrorCode,
  ExternalActionSandboxErrorDefinition
>;

// provenance 明确记录 confirmation 和 no-op 状态，证明没有执行副作用。
export interface ExternalActionSandboxProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-external-action-sandbox-only";
  generationMethod: ExternalActionSandboxGenerationMethod;
  explicitConfirmationRequired: true;
  explicitConfirmationRecorded: true | false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  aiProviderRequested: false;
  messageProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  pushProviderRequested: false;
  deviceRequested: false;
}

export interface ExternalActionRelationshipContext {
  contactLabel: string;
  eventLabel: string;
  connectionOrigin: string;
  followupRationale: string;
  sourceContextIds: readonly string[];
}

// SandboxAction 描述被抑制的外部动作：requestedEffect 是想做什么，suppressedEffect 是为什么没做。
export interface ExternalActionSandboxAction {
  actionId: string;
  actionType: ExternalActionSandboxActionType;
  label: string;
  targetLabel: string;
  relationshipContext: ExternalActionRelationshipContext;
  providerKind: ExternalActionSandboxProviderKind;
  requestedEffect: string;
  suppressedEffect: string;
  noOp: true;
  confirmationRequired: true;
  confirmationId: string;
  evidenceIds: readonly string[];
  provenance: ExternalActionSandboxProvenance;
}

// AuditRecord 是本地审计视图，不代表生产审计日志已经持久化。
export interface ExternalActionAuditRecord {
  auditId: string;
  actionId: string;
  actionType: ExternalActionSandboxActionType;
  providerKind: ExternalActionSandboxProviderKind;
  actorLabel: string;
  targetLabel: string;
  relationshipContext: ExternalActionRelationshipContext;
  noOp: true;
  sideEffectExecuted: false;
  productionAuditPersisted: false;
  recordedAt: string;
  evidenceIds: readonly string[];
  provenance: ExternalActionSandboxProvenance;
}

export interface ExternalActionSandboxPayload {
  state: ExternalActionSandboxState;
  actions: readonly ExternalActionSandboxAction[];
  auditRecords: readonly ExternalActionAuditRecord[];
  summary: string;
  provenance: ExternalActionSandboxProvenance;
  nextAction: string;
}

export interface ExternalActionNoOpPayload {
  state: ExternalActionSandboxState;
  actionId: string;
  actionType: ExternalActionSandboxActionType;
  label: string;
  targetLabel: string;
  actorLabel: string;
  providerKind: ExternalActionSandboxProviderKind;
  relationshipContext: ExternalActionRelationshipContext;
  noOp: true;
  providerRequestIssued: false;
  externalSideEffectExecuted: false;
  auditRecord: ExternalActionAuditRecord;
  evidenceIds: readonly string[];
  provenance: ExternalActionSandboxProvenance;
  nextAction: string;
}

export interface ExternalActionSandboxSuccess {
  success: true;
  data: ExternalActionSandboxPayload;
}

export interface ExternalActionNoOpSuccess {
  success: true;
  data: ExternalActionNoOpPayload;
}

export interface ExternalActionSandboxFailure {
  success: false;
  error: ExternalActionSandboxErrorDefinition & {
    state: "failure";
    provenance: ExternalActionSandboxProvenance;
    evidenceIds: readonly string[];
  };
}

export type ExternalActionAuditResult =
  | ExternalActionSandboxSuccess
  | ExternalActionSandboxFailure;

export type ExternalActionNoOpResult =
  | ExternalActionNoOpSuccess
  | ExternalActionSandboxFailure;

export interface ExternalActionSandboxService {
  sendMessage: (
    input?: ExternalActionSandboxInput,
  ) => ExternalActionNoOpResult;
  createCalendarEvent: (
    input?: ExternalActionSandboxInput,
  ) => ExternalActionNoOpResult;
  deliverNotification: (
    input?: ExternalActionSandboxInput,
  ) => ExternalActionNoOpResult;
  listAuditRecords: (
    input?: ExternalActionAuditListInput,
  ) => ExternalActionAuditResult;
}

export function externalActionSandboxFailureToAppError(
  failure: ExternalActionSandboxFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function externalActionSandboxFailureContext(
  failure: ExternalActionSandboxFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    externalActionSandboxErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock external action sandbox failure came from deterministic fixture rules.",
    service: "external-action-sandbox-mock",
  };
}
