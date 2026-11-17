/**
 * Thresholds per question × language (设计稿 §3.8 "置信度怎么用"; agent-design AG08-3).
 *
 * The values come from `npm run agent-eval:calibrate` (scripts/agent-eval/calibrate-judgment.ts), recorded in
 * docs/epics/agent-design/eval/calibration/judgment-thresholds-v1.md and written to thresholds-config.ts with
 * a version. A missing cell means the question is not enabled for that language: it is not sent and is
 * treated as "judgment unavailable". An answer below its cell falls to the question's conservative result.
 *
 * The eval may mark questions as not calibrated for one case (patch `judgment-uncalibrated-match`); that
 * override exists only under ORBIT_AGENT_EVAL=1 (evalSetting is null outside the eval).
 */
import { evalSetting } from "../observability/trace";
import type { JudgmentLanguage, JudgmentQuestionId } from "./questions";
import { JUDGMENT_THRESHOLDS } from "./thresholds-config";

export interface ThresholdConfig {
  version: string;
  model: string;
  calibratedOn: string | null;
  /** question → language → the lowest confidence a non-conservative answer is taken at. */
  cells: Partial<Record<JudgmentQuestionId, Partial<Record<JudgmentLanguage, number>>>>;
}

/** Questions the case marks as not calibrated (eval only). */
function evalUncalibrated(): Set<string> {
  const value = evalSetting("judgment_uncalibrated");
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

/** The threshold of a question in a language, or null when that cell is not enabled. */
export function thresholdFor(id: JudgmentQuestionId, language: JudgmentLanguage, config: ThresholdConfig = JUDGMENT_THRESHOLDS): number | null {
  config ??= JUDGMENT_THRESHOLDS;
  if (evalUncalibrated().has(id)) return null;
  const value = config.cells[id]?.[language];
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1 ? value : null;
}

export function thresholdVersion(config: ThresholdConfig = JUDGMENT_THRESHOLDS): string {
  return (config ?? JUDGMENT_THRESHOLDS).version;
}

export { JUDGMENT_THRESHOLDS };
