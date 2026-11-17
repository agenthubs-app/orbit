import assert from "node:assert/strict";
import test from "node:test";

import { askJudgment, JUDGMENT_CALLS_PER_ROUND, newJudgmentBudget, optionOf } from "../../features/agent-v1/judgment/ask";
import { captureTrace } from "./graph-kit";
import { access, choice, graded, judgeStub, noul, score, TEST_THRESHOLDS } from "./judgment-kit";

/**
 * agent-design AG08-3, AG08-4: askJudgment()'s fixed rules — a round's three requests, thresholds, conservative
 * results, answers for names that were not asked, and what each request leaves in the trace.
 */

const item = (key: string) => ({ key, question: "match.level" as const, subject: key });

test("AG08-4 a round has at most 3 judgment requests; the 4th is not sent and is conservative (budget)", async () => {
  assert.equal(JUDGMENT_CALLS_PER_ROUND, 3);
  const stub = judgeStub(() => score(2, 0.9));
  const budget = newJudgmentBudget();
  for (let index = 0; index < 3; index += 1) {
    const outcome = await askJudgment(access(stub.fetchImplementation), budget, { input: ["x"], items: [item("c1")], language: "zh", purpose: "rank" });
    assert.equal(outcome.verdicts.get("c1")!.answer, "match");
  }
  const fourth = await askJudgment(access(stub.fetchImplementation), budget, { input: ["x"], items: [item("c1")], language: "zh", purpose: "rank" });
  assert.equal(stub.calls.length, 3, "no 4th request");
  assert.equal(fourth.sent, false);
  assert.equal(fourth.unavailable, "budget");
  assert.deepEqual({ answer: fourth.verdicts.get("c1")!.answer, reason: fourth.verdicts.get("c1")!.reason }, { answer: "insufficient", reason: "unavailable" });
});

test("AG08-3 an answer below its threshold falls to the conservative result; a conservative answer is kept as the model's", async () => {
  // Thresholds (test): match.level 0.6. A graded answer is read on its scale: P(at least partial), P(at least match).
  const stub = judgeStub((id) => (id.endsWith("c1") ? graded(0.42, 0.1, 0.48) : id.endsWith("c2") ? graded(0.1, 0.46, 0.44) : id.endsWith("c4") ? graded(0.05, 0.25, 0.7) : graded(0.6, 0.2, 0.2)));
  const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [item("c1"), item("c2"), item("c3"), item("c4")], language: "en", purpose: "rank" });
  assert.deepEqual({ answer: outcome.verdicts.get("c1")!.answer, raw: outcome.verdicts.get("c1")!.raw, reason: outcome.verdicts.get("c1")!.reason }, { answer: "insufficient", raw: "match", reason: "below_threshold" }, "most likely match, but P(at least partial) 0.58 < 0.6");
  assert.equal(outcome.verdicts.get("c2")!.answer, "partial", "split between partial and match: at least partial (0.9), not match (0.44)");
  assert.equal(outcome.verdicts.get("c4")!.answer, "match");
  assert.equal(outcome.verdicts.get("c3")!.answer, "insufficient", "insufficient is the conservative answer itself: below threshold changes nothing");
  assert.equal(outcome.verdicts.get("c3")!.fallback, false);
});

test("AG08-1 answers for names that were not asked are dropped and counted; nothing is taken from them", async () => {
  const stub = judgeStub(() => score(2, 0.9), { extra: { match_level__E999: score(2, 0.99), stray: noul(0.9) } });
  const trace = captureTrace();
  try {
    const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [item("c1")], language: "zh", purpose: "rank" });
    assert.equal(outcome.rejected, 2);
    assert.deepEqual([...outcome.verdicts.keys()], ["c1"]);
    const decided = trace.events.find((event) => event.type === "judgment.decided")!;
    assert.equal(decided.rejected, 2);
  } finally {
    trace.restore();
  }
});

test("AG08-3 a question with no threshold for the language is not sent (not enabled); with nothing left no request is made", async () => {
  const stub = judgeStub(() => choice("me", 0.99));
  const outcome = await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { input: ["x"], items: [{ key: "f1", question: "followup.owner", subject: "f1" }], language: "zh", purpose: "evidence" });
  assert.equal(stub.calls.length, 0);
  assert.equal(outcome.sent, false);
  assert.deepEqual({ answer: outcome.verdicts.get("f1")!.answer, reason: outcome.verdicts.get("f1")!.reason }, { answer: "doubtful", reason: "not_enabled" });
});

test("AG08-1 each request is traced: question ids and versions, threshold version, candidates, tokens, time, share below threshold", async () => {
  const stub = judgeStub((id) => (id.endsWith("c1") ? score(2, 0.9) : graded(0.42, 0.1, 0.48)));
  const trace = captureTrace();
  try {
    await askJudgment(access(stub.fetchImplementation), newJudgmentBudget(), { coverage: { afterHardConditions: 2, judged: 2, total: 9, truncated: 0 }, input: ["x"], items: [item("c1"), item("c2")], language: "zh", purpose: "rank" });
    const decided = trace.events.find((event) => event.type === "judgment.decided")!;
    assert.deepEqual(decided.questionIds, ["match.level"]);
    assert.deepEqual(decided.questionVersions, { "match.level": "match.level@1" });
    assert.equal(decided.thresholdVersion, TEST_THRESHOLDS.version);
    assert.equal(decided.candidates, 2);
    assert.equal(decided.inputTokens, 200);
    assert.equal(decided.belowThresholdShare, 0.5);
    assert.deepEqual(decided.coverage, { afterHardConditions: 2, judged: 2, total: 9, truncated: 0 });
    assert.equal(typeof decided.durationMs, "number");
  } finally {
    trace.restore();
  }
});

test("optionOf: noul by its probability of yes, choice only among the options, score by the most likely level", () => {
  assert.equal(optionOf({ confidence: 0.9, noul: 0.9, type: "noul" }, ["yes", "no"]), "yes");
  assert.equal(optionOf({ confidence: 0.6, noul: 0.4, type: "noul" }, ["yes", "no"]), "no");
  assert.equal(optionOf({ choice: "merge", confidence: 0.9, type: "choice" }, ["same", "different", "unsure"]), null);
  assert.equal(optionOf({ confidence: 0.7, probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 }, score: 1.1, type: "score" }, ["insufficient", "partial", "match"]), "partial");
});
