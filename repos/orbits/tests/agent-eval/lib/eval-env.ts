import fs from "node:fs";
import path from "node:path";
import { buildEvalEnvironment, readEvalEnvFile, type EvalEnvironment } from "./env-guard";
import { evalPaths, ORBITS_ROOT } from "./paths";

export const PRELOAD = path.join(ORBITS_ROOT, "tests", "agent-eval", "preload", "eval-preload.cjs");
export const PAID_KEYS = ["DEEPSEEK_API_KEY", "ORBIT_GEMINI_DECISION_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"];

/** The checked eval environment; throws before anything starts when it is not the local eval database. */
export function loadEvalEnvironment(): EvalEnvironment {
  return buildEvalEnvironment(process.env, readEvalEnvFile());
}

/** Apply the eval environment to this process (seeders and the runner), optionally without paid keys. */
export function applyEvalEnvironment(environment: EvalEnvironment, options: { paidKeys?: boolean } = {}): void {
  for (const [key, value] of Object.entries(environment.env)) process.env[key] = value;
  if (!options.paidKeys) for (const key of PAID_KEYS) process.env[key] = "";
  for (const dir of Object.values(evalPaths(environment.env))) {
    if (!path.extname(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export interface ServerState {
  pid: number;
  port: number;
  startedAt: string;
  log: string;
  buildId: string | null;
}

export function readServerState(environment: EvalEnvironment): ServerState | null {
  try {
    return JSON.parse(fs.readFileSync(evalPaths(environment.env).stateFile, "utf8")) as ServerState;
  } catch {
    return null;
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function baseUrl(environment: EvalEnvironment): string {
  return `http://127.0.0.1:${environment.port}`;
}
