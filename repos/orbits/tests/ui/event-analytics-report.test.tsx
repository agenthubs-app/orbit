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
        roi: {
          metrics: {
            attributionCoverage: {
              declaredCompletedOperations: 2,
              stronglyAttributedCompletedOperations: 1,
              rate: { denominator: 2, numerator: 1, value: 0.5 },
            },
            checkedInParticipants: 2,
            completedAttributedAgentOperations: 1,
            effectiveConnectionPairs: 1,
            effectiveConnectionParticipants: 2,
            effectiveConnectionRate: { denominator: 2, numerator: 2, value: 1 },
            mutualConnections: {
              acceptedRelationshipPairs: 1,
              distinctConnectedCheckIns: 2,
              mutuallyCheckedInPairs: 1,
              participationRate: { denominator: 2, numerator: 2, value: 1 },
            },
            strongActions: {
              appointments: 1,
              followupReminders: 1,
              humanEncounterNotes: 1,
              messageDrafts: 1,
            },
          },
          snapshot: {
            finalizedAt: null,
            formulaHash: "formula:test",
            metricVersion: "event-roi-v1",
            revision: null,
            sourceWatermark: {
              appointmentCount: 0,
              appointmentUpdatedAt: null,
              checkInCount: 2,
              checkInRevision: 1,
              completedAgentReceiptCount: 2,
              completedAgentReceiptUpdatedAt: null,
              configurationVersion: 1,
              membershipCount: 3,
              membershipRevision: 1,
              relationshipPairCount: 1,
              relationshipAcceptedAt: null,
            },
            status: "live",
            windowEndsAt: "2026-08-12T08:00:00.000Z",
          },
        },
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
  for (const label of [
    "有效连接率",
    "强行动·交流记录",
    "强行动·消息草稿",
    "强行动·跟进提醒",
    "强行动·非取消约谈",
  ]) {
    assert.ok(html.includes(label), label);
  }
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
        roi: {
          metrics: {
            attributionCoverage: {
              declaredCompletedOperations: 0,
              stronglyAttributedCompletedOperations: 0,
              rate: { denominator: 0, numerator: 0, value: null },
            },
            checkedInParticipants: 0,
            completedAttributedAgentOperations: 0,
            effectiveConnectionPairs: 0,
            effectiveConnectionParticipants: 0,
            effectiveConnectionRate: { denominator: 0, numerator: 0, value: null },
            mutualConnections: {
              acceptedRelationshipPairs: 0,
              distinctConnectedCheckIns: 0,
              mutuallyCheckedInPairs: 0,
              participationRate: { denominator: 0, numerator: 0, value: null },
            },
            strongActions: {
              appointments: 0,
              followupReminders: 0,
              humanEncounterNotes: 0,
              messageDrafts: 0,
            },
          },
          snapshot: {
            finalizedAt: null,
            formulaHash: "formula:test",
            metricVersion: "event-roi-v1",
            revision: null,
            sourceWatermark: {
              appointmentCount: 0,
              appointmentUpdatedAt: null,
              checkInCount: 0,
              checkInRevision: 0,
              completedAgentReceiptCount: 0,
              completedAgentReceiptUpdatedAt: null,
              configurationVersion: 1,
              membershipCount: 0,
              membershipRevision: 0,
              relationshipPairCount: 0,
              relationshipAcceptedAt: null,
            },
            status: "live",
            windowEndsAt: "2026-08-12T08:00:00.000Z",
          },
        },
      }}
    />,
  );

  assert.equal((html.match(/暂无样本/g) ?? []).length, 6);
  assert.equal((html.match(/暂无可计算样本/g) ?? []).length, 6);
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
