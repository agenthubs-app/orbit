import { createECDH, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { isLocalDatabaseUrl } from "../../../scripts/local-stack.mjs";
import { EVAL_ENV_FILE, ORBITS_ROOT, WORKER_ENV_KEY, evalPaths } from "./paths";

export const EVAL_DATABASE_NAME = "orbit_agent_eval";
export const EVAL_WORKSPACE_ID = "workspace:agent-eval";
export const EVAL_PORT = 3110;
/** 3000 is the user's dev server; 3100 is local-stack's default (CONVENTIONS §2). */
export const FORBIDDEN_EVAL_PORTS = new Set([3000, 3100]);
/** harness/eval-parallel-workers: at most this many workers (`agent-eval:run -- --workers N`). */
export const MAX_EVAL_WORKERS = 16;

/**
 * harness/eval-lines: a second checkout of the repository (another sprint worked on at the same time) runs its
 * own eval next to the main one when its env file names a line, e.g. `ORBIT_AGENT_EVAL_LINE=ag14`. A line has
 * its own database `orbit_agent_eval_<line>` (workers: `orbit_agent_eval_<line>_w<k>`) and must set its own
 * `ORBIT_AGENT_EVAL_PORT` and `ORBIT_AGENT_EVAL_HOME`, so two lines never share a database, a port or a snapshot.
 */
export const LINE_ENV_KEY = "ORBIT_AGENT_EVAL_LINE";
/** Lower-case letters and digits; never the shape of a worker suffix (`w3`), so the two cannot be confused. */
export function isEvalLineName(line: string): boolean {
  return /^[a-z][a-z0-9]{1,11}$/u.test(line) && !/^w\d+$/u.test(line);
}

/** The line named in an eval env file, or null for the main eval. Throws on a name that is not a line name. */
export function evalLine(fileEnv: Record<string, string | undefined>): string | null {
  const line = fileEnv[LINE_ENV_KEY]?.trim() ?? "";
  if (!line) return null;
  if (!isEvalLineName(line)) throw new EvalEnvironmentError(`${LINE_ENV_KEY} must be 2–12 lower-case letters or digits starting with a letter (and not w<number>), not ${line}.`);
  return line;
}

/** orbit_agent_eval for the main eval, orbit_agent_eval_<line> for a line. */
export function evalDatabaseName(line: string | null = null): string {
  return line ? `${EVAL_DATABASE_NAME}_${line}` : EVAL_DATABASE_NAME;
}

/** orbit_agent_eval[_<line>], or a parallel worker's orbit_agent_eval[_<line>]_w<k>. */
export function isEvalDatabaseName(name: string, line: string | null = null): boolean {
  return name === evalDatabaseName(line) || isWorkerDatabaseName(name, line);
}

/** A parallel worker's own database (k ≥ 2) of this line: the only eval databases the runner creates and drops. */
export function isWorkerDatabaseName(name: string, line: string | null = null): boolean {
  return new RegExp(`^${evalDatabaseName(line)}_w([2-9]|1[0-6])$`, "u").test(name);
}
const DATABASE_URL_KEYS = ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"];
/** Variables that would send traffic or files to hosted services; the eval server never gets them. */
const HOSTED_SERVICE_KEYS = [
  "BLOB_READ_WRITE_TOKEN",
  "ORBIT_BATCH_IMAGE_STORAGE",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_OIDC_TOKEN",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "ORBIT_EXPECTED_DATABASE_HOST",
  "ORBIT_EXPECTED_WORKSPACE_ID",
];

export class EvalEnvironmentError extends Error {}

export function readEvalEnvFile(file = EVAL_ENV_FILE): Record<string, string> {
  if (!fs.existsSync(file)) throw new EvalEnvironmentError(`Missing ${path.relative(ORBITS_ROOT, file)}; create the eval-only environment file first.`);
  return parseEnv(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

export interface EvalEnvironment {
  env: Record<string, string>;
  port: number;
  database: { url: string; host: string; name: string };
  workspaceId: string;
  /** 1 for the plain eval environment; k ≥ 2 for a parallel worker's own database, port, trace and storage. */
  worker: number;
  /** harness/eval-lines: null for the main eval; the line's name when the env file sets ORBIT_AGENT_EVAL_LINE. */
  line: string | null;
}

/**
 * The eval server's environment. Throws before anything starts when the database is not the local
 * `orbit_agent_eval`, the port is the dev server's, or the process looks like a Vercel/production one.
 */
/** AG16: a VAPID key pair for the local simulator only, derived on this machine (CONVENTIONS §2: keys never enter the repo). */
export function evalVapidKeys(secret: string): { ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY: string; ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(createHash("sha256").update(`agent-eval-vapid\u0000${secret}`).digest());
  return { ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"), ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url") };
}

export function buildEvalEnvironment(processEnv: Record<string, string | undefined>, fileEnv: Record<string, string>, options: { port?: number; worker?: number } = {}): EvalEnvironment {
  if (processEnv.VERCEL_ENV === "production" || fileEnv.VERCEL_ENV === "production") throw new EvalEnvironmentError("Refusing to start the agent eval with VERCEL_ENV=production.");
  if (processEnv.VERCEL || fileEnv.VERCEL) throw new EvalEnvironmentError("Refusing to start the agent eval with VERCEL set.");
  const url = fileEnv.ORBIT_LOCAL_DATABASE_URL?.trim() ?? "";
  if (!isLocalDatabaseUrl(url)) throw new EvalEnvironmentError("ORBIT_LOCAL_DATABASE_URL must point at a Postgres on this machine; refusing to start.");
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//u, "");
  const line = evalLine(fileEnv);
  const baseName = evalDatabaseName(line);
  if (name !== baseName) throw new EvalEnvironmentError(`The eval database must be ${baseName}, not ${name || "(none)"}; refusing to start.`);
  if (line && (!fileEnv.ORBIT_AGENT_EVAL_PORT?.trim() || !fileEnv.ORBIT_AGENT_EVAL_HOME?.trim())) {
    throw new EvalEnvironmentError(`Line ${line} must set its own ORBIT_AGENT_EVAL_PORT and ORBIT_AGENT_EVAL_HOME, so it never shares the main eval's port, snapshots or runs.`);
  }
  for (const key of DATABASE_URL_KEYS.slice(1)) {
    const value = fileEnv[key]?.trim();
    if (value && !isLocalDatabaseUrl(value)) throw new EvalEnvironmentError(`${key} in the eval env file points off this machine; refusing to start.`);
  }
  if (fileEnv.ORBIT_DATABASE_TARGET !== "local") throw new EvalEnvironmentError("ORBIT_DATABASE_TARGET must be local.");
  const workspaceId = fileEnv.ORBIT_LOCAL_WORKSPACE_ID?.trim() || fileEnv.ORBIT_WORKSPACE_ID?.trim() || "";
  if (workspaceId !== EVAL_WORKSPACE_ID) throw new EvalEnvironmentError(`The eval workspace must be ${EVAL_WORKSPACE_ID}.`);
  if (fileEnv.ORBIT_AGENT_EVAL !== "1") throw new EvalEnvironmentError("ORBIT_AGENT_EVAL=1 is required.");
  const worker = options.worker ?? 1;
  if (!Number.isInteger(worker) || worker < 1 || worker > MAX_EVAL_WORKERS) throw new EvalEnvironmentError(`Invalid eval worker ${worker} (1–${MAX_EVAL_WORKERS}).`);
  const port = options.port ?? Number(fileEnv.ORBIT_AGENT_EVAL_PORT ?? EVAL_PORT) + worker - 1;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new EvalEnvironmentError(`Invalid eval port ${port}.`);
  if (FORBIDDEN_EVAL_PORTS.has(port)) throw new EvalEnvironmentError(`The eval server never uses port ${port}.`);

  // harness/eval-parallel-workers: worker k ≥ 2 runs on its own local database, derived from the checked one.
  const workerFileEnv: Record<string, string> = worker > 1 ? { ...fileEnv, [WORKER_ENV_KEY]: String(worker) } : { ...fileEnv };
  if (worker === 1) delete workerFileEnv[WORKER_ENV_KEY];
  const workerUrl = new URL(url);
  if (worker > 1) workerUrl.pathname = `/${baseName}_w${worker}`;
  const databaseUrl = worker > 1 ? workerUrl.toString() : url;
  const databaseName = worker > 1 ? `${baseName}_w${worker}` : name;
  if (!isLocalDatabaseUrl(databaseUrl) || !isEvalDatabaseName(databaseName, line)) throw new EvalEnvironmentError(`Worker ${worker}'s database ${databaseName} is not a local eval database; refusing to start.`);
  const paths = evalPaths(workerFileEnv);
  // Start from a minimal process env (PATH, HOME …), never the developer shell's provider keys or remote URLs.
  const base: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "SHELL", "TMPDIR", "LOGNAME"]) {
    if (processEnv[key]) base[key] = processEnv[key]!;
  }
  const env: Record<string, string> = {
    ...base,
    ...workerFileEnv,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    TZ: "Asia/Tokyo",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    ORBIT_DATABASE_TARGET: "local",
    ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
    ORBIT_WORKSPACE_ID: workspaceId,
    ORBIT_AGENT_TRACE_DIR: paths.traceDir,
    // AG01: from here on the eval tests the new entry; the env file may set off to run the old one.
    ORBIT_AGENT_V1_MODE: fileEnv.ORBIT_AGENT_V1_MODE?.trim() || "on",
    // AG09: the web is on in the eval; every search and fetch is answered from recorded replays (eval-preload.cjs).
    ORBIT_AGENT_WEB: fileEnv.ORBIT_AGENT_WEB?.trim() || "on",
    ORBIT_LOCAL_EXPORT_STORAGE_DIR: paths.exportsDir,
    ORBIT_BATCH_UPLOAD_DIR: paths.batchUploads,
    ORBIT_EXPO_PUSH_ENDPOINT: `http://127.0.0.1:${port}/__agent-eval/push/expo/send`,
    ORBIT_EXPO_PUSH_RECEIPT_ENDPOINT: `http://127.0.0.1:${port}/__agent-eval/push/expo/receipts`,
    // AG16: the Expo adapter needs a token to be configured at all; the simulator never looks at it. Browser reminders
    // need a VAPID key pair: made on this machine from the eval's own auth secret, never written to a file or the repo.
    ORBIT_EXPO_PUSH_ACCESS_TOKEN: "agent-eval-simulated",
    ...evalVapidKeys(fileEnv.AUTH_SECRET ?? ""),
    ORBIT_WEB_PUSH_SUBJECT: "mailto:agent-eval@orbit.test",
    // AG15: scheduler_tick calls the product's dispatch entry as a scheduler would; the entry needs its bearer secret.
    // Derived from the eval's own auth secret (the env file may set one); the runner and the eval server share it.
    CRON_SECRET: fileEnv.CRON_SECRET?.trim() || createHash("sha256").update(`agent-eval-dispatch\u0000${fileEnv.AUTH_SECRET ?? ""}`).digest("hex"),
  };
  for (const key of DATABASE_URL_KEYS) env[key] = databaseUrl;
  for (const key of HOSTED_SERVICE_KEYS) delete env[key];
  return { database: { host: parsed.hostname, name: databaseName, url: databaseUrl }, env, line, port, workspaceId, worker };
}
