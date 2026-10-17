import assert from "node:assert/strict";
import test from "node:test";

import { calendarExternalEventsByDay } from "../src/screens/calendar/calendar-external-view";

test("external timed and all-day events land on local dates without turning into editable Orbit items", () => {
  const days = ["2026-10-18", "2026-10-19", "2026-10-20"];
  const events = [
    { id: "timed", titlePreview: "Partner call", startsAt: "2026-10-18T23:30:00.000Z", endsAt: "2026-10-19T00:30:00.000Z", allDay: false },
    { id: "all-day", titlePreview: "Holiday", startsAt: "2026-10-18", endsAt: "2026-10-20", allDay: true },
  ];
  const byDay = calendarExternalEventsByDay(events, days, "Asia/Tokyo");
  assert.deepEqual(byDay.get("2026-10-18")?.map(item => item.id), ["all-day"]);
  assert.deepEqual(byDay.get("2026-10-19")?.map(item => item.id), ["timed", "all-day"]);
  assert.equal(byDay.get("2026-10-20")?.length, 0, "all-day end date is exclusive");
});

test("malformed provider times are omitted rather than rendered on an invented day", () => {
  const byDay = calendarExternalEventsByDay([{ id: "bad", titlePreview: "Bad", startsAt: "invalid", allDay: false }], ["2026-10-18"], "Asia/Tokyo");
  assert.equal(byDay.get("2026-10-18")?.length, 0);
});
