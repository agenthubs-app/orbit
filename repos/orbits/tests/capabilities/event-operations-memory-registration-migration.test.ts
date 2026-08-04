import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryEventOperationsRepository } from "../../features/events/event-operations/storage/memory-repository";
import { EventRegistrationWindowError } from "../../features/events/registration/deadline-gated-service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

const now = "2026-08-04T10:00:00.000Z";
const manifest = {
  evidenceId: "operator-manifest:memory-parity",
  profileEditDeadlineAt: "2026-08-10T10:00:00.000Z",
  source: "operator_manifest" as const,
};

async function registrationFor(eventId: string, userId: string) {
  return createEventRegistrationService({
    now: () => now,
    provider: createMemoryEventRegistrationProvider(),
  }).register({
    answers: {
      desiredOutcome: "Meet an industrial pilot partner in Japan",
      industry: "Climate hardware",
      positioning: "Founder building thermal storage systems",
      targetAttendees: "Factory operators and infrastructure investors",
      valueOffered: "Pilot economics and cross-border market context",
    },
    displayName: "Mina Takahashi",
    eventId,
    userId,
  });
}

test("memory canonical migration enforces manifest evidence and keeps an immutable replay baseline", async () => {
  const eventId = "event:memory-manifest";
  const userId = "actor:memory-mina";
  const registration = await registrationFor(eventId, userId);
  const repository = createMemoryEventOperationsRepository({ now: () => now });

  await assert.rejects(
    repository.activateCanonicalRegistrations(eventId, [registration]),
    (error: unknown) =>
      error instanceof EventRegistrationWindowError &&
      error.code === "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
  );
  await assert.rejects(
    repository.activateCanonicalRegistrations(eventId, [registration], {
      ...manifest,
      evidenceId: "",
    }),
    (error: unknown) =>
      error instanceof EventRegistrationWindowError &&
      error.code === "EVENT_REGISTRATION_WINDOW_INVALID",
  );

  const baseline = await repository.activateCanonicalRegistrations(
    eventId,
    [registration],
    manifest,
  );
  assert.deepEqual(
    await repository.listCatalogueSummaries([eventId]),
    [],
    "manifest activation without explicit lifecycle knowledge stays hidden",
  );
  await repository.saveConfiguration({
    checkInOpensAt: "2026-08-04T09:00:00.000Z",
    eventEndsAt: "2026-08-04T14:00:00.000Z",
    eventId,
    eventStartsAt: "2026-08-04T11:00:00.000Z",
    maxAttemptsPerTask: 3,
    organizerActorId: "actor:memory-organizer",
    profileEditDeadlineAt: "2026-08-04T10:30:00.000Z",
    recommendationCount: 4,
    registrationCutoffAt: "2026-08-04T10:45:00.000Z",
    resultsAvailableAt: "2026-08-04T10:50:00.000Z",
    roundOneStartsAt: "2026-08-04T11:30:00.000Z",
    roundTwoStartsAt: "2026-08-04T12:30:00.000Z",
    shardSize: 6,
    tableSize: 6,
    updatedAt: now,
  });
  await repository.registerCanonicalParticipant({
    answers: {
      ...registration.participantProfile.answers,
      desiredOutcome: "Updated canonical profile after migration",
    },
    displayName: "Mina Takahashi",
    eventId,
    userId,
  });
  await repository.cancelCanonicalRegistration({ eventId, userId });
  assert.deepEqual(
    await repository.activateCanonicalRegistrations(eventId, []),
    baseline,
    "normal canonical mutations must not rewrite the migration baseline",
  );
});

test("memory catalogue exposes explicit published zero and legacy configured compatibility only", async () => {
  const explicitPublishedEventId = "event:memory-published-zero";
  const repository = createMemoryEventOperationsRepository({
    now: () => now,
    publishedEventIds: [explicitPublishedEventId],
  });
  await repository.activateCanonicalRegistrations(
    explicitPublishedEventId,
    [],
    manifest,
  );
  assert.deepEqual(
    await repository.listCatalogueSummaries([explicitPublishedEventId]),
    [
      {
        activeRegistrationCount: 0,
        attendeeResultsAvailable: false,
        eventId: explicitPublishedEventId,
        hasPublishedResults: false,
      },
    ],
  );

  const legacyConfiguredEventId = "event:memory-legacy-configured";
  await repository.saveConfiguration({
    checkInOpensAt: "2026-08-04T09:00:00.000Z",
    eventEndsAt: "2026-08-04T14:00:00.000Z",
    eventId: legacyConfiguredEventId,
    eventStartsAt: "2026-08-04T11:00:00.000Z",
    maxAttemptsPerTask: 3,
    organizerActorId: "actor:memory-organizer",
    profileEditDeadlineAt: "2026-08-04T10:30:00.000Z",
    recommendationCount: 4,
    registrationCutoffAt: "2026-08-04T10:45:00.000Z",
    resultsAvailableAt: "2026-08-04T10:50:00.000Z",
    roundOneStartsAt: "2026-08-04T11:30:00.000Z",
    roundTwoStartsAt: "2026-08-04T12:30:00.000Z",
    shardSize: 6,
    tableSize: 6,
    updatedAt: now,
  });
  await repository.activateCanonicalRegistrations(
    legacyConfiguredEventId,
    [],
  );
  assert.deepEqual(
    await repository.listCatalogueSummaries([legacyConfiguredEventId]),
    [
      {
        activeRegistrationCount: 0,
        attendeeResultsAvailable: false,
        eventId: legacyConfiguredEventId,
        hasPublishedResults: false,
      },
    ],
  );
});
