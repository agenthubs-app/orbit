import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const DUPLICATE_DETECTION_MERGE_FIXTURE_SOURCE =
  "fixture:features/acquisition/merge-contract.ts" as const;

export const DUPLICATE_DETECTION_MATCH_REASONS = [
  "email",
  "name_organization",
  "event_context",
  "referral_context",
] as const;

export type DuplicateDetectionMatchReason =
  (typeof DUPLICATE_DETECTION_MATCH_REASONS)[number];

export const DUPLICATE_DETECTION_MERGE_ERROR_CODES = [
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

export const DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS = {
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

export interface DuplicateMergeProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-duplicate-merge-only";
  generationMethod: "fixture" | "rule-based-duplicate-merge";
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
  createdBy: "mock-duplicate-merge-service";
}

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

export interface DuplicateDetectionMergeService {
  listMergeSuggestions: (
    input?: DuplicateMergeSuggestionInput,
  ) => DuplicateMergeSuggestionsResult;
  applyMergeSuggestion: (
    input: DuplicateMergeApplyInput,
  ) => DuplicateMergeApplyResult;
}

const fixtureCollectedAt = "2026-06-25T17:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T17:08:00.000Z";
const defaultConfirmedAt = "2026-06-25T17:16:00.000Z";

export const mockDuplicateMergeSources = {
  externalOmar: {
    type: "external_contacts",
    id: "source:duplicate-merge:external-omar",
    label: "Google Contacts import fixture",
    batchId: "external-batch:google-contacts",
  },
  eventAri: {
    type: "event_import",
    id: "source:duplicate-merge:event-ari",
    label: "Climate dinner attendee fixture",
    batchId: "event-batch:climate-dinner",
  },
  referralNadia: {
    type: "referral",
    id: "source:duplicate-merge:referral-nadia",
    label: "Referral fixture",
    batchId: "referral-batch:operator-intros",
  },
} as const satisfies Record<string, DuplicateMergeSourceReference>;

export const mockDuplicateMergeProvenance: DuplicateMergeProvenance = {
  source: DUPLICATE_DETECTION_MERGE_FIXTURE_SOURCE,
  sourceLabel: "Mock duplicate detection and merge fixture",
  evidenceIds: [
    "evidence:duplicate-merge-email",
    "evidence:duplicate-merge-event-context",
    "evidence:duplicate-merge-referral-context",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-duplicate-merge-only",
  generationMethod: "fixture",
  externalNetworkRequested: false,
  databaseWriteExecuted: false,
  destructiveMergeExecuted: false,
  importedContactWriteExecuted: false,
  emailCalendarReadExecuted: false,
  aiProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyDuplicateMergeProvenance: DuplicateMergeProvenance = {
  ...mockDuplicateMergeProvenance,
  sourceLabel: "Mock empty duplicate merge rule",
  evidenceIds: ["evidence:duplicate-merge-empty"],
  generationMethod: "rule-based-duplicate-merge",
};

export const mockPendingDuplicateMergeProvenance: DuplicateMergeProvenance = {
  ...mockDuplicateMergeProvenance,
  sourceLabel: "Mock pending duplicate merge rule",
  evidenceIds: ["evidence:duplicate-merge-pending"],
  generationMethod: "rule-based-duplicate-merge",
};

export const mockDuplicateMergeFailureProvenance: DuplicateMergeProvenance = {
  ...mockDuplicateMergeProvenance,
  sourceLabel: "Mock duplicate merge controlled failure rule",
  evidenceIds: ["evidence:duplicate-merge-controlled-failure"],
  generationMethod: "rule-based-duplicate-merge",
};

export const mockDuplicateMergeEvidence: readonly DuplicateMergeEvidence[] = [
  {
    evidenceId: "evidence:duplicate-merge-email",
    source: mockDuplicateMergeSources.externalOmar,
    sourceLabel: "Google Contacts import fixture",
    excerpt:
      "Imported Omar Rahman and existing contact Omar R. share omar.rahman@example.test.",
    capturedFields: ["email", "displayName", "organization"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-duplicate-merge-service",
  },
  {
    evidenceId: "evidence:duplicate-merge-event-context",
    source: mockDuplicateMergeSources.eventAri,
    sourceLabel: "Climate dinner attendee fixture",
    excerpt:
      "Ari Lane appeared in the attendee import and an existing Orbit contact from the same climate dinner.",
    capturedFields: ["displayName", "eventContext", "organization"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-duplicate-merge-service",
  },
  {
    evidenceId: "evidence:duplicate-merge-referral-context",
    source: mockDuplicateMergeSources.referralNadia,
    sourceLabel: "Referral fixture",
    excerpt:
      "Nadia Park referral context overlaps with a previously captured operator intro.",
    capturedFields: ["displayName", "referralContext", "relationshipContext"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-duplicate-merge-service",
  },
];

export const mockImportedDuplicateCandidates: readonly ImportedContactDuplicateCandidate[] =
  [
    {
      candidateId: "duplicate-candidate:omar-rahman",
      importedDraftId: "external-draft:google_contacts-1",
      importedContactName: "Omar Rahman",
      importedRole: "Platform Partner",
      importedOrganization: "Northstar Ventures",
      importedEmail: "omar.rahman@example.test",
      existingContactId: "contact:omar-r",
      existingContactName: "Omar R.",
      existingRole: "Partner",
      existingOrganization: "Northstar Ventures",
      existingEmail: "omar.rahman@example.test",
      relationshipContext:
        "Workspace import and existing Orbit relationship both point to a venture ecosystem intro path.",
      matchReasons: ["email", "name_organization"],
      confidence: "high",
      source: mockDuplicateMergeSources.externalOmar,
      evidenceIds: ["evidence:duplicate-merge-email"],
      importedContactWriteExecuted: false,
      externalLookupExecuted: false,
      aiProviderRequested: false,
    },
    {
      candidateId: "duplicate-candidate:ari-lane",
      importedDraftId: "event-draft:climate-dinner-ari",
      importedContactName: "Ari Lane",
      importedRole: "Founder",
      importedOrganization: "HelioLoop",
      importedEmail: "ari.lane@example.test",
      existingContactId: "contact:ari-lane",
      existingContactName: "Ari Lane",
      existingRole: "Founder",
      existingOrganization: "HelioLoop",
      existingEmail: "ari@helioloop.example.test",
      relationshipContext:
        "Event attendee import and existing Orbit contact share the climate dinner context.",
      matchReasons: ["name_organization", "event_context"],
      confidence: "medium",
      source: mockDuplicateMergeSources.eventAri,
      evidenceIds: ["evidence:duplicate-merge-event-context"],
      importedContactWriteExecuted: false,
      externalLookupExecuted: false,
      aiProviderRequested: false,
    },
  ];

export const mockDuplicateMergeSuggestions: readonly DuplicateMergeSuggestion[] =
  [
    {
      id: "demo-merge-1",
      candidateId: "duplicate-candidate:omar-rahman",
      importedDraftId: "external-draft:google_contacts-1",
      existingContactId: "contact:omar-r",
      decision: "merge_into_existing",
      confidence: "high",
      summary:
        "Merge imported Omar Rahman into the existing Omar R. contact while preserving both source evidence trails.",
      reviewQuestion:
        "Confirm that the imported Google Contacts draft belongs to existing contact Omar R.",
      fieldDecisions: [
        {
          field: "displayName",
          selectedFrom: "imported_draft",
          value: "Omar Rahman",
          reason: "Imported draft has the complete display name.",
        },
        {
          field: "role",
          selectedFrom: "combined",
          value: "Platform Partner",
          reason: "Role labels describe the same venture partner context.",
        },
        {
          field: "relationshipContext",
          selectedFrom: "combined",
          value:
            "Venture ecosystem contact with a workspace import trail and existing Orbit intro context.",
          reason:
            "Combining context preserves why the relationship exists without dropping evidence.",
        },
      ],
      evidenceIds: ["evidence:duplicate-merge-email"],
      provenance: mockDuplicateMergeProvenance,
      requiresUserConfirmation: true,
      destructiveMergeExecuted: false,
      databaseWriteExecuted: false,
      contactWriteExecuted: false,
      notificationDelivered: false,
    },
    {
      id: "demo-merge-2",
      candidateId: "duplicate-candidate:ari-lane",
      importedDraftId: "event-draft:climate-dinner-ari",
      existingContactId: "contact:ari-lane",
      decision: "merge_into_existing",
      confidence: "medium",
      summary:
        "Merge the climate dinner attendee draft into Ari Lane's existing relationship profile after review.",
      reviewQuestion:
        "Confirm that the event attendee draft and existing Ari Lane profile represent the same person.",
      fieldDecisions: [
        {
          field: "email",
          selectedFrom: "existing_contact",
          value: "ari@helioloop.example.test",
          reason: "Existing contact email has prior Orbit evidence.",
        },
        {
          field: "relationshipContext",
          selectedFrom: "combined",
          value:
            "Climate dinner founder relationship with event evidence and existing follow-up context.",
          reason:
            "Combined context keeps the event source visible before any live merge write.",
        },
      ],
      evidenceIds: ["evidence:duplicate-merge-event-context"],
      provenance: mockDuplicateMergeProvenance,
      requiresUserConfirmation: true,
      destructiveMergeExecuted: false,
      databaseWriteExecuted: false,
      contactWriteExecuted: false,
      notificationDelivered: false,
    },
  ];

export const mockDuplicateMergeSuggestionsFixture: DuplicateMergeSuggestionsPayload =
  {
    state: "success",
    duplicateCandidates: mockImportedDuplicateCandidates,
    mergeSuggestions: mockDuplicateMergeSuggestions,
    summary:
      "Two imported contact drafts have deterministic duplicate merge suggestions ready for explicit review.",
    provenance: mockDuplicateMergeProvenance,
    nextAction:
      "Review each suggestion before confirming any future live contact merge.",
  };

export const mockEmptyDuplicateMergeSuggestionsFixture: DuplicateMergeSuggestionsPayload =
  {
    state: "empty",
    duplicateCandidates: [],
    mergeSuggestions: [],
    summary:
      "No imported contact drafts currently match existing Orbit contacts in the local fixture.",
    provenance: mockEmptyDuplicateMergeProvenance,
    nextAction:
      "Import more source-backed contact drafts before reviewing duplicate merges.",
  };

export const mockPendingDuplicateMergeSuggestionsFixture: DuplicateMergeSuggestionsPayload =
  {
    state: "pending",
    duplicateCandidates: [],
    mergeSuggestions: [],
    summary:
      "Duplicate detection is pending local fixture review before merge suggestions are shown.",
    provenance: mockPendingDuplicateMergeProvenance,
    nextAction:
      "Wait for local duplicate review before confirming imported contact merges.",
  };

export const mockAppliedDuplicateMergeFixture: DuplicateMergeApplyPayload = {
  state: "confirmed",
  suggestionId: "demo-merge-1",
  confirmedBy: "Verifier",
  confirmedAt: defaultConfirmedAt,
  appliedSuggestion: mockDuplicateMergeSuggestions[0],
  mergedContactPreview: {
    contactId: "contact:omar-r",
    displayName: "Omar Rahman",
    role: "Platform Partner",
    organization: "Northstar Ventures",
    email: "omar.rahman@example.test",
    relationshipContext:
      "Venture ecosystem contact with a workspace import trail and existing Orbit intro context.",
    evidenceIds: [
      "evidence:duplicate-merge-email",
      "evidence:duplicate-merge-confirmation",
    ],
  },
  confirmation: {
    required: true,
    state: "confirmed",
    question:
      "Confirm that the imported Google Contacts draft belongs to existing contact Omar R.",
    actorLabel: "Verifier",
    confirmedAt: defaultConfirmedAt,
  },
  createdEvidence: {
    evidenceId: "evidence:duplicate-merge-confirmation",
    source: mockDuplicateMergeSources.externalOmar,
    sourceLabel: "Mock duplicate merge confirmation",
    excerpt:
      "Verifier confirmed demo-merge-1 in the local mock boundary; no live merge write was executed.",
    capturedFields: ["suggestionId", "actorLabel", "confirmedAt"],
    createdAt: defaultConfirmedAt,
    createdBy: "mock-duplicate-merge-service",
  },
  fieldDecisions: mockDuplicateMergeSuggestions[0].fieldDecisions,
  provenance: {
    ...mockDuplicateMergeProvenance,
    sourceLabel: "Mock duplicate merge confirmation rule",
    evidenceIds: [
      "evidence:duplicate-merge-email",
      "evidence:duplicate-merge-confirmation",
    ],
    generationMethod: "rule-based-duplicate-merge",
  },
  nextAction:
    "Keep the preview in review mode until a future live provider performs an audited merge write.",
  mergeWriteExecuted: false,
  destructiveMergeExecuted: false,
  databaseWriteExecuted: false,
  contactWriteExecuted: false,
  notificationDelivered: false,
};

export function duplicateMergeFailureToAppError(
  failure: DuplicateDetectionMergeFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function duplicateMergeFailureContext(
  failure: DuplicateDetectionMergeFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    duplicateMergeErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock duplicate merge failure came from deterministic fixture rules.",
    service: "duplicate-detection-and-merge-mock",
  };
}
