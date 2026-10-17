import assert from "node:assert/strict";
import test from "node:test";
import { calendarDaysView, layoutCalendarIntervals } from "../../app/(app)/app/orbit-2026/calendar/calendar-view-model";
import type { ScheduleItemContract } from "../../shared/contract/tasks";

const item = (id: string, startsAt: string, endsAt?: string): ScheduleItemContract => ({ id, sourceId: id, kind: "personal", category: "personal", title: id, state: "upcoming", startsAt, ...(endsAt ? { endsAt } : {}) });
test("month projects every selected cell including natural four-week February and hidden-day overflow", () => {
  const days = calendarDaysView({ date: "2026-02-14", mode: "month", timeZone: "Asia/Tokyo", language: "ja", internal: [item("one", "2026-02-13T16:00:00Z")], external: [] });
  assert.equal(days.length, 28); assert.equal(days[0]!.date, "2026-02-01"); assert.equal(days.at(-1)!.date, "2026-02-28");
  assert.deepEqual(days.find(day => day.date === "2026-02-14")!.items.map(row => row.title), ["one"]);
});
test("timed multi-day schedules include left carry-over and use exclusive midnight end", () => {
  const days = calendarDaysView({ date: "2026-10-18", mode: "week", timeZone: "UTC", language: "ja", internal: [item("carry", "2026-10-11T23:00:00Z", "2026-10-13T00:00:00Z"), { ...item("cancelled", "2026-10-12T09:00:00Z"), state: "cancelled" }], external: [] });
  assert.equal(days[0]!.date, "2026-10-12"); assert.equal(days[0]!.items.length, 1);
  assert.equal(days[0]!.timed[0]!.startMinute, 0); assert.equal(days[0]!.timed[0]!.endMinute, 1440);
  assert.equal(days[1]!.items.length, 0);
});
test("Google all-day dates stay floating and personal all-day dates retain their saved zone", () => {
  const days = calendarDaysView({ date: "2026-11-02", mode: "day", timeZone: "America/Los_Angeles", language: "ja", internal: [{ ...item("personal", "2026-11-01T15:00:00Z", "2026-11-02T15:00:00Z"), allDay: true, timeZone: "Asia/Tokyo" }], external: [{ id: "google", titlePreview: "Floating", startsAt: "2026-11-02", endsAt: "2026-11-03", allDay: true }] });
  assert.equal(days[0]!.allDay.length, 2);
  assert.deepEqual(new Map(days[0]!.items.map(row => [row.key, row.readOnly])), new Map([["personal:personal", false], ["external:google", true]]));
});
test("fall DST day contains 25 real hours and distinct repeated-clock events", () => {
  const days = calendarDaysView({ date: "2026-11-01", mode: "day", timeZone: "America/New_York", language: "ja", internal: [item("early", "2026-11-01T05:30:00Z", "2026-11-01T05:45:00Z"), item("late", "2026-11-01T06:30:00Z", "2026-11-01T06:45:00Z")], external: [] });
  assert.equal(days[0]!.minutes, 1500); assert.equal(days[0]!.hours.length, 25);
  assert.deepEqual(days[0]!.timed.map(item => item.startMinute), [90, 150]);
  assert.notEqual(days[0]!.hours[1]!.label, days[0]!.hours[2]!.label);
});
test("overlap layout preserves every event and allocates columns only within connected interval clusters", () => {
  const values = layoutCalendarIntervals([{ key: "a", startMinute: 60, endMinute: 120 }, { key: "b", startMinute: 90, endMinute: 150 }, { key: "c", startMinute: 120, endMinute: 180 }, { key: "d", startMinute: 200, endMinute: 220 }]);
  assert.deepEqual(values.map(item => [item.key, item.column, item.columns]), [["a", 0, 2], ["b", 1, 2], ["c", 0, 2], ["d", 0, 1]]);
});
