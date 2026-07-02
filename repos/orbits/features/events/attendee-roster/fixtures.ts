import type {
  EventAttendeeEventSummary,
  EventAttendeeEvidence,
  EventAttendeeKnownContactMarker,
  EventAttendeeRecommendationCandidate,
  EventAttendeeRecommendationEligibility,
  EventAttendeeRosterImportPayload,
  EventAttendeeRosterPayload,
  EventAttendeeRosterProvenance,
  EventAttendeeRosterRecord,
  EventAttendeeRosterState,
  EventAttendeeSourceReference,
  EventAttendeeTag,
} from "./contract";

export const EVENT_ATTENDEE_ROSTER_FIXTURE_SOURCE =
  "fixture:features/events/attendee-roster/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T18:30:00.000Z";
const fixtureCreatedAt = "2026-06-25T18:36:00.000Z";
const fixtureImportedAt = "2026-06-25T18:40:00.000Z";

export const eventAttendeeRosterTags = {
  climateOperator: {
    code: "climate_operator",
    label: "Climate operator",
    rationale:
      "The attendee works directly in climate operations or climate partnerships.",
  },
  investorContext: {
    code: "investor_context",
    label: "Investor context",
    rationale:
      "The attendee is useful for founder or investor relationship context.",
  },
  knownContact: {
    code: "known_contact",
    label: "Known contact",
    rationale:
      "A deterministic local contact marker already links this attendee to Orbit context.",
  },
  partnerPath: {
    code: "partner_path",
    label: "Partner path",
    rationale:
      "The attendee can open a practical partner or distribution conversation.",
  },
  speaker: {
    code: "speaker",
    label: "Speaker",
    rationale:
      "The attendee has speaker context that can justify a higher-priority review.",
  },
  storagePilot: {
    code: "storage_pilot",
    label: "Storage pilot",
    rationale:
      "The attendee maps to the active storage pilot opportunity scenario.",
  },
} as const satisfies Record<string, EventAttendeeTag>;

export const mockEventAttendeeRosterSource: EventAttendeeSourceReference = {
  type: "event_import",
  id: "source:event-roster:demo-event-1",
  label: "privacy-approved organizer roster fixture",
  eventId: "demo-event-1",
};

export const mockEventAttendeeRosterProvenance: EventAttendeeRosterProvenance =
  {
    source: EVENT_ATTENDEE_ROSTER_FIXTURE_SOURCE,
    sourceLabel: "Mock event attendee roster fixture",
    evidenceIds: [
      "evidence:event-roster-privacy-gate",
      "evidence:event-roster-tags",
      "evidence:event-roster-recommendation-pool",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-event-attendee-roster-only",
    generationMethod: "fixture",
    organizerFeedRequested: false,
    privacyRosterAccessRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyEventAttendeeRosterProvenance: EventAttendeeRosterProvenance =
  {
    ...mockEventAttendeeRosterProvenance,
    sourceLabel: "Mock empty event attendee roster rule",
    evidenceIds: ["evidence:event-roster-empty"],
    generationMethod: "rule-based-roster-filter",
  };

export const mockPendingEventAttendeeRosterProvenance: EventAttendeeRosterProvenance =
  {
    ...mockEventAttendeeRosterProvenance,
    sourceLabel: "Mock pending event attendee roster rule",
    evidenceIds: ["evidence:event-roster-pending"],
    generationMethod: "rule-based-roster-filter",
  };

export const mockEventAttendeeRosterFailureProvenance: EventAttendeeRosterProvenance =
  {
    ...mockEventAttendeeRosterProvenance,
    sourceLabel: "Mock event attendee roster controlled failure rule",
    evidenceIds: ["evidence:event-roster-controlled-failure"],
    generationMethod: "rule-based-roster-filter",
  };

export const mockEventAttendeeRosterEvent: EventAttendeeEventSummary = {
  id: "demo-event-1",
  name: "Climate founders dinner",
  organizer: "Orbit demo events",
  venue: "Daikanyama Founders Room",
  startsAt: "2026-06-25T19:00:00.000+09:00",
  rosterAccessStatus: "available",
  source: mockEventAttendeeRosterSource,
  organizerFeedRequested: false,
  privacyRosterAccessRequested: false,
  liveDatabaseWriteExecuted: false,
};

export const mockEmptyEventAttendeeRosterEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeRosterEvent,
  rosterAccessStatus: "empty",
};

export const mockPendingEventAttendeeRosterEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeRosterEvent,
  rosterAccessStatus: "pending",
};

export const mockEventAttendeeRosterEvidence: readonly EventAttendeeEvidence[] =
  [
    {
      evidenceId: "evidence:event-roster-privacy-gate",
      source: mockEventAttendeeRosterSource,
      sourceLabel: "Privacy-approved roster fixture",
      excerpt:
        "Local fixture represents a privacy-approved organizer roster for demo-event-1.",
      capturedFields: ["eventId", "displayName", "organization"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-event-attendee-roster-service",
    },
    {
      evidenceId: "evidence:event-roster-tags",
      source: mockEventAttendeeRosterSource,
      sourceLabel: "Attendee tag fixture",
      excerpt:
        "Mock rules tag attendees by event role, existing-contact marker, and active opportunity context.",
      capturedFields: ["attendeeTags", "knownContactMarker"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-event-attendee-roster-service",
    },
    {
      evidenceId: "evidence:event-roster-recommendation-pool",
      source: mockEventAttendeeRosterSource,
      sourceLabel: "Recommendation eligibility fixture",
      excerpt:
        "Local rules admit new or high-priority attendees into the recommendation pool without AI calls.",
      capturedFields: ["eligibleRecommendation", "relationshipContext"],
      createdAt: fixtureCreatedAt,
      createdBy: "mock-event-attendee-roster-service",
    },
  ];

function knownContactMarker(input: {
  attendeeId: string;
  contactId: string | null;
  rationale: string;
}): EventAttendeeKnownContactMarker {
  const isKnownContact = input.contactId !== null;

  return {
    attendeeId: input.attendeeId,
    isKnownContact,
    contactId: input.contactId,
    matchSource: isKnownContact
      ? "existing-contact-fixture"
      : "no-known-contact-match",
    confidence: isKnownContact ? "high" : "none",
    rationale: input.rationale,
  };
}

function recommendationEligibility(input: {
  attendeeId: string;
  candidateId: string | null;
  reasons: readonly string[];
  blockedByKnownContact?: boolean;
}): EventAttendeeRecommendationEligibility {
  return {
    attendeeId: input.attendeeId,
    isEligible: input.candidateId !== null,
    recommendationCandidateId: input.candidateId,
    reasons: input.reasons,
    blockedByKnownContact: input.blockedByKnownContact ?? false,
    generatedBy: "mock-attendee-roster-rules",
  };
}

function attendeeSource(attendeeId: string): EventAttendeeSourceReference {
  return {
    ...mockEventAttendeeRosterSource,
    attendeeId,
  };
}

export const mockEventAttendeeRosterRecords: readonly EventAttendeeRosterRecord[] =
  [
    {
      attendeeId: "attendee:demo-1",
      displayName: "Aiko Mori",
      role: "VP Partnerships",
      organization: "Blue Harbor Climate",
      email: "aiko.mori@blueharbor.example",
      eventRole: "attendee",
      checkInStatus: "checked_in",
      attendeeTags: [
        eventAttendeeRosterTags.climateOperator,
        eventAttendeeRosterTags.partnerPath,
      ],
      knownContactMarker: knownContactMarker({
        attendeeId: "attendee:demo-1",
        contactId: null,
        rationale:
          "No known local contact marker exists, so Aiko remains eligible for a new relationship recommendation.",
      }),
      eligibleRecommendation: recommendationEligibility({
        attendeeId: "attendee:demo-1",
        candidateId: "recommendation-candidate:attendee-demo-1",
        reasons: [
          "Climate operator context matches the event goal.",
          "Partner-path tag suggests an actionable follow-up.",
        ],
      }),
      relationshipContext:
        "Aiko joined the climate founders dinner to discuss distribution partnerships for grid resilience pilots.",
      suggestedNextAction:
        "Prepare a partner-path question before recommending Aiko for review.",
      source: attendeeSource("attendee:demo-1"),
      evidenceIds: [
        "evidence:event-roster-privacy-gate",
        "evidence:event-roster-recommendation-pool",
      ],
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      externalLookupExecuted: false,
      databaseWriteExecuted: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    {
      attendeeId: "attendee:demo-2",
      displayName: "Luis Ortega",
      role: "Partner",
      organization: "Catalyst Ventures",
      email: "luis.ortega@catalyst.example",
      eventRole: "attendee",
      checkInStatus: "registered",
      attendeeTags: [
        eventAttendeeRosterTags.investorContext,
        eventAttendeeRosterTags.knownContact,
      ],
      knownContactMarker: knownContactMarker({
        attendeeId: "attendee:demo-2",
        contactId: "contact:luis-ortega",
        rationale:
          "Luis is already present in the local contact fixture and should be refreshed, not re-imported.",
      }),
      eligibleRecommendation: recommendationEligibility({
        attendeeId: "attendee:demo-2",
        candidateId: null,
        reasons: [
          "Known-contact marker blocks duplicate recommendation pool admission.",
        ],
        blockedByKnownContact: true,
      }),
      relationshipContext:
        "Luis is already known from a prior climate investor salon and appears in this roster for context refresh.",
      suggestedNextAction:
        "Refresh Luis with the dinner context before deciding whether to add a follow-up task.",
      source: attendeeSource("attendee:demo-2"),
      evidenceIds: [
        "evidence:event-roster-privacy-gate",
        "evidence:event-roster-tags",
      ],
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      externalLookupExecuted: false,
      databaseWriteExecuted: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    {
      attendeeId: "attendee:demo-3",
      displayName: "Priya Shah",
      role: "CEO",
      organization: "Solace Battery",
      email: "priya.shah@solace.example",
      eventRole: "speaker",
      checkInStatus: "checked_in",
      attendeeTags: [
        eventAttendeeRosterTags.speaker,
        eventAttendeeRosterTags.storagePilot,
      ],
      knownContactMarker: knownContactMarker({
        attendeeId: "attendee:demo-3",
        contactId: null,
        rationale:
          "No known local contact marker exists and speaker context raises the recommendation priority.",
      }),
      eligibleRecommendation: recommendationEligibility({
        attendeeId: "attendee:demo-3",
        candidateId: "recommendation-candidate:attendee-demo-3",
        reasons: [
          "Speaker role provides source context.",
          "Storage pilot tag matches the current opportunity scenario.",
        ],
      }),
      relationshipContext:
        "Priya spoke about storage reliability and maps to the current storage pilot follow-up goal.",
      suggestedNextAction:
        "Recommend Priya for post-event review with storage pilot context attached.",
      source: attendeeSource("attendee:demo-3"),
      evidenceIds: [
        "evidence:event-roster-tags",
        "evidence:event-roster-recommendation-pool",
      ],
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      externalLookupExecuted: false,
      databaseWriteExecuted: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
  ];

export function buildEligibleRecommendationPool(
  attendees: readonly EventAttendeeRosterRecord[],
): readonly EventAttendeeRecommendationCandidate[] {
  return attendees
    .filter((attendee) => attendee.eligibleRecommendation.isEligible)
    .map((attendee) => ({
      attendeeId: attendee.attendeeId,
      recommendationCandidateId:
        attendee.eligibleRecommendation.recommendationCandidateId ?? "",
      displayName: attendee.displayName,
      organization: attendee.organization,
      tags: attendee.attendeeTags,
      reasons: attendee.eligibleRecommendation.reasons,
      source: attendee.source,
      evidenceIds: attendee.evidenceIds,
      aiProviderRequested: false,
      liveDatabaseWriteExecuted: false,
    }));
}

export function buildEventAttendeeRosterPayload(input: {
  attendees: readonly EventAttendeeRosterRecord[];
  summary: string;
  evidenceIds: readonly string[];
  generationMethod: EventAttendeeRosterProvenance["generationMethod"];
  sourceLabel: string;
  state?: EventAttendeeRosterState;
  event?: EventAttendeeEventSummary;
  nextAction: string;
}): EventAttendeeRosterPayload {
  const attendeeTags = Array.from(
    new Map(
      input.attendees
        .flatMap((attendee) => attendee.attendeeTags)
        .map((tag) => [tag.code, tag]),
    ).values(),
  );
  const state =
    input.state ?? (input.attendees.length > 0 ? "success" : "empty");

  return {
    state,
    event: input.event ?? mockEventAttendeeRosterEvent,
    attendees: input.attendees,
    attendeeTags,
    knownContactMarkers: input.attendees.map(
      (attendee) => attendee.knownContactMarker,
    ),
    eligibleRecommendationPool: buildEligibleRecommendationPool(
      input.attendees,
    ),
    summary: input.summary,
    provenance: {
      ...mockEventAttendeeRosterProvenance,
      evidenceIds: input.evidenceIds,
      generationMethod: input.generationMethod,
      sourceLabel: input.sourceLabel,
    },
    nextAction: input.nextAction,
  };
}

export const mockEventAttendeeRosterFixture: EventAttendeeRosterPayload =
  buildEventAttendeeRosterPayload({
    attendees: mockEventAttendeeRosterRecords,
    summary:
      "Three privacy-approved attendee roster rows are available with tags, known-contact markers, and recommendation eligibility.",
    evidenceIds: mockEventAttendeeRosterProvenance.evidenceIds,
    generationMethod: "fixture",
    sourceLabel: "Mock event attendee roster fixture",
    nextAction:
      "Review tags, known-contact markers, and eligible recommendations before composing follow-up actions.",
  });

export const mockEmptyEventAttendeeRosterFixture: EventAttendeeRosterPayload = {
  state: "empty",
  event: mockEmptyEventAttendeeRosterEvent,
  attendees: [],
  attendeeTags: [],
  knownContactMarkers: [],
  eligibleRecommendationPool: [],
  summary: "No privacy-approved attendee roster rows are available.",
  provenance: mockEmptyEventAttendeeRosterProvenance,
  nextAction:
    "Wait for a privacy-approved local roster fixture before recommending attendees.",
};

export const mockPendingEventAttendeeRosterFixture: EventAttendeeRosterPayload =
  {
    state: "pending",
    event: mockPendingEventAttendeeRosterEvent,
    attendees: [],
    attendeeTags: [],
    knownContactMarkers: [],
    eligibleRecommendationPool: [],
    summary:
      "The mock attendee roster is pending privacy-gated local review before tags or recommendations can be shown.",
    provenance: mockPendingEventAttendeeRosterProvenance,
    nextAction:
      "Keep the roster pending until a local privacy review fixture marks access approved.",
  };

export function buildEventAttendeeRosterImportPayload(
  roster: EventAttendeeRosterPayload,
): EventAttendeeRosterImportPayload {
  return {
    ...roster,
    importBatch: {
      id: "event-attendee-roster-import:demo-event-1",
      eventId: roster.event.id,
      stagedAt: fixtureImportedAt,
      attendeeIds: roster.attendees.map((attendee) => attendee.attendeeId),
      recommendationCandidateIds: roster.eligibleRecommendationPool.map(
        (candidate) => candidate.recommendationCandidateId,
      ),
      organizerFeedRequested: false,
      privacyRosterAccessRequested: false,
      liveDatabaseWriteExecuted: false,
      externalNetworkRequested: false,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
    },
    provenance: {
      ...roster.provenance,
      generationMethod: "rule-based-roster-import",
      sourceLabel: "Mock event attendee roster import rule",
    },
    summary:
      roster.state === "success"
        ? "The mock roster import staged eligible recommendation candidates without organizer, database, AI, calendar, email, or notification calls."
        : roster.summary,
  };
}

export const mockEventAttendeeRosterImportFixture: EventAttendeeRosterImportPayload =
  buildEventAttendeeRosterImportPayload(mockEventAttendeeRosterFixture);

export const mockEmptyEventAttendeeRosterImportFixture: EventAttendeeRosterImportPayload =
  buildEventAttendeeRosterImportPayload(mockEmptyEventAttendeeRosterFixture);

export const mockPendingEventAttendeeRosterImportFixture: EventAttendeeRosterImportPayload =
  buildEventAttendeeRosterImportPayload(mockPendingEventAttendeeRosterFixture);
