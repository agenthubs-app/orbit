import type {
  RelationshipStage,
  SourceReferenceDTO,
  SourceType,
} from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";

export const CONNECTION_EVIDENCE_SERVICE_FIXTURE_SOURCE =
  "fixture:features/connections/fixtures.ts" as const;

export const CONNECTION_EVIDENCE_SOURCE_TYPES = [
  "manual",
  "event_import",
  "email_signal",
  "calendar_signal",
  "referral",
  "chat_summary",
  "agent_action",
] as const satisfies readonly SourceType[];

export type ConnectionEvidenceSourceType =
  (typeof CONNECTION_EVIDENCE_SOURCE_TYPES)[number];

export const CONNECTION_EVIDENCE_CONTRIBUTIONS = [
  "origin",
  "context",
  "follow_up_signal",
  "introduced_by",
  "user_note",
] as const;

export type ConnectionEvidenceContribution =
  (typeof CONNECTION_EVIDENCE_CONTRIBUTIONS)[number];

export const CONNECTION_EVIDENCE_SERVICE_ERROR_CODES = [
  "CONNECTION_NOT_FOUND",
  "CONNECTION_EVIDENCE_INVALID_BODY",
  "CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED",
  "CONNECTION_EVIDENCE_ADD_PENDING",
  "CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED",
] as const;

export type ConnectionEvidenceErrorCode =
  (typeof CONNECTION_EVIDENCE_SERVICE_ERROR_CODES)[number];

export type ConnectionEvidenceScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ConnectionEvidenceState = "success" | "empty" | "pending";

export interface ConnectionEvidenceErrorDefinition {
  code: ConnectionEvidenceErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CONNECTION_EVIDENCE_SERVICE_ERROR_DEFINITIONS = {
  CONNECTION_NOT_FOUND: {
    code: "CONNECTION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "That mock connection is not available in this sprint boundary.",
    recovery:
      "Use demo-connection-1 or select an explicit empty-state scenario before reviewing connection evidence.",
  },
  CONNECTION_EVIDENCE_INVALID_BODY: {
    code: "CONNECTION_EVIDENCE_INVALID_BODY",
    appCode: "VALIDATION_ERROR",
    message: "The mock add-evidence request body must be valid JSON.",
    recovery:
      "Send a JSON object with supported source link, contribution, title, excerpt, and occurredAt fields.",
  },
  CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED: {
    code: "CONNECTION_EVIDENCE_SOURCE_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message:
      "That mock evidence source link is not supported by this sprint boundary.",
    recovery:
      "Use one of the local connection evidence source types declared in the connections contract.",
  },
  CONNECTION_EVIDENCE_ADD_PENDING: {
    code: "CONNECTION_EVIDENCE_ADD_PENDING",
    appCode: "CONFLICT",
    message: "The mock evidence add request is waiting for fixture review.",
    recovery:
      "Render the pending state and avoid writing to a database, evidence store, audit log, provider, or notification channel.",
  },
  CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED: {
    code: "CONNECTION_EVIDENCE_SERVICE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock connection and evidence boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry a database, evidence store, provider, AI, calendar, email, notification, or device call.",
  },
} as const satisfies Record<
  ConnectionEvidenceErrorCode,
  ConnectionEvidenceErrorDefinition
>;

export interface ConnectionSourceLink extends SourceReferenceDTO {
  type: ConnectionEvidenceSourceType;
  label: string;
  evidenceId: string;
  capturedAt: string;
  confidence: "explicit" | "inferred_from_fixture";
}

export interface ConnectionEvidenceTimelineItem {
  evidenceId: string;
  sourceLink: ConnectionSourceLink;
  contribution: ConnectionEvidenceContribution;
  occurredAt: string;
  capturedAt: string;
  title: string;
  excerpt: string;
  createdBy: "mock-connection-and-evidence-service";
}

export interface ConnectionRecord {
  id: string;
  contactId: string;
  displayName: string;
  role: string;
  organization: string;
  location: string;
  connectionReason: string;
  relationshipStage: RelationshipStage;
  strengthScore: number;
  lastTouchedAt: string;
  nextAction: string;
  sourceLinks: readonly ConnectionSourceLink[];
  evidenceTimeline: readonly ConnectionEvidenceTimelineItem[];
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ConnectionEvidenceProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-connection-evidence-only";
  generationMethod: "fixture" | "rule-based-connection-evidence";
  databaseReadExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ConnectionEvidenceLookupInput {
  connectionId: string;
  scenario?: ConnectionEvidenceScenario | string | null;
}

export interface ConnectionEvidenceListInput {
  scenario?: ConnectionEvidenceScenario | string | null;
}

export interface ConnectionAddEvidenceInput extends ConnectionEvidenceLookupInput {
  contribution?: ConnectionEvidenceContribution | string | null;
  evidenceId?: string | null;
  excerpt?: string | null;
  occurredAt?: string | null;
  sourceLabel?: string | null;
  sourceType?: ConnectionEvidenceSourceType | string | null;
  title?: string | null;
}

export interface ConnectionEvidenceListPayload {
  state: ConnectionEvidenceState;
  connections: readonly ConnectionRecord[];
  summary: string;
  provenance: ConnectionEvidenceProvenance;
  nextAction: string;
}

export interface ConnectionEvidenceDetailPayload {
  state: ConnectionEvidenceState;
  connection: ConnectionRecord | null;
  sourceLinks: readonly ConnectionSourceLink[];
  evidenceTimeline: readonly ConnectionEvidenceTimelineItem[];
  summary: string;
  provenance: ConnectionEvidenceProvenance;
  nextAction: string;
  addEvidenceSummary?: string;
}

export interface ConnectionEvidenceListSuccess {
  success: true;
  data: ConnectionEvidenceListPayload;
}

export interface ConnectionEvidenceDetailSuccess {
  success: true;
  data: ConnectionEvidenceDetailPayload;
}

export interface ConnectionEvidenceFailure {
  success: false;
  error: ConnectionEvidenceErrorDefinition & {
    state: "failure";
    provenance: ConnectionEvidenceProvenance;
    evidenceIds: readonly string[];
  };
}

export type ConnectionEvidenceFailureForCode<
  TCode extends ConnectionEvidenceErrorCode,
> = Omit<ConnectionEvidenceFailure, "error"> & {
  error: ConnectionEvidenceFailure["error"] & {
    code: TCode;
  };
};

export type ConnectionEvidenceInvalidBodyFailure =
  ConnectionEvidenceFailureForCode<"CONNECTION_EVIDENCE_INVALID_BODY">;

export type ConnectionEvidenceAddPendingFailure =
  ConnectionEvidenceFailureForCode<"CONNECTION_EVIDENCE_ADD_PENDING">;

export type ConnectionEvidenceListResult =
  | ConnectionEvidenceListSuccess
  | ConnectionEvidenceFailure;

export type ConnectionEvidenceDetailResult =
  | ConnectionEvidenceDetailSuccess
  | ConnectionEvidenceFailure;

export type ConnectionEvidenceAddResult =
  | ConnectionEvidenceDetailSuccess
  | ConnectionEvidenceFailure;
