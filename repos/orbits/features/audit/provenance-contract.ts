import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO, SourceType } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Source Consistency Provenance Audit contract 描述来源一致性和 provenance 完整性检查。
// 当前审计是 mock/rule-based，不写生产审计存储，也不生成真实合规报告。
export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS = [
  "contact",
  "connection",
  "evidence",
  "recommendation",
  "task",
  "chat_summary",
  "agent_action",
] as const;

export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_CODES = [
  "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED",
  "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
] as const;

export type SourceConsistencyProvenanceAuditEntityKind =
  (typeof SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ENTITY_KINDS)[number];

export type SourceConsistencyProvenanceAuditErrorCode =
  (typeof SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_CODES)[number];

export type SourceConsistencyProvenanceAuditScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type SourceConsistencyProvenanceAuditState =
  | "success"
  | "empty"
  | "pending";

export type SourceConsistencyProvenanceAuditSeverity =
  | "high"
  | "medium"
  | "low";

// 输入只控制场景；审计范围由 fixture 定义。
export interface SourceConsistencyProvenanceAuditInput {
  scenario?: SourceConsistencyProvenanceAuditScenario | string | null;
}

export interface SourceConsistencyProvenanceAuditErrorDefinition {
  code: SourceConsistencyProvenanceAuditErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 审计失败时保持本地 mock 边界，不调用 compliance reporting 或生产审计存储。
export const SOURCE_CONSISTENCY_PROVENANCE_AUDIT_ERROR_DEFINITIONS = {
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED: {
    code: "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The live source consistency and provenance audit store is not configured.",
    recovery:
      "Set a live Orbit database URL and workspace id before reading live source consistency and provenance audit records.",
  },
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED: {
    code: "SOURCE_CONSISTENCY_PROVENANCE_AUDIT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock source consistency and provenance audit boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the source consistency and provenance audit mock failure state and do not call compliance reporting, production audit storage, databases, providers, devices, AI, or external networks.",
  },
} as const satisfies Record<
  SourceConsistencyProvenanceAuditErrorCode,
  SourceConsistencyProvenanceAuditErrorDefinition
>;

export type SourceConsistencyProvenanceAuditSourceReference =
  SourceReferenceDTO & {
    type: SourceType;
    label: string;
    providerRecordId: string;
    generatedBy:
      | "mock-source-consistency-provenance-audit-rules"
      | "live-store-query";
  };

// provenance 是审计运行自身的安全账本。
export interface SourceConsistencyProvenanceAuditProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-source-consistency-provenance-audit-only"
    | "live-source-consistency-provenance-audit";
  generationMethod:
    | "fixture"
    | "live-audit-run"
    | "live-store-query"
    | "rule-based-audit-run"
    | "rule-based-state";
  complianceReportingExecuted: false;
  productionAuditStorageWriteExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: boolean;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
}

// AuditedCollection 汇总某一类实体的来源一致性统计。
export interface SourceConsistencyAuditedCollection {
  entityKind: SourceConsistencyProvenanceAuditEntityKind;
  label: string;
  auditedCount: number;
  consistentCount: number;
  inconsistentCount: number;
  sourceConsistent: boolean;
  provenanceComplete: boolean;
  sourceRefs: readonly SourceConsistencyProvenanceAuditSourceReference[];
  evidenceIds: readonly string[];
}

// Finding 是具体来源/证据问题和修复建议。
export interface SourceConsistencyAuditFinding {
  findingId: string;
  entityKind: SourceConsistencyProvenanceAuditEntityKind;
  severity: SourceConsistencyProvenanceAuditSeverity;
  ruleId: string;
  title: string;
  detail: string;
  remediation: string;
  affectedRecordIds: readonly string[];
  sourceConsistent: boolean;
  provenanceComplete: boolean;
  sourceRefs: readonly SourceConsistencyProvenanceAuditSourceReference[];
  evidenceIds: readonly string[];
}

export interface SourceConsistencyProvenanceAuditPayload {
  state: SourceConsistencyProvenanceAuditState;
  activeFindingCount: number;
  auditedCollections: readonly SourceConsistencyAuditedCollection[];
  findings: readonly SourceConsistencyAuditFinding[];
  summary: string;
  provenance: SourceConsistencyProvenanceAuditProvenance;
  nextAction: string;
}

// RunPayload 描述一次审计运行结果，但 productionAuditStorageWritten=false。
export interface SourceConsistencyProvenanceAuditRunPayload {
  state: SourceConsistencyProvenanceAuditState;
  runId: string;
  runStartedAt: string;
  scannedEntityKinds: readonly SourceConsistencyProvenanceAuditEntityKind[];
  evaluatedRecordCount: number;
  activeFindingCount: number;
  generatedFindingIds: readonly string[];
  complianceReportPersisted: false;
  productionAuditStorageWritten: false;
  summary: string;
  provenance: SourceConsistencyProvenanceAuditProvenance;
  nextAction: string;
}

export interface SourceConsistencyProvenanceAuditSuccess {
  success: true;
  data: SourceConsistencyProvenanceAuditPayload;
}

export interface SourceConsistencyProvenanceAuditRunSuccess {
  success: true;
  data: SourceConsistencyProvenanceAuditRunPayload;
}

export interface SourceConsistencyProvenanceAuditFailure {
  success: false;
  error: SourceConsistencyProvenanceAuditErrorDefinition & {
    state: "failure";
    provenance: SourceConsistencyProvenanceAuditProvenance;
    evidenceIds: readonly string[];
  };
}

export type SourceConsistencyProvenanceAuditResult =
  | SourceConsistencyProvenanceAuditSuccess
  | SourceConsistencyProvenanceAuditFailure;

export type SourceConsistencyProvenanceAuditRunResult =
  | SourceConsistencyProvenanceAuditRunSuccess
  | SourceConsistencyProvenanceAuditFailure;

export interface SourceConsistencyProvenanceAuditService {
  getAuditSnapshot: (
    input?: SourceConsistencyProvenanceAuditInput,
  ) =>
    | Promise<SourceConsistencyProvenanceAuditResult>
    | SourceConsistencyProvenanceAuditResult;
  runAudit: (
    input?: SourceConsistencyProvenanceAuditInput,
  ) =>
    | Promise<SourceConsistencyProvenanceAuditRunResult>
    | SourceConsistencyProvenanceAuditRunResult;
}

export function sourceConsistencyProvenanceAuditFailureToAppError(
  failure: SourceConsistencyProvenanceAuditFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function sourceConsistencyProvenanceAuditFailureContext(
  failure: SourceConsistencyProvenanceAuditFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive = mode === "live";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live source consistency provenance audit failure came from live record store configuration."
        : "Mock source consistency provenance audit failure came from deterministic fixture rules.",
    service: isLive
      ? "source-consistency-and-provenance-audit-live"
      : "source-consistency-and-provenance-audit",
    sourceConsistencyProvenanceAuditErrorCode: failure.error.code,
  };
}
