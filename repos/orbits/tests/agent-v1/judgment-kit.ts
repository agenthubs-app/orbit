/**
 * agent-design AG08 test kit: a stub of the Gemini Decisions endpoint (never the real host) and a threshold
 * configuration with every question this sprint enables, in the three languages.
 */
import type { JudgmentAccess } from "../../features/agent-v1/judgment/ask";
import type { ThresholdConfig } from "../../features/agent-v1/judgment/thresholds";

export const TEST_THRESHOLDS: ThresholdConfig = {
  calibratedOn: "test",
  cells: {
    "duplicate.same": { en: 0.7, ja: 0.7, zh: 0.7 },
    "intent.explicitWrite": { en: 0.8, ja: 0.8, zh: 0.8 },
    "match.level": { en: 0.6, ja: 0.6, zh: 0.6 },
  },
  model: "gemini-decision-1",
  version: "judgment-thresholds@test",
};

export interface JudgeCall {
  url: string;
  headers: Record<string, string>;
  body: { model: string; input: { type: string; text: string }[]; questions: Record<string, { type: string; instructions: string; criteria?: unknown }> };
}

export type Answerer = (id: string, question: JudgeCall["body"]["questions"][string], call: JudgeCall) => Record<string, unknown> | undefined;

/** A stub endpoint: `answer` gives each question's answer (undefined: left out). `extra` adds answers to ids not asked. */
export function judgeStub(answer: Answerer, options: { status?: number; hang?: boolean; extra?: Record<string, unknown> } = {}) {
  const calls: JudgeCall[] = [];
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (!href.startsWith("https://generativelanguage.googleapis.com/")) throw new Error(`unexpected host ${href}`);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]));
    const call: JudgeCall = { body: JSON.parse(String(init?.body)), headers, url: href };
    calls.push(call);
    if (options.hang) {
      await new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    if (options.status && options.status !== 200) return new Response(JSON.stringify({ error: { message: "stub failure" } }), { status: options.status });
    const answers: Record<string, unknown> = {};
    for (const [id, question] of Object.entries(call.body.questions)) {
      const value = answer(id, question, call);
      if (value) answers[id] = value;
    }
    Object.assign(answers, options.extra ?? {});
    return new Response(JSON.stringify({ answers, usage: { total_input_tokens: 100 * Object.keys(call.body.questions).length } }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImplementation };
}

export const noul = (yes: number) => ({ confidence: Math.max(yes, 1 - yes), noul: yes, type: "noul" });
export const choice = (option: string, confidence: number) => ({ choice: option, confidence, probabilities: { [option]: confidence }, type: "choice" });
/** A score answer: probabilities by level index; `level` gets `confidence`, the rest share what is left. */
export const score = (level: number, confidence: number, levels = 3) => {
  const rest = (1 - confidence) / (levels - 1);
  const probabilities = Object.fromEntries(Array.from({ length: levels }, (_value, index) => [String(index), index === level ? confidence : rest]));
  return { confidence, probabilities, score: level, type: "score" };
};

/** A score answer with these probabilities for levels 0, 1, 2 (confidence: the most likely one). */
export const graded = (p0: number, p1: number, p2: number) => ({ confidence: Math.max(p0, p1, p2), probabilities: { "0": p0, "1": p1, "2": p2 }, score: p1 + 2 * p2, type: "score" });

export function access(fetchImplementation: typeof fetch, extra: Partial<JudgmentAccess> = {}): JudgmentAccess {
  return { apiKey: "test-judgment-key", fetchImplementation, thresholds: TEST_THRESHOLDS, ...extra };
}
