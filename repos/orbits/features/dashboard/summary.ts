import type {
  DashboardAggregatePayload,
  DashboardAggregateSummaryPayload,
} from "./contract";

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
