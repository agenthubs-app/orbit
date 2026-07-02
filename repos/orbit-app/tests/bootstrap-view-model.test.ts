import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapMetrics,
  bootstrapToSummary
} from "../src/view-models/bootstrap";

test("bootstrapToSummary maps first-screen aggregate counts", () => {
  const summary = bootstrapToSummary({
    account: {
      workspaceName: "Orbit Dev"
    },
    dashboardSummary: {
      dormantContacts: 3,
      highValueRelationships: 5,
      pendingFollowups: 4,
      relationshipAssets: 42
    },
    nextAction: "Review today's follow-ups.",
    pendingTasks: [{ taskId: "task-1" }, { taskId: "task-2" }],
    profile: {
      displayName: "Xinyi Zhao"
    },
    summary: "You have 4 follow-ups and 2 upcoming events.",
    topAgentActions: [{ actionId: "action-1" }],
    upcomingEvents: [{ eventId: "event-1" }, { eventId: "event-2" }]
  });

  assert.deepEqual(summary, {
    assistantActionCount: 1,
    highValueRelationships: 5,
    nextAction: "Review today's follow-ups.",
    pendingFollowupCount: 4,
    profileName: "Xinyi Zhao",
    relationshipAssetCount: 42,
    summary: "You have 4 follow-ups and 2 upcoming events.",
    upcomingEventCount: 2,
    workspaceName: "Orbit Dev"
  });
});

test("bootstrapToSummary falls back for empty aggregate payloads", () => {
  const summary = bootstrapToSummary({
    account: null,
    dashboardSummary: null,
    nextAction: "",
    pendingTasks: [],
    profile: null,
    summary: "",
    topAgentActions: [],
    upcomingEvents: []
  });

  assert.deepEqual(summary, {
    assistantActionCount: 0,
    highValueRelationships: 0,
    nextAction: "Open Orbit AI to decide the next relationship move.",
    pendingFollowupCount: 0,
    profileName: "Orbit user",
    relationshipAssetCount: 0,
    summary: "Orbit is ready when your relationship data is connected.",
    upcomingEventCount: 0,
    workspaceName: "Orbit"
  });
});

test("bootstrapToSummary hides implementation labels from startup copy", () => {
  const summary = bootstrapToSummary({
    dashboardSummary: {
      pendingFollowups: 7,
      relationshipAssets: 42
    },
    summary:
      "Mock app bootstrap assembled account, profile, events, providers, and fixture records.",
    topAgentActions: [{ actionId: "action-1" }],
    upcomingEvents: [{ eventId: "event-1" }, { eventId: "event-2" }]
  });

  assert.equal(
    summary.summary,
    "You have 7 follow-ups and 2 upcoming events."
  );
});

test("bootstrapMetrics creates compact home metrics", () => {
  const metrics = bootstrapMetrics({
    assistantActionCount: 2,
    highValueRelationships: 5,
    nextAction: "Review today's follow-ups.",
    pendingFollowupCount: 4,
    profileName: "Xinyi Zhao",
    relationshipAssetCount: 42,
    summary: "You have 4 follow-ups and 2 upcoming events.",
    upcomingEventCount: 2,
    workspaceName: "Orbit Dev"
  });

  assert.deepEqual(metrics, [
    { label: "Events", value: 2 },
    { label: "Follow-ups", value: 4 },
    { label: "Relationships", value: 42 },
    { label: "Assistant actions", value: 2 }
  ]);
});
