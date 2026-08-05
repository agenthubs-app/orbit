import assert from "node:assert/strict";
import test from "node:test";

import { createAppointmentMemoGetHandler, createAppointmentMemoPostHandler, type AppointmentMemoHandlerDependencies } from "../../app/api/appointments/memo-handlers";
import type { AppointmentAggregate } from "../../features/appointments/contract";
import type { HumanEncounterRecord, HumanEncounterService } from "../../features/encounters/service";

const ACTOR = "actor:a";
const CONTACT = "contact:b-owned-by-a";
const EVENT = "event:launch";
const COMPLETED_AT = "2026-08-05T01:31:00.000Z";

const appointment: AppointmentAggregate = {
  appointmentId: "appointment:a-b", authorityRequestId: "request:accepted",
  confirmed: { candidateId: "slot:1", confirmedAt: "2026-08-04T00:00:00.000Z", confirmedByActorId: "actor:b", durationMinutes: 30, medium: { kind: "video", provider: "google_meet", joinUrl: null }, proposalRevision: 1, startsAtUtc: "2026-08-05T01:00:00.000Z", timezone: "Asia/Tokyo" },
  contactIdsByActor: { [ACTOR]: CONTACT, "actor:b": "contact:a-owned-by-b" }, createdAt: "2026-08-04T00:00:00.000Z", createdByActorId: ACTOR, eventId: EVENT,
  history: [{ actorId: ACTOR, at: COMPLETED_AT, command: "complete", detail: "completed", proposalRevision: 1, version: 4 }], inviteeActorId: "actor:b", ownerActorId: ACTOR, pendingProposalRevision: null,
  projection: { calendar: "not_synced", meeting: "not_synced", revision: 1 }, proposals: [], relationshipPairId: "pair:a-b", reminders: { cancelled: false, currentRevision: 1 }, status: "completed", updatedAt: COMPLETED_AT, version: 4,
};

function dependencies(capture: HumanEncounterService["capture"]): AppointmentMemoHandlerDependencies {
  return {
    appointmentService: () => ({ async get() { return appointment; } }),
    encounterService: () => ({ capture }),
    resolveActor: async () => ({ id: ACTOR }),
  };
}

test("appointment memo GET validates actor-scoped contact and event", async () => {
  const capture = async () => { throw new Error("unused"); };
  const handler = createAppointmentMemoGetHandler(dependencies(capture));
  const response = await handler(new Request(`https://orbit.local/api/appointments/appointment%3Aa-b/memo?contactId=${encodeURIComponent(CONTACT)}&eventId=${encodeURIComponent(EVENT)}`), { params: Promise.resolve({ id: "appointment:a-b" }) });
  const body = await response.json() as { data: { completedAt: string; contactId: string; eventId: string } };
  assert.equal(response.status, 200);
  assert.deepEqual(body.data, { appointmentId: "appointment:a-b", completedAt: COMPLETED_AT, contactId: CONTACT, eventId: EVENT, scheduledAt: "2026-08-05T01:00:00.000Z" });

  const forged = await handler(new Request(`https://orbit.local/api/appointments/appointment%3Aa-b/memo?contactId=contact%3Aforged&eventId=${encodeURIComponent(EVENT)}`), { params: Promise.resolve({ id: "appointment:a-b" }) });
  assert.equal(forged.status, 403);
});

test("appointment memo POST ignores fabricated completion input and captures a private HumanEncounter", async () => {
  let captured: Parameters<HumanEncounterService["capture"]>[0] | null = null;
  const capture: HumanEncounterService["capture"] = async (input) => {
    captured = input;
    return {
      actorId: input.actorId, commitments: input.commitments ?? [], connectionId: null, contactId: input.contactId, createdAt: "2026-08-05T01:32:00.000Z", encounterId: "encounter:memo", eventId: input.eventId ?? null, nextStep: input.nextStep ?? "", noteText: input.noteText ?? "", observedAt: input.observedAt, privacy: "private", requestHash: "hash", projection: { attempts: 0, availableAt: "2026-08-05T01:32:00.000Z", lastError: null, leaseExpiresAt: null, leaseToken: null, status: "pending" }, talked: "yes", tags: input.tags ?? [], voiceMemoReference: null,
    } as HumanEncounterRecord;
  };
  const handler = createAppointmentMemoPostHandler(dependencies(capture));
  const response = await handler(new Request("https://orbit.local/api/appointments/appointment%3Aa-b/memo", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "memo-route-1" },
    body: JSON.stringify({ commitments: ["send deck"], contactId: CONTACT, eventId: EVENT, nextStep: "follow up", noteText: "useful meeting", observedAt: "2099-01-01T00:00:00.000Z" }),
  }), { params: Promise.resolve({ id: "appointment:a-b" }) });
  const body = await response.json() as { data: { encounterId: string; occurredAt: string } };
  assert.equal(response.status, 201);
  assert.equal(body.data.encounterId, "encounter:memo");
  assert.equal(body.data.occurredAt, COMPLETED_AT);
  assert.equal(captured?.observedAt, COMPLETED_AT);
  assert.equal(captured?.privacy, "private");
  assert.equal(captured?.talked, "yes");
});

test("appointment memo route remains actor-authenticated", async () => {
  const handler = createAppointmentMemoGetHandler({ ...dependencies(async () => { throw new Error("unused"); }), resolveActor: async () => null });
  const response = await handler(new Request(`https://orbit.local/api/appointments/appointment%3Aa-b/memo?contactId=${encodeURIComponent(CONTACT)}&eventId=${encodeURIComponent(EVENT)}`), { params: Promise.resolve({ id: "appointment:a-b" }) });
  assert.equal(response.status, 401);
});

test("appointment memo route rejects malformed content and reports unconfigured storage", async () => {
  const handler = createAppointmentMemoPostHandler(dependencies(async () => { throw new Error("unused"); }));
  const invalid = await handler(new Request("https://orbit.local/api/appointments/appointment%3Aa-b/memo", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "memo-route-invalid" },
    body: JSON.stringify({ commitments: "not-an-array", contactId: CONTACT, eventId: EVENT, noteText: 42 }),
  }), { params: Promise.resolve({ id: "appointment:a-b" }) });
  assert.equal(invalid.status, 400);

  const unavailable = createAppointmentMemoGetHandler({
    appointmentService: () => null,
    encounterService: () => null,
    resolveActor: async () => ({ id: ACTOR }),
  });
  const response = await unavailable(new Request(`https://orbit.local/api/appointments/appointment%3Aa-b/memo?contactId=${encodeURIComponent(CONTACT)}&eventId=${encodeURIComponent(EVENT)}`), { params: Promise.resolve({ id: "appointment:a-b" }) });
  assert.equal(response.status, 503);
});
