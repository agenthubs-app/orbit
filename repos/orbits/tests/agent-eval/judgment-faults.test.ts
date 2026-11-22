import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), "preload", "eval-preload.cjs");

/**
 * AG08 run-02 (CHANGES.md 2026-11-17): an armed judgment fault fires at the judgment call's boundary, before the
 * network, so a real request's latency can never keep it from firing (AE-JDG-008 run-01: fault_not_fired after a
 * 3 s timeout). The probe runs in a child process with the eval preload, as the eval server does.
 */
function runWithPreload(script: string) {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-judgment-"));
  const result = spawnSync(process.execPath, ["--require", PRELOAD, "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ORBIT_AGENT_EVAL: "1", ORBIT_AGENT_TRACE_DIR: traceDir } as unknown as NodeJS.ProcessEnv,
    timeout: 20_000,
  });
  const traceFile = path.join(traceDir, "server.jsonl");
  const events = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  fs.rmSync(traceDir, { force: true, recursive: true });
  return { events, result };
}

const REQUEST = {
  input: [{ text: "x", type: "text" }],
  model: "gemini-decision-1",
  questions: {
    duplicate_same__d1: { criteria: { different: "d", same: "s", unsure: "u" }, instructions: "?", type: "choice" },
    intent_explicitWrite__m: { instructions: "?", type: "noul" },
    match_level__c1: { criteria: ["insufficient", "partial", "match"], instructions: "?", type: "score" },
  },
};

for (const kind of ["low_confidence", "timeout", "fail_always"] as const) {
  test(`judgment ${kind} fires before the network: no real request is made, the fault is applied`, () => {
    const { events, result } = runWithPreload(`
      const http = require("node:http");
      const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
        const port = server.address().port;
        await fetch("http://127.0.0.1:" + port + "/__agent-eval/fault", { method: "POST", body: JSON.stringify({ where: "judgment", kind: ${JSON.stringify(kind)} }) });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300);
        const out = {};
        try {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/decisions", { method: "POST", headers: { "x-goog-api-key": "not-a-real-key" }, body: ${JSON.stringify(JSON.stringify(REQUEST))}, signal: controller.signal });
          out.status = response.status;
          out.body = await response.json();
        } catch (error) {
          out.error = controller.signal.aborted ? "aborted" : String(error);
        }
        clearTimeout(timer);
        console.log(JSON.stringify(out));
        server.close();
      });`);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout.trim());
    const requests = events.filter((event) => event.type === "judgment.request");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].source, "simulated", "no real request reaches the endpoint");
    assert.ok(events.some((event) => event.type === "fault.applied" && event.where === "judgment" && event.kind === kind), "the fault is applied");
    if (kind === "low_confidence") {
      assert.equal(out.status, 200);
      for (const answer of Object.values(out.body.answers) as { confidence: number }[]) assert.equal(answer.confidence, 0);
      assert.deepEqual(Object.keys(out.body.answers).sort(), Object.keys(REQUEST.questions).sort(), "one answer per question asked");
    } else if (kind === "timeout") assert.equal(out.error, "aborted", "the request hangs until the caller's own timeout");
    else assert.equal(out.status, 500);
  });
}
