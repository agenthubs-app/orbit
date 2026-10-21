import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrbitApiClient } from "../src/api/client";

const view = { bannerCollapsed: false, completed: 2, confirmedContacts: 3,
  nextStep: "plan" as const, steps: { contacts: true, goal: true, plan: false } };

test("Task demo API accepts only an actor-scoped server decision with real n/3", async () => {
  const { taskPlanDemoOf, saveTaskPlanDemoCollapse, canWriteTaskPlan } = await import("../src/api/task-plan-demo");
  const calls: unknown[] = [];
  const client = { get: async () => ({ success: true, status: 200, data: { inDemo: true, view } }),
    patch: async (_path: string, options: unknown) => { calls.push(options); return { success: true, status: 200, data: {} }; } } as unknown as OrbitApiClient;
  assert.deepEqual(taskPlanDemoOf({ inDemo: true, view }), { kind: "ready", view });
  assert.equal(canWriteTaskPlan({ kind: "ready", view }), false);
  assert.equal(canWriteTaskPlan({ kind: "off" }), true);
  assert.equal(canWriteTaskPlan({ kind: "unavailable" }), false);
  assert.equal(await saveTaskPlanDemoCollapse(client, true), true);
  assert.deepEqual(calls, [{ body: { bannerCollapsed: true } }]);
});

test("malformed Task demo decisions fail closed instead of allowing plan writes", async () => {
  const { taskPlanDemoOf } = await import("../src/api/task-plan-demo");
  assert.deepEqual(taskPlanDemoOf({ inDemo: true, view: { ...view, completed: 4 } }), { kind: "unavailable" });
});
