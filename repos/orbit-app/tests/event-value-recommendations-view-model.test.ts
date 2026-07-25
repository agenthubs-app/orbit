import assert from "node:assert/strict";
import test from "node:test";
import {
  eventValueRecommendationAcceptanceToView,
  eventValueRecommendationsToView
} from "../src/view-models/events";

test("eventValueRecommendationsToView maps global event recommendations into Chinese cards", () => {
  const view = eventValueRecommendationsToView({
    nextAction: "Attend for operator discovery and capture source notes before any follow-up action.",
    profile: {
      calendarFit: "open",
      goal: "Find climate operators with buyer urgency",
      industryPreference: "climate",
      location: "Tokyo"
    },
    recommendations: [
      {
        attendeeDensity: 42,
        calendarFit: "open",
        eventId: "demo-event-1",
        industry: "climate",
        location: "Tokyo",
        recommendedAction:
          "Attend for operator discovery and capture source notes before any follow-up action.",
        scoreBand: "high",
        signals: [
          {
            detail:
              "Local event notes mark the attendee mix as operators with near-term climate purchasing needs.",
            label: "Buyer urgency",
            weight: 0.35
          },
          {
            detail:
              "The fixture marks a free morning slot; no live calendar sync was requested.",
            label: "Calendar fit",
            weight: 0.1
          }
        ],
        startsAt: "2026-06-29T00:00:00.000Z",
        title: "Climate operators breakfast",
        valueScore: 94,
        venue: "Nihonbashi Climate Table"
      }
    ],
    state: "success"
  });

  assert.deepEqual(view, {
    emptyText: "",
    nextAction: "适合用来找运营方。现场先记下来源，再决定要不要跟进。",
    profileLine: "东京 · 气候科技 · 时间合适",
    recommendations: [
      {
        action: "适合用来找运营方。现场先记下来源，再决定要不要跟进。",
        detail: "6月29日 周一 09:00 · Tokyo · Nihonbashi Climate Table",
        id: "demo-event-1",
        reason: "参会者里有近期在看气候方案的运营方。",
        scoreBandLabel: "优先参加",
        scoreLabel: "94 分",
        title: "气候运营方早餐会"
      }
    ],
    title: "推荐参加"
  });
});

test("eventValueRecommendationsToView keeps empty recommendations useful", () => {
  assert.deepEqual(
    eventValueRecommendationsToView({
      nextAction: "Select a profile goal before recommending events.",
      profile: {
        calendarFit: "tight",
        goal: "",
        industryPreference: "",
        location: "Osaka"
      },
      recommendations: [],
      state: "empty"
    }),
    {
      emptyText: "暂时没有比当前列表更值得优先参加的活动。",
      nextAction: "先补个人主页里的参会目标。",
      profileLine: "大阪 · 时间紧",
      recommendations: [],
      title: "推荐参加"
    }
  );
});

test("eventValueRecommendationAcceptanceToView maps accepted events into a guarded Chinese next step", () => {
  const view = eventValueRecommendationAcceptanceToView({
    acceptedEvent: {
      attendeeDensity: 42,
      calendarFit: "open",
      eventId: "demo-event-1",
      industry: "climate",
      location: "Tokyo",
      recommendedAction:
        "Attend for operator discovery and capture source notes before any follow-up action.",
      scoreBand: "high",
      signals: [
        {
          detail:
            "Local event notes mark the attendee mix as operators with near-term climate purchasing needs.",
          label: "Buyer urgency",
          weight: 0.35
        }
      ],
      startsAt: "2026-06-29T00:00:00.000Z",
      title: "Climate operators breakfast",
      valueScore: 94,
      venue: "Nihonbashi Climate Table"
    },
    action: {
      calendarProviderRequested: false,
      databaseWriteExecuted: false,
      externalNetworkRequested: false,
      label: "Accept event value recommendation",
      notificationDelivered: false
    },
    nextAction:
      "Keep the accepted event source-backed until a live action sandbox is explicitly wired.",
    state: "accepted",
    summary:
      "The accept action records a local mock decision without writing calendars, notifications, databases, or external messages."
  });

  assert.deepEqual(view, {
    detail: "6月29日 周一 09:00 · Tokyo · Nihonbashi Climate Table",
    eventId: "demo-event-1",
    nextAction: "已记录这个选择。下一步去活动页确认报名和会前准备。",
    safetyLabel: "未写日历、未发送通知",
    scoreLabel: "94 分",
    title: "已接受推荐：气候运营方早餐会"
  });
  assert.doesNotMatch(
    JSON.stringify(view),
    /mock|fixture|provider|database|notification|external/i
  );
});
