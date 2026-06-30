import type {
  EventValueRecommendation,
  EventValueRecommendationAcceptancePayload,
  EventValueRecommendationCalendarFit,
  EventValueRecommendationFactors,
  EventValueRecommendationProfile,
  EventValueRecommendationProvenance,
  EventValueRecommendationScoreBand,
  EventValueRecommendationSignal,
  EventValueRecommendationSourceReference,
  EventValueRecommendationsPayload,
} from "./event-value-contract";

export const EVENT_VALUE_RECOMMENDATION_FIXTURE_SOURCE =
  "fixture:features/recommendations/event-value-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T21:35:00.000Z";

export const mockEventValueRecommendationSource: EventValueRecommendationSourceReference =
  {
    type: "event_import",
    id: "source:event-value:demo-profile",
    label: "local event value fixture",
    providerRecordId: "mock-event-value:tokyo-climate-operator-track",
    generatedBy: "mock-event-value-service",
  };

export const mockEventValueRecommendationProfile: EventValueRecommendationProfile =
  {
    profileId: "profile:demo-founder",
    goal: "Find climate operators with buyer urgency",
    location: "Tokyo",
    industryPreference: "climate",
    calendarFit: "open",
    source: mockEventValueRecommendationSource,
    evidenceIds: [
      "evidence:event-value-profile-goal",
      "evidence:event-value-location",
      "evidence:event-value-industry",
      "evidence:event-value-calendar-window",
    ],
  };

function signal(input: {
  signalId: string;
  label: string;
  detail: string;
  factor: keyof EventValueRecommendationFactors;
  weight: number;
  evidenceIds: readonly string[];
}): EventValueRecommendationSignal {
  return {
    ...input,
    source: mockEventValueRecommendationSource,
    generatedBy: "mock-event-value-rule",
    liveEventDiscoveryFeedRequested: false,
    calendarProviderRequested: false,
    databaseQueryExecuted: false,
    aiProviderRequested: false,
    externalNetworkRequested: false,
  };
}

function recommendation(input: {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  venue: string;
  industry: string;
  attendeeDensity: number;
  calendarFit: EventValueRecommendationCalendarFit;
  valueScore: number;
  scoreBand: EventValueRecommendationScoreBand;
  factors: EventValueRecommendationFactors;
  signals: readonly EventValueRecommendationSignal[];
  recommendedAction: string;
  evidenceIds: readonly string[];
}): EventValueRecommendation {
  return {
    ...input,
    source: mockEventValueRecommendationSource,
    evidenceIds: [
      ...new Set([
        ...input.evidenceIds,
        ...input.signals.flatMap((item) => item.evidenceIds),
      ]),
    ],
    generatedBy: "mock-event-value-rule",
    calendarAvailabilitySynced: false,
    liveEventDiscoveryFeedRequested: false,
    externalNetworkRequested: false,
    databaseQueryExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

export const mockEventValueRecommendations: readonly EventValueRecommendation[] =
  [
    recommendation({
      eventId: "demo-event-1",
      title: "Climate operators breakfast",
      startsAt: "2026-06-29T00:00:00.000Z",
      endsAt: "2026-06-29T01:30:00.000Z",
      location: "Tokyo",
      venue: "Nihonbashi Climate Table",
      industry: "climate",
      attendeeDensity: 42,
      calendarFit: "open",
      valueScore: 94,
      scoreBand: "high",
      factors: {
        profileGoal: 0.35,
        location: 0.2,
        industryPreference: 0.2,
        attendeeDensity: 0.15,
        calendarFit: 0.1,
      },
      signals: [
        signal({
          signalId: "signal:event-value-buyer-urgency",
          label: "Buyer urgency",
          detail:
            "Local event notes mark the attendee mix as operators with near-term climate purchasing needs.",
          factor: "profileGoal",
          weight: 0.35,
          evidenceIds: ["evidence:event-value-profile-goal"],
        }),
        signal({
          signalId: "signal:event-value-open-calendar",
          label: "Calendar fit",
          detail:
            "The fixture marks a free morning slot; no live calendar sync was requested.",
          factor: "calendarFit",
          weight: 0.1,
          evidenceIds: ["evidence:event-value-calendar-window"],
        }),
      ],
      recommendedAction:
        "Attend for operator discovery and capture source notes before any follow-up action.",
      evidenceIds: [
        "evidence:event-value-profile-goal",
        "evidence:event-value-location",
        "evidence:event-value-industry",
      ],
    }),
    recommendation({
      eventId: "demo-event-2",
      title: "Fintech partnership salon",
      startsAt: "2026-06-30T08:00:00.000Z",
      endsAt: "2026-06-30T10:00:00.000Z",
      location: "Tokyo",
      venue: "Marunouchi Founder Hall",
      industry: "fintech",
      attendeeDensity: 31,
      calendarFit: "tight",
      valueScore: 82,
      scoreBand: "high",
      factors: {
        profileGoal: 0.22,
        location: 0.2,
        industryPreference: 0.12,
        attendeeDensity: 0.14,
        calendarFit: 0.04,
      },
      signals: [
        signal({
          signalId: "signal:event-value-partnership",
          label: "Partnership path",
          detail:
            "The fixture links the event to BD leaders who can compare channel partnership constraints.",
          factor: "profileGoal",
          weight: 0.22,
          evidenceIds: ["evidence:event-value-partnership-path"],
        }),
        signal({
          signalId: "signal:event-value-tokyo-location",
          label: "Tokyo location",
          detail: "The event is local to the demo profile location.",
          factor: "location",
          weight: 0.2,
          evidenceIds: ["evidence:event-value-location"],
        }),
      ],
      recommendedAction:
        "Use as a secondary option if partnership validation is more important than climate operator urgency.",
      evidenceIds: [
        "evidence:event-value-location",
        "evidence:event-value-partnership-path",
      ],
    }),
    recommendation({
      eventId: "demo-event-3",
      title: "Founder pipeline clinic",
      startsAt: "2026-07-01T04:00:00.000Z",
      endsAt: "2026-07-01T05:30:00.000Z",
      location: "Osaka",
      venue: "Kita Startup Lab",
      industry: "startup operations",
      attendeeDensity: 18,
      calendarFit: "open",
      valueScore: 68,
      scoreBand: "medium",
      factors: {
        profileGoal: 0.15,
        location: 0.04,
        industryPreference: 0.06,
        attendeeDensity: 0.08,
        calendarFit: 0.1,
      },
      signals: [
        signal({
          signalId: "signal:event-value-pipeline-learning",
          label: "Pipeline learning",
          detail:
            "The fixture suggests useful process learning but weaker direct climate buyer fit.",
          factor: "profileGoal",
          weight: 0.15,
          evidenceIds: ["evidence:event-value-pipeline-learning"],
        }),
        signal({
          signalId: "signal:event-value-distance",
          label: "Location mismatch",
          detail:
            "The event is outside Tokyo, so local fit is lower in the deterministic score.",
          factor: "location",
          weight: 0.04,
          evidenceIds: ["evidence:event-value-location"],
        }),
      ],
      recommendedAction:
        "Keep as a learning event, not the primary relationship-building recommendation.",
      evidenceIds: [
        "evidence:event-value-pipeline-learning",
        "evidence:event-value-location",
      ],
    }),
  ];

export const mockEventValueRecommendationProvenance: EventValueRecommendationProvenance =
  {
    source: EVENT_VALUE_RECOMMENDATION_FIXTURE_SOURCE,
    sourceLabel: "Mock event value recommendation fixture",
    evidenceIds: [
      "evidence:event-value-profile-goal",
      "evidence:event-value-location",
      "evidence:event-value-industry",
      "evidence:event-value-calendar-window",
      "evidence:event-value-partnership-path",
      "evidence:event-value-pipeline-learning",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-event-value-recommendation-only",
    generationMethod: "fixture",
    calendarProviderRequested: false,
    calendarAvailabilitySynced: false,
    liveEventDiscoveryFeedRequested: false,
    databaseQueryExecuted: false,
    databaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyEventValueRecommendationProvenance: EventValueRecommendationProvenance =
  {
    ...mockEventValueRecommendationProvenance,
    sourceLabel: "Mock empty event value recommendation rule",
    evidenceIds: ["evidence:event-value-empty"],
    generationMethod: "rule-based-state",
  };

export const mockPendingEventValueRecommendationProvenance: EventValueRecommendationProvenance =
  {
    ...mockEventValueRecommendationProvenance,
    sourceLabel: "Mock pending event value recommendation rule",
    evidenceIds: ["evidence:event-value-pending"],
    generationMethod: "rule-based-state",
  };

export const mockEventValueRecommendationFailureProvenance: EventValueRecommendationProvenance =
  {
    ...mockEventValueRecommendationProvenance,
    sourceLabel: "Mock event value recommendation controlled failure rule",
    evidenceIds: ["evidence:event-value-controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockEventValueRecommendationsFixture: EventValueRecommendationsPayload =
  {
    state: "success",
    profile: mockEventValueRecommendationProfile,
    recommendations: mockEventValueRecommendations,
    summary:
      "Local rules rank recommended events by profile goal, location, industry preference, attendee density, and calendar fit without live calendars or event feeds.",
    provenance: mockEventValueRecommendationProvenance,
    nextAction:
      "Review the top event value recommendation before accepting any reminder or follow-up action.",
  };

export const mockEmptyEventValueRecommendationsFixture: EventValueRecommendationsPayload =
  {
    state: "empty",
    profile: mockEventValueRecommendationProfile,
    recommendations: [],
    summary:
      "No local event fixture matches the current mock profile filters.",
    provenance: mockEmptyEventValueRecommendationProvenance,
    nextAction:
      "Adjust the local demo profile filters or review event fixtures before recommending events.",
  };

export const mockPendingEventValueRecommendationsFixture: EventValueRecommendationsPayload =
  {
    state: "pending",
    profile: mockEventValueRecommendationProfile,
    recommendations: [],
    summary:
      "Calendar-fit review is pending before event value recommendations can be trusted.",
    provenance: mockPendingEventValueRecommendationProvenance,
    nextAction:
      "Resolve the local calendar-fit review before accepting an event recommendation.",
  };

export const mockAcceptedEventValueRecommendationFixture: EventValueRecommendationAcceptancePayload =
  {
    state: "accepted",
    acceptedEvent: mockEventValueRecommendations[0],
    action: {
      actionId: "event-value-action:demo-event-1:accept",
      label: "Accept event value recommendation",
      generatedBy: "mock-event-value-service",
      evidenceIds: mockEventValueRecommendations[0].evidenceIds,
      source: mockEventValueRecommendationSource,
      externalNetworkRequested: false,
      calendarProviderRequested: false,
      notificationDelivered: false,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
    },
    summary:
      "The accept action records a local mock decision without writing calendars, notifications, databases, or external messages.",
    provenance: {
      ...mockEventValueRecommendationProvenance,
      sourceLabel: "Mock event value accept action",
      evidenceIds: mockEventValueRecommendations[0].evidenceIds,
      generationMethod: "rule-based-acceptance",
    },
    nextAction:
      "Keep the accepted event source-backed until a live action sandbox is explicitly wired.",
  };
