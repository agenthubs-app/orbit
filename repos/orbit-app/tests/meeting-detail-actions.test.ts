import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import type { MeetingDetailsContract } from "../src/api/contract/appointments";
import { cancelConfirmedAppointment } from "../src/screens/calendar/meeting-detail-actions";

const meeting: MeetingDetailsContract = {
  appointmentId: "appointment:one", contactId: "contact:one", eventId: "event:one", title: "Meeting", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
  confirmed: { durationMinutes: 30, medium: { kind: "in_person", location: "Tokyo" }, startsAtUtc: "2026-10-20T01:00:00.000Z", timezone: "Asia/Tokyo" },
  proposals: [{ createdAt: "2026-10-15T00:00:00.000Z", durationMinutes: 30, medium: { kind: "in_person", location: "Tokyo" }, note: "", proposedBy: "you", revision: 1, timezone: "Asia/Tokyo" }],
  status: "confirmed", updatedAt: "2026-10-15T00:00:00.000Z", version: 4, visibility: "participants",
};

test("cancel posts the existing confirmed appointment command with CAS and accepts only its verified receipt", async () => {
  const requests: { path: string; method: string; key: string | null; body: unknown }[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async (input, init) => {
    requests.push({ path: new URL(String(input)).pathname, method: init?.method ?? "GET", key: new Headers(init?.headers).get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return Response.json({ success: true, data: { ...meeting, status: "cancelled", version: 5, replayed: false } });
  } });
  const result = await cancelConfirmedAppointment(client, meeting, "ios:cancel:key-1");
  assert.equal(result.status, "cancelled");
  assert.deepEqual(requests, [{ path: "/api/appointments/appointment%3Aone/commands", method: "POST", key: "ios:cancel:key-1", body: { command: "cancel", expectedVersion: 4 } }]);
});

test("cancel fails closed for non-confirmed or mismatched receipts and preserves conflict separately", async () => {
  let calls = 0;
  const client = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async () => {
    calls++;
    return Response.json({ success: true, data: { ...meeting, appointmentId: "appointment:other", status: "cancelled", version: 5, replayed: false } });
  } });
  assert.equal((await cancelConfirmedAppointment(client, { ...meeting, status: "reschedule_pending" }, "ios:cancel:key-2")).status, "invalid");
  assert.equal((await cancelConfirmedAppointment(client, { ...meeting, contactId: null }, "ios:cancel:key-2")).status, "invalid");
  assert.equal(calls, 0);
  assert.equal((await cancelConfirmedAppointment(client, meeting, "ios:cancel:key-2")).status, "unconfirmed");
  const conflictClient = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async () => Response.json({ success: false, error: { code: "CONFLICT", message: "Changed" } }, { status: 409 }) });
  assert.equal((await cancelConfirmedAppointment(conflictClient, meeting, "ios:cancel:key-2")).status, "conflict");
});

test("cancel forwards the active screen abort signal to the appointment command", async () => {
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  const client = createOrbitApiClient({ baseUrl: "https://orbit.example", fetchImpl: async (_input, init) => {
    received = init?.signal;
    return Response.json({ success: true, data: { ...meeting, status: "cancelled", version: 5, replayed: false } });
  } });
  await cancelConfirmedAppointment(client, meeting, "ios:cancel:key-3", controller.signal);
  assert.equal(received, controller.signal);
});
