import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentError } from "../../features/appointments/contract";
import { createAppointmentContactAuthorityReader } from "../../features/appointments/contact-authority";

const authority = { authorityRequestId: "accepted", contactIdsByActor: { a: "contact-b", b: "contact-a" }, counterpartyActorId: "b", relationshipPairId: "pair" };
const context = { eventId: "event", authorityReference: "accepted" };

test("contact lookup returns only an exact accepted bilateral native authority verified for the actor", async () => {
  const seen: unknown[] = [];
  const reader = createAppointmentContactAuthorityReader({ workspaceId: "w", client: { async query(_sql, values) { seen.push(values); return { rows: [context] }; } },
    verify: async input => { seen.push(input); return authority; } });
  assert.deepEqual(await reader.read("a", "contact-b"), context);
  assert.deepEqual(seen, [["w", "a", "contact-b"], { actorId: "a", eventId: "event", requestId: "accepted" }]);
});

test("missing or ambiguous accepted contexts never choose another contact or arbitrary event", async () => {
  for (const rows of [[], [context, { eventId: "another", authorityReference: "another" }]]) {
    const reader = createAppointmentContactAuthorityReader({ workspaceId: "w", client: { async query() { return { rows }; } }, verify: async () => { throw Error("MUST_NOT_VERIFY_UNSELECTED_AUTHORITY"); } });
    if (!rows.length) assert.equal(await reader.read("a", "contact-b"), null);
    else await assert.rejects(reader.read("a", "contact-b"), error => error instanceof AppointmentError && error.code === "APPOINTMENT_CONFLICT");
  }
});

test("owned-contact aliases cannot replace native bilateral consent or its matching canonical contact", async () => {
  for (const proof of [null, { ...authority, contactIdsByActor: { a: "wrong", b: "contact-a" } }, { ...authority, counterpartyActorId: "a" }, { ...authority, contactIdsByActor: { a: "contact-b" } }, { ...authority, contactIdsByActor: { ...authority.contactIdsByActor, c: "unrelated-contact" } }]) {
    const reader = createAppointmentContactAuthorityReader({ workspaceId: "w", client: { async query() { return { rows: [context] }; } }, verify: async () => proof });
    assert.equal(await reader.read("a", "contact-b"), null);
  }
});

test("invalid actor/contact inputs are rejected before reading relationship authority", async () => {
  const reader = createAppointmentContactAuthorityReader({ workspaceId: "w", client: { async query() { throw Error("MUST_NOT_QUERY"); } }, verify: async () => null });
  for (const [actor, contact] of [["", "c"], ["a", " leading"], ["a", "x".repeat(257)], ["a\0b", "c"]]) {
    await assert.rejects(reader.read(actor, contact), error => error instanceof AppointmentError && error.code === "APPOINTMENT_INVALID_PROPOSAL");
  }
});
