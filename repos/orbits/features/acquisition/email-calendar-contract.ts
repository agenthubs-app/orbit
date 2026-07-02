import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Email/Calendar Signal contract 描述从邮件和日历中发现关系线索的 mock 流程。
// 当前只展示 fixture 信号和确认门，不读取真实 Gmail、Calendar 或 Microsoft Graph。
export const EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS = [
  "gmail",
  "google_calendar",
  "microsoft_graph",
] as const;

export type EmailCalendarSignalSourceKind =
  (typeof EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS)[number];

export const EMAIL_CALENDAR_SIGNAL_ERROR_CODES = [
  "EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED",
  "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
  "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
  "EMAIL_CALENDAR_SIGNAL_PENDING",
  "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED",
  "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED",
  "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED",
] as const;

export type EmailCalendarSignalErrorCode =
  (typeof EMAIL_CALENDAR_SIGNAL_ERROR_CODES)[number];

export type EmailCalendarSignalScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EmailCalendarSignalConfirmationScenario =
  | "success"
  | "pending"
  | "blocked"
  | "failure";

export type EmailCalendarSignalState = "success" | "empty" | "pending";
export type EmailCalendarSignalKind =
  | "email_intro"
  | "calendar_meeting"
  | "email_calendar_overlap";
export type EmailCalendarSignalConfidence = "high" | "medium" | "low";

// 错误定义特别强调权限和用户确认：没有 staged permission 不得转换信号。
export interface EmailCalendarSignalErrorDefinition {
  code: EmailCalendarSignalErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS = {
  EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED: {
    code: "EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED",
    appCode: "FORBIDDEN",
    message:
      "Mock email and calendar relationship signals require staged provider permission before review.",
    recovery:
      "Render the permission-required state and avoid live mailbox, calendar, background sync, or provider access.",
  },
  EMAIL_CALENDAR_SIGNAL_NOT_FOUND: {
    code: "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock email and calendar relationship signal matches that id.",
    recovery:
      "Keep the signal queue unchanged and return the missing signal failure envelope.",
  },
  EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED: {
    code: "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
    appCode: "FORBIDDEN",
    message:
      "The mock email and calendar relationship signal requires explicit user confirmation before conversion.",
    recovery:
      "Keep the signal pending until the operator confirms the suggested relationship action.",
  },
  EMAIL_CALENDAR_SIGNAL_PENDING: {
    code: "EMAIL_CALENDAR_SIGNAL_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock email and calendar relationship signal is waiting for local fixture review.",
    recovery:
      "Render the pending state and avoid converting relationship signals until review is complete.",
  },
  EMAIL_CALENDAR_SIGNAL_MOCK_FAILED: {
    code: "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock email and calendar relationship signal boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying Gmail, Google Calendar, Microsoft Graph, background sync, message ingestion, databases, notifications, or provider work.",
  },
  EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED: {
    code: "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live email and calendar signal store is not configured.",
    recovery:
      "Configure the live record store before reading source-backed email and calendar relationship signals.",
  },
  EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED: {
    code: "EMAIL_CALENDAR_SIGNAL_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live email and calendar signal store could not be read.",
    recovery:
      "Keep relationship signals in review mode and retry only after the live record store is healthy.",
  },
} as const satisfies Record<
  EmailCalendarSignalErrorCode,
  EmailCalendarSignalErrorDefinition
>;

export interface EmailCalendarSignalListInput {
  sourceKind?: EmailCalendarSignalSourceKind | string | null;
  scenario?: EmailCalendarSignalScenario | string | null;
}

export interface EmailCalendarSignalConfirmInput {
  signalId: string;
  actorLabel?: string | null;
  scenario?: EmailCalendarSignalConfirmationScenario | string | null;
}

export type EmailCalendarSignalSourceReference = SourceReferenceDTO & {
  type: "email_signal" | "calendar_signal";
  label: string;
  sourceKind: EmailCalendarSignalSourceKind;
  providerRecordId: string;
};

// permission 只表示 mock 授权状态，permissionFlowExecuted=false 表示未走真实 provider。
export interface EmailCalendarSignalPermission {
  required: true;
  state:
    | "mock-granted"
    | "mock-pending"
    | "mock-missing"
    | "live-granted"
    | "live-pending"
    | "live-missing";
  provider: EmailCalendarSignalSourceKind;
  scopes: readonly string[];
  permissionGrantId: string;
  permissionFlowExecuted: false;
  mailboxSyncExecuted: false;
  deviceCalendarReadExecuted: false;
}

// 每条信号转换成联系人/关系动作前都需要用户确认。
export interface EmailCalendarSignalConfirmation {
  required: true;
  state: "pending" | "confirmed";
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

// provenance 是邮件/日历采集边界的安全账本。
export interface EmailCalendarSignalProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-email-calendar-signals-only"
    | "live-email-calendar-signals";
  generationMethod:
    | "fixture"
    | "rule-based-email-calendar-signal"
    | "live-store-query"
    | "live-store-confirmation";
  liveDatabaseReadExecuted?: boolean;
  permissionRequired: true;
  userConfirmationRequired: true;
  gmailApiRequested: false;
  googleCalendarApiRequested: false;
  microsoftGraphApiRequested: false;
  backgroundSyncEnqueued: false;
  messageBodyIngested: false;
  externalNetworkRequested: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  notificationDelivered: false;
}

export interface EmailCalendarSignalEvidence {
  evidenceId: string;
  source: EmailCalendarSignalSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy:
    | "mock-email-calendar-signal-service"
    | "live-email-calendar-signal-service";
  messageBodyIngested: false;
}

export interface EmailCalendarRelationshipSignal {
  id: string;
  source: EmailCalendarSignalSourceReference;
  sourceKind: EmailCalendarSignalSourceKind;
  signalKind: EmailCalendarSignalKind;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  suggestedNextAction: string;
  occurredAt: string;
  confidence: EmailCalendarSignalConfidence;
  permission: EmailCalendarSignalPermission;
  confirmation: EmailCalendarSignalConfirmation;
  evidenceIds: readonly string[];
  evidence: readonly EmailCalendarSignalEvidence[];
  provenance: EmailCalendarSignalProvenance;
  readyForReview: true;
  relationshipWriteExecuted: false;
  gmailApiRequested: false;
  googleCalendarApiRequested: false;
  microsoftGraphApiRequested: false;
  backgroundSyncEnqueued: false;
  messageBodyIngested: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
}

export interface EmailCalendarSignalPayload {
  state: EmailCalendarSignalState;
  signals: readonly EmailCalendarRelationshipSignal[];
  summary: string;
  provenance: EmailCalendarSignalProvenance;
  nextAction: string;
}

export interface EmailCalendarSignalConfirmationPayload {
  state: "confirmed";
  confirmedSignal: EmailCalendarRelationshipSignal;
  createdEvidence: EmailCalendarSignalEvidence;
  confirmedAt: string;
  confirmedBy: string;
  provenance: EmailCalendarSignalProvenance;
  nextAction: string;
  relationshipWriteExecuted: false;
  externalActionExecuted: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
}

export interface EmailCalendarSignalSuccess {
  success: true;
  data: EmailCalendarSignalPayload;
}

export interface EmailCalendarSignalConfirmationSuccess {
  success: true;
  data: EmailCalendarSignalConfirmationPayload;
}

export interface EmailCalendarSignalFailure {
  success: false;
  error: EmailCalendarSignalErrorDefinition & {
    state: "failure";
    provenance: EmailCalendarSignalProvenance;
    evidenceIds: readonly string[];
  };
}

export type EmailCalendarSignalResult =
  | EmailCalendarSignalSuccess
  | EmailCalendarSignalFailure;

export type EmailCalendarSignalConfirmationResult =
  | EmailCalendarSignalConfirmationSuccess
  | EmailCalendarSignalFailure;

export type EmailCalendarSignalServiceResult =
  | EmailCalendarSignalResult
  | Promise<EmailCalendarSignalResult>;

export type EmailCalendarSignalConfirmationServiceResult =
  | EmailCalendarSignalConfirmationResult
  | Promise<EmailCalendarSignalConfirmationResult>;

export interface EmailCalendarSignalService {
  listEmailCalendarSignals: (
    input?: EmailCalendarSignalListInput,
  ) => EmailCalendarSignalServiceResult;
  confirmEmailCalendarSignal: (
    input: EmailCalendarSignalConfirmInput,
  ) => EmailCalendarSignalConfirmationServiceResult;
}

export function emailCalendarSignalFailureToAppError(
  failure: EmailCalendarSignalFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function emailCalendarSignalFailureContext(
  failure: EmailCalendarSignalFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive =
    failure.error.provenance.privacy === "live-email-calendar-signals";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    emailCalendarSignalErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live email and calendar relationship signal failure came from the shared live record store boundary."
        : "Mock email and calendar relationship signal failure came from deterministic fixture rules.",
    service: isLive
      ? "email-calendar-signal-live"
      : "email-and-calendar-relationship-signal-mock",
  };
}
