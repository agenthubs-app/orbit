import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeadlineGatedEventRegistrationService,
  EventRegistrationWindowError,
  type EventRegistrationWindow,
} from "../../features/events/registration/deadline-gated-service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

function windowFor(
  eventId: string,
  overrides: Partial<EventRegistrationWindow> = {},
): EventRegistrationWindow {
  return {
    eventId,
    profileEditDeadlineAt: "2026-08-03T10:00:00.000Z",
    registrationCutoffAt: "2026-08-03T11:00:00.000Z",
    ...overrides,
  };
}

function serviceAt(input: {
  now: string;
  windows: ReadonlyMap<string, EventRegistrationWindow>;
}) {
  const baseService = createEventRegistrationService({
    now: () => input.now,
    provider: createMemoryEventRegistrationProvider(),
  });
  return {
    baseService,
    service: createDeadlineGatedEventRegistrationService({
      baseService,
      windowProvider: {
        async getEnrollment(eventId) {
          const window = input.windows.get(eventId);
          return window
            ? {
                state: "enrolled" as const,
                statementTimestamp: input.now,
                window,
              }
            : { state: "enrolled_misconfigured" as const };
        },
      },
    }),
  };
}

async function assertWindowError(
  action: () => Promise<unknown>,
  code: EventRegistrationWindowError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof EventRegistrationWindowError);
    assert.equal(error.code, code);
    return true;
  });
}

test("event profile answers are writable before but not at the profile deadline", async () => {
  const before = serviceAt({
    now: "2026-08-03T09:59:59.999Z",
    windows: new Map([["event:before", windowFor("event:before")]]),
  });
  const registered = await before.service.register({
    answers: {
      desiredOutcome: "Find a robotics manufacturing partner in Kansai",
      positioning: "Building warehouse perception systems",
    },
    eventId: "event:before",
    userId: "actor:before",
  });
  assert.equal(
    registered.participantProfile.answers.desiredOutcome,
    "Find a robotics manufacturing partner in Kansai",
  );

  const boundary = serviceAt({
    now: "2026-08-03T10:00:00.000Z",
    windows: new Map([["event:boundary", windowFor("event:boundary")]]),
  });
  await assertWindowError(
    () =>
      boundary.service.register({
        answers: {
          desiredOutcome: "Meet a cross-border healthcare compliance lead",
        },
        eventId: "event:boundary",
        userId: "actor:boundary",
      }),
    "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  );
});

test("an existing event profile cannot change after its event-specific deadline", async () => {
  let now = "2026-08-03T09:30:00.000Z";
  const baseService = createEventRegistrationService({
    now: () => now,
    provider: createMemoryEventRegistrationProvider(),
  });
  const service = createDeadlineGatedEventRegistrationService({
    baseService,
    windowProvider: {
      async getEnrollment(eventId) {
        return {
          state: "enrolled" as const,
          statementTimestamp: now,
          window: windowFor(eventId),
        };
      },
    },
  });
  const original = await service.register({
    answers: {
      industry: "Circular materials",
      valueOffered: "Pilot access across three Japanese factories",
    },
    displayName: "Mina Okafor",
    eventId: "event:frozen",
    userId: "actor:mina",
  });

  now = "2026-08-03T10:00:00.000Z";
  await assertWindowError(
    () =>
      service.register({
        answers: {
          industry: "Circular materials",
          valueOffered: "A changed offer after the frozen deadline",
        },
        displayName: "Mina Okafor",
        eventId: "event:frozen",
        userId: "actor:mina",
      }),
    "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  );
  const unchanged = await baseService.get({
    eventId: "event:frozen",
    userId: "actor:mina",
  });
  assert.deepEqual(unchanged, original);

  const idempotent = await service.register({
    answers: original.participantProfile.answers,
    displayName: "Mina Okafor",
    eventId: "event:frozen",
    userId: "actor:mina",
  });
  assert.deepEqual(idempotent, original);
});

test("profile deadlines are isolated per event for the same participant", async () => {
  const { service } = serviceAt({
    now: "2026-08-03T10:30:00.000Z",
    windows: new Map([
      ["event:closed", windowFor("event:closed")],
      [
        "event:open",
        windowFor("event:open", {
          profileEditDeadlineAt: "2026-08-03T10:45:00.000Z",
          registrationCutoffAt: "2026-08-03T11:30:00.000Z",
        }),
      ],
    ]),
  });
  await assertWindowError(
    () =>
      service.register({
        answers: { positioning: "Climate fintech operator" },
        eventId: "event:closed",
        userId: "actor:same-person",
      }),
    "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  );
  const open = await service.register({
    answers: { positioning: "Climate fintech operator" },
    eventId: "event:open",
    userId: "actor:same-person",
  });
  assert.equal(open.eventId, "event:open");
});

test("a late first RSVP may create only an anonymous empty profile shell before registration cutoff", async () => {
  const { service } = serviceAt({
    now: "2026-08-03T10:30:00.000Z",
    windows: new Map([["event:late", windowFor("event:late")]]),
  });

  await assertWindowError(
    () =>
      service.register({
        answers: {
          desiredOutcome: "This late answer must never enter final matching",
        },
        eventId: "event:late",
        userId: "actor:late-with-answer",
      }),
    "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  );

  await assertWindowError(
    () =>
      service.register({
        answers: {},
        displayName: "A display name is also event profile data",
        eventId: "event:late",
        userId: "actor:late-with-display-name",
      }),
    "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  );

  const late = await service.register({
    answers: {},
    eventId: "event:late",
    userId: "actor:late-empty",
  });
  assert.equal(late.registeredAt, "2026-08-03T10:30:00.000Z");
  assert.deepEqual(late.participantProfile.answers, {});
  assert.equal(late.status, "rsvped");
});

test("registration writes close after cutoff while an active idempotent replay stays read-only", async () => {
  let now = "2026-08-03T09:00:00.000Z";
  const baseService = createEventRegistrationService({
    now: () => now,
    provider: createMemoryEventRegistrationProvider(),
  });
  const service = createDeadlineGatedEventRegistrationService({
    baseService,
    windowProvider: {
      async getEnrollment(eventId) {
        return {
          state: "enrolled" as const,
          statementTimestamp: now,
          window: windowFor(eventId),
        };
      },
    },
  });
  const original = await service.register({
    answers: { energyStyle: "Thoughtful one-to-one conversations" },
    eventId: "event:cutoff",
    userId: "actor:active",
  });

  now = "2026-08-03T11:00:00.000Z";
  await assertWindowError(
    () =>
      service.register({
        answers: {},
        eventId: "event:cutoff",
        userId: "actor:new-after-cutoff",
      }),
    "EVENT_REGISTRATION_CUTOFF_PASSED",
  );
  const replay = await service.register({
    answers: original.participantProfile.answers,
    eventId: "event:cutoff",
    userId: "actor:active",
  });
  assert.deepEqual(replay, original);
});

test("missing event operations configuration fails closed without a fallback window", async () => {
  const { service } = serviceAt({
    now: "2026-08-03T09:00:00.000Z",
    windows: new Map(),
  });
  await assertWindowError(
    () =>
      service.register({
        answers: {},
        eventId: "event:unconfigured",
        userId: "actor:unconfigured",
      }),
    "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
  );
});

test("a legacy event without explicit event-operations enrollment keeps its existing registration path", async () => {
  const baseService = createEventRegistrationService({
    now: () => "2026-08-03T10:30:00.000Z",
    provider: createMemoryEventRegistrationProvider(),
  });
  const service = createDeadlineGatedEventRegistrationService({
    baseService,
    windowProvider: {
      async getEnrollment() {
        return { state: "legacy_unenrolled" as const };
      },
    },
  });
  const registration = await service.register({
    answers: {
      desiredOutcome: "Preserve an existing legacy registration route",
      positioning: "Legacy event participant",
    },
    displayName: "Legacy Participant",
    eventId: "event:legacy-unenrolled",
    userId: "actor:legacy",
  });
  assert.equal(registration.status, "rsvped");
  assert.equal(
    registration.participantProfile.answers.positioning,
    "Legacy event participant",
  );
});
