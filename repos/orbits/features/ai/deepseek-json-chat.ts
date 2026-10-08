/**
 * W0048a：DeepSeek JSON 对话的单次 HTTP（快照与 W0048b 计划共用；写法照 `features/plans/ai-matcher.ts`，不改它）。
 *
 * - `response_format: json_object`、`thinking` 禁用、超时 + 外部 signal；
 * - 只要拿到了 HTTP 响应（含非 2xx、输出无效）就带回 usage（没有用量时 token 记 0），调用方记 responded 并计次；
 *   只有连接失败与超时（没有 Response）usage 为 null，记 no_response。
 * 调用方负责在本次 HTTP 前后登记账本子账（`beginCall`／`endCall`）。
 */
export const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT = "https://api.deepseek.com/chat/completions";

export interface DeepseekJsonChatUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export class DeepseekJsonChatError extends Error {
  constructor(
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_REQUEST_FAILED" | "INVALID_OUTPUT",
    message: string,
    /** 拿到了供应商响应（含输出无效）时的用量；null = 无响应。 */
    readonly usage: DeepseekJsonChatUsage | null = null,
  ) {
    super(message);
    this.name = "DeepseekJsonChatError";
  }
}

export interface DeepseekJsonChatInput {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImplementation?: typeof fetch;
  nowMs?: () => number;
}

function usageOf(payload: unknown, latencyMs: number): DeepseekJsonChatUsage | null {
  const usage = typeof payload === "object" && payload !== null ? (payload as { usage?: Record<string, unknown> }).usage : undefined;
  if (!usage) return null;
  return {
    inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    latencyMs,
    outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

function contentOf(payload: unknown): string | null {
  const choices = typeof payload === "object" && payload !== null ? (payload as { choices?: unknown }).choices : undefined;
  if (!Array.isArray(choices)) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content : null;
}

/** 返回 JSON 文本与用量；HTTP 已返回但不可用时抛 INVALID_OUTPUT（带 usage）。 */
export async function deepseekJsonChat(input: DeepseekJsonChatInput): Promise<{ content: string; usage: DeepseekJsonChatUsage }> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const nowMs = input.nowMs ?? Date.now;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const onAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  if (input.signal?.aborted) controller.abort();
  const startedAt = nowMs();
  try {
    let response: Response;
    try {
      response = await fetchImplementation(DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT, {
        body: JSON.stringify({
          messages: [
            { content: input.system, role: "system" },
            { content: input.user, role: "user" },
          ],
          model: input.model,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
        }),
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new DeepseekJsonChatError("PROVIDER_TIMEOUT", "The model request timed out.");
      throw new DeepseekJsonChatError("PROVIDER_REQUEST_FAILED", "The model request failed.");
    }
    // 已经拿到供应商的 HTTP 响应：无论状态码、能否解析，都算「有响应」（计次）；没有 usage 时 token 记 0。
    const responded = (payload: unknown): DeepseekJsonChatUsage => usageOf(payload, Math.max(0, nowMs() - startedAt)) ?? { inputTokens: 0, latencyMs: Math.max(0, nowMs() - startedAt), outputTokens: 0 };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw new DeepseekJsonChatError("PROVIDER_REQUEST_FAILED", `The model request failed with status ${response.status}.`, responded(null));
      throw new DeepseekJsonChatError("INVALID_OUTPUT", "The model returned an unreadable response.", responded(null));
    }
    const usage = responded(payload);
    if (!response.ok) {
      throw new DeepseekJsonChatError("PROVIDER_REQUEST_FAILED", `The model request failed with status ${response.status}.`, usage);
    }
    const content = contentOf(payload);
    if (!content?.trim()) throw new DeepseekJsonChatError("INVALID_OUTPUT", "The model returned no content.", usage);
    return { content, usage };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}
