import assert from "node:assert/strict";
import test from "node:test";
import { homeDateView, homeTasksToView, homeScheduleToView } from "../src/view-models/home-dashboard";
import { todayToView, tasksToListView } from "../src/view-models/today-tasks";
import { eventsToSummaries, eventDetailToSummary } from "../src/view-models/events";
import { scheduleEventPreviewToView } from "../src/view-models/schedule-event-preview";
import { localDayStart, shiftCalendarDate, resolveLocalDateTime } from "../src/time/date-time";
const zone = "America/Los_Angeles";
const now = new Date("2026-09-13T23:00:00Z");
const task = { id: "task:zone", title: "时区验收", status: "open", category: "personal", priority: "normal", dueAt: "2026-09-14T00:30:00Z", updatedAt: "2026-09-13T00:00:00Z" };
const event = { id: "event:zone", title: "时区活动", startsAt: task.dueAt, endsAt: "2026-09-14T01:30:00Z", status: "scheduled" };
test("home, today, task list and events use the same explicit local day", () => {
  assert.equal(homeDateView(new Date(task.dueAt), undefined, zone).selectedDateKey, "2026-09-13");
  assert.equal(homeTasksToView({ tasks: [task] }, "2026-09-13", now, zone)?.[0]?.dueLabel, "17:30");
  assert.equal(todayToView({ tasks: [task] }, now, zone).tasks[0]?.dueLabel, "17:30");
  assert.match(tasksToListView({ tasks: [task] }, "open", now, zone).items[0]!.dateLabel, /9月13日 17:30/);
  assert.match(eventsToSummaries({ events: [event] }, zone)[0]!.startsAt, /9月13日.*17:30/);
  assert.match(eventDetailToSummary({ event }, zone).startsAt, /9月13日.*17:30/);
  assert.match(scheduleEventPreviewToView({ event }, zone).event!.timing, /9月13日.*17:30/);
});
test("home schedule uses each DST day boundary and excludes a midnight end", () => {
  const rows = (startsAt: string, endsAt: string) => ({ scheduleItems: [{ id: "s", sourceId: "event:s", kind: "event", state: "upcoming", title: "DST", startsAt, endsAt }] });
  const time = new Date("2026-03-08T06:00:00Z");
  assert.equal(homeScheduleToView(rows("2026-03-09T04:00:00Z", "2026-03-09T05:00:00Z"), "2026-03-08", time, "America/New_York")?.length, 0);
  assert.equal(homeScheduleToView(rows("2026-03-08T04:00:00Z", "2026-03-08T05:00:00Z"), "2026-03-08", time, "America/New_York")?.length, 0);
  assert.equal(homeScheduleToView(rows("2026-11-02T04:30:00Z", "2026-11-02T05:00:00Z"), "2026-11-01", time, "America/New_York")?.length, 1);
});
test("calendar arithmetic and DST midnight boundaries preserve date semantics", () => {
  assert.equal(shiftCalendarDate("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftCalendarDate("2026-12-31", 1), "2027-01-01");
  assert.equal(localDayStart("2026-03-09", "America/New_York")! - localDayStart("2026-03-08", "America/New_York")!, 23 * 3_600_000);
  assert.equal(localDayStart("2026-11-02", "America/New_York")! - localDayStart("2026-11-01", "America/New_York")!, 25 * 3_600_000);
  assert.equal(new Date(localDayStart("2018-11-04", "America/Sao_Paulo")!).toISOString(), "2018-11-04T03:00:00.000Z");
  assert.equal(resolveLocalDateTime("2026-04-05", "01:45", "Australia/Lord_Howe"), null);
});

test("calendar places timed events on the explicit device day and keeps date-only tasks", async () => {
  const { scheduleToCalendarView } = await import("../src/view-models/schedule");
  const view = scheduleToCalendarView({ events: { events: [event] }, tasks: { tasks: [{ ...task, dueAt: undefined, plannedDate: "2026-09-14" }] }, now, selectedDateKey: "2026-09-13", timeZone: zone });
  assert.equal(view.timedItems[0]?.timeLabel, "17:30");
  assert.equal(view.days.find(d => d.dateKey === "2026-09-14")?.items[0]?.timeLabel, "");
  assert.equal(view.days.find(d => d.dateKey === "2026-09-14")?.items[0]?.id, "task:zone");
});

test("calendar keeps an overnight event on every occupied day, with exclusive midnight end", async () => {
  const { scheduleToCalendarView } = await import("../src/view-models/schedule");
  const view = (endsAt: string) => scheduleToCalendarView({ tasks: {}, events: { events: [{ ...event, startsAt: "2026-09-14T06:30:00Z", endsAt }] }, now, selectedDateKey: "2026-09-14", timeZone: zone });
  assert.equal(view("2026-09-14T08:00:00Z").timedItems.length, 1);
  assert.equal(view("2026-09-14T07:00:00Z").timedItems.length, 0);
});
