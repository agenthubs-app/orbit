import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Manual Contact Creation contract 描述人工录入联系人时的 staged draft 流程。
// 手动输入必须先形成草稿并经过确认，不能直接写入联系人图谱。
export const MANUAL_CONTACT_CREATION_ERROR_CODES = [
  "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
  "MANUAL_CONTACT_LIVE_STORE_FAILED",
  "MANUAL_CONTACT_NOTE_REQUIRED",
  "MANUAL_CONTACT_DRAFT_NOT_FOUND",
  "MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED",
  "MANUAL_CONTACT_CREATION_MOCK_FAILED",
] as const;

export type ManualContactCreationErrorCode =
  (typeof MANUAL_CONTACT_CREATION_ERROR_CODES)[number];

export type ManualContactCreationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ManualContactConfirmationScenario =
  | "success"
  | "blocked"
  | "failure";

export type ManualContactCreationState = "success" | "empty" | "pending";
export type ManualContactDraftStatus = "pending_confirmation" | "confirmed";
export type ManualContactConfirmationState = "pending" | "confirmed";
export type ManualContactDuplicateResult = "clear" | "possible_match";

// 错误定义突出 source note 和 confirmation：缺上下文或确认被阻止时不创建草稿。
export interface ManualContactCreationErrorDefinition {
  code: ManualContactCreationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const MANUAL_CONTACT_CREATION_ERROR_DEFINITIONS = {
  MANUAL_CONTACT_NOTE_REQUIRED: {
    code: "MANUAL_CONTACT_NOTE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A manual note is required before staging a contact draft.",
    recovery:
      "Keep the manual intake form open and ask for source context before creating a draft.",
  },
  MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED: {
    code: "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live manual contact creation store is not configured.",
    recovery:
      "Configure the live record store before staging or confirming manual contact drafts.",
  },
  MANUAL_CONTACT_LIVE_STORE_FAILED: {
    code: "MANUAL_CONTACT_LIVE_STORE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live manual contact creation store failed.",
    recovery:
      "Keep the manual intake form open and retry after the live record store is healthy.",
  },
  MANUAL_CONTACT_DRAFT_NOT_FOUND: {
    code: "MANUAL_CONTACT_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock manual contact draft matches that id.",
    recovery:
      "Keep the contact graph unchanged and return the missing manual draft failure envelope.",
  },
  MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED: {
    code: "MANUAL_CONTACT_CONFIRMATION_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "The mock manual contact draft cannot be confirmed in this controlled scenario.",
    recovery:
      "Keep the draft pending and explain why the manual confirmation is blocked.",
  },
  MANUAL_CONTACT_CREATION_MOCK_FAILED: {
    code: "MANUAL_CONTACT_CREATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock manual contact creation boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live persistence, duplicate lookup, AI, calendar, email, or notification work.",
  },
} as const satisfies Record<
  ManualContactCreationErrorCode,
  ManualContactCreationErrorDefinition
>;

export interface ManualContactCreationInput {
  scenario?: ManualContactCreationScenario | string | null;
  source?: Partial<ManualContactSourceReference> | null;
  displayName?: string | null;
  role?: string | null;
  organization?: string | null;
  note?: string | null;
  tags?: readonly string[] | null;
  followUpHint?: string | null;
}

export interface ManualContactConfirmationInput {
  draftId: string;
  actorLabel?: string | null;
  scenario?: ManualContactConfirmationScenario | string | null;
}

export type ManualContactSourceReference = SourceReferenceDTO & {
  type: "manual";
  label: string;
};

// provenance 说明手动草稿来自 demo intake，而不是外部导入。
export interface ManualContactCreationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-manual-contact-creation-only"
    | "live-manual-contact-creation";
  generationMethod:
    | "fixture"
    | "live-store-confirmation"
    | "live-store-manual-contact-draft"
    | "rule-based-manual-contact";
  liveDatabaseReadExecuted?: boolean;
  contactDraftWriteExecuted?: boolean;
  contactWriteExecuted?: false;
  externalNetworkRequested?: false;
}

export interface ManualContactEvidence {
  evidenceId: string;
  source: ManualContactSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "live-manual-contact-service" | "mock-manual-service";
}

// duplicate check 只做 mock 规则判断，不执行真实外部查重或数据库搜索。
export interface ManualContactDuplicateCheck {
  mode: "live-store-review" | "mock-rule";
  result: ManualContactDuplicateResult;
  rule: string;
  possibleMatchIds: readonly string[];
  externalLookupExecuted: false;
}

export interface ManualContactConfirmation {
  required: true;
  state: ManualContactConfirmationState;
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

// ManualContactDraft 是人工录入后的待确认草稿。
export interface ManualContactDraft {
  id: string;
  status: ManualContactDraftStatus;
  source: ManualContactSourceReference;
  displayName: string;
  role: string;
  organization: string;
  note: string;
  tags: readonly string[];
  followUpHint: string;
  relationshipContext: string;
  suggestedNextAction: string;
  duplicateCheck: ManualContactDuplicateCheck;
  confirmation: ManualContactConfirmation;
  evidence: readonly ManualContactEvidence[];
  provenance: ManualContactCreationProvenance;
  createdAt: string;
}

export interface ManualContactCreationPayload {
  state: ManualContactCreationState;
  draft: ManualContactDraft | null;
  summary: string;
  provenance: ManualContactCreationProvenance;
  nextAction: string;
}

export interface ManualContactCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  source: ManualContactSourceReference;
  note: string;
  tags: readonly string[];
  followUpHint: string;
  evidenceIds: readonly string[];
  readyForContactWrite: true;
  contactWriteExecuted: false;
  duplicateLookupExecuted: false;
}

export interface ManualContactConfirmationPayload {
  state: "confirmed";
  confirmedDraft: ManualContactDraft;
  contactCandidate: ManualContactCandidate;
  createdEvidence: ManualContactEvidence;
  confirmedAt: string;
  provenance: ManualContactCreationProvenance;
  nextAction: string;
}

export interface ManualContactCreationSuccess {
  success: true;
  data: ManualContactCreationPayload;
}

export interface ManualContactConfirmationSuccess {
  success: true;
  data: ManualContactConfirmationPayload;
}

export interface ManualContactCreationFailure {
  success: false;
  error: ManualContactCreationErrorDefinition & {
    state: "failure";
    provenance: ManualContactCreationProvenance;
    evidenceIds: readonly string[];
  };
}

export type ManualContactCreationResult =
  | ManualContactCreationSuccess
  | ManualContactCreationFailure;

export type ManualContactConfirmationResult =
  | ManualContactConfirmationSuccess
  | ManualContactCreationFailure;

export interface ManualContactCreationService {
  createManualContactDraft: (
    input?: ManualContactCreationInput,
  ) => ManualContactCreationServiceResult<ManualContactCreationResult>;
  confirmManualContactDraft: (
    input: ManualContactConfirmationInput,
  ) => ManualContactCreationServiceResult<ManualContactConfirmationResult>;
}

export type ManualContactCreationServiceResult<TResult> = TResult | Promise<TResult>;

export function manualContactCreationFailureToAppError(
  failure: ManualContactCreationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function manualContactCreationFailureContext(
  failure: ManualContactCreationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLive =
    failure.error.provenance.privacy === "live-manual-contact-creation";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    manualContactCreationErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLive
      ? "Live manual contact creation failure came from the shared live record store boundary."
      : "Mock manual contact creation failure came from deterministic fixture rules.",
    service: isLive
      ? "manual-contact-creation-live"
      : "manual-contact-creation-mock",
  };
}
