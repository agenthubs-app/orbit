import assert from "node:assert/strict";
import test from "node:test";

import { createPostEventFollowupPostHandler } from "../../app/api/events/[id]/post-event/followup/handler";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import type { EventRegistration } from "../../features/events/registration/contract";

const eventId = "demo-event-1";
const actor = { email: "attendee@example.test", id: "actor:attendee", name: "Attendee" };
const timestamp = "2026-08-04T12:00:00.000Z";

function registration(): EventRegistration {
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actor.id}`,
    participantProfile: {
      answers: {},
      createdAt: timestamp,
      eventId,
      id: `profile:${eventId}:${actor.id}`,
      updatedAt: timestamp,
      userId: actor.id,
    },
    participantProfileId: `profile:${eventId}:${actor.id}`,
    reactivatedAt: null,
    registeredAt: timestamp,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: "rsvped",
    updatedAt: timestamp,
    userId: actor.id,
  };
}

test("live follow-up route fails closed before deterministic summary, draft, or write creation", async () => {
  const previousMode = process.env.ORBIT_FEATURE_MODE;
  process.env.ORBIT_FEATURE_MODE = "live";
  try {
    const handler = createPostEventFollowupPostHandler({
      getRegistration: async () => registration(),
      loadEvent: async () => mockEventRecords.find((event) => event.id === eventId) ?? null,
      resolveActor: async () => actor,
    });
    const response = await handler(
      new Request(`http://localhost/api/events/${eventId}/post-event/followup`, {
        body: JSON.stringify({ contactId: "demo-contact-1", noteText: "This memo must not generate deterministic prose." }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    assert.equal(response.status, 410);
    const body = await response.json();
    assert.equal(body.error.code, "LEGACY_POST_EVENT_FOLLOWUP_DISABLED");
    assert.doesNotMatch(JSON.stringify(body), /messageDraft|structuredSummary|defaultDraft/);
  } finally {
    if (previousMode === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previousMode;
  }
});
