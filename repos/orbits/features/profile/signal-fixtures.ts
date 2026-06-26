import type {
  ProfileSignalEvidence,
  ProfileSignalReviewQueuePayload,
  ProfileSignalReviewQueueProvenance,
  ProfileSignalSuggestionAcceptedPayload,
  ProfileUpdateSuggestion,
} from "./signal-contract";

export const PROFILE_SIGNAL_REVIEW_QUEUE_FIXTURE_SOURCE =
  "fixture:features/profile/signal-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-24T13:00:00.000Z";
const fixtureCreatedAt = "2026-06-24T13:05:00.000Z";
const fixtureAcceptedAt = "2026-06-24T13:10:00.000Z";

export const mockProfileSignalReviewQueueProvenance: ProfileSignalReviewQueueProvenance =
  {
    source: PROFILE_SIGNAL_REVIEW_QUEUE_FIXTURE_SOURCE,
    sourceLabel: "Mock profile signal review queue fixture",
    evidenceIds: [
      "evidence:chat-follow-up-goal",
      "evidence:activity-event-pattern",
      "evidence:contact-market-context",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-profile-signals-only",
    generationMethod: "fixture",
  };

export const mockPendingProfileSignalReviewQueueProvenance: ProfileSignalReviewQueueProvenance =
  {
    ...mockProfileSignalReviewQueueProvenance,
    sourceLabel: "Mock profile signal pending rule",
    evidenceIds: ["evidence:chat-follow-up-goal"],
    generationMethod: "rule-based-signal-match",
  };

export const mockEmptyProfileSignalReviewQueueProvenance: ProfileSignalReviewQueueProvenance =
  {
    ...mockProfileSignalReviewQueueProvenance,
    sourceLabel: "Mock empty profile signal review rule",
    evidenceIds: ["evidence:profile-signals-empty"],
    generationMethod: "rule-based-signal-match",
  };

export const mockProfileSignalReviewQueueFailureProvenance: ProfileSignalReviewQueueProvenance =
  {
    ...mockProfileSignalReviewQueueProvenance,
    sourceLabel: "Mock profile signal review failure rule",
    evidenceIds: ["evidence:profile-signal-review-controlled-failure"],
    generationMethod: "rule-based-signal-match",
  };

const chatEvidence: ProfileSignalEvidence = {
  evidenceId: "evidence:chat-follow-up-goal",
  sourceKind: "chat",
  sourceLabel: "Mock chat summary signal",
  excerpt:
    "Ari asks for follow-up copy that explains event-grounded relationship workflows.",
  collectedAt: fixtureCollectedAt,
};

const activityEvidence: ProfileSignalEvidence = {
  evidenceId: "evidence:activity-event-pattern",
  sourceKind: "activity",
  sourceLabel: "Mock activity signal",
  excerpt:
    "Three recent event notes show follow-up within one day after founder sessions.",
  collectedAt: fixtureCollectedAt,
};

const contactEvidence: ProfileSignalEvidence = {
  evidenceId: "evidence:contact-market-context",
  sourceKind: "contact",
  sourceLabel: "Mock contact signal",
  excerpt:
    "New contacts from Singapore and Tokyo both reference operator introductions.",
  collectedAt: fixtureCollectedAt,
};

export const mockProfileSignalReviewSuggestions: readonly ProfileUpdateSuggestion[] =
  [
    {
      id: "demo-profile-suggestion-1",
      sourceKind: "chat",
      sourceLabel: "Chat signal",
      targetProfileField: "headline",
      currentValue: "Founder building a relationship operating system",
      suggestedValue:
        "Founder focused on event-grounded relationship workflows",
      rationale:
        "The latest chat summary uses that phrase to explain what Ari wants Orbit to do for follow-up decisions.",
      confidence: "high",
      status: "pending",
      createdAt: fixtureCreatedAt,
      evidence: [chatEvidence],
      provenance: mockProfileSignalReviewQueueProvenance,
    },
    {
      id: "demo-profile-suggestion-2",
      sourceKind: "activity",
      sourceLabel: "Activity signal",
      targetProfileField: "preferredFollowUpWindow",
      currentValue: "48 hours",
      suggestedValue: "24 hours after hosted events",
      rationale:
        "Recent event activity shows Ari sends strongest replies the day after hosted founder sessions.",
      confidence: "medium",
      status: "pending",
      createdAt: fixtureCreatedAt,
      evidence: [activityEvidence],
      provenance: mockProfileSignalReviewQueueProvenance,
    },
    {
      id: "demo-profile-suggestion-3",
      sourceKind: "contact",
      sourceLabel: "Contact signal",
      targetProfileField: "homeMarket",
      currentValue: "Tokyo",
      suggestedValue: "Tokyo and Singapore",
      rationale:
        "Recent sourced contacts add a second active market without replacing the original Tokyo context.",
      confidence: "medium",
      status: "pending",
      createdAt: fixtureCreatedAt,
      evidence: [contactEvidence],
      provenance: mockProfileSignalReviewQueueProvenance,
    },
  ];

export const mockProfileSignalReviewQueueFixture: ProfileSignalReviewQueuePayload =
  {
    state: "success",
    suggestions: mockProfileSignalReviewSuggestions,
    summary:
      "Three sourced profile suggestions are waiting for operator review.",
    provenance: mockProfileSignalReviewQueueProvenance,
    nextAction:
      "Review each suggestion before applying any change to the profile.",
  };

export const mockEmptyProfileSignalReviewQueueFixture: ProfileSignalReviewQueuePayload =
  {
    state: "empty",
    suggestions: [],
    summary: "No sourced profile suggestions are ready for review.",
    provenance: mockEmptyProfileSignalReviewQueueProvenance,
    nextAction:
      "Keep the profile unchanged until a sourced signal creates a suggestion.",
  };

export const mockPendingProfileSignalReviewQueueFixture: ProfileSignalReviewQueuePayload =
  {
    state: "pending",
    suggestions: [mockProfileSignalReviewSuggestions[0]],
    summary: "One chat signal is queued for review before it can update the profile.",
    provenance: mockPendingProfileSignalReviewQueueProvenance,
    nextAction:
      "Wait for the operator to inspect the source excerpt before accepting the profile patch.",
  };

export const mockProfileSignalSuggestionAcceptedFixture: ProfileSignalSuggestionAcceptedPayload =
  {
    state: "accepted",
    acceptedSuggestion: {
      ...mockProfileSignalReviewSuggestions[0],
      status: "accepted",
    },
    profilePatch: {
      headline: "Founder focused on event-grounded relationship workflows",
    },
    appliedFields: ["headline"],
    acceptedAt: fixtureAcceptedAt,
    provenance: mockProfileSignalReviewQueueProvenance,
    nextAction:
      "Apply this patch only after the operator confirms the profile save.",
  };
