/**
 * askJudgment() (设计稿 §3.8; agent-design AG08-3, AG08-4): one request to the judgment model for one use,
 * every item of that use in it, and the fixed rules around it — all in code:
 *
 * - A round has at most 3 judgment requests (§3.3), each 3 s. Out of requests, no key, a timeout, an HTTP
 *   error, a stop or a malformed body: the judgment is unavailable and every item gets its conservative result.
 * - A question with no threshold for the language is not enabled: its items are not sent (conservative,
 *   `not_enabled`); when no item is left, no request is made.
 * - An answer below its threshold falls to the conservative result. Confidence never grants a write and never
 *   stands in for a click: callers only choose between a conservative result and going on to a card.
 * - Answers for ids that were not asked are dropped and counted (`rejected`); an item with no usable answer
 *   is conservative (`missing`).
 * - Each request is traced as `judgment.decided`: the question ids and versions, the threshold version, the
 *   candidate counts, input tokens, time, the share below threshold and every verdict. The raw HTTP request and
 *   response (with source real / simulated) are the eval preload's `judgment.request` / `judgment.response`.
 */
import { scrubModelInput } from "../domains/contact/field-grants";
import { emitTrace } from "../observability/trace";
import { JudgmentRequestError, requestDecisions, wireIdOf, type DecisionAnswer, type DecisionQuestion } from "./gemini-decision";
import { questionOf, type JudgmentLanguage, type JudgmentQuestionId } from "./questions";
import { thresholdFor, thresholdVersion, type ThresholdConfig } from "./thresholds";

export const JUDGMENT_CALLS_PER_ROUND = 3;

export interface JudgmentBudget {
  limit: number;
  used: number;
}

export const newJudgmentBudget = (): JudgmentBudget => ({ limit: JUDGMENT_CALLS_PER_ROUND, used: 0 });

/** How the graph reaches the judgment model (absent or without a key: unavailable). */
export interface JudgmentAccess {
  apiKey: string | null;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  /** The threshold configuration (the calibrated one by default; tests and the calibration pass their own). */
  thresholds?: ThresholdConfig;
}

export interface JudgmentItem {
  /** Unique within the request ([A-Za-z0-9_-]); a candidate key such as c12, or "m" for the message. */
  key: string;
  question: JudgmentQuestionId;
  /** What the instruction names (the candidate's key, the record compared with). */
  subject: string;
}

export interface JudgmentAsk {
  purpose: "rank" | "intent" | "duplicate" | "evidence" | "outbound" | "extract";
  language: JudgmentLanguage;
  /** The text all items are judged on: only the fields the question needs (never e-mail or phone). */
  input: readonly string[];
  items: readonly JudgmentItem[];
  /** For a ranking: how many there were, after the hard conditions, sent, cut off. */
  coverage?: { total: number; afterHardConditions: number; judged: number; truncated: number };
  requestId?: string;
}

export type FallbackReason = "below_threshold" | "not_enabled" | "unavailable" | "missing";
export type UnavailableReason = "no_key" | "budget" | "timeout" | "http_error" | "network" | "malformed" | "aborted";

export interface JudgmentVerdict {
  key: string;
  question: JudgmentQuestionId;
  /** The answer code acts on: the model's, or the conservative result. */
  answer: string;
  /** The model's own answer (null when there was none). */
  raw: string | null;
  confidence: number | null;
  threshold: number | null;
  fallback: boolean;
  reason: FallbackReason | null;
  /** score: the model's expected level (orders answers of the same level). */
  expected?: number;
}

export interface JudgmentOutcome {
  /** A request was made (sent, whatever came back). */
  sent: boolean;
  /** Null when the request answered (or nothing needed sending); otherwise why it is unavailable. */
  unavailable: UnavailableReason | null;
  verdicts: Map<string, JudgmentVerdict>;
  rejected: number;
  inputTokens: number | null;
  durationMs: number;
}

/** The option an answer stands for, or null when it names none of them. */
export function optionOf(answer: DecisionAnswer, options: readonly string[]): string | null {
  if (answer.type === "noul") return (answer.noul ?? 0) >= 0.5 ? "yes" : "no";
  if (answer.type === "choice") return answer.choice && options.includes(answer.choice) ? answer.choice : null;
  const entries = Object.entries(answer.probabilities ?? {}).map(([index, value]) => [Number(index), value] as const).filter(([index]) => Number.isInteger(index) && index >= 0 && index < options.length);
  if (!entries.length) return null;
  const [best] = [...entries].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  return options[best];
}

/** score: the probability that the level is at least each level (index 0 is always 1). */
export function atLeast(answer: DecisionAnswer, levels: number): number[] {
  const probability = (index: number) => {
    const value = answer.probabilities?.[String(index)];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  return Array.from({ length: levels }, (_value, level) => Array.from({ length: levels - level }, (_unused, offset) => probability(level + offset)).reduce((sum, value) => sum + value, 0));
}

/**
 * A graded answer (score) is read on its scale: the highest level whose "at least this level" probability reaches
 * the threshold, with that probability as its confidence; none reaching it is the lowest level (conservative). An
 * answer split between two good levels ("partial" 0.46, "match" 0.43) is therefore at least "partial" (0.89),
 * never "insufficient" for being split. The model's expected level (`score`) orders answers of the same level.
 */
export function scoreDecision(answer: DecisionAnswer, levels: number, threshold: number): { level: number; confidence: number } {
  const cumulative = atLeast(answer, levels);
  for (let level = levels - 1; level >= 1; level -= 1) if (cumulative[level] >= threshold) return { confidence: cumulative[level], level };
  return { confidence: 1 - (cumulative[1] ?? 0), level: 0 };
}

function wireQuestion(item: JudgmentItem, language: JudgmentLanguage): DecisionQuestion {
  const question = questionOf(item.question);
  return { instructions: question.instructions(language, item.subject), type: question.type, ...(question.criteria ? { criteria: question.criteria(language) } : {}) };
}

export async function askJudgment(access: JudgmentAccess | null | undefined, budget: JudgmentBudget, ask: JudgmentAsk, options: { signal?: AbortSignal } = {}): Promise<JudgmentOutcome> {
  const verdicts = new Map<string, JudgmentVerdict>();
  const conservative = (item: JudgmentItem, reason: FallbackReason, threshold: number | null = null, raw: string | null = null, confidence: number | null = null) => {
    verdicts.set(item.key, { answer: questionOf(item.question).conservative, confidence, fallback: true, key: item.key, question: item.question, raw, reason, threshold });
  };
  const enabled: { item: JudgmentItem; threshold: number; wire: string }[] = [];
  for (const item of ask.items) {
    const threshold = thresholdFor(item.question, ask.language, access?.thresholds);
    if (threshold === null) conservative(item, "not_enabled");
    else enabled.push({ item, threshold, wire: wireIdOf(item.question, item.key) });
  }
  let unavailable: UnavailableReason | null = null;
  let sent = false;
  let rejected = 0;
  let inputTokens: number | null = null;
  let durationMs = 0;
  if (enabled.length) {
    if (!access?.apiKey) unavailable = "no_key";
    else if (budget.used >= budget.limit) unavailable = "budget";
    if (!unavailable) {
      budget.used += 1;
      sent = true;
      try {
        const result = await requestDecisions({
          apiKey: access!.apiKey!,
          // AG12-5: the same exit as the main model — contact methods the user did not type are withheld.
          input: ask.input.map((text) => scrubModelInput(text, ask.requestId ?? null).text),
          questions: Object.fromEntries(enabled.map(({ item, wire }) => [wire, wireQuestion(item, ask.language)])),
          ...(access!.fetchImplementation ? { fetchImplementation: access!.fetchImplementation } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
          ...(access!.timeoutMs ? { timeoutMs: access!.timeoutMs } : {}),
        });
        inputTokens = result.inputTokens;
        durationMs = result.durationMs;
        const asked = new Set(enabled.map(({ wire }) => wire));
        rejected = Object.keys(result.answers).filter((wire) => !asked.has(wire)).length + result.malformed.filter((wire) => !asked.has(wire)).length;
        for (const { item, threshold, wire } of enabled) {
          const answer = result.answers[wire];
          const question = questionOf(item.question);
          const option = answer ? optionOf(answer, question.options) : null;
          if (!answer || option === null) {
            conservative(item, "missing", threshold);
            continue;
          }
          if (answer.type === "score") {
            const decided = scoreDecision(answer, question.options.length, threshold);
            const level = question.options[decided.level];
            if (level === question.conservative && option !== question.conservative) conservative(item, "below_threshold", threshold, option, decided.confidence);
            else verdicts.set(item.key, { answer: level, confidence: decided.confidence, fallback: false, key: item.key, question: item.question, raw: option, reason: null, threshold, ...(typeof answer.score === "number" ? { expected: answer.score } : {}) });
            continue;
          }
          if (option !== question.conservative && answer.confidence < threshold) {
            conservative(item, "below_threshold", threshold, option, answer.confidence);
            continue;
          }
          verdicts.set(item.key, { answer: option, confidence: answer.confidence, fallback: false, key: item.key, question: item.question, raw: option, reason: null, threshold });
        }
      } catch (error) {
        unavailable = error instanceof JudgmentRequestError ? (error.code === "aborted" ? "aborted" : error.code) : "network";
      }
    }
    if (unavailable) for (const { item, threshold } of enabled) conservative(item, "unavailable", threshold);
  }
  const list = [...verdicts.values()];
  const answered = list.filter((verdict) => verdict.reason !== "not_enabled");
  emitTrace({
    budget: { limit: budget.limit, used: budget.used },
    ...(ask.coverage ? { coverage: ask.coverage } : {}),
    candidates: sent ? enabled.length : 0,
    belowThresholdShare: answered.length ? answered.filter((verdict) => verdict.reason === "below_threshold").length / answered.length : 0,
    durationMs,
    fallbacks: Object.fromEntries([...new Set(list.map((verdict) => verdict.question))].map((id) => [id, list.filter((verdict) => verdict.question === id && verdict.fallback).length])),
    inputTokens,
    language: ask.language,
    purpose: ask.purpose,
    questionIds: [...new Set(ask.items.map((item) => item.question))],
    questionVersions: Object.fromEntries([...new Set(ask.items.map((item) => item.question))].map((id) => [id, questionOf(id).version])),
    rejected,
    sent,
    sentQuestionIds: sent ? [...new Set(enabled.map(({ item }) => item.question))] : [],
    thresholdVersion: thresholdVersion(access?.thresholds),
    type: "judgment.decided",
    unavailable,
    verdicts: list.map((verdict) => ({ answer: verdict.answer, confidence: verdict.confidence, fallback: verdict.fallback, key: verdict.key, question: verdict.question, raw: verdict.raw, reason: verdict.reason, threshold: verdict.threshold })),
    ...(ask.requestId ? { requestId: ask.requestId } : {}),
  });
  return { durationMs, inputTokens, rejected, sent, unavailable, verdicts };
}
