import assert from "node:assert/strict";
import { access, cp, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { before } from "node:test";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

// A missing implementation is an assertion failure during the first RED run.
let fixture: any;
let http: any;
before(async () => {
fixture = await import("../support/completion-runtime-fixture").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND") return {};
  throw error;
});
http = await import("../support/completion-runtime-http").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND") return {};
  throw error;
});
});

const testRequire = createRequire(import.meta.url);
const TSX_LOADER = testRequire.resolve("tsx");
const PG_MODULE = testRequire.resolve("pg");

function offlineGuardSource(logPath: string): string {
  const log = JSON.stringify(logPath);
  const pg = JSON.stringify(PG_MODULE);
  return `
const fs = require("node:fs");
const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const dgram = require("node:dgram");
const childProcess = require("node:child_process");
const moduleApi = require("node:module");
const fsPromises = require("node:fs/promises");
const logPath = ${log};
function summarize(value) {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!value || typeof value !== "object") return typeof value;
  return { path: value.path, host: value.host, port: value.port };
}
function deny(kind, args) {
  const stack = new Error().stack || "";
  fs.appendFileSync(logPath, JSON.stringify({ kind, args: args.map(summarize), stack }) + "\\n");
  throw new Error("OFFLINE_GUARD_" + kind);
}
const realAccess = fsPromises.access;
fsPromises.access = async function (target, ...args) {
  fs.appendFileSync(logPath, JSON.stringify({ kind: "fs.access", path: String(target) }) + "\\n");
  return realAccess.call(this, target, ...args);
};
net.Socket.prototype.connect = function (...args) { return deny("net.connect", args); };
net.Server.prototype.listen = function (...args) { return deny("net.listen", args); };
tls.connect = function (...args) { return deny("tls.connect", args); };
http.request = function (...args) { return deny("http.request", args); };
http.get = function (...args) { return deny("http.get", args); };
https.request = function (...args) { return deny("https.request", args); };
https.get = function (...args) { return deny("https.get", args); };
dgram.Socket.prototype.send = function (...args) { return deny("dgram.send", args); };
globalThis.fetch = function (...args) { return deny("fetch", args); };
for (const name of ["fork", "spawn", "spawnSync", "exec", "execFile", "execSync", "execFileSync"]) {
  childProcess[name] = function (...args) { return deny("child." + name, args); };
}
const pg = require(${pg});
pg.Pool.prototype.connect = function (...args) { return deny("pg.pool.connect", args); };
pg.Client.prototype.connect = function (...args) { return deny("pg.client.connect", args); };
moduleApi.syncBuiltinESMExports();
`;
}

function offlineEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? tmpdir(),
    USER: process.env.USER ?? "orbit-test",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "C",
    NODE_ENV: "test",
  };
}

async function assertOfflineAttempts(logPath: string): Promise<void> {
  const text = await readFile(logPath, "utf8");
  const attempts = text.trim()
    ? text.trim().split("\n").map((line) => JSON.parse(line) as { kind: string; path?: string; args?: Array<{ path?: string; host?: string; port?: number }>; stack?: string })
    : [];
  for (const attempt of attempts) {
    if (attempt.kind === "fs.access") continue;
    const isTsxClientIpc =
      attempt.kind === "net.connect" &&
      /at Object\.connect \(node:net:[^\n]+\)\n\s+at [^\n]*[\\/]node_modules[\\/]tsx[\\/]dist[\\/]client-[^\\/]+\.(?:cjs|mjs):/u.test(attempt.stack ?? "");
    assert.equal(isTsxClientIpc, true, `non-tsx offline attempt: ${JSON.stringify(attempt)}`);
  }
}

async function assertAppScriptAccess(logPath: string, expectedPath: string): Promise<void> {
  const text = await readFile(logPath, "utf8");
  const accesses = text.trim()
    ? text.trim().split("\n").map((line) => JSON.parse(line) as { kind: string; path?: string }).filter((entry) => entry.kind === "fs.access")
    : [];
  assert.ok(accesses.some((entry) => entry.path === expectedPath), `missing App consumer access: ${JSON.stringify(accesses)}`);
}

test("rejects non-loopback origins including URL normalization tricks", () => {
  assert.equal(typeof fixture.runtimeOrigin, "function");
  assert.equal(fixture.runtimeOrigin("http://127.0.0.1:32123"), "http://127.0.0.1:32123");
  for (const input of ["https://example.test", "http://localhost:1234", "http://127.1:1234", "http://2130706433:1234", "http://127.0.0.1:1234/path", "http://u:p@127.0.0.1:1234", "http://127.0.0.1:1234?x=1"]) {
    assert.throws(() => fixture.runtimeOrigin(input), /INVALID_ORIGIN/);
  }
});

test("finite phase input refuses extra keys, missing IDs, oversized and unknown commands", () => {
  assert.equal(typeof fixture.validateRuntimePhase, "function");
  const valid = { version: 1, requestId: "r1", phase: "experience.read-web", input: { eventId: "runtime-event", revision: 2 } };
  assert.deepEqual(fixture.validateRuntimePhase(valid), valid);
  for (const input of [null, [], { ...valid, version: 2 }, { ...valid, requestId: "x".repeat(65) }, { ...valid, phase: "fetch" }, { ...valid, url: "http://example.test" }, { ...valid, input: { revision: 2 } }, { ...valid, input: { ...valid.input, cookie: "secret" } }, { ...valid, input: { eventId: "x".repeat(257), revision: 2 } }]) {
    assert.throws(() => fixture.validateRuntimePhase(input), /INVALID_IPC/);
  }
});

test("result validation rejects secret fields and failed or empty evidence", () => {
  assert.equal(typeof fixture.validateRuntimeResult, "function");
  const result = { version: 1, requestId: "r1", pass: true, assertions: ["experience.read-web"], observations: { eventId: "runtime-event", revision: 2 } };
  assert.deepEqual(fixture.validateRuntimeResult(result, "r1"), result);
  for (const input of [{ ...result, requestId: "r2" }, { ...result, assertions: [] }, { ...result, pass: false }, { ...result, observations: { cookie: "secret" } }, { ...result, error: "secret" }]) {
    assert.throws(() => fixture.validateRuntimeResult(input, "r1"), /INVALID_IPC_RESULT/);
  }
});

test("exact routing rejects traversal, arbitrary URLs, unauthorized methods and query injection", () => {
  assert.equal(typeof http.selectRuntimeRoute, "function");
  assert.equal(http.selectRuntimeRoute("GET", "/api/auth/session").boundary, "next-auth");
  assert.equal(http.selectRuntimeRoute("POST", "/api/auth/password-reset/confirm").boundary, "captured-mail");
  assert.equal(http.selectRuntimeRoute("PUT", "/api/contact-drafts/business-card/batches/v2/b1/items/i1/content").boundary, "injected-ocr");
  for (const [method, path] of [["DELETE", "/api/auth/session"], ["GET", "http://example.test/api/auth/session"], ["GET", "//example.test/api/auth/session"], ["GET", "/api/events/../auth/session"], ["GET", "/api/events/%2e%2e/auth/session"], ["POST", "/api/auth/password-reset/confirm?next=http://example.test"], ["GET", "/api/unknown"]]) {
    assert.throws(() => http.selectRuntimeRoute(method, path), /ROUTE_REJECTED/);
  }
});

test("teardown continues after failure, returns only stable codes and never reports success", async () => {
  assert.equal(typeof fixture.closeRuntimeResources, "function");
  const closed: string[] = [];
  const failures = await fixture.closeRuntimeResources([
    { name: "http", close: async () => { closed.push("http"); throw new Error("secret-cookie"); } },
    { name: "pool", close: async () => { closed.push("pool"); } },
    { name: "schema", close: async () => { closed.push("schema"); } },
  ], 50);
  assert.deepEqual(closed, ["http", "pool", "schema"]);
  assert.deepEqual(failures, ["CLEANUP_HTTP_FAILED"]);
  assert.deepEqual(await fixture.closeRuntimeResources([{ name: "http", close: () => new Promise(() => {}) }], 10), ["CLEANUP_HTTP_FAILED"]);
});

test("bounded operations time out with stable errors", async () => {
  assert.equal(typeof fixture.runtimeDeadline, "function");
  await assert.rejects(fixture.runtimeDeadline(new Promise(() => {}), 10, "CASE_TIMEOUT"), /CASE_TIMEOUT/);
  assert.equal(await fixture.runtimeDeadline(Promise.resolve(7), 100, "CASE_TIMEOUT"), 7);
});

test("canonical ID path encoding works without permitting encoded separators or double decoding", () => {
  assert.deepEqual(http.selectRuntimeRoute("GET", "/api/tasks/task%3Aabc").params, ["task:abc"]);
  for (const path of ["/api/tasks/task%2Fabc", "/api/tasks/task%253Aabc", "/api/tasks/%2E%2E", "/api/tasks/task%5Cabc"]) {
    assert.throws(() => http.selectRuntimeRoute("GET", path), /ROUTE_REJECTED/);
  }
  assert.throws(() => http.selectRuntimeRoute("PATCH", "/api/ai/conversations/sessions/s1"), /ROUTE_REJECTED/);
});

test("IPC enforces one outstanding phase and removes listeners on timeout and malformed response", async () => {
  assert.equal(typeof fixture.sendRuntimePhase, "function");
  const channel = Object.assign(new EventEmitter(), { connected: true, send: () => true });
  const message = { version: 1, requestId: "r1", phase: "experience.read-web", input: { eventId: "runtime-event", revision: 2 } };
  const first = fixture.sendRuntimePhase(channel, message, 15);
  await assert.rejects(fixture.sendRuntimePhase(channel, { ...message, requestId: "r2" }, 15), /IPC_PHASE_OUTSTANDING/);
  await assert.rejects(first, /IPC_PHASE_TIMEOUT/);
  assert.equal(channel.listenerCount("message"), 0);
  const malformed = fixture.sendRuntimePhase(channel, message, 100);
  channel.emit("message", { secret: "must-not-surface" });
  await assert.rejects(malformed, /INVALID_IPC_RESULT/);
  assert.equal(channel.listenerCount("exit"), 0);
  const closed = fixture.sendRuntimePhase(channel, message, 100);
  channel.emit("exit", 1);
  await assert.rejects(closed, /IPC_CHILD_EXIT/);
});

test("entry import stays offline under the portable child environment", async () => {
  const temp = await mkdtemp(join(tmpdir(), "orbit-completion-offline-"));
  try {
    const guardPath = join(temp, "offline-guard.cjs");
    const logPath = join(temp, "offline-attempts.ndjson");
    await writeFile(guardPath, offlineGuardSource(logPath), { mode: 0o600 });
    await writeFile(logPath, "", "utf8");
    const env = offlineEnvironment();
    const imported = spawnSync(process.execPath, ["--require", guardPath, "--import", TSX_LOADER, "-e", "require('./scripts/verify-completion-runtime.ts')"], { cwd: fixture.WEB_CWD, env, timeout: 5000, encoding: "utf8" });
    assert.equal(imported.error, undefined, imported.error?.message);
    assert.equal(imported.signal, null);
    assert.equal(imported.status, 0);
    assert.equal(imported.stdout, "");
    await assertOfflineAttempts(logPath);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("portable copied entry reports the absent sibling App consumer without changing source bytes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "orbit-completion-portable-"));
  try {
    const copiedWeb = join(temp, "repos", "orbits");
    await mkdir(join(copiedWeb, "scripts"), { recursive: true });
    await mkdir(join(copiedWeb, "tests", "support"), { recursive: true });
    for (const relativePath of [
      "scripts/verify-completion-runtime.ts",
      "tests/support/completion-runtime-fixture.ts",
      "package.json",
    ]) {
      const sourcePath = join(fixture.WEB_CWD, relativePath);
      const copiedPath = join(copiedWeb, relativePath);
      await cp(sourcePath, copiedPath);
      assert.equal(await readFile(copiedPath, "utf8"), await readFile(sourcePath, "utf8"), relativePath);
    }
    await symlink(join(fixture.WEB_CWD, "node_modules"), join(copiedWeb, "node_modules"), "dir");
    const realTemp = await realpath(temp);
    await assert.rejects(
      access(join(temp, "repos", "orbit-app", "scripts", "verify-completion-runtime.ts")),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT",
    );

    const guardPath = join(temp, "offline-guard.cjs");
    const logPath = join(temp, "offline-attempts.ndjson");
    await writeFile(guardPath, offlineGuardSource(logPath), { mode: 0o600 });
    await writeFile(logPath, "", "utf8");
    const missing = spawnSync(process.execPath, ["--require", guardPath, "--import", TSX_LOADER, "scripts/verify-completion-runtime.ts"], { cwd: copiedWeb, env: offlineEnvironment(), timeout: 5000, encoding: "utf8" });
    assert.equal(missing.error, undefined, missing.error?.message);
    assert.equal(missing.signal, null);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /MISSING_APP_CONSUMER_TASK1_INCOMPLETE/);
    assert.equal(missing.stdout, "");
    await assertOfflineAttempts(logPath);
    await assertAppScriptAccess(
      logPath,
      join(realTemp, "repos", "orbit-app", "scripts", "verify-completion-runtime.ts"),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Auth.js 200 JSON Location is not navigated, while cross-origin redirect status is rejected", () => {
  assert.equal(typeof http.assertRuntimeRedirect, "function");
  const origin = "http://127.0.0.1:32123";
  assert.doesNotThrow(() => http.assertRuntimeRedirect(new Response("{}", { status: 200, headers: { location: "http://localhost:32123" } }), origin));
  assert.throws(() => http.assertRuntimeRedirect(new Response(null, { status: 302, headers: { location: "http://localhost:32123" } }), origin), /CROSS_ORIGIN_REDIRECT/);
  assert.doesNotThrow(() => http.assertRuntimeRedirect(new Response(null, { status: 302, headers: { location: "/api/auth/session" } }), origin));
});

test("owned HTTP adapter labels injected delivery and rejects foreign Origin and oversized body", async () => {
  const owned = { origin: "http://127.0.0.1:32123", resources: [], nextDiagnostics: new Set() };
  const server = await http.startCompletionHttp(owned, async () => Response.json({ success: true }));
  try {
    const good = await fetch(`${server.origin}/api/auth/password-reset/confirm`, { method: "POST", body: "{}", signal: AbortSignal.timeout(1000) });
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("x-orbit-fixture-boundary"), "captured-mail");
    const foreign = await fetch(`${server.origin}/api/auth/password-reset/confirm`, { method: "POST", headers: { origin: "https://example.test" }, body: "{}", signal: AbortSignal.timeout(1000) });
    assert.equal(foreign.status, 400);
    const large = await fetch(`${server.origin}/api/auth/password-reset/confirm`, { method: "POST", body: "x".repeat(12 * 1024 * 1024 + 1), signal: AbortSignal.timeout(3000) });
    assert.equal(large.status, 413);
  } finally { assert.deepEqual(await fixture.closeRuntimeResources(owned.resources), []); }
});

test("deterministic OCR fixture identifies itself and consumes normalized JPEG bytes", async () => {
  const { deterministicRuntimeOcr } = await import("../support/completion-runtime-scenarios");
  const provider = deterministicRuntimeOcr();
  const jpeg = await sharp({ create: { width: 12, height: 8, channels: 3, background: "white" } }).jpeg().toBuffer();
  const result = await provider.extract({ imageBase64: jpeg.toString("base64"), mimeType: "image/jpeg" });
  assert.equal(provider.providerName, "completion-runtime-injected");
  assert.equal(result.extraction.organization, "Runtime Laboratory");
  assert.deepEqual(result.extraction.contactPoints, [{ type: "wechat", label: "Work channel", value: "runtime-card" }]);
  await assert.rejects(provider.extract({ imageBase64: (await sharp(jpeg).png().toBuffer()).toString("base64"), mimeType: "image/jpeg" }), /PROVIDER_BYTES_INVALID/);
});

test("registration and operations forward only finite safe routes without generation actions", () => {
  for (const [method, path] of [["GET", "/api/events/e1/registration?questions=false"], ["POST", "/api/events/e1/registration"], ["POST", "/api/events/e1/registration/cancel"], ["GET", "/api/events/e1/operations/admin"], ["PUT", "/api/events/e1/operations/admin"]]) {
    assert.equal(http.selectRuntimeRoute(method, path).boundary, "next-http");
  }
  for (const path of ["/api/events/e1/registration?questions=true", "/api/events/e1/operations/generation/run", "/api/events/e1/operations/configuration?run=true"]) assert.throws(() => http.selectRuntimeRoute("POST", path), /ROUTE_REJECTED/);
});

test("legacy review has explicit confirm skip retry and image boundaries", () => {
  for (const operation of ["confirm", "skip", "retry"]) assert.equal(http.selectRuntimeRoute("POST", `/api/contact-drafts/business-card/batches/b1/items/i1/${operation}`).operation, "legacy-item-action");
  assert.equal(http.selectRuntimeRoute("GET", "/api/contact-drafts/business-card/batches/b1/items/i1/image").operation, "legacy-image");
  assert.throws(() => http.selectRuntimeRoute("DELETE", "/api/contact-drafts/business-card/batches/b1/items/i1/image"), /ROUTE_REJECTED/);
});

test("IPC result evidence is phase-specific, complete and cannot substitute another entity", async () => {
  const result = { version: 1, requestId: "p1", pass: true, assertions: ["contacts.web-fields-read", "contacts.foreign-denied"], observations: { contactId: "contact:one" } };
  assert.deepEqual(fixture.validateRuntimeResult(result, "p1", "contacts.read-web"), result);
  for (const bad of [{ ...result, assertions: ["contacts.web-fields-read"] }, { ...result, assertions: ["tasks.web-fields-read", "tasks.foreign-denied"] }, { ...result, observations: {} }, { ...result, assertions: ["contacts.web-fields-read", "contacts.web-fields-read"] }]) assert.throws(() => fixture.validateRuntimeResult(bad, "p1", "contacts.read-web"), /INVALID_IPC_RESULT/);
  const channel = Object.assign(new EventEmitter(), { connected: true, send: () => true });
  const sent = fixture.sendRuntimePhase(channel, { version: 1, requestId: "p1", phase: "contacts.read-web", input: { contactId: "contact:two" } }, 100);
  channel.emit("message", result);
  await assert.rejects(sent, /IPC_ENTITY_MISMATCH/);
});

test("finite protocol includes operations, reverse task transitions and batch resume boundaries", () => {
  for (const phase of ["operations.read-web", "operations.write-app", "tasks.complete-app", "tasks.reopen-app", "current.resume-app", "legacy.review-app", "auth.after-web-reset"]) assert.ok(Object.hasOwn(fixture.PHASE_FIELDS, phase), phase);
  for (const bytes of ["ab==", "a===", "abcd====", "a"]) assert.throws(() => fixture.validateRuntimePhase({ version: 1, requestId: "p1", phase: "current.upload-app", input: { imageBase64: bytes } }), /INVALID_IPC/);
});
