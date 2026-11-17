/**
 * The second gate (设计稿 §3.4 "第二道闸", §3.8; agent-design AG09-3). Only after a query passed every code rule, the
 * judgment model sees the user's own words of this turn and the candidate query, and is asked `outbound.extra`:
 * does the query carry anything beyond what is needed to find the public information asked for? Only a sure "no"
 * (at or above the calibrated threshold) lets the query go; "yes", not sure, below threshold, timeout, not enabled
 * (no calibrated cell) or no key all keep it from being sent.
 */
import { askJudgment, type JudgmentAccess, type JudgmentBudget, type JudgmentVerdict } from "../judgment/ask";
import type { JudgmentLanguage } from "../judgment/questions";

/** The text outbound.extra is judged on (calibration builds the same). */
export function outboundJudgmentInput(language: JudgmentLanguage, message: string): string[] {
  const label = language === "zh" ? "用户这一轮的原话" : language === "ja" ? "ユーザーの今回の発言" : "The user's message this turn";
  return [`${label}: ${message}`];
}

export const outboundSubject = (query: string) => `“${query}”`;

export interface SecondGateResult {
  send: boolean;
  /** Why it was not sent: the model said yes, or the conservative fallback (below_threshold, not_enabled, unavailable…). */
  reason: string | null;
  verdict: JudgmentVerdict | null;
}

export async function secondGate(access: JudgmentAccess | null | undefined, budget: JudgmentBudget, input: { language: JudgmentLanguage; message: string; query: string; requestId?: string }, options: { signal?: AbortSignal } = {}): Promise<SecondGateResult> {
  const outcome = await askJudgment(access, budget, {
    input: outboundJudgmentInput(input.language, input.message),
    items: [{ key: "q", question: "outbound.extra", subject: outboundSubject(input.query) }],
    language: input.language,
    purpose: "outbound",
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }, options);
  const verdict = outcome.verdicts.get("q") ?? null;
  const send = verdict?.answer === "no" && !verdict.fallback;
  return { reason: send ? null : outcome.unavailable ?? (verdict?.fallback ? verdict.reason ?? "fallback" : verdict ? `answered_${verdict.answer}` : "missing"), send, verdict };
}

/**
 * AG09 stability runs: the second gate for every query of one pass in ONE judgment request (one item per query), so a
 * request with several searches makes one call instead of one per query. Each query is judged on its own item.
 */
export async function secondGateMany(access: JudgmentAccess | null | undefined, budget: JudgmentBudget, input: { language: JudgmentLanguage; message: string; queries: readonly { key: string; query: string }[]; requestId?: string }, options: { signal?: AbortSignal } = {}): Promise<Map<string, SecondGateResult>> {
  const out = new Map<string, SecondGateResult>();
  if (!input.queries.length) return out;
  const outcome = await askJudgment(access, budget, {
    input: outboundJudgmentInput(input.language, input.message),
    items: input.queries.map((item) => ({ key: item.key, question: "outbound.extra" as const, subject: outboundSubject(item.query) })),
    language: input.language,
    purpose: "outbound",
    ...(input.requestId ? { requestId: input.requestId } : {}),
  }, options);
  for (const item of input.queries) {
    const verdict = outcome.verdicts.get(item.key) ?? null;
    const send = verdict?.answer === "no" && !verdict.fallback;
    out.set(item.key, { reason: send ? null : outcome.unavailable ?? (verdict?.fallback ? verdict.reason ?? "fallback" : verdict ? `answered_${verdict.answer}` : "missing"), send, verdict });
  }
  return out;
}
