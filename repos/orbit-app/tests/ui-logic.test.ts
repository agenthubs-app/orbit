import assert from "node:assert/strict";
import test from "node:test";

import { countUpValue } from "../src/components/ui/Progress";
import { sheetDragOffset, sheetMaxHeight, shouldDismissSheet } from "../src/components/ui/sheet-logic";
import { claimsGesture, dragOffset, openWidth, settleOpen } from "../src/components/ui/swipe-logic";

// R04: the gesture and timing rules behind SwipeRow, BottomSheet and CountUp
// (kit/kit.js, kit/ui.css, 01-system), checked without a gesture system.
test("swipe: 72 per action, follows the finger to 26 past open, opens past 50, max 3 actions", () => {
  assert.equal(openWidth(2), 144);
  assert.equal(openWidth(5), 216);
  assert.equal(dragOffset(-200, false, 2), -170);
  assert.equal(dragOffset(40, false, 2), 0);
  assert.equal(dragOffset(30, true, 2), -114);
  assert.equal(settleOpen(-51, false), true);
  assert.equal(settleOpen(-49, false), false);
  assert.equal(settleOpen(49, true), true);
  assert.equal(settleOpen(51, true), false);
  assert.equal(settleOpen(2, true), true, "a tap leaves it as it was");
});

test("swipe never steals a vertical scroll", () => {
  assert.equal(claimsGesture(30, 5), true);
  assert.equal(claimsGesture(12, 20), false);
  assert.equal(claimsGesture(6, 0), false);
});

test("sheet: 80% cap, rubber band upwards, closes past a quarter or on a flick", () => {
  assert.equal(sheetMaxHeight(844), 675);
  assert.equal(sheetDragOffset(-60), -10);
  assert.equal(sheetDragOffset(40), 40);
  assert.equal(shouldDismissSheet(60, 0, 400), false);
  assert.equal(shouldDismissSheet(120, 0, 400), true);
  assert.equal(shouldDismissSheet(20, 1200, 400), true);
});

test("count-up: ease-out cubic over 1.15 s, ends exactly on the value", () => {
  assert.equal(countUpValue(100, 0), 0);
  assert.equal(countUpValue(100, 1150), 100);
  assert.ok(countUpValue(100, 575) > 80, "front-loaded");
});
