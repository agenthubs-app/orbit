/**
 * npm run agent-eval:run -- --gate AGnn | --all | --case AE-H-006[,AE-…] [--label <text>] [--seed-cards] [--sealed] [--workers N] [--shadow]
 *
 * --shadow (AG18-2 evidence, not a gate): every selected case runs in shadow mode (as with `settings: { shadow: on }`):
 * the old path answers, the new one runs read-only after it; each case folder gets shadow-records.json. One after
 * another only (no --workers).
 *
 * Needs the eval server (npm run agent-eval:env). Writes ~/orbit-sprint-evidence/agent-eval/runs/<run id>/:
 * manifest.json, env.json, summary.json, report.md, costs.json, bundle.sha256 and cases/<id>/… (README §4).
 * Cases with an `egress_probe` step void their run, so they only run when named with --case.
 * Judging is separate: npm run agent-eval:judge-pack -- --run <run id>.
 *
 * --workers N (default 1: one case after another on the eval server, as before): N worker processes take cases
 * from one queue. Worker 1 uses the eval server and orbit_agent_eval; worker k ≥ 2 gets its own database
 * orbit_agent_eval_w<k> (from the same snapshots) and its own server on port 3110 + k − 1 (from the same
 * build), both removed when the run ends, fails or is interrupted (tests/agent-eval/lib/parallel.ts).
 */
import fs from "node:fs";
import path from "node:path";

import { checkGateIdentity, readTree, type BuildIdentity } from "../../tests/agent-eval/lib/build-identity";
import { gateOf, loadAreaFiles, selectCases, type EvalCase } from "../../tests/agent-eval/lib/cases";
import { finishCosts, readDeepSeekBalance, tallyCosts } from "../../tests/agent-eval/lib/costs";
import { applyEvalEnvironment, loadEvalEnvironment, processAlive, readServerState } from "../../tests/agent-eval/lib/eval-env";
import { evalPaths, JUDGE_PROMPT, ORBITS_ROOT } from "../../tests/agent-eval/lib/paths";
import { MAX_EVAL_WORKERS } from "../../tests/agent-eval/lib/env-guard";
import { cleanupWorkerSync, installCleanup, prepareWorkers, WorkerPool, type PoolResult, type WorkerServer } from "../../tests/agent-eval/lib/parallel";
import { costsProblems, crashedOutcome, settleRunLevelChecks, summarizeCase, writeBundleSha } from "../../tests/agent-eval/lib/run-files";
import { gitInfo, runCase, type CaseOutcome, type RunnerContext } from "../../tests/agent-eval/lib/runner";
import { runSelfCheck } from "../../tests/agent-eval/lib/selfcheck";
import { serverControl } from "../../tests/agent-eval/lib/server";
import { casePatchDefinitions, replacingPatchOf } from "../../tests/agent-eval/lib/patched-world";
import { loadWorld, snapshotKey } from "../../tests/agent-eval/lib/world";
import { fileSha256, sha256, stableStringify } from "../../tests/agent-eval/lib/yaml";
import { renderRunReport } from "../../tests/agent-eval/lib/report-md";

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function runIdFor(short: string, label: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${short}-${label.replace(/[^A-Za-z0-9_-]+/gu, "-")}`;
}

/** Set when --workers N > 1 installed its cleanup (runs once, from here or from a signal or exit handler). */
let cleanupNow: (() => void) | null = null;

async function main(argv: readonly string[]): Promise<void> {
  const environment = loadEvalEnvironment();
  applyEvalEnvironment(environment, { paidKeys: true });
  const state = readServerState(environment);
  if (!state || !processAlive(state.pid)) throw new Error("The eval server is not running; start it with npm run agent-eval:env.");
  // AG02 (SPRINTS.md「AG02 用预置的卡」): seed the card a case's card_ops describe before its first message.
  const seedCards = argv.includes("--seed-cards");
  const sealed = argv.includes("--sealed");
  const shadowAll = argv.includes("--shadow");
  const gate = flag(argv, "--gate");
  const caseIds = flag(argv, "--case")?.split(",").map((id) => id.trim()).filter(Boolean);
  const areaFiles = loadAreaFiles({ sealed });
  const selection = selectCases(areaFiles, { all: argv.includes("--all"), caseIds, gate: gate ?? undefined, sealed });
  if (!selection.cases.length) throw new Error("No case selected.");
  const label = flag(argv, "--label") ?? (gate ? `${gate}-gate` : caseIds?.length ? (caseIds.length === 1 ? caseIds[0] : "cases") : sealed ? "sealed" : "all");
  const git = gitInfo(ORBITS_ROOT);
  // AG04 run-02: the server's build identity is recorded by every run; a gate run needs a clean build of HEAD.
  const tree = readTree(ORBITS_ROOT);
  const served = await serverControl<{ build?: BuildIdentity | null }>(environment, "state");
  const build = served.build ?? null;
  if (gate) {
    const problems = checkGateIdentity({ build, dirty: tree.dirty, head: tree.head });
    if (problems.length) throw new Error(`A gate run does not start: ${problems.join("; ")}.`);
  }
  const workerCount = Number(flag(argv, "--workers") ?? 1);
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > MAX_EVAL_WORKERS) throw new Error(`--workers takes 1–${MAX_EVAL_WORKERS}.`);
  if (shadowAll && workerCount > 1) throw new Error("--shadow runs one case after another (no --workers).");
  let workers: { environments: Awaited<ReturnType<typeof prepareWorkers>>["environments"]; servers: WorkerServer[]; pool: WorkerPool | null } | null = null;
  if (workerCount > 1) {
    // harness/eval-parallel-workers: worker k ≥ 2's database and server are removed on every way out.
    const workerEnvironments = Array.from({ length: workerCount - 1 }, (_, index) => loadEvalEnvironment({ worker: index + 2 }));
    cleanupNow = installCleanup(() => {
      workers?.pool?.kill();
      for (const workerEnvironment of workerEnvironments) {
        try {
          const done = cleanupWorkerSync(workerEnvironment);
          if (done.length) console.log(`  worker ${workerEnvironment.worker}: ${done.join("; ")}`);
        } catch (cleanupError) {
          console.error(`  worker ${workerEnvironment.worker}: cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`);
        }
      }
    });
    const firstWorld = selection.cases[0].world;
    const snapshot = JSON.parse(fs.readFileSync(path.join(evalPaths(environment.env).snapshots, `${firstWorld}.seed.json`), "utf8")).snapshot.file as string;
    console.log(`agent-eval:run: preparing ${workerCount - 1} more worker(s): databases from the ${firstWorld} snapshot, servers from build ${state.buildId}`);
    const prepared = await prepareWorkers(environment, workerCount, snapshot, (line) => console.log(line));
    workers = { ...prepared, pool: null };
    // The --build / stale-build / dirty-tree guards cover every worker: each server must serve the build the eval server serves.
    const mismatched = prepared.servers.filter((server) => server.buildId !== state.buildId || server.build?.commit !== build?.commit || server.build?.nextBuildId !== build?.nextBuildId);
    if (mismatched.length) throw new Error(`The workers do not all serve the eval server's build: ${mismatched.map((server) => `worker ${server.worker} serves ${server.buildId} (${server.build?.commit?.slice(0, 10) ?? "no identity"})`).join("; ")}.`);
    if (gate) {
      for (const server of prepared.servers) {
        const problems = checkGateIdentity({ build: server.build, dirty: tree.dirty, head: tree.head });
        if (problems.length) throw new Error(`A gate run does not start: worker ${server.worker}: ${problems.join("; ")}.`);
      }
    }
  }
  const runId = runIdFor(git.short, label);
  const paths = evalPaths(environment.env);
  const runDir = path.join(paths.runs, runId);
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  const startedAt = new Date().toISOString();
  const fileOf = new Map(areaFiles.flatMap((file) => file.cases.map((testCase) => [testCase.id, file] as const)));
  const worlds = [...new Set(selection.cases.map((testCase) => testCase.world))];
  // The snapshots the cases restore (a replacing patch has its own, <world>+<patch>); the self-check covers each.
  const snapshotKeys = [...new Set(selection.cases.map((testCase) => snapshotKey(testCase.world, replacingPatchOf(casePatchDefinitions(testCase.patches, loadWorld(testCase.world), fileOf.get(testCase.id)?.new_patches ?? {}))?.name ?? null)))];
  const manifest = {
    branch: git.branch,
    caseFiles: Object.fromEntries(areaFiles.filter((file) => selection.cases.some((testCase) => fileOf.get(testCase.id) === file)).map((file) => [path.basename(file.file), fileSha256(file.file)])),
    cases: selection.cases.map((testCase) => ({ gate: gateOf(testCase), id: testCase.id, invariant: testCase.invariant, sha256: sha256(stableStringify(testCase)) })),
    commit: git.commit,
    // The tree's changes to tracked files, with next build's own rewrite of next-env.d.ts left out (listed as buildNoise).
    dirtyWorkingTree: tree.dirty.length > 0,
    dirtyPaths: tree.dirty,
    buildNoise: tree.noise,
    fixtures: Object.fromEntries(worlds.map((world) => [world, fileSha256(loadWorld(world).file)])),
    gate: gate ?? null,
    invariantPack: selection.invariants.map((testCase) => testCase.id),
    judgePrompt: { sha256: fileSha256(JUDGE_PROMPT), version: Number(fs.readFileSync(JUDGE_PROMPT, "utf8").match(/版本\s*(\d+)/u)?.[1] ?? 1) },
    label,
    // AG01: which entry the clients used (on = protocol 3 for web/app; app_old stays on protocol 2).
    agentV1Mode: environment.env.ORBIT_AGENT_V1_MODE ?? "off",
    model: { judgment: "gemini-decision-1 (not called by the current agent)", main: environment.env.ORBIT_DEEPSEEK_MODEL ?? "deepseek-v4-flash (product default)", provider: environment.env.ORBIT_AGENT_PROVIDER },
    promptVersions: "current product prompts (no versioned prompt set before AG03)",
    runId,
    seedCards,
    ...(shadowAll ? { shadowAll: true } : {}),
    selection: { all: argv.includes("--all"), caseIds: caseIds ?? null, sealed },
    server: { build, buildId: state.buildId, builtFromHead: build?.commit === tree.head && !build?.dirty, pid: state.pid, port: state.port },
    soloExcluded: selection.solo.map((testCase) => testCase.id),
    startedAt,
    thresholds: "none before AG08",
    // harness/eval-parallel-workers: only with --workers N > 1 (a sequential run's manifest is unchanged).
    ...(workers ? { workers: { count: workerCount, queue: "one queue in selection order; each worker takes the next case when it is free", servers: workers.servers } } : {}),
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`agent-eval:run ${runId}: ${selection.cases.length} case(s)${workers ? ` on ${workerCount} workers` : ""}${selection.solo.length ? `; run alone with --case: ${selection.solo.map((c) => c.id).join(", ")}` : ""}`);

  let selfCheck: Awaited<ReturnType<typeof runSelfCheck>>;
  if (workers) {
    // Each worker self-checks its own database and server (README §10); env.json is worker 1's, with the others under `workers`.
    workers.pool = new WorkerPool(workers.environments, { runDir, runId, sealed, seedCards, worlds: snapshotKeys });
    const ready = await workers.pool.start();
    const first = ready.get(1)!.selfCheck;
    const others = [...ready.entries()].filter(([worker]) => worker !== 1);
    const failedOthers = others.flatMap(([worker, item]) => item.failed.map((name) => `worker ${worker}: ${name}`));
    selfCheck = { ...first, ok: first.ok && failedOthers.length === 0, checks: [...first.checks, ...others.flatMap(([worker, item]) => item.selfCheck.checks.map((check) => ({ ...check, name: `worker ${worker}: ${check.name}` })))] };
    fs.writeFileSync(path.join(runDir, "env.json"), JSON.stringify({ ...selfCheck, checks: first.checks, ok: selfCheck.ok, workers: Object.fromEntries(others.map(([worker, item]) => [worker, item.selfCheck])) }, null, 2));
  } else {
    selfCheck = await runSelfCheck(environment, snapshotKeys);
    fs.writeFileSync(path.join(runDir, "env.json"), JSON.stringify(selfCheck, null, 2));
  }
  if (!selfCheck.ok) {
    const failed = selfCheck.checks.filter((check) => !check.ok).map((check) => check.name);
    fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify({ aborted: true, reason: `self-check failed: ${failed.join("; ")}`, runId, voided: true }, null, 2));
    writeBundleSha(runDir);
    throw new Error(`Self-check failed (${failed.join("; ")}); the run did not start. ${runDir}`);
  }

  const balanceBefore = await readDeepSeekBalance(environment.env.DEEPSEEK_API_KEY);
  const ctx: RunnerContext = { areaCases: Object.fromEntries(areaFiles.map((file) => [file.area, file.cases as EvalCase[]])), currentWorld: null, environment, runDir, runId, seedCards, ...(shadowAll ? { shadowAll: true } : {}), writer: null };
  const outcomes: CaseOutcome[] = [];
  let pooled: PoolResult | null = null;
  if (workers?.pool) {
    // One queue; the worker processes run runCase exactly as the loop below does, each on its own database and server.
    const ids = selection.cases.map((testCase) => testCase.id);
    pooled = await workers.pool.run(ids, (id) => fileOf.get(id)?.area ?? "", (outcome, finished) => {
      const failed = outcome.checks.filter((check) => (check.status === "fail" || check.status === "cannot_judge") && !check.expectedToFail).map((check) => check.check);
      console.log(`  [${finished}/${ids.length}] ${outcome.caseId} hard ${outcome.hardPass ? "pass" : `FAIL (${failed.join(", ")})`} ${Math.round(outcome.durationMs / 100) / 10}s (worker ${outcome.worker})`);
    });
    // The observation stays in the worker that ran the case; the run-level checks are settled there (below).
    for (const outcome of pooled.outcomes) outcomes.push({ ...outcome, observation: {} as CaseOutcome["observation"] });
    for (const problem of pooled.problems) console.error(`  WORKER PROBLEM: ${problem}`);
  } else {
    for (const [index, testCase] of selection.cases.entries()) {
      const file = fileOf.get(testCase.id)!;
      let outcome: CaseOutcome;
      try {
        outcome = await runCase(testCase as EvalCase, file.new_patches ?? {}, file.area, ctx);
      } catch (caseError) {
        // A runner failure fails this case and the run goes on.
        outcome = crashedOutcome(testCase as EvalCase, file.area, runDir, caseError);
      }
      outcomes.push(outcome);
      const failed = outcome.checks.filter((check) => (check.status === "fail" || check.status === "cannot_judge") && !check.expectedToFail).map((check) => check.check);
      console.log(`  [${index + 1}/${selection.cases.length}] ${testCase.id} hard ${outcome.hardPass ? "pass" : `FAIL (${failed.join(", ")})`} ${Math.round(outcome.durationMs / 100) / 10}s`);
    }
    await ctx.writer?.close();
    // Back to idle: no case context, real time. A block from now on is attributed to no case.
    await serverControl(environment, "context", { caseId: null, clock: new Date().toISOString(), runId: null });
  }
  // Billing lags; give the balance a moment before the second reading.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const balanceAfter = await readDeepSeekBalance(environment.env.DEEPSEEK_API_KEY);
  const costs = finishCosts(tallyCosts(Object.fromEntries(outcomes.map((outcome) => [outcome.caseId, outcome.events]))), balanceBefore, balanceAfter);
  fs.writeFileSync(path.join(runDir, "costs.json"), JSON.stringify(costs, null, 2));

  const blocked = outcomes.flatMap((outcome) => outcome.events.filter((event) => event.type === "egress.blocked").map((event) => ({ caseId: outcome.caseId, host: event.host, seq: event.seq, at: event.at })));
  const voidReasons = blocked.map((item) => `outbound connection to ${item.host} blocked in ${item.caseId} (seq ${item.seq})`);
  const simulatedCases = outcomes.filter((outcome) => outcome.simulated).map((outcome) => outcome.caseId);
  const run = { costsProblems: costsProblems(costs, outcomes), simulatedCases, summarySeparates: true, voidReasons, voided: voidReasons.length > 0 };
  const workerProblems = [...(pooled?.problems ?? [])];
  if (workers?.pool && pooled) {
    const owner = new Map(pooled.outcomes.map((outcome) => [outcome.caseId, outcome.worker]));
    const settled = await workers.pool.settle(run, owner);
    for (const outcome of outcomes) {
      const result = settled.results.get(outcome.caseId);
      if (result) Object.assign(outcome, { checks: result.checks, hardPass: result.hardPass });
    }
    workerProblems.push(...settled.problems);
    for (const problem of settled.problems) console.error(`  WORKER PROBLEM: ${problem}`);
  } else {
    settleRunLevelChecks(outcomes, run);
  }
  const meta = new Map(selection.cases.map((testCase) => [testCase.id, { gate: gateOf(testCase), invariant: testCase.invariant }]));
  const cases = outcomes.map((outcome) => summarizeCase(outcome, meta.get(outcome.caseId)!, costs.perCase[outcome.caseId]));
  const summary = {
    calls: { judgment: costs.calls.judgment, model: costs.calls.model, search: costs.calls.search, fetch: costs.calls.fetch },
    cases,
    costCny: costs.amountCny.total,
    endedAt: new Date().toISOString(),
    gate: gate ?? null,
    hardPass: cases.filter((item) => item.hardPass).length,
    invariantPack: selection.invariants.map((testCase) => testCase.id),
    label,
    runId,
    simulatedCases,
    soloExcluded: selection.solo.map((testCase) => testCase.id),
    startedAt,
    total: cases.length,
    voidReasons,
    voided: run.voided,
    // harness/eval-parallel-workers: only with --workers N > 1. `retried`: attempts the provider rate-limited
    // (429), kept under retried/ and run again from a fresh world; their calls are outside costs.json's per-case tally.
    ...(pooled ? { workers: { count: workerCount, perCase: Object.fromEntries(pooled.outcomes.map((outcome) => [outcome.caseId, outcome.worker])), problems: workerProblems, retried: pooled.retried } } : {}),
  };
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(runDir, "report.md"), renderRunReport(summary, costs, null));
  const bundle = writeBundleSha(runDir);
  console.log(`agent-eval:run ${runId}: hard checks passed ${summary.hardPass}/${summary.total}${run.voided ? " — RUN VOIDED" : ""}; real model calls ${costs.calls.model.real}, simulated ${costs.calls.model.simulated}; ${costs.amountCny.total.toFixed(4)} CNY; balance Δ ${costs.balance.deltaCny ?? "n/a"}; bundle ${bundle.slice(0, 12)}`);
  console.log(`  ${runDir}`);
}

main(process.argv.slice(2))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // With --workers N > 1: stop the worker processes and remove worker k ≥ 2's servers and databases, on success and on failure.
  .finally(() => cleanupNow?.());
