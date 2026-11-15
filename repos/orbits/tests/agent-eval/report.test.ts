import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { countedRubric, decideCase, eventIndexLine, renderJudgePacket, validateJudgeFile, type JudgeFile } from "./lib/judging";
import { costsProblems } from "./lib/run-files";
import { deepseekCost, finishCosts, isPeakBeijing, tallyCosts } from "./lib/costs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-report-"));
const judge = (items: JudgeFile["items"], meta: Partial<JudgeFile["judge"]> = {}): JudgeFile => ({
  caseId: "AE-H-005",
  caseIssue: null,
  items,
  judge: { at: "2026-11-15T10:00:00Z", model: "claude", promptVersion: 1, session: "s1", ...meta },
  overall: items.every((item) => item.verdict === "pass") ? "pass" : "fail",
});
function write(name: string, value: JudgeFile): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

test("a judgment without evidence seqs, with seqs outside the trace, or missing an item is rejected", () => {
  const noEvidence = validateJudgeFile(write("a.json", judge([{ evidence: [], id: "R1", reason: "x", verdict: "pass" }, { evidence: [3], id: "R2", reason: "y", verdict: "pass" }])), "AE-H-005", ["R1", "R2"], 40);
  assert.ok(noEvidence.problems.some((problem) => /R1: no evidence/u.test(problem)));
  const outOfRange = validateJudgeFile(write("b.json", judge([{ evidence: [99], id: "R1", reason: "x", verdict: "pass" }, { evidence: [3], id: "R2", reason: "y", verdict: "pass" }])), "AE-H-005", ["R1", "R2"], 40);
  assert.ok(outOfRange.problems.some((problem) => /not in the trace/u.test(problem)));
  const missing = validateJudgeFile(write("c.json", judge([{ evidence: [2], id: "R1", reason: "x", verdict: "pass" }])), "AE-H-005", ["R1", "R2"], 40);
  assert.ok(missing.problems.some((problem) => /no verdict for R2/u.test(problem)));
  const rejected = decideCase({ caseId: "AE-H-005", hardPass: true, required: 1, rubricIds: ["R1", "R2"], validations: [noEvidence] });
  assert.notEqual(rejected.verdict, "pass");
  assert.ok(rejected.reasons.some((reason) => /rejected/u.test(reason)));
});

test("two judges that disagree put the case on the manual review list", () => {
  const one = validateJudgeFile(write("j1.json", judge([{ evidence: [2], id: "R1", reason: "x", verdict: "pass" }, { evidence: [5], id: "R2", reason: "y", verdict: "fail" }])), "AE-H-005", ["R1", "R2"], 40);
  const two = validateJudgeFile(write("j2.json", judge([{ evidence: [2], id: "R1", reason: "x", verdict: "pass" }, { evidence: [5], id: "R2", reason: "y", verdict: "pass" }], { session: "s2" })), "AE-H-005", ["R1", "R2"], 40);
  const result = decideCase({ caseId: "AE-H-005", expectJudgeVerdicts: [{ item: "R2", verdict: "fail" }], hardPass: true, required: 2, rubricIds: ["R1", "R2"], validations: [one, two] });
  assert.equal(result.verdict, "needs_review");
  assert.deepEqual(result.disagreements, ["R2: fail vs pass"]);
});

test("expect_judge_verdicts: both judges catching the unsupported claim make the self-check pass", () => {
  const items = [{ evidence: [2], id: "R1", reason: "x", verdict: "pass" as const }, { evidence: [5], id: "R2", reason: "extra sentence", verdict: "fail" as const }];
  const validations = ["k1.json", "k2.json"].map((name, index) => validateJudgeFile(write(name, judge(items, { session: `s${index}` })), "AE-H-005", ["R1", "R2"], 40));
  assert.equal(decideCase({ caseId: "AE-H-005", expectJudgeVerdicts: [{ item: "R2", verdict: "fail" }], hardPass: true, required: 2, rubricIds: ["R1", "R2"], validations }).verdict, "pass");
  assert.equal(decideCase({ caseId: "AE-H-005", hardPass: true, required: 2, rubricIds: ["R1", "R2"], validations }).verdict, "fail", "without the expectation, a failed item fails the case");
});

test("a failed hard check cannot be overturned by passing judgments; too few judgments leave the case unjudged", () => {
  const items = [{ evidence: [2], id: "R1", reason: "x", verdict: "pass" as const }];
  const validation = validateJudgeFile(write("h.json", judge(items)), "AE-H-005", ["R1"], 40);
  assert.equal(decideCase({ caseId: "AE-H-005", hardPass: false, required: 1, rubricIds: ["R1"], validations: [validation] }).verdict, "fail");
  assert.equal(decideCase({ caseId: "AE-H-005", hardPass: true, required: 2, rubricIds: ["R1"], validations: [validation] }).verdict, "unjudged");
});

test("the judge packet carries the prompt, the case, the hard checks and a seq index", () => {
  const packet = renderJudgePacket({
    caseDir: dir,
    caseYaml: "id: AE-H-001",
    checks: [{ args: true, check: "trace_complete", detail: "ok", evidence: [3], status: "pass" }],
    events: [{ seq: 1, text: "你好", type: "turn.user" }, { seq: 2, source: "real", type: "model.response", usage: { prompt_tokens: 5 } }],
    hardPass: true,
    judgeCount: 2,
    judgePrompt: "# 评审者的指示\n版本 1",
    transcript: "**用户**：你好",
  });
  for (const part of ["评审者的指示", "id: AE-H-001", "trace_complete", "1 · turn.user · 你好", "2 · model.response [real]", "本例需要 2 份"]) assert.ok(packet.includes(part), part);
  assert.match(eventIndexLine({ host: "collect.example.test", port: 443, seq: 4, at: "2026-11-15T01:00:00Z", type: "egress.blocked" }), /collect\.example\.test:443/u);
});

// ── README §3.3/§6 (CHANGES 2026-11-15): rubric-item gate; the case result comes from the items ──

test("in a gate run, items gated later are judged but left out of the result and listed; elsewhere every item counts", () => {
  const rubric = [{ id: "R1", text: "a" }, { id: "R2", gate: "AG05", text: "b" }];
  const atAG01 = countedRubric(rubric, "AG01");
  assert.deepEqual(atAG01, { counted: ["R1"], deferred: [{ gate: "AG05", id: "R2" }] });
  assert.deepEqual(countedRubric(rubric, "AG05"), { counted: ["R1", "R2"], deferred: [] });
  assert.deepEqual(countedRubric(rubric, "AG07"), { counted: ["R1", "R2"], deferred: [] });
  assert.deepEqual(countedRubric(rubric, null), { counted: ["R1", "R2"], deferred: [] }, "--all, --sealed and baseline runs count everything");

  const items = [{ evidence: [2], id: "R1", reason: "x", verdict: "pass" as const }, { evidence: [5], id: "R2", reason: "content not there yet", verdict: "fail" as const }];
  const validations = ["g1.json", "g2.json"].map((name, index) => validateJudgeFile(write(name, judge(items, { session: `g${index}` })), "AE-H-005", ["R1", "R2"], 40));
  const gated = decideCase({ caseId: "AE-H-005", deferred: atAG01.deferred, hardPass: true, required: 2, rubricIds: atAG01.counted, validations });
  assert.equal(gated.verdict, "pass");
  assert.ok(gated.reasons.some((reason) => /R2 已评（fail, fail），从 AG05 起计入/u.test(reason)));
  const all = countedRubric(rubric, null);
  assert.equal(decideCase({ caseId: "AE-H-005", deferred: all.deferred, hardPass: true, required: 2, rubricIds: all.counted, validations }).verdict, "fail");
});

test("the case result never comes from the judge's own overall", () => {
  const passingItems = [{ evidence: [2], id: "R1", reason: "x", verdict: "pass" as const }];
  const saysFail = validateJudgeFile(write("o1.json", { ...judge(passingItems), overall: "fail" }), "AE-H-005", ["R1"], 40);
  assert.equal(decideCase({ caseId: "AE-H-005", hardPass: true, required: 1, rubricIds: ["R1"], validations: [saysFail] }).verdict, "pass");
  const failingItems = [{ evidence: [2], id: "R1", reason: "x", verdict: "fail" as const }];
  const saysPass = validateJudgeFile(write("o2.json", { ...judge(failingItems), overall: "pass" }), "AE-H-005", ["R1"], 40);
  assert.equal(decideCase({ caseId: "AE-H-005", hardPass: true, required: 1, rubricIds: ["R1"], validations: [saysPass] }).verdict, "fail");
});

test("the judge packet notes each item's gate; judges still judge every item", () => {
  const packet = renderJudgePacket({
    caseDir: dir,
    caseYaml: "id: AE-ENT-004\nrubric:\n  - id: R1\n    text: 第一条针对待办\n  - id: R3\n    text: 第一条列出了未完成的待办\n    gate: AG05\n",
    checks: [],
    events: [],
    hardPass: true,
    judgeCount: 2,
    judgePrompt: "指示",
    transcript: "",
  });
  assert.ok(packet.includes("- R1：第一条针对待办"));
  assert.ok(packet.includes("- R3：第一条列出了未完成的待办（从 AG05 起计入本例结论）"));
  assert.match(packet, /每一条都照常评/u);
});

test("costs: priced from usage at the call time, real only; problems listed when the balance is missing", () => {
  assert.equal(isPeakBeijing("2026-11-16T02:00:00Z"), true, "Monday 10:00 Beijing");
  assert.equal(isPeakBeijing("2026-11-15T02:00:00Z"), false, "Sunday");
  assert.equal(deepseekCost("deepseek-v4-flash", { completion_tokens: 1_000_000, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 }, "2026-11-15T02:00:00Z"), 4);
  const events = { "AE-H-007": [{ seq: 1, source: "simulated" as const, type: "model.request" }, { seq: 2, source: "simulated" as const, type: "model.response", usage: null }, { seq: 3, source: "real" as const, type: "model.request" }, { at: "2026-11-15T02:00:00Z", model: "deepseek-flash", seq: 4, source: "real" as const, type: "model.response", usage: { completion_tokens: 10, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100, prompt_tokens: 100 } }] };
  const tally = tallyCosts(events);
  assert.deepEqual(tally.calls.model, { real: 1, replay: 0, simulated: 1 });
  assert.ok(Math.abs(tally.amountCny.total - (100 * 1 + 10 * 4) / 1_000_000) < 1e-12);
  const outcomes = [{ events: events["AE-H-007"] }] as never;
  assert.ok(costsProblems(finishCosts(tally, null, null), outcomes).some((problem) => /balance before/u.test(problem)));
  const reading = { at: "t", currency: "CNY", raw: {}, total: 10 };
  assert.deepEqual(costsProblems(finishCosts(tally, reading, { ...reading, total: 9.99 }), outcomes), []);
});

test("report.md lists, per case, the items judged in a gate run but counted from a later sprint (README §3.3)", async () => {
  const { renderRunReport } = await import("./lib/report-md");
  const summary = { cases: [{ account: "A", area: "ENT", calls: { realJudgment: 0, realModel: 1, simulatedJudgment: 0, simulatedModel: 0 }, cannotJudge: [], costCny: 0, failed: [], hardPass: true, id: "AE-ENT-003", invariant: false, invariantChecks: { fail: 0, pass: 0 }, otherChecks: { fail: 0, pass: 3 }, unsupportedSteps: [] }], endedAt: "t1", gate: "AG04", hardPass: 1, invariantPack: [], label: "AG04-gate", runId: "r1", simulatedCases: [], soloExcluded: [], startedAt: "t0", total: 1, voidReasons: [], voided: false };
  const costs = finishCosts(tallyCosts({}), null, null);
  const judged = new Map([["AE-ENT-003", { caseId: "AE-ENT-003", deferred: [{ gate: "AG05", id: "R1", verdicts: ["fail", "fail"] }], reasons: [], verdict: "pass" as const }]]);
  const report = renderRunReport(summary as never, costs, judged);
  assert.match(report, /## 已评、从后续 sprint 起计入的评审项（1 项）/u);
  assert.match(report, /\| AE-ENT-003 \| R1 \| AG05 \| fail, fail \|/u);
  const none = renderRunReport(summary as never, costs, new Map([["AE-ENT-003", { caseId: "AE-ENT-003", reasons: [], verdict: "pass" as const }]]));
  assert.match(none, /已评、从后续 sprint 起计入的评审项（0 项）/u);
  const verdict = decideCase({ caseId: "AE-ENT-003", deferred: [{ gate: "AG05", id: "R1" }], hardPass: true, required: 0, rubricIds: [], validations: [] });
  assert.deepEqual(verdict.deferredVerdicts, [{ gate: "AG05", id: "R1", verdicts: [] }], "decideCase hands the judged verdicts to the report");
});
