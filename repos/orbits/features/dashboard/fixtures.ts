import type {
  DashboardAggregatePayload,
  DashboardAggregateProvenance,
  DashboardAggregateSourceReference,
  DashboardAggregateSummaryPayload,
  DashboardDormantContact,
  DashboardFollowupTask,
  DashboardHighValueRelationship,
  DashboardNewContact,
  DashboardRecentActivity,
} from "./contract";

export const DASHBOARD_AGGREGATE_FIXTURE_SOURCE =
  "fixture:features/dashboard/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-25T23:46:00.000+09:00";

function source(input: {
  type: DashboardAggregateSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): DashboardAggregateSourceReference {
  return {
    ...input,
    generatedBy: "mock-dashboard-aggregate-rules",
  };
}

export const mockDashboardAggregateProvenance: DashboardAggregateProvenance = {
  source: DASHBOARD_AGGREGATE_FIXTURE_SOURCE,
  sourceLabel: "Mock dashboard aggregate fixture",
  evidenceIds: [
    "evidence:dashboard:new-contact:maya",
    "evidence:dashboard:new-contact:diego",
    "evidence:dashboard:high-value:climate-dinner",
    "evidence:dashboard:followup:maya",
    "evidence:dashboard:dormant:amina",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-dashboard-aggregate-only",
  generationMethod: "fixture",
  liveAnalyticsQueryExecuted: false,
  productionAggregateReadExecuted: false,
  externalNetworkRequested: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationProviderRequested: false,
  deviceRequested: false,
};

export const mockDashboardAggregateFailureProvenance: DashboardAggregateProvenance =
  {
    ...mockDashboardAggregateProvenance,
    sourceLabel: "Mock dashboard aggregate controlled failure",
    evidenceIds: ["evidence:dashboard:controlled-failure"],
    generationMethod: "rule-based-state",
  };

const emptyStateProvenance: DashboardAggregateProvenance = {
  ...mockDashboardAggregateProvenance,
  sourceLabel: "Mock empty dashboard aggregate state",
  evidenceIds: ["evidence:dashboard:empty-state"],
  generationMethod: "rule-based-state",
};

const pendingStateProvenance: DashboardAggregateProvenance = {
  ...mockDashboardAggregateProvenance,
  sourceLabel: "Mock pending dashboard aggregate state",
  evidenceIds: ["evidence:dashboard:pending-state"],
  generationMethod: "rule-based-state",
};

const mockNewContacts: readonly DashboardNewContact[] = [
  {
    contactId: "contact:maya-chen",
    name: "Maya Chen",
    organization: "Kumo Grid",
    sourceLabel: "Climate dinner badge scan",
    source: source({
      type: "event_import",
      id: "source:dashboard:new-contact:maya",
      label: "Climate dinner badge scan",
      providerRecordId: "event:climate-dinner:attendee:maya",
    }),
    evidenceIds: ["evidence:dashboard:new-contact:maya"],
  },
  {
    contactId: "contact:diego-rivera",
    name: "Diego Rivera",
    organization: "Northstar Fleet",
    sourceLabel: "Follow-up email thread",
    source: source({
      type: "email_signal",
      id: "source:dashboard:new-contact:diego",
      label: "Follow-up email thread",
      providerRecordId: "email-thread:diego:case-study",
    }),
    evidenceIds: ["evidence:dashboard:new-contact:diego"],
  },
  {
    contactId: "contact:mina-park",
    name: "Mina Park",
    organization: "Harbor Labs",
    sourceLabel: "Manual intro note",
    source: source({
      type: "manual",
      id: "source:dashboard:new-contact:mina",
      label: "Manual intro note",
      providerRecordId: "manual-note:mina-intro",
    }),
    evidenceIds: ["evidence:dashboard:new-contact:mina"],
  },
];

const mockHighValueRelationships: readonly DashboardHighValueRelationship[] = [
  {
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    valueType: "commercial_opportunity",
    priorityScore: 94,
    reason: "Storage pilot intro and buyer urgency are both evidence-backed.",
    evidenceIds: [
      "evidence:dashboard:high-value:climate-dinner",
      "evidence:dashboard:followup:maya",
    ],
  },
  {
    connectionId: "connection:kenji-sato",
    contactName: "Kenji Sato",
    organization: "Mori Ventures",
    valueType: "referral_path",
    priorityScore: 88,
    reason: "Investor intro path is open and tied to a recent event note.",
    evidenceIds: ["evidence:dashboard:high-value:kenji"],
  },
];

const mockPendingFollowupTasks: readonly DashboardFollowupTask[] = [
  {
    taskId: "task:followup:maya-deck",
    contactName: "Maya Chen",
    dueLabel: "Due today",
    recommendedAction: "Send the grid storage intro deck.",
    evidenceIds: ["evidence:dashboard:followup:maya"],
  },
  {
    taskId: "task:followup:diego-case-study",
    contactName: "Diego Rivera",
    dueLabel: "Due tomorrow",
    recommendedAction: "Send the procurement case study.",
    evidenceIds: ["evidence:dashboard:followup:diego"],
  },
  {
    taskId: "task:followup:mina-context",
    contactName: "Mina Park",
    dueLabel: "Due this week",
    recommendedAction: "Confirm the partner-program context.",
    evidenceIds: ["evidence:dashboard:followup:mina"],
  },
];

const mockDormantContacts: readonly DashboardDormantContact[] = [
  {
    contactId: "contact:amina-okafor",
    contactName: "Amina Okafor",
    organization: "Helio Works",
    lastTouchpointDays: 74,
    suggestedAction: "Restart the partner conversation with a concrete ask.",
    evidenceIds: ["evidence:dashboard:dormant:amina"],
  },
  {
    contactId: "contact:sara-ito",
    contactName: "Sara Ito",
    organization: "Cedar Robotics",
    lastTouchpointDays: 61,
    suggestedAction: "Send a short note about the Tokyo robotics salon.",
    evidenceIds: ["evidence:dashboard:dormant:sara"],
  },
];

export const mockDashboardRecentActivity: readonly DashboardRecentActivity[] = [
  {
    activityId: "activity:dashboard:new-contact:maya",
    type: "new_contact",
    label: "Maya Chen added from the climate dinner roster",
    occurredAt: "2026-06-25T18:20:00.000+09:00",
    sourceLabel: "Climate dinner badge scan",
    evidenceIds: ["evidence:dashboard:new-contact:maya"],
  },
  {
    activityId: "activity:dashboard:high-value:kenji",
    type: "high_value",
    label: "Kenji Sato moved into the high-value referral set",
    occurredAt: "2026-06-25T15:15:00.000+09:00",
    sourceLabel: "Event recommendation note",
    evidenceIds: ["evidence:dashboard:high-value:kenji"],
  },
  {
    activityId: "activity:dashboard:followup:maya",
    type: "followup_due",
    label: "Maya deck follow-up is due today",
    occurredAt: "2026-06-25T09:00:00.000+09:00",
    sourceLabel: "Follow-up task due date",
    evidenceIds: ["evidence:dashboard:followup:maya"],
  },
  {
    activityId: "activity:dashboard:dormant:amina",
    type: "dormant",
    label: "Amina Okafor crossed the dormant-contact threshold",
    occurredAt: "2026-06-24T16:00:00.000+09:00",
    sourceLabel: "Relationship recency rule",
    evidenceIds: ["evidence:dashboard:dormant:amina"],
  },
];

export const mockDashboardAggregateFixture: DashboardAggregatePayload = {
  state: "success",
  relationshipAssetTotals: {
    contacts: 42,
    connections: 34,
    evidenceBackedRelationships: 31,
    eventsRepresented: 5,
  },
  newContacts: {
    count: 6,
    windowLabel: "Last 7 days",
    contacts: mockNewContacts,
  },
  highValueCount: 5,
  highValueRelationships: mockHighValueRelationships,
  pendingFollowups: {
    count: 7,
    tasks: mockPendingFollowupTasks,
  },
  dormantContacts: {
    count: 4,
    contacts: mockDormantContacts,
  },
  recentActivity: mockDashboardRecentActivity,
  summary:
    "Mock dashboard aggregate shows relationship assets, new contacts, high-value relationships, pending followups, dormant contacts, and recent activity from local fixtures.",
  provenance: mockDashboardAggregateProvenance,
  nextAction:
    "Review high-value relationships and pending followups before taking live action.",
};

export const mockEmptyDashboardAggregateFixture: DashboardAggregatePayload = {
  state: "empty",
  relationshipAssetTotals: {
    contacts: 0,
    connections: 0,
    evidenceBackedRelationships: 0,
    eventsRepresented: 0,
  },
  newContacts: {
    count: 0,
    windowLabel: "Last 7 days",
    contacts: [],
  },
  highValueCount: 0,
  highValueRelationships: [],
  pendingFollowups: {
    count: 0,
    tasks: [],
  },
  dormantContacts: {
    count: 0,
    contacts: [],
  },
  recentActivity: [],
  summary:
    "The local dashboard aggregate has no sourced contacts, relationships, followups, or recent activity.",
  provenance: emptyStateProvenance,
  nextAction:
    "Add a sourced contact or import event context before showing dashboard aggregates.",
};

export const mockPendingDashboardAggregateFixture: DashboardAggregatePayload = {
  state: "pending",
  relationshipAssetTotals: {
    contacts: 0,
    connections: 0,
    evidenceBackedRelationships: 0,
    eventsRepresented: 0,
  },
  newContacts: {
    count: 0,
    windowLabel: "Last 7 days",
    contacts: [],
  },
  highValueCount: 0,
  highValueRelationships: [],
  pendingFollowups: {
    count: 0,
    tasks: [],
  },
  dormantContacts: {
    count: 0,
    contacts: [],
  },
  recentActivity: [],
  summary:
    "The dashboard aggregate mock is waiting for local fixture refresh review.",
  provenance: pendingStateProvenance,
  nextAction:
    "Keep the dashboard in a pending state until the mock aggregate fixture is available.",
};

export function buildDashboardAggregateSummary(
  payload: DashboardAggregatePayload,
): DashboardAggregateSummaryPayload {
  return {
    state: payload.state,
    metrics: [
      {
        id: "relationship-assets",
        label: "Relationship assets",
        value: payload.relationshipAssetTotals.contacts,
        evidenceIds: payload.provenance.evidenceIds,
      },
      {
        id: "new-contacts",
        label: "New contacts",
        value: payload.newContacts.count,
        evidenceIds: payload.newContacts.contacts.flatMap(
          (contact) => contact.evidenceIds,
        ),
      },
      {
        id: "high-value",
        label: "High-value relationships",
        value: payload.highValueCount,
        evidenceIds: payload.highValueRelationships.flatMap(
          (relationship) => relationship.evidenceIds,
        ),
      },
      {
        id: "pending-followups",
        label: "Pending followups",
        value: payload.pendingFollowups.count,
        evidenceIds: payload.pendingFollowups.tasks.flatMap(
          (task) => task.evidenceIds,
        ),
      },
      {
        id: "dormant-contacts",
        label: "Dormant contacts",
        value: payload.dormantContacts.count,
        evidenceIds: payload.dormantContacts.contacts.flatMap(
          (contact) => contact.evidenceIds,
        ),
      },
    ],
    recentActivity: payload.recentActivity.slice(0, 3),
    summary:
      payload.state === "success"
        ? "Rule-based summary of the local dashboard aggregate fixture."
        : payload.summary,
    provenance: {
      ...payload.provenance,
      sourceLabel: "Mock dashboard aggregate summary rule",
      generationMethod: "rule-based-summary",
    },
    nextAction: payload.nextAction,
  };
}

export const mockDashboardAggregateSummaryFixture =
  buildDashboardAggregateSummary(mockDashboardAggregateFixture);
