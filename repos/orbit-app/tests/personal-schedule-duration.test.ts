import assert from "node:assert/strict";
import test from "node:test";
import * as editor from "../src/view-models/personal-schedule-editor";

test("duration shortcuts derive exact end instants and cross midnight", () => {
  assert.equal(typeof editor.applyPersonalScheduleDuration, "function");
  const draft = { ...editor.personalScheduleDraft(null, "Asia/Tokyo"), title: "Duration", startDate: "2026-09-17", startTime: "23:45" };
  for (const [minutes, date, time] of [[30, "2026-09-18", "00:15"], [60, "2026-09-18", "00:45"], [120, "2026-09-18", "01:45"]] as const) {
    const result = editor.applyPersonalScheduleDuration(draft, "Asia/Tokyo", minutes);
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") { assert.equal(result.draft.endDate, date); assert.equal(result.draft.endTime, time); }
  }
});

test("all-day editor builds local half-open day intervals across DST and rejects skipped dates", () => {
  for (const [date, start, end] of [["2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"], ["2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"]] as const) {
    const draft = { ...editor.personalScheduleDraft(null, "America/New_York"), title: "All day", allDay: true, startDate: date };
    const result = editor.buildPersonalScheduleChange(null, draft, "America/New_York");
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") { assert.equal(result.fields.startsAt, start); assert.equal(result.fields.endsAt, end); assert.equal(result.fields.allDay, true); assert.equal(result.fields.timeZone, "America/New_York"); }
  }
  assert.equal(editor.buildPersonalScheduleChange(null, { ...editor.personalScheduleDraft(null, "Pacific/Apia"), title: "Skipped", startDate: "2011-12-30", allDay: true }, "Pacific/Apia").kind, "invalid");
});

test("editing unrelated fields preserves saved zone, seconds, metadata and absent unknown states", () => {
  const item = { id: "personal:test", sourceId: "personal:test", accountId: "owner", ownerUserId: "owner", kind: "personal" as const, category: "personal" as const, state: "upcoming" as const, title: "Saved", startsAt: "2026-09-17T09:00:42Z", timeZone: "Asia/Tokyo", meetingMethod: "video" as const, meetingUrl: "https://meet.example.test/room", contactIds: ["contact:owned"], noteIds: ["note:owned"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  const draft = editor.personalScheduleDraft(item, "Asia/Tokyo");
  assert.equal(draft.meetingUrl, item.meetingUrl);
  assert.deepEqual(draft.noteIds, item.noteIds);
  assert.deepEqual(editor.buildPersonalScheduleChange(item, { ...draft, title: "Changed" }, "Asia/Tokyo"), { kind: "ready", fields: { title: "Changed" } });
  assert.equal(editor.buildPersonalScheduleChange(item, { ...draft, meetingUrl: "javascript:alert(1)" }, "Asia/Tokyo").kind, "invalid");
});
