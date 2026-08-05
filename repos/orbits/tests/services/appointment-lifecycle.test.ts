import assert from "node:assert/strict";
import test from "node:test";

import { AppointmentError } from "../../features/appointments/contract";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";

const A = "actor:aiko-founder";
const B = "actor:ren-investor";
const authorityVerifier = {
  async resolveAcceptedBilateralContact(input: { actorId: string; authorityReference: string; eventId: string | null }) {
    if ((input.actorId !== A && input.actorId !== B) || input.authorityReference !== "request:aiko-ren:accepted" || input.eventId !== "event:tokyo-ai-night") return null;
    return {
      authorityRequestId: "request:aiko-ren:accepted",
      contactIdsByActor: { [A]: "contact:ren-owned-by-aiko", [B]: "contact:aiko-owned-by-ren" },
      counterpartyActorId: input.actorId === A ? B : A,
      relationshipPairId: "relationship-pair:aiko-ren",
    };
  },
};
const times = (prefix: string, day: number) => [
  { candidateId: `${prefix}:morning`, startsAtUtc: `2026-09-${day.toString().padStart(2, "0")}T01:00:00.000Z` },
  { candidateId: `${prefix}:lunch`, startsAtUtc: `2026-09-${(day + 1).toString().padStart(2, "0")}T03:30:00.000Z` },
  { candidateId: `${prefix}:evening`, startsAtUtc: `2026-09-${(day + 2).toString().padStart(2, "0")}T09:00:00.000Z` },
];

test("appointment retains proposal history through counter, confirmation, and repeated reschedule", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ authorityVerifier, now: () => "2026-08-04T06:00:00.000Z", repository });
  const created = await service.createDraft({
    actorId: A,
    authorityReference: "request:aiko-ren:accepted",
    appointmentId: "appointment:cross-border-intro",
    eventId: "event:tokyo-ai-night",
    idempotencyKey: "create:aiko-ren",
  });
  assert.equal(created.appointment.status, "draft");
  assert.equal(created.appointment.version, 1);

  const proposed = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "propose:aiko-ren:v1",
    proposal: {
      candidateTimes: times("initial", 10),
      durationMinutes: 45,
      medium: { kind: "in_person", location: "Marunouchi Innovation Lounge" },
      note: "Compare enterprise AI distribution in Japan and Singapore.",
      timezone: "Asia/Tokyo",
    },
  });
  assert.equal(proposed.appointment.status, "awaiting_response");

  const countered = await service.command({
    actorId: B,
    appointmentId: created.appointment.appointmentId,
    command: "counter",
    expectedVersion: 2,
    idempotencyKey: "counter:aiko-ren:v2",
    proposal: {
      candidateTimes: times("counter", 14),
      durationMinutes: 60,
      medium: { kind: "video", provider: "google_meet", joinUrl: null },
      note: "Include Ren's mobility-market partner for the final 20 minutes.",
      timezone: "Asia/Tokyo",
    },
  });
  assert.equal(countered.appointment.status, "negotiating");
  const proposalReplay = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "propose:aiko-ren:v1",
    proposal: {
      candidateTimes: times("initial", 10),
      durationMinutes: 45,
      medium: { kind: "in_person", location: "Marunouchi Innovation Lounge" },
      note: "Compare enterprise AI distribution in Japan and Singapore.",
      timezone: "Asia/Tokyo",
    },
  });
  assert.equal(proposalReplay.replayed, true);
  assert.equal(proposalReplay.appointment.version, 2, "idempotency replay returns the stored response snapshot, not the later aggregate");
  await assert.rejects(() => service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "propose:aiko-ren:v1",
    proposal: { candidateTimes: times("changed", 17), durationMinutes: 30, medium: { kind: "phone", phoneHint: null }, timezone: "Asia/Tokyo" },
  }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");

  const confirmed = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    candidateId: "counter:lunch",
    command: "accept",
    expectedVersion: 3,
    idempotencyKey: "accept:aiko-ren:v2",
  });
  assert.equal(confirmed.appointment.status, "confirmed");
  assert.equal(confirmed.appointment.confirmed?.proposalRevision, 2);
  assert.equal(confirmed.appointment.projection.calendar, "pending");
  assert.equal(confirmed.appointment.projection.meeting, "pending");

  const reschedule = await service.command({
    actorId: B,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 4,
    idempotencyKey: "reschedule:aiko-ren:v3",
    proposal: {
      candidateTimes: times("reschedule", 21),
      durationMinutes: 60,
      medium: { kind: "video", provider: "google_meet", joinUrl: null },
      note: "Ren is travelling; move to the following week without dropping the confirmed slot yet.",
      timezone: "Asia/Singapore",
    },
  });
  assert.equal(reschedule.appointment.status, "reschedule_pending");
  assert.equal(reschedule.appointment.confirmed?.candidateId, "counter:lunch", "old confirmation remains canonical until mutual acceptance");

  const rescheduled = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    candidateId: "reschedule:evening",
    command: "accept",
    expectedVersion: 5,
    idempotencyKey: "accept-reschedule:aiko-ren:v3",
  });
  assert.equal(rescheduled.appointment.confirmed?.proposalRevision, 3);
  assert.equal(rescheduled.appointment.confirmed?.timezone, "Asia/Singapore");
  assert.equal(rescheduled.appointment.proposals.length, 3);
  assert.equal(rescheduled.appointment.history.length, 6);

  const replay = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    candidateId: "reschedule:evening",
    command: "accept",
    expectedVersion: 5,
    idempotencyKey: "accept-reschedule:aiko-ren:v3",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.appointment.version, 6);

  const outbox = repository.outbox();
  assert.equal(outbox.length, 16);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.proposed").length, 1);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.countered").length, 1);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.reschedule.proposed").length, 1);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.reminders.invalidate").length, 1);
  assert.equal(new Set(outbox.map((event) => event.dedupeKey)).size, outbox.length);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.reminder.t24h").length, 2);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.memo.t15m").length, 2);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.calendar.requested").length, 2);
  assert.equal(outbox.filter((event) => event.eventType === "appointment.meeting.requested").length, 2);
});

test("bilateral relationship uses distinct owner contacts while both actors share one aggregate", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ authorityVerifier, now: () => "2026-08-04T06:00:00.000Z", repository });
  const created = await service.createDraft({ actorId: A, authorityReference: "request:aiko-ren:accepted", appointmentId: "appointment:bilateral", eventId: "event:tokyo-ai-night", idempotencyKey: "create:bilateral:a" });
  assert.equal(created.appointment.contactIdsByActor[A], "contact:ren-owned-by-aiko");
  assert.equal(created.appointment.contactIdsByActor[B], "contact:aiko-owned-by-ren");
  assert.equal((await service.list({ actorId: B }))[0]?.appointmentId, created.appointment.appointmentId, "counterparty sees the same aggregate without using A's contact id");
  const proposed = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose:bilateral", proposal: { candidateTimes: times("bilateral", 12), durationMinutes: 30, medium: { kind: "video", provider: "google_meet", joinUrl: null }, timezone: "Asia/Tokyo" } });
  const accepted = await service.command({ actorId: B, appointmentId: created.appointment.appointmentId, candidateId: "bilateral:morning", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "accept:bilateral:b" });
  assert.equal(accepted.appointment.confirmed?.confirmedByActorId, B);
  await assert.rejects(() => service.createDraft({ actorId: B, authorityReference: "request:aiko-ren:accepted", appointmentId: "appointment:duplicate-from-b", eventId: "event:tokyo-ai-night", idempotencyKey: "create:bilateral:b" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
});

test("appointment rejects stale writes, invalid timezones, and proposer self-acceptance", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ authorityVerifier, now: () => "2026-08-04T06:00:00.000Z", repository });
  const created = await service.createDraft({ actorId: A, appointmentId: "appointment:guardrails", authorityReference: "request:aiko-ren:accepted", eventId: "event:tokyo-ai-night", idempotencyKey: "create:guardrails" });
  await assert.rejects(() => service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "bad-timezone",
    proposal: { candidateTimes: times("invalid", 3), durationMinutes: 30, medium: { kind: "phone", phoneHint: null }, timezone: "Tokyo-ish" },
  }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");

  const proposed = await service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "valid-proposal",
    proposal: { candidateTimes: times("valid", 5), durationMinutes: 30, medium: { kind: "phone", phoneHint: "+81 ending 1204" }, timezone: "Asia/Tokyo" },
  });
  await assert.rejects(() => service.command({ actorId: A, appointmentId: created.appointment.appointmentId, candidateId: "valid:morning", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "self-accept" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_TRANSITION");
  await assert.rejects(() => service.command({ actorId: B, appointmentId: created.appointment.appointmentId, command: "decline", expectedVersion: 1, idempotencyKey: "stale-decline" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
});

test("appointment authority and actor-scoped idempotency reject forged targets and replay probing", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ authorityVerifier, now: () => "2026-08-04T06:00:00.000Z", repository });
  await assert.rejects(() => service.createDraft({
    actorId: A,
    appointmentId: "appointment:forged",
    authorityReference: "request:not-accepted",
    eventId: "event:tokyo-ai-night",
    idempotencyKey: "shared-guessable-key",
  }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");

  const created = await service.createDraft({
    actorId: A,
    appointmentId: "appointment:actor-scoped-replay",
    authorityReference: "request:aiko-ren:accepted",
    eventId: "event:tokyo-ai-night",
    idempotencyKey: "shared-guessable-key",
  });
  await assert.rejects(() => service.command({
    actorId: "actor:outsider",
    appointmentId: created.appointment.appointmentId,
    command: "cancel",
    expectedVersion: 1,
    idempotencyKey: "shared-guessable-key",
  }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");
});

test("appointment rejects past candidates and cancellation invalidates scheduled work", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ authorityVerifier, now: () => "2026-08-04T06:00:00.000Z", repository });
  const created = await service.createDraft({ actorId: A, appointmentId: "appointment:cancel", authorityReference: "request:aiko-ren:accepted", eventId: "event:tokyo-ai-night", idempotencyKey: "create:cancel" });
  await assert.rejects(() => service.command({
    actorId: A,
    appointmentId: created.appointment.appointmentId,
    command: "propose",
    expectedVersion: 1,
    idempotencyKey: "past-proposal",
    proposal: {
      candidateTimes: [
        { startsAtUtc: "2026-08-04T05:00:00.000Z" },
        { startsAtUtc: "2026-08-04T05:15:00.000Z" },
        { startsAtUtc: "2026-08-04T05:30:00.000Z" },
      ],
      durationMinutes: 30,
      medium: { kind: "phone", phoneHint: null },
      timezone: "Asia/Tokyo",
    },
  }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");
  const proposed = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "future-proposal", proposal: { candidateTimes: times("cancel", 8), durationMinutes: 30, medium: { kind: "video", provider: "google_meet", joinUrl: null }, timezone: "Asia/Tokyo" } });
  const confirmed = await service.command({ actorId: B, appointmentId: created.appointment.appointmentId, candidateId: "cancel:morning", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "confirm-cancel" });
  const cancelled = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "cancel", expectedVersion: confirmed.appointment.version, idempotencyKey: "cancel-confirmed" });
  assert.equal(cancelled.appointment.status, "cancelled");
  const types = repository.outbox().map((event) => event.eventType);
  assert.ok(types.includes("appointment.reminders.invalidate"));
  assert.ok(types.includes("appointment.calendar.cancel"));
  assert.ok(types.includes("appointment.meeting.cancel"));
});

test("appointment completion is time-gated and proposal timestamps require RFC3339 UTC Z", async () => {
  const repository = createMemoryAppointmentRepository();
  let clock = "2026-08-04T06:00:00.000Z";
  const service = createAppointmentService({ authorityVerifier, now: () => clock, repository });
  const created = await service.createDraft({ actorId: A, authorityReference: "request:aiko-ren:accepted", appointmentId: "appointment:time-gate", eventId: "event:tokyo-ai-night", idempotencyKey: "create:time-gate" });
  await assert.rejects(() => service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "invalid-offset", proposal: { candidateTimes: [
    { startsAtUtc: "2026-09-10T10:00:00+09:00" },
    { startsAtUtc: "2026-09-11T10:00:00+09:00" },
    { startsAtUtc: "2026-09-12T10:00:00+09:00" },
  ], durationMinutes: 30, medium: { kind: "phone", phoneHint: null }, timezone: "Asia/Tokyo" } }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");
  const proposed = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "valid-time-gate", proposal: { candidateTimes: times("time-gate", 10), durationMinutes: 60, medium: { kind: "phone", phoneHint: null }, timezone: "Asia/Tokyo" } });
  const confirmed = await service.command({ actorId: B, appointmentId: created.appointment.appointmentId, candidateId: "time-gate:morning", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "accept-time-gate" });
  await assert.rejects(() => service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "complete", expectedVersion: confirmed.appointment.version, idempotencyKey: "complete-too-early" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_TIME_GATED");
  clock = "2026-09-10T02:01:00.000Z";
  const completed = await service.command({ actorId: A, appointmentId: created.appointment.appointmentId, command: "complete", expectedVersion: confirmed.appointment.version, idempotencyKey: "complete-after-end" });
  assert.equal(completed.appointment.status, "completed");
});
