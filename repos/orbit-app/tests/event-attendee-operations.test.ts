import assert from "node:assert/strict";
import test from "node:test";
import { readAttendeeWorkspace, readParticipantDetail, validateExchangeReceipt, validateCheckInReceipt } from "../src/api/event-attendee-operations";
import { attendeeFixture, participantFixture } from "./helpers/attendee-operations-fixtures";

test("public HTTP workspace preserves self, directory, recommendations and two own seats", () => {
  const data = readAttendeeWorkspace(attendeeFixture(), "event_1");
  assert.equal(data.me.participantId, "p_me");
  assert.equal(data.roundOneTable?.members[0]?.seat, "A1");
  assert.equal(data.roundTwoTable?.members[0]?.seat, "B2");
});
test("workspace rejects wrong event, other self recommendations/check-in and unrelated exchanges", () => {
  for (const patch of [{ eventId: "other" }, { configuration: { ...attendeeFixture().configuration, eventId: "other" } },
    { recommendations: { ...attendeeFixture().recommendations, sourceParticipantId: "other" } },
    { checkIn: { participantId: "other", checkedInAt: "2026-09-17T12:00:00Z" } },
    { contactRequests: [{ requestId: "r", revision: 1, requesterParticipantId: "outsider", targetParticipantId: "p_other", status: "accepted", contactId: "other-private", withdrawnAt: null }] }]) {
    assert.throws(() => readAttendeeWorkspace({ ...attendeeFixture(), ...patch }, "event_1"));
  }
});
test("participant detail must match selected directory identity and request direction", () => {
  const workspace = readAttendeeWorkspace(attendeeFixture(), "event_1");
  assert.equal(readParticipantDetail(participantFixture(), workspace, "p_other").participantId, "p_other");
  assert.throws(() => readParticipantDetail(participantFixture(), workspace, "other"));
  assert.throws(() => readParticipantDetail({ ...participantFixture(), contactRequest: { contactId: "private", direction: "incoming", status: "accepted", requestId: "r", revision: 1 } }, workspace, "p_other"));
});
test("none detail cannot reopen a pair with an authoritative workspace request", () => {
  for (const status of ["awaiting_target_consent", "accepted", "declined", "withdrawn"]) {
    const workspace = readAttendeeWorkspace({ ...attendeeFixture(), contactRequests: [{ requestId: "r", revision: 2, requesterParticipantId: "p_me", targetParticipantId: "p_other", status, contactId: status === "accepted" ? "mine" : null, withdrawnAt: null }] }, "event_1");
    assert.throws(() => readParticipantDetail(participantFixture(), workspace, "p_other"));
  }
});
test("write receipts validate event, pair, request, revision and expected status", () => {
  const intent = { kind: "respond" as const, accept: true, requestId: "r", expectedRevision: 2, requesterParticipantId: "p_other", targetParticipantId: "p_me" };
  const receipt = { eventId: "event_1", requestId: "r", revision: 3, requesterParticipantId: "p_other", targetParticipantId: "p_me", status: "accepted", contactId: "my-contact", withdrawnAt: null };
  assert.equal(validateExchangeReceipt(receipt, "event_1", intent).contactId, "my-contact");
  for (const patch of [{ eventId: "other" }, { targetParticipantId: "other" }, { requestId: "other" }, { revision: 2 }, { status: "declined" }]) {
    assert.throws(() => validateExchangeReceipt({ ...receipt, ...patch }, "event_1", intent));
  }
  const checkIn = { eventId: "event_1", participantId: "p_me", actorId: "canonical-account", checkedInAt: "2026-09-17T00:00:00Z", evidenceId: "e" };
  assert.equal(validateCheckInReceipt(checkIn, "event_1", "p_me", "canonical-account").actorId, "canonical-account");
  assert.throws(() => validateCheckInReceipt({ ...checkIn, actorId: "raw-subject" }, "event_1", "p_me", "canonical-account"));
});
