import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { compareRuns, comparisonMarkdown, pathOf, percentile, readRunMetrics } from "./lib/compare-baseline";
import { deepseekCost } from "./lib/costs";

/**
 * agent-design AG18-5: the comparison with the AG00 baseline, on two fixed run folders written here: the old path
 * (protocol 2, one send until its 200) and the new entry (entry.accepted … entry.finished), the three paths, the cost
 * per successful request with the shadow pass in its own column, questions asked back and the call limit.
 */

const usage = { completion_tokens: 100, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 1000, prompt_tokens: 1000 };
const OFF_PEAK = "2026-11-15T01:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(OFF_PEAK) + seconds * 1000).toISOString();

function writeRun(root: string, name: string, cases: Record<string, { yaml: string; events: Record<string, unknown>[] }>): string {
  const dir = path.join(root, name);
  for (const [id, item] of Object.entries(cases)) {
    fs.mkdirSync(path.join(dir, "cases", id), { recursive: true });
    fs.writeFileSync(path.join(dir, "cases", id, "case.yaml"), item.yaml);
    fs.writeFileSync(path.join(dir, "cases", id, "trace.jsonl"), `${item.events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  }
  return dir;
}

const send = (seconds: number, httpId: string) => ({ httpId, method: "POST", origin: "runner", path: "/api/ai/conversations", purpose: "send", realAt: at(seconds), type: "http.request" });
const answer = (seconds: number, httpId: string, status = 200, intent = "general_conversation") => ({ body: { data: { routingDecision: { intent } } }, httpId, origin: "runner", path: "/api/ai/conversations", realAt: at(seconds), status, type: "http.response" });
const model = (seconds: number, requestId?: string) => [
  { origin: "server-preload", realAt: at(seconds), source: "real", type: "model.request", ...(requestId ? { requestId } : {}) },
  { model: "deepseek-flash", origin: "server-preload", realAt: at(seconds), source: "real", type: "model.response", usage, ...(requestId ? { requestId } : {}) },
];
const entry = (requestId: string, from: number, to: number, status = "completed") => [
  { origin: "product", realAt: at(from), requestId, type: "entry.accepted" },
  { origin: "product", realAt: at(to), requestId, status, type: "entry.finished" },
];

function fixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ag18-compare-"));
  const baseline = writeRun(root, "baseline", {
    "AE-ANS-001": { events: [send(0, "h1"), ...model(1), ...model(2), ...model(3), answer(10, "h1")], yaml: "id: AE-ANS-001\nhard: []\n" },
    "AE-BND-001": { events: [send(0, "h2"), ...model(1), answer(4, "h2", 200, "clarification")], yaml: "id: AE-BND-001\nhard:\n  - cards: { count: 1 }\n" },
    "AE-MEM-001": { events: [send(0, "h3"), answer(6, "h3", 503)], yaml: "id: AE-MEM-001\nhard: []\n" },
    "AE-OLD-ONLY": { events: [send(0, "h4"), answer(1, "h4")], yaml: "id: AE-OLD-ONLY\nhard: []\n" },
  });
  const run = writeRun(root, "run", {
    "AE-ANS-001": { events: [...entry("agreq_1", 0, 2), ...model(1, "agreq_1"), ...model(3, "shadow:request:1")], yaml: "id: AE-ANS-001\nhard: []\n" },
    "AE-BND-001": { events: [...entry("agreq_2", 0, 5, "waiting_user"), ...model(1, "agreq_2"), { kind: "question", origin: "product", requestId: "agreq_2", type: "clarify.asked" }, { kind: "entry", origin: "product", requestId: "agreq_2", type: "clarify.asked" }, { exhausted: true, limit: 4, origin: "product", requestId: "agreq_2", type: "budget", used: 4, what: "model_calls" }], yaml: "id: AE-BND-001\nhard:\n  - card_ops: []\n" },
    "AE-MEM-001": { events: [...entry("agreq_3", 0, 3), ...model(1, "agreq_3"), { origin: "server-preload", realAt: at(1), source: "simulated", type: "model.request" }], yaml: "id: AE-MEM-001\nhard: []\n" },
    "AE-NEW-ONLY": { events: [...entry("agreq_4", 0, 1)], yaml: "id: AE-NEW-ONLY\nhard: []\n" },
  });
  return { baseline, root, run };
}

test("paths: memory by area, mixed write by expected cards or writes, query otherwise", () => {
  assert.equal(pathOf({ hard: [] }, "AE-MEM-003"), "memory");
  assert.equal(pathOf({ hard: [{ cards: { count: 0 } }] }, "AE-ANS-001"), "query");
  assert.equal(pathOf({ hard: [{ cards: { count: 2 } }] }, "AE-XL-001"), "mixed_write");
  assert.equal(pathOf({ hard: [{ writes_exact: [{ target: "T42" }] }] }, "AE-CMP-002"), "mixed_write");
  assert.equal(pathOf({ hard: [{ writes_exact: "none" }] }, "AE-UND-001"), "query");
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
  assert.equal(percentile([], 95), null);
});

test("the comparison of two fixed runs: common cases only, cost per success, p50/p95 per path, questions, the limit", () => {
  const { baseline, root, run } = fixtures();
  try {
    const comparison = compareRuns(readRunMetrics(run), readRunMetrics(baseline));
    assert.deepEqual(comparison.common, ["AE-ANS-001", "AE-BND-001", "AE-MEM-001"]);
    assert.deepEqual(comparison.onlyBaseline, ["AE-OLD-ONLY"]);
    assert.deepEqual(comparison.onlyRun, ["AE-NEW-ONLY"]);
    const one = deepseekCost("deepseek-flash", usage, OFF_PEAK)!;
    const b = comparison.baseline;
    assert.deepEqual([b.requests, b.successful, b.realModelCalls], [3, 2, 4]);
    assert.ok(Math.abs(b.costCny - 4 * one) < 1e-12);
    assert.ok(Math.abs(b.costPerSuccessfulCny! - (4 * one) / 2) < 1e-12);
    assert.deepEqual([b.paths.query.p50Ms, b.paths.mixed_write.p95Ms, b.paths.memory.requests], [10_000, 4_000, 0]);
    assert.deepEqual([b.clarifications, b.budgetHits, b.budgetReached], [1, 0, 1]);
    const r = comparison.run;
    assert.deepEqual([r.requests, r.successful, r.realModelCalls, r.shadowModelCalls, r.simulatedModelCalls], [3, 3, 3, 1, 1]);
    assert.ok(Math.abs(r.costCny - 3 * one) < 1e-12);
    assert.ok(Math.abs(r.shadowCostCny - one) < 1e-12);
    assert.ok(Math.abs(r.costPerSuccessfulCny! - one) < 1e-12);
    assert.deepEqual([r.paths.query.p95Ms, r.paths.mixed_write.p50Ms, r.paths.memory.p50Ms], [2_000, 5_000, 3_000]);
    assert.deepEqual([r.clarifications, r.budgetHits, r.budgetReached], [1, 1, 1]);
    const markdown = comparisonMarkdown(comparison);
    assert.match(markdown, /只比两次都跑过的 3 例/u);
    assert.match(markdown, /影子通路/u);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
