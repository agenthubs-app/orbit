import assert from "node:assert/strict";
import test from "node:test";

import { createEventOperationsEngine } from "../../features/events/event-operations/engine";
import { createMemoryEventOperationsRepository } from "../../features/events/event-operations/storage/memory-repository";
import {
  EVENT_OPERATIONS_E2E_EVENT_ID,
  EVENT_OPERATIONS_E2E_LIFECYCLE_FIXTURES,
  EVENT_OPERATIONS_E2E_PARTICIPANTS,
  EVENT_OPERATIONS_E2E_SEED_ACCOUNTS,
  seedEventOperationsE2E,
} from "../../features/events/event-operations/seed";
import { createEventOperationsService } from "../../features/events/event-operations/service";
import {
  createEventRegistrationService,
  eventRegistrationId,
} from "../../features/events/registration/service";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("event operations E2E seed is exact-scope idempotent and exposes a fixed 64-person lifecycle matrix", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:event-operations-seed-test";
  const organizerActorId = "actor:event-operations-organizer";
  const timestamp = "2026-08-02T12:00:00.000Z";
  const event = {
    description: "关西地区跨境商务合作与产业对接活动。",
    endsAt: "2026-08-18T12:00:00+09:00",
    id: EVENT_OPERATIONS_E2E_EVENT_ID,
    startsAt: "2026-08-18T10:00:00+09:00",
    title: "关西跨境商务对接会",
    venue: "大阪",
  };
  const participants = EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((definition, index) => ({
    ...definition,
    actorId: `actor:event-operations-attendee:${index + 1}`,
  }));
  let repositoryTimestamp = timestamp;
  const repository = createMemoryEventOperationsRepository({
    now: () => repositoryTimestamp,
  });

  assert.equal(EVENT_OPERATIONS_E2E_PARTICIPANTS.length, 64);
  assert.equal(
    EVENT_OPERATIONS_E2E_PARTICIPANTS.filter(
      (definition) => definition.registrationStatus === "rsvped",
    ).length,
    64,
  );
  assert.equal(
    EVENT_OPERATIONS_E2E_PARTICIPANTS.filter(
      (definition) => definition.registrationStatus === "cancelled",
    ).length,
    0,
  );
  assert.equal(EVENT_OPERATIONS_E2E_LIFECYCLE_FIXTURES.length, 6);
  assert.equal(
    EVENT_OPERATIONS_E2E_LIFECYCLE_FIXTURES.filter(
      (definition) => definition.registrationTiming === "late",
    ).length,
    3,
  );
  assert.equal(
    new Set(EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((value) => value.email)).size,
    70,
  );
  assert.equal(
    new Set(
      EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((value) => value.displayName),
    ).size,
    70,
  );
  assert.equal(
    new Set(
      EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((value) =>
        JSON.stringify(value.answers),
      ),
    ).size,
    70,
  );
  await assert.rejects(
    seedEventOperationsE2E({
      event,
      now: () => timestamp,
      organizerActorId,
      operationsRepository: repository,
      participants: participants.slice(0, -1),
      store,
      workspaceId,
    }),
    /64 on-time active participants plus 6 cancelled lifecycle fixtures/,
  );

  const unrelatedEventId = "event:e2e:must-survive-exact-scope-reset";
  const unrelatedActorId = "actor:event-operations-unrelated";
  const unrelatedProvider = createEventRegistrationLiveRecordProvider({
    now: () => timestamp,
    store,
    workspaceId,
  });
  const unrelatedProfileId = `event-participant-profile:${encodeURIComponent(unrelatedEventId)}:${encodeURIComponent(unrelatedActorId)}`;
  await unrelatedProvider.saveRegistration({
    cancelledAt: null,
    eventId: unrelatedEventId,
    id: eventRegistrationId(unrelatedEventId, unrelatedActorId),
    participantProfile: {
      answers: { positioning: "Unrelated fixture @ Scope Guard" },
      createdAt: timestamp,
      displayName: "Unrelated Scope Guard",
      eventId: unrelatedEventId,
      id: unrelatedProfileId,
      updatedAt: timestamp,
      userId: unrelatedActorId,
    },
    participantProfileId: unrelatedProfileId,
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
    userId: unrelatedActorId,
  });

  const first = await seedEventOperationsE2E({
    event,
    now: () => timestamp,
    organizerActorId,
    operationsRepository: repository,
    participants,
    store,
    workspaceId,
  });
  repositoryTimestamp = "2026-08-18T09:05:00+09:00";
  await repository.checkInAtomically({
    actorId: participants[0]!.actorId,
    eventId: EVENT_OPERATIONS_E2E_EVENT_ID,
  });
  repositoryTimestamp = timestamp;

  const second = await seedEventOperationsE2E({
    event,
    now: () => timestamp,
    organizerActorId,
    operationsRepository: repository,
    participants,
    store,
    workspaceId,
  });

  assert.equal(first.eventId, EVENT_OPERATIONS_E2E_EVENT_ID);
  assert.equal(first.participantCount, 64);
  assert.equal(first.registrationHistoryCount, 70);
  assert.deepEqual(second, first);
  assert.deepEqual(await repository.listCheckIns(EVENT_OPERATIONS_E2E_EVENT_ID), []);
  assert.deepEqual(await repository.listGenerations(EVENT_OPERATIONS_E2E_EVENT_ID), []);
  assert.equal(await repository.getPublishedResult(EVENT_OPERATIONS_E2E_EVENT_ID), null);
  assert.equal(
    (
      await unrelatedProvider.getRegistration(
        unrelatedEventId,
        unrelatedActorId,
      )
    )?.participantProfile.displayName,
    "Unrelated Scope Guard",
  );

  const eventRecord = await store.getRecord({
    collectionName: "events",
    recordId: EVENT_OPERATIONS_E2E_EVENT_ID,
    workspaceId,
  });
  assert.equal(eventRecord?.userId, organizerActorId);

  const registrationProvider = createEventRegistrationLiveRecordProvider({
    store,
    workspaceId,
  });
  const registrationService = createEventRegistrationService({ provider: registrationProvider });
  const registrations = await registrationService.list({ eventId: EVENT_OPERATIONS_E2E_EVENT_ID });
  assert.equal(registrations.length, 70);
  assert.equal(new Set(registrations.map((record) => record.userId)).size, 70);
  assert.equal(
    registrations.filter((record) => record.status === "rsvped").length,
    64,
  );
  assert.equal(
    registrations.filter((record) => record.status === "cancelled").length,
    6,
  );
  assert.equal(
    registrations.filter(
      (record) =>
        record.status === "cancelled" &&
        Date.parse(record.registeredAt) >=
          Date.parse(first.configuration.profileEditDeadlineAt),
    ).length,
    3,
  );
  const canonicalRegistrations = await repository.listCanonicalRegistrations(
    EVENT_OPERATIONS_E2E_EVENT_ID,
  );
  assert.equal(canonicalRegistrations.length, 70);
  assert.equal(
    canonicalRegistrations.filter((record) => record.status === "rsvped")
      .length,
    64,
  );
  assert.equal(
    canonicalRegistrations.filter((record) => record.status === "cancelled")
      .length,
    6,
  );
  assert.deepEqual(
    await repository.listCatalogueSummaries([EVENT_OPERATIONS_E2E_EVENT_ID]),
    [
      {
        activeRegistrationCount: 64,
        attendeeResultsAvailable: false,
        eventId: EVENT_OPERATIONS_E2E_EVENT_ID,
        hasPublishedResults: false,
      },
    ],
  );

  let aiCalls = 0;
  const engine = createEventOperationsEngine({
    aiProvider: {
      async generateGroupingFeatures() {
        aiCalls += 1;
        throw new Error("The seed must not call AI.");
      },
      async generateRecommendations() {
        aiCalls += 1;
        throw new Error("The seed must not call AI.");
      },
      async generateTableContent() {
        aiCalls += 1;
        throw new Error("The seed must not call AI.");
      },
    },
    now: () => timestamp,
    repository,
  });
  const service = createEventOperationsService({
    access: {
      async isOrganizer({ actorId, eventId }) {
        return actorId === organizerActorId && eventId === EVENT_OPERATIONS_E2E_EVENT_ID;
      },
      async isRegistered({ actorId, eventId }) {
        return eventId === EVENT_OPERATIONS_E2E_EVENT_ID && participants.some((value) => value.actorId === actorId);
      },
    },
    engine,
    now: () => timestamp,
    registrationService,
    repository,
  });
  const admin = await service.adminWorkspace({
    actorId: organizerActorId,
    eventId: EVENT_OPERATIONS_E2E_EVENT_ID,
  });
  assert.equal(admin.metrics.participantCount, 64);
  assert.deepEqual(
    new Set(admin.participants.map((value) => value.profileCompleteness)),
    new Set(["complete", "partial", "minimal"]),
  );
  assert.deepEqual(
    Object.fromEntries(
      ["complete", "partial", "minimal"].map((completeness) => [
        completeness,
        admin.participants.filter(
          (value) => value.profileCompleteness === completeness,
        ).length,
      ]),
    ),
    { complete: 56, minimal: 3, partial: 5 },
  );
  assert.equal(admin.participants.filter((value) => value.lateRegistration).length, 0);
  assert.equal(
    admin.participants.filter((value) => !value.lateRegistration).length,
    64,
  );
  assert.ok(admin.participants.some((value) => value.company && value.role));
  assert.ok(admin.participants.some((value) => value.languages.length >= 2));
  assert.ok(new Set(admin.participants.map((value) => value.industry).filter(Boolean)).size >= 45);

  const attendee = await service.attendeeWorkspace({
    actorId: participants[0]!.actorId,
    eventId: EVENT_OPERATIONS_E2E_EVENT_ID,
  });
  assert.equal(attendee.directory.length, 64);
  assert.equal(attendee.resultsState, "not_generated");
  assert.equal(attendee.graph, null);
  assert.equal(attendee.recommendations, null);
  assert.equal(attendee.checkInAvailable, false);
  assert.equal(aiCalls, 0);

  const generation = await service.startGeneration({
    actorId: organizerActorId,
    eventId: EVENT_OPERATIONS_E2E_EVENT_ID,
    idempotencyKey: "fixed-64-person-seed",
  });
  assert.equal(generation.snapshot.participants.length, 64);
  assert.ok(
    generation.snapshot.participants.every(
      (participant) => participant.lateRegistration === false,
    ),
  );
  assert.equal(aiCalls, 0);
});
