import type {
  EventAttendeeRecommendation,
  EventOpeningLinePayload,
  EventRecommendationAttendee,
  EventRecommendationEvent,
  EventRecommendationMatchSignal,
  EventRecommendationOpeningLine,
  EventRecommendationProvenance,
  EventRecommendationSourceReference,
  EventRecommendationsPayload,
} from "./contract";

const fixtureSource = "fixture:features/recommendations/fixtures.ts" as const;
const fixtureCollectedAt = "2026-06-25T20:20:00.000Z";

export const mockEventRecommendationSource: EventRecommendationSourceReference = {
  type: "event_import",
  id: "source:event-recommendation:demo-event-1",
  label: "local event recommendation fixture",
  eventId: "demo-event-1",
  providerRecordId: "mock-event-recommendation:climate-founders-dinner",
  generatedBy: "mock-event-recommendation-service",
};

export const mockEventRecommendationEvent: EventRecommendationEvent = {
  id: "demo-event-1",
  title: "Climate founders dinner",
  venue: "Kanda Founders Table",
  startsAt: "2026-06-28T10:30:00.000Z",
  endsAt: "2026-06-28T13:00:00.000Z",
  source: mockEventRecommendationSource,
  calendarProviderRequested: false,
  liveCalendarRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
};

function attendee(input: {
  attendeeId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  eventIntent: string;
  evidenceIds: readonly string[];
}): EventRecommendationAttendee {
  return {
    ...input,
    source: mockEventRecommendationSource,
    externalProfileRequested: false,
    databaseQueryExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function signal(input: {
  signalId: string;
  label: string;
  detail: string;
  weight: number;
  evidenceIds: readonly string[];
}): EventRecommendationMatchSignal {
  return {
    ...input,
    source: mockEventRecommendationSource,
    generatedBy: "mock-match-signal-rule",
    vectorSearchExecuted: false,
    embeddingGenerated: false,
    rankingProviderRequested: false,
    aiProviderRequested: false,
    externalNetworkRequested: false,
    databaseQueryExecuted: false,
  };
}

function openingLine(input: {
  lineId: string;
  attendeeId: string;
  style: EventRecommendationOpeningLine["style"];
  text: string;
  rationale: string;
  evidenceIds: readonly string[];
}): EventRecommendationOpeningLine {
  return {
    ...input,
    eventId: "demo-event-1",
    source: mockEventRecommendationSource,
    generatedBy: "mock-opening-line-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function recommendation(input: {
  recommendationId: string;
  attendee: EventRecommendationAttendee;
  rank: number;
  score: number;
  scoreBand: EventAttendeeRecommendation["scoreBand"];
  reasons: readonly string[];
  matchSignals: readonly EventRecommendationMatchSignal[];
  openingLine: EventRecommendationOpeningLine;
  recommendedAction: string;
}): EventAttendeeRecommendation {
  return {
    ...input,
    eventId: "demo-event-1",
    source: mockEventRecommendationSource,
    evidenceIds: [
      ...new Set([
        ...input.attendee.evidenceIds,
        ...input.matchSignals.flatMap((matchSignal) => matchSignal.evidenceIds),
        ...input.openingLine.evidenceIds,
      ]),
    ],
    generatedBy: "mock-ranking-rule",
    vectorSearchExecuted: false,
    embeddingGenerated: false,
    rankingProviderRequested: false,
    aiProviderRequested: false,
    databaseQueryExecuted: false,
    externalNetworkRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

const minaPark = attendee({
  attendeeId: "attendee:mina-park",
  displayName: "Mina Park",
  role: "Head of operator partnerships",
  organization: "Grid Harbor",
  relationshipContext:
    "Mina is evaluating storage pilot rollout blockers for climate operators.",
  eventIntent:
    "Compare operator rollout constraints before the follow-up window closes.",
  evidenceIds: [
    "evidence:event-rec-mina-roster",
    "evidence:event-rec-storage-pilot",
  ],
});

const leoGrant = attendee({
  attendeeId: "attendee:leo-grant",
  displayName: "Leo Grant",
  role: "Partnerships lead",
  organization: "Northstar Climate",
  relationshipContext:
    "Leo runs partner programs for founders who need careful introduction sequencing.",
  eventIntent: "Map which partner program conversations need warm context.",
  evidenceIds: [
    "evidence:event-rec-leo-roster",
    "evidence:event-rec-partner-program",
  ],
});

const samRivera = attendee({
  attendeeId: "attendee:sam-rivera",
  displayName: "Sam Rivera",
  role: "Operator investor",
  organization: "Civic Circuit",
  relationshipContext:
    "Sam can explain which investor introductions should wait for stronger operator proof.",
  eventIntent: "Separate investor context from immediate operator follow-up.",
  evidenceIds: [
    "evidence:event-rec-sam-roster",
    "evidence:event-rec-investor-context",
  ],
});

export const mockEventRecommendations: readonly EventAttendeeRecommendation[] = [
  recommendation({
    recommendationId: "event-rec:demo-event-1:mina-park",
    attendee: minaPark,
    rank: 1,
    score: 94,
    scoreBand: "high",
    reasons: [
      "Storage pilot work overlaps with the event goal.",
      "Mina has direct operator rollout context for climate founders.",
      "The opening line can cite only local event roster evidence.",
    ],
    matchSignals: [
      signal({
        signalId: "signal:mina-storage-pilot",
        label: "Storage pilot work",
        detail:
          "Local event evidence links Mina to storage pilot rollout conversations.",
        weight: 0.42,
        evidenceIds: ["evidence:event-rec-storage-pilot"],
      }),
      signal({
        signalId: "signal:mina-operator-overlap",
        label: "Operator overlap",
        detail:
          "The attendee roster marks Mina as an operator partnership owner.",
        weight: 0.34,
        evidenceIds: ["evidence:event-rec-mina-roster"],
      }),
    ],
    openingLine: openingLine({
      lineId: "opening-line:demo-event-1:mina-park",
      attendeeId: "attendee:mina-park",
      style: "warm_context",
      text: "Mina, your storage pilot work came up in the climate dinner context. I would like to compare notes on operator rollout blockers.",
      rationale:
        "The line uses event goal evidence and the attendee roster without model generation.",
      evidenceIds: [
        "evidence:event-rec-mina-roster",
        "evidence:event-rec-storage-pilot",
      ],
    }),
    recommendedAction:
      "Ask Mina about one rollout blocker, then capture source notes before any follow-up.",
  }),
  recommendation({
    recommendationId: "event-rec:demo-event-1:leo-grant",
    attendee: leoGrant,
    rank: 2,
    score: 87,
    scoreBand: "high",
    reasons: [
      "Leo can validate partner program sequencing.",
      "The event context supports a careful warm introduction discussion.",
    ],
    matchSignals: [
      signal({
        signalId: "signal:leo-partner-program",
        label: "Partner program fit",
        detail:
          "Fixture evidence links Leo to partner program design for climate founders.",
        weight: 0.37,
        evidenceIds: ["evidence:event-rec-partner-program"],
      }),
      signal({
        signalId: "signal:leo-warm-context",
        label: "Warm context available",
        detail:
          "The local event roster provides enough context for a concise opener.",
        weight: 0.29,
        evidenceIds: ["evidence:event-rec-leo-roster"],
      }),
    ],
    openingLine: openingLine({
      lineId: "opening-line:demo-event-1:leo-grant",
      attendeeId: "attendee:leo-grant",
      style: "context_question",
      text: "Leo, I saw your partner program work on the climate dinner roster. What makes a founder intro worth doing after an event like this?",
      rationale:
        "The line asks a narrow relationship question from local roster evidence.",
      evidenceIds: [
        "evidence:event-rec-leo-roster",
        "evidence:event-rec-partner-program",
      ],
    }),
    recommendedAction:
      "Ask Leo for partner program constraints and avoid proposing introductions before evidence is captured.",
  }),
  recommendation({
    recommendationId: "event-rec:demo-event-1:sam-rivera",
    attendee: samRivera,
    rank: 3,
    score: 78,
    scoreBand: "medium",
    reasons: [
      "Sam has investor context that is useful after operator evidence is stronger.",
      "The recommended action is a source-backed context check, not immediate outreach.",
    ],
    matchSignals: [
      signal({
        signalId: "signal:sam-investor-context",
        label: "Investor context",
        detail:
          "The fixture marks Sam as an operator investor connected to the event theme.",
        weight: 0.31,
        evidenceIds: ["evidence:event-rec-investor-context"],
      }),
      signal({
        signalId: "signal:sam-follow-up-timing",
        label: "Follow-up timing",
        detail:
          "Local rules rank Sam behind operator validation because the goal prioritizes pilot evidence.",
        weight: 0.21,
        evidenceIds: ["evidence:event-rec-sam-roster"],
      }),
    ],
    openingLine: openingLine({
      lineId: "opening-line:demo-event-1:sam-rivera",
      attendeeId: "attendee:sam-rivera",
      style: "post_event_follow_up",
      text: "Sam, I am separating operator proof from investor intros for this dinner. Could I ask what signal would make a climate founder intro timely?",
      rationale:
        "The line keeps the relationship ask bounded by the local event goal.",
      evidenceIds: [
        "evidence:event-rec-sam-roster",
        "evidence:event-rec-investor-context",
      ],
    }),
    recommendedAction:
      "Use Sam for investor timing context after operator validation notes are captured.",
  }),
];

export const mockEventRecommendationProvenance: EventRecommendationProvenance = {
  source: fixtureSource,
  sourceLabel: "Mock event recommendation fixture",
  evidenceIds: [
    "evidence:event-rec-mina-roster",
    "evidence:event-rec-storage-pilot",
    "evidence:event-rec-leo-roster",
    "evidence:event-rec-partner-program",
    "evidence:event-rec-sam-roster",
    "evidence:event-rec-investor-context",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-event-recommendation-only",
  generationMethod: "fixture",
  vectorSearchExecuted: false,
  embeddingsGenerated: false,
  rankingProviderRequested: false,
  databaseQueryExecuted: false,
  databaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
  externalNetworkRequested: false,
  deviceRequested: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyEventRecommendationProvenance: EventRecommendationProvenance =
  {
    ...mockEventRecommendationProvenance,
    sourceLabel: "Mock empty event recommendation rule",
    evidenceIds: ["evidence:event-recommendation-empty"],
    generationMethod: "rule-based-state",
  };

export const mockPendingEventRecommendationProvenance: EventRecommendationProvenance =
  {
    ...mockEventRecommendationProvenance,
    sourceLabel: "Mock pending event recommendation rule",
    evidenceIds: ["evidence:event-recommendation-pending"],
    generationMethod: "rule-based-state",
  };

export const mockEventRecommendationFailureProvenance: EventRecommendationProvenance =
  {
    ...mockEventRecommendationProvenance,
    sourceLabel: "Mock event recommendation controlled failure rule",
    evidenceIds: ["evidence:event-recommendation-controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockEventRecommendationsFixture: EventRecommendationsPayload = {
  state: "success",
  event: mockEventRecommendationEvent,
  recommendations: mockEventRecommendations,
  summary:
    "Local rules rank event attendees and compose opening lines from fixture evidence without live ranking, vector, or model calls.",
  provenance: mockEventRecommendationProvenance,
  nextAction:
    "Review the top recommendation, then use the opening line only after confirming the source context.",
};

export const mockEmptyEventRecommendationsFixture: EventRecommendationsPayload = {
  state: "empty",
  event: mockEventRecommendationEvent,
  recommendations: [],
  summary:
    "No local attendee recommendation rows are ready for this mock scenario.",
  provenance: mockEmptyEventRecommendationProvenance,
  nextAction:
    "Import or review local event attendees before asking for recommendations.",
};

export const mockPendingEventRecommendationsFixture: EventRecommendationsPayload = {
  state: "pending",
  event: mockEventRecommendationEvent,
  recommendations: [],
  summary:
    "Local attendee review is pending before recommendations or opening lines can be trusted.",
  provenance: mockPendingEventRecommendationProvenance,
  nextAction:
    "Wait for local attendee review before composing recommendations.",
};

export const mockOpeningLineFixture: EventOpeningLinePayload = {
  state: "success",
  event: mockEventRecommendationEvent,
  recommendation: mockEventRecommendations[0],
  openingLine: mockEventRecommendations[0].openingLine,
  alternatives: [
    mockEventRecommendations[1].openingLine,
    mockEventRecommendations[2].openingLine,
  ],
  summary:
    "The opening line is assembled from the selected recommendation and fixture evidence without model generation.",
  provenance: {
    ...mockEventRecommendationProvenance,
    sourceLabel: "Mock event opening-line rule",
    evidenceIds: mockEventRecommendations[0].openingLine.evidenceIds,
    generationMethod: "rule-based-opening-line",
  },
  nextAction:
    "Use this line only as a draft and keep evidence attached before any external message action.",
};
