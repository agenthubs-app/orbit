import {
  CONTACT_DETAIL_STATUS_OPTIONS,
  CONTACT_DETAIL_TAG_OPTIONS,
} from "./detail-contract";
import type {
  ContactDetail,
  ContactDetailEvidence,
  ContactDetailLastInteractionMetadata,
  ContactDetailNote,
  ContactDetailPublicProfile,
  ContactDetailSourceReference,
  ContactDetailTagStatusPayload,
  ContactDetailTagStatusProvenance,
} from "./detail-contract";

export const CONTACT_DETAIL_TAG_STATUS_FIXTURE_SOURCE =
  "fixture:features/contacts/detail-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T17:30:00.000Z";
const fixtureCapturedAt = "2026-06-25T17:35:00.000Z";

export const mockContactDetailSource: ContactDetailSourceReference = {
  type: "manual",
  id: "source:contact-detail:kenji-manual-note",
  label: "Manual note",
  evidenceId: "evidence:contact-detail-intro-request",
};

export const mockContactDetailEvidence: readonly ContactDetailEvidence[] = [
  {
    evidenceId: "evidence:contact-detail-intro-request",
    source: mockContactDetailSource,
    field: "relationship_context",
    excerpt:
      "Manual note says Kenji asked for a storage pilot operator intro after the climate founders dinner.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
  {
    evidenceId: "evidence:contact-detail-status",
    source: mockContactDetailSource,
    field: "status",
    excerpt:
      "Status is needs_follow_up because the operator introduction has not been sent yet.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
  {
    evidenceId: "evidence:contact-detail-note",
    source: mockContactDetailSource,
    field: "note",
    excerpt:
      "Follow-up note keeps the source context beside the contact detail before any live write exists.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
  {
    evidenceId: "evidence:contact-detail-public-profile",
    source: mockContactDetailSource,
    field: "public_profile",
    excerpt:
      "Public profile says Kenji helps climate infrastructure teams turn storage pilots into operator-backed partnerships.",
    capturedAt: fixtureCapturedAt,
    createdBy: "mock-contact-detail-tag-status-service",
  },
];

export const mockContactDetailNotes: readonly ContactDetailNote[] = [
  {
    noteId: "note:demo-contact-1-intro-context",
    body: "Kenji asked for a storage pilot operator intro after the climate founders dinner.",
    authorLabel: "Orbit operator",
    createdAt: "2026-06-18T20:40:00.000Z",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-intro-request"],
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  },
  {
    noteId: "note:demo-contact-1-follow-up",
    body: "Keep the follow-up warm and send the operator intro before Friday.",
    authorLabel: "Orbit operator",
    createdAt: "2026-06-19T09:10:00.000Z",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-note"],
    noteWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
  },
];

export const mockContactDetailLastInteraction: ContactDetailLastInteractionMetadata =
  {
    interactionId: "interaction:demo-contact-1-climate-dinner",
    channel: "event_note",
    occurredAt: "2026-06-18T20:30:00.000Z",
    summary:
      "Kenji asked for an operator introduction after the climate founders dinner.",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-intro-request"],
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
    productionAuditLogWriteExecuted: false,
  };

export const mockContactDetailPublicProfile: ContactDetailPublicProfile = {
  bio: "Founder at Aster Grid focused on storage pilot partnerships.",
  selfIntroduction:
    "I help climate infrastructure teams turn early storage pilots into operator-backed partnerships.",
  industry: "climate infrastructure",
  offering: ["storage pilot operator access", "founder diligence context"],
  seeking: ["operator introductions", "commercial pilot partners"],
  topics: ["storage pilots", "operator partnerships", "climate infrastructure"],
  conversationPrompts: [
    "Which operator profile makes a storage pilot credible?",
    "Where do climate founders lose momentum after an event?",
  ],
  source: mockContactDetailSource,
  evidenceIds: ["evidence:contact-detail-public-profile"],
};

export const mockContactDetail: ContactDetail = {
  id: "demo-contact-1",
  displayName: "Kenji Watanabe",
  role: "Founder",
  organization: "Aster Grid",
  location: "Tokyo",
  relationshipContext:
    "Met at the climate founders dinner and discussed storage pilot operators.",
  publicProfile: mockContactDetailPublicProfile,
  source: mockContactDetailSource,
  evidence: mockContactDetailEvidence,
  tags: [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ],
  status: "needs_follow_up",
  notes: mockContactDetailNotes,
  lastInteraction: mockContactDetailLastInteraction,
  nextAction: "Send Kenji the storage pilot operator intro by Friday.",
  updatedAt: "2026-06-19T09:10:00.000Z",
  tagWriteExecuted: false,
  statusWriteExecuted: false,
  noteWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockContactDetailProvenance: ContactDetailTagStatusProvenance = {
  source: CONTACT_DETAIL_TAG_STATUS_FIXTURE_SOURCE,
  sourceLabel: "Mock contact detail tag and status fixture",
  evidenceIds: [
    "evidence:contact-detail-intro-request",
    "evidence:contact-detail-status",
    "evidence:contact-detail-note",
    "evidence:contact-detail-public-profile",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-contact-detail-tag-status-only",
  generationMethod: "fixture",
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockUpdatedContactDetailNote: ContactDetailNote = {
  noteId: "note:demo-contact-1-api-patch",
  body: "Confirmed partner review context before changing status.",
  authorLabel: "Orbit operator",
  createdAt: "2026-06-25T18:45:00.000Z",
  source: mockContactDetailSource,
  evidenceIds: ["evidence:contact-detail-tag-status-update"],
  noteWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
};

export const mockUpdatedContactDetailLastInteraction: ContactDetailLastInteractionMetadata =
  {
    interactionId: "interaction:demo-contact-1-api-patch",
    channel: "manual_note",
    occurredAt: "2026-06-25T18:45:00.000Z",
    summary: "Operator confirmed the venture ecosystem follow-up path.",
    source: mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-tag-status-update"],
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
    productionAuditLogWriteExecuted: false,
  };

export const mockUpdatedContactDetail: ContactDetail = {
  ...mockContactDetail,
  tags: [
    "topic:storage-pilots",
    "priority:warm-follow-up",
    "topic:venture-ecosystem",
  ],
  status: "active",
  notes: [...mockContactDetailNotes, mockUpdatedContactDetailNote],
  lastInteraction: mockUpdatedContactDetailLastInteraction,
  updatedAt: "2026-06-25T18:45:00.000Z",
};

export const mockUpdatedContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock contact detail tag and status rule update",
    evidenceIds: [
      ...mockContactDetailProvenance.evidenceIds,
      "evidence:contact-detail-tag-status-update",
    ],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockEmptyContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock empty contact detail tag and status rule",
    evidenceIds: ["evidence:contact-detail-empty"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockPendingContactDetailProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock pending contact detail tag and status rule",
    evidenceIds: ["evidence:contact-detail-pending"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockContactDetailFailureProvenance: ContactDetailTagStatusProvenance =
  {
    ...mockContactDetailProvenance,
    sourceLabel: "Mock contact detail tag and status controlled failure rule",
    evidenceIds: ["evidence:contact-detail-controlled-failure"],
    generationMethod: "rule-based-contact-detail-tag-status",
  };

export const mockContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "success",
  contact: mockContactDetail,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary:
    "Kenji Watanabe is ready for a source-backed detail review with tags, status, notes, and last interaction metadata.",
  provenance: mockContactDetailProvenance,
  nextAction: "Review the source-backed status before sending the operator intro.",
  updateSummary: "No mock update has been applied.",
};

export const mockUpdatedContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "success",
  contact: mockUpdatedContactDetail,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary:
    "Kenji Watanabe has a mock status and tag update ready for review.",
  provenance: mockUpdatedContactDetailProvenance,
  nextAction: "Use the updated tags and active status to plan the next follow-up.",
  updateSummary:
    "Mock update changed Kenji Watanabe to active with 3 tags and 3 notes.",
};

export const mockEmptyContactDetailFixture: ContactDetailTagStatusPayload = {
  state: "empty",
  contact: null,
  editableTagOptions: CONTACT_DETAIL_TAG_OPTIONS,
  editableStatusOptions: CONTACT_DETAIL_STATUS_OPTIONS,
  summary: "No mock contact detail is selected for this local detail panel.",
  provenance: mockEmptyContactDetailProvenance,
  nextAction:
    "Select a different mock contact or keep the detail panel in its empty state.",
  updateSummary: "No tag, status, note, or last interaction update is staged.",
};

export const mockPendingContactDetailFixture: ContactDetailTagStatusPayload = {
  ...mockEmptyContactDetailFixture,
  state: "pending",
  summary:
    "Contact detail tag and status review is pending local fixture approval.",
  provenance: mockPendingContactDetailProvenance,
  nextAction: "Wait for mock contact detail fixture review before editing.",
};
