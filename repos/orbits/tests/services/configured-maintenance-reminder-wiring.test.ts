import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredMaintenanceTasks } from "../../features/operations/maintenance/configured-tasks";

test("production maintenance includes exactly one canonical reminder task without replacing event redispatch", async () => {
  const tasks = createConfiguredMaintenanceTasks({ env: { NODE_ENV: "test" }, workerId: "wiring-test" });
  const reminders = tasks.filter((task) => task.name === "canonical_reminder_dispatch");
  assert.equal(reminders.length, 1);
  assert.equal(tasks.filter((task) => task.name === "event_operations_redispatch").length, 1);
  assert.equal(tasks.filter((task) => task.name === "notification_redelivery").length, 1);
  assert.deepEqual(await reminders[0].run({ now: () => new Date(0), deadline: 1000 }), {
    skipped: "database_unconfigured",
  });
});

test("W0010: production maintenance registers exactly one bounded plan-match task", () => {
  const tasks = createConfiguredMaintenanceTasks({ env: { NODE_ENV: "test" }, workerId: "wiring-test" });
  assert.equal(tasks.filter((task) => task.name === "plan-match").length, 1);
});

test("W0015: production maintenance registers exactly one plan-event-attendance reconcile task", () => {
  const tasks = createConfiguredMaintenanceTasks({ env: { NODE_ENV: "test" }, workerId: "wiring-test" });
  assert.equal(tasks.filter((task) => task.name === "plan-event-attendance").length, 1);
});
