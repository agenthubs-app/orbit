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

/** orbit_agent_eval, or a parallel worker's orbit_agent_eval_w<k>. */
export function isEvalDatabaseName(name: string): boolean {
  return name === EVAL_DATABASE_NAME || isWorkerDatabaseName(name);
}

/** A parallel worker's own database (k ≥ 2): the only eval databases the runner creates and drops. */
export function isWorkerDatabaseName(name: string): boolean {
  return new RegExp(`^${EVAL_DATABASE_NAME}_w([2-9]|1[0-6])$`, "u").test(name);
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
}

/**
 * The eval server's environment. Throws before anything starts when the database is not the local
 * `orbit_agent_eval`, the port is the dev server's, or the process looks like a Vercel/production one.
 */
export function buildEvalEnvironment(processEnv: Record<string, string | undefined>, fileEnv: Record<string, string>, options: { port?: number; worker?: number } = {}): EvalEnvironment {
  if (processEnv.VERCEL_ENV === "production" || fileEnv.VERCEL_ENV === "production") throw new EvalEnvironmentError("Refusing to start the agent eval with VERCEL_ENV=production.");
  if (processEnv.VERCEL || fileEnv.VERCEL) throw new EvalEnvironmentError("Refusing to start the agent eval with VERCEL set.");
  const url = fileEnv.ORBIT_LOCAL_DATABASE_URL?.trim() ?? "";
  if (!isLocalDatabaseUrl(url)) throw new EvalEnvironmentError("ORBIT_LOCAL_DATABASE_URL must point at a Postgres on this machine; refusing to start.");
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//u, "");
  if (name !== EVAL_DATABASE_NAME) throw new EvalEnvironmentError(`The eval database must be ${EVAL_DATABASE_NAME}, not ${name || "(none)"}; refusing to start.`);
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
  if (worker > 1) workerUrl.pathname = `/${EVAL_DATABASE_NAME}_w${worker}`;
  const databaseUrl = worker > 1 ? workerUrl.toString() : url;
  const databaseName = worker > 1 ? `${EVAL_DATABASE_NAME}_w${worker}` : name;
  if (!isLocalDatabaseUrl(databaseUrl) || !isEvalDatabaseName(databaseName)) throw new EvalEnvironmentError(`Worker ${worker}'s database ${databaseName} is not a local eval database; refusing to start.`);
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
  };
  for (const key of DATABASE_URL_KEYS) env[key] = databaseUrl;
  for (const key of HOSTED_SERVICE_KEYS) delete env[key];
  return { database: { host: parsed.hostname, name: databaseName, url: databaseUrl }, env, port, workspaceId, worker };
}
