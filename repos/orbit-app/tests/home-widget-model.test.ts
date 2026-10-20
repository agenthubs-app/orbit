import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_LAYOUT } from "../src/api/schema/home-layout";
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
