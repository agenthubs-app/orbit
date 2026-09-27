import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import { captureLiveEncounter, findLiveAppointment, proposeLiveAppointment } from "../src/api/event-live-actions";

// In-memory stand-in for the documented /api/encounters and /api/appointments HTTP
// contracts (orbits app/api/encounters/route.ts, app/api/appointments/handlers.ts):
// idempotency-key required, one active appointment per exchange (409 APPOINTMENT_CONFLICT),
// optimistic version on commands, receipts echo the stored record.
function liveServer() {
  const requests: { method: string; path: string; body: any; key: string | null; cookie: string | null }[] = [];
  const encounters = new Map<string, any>();
  const appointments: any[] = [];
  const behaviour = { encounterStatus: 201, receiptPatch: null as Record<string, unknown> | null, network: false, acceptedRequests: new Set(["req_ok"]) };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fail = (status: number, code: string, message: string, featureCode?: string) => json(status, { success: false, error: { code, message, ...(featureCode ? { context: { featureCode } } : {}) } });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers); const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const key = headers.get("idempotency-key");
    requests.push({ method, path: url.pathname, body, key, cookie: headers.get("Cookie") });
    if (behaviour.network) throw new TypeError("Network request failed");
    if (url.pathname === "/api/encounters" && method === "POST") {
      if (behaviour.encounterStatus !== 201) return fail(behaviour.encounterStatus, "VALIDATION_ERROR", "talked, privacy, contactId, and observedAt are required.");
      if (!body.contactId || body.talked !== "yes" || body.privacy !== "private" || !body.observedAt) return fail(400, "VALIDATION_ERROR", "bad");
      const existing = key ? encounters.get(key) : null;
      const record = existing ?? { encounterId: `enc_${encounters.size + 1}`, contactId: body.contactId, eventId: body.eventId, noteText: body.noteText, nextStep: body.nextStep, tags: body.tags };
      if (key) encounters.set(key, record);
      return json(201, { success: true, data: { ...record, ...(behaviour.receiptPatch ?? {}) } });
    }
    if (url.pathname === "/api/appointments" && method === "GET") return json(200, { success: true, data: appointments });
    if (url.pathname === "/api/appointments" && method === "POST") {
      if (!key) return fail(400, "VALIDATION_ERROR", "Idempotency-Key header is required.");
      if (!behaviour.acceptedRequests.has(body.eventContactRequestId)) return fail(400, "VALIDATION_ERROR", "Only an accepted event contact request can start an appointment.", "APPOINTMENT_INVALID_AUTHORITY");
      if (appointments.some(a => a.authorityRequestId === body.eventContactRequestId && !["cancelled", "completed"].includes(a.status))) return fail(409, "CONFLICT", "An appointment is already in progress.", "APPOINTMENT_CONFLICT");
      const created = { appointmentId: `apt_${appointments.length + 1}`, authorityRequestId: body.eventContactRequestId, contactId: "contact_1", eventId: body.eventId, status: "draft", version: 1, confirmed: null, proposals: [] };
      appointments.push(created); return json(201, { success: true, data: created });
    }
    const command = /^\/api\/appointments\/([^/]+)\/commands$/u.exec(url.pathname);
    if (command && method === "POST") {
      const found = appointments.find(a => a.appointmentId === decodeURIComponent(command[1]!));
      if (!found) return fail(404, "NOT_FOUND", "missing");
      if (body.expectedVersion !== found.version) return fail(409, "CONFLICT", "stale", "APPOINTMENT_CONFLICT");
      if (body.proposal.candidateTimes.length < 3) return fail(400, "VALIDATION_ERROR", "proposal.candidateTimes must contain three to five values.");
      Object.assign(found, { status: "awaiting_response", version: found.version + 1, proposals: [...found.proposals, body.proposal] });
      return json(200, { success: true, data: found });
    }
    return fail(404, "NOT_FOUND", "missing");
  };
  const client = createOrbitApiClient({ baseUrl: "https://orbit.test", authCookieHeader: "authjs.session-token=a", fetchImpl: fetchImpl as typeof fetch });
  return { client, requests, behaviour, appointments };
}

const note = { eventId: "event_1", contactId: "contact_1", noteText: "聊了渠道", nextStep: " 下周发资料 ", tags: ["AI"], observedAt: "2026-09-27T10:00:00.000Z", idempotencyKey: "encounter:k1" };
const proposal = (draft: { appointmentId: string; version: number } | null = null) => ({
  eventId: "event_1", requestId: "req_ok", draft, durationMinutes: 30, timezone: "Asia/Tokyo", note: " 现场见 ",
  candidateTimes: [{ startsAtUtc: "2026-09-28T01:00:00.000Z" }, { startsAtUtc: "2026-09-28T01:30:00.000Z" }, { startsAtUtc: "2026-09-28T05:00:00.000Z" }],
  medium: { kind: "in_person" as const, location: "Shibuya" }, createKey: "appointment-create:k", proposeKey: "appointment-propose:k"
});

test("note posts the web encounter body with the owner cookie and idempotency key, and a retry reuses the record", async () => {
  const s = liveServer();
  const first = await captureLiveEncounter(s.client, note);
  const retry = await captureLiveEncounter(s.client, note);
  assert.deepEqual(first, { ok: true, encounterId: "enc_1" }); assert.deepEqual(retry, first);
  const request = s.requests[0]!;
  assert.equal(request.key, "encounter:k1"); assert.equal(request.cookie, "authjs.session-token=a");
  assert.deepEqual(request.body, { commitments: [], contactId: "contact_1", eventId: "event_1", nextStep: "下周发资料", noteText: "聊了渠道", observedAt: "2026-09-27T10:00:00.000Z", privacy: "private", talked: "yes", tags: ["AI"] });
});

test("note failures stay failures: server error message, offline, and a receipt for another contact", async () => {
  const s = liveServer(); s.behaviour.encounterStatus = 400;
  const refusedNote = await captureLiveEncounter(s.client, note);
  assert.equal(refusedNote.ok || refusedNote.kind, "failed"); assert.ok(!refusedNote.ok && refusedNote.message.length > 0);
  s.behaviour.encounterStatus = 201; s.behaviour.network = true;
  assert.equal((await captureLiveEncounter(s.client, note) as { kind: string }).kind, "offline");
  s.behaviour.network = false; s.behaviour.receiptPatch = { contactId: "someone_else" };
  assert.equal((await captureLiveEncounter(s.client, { ...note, idempotencyKey: "encounter:k2" })).ok, false);
});

test("appointment creates a draft for the accepted exchange, proposes on its version, then reports the existing one", async () => {
  const s = liveServer();
  assert.deepEqual(await findLiveAppointment(s.client, "req_ok", "event_1"), { ok: true, appointment: null });
  const sent = await proposeLiveAppointment(s.client, proposal());
  assert.equal(sent.ok, true);
  assert.equal(sent.ok && sent.appointment.status, "awaiting_response");
  const [create, propose] = s.requests.filter(r => r.method === "POST");
  assert.deepEqual(create!.body, { eventContactRequestId: "req_ok", eventId: "event_1" }); assert.equal(create!.key, "appointment-create:k");
  assert.equal(propose!.path, "/api/appointments/apt_1/commands"); assert.equal(propose!.key, "appointment-propose:k");
  assert.deepEqual(propose!.body, { command: "propose", expectedVersion: 1, proposal: { candidateTimes: proposal().candidateTimes, durationMinutes: 30, medium: { kind: "in_person", location: "Shibuya" }, note: "现场见", timezone: "Asia/Tokyo" } });
  const found = await findLiveAppointment(s.client, "req_ok", "event_1");
  assert.equal(found.ok && found.appointment?.appointmentId, "apt_1");
  assert.equal((await findLiveAppointment(s.client, "req_other", "event_1") as { appointment: unknown }).appointment, null);
  const again = await proposeLiveAppointment(s.client, { ...proposal(), createKey: "appointment-create:k2" });
  assert.equal(again.ok || again.kind, "conflict");
});

test("an existing draft skips creation; a non-accepted exchange and a stale version are reported, not sent twice", async () => {
  const s = liveServer();
  s.appointments.push({ appointmentId: "apt_draft", authorityRequestId: "req_ok", contactId: "contact_1", eventId: "event_1", status: "draft", version: 4, confirmed: null, proposals: [] });
  const sent = await proposeLiveAppointment(s.client, proposal({ appointmentId: "apt_draft", version: 4 }));
  assert.equal(sent.ok, true); assert.equal(s.requests.filter(r => r.path === "/api/appointments" && r.method === "POST").length, 0);
  const stale = await proposeLiveAppointment(s.client, proposal({ appointmentId: "apt_draft", version: 4 }));
  assert.equal(stale.ok || stale.kind, "conflict");
  const refused = await proposeLiveAppointment(s.client, { ...proposal(), requestId: "req_pending" });
  assert.equal(refused.ok || refused.kind, "failed");
  assert.equal(s.requests.filter(r => r.path.endsWith("/commands")).length, 2);
});
