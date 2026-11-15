/**
 * npm run agent-eval:seed [-- --world base-v1]
 *
 * For each world: recreate orbit_agent_eval, migrate, write the world through the product's
 * write services (a child process with the eval preload, so nothing leaves the machine), then
 * pg_dump it to ~/orbit-sprint-evidence/agent-eval/env/snapshots/<world>.dump with a JSON report
 * (accounts, fixture→product id map, counts, gaps, checksums). The eval server must be stopped.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { worldRecords } from "../../tests/agent-eval/lib/bulk-generator";
import { applyEvalEnvironment, loadEvalEnvironment, PRELOAD, processAlive, readServerState } from "../../tests/agent-eval/lib/eval-env";
import { evalPaths, ORBITS_ROOT } from "../../tests/agent-eval/lib/paths";
import { createWorldWriter } from "../../tests/agent-eval/lib/seed";
import { dumpSnapshot, recreateDatabase } from "../../tests/agent-eval/lib/snapshot";
import { loadWorld } from "../../tests/agent-eval/lib/world";
import { fileSha256, sha256, stableStringify } from "../../tests/agent-eval/lib/yaml";

const WORLDS = ["base-v1", "regular-v1", "large-v1"];
const MIGRATIONS = ["scripts/migrate-web-runtime.ts", "scripts/migrate-sync-revision.ts"];

function accountLabels(world: string): Record<string, string> {
  const fixture = loadWorld(world);
  return Object.fromEntries(Object.entries(fixture.accounts).map(([label, account]) => [label, account.name]));
}

async function child(world: string): Promise<void> {
  const environment = loadEvalEnvironment();
  applyEvalEnvironment(environment);
  const fixture = loadWorld(world);
  const records = worldRecords(fixture);
  const writer = createWorldWriter(world, fixture.clock);
  try {
    const report = await writer.writeAll(records, accountLabels(world), (message) => console.log(`  ${world} ${message}`));
    const out = path.join(evalPaths(environment.env).snapshots, `${world}.seed.json`);
    fs.writeFileSync(out, JSON.stringify({ ...report, fixtureRecords: records.length, generatedSha256: sha256(stableStringify(records)) }, null, 2));
  } finally {
    await writer.close();
  }
}

function parent(worlds: readonly string[]): void {
  const environment = loadEvalEnvironment();
  const state = readServerState(environment);
  if (state && processAlive(state.pid)) throw new Error(`The eval server is running (pid ${state.pid}); stop it first: npm run agent-eval:env -- --stop`);
  const paths = evalPaths(environment.env);
  fs.mkdirSync(paths.snapshots, { recursive: true });
  const childEnv = { ...environment.env, NODE_OPTIONS: `--require ${PRELOAD}` } as unknown as NodeJS.ProcessEnv;
  for (const key of ["DEEPSEEK_API_KEY", "ORBIT_GEMINI_DECISION_API_KEY"]) childEnv[key] = "";
  delete childEnv.ORBIT_AGENT_TRACE_DIR;
  for (const world of worlds) {
    const started = Date.now();
    console.log(`agent-eval:seed ${world}: recreate ${environment.database.name} and migrate`);
    recreateDatabase(environment.database.url);
    for (const migration of MIGRATIONS) {
      const result = spawnSync(process.execPath, ["--import", "tsx", migration], { cwd: ORBITS_ROOT, encoding: "utf8", env: childEnv });
      if (result.status !== 0) throw new Error(`${migration} failed: ${(result.stderr || result.stdout).slice(-2000)}`);
    }
    const seeded = spawnSync(process.execPath, ["--import", "tsx", path.join("scripts", "agent-eval", "seed.ts"), "--child", world], { cwd: ORBITS_ROOT, env: childEnv, stdio: "inherit" });
    if (seeded.status !== 0) throw new Error(`seeding ${world} failed (exit ${seeded.status})`);
    const dump = path.join(paths.snapshots, `${world}.dump`);
    const dumpSha = dumpSnapshot(environment.database.url, dump);
    const reportFile = path.join(paths.snapshots, `${world}.seed.json`);
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    report.snapshot = { createdAt: new Date().toISOString(), file: dump, sha256: dumpSha };
    report.fixtureSha256 = fileSha256(loadWorld(world).file);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`agent-eval:seed ${world}: ${JSON.stringify(report.counts)} gaps=${report.gaps.length} snapshot ${dumpSha.slice(0, 12)} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
}

const argv = process.argv.slice(2);
if (argv[0] === "--child") {
  child(argv[1]).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
} else {
  const index = argv.indexOf("--world");
  const worlds = index >= 0 ? [argv[index + 1]] : WORLDS;
  try {
    parent(worlds);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
