"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const http = require("node:http");

// QA-only ceiling; these conservative rates exceed the public Flash peak price
// checked on 2026-09-13. Re-verify pricing/context limits before a later run.
const CAP = 5_000_000;
const RESERVATION = 1_100_000;
const MAX_INPUT = 1_048_576;
const MAX_OUTPUT = 393_216;
const MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "deepseek-flash"]);
const RESPONSE_MODELS = new Set([...MODELS, "deepseek-v4.1-flash"]);
const REQUEST_FIELDS = new Set(["model", "messages", "stream", "n", "max_tokens", "thinking", "temperature", "response_format"]);
const requestContext = new AsyncLocalStorage();

function initializeBudgetLedger(file) {
  if (!path.isAbsolute(file)) throw new Error("BUDGET_LEDGER_INVALID");
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ version: 1, capMicroUsd: CAP, entries: [] }) + "\n");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

function readLedger(file) {
  try {
    if (!path.isAbsolute(file) || !fs.lstatSync(file).isFile()) throw new Error();
    const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
    if (ledger.version !== 1 || ledger.capMicroUsd !== CAP || !Array.isArray(ledger.entries)) throw new Error();
    const ids = new Set(); let accountedMicroUsd = 0;
    for (const entry of ledger.entries) {
      if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !MODELS.has(entry.model)) throw new Error();
      ids.add(entry.id);
      if (entry.status === "reserved") {
        if (entry.microUsd !== RESERVATION) throw new Error();
      } else if (entry.status === "settled") {
        if (!Number.isSafeInteger(entry.promptTokens) || entry.promptTokens <= 0 || entry.promptTokens > MAX_INPUT ||
            !Number.isSafeInteger(entry.completionTokens) || entry.completionTokens < 0 || entry.completionTokens > MAX_OUTPUT ||
            entry.microUsd !== Math.ceil((entry.promptTokens * 44 + entry.completionTokens * 132) / 100)) throw new Error();
      } else throw new Error();
      accountedMicroUsd += entry.microUsd;
    }
    if (!Number.isSafeInteger(accountedMicroUsd) || accountedMicroUsd > CAP) throw new Error();
    return { ...ledger, accountedMicroUsd };
  } catch { throw new Error("BUDGET_LEDGER_INVALID"); }
}

function withLedger(file, update) {
  const lock = file + ".lock";
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error("BUDGET_LEDGER_LOCKED"); }
  try {
    const ledger = readLedger(file);
    const result = update(ledger);
    const temporary = file + "." + randomUUID() + ".tmp";
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ version: 1, capMicroUsd: CAP, entries: ledger.entries }) + "\n");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    const directoryFd = fs.openSync(path.dirname(file), "r");
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    return result;
  } finally { fs.rmdirSync(lock); }
}

function createBudgetFetch({ file, fetchImplementation, supabaseOrigin, log = () => {} }) {
  if (typeof fetchImplementation !== "function") throw new Error("BUDGET_FETCH_UNAVAILABLE");
  return async function budgetFetch(input, init) {
    const request = new Request(input instanceof Request ? input.clone() : input, init);
    request.signal.throwIfAborted();
    const url = new URL(request.url);
    const local = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"].includes(url.origin);
    const storage = supabaseOrigin && url.origin === supabaseOrigin &&
      url.protocol === "https:" && /^\/(auth|rest|storage)\/v1\//.test(url.pathname);
    if (local || storage) return fetchImplementation(input, { ...init, redirect: "error" });
    if (url.origin !== "https://api.deepseek.com" || url.pathname !== "/chat/completions" ||
        url.search || request.method !== "POST") throw new Error("BUDGET_UNPRICED_REQUEST");
    let body;
    try { body = JSON.parse(await request.clone().text()); }
    catch { throw new Error("BUDGET_UNPRICED_REQUEST"); }
    if (!body || Object.keys(body).some(key => !REQUEST_FIELDS.has(key)) || !MODELS.has(body.model) || (body.stream !== undefined && body.stream !== false) ||
        (body.n !== undefined && body.n !== 1) || (body.max_tokens !== undefined && body.max_tokens !== null &&
        (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > MAX_OUTPUT))) {
      throw new Error("BUDGET_UNPRICED_REQUEST");
    }
    request.signal.throwIfAborted();
    const id = randomUUID(); const requestId = requestContext.getStore() ?? null;
    withLedger(file, ledger => {
      if (ledger.accountedMicroUsd + RESERVATION > CAP) throw new Error("BUDGET_EXHAUSTED");
      ledger.entries.push({ id, requestId, model: body.model, at: new Date().toISOString(), status: "reserved", microUsd: RESERVATION });
    });
    log({ event: "reserved", id, requestId, model: body.model, microUsd: RESERVATION });
    let response;
    try { response = await fetchImplementation(input, { ...init, redirect: "error" }); }
    catch (error) { log({ event: "retained", id, requestId, reason: "network_result_unknown" }); throw error; }
    try {
      if (response.status !== 200) throw new Error();
      const payload = await response.clone().json(); const usage = payload?.usage;
      if (!RESPONSE_MODELS.has(payload?.model) || !usage ||
          !Number.isSafeInteger(usage.prompt_tokens) || usage.prompt_tokens <= 0 || usage.prompt_tokens > MAX_INPUT ||
          !Number.isSafeInteger(usage.completion_tokens) || usage.completion_tokens < 0 || usage.completion_tokens > MAX_OUTPUT ||
          usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) throw new Error();
      const microUsd = Math.ceil((usage.prompt_tokens * 44 + usage.completion_tokens * 132) / 100);
      withLedger(file, ledger => {
        const entry = ledger.entries.find(item => item.id === id);
        if (!entry || entry.status !== "reserved") throw new Error("BUDGET_LEDGER_INVALID");
        Object.assign(entry, { status: "settled", microUsd, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens });
      });
      log({ event: "settled", id, requestId, microUsd, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens });
    } catch { log({ event: "retained", id, requestId, reason: "usage_unconfirmed" }); }
    return response;
  };
}

function sanitizeRoute(raw) {
  const known = new Set(["api", "ai", "conversations", "sessions", "health", "profile", "account", "me", "events", "contacts", "tasks", "today", "update-suggestions"]);
  return new URL(raw, "http://localhost").pathname.split("/").map(part => !part || known.has(part) ? part :
    ":id-" + createHash("sha256").update(part).digest("hex").slice(0, 8)).join("/");
}

function responseEvidence(body, tooLarge, encoded) {
  if (tooLarge) return { state: "skipped_too_large" };
  if (encoded) return { state: "skipped_encoded" };
  let payload;
  try { payload = JSON.parse(body.toString("utf8")); }
  catch { return { state: "invalid_json" }; }
  const evidence = { state: "parsed", envelopeSuccess: typeof payload?.success === "boolean" ? payload.success : null };
  if (payload?.success === false) {
    const codes = new Set(["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"]);
    const reasons = new Map([
      ["The configured model provider returned an Orbit Agent planner response outside the allowed schema.", "provider_schema_invalid"],
      ["deepseek planner output did not match the Orbit Agent schema.", "provider_schema_invalid"],
      ["The configured model provider did not return a usable Orbit Agent response.", "provider_unusable_response"],
      ["deepseek response did not include output text.", "provider_missing_output"],
      ["A configured model provider API key is required before the live Orbit Agent can reply.", "provider_key_missing"],
      ["BUDGET_EXHAUSTED", "budget_exhausted"], ["BUDGET_UNPRICED_REQUEST", "budget_unpriced_request"],
      ["BUDGET_LEDGER_INVALID", "budget_ledger_invalid"], ["BUDGET_LEDGER_LOCKED", "budget_ledger_locked"]
    ]);
    return { ...evidence, errorCode: codes.has(payload.error?.code) ? payload.error.code : "unrecognized",
      reason: reasons.get(payload.error?.message) ?? "unclassified" };
  }
  const data = payload?.data; const provenance = data?.provenance;
  const methods = new Set(["fixture", "rule-based-agent-reply", "rule-based-agent-state", "gemini-live-agent-reply", "gemini-live-agent-state", "model-provider-live-agent-reply", "model-provider-live-agent-state"]);
  if (methods.has(provenance?.generationMethod)) evidence.generationMethod = provenance.generationMethod;
  if (["deepseek", "gemini", "openai"].includes(data?.diagnostics?.provider)) evidence.provider = data.diagnostics.provider;
  if (RESPONSE_MODELS.has(data?.diagnostics?.model)) evidence.model = data.diagnostics.model;
  if (typeof provenance?.safety?.aiProviderRequested === "boolean") evidence.aiProviderRequested = provenance.safety.aiProviderRequested;
  if (typeof provenance?.safety?.domainToolCallsExecuted === "boolean") evidence.domainToolsExecuted = provenance.safety.domainToolCallsExecuted;
  if (typeof data?.storage?.persisted === "boolean") evidence.persisted = data.storage.persisted;
  if (typeof data?.session?.id === "string") evidence.sessionRef = createHash("sha256").update(data.session.id).digest("hex");
  if (Array.isArray(data?.session?.messages)) {
    evidence.messageCount = data.session.messages.length;
    evidence.messagesDigest = createHash("sha256").update(JSON.stringify(data.session.messages.map(message => [message?.role, message?.text]))).digest("hex");
  }
  return evidence;
}

function installBudgetObservation(log) {
  const original = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event !== "request") return original.call(this, event, ...args);
    const [request, response] = args;
    const requestId = randomUUID();
    const route = sanitizeRoute(request.url);
    const collect = /^\/api\/ai\/conversations(?:\/|\?|$)/.test(request.url);
    let chunks = []; let byteLength = 0; let tooLarge = false;
    if (collect) {
      const originalWrite = response.write; const originalEnd = response.end;
      const observe = (chunk, encoding) => {
        if (tooLarge || chunk === null || chunk === undefined || typeof chunk === "function") return;
        const bytes = typeof chunk === "string" ? Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8") : Buffer.from(chunk);
        byteLength += bytes.length;
        if (byteLength > 128 * 1024) { tooLarge = true; chunks = []; }
        else chunks.push(bytes);
      };
      response.write = function (chunk, ...rest) { observe(chunk, rest[0]); return originalWrite.call(this, chunk, ...rest); };
      response.end = function (chunk, ...rest) { observe(chunk, rest[0]); return originalEnd.call(this, chunk, ...rest); };
    }
    response.once("finish", () => log({ event: "http", requestId, method: request.method, route,
      status: response.statusCode, contentType: String(response.getHeader("content-type") ?? "").split(";")[0],
      ...(collect ? { responseEvidence: responseEvidence(Buffer.concat(chunks), tooLarge, Boolean(response.getHeader("content-encoding"))) } : {}),
      redirected: Boolean(response.getHeader("location")), at: new Date().toISOString() }));
    return requestContext.run(requestId, () => original.call(this, event, ...args));
  };
}

module.exports = { initializeBudgetLedger, readLedger, createBudgetFetch, installBudgetObservation };
