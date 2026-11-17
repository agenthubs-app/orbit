/**
 * npm run agent-eval:calibrate [-- --write] (agent-design AG08, 设计稿 §3.8 "置信度怎么用"; PLANNER 执行顺序 5).
 *
 * Sends every labelled sample of docs/epics/agent-design/eval/calibration/judgment-samples-v1.yaml to the real
 * Gemini Decisions endpoint, built exactly as the product builds the request (the same question wording, criteria
 * and input text), and picks per question × language the threshold: the lowest confidence at which no
 * non-conservative answer of the dev samples is wrong. A cell with fewer than 20 dev samples, or with no correct
 * non-conservative answer above the highest wrong one, is not enabled. The val samples are only checked.
 *
 * Writes the record (eval/calibration/judgment-thresholds-v1.md) and the raw answers (evidence directory); with
 * --write also features/agent-v1/judgment/thresholds-config.ts. The key is read from the environment or the eval
 * env file and never printed. Paid calls: one per sample (match.level: one per set), input tokens only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import yaml from "js-yaml";

import { askJudgment, atLeast, newJudgmentBudget, type JudgmentItem } from "../../features/agent-v1/judgment/ask";
import { requestDecisions, wireIdOf } from "../../features/agent-v1/judgment/gemini-decision";
import { duplicateJudgmentInput } from "../../features/agent-v1/judgment/duplicate";
import { rankJudgmentInput } from "../../features/agent-v1/judgment/funnel";
import { intentJudgmentInput, intentSubject } from "../../features/agent-v1/judgment/intent-review";
import { questionOf, QUESTION_IDS, type JudgmentLanguage, type JudgmentQuestionId } from "../../features/agent-v1/judgment/questions";
import type { ThresholdConfig } from "../../features/agent-v1/judgment/thresholds";
import { JUDGMENT_MODEL } from "../../features/agent-v1/judgment/gemini-decision";

const ORBITS = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(ORBITS, "..", "..");
const SAMPLES = path.join(ROOT, "docs", "epics", "agent-design", "eval", "calibration", "judgment-samples-v1.yaml");
const RECORD = path.join(ROOT, "docs", "epics", "agent-design", "eval", "calibration", "judgment-thresholds-v1.md");
const CONFIG = path.join(ORBITS, "features", "agent-v1", "judgment", "thresholds-config.ts");
const EVIDENCE = path.join(os.homedir(), "orbit-sprint-evidence", "agent-design", "sprint-AG08", "run-01", "calibration");
export const MIN_SAMPLES = 20;
const LANGUAGES: JudgmentLanguage[] = ["zh", "ja", "en"];

interface Result {
  /** score questions: P(level ≥ each level), as the product reads a graded answer. */
  atLeast?: number[];
  id: string;
  question: JudgmentQuestionId;
  language: JudgmentLanguage;
  group: "dev" | "val";
  label: string;
  raw: string | null;
  confidence: number | null;
}

/** Whether a non-conservative answer is right (the labelling rule written at the top of the samples file). */
export function correct(question: JudgmentQuestionId, raw: string, label: string): boolean {
  if (question === "match.level") return label !== "insufficient";
  return raw === label;
}

/** A graded threshold is never below one half: an answer taken as at least "partial" is more likely than not. */
export const SCORE_FLOOR = 0.5;

/** The lowest confidence at which no wrong non-conservative dev answer is taken; null when there is none to take. */
export function pickThreshold(question: JudgmentQuestionId, results: readonly Result[]): number | null {
  if (questionOf(question).type === "score") {
    // A graded answer is taken as at least the second level when P(level ≥ 1) reaches the threshold (ask.ts scoreDecision).
    const graded = results.filter((result) => result.atLeast);
    const wrong = graded.filter((result) => !correct(question, "taken", result.label));
    const highestWrong = wrong.length ? Math.max(...wrong.map((result) => result.atLeast![1])) : -Infinity;
    const right = graded.filter((result) => correct(question, "taken", result.label) && result.atLeast![1] > highestWrong && result.atLeast![1] >= SCORE_FLOOR);
    return right.length ? Math.min(...right.map((result) => result.atLeast![1])) : null;
  }
  const conservative = questionOf(question).conservative;
  const taken = results.filter((result) => result.raw !== null && result.raw !== conservative && result.confidence !== null);
  const wrong = taken.filter((result) => !correct(question, result.raw!, result.label));
  const highestWrong = wrong.length ? Math.max(...wrong.map((result) => result.confidence!)) : -Infinity;
  const right = taken.filter((result) => correct(question, result.raw!, result.label) && result.confidence! > highestWrong);
  if (!right.length) return null;
  return Math.min(...right.map((result) => result.confidence!));
}

function apiKey(): string {
  const fromEnv = process.env.ORBIT_GEMINI_DECISION_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(ORBITS, ".env.agent-eval");
  const fromFile = fs.existsSync(file) ? (parseEnv(fs.readFileSync(file, "utf8")) as Record<string, string>).ORBIT_GEMINI_DECISION_API_KEY?.trim() : undefined;
  if (!fromFile) throw new Error("ORBIT_GEMINI_DECISION_API_KEY is not set (environment or .env.agent-eval); nothing was sent.");
  return fromFile;
}

/** Every cell enabled with a tiny threshold: the raw answers come back as the model gave them. */
const OPEN: ThresholdConfig = { calibratedOn: null, cells: Object.fromEntries(QUESTION_IDS.map((id) => [id, { en: 1e-6, ja: 1e-6, zh: 1e-6 }])), model: JUDGMENT_MODEL, version: "calibration-open" };

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const samples = yaml.load(fs.readFileSync(SAMPLES, "utf8")) as Record<string, any>;
  const access = { apiKey: apiKey(), thresholds: OPEN, timeoutMs: 15_000 };
  const results: Result[] = [];
  let requests = 0;
  let inputTokens = 0;
  const ask = async (language: JudgmentLanguage, input: string[], items: JudgmentItem[], purpose: "rank" | "intent" | "duplicate") => {
    const outcome = await askJudgment(access, newJudgmentBudget(), { input, items, language, purpose });
    requests += 1;
    inputTokens += outcome.inputTokens ?? 0;
    if (outcome.unavailable) throw new Error(`a calibration request failed (${outcome.unavailable}); stopping, nothing was written`);
    return outcome;
  };
  for (const set of samples["match.level"] as any[]) {
    const candidates = set.candidates as { key: string; text: string; label: string }[];
    // The raw graded answers (probabilities by level), built exactly as askJudgment builds the request.
    const question = questionOf("match.level");
    const raw = await requestDecisions({
      apiKey: access.apiKey,
      input: rankJudgmentInput(set.language, set.basis, candidates),
      questions: Object.fromEntries(candidates.map((candidate) => [wireIdOf("match.level", candidate.key), { criteria: question.criteria!(set.language), instructions: question.instructions(set.language, candidate.key), type: question.type }])),
      timeoutMs: 15_000,
    });
    requests += 1;
    inputTokens += raw.inputTokens ?? 0;
    for (const candidate of candidates) {
      const answer = raw.answers[wireIdOf("match.level", candidate.key)];
      const cumulative = answer ? atLeast(answer, question.options.length) : undefined;
      results.push({ ...(cumulative ? { atLeast: cumulative } : {}), confidence: cumulative?.[1] ?? null, group: set.group, id: `${set.set}:${candidate.key}`, label: candidate.label, language: set.language, question: "match.level", raw: cumulative ? "taken" : null });
    }
  }
  for (const sample of samples["intent.explicitWrite"] as any[]) {
    const outcome = await ask(sample.language, intentJudgmentInput(sample.language, sample.message), [{ key: "m", question: "intent.explicitWrite", subject: intentSubject(sample.quote ?? sample.message) }], "intent");
    const verdict = outcome.verdicts.get("m");
    results.push({ confidence: verdict?.confidence ?? null, group: sample.group, id: sample.id, label: sample.label, language: sample.language, question: "intent.explicitWrite", raw: verdict?.raw ?? null });
  }
  for (const sample of samples["duplicate.same"] as any[]) {
    const outcome = await ask(sample.language, duplicateJudgmentInput(sample.language, sample.fresh, [{ ...sample.existing, key: "d1" }]), [{ key: "d1", question: "duplicate.same", subject: "d1" }], "duplicate");
    const verdict = outcome.verdicts.get("d1");
    results.push({ confidence: verdict?.confidence ?? null, group: sample.group, id: sample.id, label: sample.label, language: sample.language, question: "duplicate.same", raw: verdict?.raw ?? null });
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const at = new Date().toISOString();
  fs.writeFileSync(path.join(EVIDENCE, `raw-${at.replace(/[:.]/gu, "-")}.json`), JSON.stringify({ at, inputTokens, model: JUDGMENT_MODEL, requests, results }, null, 2));

  const cells: ThresholdConfig["cells"] = {};
  const rows: string[] = [];
  for (const question of ["match.level", "intent.explicitWrite", "duplicate.same"] as const) {
    for (const language of LANGUAGES) {
      const dev = results.filter((result) => result.question === question && result.language === language && result.group === "dev");
      const val = results.filter((result) => result.question === question && result.language === language && result.group === "val");
      const picked = dev.length >= MIN_SAMPLES ? pickThreshold(question, dev) : null;
      // Rounded down to a thousandth; the counts below are taken at the rounded value.
      const threshold = picked === null ? null : Math.floor(picked * 1000) / 1000;
      const conservative = questionOf(question).conservative;
      const acted = (list: Result[]) => (threshold === null ? [] : list.filter((result) => result.raw !== null && result.raw !== conservative && result.confidence !== null && result.confidence >= threshold));
      const wrongAt = (list: Result[]) => acted(list).filter((result) => !correct(question, result.raw!, result.label));
      if (threshold !== null) cells[question] = { ...(cells[question] ?? {}), [language]: threshold };
      rows.push(`| \`${question}\` | ${language} | ${dev.length} | ${threshold === null ? "未启用" : threshold.toFixed(3)} | ${threshold === null ? "—" : `${acted(dev).length}/${dev.length}`} | ${threshold === null ? "—" : wrongAt(dev).length} | ${val.length} | ${threshold === null ? "—" : `${acted(val).length}/${val.length}，误判 ${wrongAt(val).length}`} |`);
    }
  }
  const notCalibrated = QUESTION_IDS.filter((id) => !["match.level", "intent.explicitWrite", "duplicate.same"].includes(id));
  const record = [
    "# 判断题门槛的校准记录 v1",
    "",
    `由 \`npm run agent-eval:calibrate\` 写出（scripts/agent-eval/calibrate-judgment.ts），最近一次：${at}。模型 \`${JUDGMENT_MODEL}\`，真实调用 ${requests} 次，输入 ${inputTokens} token。样本：[judgment-samples-v1.yaml](judgment-samples-v1.yaml)；原始返回在 \`~/orbit-sprint-evidence/agent-design/sprint-AG08/run-01/calibration/\`。`,
    "",
    "门槛的定法（PLANNER 执行顺序 5）：只看 dev 样本，取“非保守答案零误判”的最低置信度——比最高的一个误判还高的正确非保守答案里，置信度最低的那个；dev 样本不足 20 条，或者没有这样的答案，这一格不启用。val 只用来核对。门槛向下取到千分位。",
    "",
    "`match.level` 是评级题，按等级读：置信度取“至少部分匹配”的概率（证据不足以外两级之和），过门槛才算部分匹配，“至少匹配”的概率也过门槛才算匹配（ask.ts `scoreDecision`）；它的门槛不低于 0.5。误判指标注为证据不足的候选被算成至少部分匹配。",
    "",
    "| 题目 | 语言 | dev 样本 | 门槛 | dev 上采纳（非保守且过门槛） | dev 误判 | val 样本 | val 上采纳 |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `未校准、不启用（本 sprint 不发这些题，按“判断不可用”处理）：${notCalibrated.map((id) => `\`${id}\``).join("、")}。其中 \`interaction.happened\`、\`followup.owner\` 由 AG10、\`outbound.extra\` 由 AG09 校准；证据核对的四题与 \`quote.sentence\` 本 sprint 没有样本。`,
    "",
  ].join("\n");
  fs.writeFileSync(RECORD, record);
  const config: ThresholdConfig = { calibratedOn: at.slice(0, 10), cells, model: JUDGMENT_MODEL, version: "judgment-thresholds@1" };
  if (write) {
    fs.writeFileSync(CONFIG, [
      "/**",
      " * Written by `npm run agent-eval:calibrate -- --write` (scripts/agent-eval/calibrate-judgment.ts). Do not edit",
      " * by hand: a changed value needs a calibration run and its record (eval/calibration/judgment-thresholds-v1.md).",
      " * A question or language missing here is not enabled.",
      " */",
      'import type { ThresholdConfig } from "./thresholds";',
      "",
      `export const JUDGMENT_THRESHOLDS: ThresholdConfig = ${JSON.stringify(config, null, 2).replace(/"([A-Za-z]+)":/gu, "$1:")};`,
      "",
    ].join("\n"));
  }
  console.log(record);
  console.log(`requests ${requests}, input tokens ${inputTokens}${write ? `; wrote ${path.relative(ORBITS, CONFIG)}` : ""}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
