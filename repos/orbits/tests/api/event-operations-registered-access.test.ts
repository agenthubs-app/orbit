import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventOperationsCheckInPostHandler,
  createEventOperationsGenerationRunPostHandler,
  createEventOperationsManualCheckInPostHandler,
} from "../../app/api/events/[id]/operations/handlers";
import type { EventOperationsService } from "../../features/events/event-operations/service";
import {
  buildEventDetailPayload,
  mockEventRecords,
} from "../../features/events/event-crud-and-import/fixtures";
import type { EventRegistration } from "../../features/events/registration/contract";

const EVENT_ID = "event:e2e:registered-access";
const ATTENDEE_ID = "actor:attendee-01";

function registrationFor(
  eventId = EVENT_ID,
  actorId = ATTENDEE_ID,
): EventRegistration {
  const timestamp = "2026-08-02T08:00:00.000Z";
  const participantProfileId = `participant:${eventId}:${actorId}`;
  return {
    cancelledAt: null,
    eventId,
    id: `registration:${eventId}:${actorId}`,
    participantProfile: {
      answers: {},
      createdAt: timestamp,
      eventId,
      id: participantProfileId,
      updatedAt: timestamp,
      userId: actorId,
    },
    participantProfileId,
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
    userId: actorId,
  };
}

const dynamicEvent = {
  ...mockEventRecords[0],
  id: EVENT_ID,
  sourceMetadata: {
    ...mockEventRecords[0].sourceMetadata,
    providerRecordId: EVENT_ID,
  },
  title: "Registered attendee dynamic event",
  venue: "Persisted event venue",
};

test("event operations checks exact registration before resolving dynamic event metadata", async () => {
  const calls: string[] = [];
  const service = {
    async checkIn(input: { actorId: string; eventId: string }) {
      calls.push(`check-in:${input.eventId}:${input.actorId}`);
      return {
        actorId: input.actorId,
        checkedInAt: "2026-08-02T08:05:00.000Z",
        eventId: input.eventId,
        evidenceId: "evidence:check-in",
        participantId: "participant:attendee-01",
      };
    },
  } as EventOperationsService;
  const handler = createEventOperationsCheckInPostHandler({
    createService: () => service,
    registeredAccess: {
      async getRegistration({ eventId, userId }) {
        calls.push(`registration:${eventId}:${userId}`);
        return registrationFor(eventId, userId);
      },
      async loadEvent(eventId, actorId) {
        calls.push(`metadata:${eventId}:${actorId}`);
        return dynamicEvent;
      },
      resolveActor: async () => ({
        email: "attendee01@example.test",
        id: ATTENDEE_ID,
        name: "Attendee 01",
      }),
    },
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/check-in`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    `registration:${EVENT_ID}:${ATTENDEE_ID}`,
    `metadata:${EVENT_ID}:${ATTENDEE_ID}`,
    `check-in:${EVENT_ID}:${ATTENDEE_ID}`,
  ]);
  const body = await response.json();
  assert.equal(body.data.eventId, EVENT_ID);
});

test("an unregistered attendee is rejected before event metadata or operations run", async () => {
  const calls: string[] = [];
  const handler = createEventOperationsCheckInPostHandler({
    createService: () => {
      calls.push("service");
      throw new Error("service must not be constructed");
    },
    registeredAccess: {
      async getRegistration() {
        calls.push("registration");
        return null;
      },
      async loadEvent() {
        calls.push("metadata");
        return dynamicEvent;
      },
      resolveActor: async () => ({ id: ATTENDEE_ID, name: "Attendee 01" }),
    },
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/check-in`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(calls, ["registration"]);
});

test("registered access rejects metadata for a different event before operations run", async () => {
  let serviceConstructed = false;
  const handler = createEventOperationsCheckInPostHandler({
    createService: () => {
      serviceConstructed = true;
      throw new Error("service must not be constructed");
    },
    registeredAccess: {
      getRegistration: async () => registrationFor(),
      loadEvent: async () => ({ ...dynamicEvent, id: "event:other" }),
      resolveActor: async () => ({ id: ATTENDEE_ID, name: "Attendee 01" }),
    },
  });

  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/check-in`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 404);
  assert.equal(serviceConstructed, false);
});

test("public generation run route rejects HTTP execution and never constructs the AI service", async () => {
  let serviceConstructed = false;
  const handler = createEventOperationsGenerationRunPostHandler({
    createService: () => {
      serviceConstructed = true;
      throw new Error("HTTP run must not construct the event operations service");
    },
    ownedAccess: {
      createEventService: () => ({
        async getEvent() {
          return { data: buildEventDetailPayload(dynamicEvent), success: true } as const;
        },
      }),
      resolveActor: async () => ({ id: "actor:organizer", name: "Organizer" }),
    },
  });

  const response = await handler(
    new Request(
      `http://localhost/api/events/${EVENT_ID}/operations/admin/generations/generation-1/run`,
      { body: JSON.stringify({ maxConcurrency: 32 }), method: "POST" },
    ),
    { params: Promise.resolve({ generationId: "generation-1", id: EVENT_ID }) },
  );

  assert.equal(response.status, 409);
  assert.equal(serviceConstructed, false);
  const body = await response.json();
  assert.equal(
    body.error.context.eventOperationsCode,
    "EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED",
  );
});

test("organizer manual check-in route forwards only server-owned event and actor scope", async () => {
  const calls: unknown[] = [];
  const handler = createEventOperationsManualCheckInPostHandler({
    createService: () => ({
      async checkInParticipant(input) {
        calls.push(input);
        return {
          actorId: "actor:mei",
          checkedInAt: "2026-08-02T09:15:00.000Z",
          eventId: input.eventId,
          evidenceId: "evidence:manual-check-in",
          participantId: input.participantId,
        };
      },
    } as EventOperationsService),
    ownedAccess: {
      createEventService: () => ({
        async getEvent() {
          return { data: buildEventDetailPayload(dynamicEvent), success: true } as const;
        },
      }),
      resolveActor: async () => ({ id: "actor:organizer", name: "Organizer" }),
    },
  });
  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/admin/check-ins`, {
      body: JSON.stringify({
        actorId: "actor:forged",
        eventId: "event:forged",
        participantId: "participant:mei",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      actorId: "actor:organizer",
      eventId: EVENT_ID,
      participantId: "participant:mei",
    },
  ]);
});
