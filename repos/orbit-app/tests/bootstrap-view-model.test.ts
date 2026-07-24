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
    profileName: "小雨",
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
    nextAction: "先看今天最值得处理的一件事。",
    pendingFollowupCount: 0,
    profileName: "小雨",
    relationshipAssetCount: 0,
    summary: "连接人脉数据后，Orbit 会在这里整理当天重点。",
    upcomingEventCount: 0,
    workspaceName: "Orbit"
  });
});

test("bootstrapToSummary hides implementation labels from startup copy", () => {
  const summary = bootstrapToSummary({
    account: {
      workspaceName: "Orbit Generated Relationship Workspace"
    },
    dashboardSummary: {
      pendingFollowups: 7,
      relationshipAssets: 42
    },
    profile: {
      displayName: "小雨",
      id: "profile_orbit_generated_operator",
      organization: "OPPO Japan Research"
    },
    summary:
      "Live app bootstrap assembled first-screen data from remote live storage.",
    nextAction:
      "Use this source-backed bootstrap payload for live relationship workflow testing.",
    topAgentActions: [{ actionId: "action-1" }],
    upcomingEvents: [{ eventId: "event-1" }, { eventId: "event-2" }]
  });

  assert.equal(
    summary.summary,
    "你有 7 个跟进事项和 2 场活动需要看。"
  );
  assert.equal(
    summary.nextAction,
    "先看今天最值得处理的一件事。"
  );
  assert.equal(summary.profileName, "小雨");
  assert.equal(summary.workspaceName, "Orbit 人脉工作台");
});

test("bootstrapToSummary normalizes the old Orbit main profile name", () => {
  const summary = bootstrapToSummary({
    account: {
      workspaceName: "Orbit"
    },
    dashboardSummary: {
      highValueRelationships: 2,
      pendingFollowups: 1,
      relationshipAssets: 12
    },
    profile: {
      displayName: "赵翔",
      organization: "Orbit"
    },
    summary: "今天有 1 个跟进事项。",
    topAgentActions: [],
    upcomingEvents: []
  });

  assert.equal(summary.profileName, "小雨");
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
    { label: "活动", value: 2 },
    { label: "跟进", value: 4 },
    { label: "人脉", value: 42 },
    { label: "待确认", value: 2 }
  ]);
});
