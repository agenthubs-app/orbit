import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const MANUAL_CONTACT_CREATION_FIXTURE_SOURCE =
  "fixture:features/acquisition/manual-contract.ts" as const;

export const MANUAL_CONTACT_CREATION_ERROR_CODES = [
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

export interface ManualContactCreationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-manual-contact-creation-only";
  generationMethod: "fixture" | "rule-based-manual-contact";
}

export interface ManualContactEvidence {
  evidenceId: string;
  source: ManualContactSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-manual-service";
}

export interface ManualContactDuplicateCheck {
  mode: "mock-rule";
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
  ) => ManualContactCreationResult;
  confirmManualContactDraft: (
    input: ManualContactConfirmationInput,
  ) => ManualContactConfirmationResult;
}

const fixtureCollectedAt = "2026-06-25T10:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T10:04:00.000Z";
const fixtureConfirmedAt = "2026-06-25T10:18:00.000Z";

export const mockManualContactSource: ManualContactSourceReference = {
  type: "manual",
  id: "source:manual-note:kenji",
  label: "manual note from climate founders dinner",
};

export const mockManualContactCreationProvenance: ManualContactCreationProvenance =
  {
    source: MANUAL_CONTACT_CREATION_FIXTURE_SOURCE,
    sourceLabel: "Mock manual contact creation fixture",
    evidenceIds: ["evidence:manual-note-kenji"],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-manual-contact-creation-only",
    generationMethod: "fixture",
  };

export const mockEmptyManualContactCreationProvenance: ManualContactCreationProvenance =
  {
    ...mockManualContactCreationProvenance,
    sourceLabel: "Mock empty manual note rule",
    evidenceIds: ["evidence:manual-contact-empty-note"],
    generationMethod: "rule-based-manual-contact",
  };

export const mockPendingManualContactCreationProvenance: ManualContactCreationProvenance =
  {
    ...mockManualContactCreationProvenance,
    sourceLabel: "Mock pending manual contact rule",
    generationMethod: "rule-based-manual-contact",
  };

export const mockManualContactCreationFailureProvenance: ManualContactCreationProvenance =
  {
    ...mockManualContactCreationProvenance,
    sourceLabel: "Mock manual contact controlled failure rule",
    evidenceIds: ["evidence:manual-contact-controlled-failure"],
    generationMethod: "rule-based-manual-contact",
  };

export const mockManualContactEvidence: ManualContactEvidence = {
  evidenceId: "evidence:manual-note-kenji",
  source: mockManualContactSource,
  sourceLabel: "Climate founders dinner note",
  excerpt:
    "Kenji Watanabe from Aster Grid asked for an intro to storage pilot operators after the climate founders dinner.",
  capturedFields: ["source", "note", "tags", "followUpHint"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-manual-service",
};

export const mockManualContactDraft: ManualContactDraft = {
  id: "demo-manual-draft",
  status: "pending_confirmation",
  source: mockManualContactSource,
  displayName: "Kenji Watanabe",
  role: "Head of Partnerships",
  organization: "Aster Grid",
  note:
    "Kenji Watanabe from Aster Grid asked for an intro to storage pilot operators after the climate founders dinner.",
  tags: [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ],
  followUpHint: "Send Kenji the storage pilot operator intro by Friday.",
  relationshipContext:
    "Manual note captured why this relationship exists: climate dinner context, storage pilot interest, and a warm intro path.",
  suggestedNextAction:
    "Confirm the manual draft, then create the contact candidate with the note and follow-up hint attached.",
  duplicateCheck: {
    mode: "mock-rule",
    result: "clear",
    rule: "Normalize manual note name plus organization; flag duplicates only from deterministic fixture keywords.",
    possibleMatchIds: [],
    externalLookupExecuted: false,
  },
  confirmation: {
    required: true,
    state: "pending",
    question: "Confirm adding Kenji Watanabe from the manual note?",
  },
  evidence: [mockManualContactEvidence],
  provenance: mockManualContactCreationProvenance,
  createdAt: fixtureCreatedAt,
};

export const mockManualContactCreationFixture: ManualContactCreationPayload = {
  state: "success",
  draft: mockManualContactDraft,
  summary:
    "One manual contact draft is staged with source, note, tags, follow-up hint, and a mock duplicate check.",
  provenance: mockManualContactCreationProvenance,
  nextAction:
    "Review the manual note evidence before confirming this contact candidate.",
};

export const mockEmptyManualContactCreationFixture: ManualContactCreationPayload =
  {
    state: "empty",
    draft: null,
    summary: "No manual note was supplied, so no contact draft was staged.",
    provenance: mockEmptyManualContactCreationProvenance,
    nextAction: "Capture a manual note before staging a contact draft.",
  };

export const mockPendingManualContactCreationFixture: ManualContactCreationPayload =
  {
    state: "pending",
    draft: mockManualContactDraft,
    summary:
      "A manual note draft is waiting for explicit confirmation before any contact write.",
    provenance: mockPendingManualContactCreationProvenance,
    nextAction:
      "Confirm the manual draft only after checking source evidence and duplicate status.",
  };

export const mockManualContactConfirmedEvidence: ManualContactEvidence = {
  evidenceId: "evidence:manual-contact-confirmed-kenji",
  source: mockManualContactSource,
  sourceLabel: "Operator manual contact confirmation",
  excerpt:
    "Demo operator confirmed Kenji Watanabe after reviewing the manual note, tags, follow-up hint, and mock duplicate check.",
  capturedFields: ["confirmation", "source", "note", "tags", "followUpHint"],
  createdAt: fixtureConfirmedAt,
  createdBy: "mock-manual-service",
};

export const mockManualContactConfirmedDraft: ManualContactDraft = {
  ...mockManualContactDraft,
  status: "confirmed",
  confirmation: {
    ...mockManualContactDraft.confirmation,
    state: "confirmed",
    actorLabel: "Demo operator",
    confirmedAt: fixtureConfirmedAt,
  },
  evidence: [mockManualContactEvidence, mockManualContactConfirmedEvidence],
  provenance: {
    ...mockPendingManualContactCreationProvenance,
    evidenceIds: [
      "evidence:manual-note-kenji",
      "evidence:manual-contact-confirmed-kenji",
    ],
  },
};

export const mockManualContactConfirmedFixture: ManualContactConfirmationPayload =
  {
    state: "confirmed",
    confirmedDraft: mockManualContactConfirmedDraft,
    contactCandidate: {
      candidateId: "contact-candidate:demo-manual-draft",
      displayName: mockManualContactConfirmedDraft.displayName,
      role: mockManualContactConfirmedDraft.role,
      organization: mockManualContactConfirmedDraft.organization,
      relationshipContext: mockManualContactConfirmedDraft.relationshipContext,
      source: mockManualContactConfirmedDraft.source,
      note: mockManualContactConfirmedDraft.note,
      tags: mockManualContactConfirmedDraft.tags,
      followUpHint: mockManualContactConfirmedDraft.followUpHint,
      evidenceIds: mockManualContactConfirmedDraft.provenance.evidenceIds,
      readyForContactWrite: true,
      contactWriteExecuted: false,
      duplicateLookupExecuted: false,
    },
    createdEvidence: mockManualContactConfirmedEvidence,
    confirmedAt: fixtureConfirmedAt,
    provenance: mockManualContactConfirmedDraft.provenance,
    nextAction:
      "Hand this source-backed candidate to the contact record service only after preserving manual note evidence.",
  };

export function manualContactCreationFailureToAppError(
  failure: ManualContactCreationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function manualContactCreationFailureContext(
  failure: ManualContactCreationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    manualContactCreationErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock manual contact creation failure came from deterministic fixture rules.",
    service: "manual-contact-creation-mock",
  };
}
