import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), "preload", "eval-preload.cjs");

/**
 * Runs a probe script in a child process with the eval preload, as the eval server runs.
 * Nothing here reaches the network: blocked hosts are refused before DNS, model calls are
 * answered by an armed fault, and the only real socket is a loopback server inside the child.
 */
function runWithPreload(script: string) {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-egress-"));
  const result = spawnSync(process.execPath, ["--require", PRELOAD, "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ORBIT_AGENT_EVAL: "1", ORBIT_AGENT_TRACE_DIR: traceDir, DEEPSEEK_API_KEY: "sk-test-secret-value-0001" } as unknown as NodeJS.ProcessEnv,
    timeout: 20_000,
  });
  const traceFile = path.join(traceDir, "server.jsonl");
  const events = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  const raw = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8") : "";
  fs.rmSync(traceDir, { force: true, recursive: true });
  return { events, raw, result };
}

test("the preload refuses to load without ORBIT_AGENT_EVAL=1", () => {
  const result = spawnSync(process.execPath, ["--require", PRELOAD, "-e", "0"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ORBIT_AGENT_EVAL=1/u);
});

test("only the DeepSeek and Gemini model hosts and loopback are allowed", () => {
  const { result } = runWithPreload(`
    const h = globalThis.__orbitAgentEval.hostAllowed;
    console.log(JSON.stringify({
      deepseek: h("api.deepseek.com"), gemini: h("generativelanguage.googleapis.com"),
      loopback: h("127.0.0.1"), localhost: h("localhost"), v6: h("::1"),
      neon: h("ep-cool-smoke.neon.tech"), blob: h("blob.vercel-storage.com"), expo: h("exp.host"), probe: h("collect.example.test"),
    }));`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { blob: false, deepseek: true, expo: false, gemini: true, localhost: true, loopback: true, neon: false, probe: false, v6: true });
});

test("other connections are refused and each writes egress.blocked; loopback still works", () => {
  const { events, result } = runWithPreload(`
    const net = require("node:net"), dns = require("node:dns"), https = require("node:https"), http = require("node:http");
    const out = {};
    try { net.connect({ host: "collect.example.test", port: 443 }); out.net = "connected"; } catch (e) { out.net = e.code; }
    dns.lookup("collect.example.test", (e) => { out.dns = e && e.code;
      try { https.get("https://ep-cool-smoke.neon.tech/").on("error", () => {}); out.https = "connected"; } catch (e2) { out.https = e2.code; }
      fetch("https://blob.vercel-storage.com/x").then(() => { out.fetch = "connected"; }, (e3) => { out.fetch = e3.code; }).then(() => {
        const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", () => {
          http.get({ host: "127.0.0.1", port: server.address().port, path: "/" }, (res) => { out.loopback = res.statusCode; server.close(); console.log(JSON.stringify(out)); });
        });
      });
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.net, "ORBIT_AGENT_EVAL_EGRESS_BLOCKED");
  assert.equal(out.dns, "ORBIT_AGENT_EVAL_EGRESS_BLOCKED");
  assert.equal(out.https, "ORBIT_AGENT_EVAL_EGRESS_BLOCKED");
  assert.equal(out.fetch, "ORBIT_AGENT_EVAL_EGRESS_BLOCKED");
  assert.equal(out.loopback, 200);
  const blockedHosts = events.filter((event) => event.type === "egress.blocked").map((event) => event.host);
  assert.deepEqual([...new Set(blockedHosts)].sort(), ["blob.vercel-storage.com", "collect.example.test", "ep-cool-smoke.neon.tech"]);
  for (const event of events.filter((item) => item.type === "egress.blocked")) assert.ok(event.at && event.via);
});

test("an armed model fault answers without a real call, is marked simulated and carries no usage; no secret in the log", () => {
  const { events, raw, result } = runWithPreload(`
    const http = require("node:http");
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      await fetch("http://127.0.0.1:" + port + "/__agent-eval/fault", { method: "POST", body: JSON.stringify({ where: "model", kind: "fail_once" }) });
      const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { authorization: "Bearer " + process.env.DEEPSEEK_API_KEY }, body: JSON.stringify({ model: "deepseek-v4-flash", messages: [] }) });
      console.log(response.status);
      server.close();
    });`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "500");
  const request = events.find((event) => event.type === "model.request");
  const response = events.find((event) => event.type === "model.response");
  assert.equal(request?.source, "simulated");
  assert.equal(response?.source, "simulated");
  assert.equal(response?.usage, null);
  assert.equal(request?.headers?.authorization, "[redacted]");
  assert.ok(!raw.includes("sk-test-secret-value-0001"), "the key never reaches the log");
});

test("the anchored clock starts at the case clock and advance_clock moves it", () => {
  const { result } = runWithPreload(`
    const http = require("node:http");
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const base = "http://127.0.0.1:" + server.address().port;
      await fetch(base + "/__agent-eval/context", { method: "POST", body: JSON.stringify({ caseId: "AE-H-001", clock: "2026-11-15T10:00:00+09:00" }) });
      const first = Date.now();
      await fetch(base + "/__agent-eval/clock", { method: "POST", body: JSON.stringify({ advanceMinutes: 70 }) });
      const second = Date.now();
      console.log(JSON.stringify({ first: new Date(first).toISOString(), delta: Math.round((second - first) / 60000) }));
      server.close();
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.ok(Math.abs(Date.parse(out.first) - Date.parse("2026-11-15T01:00:00Z")) < 5_000, out.first);
  assert.equal(out.delta, 70);
});

test("AG09: a tool fetch is answered from its replay by the page in the body; a web call with no replay is refused (egress.blocked)", () => {
  const { events, result } = runWithPreload(`
    const http = require("node:http");
    const server = http.createServer((req, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
      const base = "http://127.0.0.1:" + server.address().port;
      const replay = [{ kind: "fetch", name: "director-bio", url: "https://toto-film.example.test/directors/koreeda-maki", title: "简介", text: "现任东都映画创作总监。" }];
      await fetch(base + "/__agent-eval/context", { method: "POST", body: JSON.stringify({ caseId: "AE-WEB-T", clock: "2026-11-15T10:00:00+09:00", replay }) });
      const page = await (await fetch("https://api.deepseek.com/v1/tools/fetch", { method: "POST", body: JSON.stringify({ url: "https://toto-film.example.test/directors/koreeda-maki" }) })).json();
      let refused = null;
      try {
        await fetch("https://api.deepseek.com/v1/tools/search", { method: "POST", body: JSON.stringify({ query: "Acme Cloud 官网 价格", count: 3 }) });
      } catch (error) {
        refused = error.code;
      }
      console.log(JSON.stringify({ content: page.content, refused }));
      server.close();
    });`);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.content, "现任东都映画创作总监。");
  assert.equal(out.refused, "ORBIT_AGENT_EVAL_EGRESS_BLOCKED");
  const fetched = events.find((event) => event.type === "web.fetch");
  assert.equal(fetched?.source, "replay");
  assert.equal(fetched?.url, "https://toto-film.example.test/directors/koreeda-maki", "the event names the page, not the endpoint");
  assert.ok(events.some((event) => event.type === "egress.blocked" && String(event.host).includes("/v1/tools/search")));
  assert.equal(events.filter((event) => event.type === "web.search").length, 0, "nothing was searched");
});
