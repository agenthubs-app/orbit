import assert from "node:assert/strict";
import test from "node:test";
import type { ApiResult } from "../src/api/types";
import { contactsToSummaries } from "../src/view-models/contacts";
import { conversationsToSummaries } from "../src/view-models/conversations";
import { eventsToSummaries } from "../src/view-models/events";
import { profileToSummary } from "../src/view-models/profile";
import { resultToRouteState } from "../src/view-models/route-state";
import { tasksToScheduleItems } from "../src/view-models/schedule";

const meta = {
  featureMode: "live",
  privacy: "no-relationship-data",
  runtimeBoundary: "developer-admin"
};

test("resultToRouteState maps successful non-empty data", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: ["a"] },
    meta,
    status: 200
  };

  assert.deepEqual(
    resultToRouteState(result, (data) => data.items.length === 0),
    {
      kind: "success",
      data: { items: ["a"] },
      meta,
      status: 200
    }
  );
});

test("resultToRouteState maps successful empty data", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: [] },
    meta,
    status: 200
  };

  assert.deepEqual(
    resultToRouteState(result, (data) => data.items.length === 0),
    {
      kind: "empty",
      data: { items: [] },
      meta,
      status: 200
    }
  );
});

test("resultToRouteState maps API failures and offline failures", () => {
  const failed: ApiResult<never> = {
    success: false,
    error: { code: "SERVICE_UNAVAILABLE", message: "database unavailable" },
    meta,
    status: 503
  };
  const offline: ApiResult<never> = {
    success: false,
    error: { code: "ORBIT_APP_NETWORK_ERROR", message: "connection refused" },
    meta: {
      featureMode: null,
      privacy: null,
      runtimeBoundary: null
    },
    status: 0
  };

  assert.equal(resultToRouteState(failed, () => false).kind, "failure");
  assert.equal(resultToRouteState(offline, () => false).kind, "offline");
});

test("eventsToSummaries maps Orbit event list payloads", () => {
  const summaries = eventsToSummaries({
    events: [
      {
        id: "event-1",
        title: "Tokyo founder salon",
        venue: "Shibuya",
        startsAt: "2026-07-04T10:00:00.000Z",
        status: "confirmed"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "event-1",
      location: "Shibuya",
      startsAt: "2026-07-04T10:00:00.000Z",
      status: "confirmed",
      title: "Tokyo founder salon"
    }
  ]);
});

test("contactsToSummaries maps contact list payloads", () => {
  const summaries = contactsToSummaries({
    contacts: [
      {
        displayName: "Maya Chen",
        id: "contact-1",
        organization: "Northstar",
        relationshipContext: "Warm investor relationship"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "contact-1",
      name: "Maya Chen",
      organization: "Northstar",
      relationship: "Warm investor relationship"
    }
  ]);
});

test("tasksToScheduleItems maps follow-up task payloads", () => {
  const items = tasksToScheduleItems({
    tasks: [
      {
        taskId: "task-1",
        title: "Send post-event follow-up",
        dueInDays: 2
      }
    ]
  });

  assert.deepEqual(items, [
    {
      dueAt: "in 2 days",
      id: "task-1",
      title: "Send post-event follow-up"
    }
  ]);
});

test("conversationsToSummaries maps Orbit AI payloads", () => {
  const summaries = conversationsToSummaries({
    conversations: [
      {
        conversationId: "conversation-1",
        lastMessagePreview: "Prepare me for tomorrow",
        title: "Tomorrow prep"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "conversation-1",
      preview: "Prepare me for tomorrow",
      title: "Tomorrow prep"
    }
  ]);
});

test("profileToSummary maps profile payloads and empty profiles", () => {
  assert.deepEqual(
    profileToSummary({
      profile: {
        displayName: "Xinyi Zhao",
        headline: "Relationship operator",
        homeMarket: "Tokyo"
      }
    }),
    {
      displayName: "Xinyi Zhao",
      headline: "Relationship operator",
      timezone: "Tokyo"
    }
  );

  assert.deepEqual(profileToSummary({ profile: null }), {
    displayName: "Orbit profile",
    headline: "Complete your relationship profile",
    timezone: "Local"
  });
});
