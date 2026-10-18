import assert from "node:assert/strict";
import test from "node:test";

import { taskToView } from "../../app/(app)/app/tasks/tasks-view-model";

test("task detail retains the service deferral count for a second-postponement warning", () => {
  const view = taskToView({
    id: "task-1", title: "Follow up", status: "open", category: "work", priority: "normal",
    plannedDate: "2026-10-18", updatedAt: "2026-10-18T00:00:00.000Z", deferralCount: 1,
  });
  assert.equal(view.deferralCount, 1);
});
