import assert from "node:assert/strict";
import test from "node:test";

import { createEventMatchmakingContextService } from "../../features/events/matchmaking/context-service";
import {
  createConfiguredEventMatchmakingService,
  createEventMatchmakingService,
} from "../../features/events/matchmaking/service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("configured event matchmaking fails closed without durable storage", () => {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = runtimeEnv.NODE_ENV;
  const keys = [
    "ORBIT_EVENT_DATABASE_URL",
    "ORBIT_LIVE_DATABASE_URL",
    "ORBIT_DATABASE_URL",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, runtimeEnv[key]]),
  ) as Record<(typeof keys)[number], string | undefined>;

  try {
    runtimeEnv.NODE_ENV = "production";
    for (const key of keys) {
      delete runtimeEnv[key];
    }

    assert.throws(
      () => createConfiguredEventMatchmakingService(),
      /Event matchmaking requires ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL/u,
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete runtimeEnv.NODE_ENV;
    } else {
      runtimeEnv.NODE_ENV = previousNodeEnv;
    }
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete runtimeEnv[key];
      } else {
        runtimeEnv[key] = previous[key];
      }
    }
  }
});

test("event matching derives actors from registrations and completes consent plus manual scheduling", async () => {
  const event = mockEventRecords.find(
    (candidate) => candidate.id === "demo-event-1",
  );
  assert.ok(event);
  const registrationService = createEventRegistrationService({
    now: () => "2026-07-26T01:00:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const requester = await registrationService.register({
    eventId: event.id,
    userId: "user:requester",
    displayName: "Ari",
    answers: {
      industry: "Climate",
      desiredOutcome: "Partnership",
      targetAttendees: "Distribution",
      positioning: "Orbit",
    },
  });
  const target = await registrationService.register({
    eventId: event.id,
    userId: "user:target",
    displayName: "Aiko",
    answers: {
      industry: "Climate",
      desiredOutcome: "Partnership",
      valueOffered: "Distribution",
      positioning: "Blue Harbor",
    },
  });
  const excluded = await registrationService.register({
    eventId: event.id,
    userId: "user:cancelled",
    displayName: "Cancelled participant",
    answers: {
      industry: "Climate",
      valueOffered: "Distribution",
    },
  });
  await registrationService.cancel({
    eventId: event.id,
    userId: excluded.userId,
  });

  const matchmaking = createEventMatchmakingService({
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:matchmaking-context-test",
  });
  const context = createEventMatchmakingContextService({
    loadEvent: async () => event,
    matchmaking,
    registrationService,
  });

  const initial = await context.view({
    eventId: event.id,
    actorId: requester.userId,
  });
  assert.equal(initial.state, "ready");
  assert.deepEqual(
    initial.recommendations.map((candidate) => candidate.participantId),
    [target.participantProfileId],
  );
  assert.equal(initial.recommendations[0]?.contactDetailsDisclosed, false);
  assert.equal(JSON.stringify(initial).includes("user:target"), false);
  assert.equal(JSON.stringify(initial).includes("email"), false);
  await assert.rejects(
    () =>
      context.createRequest({
        eventId: event.id,
        actorId: requester.userId,
        targetParticipantId: "participant:browser-forged",
        now: "2026-07-26T01:01:00.000Z",
      }),
    /not an eligible match/,
  );

  const request = await context.createRequest({
    eventId: event.id,
    actorId: requester.userId,
    targetParticipantId: target.participantProfileId,
    now: "2026-07-26T01:02:00.000Z",
  });
  assert.match(request.organizerActorId, /^event-organizer:/);
  assert.equal(request.requesterActorId, requester.userId);
  assert.equal(request.targetActorId, target.userId);
  const repeatedRequest = await context.createRequest({
    eventId: event.id,
    actorId: requester.userId,
    targetParticipantId: target.participantProfileId,
    now: "2026-07-26T01:02:30.000Z",
  });
  assert.equal(repeatedRequest.requestId, request.requestId);
  assert.equal(repeatedRequest.createdAt, request.createdAt);
  assert.equal(
    (
      await matchmaking.listRequests({
        eventId: event.id,
        actorId: requester.userId,
      })
    ).length,
    1,
  );

  const incoming = await context.view({
    eventId: event.id,
    actorId: target.userId,
  });
  assert.equal(incoming.requests[0]?.direction, "incoming");
  assert.equal(incoming.requests[0]?.contactDetailsDisclosed, false);
  const reverseRequest = await context.createRequest({
    eventId: event.id,
    actorId: target.userId,
    targetParticipantId: requester.participantProfileId,
    now: "2026-07-26T01:02:45.000Z",
  });
  assert.equal(reverseRequest.requestId, request.requestId);
  assert.equal(reverseRequest.requesterActorId, requester.userId);
  assert.equal(
    (
      await matchmaking.listRequests({
        eventId: event.id,
        actorId: target.userId,
      })
    ).length,
    1,
  );

  await matchmaking.respondToIntroduction({
    requestId: request.requestId,
    actorId: target.userId,
    accept: true,
    now: "2026-07-26T01:03:00.000Z",
  });
  await matchmaking.proposeSlots({
    requestId: request.requestId,
    actorId: requester.userId,
    slots: ["2026-07-27T03:00:00.000Z"],
    now: "2026-07-26T01:04:00.000Z",
  });
  const selected = await matchmaking.selectSlot({
    requestId: request.requestId,
    actorId: target.userId,
    slot: "2026-07-27T03:00:00.000Z",
    now: "2026-07-26T01:05:00.000Z",
  });
  const repeatedSelection = await matchmaking.selectSlot({
    requestId: request.requestId,
    actorId: target.userId,
    slot: "2026-07-27T03:00:00.000Z",
    now: "2026-07-26T01:06:00.000Z",
  });
  assert.equal(repeatedSelection.updatedAt, selected.updatedAt);
  await assert.rejects(
    () =>
      matchmaking.selectSlot({
        requestId: request.requestId,
        actorId: target.userId,
        slot: "2026-07-27T04:00:00.000Z",
        now: "2026-07-26T01:07:00.000Z",
      }),
    /explicit rescheduling flow/,
  );
  await assert.rejects(
    () =>
      matchmaking.proposeSlots({
        requestId: request.requestId,
        actorId: requester.userId,
        slots: ["2026-07-27T04:00:00.000Z"],
        now: "2026-07-26T01:08:00.000Z",
      }),
    /accepted or actively scheduling/,
  );

  const completed = await context.view({
    eventId: event.id,
    actorId: requester.userId,
  });
  assert.equal(completed.requests[0]?.status, "scheduled");
  assert.equal(
    completed.requests[0]?.selectedSlot,
    "2026-07-27T03:00:00.000Z",
  );
  assert.equal(completed.externalCalendarAvailable, false);
  assert.equal(completed.manualSchedulingAvailable, true);

  const stranger = await context.view({
    eventId: event.id,
    actorId: "user:not-registered",
  });
  assert.equal(stranger.state, "registration_required");
  assert.deepEqual(stranger.recommendations, []);
  assert.deepEqual(stranger.requests, []);
});
