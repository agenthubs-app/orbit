import assert from "node:assert/strict";
import test from "node:test";
import { createMeetingProposalClient, MeetingProposalError, prepareMeetingProposal } from "../../app/(app)/app/orbit-2026/calendar/meeting-proposal-client";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { publicAppointment } from "../../app/api/appointments/handlers";

const now = Date.parse("2030-04-01T00:00:00Z");
const candidates = [2, 3, 4].map(day => ({ startsAt: `2030-04-0${day}T09:00:00Z`, endsAt: `2030-04-0${day}T09:30:00Z` }));
const medium = { kind: "in_person" as const, location: "Room 1" };
async function fixture() {
  const repository = createMemoryAppointmentRepository();
  const service = createAppointmentService({ repository, now: () => new Date(now).toISOString(), authorityVerifier: { resolveAcceptedBilateralContact: async () => ({ authorityRequestId: "accepted", contactIdsByActor: { a: "contact-b", b: "contact-a" }, counterpartyActorId: "b", relationshipPairId: "pair" }) } });
  const created = await service.createDraft({ actorId: "a", appointmentId: "meeting:1", authorityReference: "accepted", eventId: "event", idempotencyKey: "create" });
  const proposed = await service.command({ actorId: "a", appointmentId: created.appointment.appointmentId, command: "propose", expectedVersion: 1, idempotencyKey: "propose", proposal: { candidateTimes: candidates.map(value => ({ startsAtUtc: value.startsAt })), durationMinutes: 30, medium, timezone: "UTC" } });
  await service.command({ actorId: "b", appointmentId: created.appointment.appointmentId, command: "accept", expectedVersion: 2, idempotencyKey: "accept", candidateId: proposed.appointment.proposals[0]!.candidateTimes[0]!.candidateId });
  return { service, repository };
}

test("meeting proposal rejects malformed, too-near, overlapping, mismatched-duration and unsafe-medium candidates before any POST", () => {
  assert.equal(prepareMeetingProposal(candidates, medium, "UTC", now)?.durationMinutes, 30);
  for (const values of [candidates.slice(0, 2), [...candidates, ...candidates], [{ startsAt: "2030-02-30T00:00:00Z", endsAt: "2030-03-02T01:00:00Z" }, ...candidates.slice(1)], [{ startsAt: "2030-04-01T00:15:00Z", endsAt: "2030-04-01T00:45:00Z" }, ...candidates.slice(1)], [candidates[0]!, candidates[0]!, candidates[2]!], [{ ...candidates[0]!, endsAt: "2030-04-02T09:45:00Z" }, ...candidates.slice(1)]]) assert.equal(prepareMeetingProposal(values, medium, "UTC", now), null);
  assert.equal(prepareMeetingProposal(candidates, { kind: "video", provider: "other", joinUrl: "https://user:secret@example.com" }, "UTC", now), null);
  assert.equal(prepareMeetingProposal(candidates, medium, "No/Zone", now), null);
});

test("Web reschedule invokes native propose and independently reads the pending proposal while retaining the original confirmed slot", async () => {
  const { service, repository } = await fixture(); const requests: { url: string; method: string; key: string | null }[] = [];
  const client = createMeetingProposalClient({ now: () => now, fetch: async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", key: new Headers(init?.headers).get("idempotency-key") });
    assert.equal(init?.cache, "no-store");
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); assert.equal(body.command, "propose"); const result = await service.command({ ...body, actorId: "a", appointmentId: "meeting:1", idempotencyKey: requests.at(-1)!.key! }); return Response.json({ success: true, data: { ...publicAppointment(result.appointment, "a"), replayed: result.replayed } }); }
    return Response.json({ success: true, data: publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a") });
  } });
  const baseline = await client.get("meeting:1", "contact-b");
  const moved = candidates.map(value => ({ startsAt: value.startsAt.replace("09:", "11:"), endsAt: value.endsAt.replace("09:", "11:") }));
  const receipt = await client.propose(baseline, moved, medium, "UTC");
  assert.equal(receipt.status, "reschedule_pending");
  assert.deepEqual(receipt.confirmed, baseline.confirmed);
  assert.equal(receipt.version, baseline.version + 1);
  assert.deepEqual(requests.map(value => value.method), ["GET", "POST", "GET"]);
  assert.ok(requests.every(value => value.url.startsWith("/api/appointments/meeting%3A1")));
  assert.equal(repository.outbox().filter(event => event.eventType === "appointment.reschedule.proposed").length, 1);
  assert.equal(repository.outbox().filter(event => event.eventType === "appointment.rescheduled").length, 0);
});

test("ambiguous transport retry reuses the command key without duplicating the native proposal", async () => {
  const { service } = await fixture(); let lost = true; const keys: string[] = [];
  const client = createMeetingProposalClient({ now: () => now, fetch: async (_url, init) => {
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); const key = new Headers(init.headers).get("idempotency-key")!; keys.push(key); const result = await service.command({ ...body, actorId: "a", appointmentId: "meeting:1", idempotencyKey: key }); if (lost) { lost = false; throw Error("NETWORK_LOST_AFTER_COMMIT"); } return Response.json({ success: true, data: { ...publicAppointment(result.appointment, "a"), replayed: result.replayed } }); }
    return Response.json({ success: true, data: publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a") });
  } });
  const baseline = await client.get("meeting:1", "contact-b");
  await assert.rejects(client.propose(baseline, candidates, medium, "UTC"));
  const result = await client.propose(baseline, candidates, medium, "UTC");
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal(result.proposals.length, 2);
});

test("wrong contact, dishonest receipt or readback, denial and aborted scope never confirm a proposal", async () => {
  const { service } = await fixture(); const baseline = publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a");
  const wrongContact = createMeetingProposalClient({ fetch: async () => Response.json({ success: true, data: baseline }) });
  await assert.rejects(wrongContact.get("meeting:1", "other"));
  const denied = createMeetingProposalClient({ fetch: async () => Response.json({ success: false }, { status: 403 }) });
  await assert.rejects(denied.get("meeting:1", "contact-b"), error => error instanceof MeetingProposalError && error.code === "denied");
  let raw: any = baseline;
  const client = createMeetingProposalClient({ now: () => now, fetch: async (_url, init) => {
    if (init?.method === "POST") return Response.json({ success: true, data: { ...raw, status: "reschedule_pending", version: 4, pendingProposalRevision: 2, replayed: false } });
    return Response.json({ success: true, data: raw });
  } });
  const meeting = await client.get("meeting:1", "contact-b");
  await assert.rejects(client.propose(meeting, candidates, medium, "UTC"));
  raw = { ...baseline, proposals: [...baseline.proposals, { ...baseline.proposals[0], revision: 2 }], confirmed: { ...baseline.confirmed!, durationMinutes: 60 } };
  await assert.rejects(client.propose(meeting, candidates, medium, "UTC"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.get("meeting:1", "contact-b", controller.signal));
});

test("cancel uses the native command and confirmed readback, not schedule-item deletion", async () => {
  const { service, repository } = await fixture(); const commands: unknown[] = [];
  const client = createMeetingProposalClient({ fetch: async (url, init) => {
    assert.ok(String(url).startsWith("/api/appointments/meeting%3A1"));
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); commands.push(body); const result = await service.command({ ...body, actorId: "a", appointmentId: "meeting:1", idempotencyKey: new Headers(init.headers).get("idempotency-key")! }); return Response.json({ success: true, data: { ...publicAppointment(result.appointment, "a"), replayed: result.replayed } }); }
    return Response.json({ success: true, data: publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a") });
  } });
  const baseline = await client.get("meeting:1", "contact-b"), receipt = await client.cancel(baseline);
  assert.deepEqual(commands, [{ command: "cancel", expectedVersion: 3 }]);
  assert.equal(receipt.status, "cancelled"); assert.deepEqual(receipt.confirmed, baseline.confirmed);
  assert.equal(repository.outbox().filter(event => event.eventType === "appointment.cancelled").length, 1);
});

test("aborting an in-flight read cannot return a private meeting to the prior scope", async () => {
  const { service } = await fixture(); const raw = publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a");
  let resolve!: (response: Response) => void;
  const client = createMeetingProposalClient({ fetch: async () => new Promise<Response>(done => { resolve = done; }) });
  const controller = new AbortController(), result = client.get("meeting:1", "contact-b", controller.signal);
  controller.abort(); resolve(Response.json({ success: true, data: raw }));
  await assert.rejects(result);
});

test("a wrong selected slot or independently changed readback is not a confirmed proposal", async () => {
  for (const tamper of ["candidate", "readback"] as const) {
    const { service } = await fixture();
    let posted = false;
    const client = createMeetingProposalClient({ now: () => now, fetch: async (_url, init) => {
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); const result = await service.command({ ...body, actorId: "a", appointmentId: "meeting:1", idempotencyKey: new Headers(init.headers).get("idempotency-key")! }); const raw = publicAppointment(result.appointment, "a"); posted = true; if (tamper === "candidate") raw.proposals.at(-1)!.candidateTimes = raw.proposals.at(-1)!.candidateTimes.map((value, index) => index ? value : { ...value, startsAtUtc: "2030-04-05T09:00:00Z" }); return Response.json({ success: true, data: { ...raw, replayed: result.replayed } }); }
      const raw = publicAppointment(await service.get({ actorId: "a", appointmentId: "meeting:1" }), "a");
      return Response.json({ success: true, data: posted && tamper === "readback" ? { ...raw, version: 99 } : raw });
    } });
    await assert.rejects(client.propose(await client.get("meeting:1", "contact-b"), candidates, medium, "UTC"), error => error instanceof MeetingProposalError && error.code === "unconfirmed");
  }
});
