/**
 * The main model adapter of the new Agent (agent-design AG03, 设计稿 §3.3 and §3.9 "预算由代码守").
 *
 * - Always DeepSeek, named explicitly: the provider resolver would otherwise pick the first provider
 *   with a key (gemini → deepseek → openai). The model is ORBIT_DEEPSEEK_MODEL, else `deepseek-flash`.
 * - JSON output, 15 s per call.
 * - Every call first checks the round's budget: at most `limit` calls per round (default 4, one
 *   repair included); a lower deployment value wins. Over the limit no request is sent.
 * - The call runs inside the trace context with its node, so the eval preload records the raw
 *   model.request / model.response (with source) under that node and can inject faults there.
 */
import { runOrbitAgentModelText } from "../../orbit-ai/gemini-provider";
import { emitTrace, evalSetting, runWithTraceContext } from "../observability/trace";

export const DEFAULT_MAIN_MODEL = "deepseek-flash";
export const DEFAULT_MODEL_CALL_LIMIT = 4;
export const MODEL_NODE_TIMEOUT_MS = 15_000;

export interface ModelBudget {
  limit: number;
  used: number;
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/** The round's model call limit: ORBIT_AGENT_MODEL_CALL_LIMIT (default 4), lowered by an eval deployment setting. */
export function modelCallLimit(env: Record<string, string | undefined> = process.env): number {
  const deployed = positiveInteger(env.ORBIT_AGENT_MODEL_CALL_LIMIT) ?? DEFAULT_MODEL_CALL_LIMIT;
  const evalLimit = positiveInteger(evalSetting("model_calls_limit"));
  return evalLimit === null ? deployed : Math.min(deployed, evalLimit);
}

export function mainModelName(env: Record<string, string | undefined> = process.env): string {
  return env.ORBIT_DEEPSEEK_MODEL?.trim() || DEFAULT_MAIN_MODEL;
}

export type MainModelResult =
  | { ok: true; text: string }
  | { ok: false; reason: "budget" | "model_error"; message: string; retryable?: boolean };

export interface MainModelCall {
  node: "understand" | "answer";
  /** repair: the previous output was unusable; retry: the previous call failed (timeout, 429, 5xx). */
  purpose: "first" | "repair" | "retry";
  requestId: string;
  system: string;
  user: string;
  budget: ModelBudget;
  fetchImplementation?: typeof fetch;
}

export async function callMainModel(call: MainModelCall): Promise<MainModelResult> {
  if (call.budget.used >= call.budget.limit) {
    emitTrace({ limit: call.budget.limit, node: call.node, purpose: call.purpose, requestId: call.requestId, type: "budget", used: call.budget.used, what: "model_calls", exhausted: true });
    return { message: `the round's ${call.budget.limit} model call(s) are used up`, ok: false, reason: "budget" };
  }
  call.budget.used += 1;
  emitTrace({ limit: call.budget.limit, node: call.node, purpose: call.purpose, requestId: call.requestId, type: "budget", used: call.budget.used, what: "model_calls" });
  const result = await runWithTraceContext({ node: call.node, requestId: call.requestId }, () => runOrbitAgentModelText({
    config: {
      fetchImplementation: call.fetchImplementation,
      jsonOutput: true,
      model: mainModelName(),
      provider: "deepseek",
      requestTimeoutMs: MODEL_NODE_TIMEOUT_MS,
    },
    systemInstruction: call.system,
    userText: call.user,
  }));
  if (result.success === false) {
    emitTrace({ error: result.error.code, message: result.error.message, node: call.node, purpose: call.purpose, requestId: call.requestId, type: "model.failed" });
    return { message: result.error.message, ok: false, reason: "model_error", retryable: result.retryable };
  }
  return { ok: true, text: result.text };
}
