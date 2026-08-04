import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventOperationsCheckInPostHandler,
  createEventOperationsGenerationRunPostHandler,
  createEventOperationsManualCheckInPostHandler,
} from "../../app/api/events/[id]/operations/handlers";
import type {
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../features/events/event-access/contract";
import { EventCapabilityDeniedError } from "../../features/events/event-access/guard";
import type { EventAccessService } from "../../features/events/event-access/service";
import type { EventOperationsService } from "../../features/events/event-operations/service";
import {
  buildEventDetailPayload,
  mockEventRecords,
} from "../../features/events/event-crud-and-import/fixtures";
import type { EventRegistration } from "../../features/events/registration/contract";

const EVENT_ID = "event:e2e:registered-access";
const ATTENDEE_ID = "actor:attendee-01";

function manualAccessService(input: {
  owner: boolean;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
}): EventAccessService {
  return {
    async get(query) {
      const value = query as { eventId: string; subjectActorId: string };
      return {
        eventId: value.eventId,
        owner: input.owner,
        revision: 1,
        role: input.role,
        state: input.state,
        subjectActorId: value.subjectActorId,
      };
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

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

test("manual check-in forwards only server-owned event and actor scope", async () => {
  const calls: unknown[] = [];
  const handler = createEventOperationsManualCheckInPostHandler({
    createAccessService: () =>
      manualAccessService({ owner: true, role: null, state: null }),
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
    resolveActor: async () => ({ id: "actor:organizer", name: "Organizer" }),
  });
  const response = await handler(
    new Request(`http://localhost/api/events/${EVENT_ID}/operations/admin/check-ins`, {
      body: JSON.stringify({ participantId: "participant:mei" }),
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

test("manual check-in authenticates before constructing either runtime", async () => {
  let accessRuntimeCalls = 0;
  let operationsRuntimeCalls = 0;
  const handler = createEventOperationsManualCheckInPostHandler({
    createAccessService: () => {
      accessRuntimeCalls += 1;
      return manualAccessService({ owner: true, role: null, state: null });
    },
    createService: () => {
      operationsRuntimeCalls += 1;
      throw new Error("Anonymous requests must not construct operations.");
    },
    resolveActor: async () => null,
  });

  const response = await handler(
    new Request(`http://test/api/events/${EVENT_ID}/operations/admin/check-ins`, {
      body: JSON.stringify({ participantId: "participant:target" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 401);
  assert.equal(accessRuntimeCalls, 0);
  assert.equal(operationsRuntimeCalls, 0);
});

test("manual check-in admits only principals with check-in roster write capability", async (t) => {
  const cases: readonly [
    string,
    boolean,
    EventAccessRole | null,
    EventAccessAssignmentState | null,
    number,
  ][] = [
    ["owner", true, null, null, 200],
    ["active operations", false, "operations", "active", 200],
    ["active check-in", false, "check_in", "active", 200],
    ["reviewer", false, "reviewer", "active", 403],
    ["analyst", false, "read_only_analyst", "active", 403],
    ["revoked check-in", false, "check_in", "revoked", 403],
    ["unassigned", false, null, null, 403],
  ];

  for (const [name, owner, role, state, expectedStatus] of cases) {
    await t.test(name, async () => {
      let operationsCalls = 0;
      const handler = createEventOperationsManualCheckInPostHandler({
        createAccessService: () =>
          manualAccessService({ owner, role, state }),
        createService: () =>
          ({
            async checkInParticipant(input) {
              operationsCalls += 1;
              return {
                actorId: "actor:target",
                checkedInAt: "2026-08-02T09:15:00.000Z",
                eventId: input.eventId,
                evidenceId: "evidence:manual-check-in",
                participantId: input.participantId,
              };
            },
          }) as EventOperationsService,
        resolveActor: async () => ({ id: "actor:staff" }),
      });

      const response = await handler(
        new Request(`http://test/api/events/${EVENT_ID}/operations/admin/check-ins`, {
          body: JSON.stringify({ participantId: "participant:target" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ id: EVENT_ID }) },
      );

      assert.equal(response.status, expectedStatus);
      assert.equal(operationsCalls, expectedStatus === 200 ? 1 : 0);
    });
  }
});

test("manual check-in rejects identity and scope fields supplied by the client", async (t) => {
  for (const forgedKey of ["actorId", "eventId", "role", "workspaceId"]) {
    await t.test(forgedKey, async () => {
      let operationsCalls = 0;
      const handler = createEventOperationsManualCheckInPostHandler({
        createAccessService: () =>
          manualAccessService({ owner: true, role: null, state: null }),
        createService: () =>
          ({
            async checkInParticipant() {
              operationsCalls += 1;
              throw new Error("Invalid input must not reach operations.");
            },
          }) as unknown as EventOperationsService,
        resolveActor: async () => ({ id: "actor:organizer" }),
      });

      const response = await handler(
        new Request(`http://test/api/events/${EVENT_ID}/operations/admin/check-ins`, {
          body: JSON.stringify({
            [forgedKey]: "forged",
            participantId: "participant:target",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ id: EVENT_ID }) },
      );

      assert.equal(response.status, 400);
      assert.equal(operationsCalls, 0);
    });
  }
});

test("manual check-in preserves a capability revocation found by the service recheck", async () => {
  const handler = createEventOperationsManualCheckInPostHandler({
    createAccessService: () =>
      manualAccessService({ owner: false, role: "check_in", state: "active" }),
    createService: () =>
      ({
        async checkInParticipant() {
          throw new EventCapabilityDeniedError();
        },
      }) as unknown as EventOperationsService,
    resolveActor: async () => ({ id: "actor:check-in-staff" }),
  });

  const response = await handler(
    new Request(`http://test/api/events/${EVENT_ID}/operations/admin/check-ins`, {
      body: JSON.stringify({ participantId: "participant:target" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );

  assert.equal(response.status, 403);
});
