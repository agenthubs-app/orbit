import assert from "node:assert/strict";
import test from "node:test";

import {
  meetingDetailsPath,
  meetingDetailsReceipt,
  readMeetingDetails,
} from "../src/api/meeting-details";
import { meetingDetailsToView } from "../src/view-models/meeting-details";

const detail = {
  appointmentId: "appointment:one",
  confirmed: { durationMinutes: 45, medium: { kind: "in_person", location: "丸の内" }, startsAtUtc: "2026-09-20T01:00:00.000Z", timezone: "Asia/Tokyo" },
  contactId: "contact:one",
  details: "准备报价单",
  detailsUpdatedAt: "2026-09-15T07:00:00.000Z",
  detailsUpdatedBy: "other",
  eventId: "event:one",
  proposals: [{ createdAt: "2026-09-13T00:00:00.000Z", durationMinutes: 45, medium: { kind: "in_person", location: "丸の内" }, note: "讨论合作范围", proposedBy: "you", revision: 1, timezone: "Asia/Tokyo" }],
  status: "confirmed",
  title: "与田中健会面",
  updatedAt: "2026-09-15T07:00:00.000Z",
  version: 4,
  visibility: "participants",
};

test("meeting details parser and view expose time, medium, proposal context, and stable links", () => {
  const parsed = readMeetingDetails(detail);
  assert.ok(parsed);
  assert.equal(meetingDetailsPath("appointment:one"), "/api/appointments/appointment%3Aone");
  assert.equal(meetingDetailsPath("appointment:one", true), "/api/appointments/appointment%3Aone/details");
  assert.equal(meetingDetailsPath("seed:meeting", false, "schedule"), "/api/schedule-items/seed%3Ameeting/meeting-details");
  assert.equal(meetingDetailsPath("seed:meeting", true, "schedule"), "/api/schedule-items/seed%3Ameeting/meeting-details");
  assert.deepEqual(meetingDetailsToView(parsed!, "zh"), {
    contactHref: "/contacts/contact%3Aone",
    eventHref: "/events/event%3Aone",
    mediumLabel: "线下会面 · 丸の内",
    proposalNote: "讨论合作范围",
    statusLabel: "已确认",
    title: "与田中健会面",
    timeLabel: "2026年9月20日 10:00 · 45分钟 · Asia/Tokyo",
    updatedLabel: "由对方更新 · 2026年9月15日 16:00",
  });
});

test("meeting details receipts must exactly match the submitted record, normalized content, and advanced version", () => {
  assert.equal(meetingDetailsReceipt({ ...detail, details: "新内容\n第二行", detailsUpdatedBy: "you", replayed: false, version: 5 }, "appointment:one", " 新内容\r\n第二行 ", 4)?.details, "新内容\n第二行");
  for (const value of [
    { ...detail, appointmentId: "appointment:other", details: "新内容", detailsUpdatedBy: "you", replayed: false, version: 5 },
    { ...detail, details: "错误内容", detailsUpdatedBy: "you", replayed: false, version: 5 },
    { ...detail, details: "新内容", detailsUpdatedBy: "other", replayed: false, version: 5 },
    { ...detail, details: "新内容", detailsUpdatedBy: "you", replayed: false, version: 4 },
  ]) assert.equal(meetingDetailsReceipt(value, "appointment:one", "新内容", 4), null);
});

test("meeting detail parser rejects malformed and actor-leaking payloads", () => {
  for (const value of [null, {}, { ...detail, version: 0 }, { ...detail, detailsUpdatedBy: "actor:raw" }, { ...detail, confirmed: { ...detail.confirmed, startsAtUtc: "bad" } }]) {
    assert.equal(readMeetingDetails(value), null);
  }
});
