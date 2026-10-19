import assert from "node:assert/strict";
import test from "node:test";
import { nextMorningReminderAt } from "../../app/(app)/app/orbit-2026/todo/task-list-reminder-time";

test("tomorrow morning uses the task page's local day, not UTC or a fixed offset", () => {
  assert.equal(nextMorningReminderAt(new Date("2026-10-17T23:00:00.000Z"), "Asia/Tokyo"), "2026-10-18T23:00:00.000Z");
  assert.equal(nextMorningReminderAt(new Date("2026-03-07T23:30:00.000Z"), "America/New_York"), "2026-03-08T12:00:00.000Z");
  assert.equal(nextMorningReminderAt(new Date("invalid"), "Asia/Tokyo"), null);
  assert.equal(nextMorningReminderAt(new Date("2026-10-17T23:00:00.000Z"), "Bad/Zone"), null);
});
