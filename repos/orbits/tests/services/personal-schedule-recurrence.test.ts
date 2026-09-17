import assert from "node:assert/strict";
import test from "node:test";
import { expandPersonalScheduleOccurrences } from "../../features/personal-schedule/recurrence";

const series = { id: "personal:series", startsAt: "2026-01-31T09:10:37.125Z", endsAt: "2026-01-31T10:10:37.125Z", timeZone: "Asia/Tokyo" };
const window = { from: "2026-02-01T00:00:00Z", to: "2026-05-01T00:00:00Z" };

test("monthly recurrence skips missing dates rather than drifting from the 31st", () => {
  const result = expandPersonalScheduleOccurrences({ ...series, recurrence: { frequency: "monthly" } }, window);
  assert.deepEqual(result.map(item => item.startsAt), ["2026-03-31T09:10:37.125Z"]);
  assert.equal(result[0]!.endsAt, "2026-03-31T10:10:37.125Z");
});

test("occurrence identity is stable across overlapping windows and preserves seconds", () => {
  const input = { ...series, recurrence: { frequency: "daily" as const, until: "2026-02-02" } };
  const first = expandPersonalScheduleOccurrences(input, { from: "2026-01-31T00:00:00Z", to: "2026-02-03T00:00:00Z" });
  const second = expandPersonalScheduleOccurrences(input, window);
  assert.deepEqual(first.map(item => item.startsAt), ["2026-01-31T09:10:37.125Z", "2026-02-01T09:10:37.125Z", "2026-02-02T09:10:37.125Z"]);
  assert.equal(second[0]!.id, first[1]!.id);
  assert.equal(second[0]!.seriesId, series.id);
  assert.equal(new Set(first.map(item => item.id)).size, 3);
});

test("weekly recurrence preserves local clock across daylight saving changes", () => {
  const result = expandPersonalScheduleOccurrences({ id: "weekly", startsAt: "2026-03-01T14:15:37Z", endsAt: "2026-03-01T15:15:37Z", timeZone: "America/New_York", recurrence: { frequency: "weekly" } }, { from: "2026-03-01T00:00:00Z", to: "2026-03-16T00:00:00Z" });
  assert.deepEqual(result.map(item => item.startsAt), ["2026-03-01T14:15:37.000Z", "2026-03-08T13:15:37.000Z", "2026-03-15T13:15:37.000Z"]);
});

test("all-day exclusive end follows local calendar rather than a fixed 24 hours", () => {
  const result = expandPersonalScheduleOccurrences({ id: "all-day", startsAt: "2026-03-07T05:00:00Z", endsAt: "2026-03-08T05:00:00Z", timeZone: "America/New_York", allDay: true, recurrence: { frequency: "daily" } }, { from: "2026-03-08T00:00:00Z", to: "2026-03-09T00:00:00Z" });
  assert.equal(result[0]!.startsAt, "2026-03-08T05:00:00.000Z");
  assert.equal(result[0]!.endsAt, "2026-03-09T04:00:00.000Z");
});

test("nonexistent and ambiguous repeated local times fail explicitly", () => {
  for (const [startsAt, from, to] of [
    ["2026-03-07T07:30:00Z", "2026-03-08T00:00:00Z", "2026-03-09T00:00:00Z"],
    ["2026-10-31T05:30:00Z", "2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"],
  ]) assert.throws(() => expandPersonalScheduleOccurrences({ id: "dst", startsAt: startsAt!, timeZone: "America/New_York", recurrence: { frequency: "daily" } }, { from: from!, to: to! }), /local time/i);
});

test("expansion is half-open and refuses unbounded or invalid windows", () => {
  const input = { ...series, recurrence: { frequency: "daily" as const } };
  assert.equal(expandPersonalScheduleOccurrences(input, { from: "2026-02-01T09:10:37.125Z", to: "2026-02-02T09:10:37.125Z" }).length, 1);
  for (const invalid of [{ from: "invalid", to: window.to }, { from: window.to, to: window.from }, { from: "2026-01-01T00:00:00Z", to: "2028-01-01T00:00:00Z" }]) assert.throws(() => expandPersonalScheduleOccurrences(input, invalid), /window/i);
});

test("a far-past series expands only the requested dates and never before its start", () => {
  const input = { ...series, startsAt: "2000-01-01T09:10:37Z", endsAt: undefined, recurrence: { frequency: "daily" as const } };
  const result = expandPersonalScheduleOccurrences(input, { from: "2026-02-01T00:00:00Z", to: "2026-02-03T00:00:00Z" });
  assert.deepEqual(result.map(item => item.startsAt), ["2026-02-01T09:10:37.000Z", "2026-02-02T09:10:37.000Z"]);
  assert.equal(expandPersonalScheduleOccurrences({ ...series, recurrence: { frequency: "daily" } }, { from: "2025-01-01T00:00:00Z", to: "2025-01-02T00:00:00Z" }).length, 0);
});

test("a DST gap outside the requested window does not break a valid earlier occurrence", () => {
  const result = expandPersonalScheduleOccurrences({ id: "outside-gap", startsAt: "2026-03-07T07:30:00Z", timeZone: "America/New_York", recurrence: { frequency: "daily" } }, { from: "2026-03-07T00:00:00Z", to: "2026-03-08T06:00:00Z" });
  assert.deepEqual(result.map(item => item.startsAt), ["2026-03-07T07:30:00.000Z"]);
});
