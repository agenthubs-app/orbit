import assert from "node:assert/strict";
import test from "node:test";

import { createEventMatchmakingContextService } from "../../features/events/matchmaking/context-service";
import { createEventMatchmakingService } from "../../features/events/matchmaking/service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

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
    id: () => "request-1",
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

  const incoming = await context.view({
    eventId: event.id,
    actorId: target.userId,
  });
  assert.equal(incoming.requests[0]?.direction, "incoming");
  assert.equal(incoming.requests[0]?.contactDetailsDisclosed, false);

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
  await matchmaking.selectSlot({
    requestId: request.requestId,
    actorId: target.userId,
    slot: "2026-07-27T03:00:00.000Z",
    now: "2026-07-26T01:05:00.000Z",
  });

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
