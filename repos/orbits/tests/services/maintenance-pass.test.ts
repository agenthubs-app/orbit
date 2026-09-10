import assert from "node:assert/strict";
import test from "node:test";
import { handleMaintenanceRequest } from "../../features/operations/maintenance/http";
import { runMaintenancePass, type MaintenancePassResult, type MaintenanceTask } from "../../features/operations/maintenance/pass";

const clock = (start: number, stepMs: number) => {
  let current = start;
  return () => {
    const value = new Date(current);
    current += stepMs;
    return value;
  };
};

test("maintenance pass isolates failures, records skips and never leaks error detail", async () => {
  const lines: string[] = [];
  const order: string[] = [];
  const tasks: MaintenanceTask[] = [
    { name: "ok", async run() { order.push("ok"); return { published: 2, failed: 0 }; } },
    { name: "partial", async run() { order.push("partial"); return { deleted: 1, failed: 1 }; } },
    { name: "throws", async run() { order.push("throws"); throw new (class ProviderError extends Error {
      constructor() { super("provider said: secret-token-123"); this.name = "ProviderError"; }
    })(); } },
    { name: "skip", async run() { order.push("skip"); return { skipped: "mail_unconfigured" }; } },
    { name: "after", async run() { order.push("after"); return { sent: 1 }; } },
  ];
  const result = await runMaintenancePass({ tasks, now: clock(Date.parse("2026-09-08T00:00:00Z"), 1_000), log: (line) => lines.push(line) });
  assert.deepEqual(order, ["ok", "partial", "throws", "skip", "after"]);
  assert.equal(result.ok, 2);
  assert.equal(result.failed, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.tasks.map((task) => [task.name, task.status, task.reason ?? null]), [
    ["ok", "ok", null],
    ["partial", "failed", "partial_failure"],
    ["throws", "failed", "ProviderError"],
    ["skip", "skipped", "mail_unconfigured"],
    ["after", "ok", null],
  ]);
  assert.deepEqual(result.tasks[0].summary, { published: 2, failed: 0 });
  assert.equal(result.startedAt, "2026-09-08T00:00:00.000Z");
  assert.ok(result.tasks.every((task) => task.durationMs >= 0));
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("secret-token-123"));
  assert.ok(!JSON.stringify(result).includes("secret-token-123"));
});

test("maintenance pass stops starting tasks once the budget is exhausted", async () => {
  let ran = 0;
  const tasks: MaintenanceTask[] = [
    { name: "first", async run({ deadline }) { ran++; assert.equal(deadline, 3_000); return { done: 1 }; } },
    { name: "second", async run() { ran++; return { done: 1 }; } },
    { name: "third", async run() { ran++; return { done: 1 }; } },
  ];
  // Each clock read advances 2 s; a 3 s budget admits the first task only.
  const result = await runMaintenancePass({ tasks, budgetMs: 3_000, now: clock(0, 2_000), log: () => undefined });
  assert.equal(ran, 1);
  assert.deepEqual(result.tasks.map((task) => [task.status, task.reason ?? null]), [
    ["ok", null], ["skipped", "budget_exhausted"], ["skipped", "budget_exhausted"],
  ]);
  assert.equal(result.failed, 0);
});

test("maintenance pass survives a throwing logger", async () => {
  const result = await runMaintenancePass({ tasks: [], log: () => { throw new Error("stdout closed"); } });
  assert.equal(result.tasks.length, 0);
});

const secret = "0123456789abcdef0123456789abcdef";
const passResult = (failed: number): MaintenancePassResult => ({
  startedAt: "2026-09-08T00:00:00.000Z", durationMs: 5, budgetMs: 240_000, ok: 1, failed, skipped: 0,
  tasks: [{ name: "x", status: failed ? "failed" : "ok", durationMs: 5, reason: failed ? "Boom" : undefined }],
});
const request = (auth?: string, query = "") =>
  new Request(`https://test/api/internal/maintenance${query}`, { headers: auth ? { authorization: auth } : {} });

test("maintenance endpoint rejects missing, wrong and short secrets before touching any task", async () => {
  let runs = 0;
  const deps = { run: async () => { runs++; return passResult(0); }, ensureHeartbeat: async () => null };
  for (const [auth, configured] of [[undefined, secret], ["Bearer nope", secret], [`Bearer ${secret}`, undefined], ["Bearer short", "short"]] as const) {
    const response = await handleMaintenanceRequest(request(auth), deps, configured);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const query = await handleMaintenanceRequest(request(`Bearer ${secret}`, "?limit=1"), deps, secret);
  assert.equal(query.status, 400);
  assert.equal(runs, 0);
});

test("maintenance endpoint reports the pass and heartbeat outcome with 503 on any failure", async () => {
  const ok = await handleMaintenanceRequest(request(`Bearer ${secret}`), {
    run: async () => passResult(0), ensureHeartbeat: async () => ({ outcome: "started", chainId: "c" }),
  }, secret);
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.heartbeat, "started");

  const disabled = await handleMaintenanceRequest(request(`Bearer ${secret}`), {
    run: async () => passResult(0), ensureHeartbeat: async () => null,
  }, secret);
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).data.heartbeat, "disabled");

  const failedTask = await handleMaintenanceRequest(request(`Bearer ${secret}`), {
    run: async () => passResult(1), ensureHeartbeat: async () => ({ outcome: "alive", chainId: "c" }),
  }, secret);
  assert.equal(failedTask.status, 503);
  assert.equal((await failedTask.json()).data.pass.failed, 1);

  const failedHeartbeat = await handleMaintenanceRequest(request(`Bearer ${secret}`), {
    run: async () => passResult(0), ensureHeartbeat: async () => { throw new Error("queue offline: token=abc"); },
  }, secret);
  assert.equal(failedHeartbeat.status, 503);
  const body = await failedHeartbeat.text();
  assert.ok(body.includes('"heartbeat":"failed"'));
  assert.ok(!body.includes("token=abc"));

  const unavailable = await handleMaintenanceRequest(request(`Bearer ${secret}`), {
    run: async () => { throw new Error("db down"); }, ensureHeartbeat: async () => null,
  }, secret);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: { code: "MAINTENANCE_UNAVAILABLE" } });
});
