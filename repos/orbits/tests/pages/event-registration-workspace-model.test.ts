import assert from "node:assert/strict";
import test from "node:test";

import {
  answersFromTranscript,
  isStatusCardApplication,
  matchesAdmissionApplicationReceipt,
  registrationFieldLabel,
  transcriptFromAnswers,
} from "../../app/(app)/app/events/[id]/register/registration-workspace-model";

test("transcript ↔ answers round-trip drops blank answers", () => {
  const transcript = transcriptFromAnswers({ industry: "AI", positioning: "  ", valueOffered: "intro" } as never);
  assert.deepEqual(transcript, [
    { answer: "AI", field: "industry", prompt: "industry" },
    { answer: "intro", field: "valueOffered", prompt: "valueOffered" },
  ]);
  assert.deepEqual(answersFromTranscript(transcript), { industry: "AI", valueOffered: "intro" });
});

test("field labels are bilingual", () => {
  assert.equal(registrationFieldLabel("en", "industry"), "Industry");
  assert.equal(registrationFieldLabel("zh", "industry"), "行业");
});

test("admission receipt must match actor, event, version and status", () => {
  const expectation = { actorId: "a1", eventId: "e1" };
  const receipt = { actorId: "a1", applicationVersion: 2, eventId: "e1", status: "pending_review" };
  assert.equal(matchesAdmissionApplicationReceipt(receipt, expectation), true);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, actorId: "other" }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, applicationVersion: 0 }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, status: "bogus" }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt(receipt, { ...expectation, applicationVersion: 3 }), false);
  assert.equal(matchesAdmissionApplicationReceipt(receipt, { ...expectation, status: "pending_review" }), true);
  assert.equal(matchesAdmissionApplicationReceipt([], expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt(null, expectation), false);
});

test("status card shows only non-admitted application states", () => {
  const base = { actorId: "a1", applicationVersion: 1, eventId: "e1" };
  for (const status of ["pending_review", "rejected", "waitlisted", "withdrawn"]) {
    assert.equal(isStatusCardApplication({ ...base, status } as never), true, status);
  }
  assert.equal(isStatusCardApplication({ ...base, status: "admitted" } as never), false);
  assert.equal(isStatusCardApplication(null), false);
});
