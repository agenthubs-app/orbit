import type {
  ManualContactConfirmationPayload,
  ManualContactCreationPayload,
  ManualContactCreationProvenance,
  ManualContactDraft,
  ManualContactEvidence,
  ManualContactSourceReference,
} from "./manual-contract";

export const MANUAL_CONTACT_CREATION_FIXTURE_SOURCE =
  "fixture:features/acquisition/manual-fixtures.ts" as const;

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
