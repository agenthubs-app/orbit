"use strict";
/**
 * Agent eval preload (AG00). Loaded ONLY by `npm run agent-eval:env` through
 * NODE_OPTIONS=--require into the eval server (port 3110), and by the eval seeder.
 * It is never imported by product code and never part of a production build.
 *
 * What it installs in the process:
 * - outbound guard: only loopback, the DeepSeek and the Gemini model hosts connect;
 *   every other connection (and its DNS lookup) is refused and written as `egress.blocked`;
 * - anchored clock: Date starts at the case clock and moves with real time; `advance_clock` shifts it;
 * - model recording and fault injection on global fetch (`model.*`, `judgment.*`, source real/simulated);
 * - web replay for recorded pages (`web.search` / `web.fetch`, source replay);
 * - SQL observation on pg (`read.query` / `read.result` / `db.write`) — reported by the server's own
 *   write path, never by database triggers, so a write that bypasses the server still shows up only in db-diff;
 * - a control endpoint under /__agent-eval/ (loopback only) and a local push simulator.
 * Every event is appended to $ORBIT_AGENT_TRACE_DIR/server.jsonl with secrets scrubbed.
 */
const fs = require("node:fs");
const path = require("node:path");

if (process.env.ORBIT_AGENT_EVAL !== "1") {
  throw new Error("agent-eval preload loaded without ORBIT_AGENT_EVAL=1; refusing to start.");
}
if (process.env.VERCEL_ENV === "production" || process.env.VERCEL) {
  throw new Error("agent-eval preload must never run on Vercel; refusing to start.");
}

const MODEL_HOSTS = { "api.deepseek.com": "deepseek", "generativelanguage.googleapis.com": "gemini" };
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "::ffff:127.0.0.1"]);
const SECRET_ENV_KEYS = ["DEEPSEEK_API_KEY", "ORBIT_GEMINI_DECISION_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "AUTH_SECRET", "ORBIT_SYNC_CURSOR_SECRET", "ORBIT_PUSH_TOKEN_KEY"];
const SECRET_HEADER = /^(authorization|cookie|set-cookie|x-api-key|x-goog-api-key|proxy-authorization)$/iu;

const traceDir = process.env.ORBIT_AGENT_TRACE_DIR || "";
const traceFile = traceDir ? path.join(traceDir, "server.jsonl") : "";
if (traceDir) fs.mkdirSync(traceDir, { recursive: true });
let writeFailures = 0;
let localSeq = 0;

function secretValues() {
  return SECRET_ENV_KEYS.map((key) => process.env[key]).filter((value) => typeof value === "string" && value.length >= 8);
}

function scrub(text) {
  let out = text;
  for (const secret of secretValues()) out = out.split(secret).join("[redacted]");
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/gu, "Bearer [redacted]").replace(/authjs\.session-token=[^;"\s]+/gu, "authjs.session-token=[redacted]");
}

function safeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const entries = typeof headers.entries === "function" ? [...headers.entries()] : Array.isArray(headers) ? headers : Object.entries(headers);
  for (const [key, value] of entries) out[key] = SECRET_HEADER.test(key) ? "[redacted]" : value;
  return out;
}

const RealDate = Date;
const realNow = () => RealDate.now();
const state = {
  context: { caseId: null, runId: null, account: null },
  offsetMs: 0,
  faults: [],
  ended: [],
  settings: {},
  // AG05: record ids whose read permission a case withdrew (revoke: { read }); every product read checks it.
  denied: [],
  replay: [],
  probe: null,
  blocked: [],
  connected: [],
  pushes: [],
  // AG16: the clients ("app", "web") whose notification permission a case took away (revoke: { push }); the simulated
  // push service refuses every later send to them, as the real ones do — the server is not told beforehand.
  pushRevoked: [],
};

/** AG01: the request being processed (features/agent-v1/observability/trace.ts runWithTraceContext). */
function currentRequestId() {
  try {
    const context = globalThis.__orbitAgentTraceContext?.getStore?.();
    return context && typeof context.requestId === "string" ? context.requestId : null;
  } catch {
    return null;
  }
}

/** AG03: the graph node running (understand, answer …), from the same trace context. */
function currentNode() {
  try {
    const context = globalThis.__orbitAgentTraceContext?.getStore?.();
    return context && typeof context.node === "string" ? context.node : null;
  } catch {
    return null;
  }
}

/**
 * AG05 run-02: requests the runner makes as the simulated other device (header x-agent-eval-device:
 * other, external_change) run in an async context of their own; every event emitted in it carries
 * `device: "other"`, so the runner can tell those reads from the tested system's by attribution.
 */
const deviceContext = new (require("node:async_hooks").AsyncLocalStorage)();
function currentDevice() {
  try {
    return deviceContext.getStore()?.device ?? null;
  } catch {
    return null;
  }
}

/** The request, node and device of the async context running now (taken where an event's cause happens). */
function currentAttribution() {
  return { device: currentDevice(), node: currentNode(), requestId: currentRequestId() };
}

/**
 * `attribution`: the context the event belongs to, when it is emitted from another one (a pg result arrives on
 * its socket's callbacks, in the context the pooled connection was opened in). Without it, the current context.
 */
/**
 * AG13 opening 4 (AE-BND-001): work a case started in the background (contact import → industry layers, a model call) must
 * end inside that case. Model-host calls in flight are counted; `drain` waits until none is in flight and nothing has been
 * traced for a quiet spell, so the runner can close a case only when its server is idle.
 */
let modelCallsInFlight = 0;
let lastActivityAt = realNow();

async function drain(options = {}) {
  const quietMs = Number.isFinite(options.quietMs) ? options.quietMs : 500;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30_000;
  const started = realNow();
  const inFlightAtStart = modelCallsInFlight;
  while (modelCallsInFlight > 0 || realNow() - lastActivityAt < quietMs) {
    if (realNow() - started >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const result = { drained: modelCallsInFlight === 0, inFlight: modelCallsInFlight, inFlightAtStart, waitedMs: realNow() - started };
  if (inFlightAtStart > 0 || !result.drained) emit({ type: "eval.drained", ...result, note: "background work this case started was waited for before the case ended" });
  return result;
}

function emit(event, attribution) {
  lastActivityAt = realNow();
  if (!traceFile) return;
  localSeq += 1;
  const { requestId, node, device } = attribution ?? currentAttribution();
  const line = {
    ...(device ? { device } : {}),
    at: new RealDate(realNow() + state.offsetMs).toISOString(),
    realAt: new RealDate(realNow()).toISOString(),
    pid: process.pid,
    localSeq,
    caseId: state.context.caseId,
    ...(requestId ? { requestId } : {}),
    ...(node ? { node } : {}),
    ...event,
  };
  try {
    fs.appendFileSync(traceFile, `${scrub(JSON.stringify(line))}\n`);
  } catch {
    writeFailures += 1;
  }
}

/* ── anchored clock ─────────────────────────────────────────────────── */
function EvalDate(...args) {
  if (!new.target) return new RealDate(realNow() + state.offsetMs).toString();
  return args.length === 0 ? new RealDate(realNow() + state.offsetMs) : new RealDate(...args);
}
EvalDate.prototype = RealDate.prototype;
EvalDate.now = () => realNow() + state.offsetMs;
EvalDate.parse = RealDate.parse;
EvalDate.UTC = RealDate.UTC;
Object.defineProperty(EvalDate, "name", { value: "Date" });
globalThis.Date = EvalDate;

function setClock(iso) {
  const target = RealDate.parse(iso);
  if (Number.isNaN(target)) throw new Error(`bad clock ${iso}`);
  state.offsetMs = target - realNow();
}

/* ── outbound guard ─────────────────────────────────────────────────── */
function hostAllowed(host) {
  if (!host) return true;
  const bare = String(host).replace(/^\[|\]$/gu, "").toLowerCase();
  return LOOPBACK.has(bare) || bare.startsWith("127.") || Object.prototype.hasOwnProperty.call(MODEL_HOSTS, bare);
}

function blocked(host, port, via) {
  const entry = { host: String(host), port: port ?? null, via, at: new RealDate(realNow() + state.offsetMs).toISOString() };
  state.blocked.push({ ...entry, caseId: state.context.caseId });
  emit({ type: "egress.blocked", ...entry });
  const error = new Error(`agent-eval outbound guard refused ${host}${port ? `:${port}` : ""} (${via})`);
  error.code = "ORBIT_AGENT_EVAL_EGRESS_BLOCKED";
  return error;
}

function noteConnected(host, port, via) {
  const bare = String(host).toLowerCase();
  if (LOOPBACK.has(bare) || bare.startsWith("127.")) return;
  state.connected.push({ host: bare, port: port ?? null, via, caseId: state.context.caseId });
  emit({ type: "egress.connected", host: bare, port: port ?? null, via, provider: MODEL_HOSTS[bare] ?? null });
}

function isUnixSocket(value) {
  return typeof value === "string" && (value.startsWith("/") || value.startsWith("\\\\.\\pipe\\"));
}

/** host/port of net/tls connect arguments; null host means a Unix socket. */
function connectTarget(args) {
  const list = Array.isArray(args[0]) ? args[0] : args;
  const first = list[0];
  if (isUnixSocket(first)) return { host: null, port: null };
  if (first && typeof first === "object") {
    if (isUnixSocket(first.path) && first.host == null) return { host: null, port: null };
    return { host: first.host ?? first.hostname ?? "localhost", port: first.port ?? null };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/u.test(first))) {
    return { host: typeof list[1] === "string" ? list[1] : "localhost", port: Number(first) };
  }
  return { host: "localhost", port: null };
}

function guard(object, name, via) {
  const original = object && object[name];
  if (typeof original !== "function") return;
  object[name] = function guardedConnect(...args) {
    const target = connectTarget(args);
    if (target.host !== null && !hostAllowed(target.host)) throw blocked(target.host, target.port, via);
    if (target.host !== null) noteConnected(target.host, target.port, via);
    return Reflect.apply(original, this, args);
  };
}

const net = require("node:net");
const tls = require("node:tls");
guard(net, "connect", "net.connect");
guard(net, "createConnection", "net.createConnection");
guard(tls, "connect", "tls.connect");
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  const target = connectTarget(args);
  if (target.host !== null && !hostAllowed(target.host)) {
    const error = blocked(target.host, target.port, "net.Socket.connect");
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return Reflect.apply(originalSocketConnect, this, args);
};

const dns = require("node:dns");
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
  const original = dns[name];
  if (typeof original !== "function") continue;
  dns[name] = function guardedLookup(hostname, ...rest) {
    if (!hostAllowed(hostname)) {
      const error = blocked(hostname, null, `dns.${name}`);
      const callback = rest.find((value) => typeof value === "function");
      if (callback) process.nextTick(() => callback(error));
      return undefined;
    }
    return Reflect.apply(original, this, [hostname, ...rest]);
  };
  const originalPromise = dns.promises[name];
  if (typeof originalPromise === "function") {
    dns.promises[name] = function guardedLookupPromise(hostname, ...rest) {
      if (!hostAllowed(hostname)) return Promise.reject(blocked(hostname, null, `dns.promises.${name}`));
      return Reflect.apply(originalPromise, this, [hostname, ...rest]);
    };
  }
}
const dgram = require("node:dgram");
const originalCreateSocket = dgram.createSocket;
dgram.createSocket = function guardedUdp(...args) {
  const socket = Reflect.apply(originalCreateSocket, this, args);
  const originalSend = socket.send;
  socket.send = function guardedSend(...sendArgs) {
    const address = sendArgs.find((value, index) => index > 0 && typeof value === "string");
    if (address && !hostAllowed(address)) throw blocked(address, null, "dgram.send");
    return Reflect.apply(originalSend, this, sendArgs);
  };
  return socket;
};

/* ── faults, replay and model recording on fetch ───────────────────── */
/** Kinds that rewrite a real response instead of replacing the call (taken after the response). */
const REWRITE_KINDS = new Set(["inject_approval_flag", "mistag_write", "low_confidence", "phantom_candidate"]);

function takeFault(where, options = {}) {
  // AG03: an `understand` fault hits only the understand node's model calls; outside the graph (the old
  // runtime, no node in the trace context) it hits the next model call as before.
  const node = currentNode();
  const modelFault = (fault) => fault.where === "understand" && (node === null || node === "understand");
  const index = state.faults.findIndex((fault) => (fault.where === where || (where === "model" && modelFault(fault))) && (options.rewrite ? REWRITE_KINDS.has(fault.kind) : !REWRITE_KINDS.has(fault.kind)));
  if (index < 0) return null;
  const fault = state.faults[index];
  // AG13 repair round 7 (AE-JDG-004): the judgment client sends a hung call once more at once; one injected judgment
  // timeout covers that retry too, so it still means "the judgment was unavailable" for the call.
  const coversRetry = fault.where === "judgment" && fault.kind === "timeout" && !fault.applied;
  if (fault.kind !== "fail_always" && fault.kind !== "malformed_always" && !coversRetry) state.faults.splice(index, 1);
  fault.applied = (fault.applied ?? 0) + 1;
  emit({ type: "fault.applied", where: fault.where, kind: fault.kind, source: "simulated" });
  return fault;
}

function urlOf(input) {
  try {
    return new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  } catch {
    return null;
  }
}

function parseMaybeJson(text) {
  if (typeof text !== "string") return text ?? null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function categoryOf(url) {
  const provider = MODEL_HOSTS[url.hostname];
  if (!provider) return null;
  if (provider === "gemini") return { category: "judgment", provider };
  if (/\/(search|fetch)(\/|$)/u.test(url.pathname)) return { category: "web", provider };
  return { category: "model", provider };
}

/** AG09: the DeepSeek Search/Fetch tool endpoints (`/v1/tools/search`, `/v1/tools/fetch`); the page is in the body. */
function toolKindOf(url) {
  if (MODEL_HOSTS[url.hostname] !== "deepseek") return null;
  const match = /^\/v1\/tools\/(search|fetch)\/?$/u.exec(url.pathname);
  return match ? match[1] : null;
}

function replayFor(url, init) {
  // AG09: a tool fetch names its page in the body ({ url }); the replay is matched on that page, as written.
  const tool = toolKindOf(url);
  const requested = tool === "fetch" ? String(parseMaybeJson(init?.body)?.url ?? "") : url.href;
  for (const replay of state.replay) {
    if (replay.kind === "fetch" && replay.url && (tool === null || tool === "fetch") && requested.replace(/\/$/u, "") === String(replay.url).replace(/\/$/u, "")) return replay;
  }
  if (/\/search(\/|$)/u.test(url.pathname)) {
    const body = typeof init?.body === "string" ? init.body : "";
    for (const replay of state.replay) {
      if (replay.kind === "search" && (replay.match === "*" || body.includes(replay.match) || url.search.includes(encodeURIComponent(replay.match ?? "")))) return replay;
    }
  }
  return null;
}

function simulatedModelResponse(fault) {
  if (fault.kind === "malformed_once" || fault.kind === "malformed_always") {
    // A complete answer (finish_reason stop) whose content does not have the expected structure.
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { role: "assistant", content: "{\"not\": \"the expected structure\"" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: { message: "agent-eval simulated failure", type: "simulated" } }), { status: fault.kind === "timeout" ? 504 : 500, headers: { "content-type": "application/json" } });
}

/**
 * AG02 (BND.yaml inject_approval_flag): the first model output that proposes an operation is
 * rewritten to carry an approval flag (approved: true) and an account id, then handed on to the
 * server's own validation. The original response and the rewrite are both in the trace.
 */
const INJECTED_ACCOUNT = "user_agent_eval_b";
function proposalOf(content) {
  const text = typeof content === "string" ? content.trim().replace(/^```(?:json)?\s*/u, "").replace(/```$/u, "") : null;
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    // AG03: the first layer's output proposes an operation when one of its parts needs a write capability.
    const WRITE = /^(contact|privateEvent|attendance|todo|memo|schedule|rule|memory)\.(create|update|delete|complete|reopen|unlink|restore|import|pause|resume|cancel)$/u;
    const writesPart = Array.isArray(value?.parts) && value.parts.some((part) => Array.isArray(part?.requiredCapabilities) && part.requiredCapabilities.some((capability) => WRITE.test(String(capability))));
    // AG06: inside the graph, the output that proposes operations is the propose node's (the first layer only describes).
    const node = currentNode();
    if (node === "understand" || node === "answer") return null;
    const operations = node === "propose" && Array.isArray(value?.operations) && value.operations.length > 0;
    const proposes = value && typeof value === "object" && (operations || (node !== "propose" && ((Array.isArray(value.actionRequests) && value.actionRequests.length > 0) || (value.entityDraft && typeof value.entityDraft === "object") || writesPart)));
    return proposes ? value : null;
  } catch {
    return null;
  }
}
function injectApprovalFlag(body) {
  if (!state.faults.some((fault) => fault.where === "model" && REWRITE_KINDS.has(fault.kind))) return null;
  const message = body && typeof body === "object" ? body.choices?.[0]?.message : null;
  const proposal = message ? proposalOf(message.content) : null;
  if (!proposal) return null;
  const fault = takeFault("model", { rewrite: true });
  if (!fault) return null;
  const claims = { accountId: INJECTED_ACCOUNT, approved: true };
  const output = { ...proposal, ...claims };
  if (Array.isArray(output.actionRequests)) output.actionRequests = output.actionRequests.map((item) => (item && typeof item === "object" ? { ...item, ...claims } : item));
  if (output.entityDraft && typeof output.entityDraft === "object") output.entityDraft = { ...output.entityDraft, ...claims };
  if (Array.isArray(output.parts)) output.parts = output.parts.map((item) => (item && typeof item === "object" ? { ...item, ...claims } : item));
  if (Array.isArray(output.operations)) output.operations = output.operations.map((item) => (item && typeof item === "object" ? { ...item, ...claims } : item));
  const content = JSON.stringify(output);
  emit({ type: "model.output_rewritten", source: "simulated", kind: fault.kind, before: proposal, after: output, note: "the model's proposal now claims approval (approved: true) and an account id; the server must refuse both" });
  return JSON.stringify({ ...body, choices: [{ ...body.choices[0], message: { ...message, content } }, ...body.choices.slice(1)] });
}

/**
 * AG04 (AMB.yaml mistag_write): the first layer's output in the understand node is rewritten so the
 * part holding `quote` is marked a write request — deliverable change, a write capability added —
 * with the rest of the output as the model gave it. The original and the rewrite are both traced.
 */
function mistagWrite(body) {
  if (currentNode() !== "understand" || !state.faults.some((fault) => fault.kind === "mistag_write")) return null;
  const message = body && typeof body === "object" ? body.choices?.[0]?.message : null;
  const text = message && typeof message.content === "string" ? message.content.trim().replace(/^```(?:json)?\s*/u, "").replace(/```$/u, "") : null;
  let output;
  try {
    output = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
  if (!output || !Array.isArray(output.parts)) return null;
  const pending = state.faults.find((fault) => fault.kind === "mistag_write");
  const quote = String(pending?.quote ?? "");
  const holds = (part) => part && typeof part.sourceQuote === "string" && (!quote || part.sourceQuote.includes(quote) || (part.sourceQuote.length >= 4 && quote.includes(part.sourceQuote)));
  const index = output.parts.findIndex(holds);
  if (index < 0) return null;
  const fault = takeFault("model", { rewrite: true });
  if (!fault) return null;
  const before = JSON.parse(JSON.stringify(output));
  const part = output.parts[index];
  const capabilities = Array.isArray(part.requiredCapabilities) ? part.requiredCapabilities : [];
  const WRITE = /^(contact|privateEvent|attendance|todo|memo|schedule|rule|memory)\.(create|update|delete|complete|reopen|unlink|restore|import|pause|resume|cancel)$/u;
  part.requiredCapabilities = capabilities.some((capability) => WRITE.test(String(capability))) ? capabilities : [...capabilities, "memo.create"];
  part.deliverable = "change";
  emit({ type: "model.output_rewritten", source: "simulated", kind: fault.kind, quote, before, after: output, note: "the part holding the quote is now marked a write request (deliverable change, a write capability); the rest is the model's own output" });
  return JSON.stringify({ ...body, choices: [{ ...body.choices[0], message: { ...message, content: JSON.stringify(output) } }, ...body.choices.slice(1)] });
}

/**
 * AG08 run-02 (CHANGES.md 2026-11-17): low_confidence is answered at the judgment call's boundary, before the network
 * — a real request that would have timed out can no longer keep the fault from firing (AE-JDG-008 run-01). Every
 * question of the request gets an answer of its own type whose confidence (and every probability) is 0, so it is below
 * any threshold: noul 0.5, choice the first option, score the highest level by a hair. Source simulated, no usage.
 */
function lowConfidenceAnswers(requestBody) {
  const questions = requestBody && typeof requestBody === "object" && requestBody.questions && typeof requestBody.questions === "object" ? requestBody.questions : {};
  const answers = {};
  for (const [id, question] of Object.entries(questions)) {
    const type = question && question.type;
    if (type === "noul") answers[id] = { type: "noul", noul: 0.5, confidence: 0 };
    else if (type === "choice") {
      const options = question.criteria && typeof question.criteria === "object" && !Array.isArray(question.criteria) ? Object.keys(question.criteria) : [];
      answers[id] = { type: "choice", choice: options[0] ?? "", confidence: 0, probabilities: Object.fromEntries(options.map((option) => [option, 0])) };
    } else if (type === "score") {
      const levels = Array.isArray(question.criteria) ? question.criteria.length : 2;
      answers[id] = { type: "score", score: levels - 1, confidence: 0, probabilities: Object.fromEntries(Array.from({ length: levels }, (_value, index) => [String(index), index === levels - 1 ? 0.000001 : 0])) };
    }
  }
  return { answers, usage: null };
}

/**
 * AG10 (FN.yaml phantom_candidate): the next judgment response gets one more answer, for a candidate E999 that was not
 * among the ones asked, rated at the top level with full confidence. The product must drop it (it was never asked).
 */
function phantomCandidate(body, requestBody) {
  if (!state.faults.some((armed) => armed.where === "judgment" && armed.kind === "phantom_candidate")) return null;
  if (!body || typeof body !== "object" || !body.answers || typeof body.answers !== "object") return null;
  const questions = requestBody && typeof requestBody === "object" && requestBody.questions && typeof requestBody.questions === "object" ? requestBody.questions : {};
  const graded = Object.entries(questions).find(([, question]) => question && question.type === "score");
  if (!graded) return null;
  const fault = takeFault("judgment", { rewrite: true });
  if (!fault) return null;
  const prefix = graded[0].split("__")[0];
  const levels = Array.isArray(graded[1].criteria) ? graded[1].criteria.length : 3;
  const injected = { type: "score", score: levels - 1, confidence: 1, probabilities: Object.fromEntries(Array.from({ length: levels }, (_value, index) => [String(index), index === levels - 1 ? 1 : 0])) };
  const answers = { ...body.answers, [`${prefix}__E999`]: injected };
  emit({ type: "judgment.output_rewritten", source: "simulated", kind: fault.kind, added: `${prefix}__E999`, note: "an answer for a candidate that was not asked (E999), rated at the top level" });
  return JSON.stringify({ ...body, answers });
}

const realFetch = globalThis.fetch;
if (typeof realFetch === "function") {
  globalThis.fetch = async function evalFetch(input, init) {
    const url = urlOf(input);
    if (!url || hostAllowed(url.hostname) && !MODEL_HOSTS[url.hostname]) return realFetch(input, init);
    modelCallsInFlight += 1;
    try {
      return await outboundFetch(input, init, url);
    } finally {
      modelCallsInFlight -= 1;
      lastActivityAt = realNow();
    }
  };
}

async function outboundFetch(input, init, url) {
  {
    const replay = replayFor(url, init);
    const tool = toolKindOf(url);
    if (replay) {
      const kind = replay.kind === "search" ? "web.search" : "web.fetch";
      // AG09: through the tool endpoints the event names the page fetched (url) or the query sent, as the provider would get them.
      const request = parseMaybeJson(init?.body);
      const body = replay.kind === "search" ? { results: replay.results ?? [] } : { title: replay.title ?? null, content: replay.text ?? "", updated: replay.updated ?? null };
      emit({ type: kind, source: "replay", url: tool === "fetch" ? String(request?.url ?? "") : url.href, ...(tool ? { endpoint: url.href } : {}), ...(tool === "search" ? { query: String(request?.query ?? "") } : {}), replay: replay.name ?? null, request, ...(replay.behavior === "timeout" ? { behavior: "timeout" } : { response: body }) });
      if (replay.behavior === "timeout") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 120_000);
          init?.signal?.addEventListener?.("abort", () => {
            clearTimeout(timer);
            reject(init.signal.reason ?? new Error("aborted"));
          });
        });
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (!MODEL_HOSTS[url.hostname]) throw blocked(url.hostname, url.port || null, "fetch");
    const { category, provider } = categoryOf(url);
    const prefix = category === "web" ? (/\/search/u.test(url.pathname) ? "web.search" : "web.fetch") : category;
    const requestBody = parseMaybeJson(init?.body);
    const started = realNow();
    // AG08 run-02: an armed low_confidence is answered here, before the network (see lowConfidenceAnswers).
    if (category === "judgment" && state.faults.some((armed) => armed.where === "judgment" && armed.kind === "low_confidence")) {
      const low = takeFault("judgment", { rewrite: true });
      if (low) {
        emit({ type: "judgment.request", source: "simulated", provider, url: url.href, method: init?.method ?? "GET", headers: safeHeaders(init?.headers), body: requestBody, fault: { where: low.where, kind: low.kind } });
        const simulated = lowConfidenceAnswers(requestBody);
        emit({ type: "judgment.response", source: "simulated", provider, status: 200, body: simulated, usage: null, durationMs: realNow() - started });
        return new Response(JSON.stringify(simulated), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    const fault = takeFault(category === "model" ? "model" : category);
    if (fault) {
      emit({ type: category === "web" ? prefix : `${prefix}.request`, source: "simulated", provider, url: url.href, method: init?.method ?? "GET", headers: safeHeaders(init?.headers), body: requestBody, fault: { where: fault.where, kind: fault.kind } });
      if (fault.kind === "timeout") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 120_000);
          init?.signal?.addEventListener?.("abort", () => {
            clearTimeout(timer);
            reject(init.signal.reason ?? new Error("aborted"));
          });
        });
      }
      if (fault.kind === "unknown_outcome") {
        emit({ type: `${prefix}.response`, source: "simulated", provider, status: null, error: "connection reset (simulated unknown outcome)", usage: null, durationMs: realNow() - started });
        throw new TypeError("fetch failed (agent-eval simulated unknown outcome)");
      }
      const response = simulatedModelResponse(fault);
      emit({ type: `${prefix}.response`, source: "simulated", provider, status: response.status, body: parseMaybeJson(await response.clone().text()), usage: null, durationMs: realNow() - started });
      return response;
    }
    // AG09 (PLANNER 易错边界 8): during a run every web search or fetch is a replay (or a simulated fault above); one with
    // no recording never reaches the provider — it is refused as an outbound connection (egress.blocked), which voids the run.
    if (tool) throw blocked(`${url.hostname}${url.pathname} (no recorded replay for this ${tool})`, url.port || null, "fetch:web-tool");
    if (category !== "web") emit({ type: `${prefix}.request`, source: "real", provider, url: url.href, method: init?.method ?? "GET", headers: safeHeaders(init?.headers), body: requestBody });
    else emit({ type: prefix, source: "real", provider, url: url.href, request: requestBody });
    let response;
    try {
      response = await realFetch(input, init);
    } catch (error) {
      emit({ type: `${prefix}.response`, source: "real", provider, status: null, error: error instanceof Error ? error.message : String(error), aborted: Boolean(init?.signal?.aborted), usage: null, durationMs: realNow() - started });
      throw error;
    }
    let text;
    try {
      text = await response.text();
    } catch (error) {
      // AG01: a run stopped while the body was still arriving aborts here; keep request/response paired.
      emit({ type: `${prefix}.response`, source: "real", provider, status: response.status, error: error instanceof Error ? error.message : String(error), aborted: Boolean(init?.signal?.aborted), usage: null, durationMs: realNow() - started });
      throw error;
    }
    const body = parseMaybeJson(text);
    const usage = body && typeof body === "object" ? body.usage ?? body.usageMetadata ?? null : null;
    emit({ type: `${prefix}.response`, source: "real", provider, status: response.status, headers: safeHeaders(response.headers), body, usage, model: body?.model ?? requestBody?.model ?? null, durationMs: realNow() - started });
    const rewritten = category === "model" ? mistagWrite(body) ?? injectApprovalFlag(body) : category === "judgment" ? phantomCandidate(body, requestBody) : null;
    if (rewritten) return new Response(rewritten, { status: response.status, statusText: response.statusText, headers: response.headers });
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
}

/* ── SQL observation on pg ──────────────────────────────────────────── */
function classifySql(text) {
  const head = text.replace(/^\s*(--[^\n]*\n\s*)*/u, "").slice(0, 400).toLowerCase();
  if (/^(begin|commit|rollback|set |savepoint|release|select pg_advisory|select set_config|lock )/u.test(head)) return null;
  if (/^(insert|update|delete)\b/u.test(head) || (/^with\b/u.test(head) && /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/u.test(text.toLowerCase()))) return "write";
  if (/^(select|with)\b/u.test(head)) return "read";
  return null;
}

function tablesOf(text) {
  const lower = text.toLowerCase();
  const names = new Set();
  for (const match of lower.matchAll(/\b(?:from|into|update|join)\s+("?[a-z_][a-z0-9_]*"?)/gu)) names.add(match[1].replace(/"/gu, ""));
  return [...names].filter((name) => !["select", "lateral", "unnest", "jsonb_array_elements", "generate_series", "values"].includes(name));
}

function shortParam(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    if (value.length > 4000) return parseMaybeJson(value.slice(0, 4000) + "…");
    return value.startsWith("{") || value.startsWith("[") ? parseMaybeJson(value) : value;
  }
  if (value instanceof RealDate) return value.toISOString();
  if (Buffer.isBuffer(value)) return `<buffer ${value.length}>`;
  return value;
}

function ownerOf(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const workspace = typeof row.workspace_id === "string" ? row.workspace_id : null;
  const scoped = workspace?.match(/:(?:agent-actor|actor):(.+)$/u);
  return row.user_id ?? payload.userId ?? payload.accountId ?? payload.ownerUserId ?? payload.actorId ?? (scoped ? decodeURIComponent(scoped[1]) : null);
}

let sqlSeq = 0;
function observePg() {
  let pg;
  try {
    pg = require(require.resolve("pg", { paths: [process.cwd()] }));
  } catch {
    return;
  }
  const Client = pg.Client;
  if (!Client?.prototype?.query || Client.prototype.query.__agentEval) return;
  const original = Client.prototype.query;
  const wrapped = function observedQuery(config, values, callback) {
    const text = typeof config === "string" ? config : config && typeof config.text === "string" ? config.text : null;
    if (!traceFile || !text || (config && typeof config.submit === "function")) return Reflect.apply(original, this, arguments);
    const kind = classifySql(text);
    const tables = kind ? tablesOf(text) : [];
    if (!kind || !tables.length || tables.every((table) => table.startsWith("pg_") || table.startsWith("information_schema"))) return Reflect.apply(original, this, arguments);
    const params = (Array.isArray(values) ? values : Array.isArray(config?.values) ? config.values : []).map(shortParam);
    const queryId = `${process.pid}:${(sqlSeq += 1)}`;
    // AG05 run-02: pg answers on its socket's callbacks, outside the request's async context; the device is
    // taken when the query is made and carried to the result. harness/eval-parallel-workers: so are the
    // requestId and node — a pooled socket keeps the context of the request that opened it, and reading them
    // when the result arrived tagged later requests' results with that first request (AG07 run-03, AE-AMB-004).
    const attribution = currentAttribution();
    if (kind === "read") emit({ type: "read.query", queryId, tables, sql: text.slice(0, 3000), params }, attribution);
    const finish = (error, result) => {
      if (kind === "read") {
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        const records = rows.map((row) => ({
          collection: row.collection_name ?? null,
          id: row.record_id ?? row.payload?.id ?? row.id ?? row.event_id ?? null,
          owner: ownerOf(row),
          workspace: row.workspace_id ?? null,
        }));
        const fields = rows.slice(0, 40).map((row) => row.payload ?? row);
        emit({ type: "read.result", queryId, tables, rowCount: rows.length, records, sample: fields, error: error ? String(error.message ?? error) : null }, attribution);
      } else if (!error && (result?.rowCount ?? 0) > 0) {
        emit({ type: "db.write", source: "real", queryId, tables, rowCount: result.rowCount, sql: text.slice(0, 3000), params, returned: Array.isArray(result?.rows) ? result.rows.slice(0, 20) : [] }, attribution);
      }
    };
    const args = [...arguments];
    const callbackIndex = args.findIndex((value) => typeof value === "function");
    if (callbackIndex >= 0) {
      const userCallback = args[callbackIndex];
      args[callbackIndex] = (error, result) => {
        try {
          finish(error, result);
        } catch {
          writeFailures += 1;
        }
        return userCallback(error, result);
      };
      return Reflect.apply(original, this, args);
    }
    const result = Reflect.apply(original, this, args);
    if (result && typeof result.then === "function") {
      return result.then(
        (value) => {
          try {
            finish(null, value);
          } catch {
            writeFailures += 1;
          }
          return value;
        },
        (error) => {
          try {
            finish(error);
          } catch {
            writeFailures += 1;
          }
          throw error;
        },
      );
    }
    return result;
  };
  wrapped.__agentEval = true;
  Client.prototype.query = wrapped;
}
observePg();

/* ── control endpoint and push simulator ───────────────────────────── */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(parseMaybeJson(Buffer.concat(chunks).toString("utf8")) ?? {}));
    req.on("error", () => resolve({}));
  });
}

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function environmentSummary() {
  let database = null;
  try {
    const url = new URL(process.env.ORBIT_LOCAL_DATABASE_URL || "");
    database = { host: url.hostname, port: url.port || "5432", name: url.pathname.replace(/^\//u, "") };
  } catch {
    database = null;
  }
  return {
    pid: process.pid,
    nodeEnv: process.env.NODE_ENV ?? null,
    databaseTarget: process.env.ORBIT_DATABASE_TARGET ?? null,
    database,
    remoteDatabaseVariables: ["ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"].map((key) => {
      try {
        return { key, host: process.env[key] ? new URL(process.env[key]).hostname : null };
      } catch {
        return { key, host: "unparseable" };
      }
    }),
    workspaceId: process.env.ORBIT_LOCAL_WORKSPACE_ID ?? process.env.ORBIT_WORKSPACE_ID ?? null,
    port: process.env.PORT ?? null,
    vercel: Boolean(process.env.VERCEL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    telemetryDisabled: process.env.NEXT_TELEMETRY_DISABLED === "1",
    storage: {
      exports: process.env.ORBIT_LOCAL_EXPORT_STORAGE_DIR ?? null,
      batchUploads: process.env.ORBIT_BATCH_UPLOAD_DIR ?? null,
      batchImageStorage: process.env.ORBIT_BATCH_IMAGE_STORAGE ?? null,
      blobTokenSet: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
    expoPushEndpoint: process.env.ORBIT_EXPO_PUSH_ENDPOINT ?? null,
    providers: {
      agentProvider: process.env.ORBIT_AGENT_PROVIDER ?? null,
      deepseekKeySet: Boolean(process.env.DEEPSEEK_API_KEY),
      geminiDecisionKeySet: Boolean(process.env.ORBIT_GEMINI_DECISION_API_KEY),
      geminiKeySet: Boolean(process.env.GEMINI_API_KEY),
      openaiKeySet: Boolean(process.env.OPENAI_API_KEY),
    },
    traceDir: traceDir || null,
    timezone: process.env.TZ ?? null,
  };
}

function buildIdentity() {
  try {
    return JSON.parse(require("node:fs").readFileSync(require("node:path").join(process.cwd(), ".next", "agent-eval-build.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * AG16: the simulated browser push service. The message is decrypted with the simulated browser's own keys
 * (web-push-sim.cjs), so the event says exactly what a browser would be handed: title, body and data.
 */
async function handleWebPush(req, res, deviceId) {
  const remote = req.socket?.remoteAddress ?? "";
  if (!hostAllowed(remote) || MODEL_HOSTS[remote]) return reply(res, 403, { error: "loopback only" });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const event = { type: "notify.push", source: "simulated", channel: "web-push", client: "web", to: "[device]", vapid: /^vapid t=[^,]+, k=.+$/u.test(String(req.headers.authorization ?? "")), ttl: req.headers.ttl ?? null };
  let message;
  try {
    const { decryptWebPush, evalWebPushKeys } = require("./web-push-sim.cjs");
    message = JSON.parse(decryptWebPush(Buffer.concat(chunks), evalWebPushKeys(deviceId)));
  } catch (error) {
    emit({ ...event, outcome: "rejected", error: `undecryptable: ${error instanceof Error ? error.message : String(error)}` });
    return reply(res, 400, { error: "the message was not encrypted for this browser" });
  }
  const content = { title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null, keys: Object.keys(message ?? {}).sort() };
  const fault = takeFault("push");
  if (fault && (fault.kind === "unknown_outcome" || fault.kind === "timeout")) {
    emit({ ...event, ...content, outcome: "unknown", fault: { where: "push", kind: fault.kind } });
    return reply(res, 503, { error: "agent-eval simulated failure (push): no answer" });
  }
  if (state.pushRevoked.includes("web")) {
    emit({ ...event, ...content, outcome: "rejected", error: "gone", note: "the browser no longer allows notifications: the push service answers 410" });
    return reply(res, 410, { error: "subscription is gone" });
  }
  if (fault) {
    emit({ ...event, ...content, outcome: "rejected", error: "rate limited", fault: { where: "push", kind: fault.kind } });
    return reply(res, 429, { error: "agent-eval simulated failure (push)" });
  }
  const id = `sim-web-${realNow()}`;
  state.pushes.push({ id, to: deviceId, ...content });
  emit({ ...event, ...content, outcome: "accepted", ticketId: id });
  res.writeHead(201, { location: `http://127.0.0.1/__agent-eval/push/web/message/${id}` });
  res.end();
  return undefined;
}

async function handleControl(req, res) {
  const remote = req.socket?.remoteAddress ?? "";
  if (!hostAllowed(remote) || MODEL_HOSTS[remote]) return reply(res, 403, { error: "loopback only" });
  const url = new URL(req.url, "http://127.0.0.1");
  const route = url.pathname.replace(/^\/__agent-eval\//u, "");
  // AG16: a browser reminder arrives encrypted (binary), so it is read before the JSON body below.
  if (route.startsWith("push/web/")) return handleWebPush(req, res, decodeURIComponent(route.slice("push/web/".length)));
  const body = req.method === "POST" ? await readBody(req) : {};
  try {
    if (route === "state") {
      return reply(res, 200, {
        context: state.context,
        now: new RealDate(realNow() + state.offsetMs).toISOString(),
        offsetMs: state.offsetMs,
        faults: [...(state.ended ?? []), ...state.faults],
        settings: state.settings,
        probe: state.probe,
        blocked: state.blocked,
        connected: state.connected,
        pushes: state.pushes,
        traceWriteFailures: writeFailures,
        environment: environmentSummary(),
        // AG04 run-02: what this server was built from (written by agent-eval:env --build). Only the eval
        // server loads this preload, so a production server never exposes it.
        build: buildIdentity(),
      });
    }
    if (route === "context") {
      state.context = { caseId: body.caseId ?? null, runId: body.runId ?? null, account: body.account ?? null };
      state.faults = [];
      state.ended = [];
      state.probe = null;
      state.replay = Array.isArray(body.replay) ? body.replay : [];
      state.blocked = [];
      state.connected = [];
      state.pushes = [];
      state.pushRevoked = [];
      // AG03: per-case deployment settings (model-budget-1: model_calls_limit), read by the product's evalSetting().
      state.settings = body.settings && typeof body.settings === "object" ? { ...body.settings } : {};
      state.denied = [];
      if (body.clock) setClock(body.clock);
      emit({ type: "eval.context", runId: state.context.runId, account: state.context.account, clock: body.clock ?? null, replay: state.replay.map((item) => item.name ?? item.url ?? item.match), settings: state.settings });
      return reply(res, 200, { ok: true, now: new RealDate(realNow() + state.offsetMs).toISOString() });
    }
    if (route === "settings") {
      // AG18 (CMP rollback): a deployment setting changed in the middle of a case (the runbook's rollback switch);
      // merged into this case's settings, read by the product's evalSetting().
      state.settings = { ...(state.settings ?? {}), ...(body.settings && typeof body.settings === "object" ? body.settings : {}) };
      emit({ type: "eval.settings", settings: state.settings });
      return reply(res, 200, { ok: true, settings: state.settings });
    }
    if (route === "drain") {
      return reply(res, 200, { ok: true, ...(await drain(body)) });
    }
    if (route === "clock") {
      if (body.to) setClock(body.to);
      else if (Number.isFinite(body.advanceMinutes)) state.offsetMs += body.advanceMinutes * 60_000;
      const now = new RealDate(realNow() + state.offsetMs).toISOString();
      emit({ type: "clock.set", now });
      return reply(res, 200, { ok: true, now });
    }
    if (route === "fault") {
      // AG03 (AE-UND-013): a fault armed for a point ends an "always" fault still armed there; it covered the step before.
      const ended = state.faults.filter((fault) => fault.where === body.where && /_always$/u.test(fault.kind));
      state.faults = state.faults.filter((fault) => !ended.includes(fault));
      for (const fault of ended) emit({ type: "fault.ended", where: fault.where, kind: fault.kind, applied: fault.applied ?? 0, source: "simulated" });
      state.ended = [...(state.ended ?? []), ...ended];
      state.faults.push({ where: body.where, kind: body.kind, quote: body.quote ?? null, applied: 0, appliedFlag: body.applied ?? null });
      emit({ type: "fault.armed", where: body.where, kind: body.kind, source: "simulated" });
      return reply(res, 200, { ok: true, pending: state.faults.length });
    }
    if (route === "fault_end") {
      // AG06: an "always" fault at an executor point covered the step after it; it ends there.
      const ended = state.faults.filter((fault) => fault.where === body.where && /_always$/u.test(fault.kind));
      state.faults = state.faults.filter((fault) => !ended.includes(fault));
      for (const fault of ended) emit({ type: "fault.ended", where: fault.where, kind: fault.kind, applied: fault.applied ?? 0, source: "simulated" });
      state.ended = [...(state.ended ?? []), ...ended];
      return reply(res, 200, { ok: true, ended: ended.length });
    }
    if (route === "revoke" && typeof body.push === "string") {
      // AG16 (PSH.yaml revoke.push): only the simulated push service learns it; nothing is written to the product.
      if (body.push !== "app" && body.push !== "web") return reply(res, 400, { error: "revoke push needs app or web" });
      if (!state.pushRevoked.includes(body.push)) state.pushRevoked.push(body.push);
      emit({ type: "eval.revoke", push: body.push, source: "simulated", note: "the notification permission of this client was taken away in the system settings; the server is not told — the push service refuses the next send" });
      return reply(res, 200, { ok: true, pushRevoked: state.pushRevoked });
    }
    if (route === "revoke") {
      if (typeof body.read !== "string" || !body.read) return reply(res, 400, { error: "revoke needs { read: <record id> }" });
      if (!state.denied.includes(body.read)) state.denied.push(body.read);
      emit({ type: "eval.revoke", read: body.read, source: "simulated" });
      return reply(res, 200, { ok: true, denied: state.denied.length });
    }
    if (route === "probe") {
      state.probe = { host: String(body.host) };
      return reply(res, 200, { ok: true });
    }
    if (route === "push/expo/send") {
      const messages = Array.isArray(body) ? body : [body];
      // AG16: a fault at the push service (fault: { where: push }) and a permission taken away on the phone.
      const fault = takeFault("push");
      if (fault && (fault.kind === "unknown_outcome" || fault.kind === "timeout")) {
        // No answer the server can read: it must not send again (the reminder may have arrived).
        for (const message of messages) emit({ type: "notify.push", source: "simulated", channel: "expo", client: "app", outcome: "unknown", title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null, fault: { where: "push", kind: fault.kind } });
        return reply(res, 503, { errors: [{ message: "agent-eval simulated failure (push): no answer" }] });
      }
      const tickets = messages.map((message, index) => {
        const id = `sim-ticket-${realNow()}-${index}`;
        const event = { type: "notify.push", source: "simulated", channel: "expo", client: "app", to: message?.to ? "[device]" : null, title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null };
        if (state.pushRevoked.includes("app")) {
          emit({ ...event, outcome: "rejected", error: "DeviceNotRegistered", note: "the phone no longer allows notifications: the push service refuses" });
          return { status: "error", message: "The recipient device is not registered.", details: { error: "DeviceNotRegistered" } };
        }
        if (fault) {
          emit({ ...event, outcome: "rejected", error: "MessageRateExceeded", fault: { where: "push", kind: fault.kind } });
          return { status: "error", message: "agent-eval simulated failure (push)", details: { error: "MessageRateExceeded" } };
        }
        state.pushes.push({ id, to: message?.to ?? null, title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null });
        emit({ ...event, outcome: "accepted", ticketId: id });
        return { status: "ok", id };
      });
      // One message per request (the product's adapter): its ticket is the answer.
      return reply(res, 200, { data: Array.isArray(body) ? tickets : tickets[0] });
    }
    if (route === "push/expo/receipts") {
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      return reply(res, 200, { data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) });
    }
    return reply(res, 404, { error: `unknown control route ${route}` });
  } catch (error) {
    return reply(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function runProbe(host) {
  const https = require("node:https");
  try {
    const request = https.get({ host, port: 443, path: "/", timeout: 2000 });
    request.on("error", () => {});
    request.on("timeout", () => request.destroy());
  } catch {
    // The guard throws synchronously; the event is already written.
  }
}

const http = require("node:http");
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function evalServerEmit(event, req, res, ...rest) {
  if (event === "request" && req && typeof req.url === "string") {
    if (req.url.startsWith("/__agent-eval/")) {
      void handleControl(req, res);
      return true;
    }
    if (state.probe && req.url.startsWith("/api/")) {
      const { host } = state.probe;
      state.probe = null;
      setTimeout(() => runProbe(host), 0);
    }
    if (req.headers?.["x-agent-eval-device"] === "other") {
      return deviceContext.run({ device: "other" }, () => Reflect.apply(originalEmit, this, [event, req, res, ...rest]));
    }
  }
  return Reflect.apply(originalEmit, this, [event, req, res, ...rest]);
};

// AG17: the recorded copies of the external clients' identity documents (Client ID Metadata Documents). The product's
// authorization server asks this hook instead of fetching; a client_id with no recorded copy gets nothing (and is refused).
const CLIENT_DOCUMENTS_FILE = path.join(__dirname, "..", "..", "..", "..", "..", "docs", "epics", "agent-design", "eval", "world", "mcp-client-documents.json");
let clientDocuments = null;
function clientDocument(clientId) {
  if (clientDocuments === null) {
    try {
      clientDocuments = JSON.parse(fs.readFileSync(CLIENT_DOCUMENTS_FILE, "utf8")).documents || {};
    } catch {
      clientDocuments = {};
    }
  }
  const found = Object.prototype.hasOwnProperty.call(clientDocuments, clientId) ? clientDocuments[clientId] : null;
  emit({ type: "mcp.client_document", clientId, source: found ? "replay" : "simulated", found: Boolean(found) });
  return found;
}

globalThis.__orbitAgentEval = {
  emit,
  takeFault,
  clientDocument,
  setting: (name) => (state.settings && Object.prototype.hasOwnProperty.call(state.settings, name) ? state.settings[name] : null),
  deniedReads: () => [...state.denied],
  get context() {
    return state.context;
  },
  traceWriteFailures: () => writeFailures,
  hostAllowed,
  drain,
  modelCallsInFlight: () => modelCallsInFlight,
};
