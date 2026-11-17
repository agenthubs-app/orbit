import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildEvalEnvironment } from "./lib/env-guard";
import { CaseQueue, cleanupWorkerSync, CONNECTIONS_PER_WORKER, inSelectionOrder, maxWorkersFor, prepareWorkerDatabase, rateLimitedResponses, WorkerPool } from "./lib/parallel";
import { withRestoreLock } from "./lib/snapshot";

/**
 * harness/eval-parallel-workers: `agent-eval:run -- --workers N`. The queue, the merge order, the bounded
 * retry of rate-limited cases, a worker dying mid-case, and the guard that never lets the cleanup touch the
 * main eval database. The pool is driven with a stand-in worker program (no database, no server, no model).
 */

const good = {
  ORBIT_AGENT_EVAL: "1",
  ORBIT_DATABASE_TARGET: "local",
  ORBIT_LOCAL_DATABASE_URL: "postgresql://eval@127.0.0.1:5432/orbit_agent_eval",
  ORBIT_WORKSPACE_ID: "workspace:agent-eval",
  ORBIT_LOCAL_WORKSPACE_ID: "workspace:agent-eval",
  ORBIT_AGENT_EVAL_PORT: "3110",
  ORBIT_AGENT_EVAL_HOME: "/tmp/agent-eval-test-home",
};

test("the queue hands out cases in selection order to whoever asks, and holds a retried case until its backoff has passed", () => {
  const queue = new CaseQueue(["A", "B", "C"]);
  assert.deepEqual(queue.take(1000), { attempt: 1, caseId: "A" });
  queue.retry("A", 2, 5000);
  assert.deepEqual(queue.take(1000), { attempt: 1, caseId: "B" });
  assert.deepEqual(queue.take(1000), { attempt: 1, caseId: "C" });
  assert.equal(queue.take(1000), null, "A waits for its backoff");
  assert.equal(queue.nextStart(), 5000);
  assert.deepEqual(queue.take(5000), { attempt: 2, caseId: "A" });
  assert.equal(queue.size, 0);
});

test("outcomes are merged in selection order, whatever order the workers finished in", () => {
  const merged = inSelectionOrder([{ caseId: "C" }, { caseId: "A" }, { caseId: "B" }], ["A", "B", "C"]);
  assert.deepEqual(merged.map((item) => item.caseId), ["A", "B", "C"]);
});

test("a 429 on a model or judgment response counts as rate-limited; other statuses and events do not", () => {
  const events = [
    { type: "model.response", status: 429 },
    { type: "judgment.response", status: 429 },
    { type: "model.response", status: 200 },
    { type: "http.response", status: 429 },
    { type: "model.request", status: 429 },
  ];
  assert.equal(rateLimitedResponses(events as never), 2);
});

test("the cleanup and the database preparation refuse the main eval database", () => {
  const main = buildEvalEnvironment({}, good);
  assert.throws(() => cleanupWorkerSync(main), /only a parallel worker's local database/u);
  assert.throws(() => prepareWorkerDatabase(main, "/nonexistent.dump"), /only a parallel worker's local database/u);
});

const FAKE_WORKER = `
const fs = require("node:fs");
const path = require("node:path");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const worker = Number(arg("--worker"));
const runDir = arg("--run-dir");
const held = new Map();
process.send({ type: "ready", worker, selfCheck: { checks: [], ok: true }, selfCheckOk: true, failed: [] });
process.on("message", (message) => {
  if (message.type === "case") {
    if (message.caseId === "CRASH" && worker === 2) process.exit(3);
    const dir = path.join(runDir, "cases", message.caseId);
    fs.mkdirSync(dir, { recursive: true });
    if (process.env.FAKE_SICK_WORKER === String(worker)) {
      // The runner fails before the case runs (as with "sorry, too many clients already").
      const checks = [{ check: "runner", status: "cannot_judge", args: null, detail: "the runner failed on this case: Error: sorry, too many clients already", evidence: [] }];
      setTimeout(() => process.send({ type: "done", worker, caseId: message.caseId, attempt: message.attempt, outcome: { caseId: message.caseId, area: "T", account: "", hardPass: false, checks, unsupported: [], simulated: false, fake: false, events: [], durationMs: 0, dir, error: "Error: sorry, too many clients already" } }), 5);
      return;
    }
    fs.writeFileSync(path.join(dir, "trace.jsonl"), JSON.stringify({ seq: 1, attempt: message.attempt, worker }) + "\\n");
    const rateLimited = message.caseId === "RATE" && message.attempt === 1;
    const events = rateLimited ? [{ seq: 1, type: "model.response", status: 429, source: "real" }] : [{ seq: 1, type: "model.request", source: "real" }];
    const checks = [{ check: "costs_complete", status: "deferred", args: null, detail: "", evidence: [] }];
    held.set(message.caseId, checks);
    setTimeout(() => process.send({ type: "done", worker, caseId: message.caseId, attempt: message.attempt, outcome: { caseId: message.caseId, area: "T", account: "A", hardPass: true, checks, unsupported: [], simulated: false, fake: false, events, durationMs: 5, dir } }), message.caseId === "SLOW" ? 300 : 20);
  } else if (message.type === "settle") {
    const results = message.keep.map((caseId) => ({ caseId, checks: [{ ...held.get(caseId)[0], status: "pass" }], hardPass: true }));
    process.send({ type: "settled", worker, results }, () => process.exit(0));
  }
});
`;

test("the pool runs every case once from one queue, retries a rate-limited case, survives a worker dying mid-case, and settles each case on the worker that holds it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-pool-"));
  const script = path.join(dir, "fake-worker.cjs");
  fs.writeFileSync(script, FAKE_WORKER);
  const runDir = path.join(dir, "run");
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  const pool = new WorkerPool([{ worker: 1 }, { worker: 2 }], { backoffMs: () => 50, runDir, runId: "test-run", script, sealed: false, seedCards: false, worlds: [] });
  try {
    const ready = await pool.start();
    assert.deepEqual([...ready.keys()].sort(), [1, 2]);
    const ids = ["SLOW", "A", "RATE", "B", "CRASH", "C", "D"];
    const finished: string[] = [];
    const result = await pool.run(ids, () => "T", (outcome) => finished.push(outcome.caseId));
    assert.deepEqual(result.outcomes.map((outcome) => outcome.caseId), ids, "one final outcome per case, in selection order");
    assert.equal(new Set(finished).size, ids.length);
    assert.equal(finished.length, ids.length, "no case reported twice");
    // The work queue: while worker 1 is busy with SLOW, worker 2 takes the next cases.
    assert.equal(result.outcomes.find((outcome) => outcome.caseId === "A")!.worker, 2);
    // Bounded retry of the 429: attempt 1 kept apart, attempt 2 is the case.
    assert.equal(result.retried.length, 1);
    assert.equal(result.retried[0].caseId, "RATE");
    assert.ok(fs.existsSync(path.join(runDir, "retried", "RATE-attempt-1", "trace.jsonl")));
    assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, "cases", "RATE", "trace.jsonl"), "utf8")).attempt, 2);
    // Worker 2 died in CRASH: that case fails visibly (runner, cannot_judge), the rest ran on worker 1.
    const crashed = result.outcomes.find((outcome) => outcome.caseId === "CRASH")!;
    assert.equal(crashed.hardPass, false);
    assert.equal(crashed.checks[0].check, "runner");
    assert.match(crashed.checks[0].detail, /worker 2 exited \(code 3\)/u);
    assert.ok(result.problems.some((problem) => /worker 2 exited/u.test(problem)));
    for (const id of ["C", "D"]) assert.equal(result.outcomes.find((outcome) => outcome.caseId === id)!.worker, 1);
    // Settling: each case on the worker that ran its final attempt; worker 2's earlier cases are reported as not settled.
    const owner = new Map(result.outcomes.filter((outcome) => outcome.caseId !== "CRASH").map((outcome) => [outcome.caseId, outcome.worker]));
    const settled = await pool.settle({ voided: false }, owner);
    for (const [caseId, worker] of owner) {
      if (worker === 1) assert.equal(settled.results.get(caseId)?.checks[0].status, "pass", caseId);
    }
    const workerTwoCases = [...owner].filter(([, worker]) => worker === 2).map(([caseId]) => caseId);
    if (workerTwoCases.length) assert.ok(settled.problems.some((problem) => problem.includes("worker 2 had exited")));
  } finally {
    pool.kill();
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("a worker whose runner keeps failing is retired after two in a row, and its cases run once more on the others", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-pool-sick-"));
  const script = path.join(dir, "fake-worker.cjs");
  fs.writeFileSync(script, FAKE_WORKER);
  const runDir = path.join(dir, "run");
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  process.env.FAKE_SICK_WORKER = "2";
  const pool = new WorkerPool([{ worker: 1 }, { worker: 2 }], { runDir, runId: "test-run", script, sealed: false, seedCards: false, worlds: [] });
  try {
    await pool.start();
    const ids = ["SLOW", "A", "B", "C", "D", "E"];
    const result = await pool.run(ids, () => "T", () => undefined);
    assert.deepEqual(result.outcomes.map((outcome) => outcome.caseId), ids);
    assert.ok(result.outcomes.every((outcome) => outcome.hardPass), "every case ran on the healthy worker in the end");
    assert.ok(result.outcomes.every((outcome) => outcome.worker === 1));
    assert.equal(result.retried.filter((item) => item.reason === "runner_crash").length, 2, "only the two failures before retirement were run again");
    assert.ok(result.problems.some((problem) => /worker 2 retired after 2 runner failures/u.test(problem)));
  } finally {
    delete process.env.FAKE_SICK_WORKER;
    pool.kill();
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test("the connection budget: about 20 connections per worker beside what other databases hold", () => {
  assert.equal(CONNECTIONS_PER_WORKER, 20);
  // The machine on 2026-11-17: max_connections 100, 3 reserved, ~10 held by other databases.
  assert.equal(maxWorkersFor({ maxConnections: 100, otherConnections: 10, reserved: 3 }), 4);
  assert.equal(maxWorkersFor({ maxConnections: 200, otherConnections: 10, reserved: 3 }), 9);
  assert.equal(maxWorkersFor({ maxConnections: 20, otherConnections: 10, reserved: 3 }), 1, "never below one");
});

test("snapshot restores take turns under the restore lock; a lock left by a dead process is taken over; no lock, no waiting", async () => {
  assert.equal(withRestoreLock(() => 7, undefined), 7);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-restore-lock-"));
  const lock = path.join(dir, "restore.lock");
  try {
    fs.writeFileSync(lock, "999999");
    assert.equal(withRestoreLock(() => fs.readFileSync(lock, "utf8"), lock), String(process.pid));
    assert.equal(fs.existsSync(lock), false, "released after use");
    const snapshotModule = path.join(path.dirname(fileURLToPath(import.meta.url)), "lib", "snapshot.ts");
    const holder = (index: number) => `
      import(${JSON.stringify(snapshotModule)}).then((module) => {
        const withRestoreLock = module.withRestoreLock ?? module.default.withRestoreLock;
        const fs = require("node:fs");
        withRestoreLock(() => {
          const start = Date.now();
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
          fs.appendFileSync(${JSON.stringify(path.join(dir, "intervals"))}, JSON.stringify([start, Date.now(), ${index}]) + "\\n");
        }, ${JSON.stringify(lock)});
      });`;
    await Promise.all([0, 1, 2].map((index) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "-e", holder(index)], { stdio: "inherit" });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`holder ${index} exited ${code}`))));
    })));
    const intervals = fs.readFileSync(path.join(dir, "intervals"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as [number, number, number]).sort((a, b) => a[0] - b[0]);
    assert.equal(intervals.length, 3);
    for (let index = 1; index < intervals.length; index += 1) assert.ok(intervals[index][0] >= intervals[index - 1][1], "no two restores at once");
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
