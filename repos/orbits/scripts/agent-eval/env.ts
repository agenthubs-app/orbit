/**
 * npm run agent-eval:env [-- --build] [-- --stop] [-- --status]
 *
 * Creates the local orbit_agent_eval database when missing (and migrates it), optionally builds,
 * starts the eval server on 127.0.0.1:3110 with the eval preload (outbound guard, anchored clock,
 * model recording, fault injection, web replay, push simulator, trace), then runs the start-of-run
 * self-check and writes ~/orbit-sprint-evidence/agent-eval/env/env.json.
 * Refuses to start for a remote or wrongly named database, port 3000/3100, or VERCEL_ENV=production.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { refreshServer, writeBuildIdentity } from "../../tests/agent-eval/lib/build-identity";
import { applyEvalEnvironment, loadEvalEnvironment, processAlive, readServerState } from "../../tests/agent-eval/lib/eval-env";
import { evalPaths, ORBITS_ROOT } from "../../tests/agent-eval/lib/paths";
import { runSelfCheck } from "../../tests/agent-eval/lib/selfcheck";
import { startServer, stopServer } from "../../tests/agent-eval/lib/server";
import { databaseArgs } from "../../tests/agent-eval/lib/snapshot";

function databaseExists(url: string): boolean {
  const { args, name } = databaseArgs(url);
  const result = spawnSync("/opt/homebrew/bin/psql", [...args, "-d", "postgres", "-Atc", `select 1 from pg_database where datname = '${name}'`], { encoding: "utf8" });
  return result.stdout.trim() === "1";
}

async function main(argv: readonly string[]): Promise<void> {
  const environment = loadEvalEnvironment();
  if (argv.includes("--stop")) {
    console.log((await stopServer(environment)) ? "agent-eval:env stopped the eval server." : "agent-eval:env: no eval server running.");
    return;
  }
  if (argv.includes("--status")) {
    const state = readServerState(environment);
    console.log(state && processAlive(state.pid) ? `running pid ${state.pid} on ${state.port}, build ${state.buildId}, log ${state.log}` : "not running");
    return;
  }
  applyEvalEnvironment(environment);
  if (!databaseExists(environment.database.url)) {
    const { args, name } = databaseArgs(environment.database.url);
    spawnSync("/opt/homebrew/bin/createdb", [...args, name], { stdio: "inherit" });
    for (const migration of ["scripts/migrate-web-runtime.ts", "scripts/migrate-sync-revision.ts"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", migration], { cwd: ORBITS_ROOT, env: { ...environment.env, DEEPSEEK_API_KEY: "" } as unknown as NodeJS.ProcessEnv, stdio: "inherit" });
      if (result.status !== 0) throw new Error(`${migration} failed`);
    }
  }
  // AG04 run-02: --build replaces a running server (stop → build → identity → start), never leaves the old one serving.
  const build = argv.includes("--build") || !fs.existsSync(path.join(ORBITS_ROOT, ".next", "BUILD_ID"));
  await refreshServer({
    build: async () => {
      console.log("agent-eval:env: next build --webpack (no preload, paid keys blanked)…");
      const result = spawnSync(path.join(ORBITS_ROOT, "node_modules", ".bin", "next"), ["build", "--webpack"], {
        cwd: ORBITS_ROOT,
        env: { ...environment.env, DEEPSEEK_API_KEY: "", ORBIT_GEMINI_DECISION_API_KEY: "" } as unknown as NodeJS.ProcessEnv,
        stdio: "inherit",
      });
      if (result.status !== 0) throw new Error("next build failed");
    },
    recordIdentity: async () => {
      const identity = writeBuildIdentity();
      console.log(`agent-eval:env: build of ${identity.commit.slice(0, 10)}${identity.dirty ? ` from a DIRTY tree (${identity.dirtyPaths.join(", ")})` : " (clean tree)"}`);
    },
    running: async () => {
      const state = readServerState(environment);
      return Boolean(state && processAlive(state.pid));
    },
    start: async () => {
      const started = await startServer(environment);
      console.log(`agent-eval:env: server pid ${started.pid} on http://127.0.0.1:${started.port} (log ${started.log})`);
    },
    stop: async () => {
      await stopServer(environment);
      console.log("agent-eval:env: stopped the running eval server before building.");
    },
  }, { build });
  if (!build) {
    const state = readServerState(environment);
    if (state) console.log(`agent-eval:env: server running (pid ${state.pid}).`);
  }
  const worlds = ["base-v1", "regular-v1", "large-v1"].filter((world) => fs.existsSync(path.join(evalPaths(environment.env).snapshots, `${world}.seed.json`)));
  const result = await runSelfCheck(environment, worlds);
  const out = path.join(evalPaths(environment.env).envDir, "env.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  for (const check of result.checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}`);
  console.log(`agent-eval:env self-check ${result.ok ? "passed" : "FAILED"} → ${out}`);
  if (!worlds.length) console.log("agent-eval:env: no snapshots yet; run npm run agent-eval:seed (with the server stopped).");
  if (!result.ok) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
