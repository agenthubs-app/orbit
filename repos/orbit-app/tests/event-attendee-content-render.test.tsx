import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";
import { AttendeeOperationsContent } from "../src/screens/events/AttendeeOperationsContent";
import { readAttendeeWorkspace, readParticipantDetail } from "../src/api/event-attendee-operations";
import { attendeeFixture, participantFixture } from "./helpers/attendee-operations-fixtures";
const workspace = readAttendeeWorkspace(attendeeFixture(), "event_1");
const base = { state: { workspace, detail: null, loading: false, busy: false, error: null }, language: "zh" as const, now: Date.parse("2026-09-17T02:00:00Z"), onAction() {}, onRefresh() {}, onParticipant() {}, onContact() {} };
test("directory shows authoritative self/check-in, recommendations and two seats", () => {
  const html = renderToHtml(<AttendeeOperationsContent {...base} />);
  for (const text of ["My name", "Other person", "签到", "A1", "B2", "Shared AI interests"]) assert.ok(html.includes(text), text);
});
test("detail no default consent; accepted only links the owner's contact", () => {
  const detail = readParticipantDetail(participantFixture(), workspace, "p_other");
  const html = renderToHtml(<AttendeeOperationsContent {...base} state={{ ...base.state, detail }} />);
  assert.match(html, /申请交换名片/); assert.doesNotMatch(html, /已添加人脉/);
  assert.match(html, /Find collaborators/);
  const accepted = renderToHtml(<AttendeeOperationsContent {...base} state={{ ...base.state, detail: { ...detail, contactRequest: { status: "accepted", contactId: "mine", requestId: "r", revision: 2, direction: "incoming" } } }} />);
  assert.match(accepted, /查看联系人/); assert.doesNotMatch(accepted, /申请交换名片/);
});
test("locked/failed results stay honest; all three locales have action labels", () => {
  for (const language of ["zh", "en", "ja"] as const) {
    const html = renderToHtml(<AttendeeOperationsContent {...base} language={language} state={{ ...base.state, workspace: { ...workspace, resultsState: "locked", recommendations: null, roundOneTable: null, roundTwoTable: null } }} />);
    assert.doesNotMatch(html, /Shared AI interests|undefined|A1|B2/);
    assert.match(html, /button/);
  }
});
