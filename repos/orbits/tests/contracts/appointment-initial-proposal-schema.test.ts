import assert from "node:assert/strict";
import test from "node:test";
import { meetingInitialProposalAvailabilitySchema, meetingInitialProposalRequestSchema } from "../../shared/api-schema/appointment-initial-proposal";

const input = { contactId: "contact:b", proposal: { candidateTimes: [20, 21, 22].map(day => ({ startsAtUtc: `2026-10-${day}T01:00:00.000Z` })), durationMinutes: 60, medium: { kind: "phone", phoneHint: null }, note: "", timezone: "Asia/Tokyo" } };
test("initial proposal shared schema preserves native three-to-five candidates and rejects caller authority", () => {
  assert.deepEqual(meetingInitialProposalRequestSchema.parse(input), input);
  for (const invalid of [{ ...input, actorId: "forged" }, { ...input, eventContactRequestId: "forged" }, { ...input, proposal: { ...input.proposal, candidateTimes: input.proposal.candidateTimes.slice(0, 2) } }, { ...input, proposal: { ...input.proposal, medium: { kind: "phone", phoneHint: null, actorId: "forged" } } }]) assert.equal(meetingInitialProposalRequestSchema.safeParse(invalid).success, false);
  assert.deepEqual(meetingInitialProposalAvailabilitySchema.parse({ contactId: "contact:b", available: false }), { contactId: "contact:b", available: false });
});
