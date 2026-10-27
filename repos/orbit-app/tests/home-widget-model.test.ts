import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";

test("App opening layout gives People and assistant full-width cards", () => {
  assert.deepEqual(DEFAULT_HOME_LAYOUT.app.map(slot => [slot.key, slot.size]), [
    ["today", "m"], ["planScore", "s"], ["nextEvent", "s"], ["network", "m"], ["secretary", "m"],
  ]);
});
import { HOME_WIDGETS, addWidget, dragTargetIndex, moveWidget, moveWidgetTo, nextRegisteredEvent, removeWidget, resizeWidget, signedDelta } from "../src/screens/home/home-widget-model";

test("App layout edits keep unique known keys, accept two sizes and hide unboarded deadline", () => {
  const initial = DEFAULT_HOME_LAYOUT.app;
  assert.equal(HOME_WIDGETS.some(item => item.key === "deadline"), false);
  assert.equal(addWidget(initial, { key: "today", size: "s" }).length, initial.length);
  assert.equal(addWidget(initial, { key: "deadline", size: "s" }).length, initial.length);
  const changed = resizeWidget(moveWidget(initial, "today", 1), "today");
  assert.equal(changed[1]?.key, "today");
  assert.equal(changed[1]?.size, "s");
  assert.deepEqual(moveWidgetTo(initial, "today", 4).map(slot => slot.key), ["planScore", "nextEvent", "network", "secretary", "today"]);
  assert.equal(dragTargetIndex(0, 5, 190, 0, 210), 1);
  assert.equal(dragTargetIndex(2, 5, 190, 130, 190), 4);
  assert.equal(dragTargetIndex(4, 5, 190, 0, 900), 4);
  assert.equal(addWidget(removeWidget(changed, "nextEvent"), { key: "memo", size: "m" }).at(-1)?.key, "memo");
});

test("App next event only selects a future registration and preserves negative score delta", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const items = [
    { status: "planned", startsAt: "2026-10-20T01:00:00Z" },
    { status: "registered", startsAt: "2026-10-20T04:00:00Z" },
    { status: "registered", startsAt: "2026-10-20T02:00:00Z" },
  ];
  assert.equal(nextRegisteredEvent(items, now)?.startsAt, "2026-10-20T02:00:00Z");
  assert.equal(signedDelta(-10), "−10");
  assert.equal(signedDelta(10), "+10");
  assert.equal(signedDelta(0), "0");
});

test("long-press size choice sets the requested size without toggling a matching card", () => {
  const initial = DEFAULT_HOME_LAYOUT.app;
  const medium = resizeWidget(initial, "today", "m");
  assert.equal(medium.find(slot => slot.key === "today")?.size, "m");
  assert.deepEqual(medium.filter(slot => slot.key !== "today"), initial.filter(slot => slot.key !== "today"));
  const small = resizeWidget(medium, "today", "s");
  assert.equal(small.find(slot => slot.key === "today")?.size, "s");
});

test("UX: the Today card counts 今天 / 已逾期 like the to-do tab — tasks and follow-ups by due time, else planned day", async () => {
  const { homeTodaySummary } = await import("../src/screens/home/home-widget-model");
  const tasks = [
    { id: "a", title: "Old", plannedDate: "2026-10-20" },
    { id: "b", title: "Due late tonight Tokyo", dueAt: "2026-10-26T14:30:00.000Z" }, // 23:30 JST on the 26th
    { id: "c", title: "Planned today", plannedDate: "2026-10-26" },
    { id: "d", title: "Tomorrow", plannedDate: "2026-10-27" },
    { id: "e", title: "No date" },
  ];
  const followUps = [{ itemKey: "f1", titlePreview: "Call Sato", dueAt: "2026-10-24T01:00:00.000Z" }, { itemKey: "f2", titlePreview: "Someday", dueAt: null }];
  const summary = homeTodaySummary(tasks, followUps, "2026-10-26", "Asia/Tokyo");
  assert.deepEqual(summary.today.map(row => row.title), ["Due late tonight Tokyo", "Planned today"]);
  assert.deepEqual(summary.overdue.map(row => row.title), ["Old", "Call Sato"]);
  assert.equal(summary.capped, false);
  assert.equal(homeTodaySummary(tasks.slice(0, 3), [], "2026-10-26", "Asia/Tokyo", true).capped, true, "the 30-row window ended on today: counts are a floor");
  assert.equal(homeTodaySummary(tasks, [], "2026-10-26", "Asia/Tokyo", true).capped, false);
});

test("UX: the next of today's calendar items is the first not yet over; all-day items always count", async () => {
  const { nextTodayScheduleItem } = await import("../src/screens/home/home-widget-model");
  const items = [{ title: "Breakfast", timeLabel: "08:00", durationMinutes: 60 }, { title: "Lunch", timeLabel: "12:00", durationMinutes: 60 }];
  assert.equal(nextTodayScheduleItem(items, 9 * 60 + 30)?.title, "Lunch");
  assert.equal(nextTodayScheduleItem(items, 8 * 60 + 30)?.title, "Breakfast", "an ongoing item is next");
  assert.equal(nextTodayScheduleItem(items, 14 * 60), null);
  assert.equal(nextTodayScheduleItem([{ title: "Holiday", timeLabel: "", durationMinutes: 0 }], 23 * 60)?.title, "Holiday");
});
