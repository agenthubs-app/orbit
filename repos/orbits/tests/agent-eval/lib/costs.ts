/**
 * Price table, cost roll-up and the DeepSeek balance (eval/README.md §13).
 * A new price means a new table version; never edit an old one.
 */
import type { TraceEvent } from "./trace-log";

export const PRICE_TABLE = {
  version: "2026-11-17.1",
  retrievedAt: "2026-11-17",
  source: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
  currency: "CNY",
  notes:
    "deepseek-flash (DeepSeek-V4.1-Flash-1017); the retired name deepseek-v4-flash is served and billed as Flash. Peak = Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00 (holidays excluded, not modelled); off-peak is half price.",
  deepseek: {
    "deepseek-flash": { peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 }, offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 } },
    "deepseek-v4-pro": { peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 }, offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
  },
  aliases: { "deepseek-v4-flash": "deepseek-flash", "deepseek-chat": "deepseek-flash" } as Record<string, string>,
  /**
   * Gemini Decision bills input tokens only (usage.total_input_tokens; output is 0). AG08: 0.10 USD per million input
   * tokens as 设计稿 §3.8 quotes the official announcement (blog.google … gemini-decisions-api), at 7.2 CNY/USD.
   * Not checked against a billing page (none is reachable from the eval); `verified` stays false.
   */
  gemini: { "gemini-decision-1": { input: 0.72 as number | null, usdPerMillion: 0.1, cnyPerUsd: 7.2, verified: false } },
  /** DeepSeek Search/Fetch: only 200 responses with results are billed; price to be filled by AG09. */
  web: { search: null as number | null, fetch: null as number | null },
} as const;

export function isPeakBeijing(isoTime: string): boolean {
  const beijing = new Date(Date.parse(isoTime) + 8 * 3_600_000);
  const day = beijing.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080);
}

export interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  total_tokens?: number;
}

export function deepseekCost(model: string, usage: DeepSeekUsage, atIso: string): number | null {
  const name = PRICE_TABLE.aliases[model] ?? model;
  const table = PRICE_TABLE.deepseek[name as keyof typeof PRICE_TABLE.deepseek];
  if (!table) return null;
  const price = isPeakBeijing(atIso) ? table.peak : table.offPeak;
  const hit = usage.prompt_cache_hit_tokens ?? 0;
  const miss = usage.prompt_cache_miss_tokens ?? Math.max(0, (usage.prompt_tokens ?? 0) - hit);
  const out = usage.completion_tokens ?? 0;
  return (hit * price.cacheHit + miss * price.cacheMiss + out * price.output) / 1_000_000;
}

export interface CallTally {
  real: number;
  simulated: number;
  replay: number;
}

export interface CostSummary {
  priceTable: typeof PRICE_TABLE;
  calls: { model: CallTally; judgment: CallTally; search: CallTally; fetch: CallTally };
  usage: { model: { calls: number; promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number; raw: unknown[] }; judgment: { inputTokens: number; raw: unknown[] } };
  amountCny: { model: number; judgment: number | null; web: number | null; total: number; unpriced: string[] };
  balance: { before: BalanceReading | null; after: BalanceReading | null; deltaCny: number | null; note: string };
  remainingRuns: number | null;
  perCase: Record<string, { realModelCalls: number; simulatedModelCalls: number; costCny: number }>;
}

export interface BalanceReading {
  at: string;
  currency: string;
  total: number;
  raw: unknown;
}

const empty = (): CallTally => ({ real: 0, replay: 0, simulated: 0 });

export function tallyCosts(eventsByCase: Record<string, readonly TraceEvent[]>): Omit<CostSummary, "balance" | "remainingRuns"> {
  const calls = { fetch: empty(), judgment: empty(), model: empty(), search: empty() };
  const usage = { judgment: { inputTokens: 0, raw: [] as unknown[] }, model: { cacheHitTokens: 0, cacheMissTokens: 0, calls: 0, completionTokens: 0, promptTokens: 0, raw: [] as unknown[] } };
  let modelCost = 0;
  const unpriced: string[] = [];
  const perCase: CostSummary["perCase"] = {};
  for (const [caseId, events] of Object.entries(eventsByCase)) {
    const mine = { costCny: 0, realModelCalls: 0, simulatedModelCalls: 0 };
    for (const event of events) {
      const source = (event.source ?? "real") as keyof CallTally;
      if (event.type === "model.request") {
        calls.model[source] += 1;
        if (source === "real") mine.realModelCalls += 1;
        if (source === "simulated") mine.simulatedModelCalls += 1;
      }
      if (event.type === "judgment.request") calls.judgment[source] += 1;
      if (event.type === "web.search") calls.search[source] += 1;
      if (event.type === "web.fetch") calls.fetch[source] += 1;
      if (event.type === "model.response" && event.source === "real" && event.usage) {
        const u = event.usage as DeepSeekUsage;
        usage.model.calls += 1;
        usage.model.promptTokens += u.prompt_tokens ?? 0;
        usage.model.completionTokens += u.completion_tokens ?? 0;
        usage.model.cacheHitTokens += u.prompt_cache_hit_tokens ?? 0;
        usage.model.cacheMissTokens += u.prompt_cache_miss_tokens ?? 0;
        usage.model.raw.push({ caseId, seq: event.seq, usage: u, model: event.model });
        const cost = deepseekCost(String(event.model ?? "deepseek-flash"), u, String(event.realAt ?? event.at));
        if (cost === null) unpriced.push(String(event.model));
        else {
          modelCost += cost;
          mine.costCny += cost;
        }
      }
      if (event.type === "judgment.response" && event.source === "real" && event.usage) {
        const u = event.usage as { total_input_tokens?: number; promptTokenCount?: number; inputTokens?: number };
        usage.judgment.inputTokens += u.total_input_tokens ?? u.promptTokenCount ?? u.inputTokens ?? 0;
        usage.judgment.raw.push({ caseId, seq: event.seq, usage: u });
      }
    }
    perCase[caseId] = mine;
  }
  const judgmentPrice = PRICE_TABLE.gemini["gemini-decision-1"].input;
  const judgmentCost = calls.judgment.real === 0 ? 0 : judgmentPrice === null ? null : (usage.judgment.inputTokens * judgmentPrice) / 1_000_000;
  if (calls.judgment.real > 0 && judgmentPrice === null) unpriced.push("gemini-decision-1 (price not set)");
  const webCost = calls.search.real + calls.fetch.real === 0 ? 0 : null;
  if (webCost === null) unpriced.push("deepseek web search/fetch (price not set)");
  return {
    amountCny: { judgment: judgmentCost, model: modelCost, total: modelCost + (judgmentCost ?? 0) + (webCost ?? 0), unpriced, web: webCost },
    calls,
    perCase,
    priceTable: PRICE_TABLE,
    usage,
  };
}

/** Read-only balance query; the key is sent only in the header and never logged. */
export async function readDeepSeekBalance(apiKey: string | undefined): Promise<BalanceReading | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.deepseek.com/user/balance", { headers: { accept: "application/json", authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return { at: new Date().toISOString(), currency: "CNY", raw: { status: response.status }, total: Number.NaN };
    const body = (await response.json()) as { balance_infos?: { currency: string; total_balance: string }[] };
    const cny = body.balance_infos?.find((info) => info.currency === "CNY") ?? body.balance_infos?.[0];
    return { at: new Date().toISOString(), currency: cny?.currency ?? "CNY", raw: body, total: Number(cny?.total_balance ?? Number.NaN) };
  } catch (error) {
    return { at: new Date().toISOString(), currency: "CNY", raw: { error: error instanceof Error ? error.message : String(error) }, total: Number.NaN };
  }
}

export function finishCosts(base: Omit<CostSummary, "balance" | "remainingRuns">, before: BalanceReading | null, after: BalanceReading | null): CostSummary {
  const delta = before && after && Number.isFinite(before.total) && Number.isFinite(after.total) ? Math.round((before.total - after.total) * 10_000) / 10_000 : null;
  const spent = base.amountCny.total;
  const remainingRuns = after && Number.isFinite(after.total) && spent > 0 ? Math.floor(after.total / spent) : null;
  return {
    ...base,
    balance: { after, before, deltaCny: delta, note: "DeepSeek bills asynchronously; the balance delta may lag the computed amount by a few minutes." },
    remainingRuns,
  };
}
