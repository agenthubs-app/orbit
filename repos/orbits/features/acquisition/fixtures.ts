import type {
  ContactAcquisitionDraft,
  ContactAcquisitionDraftPayload,
  ContactAcquisitionDraftProvenance,
  ContactDraftConfirmationPayload,
  ContactDraftEvidence,
  ContactDraftSourceReference,
} from "./contract";

export const CONTACT_ACQUISITION_DRAFT_FIXTURE_SOURCE =
  "fixture:features/acquisition/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T09:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T09:05:00.000Z";
const fixtureConfirmedAt = "2026-06-25T09:12:00.000Z";

const manualSource: ContactDraftSourceReference = {
  type: "manual",
  id: "source:manual-note:akari",
  label: "manual note after climate founder dinner",
};

const cardSource: ContactDraftSourceReference = {
  type: "business_card_ocr",
  id: "source:business-card-ocr:mateo",
  label: "business-card OCR scan from Fintech Forum",
};

const referralSource: ContactDraftSourceReference = {
  type: "referral",
  id: "source:referral:emi",
  label: "warm referral from Emi Tanaka",
};

export const mockContactAcquisitionDraftProvenance: ContactAcquisitionDraftProvenance =
  {
    source: CONTACT_ACQUISITION_DRAFT_FIXTURE_SOURCE,
    sourceLabel: "Mock contact acquisition draft fixture",
    evidenceIds: [
      "evidence:manual-note-akari",
      "evidence:card-scan-mateo",
      "evidence:referral-emi",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-contact-acquisition-drafts-only",
    generationMethod: "fixture",
  };

export const mockEmptyContactAcquisitionDraftProvenance: ContactAcquisitionDraftProvenance =
  {
    ...mockContactAcquisitionDraftProvenance,
    sourceLabel: "Mock empty contact acquisition rule",
    evidenceIds: ["evidence:no-contact-acquisition-source"],
    generationMethod: "rule-based-contact-draft",
  };

export const mockPendingContactAcquisitionDraftProvenance: ContactAcquisitionDraftProvenance =
  {
    ...mockContactAcquisitionDraftProvenance,
    sourceLabel: "Mock pending contact acquisition rule",
    evidenceIds: ["evidence:manual-note-akari"],
    generationMethod: "rule-based-contact-draft",
  };

export const mockContactAcquisitionDraftFailureProvenance: ContactAcquisitionDraftProvenance =
  {
    ...mockContactAcquisitionDraftProvenance,
    sourceLabel: "Mock contact acquisition controlled failure rule",
    evidenceIds: ["evidence:contact-draft-controlled-failure"],
    generationMethod: "rule-based-contact-draft",
  };

const manualEvidence: ContactDraftEvidence = {
  evidenceId: "evidence:manual-note-akari",
  source: manualSource,
  sourceLabel: "Climate founder dinner note",
  excerpt:
    "Akari Mori asked for portfolio partner intros during a manual note after climate founder dinner.",
  capturedFields: [
    "displayName",
    "organization",
    "relationshipContext",
    "suggestedNextAction",
  ],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-pipeline",
};

const cardEvidence: ContactDraftEvidence = {
  evidenceId: "evidence:card-scan-mateo",
  source: cardSource,
  sourceLabel: "Business-card OCR rehearsal",
  excerpt:
    "Mateo Rivera, Partnerships Lead at ArcPay, was staged from a mock business-card OCR result.",
  capturedFields: ["displayName", "role", "organization"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-pipeline",
};

const referralEvidence: ContactDraftEvidence = {
  evidenceId: "evidence:referral-emi",
  source: referralSource,
  sourceLabel: "Warm referral memo",
  excerpt:
    "Emi Tanaka offered to introduce Priya Shah for APAC expansion context.",
  capturedFields: [
    "displayName",
    "organization",
    "relationshipContext",
    "suggestedNextAction",
  ],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-pipeline",
};

export const mockContactAcquisitionDrafts: readonly ContactAcquisitionDraft[] = [
  {
    id: "demo-draft-1",
    status: "pending_confirmation",
    source: manualSource,
    displayName: "Akari Mori",
    role: "Founder",
    organization: "Mori Climate Studio",
    relationshipContext:
      "Met during a climate founder dinner; asked for introductions to portfolio operators working on storage pilots.",
    suggestedNextAction:
      "Confirm the draft, then prepare a source-backed intro note.",
    confidence: "high",
    createdAt: fixtureCreatedAt,
    confirmation: {
      required: true,
      state: "pending",
      question: "Confirm adding Akari Mori from the manual dinner note?",
    },
    evidence: [manualEvidence],
    provenance: mockContactAcquisitionDraftProvenance,
  },
  {
    id: "demo-draft-2",
    status: "pending_confirmation",
    source: cardSource,
    displayName: "Mateo Rivera",
    role: "Partnerships Lead",
    organization: "ArcPay",
    relationshipContext:
      "Badge and business-card context suggest a fintech partnership conversation from Fintech Forum.",
    suggestedNextAction:
      "Review the OCR fields before staging a partnership follow-up.",
    confidence: "medium",
    createdAt: fixtureCreatedAt,
    confirmation: {
      required: true,
      state: "pending",
      question: "Confirm adding Mateo Rivera from the OCR rehearsal?",
    },
    evidence: [cardEvidence],
    provenance: mockContactAcquisitionDraftProvenance,
  },
  {
    id: "demo-draft-3",
    status: "pending_confirmation",
    source: referralSource,
    displayName: "Priya Shah",
    role: "Investor",
    organization: "Northstar Ventures",
    relationshipContext:
      "Warm referral from Emi Tanaka for APAC expansion and investor intro context.",
    suggestedNextAction:
      "Confirm the referral draft before creating a contact and follow-up task.",
    confidence: "high",
    createdAt: fixtureCreatedAt,
    confirmation: {
      required: true,
      state: "pending",
      question: "Confirm adding Priya Shah from Emi Tanaka's referral?",
    },
    evidence: [referralEvidence],
    provenance: mockContactAcquisitionDraftProvenance,
  },
];

export const mockContactAcquisitionDraftFixture: ContactAcquisitionDraftPayload =
  {
    state: "success",
    drafts: mockContactAcquisitionDrafts,
    summary:
      "Three source-backed contact drafts are staged for operator confirmation before any contact write.",
    provenance: mockContactAcquisitionDraftProvenance,
    nextAction:
      "Review each draft's source evidence before confirming it for contact creation.",
  };

export const mockEmptyContactAcquisitionDraftFixture: ContactAcquisitionDraftPayload =
  {
    state: "empty",
    drafts: [],
    summary:
      "No source-backed contact acquisition event has produced a draft in this scenario.",
    provenance: mockEmptyContactAcquisitionDraftProvenance,
    nextAction:
      "Wait for a sourced acquisition event before staging a contact draft.",
  };

export const mockPendingContactAcquisitionDraftFixture: ContactAcquisitionDraftPayload =
  {
    state: "pending",
    drafts: [mockContactAcquisitionDrafts[0]],
    summary: "One manual contact draft is waiting for explicit confirmation.",
    provenance: mockPendingContactAcquisitionDraftProvenance,
    nextAction:
      "Confirm the manual note draft before sending it to the contact record service.",
  };

const confirmedEvidence: ContactDraftEvidence = {
  evidenceId: "evidence:contact-draft-confirmed-akari",
  source: manualSource,
  sourceLabel: "Operator contact draft confirmation",
  excerpt:
    "Demo operator confirmed Akari Mori after reviewing the manual note source and evidence.",
  capturedFields: ["confirmation", "source", "evidenceIds"],
  createdAt: fixtureConfirmedAt,
  createdBy: "mock-pipeline",
};

const confirmedDraft: ContactAcquisitionDraft = {
  ...mockContactAcquisitionDrafts[0],
  status: "confirmed",
  confirmation: {
    ...mockContactAcquisitionDrafts[0].confirmation,
    state: "confirmed",
    actorLabel: "Demo operator",
    confirmedAt: fixtureConfirmedAt,
  },
  evidence: [manualEvidence, confirmedEvidence],
  provenance: {
    ...mockPendingContactAcquisitionDraftProvenance,
    evidenceIds: [
      "evidence:manual-note-akari",
      "evidence:contact-draft-confirmed-akari",
    ],
  },
};

export const mockContactDraftConfirmedFixture: ContactDraftConfirmationPayload =
  {
    state: "confirmed",
    confirmedDraft,
    contactCandidate: {
      candidateId: "contact-candidate:demo-draft-1",
      displayName: confirmedDraft.displayName,
      role: confirmedDraft.role,
      organization: confirmedDraft.organization,
      relationshipContext: confirmedDraft.relationshipContext,
      source: confirmedDraft.source,
      evidenceIds: confirmedDraft.provenance.evidenceIds,
      readyForContactWrite: true,
      contactWriteExecuted: false,
    },
    createdEvidence: confirmedEvidence,
    confirmedAt: fixtureConfirmedAt,
    provenance: confirmedDraft.provenance,
    nextAction:
      "Send this candidate to the contact record service only after preserving the source and evidence ids.",
  };
