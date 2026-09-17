import assert from "node:assert/strict";
import test from "node:test";
import { applyPersonalSchedulePicker } from "../src/view-models/personal-schedule-picker";
import type { PersonalScheduleContract } from "../src/api/contract/tasks";
import { applyPersonalScheduleDuration, buildPersonalScheduleChange, personalScheduleDraft } from "../src/view-models/personal-schedule-editor";

const item = { id: "personal:picker", sourceId: "personal:picker", accountId: "actor", ownerUserId: "actor", title: "All day", kind: "personal", category: "personal", state: "upcoming", startsAt: "2026-09-16T15:00:00.000Z", endsAt: "2026-09-19T15:00:00.000Z", allDay: true, timeZone: "Asia/Tokyo", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" } as PersonalScheduleContract;

test("all-day picker displays the last occupied day and reopening saves no change", () => {
  const draft = personalScheduleDraft(item, "Asia/Tokyo");
  assert.equal(draft.startDate, "2026-09-17");
  assert.equal(draft.endDate, "2026-09-19");
  assert.deepEqual(buildPersonalScheduleChange(item, draft, "Asia/Tokyo"), { kind: "unchanged" });
});

test("all-day picker maps an inclusive last day to the next local midnight", () => {
  const draft = { ...personalScheduleDraft(null, "Asia/Tokyo"), title: "Three days", allDay: true, startDate: "2026-09-17", endDate: "2026-09-19" };
  const result = buildPersonalScheduleChange(null, draft, "Asia/Tokyo");
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") assert.equal(result.fields.endsAt, "2026-09-19T15:00:00.000Z");
});

test("an explicit all-day end before the start is rejected instead of rolled forward", () => {
  const draft = { ...personalScheduleDraft(null, "Asia/Tokyo"), title: "Invalid range", allDay: true, startDate: "2026-09-17", endDate: "2026-09-16" };
  assert.equal(buildPersonalScheduleChange(null, draft, "Asia/Tokyo").kind, "invalid");
});
test("clearing a new default end is respected on subsequent start edits", () => {
  let draft = { ...personalScheduleDraft(null, "Asia/Tokyo"), title: "New", startDate: "2026-09-17" };
  draft = applyPersonalSchedulePicker(draft, null, "Asia/Tokyo", "startTime", "09:37");
  assert.equal(draft.endTime, "10:07");
  draft = { ...draft, endDate: "", endTime: "" };
  delete draft.pickerEndInstant;
  draft = applyPersonalSchedulePicker(draft, null, "Asia/Tokyo", "startTime", "10:37");
  assert.equal(draft.endTime, "");
});

test("existing unknown duration remains unknown and confirming unchanged minutes preserves seconds", () => {
  const { endsAt: _end, ...withoutEnd } = item;
  const baseline = { ...withoutEnd, allDay: false, startsAt: "2026-09-17T00:37:42Z" };
  const draft = personalScheduleDraft(baseline, "Asia/Tokyo");
  assert.equal(applyPersonalSchedulePicker(draft, baseline, "Asia/Tokyo", "startTime", "09:37"), draft);
  const moved = applyPersonalSchedulePicker(draft, baseline, "Asia/Tokyo", "startTime", "10:37");
  assert.equal(moved.endDate, "");
  assert.equal(moved.endTime, "");
});

test("repeated start edits preserve a fractional-minute actual duration", () => {
  const baseline = { ...item, allDay: false, startsAt: "2026-09-17T00:30:42Z", endsAt: "2026-09-17T01:01:12Z" };
  let draft = personalScheduleDraft(baseline, "Asia/Tokyo");
  draft = applyPersonalSchedulePicker(draft, baseline, "Asia/Tokyo", "startTime", "23:45");
  draft = applyPersonalSchedulePicker(draft, baseline, "Asia/Tokyo", "startDate", "2026-09-18");
  const result = buildPersonalScheduleChange(baseline, draft, "Asia/Tokyo");
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.fields.startsAt, "2026-09-18T14:45:00.000Z");
    assert.equal(result.fields.endsAt, "2026-09-18T15:15:30.000Z");
    assert.equal(result.fields.pickerEndInstant, undefined);
  }
});

test("explicit end selection never rolls an earlier time to tomorrow", () => {
  const baseline = { ...item, allDay: false, startsAt: "2026-09-17T00:37:00Z", endsAt: "2026-09-17T01:07:00Z" };
  const draft = applyPersonalSchedulePicker(personalScheduleDraft(baseline, "Asia/Tokyo"), baseline, "Asia/Tokyo", "endTime", "09:00");
  assert.equal(draft.endDate, "2026-09-17");
  assert.equal(buildPersonalScheduleChange(baseline, draft, "Asia/Tokyo").kind, "invalid");
});

test("picker selections retain DST gap and fold rejection", () => {
  for (const [date, time] of [["2026-03-08", "02:30"], ["2026-11-01", "01:30"]] as const) {
    const draft = applyPersonalSchedulePicker({ ...personalScheduleDraft(null, "America/New_York"), title: "DST", startDate: date }, null, "America/New_York", "startTime", time);
    assert.equal(buildPersonalScheduleChange(null, draft, "America/New_York").kind, "invalid");
  }
});
test("duration shortcuts keep an unchanged saved start's seconds and produce exact minutes", () => {
  const baseline = { ...item, allDay: false, startsAt: "2026-09-17T00:37:42Z", endsAt: "2026-09-17T01:07:42Z" };
  const result = applyPersonalScheduleDuration(personalScheduleDraft(baseline, "Asia/Tokyo"), "Asia/Tokyo", 60, baseline);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    const change = buildPersonalScheduleChange(baseline, result.draft, "Asia/Tokyo");
    assert.equal(change.kind, "ready");
    if (change.kind === "ready") {
      assert.equal(change.fields.startsAt, undefined);
      assert.equal(change.fields.endsAt, "2026-09-17T01:37:42.000Z");
    }
  }
});
test("duration shortcuts reject an unavailable zone without throwing or changing the draft", () => {
  const draft = personalScheduleDraft(item, "Asia/Tokyo");
  assert.equal(applyPersonalScheduleDuration(draft, "Invalid/Zone", 30, item).kind, "invalid");
});
