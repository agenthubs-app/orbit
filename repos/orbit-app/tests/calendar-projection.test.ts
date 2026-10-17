import assert from "node:assert/strict";
import test from "node:test";

import { calendarDateKeys, calendarProjection, shiftCalendarSelection } from "../src/screens/calendar/calendar-projection";

const now = new Date("2026-10-07T01:00:00.000Z");
const base = { actorId: "actor-1", dateKey: "2026-10-07", events: { events: [] }, language: "ja" as const, now, tasks: { tasks: [] }, timeZone: "Asia/Tokyo" };

test("month, week, and day keys navigate across month edges without losing the selected date", () => {
  assert.deepEqual([calendarDateKeys("2026-10-07", "month")[0], calendarDateKeys("2026-10-07", "month").at(-1)], ["2026-09-27", "2026-10-31"]);
  assert.deepEqual(calendarDateKeys("2026-10-07", "week"), ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  assert.deepEqual(calendarDateKeys("2026-10-07", "day"), ["2026-10-07"]);
  assert.equal(shiftCalendarSelection("2026-10-31", "month", 1), "2026-11-30");
  assert.equal(shiftCalendarSelection("2026-10-07", "week", -1), "2026-09-30");
});

test("recurring mirror series expands into month and day, honoring cancelled occurrences", () => {
  const series = { id: "p:1", sourceId: "p:1", accountId: "actor-1", ownerUserId: "actor-1", kind: "personal", category: "personal", state: "upcoming", title: "Weekly review", startsAt: "2026-10-06T01:00:00.000Z", endsAt: "2026-10-06T02:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "daily", until: "2026-10-08" }, occurrenceExceptions: [{ occurrenceDate: "2026-10-07", cancelled: true, patch: {} }] };
  const projection = calendarProjection({ ...base, mode: "month", scheduleItems: { scheduleItems: [series] } });
  assert.equal(projection.kind, "ready");
  if (projection.kind !== "ready") return;
  assert.deepEqual(projection.days.filter(day => day.items.length).map(day => day.dateKey), ["2026-10-06", "2026-10-08"]);
  assert.equal(projection.days.find(day => day.dateKey === "2026-10-08")?.items[0]?.id, "p:1:occurrence:2026-10-08");
  const day = calendarProjection({ ...base, dateKey: "2026-10-08", mode: "day", scheduleItems: { scheduleItems: [series] } });
  assert.equal(day.kind, "ready");
  if (day.kind === "ready") assert.equal(day.selectedItems[0]?.title, "Weekly review");
});

test("overlap flags two timed items, but not an all-day item", () => {
  const scheduleItems = { scheduleItems: [
    { id: "p:1", kind: "personal", title: "Visit", startsAt: "2026-10-07T05:30:00.000Z", endsAt: "2026-10-07T06:30:00.000Z" },
    { id: "m:1", kind: "meeting", title: "Call", startsAt: "2026-10-07T06:00:00.000Z", endsAt: "2026-10-07T06:45:00.000Z" },
    { id: "p:2", kind: "personal", title: "All day", startsAt: "2026-10-06T15:00:00.000Z", endsAt: "2026-10-07T15:00:00.000Z", allDay: true },
  ] };
  const projection = calendarProjection({ ...base, mode: "day", scheduleItems });
  assert.equal(projection.kind, "ready");
  if (projection.kind === "ready") assert.deepEqual(projection.overlaps.map(pair => pair.ids), [["p:1", "m:1"]]);
});

test("malformed owner or recurrence is surfaced rather than silently dropped", () => {
  const bad = { id: "p:bad", kind: "personal", recurrence: { frequency: "daily" }, startsAt: "not-a-date", accountId: "someone-else" };
  assert.deepEqual(calendarProjection({ ...base, mode: "month", scheduleItems: { scheduleItems: [bad] } }), { kind: "invalid_schedule" });
});
