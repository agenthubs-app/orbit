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

test("production maintenance runs the read-cost rollup task once, inside the existing daily pass", async () => {
  const tasks = createConfiguredMaintenanceTasks({ env: { NODE_ENV: "test" }, workerId: "wiring-test" });
  const readCost = tasks.filter((task) => task.name === "read_cost_rollup");
  assert.equal(readCost.length, 1);
  assert.equal(tasks.at(-1)?.name, "read_cost_rollup", "runs after the delivery tasks");
  assert.deepEqual(await readCost[0]!.run({ now: () => new Date(0), deadline: 1000 }), { skipped: "database_unconfigured" });
});

test("production maintenance runs the agent run retention task once, inside the existing pass, before the read-cost rollup", async () => {
  const tasks = createConfiguredMaintenanceTasks({ env: { NODE_ENV: "test" }, workerId: "wiring-test" });
  const retention = tasks.filter((task) => task.name === "agent_run_retention");
  assert.equal(retention.length, 1);
  assert.ok(tasks.findIndex((task) => task.name === "agent_run_retention") < tasks.findIndex((task) => task.name === "read_cost_rollup"));
  assert.deepEqual(await retention[0]!.run({ now: () => new Date(0), deadline: 1000 }), { skipped: "database_unconfigured" });
});
