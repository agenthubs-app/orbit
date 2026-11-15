import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** repos/orbits */
export const ORBITS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** docs/epics/agent-design/eval — cases, fixtures and the spec. Eval code reads them, never copies them. */
export const EVAL_DOCS_DIR = path.resolve(ORBITS_ROOT, "..", "..", "docs", "epics", "agent-design", "eval");
export const CASES_DIR = path.join(EVAL_DOCS_DIR, "cases");
export const SEALED_DIR = path.join(CASES_DIR, "sealed");
export const WORLD_DIR = path.join(EVAL_DOCS_DIR, "world");
export const SPRINTS_MD = path.resolve(EVAL_DOCS_DIR, "..", "SPRINTS.md");
export const EVAL_README = path.join(EVAL_DOCS_DIR, "README.md");
export const JUDGE_PROMPT = path.join(EVAL_DOCS_DIR, "judge-prompt.md");
export const RUNS_MD = path.join(EVAL_DOCS_DIR, "RUNS.md");
/** The eval-only environment file (ignored by version control). */
export const EVAL_ENV_FILE = path.join(ORBITS_ROOT, ".env.agent-eval");

/** Everything the eval writes lives outside every repository. */
export function evalHome(env: Record<string, string | undefined> = process.env): string {
  return env.ORBIT_AGENT_EVAL_HOME?.trim() || path.join(os.homedir(), "orbit-sprint-evidence", "agent-eval");
}

export function evalPaths(env: Record<string, string | undefined> = process.env) {
  const home = evalHome(env);
  const envDir = path.join(home, "env");
  return {
    home,
    runs: path.join(home, "runs"),
    envDir,
    storage: path.join(envDir, "storage"),
    exportsDir: path.join(envDir, "storage", "exports"),
    batchUploads: path.join(envDir, "storage", "batch-uploads"),
    snapshots: path.join(envDir, "snapshots"),
    serverLogs: path.join(envDir, "logs"),
    traceDir: path.join(envDir, "trace"),
    stateFile: path.join(envDir, "server.json"),
    idMap: path.join(envDir, "snapshots", "id-map.json"),
  };
}
