import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "./load-local-env";

export const DEEPSEEK_STRICT_BETA_ENDPOINT = "https://api.deepseek.com/beta/chat/completions" as const;
export const DEEPSEEK_STRICT_TOOL_NAME = "submit_event_recommendations" as const;
const DEFAULT_MODEL = "deepseek-v4-flash";

export interface StrictSmokeOptions {
  concurrency: number;
  execute: boolean;
  model: string;
  requestTimeoutMs: number;
}

export type StrictSmokeErrorCategory =
  | "http_4xx_schema"
  | "http_4xx_other"
  | "http_5xx"
  | "http_auth"
  | "http_rate_limit"
  | "transport"
  | "invalid_response"
  | "finish_not_tool_calls"
  | "content_not_empty"
  | "missing_tool_call"
  | "multiple_tool_calls"
  | "wrong_tool_name"
  | "bad_arguments";

export const STRICT_RECOMMENDATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    recommendations: {
      items: {
        additionalProperties: false,
        properties: {
          recommendations: {
            items: {
              additionalProperties: false,
              properties: {
                score: { type: "number" },
                targetCandidateKey: { type: "string" },
              },
              required: ["targetCandidateKey", "score"],
              type: "object",
            },
            type: "array",
          },
          sourceKey: { type: "string" },
        },
        required: ["sourceKey", "recommendations"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["recommendations"],
  type: "object",
} as const;

export function hashStrictSmokeValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function parseStrictSmokeOptions(args: readonly string[]): StrictSmokeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) continue;
    const next = args[index + 1];
    const value = next?.startsWith("--") || next === undefined ? "true" : next;
    values.set(key.slice(2), value);
    if (value === next) index += 1;
  }
  const concurrency = Number(values.get("concurrency") ?? "1");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be a positive integer.");
  const requestTimeoutMs = Number(values.get("request-timeout-ms") ?? "90000");
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error("--request-timeout-ms must be a positive integer.");
  return {
    concurrency,
    execute: values.get("execute") === "true",
    model: values.get("model")?.trim() || process.env.DEEPSEEK_STRICT_MODEL || process.env.ORBIT_DEEPSEEK_MODEL || DEFAULT_MODEL,
    requestTimeoutMs,
  };
}

export function createStrictSmokeRequest(model: string) {
  return {
    max_tokens: 512,
    messages: [
      { content: "Call the required function exactly once for source S1 and candidate C1. Return one recommendation with score 90.", role: "system" },
      { content: "Generate the strict recommendation tool call.", role: "user" },
    ],
    model,
    stream: false,
    temperature: 0.2,
    thinking: { type: "disabled" },
    tool_choice: { function: { name: DEEPSEEK_STRICT_TOOL_NAME }, type: "function" },
    tools: [{
      function: {
        description: "Submit exact event recommendations using only supplied opaque keys.",
        name: DEEPSEEK_STRICT_TOOL_NAME,
        parameters: STRICT_RECOMMENDATION_SCHEMA,
        strict: true,
      },
      type: "function",
    }],
  };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validArguments(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactKeys(value as Record<string, unknown>, ["recommendations"])) return false;
  const rows = (value as { recommendations: unknown }).recommendations;
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row) || !exactKeys(row as Record<string, unknown>, ["sourceKey", "recommendations"])) return false;
  if ((row as { sourceKey: unknown }).sourceKey !== "S1") return false;
  const recommendations = (row as { recommendations: unknown }).recommendations;
  if (!Array.isArray(recommendations) || recommendations.length !== 1) return false;
  const recommendation = recommendations[0];
  return Boolean(
    recommendation && typeof recommendation === "object" && !Array.isArray(recommendation) &&
    exactKeys(recommendation as Record<string, unknown>, ["targetCandidateKey", "score"]) &&
    (recommendation as { targetCandidateKey: unknown }).targetCandidateKey === "C1" &&
    typeof (recommendation as { score: unknown }).score === "number" &&
    Number.isFinite((recommendation as { score: number }).score) &&
    (recommendation as { score: number }).score >= 0 && (recommendation as { score: number }).score <= 100,
  );
}

export function validateStrictToolResponse(value: unknown): { errorCategory: StrictSmokeErrorCategory | null; finishReason: string | null; success: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errorCategory: "invalid_response", finishReason: null, success: false };
  const choice = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choice) || choice.length !== 1 || !choice[0] || typeof choice[0] !== "object") return { errorCategory: "invalid_response", finishReason: null, success: false };
  const finishReason = typeof (choice[0] as { finish_reason?: unknown }).finish_reason === "string"
    ? (choice[0] as { finish_reason: string }).finish_reason : null;
  if (finishReason !== "tool_calls") return { errorCategory: "finish_not_tool_calls", finishReason, success: false };
  const message = (choice[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return { errorCategory: "invalid_response", finishReason, success: false };
  const content = (message as { content?: unknown }).content;
  if (content !== null && content !== "") return { errorCategory: "content_not_empty", finishReason, success: false };
  const calls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return { errorCategory: "missing_tool_call", finishReason, success: false };
  if (calls.length !== 1) return { errorCategory: "multiple_tool_calls", finishReason, success: false };
  if (!calls[0] || typeof calls[0] !== "object" || (calls[0] as { type?: unknown }).type !== "function") {
    return { errorCategory: "missing_tool_call", finishReason, success: false };
  }
  const functionCall = calls[0] && typeof calls[0] === "object" ? (calls[0] as { function?: unknown }).function : null;
  if (!functionCall || typeof functionCall !== "object") return { errorCategory: "missing_tool_call", finishReason, success: false };
  if ((functionCall as { name?: unknown }).name !== DEEPSEEK_STRICT_TOOL_NAME) return { errorCategory: "wrong_tool_name", finishReason, success: false };
  const argumentsText = (functionCall as { arguments?: unknown }).arguments;
  if (typeof argumentsText !== "string") return { errorCategory: "bad_arguments", finishReason, success: false };
  try {
    return validArguments(JSON.parse(argumentsText))
      ? { errorCategory: null, finishReason, success: true }
      : { errorCategory: "bad_arguments", finishReason, success: false };
  } catch {
    return { errorCategory: "bad_arguments", finishReason, success: false };
  }
}

function httpErrorCategory(status: number): StrictSmokeErrorCategory {
  if (status === 400 || status === 422) return "http_4xx_schema";
  if (status === 401 || status === 403) return "http_auth";
  if (status === 429) return "http_rate_limit";
  if (status >= 400 && status < 500) return "http_4xx_other";
  return "http_5xx";
}

export async function runStrictSmokeCall(input: { apiKey: string; fetchImpl: typeof fetch; model: string; requestTimeoutMs: number }) {
  const request = createStrictSmokeRequest(input.model);
  const started = performance.now();
  try {
    const response = await input.fetchImpl(DEEPSEEK_STRICT_BETA_ENDPOINT, {
      body: JSON.stringify(request),
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(input.requestTimeoutMs),
    });
    const body = await response.text();
    const timingMs = performance.now() - started;
    if (!response.ok) return { bytes: Buffer.byteLength(body), errorCategory: httpErrorCategory(response.status), finishReason: null, status: response.status, success: false, timingMs, tokens: null };
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return { bytes: Buffer.byteLength(body), errorCategory: "invalid_response" as const, finishReason: null, status: response.status, success: false, timingMs, tokens: null }; }
    const result = validateStrictToolResponse(parsed);
    const usage = parsed && typeof parsed === "object" ? (parsed as { usage?: { completion_tokens?: unknown; prompt_tokens?: unknown } }).usage : undefined;
    const tokens = usage && typeof usage.prompt_tokens === "number" && typeof usage.completion_tokens === "number"
      ? { completion: usage.completion_tokens, prompt: usage.prompt_tokens } : null;
    return { bytes: Buffer.byteLength(body), errorCategory: result.errorCategory, finishReason: result.finishReason, status: response.status, success: result.success, timingMs, tokens };
  } catch {
    return { bytes: null, errorCategory: "transport" as const, finishReason: null, status: null, success: false, timingMs: performance.now() - started, tokens: null };
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseStrictSmokeOptions(process.argv.slice(2));
  const request = createStrictSmokeRequest(options.model);
  const safe = { endpointHash: hashStrictSmokeValue(DEEPSEEK_STRICT_BETA_ENDPOINT), requestHash: hashStrictSmokeValue(request), schemaHash: hashStrictSmokeValue(STRICT_RECOMMENDATION_SCHEMA) };
  if (!options.execute) {
    process.stdout.write(`${JSON.stringify({ ...safe, execute: false })}\n`);
    return;
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for --execute.");
  const results: Awaited<ReturnType<typeof runStrictSmokeCall>>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, 3) }, async () => {
    while (next < 3) {
      const index = next;
      next += 1;
      results[index] = await runStrictSmokeCall({ apiKey, fetchImpl: fetch, model: options.model, requestTimeoutMs: options.requestTimeoutMs });
    }
  }));
  for (const [index, result] of results.entries()) process.stdout.write(`${JSON.stringify({ ...safe, ...result, callOrdinal: index + 1, execute: true })}\n`);
  if (results.some((result) => !result.success)) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(() => { process.stderr.write("Strict tool smoke failed.\n"); process.exitCode = 1; });
}
