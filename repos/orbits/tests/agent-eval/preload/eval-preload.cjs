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
  replay: [],
  probe: null,
  blocked: [],
  connected: [],
  pushes: [],
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

function emit(event) {
  if (!traceFile) return;
  localSeq += 1;
  const requestId = currentRequestId();
  const line = {
    at: new RealDate(realNow() + state.offsetMs).toISOString(),
    realAt: new RealDate(realNow()).toISOString(),
    pid: process.pid,
    localSeq,
    caseId: state.context.caseId,
    ...(requestId ? { requestId } : {}),
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
function takeFault(where) {
  const index = state.faults.findIndex((fault) => fault.where === where || (where === "model" && fault.where === "understand"));
  if (index < 0) return null;
  const fault = state.faults[index];
  if (fault.kind !== "fail_always" && fault.kind !== "malformed_always") state.faults.splice(index, 1);
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

function replayFor(url, init) {
  for (const replay of state.replay) {
    if (replay.kind === "fetch" && replay.url && url.href.replace(/\/$/u, "") === String(replay.url).replace(/\/$/u, "")) return replay;
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
    return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "{\"not\": \"the expected structure\"" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: { message: "agent-eval simulated failure", type: "simulated" } }), { status: fault.kind === "timeout" ? 504 : 500, headers: { "content-type": "application/json" } });
}

const realFetch = globalThis.fetch;
if (typeof realFetch === "function") {
  globalThis.fetch = async function evalFetch(input, init) {
    const url = urlOf(input);
    if (!url || hostAllowed(url.hostname) && !MODEL_HOSTS[url.hostname]) return realFetch(input, init);
    const replay = replayFor(url, init);
    if (replay) {
      const kind = replay.kind === "search" ? "web.search" : "web.fetch";
      emit({ type: kind, source: "replay", url: url.href, replay: replay.name ?? null, request: parseMaybeJson(init?.body) });
      if (replay.behavior === "timeout") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 120_000);
          init?.signal?.addEventListener?.("abort", () => {
            clearTimeout(timer);
            reject(init.signal.reason ?? new Error("aborted"));
          });
        });
      }
      const body = replay.kind === "search" ? { results: replay.results ?? [] } : { title: replay.title ?? null, content: replay.text ?? "", updated: replay.updated ?? null };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (!MODEL_HOSTS[url.hostname]) throw blocked(url.hostname, url.port || null, "fetch");
    const { category, provider } = categoryOf(url);
    const prefix = category === "web" ? (/\/search/u.test(url.pathname) ? "web.search" : "web.fetch") : category;
    const requestBody = parseMaybeJson(init?.body);
    const started = realNow();
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
    if (category !== "web") emit({ type: `${prefix}.request`, source: "real", provider, url: url.href, method: init?.method ?? "GET", headers: safeHeaders(init?.headers), body: requestBody });
    else emit({ type: prefix, source: "real", provider, url: url.href, request: requestBody });
    let response;
    try {
      response = await realFetch(input, init);
    } catch (error) {
      emit({ type: `${prefix}.response`, source: "real", provider, status: null, error: error instanceof Error ? error.message : String(error), usage: null, durationMs: realNow() - started });
      throw error;
    }
    const text = await response.text();
    const body = parseMaybeJson(text);
    const usage = body && typeof body === "object" ? body.usage ?? body.usageMetadata ?? null : null;
    emit({ type: `${prefix}.response`, source: "real", provider, status: response.status, headers: safeHeaders(response.headers), body, usage, model: body?.model ?? requestBody?.model ?? null, durationMs: realNow() - started });
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
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
    if (kind === "read") emit({ type: "read.query", queryId, tables, sql: text.slice(0, 3000), params });
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
        emit({ type: "read.result", queryId, tables, rowCount: rows.length, records, sample: fields, error: error ? String(error.message ?? error) : null });
      } else if (!error && (result?.rowCount ?? 0) > 0) {
        emit({ type: "db.write", source: "real", queryId, tables, rowCount: result.rowCount, sql: text.slice(0, 3000), params, returned: Array.isArray(result?.rows) ? result.rows.slice(0, 20) : [] });
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

async function handleControl(req, res) {
  const remote = req.socket?.remoteAddress ?? "";
  if (!hostAllowed(remote) || MODEL_HOSTS[remote]) return reply(res, 403, { error: "loopback only" });
  const url = new URL(req.url, "http://127.0.0.1");
  const route = url.pathname.replace(/^\/__agent-eval\//u, "");
  const body = req.method === "POST" ? await readBody(req) : {};
  try {
    if (route === "state") {
      return reply(res, 200, {
        context: state.context,
        now: new RealDate(realNow() + state.offsetMs).toISOString(),
        offsetMs: state.offsetMs,
        faults: state.faults,
        probe: state.probe,
        blocked: state.blocked,
        connected: state.connected,
        pushes: state.pushes,
        traceWriteFailures: writeFailures,
        environment: environmentSummary(),
      });
    }
    if (route === "context") {
      state.context = { caseId: body.caseId ?? null, runId: body.runId ?? null, account: body.account ?? null };
      state.faults = [];
      state.probe = null;
      state.replay = Array.isArray(body.replay) ? body.replay : [];
      state.blocked = [];
      state.connected = [];
      state.pushes = [];
      if (body.clock) setClock(body.clock);
      emit({ type: "eval.context", runId: state.context.runId, account: state.context.account, clock: body.clock ?? null, replay: state.replay.map((item) => item.name ?? item.url ?? item.match) });
      return reply(res, 200, { ok: true, now: new RealDate(realNow() + state.offsetMs).toISOString() });
    }
    if (route === "clock") {
      if (body.to) setClock(body.to);
      else if (Number.isFinite(body.advanceMinutes)) state.offsetMs += body.advanceMinutes * 60_000;
      const now = new RealDate(realNow() + state.offsetMs).toISOString();
      emit({ type: "clock.set", now });
      return reply(res, 200, { ok: true, now });
    }
    if (route === "fault") {
      state.faults.push({ where: body.where, kind: body.kind, quote: body.quote ?? null, applied: 0, appliedFlag: body.applied ?? null });
      emit({ type: "fault.armed", where: body.where, kind: body.kind, source: "simulated" });
      return reply(res, 200, { ok: true, pending: state.faults.length });
    }
    if (route === "probe") {
      state.probe = { host: String(body.host) };
      return reply(res, 200, { ok: true });
    }
    if (route === "push/expo/send") {
      const messages = Array.isArray(body) ? body : [body];
      const tickets = messages.map((message, index) => {
        const id = `sim-ticket-${realNow()}-${index}`;
        state.pushes.push({ id, to: message?.to ?? null, title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null });
        emit({ type: "notify.push", source: "simulated", channel: "expo", ticketId: id, to: message?.to ? "[device]" : null, title: message?.title ?? null, body: message?.body ?? null, data: message?.data ?? null });
        return { status: "ok", id };
      });
      return reply(res, 200, { data: tickets });
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
  }
  return Reflect.apply(originalEmit, this, [event, req, res, ...rest]);
};

globalThis.__orbitAgentEval = {
  emit,
  takeFault,
  get context() {
    return state.context;
  },
  traceWriteFailures: () => writeFailures,
  hostAllowed,
};
