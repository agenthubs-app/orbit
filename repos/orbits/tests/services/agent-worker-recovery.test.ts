import assert from "node:assert/strict";
import test from "node:test";
import { runAgentWorkerLoop, settleAgentWorkerBatch } from "../../scripts/agent-worker-loop";

test("agent worker survives transient failures, caps backoff and resets after success", async () => {
  const controller = new AbortController();
  const delays: number[] = [];
  const failures: number[] = [];
  let iterations = 0;
  await runAgentWorkerLoop({
    signal: controller.signal,
    pollIntervalMs: 2000,
    onFailure: (delay) => failures.push(delay),
    wait: async (delay) => { delays.push(delay); },
    runIteration: async () => {
      iterations += 1;
      if (iterations <= 7 || iterations === 9) throw new Error("transient database outage");
      if (iterations === 10) controller.abort();
    },
  });
  assert.equal(iterations, 10);
  assert.deepEqual(failures, [2000, 4000, 8000, 16000, 30000, 30000, 30000, 2000]);
  assert.deepEqual(delays, [...failures.slice(0, 7), 2000, 2000]);
});

test("a failed batch waits for in-flight work before allowing a retry", async () => {
  let finish!: () => void;
  let finished = false;
  const pending = new Promise<string>((resolve) => { finish = () => resolve("completed"); });
  const batch = settleAgentWorkerBatch([Promise.reject(new Error("private provider payload")), pending]);
  const observed = batch.catch((error: Error) => { finished = true; return error.message; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  finish();
  assert.equal(await observed, "Agent worker batch failed.");
  assert.deepEqual(await settleAgentWorkerBatch([Promise.resolve(3), Promise.resolve("ok")]), [3, "ok"]);
});

test("shutdown drains the current iteration and does not begin another", async () => {
  const controller = new AbortController();
  let finish!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  let count = 0;
  let stopped = false;
  const worker = runAgentWorkerLoop({
    signal: controller.signal,
    pollIntervalMs: 60_000,
    onFailure: () => assert.fail("unexpected failure"),
    runIteration: async () => {
      count += 1;
      started();
      await new Promise<void>((resolve) => { finish = resolve; });
    },
  }).then(() => { stopped = true; });
  await startedPromise;
  controller.abort();
  await Promise.resolve();
  assert.equal(stopped, false);
  finish();
  await worker;
  assert.equal(count, 1);
});
