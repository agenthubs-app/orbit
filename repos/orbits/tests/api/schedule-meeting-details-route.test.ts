import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleMeetingDetailsHandlers } from "../../app/api/schedule-items/meeting-details-handler";
import type { OrbitScheduleMeetingDetailsService } from "../../features/events/orbit-schedule-meeting-details";

const detail = {
  appointmentId: "seed:meeting",
  confirmed: { durationMinutes: 60, medium: { kind: "in_person" as const, location: "Orbit 办公室" }, startsAtUtc: "2026-09-15T06:30:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:emma",
  details: "准备报价",
  detailsUpdatedAt: "2026-09-15T08:00:00.000Z",
  detailsUpdatedBy: "you" as const,
  eventId: null,
  proposals: [],
  status: "confirmed" as const,
  title: "与艾玛推进企业 AI 合作",
  updatedAt: "2026-09-15T08:00:00.000Z",
  version: 2,
  visibility: "private" as const,
};

test("schedule meeting detail handlers are actor scoped and return a verified mutation receipt", async () => {
  let update: Record<string, unknown> | null = null;
  const service: OrbitScheduleMeetingDetailsService = {
    async get() { return { ...detail, details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, version: 1 }; },
    async updateDetails(input) { update = input; return { appointment: detail, replayed: false }; },
  };
  const handlers = createScheduleMeetingDetailsHandlers({ resolveActor: async () => ({ id: "account:owner" }), service: () => service });
  const context = { params: Promise.resolve({ id: "seed:meeting" }) };
  const read = await handlers.GET(new Request("https://orbit.local"), context);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).data.visibility, "private");

  const saved = await handlers.PATCH(new Request("https://orbit.local", {
    body: JSON.stringify({ details: "准备报价", expectedVersion: 1 }),
    headers: { "content-type": "application/json", "idempotency-key": "schedule-details-1" },
    method: "PATCH",
  }), context);
  assert.equal(saved.status, 200);
  assert.deepEqual(update, { actorId: "account:owner", details: "准备报价", expectedVersion: 1, idempotencyKey: "schedule-details-1", meetingId: "seed:meeting" });
  assert.deepEqual({ details: (await saved.clone().json()).data.details, replayed: (await saved.json()).data.replayed }, { details: "准备报价", replayed: false });
});

test("schedule meeting detail handlers reject missing auth and malformed edits", async () => {
  const missing = createScheduleMeetingDetailsHandlers({ resolveActor: async () => null, service: () => null });
  assert.equal((await missing.GET(new Request("https://orbit.local"), { params: Promise.resolve({ id: "seed:meeting" }) })).status, 401);
  const invalid = createScheduleMeetingDetailsHandlers({
    resolveActor: async () => ({ id: "account:owner" }),
    service: () => ({ async get() { return detail; }, async updateDetails() { throw new Error("must not run"); } }),
  });
  const response = await invalid.PATCH(new Request("https://orbit.local", { body: JSON.stringify({ details: 3, expectedVersion: 0 }), headers: { "content-type": "application/json" }, method: "PATCH" }), { params: Promise.resolve({ id: "seed:meeting" }) });
  assert.equal(response.status, 400);
});
