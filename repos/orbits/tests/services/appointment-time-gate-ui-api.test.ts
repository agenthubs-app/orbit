import assert from "node:assert/strict";
import test from "node:test";

import { appointmentCompletionGate } from "../../app/(app)/app/events/[id]/orbit-appointment-negotiation";
import { appointmentErrorResponse } from "../../app/api/appointments/handlers";
import { AppointmentError } from "../../features/appointments/contract";

const confirmed = {
  candidateId: "slot:1",
  durationMinutes: 45,
  medium: { kind: "video" },
  proposalRevision: 1,
  startsAtUtc: "2026-08-07T10:00:00.000Z",
  timezone: "Asia/Tokyo",
};

test("completion UI gate stays disabled through the meeting and enables at its end", () => {
  assert.deepEqual(appointmentCompletionGate(confirmed, Date.parse("2026-08-07T10:44:59.999Z")), { availableAtMs: Date.parse("2026-08-07T10:45:00.000Z"), enabled: false });
  assert.equal(appointmentCompletionGate(confirmed, Date.parse("2026-08-07T10:45:00.000Z")).enabled, true);
});

test("appointment API preserves the time-gated feature code instead of reporting a version conflict", async () => {
  const response = appointmentErrorResponse(new AppointmentError("APPOINTMENT_TIME_GATED", "An appointment can only be completed after its confirmed end time."));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.context.featureCode, "APPOINTMENT_TIME_GATED");
  assert.notEqual(body.error.context.featureCode, "APPOINTMENT_CONFLICT");
});
