import assert from "node:assert/strict";
import test from "node:test";

import { meetingDetailsMutationSchema, meetingDetailsSchema } from "../../shared/api-schema/appointment-details";

const detail = {
  appointmentId: "appointment:one",
  confirmed: { durationMinutes: 45, medium: { kind: "video", provider: "google_meet", joinUrl: null }, startsAtUtc: "2026-09-20T01:00:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:one",
  details: "准备报价单",
  detailsUpdatedAt: "2026-09-15T07:00:00.000Z",
  detailsUpdatedBy: "you",
  eventId: "event:one",
  proposals: [{ createdAt: "2026-09-13T00:00:00.000Z", durationMinutes: 45, medium: { kind: "video", provider: "google_meet", joinUrl: null }, note: "讨论合作", proposedBy: "other", revision: 1, timezone: "Asia/Tokyo" }],
  status: "confirmed",
  updatedAt: "2026-09-15T07:00:00.000Z",
  version: 4,
};

test("meeting detail schemas accept the shared receipt and reject unsafe shapes", () => {
  assert.equal(meetingDetailsSchema.parse(detail).details, "准备报价单");
  assert.equal(meetingDetailsMutationSchema.parse({ ...detail, replayed: true }).replayed, true);
  for (const value of [
    { ...detail, appointmentId: "" },
    { ...detail, details: "x".repeat(5_001) },
    { ...detail, version: 0 },
    { ...detail, detailsUpdatedBy: "actor:raw" },
    { ...detail, confirmed: { ...detail.confirmed, medium: { kind: "video", provider: "google_meet", joinUrl: "http://unsafe.test" } } },
  ]) assert.equal(meetingDetailsSchema.safeParse(value).success, false);
});
