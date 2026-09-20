import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { LOADING_DEADLINE_MS, scheduleLoadingDeadline } from "../src/hooks/useLoadingDeadline";

/**
 * Sprint 0092: without a ceiling, a request that never answers leaves the
 * region saying "still reading" forever, with nothing for the user to do.
 */
test("a load that never settles is eventually reported overdue", async () => {
  let overdue = false;
  scheduleLoadingDeadline(true, 20, () => { overdue = true; });
  assert.equal(overdue, false, "a load is not overdue the moment it starts");
  await delay(50);
  assert.equal(overdue, true);
});

test("a load that settles in time is never reported overdue", async () => {
  let overdue = false;
  const cancel = scheduleLoadingDeadline(true, 40, () => { overdue = true; });
  await delay(10);
  cancel();
  await delay(60);
  assert.equal(overdue, false);
});

test("nothing is scheduled when there is no load to bound", async () => {
  let overdue = false;
  scheduleLoadingDeadline(false, 5, () => { overdue = true; });
  await delay(30);
  assert.equal(overdue, false);
});

test("a retry gets its own ceiling rather than inheriting the previous one", async () => {
  let overdue = 0;
  const cancelFirst = scheduleLoadingDeadline(true, 20, () => { overdue += 1; });
  await delay(40);
  assert.equal(overdue, 1);
  cancelFirst();
  scheduleLoadingDeadline(true, 20, () => { overdue += 1; });
  await delay(10);
  assert.equal(overdue, 1, "the retry is not overdue 10ms in");
  await delay(40);
  assert.equal(overdue, 2);
});

test("the ceiling reuses the number the sync layer already uses", () => {
  assert.equal(LOADING_DEADLINE_MS, 8_000);
});
