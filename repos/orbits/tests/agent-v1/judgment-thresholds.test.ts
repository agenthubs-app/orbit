import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { askJudgment, newJudgmentBudget } from "../../features/agent-v1/judgment/ask";
import { QUESTION_IDS, QUESTIONS, type JudgmentLanguage, type JudgmentQuestionId } from "../../features/agent-v1/judgment/questions";
import { JUDGMENT_THRESHOLDS, thresholdFor } from "../../features/agent-v1/judgment/thresholds";
import { captureTrace } from "./graph-kit";
import { choice, graded, judgeStub, noul } from "./judgment-kit";

/**
 * agent-design AG08-3: thresholds per question × language, with a version and a calibration record; a missing cell
 * is not enabled; below the threshold every question falls to its conservative result (§3.8 用途表).
 */

// AG09: v2 calibrated outbound.extra and carries the other cells from v1; AG10: v3 calibrated interaction.happened and
// followup.owner. A cell's row is in the record that calibrated it (the newest record first).
const RECORDS = ["judgment-thresholds-v3.md", "judgment-thresholds-v2.md", "judgment-thresholds-v1.md"].map((name) => path.resolve(__dirname, "..", "..", "..", "..", "docs", "epics", "agent-design", "eval", "calibration", name));
const LANGUAGES: JudgmentLanguage[] = ["zh", "ja", "en"];

test("AG08-3 the eleven questions of 附录 C, each with a type, options, a version and its conservative result", () => {
  assert.equal(QUESTION_IDS.length, 11);
  const conservative = Object.fromEntries(QUESTION_IDS.map((id) => [id, QUESTIONS[id].conservative]));
  assert.deepEqual(conservative, {
    "duplicate.same": "unsure",
    "evidence.sameBasis": "no",
    "evidence.sameEntity": "no",
    "evidence.sameTime": "no",
    "evidence.supports": "no",
    "followup.owner": "doubtful",
    "intent.explicitWrite": "no",
    "interaction.happened": "no",
    "match.level": "insufficient",
    "outbound.extra": "yes",
    "quote.sentence": "none",
  });
  for (const id of QUESTION_IDS) assert.match(QUESTIONS[id].version, new RegExp(`^${id.replace(".", "\\.")}@\\d+$`, "u"));
  assert.equal(QUESTIONS["match.level"].type, "score");
  assert.equal(QUESTIONS["duplicate.same"].type, "choice");
  assert.equal(QUESTIONS["intent.explicitWrite"].type, "noul");
});

test("AG08-3 a missing cell is not enabled; the enabled cells are exactly the calibrated ones, each in the record with ≥20 dev samples", () => {
  assert.match(JUDGMENT_THRESHOLDS.version, /^judgment-thresholds@\d+$/u);
  const lines = RECORDS.flatMap((file) => fs.readFileSync(file, "utf8").split("\n"));
  for (const id of QUESTION_IDS) {
    for (const language of LANGUAGES) {
      const value = thresholdFor(id, language);
      const row = lines.find((line) => line.startsWith(`| \`${id}\` | ${language} |`) && /^\| [^|]+ \| [a-z]+ \| \d+ /u.test(line)) ?? lines.find((line) => line.startsWith(`| \`${id}\` | ${language} |`));
      if (value === null) {
        if (row) assert.match(row, /未启用/u, `${id}/${language} is not enabled, and the record says so`);
        continue;
      }
      assert.ok(row, `${id}/${language} has a threshold, so it has a calibration row`);
      const cells = row!.split("|").map((cell) => cell.trim());
      assert.ok(Number(cells[3]) >= 20, `${id}/${language}: at least 20 dev samples`);
      assert.equal(Number(cells[4]), value, `${id}/${language}: the threshold in code is the recorded one`);
    }
  }
  for (const id of ["evidence.supports", "evidence.sameEntity", "quote.sentence"] as JudgmentQuestionId[]) {
    for (const language of LANGUAGES) assert.equal(thresholdFor(id, language), null, `${id} is registered but not enabled`);
  }
  // AG10: the two extraction reviews are calibrated in v3 and enabled in the three languages.
  for (const id of ["interaction.happened", "followup.owner"] as JudgmentQuestionId[]) {
    for (const language of LANGUAGES) assert.notEqual(thresholdFor(id, language), null, `${id}/${language} is enabled from AG10`);
  }
});

test("AG08-3 the eval's 'not calibrated' override (judgment_uncalibrated) turns a cell off, only inside the eval", () => {
  assert.notEqual(thresholdFor("match.level", "zh"), null);
  const trace = captureTrace();
  try {
    trace.settings.judgment_uncalibrated = ["match.level"];
    assert.equal(thresholdFor("match.level", "zh"), null);
    assert.notEqual(thresholdFor("duplicate.same", "zh"), null);
  } finally {
    trace.restore();
  }
  assert.notEqual(thresholdFor("match.level", "zh"), null, "outside the eval hook there is no override");
});

test("AG08-3 below each enabled threshold, each question falls to its conservative result (with the calibrated configuration)", async () => {
  const answers: Record<string, (threshold: number) => Record<string, unknown>> = {
    "duplicate.same": (threshold) => choice("same", threshold - 0.01),
    "intent.explicitWrite": (threshold) => noul(threshold - 0.01),
    // Most likely "match", but P(at least partial) is just under the threshold.
    "match.level": (threshold) => graded(1 - (threshold - 0.01), 0, threshold - 0.01),
  };
  for (const [id, answer] of Object.entries(answers) as [JudgmentQuestionId, (threshold: number) => Record<string, unknown>][]) {
    for (const language of LANGUAGES) {
      const threshold = thresholdFor(id, language)!;
      const stub = judgeStub(() => answer(threshold));
      const outcome = await askJudgment({ apiKey: "k", fetchImplementation: stub.fetchImplementation }, newJudgmentBudget(), { input: ["x"], items: [{ key: "k1", question: id, subject: "k1" }], language, purpose: "rank" });
      const verdict = outcome.verdicts.get("k1")!;
      assert.equal(verdict.answer, QUESTIONS[id].conservative, `${id}/${language} below ${threshold}`);
      assert.equal(verdict.reason, "below_threshold");
    }
  }
});
