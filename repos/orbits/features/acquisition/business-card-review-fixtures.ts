import type {
  BusinessCardReviewConfidence,
  BusinessCardReviewConfirmationPayload,
  BusinessCardReviewDraft,
  BusinessCardReviewedFields,
  BusinessCardReviewEvidence,
  BusinessCardReviewField,
  BusinessCardReviewFieldMap,
  BusinessCardReviewFieldState,
  BusinessCardReviewPayload,
  BusinessCardReviewProvenance,
  BusinessCardReviewSourceReference,
} from "./business-card-review-contract";

export const BUSINESS_CARD_REVIEW_FIXTURE_SOURCE =
  "fixture:features/acquisition/business-card-review-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T12:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T12:04:00.000Z";
const fixtureReviewedAt = "2026-06-25T12:08:00.000Z";
const fixtureConfirmedAt = "2026-06-25T12:12:00.000Z";

export const mockBusinessCardReviewSource: BusinessCardReviewSourceReference = {
  type: "business_card_ocr",
  id: "source:business-card-review:hana-sato",
  label: "business card OCR draft from robotics investor salon",
};

export const mockBusinessCardReviewProvenance: BusinessCardReviewProvenance = {
  source: BUSINESS_CARD_REVIEW_FIXTURE_SOURCE,
  sourceLabel: "Mock business card review fixture",
  evidenceIds: [
    "evidence:business-card-review-source-hana",
    "evidence:business-card-review-fields-hana",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-business-card-review-only",
  generationMethod: "fixture",
};

export const mockEmptyBusinessCardReviewProvenance: BusinessCardReviewProvenance =
  {
    ...mockBusinessCardReviewProvenance,
    sourceLabel: "Mock empty business card review rule",
    evidenceIds: ["evidence:business-card-review-empty"],
    generationMethod: "rule-based-card-review",
  };

export const mockPendingBusinessCardReviewProvenance: BusinessCardReviewProvenance =
  {
    ...mockBusinessCardReviewProvenance,
    sourceLabel: "Mock pending business card review rule",
    generationMethod: "rule-based-card-review",
  };

export const mockBusinessCardReviewFailureProvenance: BusinessCardReviewProvenance =
  {
    ...mockBusinessCardReviewProvenance,
    sourceLabel: "Mock business card review controlled failure rule",
    evidenceIds: ["evidence:business-card-review-controlled-failure"],
    generationMethod: "rule-based-card-review",
  };

const sourceEvidence: BusinessCardReviewEvidence = {
  evidenceId: "evidence:business-card-review-source-hana",
  source: mockBusinessCardReviewSource,
  sourceLabel: "Robotics investor salon card OCR draft",
  excerpt:
    "Hana Sato's business card was extracted by the local OCR mock and queued for field review.",
  capturedFields: ["source", "draftId", "rawText"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-business-card-review-service",
};

const fieldsEvidence: BusinessCardReviewEvidence = {
  evidenceId: "evidence:business-card-review-fields-hana",
  source: mockBusinessCardReviewSource,
  sourceLabel: "Extracted business card fields",
  excerpt:
    "Name, role, organization, email, and phone were extracted before human review.",
  capturedFields: ["displayName", "role", "organization", "email", "phone"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-business-card-review-service",
};

const reviewedEvidence: BusinessCardReviewEvidence = {
  evidenceId: "evidence:business-card-review-reviewed-hana",
  source: mockBusinessCardReviewSource,
  sourceLabel: "Human field review",
  excerpt:
    "Demo reviewer accepted Hana Sato's extracted card fields before contact confirmation.",
  capturedFields: ["reviewer", "reviewedFields", "evidenceIds"],
  createdAt: fixtureReviewedAt,
  createdBy: "mock-business-card-review-service",
};

const confirmedEvidence: BusinessCardReviewEvidence = {
  evidenceId: "evidence:business-card-review-confirmed-hana",
  source: mockBusinessCardReviewSource,
  sourceLabel: "Business card review confirmation",
  excerpt:
    "Demo operator confirmed the reviewed Hana Sato card candidate for the downstream contact service.",
  capturedFields: ["confirmation", "source", "evidenceIds"],
  createdAt: fixtureConfirmedAt,
  createdBy: "mock-business-card-review-service",
};

const extractedFieldValues: BusinessCardReviewedFields = {
  displayName: "Hana Sato",
  role: "Head of Robotics Partnerships",
  organization: "Aki Robotics",
  email: "hana.sato@akirobotics.example",
  phone: "+81-3-5555-0198",
};

function reviewField(
  field: keyof BusinessCardReviewedFields,
  label: string,
  confidence: BusinessCardReviewConfidence,
  reviewState: BusinessCardReviewFieldState,
): BusinessCardReviewField {
  const value = extractedFieldValues[field];

  return {
    field,
    label,
    value,
    reviewedValue: reviewState === "needs_review" ? "" : value,
    reviewState,
    confidence,
    evidenceId: fieldsEvidence.evidenceId,
  };
}

const pendingFields: BusinessCardReviewFieldMap = {
  displayName: reviewField("displayName", "Name", "high", "needs_review"),
  role: reviewField("role", "Role", "high", "needs_review"),
  organization: reviewField("organization", "Organization", "high", "needs_review"),
  email: reviewField("email", "Email", "medium", "needs_review"),
  phone: reviewField("phone", "Phone", "medium", "needs_review"),
};

const reviewedFields: BusinessCardReviewFieldMap = {
  displayName: reviewField("displayName", "Name", "high", "accepted"),
  role: reviewField("role", "Role", "high", "accepted"),
  organization: reviewField("organization", "Organization", "high", "accepted"),
  email: reviewField("email", "Email", "medium", "accepted"),
  phone: reviewField("phone", "Phone", "medium", "accepted"),
};

export const mockBusinessCardReviewDraft: BusinessCardReviewDraft = {
  id: "demo-business-card-draft",
  status: "pending_review",
  source: mockBusinessCardReviewSource,
  extractedFields: pendingFields,
  displayName: extractedFieldValues.displayName,
  role: extractedFieldValues.role,
  organization: extractedFieldValues.organization,
  email: extractedFieldValues.email,
  phone: extractedFieldValues.phone,
  relationshipContext:
    "Business card captured after a robotics investor salon conversation about partner distribution.",
  suggestedNextAction:
    "Review the extracted fields, then confirm the business card candidate.",
  confirmation: {
    required: true,
    state: "pending",
    question: "Confirm adding Hana Sato after reviewing the card fields?",
  },
  contactWriteExecuted: false,
  databaseWriteExecuted: false,
  aiProviderCalled: false,
  ocrProviderCalled: false,
  notificationDelivered: false,
  evidence: [sourceEvidence, fieldsEvidence],
  provenance: mockBusinessCardReviewProvenance,
  createdAt: fixtureCreatedAt,
};

export const mockReviewedBusinessCardReviewDraft: BusinessCardReviewDraft = {
  ...mockBusinessCardReviewDraft,
  status: "reviewed",
  extractedFields: reviewedFields,
  evidence: [sourceEvidence, fieldsEvidence, reviewedEvidence],
  provenance: {
    ...mockBusinessCardReviewProvenance,
    evidenceIds: [
      ...mockBusinessCardReviewProvenance.evidenceIds,
      reviewedEvidence.evidenceId,
    ],
  },
  reviewedAt: fixtureReviewedAt,
  reviewedBy: "Demo reviewer",
};

const confirmedDraft: BusinessCardReviewDraft = {
  ...mockReviewedBusinessCardReviewDraft,
  status: "confirmed",
  confirmation: {
    ...mockReviewedBusinessCardReviewDraft.confirmation,
    state: "confirmed",
    actorLabel: "Demo operator",
    confirmedAt: fixtureConfirmedAt,
  },
  evidence: [
    sourceEvidence,
    fieldsEvidence,
    reviewedEvidence,
    confirmedEvidence,
  ],
  provenance: {
    ...mockBusinessCardReviewProvenance,
    evidenceIds: [
      ...mockBusinessCardReviewProvenance.evidenceIds,
      reviewedEvidence.evidenceId,
      confirmedEvidence.evidenceId,
    ],
  },
};

export const mockBusinessCardReviewFixture: BusinessCardReviewPayload = {
  state: "success",
  reviewDraft: mockBusinessCardReviewDraft,
  reviewEvidence: null,
  summary:
    "Extracted business card fields are waiting for human review before contact creation.",
  provenance: mockBusinessCardReviewProvenance,
  nextAction: "Review the extracted fields before confirming the contact candidate.",
  contactCandidateReady: false,
};

export const mockBusinessCardReviewUpdatedFixture: BusinessCardReviewPayload = {
  ...mockBusinessCardReviewFixture,
  reviewDraft: mockReviewedBusinessCardReviewDraft,
  reviewEvidence: reviewedEvidence,
  summary:
    "The business card fields were reviewed locally and remain outside contact creation.",
  provenance: mockReviewedBusinessCardReviewDraft.provenance,
  nextAction:
    "Confirm the reviewed business card draft before sending it to the contact service.",
};

export const mockEmptyBusinessCardReviewFixture: BusinessCardReviewPayload = {
  state: "empty",
  reviewDraft: null,
  reviewEvidence: null,
  summary: "No extracted business card fields are ready for human review.",
  provenance: mockEmptyBusinessCardReviewProvenance,
  nextAction: "Wait for extracted business card fields before starting review.",
  contactCandidateReady: false,
};

export const mockPendingBusinessCardReviewFixture: BusinessCardReviewPayload = {
  ...mockBusinessCardReviewFixture,
  state: "pending",
  provenance: mockPendingBusinessCardReviewProvenance,
  summary:
    "A business card draft is waiting for field review before confirmation.",
  nextAction: "Review the extracted fields before confirming the contact candidate.",
};

export const mockBusinessCardReviewConfirmedFixture: BusinessCardReviewConfirmationPayload =
  {
    state: "confirmed",
    confirmedDraft,
    contactCandidate: {
      candidateId: "contact-candidate:demo-business-card-draft",
      displayName: confirmedDraft.displayName,
      role: confirmedDraft.role,
      organization: confirmedDraft.organization,
      email: confirmedDraft.email,
      phone: confirmedDraft.phone,
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
      "Send the reviewed card candidate to the contact service with source and evidence ids intact.",
  };
