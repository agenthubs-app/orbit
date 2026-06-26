import type { AppErrorCode } from "../../shared/errors/app-error";

export const PROFILE_DOCUMENT_EXTRACTION_ERROR_CODES = [
  "PROFILE_DOCUMENT_REQUIRED",
  "PROFILE_DOCUMENT_UNSUPPORTED_TYPE",
  "PROFILE_DOCUMENT_EXTRACTION_FAILED",
] as const;

export type ProfileDocumentExtractionErrorCode =
  (typeof PROFILE_DOCUMENT_EXTRACTION_ERROR_CODES)[number];

export type ProfileDocumentExtractionKind = "resume" | "business-card";

export type ProfileDocumentExtractionScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure"
  | "required"
  | "unsupported-type";

export type ProfileDocumentExtractionState = "success" | "empty" | "pending";

export type ProfileDocumentExtractionConfidence = "high" | "medium" | "low";

export interface ProfileDocumentExtractionErrorDefinition {
  code: ProfileDocumentExtractionErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS = {
  PROFILE_DOCUMENT_REQUIRED: {
    code: "PROFILE_DOCUMENT_REQUIRED",
    appCode: "NOT_FOUND",
    message: "A mock profile document is required before extraction can run.",
    recovery:
      "Render the empty document state and keep the onboarding draft inside the mock boundary.",
  },
  PROFILE_DOCUMENT_UNSUPPORTED_TYPE: {
    code: "PROFILE_DOCUMENT_UNSUPPORTED_TYPE",
    appCode: "VALIDATION_ERROR",
    message:
      "The mock profile document extractor only accepts supported demo document types.",
    recovery:
      "Use a resume PDF/text fixture or a business-card image/text fixture.",
  },
  PROFILE_DOCUMENT_EXTRACTION_FAILED: {
    code: "PROFILE_DOCUMENT_EXTRACTION_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock document extraction path is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying a live OCR, parser, or AI system.",
  },
} as const satisfies Record<
  ProfileDocumentExtractionErrorCode,
  ProfileDocumentExtractionErrorDefinition
>;

export interface ProfileDocumentExtractionInput {
  scenario?: ProfileDocumentExtractionScenario | string | null;
  fileName?: string;
  mimeType?: string;
  text?: string;
}

export interface ProfileDocumentExtractionProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-profile-document-only";
  extractionMethod: "fixture" | "rule-based-text-match";
}

export interface ProfileDocumentFieldEvidence {
  field: string;
  value: string;
  evidenceId: string;
  excerpt: string;
}

export interface ProfileDocumentSuggestedFields {
  headline?: string;
  homeMarket?: string;
  relationshipGoal?: string;
  targetRelationshipTypes?: readonly string[];
  preferredFollowUpWindow?: string;
  preferredIntroChannels?: readonly string[];
}

export interface ProfileDocumentExtractionDraft {
  id: string;
  kind: ProfileDocumentExtractionKind;
  displayName: string;
  headline: string;
  organization: string;
  role: string;
  email?: string;
  phone?: string;
  website?: string;
  homeMarket: string;
  relationshipGoal: string;
  targetRelationshipTypes: readonly string[];
  preferredFollowUpWindow: string;
  preferredIntroChannels: readonly string[];
  confidence: ProfileDocumentExtractionConfidence;
  extractedAt: string;
  evidence: readonly ProfileDocumentFieldEvidence[];
  suggestedProfileFields: ProfileDocumentSuggestedFields;
}

export interface ProfileDocumentExtractionPayload {
  state: ProfileDocumentExtractionState;
  kind: ProfileDocumentExtractionKind;
  draft: ProfileDocumentExtractionDraft | null;
  confidenceSummary: string;
  provenance: ProfileDocumentExtractionProvenance;
  nextAction: string;
}

export interface ProfileDocumentExtractionSuccess {
  success: true;
  data: ProfileDocumentExtractionPayload;
}

export interface ProfileDocumentExtractionFailure {
  success: false;
  error: ProfileDocumentExtractionErrorDefinition & {
    kind: ProfileDocumentExtractionKind;
    state: "failure";
    provenance: ProfileDocumentExtractionProvenance;
    evidenceIds: readonly string[];
  };
}

export type ProfileDocumentExtractionResult =
  | ProfileDocumentExtractionSuccess
  | ProfileDocumentExtractionFailure;

export interface ProfileDocumentExtractionService {
  extractResumeDraft: (
    input?: ProfileDocumentExtractionInput,
  ) => ProfileDocumentExtractionResult;
  extractBusinessCardDraft: (
    input?: ProfileDocumentExtractionInput,
  ) => ProfileDocumentExtractionResult;
}
