/**
 * The DeepSeek Search and Fetch endpoints (设计稿 §3.4 供应商与调用方式; agent-design AG09). One HTTP each, written
 * like features/plans/search/tavily.ts: a fixed endpoint, a 10 s AbortController plus the caller's signal, an
 * injectable fetch, an error that says whether the provider responded, malformed items dropped, never retried.
 *
 * Fields (official guide https://api-docs.deepseek.com/zh-cn/guides/search/, read 2026-11-17):
 * - Search `POST /v1/tools/search` `{ query (1–128 chars), count (1–50) }` → `results[] { title, url, snippet, summary,
 *   content, site_name, site_icon, date (RFC 3339 or null), rerank_score, authority }`; an empty list is no match.
 * - Fetch `POST /v1/tools/fetch` `{ url }` → `{ title, content (Markdown) }`.
 * - Same Bearer key as the model; 5 yuan per 1,000 successful calls each; failures and empty results are free.
 * The model endpoint is https://api.deepseek.com/chat/completions (no /v1); these two are their own constants.
 */
export const DEEPSEEK_SEARCH_ENDPOINT = "https://api.deepseek.com/v1/tools/search";
export const DEEPSEEK_FETCH_ENDPOINT = "https://api.deepseek.com/v1/tools/fetch";
export const WEB_CALL_TIMEOUT_MS = 10_000;
/** Each search keeps its first three results (设计稿 §3.4 预算). */
export const SEARCH_RESULT_COUNT = 3;

export type WebToolFailure = "timeout" | "network" | "http" | "malformed";

export class WebToolError extends Error {
  constructor(
    readonly reason: WebToolFailure,
    message: string,
    /** An HTTP response came back (non-2xx or unreadable); false for a timeout or a connection failure. */
    readonly responded: boolean,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "WebToolError";
  }
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  /** The page's date as the provider gives it (RFC 3339), or null. */
  date: string | null;
}

export interface FetchedPage {
  title: string;
  content: string;
  /** An update date some responses carry (the eval replay does); the real Fetch has none. */
  updated: string | null;
}

export interface WebToolOptions {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  /** 10 s by default; tests shorten it. */
  timeoutMs?: number;
}

async function post(endpoint: string, body: Record<string, unknown>, options: WebToolOptions): Promise<unknown> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? WEB_CALL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    let response: Response;
    try {
      response = await fetchImplementation(endpoint, { body: JSON.stringify(body), headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" }, method: "POST", signal: controller.signal });
    } catch {
      if (controller.signal.aborted) throw new WebToolError("timeout", "The web request timed out.", false);
      throw new WebToolError("network", "The web request failed.", false);
    }
    if (!response.ok) throw new WebToolError("http", `The web request failed with status ${response.status}.`, true, response.status);
    try {
      return await response.json();
    } catch {
      if (controller.signal.aborted) throw new WebToolError("timeout", "The web request timed out.", false);
      throw new WebToolError("malformed", "The web provider returned an unreadable response.", true, response.status);
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

export async function searchWeb(query: string, options: WebToolOptions): Promise<SearchResultItem[]> {
  const payload = await post(DEEPSEEK_SEARCH_ENDPOINT, { count: SEARCH_RESULT_COUNT, query }, options);
  const results = payload && typeof payload === "object" ? (payload as { results?: unknown }).results : undefined;
  if (!Array.isArray(results)) throw new WebToolError("malformed", "The search provider returned no results list.", true, 200);
  const out: SearchResultItem[] = [];
  for (const item of results) {
    const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const title = text(raw?.title);
    const url = text(raw?.url);
    if (!raw || title === null || !url) continue;
    out.push({ date: text(raw.date), snippet: text(raw.snippet) ?? "", title, url });
  }
  return out.slice(0, SEARCH_RESULT_COUNT);
}

export async function fetchPage(url: string, options: WebToolOptions): Promise<FetchedPage> {
  const payload = await post(DEEPSEEK_FETCH_ENDPOINT, { url }, options);
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const content = text(raw?.content);
  if (!raw || content === null) throw new WebToolError("malformed", "The fetch provider returned no content.", true, 200);
  return { content, title: text(raw.title) ?? "", updated: text(raw.updated) ?? text(raw.date) };
}
