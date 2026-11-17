import assert from "node:assert/strict";
import test from "node:test";

import { DEEPSEEK_FETCH_ENDPOINT, DEEPSEEK_SEARCH_ENDPOINT, fetchPage, searchWeb, WebToolError } from "../../features/agent-v1/web/deepseek-tools";
import { toolsStub } from "./web-kit";

/** agent-design AG09: the DeepSeek Search/Fetch adapter — fixed endpoints, Bearer key, 3 results, 10 s timeout, no retry. */

test("search posts { query, count: 3 } with the Bearer key and keeps title, url, snippet and date; bad items are dropped", async () => {
  const tools = toolsStub({ search: () => ({ results: [{ date: "2026-10-01T00:00:00Z", snippet: "s1", title: "A", url: "https://a.example.test/" }, { title: "no url" } as never, { snippet: "s3", title: "C", url: "https://c.example.test/" }] }) });
  const results = await searchWeb("Acme Cloud 官网 价格", { apiKey: "k", fetchImplementation: tools.fetchImplementation });
  assert.equal(tools.calls.length, 1);
  assert.deepEqual(tools.calls[0].body, { count: 3, query: "Acme Cloud 官网 价格" });
  assert.equal(tools.calls[0].headers.authorization, "Bearer k");
  assert.deepEqual(results.map((item) => item.url), ["https://a.example.test/", "https://c.example.test/"]);
  assert.equal(results[0].date, "2026-10-01T00:00:00Z");
  assert.equal(DEEPSEEK_SEARCH_ENDPOINT, "https://api.deepseek.com/v1/tools/search");
  assert.equal(DEEPSEEK_FETCH_ENDPOINT, "https://api.deepseek.com/v1/tools/fetch");
});

test("fetch posts { url } and returns title and Markdown content", async () => {
  const tools = toolsStub();
  const page = await fetchPage("https://acme-cloud.example.test/pricing", { apiKey: "k", fetchImplementation: tools.fetchImplementation });
  assert.deepEqual(tools.calls[0].body, { url: "https://acme-cloud.example.test/pricing" });
  assert.equal(page.title, "Acme Cloud 价格");
  assert.match(page.content, /1,300/u);
});

test("a timeout is not answered (responded false); a non-2xx is (responded true); nothing is retried", async () => {
  const slow = toolsStub({ fetch: () => "timeout" });
  await assert.rejects(fetchPage("https://slow.example.test/page", { apiKey: "k", fetchImplementation: slow.fetchImplementation, timeoutMs: 50 }), (error: unknown) => error instanceof WebToolError && error.reason === "timeout" && !error.responded);
  assert.equal(slow.calls.length, 1);
  const refused = toolsStub({ search: () => 429 });
  await assert.rejects(searchWeb("x", { apiKey: "k", fetchImplementation: refused.fetchImplementation }), (error: unknown) => error instanceof WebToolError && error.reason === "http" && error.responded && error.status === 429);
  assert.equal(refused.calls.length, 1);
});
