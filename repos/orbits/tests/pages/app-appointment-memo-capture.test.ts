import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../../app/(app)/app/contacts/[id]/page.tsx", import.meta.url), "utf8");
const formSource = readFileSync(new URL("../../app/(app)/app/contacts/[id]/appointment-memo-capture.tsx", import.meta.url), "utf8");
const appointmentSource = readFileSync(new URL("../../app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx", import.meta.url), "utf8");

test("contact detail consumes and validates meeting memo appointment/event query context", () => {
  assert.match(pageSource, /capture === "meeting-memo"/);
  assert.match(pageSource, /query\.appointmentId/);
  assert.match(pageSource, /query\.eventId/);
  assert.match(pageSource, /invalidMemoRequest/);
  assert.match(pageSource, /AppointmentMemoCapture/);
});

test("contact detail distinguishes an appointment response deep link from meeting memo capture", () => {
  assert.match(pageSource, /appointmentQueryPresent/);
  assert.match(pageSource, /appointmentRequested/);
  assert.match(pageSource, /OrbitAppointmentNegotiation/);
  assert.match(pageSource, /appointmentId=\{appointmentId\}/);
  assert.match(pageSource, /eventId=\{eventId\}/);
});

test("meeting memo browser form saves real encounter content without a client completion time", () => {
  assert.match(formSource, /data-appointment-memo-capture/);
  assert.match(formSource, /\/api\/appointments\/\$\{encodeURIComponent\(entry\.appointmentId\)\}\/memo/);
  assert.match(formSource, /noteText/);
  assert.match(formSource, /nextStep/);
  assert.match(formSource, /commitments/);
  assert.doesNotMatch(formSource, /observedAt/);
  assert.doesNotMatch(formSource, /completedAt:\s*Date/);
});

test("completed appointment memo link carries appointment, contact route, and event authority", () => {
  assert.match(appointmentSource, /capture=meeting-memo&appointmentId=/);
  assert.match(appointmentSource, /&eventId=\$\{encodeURIComponent\(eventId\)\}/);
});
