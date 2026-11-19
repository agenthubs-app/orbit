import fs from "node:fs";
import path from "node:path";
import { buildEvalEnvironment, readEvalEnvFile, type EvalEnvironment } from "./env-guard";
import { evalPaths, ORBITS_ROOT } from "./paths";

export const PRELOAD = path.join(ORBITS_ROOT, "tests", "agent-eval", "preload", "eval-preload.cjs");
export const PAID_KEYS = ["DEEPSEEK_API_KEY", "ORBIT_GEMINI_DECISION_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"];

/** The checked eval environment; throws before anything starts when it is not the local eval database. */
export function loadEvalEnvironment(options: { worker?: number } = {}): EvalEnvironment {
  return buildEvalEnvironment(process.env, readEvalEnvFile(), options);
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

/**
 * Paths for the commands that only read finished runs (judge-pack, report). They do not start the eval
 * environment, so they take the home directory from the eval env file themselves: a second checkout (a line)
 * keeps its runs in its own home, and without this they looked in the default folder. The shell wins when it
 * names a home explicitly; a missing env file falls back to the default.
 */
export function evalPathsForRuns(processEnv: Record<string, string | undefined> = process.env, readFile: () => Record<string, string> = readEvalEnvFile) {
  let fileHome: string | undefined;
  try {
    fileHome = readFile().ORBIT_AGENT_EVAL_HOME;
  } catch {
    fileHome = undefined;
  }
  return evalPaths({ ...processEnv, ORBIT_AGENT_EVAL_HOME: processEnv.ORBIT_AGENT_EVAL_HOME?.trim() || fileHome });
}
