import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { isLocalDatabaseUrl } from "../../../scripts/local-stack.mjs";
import { EVAL_ENV_FILE, ORBITS_ROOT, evalPaths } from "./paths";

export const EVAL_DATABASE_NAME = "orbit_agent_eval";
export const EVAL_WORKSPACE_ID = "workspace:agent-eval";
export const EVAL_PORT = 3110;
/** 3000 is the user's dev server; 3100 is local-stack's default (CONVENTIONS §2). */
export const FORBIDDEN_EVAL_PORTS = new Set([3000, 3100]);
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
}

/**
 * The eval server's environment. Throws before anything starts when the database is not the local
 * `orbit_agent_eval`, the port is the dev server's, or the process looks like a Vercel/production one.
 */
export function buildEvalEnvironment(processEnv: Record<string, string | undefined>, fileEnv: Record<string, string>, options: { port?: number } = {}): EvalEnvironment {
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
  const port = options.port ?? Number(fileEnv.ORBIT_AGENT_EVAL_PORT ?? EVAL_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new EvalEnvironmentError(`Invalid eval port ${port}.`);
  if (FORBIDDEN_EVAL_PORTS.has(port)) throw new EvalEnvironmentError(`The eval server never uses port ${port}.`);

  const paths = evalPaths(fileEnv);
  // Start from a minimal process env (PATH, HOME …), never the developer shell's provider keys or remote URLs.
  const base: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "SHELL", "TMPDIR", "LOGNAME"]) {
    if (processEnv[key]) base[key] = processEnv[key]!;
  }
  const env: Record<string, string> = {
    ...base,
    ...fileEnv,
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
    ORBIT_LOCAL_EXPORT_STORAGE_DIR: paths.exportsDir,
    ORBIT_BATCH_UPLOAD_DIR: paths.batchUploads,
    ORBIT_EXPO_PUSH_ENDPOINT: `http://127.0.0.1:${port}/__agent-eval/push/expo/send`,
    ORBIT_EXPO_PUSH_RECEIPT_ENDPOINT: `http://127.0.0.1:${port}/__agent-eval/push/expo/receipts`,
  };
  for (const key of DATABASE_URL_KEYS) env[key] = url;
  for (const key of HOSTED_SERVICE_KEYS) delete env[key];
  return { database: { host: parsed.hostname, name, url }, env, port, workspaceId };
}
