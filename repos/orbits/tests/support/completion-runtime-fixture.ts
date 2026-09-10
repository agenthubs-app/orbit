import { randomBytes } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Pool } from "pg";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const WEB_CWD = "/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907/repos/orbits";
export const APP_CWD = "/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907/repos/orbit-app";
export const APP_SCRIPT = `${APP_CWD}/scripts/verify-completion-runtime.ts`;
export const DATABASE_URL = "postgresql://xzhao@127.0.0.1:5432/orbit_merge_verify_20260907_c45a";
export const WORKSPACE_ID = "test:remote-sync-20260907";
export const NODE_PATH = "/Volumes/ORICO/Dev/cache/npm/_npx/5dad66f2cb301fc2/node_modules/.bin:/opt/homebrew/bin:/usr/bin:/bin";
export const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"];

type FieldKind = "id" | "revision" | "origin" | "secret" | "email" | "bytes";
export const PHASE_FIELDS = {
  "auth.open": { origin: "origin", email: "email", password: "secret", foreignEmail: "email", foreignPassword: "secret", actorId: "id" },
  "auth.request-reset": { email: "email" },
  "auth.reject-reset": { expiredToken: "secret", password: "secret" },
  "auth.consume-reset": { token: "secret", password: "secret" },
  "auth.verify-revocation": { password: "secret" },
  "auth.after-web-reset": { password: "secret" },
  "experience.read-web": { eventId: "id", revision: "revision" },
  "experience.write-app": { eventId: "id", revision: "revision" },
  "experience.frozen": { eventId: "id", revision: "revision" },
  "legacy.read-web": { batchId: "id", itemId: "id" },
  "legacy.upload-app": { imageBase64: "bytes", replacementBase64: "bytes" },
  "legacy.review-app": { batchId: "id", itemId: "id", otherItemId: "id" },
  "legacy.retry-app": { batchId: "id", itemId: "id" },
  "legacy.skip-app": { batchId: "id", itemId: "id" },
  "current.read-web": { batchId: "id", itemId: "id", revision: "revision" },
  "current.replace-web": { batchId: "id", itemId: "id", revision: "revision", replacementBase64: "bytes" },
  "current.confirm-web": { batchId: "id", itemId: "id" },
  "current.upload-app": { imageBase64: "bytes" },
  "current.resume-app": { batchId: "id", itemId: "id", revision: "revision", imageBase64: "bytes" },
  "current.review-app": { batchId: "id", itemId: "id" },
  "current.manual-app": { batchId: "id", itemId: "id" },
  "current.retry-app": { batchId: "id", itemId: "id" },
  "current.skip-app": { batchId: "id", itemId: "id" },
  "current.cancel-app": { batchId: "id", itemId: "id" },
  "current.expired-app": { batchId: "id" },
  "contacts.read-web": { contactId: "id" },
  "contacts.write-app": { contactId: "id" },
  "tasks.read-web": { taskId: "id" },
  "tasks.complete-app": { taskId: "id" },
  "tasks.reopen-app": { taskId: "id" },
  "registration.read-web": { eventId: "id", registrationId: "id" },
  "registration.write-app": { eventId: "id", registrationId: "id" },
  "registration.cancel-app": { eventId: "id", registrationId: "id" },
  "operations.read-web": { eventId: "id" },
  "operations.write-app": { eventId: "id" },
  "conversation.read-web": { sessionId: "id" },
  "conversation.write-app": { sessionId: "id" },
  "auth.close": {},
} as const satisfies Record<string, Record<string, FieldKind>>;
export type RuntimePhase = keyof typeof PHASE_FIELDS;
export type RuntimeMessage = { version: 1; requestId: string; phase: RuntimePhase; input: Record<string, string | number> };

export const PHASE_OUTPUTS = {
  "auth.open": { assertions: ["auth.mobile-login", "auth.session-owner", "auth.foreign-login"], observations: ["actorId"] },
  "auth.request-reset": { assertions: ["auth.generic-unknown", "auth.request-accepted"], observations: ["httpStatus"] },
  "auth.reject-reset": { assertions: ["auth.wrong-token-rejected", "auth.expired-token-rejected"], observations: ["httpStatus"] },
  "auth.consume-reset": { assertions: ["auth.reset-consumed", "auth.reuse-rejected"], observations: ["httpStatus"] },
  "auth.verify-revocation": { assertions: ["auth.old-session-revoked", "auth.old-password-rejected", "auth.new-password-login"], observations: ["actorId"] },
  "auth.after-web-reset": { assertions: ["auth.web-reset-old-session-revoked", "auth.web-reset-new-login"], observations: ["actorId"] },
  "experience.read-web": { assertions: ["experience.web-published-read", "experience.foreign-denied"], observations: ["eventId", "revision"] },
  "experience.write-app": { assertions: ["experience.app-preview-not-persisted", "experience.app-publish", "experience.stale-rejected", "experience.foreign-write-denied"], observations: ["eventId", "revision"] },
  "experience.frozen": { assertions: ["experience.frozen-question-rejected", "experience.frozen-display-published"], observations: ["eventId", "revision"] },
  "legacy.read-web": { assertions: ["legacy.web-review-read", "legacy.image-read", "legacy.foreign-denied"], observations: ["batchId", "itemId", "status"] },
  "legacy.upload-app": { assertions: ["legacy.app-multipart-upload"], observations: ["batchId", "itemId", "otherItemId"] },
  "legacy.review-app": { assertions: ["legacy.duplicate-consent-required", "legacy.contact-confirmed", "legacy.item-skipped", "legacy.batch-finished"], observations: ["batchId", "itemId", "otherItemId", "contactId", "status"] },
  "legacy.retry-app": { assertions: ["legacy.failed-item-retried"], observations: ["batchId", "itemId", "status"] },
  "legacy.skip-app": { assertions: ["legacy.reprocessed-item-skipped", "legacy.batch-finished"], observations: ["batchId", "itemId", "status"] },
  "current.read-web": { assertions: ["current.manifest-owned", "current.normalized-image", "current.foreign-denied"], observations: ["batchId", "itemId", "revision"] },
  "current.replace-web": { assertions: ["current.replacement-accepted", "current.stale-replacement-rejected"], observations: ["batchId", "itemId", "revision"] },
  "current.confirm-web": { assertions: ["current.review-fields", "current.contact-confirmed"], observations: ["batchId", "itemId", "contactId", "status"] },
  "current.upload-app": { assertions: ["current.app-binary-upload"], observations: ["batchId", "itemId", "revision"] },
  "current.resume-app": { assertions: ["current.reselected-manifest-matches", "current.idempotent-upload", "current.refreshed-authority"], observations: ["batchId", "itemId", "revision"] },
  "current.review-app": { assertions: ["current.duplicate-consent-required", "current.explicit-duplicate-confirmed", "current.channel-label-preserved"], observations: ["batchId", "itemId", "contactId", "status"] },
  "current.manual-app": { assertions: ["current.manual-entry-confirmed"], observations: ["batchId", "itemId", "contactId", "status"] },
  "current.retry-app": { assertions: ["current.retry-queued"], observations: ["batchId", "itemId", "status"] },
  "current.skip-app": { assertions: ["current.processed-item-skipped"], observations: ["batchId", "itemId", "status"] },
  "current.cancel-app": { assertions: ["current.item-excluded", "current.batch-cancelled"], observations: ["batchId", "itemId", "status"] },
  "current.expired-app": { assertions: ["current.expired-mutation-not-found", "current.expired-detail"], observations: ["batchId", "status", "httpStatus"] },
  "contacts.read-web": { assertions: ["contacts.web-fields-read", "contacts.foreign-denied"], observations: ["contactId"] },
  "contacts.write-app": { assertions: ["contacts.app-tags-note-written"], observations: ["contactId"] },
  "tasks.read-web": { assertions: ["tasks.web-fields-read", "tasks.foreign-denied"], observations: ["taskId", "status"] },
  "tasks.complete-app": { assertions: ["tasks.app-completed"], observations: ["taskId", "status"] },
  "tasks.reopen-app": { assertions: ["tasks.app-reopened"], observations: ["taskId", "status"] },
  "registration.read-web": { assertions: ["registration.web-profile-read", "registration.foreign-isolated"], observations: ["eventId", "registrationId", "status"] },
  "registration.write-app": { assertions: ["registration.app-profile-written"], observations: ["eventId", "registrationId", "status"] },
  "registration.cancel-app": { assertions: ["registration.app-cancelled"], observations: ["eventId", "registrationId", "status"] },
  "operations.read-web": { assertions: ["operations.web-configuration-read", "operations.foreign-denied"], observations: ["eventId", "recommendationCount"] },
  "operations.write-app": { assertions: ["operations.app-configuration-written", "operations.foreign-write-denied"], observations: ["eventId", "recommendationCount"] },
  "conversation.read-web": { assertions: ["conversation.web-list-detail-read", "conversation.foreign-denied"], observations: ["sessionId", "messageCount"] },
  "conversation.write-app": { assertions: ["conversation.app-continuation-pinned"], observations: ["sessionId", "messageCount"] },
  "auth.close": { assertions: ["auth.secret-references-cleared"], observations: [] },
} as const satisfies Record<RuntimePhase, { assertions: readonly string[]; observations: readonly string[] }>;

export function runtimeOrigin(value: unknown): string {
  if (typeof value !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value)) throw new Error("INVALID_ORIGIN");
  try { if (new URL(value).origin !== value) throw new Error(); } catch { throw new Error("INVALID_ORIGIN"); }
  return value;
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function validateRuntimePhase(value: unknown): RuntimeMessage {
  if (!exactObject(value, ["version", "requestId", "phase", "input"]) || value.version !== 1
    || typeof value.requestId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(value.requestId)
    || typeof value.phase !== "string" || !Object.hasOwn(PHASE_FIELDS, value.phase)) throw new Error("INVALID_IPC");
  const fields = PHASE_FIELDS[value.phase as RuntimePhase];
  if (!exactObject(value.input, Object.keys(fields))) throw new Error("INVALID_IPC");
  for (const [key, kind] of Object.entries(fields)) {
    const item = value.input[key];
    const valid = kind === "revision" ? Number.isSafeInteger(item) && Number(item) >= 0
      : typeof item === "string" && (kind === "id" ? /^[a-zA-Z0-9:_-]{1,256}$/.test(item)
        : kind === "email" ? /^[a-zA-Z0-9.+_-]{1,100}@example\.test$/.test(item)
        : kind === "bytes" ? item.length <= 131072 && item.length > 0 && Buffer.from(item, "base64").toString("base64") === item
        : kind === "secret" ? item.length >= 8 && item.length <= 256 && !/[\x00-\x1f\x7f]/.test(item) : (() => { try { runtimeOrigin(item); return true; } catch { return false; } })());
    if (!valid) throw new Error("INVALID_IPC");
  }
  return value as RuntimeMessage;
}

export function validateRuntimeResult(value: unknown, requestId: string, phase?: RuntimePhase) {
  const allowed = ["actorId", "eventId", "batchId", "itemId", "otherItemId", "contactId", "taskId", "registrationId", "sessionId", "revision", "status", "httpStatus", "recommendationCount", "messageCount"];
  if (exactObject(value, ["version", "requestId", "pass", "code"]) && value.version === 1 && value.requestId === requestId && value.pass === false && ["APP_PHASE_FAILED", "APP_INVALID_INPUT", "APP_HTTP_FAILED", "APP_ASSERTION_FAILED"].includes(String(value.code))) throw new Error(String(value.code));
  if (!exactObject(value, ["version", "requestId", "pass", "assertions", "observations"]) || value.version !== 1 || value.requestId !== requestId || value.pass !== true
    || !Array.isArray(value.assertions) || value.assertions.length < 1 || value.assertions.length > 64
    || !value.assertions.every((entry) => typeof entry === "string" && /^[a-z][a-z0-9.-]{0,95}$/.test(entry))
    || !value.observations || typeof value.observations !== "object" || Array.isArray(value.observations)
    || Object.entries(value.observations).some(([key, item]) => !allowed.includes(key)
      || (["revision", "httpStatus", "messageCount", "recommendationCount"].includes(key) ? !Number.isSafeInteger(item) || Number(item) < 0 : typeof item !== "string" || !/^[a-zA-Z0-9:_-]{1,256}$/.test(item)))) throw new Error("INVALID_IPC_RESULT");
  if (phase) {
    const contract = PHASE_OUTPUTS[phase];
    if (!contract || !exactObject(value.observations, contract.observations) || value.assertions.length !== contract.assertions.length || new Set(value.assertions).size !== value.assertions.length
      || !contract.assertions.every((name) => (value.assertions as string[]).includes(name))) throw new Error("INVALID_IPC_RESULT");
  }
  return value as { version: 1; requestId: string; pass: true; assertions: string[]; observations: Record<string, string | number> };
}

export async function runtimeDeadline<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); })]); }
  finally { clearTimeout(timer!); }
}

export type OwnedResource = { name: "http" | "next" | "app" | "pool" | "schema" | "temp"; close: () => Promise<unknown> };
export async function closeRuntimeResources(resources: OwnedResource[], ms = 15000): Promise<string[]> {
  const failures: string[] = [];
  for (const resource of resources) {
    try { await runtimeDeadline(Promise.resolve().then(resource.close), ms, "CLEANUP_TIMEOUT"); }
    catch { failures.push(`CLEANUP_${resource.name.toUpperCase()}_FAILED`); }
  }
  return failures;
}

export async function assertNoRuntimeEnvFiles(dir = WEB_CWD) {
  for (const file of ENV_FILES) {
    try { await access(join(dir, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new Error("ENV_PREFLIGHT_FAILED"); }
    throw new Error("ENV_FILE_PRESENT");
  }
}

export async function stopRuntimeChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  try { await runtimeDeadline(exited, 7000, "CHILD_STOP_TIMEOUT"); }
  catch { child.kill("SIGKILL"); await runtimeDeadline(exited, 3000, "CHILD_KILL_TIMEOUT"); }
}

const outstandingPhases = new WeakSet<ChildProcess>();
export async function sendRuntimePhase(child: ChildProcess, value: unknown, timeout = 60000) {
  const message = validateRuntimePhase(value);
  if (outstandingPhases.has(child)) throw new Error("IPC_PHASE_OUTSTANDING");
  if (!child.connected) throw new Error("IPC_CHILD_DISCONNECTED");
  outstandingPhases.add(child);
  let onMessage: (result: unknown) => void;
  let onExit: () => void;
  let onError: () => void;
  try {
    return await runtimeDeadline(new Promise<ReturnType<typeof validateRuntimeResult>>((done, fail) => {
      onMessage = (result) => {
        try {
          const validated = validateRuntimeResult(result, message.requestId, message.phase);
          for (const [key, item] of Object.entries(validated.observations)) if (key.endsWith("Id") && key in message.input && message.input[key] !== item) throw new Error("IPC_ENTITY_MISMATCH");
          done(validated);
        } catch (error) { fail(error instanceof Error ? error : new Error("INVALID_IPC_RESULT")); }
      };
      onExit = () => fail(new Error("IPC_CHILD_EXIT"));
      onError = () => fail(new Error("IPC_CHILD_FAILED"));
      child.once("message", onMessage); child.once("exit", onExit); child.once("error", onError); child.once("disconnect", onExit);
      child.send(message, (error) => { if (error) fail(new Error("IPC_SEND_FAILED")); });
    }), timeout, "IPC_PHASE_TIMEOUT");
  } finally {
    child.off("message", onMessage!); child.off("exit", onExit!); child.off("error", onError!); child.off("disconnect", onExit!);
    outstandingPhases.delete(child);
  }
}

export async function startRuntimeAppConsumer(fixture: CompletionRuntimeFixture) {
  try { await access(APP_SCRIPT); } catch { throw new Error("MISSING_APP_CONSUMER_TASK1_INCOMPLETE"); }
  const appRequire = createRequire(join(APP_CWD, "package.json"));
  const loader = pathToFileURL(appRequire.resolve("tsx")).href;
  const env: NodeJS.ProcessEnv = { PATH: NODE_PATH, HOME: "/Users/xzhao", USER: "xzhao", TMPDIR: "/tmp", LANG: "en_US.UTF-8", NODE_ENV: "test" };
  const child = fork(APP_SCRIPT, [], { cwd: APP_CWD, env, execArgv: ["--import", loader], serialization: "json", stdio: ["ignore", "ignore", "ignore", "ipc"] });
  child.on("error", () => { fixture.nextDiagnostics.add("APP_CHILD_ERROR"); });
  fixture.resources.unshift({ name: "app", close: () => stopRuntimeChild(child) });
  return child;
}

export async function createCompletionRuntimeFixture() {
  if (resolve(process.cwd()) !== WEB_CWD || process.versions.node.split(".")[0] !== "22"
    || process.env.ORBIT_EVENT_DATABASE_URL !== DATABASE_URL || process.env.ORBIT_WORKSPACE_ID !== WORKSPACE_ID
    || process.env.PGOPTIONS) throw new Error("RUNTIME_ENV_REJECTED");
  await assertNoRuntimeEnvFiles();
  const schema = `completion_runtime_${randomBytes(12).toString("hex")}`;
  const temp = await mkdtemp(join(tmpdir(), "orbit-completion-runtime-"));
  const admin = new Pool({ connectionString: DATABASE_URL, options: "-c search_path=pg_catalog", max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const resources: OwnedResource[] = [];
  let schemaCreated = false;
  let closed = false;
  const close = async () => {
    if (closed) return [];
    closed = true;
    const failures = await closeRuntimeResources(resources);
    if (schemaCreated) failures.push(...await closeRuntimeResources([{ name: "schema", close: async () => {
      await admin.query(`drop schema ${schema} cascade`);
      const result = await admin.query("select 1 from pg_namespace where nspname=$1", [schema]);
      if (result.rowCount !== 0) throw new Error("SCHEMA_REMAINS");
    } }]));
    failures.push(...await closeRuntimeResources([{ name: "pool", close: () => admin.end() }, { name: "temp", close: () => rm(temp, { recursive: true, force: true }) }]));
    // Configured caches omit PGOPTIONS: this process may not start another lifecycle.
    return failures;
  };
  try {
    const identity = await admin.query("select current_database() db, current_schema() schema");
    if (identity.rows[0].db !== "orbit_merge_verify_20260907_c45a" || identity.rows[0].schema !== "pg_catalog") throw new Error("ADMIN_ISOLATION_FAILED");
    await admin.query(`create schema ${schema}`); schemaCreated = true;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    process.env.ORBIT_MODULE_MODE = "live";
    process.env.AUTH_SECRET = randomBytes(48).toString("base64url");
    const pool = new Pool({ connectionString: DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    resources.push({ name: "pool", close: () => pool.end() });
    const scoped = await pool.query("select current_database() db, current_schema() schema");
    if (scoped.rows[0].db !== identity.rows[0].db || scoped.rows[0].schema !== schema) throw new Error("SCHEMA_ISOLATION_FAILED");
    const before = await admin.query("select n.nspname, c.relname, c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname<>$1 and c.relkind='r' order by c.oid", [schema]);
    const { runOrbitRecordsMigration } = await import("../../shared/storage/migrations");
    const { runEventExperienceMigrations } = await import("../../features/events/experience/storage/migrations");
    const { runBusinessCardIngestV2Migrations } = await import("../../features/acquisition/business-card-ingest-v2/migrations");
    const { createEventOperationsPostgresClient } = await import("../../features/events/event-operations/storage/postgres-client");
    const operations = createEventOperationsPostgresClient({ connectionString: DATABASE_URL, pool });
    await runOrbitRecordsMigration(pool);
    await runEventExperienceMigrations(operations);
    await runBusinessCardIngestV2Migrations(operations);
    const after = await admin.query("select n.nspname, c.relname, c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname<>$1 and c.relkind='r' order by c.oid", [schema]);
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) throw new Error("MIGRATION_OWNERSHIP_FAILED");
    const tables = await pool.query("select tablename from pg_tables where schemaname=$1 order by tablename", [schema]);
    if (!tables.rows.some((row) => row.tablename === "orbit_records")) throw new Error("MIGRATION_TABLE_MISSING");
    const { createConfiguredPostgresLiveRecordStore } = await import("../../shared/storage/configured-live-record-store");
    const records = createConfiguredPostgresLiveRecordStore()!;
    resources.push({ name: "pool", close: () => records.client.close() });
    const view = join(temp, "next-view");
    await mkdir(view);
    // Next owns generated files in this external view, never the application tree.
    // Watchpack filters symlinked app-directory events outside its root: snapshot
    // routes into the owned view so Next discovers the actual handlers.
    for (const name of ["app", "features", "shared", "types"]) await cp(join(WEB_CWD, name), join(view, name), { recursive: true });
    await cp(join(WEB_CWD, "node_modules"), join(view, "node_modules"), { recursive: true, verbatimSymlinks: true });
    for (const name of ["public"]) {
      try { await access(join(WEB_CWD, name)); await symlink(join(WEB_CWD, name), join(view, name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    for (const name of (await readdir(WEB_CWD)).filter((name) => /^(auth\.ts|proxy\.ts|middleware\.ts|next\.config\.js|next-env\.d\.ts|tsconfig.*\.json|package\.json)$/.test(name))) {
      await cp(join(WEB_CWD, name), join(view, name));
    }
    const env: NodeJS.ProcessEnv = { PATH: NODE_PATH, HOME: "/Users/xzhao", USER: "xzhao", TMPDIR: "/tmp", LANG: "en_US.UTF-8", NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", ORBIT_EVENT_DATABASE_URL: DATABASE_URL, ORBIT_WORKSPACE_ID: WORKSPACE_ID, ORBIT_MODULE_MODE: "live", PGOPTIONS: process.env.PGOPTIONS, AUTH_SECRET: process.env.AUTH_SECRET, ORBIT_COMPLETION_NEXT_VIEW: view };
    await assertNoRuntimeEnvFiles(); await assertNoRuntimeEnvFiles(view);
    const child = fork(join(view, "node_modules/next/dist/bin/next"), ["dev", view, "--hostname", "127.0.0.1", "--port", "0", "--webpack"], { cwd: WEB_CWD, env, execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const nextDiagnostics = new Set<string>();
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const match of text.matchAll(/RUNTIME_THROW:([A-Za-z_0-9]{1,80})/g)) nextDiagnostics.add(`THROW:${match[1]}`);
      for (const marker of ["Module not found", "Cannot find module", "Can't resolve", "ENOENT", "SyntaxError", "ReferenceError", "TypeError", "Invalid URL", "MissingSecret", "UntrustedHost", "MissingCSRF", "CredentialsSignin", "CallbackRouteError", "InvalidCallbackUrl", "outside a request scope", "does not provide an export", "Cannot read properties", "is not a function"]) {
        if (text.includes(marker)) nextDiagnostics.add(marker.replace(/[^A-Za-z]/g, "_").toUpperCase());
      }
      const module = text.match(/Can't resolve ['"]([A-Za-z0-9_@./-]{1,180})['"]/);
      if (module) nextDiagnostics.add(`MODULE:${module[1]}`);
    };
    child.stdout?.on("data", capture); child.stderr?.on("data", capture);
    resources.unshift({ name: "next", close: () => stopRuntimeChild(child) });
    const origin = await runtimeDeadline(new Promise<string>((done, fail) => {
      child.once("error", () => fail(new Error("NEXT_CHILD_FAILED")));
      child.once("exit", () => fail(new Error("NEXT_CHILD_EXIT")));
      child.stdout?.on("data", (chunk: Buffer) => {
        const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})/);
        if (match) { try { done(runtimeOrigin(`http://127.0.0.1:${match[1]}`)); } catch { fail(new Error("NEXT_START_FAILED")); } }
      });
    }), 90000, "NEXT_START_TIMEOUT");
    return { pool, operations, records, schema, temp, origin, resources, close, nextDiagnostics, nextPid: child.pid, tableCount: tables.rowCount! };
  } catch (error) {
    const failures = await close();
    if (failures.length) throw new Error(`SETUP_AND_${failures.join("_")}`);
    throw error;
  }
}

export type CompletionRuntimeFixture = Awaited<ReturnType<typeof createCompletionRuntimeFixture>>;
