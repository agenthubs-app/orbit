import assert from "node:assert/strict";
import test from "node:test";

import { AppointmentError } from "../../features/appointments/contract";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";

const OWNER = "actor:owner";
const INVITEE = "actor:invitee";

function createService() {
  const repository = createMemoryAppointmentRepository();
  let clock = "2026-09-15T07:00:00.000Z";
  const service = createAppointmentService({
    authorityVerifier: {
      async resolveAcceptedBilateralContact() {
        return {
          authorityRequestId: "request:accepted",
          contactIdsByActor: {
            [OWNER]: "contact:invitee-owned-by-owner",
            [INVITEE]: "contact:owner-owned-by-invitee",
          },
          counterpartyActorId: INVITEE,
          relationshipPairId: "pair:owner-invitee",
        };
      },
    },
    now: () => clock,
    repository,
  });
  return {
    repository,
    service,
    setClock(value: string) { clock = value; },
  };
}

test("appointment participants share versioned details without changing schedule projections", async () => {
  const { repository, service, setClock } = createService();
  const created = await service.createDraft({
    actorId: OWNER,
    appointmentId: "appointment:details",
    authorityReference: "request:accepted",
    eventId: "event:details",
    idempotencyKey: "create-details",
  });
  const before = created.appointment;

  setClock("2026-09-15T07:01:00.000Z");
  const updated = await service.updateDetails({
    actorId: OWNER,
    appointmentId: before.appointmentId,
    details: "  带上新版报价单\r\n确认下一步负责人  ",
    expectedVersion: before.version,
    idempotencyKey: "details-v1",
  });

  assert.equal(updated.replayed, false);
  assert.equal(updated.appointment.details, "带上新版报价单\n确认下一步负责人");
  assert.equal(updated.appointment.detailsUpdatedAt, "2026-09-15T07:01:00.000Z");
  assert.equal(updated.appointment.detailsUpdatedByActorId, OWNER);
  assert.equal(updated.appointment.version, before.version + 1);
  assert.deepEqual(updated.appointment.confirmed, before.confirmed);
  assert.deepEqual(updated.appointment.projection, before.projection);
  assert.deepEqual(updated.appointment.reminders, before.reminders);
  assert.equal(updated.appointment.status, before.status);
  assert.equal(repository.outbox().length, 0);
  assert.equal((await service.get({ actorId: INVITEE, appointmentId: before.appointmentId })).details, "带上新版报价单\n确认下一步负责人");
  assert.equal(updated.appointment.history.at(-1)?.command, "details_updated");

  const replay = await service.updateDetails({
    actorId: OWNER,
    appointmentId: before.appointmentId,
    details: "  带上新版报价单\r\n确认下一步负责人  ",
    expectedVersion: before.version,
    idempotencyKey: "details-v1",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.appointment.version, updated.appointment.version);
  assert.equal(repository.outbox().length, 0);
});

test("appointment details reject foreign actors, stale versions, reused keys, and oversized content", async () => {
  const { service } = createService();
  const created = await service.createDraft({ actorId: OWNER, appointmentId: "appointment:guards", authorityReference: "request:accepted", eventId: null, idempotencyKey: "create-guards" });
  const saved = await service.updateDetails({ actorId: INVITEE, appointmentId: created.appointment.appointmentId, details: "双方可见", expectedVersion: 1, idempotencyKey: "details-guards" });

  await assert.rejects(() => service.updateDetails({ actorId: "actor:outside", appointmentId: created.appointment.appointmentId, details: "越权", expectedVersion: saved.appointment.version, idempotencyKey: "outside" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");
  await assert.rejects(() => service.updateDetails({ actorId: OWNER, appointmentId: created.appointment.appointmentId, details: "过期覆盖", expectedVersion: 1, idempotencyKey: "stale" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
  await assert.rejects(() => service.updateDetails({ actorId: INVITEE, appointmentId: created.appointment.appointmentId, details: "不同请求", expectedVersion: 1, idempotencyKey: "details-guards" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
  await assert.rejects(() => service.updateDetails({ actorId: OWNER, appointmentId: created.appointment.appointmentId, details: "x".repeat(5_001), expectedVersion: saved.appointment.version, idempotencyKey: "too-long" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");
});

test("appointment details can be cleared by the other participant", async () => {
  const { service } = createService();
  const created = await service.createDraft({ actorId: OWNER, appointmentId: "appointment:clear", authorityReference: "request:accepted", eventId: null, idempotencyKey: "create-clear" });
  const first = await service.updateDetails({ actorId: OWNER, appointmentId: created.appointment.appointmentId, details: "准备材料", expectedVersion: 1, idempotencyKey: "details-first" });
  const cleared = await service.updateDetails({ actorId: INVITEE, appointmentId: created.appointment.appointmentId, details: "   ", expectedVersion: first.appointment.version, idempotencyKey: "details-clear" });
  assert.equal(cleared.appointment.details, "");
  assert.equal(cleared.appointment.detailsUpdatedByActorId, INVITEE);
  assert.equal((await service.get({ actorId: OWNER, appointmentId: created.appointment.appointmentId })).details, "");
});
