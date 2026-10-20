import assert from "node:assert/strict";
import test from "node:test";

test("Task demo status is private and uses the server's actor-scoped guide projection", async () => {
  const { createTaskDemoStatusHandler } = await import("../../app/api/tasks/demo-status/handler");
  const guest = createTaskDemoStatusHandler({ resolveActor: async () => null, readDemo: async () => null });
  assert.equal((await guest()).status, 401);
  const view = { bannerCollapsed: true, completed: 2, confirmedContacts: 3,
    nextStep: "plan" as const, steps: { contacts: true, goal: true, plan: false } };
  let input: unknown;
  const handler = createTaskDemoStatusHandler({
    resolveActor: async () => ({ id: "alice", userId: "subject:alice" }),
    readDemo: async value => { input = value; return view; },
  });
  const response = await handler();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: unknown }).data, { inDemo: true, view });
  assert.deepEqual(input, { actorId: "alice", userId: "subject:alice" });
});

test("Task demo status returns a real-data state when the server says demo is off", async () => {
  const { createTaskDemoStatusHandler } = await import("../../app/api/tasks/demo-status/handler");
  const handler = createTaskDemoStatusHandler({ resolveActor: async () => ({ id: "alice" }), readDemo: async () => null });
  const response = await handler();
  assert.deepEqual((await response.json() as { data: unknown }).data, { inDemo: false, view: null });
});

test("Task demo status never reports real-data mode when its source fails", async () => {
  const { createTaskDemoStatusHandler } = await import("../../app/api/tasks/demo-status/handler");
  const handler = createTaskDemoStatusHandler({ resolveActor: async () => ({ id: "alice" }),
    readDemo: async () => { throw new Error("guide store unavailable"); } });
  const response = await handler();
  assert.equal(response.status, 503);
  const body = await response.json() as { success: boolean; error?: { code: string }; data?: unknown };
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "SERVICE_UNAVAILABLE");
  assert.equal(body.data, undefined);
});

test("Task reads the shared guide projection and treats missing enabled-state reads as unavailable", async () => {
  const { readTaskDemoDecisionForActor } = await import("../../app/(app)/app/tasks/task-demo-decision");
  const input = { actorId: "alice", userId: "subject:alice" };
  let calls = 0;
  assert.equal(await readTaskDemoDecisionForActor(input, { enabled: () => false,
    readGoal: async () => { calls++; return "goal"; }, readStatus: async () => null }), null);
  assert.equal(calls, 0);
  await assert.rejects(readTaskDemoDecisionForActor(input, { enabled: () => true,
    readGoal: async () => "goal", readStatus: async () => null }), /TASK_DEMO_STATUS_UNAVAILABLE/u);
  const status = { inDemo: true, bannerCollapsed: false, grandfathered: false,
    progress: { completed: 2, confirmedContacts: 3, nextStep: "plan" as const,
      steps: { contacts: true, goal: true, plan: false } } };
  assert.deepEqual(await readTaskDemoDecisionForActor(input, { enabled: () => true,
    readGoal: async () => "goal", readStatus: async () => status }), {
    bannerCollapsed: false, completed: 2, confirmedContacts: 3, nextStep: "plan",
    steps: { contacts: true, goal: true, plan: false },
  });
});
