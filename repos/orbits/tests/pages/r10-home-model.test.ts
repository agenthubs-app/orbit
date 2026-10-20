import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../../shared/api-schema/home-layout";
import { addHomeWidget, homeOpeningGeometry, homeWeekWindow, moveHomeWidget, removeHomeWidget, resizeHomeWidget,
  selectNextRegisteredEvent, signedTodayDelta } from "../../app/(app)/app/orbit-2026/home/home-model";

test("an untouched default keeps its 5/4/3/5/7 geometry across an App edit and hint dismissal", () => {
  assert.equal(homeOpeningGeometry(DEFAULT_HOME_LAYOUT), true);
  assert.equal(homeOpeningGeometry({ ...DEFAULT_HOME_LAYOUT, revision: 2, app: [] }), true);
  assert.equal(homeOpeningGeometry({ ...DEFAULT_HOME_LAYOUT, revision: 2, hintDismissedAt: "2026-10-20T00:00:00Z" }), true);
  assert.equal(homeOpeningGeometry({ ...DEFAULT_HOME_LAYOUT, webCustomizedAt: "2026-10-20T00:00:00Z" }), false);
});

test("edit operations reorder, resize, remove and add without duplicates or deadline", () => {
  const first = DEFAULT_HOME_LAYOUT.web;
  const moved = moveHomeWidget(first, "network", 0);
  assert.deepEqual(moved.map((slot) => slot.key), ["network", "today", "planScore", "nextEvent", "secretary"]);
  const resized = resizeHomeWidget(moved, "network", "m");
  assert.equal(resized[0]?.size, "m");
  const removed = removeHomeWidget(resized, "network");
  assert.equal(removed.length, 4);
  assert.deepEqual(addHomeWidget(removed, { key: "network", size: "s" }).map((slot) => slot.key).at(-1), "network");
  assert.deepEqual(addHomeWidget(first, { key: "today", size: "s" }), first);
  assert.deepEqual(addHomeWidget(first, { key: "deadline", size: "s" }), first);
});

test("next event only claims a future registered event; signed score never becomes +−10", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const items = [
    { eventId: "planned", status: "planned", startsAt: "2026-10-20T01:00:00Z", href: "/a" },
    { eventId: "late", status: "registered", startsAt: "2026-10-22T01:00:00Z", href: "/b" },
    { eventId: "soon", status: "registered", startsAt: "2026-10-21T01:00:00Z", href: "/c" },
  ];
  assert.equal(selectNextRegisteredEvent(items, now)?.eventId, "soon");
  assert.equal(selectNextRegisteredEvent(items.filter((item) => item.status !== "registered"), now), null);
  assert.deepEqual([signedTodayDelta(-10), signedTodayDelta(0), signedTodayDelta(10)], ["−10", "0", "+10"]);
});

test("this-week card asks for the actor-zone Monday to Monday window", () => {
  assert.deepEqual(homeWeekWindow(new Date("2026-10-20T00:00:00Z"), "Asia/Tokyo"), {
    from: "2026-10-18T15:00:00.000Z", to: "2026-10-25T15:00:00.000Z",
  });
  assert.equal(homeWeekWindow(new Date("2026-10-20T00:00:00Z"), "bad/time-zone"), null);
});
