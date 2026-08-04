import assert from "node:assert/strict";
import test from "node:test";

import type { EventOperationsAiProvider } from "../../features/events/event-operations/contract";
import { createEventOperationsEngine } from "../../features/events/event-operations/engine";
import { createMemoryEventOperationsRepository } from "../../features/events/event-operations/storage/memory-repository";
import { createEventOperationsService } from "../../features/events/event-operations/service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

const eventId = "event:operations-service";
const organizerActorId = "actor:organizer";

const unusedAiProvider: EventOperationsAiProvider = {
  async generateGroupingFeatures() {
    return {
      error: { code: "AI_UNAVAILABLE", message: "not used" },
      success: false,
    };
  },
  async generateRecommendations() {
    return {
      error: { code: "AI_UNAVAILABLE", message: "not used" },
      success: false,
    };
  },
  async generateTableContent() {
    return {
      error: { code: "AI_UNAVAILABLE", message: "not used" },
      success: false,
    };
  },
};

async function createHarness() {
  let timestamp = "2026-08-02T09:15:00.000Z";
  const repository = createMemoryEventOperationsRepository({
    now: () => timestamp,
  });
  const repositoryCalls: string[] = [];
  const observedRepository = new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        repositoryCalls.push(String(property));
        return Reflect.apply(value, target, args);
      };
    },
  });
  const registrationService = createEventRegistrationService({
    now: () => "2026-08-01T06:00:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const people = [
    {
      actorId: "actor:akira",
      displayName: "Akira Mori",
      answers: {
        positioning: "Founder @ Kintsugi Robotics",
        industry: "industrial AI",
        targetAttendees: "manufacturing operators",
        valueOffered: "factory computer vision deployments",
        desiredOutcome: "find a pilot design partner",
        energyStyle: "structured, small group",
        experienceHighlight: "scaled quality inspection across 12 factories",
        followUpPreference: "ja, en",
      },
    },
    {
      actorId: "actor:mei",
      displayName: "Mei Lin",
      answers: {
        positioning: "Director @ Blue Harbor Climate",
        industry: "climate finance",
        targetAttendees: "enterprise sustainability leaders",
        valueOffered: "transition-risk underwriting models",
        desiredOutcome: "compare procurement blockers",
        energyStyle: "energetic workshop",
        experienceHighlight: "launched a cross-border climate credit fund",
        followUpPreference: "zh, en",
      },
    },
    {
      actorId: "actor:sora",
      displayName: "Sora Tanaka",
      answers: {
        positioning: "Researcher @ Independent",
        industry: "healthcare",
        desiredOutcome: "learn what evidence buyers trust",
      },
    },
  ] as const;
  for (const person of people) {
    await registrationService.register({
      answers: person.answers,
      displayName: person.displayName,
      eventId,
      userId: person.actorId,
    });
  }
  const engine = createEventOperationsEngine({
    aiProvider: unusedAiProvider,
    now: () => timestamp,
    repository,
    token: () => "lease:test",
  });
  const registeredActors = new Set(people.map((person) => person.actorId));
  type OperationsCapability =
    | "operations.read_sensitive"
    | "check_in.roster.write";
  const capabilitiesByActor = new Map<string, Set<OperationsCapability>>([
    [
      organizerActorId,
      new Set(["operations.read_sensitive", "check_in.roster.write"]),
    ],
  ]);
  const service = createEventOperationsService({
    access: {
      async requireCapability(input) {
        if (
          input.eventId !== eventId ||
          !capabilitiesByActor.get(input.actorId)?.has(input.capability)
        ) {
          throw new Error("denied");
        }
      },
      async isOrganizer(input) {
        return input.eventId === eventId && input.actorId === organizerActorId;
      },
      async isRegistered(input) {
        return input.eventId === eventId && registeredActors.has(input.actorId as never);
      },
    },
    engine,
    now: () => timestamp,
    registrationService,
    repository: observedRepository,
  });
  await service.configure({
    actorId: organizerActorId,
    configuration: {
      checkInOpensAt: "2026-08-02T09:00:00.000Z",
      eventEndsAt: "2026-08-02T12:00:00.000Z",
      eventId,
      eventStartsAt: "2026-08-02T09:30:00.000Z",
      maxAttemptsPerTask: 2,
      profileEditDeadlineAt: "2026-08-02T08:00:00.000Z",
      recommendationCount: 3,
      registrationCutoffAt: "2026-08-02T09:00:00.000Z",
      resultsAvailableAt: "2026-08-02T09:20:00.000Z",
      roundOneStartsAt: "2026-08-02T10:00:00.000Z",
      roundTwoStartsAt: "2026-08-02T11:00:00.000Z",
      shardSize: 2,
      tableSize: 4,
    },
  });
  return {
    grantAdminCapability(actorId: string) {
      const capabilities = capabilitiesByActor.get(actorId) ?? new Set();
      capabilities.add("operations.read_sensitive");
      capabilitiesByActor.set(actorId, capabilities);
    },
    grantCheckInCapability(actorId: string) {
      const capabilities = capabilitiesByActor.get(actorId) ?? new Set();
      capabilities.add("check_in.roster.write");
      capabilitiesByActor.set(actorId, capabilities);
    },
    repository,
    repositoryCallCount() {
      return repositoryCalls.length;
    },
    service,
    setTimestamp(value: string) {
      timestamp = value;
    },
  };
}

test("admin workspace enforces capability before repository reads and admits an operations delegate", async () => {
  const harness = await createHarness();
  const beforeDeniedRequest = harness.repositoryCallCount();

  await assert.rejects(
    () =>
      harness.service.adminWorkspace({
        actorId: "actor:unauthorized",
        eventId,
      }),
    /denied/u,
  );
  assert.equal(harness.repositoryCallCount(), beforeDeniedRequest);

  harness.grantAdminCapability("actor:operations-delegate");
  const workspace = await harness.service.adminWorkspace({
    actorId: "actor:operations-delegate",
    eventId,
  });
  assert.equal(workspace.metrics.participantCount, 3);
  assert.ok(harness.repositoryCallCount() > beforeDeniedRequest);
});

test("attendee workspace exposes the real registration directory and a real idempotent check-in", async () => {
  const harness = await createHarness();
  const before = await harness.service.attendeeWorkspace({
    actorId: "actor:akira",
    eventId,
  });
  assert.equal(before.directory.length, 3);
  assert.equal(before.directory[0].displayName, "Akira Mori");
  assert.equal(before.resultsState, "locked");
  assert.equal(before.checkInAvailable, true);

  const first = await harness.service.checkIn({
    actorId: "actor:akira",
    eventId,
  });
  const repeated = await harness.service.checkIn({
    actorId: "actor:akira",
    eventId,
  });
  assert.deepEqual(repeated, first);
  assert.equal(
    (await harness.service.attendeeWorkspace({ actorId: "actor:akira", eventId }))
      .checkIn?.checkedInAt,
    "2026-08-02T09:15:00.000Z",
  );

  harness.setTimestamp("2026-08-02T12:30:00.000Z");
  await assert.rejects(
    () => harness.service.checkIn({ actorId: "actor:mei", eventId }),
    /outside its configured time window/u,
  );
});

test("authorized event staff can mark one participant arrived idempotently while attendees cannot", async () => {
  const harness = await createHarness();
  const workspace = await harness.service.adminWorkspace({
    actorId: organizerActorId,
    eventId,
  });
  const mei = workspace.participants.find(
    (participant) => participant.actorId === "actor:mei",
  );
  assert.ok(mei);

  const first = await harness.service.checkInParticipant({
    actorId: organizerActorId,
    eventId,
    participantId: mei.participantId,
  });
  const replay = await harness.service.checkInParticipant({
    actorId: organizerActorId,
    eventId,
    participantId: mei.participantId,
  });
  assert.deepEqual(replay, first);
  assert.equal(first.actorId, "actor:mei");
  assert.equal(first.participantId, mei.participantId);
  assert.equal(
    (
      await harness.service.adminWorkspace({
        actorId: organizerActorId,
        eventId,
      })
    ).checkIns.filter((checkIn) => checkIn.participantId === mei.participantId)
      .length,
    1,
  );

  const beforeDeniedRequest = harness.repositoryCallCount();
  await assert.rejects(
    () =>
      harness.service.checkInParticipant({
        actorId: "actor:akira",
        eventId,
        participantId: mei.participantId,
      }),
    /denied/u,
  );
  assert.equal(harness.repositoryCallCount(), beforeDeniedRequest);

  const sora = workspace.participants.find(
    (participant) => participant.actorId === "actor:sora",
  );
  assert.ok(sora);
  harness.grantCheckInCapability("actor:check-in-staff");
  const delegated = await harness.service.checkInParticipant({
    actorId: "actor:check-in-staff",
    eventId,
    participantId: sora.participantId,
  });
  assert.equal(delegated.actorId, "actor:sora");
  assert.equal(delegated.participantId, sora.participantId);
});

test("event persona becomes read-only exactly at the configured profile deadline", async () => {
  const harness = await createHarness();
  harness.setTimestamp("2026-08-02T08:00:00.000Z");

  const workspace = await harness.service.attendeeWorkspace({
    actorId: "actor:akira",
    eventId,
  });

  assert.equal(workspace.profileEditable, false);
});

test("business-card requests are individual and create bilateral records only after target consent", async () => {
  const harness = await createHarness();
  const mei = (
    await harness.service.attendeeWorkspace({ actorId: "actor:akira", eventId })
  ).directory.find((participant) => participant.actorId === "actor:mei");
  assert.ok(mei);

  const request = await harness.service.createContactRequest({
    actorId: "actor:akira",
    eventId,
    targetParticipantId: mei.participantId,
  });
  assert.equal(request.status, "awaiting_target_consent");
  assert.equal(request.contactId, null);

  await assert.rejects(
    () =>
      harness.service.respondToContactRequest({
        accept: true,
        actorId: "actor:akira",
        eventId,
        requestId: request.requestId,
      }),
    /Only the target participant/u,
  );
  const accepted = await harness.service.respondToContactRequest({
    accept: true,
    actorId: "actor:mei",
    eventId,
    requestId: request.requestId,
  });
  assert.equal(accepted.status, "accepted");
  assert.ok(accepted.contactId);
  const requesterView = await harness.service.attendeeWorkspace({
    actorId: "actor:akira",
    eventId,
  });
  const requesterRequest = requesterView.contactRequests.find(
    (value) => value.requestId === request.requestId,
  );
  assert.ok(requesterRequest?.contactId);
  assert.notEqual(requesterRequest.contactId, accepted.contactId);
  assert.deepEqual(Object.keys(accepted).sort(), [
    "acceptedAt",
    "contactId",
    "createdAt",
    "declinedAt",
    "eventId",
    "requestId",
    "requesterParticipantId",
    "status",
    "targetParticipantId",
    "updatedAt",
  ]);
});

test("declined business-card requests never create contacts or evidence", async () => {
  const harness = await createHarness();
  const sora = (
    await harness.service.attendeeWorkspace({ actorId: "actor:akira", eventId })
  ).directory.find((participant) => participant.actorId === "actor:sora");
  assert.ok(sora);
  const request = await harness.service.createContactRequest({
    actorId: "actor:akira",
    eventId,
    targetParticipantId: sora.participantId,
  });
  const declined = await harness.service.respondToContactRequest({
    accept: false,
    actorId: "actor:sora",
    eventId,
    requestId: request.requestId,
  });
  assert.equal(declined.status, "declined");
  assert.equal(declined.contactId, null);
});

test("a published attendee directory, me profile, and contact targets stay on the immutable publication snapshot", async () => {
  const harness = await createHarness();
  const beforePublication = await harness.service.attendeeWorkspace({
    actorId: "actor:akira",
    eventId,
  });
  const immutableDirectory = beforePublication.directory.map((participant) => ({
    ...participant,
    evidenceIds: [...participant.evidenceIds],
    languages: [...participant.languages],
    needs: [...participant.needs],
    offers: [...participant.offers],
    topics: [...participant.topics],
  }));
  const published = {
    directory: immutableDirectory,
    eventId,
    generationId: "generation:immutable-directory",
    graph: { edges: [], nodes: [] },
    grouping: { roundOne: [], roundTwo: [] },
    profileEditDeadlineAt:
      beforePublication.configuration.profileEditDeadlineAt,
    publishedAt: "2026-08-02T09:10:00.000Z",
    recommendations: [],
    resultsAvailableAt: beforePublication.configuration.resultsAvailableAt,
    snapshotHash: "snapshot:immutable-directory",
  };
  harness.repository.getPublishedResult = async (requestedEventId) =>
    requestedEventId === eventId ? published : null;

  await harness.service.configure({
    actorId: organizerActorId,
    configuration: {
      checkInOpensAt: beforePublication.configuration.checkInOpensAt,
      eventEndsAt: beforePublication.configuration.eventEndsAt,
      eventId,
      eventStartsAt: beforePublication.configuration.eventStartsAt,
      maxAttemptsPerTask: beforePublication.configuration.maxAttemptsPerTask,
      profileEditDeadlineAt:
        beforePublication.configuration.profileEditDeadlineAt,
      recommendationCount: beforePublication.configuration.recommendationCount,
      registrationCutoffAt:
        beforePublication.configuration.registrationCutoffAt,
      resultsAvailableAt: "2026-08-02T09:05:00.000Z",
      roundOneStartsAt: beforePublication.configuration.roundOneStartsAt,
      roundTwoStartsAt: beforePublication.configuration.roundTwoStartsAt,
      shardSize: beforePublication.configuration.shardSize,
      tableSize: beforePublication.configuration.tableSize,
    },
  });

  await harness.repository.registerCanonicalParticipant({
    answers: { industry: "Changed after publication" },
    displayName: "Akira Changed",
    eventId,
    userId: "actor:akira",
  });
  const addedAfterPublication =
    await harness.repository.registerCanonicalParticipant({
      displayName: "New After Publication",
      eventId,
      userId: "actor:new-after-publication",
    });

  const lockedWorkspace = await harness.service.attendeeWorkspace({
    actorId: "actor:akira",
    eventId,
  });
  assert.equal(lockedWorkspace.resultsState, "locked");
  assert.deepEqual(lockedWorkspace.directory, immutableDirectory);
  assert.equal(lockedWorkspace.me.displayName, "Akira Mori");
  assert.equal(
    lockedWorkspace.directory.some(
      (participant) =>
        participant.participantId ===
        addedAfterPublication.participantProfileId,
    ),
    false,
  );
  await assert.rejects(
    harness.service.createContactRequest({
      actorId: "actor:akira",
      eventId,
      targetParticipantId: addedAfterPublication.participantProfileId,
    }),
    /must target one other registered participant/i,
  );
});
