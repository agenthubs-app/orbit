/**
 * R34 SC-R34-05（适配器部分）：`createTavilySearchProvider({ apiKey, fetchImplementation })` 的请求体字段固定
 * （`search_depth: basic`、`max_results: 3`、`include_answer: false`）、`Authorization: Bearer` 头、10 s `AbortController`；
 * 响应只取 `title / url / content / score`，缺字段的条目丢弃；非 2xx / 无 results / 超时 / 连接失败都抛 `TavilySearchError`（不重试）。
 * 真实网络调用 0 次：`fetch` 全部注入。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createTavilySearchProvider, TAVILY_SEARCH_ENDPOINT, TAVILY_SEARCH_TIMEOUT_MS, TavilySearchError } from "../../features/plans/search/tavily";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });
}

test("request: POST to the Tavily endpoint with fixed body fields and a bearer header; only the four fields are read back and incomplete items are dropped", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImplementation: typeof fetch = async (url, init) => {
    calls.push({ init: init ?? {}, url: String(url) });
    return jsonResponse({
      answer: "ignored",
      query: "q",
      results: [
        { content: "本文1", extra: 1, score: 0.9, title: "T1", url: "https://a.example/1" },
        { content: "本文2", score: 0.8, url: "https://b.example/2" }, // title 缺
        { content: "本文3", score: "0.7", title: "T3", url: "https://c.example/3" }, // score 不是数字
        { content: 42, score: 0.6, title: "T4", url: "https://d.example/4" }, // content 不是字符串
        { content: "本文5", score: 0.5, title: "T5", url: "https://e.example/5", raw_content: "long" },
      ],
    });
  };
  const provider = createTavilySearchProvider({ apiKey: "tvly-test", fetchImplementation });
  assert.equal(provider.name, "tavily");
  const results = await provider.search("日本 市場規模 統計", {});
  assert.deepEqual(results, [
    { content: "本文1", score: 0.9, title: "T1", url: "https://a.example/1" },
    { content: "本文5", score: 0.5, title: "T5", url: "https://e.example/5" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TAVILY_SEARCH_ENDPOINT);
  assert.equal(TAVILY_SEARCH_ENDPOINT, "https://api.tavily.com/search");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tvly-test");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { include_answer: false, max_results: 3, query: "日本 市場規模 統計", search_depth: "basic" });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("timeout: the request is aborted via AbortController after 10 s and surfaces as PROVIDER_TIMEOUT; no second request is made", async () => {
  assert.equal(TAVILY_SEARCH_TIMEOUT_MS, 10_000);
  let requests = 0;
  const fetchImplementation: typeof fetch = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      requests += 1;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const provider = createTavilySearchProvider({ apiKey: "k", fetchImplementation, timeoutMs: 20 });
  await assert.rejects(provider.search("q", {}), (error: unknown) => error instanceof TavilySearchError && error.code === "PROVIDER_TIMEOUT");
  assert.equal(requests, 1);
});

test("an outer signal aborts the request too; connection failure, non-2xx and unreadable bodies each become one typed error without retry", async () => {
  let requests = 0;
  const failing: typeof fetch = async () => {
    requests += 1;
    throw new TypeError("fetch failed");
  };
  await assert.rejects(createTavilySearchProvider({ apiKey: "k", fetchImplementation: failing }).search("q", {}), (error: unknown) => error instanceof TavilySearchError && error.code === "PROVIDER_REQUEST_FAILED");
  const unauthorized: typeof fetch = async () => {
    requests += 1;
    return jsonResponse({ detail: "unauthorized" }, 401);
  };
  await assert.rejects(createTavilySearchProvider({ apiKey: "k", fetchImplementation: unauthorized }).search("q", {}), (error: unknown) => error instanceof TavilySearchError && error.code === "PROVIDER_REQUEST_FAILED" && /401/u.test(error.message));
  const garbage: typeof fetch = async () => {
    requests += 1;
    return new Response("<html>", { status: 200 });
  };
  await assert.rejects(createTavilySearchProvider({ apiKey: "k", fetchImplementation: garbage }).search("q", {}), (error: unknown) => error instanceof TavilySearchError && error.code === "INVALID_OUTPUT");
  const noResults: typeof fetch = async () => {
    requests += 1;
    return jsonResponse({ query: "q" });
  };
  await assert.rejects(createTavilySearchProvider({ apiKey: "k", fetchImplementation: noResults }).search("q", {}), (error: unknown) => error instanceof TavilySearchError && error.code === "INVALID_OUTPUT");
  assert.equal(requests, 4);

  const outer = new AbortController();
  const hanging: typeof fetch = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const pending = createTavilySearchProvider({ apiKey: "k", fetchImplementation: hanging }).search("q", { signal: outer.signal });
  outer.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof TavilySearchError && error.code === "PROVIDER_TIMEOUT");
});
