import type { SourceReferenceDTO, SourceType } from "../../shared/domain/source-types";
import type { AppErrorCode } from "../../shared/errors/app-error";

export const CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES = [
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
] as const satisfies readonly SourceType[];

export const CONTACT_ACQUISITION_DRAFT_ERROR_CODES = [
  "CONTACT_DRAFT_NOT_FOUND",
  "CONTACT_DRAFT_ALREADY_CONFIRMED",
  "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
  "CONTACT_DRAFT_PIPELINE_FAILED",
] as const;

export type ContactAcquisitionDraftSourceType =
  (typeof CONTACT_ACQUISITION_DRAFT_SOURCE_TYPES)[number];

export type ContactAcquisitionDraftErrorCode =
  (typeof CONTACT_ACQUISITION_DRAFT_ERROR_CODES)[number];

export type ContactAcquisitionDraftScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ContactDraftConfirmationScenario =
  | "success"
  | "failure"
  | "blocked";

export type ContactAcquisitionDraftState = "success" | "empty" | "pending";

export type ContactDraftStatus = "pending_confirmation" | "confirmed";

export type ContactDraftConfirmationState = "pending" | "confirmed";

export type ContactDraftConfidence = "high" | "medium" | "low";

export interface ContactAcquisitionDraftInput {
  scenario?: ContactAcquisitionDraftScenario | string | null;
}

export interface ContactDraftConfirmationInput {
  draftId: string;
  actorLabel?: string | null;
  scenario?: ContactDraftConfirmationScenario | string | null;
}

export interface ContactAcquisitionDraftErrorDefinition {
  code: ContactAcquisitionDraftErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS = {
  CONTACT_DRAFT_NOT_FOUND: {
    code: "CONTACT_DRAFT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock contact acquisition draft matches that id.",
    recovery:
      "Keep the relationship graph unchanged and return the missing draft failure envelope.",
  },
  CONTACT_DRAFT_ALREADY_CONFIRMED: {
    code: "CONTACT_DRAFT_ALREADY_CONFIRMED",
    appCode: "CONFLICT",
    message: "That mock contact acquisition draft has already been confirmed.",
    recovery:
      "Refresh the draft queue before confirming another source-backed contact candidate.",
  },
  CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED: {
    code: "CONTACT_DRAFT_CONFIRMATION_NOT_ALLOWED",
    appCode: "FORBIDDEN",
    message:
      "The mock contact acquisition draft cannot be confirmed in this controlled scenario.",
    recovery:
      "Keep the draft pending and show the operator why confirmation is blocked.",
  },
  CONTACT_DRAFT_PIPELINE_FAILED: {
    code: "CONTACT_DRAFT_PIPELINE_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock contact acquisition draft pipeline is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying live OCR, QR, import, email, calendar, storage, AI, or notification work.",
  },
} as const satisfies Record<
  ContactAcquisitionDraftErrorCode,
  ContactAcquisitionDraftErrorDefinition
>;

export type ContactDraftSourceReference = SourceReferenceDTO & {
  type: ContactAcquisitionDraftSourceType;
  label: string;
};

export interface ContactAcquisitionDraftProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-contact-acquisition-drafts-only";
  generationMethod: "fixture" | "rule-based-contact-draft";
}

export interface ContactDraftEvidence {
  evidenceId: string;
  source: ContactDraftSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-pipeline";
}

export interface ContactDraftConfirmation {
  required: true;
  state: ContactDraftConfirmationState;
  question: string;
  confirmedAt?: string;
  actorLabel?: string;
}

export interface ContactAcquisitionDraft {
  id: string;
  status: ContactDraftStatus;
  source: ContactDraftSourceReference;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  suggestedNextAction: string;
  confidence: ContactDraftConfidence;
  createdAt: string;
  confirmation: ContactDraftConfirmation;
  evidence: readonly ContactDraftEvidence[];
  provenance: ContactAcquisitionDraftProvenance;
}

export interface ContactAcquisitionDraftPayload {
  state: ContactAcquisitionDraftState;
  drafts: readonly ContactAcquisitionDraft[];
  summary: string;
  provenance: ContactAcquisitionDraftProvenance;
  nextAction: string;
}

export interface ContactDraftCandidate {
  candidateId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  source: ContactDraftSourceReference;
  evidenceIds: readonly string[];
  readyForContactWrite: true;
  contactWriteExecuted: false;
}

export interface ContactDraftConfirmationPayload {
  state: "confirmed";
  confirmedDraft: ContactAcquisitionDraft;
  contactCandidate: ContactDraftCandidate;
  createdEvidence: ContactDraftEvidence;
  confirmedAt: string;
  provenance: ContactAcquisitionDraftProvenance;
  nextAction: string;
}

export interface ContactAcquisitionDraftSuccess {
  success: true;
  data: ContactAcquisitionDraftPayload;
}

export interface ContactDraftConfirmationSuccess {
  success: true;
  data: ContactDraftConfirmationPayload;
}

export interface ContactAcquisitionDraftFailure {
  success: false;
  error: ContactAcquisitionDraftErrorDefinition & {
    state: "failure";
    provenance: ContactAcquisitionDraftProvenance;
    evidenceIds: readonly string[];
  };
}

export type ContactAcquisitionDraftResult =
  | ContactAcquisitionDraftSuccess
  | ContactAcquisitionDraftFailure;

export type ContactDraftConfirmationResult =
  | ContactDraftConfirmationSuccess
  | ContactAcquisitionDraftFailure;
