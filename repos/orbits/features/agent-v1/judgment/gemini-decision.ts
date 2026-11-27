/**
 * The Gemini Decisions call (设计稿 §3.8; agent-design AG08): one HTTP request, written like
 * features/plans/search/tavily.ts — an AbortController timeout plus the caller's signal, the fetch injected,
 * an error that says whether a response came back, malformed answers dropped.
 *
 * - `POST https://generativelanguage.googleapis.com/v1beta/decisions`, header `x-goog-api-key`, body
 *   `{ model: "gemini-decision-1", input: [{ type: "text", text }], questions: { <id>: { type, instructions, criteria? } } }`.
 * - Shape checked on the real endpoint on 2026-11-17 (the PLANNER did not have these details; REPORT 出入):
 *   question ids must match [A-Za-z0-9_-]{1,64} (so "match.level" is sent as "match_level__c1");
 *   `choice` takes `criteria` as an object option → description; `score` takes `criteria` as a list of 2–255
 *   level labels and answers `score` (expected level), `probabilities` by level index and a `legend`; `noul`
 *   takes no criteria and answers `noul` = the probability of "yes"; every answer has a `confidence` in [0, 1].
 *   Usage is `usage.total_input_tokens` (input only; output is 0).
 * - 3 s per request (设计稿 §3.3); no retry here. The caller turns every failure into "unavailable".
 */
export const GEMINI_DECISIONS_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
export const JUDGMENT_MODEL = "gemini-decision-1";
import { meteredModelCall } from "../models/usage-meter";
import { emitTrace } from "../observability/trace";

export const JUDGMENT_TIMEOUT_MS = 3_000;

const QUESTION_ID = /^[A-Za-z0-9_-]{1,64}$/u;

export type DecisionQuestionType = "noul" | "choice" | "score";

export interface DecisionQuestion {
  type: DecisionQuestionType;
  instructions: string;
  /** choice: option → description; score: the level labels, lowest first. */
  criteria?: Record<string, string> | readonly string[];
}

export interface DecisionAnswer {
  type: DecisionQuestionType;
  confidence: number;
  /** noul: the probability of "yes". */
  noul?: number;
  /** choice: the option chosen. */
  choice?: string;
  /** score: the expected level (0 = the first label). */
  score?: number;
  /** choice: by option; score: by level index ("0", "1", …). */
  probabilities?: Record<string, number>;
}

export interface DecisionResult {
  answers: Record<string, DecisionAnswer>;
  /** Answers dropped as malformed (not counted as answered). */
  malformed: string[];
  inputTokens: number | null;
  durationMs: number;
  usage: unknown;
}

export class JudgmentRequestError extends Error {
  constructor(
    readonly code: "timeout" | "http_error" | "network" | "malformed" | "aborted",
    message: string,
    /** A response came back (a non-2xx, or a body that could not be read); false for a timeout or a failed connection. */
    readonly responded: boolean,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "JudgmentRequestError";
  }
}

export function isQuestionId(id: string): boolean {
  return QUESTION_ID.test(id);
}

/** "match.level" + "c12" → "match_level__c12" (what the endpoint accepts). */
export function wireIdOf(questionId: string, key: string): string {
  const id = `${questionId.replace(/[^A-Za-z0-9]/gu, "_")}__${key.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  if (!QUESTION_ID.test(id)) throw new Error(`judgment question id ${id} is not accepted by the endpoint`);
  return id;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unit = (value: unknown): value is number => isNumber(value) && value >= 0 && value <= 1;

function answerOf(raw: unknown): DecisionAnswer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!unit(item.confidence)) return null;
  const probabilities = typeof item.probabilities === "object" && item.probabilities !== null
    ? Object.fromEntries(Object.entries(item.probabilities as Record<string, unknown>).filter(([, value]) => unit(value))) as Record<string, number>
    : undefined;
  if (item.type === "noul") return unit(item.noul) ? { confidence: item.confidence, noul: item.noul, type: "noul" } : null;
  if (item.type === "choice") return typeof item.choice === "string" && item.choice ? { choice: item.choice, confidence: item.confidence, type: "choice", ...(probabilities ? { probabilities } : {}) } : null;
  if (item.type === "score") return isNumber(item.score) && probabilities ? { confidence: item.confidence, probabilities, score: item.score, type: "score" } : null;
  return null;
}

export interface DecisionRequest {
  apiKey: string;
  questions: Record<string, DecisionQuestion>;
  input: readonly string[];
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  /** 3 s by default; tests shorten it. */
  timeoutMs?: number;
  now?: () => number;
}

/**
 * AG13 run-06 (judged): about 40% of judgment calls hung until the 3 s abort while the rest answered in ~0.5 s — hangs on
 * the service's side, not slow calls. A call that timed out, failed to connect or got a 5xx is sent once more at once with
 * a fresh 3 s limit; a 4xx, an unreadable body or the caller's own stop is not retried. Both attempts are traced.
 */
export function retryableJudgmentFailure(error: unknown): boolean {
  if (!(error instanceof JudgmentRequestError)) return false;
  if (error.code === "timeout" || error.code === "network") return true;
  return error.code === "http_error" && error.status !== null && error.status >= 500;
}

export async function requestDecisions(request: DecisionRequest): Promise<DecisionResult> {
  try {
    const result = await requestDecisionsOnce(request);
    return result;
  } catch (error) {
    if (!retryableJudgmentFailure(error) || request.signal?.aborted) throw error;
    const first = error as JudgmentRequestError;
    emitTrace({ attempt: 1, attempts: 2, code: first.code, status: first.status, type: "judgment.attempt_failed" });
    try {
      const result = await requestDecisionsOnce(request);
      emitTrace({ attempt: 2, attempts: 2, outcome: "answered", type: "judgment.retry" });
      return result;
    } catch (second) {
      emitTrace({ attempt: 2, attempts: 2, code: second instanceof JudgmentRequestError ? second.code : "network", outcome: "failed", type: "judgment.retry" });
      throw second;
    }
  }
}

/**
 * One attempt, no retry (the record finder's picker: 2 s, then the rules decide; finder/live.ts).
 * One HTTP on the round's usage meter (models/usage-meter.ts): input tokens only (the endpoint reports no output);
 * a failure or a response without usage is recorded as no response.
 */
export async function requestDecisionsOnce(request: DecisionRequest): Promise<DecisionResult> {
  return meteredModelCall({ model: JUDGMENT_MODEL, provider: "gemini" }, () => sendDecisionsOnce(request), (result) => (result.inputTokens === null ? null : { inputTokens: result.inputTokens, outputTokens: 0 }));
}

async function sendDecisionsOnce(request: DecisionRequest): Promise<DecisionResult> {
  const ids = Object.keys(request.questions);
  if (!ids.length) throw new Error("a judgment request needs at least one question");
  for (const id of ids) if (!QUESTION_ID.test(id)) throw new Error(`judgment question id ${id} is not accepted by the endpoint`);
  const input = request.input.map((text) => text.trim()).filter(Boolean);
  if (!input.length) throw new Error("a judgment request needs input text");
  const fetchImplementation = request.fetchImplementation ?? fetch;
  const clock = request.now ?? Date.now;
  const started = clock();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs ?? JUDGMENT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) controller.abort();
  try {
    let response: Response;
    try {
      response = await fetchImplementation(GEMINI_DECISIONS_URL, {
        body: JSON.stringify({ input: input.map((text) => ({ text, type: "text" })), model: JUDGMENT_MODEL, questions: request.questions }),
        headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      if (timedOut) throw new JudgmentRequestError("timeout", `The judgment request took longer than ${request.timeoutMs ?? JUDGMENT_TIMEOUT_MS} ms.`, false);
      if (controller.signal.aborted) throw new JudgmentRequestError("aborted", "The judgment request was stopped.", false);
      throw new JudgmentRequestError("network", "The judgment request failed.", false);
    }
    if (!response.ok) throw new JudgmentRequestError("http_error", `The judgment request failed with status ${response.status}.`, true, response.status);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (timedOut) throw new JudgmentRequestError("timeout", "The judgment response did not arrive in time.", true, response.status);
      throw new JudgmentRequestError("malformed", "The judgment response could not be read.", true, response.status);
    }
    const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    if (typeof body.answers !== "object" || body.answers === null) throw new JudgmentRequestError("malformed", "The judgment response has no answers.", true, response.status);
    const answers: Record<string, DecisionAnswer> = {};
    const malformed: string[] = [];
    for (const [id, raw] of Object.entries(body.answers as Record<string, unknown>)) {
      const answer = answerOf(raw);
      if (answer) answers[id] = answer;
      else malformed.push(id);
    }
    const usage = body.usage ?? null;
    const tokens = typeof usage === "object" && usage !== null ? (usage as Record<string, unknown>).total_input_tokens : undefined;
    return { answers, durationMs: clock() - started, inputTokens: isNumber(tokens) ? tokens : null, malformed, usage };
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
