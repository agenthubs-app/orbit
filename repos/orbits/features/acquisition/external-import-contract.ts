import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// External Contacts Import contract 描述从手机、Google Contacts、CSV 或客户列表导入候选人。
// 当前只模拟导入候选和草稿，不读取真实设备通讯录、不解析大文件、不启动生产导入任务。
export const EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS = [
  "phone",
  "google_contacts",
  "csv",
  "existing_customer_list",
] as const;

export type ExternalContactsImportSourceKind =
  (typeof EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS)[number];

export const EXTERNAL_CONTACTS_IMPORT_ERROR_CODES = [
  "EXTERNAL_CONTACTS_IMPORT_SOURCE_REQUIRED",
  "EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED",
  "EXTERNAL_CONTACTS_IMPORT_PENDING",
  "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED",
  "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
  "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED",
] as const;

export type ExternalContactsImportErrorCode =
  (typeof EXTERNAL_CONTACTS_IMPORT_ERROR_CODES)[number];

export type ExternalContactsImportScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ExternalContactsImportState = "success" | "empty" | "pending";
export type ExternalContactsImportConfidence = "high" | "medium" | "low";

// sourceKind 选择 mock 来源；scenario 锁定测试状态。
export interface ExternalContactsImportInput {
  sourceKind?: ExternalContactsImportSourceKind | string | null;
  scenario?: ExternalContactsImportScenario | string | null;
}

export interface ExternalContactsImportErrorDefinition {
  code: ExternalContactsImportErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 错误定义覆盖未选择来源、不支持来源、pending 和受控失败。
export const EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS = {
  EXTERNAL_CONTACTS_IMPORT_SOURCE_REQUIRED: {
    code: "EXTERNAL_CONTACTS_IMPORT_SOURCE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "Choose a mock external contacts source before importing.",
    recovery:
      "Keep the external import in the empty state until a local source fixture is selected.",
  },
  EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED: {
    code: "EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED",
    appCode: "VALIDATION_ERROR",
    message:
      "That mock external contacts import source is not supported by this sprint boundary.",
    recovery:
      "Use phone, Google Contacts, CSV, or existing customer-list fixture sources only.",
  },
  EXTERNAL_CONTACTS_IMPORT_PENDING: {
    code: "EXTERNAL_CONTACTS_IMPORT_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock external contacts import is waiting for local fixture review.",
    recovery:
      "Render the pending state and avoid staging external contact drafts until the fixture is ready.",
  },
  EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED: {
    code: "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock external contacts import boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying provider sync, device reads, file parsing, databases, messages, or production jobs.",
  },
  EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED: {
    code: "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live external contacts import store is not configured.",
    recovery:
      "Configure the live record store before reading source-backed external contact candidates.",
  },
  EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED: {
    code: "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live external contacts import store could not be read.",
    recovery:
      "Keep external contact import in review mode and retry only after the live record store is healthy.",
  },
} as const satisfies Record<
  ExternalContactsImportErrorCode,
  ExternalContactsImportErrorDefinition
>;

export type ExternalContactsSourceReference = SourceReferenceDTO & {
  type: "external_contacts";
  label: string;
  sourceKind: ExternalContactsImportSourceKind;
  batchId: string;
};

// provenance 是外部联系人导入的安全账本，所有真实 provider/file/job 写入都为 false。
export interface ExternalContactsImportProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-external-contacts-import-only"
    | "live-external-contacts-import";
  generationMethod:
    | "fixture"
    | "rule-based-external-contacts-import"
    | "live-store-query";
  liveDatabaseReadExecuted?: boolean;
  phoneAddressBookReadExecuted: false;
  googleContactsSyncExecuted: false;
  csvParsedAtScale: false;
  customerListJobExecuted: false;
  externalNetworkRequested: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  notificationDelivered: false;
}

// source summary 告诉 UI 当前 mock 来源的候选数量和权限/上传状态。
export interface ExternalContactsSourceSummary {
  kind: ExternalContactsImportSourceKind;
  label: string;
  candidateCount: number;
  permissionState:
    | "mock-granted"
    | "mock-uploaded"
    | "mock-linked"
    | "live-indexed"
    | "live-linked"
    | "live-uploaded";
  source: ExternalContactsSourceReference;
  providerSyncRequested: false;
  fileParsingAtScale: false;
  productionImportJobEnqueued: false;
}

export interface ExternalContactsEvidence {
  evidenceId: string;
  source: ExternalContactsSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy:
    | "mock-external-contacts-import-service"
    | "live-external-contacts-import-service";
}

// candidate 是待复核候选人，不是已经创建的联系人。
export interface ExternalContactCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  sourceKind: ExternalContactsImportSourceKind;
  relationshipContext: string;
  suggestedNextAction: string;
  confidence: ExternalContactsImportConfidence;
  source: ExternalContactsSourceReference;
  evidenceIds: readonly string[];
  duplicateHint: string | null;
  importEligible: true;
  readyForReview: true;
  providerSyncRequested: false;
  contactWriteExecuted: false;
  databaseWriteExecuted: false;
  fileParsingAtScale: false;
  productionImportJobEnqueued: false;
}

export interface ExternalContactDraft {
  id: string;
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  sourceKind: ExternalContactsImportSourceKind;
  relationshipContext: string;
  suggestedNextAction: string;
  confidence: ExternalContactsImportConfidence;
  source: ExternalContactsSourceReference;
  evidence: readonly ExternalContactsEvidence[];
  provenance: ExternalContactsImportProvenance;
  readyForReview: true;
  providerSyncRequested: false;
  contactWriteExecuted: false;
  databaseWriteExecuted: false;
  notificationDelivered: false;
  productionImportJobEnqueued: false;
}

export interface ExternalContactsCandidatesPayload {
  state: ExternalContactsImportState;
  sources: readonly ExternalContactsSourceSummary[];
  candidates: readonly ExternalContactCandidate[];
  summary: string;
  provenance: ExternalContactsImportProvenance;
  nextAction: string;
}

export interface ExternalContactsImportPayload
  extends ExternalContactsCandidatesPayload {
  contactDrafts: readonly ExternalContactDraft[];
}

export interface ExternalContactsCandidatesSuccess {
  success: true;
  data: ExternalContactsCandidatesPayload;
}

export interface ExternalContactsImportSuccess {
  success: true;
  data: ExternalContactsImportPayload;
}

export interface ExternalContactsImportFailure {
  success: false;
  error: ExternalContactsImportErrorDefinition & {
    state: "failure";
    provenance: ExternalContactsImportProvenance;
    evidenceIds: readonly string[];
  };
}

export type ExternalContactsCandidatesResult =
  | ExternalContactsCandidatesSuccess
  | ExternalContactsImportFailure;

export type ExternalContactsImportResult =
  | ExternalContactsImportSuccess
  | ExternalContactsImportFailure;

export type ExternalContactsCandidatesServiceResult =
  | ExternalContactsCandidatesResult
  | Promise<ExternalContactsCandidatesResult>;

export type ExternalContactsImportServiceResult =
  | ExternalContactsImportResult
  | Promise<ExternalContactsImportResult>;

export interface ExternalContactsImportService {
  listExternalContactCandidates: (
    input?: ExternalContactsImportInput,
  ) => ExternalContactsCandidatesServiceResult;
  importExternalContacts: (
    input?: ExternalContactsImportInput,
  ) => ExternalContactsImportServiceResult;
}

export function externalContactsImportFailureToAppError(
  failure: ExternalContactsImportFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function externalContactsImportFailureContext(
  failure: ExternalContactsImportFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive =
    failure.error.provenance.privacy === "live-external-contacts-import";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    externalContactsImportErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLive
        ? "Live external contacts import failure came from the shared live record store boundary."
        : "Mock external contacts import failure came from deterministic fixture rules.",
    service: isLive
      ? "external-contacts-import-live"
      : "external-contacts-import-mock",
  };
}
