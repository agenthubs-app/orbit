import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleDetail } from "../src/view-models/personal-schedule-detail";
import type { PersonalScheduleContract } from "../src/api/contract/tasks";

const item: PersonalScheduleContract = { id: "personal:detail", sourceId: "personal:detail", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Saved", startsAt: "2026-09-16T15:00:00Z", endsAt: "2026-09-17T15:00:00Z", timeZone: "Asia/Tokyo", allDay: true, contactIds: ["contact:owned"], noteIds: ["note:owned"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };

for (const [name, zone, start, end, date, endDate, duration] of [
  ["Tokyo single day", "Asia/Tokyo", "2026-09-16T15:00:00Z", "2026-09-17T15:00:00Z", "2026-09-17", "2026-09-17", 1440],
  ["Tokyo two days", "Asia/Tokyo", "2026-09-16T15:00:00Z", "2026-09-18T15:00:00Z", "2026-09-17", "2026-09-18", 2880],
  ["New York spring 23-hour day", "America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", "2026-03-08", "2026-03-08", 1380],
  ["New York autumn 25-hour day", "America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", "2026-11-01", "2026-11-01", 1500],
] as const) {
  test(`all-day detail projects occupied dates in saved zone: ${name}`, () => {
    const saved = { ...item, timeZone: zone, startsAt: start, endsAt: end };
    const before = structuredClone(saved);
    const view = personalScheduleDetail(saved, "Pacific/Honolulu");
    assert.ok(view);
    assert.equal(view.zone, zone);
    assert.equal(view.date, date);
    assert.equal(view.endDate, endDate);
    assert.equal(view.durationMinutes, duration);
    assert.deepEqual(saved, before);
    assert.deepEqual(view.contactIds, saved.contactIds);
    assert.deepEqual(view.noteIds, saved.noteIds);
    assert.equal(view.id, saved.id);
    assert.equal(view.updatedAt, saved.updatedAt);
  });
}

test("timed detail retains actual cross-day end and fractional minutes without mutating seconds", () => {
  const saved = { ...item, allDay: false, startsAt: "2026-09-17T14:45:42Z", endsAt: "2026-09-17T15:16:12Z" };
  const before = structuredClone(saved);
  const view = personalScheduleDetail(saved, "UTC");
  assert.ok(view);
  assert.equal(view.date, "2026-09-17");
  assert.equal(view.startTime, "23:45");
  assert.equal(view.endDate, "2026-09-18");
  assert.equal(view.endTime, "00:16");
  assert.equal(view.durationMinutes, 30.5);
  assert.deepEqual(saved, before);
});

test("detail preserves the missing-end branch", () => {
  const { endsAt: _end, ...saved } = item;
  const view = personalScheduleDetail(saved, "UTC");
  assert.ok(view);
  assert.equal(view.endDate, undefined);
  assert.equal(view.endTime, undefined);
  assert.equal(view.durationMinutes, null);
});
