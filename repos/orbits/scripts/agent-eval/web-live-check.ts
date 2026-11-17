/**
 * npx tsx scripts/agent-eval/web-live-check.ts (agent-design AG09, PLANNER 执行顺序 6) — the REAL provider check, not a
 * test and not part of any gate: one real DeepSeek Search with the fixed public query "DeepSeek 官网 价格" and one real
 * Fetch of the official guide page the design cites, through the product's own adapter (features/agent-v1/web/
 * deepseek-tools.ts). Run in a local shell outside the eval environment, with ORBIT_AGENT_WEB=on and DEEPSEEK_API_KEY
 * in the environment (never printed). Writes status, time, the response's field names, the number of results and the
 * balance before and after to ~/orbit-sprint-evidence/agent-design/sprint-AG09/run-01/live-check/; page text is cut to
 * its first 500 characters.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readDeepSeekBalance } from "../../tests/agent-eval/lib/costs";
import { fetchPage, searchWeb, WebToolError } from "../../features/agent-v1/web/deepseek-tools";
import { webSwitchOn } from "../../features/agent-v1/web/settings";

const QUERY = "DeepSeek 官网 价格";
const PAGE = "https://api-docs.deepseek.com/zh-cn/guides/search/";
const OUT = path.join(os.homedir(), "orbit-sprint-evidence", "agent-design", "sprint-AG09", "run-01", "live-check");

async function main(): Promise<void> {
  if (process.env.ORBIT_AGENT_EVAL === "1") throw new Error("This is the live check: run it outside the eval environment.");
  if (!webSwitchOn()) throw new Error("ORBIT_AGENT_WEB is not on; nothing was sent.");
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set; nothing was sent.");
  const seen: { endpoint: string; status: number; fields: string[]; itemFields?: string[]; ms: number }[] = [];
  const recording = (async (input: string | URL | Request, init?: RequestInit) => {
    const started = Date.now();
    const response = await fetch(input, init);
    const text = await response.clone().text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const first = Array.isArray(record.results) && record.results[0] && typeof record.results[0] === "object" ? Object.keys(record.results[0] as object).sort() : undefined;
    seen.push({ endpoint: String(input), fields: Object.keys(record).sort(), ms: Date.now() - started, status: response.status, ...(first ? { itemFields: first } : {}) });
    return response;
  }) as typeof fetch;
  const before = await readDeepSeekBalance(apiKey);
  const out: Record<string, unknown> = { at: new Date().toISOString(), kind: "真实供应商联验（不是测试，不计入门槛）", page: PAGE, query: QUERY };
  try {
    const results = await searchWeb(QUERY, { apiKey, fetchImplementation: recording });
    out.search = { count: results.length, results: results.map((item) => ({ date: item.date, snippet: item.snippet.slice(0, 200), title: item.title, url: item.url })) };
  } catch (error) {
    out.search = { error: error instanceof WebToolError ? { reason: error.reason, responded: error.responded, status: error.status } : String(error) };
  }
  try {
    const page = await fetchPage(PAGE, { apiKey, fetchImplementation: recording });
    out.fetch = { contentChars: page.content.length, excerpt: page.content.slice(0, 500), title: page.title, updated: page.updated };
  } catch (error) {
    out.fetch = { error: error instanceof WebToolError ? { reason: error.reason, responded: error.responded, status: error.status } : String(error) };
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const after = await readDeepSeekBalance(apiKey);
  out.http = seen;
  out.balance = { after, before };
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `live-check-${String(out.at).replace(/[:.]/gu, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ balance: out.balance, fetch: (out.fetch as Record<string, unknown>).error ?? { contentChars: (out.fetch as Record<string, unknown>).contentChars, title: (out.fetch as Record<string, unknown>).title }, http: seen, search: (out.search as Record<string, unknown>).error ?? { count: (out.search as Record<string, unknown>).count }, written: file }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
