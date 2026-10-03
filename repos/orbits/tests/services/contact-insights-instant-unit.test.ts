/**
 * W0057 SC-01 子断言：即时执行器结尾调用一次心跳 bootstrap（失败吞掉、不影响结果）；
 * `after()` 不可用时只标待更新、请求内 0 次生成（不在请求内同步调用模型）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runInstantInsightGeneration, type InstantInsightDeps } from "../../features/contacts/insights/instant";
import { scheduleInstantInsightGeneration } from "../../features/contacts/insights/mark";

function deps(overrides: Partial<InstantInsightDeps> = {}): InstantInsightDeps {
  const unused = async () => { throw new Error("not expected"); };
  return {
    gate: { beginCall: unused, endCall: unused, finish: unused, reserve: unused },
    generator: { billable: false, generate: unused, model: "mock", promptVersion: "p", provider: "mock" },
    inputs: { read: unused },
    readGoal: async () => "goal",
    repository: { claimForActor: async () => null } as unknown as InstantInsightDeps["repository"],
    ...overrides,
  } as InstantInsightDeps;
}

test("the instant executor bootstraps the heartbeat once at the end; a failing bootstrap never changes the result", async () => {
  let calls = 0;
  const summary = await runInstantInsightGeneration(deps({ bootstrapHeartbeat: async () => { calls += 1; throw new Error("queue offline"); } }), { actorId: "a", coalesceMs: 0 });
  assert.equal(calls, 1);
  assert.deepEqual([summary.batches, summary.callsResponded], [0, 0]);
});

test("the executor waits the coalescing window before claiming (consecutive confirmations share a batch)", async () => {
  const order: string[] = [];
  await runInstantInsightGeneration(deps({
    repository: { claimForActor: async () => { order.push("claim"); return null; } } as unknown as InstantInsightDeps["repository"],
    sleep: async (ms) => { order.push(`sleep:${ms}`); },
  }), { actorId: "a" });
  assert.deepEqual(order, ["sleep:3000", "claim"]);
});

test("after() unavailable: nothing runs in the request (only the dirty mark remains for the maintenance task)", () => {
  let ran = 0;
  const scheduled = scheduleInstantInsightGeneration(() => { throw new Error("outside request scope"); }, async () => { ran += 1; }, { actorId: "a", contactIds: ["c"] });
  assert.equal(scheduled, false);
  assert.equal(ran, 0);
  const tasks: (() => Promise<void>)[] = [];
  assert.equal(scheduleInstantInsightGeneration((task) => { tasks.push(task); }, async () => { ran += 1; }, { actorId: "a" }), true);
  assert.equal(ran, 0, "scheduled, not run inline");
});
