/**
 * npm run agent-eval:run -- --gate AGnn | --all | --case AE-H-006[,AE-…] [--label <text>] [--seed-cards] [--sealed]
 *
 * Needs the eval server (npm run agent-eval:env). Writes ~/orbit-sprint-evidence/agent-eval/runs/<run id>/:
 * manifest.json, env.json, summary.json, report.md, costs.json, bundle.sha256 and cases/<id>/… (README §4).
 * Cases with an `egress_probe` step void their run, so they only run when named with --case.
 * Judging is separate: npm run agent-eval:judge-pack -- --run <run id>.
 */
import fs from "node:fs";
import path from "node:path";

import { gateOf, loadAreaFiles, selectCases, type EvalCase } from "../../tests/agent-eval/lib/cases";
import { finishCosts, readDeepSeekBalance, tallyCosts } from "../../tests/agent-eval/lib/costs";
import { applyEvalEnvironment, loadEvalEnvironment, processAlive, readServerState } from "../../tests/agent-eval/lib/eval-env";
import { evalPaths, JUDGE_PROMPT, ORBITS_ROOT } from "../../tests/agent-eval/lib/paths";
import { costsProblems, settleRunLevelChecks, summarizeCase, writeBundleSha } from "../../tests/agent-eval/lib/run-files";
import { gitInfo, runCase, type CaseOutcome, type RunnerContext } from "../../tests/agent-eval/lib/runner";
import { runSelfCheck } from "../../tests/agent-eval/lib/selfcheck";
import { serverControl } from "../../tests/agent-eval/lib/server";
import { loadWorld } from "../../tests/agent-eval/lib/world";
import { fileSha256, sha256, stableStringify } from "../../tests/agent-eval/lib/yaml";
import { renderRunReport } from "../../tests/agent-eval/lib/report-md";

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function crashedOutcome(testCase: EvalCase, area: string, runDir: string, error: unknown): CaseOutcome {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const dir = path.join(runDir, "cases", testCase.id);
  fs.mkdirSync(dir, { recursive: true });
  const checks = [{ args: null, check: "runner", detail: `the runner failed on this case: ${message.split("\n")[0]}`, evidence: [], status: "cannot_judge" as const }];
  fs.writeFileSync(path.join(dir, "hard-checks.json"), JSON.stringify({ caseId: testCase.id, checks, hardPass: false, runnerError: message }, null, 2));
  const observation = { account: "", accounts: {}, answers: [], businessChanges: [], cards: [], caseId: testCase.id, clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false, fixtureIdOf: () => null, idMap: {}, reads: [], requests: [], unsupported: [] };
  return { account: "", area, caseId: testCase.id, checks, dir, durationMs: 0, error: message, events: [], fake: false, hardPass: false, observation, simulated: false, unsupported: [] };
}

function runIdFor(short: string, label: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${short}-${label.replace(/[^A-Za-z0-9_-]+/gu, "-")}`;
}

async function main(argv: readonly string[]): Promise<void> {
  const environment = loadEvalEnvironment();
  applyEvalEnvironment(environment, { paidKeys: true });
  const state = readServerState(environment);
  if (!state || !processAlive(state.pid)) throw new Error("The eval server is not running; start it with npm run agent-eval:env.");
  // AG02 (SPRINTS.md「AG02 用预置的卡」): seed the card a case's card_ops describe before its first message.
  const seedCards = argv.includes("--seed-cards");
  const sealed = argv.includes("--sealed");
  const gate = flag(argv, "--gate");
  const caseIds = flag(argv, "--case")?.split(",").map((id) => id.trim()).filter(Boolean);
  const areaFiles = loadAreaFiles({ sealed });
  const selection = selectCases(areaFiles, { all: argv.includes("--all"), caseIds, gate: gate ?? undefined, sealed });
  if (!selection.cases.length) throw new Error("No case selected.");
  const label = flag(argv, "--label") ?? (gate ? `${gate}-gate` : caseIds?.length ? (caseIds.length === 1 ? caseIds[0] : "cases") : sealed ? "sealed" : "all");
  const git = gitInfo(ORBITS_ROOT);
  const runId = runIdFor(git.short, label);
  const paths = evalPaths(environment.env);
  const runDir = path.join(paths.runs, runId);
  fs.mkdirSync(path.join(runDir, "cases"), { recursive: true });
  const startedAt = new Date().toISOString();
  const fileOf = new Map(areaFiles.flatMap((file) => file.cases.map((testCase) => [testCase.id, file] as const)));
  const worlds = [...new Set(selection.cases.map((testCase) => testCase.world))];
  const manifest = {
    branch: git.branch,
    caseFiles: Object.fromEntries(areaFiles.filter((file) => selection.cases.some((testCase) => fileOf.get(testCase.id) === file)).map((file) => [path.basename(file.file), fileSha256(file.file)])),
    cases: selection.cases.map((testCase) => ({ gate: gateOf(testCase), id: testCase.id, invariant: testCase.invariant, sha256: sha256(stableStringify(testCase)) })),
    commit: git.commit,
    dirtyWorkingTree: git.dirty,
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
    selection: { all: argv.includes("--all"), caseIds: caseIds ?? null, sealed },
    server: { buildId: state.buildId, pid: state.pid, port: state.port },
    soloExcluded: selection.solo.map((testCase) => testCase.id),
    startedAt,
    thresholds: "none before AG08",
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`agent-eval:run ${runId}: ${selection.cases.length} case(s)${selection.solo.length ? `; run alone with --case: ${selection.solo.map((c) => c.id).join(", ")}` : ""}`);

  const selfCheck = await runSelfCheck(environment, worlds);
  fs.writeFileSync(path.join(runDir, "env.json"), JSON.stringify(selfCheck, null, 2));
  if (!selfCheck.ok) {
    const failed = selfCheck.checks.filter((check) => !check.ok).map((check) => check.name);
    fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify({ aborted: true, reason: `self-check failed: ${failed.join("; ")}`, runId, voided: true }, null, 2));
    writeBundleSha(runDir);
    throw new Error(`Self-check failed (${failed.join("; ")}); the run did not start. ${runDir}`);
  }

  const balanceBefore = await readDeepSeekBalance(environment.env.DEEPSEEK_API_KEY);
  const ctx: RunnerContext = { areaCases: Object.fromEntries(areaFiles.map((file) => [file.area, file.cases as EvalCase[]])), currentWorld: null, environment, runDir, runId, seedCards, writer: null };
  const outcomes: CaseOutcome[] = [];
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
  // Billing lags; give the balance a moment before the second reading.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const balanceAfter = await readDeepSeekBalance(environment.env.DEEPSEEK_API_KEY);
  const costs = finishCosts(tallyCosts(Object.fromEntries(outcomes.map((outcome) => [outcome.caseId, outcome.events]))), balanceBefore, balanceAfter);
  fs.writeFileSync(path.join(runDir, "costs.json"), JSON.stringify(costs, null, 2));

  const blocked = outcomes.flatMap((outcome) => outcome.events.filter((event) => event.type === "egress.blocked").map((event) => ({ caseId: outcome.caseId, host: event.host, seq: event.seq, at: event.at })));
  const voidReasons = blocked.map((item) => `outbound connection to ${item.host} blocked in ${item.caseId} (seq ${item.seq})`);
  const simulatedCases = outcomes.filter((outcome) => outcome.simulated).map((outcome) => outcome.caseId);
  const run = { costsProblems: costsProblems(costs, outcomes), simulatedCases, summarySeparates: true, voidReasons, voided: voidReasons.length > 0 };
  settleRunLevelChecks(outcomes, run);
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
  };
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(runDir, "report.md"), renderRunReport(summary, costs, null));
  const bundle = writeBundleSha(runDir);
  console.log(`agent-eval:run ${runId}: hard checks passed ${summary.hardPass}/${summary.total}${run.voided ? " — RUN VOIDED" : ""}; real model calls ${costs.calls.model.real}, simulated ${costs.calls.model.simulated}; ${costs.amountCny.total.toFixed(4)} CNY; balance Δ ${costs.balance.deltaCny ?? "n/a"}; bundle ${bundle.slice(0, 12)}`);
  console.log(`  ${runDir}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
