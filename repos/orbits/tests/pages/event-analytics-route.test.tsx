import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventAnalyticsRoute } from "../../app/(app)/app/events/[id]/analytics/event-analytics-route";

const EVENT_ID = "event:analytics-dual-role";

const appointmentCounts = {
  awaitingResponse: 0,
  cancelled: 0,
  completed: 1,
  confirmed: 1,
  draft: 0,
  negotiating: 0,
  reschedulePending: 0,
};

const contactRequestCounts = {
  accepted: 1,
  awaitingTargetConsent: 0,
  declined: 0,
  withdrawn: 0,
};

function organizerAggregate() {
  return {
    appointments: appointmentCounts,
    checkIns: { checkedIn: 2 },
    contactRequests: contactRequestCounts,
    encounters: { captured: 1, projected: 1 },
    eventId: EVENT_ID,
    grouping: {
      published: true,
      roundOne: { assignedParticipants: 2, tables: 1 },
      roundTwo: { assignedParticipants: 2, tables: 1 },
    },
    kind: "organizer_aggregate",
    registrations: { active: 2, cancelled: 0 },
  };
}

function attendeeReport() {
  return {
    aiArtifact: {
      artifact: null,
      failureCode: null,
      status: "unconfigured",
    },
    appointments: appointmentCounts,
    checkIn: { checkedInAt: null, status: "not_checked_in" },
    contactRequests: contactRequestCounts,
    encounters: { captured: 1, projected: 1 },
    eventId: EVENT_ID,
    grouping: {
      roundOneTableNumber: 1,
      roundTwoTableNumber: 2,
      status: "available",
    },
    kind: "attendee_report",
    registration: { status: "active" },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("dual-role users can switch between organizer aggregate and their own attendee report", async () => {
  const originalFetch = globalThis.fetch;
  const observed: string[] = [];
  let renderer!: ReactTestRenderer;

  globalThis.fetch = (async (url) => {
    const target = String(url);
    observed.push(target);
    if (target.endsWith("/analytics/aggregate")) {
      return Response.json({ data: organizerAggregate(), success: true });
    }
    if (target.endsWith("/analytics/attendee")) {
      return Response.json({ data: attendeeReport(), success: true });
    }
    throw new Error(`Unexpected analytics request ${target}`);
  }) as typeof fetch;

  try {
    await act(async () => {
      renderer = create(<EventAnalyticsRoute eventId={EVENT_ID} />);
      await flush();
    });

    assert.deepEqual(observed.sort(), [
      `/api/events/${encodeURIComponent(EVENT_ID)}/analytics/aggregate`,
      `/api/events/${encodeURIComponent(EVENT_ID)}/analytics/attendee`,
    ]);
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-analytics-kind"] === "organizer_aggregate",
      ).length,
      1,
    );
    const attendeeButton = renderer.root.find(
      (node) => node.props["data-event-analytics-view"] === "attendee_report",
    );
    await act(async () => {
      attendeeButton.props.onClick();
      await flush();
    });
    assert.equal(
      renderer.root.find(
        (node) => node.props["data-event-analytics-view"] === "attendee_report",
      ).props["aria-pressed"],
      true,
    );
    assert.equal(
      renderer.root.findAll(
        (node) => node.props["data-event-analytics-kind"] === "attendee_report",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    renderer?.unmount();
  }
});
