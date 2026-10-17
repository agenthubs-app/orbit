import assert from "node:assert/strict";
import test from "node:test";
import { createAppointmentInitialProposalHandlers } from "../../app/api/appointments/initial-proposal-handlers";
import { createMemoryAppointmentRepository } from "../../features/appointments/memory-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { publicAppointment } from "../../app/api/appointments/handlers";

const proposal = { candidateTimes: [20, 21, 22].map(day => ({ startsAtUtc: `2026-10-${day}T01:00:00.000Z` })), durationMinutes: 60, medium: { kind: "in_person" as const, location: "Meeting room" }, timezone: "Asia/Tokyo", note: "Compare plans" };
const request = (body: unknown = { contactId: "contact-b", proposal }, key = "initial-key", query = "") => new Request(`https://orbit.local/api/appointments/initial-proposal${query}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });

function setup() {
  const repository = createMemoryAppointmentRepository(), lookups: unknown[] = [];
  const service = createAppointmentService({ repository, now: () => "2026-10-18T00:00:00.000Z", authorityVerifier: { async resolveAcceptedBilateralContact(input) {
    return input.actorId === "a" && input.eventId === "event" && input.authorityReference === "accepted" ? { authorityRequestId: "accepted", contactIdsByActor: { a: "contact-b", b: "contact-a" }, counterpartyActorId: "b", relationshipPairId: "pair" } : null;
  } } });
  const dependencies = { resolveActor: async () => ({ id: "a", workspaceId: "w" }), boundary: (workspaceId: string) => {
    assert.equal(workspaceId, "w");
    return { service, contactAuthority: { async read(actorId: string, contactId: string) { lookups.push([actorId, contactId]); return contactId === "contact-b" ? { eventId: "event", authorityReference: "accepted" } : null; } } };
  } };
  return { repository, service, lookups, dependencies, ...createAppointmentInitialProposalHandlers(dependencies) };
}

test("first proposal HTTP resolves server authority, atomically returns native receipt and replays without duplicate outbox", async () => {
  const fixture = setup();
  const response = await fixture.POST(request());
  assert.equal(response.status, 201); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const { data } = await response.json();
  assert.equal(data.status, "awaiting_response"); assert.equal(data.version, 2); assert.equal(data.pendingProposalRevision, 1); assert.equal(data.replayed, false);
  assert.equal(data.contactId, "contact-b"); assert.equal(data.proposals[0].candidateTimes.length, 3);
  const readback = publicAppointment(await fixture.service.get({ actorId: "a", appointmentId: data.appointmentId }), "a");
  assert.deepEqual(data, { ...JSON.parse(JSON.stringify(readback)), replayed: false });
  assert.equal((await fixture.POST(request())).status, 200);
  assert.equal(fixture.repository.outbox().length, 1); assert.deepEqual(fixture.lookups, [["a", "contact-b"], ["a", "contact-b"]]);
  assert.equal((await fixture.POST(request({ contactId: "contact-b", proposal: { ...proposal, note: "Changed" } }))).status, 409);
});

test("first-proposal availability is a read-only scoped boolean and contact ownership alone is not authority", async () => {
  const fixture = setup();
  for (const [contactId, available] of [["contact-b", true], ["imported-only", false]] as const) {
    const response = await fixture.GET(new Request(`https://orbit.local/api/appointments/initial-proposal?contactId=${contactId}`));
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, { contactId, available });
  }
  assert.equal((await fixture.service.list({ actorId: "a" })).length, 0); assert.equal(fixture.repository.outbox().length, 0);
  assert.equal((await fixture.POST(request({ contactId: "imported-only", proposal }))).status, 403);
  assert.equal(fixture.repository.outbox().length, 0);
});

test("initial proposal keeps explicit nullable phone/video fields and does not loosen runtime validation", async () => {
  for (const medium of [{ kind: "phone", phoneHint: null }, { kind: "video", provider: "other", joinUrl: null }]) {
    const fixture = setup();
    const response = await fixture.POST(request({ contactId: "contact-b", proposal: { ...proposal, medium } }));
    assert.equal(response.status, 201); assert.deepEqual((await response.json()).data.proposals[0].medium, medium);
  }
  for (const medium of [{ kind: "phone" }, { kind: "video", provider: "other" }]) {
    const fixture = setup();
    assert.equal((await fixture.POST(request({ contactId: "contact-b", proposal: { ...proposal, medium } }))).status, 400);
    assert.equal(fixture.lookups.length, 0);
  }
});

test("initial proposal rejects identity injection, unknown fields, invalid candidates and missing auth before private writes", async () => {
  const fixture = setup();
  for (const body of [null, { contactId: "contact-b", proposal, actorId: "b" }, { contactId: "contact-b", proposal, eventId: "other" }, { contactId: ".", proposal }, { contactId: "contact-b", proposal: { ...proposal, candidateTimes: proposal.candidateTimes.slice(0, 2) } }, { contactId: "contact-b", proposal: { ...proposal, surprise: true } }]) assert.equal((await fixture.POST(request(body))).status, 400);
  // Fetch Headers trims edge whitespace before the handler; embedded whitespace remains invalid.
  for (const key of ["", "key space", "x".repeat(97)]) assert.equal((await fixture.POST(request(undefined, key))).status, 400);
  assert.equal((await fixture.POST(request(undefined, "one", "?actorId=b"))).status, 400);
  assert.equal(fixture.lookups.length, 0); assert.equal(fixture.repository.outbox().length, 0);
  const missing = createAppointmentInitialProposalHandlers({ ...fixture.dependencies, resolveActor: async () => null });
  assert.equal((await missing.POST(request())).status, 401);
  const noWorkspace = createAppointmentInitialProposalHandlers({ ...fixture.dependencies, resolveActor: async () => ({ id: "a" }) });
  assert.equal((await noWorkspace.POST(request())).status, 503);
});

test("availability rejects caller scope and private backend errors do not leak", async () => {
  const fixture = setup();
  for (const query of ["", "?contactId=contact-b&actorId=b", "?contactId=contact-b&contactId=other", "?contactId=..", "?contactId=contact-b&workspaceId=elsewhere"]) assert.equal((await fixture.GET(new Request(`https://orbit.local/api/appointments/initial-proposal${query}`))).status, 400);
  const unavailable = createAppointmentInitialProposalHandlers({ ...fixture.dependencies, boundary: () => { throw Error("PRIVATE SQL contact-b credentials"); } });
  const response = await unavailable.POST(request());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE|SQL|credentials|contact-b/);
});
