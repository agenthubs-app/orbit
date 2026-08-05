import assert from "node:assert/strict";
import test from "node:test";

import { AppointmentError, type AppointmentAggregate } from "../../features/appointments/contract";
import { createAppointmentMemoService } from "../../features/appointments/memo-service";
import type { HumanEncounterRecord, HumanEncounterService } from "../../features/encounters/service";

const ACTOR = "actor:a";
const CONTACT = "contact:b-owned-by-a";
const EVENT = "event:launch";

function aggregate(status: AppointmentAggregate["status"] = "completed"): AppointmentAggregate {
  return {
    appointmentId: "appointment:a-b",
    authorityRequestId: "request:accepted",
    confirmed: { candidateId: "slot:1", confirmedAt: "2026-08-04T00:00:00.000Z", confirmedByActorId: "actor:b", durationMinutes: 30, medium: { kind: "video", provider: "google_meet", joinUrl: null }, proposalRevision: 1, startsAtUtc: "2026-08-05T01:00:00.000Z", timezone: "Asia/Tokyo" },
    contactIdsByActor: { [ACTOR]: CONTACT, "actor:b": "contact:a-owned-by-b" },
    createdAt: "2026-08-04T00:00:00.000Z",
    createdByActorId: ACTOR,
    eventId: EVENT,
    history: [
      { actorId: ACTOR, at: "2026-08-04T00:00:00.000Z", command: "created", detail: "created", proposalRevision: null, version: 1 },
      ...(status === "completed" ? [{ actorId: ACTOR, at: "2026-08-05T01:31:00.000Z", command: "complete" as const, detail: "completed", proposalRevision: 1, version: 4 }] : []),
    ],
    inviteeActorId: "actor:b",
    ownerActorId: ACTOR,
    pendingProposalRevision: null,
    projection: { calendar: "not_synced", meeting: "not_synced", revision: 1 },
    proposals: [],
    relationshipPairId: "pair:a-b",
    reminders: { cancelled: false, currentRevision: 1 },
    status,
    updatedAt: "2026-08-05T01:31:00.000Z",
    version: 4,
  };
}

test("appointment memo derives encounter time from persisted completion history", async () => {
  let captured: Parameters<HumanEncounterService["capture"]>[0] | null = null;
  const service = createAppointmentMemoService({
    appointments: { async get() { return aggregate(); } },
    encounters: { async capture(input) {
      captured = input;
      return { ...input, actorId: input.actorId, commitments: input.commitments ?? [], connectionId: null, createdAt: "2026-08-05T01:32:00.000Z", encounterId: "encounter:memo", eventId: input.eventId ?? null, nextStep: input.nextStep ?? "", noteText: input.noteText ?? "", observedAt: input.observedAt, privacy: "private", requestHash: "hash", projection: { attempts: 0, availableAt: "2026-08-05T01:32:00.000Z", lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" }, talked: "yes", tags: input.tags ?? [], voiceMemoReference: null } as HumanEncounterRecord;
    } },
  });
  const record = await service.capture({ actorId: ACTOR, appointmentId: "appointment:a-b", commitments: ["send deck"], contactId: CONTACT, eventId: EVENT, idempotencyKey: "memo-1", nextStep: "follow up", noteText: "useful meeting" });
  assert.equal(captured?.observedAt, "2026-08-05T01:31:00.000Z");
  assert.equal(captured?.privacy, "private");
  assert.equal(captured?.contactId, CONTACT);
  assert.equal(captured?.eventId, EVENT);
  assert.deepEqual(captured?.tags, ["appointment-memo"]);
  assert.equal(record.encounterId, "encounter:memo");
});

test("appointment memo fails closed for mismatched contact/event or incomplete appointment", async () => {
  const service = createAppointmentMemoService({
    appointments: { async get() { return aggregate(); } },
    encounters: { async capture() { throw new Error("must not capture"); } },
  });
  await assert.rejects(() => service.getEntry({ actorId: ACTOR, appointmentId: "appointment:a-b", contactId: "contact:forged", eventId: EVENT }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");
  await assert.rejects(() => service.getEntry({ actorId: ACTOR, appointmentId: "appointment:a-b", contactId: CONTACT, eventId: "event:forged" }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");

  const incomplete = createAppointmentMemoService({
    appointments: { async get() { return aggregate("confirmed"); } },
    encounters: { async capture() { throw new Error("must not capture"); } },
  });
  await assert.rejects(() => incomplete.getEntry({ actorId: ACTOR, appointmentId: "appointment:a-b", contactId: CONTACT, eventId: EVENT }), (error: unknown) => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_TRANSITION");
});
