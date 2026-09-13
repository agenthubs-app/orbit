import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const modulePath = require.resolve("../scripts/qa/provider-budget.cjs");
const preloadPath = require.resolve("../scripts/qa/provider-budget-preload.cjs");
const { initializeBudgetLedger, readLedger, createBudgetFetch } = require(modulePath);
const endpoint = "https://api.deepseek.com/chat/completions";
const successfulPayload = { model: "deepseek-flash", choices: [{ message: { content: "synthetic reply" } }], usage: {
  prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100,
  prompt_cache_hit_tokens: 900, prompt_cache_miss_tokens: 100,
  completion_tokens_details: { reasoning_tokens: 50 }
} };

function workspace(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "orbit-provider-budget-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "ledger.json");
  initializeBudgetLedger(file);
  return file;
}

function requestInit(extra: Record<string, unknown> = {}): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer synthetic-test-only" },
    body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "synthetic prompt" }], ...extra }) };
}

async function runChild(file: string, code: string) {
  return promisify(execFile)(process.execPath, ["-e", code], { env: { ...process.env, ORBIT_QA_BUDGET_LEDGER: file }, timeout: 15000 });
}

test("budget refuses the fifth unknown-cost request before network and survives a process restart", async t => {
  const file = workspace(t); let networkCalls = 0;
  const guarded = createBudgetFetch({ file, fetchImplementation: async () => { networkCalls++; return Response.json({}); } });
  for (let n = 0; n < 4; n++) await guarded(endpoint, requestInit());
  await assert.rejects(guarded(endpoint, requestInit()), /BUDGET_EXHAUSTED/);
  assert.equal(networkCalls, 4); assert.equal(readLedger(file).accountedMicroUsd, 4_400_000);
  const child = await runChild(file, `const b=require(${JSON.stringify(modulePath)});const f=b.createBudgetFetch({file:process.env.ORBIT_QA_BUDGET_LEDGER,fetchImplementation:async()=>{throw Error("NETWORK_REACHED")}});f(${JSON.stringify(endpoint)},${JSON.stringify(requestInit())}).then(()=>console.log("allowed"),e=>console.log(e.message));`);
  assert.match(child.stdout, /BUDGET_EXHAUSTED/); assert.doesNotMatch(child.stdout, /NETWORK_REACHED|allowed/);
});

test("budget settles complete usage conservatively without consuming the caller response or changing the request", async t => {
  const file = workspace(t); const controller = new AbortController();
  const init = { ...requestInit(), signal: controller.signal, cache: "no-store" as const };
  const guarded = createBudgetFetch({ file, fetchImplementation: async (input: unknown, options: RequestInit) => {
    assert.equal(readLedger(file).accountedMicroUsd, 1_100_000);
    assert.equal(input, endpoint); assert.equal(options.body, init.body); assert.equal(options.headers, init.headers);
    assert.equal(options.signal, controller.signal); assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
    return Response.json(successfulPayload);
  } });
  const response = await guarded(endpoint, init);
  assert.deepEqual(await response.json(), successfulPayload);
  assert.equal(readLedger(file).accountedMicroUsd, 572);
  assert.equal(readLedger(file).entries[0].status, "settled");
  const bytes = readFileSync(file, "utf8");
  assert.doesNotMatch(bytes, /synthetic prompt|synthetic reply|Bearer|authorization/);
});

for (const [name, payload, status] of [
  ["missing usage", {}, 200], ["partial usage", { ...successfulPayload, usage: { prompt_tokens: 1 } }, 200],
  ["inconsistent total", { ...successfulPayload, usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1000 } }, 200],
  ["unknown response model", { ...successfulPayload, model: "unpriced-pro" }, 200],
  ["out of bounds", { ...successfulPayload, usage: { prompt_tokens: 1048577, completion_tokens: 1, total_tokens: 1048578 } }, 200],
  ["fractional tokens", { ...successfulPayload, usage: { prompt_tokens: 1.5, completion_tokens: 1, total_tokens: 2.5 } }, 200],
  ["error response", successfulPayload, 503], ["not JSON", "<html>gateway</html>", 200],
] as const) test("budget retains the full reservation for " + name, async t => {
  const file = workspace(t);
  const guarded = createBudgetFetch({ file, fetchImplementation: async () => typeof payload === "string" ? new Response(payload, { status }) : Response.json(payload, { status }) });
  await guarded(endpoint, requestInit());
  assert.equal(readLedger(file).accountedMicroUsd, 1_100_000); assert.equal(readLedger(file).entries[0].status, "reserved");
});

test("budget retains timeout costs and does not reserve for a pre-aborted request", async t => {
  const file = workspace(t); let calls = 0;
  const guarded = createBudgetFetch({ file, fetchImplementation: async () => { calls++; throw new Error("provider timeout"); } });
  await assert.rejects(guarded(endpoint, requestInit()), /provider timeout/);
  await assert.rejects(guarded(endpoint, { ...requestInit(), signal: AbortSignal.abort() }));
  assert.equal(calls, 1); assert.equal(readLedger(file).accountedMicroUsd, 1_100_000);
});

for (const [url, extra] of [
  ["https://api.openai.com/v1/responses", {}], ["http://api.deepseek.com/chat/completions", {}],
  ["https://api.deepseek.com/other", {}], [endpoint + "?variant=other", {}],
  [endpoint, { model: "unpriced-pro" }], [endpoint, { stream: true }], [endpoint, { n: 2 }],
  [endpoint, { max_tokens: 393217 }], [endpoint, { max_tokens: 0 }],
  [endpoint, { tools: [{ type: "web_search" }] }], [endpoint, { service_tier: "unknown" }],
  [endpoint, { max_completion_tokens: 393217 }],
] as const) test("budget rejects unpriced network before sending " + JSON.stringify([url, extra]), async t => {
  const file = workspace(t); let calls = 0;
  const guarded = createBudgetFetch({ file, fetchImplementation: async () => { calls++; return Response.json({}); } });
  await assert.rejects(guarded(url, requestInit(extra)), /BUDGET_UNPRICED_REQUEST/);
  assert.equal(calls, 0); assert.equal(readLedger(file).accountedMicroUsd, 0);
});

test("budget preserves the cap on repeated initialization and rejects corrupt or locked ledgers", async t => {
  const file = workspace(t);
  assert.throws(() => initializeBudgetLedger(file));
  let calls = 0; const guarded = createBudgetFetch({ file, fetchImplementation: async () => { calls++; return Response.json({}); } });
  mkdirSync(file + ".lock"); await assert.rejects(guarded(endpoint, requestInit()), /BUDGET_LEDGER_LOCKED/);
  rmdirSync(file + ".lock");
  writeFileSync(file, JSON.stringify({ version: 1, capMicroUsd: 500_000_000, entries: [] }));
  await assert.rejects(guarded(endpoint, requestInit()), /BUDGET_LEDGER_INVALID/);
  rmSync(file); await assert.rejects(guarded(endpoint, requestInit()), /BUDGET_LEDGER_INVALID/);
  assert.equal(calls, 0);
});

test("budget inspection never consumes a Request supplied by the actual fetch caller", async t => {
  const file = workspace(t); const request = new Request(endpoint, requestInit());
  const guarded = createBudgetFetch({ file, fetchImplementation: async (input: Request) => {
    assert.equal(input, request); assert.equal(input.bodyUsed, false); assert.equal(await input.text(), requestInit().body);
    return Response.json(successfulPayload);
  } });
  assert.deepEqual(await (await guarded(request)).json(), successfulPayload);
  assert.equal(readLedger(file).accountedMicroUsd, 572);
});

test("budget only permits known non-model origins and never follows redirects", async t => {
  const file = workspace(t); const sent: string[] = [];
  const guarded = createBudgetFetch({ file, supabaseOrigin: "https://qa-project.supabase.co", fetchImplementation: async (input: string, init: RequestInit) => {
    sent.push(input); assert.equal(init.redirect, "error"); return Response.json({ success: true });
  } });
  await guarded("http://localhost:3000/api/health"); await guarded("https://qa-project.supabase.co/rest/v1/example");
  for (const url of ["https://qa-project.supabase.co/functions/v1/model", "https://other.supabase.co/rest/v1/example", "https://unknown.example/", "http://localhost:9999/model"]) {
    await assert.rejects(guarded(url), /BUDGET_UNPRICED_REQUEST/);
  }
  assert.equal(sent.length, 2); assert.equal(readLedger(file).accountedMicroUsd, 0);
});

test("budget reservations from concurrent processes share one hard cap", async t => {
  const file = workspace(t);
  const code = `const b=require(${JSON.stringify(modulePath)});const f=b.createBudgetFetch({file:process.env.ORBIT_QA_BUDGET_LEDGER,fetchImplementation:async()=>{console.log("NETWORK_ALLOWED");return Response.json({})}});f(${JSON.stringify(endpoint)},${JSON.stringify(requestInit())}).catch(e=>console.log(e.message));`;
  const results = await Promise.all(Array.from({ length: 12 }, () => runChild(file, code)));
  const allowed = results.filter(result => result.stdout.includes("NETWORK_ALLOWED")).length;
  assert.ok(allowed > 0 && allowed <= 4, `only four full reservations fit, got ${allowed}`);
  assert.equal(readLedger(file).accountedMicroUsd, allowed * 1_100_000);
  assert.equal(readLedger(file).entries.length, allowed);
});

test("real preload guards the worker fetch and emits sanitized HTTP observations", async t => {
  const file = workspace(t);
  const child = await runChild(file, `
    const realFetch=global.fetch;
    global.fetch=async(input,init)=>{if(String(input).startsWith("https://api.deepseek.com"))return Response.json(${JSON.stringify(successfulPayload)});return realFetch(input,init)};
    require(${JSON.stringify(preloadPath)});
    const http=require("node:http");
    const server=http.createServer(async(req,res)=>{await fetch(${JSON.stringify(endpoint)},${JSON.stringify(requestInit())});res.setHeader("content-type","application/json");res.end("{}");});
    server.listen(0,"127.0.0.1",async()=>{const port=server.address().port;await realFetch("http://127.0.0.1:"+port+"/api/ai/conversations/sessions/private-session?secret=private-query",{headers:{cookie:"private-cookie"}});server.close();});
  `);
  const output = child.stdout + child.stderr;
  assert.match(output, /"event":"http"/); assert.match(output, /"event":"settled"/);
  assert.doesNotMatch(output, /private-session|private-query|private-cookie|synthetic prompt|Bearer/);
  const events = output.split("\n").filter(line => line.startsWith("{\"orbitQa\":")).map(line => JSON.parse(line).orbitQa);
  const httpEvent = events.find(event => event.event === "http"); const settled = events.find(event => event.event === "settled");
  assert.equal(httpEvent.status, 200); assert.equal(httpEvent.contentType, "application/json");
  assert.ok(httpEvent.requestId); assert.equal(settled.requestId, httpEvent.requestId);
  assert.equal(readLedger(file).accountedMicroUsd, 572);
});

test("preload refuses to start when its persistent ledger is missing", async t => {
  const file = workspace(t);
  await assert.rejects(runChild(file + ".missing", `require(${JSON.stringify(preloadPath)});console.log("STARTED_UNGUARDED");`), error => {
    const failure = error as Error & { stdout: string; stderr: string };
    assert.match(failure.stderr, /BUDGET_LEDGER_INVALID/); assert.doesNotMatch(failure.stdout, /STARTED_UNGUARDED|ready/); return true;
  });
});

test("OCR transcription, structuring and optional verification are all charged independently", async t => {
  const file = workspace(t); let calls = 0;
  const guarded = createBudgetFetch({ file, fetchImplementation: async () => { calls++; return Response.json(calls < 3 ? successfulPayload : {}); } });
  for (const model of ["deepseek-v4-flash-vision-exp", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
    await guarded(endpoint, requestInit({ model }));
  }
  assert.equal(calls, 3); assert.equal(readLedger(file).entries.length, 3);
  assert.equal(readLedger(file).accountedMicroUsd, 1_101_144);
});
