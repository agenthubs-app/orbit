import assert from "node:assert/strict";
import test from "node:test";

import {
  EventAdmissionJourneyError,
  createEventAdmissionJourneyService,
} from "../../features/events/admission/journey-service";
import type { EventAdmissionApplication } from "../../features/events/admission/contract";
import type { EventAdmissionService } from "../../features/events/admission/service";
import type { EventCoreService } from "../../features/events/core/service";
import type { EventParticipantProfileField } from "../../features/events/registration/contract";
import type { EventProfileResponseSnapshot } from "../../features/events/registration/interview-response-contract";

const eventId = "event:canonical:admission-journey";
const actorId = "account:admission-applicant";

function response(
  field: EventParticipantProfileField,
  index: number,
): EventProfileResponseSnapshot {
  const displayText = `${field} answer with concrete event context ${index}`;
  return {
    answer: {
      customText: displayText,
      displayText,
      selectedOptionIds: [],
    },
    answerSource: "participant",
    answeredAt: `2026-08-05T09:0${index}:00.000Z`,
    field,
    generation: {
      method: "orbit-agent-model-adaptive",
      model: "gemini-2.5-pro",
      promptVersion: 1,
      provider: "google",
    },
    question: {
      fieldLabel: { en: field, zh: field },
      inputKind: "single_choice_with_custom",
      language: "zh",
      options: [{ id: "option-1", label: "A specific answer" }],
      prompt: `A contextual adaptive question for ${field}?`,
    },
    questionId: `question:${field}`,
    questionSource: "ai_adaptive",
    responseId: `response:${field}`,
    visibility: "event_attendees",
  };
}

const coreResponses = [
  response("positioning", 1),
  response("targetAttendees", 2),
  response("valueOffered", 3),
  response("desiredOutcome", 4),
] as const;

function application(
  overrides: Partial<EventAdmissionApplication> = {},
): EventAdmissionApplication {
  return {
    actorId,
    applicationVersion: 1,
    decidedAt: null,
    decisionActorId: null,
    eventId,
    policyVersion: 1,
    profilePayload: { answers: {} },
    status: "admitted",
    submittedAt: "2026-08-05T09:10:00.000Z",
    updatedAt: "2026-08-05T09:10:00.000Z",
    ...overrides,
  };
}

function eventCore(onRead?: (routeId: string) => void): EventCoreService {
  const published = {
    archivedAt: null,
    cancelledAt: null,
    description: "Canonical admission journey event",
    endsAt: "2026-09-01T12:00:00.000Z",
    eventId,
    eventVersion: 2,
    lifecycleState: "published" as const,
    organizerActorId: "account:organizer",
    phase: "upcoming" as const,
    publicCode: "JOURNEY01",
    sourcePayload: {},
    startsAt: "2026-09-01T10:00:00.000Z",
    timezone: "Asia/Tokyo",
    title: "Canonical admission journey",
    venue: "Tokyo",
    workspaceId: "workspace:test",
  };
  return {
    async getEvent() { return published; },
    async getPublishedEvent(routeId) {
      onRead?.(routeId);
      return routeId === "JOURNEY01" || routeId === eventId ? published : null;
    },
    async listEvents() { return [published]; },
    async listPublishedEvents() { return [published]; },
  };
}

function admissionService(input: {
  application?: EventAdmissionApplication | null;
  policyConfigured?: boolean;
  onSubmit?: (actor: string, value: unknown) => void;
  onWithdraw?: (actor: string, event: string, expectedVersion: number) => void;
} = {}): EventAdmissionService {
  return {
    async configurePolicy() { throw new Error("unused"); },
    async decideApplication() { throw new Error("unused"); },
    async getApplication() { return input.application ?? null; },
    async getApplicationForReview() { return null; },
    async getPolicy(event) {
      return input.policyConfigured
        ? {
            admissionMode: "instant",
            capacity: 10,
            eventId: event,
            policyVersion: 1,
            profileEditDeadlineAt: "2026-08-31T00:00:00.000Z",
            registrationClosesAt: "2026-08-31T00:00:00.000Z",
            registrationOpensAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            waitlistEnabled: true,
          }
        : null;
    },
    async listApplications() { throw new Error("unused"); },
    async submitApplication(actor, value) {
      input.onSubmit?.(actor, value);
      return application({
        actorId: actor,
        eventId: value.eventId,
        profilePayload: value.profilePayload,
      });
    },
    async withdrawApplication(actor, event, expectedVersion) {
      input.onWithdraw?.(actor, event, expectedVersion);
      return application({ actorId: actor, eventId: event, status: "withdrawn" });
    },
  };
}

test("journey resolves a canonical alias, verifies against the canonical id, and preserves every answered adaptive field", async () => {
  const verified = [...coreResponses, response("energyStyle", 5)];
  let submitted: unknown;
  let verification: unknown;
  const journey = createEventAdmissionJourneyService({
    admissionService: admissionService({
      onSubmit(_actor, value) { submitted = value; },
    }),
    eventCoreService: eventCore(),
    verifyResponses(input) {
      verification = input;
      return verified;
    },
  });

  const result = await journey.apply({
    actorId,
    displayName: "  森 爱子  ",
    eventReference: "JOURNEY01",
    responses: coreResponses.map((item) => ({
      answer: item.answer.displayText,
      questionToken: `signed:${item.field}`,
    })),
  });

  assert.deepEqual(verification, {
    actorId,
    eventId,
    responses: coreResponses.map((item) => ({
      answer: item.answer.displayText,
      questionToken: `signed:${item.field}`,
    })),
  });
  const payload = (submitted as { profilePayload: {
    answers: Record<string, string>;
    displayName: string;
    interviewResponses: readonly EventProfileResponseSnapshot[];
  } }).profilePayload;
  assert.equal(payload.displayName, "森 爱子");
  assert.equal(payload.interviewResponses.length, 5);
  assert.equal(payload.answers.energyStyle, verified[4]?.answer.displayText);
  assert.equal(result.status, "admitted");
});

test("journey rejects missing core fields without synthesizing an unanswered question", async () => {
  let admissionWrites = 0;
  const journey = createEventAdmissionJourneyService({
    admissionService: admissionService({
      onSubmit() { admissionWrites += 1; },
    }),
    eventCoreService: eventCore(),
    // coreResponses is [positioning, targetAttendees, valueOffered,
    // desiredOutcome]; the core set is now targetAttendees + valueOffered, so
    // stopping at two supplies one core field and withholds the other.
    verifyResponses: () => coreResponses.slice(0, 2),
  });

  await assert.rejects(
    journey.apply({
      actorId,
      eventReference: eventId,
      responses: [{ answer: "signed answer", questionToken: "signed-token" }],
    }),
    (error: unknown) =>
      error instanceof EventAdmissionJourneyError &&
      error.code === "PROFILE_INCOMPLETE" &&
      error.message.includes("valueOffered"),
  );
  assert.equal(admissionWrites, 0);
});

test("journey rejects legacy or participant-controlled profile snapshots", async () => {
  const journey = createEventAdmissionJourneyService({
    admissionService: admissionService(),
    eventCoreService: eventCore(),
    verifyResponses: () => [
      { ...coreResponses[0], generation: null, question: null, questionId: null, questionSource: "legacy_unknown" },
      ...coreResponses.slice(1),
    ],
  });

  await assert.rejects(
    journey.apply({
      actorId,
      eventReference: eventId,
      responses: [{ answer: "raw", questionToken: "not-legacy-data" }],
    }),
    (error: unknown) =>
      error instanceof EventAdmissionJourneyError &&
      error.code === "PROFILE_INVALID",
  );
});

test("journey fails before storage for missing actors or non-canonical events and withdraws by canonical id", async () => {
  let withdrawals = 0;
  const journey = createEventAdmissionJourneyService({
    admissionService: admissionService({
      onWithdraw(actor, resolvedEventId, expectedVersion) {
        withdrawals += 1;
        assert.equal(actor, actorId);
        assert.equal(resolvedEventId, eventId);
        assert.equal(expectedVersion, 1);
      },
    }),
    eventCoreService: eventCore(),
    verifyResponses: () => coreResponses,
  });

  await assert.rejects(
    journey.apply({ actorId: " ", eventReference: eventId, responses: [] }),
    (error: unknown) =>
      error instanceof EventAdmissionJourneyError &&
      error.code === "ACTOR_REQUIRED",
  );
  await assert.rejects(
    journey.withdraw({ actorId, eventReference: "missing-event", expectedApplicationVersion: 1 }),
    (error: unknown) =>
      error instanceof EventAdmissionJourneyError &&
      error.code === "CANONICAL_EVENT_NOT_FOUND",
  );
  const withdrawn = await journey.withdraw({ actorId, eventReference: "JOURNEY01", expectedApplicationVersion: 1 });
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(withdrawals, 1);
});

test("journey state distinguishes a canonical legacy path from admission-controlled state", async () => {
  const controlledApplication = application({ status: "pending_review" });
  const controlled = createEventAdmissionJourneyService({
    admissionService: admissionService({
      application: controlledApplication,
      policyConfigured: true,
    }),
    eventCoreService: eventCore(),
    verifyResponses: () => coreResponses,
  });
  const state = await controlled.getState({ actorId, eventReference: "JOURNEY01" });
  assert.equal(state.admissionControlled, true);
  assert.equal(state.eventId, eventId);
  assert.equal(state.application?.status, "pending_review");

  const legacy = createEventAdmissionJourneyService({
    admissionService: admissionService({ policyConfigured: false }),
    eventCoreService: eventCore(),
    verifyResponses: () => coreResponses,
  });
  const legacyState = await legacy.getState({ actorId, eventReference: eventId });
  assert.equal(legacyState.admissionControlled, false);
  assert.equal(legacyState.policy, null);
  assert.equal(legacyState.application, null);
});
