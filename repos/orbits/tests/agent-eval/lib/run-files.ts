import fs from "node:fs";
import path from "node:path";

import type { CostSummary } from "./costs";
import { CHECKS, type CheckResult } from "./hard-checks";
import type { CaseOutcome } from "./runner";
import { sha256 } from "./yaml";

/** README §6 and PLANNER: the four invariant judgments, reported apart from the rest. */
export const INVARIANT_CHECKS = new Set(["no_private_reads", "private_reads_within", "no_cross_account", "no_write_before_click", "no_business_writes", "duplicate_effects", "memory_recalled", "memory_state"]);

export interface CaseSummary {
  id: string;
  area: string;
  account: string;
  gate: string;
  invariant: boolean;
  hardPass: boolean;
  failed: { check: string; detail: string }[];
  cannotJudge: { check: string; detail: string }[];
  unsupportedSteps: { step: number; word: string; reason: string }[];
  invariantChecks: { pass: number; fail: number };
  otherChecks: { pass: number; fail: number };
  simulated: boolean;
  fake: boolean;
  calls: { realModel: number; simulatedModel: number; realJudgment: number; simulatedJudgment: number };
  costCny: number;
  durationMs: number;
  error?: string;
}

export function summarizeCase(outcome: CaseOutcome, meta: { gate: string; invariant: boolean }, costs: CostSummary["perCase"][string] | undefined): CaseSummary {
  const relevant = outcome.checks.filter((check) => !check.expectedToFail);
  const count = (list: CheckResult[]) => ({ fail: list.filter((check) => check.status === "fail" || check.status === "cannot_judge").length, pass: list.filter((check) => check.status === "pass").length });
  const events = outcome.events;
  return {
    account: outcome.account,
    area: outcome.area,
    calls: {
      realJudgment: events.filter((event) => event.type === "judgment.request" && event.source === "real").length,
      realModel: events.filter((event) => event.type === "model.request" && event.source === "real").length,
      simulatedJudgment: events.filter((event) => event.type === "judgment.request" && event.source === "simulated").length,
      simulatedModel: events.filter((event) => event.type === "model.request" && event.source === "simulated").length,
    },
    cannotJudge: outcome.checks.filter((check) => check.status === "cannot_judge").map((check) => ({ check: check.check, detail: check.detail })),
    costCny: costs?.costCny ?? 0,
    durationMs: outcome.durationMs,
    ...(outcome.error ? { error: outcome.error.split("\n")[0] } : {}),
    failed: outcome.checks.filter((check) => check.status === "fail" && !check.expectedToFail).map((check) => ({ check: check.check, detail: check.detail })),
    fake: outcome.fake,
    gate: meta.gate,
    hardPass: outcome.hardPass,
    id: outcome.caseId,
    invariant: meta.invariant,
    invariantChecks: count(relevant.filter((check) => INVARIANT_CHECKS.has(check.check))),
    otherChecks: count(relevant.filter((check) => !INVARIANT_CHECKS.has(check.check) && check.check !== "expect_hard_fail")),
    simulated: outcome.simulated,
    unsupportedSteps: outcome.unsupported,
  };
}

/** A runner failure fails this case (cannot_judge) and the run goes on (moved here from run.ts for the workers). */
export function crashedOutcome(testCase: { id: string }, area: string, runDir: string, error: unknown): CaseOutcome {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const dir = path.join(runDir, "cases", testCase.id);
  fs.mkdirSync(dir, { recursive: true });
  const checks = [{ args: null, check: "runner", detail: `the runner failed on this case: ${message.split("\n")[0]}`, evidence: [], status: "cannot_judge" as const }];
  fs.writeFileSync(path.join(dir, "hard-checks.json"), JSON.stringify({ caseId: testCase.id, checks, hardPass: false, runnerError: message }, null, 2));
  const observation = { account: "", accounts: {}, answers: [], businessChanges: [], cards: [], caseId: testCase.id, clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false, fixtureIdOf: () => null, idMap: {}, reads: [], requests: [], unsupported: [] };
  return { account: "", area, caseId: testCase.id, checks, dir, durationMs: 0, error: message, events: [], fake: false, hardPass: false, observation, simulated: false, unsupported: [] };
}

/** Problems that make costs.json incomplete or inconsistent with the traces (H.yaml costs_complete). */
export function costsProblems(costs: CostSummary, outcomes: readonly CaseOutcome[]): string[] {
  const problems: string[] = [];
  const all = outcomes.flatMap((outcome) => outcome.events);
  const realRequests = all.filter((event) => event.type === "model.request" && event.source === "real").length;
  const simulatedRequests = all.filter((event) => event.type === "model.request" && event.source === "simulated").length;
  if (costs.calls.model.real !== realRequests) problems.push(`real model calls ${costs.calls.model.real} ≠ trace ${realRequests}`);
  if (costs.calls.model.simulated !== simulatedRequests) problems.push(`simulated model calls ${costs.calls.model.simulated} ≠ trace ${simulatedRequests}`);
  const realResponses = all.filter((event) => event.type === "model.response" && event.source === "real");
  const withUsage = realResponses.filter((event) => event.usage);
  if (withUsage.length !== realResponses.length) problems.push(`${realResponses.length - withUsage.length} real model response(s) without usage`);
  const tokens = withUsage.reduce((sum, event) => sum + Number((event.usage as { prompt_tokens?: number }).prompt_tokens ?? 0), 0);
  if (tokens !== costs.usage.model.promptTokens) problems.push(`prompt tokens ${costs.usage.model.promptTokens} ≠ trace ${tokens}`);
  if (!costs.priceTable.version || !costs.priceTable.retrievedAt || !costs.priceTable.source) problems.push("price table lacks version, date or source");
  if (!Number.isFinite(costs.amountCny.total)) problems.push("no amount");
  if (costs.amountCny.unpriced.length) problems.push(`unpriced calls: ${costs.amountCny.unpriced.join(", ")}`);
  if (!costs.balance.before || !Number.isFinite(costs.balance.before.total)) problems.push("no DeepSeek balance before the run");
  if (!costs.balance.after || !Number.isFinite(costs.balance.after.total)) problems.push("no DeepSeek balance after the run");
  if (costs.balance.deltaCny === null) problems.push("no balance difference");
  return problems;
}

/** Re-run the run-level checks now that summary and costs exist, and rewrite hard-checks.json. */
export function settleRunLevelChecks(outcomes: CaseOutcome[], run: Record<string, unknown>): void {
  for (const outcome of outcomes) {
    let changed = false;
    outcome.observation.run = run;
    for (const check of outcome.checks) {
      if (check.status !== "deferred" || check.check === "expect_judge_verdicts") continue;
      const fn = CHECKS[check.check];
      const result = fn(check.args, outcome.observation, { otherAccountRecords: [], rawTrace: "", secrets: [] });
      Object.assign(check, result);
      changed = true;
    }
    if (changed) {
      const expectation = outcome.checks.find((check) => check.check === "expect_hard_fail");
      if (expectation) {
        const wrong = outcome.checks.filter((check) => check.check !== "expect_hard_fail" && (check.expectedToFail ? check.status !== "fail" : check.status !== "pass" && check.status !== "deferred"));
        expectation.status = wrong.length ? "fail" : "pass";
      }
      outcome.hardPass = outcome.checks.every((check) => check.expectedToFail || check.status === "pass" || check.status === "deferred");
      const file = path.join(outcome.dir, "hard-checks.json");
      fs.writeFileSync(file, JSON.stringify({ caseId: outcome.caseId, checks: outcome.checks, hardPass: outcome.hardPass, settledAtRunEnd: true, unsupported: outcome.unsupported }, null, 2));
    }
  }
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

/** Checksum of every file in the run directory except bundle.sha256 itself. */
export function writeBundleSha(runDir: string): string {
  const lines = walk(runDir)
    .filter((file) => path.basename(file) !== "bundle.sha256")
    .map((file) => `${sha256(fs.readFileSync(file))}  ${path.relative(runDir, file)}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
  const bundle = sha256(lines.join("\n"));
  fs.writeFileSync(path.join(runDir, "bundle.sha256"), `${lines.join("\n")}\n${bundle}  (bundle)\n`);
  return bundle;
}

export function readBundleSha(runDir: string): string | null {
  try {
    const last = fs.readFileSync(path.join(runDir, "bundle.sha256"), "utf8").trim().split("\n").pop() ?? "";
    return last.split(/\s+/u)[0] || null;
  } catch {
    return null;
  }
}
