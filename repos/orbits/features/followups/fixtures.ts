import {
  FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE,
  type FollowupTask,
  type FollowupTaskGenerationPayload,
  type FollowupTaskGenerationProvenance,
  type FollowupTaskGenerationSourceReference,
  type FollowupTaskTrigger,
  type FollowupTaskTriggerKind,
} from "./contract";

export {
  FOLLOWUP_TASK_GENERATION_ERROR_CODES,
  FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS,
  FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE,
  type FollowupTask,
  type FollowupTaskGenerationPayload,
  type FollowupTaskGenerationProvenance,
  type FollowupTaskTrigger,
  type FollowupTaskTriggerKind,
} from "./contract";

const fixtureCollectedAt = "2026-06-25T22:10:00.000Z";

export const mockFollowupTaskGenerationCategories = [
  "new_connection",
  "event_encounter",
  "promised_action",
  "dormant_relationship",
] as const satisfies readonly FollowupTaskTriggerKind[];

export const mockFollowupTaskGenerationSource: FollowupTaskGenerationSourceReference =
  {
    type: "system",
    id: "source:followup-task-generation:local-rules",
    label: "local followup task generation fixture",
    providerRecordId: "mock-followups:tokyo-relationship-operating-loop",
    generatedBy: "mock-followup-rules",
  };

function source(input: {
  type: FollowupTaskGenerationSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): FollowupTaskGenerationSourceReference {
  return {
    ...input,
    generatedBy: "mock-followup-rules",
  };
}

function trigger(input: {
  triggerId: string;
  kind: FollowupTaskTriggerKind;
  label: string;
  detail: string;
  occurredAt: string;
  connectionId: string;
  contactName: string;
  organization: string;
  source: FollowupTaskGenerationSourceReference;
  evidenceIds: readonly string[];
}): FollowupTaskTrigger {
  return {
    ...input,
    backgroundSchedulerRequested: false,
    liveDatabaseReadExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
  };
}

function task(input: {
  taskId: string;
  title: string;
  triggerKind: FollowupTaskTriggerKind;
  priority: FollowupTask["priority"];
  dueInDays: number;
  connectionId: string;
  contactName: string;
  organization: string;
  recommendedAction: string;
  rationale: string;
  source: FollowupTaskGenerationSourceReference;
  evidenceIds: readonly string[];
}): FollowupTask {
  return {
    ...input,
    generatedBy: "mock-followup-rules",
    audit: {
      sourceLabel: input.source.label,
      providerBoundary: "scheduler false, AI false, persistence false",
      verificationAction: "Verify evidence",
    },
    backgroundSchedulerRequested: false,
    liveTaskPersistenceRequested: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    externalNetworkRequested: false,
  };
}

export const mockFollowupTaskTriggers: readonly FollowupTaskTrigger[] = [
  trigger({
    triggerId: "trigger:followup:new-connection:maya",
    kind: "new_connection",
    label: "New connection",
    detail:
      "Maya Chen accepted the connection after the Tokyo climate operator breakfast.",
    occurredAt: "2026-06-25T01:30:00.000Z",
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    source: source({
      type: "event_import",
      id: "source:followup:event-climate-breakfast",
      label: "Climate operators breakfast roster",
      providerRecordId: "event:climate-breakfast:attendee:maya",
    }),
    evidenceIds: [
      "evidence:followup:new-connection",
      "evidence:followup:event-roster",
    ],
  }),
  trigger({
    triggerId: "trigger:followup:event-encounter:diego",
    kind: "event_encounter",
    label: "Event encounter",
    detail:
      "Diego Rivera asked for the procurement case study during the venue hallway conversation.",
    occurredAt: "2026-06-25T02:10:00.000Z",
    connectionId: "connection:diego-rivera",
    contactName: "Diego Rivera",
    organization: "Northstar Fleet",
    source: source({
      type: "manual",
      id: "source:followup:encounter-note:diego",
      label: "Encounter note",
      providerRecordId: "encounter:diego:hallway-case-study",
    }),
    evidenceIds: [
      "evidence:followup:event-encounter",
      "evidence:followup:case-study-request",
    ],
  }),
  trigger({
    triggerId: "trigger:followup:promised-action:maya",
    kind: "promised_action",
    label: "Promised action",
    detail:
      "The local note says to send Maya the grid storage intro deck by Friday.",
    occurredAt: "2026-06-25T02:30:00.000Z",
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    source: source({
      type: "manual",
      id: "source:followup:promise:maya-deck",
      label: "Promised action note",
      providerRecordId: "promise:maya:grid-storage-deck",
    }),
    evidenceIds: [
      "evidence:followup:promised-action",
      "evidence:followup:grid-storage-deck",
    ],
  }),
  trigger({
    triggerId: "trigger:followup:dormant-relationship:amina",
    kind: "dormant_relationship",
    label: "Dormant relationship",
    detail:
      "Amina Okafor has strong partner fit but no recorded touchpoint in 46 days.",
    occurredAt: "2026-05-10T09:00:00.000Z",
    connectionId: "connection:amina-okafor",
    contactName: "Amina Okafor",
    organization: "Helio Works",
    source: source({
      type: "calendar_signal",
      id: "source:followup:dormant:amina",
      label: "Local relationship recency signal",
      providerRecordId: "relationship:amina:last-touchpoint",
    }),
    evidenceIds: [
      "evidence:followup:dormant-relationship",
      "evidence:followup:last-touchpoint",
    ],
  }),
];

export const mockFollowupTasks: readonly FollowupTask[] = [
  task({
    taskId: "task:followup:new-connection:maya",
    title: "Send Maya the event recap and ask about pilot timing",
    triggerKind: "new_connection",
    priority: "today",
    dueInDays: 1,
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    recommendedAction:
      "Send a concise recap anchored in the climate breakfast context before suggesting a pilot discovery call.",
    rationale:
      "The new connection has fresh event context and source-backed buyer urgency.",
    source: mockFollowupTaskTriggers[0].source,
    evidenceIds: mockFollowupTaskTriggers[0].evidenceIds,
  }),
  task({
    taskId: "task:followup:event-encounter:diego",
    title: "Share the procurement case study Diego requested",
    triggerKind: "event_encounter",
    priority: "today",
    dueInDays: 1,
    connectionId: "connection:diego-rivera",
    contactName: "Diego Rivera",
    organization: "Northstar Fleet",
    recommendedAction:
      "Send the case study and reference the hallway conversation so the relationship context stays visible.",
    rationale:
      "The encounter note contains a specific requested asset and a clear next step.",
    source: mockFollowupTaskTriggers[1].source,
    evidenceIds: mockFollowupTaskTriggers[1].evidenceIds,
  }),
  task({
    taskId: "task:followup:promised-action:maya",
    title: "Deliver the grid storage intro deck promised to Maya",
    triggerKind: "promised_action",
    priority: "this_week",
    dueInDays: 2,
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    recommendedAction:
      "Prepare a short deck handoff note and keep the promised action separate from generic nurture.",
    rationale:
      "The local promise note names the asset, recipient, and timing commitment.",
    source: mockFollowupTaskTriggers[2].source,
    evidenceIds: mockFollowupTaskTriggers[2].evidenceIds,
  }),
  task({
    taskId: "task:followup:dormant-relationship:amina",
    title: "Restart the Helio Works partner conversation",
    triggerKind: "dormant_relationship",
    priority: "nurture",
    dueInDays: 5,
    connectionId: "connection:amina-okafor",
    contactName: "Amina Okafor",
    organization: "Helio Works",
    recommendedAction:
      "Send a relationship-specific check-in that references the last partner-fit discussion.",
    rationale:
      "The dormant relationship signal shows a strong fit with no recent touchpoint.",
    source: mockFollowupTaskTriggers[3].source,
    evidenceIds: mockFollowupTaskTriggers[3].evidenceIds,
  }),
];

export const mockFollowupTaskGenerationProvenance: FollowupTaskGenerationProvenance =
  {
    source: FOLLOWUP_TASK_GENERATION_FIXTURE_SOURCE,
    sourceLabel: "Mock followup task generation fixture",
    evidenceIds: [
      "evidence:followup:new-connection",
      "evidence:followup:event-encounter",
      "evidence:followup:promised-action",
      "evidence:followup:dormant-relationship",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-followup-task-generation-only",
    generationMethod: "fixture",
    backgroundSchedulerRequested: false,
    liveTaskPersistenceRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };

export const mockEmptyFollowupTaskGenerationProvenance: FollowupTaskGenerationProvenance =
  {
    ...mockFollowupTaskGenerationProvenance,
    sourceLabel: "Mock empty followup task generation rule",
    evidenceIds: ["evidence:followup-empty"],
    generationMethod: "rule-based-state",
  };

export const mockPendingFollowupTaskGenerationProvenance: FollowupTaskGenerationProvenance =
  {
    ...mockFollowupTaskGenerationProvenance,
    sourceLabel: "Mock pending followup task generation guard",
    evidenceIds: ["evidence:followup-pending"],
    generationMethod: "rule-based-state",
  };

export const mockFollowupTaskGenerationFailureProvenance: FollowupTaskGenerationProvenance =
  {
    ...mockFollowupTaskGenerationProvenance,
    sourceLabel: "Mock followup task generation controlled failure",
    evidenceIds: ["evidence:followup-controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockFollowupTaskGenerationFixture: FollowupTaskGenerationPayload = {
  state: "success",
  triggers: mockFollowupTaskTriggers,
  tasks: mockFollowupTasks,
  summary:
    "Local rules generated followup tasks from a new connection, event encounter, promised action, and dormant relationship.",
  provenance: mockFollowupTaskGenerationProvenance,
  nextAction:
    "Review each task's source evidence before drafting or scheduling any external followup.",
};

export const mockEmptyFollowupTaskGenerationFixture: FollowupTaskGenerationPayload =
  {
    state: "empty",
    triggers: [],
    tasks: [],
    summary:
      "No eligible local relationship triggers are ready for followup task generation.",
    provenance: mockEmptyFollowupTaskGenerationProvenance,
    nextAction:
      "Add a new connection, record an encounter, capture a promised action, or review dormant relationship evidence before generating tasks.",
  };

export const mockPendingFollowupTaskGenerationFixture: FollowupTaskGenerationPayload =
  {
    state: "pending",
    triggers: [],
    tasks: [],
    summary:
      "Followup task generation is waiting for a local confirmation guard before exposing suggested work.",
    provenance: mockPendingFollowupTaskGenerationProvenance,
    nextAction:
      "Resolve the local generation guard before showing relationship followup tasks.",
  };
