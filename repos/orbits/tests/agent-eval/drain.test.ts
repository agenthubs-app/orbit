import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), "preload", "eval-preload.cjs");

/**
 * AG13 opening 4 (AE-BND-001): a model call a case started in the background must end inside that case. The preload's
 * drain waits for model-host calls in flight and a quiet spell; nothing here reaches the network (the model call is
 * answered by an armed timeout fault and aborted locally).
 */
function runWithPreload(script: string) {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-drain-"));
  const result = spawnSync(process.execPath, ["--require", PRELOAD, "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ORBIT_AGENT_EVAL: "1", ORBIT_AGENT_TRACE_DIR: traceDir, DEEPSEEK_API_KEY: "sk-test-secret-value-0001" } as unknown as NodeJS.ProcessEnv,
    timeout: 20_000,
  });
  const traceFile = path.join(traceDir, "server.jsonl");
  const events = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  fs.rmSync(traceDir, { force: true, recursive: true });
  return { events, result };
}

const CONTROL = `
  const http = require("node:http");
  const control = (port, route, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/__agent-eval/" + route, method: "POST" }, (res) => {
      let text = ""; res.on("data", (c) => (text += c)); res.on("end", () => resolve(JSON.parse(text)));
    });
    req.on("error", reject); req.end(JSON.stringify(body ?? {}));
  });
`;

test("drain waits for a model call still in flight, then the case may end; an idle server answers at once", () => {
  const { events, result } = runWithPreload(`${CONTROL}
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      const out = {};
      out.idle = await control(port, "drain", { quietMs: 50, timeoutMs: 2000 });
      await control(port, "context", { caseId: "AE-CON-010" });
      await control(port, "fault", { where: "model", kind: "timeout" });
      const call = fetch("https://api.deepseek.com/chat/completions", { method: "POST", body: "{}", signal: AbortSignal.timeout(400) }).catch((e) => "aborted");
      out.inFlight = globalThis.__orbitAgentEval.modelCallsInFlight();
      out.busy = await control(port, "drain", { quietMs: 100, timeoutMs: 5000 });
      out.call = await call;
      server.close();
      console.log(JSON.stringify(out));
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.idle.drained, true);
  assert.ok(out.idle.waitedMs < 1500, `idle drain took ${out.idle.waitedMs} ms`);
  assert.equal(out.inFlight, 1);
  assert.equal(out.busy.drained, true);
  assert.equal(out.busy.inFlightAtStart, 1);
  assert.ok(out.busy.waitedMs >= 300, `waited ${out.busy.waitedMs} ms for the call in flight`);
  assert.equal(out.call, "aborted");
  const drained = events.find((event) => event.type === "eval.drained");
  assert.ok(drained, "the wait is in the trace");
  assert.equal(drained.caseId, "AE-CON-010", "under the case that started the work");
});

test("drain gives up after its timeout and says the work is still running", () => {
  const { result } = runWithPreload(`${CONTROL}
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      await control(port, "fault", { where: "model", kind: "timeout" });
      const controller = new AbortController();
      const call = fetch("https://api.deepseek.com/chat/completions", { method: "POST", body: "{}", signal: controller.signal }).catch(() => "aborted");
      const out = await control(port, "drain", { quietMs: 50, timeoutMs: 300 });
      controller.abort();
      await call;
      server.close();
      console.log(JSON.stringify(out));
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.drained, false);
  assert.equal(out.inFlight, 1);
});

test("AG13 repair round 7 (AE-JDG-004): one injected judgment timeout covers the client's immediate retry, then is spent", () => {
  const { result } = runWithPreload(`${CONTROL}
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      await control(port, "fault", { where: "judgment", kind: "timeout" });
      const take = () => globalThis.__orbitAgentEval.takeFault("judgment");
      const out = { first: take()?.kind ?? null, retry: take()?.kind ?? null, next: take()?.kind ?? null };
      await control(port, "fault", { where: "model", kind: "timeout" });
      const model = { first: globalThis.__orbitAgentEval.takeFault("model")?.kind ?? null, second: globalThis.__orbitAgentEval.takeFault("model")?.kind ?? null };
      server.close();
      console.log(JSON.stringify({ ...out, model }));
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.first, "timeout");
  assert.equal(out.retry, "timeout", "the client's retry of the same call times out too");
  assert.equal(out.next, null, "the next call is not affected");
  assert.deepEqual(out.model, { first: "timeout", second: null }, "a model timeout stays one-shot");
});
