import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import type { MeetingDetailsContract } from "../src/api/contract/appointments";
import { MeetingDetailActions } from "../src/screens/calendar/MeetingDetailActions";
import { renderToHtml, renderedText } from "./helpers/render";

const confirmed: MeetingDetailsContract = {
  appointmentId: "appointment:one", contactId: "contact:one", eventId: "event:one", title: "Meeting", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
  confirmed: { durationMinutes: 30, medium: { kind: "in_person", location: "Tokyo" }, startsAtUtc: "2026-10-20T01:00:00.000Z", timezone: "Asia/Tokyo" },
  proposals: [], status: "confirmed", updatedAt: "2026-10-15T00:00:00.000Z", version: 4, visibility: "participants",
};

const labels = { move: "Move meeting", cancel: "Cancel meeting" };
const actions = (meeting: MeetingDetailsContract, blocked = false) => createElement(MeetingDetailActions, {
  meeting, blocked, busy: false, labels, onMove() {}, onCancel() {},
});

test("confirmed participant meeting exposes move and cancel, while legacy and pending records do not", () => {
  assert.match(renderedText(actions(confirmed)), /Move meeting.*Cancel meeting/u);
  assert.equal(renderedText(actions({ ...confirmed, visibility: "private" })), "");
  assert.equal(renderedText(actions({ ...confirmed, status: "reschedule_pending" })), "");
  assert.equal(renderedText(actions({ ...confirmed, contactId: null })), "");
});

test("offline or stale detail leaves actions visible but disabled", () => {
  const html = renderToHtml(actions(confirmed, true));
  assert.match(html, /Move meeting/u);
  assert.match(html, /Cancel meeting/u);
  assert.equal((html.match(/disabled=""/gu) ?? []).length, 2);
});
