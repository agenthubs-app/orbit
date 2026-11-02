/**
 * R34 SC-05：Tavily 搜索的单次 HTTP（写法照 `features/ai/deepseek-json-chat.ts`）。
 *
 * - `POST https://api.tavily.com/search`，body 固定 `{ query, search_depth: "basic", max_results: 3, include_answer: false }`，
 *   `Authorization: Bearer <TAVILY_API_KEY>`；10 s `AbortController` 超时 + 外部 signal；
 * - 响应只取 `results[].{ title, url, content, score }`，缺字段 / 类型不对的条目丢弃；
 * - 任何失败抛 `TavilySearchError`（带 code），**不重试**（DESIGN §3.2）；调用方按查询独立计失败。
 * 记账（`beginCall` / `endCall`）由 `service.ts` 在这次 HTTP 前后做。测试里 `fetch` 全部注入，真实调用 0 次。
 */
import type { PlanSearchProvider, PlanSearchRawResult } from "./types";

export const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
export const TAVILY_SEARCH_TIMEOUT_MS = 10_000;
export const TAVILY_SEARCH_DEPTH = "basic";
export const TAVILY_MAX_RESULTS = 3;

export class TavilySearchError extends Error {
  constructor(
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_REQUEST_FAILED" | "INVALID_OUTPUT",
    message: string,
    /** 拿到了 HTTP 响应（含非 2xx、不可读）为 true；连接失败与超时为 false（账本记 no_response）。 */
    readonly responded: boolean,
  ) {
    super(message);
    this.name = "TavilySearchError";
  }
}

export interface TavilySearchProviderOptions {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  /** 默认 10 s；只给测试缩短。 */
  timeoutMs?: number;
}

function rawResultOf(item: unknown): PlanSearchRawResult | null {
  if (typeof item !== "object" || item === null) return null;
  const { content, score, title, url } = item as Record<string, unknown>;
  if (typeof title !== "string" || typeof url !== "string" || typeof content !== "string" || typeof score !== "number" || !Number.isFinite(score)) return null;
  return { content, score, title, url };
}

export function createTavilySearchProvider(options: TavilySearchProviderOptions): PlanSearchProvider {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? TAVILY_SEARCH_TIMEOUT_MS;
  return {
    name: "tavily",
    async search(query, { signal } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) controller.abort();
      try {
        let response: Response;
        try {
          response = await fetchImplementation(TAVILY_SEARCH_ENDPOINT, {
            body: JSON.stringify({ include_answer: false, max_results: TAVILY_MAX_RESULTS, query, search_depth: TAVILY_SEARCH_DEPTH }),
            headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal,
          });
        } catch {
          if (controller.signal.aborted) throw new TavilySearchError("PROVIDER_TIMEOUT", "The search request timed out.", false);
          throw new TavilySearchError("PROVIDER_REQUEST_FAILED", "The search request failed.", false);
        }
        if (!response.ok) throw new TavilySearchError("PROVIDER_REQUEST_FAILED", `The search request failed with status ${response.status}.`, true);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new TavilySearchError("INVALID_OUTPUT", "The search provider returned an unreadable response.", true);
        }
        const results = typeof payload === "object" && payload !== null ? (payload as { results?: unknown }).results : undefined;
        if (!Array.isArray(results)) throw new TavilySearchError("INVALID_OUTPUT", "The search provider returned no results array.", true);
        return results.map(rawResultOf).filter((item): item is PlanSearchRawResult => item !== null);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
