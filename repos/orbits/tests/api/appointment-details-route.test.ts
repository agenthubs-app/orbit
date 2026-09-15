import assert from "node:assert/strict";
import test from "node:test";

import { createAppointmentDetailsPatchHandler } from "../../app/api/appointments/details-handlers";
import { publicAppointment } from "../../app/api/appointments/handlers";
import { AppointmentError, type AppointmentAggregate } from "../../features/appointments/contract";

const ACTOR = "actor:a";
const OTHER = "actor:b";

function appointment(patch: Partial<AppointmentAggregate> = {}): AppointmentAggregate {
  return {
    appointmentId: "appointment:a-b",
    authorityRequestId: "request:accepted",
    confirmed: {
      candidateId: "slot:1",
      confirmedAt: "2026-09-14T00:00:00.000Z",
      confirmedByActorId: OTHER,
      durationMinutes: 45,
      medium: { kind: "in_person", location: "丸の内" },
      proposalRevision: 1,
      startsAtUtc: "2026-09-20T01:00:00.000Z",
      timezone: "Asia/Tokyo",
    },
    contactIdsByActor: { [ACTOR]: "contact:b", [OTHER]: "contact:a" },
    createdAt: "2026-09-13T00:00:00.000Z",
    createdByActorId: ACTOR,
    eventId: "event:one",
    history: [{ actorId: ACTOR, at: "2026-09-13T00:00:00.000Z", command: "created", detail: "created", proposalRevision: null, version: 1 }],
    inviteeActorId: OTHER,
    ownerActorId: ACTOR,
    pendingProposalRevision: null,
    projection: { calendar: "synced", meeting: "not_synced", revision: 1 },
    proposals: [{ candidateTimes: [{ candidateId: "slot:1", startsAtUtc: "2026-09-20T01:00:00.000Z" }], createdAt: "2026-09-13T00:01:00.000Z", durationMinutes: 45, medium: { kind: "in_person", location: "丸の内" }, note: "讨论合作范围", proposedByActorId: ACTOR, revision: 1, timezone: "Asia/Tokyo" }],
    relationshipPairId: "pair:a-b",
    reminders: { cancelled: false, currentRevision: 1 },
    status: "confirmed",
    updatedAt: "2026-09-14T00:00:00.000Z",
    version: 3,
    ...patch,
  };
}

test("public appointment exposes shared details without participant actor ids and defaults old records", () => {
  const legacy = publicAppointment(appointment(), ACTOR);
  assert.equal(legacy.details, "");
  assert.equal(legacy.detailsUpdatedAt, null);
  assert.equal(legacy.detailsUpdatedBy, null);

  const projected = publicAppointment(appointment({ details: "准备报价", detailsUpdatedAt: "2026-09-15T07:00:00.000Z", detailsUpdatedByActorId: OTHER }), ACTOR);
  assert.equal(projected.details, "准备报价");
  assert.equal(projected.detailsUpdatedBy, "other");
  assert.equal(JSON.stringify(projected).includes(OTHER), false);
});

test("appointment details PATCH validates the envelope and returns a participant-scoped receipt", async () => {
  let captured: Record<string, unknown> | null = null;
  const handler = createAppointmentDetailsPatchHandler({
    appointmentService: () => ({
      async updateDetails(input) {
        captured = input;
        return { appointment: appointment({ details: input.details.trim(), detailsUpdatedAt: "2026-09-15T07:01:00.000Z", detailsUpdatedByActorId: ACTOR, updatedAt: "2026-09-15T07:01:00.000Z", version: 4 }), replayed: false };
      },
    }),
    resolveActor: async () => ({ id: ACTOR }),
  });
  const response = await handler(new Request("https://orbit.local/api/appointments/appointment%3Aa-b/details", {
    method: "PATCH",
    headers: { "content-type": "application/json", "idempotency-key": "details-route-1" },
    body: JSON.stringify({ details: " 准备报价 ", expectedVersion: 3 }),
  }), { params: Promise.resolve({ id: "appointment:a-b" }) });
  const body = await response.json() as { data: { appointmentId: string; details: string; detailsUpdatedBy: string; replayed: boolean; version: number } };
  assert.equal(response.status, 200);
  assert.deepEqual(captured, { actorId: ACTOR, appointmentId: "appointment:a-b", details: " 准备报价 ", expectedVersion: 3, idempotencyKey: "details-route-1" });
  assert.deepEqual({ appointmentId: body.data.appointmentId, details: body.data.details, detailsUpdatedBy: body.data.detailsUpdatedBy, replayed: body.data.replayed, version: body.data.version }, { appointmentId: "appointment:a-b", details: "准备报价", detailsUpdatedBy: "you", replayed: false, version: 4 });
});

test("appointment details PATCH requires auth, valid content, storage, and current version", async () => {
  const missingAuth = createAppointmentDetailsPatchHandler({ appointmentService: () => null, resolveActor: async () => null });
  assert.equal((await missingAuth(new Request("https://orbit.local", { method: "PATCH", body: "{}" }), { params: Promise.resolve({ id: "appointment:a-b" }) })).status, 401);

  const unavailable = createAppointmentDetailsPatchHandler({ appointmentService: () => null, resolveActor: async () => ({ id: ACTOR }) });
  assert.equal((await unavailable(new Request("https://orbit.local", { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "one" }, body: JSON.stringify({ details: "x", expectedVersion: 1 }) }), { params: Promise.resolve({ id: "appointment:a-b" }) })).status, 503);

  const conflict = createAppointmentDetailsPatchHandler({
    appointmentService: () => ({ async updateDetails() { throw new AppointmentError("APPOINTMENT_CONFLICT", "stale"); } }),
    resolveActor: async () => ({ id: ACTOR }),
  });
  assert.equal((await conflict(new Request("https://orbit.local", { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "two" }, body: JSON.stringify({ details: "x", expectedVersion: 1 }) }), { params: Promise.resolve({ id: "appointment:a-b" }) })).status, 409);

  const invalid = createAppointmentDetailsPatchHandler({ appointmentService: () => ({ async updateDetails() { throw new Error("must not run"); } }), resolveActor: async () => ({ id: ACTOR }) });
  for (const [headers, body] of [
    [{ "content-type": "application/json" }, { details: "x", expectedVersion: 1 }],
    [{ "content-type": "application/json", "idempotency-key": "three" }, { details: 3, expectedVersion: 1 }],
    [{ "content-type": "application/json", "idempotency-key": "four" }, { details: "x", expectedVersion: 0 }],
    [{ "content-type": "application/json", "idempotency-key": "five" }, { details: "x".repeat(5_001), expectedVersion: 1 }],
  ] as const) {
    const response = await invalid(new Request("https://orbit.local", { method: "PATCH", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "appointment:a-b" }) });
    assert.equal(response.status, 400);
  }
});
