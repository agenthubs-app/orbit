import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE =
  "fixture:features/agent/external-action-contract.ts" as const;

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
  source: typeof EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE;
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

const collectedAt = "2026-06-25T23:58:00.000+09:00";
const recordedAt = "2026-06-25T23:59:00.000+09:00";

export const mockExternalActionSandboxProvenance: ExternalActionSandboxProvenance =
  {
    source: EXTERNAL_ACTION_SANDBOX_FIXTURE_SOURCE,
    sourceLabel: "Mock external action sandbox fixture",
    evidenceIds: [
      "evidence:external-action:message:maya-chen",
      "evidence:external-action:calendar:diego-rivera",
      "evidence:external-action:notification:aiko-tanaka",
    ],
    collectedAt,
    privacy: "demo-external-action-sandbox-only",
    generationMethod: "fixture",
    explicitConfirmationRequired: true,
    explicitConfirmationRecorded: true,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    messageProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    pushProviderRequested: false,
    deviceRequested: false,
  };

export const mockExternalActionSandboxNoOpProvenance: ExternalActionSandboxProvenance =
  {
    ...mockExternalActionSandboxProvenance,
    sourceLabel: "Mock external action sandbox no-op result",
    generationMethod: "rule-based-no-op",
  };

export const mockExternalActionSandboxFailureProvenance: ExternalActionSandboxProvenance =
  {
    ...mockExternalActionSandboxProvenance,
    sourceLabel: "Mock external action sandbox controlled failure",
    evidenceIds: ["evidence:external-action:controlled-failure"],
    generationMethod: "rule-based-state",
    explicitConfirmationRecorded: false,
  };

const emptyStateProvenance: ExternalActionSandboxProvenance = {
  ...mockExternalActionSandboxProvenance,
  sourceLabel: "Mock external action sandbox empty audit state",
  evidenceIds: ["evidence:external-action:empty-state"],
  generationMethod: "rule-based-state",
  explicitConfirmationRecorded: false,
};

const pendingStateProvenance: ExternalActionSandboxProvenance = {
  ...mockExternalActionSandboxProvenance,
  sourceLabel: "Mock external action sandbox pending confirmation state",
  evidenceIds: ["evidence:external-action:pending-state"],
  generationMethod: "rule-based-state",
  explicitConfirmationRecorded: false,
};

export const mockExternalActionRelationshipContexts = {
  send_message: {
    contactLabel: "Maya Chen",
    eventLabel: "Tokyo Climate Operators Salon",
    connectionOrigin:
      "Met during a pilot reliability discussion after the climate operator demo.",
    followupRationale:
      "Send the reliability memo while the pilot-scope question is still fresh.",
    sourceContextIds: [
      "relationship:maya-chen:pilot-reliability",
      "event:tokyo-climate-operators-salon",
    ],
  },
  create_calendar_event: {
    contactLabel: "Diego Rivera",
    eventLabel: "SaaS Revenue Council Breakfast",
    connectionOrigin:
      "Introduced by Yuki during a partner-pipeline discussion.",
    followupRationale:
      "Reserve a short scoping hold before the partner-intro window closes.",
    sourceContextIds: [
      "relationship:diego-rivera:partner-pipeline",
      "event:saas-revenue-council-breakfast",
    ],
  },
  deliver_notification: {
    contactLabel: "Aiko Tanaka",
    eventLabel: "Climate Operator Breakfast",
    connectionOrigin:
      "Known event host tied to the readiness checklist for the breakfast.",
    followupRationale:
      "Remind the operator to review Aiko's context before the event starts.",
    sourceContextIds: [
      "relationship:aiko-tanaka:event-host",
      "event:climate-operator-breakfast",
    ],
  },
} as const satisfies Record<
  ExternalActionSandboxActionType,
  ExternalActionRelationshipContext
>;

export const mockExternalActionSandboxActions: readonly ExternalActionSandboxAction[] =
  [
    {
      actionId: "sandbox-message-demo-1",
      actionType: "send_message",
      label: "No-op send message",
      targetLabel: "Maya Chen",
      relationshipContext: mockExternalActionRelationshipContexts.send_message,
      providerKind: "message_provider",
      requestedEffect:
        "Send Maya the promised reliability memo and pilot-scope question.",
      suppressedEffect:
        "Message provider request suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:message:maya-chen",
      evidenceIds: ["evidence:external-action:message:maya-chen"],
      provenance: mockExternalActionSandboxProvenance,
    },
    {
      actionId: "sandbox-calendar-demo-1",
      actionType: "create_calendar_event",
      label: "No-op create calendar event",
      targetLabel: "Diego Rivera",
      relationshipContext:
        mockExternalActionRelationshipContexts.create_calendar_event,
      providerKind: "calendar_provider",
      requestedEffect:
        "Create a 20-minute pilot scoping hold with Diego next week.",
      suppressedEffect:
        "Calendar write suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:calendar:diego-rivera",
      evidenceIds: ["evidence:external-action:calendar:diego-rivera"],
      provenance: mockExternalActionSandboxProvenance,
    },
    {
      actionId: "sandbox-notification-demo-1",
      actionType: "deliver_notification",
      label: "No-op notification delivery",
      targetLabel: "Aiko Tanaka",
      relationshipContext:
        mockExternalActionRelationshipContexts.deliver_notification,
      providerKind: "notification_provider",
      requestedEffect:
        "Deliver a readiness reminder before the Climate Operator Breakfast.",
      suppressedEffect:
        "Notification and push delivery suppressed by the mock external action sandbox.",
      noOp: true,
      confirmationRequired: true,
      confirmationId: "confirmation:external-action:notification:aiko-tanaka",
      evidenceIds: ["evidence:external-action:notification:aiko-tanaka"],
      provenance: mockExternalActionSandboxProvenance,
    },
  ] as const;

function auditRecord(
  action: ExternalActionSandboxAction,
  auditId: string,
): ExternalActionAuditRecord {
  return {
    auditId,
    actionId: action.actionId,
    actionType: action.actionType,
    providerKind: action.providerKind,
    actorLabel: "Mock operator",
    targetLabel: action.targetLabel,
    relationshipContext: action.relationshipContext,
    noOp: true,
    sideEffectExecuted: false,
    productionAuditPersisted: false,
    recordedAt,
    evidenceIds: action.evidenceIds,
    provenance: mockExternalActionSandboxNoOpProvenance,
  };
}

export const mockExternalActionAuditRecords: readonly ExternalActionAuditRecord[] =
  [
    auditRecord(
      mockExternalActionSandboxActions[0],
      "audit:external-action:message:maya-chen",
    ),
    auditRecord(
      mockExternalActionSandboxActions[1],
      "audit:external-action:calendar:diego-rivera",
    ),
    auditRecord(
      mockExternalActionSandboxActions[2],
      "audit:external-action:notification:aiko-tanaka",
    ),
  ] as const;

function noOpPayload(
  action: ExternalActionSandboxAction,
  audit: ExternalActionAuditRecord,
): ExternalActionNoOpPayload {
  return {
    state: "success",
    actionId: action.actionId,
    actionType: action.actionType,
    label: action.label,
    targetLabel: action.targetLabel,
    actorLabel: "Mock operator",
    providerKind: action.providerKind,
    relationshipContext: action.relationshipContext,
    noOp: true,
    providerRequestIssued: false,
    externalSideEffectExecuted: false,
    auditRecord: audit,
    evidenceIds: action.evidenceIds,
    provenance: mockExternalActionSandboxNoOpProvenance,
    nextAction:
      "Review the side-effect audit record and keep the live provider switch disabled until replacement tests pass.",
  };
}

export const mockSendMessageNoOpFixture: ExternalActionNoOpPayload = noOpPayload(
  mockExternalActionSandboxActions[0],
  mockExternalActionAuditRecords[0],
);

export const mockCreateCalendarEventNoOpFixture: ExternalActionNoOpPayload =
  noOpPayload(
    mockExternalActionSandboxActions[1],
    mockExternalActionAuditRecords[1],
  );

export const mockNotificationDeliveryNoOpFixture: ExternalActionNoOpPayload =
  noOpPayload(
    mockExternalActionSandboxActions[2],
    mockExternalActionAuditRecords[2],
  );

export const mockExternalActionSandboxFixture: ExternalActionSandboxPayload = {
  state: "success",
  actions: mockExternalActionSandboxActions,
  auditRecords: mockExternalActionAuditRecords,
  summary:
    "Mock external action sandbox replaces message sending, calendar writes, email sends, push delivery, notification delivery, and side-effect audit records with deterministic no-op fixtures.",
  provenance: mockExternalActionSandboxProvenance,
  nextAction:
    "Keep every participant-facing action in the sandbox until explicit confirmation, privacy review, and live replacement tests are ready.",
};

export const mockEmptyExternalActionAuditFixture: ExternalActionSandboxPayload =
  {
    state: "empty",
    actions: [],
    auditRecords: [],
    summary:
      "The local external action sandbox has no side-effect audit records because no confirmed action has been staged.",
    provenance: emptyStateProvenance,
    nextAction:
      "Stage a confirmed action before expecting a side-effect audit record.",
  };

export const mockPendingExternalActionSandboxFixture: ExternalActionSandboxPayload =
  {
    state: "pending",
    actions: [],
    auditRecords: [],
    summary:
      "The local external action sandbox is waiting for an explicit confirmation checkpoint.",
    provenance: pendingStateProvenance,
    nextAction:
      "Require explicit confirmation before the sandbox can create any no-op audit record.",
  };

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
