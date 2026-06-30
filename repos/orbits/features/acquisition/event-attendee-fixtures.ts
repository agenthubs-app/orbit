import type {
  EventAttendeeContactDraft,
  EventAttendeeEventSummary,
  EventAttendeeEvidence,
  EventAttendeeImportPayload,
  EventAttendeeImportProvenance,
  EventAttendeeRecord,
  EventAttendeeRelationshipStatus,
  EventAttendeeRosterPayload,
  EventAttendeeSourceReference,
} from "./event-attendee-contract";

export const EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE =
  "fixture:features/acquisition/event-attendee-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T15:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T15:07:00.000Z";

export const mockEventAttendeeSource: EventAttendeeSourceReference = {
  type: "event_import",
  id: "source:event-import:demo-event-1",
  label: "organizer roster fixture for climate founders dinner",
  eventId: "demo-event-1",
};

export const eventAttendeeRelationshipStatuses = {
  newPotentialContact: {
    code: "new_potential_contact",
    label: "New potential contact",
    rationale:
      "No existing relationship was found in the mock roster, but the event context matches current BD goals.",
    suggestedPriority: "review",
  },
  knownContact: {
    code: "known_contact",
    label: "Known contact",
    rationale:
      "The deterministic fixture marks this attendee as already known and suitable for context refresh.",
    suggestedPriority: "warm",
  },
  priorityFollowUp: {
    code: "priority_follow_up",
    label: "Priority follow-up",
    rationale:
      "Speaker role and shared event goals make this attendee a high-priority relationship review.",
    suggestedPriority: "high",
  },
  needsContext: {
    code: "needs_context",
    label: "Needs context",
    rationale:
      "The attendee can be reviewed after the operator adds relationship context.",
    suggestedPriority: "review",
  },
} as const satisfies Record<string, EventAttendeeRelationshipStatus>;

export const mockEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    source: EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE,
    sourceLabel: "Mock event attendee import fixture",
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-conversation-thread",
      "evidence:event-import-goal-fit",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-event-attendee-import-only",
    generationMethod: "fixture",
    organizerFeedRequested: false,
    bulkDatabaseImportExecuted: false,
    externalNetworkRequested: false,
  };

export const mockEmptyEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock empty event attendee import rule",
    evidenceIds: ["evidence:event-import-empty-roster"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockPendingEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock pending event attendee import rule",
    evidenceIds: ["evidence:event-import-pending-roster"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockEventAttendeeImportFailureProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock event attendee import controlled failure rule",
    evidenceIds: ["evidence:event-import-controlled-failure"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockEventAttendeeEvent: EventAttendeeEventSummary = {
  id: "demo-event-1",
  name: "Climate founders dinner",
  organizer: "Orbit demo events",
  venue: "Daikanyama Founders Room",
  startsAt: "2026-06-25T19:00:00.000+09:00",
  importStatus: "ready",
  source: mockEventAttendeeSource,
  organizerFeedRequested: false,
  bulkDatabaseImportExecuted: false,
};

export const mockEmptyEventAttendeeEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeEvent,
  importStatus: "empty",
};

export const mockPendingEventAttendeeEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeEvent,
  importStatus: "pending",
};

export const mockEventAttendeeEvidence: readonly EventAttendeeEvidence[] = [
  {
    evidenceId: "evidence:event-import-roster",
    source: mockEventAttendeeSource,
    sourceLabel: "Organizer roster fixture",
    excerpt:
      "Local fixture lists Aiko Mori, Luis Ortega, and Priya Shah as demo attendees.",
    capturedFields: ["displayName", "role", "organization", "eventRole"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
  {
    evidenceId: "evidence:event-import-conversation-thread",
    source: mockEventAttendeeSource,
    sourceLabel: "Event conversation context",
    excerpt:
      "The dinner context is climate BD, distribution partnerships, and storage pilot introductions.",
    capturedFields: ["relationshipContext", "suggestedNextAction"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
  {
    evidenceId: "evidence:event-import-goal-fit",
    source: mockEventAttendeeSource,
    sourceLabel: "Event goal fit",
    excerpt:
      "Mock rules label attendee relationship status from local goals and existing-contact hints.",
    capturedFields: ["relationshipStatus", "existingContactId"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
];

export const mockEventAttendees: readonly EventAttendeeRecord[] = [
  {
    attendeeId: "attendee:demo-1",
    displayName: "Aiko Mori",
    role: "VP Partnerships",
    organization: "Blue Harbor Climate",
    email: "aiko.mori@blueharbor.example",
    eventRole: "attendee",
    checkInStatus: "checked_in",
    relationshipStatus: eventAttendeeRelationshipStatuses.newPotentialContact,
    relationshipContext:
      "Aiko joined the climate founders dinner to discuss channel partnerships for grid resilience pilots.",
    suggestedNextAction:
      "Review Aiko as a new potential contact and ask about pilot partner coverage.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-1",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-goal-fit",
    ],
    existingContactId: null,
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
  {
    attendeeId: "attendee:demo-2",
    displayName: "Luis Ortega",
    role: "Partner",
    organization: "Catalyst Ventures",
    email: "luis.ortega@catalyst.example",
    eventRole: "attendee",
    checkInStatus: "registered",
    relationshipStatus: eventAttendeeRelationshipStatuses.knownContact,
    relationshipContext:
      "Luis is already known from a prior climate investor salon and appears in this roster for context refresh.",
    suggestedNextAction:
      "Refresh Luis with the dinner context before deciding whether to add a follow-up task.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-2",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-conversation-thread",
    ],
    existingContactId: "contact:luis-ortega",
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
  {
    attendeeId: "attendee:demo-3",
    displayName: "Priya Shah",
    role: "CEO",
    organization: "Solace Battery",
    email: "priya.shah@solace.example",
    eventRole: "speaker",
    checkInStatus: "checked_in",
    relationshipStatus: eventAttendeeRelationshipStatuses.priorityFollowUp,
    relationshipContext:
      "Priya spoke about storage reliability and maps to the current storage pilot follow-up goal.",
    suggestedNextAction:
      "Draft a post-event follow-up asking Priya about storage pilot operator introductions.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-3",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-goal-fit",
    ],
    existingContactId: null,
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
];

export const mockEventAttendeeContactDrafts: readonly EventAttendeeContactDraft[] =
  mockEventAttendees.map((attendee, index) => ({
    id: `event-draft:demo-${index + 1}`,
    attendeeId: attendee.attendeeId,
    displayName: attendee.displayName,
    role: attendee.role,
    organization: attendee.organization,
    email: attendee.email,
    relationshipStatus: attendee.relationshipStatus,
    relationshipContext: attendee.relationshipContext,
    suggestedNextAction: attendee.suggestedNextAction,
    source: attendee.source,
    evidence: mockEventAttendeeEvidence.filter((evidence) =>
      attendee.evidenceIds.includes(evidence.evidenceId),
    ),
    provenance: mockEventAttendeeImportProvenance,
    readyForReview: true,
    contactWriteExecuted: false,
    bulkDatabaseImportExecuted: false,
    notificationDelivered: false,
  }));

export const mockEventAttendeeRosterFixture: EventAttendeeRosterPayload = {
  state: "success",
  event: mockEventAttendeeEvent,
  attendees: mockEventAttendees,
  summary:
    "Three event attendees are available from deterministic local roster fixtures with relationship status labels.",
  provenance: mockEventAttendeeImportProvenance,
  nextAction:
    "Review status labels before staging attendee-sourced contact drafts.",
};

export const mockEventAttendeeImportFixture: EventAttendeeImportPayload = {
  ...mockEventAttendeeRosterFixture,
  contactDrafts: mockEventAttendeeContactDrafts,
  summary:
    "Three attendee-sourced potential contact drafts are staged from deterministic fixtures with provenance attached.",
  nextAction:
    "Review each relationship status label before confirming any contact write.",
};

export const mockEmptyEventAttendeeRosterFixture: EventAttendeeRosterPayload = {
  state: "empty",
  event: mockEmptyEventAttendeeEvent,
  attendees: [],
  summary: "No attendees are available in the local roster fixture.",
  provenance: mockEmptyEventAttendeeImportProvenance,
  nextAction:
    "Wait for a local attendee roster fixture before staging contact drafts.",
};

export const mockEmptyEventAttendeeImportFixture: EventAttendeeImportPayload = {
  ...mockEmptyEventAttendeeRosterFixture,
  contactDrafts: [],
};

export const mockPendingEventAttendeeRosterFixture: EventAttendeeRosterPayload =
  {
    state: "pending",
    event: mockPendingEventAttendeeEvent,
    attendees: [],
    summary:
      "The mock attendee roster is pending local review before import candidates can be staged.",
    provenance: mockPendingEventAttendeeImportProvenance,
    nextAction:
      "Wait for mock roster review before importing event attendee drafts.",
  };

export const mockPendingEventAttendeeImportFixture: EventAttendeeImportPayload =
  {
    ...mockPendingEventAttendeeRosterFixture,
    contactDrafts: [],
  };
