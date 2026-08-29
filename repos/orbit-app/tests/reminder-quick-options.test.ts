import assert from "node:assert/strict";
import test from "node:test";

import { reminderQuickOptions, reminderPlansToView } from "../src/view-models/reminders";

test("reminder quick options offer practical Tokyo times without duplicates", () => {
  const options = reminderQuickOptions(new Date("2026-08-29T04:00:00.000Z"));
  assert.deepEqual(options.map((item) => item.label), ["1 小时后", "今天 18:00", "明天 09:00"]);
  assert.deepEqual(options.map((item) => item.fireAt), [
    "2026-08-29T05:00:00.000Z",
    "2026-08-29T09:00:00.000Z",
    "2026-08-30T00:00:00.000Z",
  ]);
});

test("late-day reminder choices roll forward cleanly", () => {
  const options = reminderQuickOptions(new Date("2026-08-29T12:30:00.000Z"));
  assert.deepEqual(options.map((item) => item.label), ["1 小时后", "明天 09:00"]);
});

test("reminder plans become concise task-detail rows", () => {
  const rows = reminderPlansToView({ reminders: [{
    body: "发送准备清单",
    channels: ["in_app", "ios_push"],
    createdAt: "2026-08-29T00:00:00.000Z",
    createdBy: "user",
    deepLink: "/tasks/task%3Aone",
    fireAt: "2026-08-30T00:00:00.000Z",
    id: "reminder:one",
    status: "scheduled",
    targetId: "task:one",
    targetType: "task",
    timeZone: "Asia/Tokyo",
    title: "待办提醒",
    updatedAt: "2026-08-29T00:00:00.000Z",
  }] });
  assert.deepEqual(rows, [{ id: "reminder:one", label: "8月30日 09:00", status: "scheduled" }]);
});
