import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentError, type AppointmentProposalInput } from "../../features/appointments/contract";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";

const proposal: AppointmentProposalInput = { candidateTimes: [20, 21, 22].map(day => ({ startsAtUtc: `2026-10-${day}T01:00:00.000Z` })), durationMinutes: 60,
  medium: { kind: "in_person", location: "Meeting room" }, timezone: "Asia/Tokyo", note: "Compare plans" };
const input = { actorId: "a", authorityReference: "accepted", eventId: "event", idempotencyKey: "first-proposal" };
const authorityVerifier = { async resolveAcceptedBilateralContact(value: { actorId: string; authorityReference: string; eventId: string | null }) {
  return value.actorId === "a" && value.authorityReference === "accepted" && value.eventId === "event"
    ? { authorityRequestId: "accepted", contactIdsByActor: { a: "contact-b", b: "contact-a" }, counterpartyActorId: "b", relationshipPairId: "pair" } : null;
} };

test("initial proposal atomically stores the native first-proposal state and one recipient outbox event", async () => {
  const repository = createMemoryAppointmentRepository(), service = createAppointmentService({ repository, authorityVerifier, now: () => "2026-10-18T00:00:00.000Z" });
  const result = await service.createDraft({ ...input, initialProposal: proposal });
  assert.equal(result.appointment.status, "awaiting_response");
  assert.equal(result.appointment.version, 2); assert.equal(result.appointment.pendingProposalRevision, 1);
  assert.equal(result.appointment.confirmed, null);
  assert.equal(result.appointment.proposals[0].candidateTimes.length, 3);
  assert.deepEqual(result.appointment.history.map(entry => entry.command), ["created", "propose"]);
  assert.deepEqual(await repository.getForActor(result.appointment.appointmentId, "b"), result.appointment);
  assert.equal(repository.outbox().length, 1);
  assert.equal(repository.outbox()[0].eventType, "appointment.proposed");
  assert.deepEqual(repository.outbox()[0].payload.notificationRecipientActorIds, ["b"]);
});

test("invalid initial candidates or unaccepted authority create no draft, receipt or outbox", async () => {
  const repository = createMemoryAppointmentRepository(), service = createAppointmentService({ repository, authorityVerifier, now: () => "2026-10-18T00:00:00.000Z" });
  for (const candidateTimes of [proposal.candidateTimes.slice(0, 2), [...proposal.candidateTimes, ...proposal.candidateTimes], [{ startsAtUtc: "2026-10-18T00:01:00.000Z" }, ...proposal.candidateTimes.slice(1)]]) {
    await assert.rejects(service.createDraft({ ...input, initialProposal: { ...proposal, candidateTimes } }), error => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");
    assert.equal((await repository.listForActor("a")).length, 0); assert.equal(repository.outbox().length, 0);
  }
  await assert.rejects(service.createDraft({ ...input, authorityReference: "owned-contact-is-not-consent", initialProposal: proposal }), error => error instanceof AppointmentError && error.code === "APPOINTMENT_FORBIDDEN");
  assert.equal((await repository.listForActor("a")).length, 0);
  assert.equal((await service.createDraft({ ...input, initialProposal: proposal })).appointment.status, "awaiting_response", "invalid submissions did not consume the idempotency key");
});

test("initial proposal replay retains its exact native receipt after time advances and rejects body changes", async () => {
  let now = "2026-10-18T00:00:00.000Z";
  const repository = createMemoryAppointmentRepository(), service = createAppointmentService({ repository, authorityVerifier, now: () => now });
  const first = await service.createDraft({ ...input, initialProposal: proposal });
  now = "2026-10-30T00:00:00.000Z";
  const replay = await service.createDraft({ ...input, initialProposal: proposal });
  assert.equal(replay.replayed, true); assert.deepEqual(replay.appointment, first.appointment);
  assert.equal(repository.outbox().length, 1);
  await assert.rejects(service.createDraft({ ...input, initialProposal: { ...proposal, note: "different" } }), error => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
});
