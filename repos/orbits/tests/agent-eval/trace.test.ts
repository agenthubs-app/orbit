import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { emitTrace, takeEvalFault, traceWriteFailures } from "../../features/agent-v1/observability/trace";

const originalDir = process.env.ORBIT_AGENT_TRACE_DIR;
afterEach(() => {
  if (originalDir === undefined) delete process.env.ORBIT_AGENT_TRACE_DIR;
  else process.env.ORBIT_AGENT_TRACE_DIR = originalDir;
  delete (globalThis as { __orbitAgentEval?: unknown }).__orbitAgentEval;
});

test("without ORBIT_AGENT_TRACE_DIR emitTrace writes nothing and does not throw", () => {
  delete process.env.ORBIT_AGENT_TRACE_DIR;
  const cwdBefore = fs.readdirSync(process.cwd()).sort();
  assert.doesNotThrow(() => emitTrace({ type: "card.frozen", cardId: "x" }));
  assert.deepEqual(fs.readdirSync(process.cwd()).sort(), cwdBefore);
  assert.equal(takeEvalFault("executor"), null);
});

test("with ORBIT_AGENT_TRACE_DIR emitTrace appends one JSON line without secrets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-"));
  process.env.ORBIT_AGENT_TRACE_DIR = dir;
  emitTrace({ type: "exec.call", source: "real", headers: { authorization: "Bearer sk-abc", accept: "json" }, apiKey: "sk-123" });
  const lines = fs.readFileSync(path.join(dir, "server.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.type, "exec.call");
  assert.equal(event.origin, "product");
  assert.equal(event.headers.authorization, "[redacted]");
  assert.equal(event.apiKey, "[redacted]");
  assert.equal(event.headers.accept, "json");
  fs.rmSync(dir, { force: true, recursive: true });
});

test("a failed write is counted, swallowed and does not change the caller's result", () => {
  process.env.ORBIT_AGENT_TRACE_DIR = path.join(os.tmpdir(), "agent-trace-missing", String(Date.now()), "nested");
  const before = traceWriteFailures();
  const caller = () => {
    emitTrace({ type: "card.frozen", cardId: "x" });
    return 42;
  };
  assert.equal(caller(), 42);
  assert.equal(traceWriteFailures(), before + 1);
});

test("the eval hook, when present, receives the event and owns fault injection", () => {
  const seen: Record<string, unknown>[] = [];
  (globalThis as { __orbitAgentEval?: unknown }).__orbitAgentEval = {
    emit: (event: Record<string, unknown>) => seen.push(event),
    takeFault: (where: string) => (where === "executor" ? { kind: "fail_once", where } : null),
  };
  emitTrace({ type: "card.frozen", cardId: "a" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, "card.frozen");
  assert.deepEqual(takeEvalFault("executor"), { kind: "fail_once", where: "executor" });
  assert.equal(takeEvalFault("model"), null);
});
