/**
 * npm run agent-eval:report -- --run <run id> [--with <other run id>] [--judges 1|2] [--append-runs] [--purpose <text>]
 *
 * Validates every judge-N.json (each verdict cites at least one existing trace seq), settles each case
 * (README §6; expect_judge_verdicts from H.yaml), lists disagreements for manual review, writes
 * cases/<id>/verdict.json, judged.json and report.md, refreshes bundle.sha256 and prints the RUNS.md line.
 * --with folds another run's verdicts into the conclusion (the AG00 gate plus its separate AE-H-006 run).
 */
import fs from "node:fs";
import path from "node:path";

import type { CostSummary } from "../../tests/agent-eval/lib/costs";
import { evalPathsForRuns } from "../../tests/agent-eval/lib/eval-env";
import { countedRubric, decideCase, readCaseYaml, validateJudgeFile, type CaseVerdict } from "../../tests/agent-eval/lib/judging";
import { RUNS_MD } from "../../tests/agent-eval/lib/paths";
import { renderRunReport, type JudgedCase } from "../../tests/agent-eval/lib/report-md";
import { writeBundleSha } from "../../tests/agent-eval/lib/run-files";

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

export function judgeRun(runDir: string, required: number): { verdicts: CaseVerdict[]; summary: any; costs: CostSummary } {
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, "summary.json"), "utf8"));
  const costs = JSON.parse(fs.readFileSync(path.join(runDir, "costs.json"), "utf8")) as CostSummary;
  const verdicts: CaseVerdict[] = [];
  for (const item of summary.cases as { id: string; hardPass: boolean }[]) {
    const caseDir = path.join(runDir, "cases", item.id);
    const testCase = readCaseYaml(caseDir);
    const maxSeq = fs.readFileSync(path.join(caseDir, "trace.jsonl"), "utf8").split("\n").filter(Boolean).length;
    const judgeFiles = fs.readdirSync(caseDir).filter((name) => /^judge-\d+\.json$/u.test(name)).sort();
    const validations = judgeFiles.map((name) => validateJudgeFile(path.join(caseDir, name), item.id, (testCase.rubric ?? []).map((r: { id: string }) => r.id), maxSeq));
    const expectEntry = (testCase.hard ?? []).find((entry: Record<string, unknown>) => "expect_judge_verdicts" in entry);
    // README §3.3/§6: in a gate run, items gated later are judged but not counted; other runs count every item.
    const { counted, deferred } = countedRubric(testCase.rubric ?? [], typeof summary.gate === "string" ? summary.gate : null);
    const verdict = decideCase({
      caseId: item.id,
      deferred,
      expectJudgeVerdicts: expectEntry?.expect_judge_verdicts,
      hardPass: item.hardPass,
      required: expectEntry ? Math.max(2, required) : required,
      rubricIds: counted,
      validations,
    });
    fs.writeFileSync(path.join(caseDir, "verdict.json"), JSON.stringify(verdict, null, 2));
    verdicts.push(verdict);
  }
  return { costs, summary, verdicts };
}

function main(argv: readonly string[]): void {
  const runId = flag(argv, "--run");
  if (!runId) throw new Error("--run <run id> is required");
  const runs = evalPathsForRuns().runs;
  const runDir = path.join(runs, runId);
  const firstSummary = JSON.parse(fs.readFileSync(path.join(runDir, "summary.json"), "utf8"));
  const required = Number(flag(argv, "--judges") ?? (firstSummary.gate || /gate|AE-H-006/u.test(firstSummary.label) ? 2 : 1));
  const { costs, summary, verdicts } = judgeRun(runDir, required);
  const judged = new Map<string, JudgedCase>(verdicts.map((verdict) => [verdict.caseId, { caseId: verdict.caseId, reasons: verdict.reasons, verdict: verdict.verdict === "unjudged" ? "needs_review" : verdict.verdict, ...(verdict.deferredVerdicts?.length ? { deferred: verdict.deferredVerdicts } : {}) }]));
  fs.writeFileSync(path.join(runDir, "judged.json"), JSON.stringify({ judgesRequired: required, runId, verdicts }, null, 2));
  fs.writeFileSync(path.join(runDir, "report.md"), renderRunReport(summary, costs, judged));
  const bundle = writeBundleSha(runDir);
  const passCount = verdicts.filter((verdict) => verdict.verdict === "pass").length;
  const review = verdicts.filter((verdict) => verdict.verdict === "needs_review" || verdict.verdict === "unjudged").length;
  const failCount = verdicts.length - passCount - review;
  const invariantViolations = (summary.cases as { invariant: boolean; hardPass: boolean }[]).filter((item) => item.invariant && !item.hardPass).length;
  const web = costs.calls.search.real + costs.calls.fetch.real;
  const webSim = costs.calls.search.simulated + costs.calls.fetch.simulated + costs.calls.search.replay + costs.calls.fetch.replay;
  const purpose = flag(argv, "--purpose") ?? `${summary.label}${summary.voided ? "（作废）" : ""}`;
  const line = `| ${runId} | ${summary.startedAt.slice(0, 10)} | ${runId.split("-")[2]} | ${purpose} | ${verdicts.length} | ${passCount} | ${failCount} | ${review} | ${invariantViolations} | 真实 ${costs.calls.model.real} / 模拟 ${costs.calls.model.simulated} | 真实 ${costs.calls.judgment.real} / 模拟 ${costs.calls.judgment.simulated} | 真实 ${web} / 模拟或回放 ${webSim} | ${costs.amountCny.total.toFixed(4)} | ${required === 2 ? "双评" : "单评"}（Claude 新会话） | ${bundle} |`;
  console.log(`agent-eval:report ${runId}: pass ${passCount}, fail ${failCount}, needs review ${review} (of ${verdicts.length})`);
  for (const verdict of verdicts.filter((item) => item.verdict !== "pass")) console.log(`  ${verdict.caseId}: ${verdict.verdict} — ${verdict.reasons.join("; ")}`);
  const other = flag(argv, "--with");
  if (other) {
    const otherRun = judgeRun(path.join(runs, other), required);
    console.log(`  with ${other}: ${otherRun.verdicts.map((verdict) => `${verdict.caseId} ${verdict.verdict}`).join(", ")}`);
    const all = [...verdicts, ...otherRun.verdicts];
    console.log(`  gate conclusion: ${all.every((verdict) => verdict.verdict === "pass") ? "PASS" : "NOT PASSED"} (${all.filter((verdict) => verdict.verdict === "pass").length}/${all.length})`);
  }
  console.log("RUNS.md line:");
  console.log(line);
  if (argv.includes("--append-runs")) {
    const text = fs.readFileSync(RUNS_MD, "utf8").replace("\n还没有运行。第一条将是 AG00 的基线。\n", "\n");
    const marker = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
    const index = text.indexOf(marker);
    const tableEnd = text.indexOf("\n\n", index + marker.length);
    const next = tableEnd < 0 ? `${text.trimEnd()}\n${line}\n` : `${text.slice(0, tableEnd)}\n${line}${text.slice(tableEnd)}`;
    fs.writeFileSync(RUNS_MD, next);
    console.log(`appended to ${RUNS_MD}`);
  }
}

if (process.argv[1]?.endsWith("report.ts")) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
