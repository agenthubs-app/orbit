import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { EventAnalyticsReport } from "../../features/events/event-analytics/report";

test("organizer analytics reports explain rounded rates with their exact samples", () => {
  const html = renderToStaticMarkup(
    <EventAnalyticsReport
      value={{
        appointments: {
          awaitingResponse: 0,
          cancelled: 0,
          completed: 1,
          confirmed: 1,
          draft: 0,
          negotiating: 0,
          reschedulePending: 0,
        },
        checkIns: { checkedIn: 2 },
        contactRequests: {
          accepted: 1,
          awaitingTargetConsent: 1,
          declined: 1,
          withdrawn: 1,
        },
        encounters: { captured: 0, projected: 0 },
        eventId: "event:analytics:rates",
        grouping: {
          published: true,
          roundOne: { assignedParticipants: 64, tables: 11 },
          roundTwo: { assignedParticipants: 64, tables: 11 },
        },
        kind: "organizer_aggregate",
        registrations: { active: 3, cancelled: 0 },
      }}
    />,
  );

  for (const value of ["67%", "25%", "50%", "2 / 3", "1 / 4", "1 / 2"]) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.includes("第一轮桌数"));
  assert.ok(html.includes(">11<"));
  assert.ok(html.includes("第一轮座位"));
  assert.ok(html.includes(">64<"));
});

test("organizer analytics marks zero-denominator rates as no sample", () => {
  const html = renderToStaticMarkup(
    <EventAnalyticsReport
      value={{
        appointments: {
          awaitingResponse: 0,
          cancelled: 0,
          completed: 0,
          confirmed: 0,
          draft: 0,
          negotiating: 0,
          reschedulePending: 0,
        },
        checkIns: { checkedIn: 0 },
        contactRequests: {
          accepted: 0,
          awaitingTargetConsent: 0,
          declined: 0,
          withdrawn: 0,
        },
        encounters: { captured: 0, projected: 0 },
        eventId: "event:analytics:empty",
        grouping: {
          published: false,
          roundOne: { assignedParticipants: 0, tables: 0 },
          roundTwo: { assignedParticipants: 0, tables: 0 },
        },
        kind: "organizer_aggregate",
        registrations: { active: 0, cancelled: 0 },
      }}
    />,
  );

  assert.equal((html.match(/暂无样本/g) ?? []).length, 3);
  assert.equal((html.match(/暂无可计算样本/g) ?? []).length, 3);
});

test("a non-ready attendee artifact renders its real status without invented content", () => {
  const html = renderToStaticMarkup(
    <EventAnalyticsReport
      value={{
        aiArtifact: {
          artifact: null,
          eventId: "event:analytics:attendee",
          failureCode: null,
          status: "running",
          updatedAt: null,
        },
        appointments: {
          awaitingResponse: 0,
          cancelled: 0,
          completed: 0,
          confirmed: 0,
          draft: 0,
          negotiating: 0,
          reschedulePending: 0,
        },
        checkIn: { checkedInAt: null, status: "not_checked_in" },
        contactRequests: {
          accepted: 0,
          awaitingTargetConsent: 0,
          declined: 0,
          withdrawn: 0,
        },
        encounters: { captured: 0, projected: 0 },
        eventId: "event:analytics:attendee",
        grouping: {
          roundOneTableNumber: null,
          roundTwoTableNumber: null,
          status: "not_published",
        },
        kind: "attendee_report",
        registration: { status: "active" },
      }}
    />,
  );

  assert.ok(html.includes('data-event-analytics-ai-status="running"'));
  assert.ok(html.includes("不会展示草稿"));
  assert.ok(!html.includes("data-event-analytics-ai-artifact"));
});
