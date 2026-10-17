import assert from "node:assert/strict";
import test from "node:test";
import { calendarWindow, shiftCalendarDate } from "../../app/(app)/app/orbit-2026/calendar/calendar-range";
import { calendarExternalEventsQueryObject } from "../../shared/api-schema/calendar-external-events";

test("calendar day windows follow the selected local day, including 23/25-hour DST days", () => {
  const spring = calendarWindow("2026-03-08", "day", "America/New_York");
  assert.deepEqual({ from: spring.from, to: spring.to, days: spring.days }, { from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T04:00:00.000Z", days: ["2026-03-08"] });
  const autumn = calendarWindow("2026-11-01", "day", "America/New_York");
  assert.equal(autumn.from, "2026-11-01T04:00:00.000Z");
  assert.equal(autumn.to, "2026-11-02T05:00:00.000Z");
});

test("week is Monday-first, while the approved month grid is Sunday-first without an extra blank week", () => {
  const week = calendarWindow("2026-10-18", "week", "Asia/Tokyo");
  assert.deepEqual(week.days, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(week.from, "2026-10-11T15:00:00.000Z");
  assert.equal(week.to, "2026-10-18T15:00:00.000Z");
  const month = calendarWindow("2026-10-14", "month", "Asia/Tokyo");
  assert.equal(month.days.length, 35);
  assert.equal(month.days[0], "2026-09-27");
  assert.equal(month.days.at(-1), "2026-10-31");
  assert.equal(month.to, "2026-10-31T15:00:00.000Z");
  assert.equal(calendarWindow("2026-02-14", "month", "Asia/Tokyo").days.length, 28);
});

test("a fall-DST month keeps every grid hour while splitting external reads within the 42-day API budget", () => {
  const window = calendarWindow("2025-11-15", "month", "America/New_York");
  assert.equal(window.from, "2025-10-26T04:00:00.000Z");
  assert.equal(window.to, "2025-12-07T05:00:00.000Z");
  assert.deepEqual(window.externalRanges, [
    { from: "2025-10-26T04:00:00.000Z", to: "2025-12-07T04:00:00.000Z" },
    { from: "2025-12-07T04:00:00.000Z", to: "2025-12-07T05:00:00.000Z" },
  ]);
  for (const range of window.externalRanges) assert.equal(calendarExternalEventsQueryObject.safeParse(range).success, true);
});

test("navigation changes calendar days rather than fixed hours and clamps month-end dates", () => {
  assert.equal(shiftCalendarDate("2026-03-08", "day", -1), "2026-03-07");
  assert.equal(shiftCalendarDate("2026-12-29", "week", 1), "2027-01-05");
  assert.equal(shiftCalendarDate("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(shiftCalendarDate("2024-03-31", "month", -1), "2024-02-29");
});

test("midnight gaps use the real beginning of the local day; invalid and skipped dates fail visibly", () => {
  const gap = calendarWindow("2018-11-04", "day", "America/Sao_Paulo");
  assert.equal(gap.from, "2018-11-04T03:00:00.000Z");
  assert.equal(gap.to, "2018-11-05T02:00:00.000Z");
  for (const [day, zone] of [["2026-02-30", "UTC"], ["2011-12-30", "Pacific/Apia"], ["2026-10-18", "Invalid/Zone"]]) {
    assert.throws(() => calendarWindow(day, "day", zone), /CALENDAR_DATE_UNAVAILABLE/);
  }
  assert.throws(() => shiftCalendarDate("invalid", "month", 1), /CALENDAR_DATE_UNAVAILABLE/);
});
