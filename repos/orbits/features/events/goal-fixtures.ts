import type {
  EventGoalReadinessEvent,
  EventGoalReadinessPayload,
  EventGoalReadinessProvenance,
  EventGoalReadinessSourceReference,
  EventGoalRecord,
  EventGoalSuggestion,
  EventPreparationState,
  EventReadinessChecklistItem,
} from "./goal-contract";

export const EVENT_GOAL_READINESS_FIXTURE_SOURCE =
  "fixture:features/events/goal-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T19:10:00.000Z";
const fixtureUpdatedAt = "2026-06-25T19:18:00.000Z";

export const mockEventGoalReadinessSource: EventGoalReadinessSourceReference = {
  type: "event_import",
  id: "source:event-goal-readiness:demo-event-1",
  label: "local event goal and readiness fixture",
  eventId: "demo-event-1",
  providerRecordId: "mock-event-goal-readiness:climate-founders-dinner",
  generatedBy: "mock-event-goal-readiness-service",
};

export const mockEventGoalReadinessEvent: EventGoalReadinessEvent = {
  id: "demo-event-1",
  title: "Climate founders dinner",
  venue: "Kanda Founders Table",
  startsAt: "2026-06-28T10:30:00.000Z",
  endsAt: "2026-06-28T13:00:00.000Z",
  source: mockEventGoalReadinessSource,
  calendarProviderRequested: false,
  liveCalendarRequested: false,
  liveDatabaseWriteExecuted: false,
};

export const mockEventGoalSuggestions: readonly EventGoalSuggestion[] = [
  {
    goalId: "goal-suggestion:operator-intros",
    focus: "operator_intros",
    label: "Meet two climate operators",
    intent:
      "Meet two climate operators who can validate storage-pilot partnerships.",
    rationale:
      "The event fixture overlaps with operator attendees and the active storage pilot relationship context.",
    suggestedPreparation: [
      "Review known operator relationships before arrival.",
      "Prepare a partner-path question for each new operator conversation.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: [
      "evidence:event-goal-attendee-overlap",
      "evidence:event-goal-storage-context",
    ],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
  {
    goalId: "goal-suggestion:storage-pilot",
    focus: "storage_pilot",
    label: "Storage pilot validation",
    intent:
      "Validate one storage pilot pain point with a founder or operator before the follow-up window closes.",
    rationale:
      "Local fixture rules connect the dinner to storage pilot operators and partner-path contacts.",
    suggestedPreparation: [
      "Carry the storage pilot case note into the event brief.",
      "Mark one follow-up owner before leaving the venue.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: ["evidence:event-goal-storage-context"],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
  {
    goalId: "goal-suggestion:investor-context",
    focus: "investor_context",
    label: "Investor context mapping",
    intent:
      "Map which investor introductions should wait until there is stronger operator evidence.",
    rationale:
      "The event fixture includes operator investors, but the recommended preparation keeps evidence before outreach.",
    suggestedPreparation: [
      "Review current investor relationship context.",
      "Capture source notes before recommending introductions.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: ["evidence:event-goal-investor-context"],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
];

export const mockEventGoalRecord: EventGoalRecord = {
  goalId: "goal:demo-event-1:operator-intros",
  eventId: "demo-event-1",
  intent:
    "Meet two climate operators who can validate storage-pilot partnerships.",
  selectedSuggestionId: "goal-suggestion:operator-intros",
  priority: "primary",
  source: mockEventGoalReadinessSource,
  evidenceIds: [
    "evidence:event-goal-attendee-overlap",
    "evidence:event-goal-storage-context",
  ],
  createdAt: fixtureUpdatedAt,
  updatedAt: fixtureUpdatedAt,
  generatedBy: "mock-goal-rule",
  aiProviderRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
};

export const mockEventReadinessChecklist: readonly EventReadinessChecklistItem[] =
  [
    {
      itemId: "readiness:relationship-brief",
      label: "Relationship brief reviewed",
      status: "ready",
      owner: "operator",
      rationale:
        "Local evidence includes the operator context needed before new introductions.",
      evidenceIds: ["evidence:event-goal-attendee-overlap"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:event-goal",
      label: "Event goal selected",
      status: "ready",
      owner: "operator",
      rationale:
        "A primary event goal is set from deterministic local suggestions.",
      evidenceIds: mockEventGoalRecord.evidenceIds,
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:follow-up-owner",
      label: "Follow-up owner confirmed",
      status: "pending",
      owner: "operator",
      rationale:
        "The mock keeps follow-up ownership pending so the operator can confirm it before the event.",
      evidenceIds: ["evidence:event-goal-follow-up-owner"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:calendar-conflict",
      label: "Calendar conflict checked locally",
      status: "ready",
      owner: "orbit",
      rationale:
        "A deterministic local rule says the fixture has no time conflict.",
      evidenceIds: ["evidence:event-goal-calendar-rule"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockEventPreparationState: EventPreparationState = {
  readinessScore: 75,
  relationshipBriefStatus: "ready",
  calendarConflictCheck: {
    hasConflict: false,
    checkedWindow: "2026-06-28T10:30:00.000Z/2026-06-28T13:00:00.000Z",
    checkedBy: "mock-calendar-rule",
    rationale:
      "The mock calendar rule checks only the local fixture window and finds no conflict.",
    liveCalendarRequested: false,
    calendarProviderRequested: false,
    externalNetworkRequested: false,
  },
  preEventBriefReady: true,
  nextPreparationStep:
    "Confirm the follow-up owner before using this goal in product event prep.",
  source: mockEventGoalReadinessSource,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEventGoalReadinessProvenance: EventGoalReadinessProvenance = {
  source: EVENT_GOAL_READINESS_FIXTURE_SOURCE,
  sourceLabel: "Mock event goal and readiness fixture",
  evidenceIds: [
    "evidence:event-goal-attendee-overlap",
    "evidence:event-goal-storage-context",
    "evidence:event-goal-calendar-rule",
    "evidence:event-goal-follow-up-owner",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-event-goal-readiness-only",
  generationMethod: "fixture",
  aiProviderRequested: false,
  calendarProviderRequested: false,
  liveCalendarRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyEventGoalReadinessProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock empty event goal and readiness rule",
    evidenceIds: ["evidence:event-goal-empty"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockPendingEventGoalReadinessProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock pending event goal and readiness rule",
    evidenceIds: ["evidence:event-goal-pending"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockEventGoalReadinessFailureProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock event goal and readiness controlled failure rule",
    evidenceIds: ["evidence:event-goal-controlled-failure"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "success",
  event: mockEventGoalReadinessEvent,
  goal: mockEventGoalRecord,
  suggestedGoals: mockEventGoalSuggestions,
  readinessChecklist: mockEventReadinessChecklist,
  preparationState: mockEventPreparationState,
  summary:
    "Local rules produce event goals, readiness items, and preparation state for the climate dinner without live provider calls.",
  provenance: mockEventGoalReadinessProvenance,
  nextAction:
    "Confirm the pending follow-up owner before using this goal in product event prep.",
};

export const mockEmptyEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "empty",
  event: mockEventGoalReadinessEvent,
  goal: null,
  suggestedGoals: [],
  readinessChecklist: [],
  preparationState: {
    ...mockEventPreparationState,
    readinessScore: 0,
    relationshipBriefStatus: "pending",
    preEventBriefReady: false,
    nextPreparationStep:
      "Set a local mock goal before composing pre-event preparation.",
  },
  summary:
    "No event goal has been selected in the local mock readiness scenario.",
  provenance: mockEmptyEventGoalReadinessProvenance,
  nextAction:
    "Set a local mock goal before composing pre-event preparation.",
};

export const mockPendingEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "pending",
  event: mockEventGoalReadinessEvent,
  goal: mockEventGoalRecord,
  suggestedGoals: mockEventGoalSuggestions,
  readinessChecklist: mockEventReadinessChecklist.map((item) =>
    item.itemId === "readiness:follow-up-owner"
      ? item
      : {
          ...item,
          status: "pending",
        },
  ),
  preparationState: {
    ...mockEventPreparationState,
    readinessScore: 40,
    relationshipBriefStatus: "pending",
    preEventBriefReady: false,
    nextPreparationStep:
      "Review the local event brief before confirming readiness.",
  },
  summary:
    "The local readiness fixture is waiting for operator review before event preparation is ready.",
  provenance: mockPendingEventGoalReadinessProvenance,
  nextAction:
    "Review the local event brief before confirming readiness.",
};
