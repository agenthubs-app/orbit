import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Duplicate Detection Merge contract 描述导入候选人与既有联系人之间的合并建议。
// 它只给出可复核合并计划，默认不执行破坏性 merge 或数据库写入。
export const DUPLICATE_DETECTION_MATCH_REASONS = [
  "email",
  "name_organization",
  "event_context",
  "referral_context",
] as const;

export type DuplicateDetectionMatchReason =
  (typeof DUPLICATE_DETECTION_MATCH_REASONS)[number];

export const DUPLICATE_DETECTION_MERGE_ERROR_CODES = [
  "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED",
  "DUPLICATE_MERGE_LIVE_STORE_FAILED",
  "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND",
  "DUPLICATE_MERGE_PENDING_REVIEW",
  "DUPLICATE_MERGE_CONFIRMATION_BLOCKED",
  "DUPLICATE_DETECTION_MERGE_MOCK_FAILED",
] as const;

export type DuplicateDetectionMergeErrorCode =
  (typeof DUPLICATE_DETECTION_MERGE_ERROR_CODES)[number];

export type DuplicateDetectionMergeScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type DuplicateMergeApplyScenario =
  | "success"
  | "pending"
  | "blocked"
  | "failure";

export type DuplicateDetectionMergeState = "success" | "empty" | "pending";
export type DuplicateDetectionConfidence = "high" | "medium" | "low";

// suggestion 输入读取合并建议；apply 输入必须指定 suggestionId 和确认场景。
export interface DuplicateMergeSuggestionInput {
  scenario?: DuplicateDetectionMergeScenario | string | null;
}

export interface DuplicateMergeApplyInput {
  suggestionId: string;
  actorLabel?: string | null;
  scenario?: DuplicateMergeApplyScenario | string | null;
}

export interface DuplicateDetectionMergeErrorDefinition {
  code: DuplicateDetectionMergeErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 合并错误定义把 pending review 和 destructive merge blocked 明确区分。
export const DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS = {
  DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED: {
    code: "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live duplicate detection and merge store is not configured.",
    recovery:
      "Configure the shared live record store before running live duplicate detection, or switch this capability back to mock mode.",
  },
  DUPLICATE_MERGE_LIVE_STORE_FAILED: {
    code: "DUPLICATE_MERGE_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live duplicate detection and merge boundary failed.",
    recovery:
      "Surface the live duplicate merge failure without applying a merge, writing contacts, or retrying external providers.",
  },
  DUPLICATE_MERGE_SUGGESTION_NOT_FOUND: {
    code: "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock duplicate merge suggestion matches that id.",
    recovery:
      "Keep the imported contact draft and existing contact unchanged while returning a missing suggestion envelope.",
  },
  DUPLICATE_MERGE_PENDING_REVIEW: {
    code: "DUPLICATE_MERGE_PENDING_REVIEW",
    appCode: "CONFLICT",
    message: "The mock duplicate merge suggestion is waiting for local review.",
    recovery:
      "Render the pending state and avoid applying any merge until the local fixture review is complete.",
  },
  DUPLICATE_MERGE_CONFIRMATION_BLOCKED: {
    code: "DUPLICATE_MERGE_CONFIRMATION_BLOCKED",
    appCode: "FORBIDDEN",
    message:
      "The mock duplicate merge confirmation is blocked in this controlled scenario.",
    recovery:
      "Keep both contact records separate and route the operator back through explicit confirmation.",
  },
  DUPLICATE_DETECTION_MERGE_MOCK_FAILED: {
    code: "DUPLICATE_DETECTION_MERGE_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock duplicate detection and merge boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live dedupe, storage, email, calendar, model, notification, or destructive merge work.",
  },
} as const satisfies Record<
  DuplicateDetectionMergeErrorCode,
  DuplicateDetectionMergeErrorDefinition
>;

export type DuplicateMergeSourceReference = SourceReferenceDTO & {
  type: "external_contacts" | "event_import" | "referral";
  label: string;
  batchId: string;
};

// provenance 记录合并流程未执行真实写入、破坏性合并或邮件日历读取。
export interface DuplicateMergeProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-duplicate-merge-only" | "live-duplicate-detection-merge";
  generationMethod:
    | "fixture"
    | "live-store-confirmation"
    | "live-store-query"
    | "rule-based-duplicate-merge";
  liveDatabaseReadExecuted?: boolean;
  externalNetworkRequested: false;
  databaseWriteExecuted: false;
  destructiveMergeExecuted: false;
  importedContactWriteExecuted: false;
  emailCalendarReadExecuted: false;
  aiProviderRequested: false;
  notificationDelivered: false;
}

export interface DuplicateMergeEvidence {
  evidenceId: string;
  source: DuplicateMergeSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "live-duplicate-merge-service" | "mock-duplicate-merge-service";
}

// duplicate candidate 只描述可能重复的两边记录，不自动选边或写入。
export interface ImportedContactDuplicateCandidate {
  candidateId: string;
  importedDraftId: string;
  importedContactName: string;
  importedRole: string;
  importedOrganization: string;
  importedEmail: string;
  existingContactId: string;
  existingContactName: string;
  existingRole: string;
  existingOrganization: string;
  existingEmail: string;
  relationshipContext: string;
  matchReasons: readonly DuplicateDetectionMatchReason[];
  confidence: DuplicateDetectionConfidence;
  source: DuplicateMergeSourceReference;
  evidenceIds: readonly string[];
  importedContactWriteExecuted: false;
  externalLookupExecuted: false;
  aiProviderRequested: false;
}

// field decision 是合并计划里逐字段选择的解释，便于用户复核。
export interface DuplicateMergeFieldDecision {
  field: "displayName" | "role" | "organization" | "email" | "relationshipContext";
  selectedFrom: "imported_draft" | "existing_contact" | "combined";
  value: string;
  reason: string;
}

export interface DuplicateMergeSuggestion {
  id: string;
  candidateId: string;
  importedDraftId: string;
  existingContactId: string;
  decision: "merge_into_existing" | "keep_separate";
  confidence: DuplicateDetectionConfidence;
  summary: string;
  reviewQuestion: string;
  fieldDecisions: readonly DuplicateMergeFieldDecision[];
  evidenceIds: readonly string[];
  provenance: DuplicateMergeProvenance;
  requiresUserConfirmation: true;
  destructiveMergeExecuted: false;
  databaseWriteExecuted: false;
  contactWriteExecuted: false;
  notificationDelivered: false;
}

export interface DuplicateMergeSuggestionsPayload {
  state: DuplicateDetectionMergeState;
  duplicateCandidates: readonly ImportedContactDuplicateCandidate[];
  mergeSuggestions: readonly DuplicateMergeSuggestion[];
  summary: string;
  provenance: DuplicateMergeProvenance;
  nextAction: string;
}

export interface DuplicateMergeConfirmation {
  required: true;
  state: "confirmed";
  question: string;
  actorLabel: string;
  confirmedAt: string;
}

export interface DuplicateMergedContactPreview {
  contactId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  relationshipContext: string;
  evidenceIds: readonly string[];
}

export interface DuplicateMergeApplyPayload {
  state: "confirmed";
  suggestionId: string;
  confirmedBy: string;
  confirmedAt: string;
  appliedSuggestion: DuplicateMergeSuggestion;
  mergedContactPreview: DuplicateMergedContactPreview;
  confirmation: DuplicateMergeConfirmation;
  createdEvidence: DuplicateMergeEvidence;
  fieldDecisions: readonly DuplicateMergeFieldDecision[];
  provenance: DuplicateMergeProvenance;
  nextAction: string;
  mergeWriteExecuted: false;
  destructiveMergeExecuted: false;
  databaseWriteExecuted: false;
  contactWriteExecuted: false;
  notificationDelivered: false;
}

export interface DuplicateMergeSuggestionsSuccess {
  success: true;
  data: DuplicateMergeSuggestionsPayload;
}

export interface DuplicateMergeApplySuccess {
  success: true;
  data: DuplicateMergeApplyPayload;
}

export interface DuplicateDetectionMergeFailure {
  success: false;
  error: DuplicateDetectionMergeErrorDefinition & {
    state: "failure";
    provenance: DuplicateMergeProvenance;
    evidenceIds: readonly string[];
  };
}

export type DuplicateMergeSuggestionsResult =
  | DuplicateMergeSuggestionsSuccess
  | DuplicateDetectionMergeFailure;

export type DuplicateMergeApplyResult =
  | DuplicateMergeApplySuccess
  | DuplicateDetectionMergeFailure;

export type DuplicateDetectionMergeServiceResult<TResult> =
  | Promise<TResult>
  | TResult;

export interface DuplicateDetectionMergeService {
  listMergeSuggestions: (
    input?: DuplicateMergeSuggestionInput,
  ) => DuplicateDetectionMergeServiceResult<DuplicateMergeSuggestionsResult>;
  applyMergeSuggestion: (
    input: DuplicateMergeApplyInput,
  ) => DuplicateDetectionMergeServiceResult<DuplicateMergeApplyResult>;
}

export function duplicateMergeFailureToAppError(
  failure: DuplicateDetectionMergeFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function duplicateMergeFailureContext(
  failure: DuplicateDetectionMergeFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive =
    failure.error.provenance.privacy === "live-duplicate-detection-merge";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    duplicateMergeErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLive
      ? "Live duplicate merge failure came from the shared live record store boundary."
      : "Mock duplicate merge failure came from deterministic fixture rules.",
    service: isLive
      ? "duplicate-detection-and-merge-live"
      : "duplicate-detection-and-merge-mock",
  };
}
