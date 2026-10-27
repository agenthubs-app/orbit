import assert from "node:assert/strict";
import test from "node:test";

import { calendarExternalRanges } from "../src/screens/calendar/calendar-external-range";

test("external reads cover the selected local calendar window without crossing the 42-day API cap", () => {
  const day = calendarExternalRanges("2026-10-18", "day", "Asia/Tokyo");
  assert.deepEqual(day, [{ from: "2026-10-17T15:00:00.000Z", to: "2026-10-18T15:00:00.000Z" }]);
  const month = calendarExternalRanges("2026-02-12", "month", "Asia/Tokyo");
  assert.equal(month.length, 1);
  assert.equal((Date.parse(month[0]!.to) - Date.parse(month[0]!.from)) / 86_400_000, 28);
  assert.deepEqual(calendarExternalRanges("2026-10-07", "week", "Asia/Tokyo"), [
    { from: "2026-10-03T15:00:00.000Z", to: "2026-10-10T15:00:00.000Z" },
  ]);
});

test("a six-week month spanning fall DST splits instead of dropping the final hour", () => {
  const ranges = calendarExternalRanges("2025-11-15", "month", "America/New_York");
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0]!.to, ranges[1]!.from);
  assert.equal(ranges[0]!.from, "2025-10-26T04:00:00.000Z");
  assert.equal(ranges[1]!.to, "2025-12-07T05:00:00.000Z");
  for (const range of ranges) assert.ok(Date.parse(range.to) - Date.parse(range.from) <= 42 * 86_400_000);
});

test("invalid local date or zone does not issue an external request", () => {
  assert.deepEqual(calendarExternalRanges("2026-02-30", "month", "Asia/Tokyo"), []);
  assert.deepEqual(calendarExternalRanges("2026-02-12", "day", "Not/A_Zone"), []);
});
