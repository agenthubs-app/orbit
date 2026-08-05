import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";

const ACTOR_A = "actor:a";
const ACTOR_B = "actor:b";
const CONTACT_A = "contact:b-owned-by-a";
const CONTACT_B = "contact:a-owned-by-b";

const proposal = (prefix: string) => ({
  candidateTimes: [1, 2, 3].map((day) => ({ candidateId: `${prefix}:${day}`, startsAtUtc: `2026-09-0${day}T01:00:00.000Z` })),
  durationMinutes: 30,
  medium: { kind: "video" as const, provider: "google_meet" as const, joinUrl: null },
  timezone: "Asia/Tokyo",
});

test("appointment actions enqueue one actor-scoped notification for the other participant", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({
    authorityVerifier: {
      async resolveAcceptedBilateralContact() {
        return {
          authorityRequestId: "request:accepted",
          contactIdsByActor: { [ACTOR_A]: CONTACT_A, [ACTOR_B]: CONTACT_B },
          counterpartyActorId: ACTOR_B,
          relationshipPairId: "pair:a-b",
        };
      },
    },
    now: () => "2026-08-05T00:00:00.000Z",
    repository,
  });
  const created = await service.createDraft({ actorId: ACTOR_A, appointmentId: "appointment:a-b", authorityReference: "request:accepted", eventId: "event:launch", idempotencyKey: "create" });

  const proposed = await service.command({ actorId: ACTOR_A, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose", proposal: proposal("first") });
  let event = repository.outbox().at(-1)!;
  assert.equal(event.eventType, "appointment.proposed");
  assert.deepEqual(event.payload.notificationRecipientActorIds, [ACTOR_B]);
  assert.deepEqual(event.payload.contactIdsByActor, { [ACTOR_A]: CONTACT_A, [ACTOR_B]: CONTACT_B });
  assert.equal(event.payload.eventId, "event:launch");

  const countered = await service.command({ actorId: ACTOR_B, appointmentId: created.appointment.appointmentId, command: "counter", expectedVersion: proposed.appointment.version, idempotencyKey: "counter", proposal: proposal("counter") });
  event = repository.outbox().at(-1)!;
  assert.equal(event.eventType, "appointment.countered");
  assert.deepEqual(event.payload.notificationRecipientActorIds, [ACTOR_A]);

  const accepted = await service.command({ actorId: ACTOR_A, appointmentId: created.appointment.appointmentId, candidateId: "counter:1", command: "accept", expectedVersion: countered.appointment.version, idempotencyKey: "accept" });
  const confirmation = repository.outbox().find((value) => value.eventType === "appointment.confirmed")!;
  assert.deepEqual(confirmation.payload.notificationRecipientActorIds, [ACTOR_B]);

  const reschedule = await service.command({ actorId: ACTOR_B, appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: accepted.appointment.version, idempotencyKey: "reschedule", proposal: proposal("moved") });
  event = repository.outbox().at(-1)!;
  assert.equal(event.eventType, "appointment.reschedule.proposed");
  assert.deepEqual(event.payload.notificationRecipientActorIds, [ACTOR_A]);

  const rescheduled = await service.command({ actorId: ACTOR_A, appointmentId: created.appointment.appointmentId, candidateId: "moved:1", command: "accept", expectedVersion: reschedule.appointment.version, idempotencyKey: "accept-reschedule" });
  const rescheduledEvent = repository.outbox().filter((value) => value.eventType === "appointment.rescheduled").at(-1)!;
  assert.deepEqual(rescheduledEvent.payload.notificationRecipientActorIds, [ACTOR_B]);

  await service.command({ actorId: ACTOR_B, appointmentId: created.appointment.appointmentId, command: "cancel", expectedVersion: rescheduled.appointment.version, idempotencyKey: "cancel" });
  const cancelled = repository.outbox().filter((value) => value.eventType === "appointment.cancelled").at(-1)!;
  assert.deepEqual(cancelled.payload.notificationRecipientActorIds, [ACTOR_A]);
});

test("cancelling an unconfirmed proposal still notifies the other participant", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({
    authorityVerifier: { async resolveAcceptedBilateralContact() { return { authorityRequestId: "request:accepted", contactIdsByActor: { [ACTOR_A]: CONTACT_A, [ACTOR_B]: CONTACT_B }, counterpartyActorId: ACTOR_B, relationshipPairId: "pair:a-b" }; } },
    now: () => "2026-08-05T00:00:00.000Z",
    repository,
  });
  const created = await service.createDraft({ actorId: ACTOR_A, appointmentId: "appointment:draft-cancel", authorityReference: "request:accepted", eventId: "event:launch", idempotencyKey: "create-draft-cancel" });
  const cancelled = await service.command({ actorId: ACTOR_A, appointmentId: created.appointment.appointmentId, command: "cancel", expectedVersion: 1, idempotencyKey: "cancel-draft" });
  assert.deepEqual(cancelled.appointment.reminders, { cancelled: true, currentRevision: null });
  const event = repository.outbox().at(-1)!;
  assert.equal(event.eventType, "appointment.cancelled");
  assert.equal(event.payload.revision, 0);
  assert.deepEqual(event.payload.notificationRecipientActorIds, [ACTOR_B]);
});

test("declining an initial or reschedule proposal notifies the proposal author only", async () => {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({
    authorityVerifier: { async resolveAcceptedBilateralContact() { return { authorityRequestId: "request:accepted", contactIdsByActor: { [ACTOR_A]: CONTACT_A, [ACTOR_B]: CONTACT_B }, counterpartyActorId: ACTOR_B, relationshipPairId: "pair:a-b" }; } },
    now: () => "2026-08-05T00:00:00.000Z",
    repository,
  });

  const initialDraft = await service.createDraft({ actorId: ACTOR_A, appointmentId: "appointment:decline", authorityReference: "request:accepted", eventId: "event:launch", idempotencyKey: "create-decline" });
  const initialProposal = await service.command({ actorId: ACTOR_A, appointmentId: initialDraft.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose-decline", proposal: proposal("decline") });
  await service.command({ actorId: ACTOR_B, appointmentId: initialDraft.appointment.appointmentId, command: "decline", expectedVersion: initialProposal.appointment.version, idempotencyKey: "decline-initial" });
  const declined = repository.outbox().at(-1)!;
  assert.equal(declined.eventType, "appointment.declined");
  assert.deepEqual(declined.payload.notificationRecipientActorIds, [ACTOR_A]);

  const confirmedDraft = await service.createDraft({ actorId: ACTOR_A, appointmentId: "appointment:reschedule-decline", authorityReference: "request:accepted", eventId: "event:launch", idempotencyKey: "create-reschedule-decline" });
  const proposed = await service.command({ actorId: ACTOR_A, appointmentId: confirmedDraft.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose-reschedule-decline", proposal: proposal("confirmed") });
  const accepted = await service.command({ actorId: ACTOR_B, appointmentId: confirmedDraft.appointment.appointmentId, candidateId: "confirmed:1", command: "accept", expectedVersion: proposed.appointment.version, idempotencyKey: "accept-before-reschedule" });
  const reschedule = await service.command({ actorId: ACTOR_B, appointmentId: confirmedDraft.appointment.appointmentId, command: "propose", expectedVersion: accepted.appointment.version, idempotencyKey: "propose-reschedule", proposal: proposal("reschedule") });
  const result = await service.command({ actorId: ACTOR_A, appointmentId: confirmedDraft.appointment.appointmentId, command: "decline", expectedVersion: reschedule.appointment.version, idempotencyKey: "decline-reschedule" });
  const rescheduleDeclined = repository.outbox().at(-1)!;
  assert.equal(result.appointment.status, "confirmed");
  assert.equal(result.appointment.confirmed?.proposalRevision, 1);
  assert.equal(rescheduleDeclined.eventType, "appointment.reschedule.declined");
  assert.deepEqual(rescheduleDeclined.payload.notificationRecipientActorIds, [ACTOR_B]);
});
