import assert from "node:assert/strict";
import test from "node:test";

import { resolveEventRegistrationEligibility } from "../../features/events/registration/eligibility";
import type { EventRegistration } from "../../features/events/registration/contract";

const evaluatedAt = "2026-09-15T01:00:00.000Z";

function registration(status: EventRegistration["status"]): EventRegistration {
  return {
    cancelledAt: status === "cancelled" ? evaluatedAt : null,
    eventId: "event:eligibility",
    id: "event-registration:event%3Aeligibility:actor%3Aaiko",
    participantProfile: {
      answers: { targetAttendees: "产业伙伴", valueOffered: "市场经验" },
      createdAt: "2026-09-14T01:00:00.000Z",
      eventId: "event:eligibility",
      id: "event-participant-profile:event%3Aeligibility:actor%3Aaiko",
      updatedAt: evaluatedAt,
      userId: "actor:aiko",
    },
    participantProfileId:
      "event-participant-profile:event%3Aeligibility:actor%3Aaiko",
    reactivatedAt: null,
    registeredAt: "2026-09-14T01:00:00.000Z",
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt: evaluatedAt,
    userId: "actor:aiko",
  };
}

const event = {
  endsAt: "2026-09-15T04:00:00.000Z",
  startsAt: "2026-09-15T03:00:00.000Z",
  status: "confirmed" as const,
};

test("legacy eligibility is authoritative for open, registered, cancelled, cutoff, ended, and cancelled events", () => {
  const matrix: readonly {
    expected: readonly [string, readonly string[]];
    input: {
      availability: "open" | "registration_closed";
      evaluatedAt?: string;
      event?: {
        endsAt: string;
        startsAt: string;
        status: "cancelled" | "confirmed";
      };
      registration: EventRegistration | null;
    };
  }[] = [
    {
      expected: ["open", ["register"]],
      input: { availability: "open" as const, registration: null },
    },
    {
      expected: ["registered", ["update", "cancel"]],
      input: { availability: "open" as const, registration: registration("rsvped") },
    },
    {
      expected: ["registration_cancelled", ["reactivate"]],
      input: { availability: "open" as const, registration: registration("cancelled") },
    },
    {
      expected: ["registration_closed", []],
      input: { availability: "registration_closed" as const, registration: null },
    },
    {
      expected: ["event_ended", []],
      input: { availability: "open" as const, evaluatedAt: "2026-09-15T04:00:00.000Z", registration: null },
    },
    {
      expected: ["event_cancelled", []],
      input: { availability: "open" as const, event: { ...event, status: "cancelled" as const }, registration: null },
    },
  ];

  for (const row of matrix) {
    const value = resolveEventRegistrationEligibility({
      evaluatedAt: row.input.evaluatedAt ?? evaluatedAt,
      event: row.input.event ?? event,
      legacyAvailability: row.input.availability,
      registration: row.input.registration,
    });
    assert.equal(value.state, row.expected[0]);
    assert.deepEqual(value.allowedActions, row.expected[1]);
    assert.equal(value.evaluatedAt, row.input.evaluatedAt ?? evaluatedAt);
  }
});

test("a registered actor may cancel after the registration cutoff but cannot update answers", () => {
  const value = resolveEventRegistrationEligibility({
    evaluatedAt,
    event,
    legacyAvailability: "registration_closed",
    registration: registration("rsvped"),
  });

  assert.equal(value.state, "registered");
  assert.deepEqual(value.allowedActions, ["cancel"]);
});

test("admission eligibility covers not-open, full, pending, waitlisted, and admitted states", () => {
  const policy = {
    admissionMode: "instant" as const,
    capacity: 1,
    eventId: "event:eligibility",
    policyVersion: 3,
    profileEditDeadlineAt: "2026-09-15T02:30:00.000Z",
    registrationClosesAt: "2026-09-15T03:00:00.000Z",
    registrationOpensAt: "2026-09-15T00:30:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    waitlistEnabled: false,
  };
  const application = (status: "admitted" | "pending_review" | "waitlisted") => ({
    actorId: "actor:aiko",
    applicationVersion: 2,
    decidedAt: null,
    decisionActorId: null,
    eventId: "event:eligibility",
    policyVersion: 3,
    profilePayload: { answers: {} },
    status,
    submittedAt: "2026-09-15T00:45:00.000Z",
    updatedAt: evaluatedAt,
  });

  const rows = [
    {
      activeRegistrationCount: 0,
      application: null,
      at: "2026-09-15T00:00:00.000Z",
      expected: ["not_open", []],
    },
    {
      activeRegistrationCount: 1,
      application: null,
      at: evaluatedAt,
      expected: ["full", []],
    },
    {
      activeRegistrationCount: 0,
      application: application("pending_review"),
      at: evaluatedAt,
      expected: ["pending_review", ["withdraw"]],
    },
    {
      activeRegistrationCount: 1,
      application: application("waitlisted"),
      at: evaluatedAt,
      expected: ["waitlisted", ["withdraw"]],
    },
    {
      activeRegistrationCount: 1,
      application: application("admitted"),
      at: evaluatedAt,
      expected: ["registered", ["withdraw"]],
    },
  ] as const;

  for (const row of rows) {
    const value = resolveEventRegistrationEligibility({
      admission: {
        activeRegistrationCount: row.activeRegistrationCount,
        application: row.application,
        policy,
      },
      evaluatedAt: row.at,
      event,
      legacyAvailability: "open",
      registration: row.application?.status === "admitted" ? registration("rsvped") : null,
    });
    assert.equal(value.state, row.expected[0]);
    assert.deepEqual(value.allowedActions, row.expected[1]);
    assert.equal(value.applicationVersion, row.application?.applicationVersion ?? null);
    assert.equal(value.policyVersion, 3);
  }
});

test("finite admission capacity fails closed when the active count cannot be read", () => {
  const value = resolveEventRegistrationEligibility({
    admission: {
      activeRegistrationCount: null,
      application: null,
      policy: {
        admissionMode: "instant",
        capacity: 20,
        eventId: "event:eligibility",
        policyVersion: 1,
        profileEditDeadlineAt: "2026-09-15T02:30:00.000Z",
        registrationClosesAt: "2026-09-15T03:00:00.000Z",
        registrationOpensAt: "2026-09-15T00:30:00.000Z",
        updatedAt: evaluatedAt,
        waitlistEnabled: true,
      },
    },
    evaluatedAt,
    event,
    legacyAvailability: "open",
    registration: null,
  });

  assert.equal(value.state, "unavailable");
  assert.deepEqual(value.allowedActions, []);
});
