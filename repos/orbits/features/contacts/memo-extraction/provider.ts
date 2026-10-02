/**
 * W0046：memo 提取 provider（专长／需求／话题 + 互动类型）。
 *
 * - `MemoExtractionProvider` 接口：作业只依赖它；
 * - DeepSeek 适配器：`json_object`、`thinking: disabled`、30 s 超时（照抄 features/plans/ai-matcher.ts）；
 *   只发 memo 正文与对方公司／职位，不发邮箱、电话等联系方式；
 * - 本 Sprint 真实调用 0 次：作业经 AiQuotaGate（「始终拒绝」）才会走到 provider。
 */
import { DEFAULT_BUSINESS_CARD_TEXT_MODEL } from "../../acquisition/deepseek-business-card-ocr-provider";
import type { MemoEventType } from "../../../shared/contract/relationship-timeline";

export interface MemoExtractionInput {
  memo: string;
  contact: { organization?: string | null; role?: string | null };
}

export interface MemoExtractionOutput {
  offering: string[];
  seeking: string[];
  topics: string[];
  eventTypes: MemoEventType[];
}

export interface MemoExtractionUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface MemoExtractionProvider {
  readonly model: string;
  readonly providerName: string;
  extract(input: MemoExtractionInput, options?: { signal?: AbortSignal }): Promise<{ output: MemoExtractionOutput; usage: MemoExtractionUsage; model: string }>;
}

export class MemoExtractionError extends Error {
  constructor(
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_REQUEST_FAILED" | "INVALID_OUTPUT",
    message: string,
    /** 请求已返回、只是结果不可用时仍记用量（计费已发生）。 */
    readonly usage: MemoExtractionUsage | null = null,
  ) {
    super(message);
    this.name = "MemoExtractionError";
  }
}

const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const MEMO_EXTRACTION_TIMEOUT_MS = 30_000;
export const MEMO_EXTRACTION_LIMITS = { memoChars: 2_000, itemsPerField: 5, itemChars: 40 } as const;
const EVENT_TYPES: readonly MemoEventType[] = ["met", "collaborated", "introduced", "followed_up", "other"];

export const MEMO_EXTRACTION_SYSTEM_PROMPT = [
  "You read a private memo the user wrote about one business contact.",
  "Extract only what the memo states about the contact: what they can offer (offering), what they are looking for (seeking), and the topics discussed (topics).",
  "Also classify the interaction into eventTypes from: met, collaborated, introduced, followed_up, other.",
  "Use short phrases in the memo's language, at most 5 per list. Never invent facts; empty lists are fine.",
  'Respond with a single JSON object: {"offering":[],"seeking":[],"topics":[],"eventTypes":[]}.',
].join(" ");

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 送给模型的输入（纯函数）：只有 memo 正文与对方公司／职位。 */
export function buildMemoExtractionInput(input: MemoExtractionInput) {
  const company = text(input.contact.organization);
  const title = text(input.contact.role);
  return {
    memo: Array.from(input.memo.trim()).slice(0, MEMO_EXTRACTION_LIMITS.memoChars).join(""),
    ...(company ? { company } : {}),
    ...(title ? { title } : {}),
  };
}

function phrases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const phrase = Array.from(entry.trim()).slice(0, MEMO_EXTRACTION_LIMITS.itemChars).join("");
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= MEMO_EXTRACTION_LIMITS.itemsPerField) break;
  }
  return out;
}

export function parseMemoExtractionContent(content: string): MemoExtractionOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MemoExtractionError("INVALID_OUTPUT", "The memo extractor returned invalid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MemoExtractionError("INVALID_OUTPUT", "The memo extractor output is not an object.");
  }
  const record = parsed as Record<string, unknown>;
  return {
    offering: phrases(record.offering),
    seeking: phrases(record.seeking),
    topics: phrases(record.topics),
    eventTypes: Array.isArray(record.eventTypes)
      ? [...new Set(record.eventTypes.filter((entry): entry is MemoEventType => EVENT_TYPES.includes(entry as MemoEventType)))]
      : [],
  };
}

function usageOf(payload: unknown, latencyMs: number): MemoExtractionUsage {
  const usage = typeof payload === "object" && payload !== null ? (payload as { usage?: Record<string, unknown> }).usage : undefined;
  return {
    inputTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    latencyMs,
    outputTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

function contentOf(payload: unknown): string | null {
  const choices = typeof payload === "object" && payload !== null ? (payload as { choices?: unknown }).choices : undefined;
  if (!Array.isArray(choices)) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content : null;
}

export interface DeepseekMemoExtractionOptions {
  apiKey: string;
  model?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  nowMs?: () => number;
}

export function createDeepseekMemoExtractionProvider({
  apiKey,
  model = DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  fetchImplementation = fetch,
  timeoutMs = MEMO_EXTRACTION_TIMEOUT_MS,
  nowMs = Date.now,
}: DeepseekMemoExtractionOptions): MemoExtractionProvider {
  return {
    model,
    providerName: "deepseek-chat-completions",
    async extract(input, options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) controller.abort();
      const startedAt = nowMs();
      try {
        let response: Response;
        try {
          response = await fetchImplementation(DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT, {
            body: JSON.stringify({
              messages: [
                { content: MEMO_EXTRACTION_SYSTEM_PROMPT, role: "system" },
                { content: JSON.stringify(buildMemoExtractionInput(input)), role: "user" },
              ],
              model,
              response_format: { type: "json_object" },
              thinking: { type: "disabled" },
            }),
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) throw new MemoExtractionError("PROVIDER_TIMEOUT", "The memo extraction request timed out.");
          throw new MemoExtractionError("PROVIDER_REQUEST_FAILED", "The memo extraction request failed.");
        }
        if (!response.ok) throw new MemoExtractionError("PROVIDER_REQUEST_FAILED", `The memo extraction request failed with status ${response.status}.`);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (controller.signal.aborted) throw new MemoExtractionError("PROVIDER_TIMEOUT", "The memo extraction request timed out.");
          throw new MemoExtractionError("INVALID_OUTPUT", "The memo extractor returned an unreadable response.");
        }
        const usage = usageOf(payload, Math.max(0, nowMs() - startedAt));
        const content = contentOf(payload);
        if (!content?.trim()) throw new MemoExtractionError("INVALID_OUTPUT", "The memo extractor returned no content.", usage);
        try {
          return { model, output: parseMemoExtractionContent(content), usage };
        } catch (error) {
          throw error instanceof MemoExtractionError ? new MemoExtractionError(error.code, error.message, usage) : error;
        }
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** provider factory：复用名片识别的 DeepSeek 文本模型配置；没有密钥返回 null。 */
export function createConfiguredMemoExtractionProvider(
  options: { env?: Record<string, string | undefined>; fetchImplementation?: typeof fetch } = {},
): MemoExtractionProvider | null {
  const env = options.env ?? process.env;
  const apiKey = text(env.DEEPSEEK_API_KEY);
  if (!apiKey) return null;
  return createDeepseekMemoExtractionProvider({
    apiKey,
    fetchImplementation: options.fetchImplementation,
    model: text(env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL) ?? DEFAULT_BUSINESS_CARD_TEXT_MODEL,
  });
}

/** 测试与示例用：固定输出、记录调用次数，不发网络请求。 */
export function createMockMemoExtractionProvider(output: MemoExtractionOutput = { offering: [], seeking: [], topics: [], eventTypes: [] }): MemoExtractionProvider & { calls: MemoExtractionInput[] } {
  const calls: MemoExtractionInput[] = [];
  return {
    calls,
    model: "mock-memo-extraction",
    providerName: "mock",
    async extract(input) {
      calls.push(input);
      return { model: "mock-memo-extraction", output: structuredClone(output), usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0 } };
    },
  };
}
