import type {
  PostEventContactSummary,
  PostEventFollowUpSuggestion,
  PostEventReviewConfirmPayload,
  PostEventReviewContact,
  PostEventReviewEventSummary,
  PostEventReviewPayload,
  PostEventReviewProvenance,
  PostEventReviewSourceReference,
  PostEventReviewTag,
} from "./contract";

export const POST_EVENT_REVIEW_FIXTURE_SOURCE =
  "fixture:features/events/post-event-review/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T21:45:00.000+09:00";

export const mockPostEventReviewSource: PostEventReviewSourceReference = {
  type: "event_import",
  id: "source:post-event-review:demo-event-1",
  label: "post-event review fixture",
  eventId: "demo-event-1",
  generatedBy: "mock-post-event-review-service",
};

export const mockPostEventReviewEvent: PostEventReviewEventSummary = {
  id: "demo-event-1",
  title: "Climate founders dinner",
  venue: "Daikanyama Founders Room",
  endedAt: "2026-06-25T21:30:00.000+09:00",
  source: mockPostEventReviewSource,
  calendarProviderRequested: false,
  liveDatabaseReadExecuted: false,
};

export const mockPostEventReviewProvenance: PostEventReviewProvenance = {
  source: POST_EVENT_REVIEW_FIXTURE_SOURCE,
  sourceLabel: "Mock post-event contact review fixture",
  evidenceIds: [
    "evidence:post-event:attendee-import",
    "evidence:post-event:encounter-note",
    "evidence:post-event:follow-up-rule",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-post-event-review-only",
  generationMethod: "fixture",
  aiProviderRequested: false,
  externalNetworkRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  batchPersistenceExecuted: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyPostEventReviewProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock empty post-event review rule",
  evidenceIds: ["evidence:post-event:empty"],
  generationMethod: "rule-based-empty",
};

export const mockPendingPostEventReviewProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock pending post-event review rule",
  evidenceIds: ["evidence:post-event:attendee-import-pending"],
  generationMethod: "rule-based-pending",
};

export const mockPostEventReviewFailureProvenance: PostEventReviewProvenance = {
  ...mockPostEventReviewProvenance,
  sourceLabel: "Mock post-event review controlled failure rule",
  evidenceIds: ["evidence:post-event:controlled-failure"],
  generationMethod: "rule-based-failure",
};

function tag(input: {
  tagId: string;
  label: string;
  reason: string;
  evidenceIds: readonly string[];
}): PostEventReviewTag {
  return {
    ...input,
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function summary(input: {
  summaryId: string;
  headline: string;
  context: string;
  whyNow: string;
  evidenceIds: readonly string[];
}): PostEventContactSummary {
  return {
    ...input,
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function followUp(input: {
  suggestionId: string;
  urgency: PostEventFollowUpSuggestion["urgency"];
  messageDraft: string;
  rationale: string;
  evidenceIds: readonly string[];
}): PostEventFollowUpSuggestion {
  return {
    ...input,
    channel: "email",
    source: mockPostEventReviewSource,
    generatedBy: "mock-post-event-rules",
    externalMessageSendRequested: false,
    notificationDelivered: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    aiProviderRequested: false,
  };
}

export const mockPostEventReviewContacts: readonly PostEventReviewContact[] = [
  {
    contactDraftId: "draft:post-event:priya",
    displayName: "Priya Shah",
    organization: "Solace Battery",
    role: "CEO",
    metAt: "Climate founders dinner",
    relationshipContext:
      "Priya asked for a storage pilot introduction after the panel.",
    status: "needs_review",
    source: mockPostEventReviewSource,
    evidenceIds: [
      "evidence:post-event:attendee-import",
      "evidence:post-event:encounter-note",
    ],
    summary: summary({
      summaryId: "summary:post-event:priya",
      headline: "Priya needs a storage pilot founder introduction.",
      context:
        "The encounter note says Priya offered deployment constraints and asked for an introduction.",
      whyNow:
        "The request came directly after the dinner while event context is still fresh.",
      evidenceIds: [
        "evidence:post-event:attendee-import",
        "evidence:post-event:encounter-note",
      ],
    }),
    tags: [
      tag({
        tagId: "tag:post-event:storage-pilot",
        label: "storage pilot",
        reason: "Derived from Priya's stated deployment request.",
        evidenceIds: ["evidence:post-event:encounter-note"],
      }),
      tag({
        tagId: "tag:post-event:founder-intro",
        label: "founder intro",
        reason: "The sensible next action is an introduction path.",
        evidenceIds: ["evidence:post-event:follow-up-rule"],
      }),
    ],
    followUpSuggestion: followUp({
      suggestionId: "follow-up:post-event:priya",
      urgency: "today",
      messageDraft:
        "Priya, good meeting you at the dinner. I can make the storage pilot introduction if the deployment constraints you mentioned are still the right starting point.",
      rationale:
        "A same-day recap keeps the event context, requested intro, and evidence together.",
      evidenceIds: [
        "evidence:post-event:encounter-note",
        "evidence:post-event:follow-up-rule",
      ],
    }),
    liveDatabaseWriteExecuted: false,
    batchPersistenceExecuted: false,
  },
  {
    contactDraftId: "draft:post-event:marcus",
    displayName: "Marcus Lee",
    organization: "GridBridge",
    role: "Partnerships",
    metAt: "Climate founders dinner",
    relationshipContext:
      "Marcus offered to compare operator intro paths for climate storage buyers.",
    status: "needs_review",
    source: mockPostEventReviewSource,
    evidenceIds: [
      "evidence:post-event:attendee-import",
      "evidence:post-event:operator-intro",
    ],
    summary: summary({
      summaryId: "summary:post-event:marcus",
      headline: "Marcus can help qualify operator introduction paths.",
      context:
        "The roster note links Marcus to buyer qualification and partnership routing.",
      whyNow:
        "The follow-up should happen while he remembers the operator intro conversation.",
      evidenceIds: [
        "evidence:post-event:attendee-import",
        "evidence:post-event:operator-intro",
      ],
    }),
    tags: [
      tag({
        tagId: "tag:post-event:operator-path",
        label: "operator path",
        reason: "Marcus mentioned introduction routing.",
        evidenceIds: ["evidence:post-event:operator-intro"],
      }),
      tag({
        tagId: "tag:post-event:buyer-context",
        label: "buyer context",
        reason: "The conversation centered on buyer qualification.",
        evidenceIds: ["evidence:post-event:attendee-import"],
      }),
    ],
    followUpSuggestion: followUp({
      suggestionId: "follow-up:post-event:marcus",
      urgency: "this_week",
      messageDraft:
        "Marcus, I appreciated the operator path context. Could we compare the buyer intro route you mentioned against Priya's storage pilot need?",
      rationale:
        "The follow-up joins the event attendee import with the operator-path note.",
      evidenceIds: [
        "evidence:post-event:operator-intro",
        "evidence:post-event:follow-up-rule",
      ],
    }),
    liveDatabaseWriteExecuted: false,
    batchPersistenceExecuted: false,
  },
] as const;

export const mockPostEventReviewFixture: PostEventReviewPayload = {
  state: "success",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: mockPostEventReviewContacts,
  summary:
    "Two new contacts are ready for post-event review with summaries, tags, and follow-up suggestions from local fixtures.",
  provenance: mockPostEventReviewProvenance,
  nextAction:
    "Review each new contact, confirm the useful records, then draft follow-up copy from the preserved evidence.",
};

export const mockEmptyPostEventReviewFixture: PostEventReviewPayload = {
  state: "empty",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: [],
  summary: "No imported or encountered contacts are ready for review.",
  provenance: mockEmptyPostEventReviewProvenance,
  nextAction:
    "Import attendees or capture encounter notes before confirming post-event contacts.",
};

export const mockPendingPostEventReviewFixture: PostEventReviewPayload = {
  state: "pending",
  event: mockPostEventReviewEvent,
  reviewId: "post-event-review:demo-event-1",
  contacts: [],
  summary:
    "The post-event review is waiting for local attendee import and encounter note review.",
  provenance: mockPendingPostEventReviewProvenance,
  nextAction:
    "Wait for local import review before generating summaries, tags, follow-up suggestions, or confirmation actions.",
};

export const mockPostEventReviewConfirmFixture: PostEventReviewConfirmPayload = {
  state: "confirmed",
  event: mockPostEventReviewEvent,
  eventId: "demo-event-1",
  reviewId: "post-event-review:demo-event-1",
  confirmedContacts: mockPostEventReviewContacts.map((contact) => ({
    contactId:
      contact.contactDraftId === "draft:post-event:priya"
        ? "contact:priya-shah"
        : "contact:marcus-lee",
    contactDraftId: contact.contactDraftId,
    displayName: contact.displayName,
    tags: contact.tags.map((contactTag) => contactTag.label),
    followUpSuggestion: contact.followUpSuggestion,
    source: contact.source,
    evidenceIds: contact.evidenceIds,
    batchPersistenceExecuted: false,
    liveDatabaseWriteExecuted: false,
    notificationDelivered: false,
    externalMessageSendRequested: false,
  })),
  summary:
    "The selected post-event contacts were confirmed inside the mock boundary without batch persistence.",
  provenance: {
    ...mockPostEventReviewProvenance,
    sourceLabel: "Mock post-event confirmation rule",
    evidenceIds: ["evidence:post-event:confirmation-preview"],
    generationMethod: "rule-based-confirmation",
  },
  nextAction:
    "Route any follow-up send through a separate confirmation guard before external action execution.",
};
