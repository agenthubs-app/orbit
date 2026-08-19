import assert from "node:assert/strict";
import test from "node:test";

import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createDeadlineGatedEventRegistrationService } from "../../features/events/registration/deadline-gated-service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

test("registration route returns a clear 409 after the event starts", async () => {
  const baseService = createEventRegistrationService({
    now: () => "2026-08-03T10:00:00.001Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const registrationService = createDeadlineGatedEventRegistrationService({
    baseService,
    windowProvider: {
      async getEnrollment(eventId) {
        return {
          state: "enrolled" as const,
          statementTimestamp: "2026-08-03T10:00:00.000Z",
          window: {
            eventId,
            profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
            registrationCutoffAt: "2026-08-03T11:00:00.000Z",
          },
        };
      },
    },
  });
  const { POST } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async () => null,
    loadEvent: async (eventId) =>
      mockEventRecords.find((event) => event.id === eventId) ?? null,
    registrationService,
    resolveActor: async () => ({
      id: "actor:deadline-route",
      name: "Deadline Route Tester",
    }),
  });
  const response = await POST(
    new Request(
      "http://orbit.local/api/events/demo-event-1/registration",
      {
        body: JSON.stringify({
          answers: {
            targetAttendees: "Climate operators",
            valueOffered: "A late offer that must be rejected",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-event-1" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "CONFLICT");
  assert.match(body.error.message, /closes when the event starts/i);
  assert.equal(
    await baseService.get({
      eventId: "demo-event-1",
      userId: "actor:deadline-route",
    }),
    null,
  );
});
