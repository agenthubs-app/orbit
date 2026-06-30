import type {
  RecommendedContact,
  RecommendedContactConfirmation,
  RecommendedContactConfirmationPayload,
  RecommenderContext,
  ReferralContactDraft,
  ReferralRecommendationEvidence,
  ReferralRecommendationPayload,
  ReferralRecommendationProvenance,
  ReferralSourceReference,
  ReferralSourceSummary,
  UserConfirmedRecommendedContact,
} from "./referral-contract";

export const REFERRAL_RECOMMENDATION_FIXTURE_SOURCE =
  "fixture:features/acquisition/referral-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T18:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T18:06:00.000Z";
const fixtureConfirmedAt = "2026-06-25T18:12:00.000Z";

export const mockReferralSources = {
  founderReferral: {
    type: "referral",
    id: "source:referral:founder",
    label: "Founder referral fixture",
    sourceKind: "founder_referral",
    referralId: "referral:founder:maya-chen",
  },
  investorIntro: {
    type: "referral",
    id: "source:referral:investor",
    label: "Investor intro fixture",
    sourceKind: "investor_intro",
    referralId: "referral:investor:eli-kapoor",
  },
  communityReferral: {
    type: "referral",
    id: "source:referral:community",
    label: "Community referral fixture",
    sourceKind: "community_referral",
    referralId: "referral:community:nora-okafor",
  },
} as const satisfies Record<string, ReferralSourceReference>;

export const mockReferralRecommendationProvenance: ReferralRecommendationProvenance =
  {
    source: REFERRAL_RECOMMENDATION_FIXTURE_SOURCE,
    sourceLabel: "Mock referral recommendation fixture",
    evidenceIds: [
      "evidence:referral:founder-kai",
      "evidence:referral:investor-sofia",
      "evidence:referral:community-rina",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-referral-recommendations-only",
    generationMethod: "fixture",
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    deviceContactReadExecuted: false,
    calendarReadExecuted: false,
    emailReadExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyReferralRecommendationProvenance: ReferralRecommendationProvenance =
  {
    ...mockReferralRecommendationProvenance,
    sourceLabel: "Mock empty referral recommendation rule",
    evidenceIds: ["evidence:referral:empty"],
    generationMethod: "rule-based-referral-recommendation",
  };

export const mockPendingReferralRecommendationProvenance: ReferralRecommendationProvenance =
  {
    ...mockReferralRecommendationProvenance,
    sourceLabel: "Mock pending referral recommendation rule",
    evidenceIds: ["evidence:referral:pending"],
    generationMethod: "rule-based-referral-recommendation",
  };

export const mockReferralRecommendationFailureProvenance: ReferralRecommendationProvenance =
  {
    ...mockReferralRecommendationProvenance,
    sourceLabel: "Mock referral recommendation controlled failure rule",
    evidenceIds: ["evidence:referral:controlled-failure"],
    generationMethod: "rule-based-referral-recommendation",
  };

export const mockReferralSourceSummaries: readonly ReferralSourceSummary[] = [
  {
    kind: "founder_referral",
    label: "Founder referral fixture",
    recommenderCount: 1,
    source: mockReferralSources.founderReferral,
    externalNetworkRequested: false,
    automaticOutreachExecuted: false,
    providerSyncRequested: false,
  },
  {
    kind: "investor_intro",
    label: "Investor intro fixture",
    recommenderCount: 1,
    source: mockReferralSources.investorIntro,
    externalNetworkRequested: false,
    automaticOutreachExecuted: false,
    providerSyncRequested: false,
  },
  {
    kind: "community_referral",
    label: "Community referral fixture",
    recommenderCount: 1,
    source: mockReferralSources.communityReferral,
    externalNetworkRequested: false,
    automaticOutreachExecuted: false,
    providerSyncRequested: false,
  },
];

export const mockReferralRecommendationEvidence: readonly ReferralRecommendationEvidence[] =
  [
    {
      evidenceId: "evidence:referral:founder-kai",
      source: mockReferralSources.founderReferral,
      sourceLabel: "Founder referral fixture",
      excerpt:
        "Maya Chen suggested Kai Mori as a warm operator relationship after the climate systems dinner.",
      capturedFields: ["recommender", "recommendedContact", "warmPath"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-referral-recommendation-service",
    },
    {
      evidenceId: "evidence:referral:investor-sofia",
      source: mockReferralSources.investorIntro,
      sourceLabel: "Investor intro fixture",
      excerpt:
        "Eli Kapoor recommended Sofia Alvarez for marketplace partnership context before any outreach.",
      capturedFields: ["recommender", "recommendedContact", "reason"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-referral-recommendation-service",
    },
    {
      evidenceId: "evidence:referral:community-rina",
      source: mockReferralSources.communityReferral,
      sourceLabel: "Community referral fixture",
      excerpt:
        "Nora Okafor marked Rina Park as a community operator worth reviewing for event follow-up.",
      capturedFields: ["recommender", "recommendedContact", "eventContext"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-referral-recommendation-service",
    },
  ];

export const mockRecommenderContexts: readonly RecommenderContext[] = [
  {
    recommenderId: "recommender:maya-chen",
    displayName: "Maya Chen",
    role: "Founder",
    organization: "North Pier Labs",
    relationshipToUser: "trusted founder peer",
    warmPath: "Shared climate systems dinner and prior product feedback call",
    trustSignal: "Two prior accepted introductions in the local fixture",
    source: mockReferralSources.founderReferral,
    evidenceIds: ["evidence:referral:founder-kai"],
    externalNetworkDiscoveryExecuted: false,
    automaticOutreachExecuted: false,
  },
  {
    recommenderId: "recommender:eli-kapoor",
    displayName: "Eli Kapoor",
    role: "Seed Investor",
    organization: "Signal Bridge Ventures",
    relationshipToUser: "portfolio ecosystem contact",
    warmPath: "Investor office-hours thread captured as fixture context",
    trustSignal: "Introducer has direct partnership history in the fixture",
    source: mockReferralSources.investorIntro,
    evidenceIds: ["evidence:referral:investor-sofia"],
    externalNetworkDiscoveryExecuted: false,
    automaticOutreachExecuted: false,
  },
  {
    recommenderId: "recommender:nora-okafor",
    displayName: "Nora Okafor",
    role: "Community Host",
    organization: "Transit Builders Forum",
    relationshipToUser: "event community organizer",
    warmPath: "Shared event roster note stored as deterministic fixture",
    trustSignal: "Community host personally marked the recommendation",
    source: mockReferralSources.communityReferral,
    evidenceIds: ["evidence:referral:community-rina"],
    externalNetworkDiscoveryExecuted: false,
    automaticOutreachExecuted: false,
  },
];

function buildConfirmation(
  displayName: string,
): RecommendedContactConfirmation {
  return {
    required: true,
    state: "pending",
    question: `Confirm whether ${displayName} should become an Orbit recommended contact draft.`,
  };
}

export const mockRecommendedContacts: readonly RecommendedContact[] = [
  {
    id: "demo-recommendation-1",
    displayName: "Kai Mori",
    role: "Commercial Lead",
    organization: "GridLoop",
    sourceKind: "founder_referral",
    recommender: mockRecommenderContexts[0],
    relationshipContext:
      "Maya knows Kai from grid procurement pilots and supplied the warm path as fixture evidence.",
    reasonForRecommendation:
      "Kai can validate procurement follow-up for climate infrastructure customers.",
    suggestedNextAction:
      "Confirm Kai as a recommended contact, then prepare a founder-led intro request.",
    introductionPath: "Ask Maya for a short opt-in before any message is sent.",
    confidence: "high",
    confirmation: buildConfirmation("Kai Mori"),
    source: mockReferralSources.founderReferral,
    evidenceIds: ["evidence:referral:founder-kai"],
    evidence: mockReferralRecommendationEvidence.filter(
      (evidence) => evidence.evidenceId === "evidence:referral:founder-kai",
    ),
    provenance: mockReferralRecommendationProvenance,
    readyForReview: true,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "demo-recommendation-2",
    displayName: "Sofia Alvarez",
    role: "Partnerships Director",
    organization: "MercadoWorks",
    sourceKind: "investor_intro",
    recommender: mockRecommenderContexts[1],
    relationshipContext:
      "Eli's fixture context ties Sofia to marketplace distribution and partner pilots.",
    reasonForRecommendation:
      "Sofia can compare partner-led acquisition motions before a follow-up is drafted.",
    suggestedNextAction:
      "Confirm Sofia only after preserving Eli's recommender context in the draft.",
    introductionPath: "Request Eli's approval for a narrow partnership intro.",
    confidence: "medium",
    confirmation: buildConfirmation("Sofia Alvarez"),
    source: mockReferralSources.investorIntro,
    evidenceIds: ["evidence:referral:investor-sofia"],
    evidence: mockReferralRecommendationEvidence.filter(
      (evidence) => evidence.evidenceId === "evidence:referral:investor-sofia",
    ),
    provenance: mockReferralRecommendationProvenance,
    readyForReview: true,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  },
  {
    id: "demo-recommendation-3",
    displayName: "Rina Park",
    role: "Operations Advisor",
    organization: "CivicGrid",
    sourceKind: "community_referral",
    recommender: mockRecommenderContexts[2],
    relationshipContext:
      "Nora's event-context fixture says Rina can help interpret transit operator needs.",
    reasonForRecommendation:
      "Rina has event-grounded context, not a scraped social graph path.",
    suggestedNextAction:
      "Confirm Rina as a recommended contact before adding an event follow-up task.",
    introductionPath: "Ask Nora to confirm Rina's preferred intro channel.",
    confidence: "medium",
    confirmation: buildConfirmation("Rina Park"),
    source: mockReferralSources.communityReferral,
    evidenceIds: ["evidence:referral:community-rina"],
    evidence: mockReferralRecommendationEvidence.filter(
      (evidence) => evidence.evidenceId === "evidence:referral:community-rina",
    ),
    provenance: mockReferralRecommendationProvenance,
    readyForReview: true,
    multiHopSocialGraphDiscoveryExecuted: false,
    automaticFriendOfFriendOutreachExecuted: false,
    externalNetworkRequested: false,
    contactWriteExecuted: false,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    notificationDelivered: false,
  },
];

export const mockReferralContactDrafts: readonly ReferralContactDraft[] =
  mockRecommendedContacts.map((recommendation) => ({
    id: `referral-draft:${recommendation.id}`,
    recommendationId: recommendation.id,
    displayName: recommendation.displayName,
    role: recommendation.role,
    organization: recommendation.organization,
    sourceKind: recommendation.sourceKind,
    recommender: recommendation.recommender,
    relationshipContext: recommendation.relationshipContext,
    suggestedNextAction: recommendation.suggestedNextAction,
    confidence: recommendation.confidence,
    source: recommendation.source,
    evidence: recommendation.evidence,
    provenance: mockReferralRecommendationProvenance,
    confirmationRequired: true,
    userConfirmed: false,
    readyForReview: true,
    contactWriteExecuted: false,
    externalActionExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  }));

export const mockReferralRecommendationFixture: ReferralRecommendationPayload = {
  state: "success",
  referralSources: mockReferralSourceSummaries,
  recommendations: mockRecommendedContacts,
  contactDrafts: mockReferralContactDrafts,
  summary:
    "Three recommended contacts are staged from deterministic referral fixtures with recommender context attached.",
  provenance: mockReferralRecommendationProvenance,
  nextAction:
    "Review recommender context and explicitly confirm a recommended contact before any future live outreach.",
};

export const mockEmptyReferralRecommendationFixture: ReferralRecommendationPayload =
  {
    state: "empty",
    referralSources: [],
    recommendations: [],
    contactDrafts: [],
    summary:
      "No referral recommendations are available in the local fixture.",
    provenance: mockEmptyReferralRecommendationProvenance,
    nextAction:
      "Ask a trusted recommender to share a mock referral before staging recommended contact drafts.",
  };

export const mockPendingReferralRecommendationFixture: ReferralRecommendationPayload =
  {
    state: "pending",
    referralSources: mockReferralSourceSummaries.map((source) => ({
      ...source,
      recommenderCount: 0,
    })),
    recommendations: [],
    contactDrafts: [],
    summary:
      "Referral recommendations are pending local recommender-context review.",
    provenance: mockPendingReferralRecommendationProvenance,
    nextAction:
      "Wait for mock recommender review before confirming recommended contacts.",
  };

export const mockRecommendedContactConfirmationEvidence: ReferralRecommendationEvidence =
  {
    evidenceId: "evidence:referral:confirmation:demo-recommendation-1",
    source: mockReferralSources.founderReferral,
    sourceLabel: "Rule-based recommended contact confirmation",
    excerpt:
      "Demo operator confirmed Kai Mori from Maya Chen's founder referral fixture.",
    capturedFields: ["recommendationId", "actorLabel", "confirmedAt"],
    createdAt: fixtureConfirmedAt,
    createdBy: "mock-referral-recommendation-service",
  };

const confirmedRecommendedContact: UserConfirmedRecommendedContact = {
  id: "confirmed-recommended-contact:demo-recommendation-1",
  recommendationId: "demo-recommendation-1",
  displayName: mockRecommendedContacts[0].displayName,
  role: mockRecommendedContacts[0].role,
  organization: mockRecommendedContacts[0].organization,
  sourceKind: mockRecommendedContacts[0].sourceKind,
  recommender: mockRecommendedContacts[0].recommender,
  confirmedAt: fixtureConfirmedAt,
  confirmedBy: "Demo operator",
  userConfirmed: true,
  source: mockRecommendedContacts[0].source,
  evidence: [
    ...mockRecommendedContacts[0].evidence,
    mockRecommendedContactConfirmationEvidence,
  ],
  provenance: {
    ...mockReferralRecommendationProvenance,
    sourceLabel: "Rule-based recommended contact confirmation",
    evidenceIds: [
      ...mockRecommendedContacts[0].evidenceIds,
      mockRecommendedContactConfirmationEvidence.evidenceId,
    ],
    generationMethod: "rule-based-referral-recommendation",
  },
  nextAction:
    "Use the confirmed recommendation as source evidence for a future contact workflow; no message is sent in this mock.",
  contactWriteExecuted: false,
  externalOutreachExecuted: false,
  databaseWriteExecuted: false,
  notificationDelivered: false,
};

export const mockConfirmedRecommendedContactFixture: RecommendedContactConfirmationPayload =
  {
    state: "confirmed",
    confirmedContact: confirmedRecommendedContact,
    createdEvidence: mockRecommendedContactConfirmationEvidence,
    confirmedAt: fixtureConfirmedAt,
    confirmedBy: "Demo operator",
    provenance: confirmedRecommendedContact.provenance,
    nextAction:
      "Carry the recommender context into the next product route before any live contact write or outreach action.",
    contactWriteExecuted: false,
    externalActionExecuted: false,
    databaseWriteExecuted: false,
    notificationDelivered: false,
  };
