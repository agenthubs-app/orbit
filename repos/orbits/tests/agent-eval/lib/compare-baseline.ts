/**
 * agent-design AG18-5 — a run against the AG00 baseline, on the cases both ran (设计稿 §7 统计口径, §9 发布判据):
 * the cost of each successful request (real calls only; shadow passes and simulated calls in their own columns), the
 * p50 and p95 of the request time on the three paths (query, mixed write, memory), the questions asked back, and how
 * often a turn hit its model-call limit.
 *
 * Definitions (written into the report as well):
 * - a request: on the new entry one `entry.accepted` … `entry.finished` pair (wall time, queue included); on the old
 *   path one send POST until its 200 answer (polls of a 202 included). Shadow passes (`shadow:` request ids) are not
 *   requests. Successful: completed or waiting for the user (new), HTTP 200 (old).
 * - the path of a request is its case's: memory when the case is in the MEM area; mixed write when the case expects
 *   cards or a written change (cards count above 0, card_ops, writes_exact); query otherwise.
 * - cost: DeepSeek usage of the real model responses at the price table of tests/agent-eval/lib/costs.ts.
 * - a question back: `clarify.asked` (new), a reply routed as a clarification (old).
 * - the model-call limit: hit when a call was refused for the turn's budget (`budget` with exhausted); reached when a
 *   turn used every call of it. The old path records no budget: it is shown as the turns that made its 3 calls.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { deepseekCost, type DeepSeekUsage } from "./costs";

export type PathKind = "query" | "mixed_write" | "memory";

interface Event {
  type: string;
  origin?: string;
  realAt?: string;
  at?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface CaseMetrics {
  caseId: string;
  path: PathKind;
  requests: { latencyMs: number; ok: boolean }[];
  costCny: number;
  shadowCostCny: number;
  shadowModelCalls: number;
  realModelCalls: number;
  simulatedModelCalls: number;
  clarifications: number;
  budgetHits: number;
  budgetReached: number;
}

export interface RunMetrics {
  runId: string;
  cases: Record<string, CaseMetrics>;
}

const OLD_PATH_CALL_LIMIT = 3;

export function pathOf(testCase: { id?: string; hard?: readonly unknown[] } | null, caseId: string): PathKind {
  if (/^AE-MEM-/u.test(caseId)) return "memory";
  for (const check of testCase?.hard ?? []) {
    if (!check || typeof check !== "object") continue;
    const entry = check as Record<string, unknown>;
    const cards = entry.cards as { count?: number } | undefined;
    if ((cards && Number(cards.count ?? 0) > 0) || "card_ops" in entry || ("writes_exact" in entry && entry.writes_exact !== "none")) return "mixed_write";
  }
  return "query";
}

const ms = (event: Event | undefined) => (event ? Date.parse(String(event.realAt ?? event.at ?? "")) : Number.NaN);
const isShadow = (requestId: unknown) => typeof requestId === "string" && requestId.startsWith("shadow:");

export function caseMetrics(caseId: string, testCase: { hard?: readonly unknown[] } | null, events: readonly Event[]): CaseMetrics {
  const metrics: CaseMetrics = { budgetHits: 0, budgetReached: 0, caseId, clarifications: 0, costCny: 0, path: pathOf(testCase, caseId), realModelCalls: 0, requests: [], shadowCostCny: 0, shadowModelCalls: 0, simulatedModelCalls: 0 };
  const product = events.filter((event) => event.origin !== "runner");
  const accepted = new Map<string, Event>();
  const finished = new Map<string, Event>();
  for (const event of product) {
    if (event.type === "entry.accepted" && event.requestId && !isShadow(event.requestId) && !accepted.has(event.requestId)) accepted.set(event.requestId, event);
    if (event.type === "entry.finished" && event.requestId && !isShadow(event.requestId)) finished.set(event.requestId, event);
  }
  if (accepted.size) {
    for (const [requestId, start] of accepted) {
      const end = finished.get(requestId);
      const latency = ms(end) - ms(start);
      metrics.requests.push({ latencyMs: Number.isFinite(latency) ? Math.max(0, latency) : Number.NaN, ok: Boolean(end && (end.status === "completed" || end.status === "waiting_user")) });
    }
  } else {
    // The old path: one send until its 200 (202 polls included).
    const runner = events.filter((event) => event.origin === "runner" && event.path === "/api/ai/conversations");
    for (const [index, event] of runner.entries()) {
      if (event.type !== "http.request" || event.method !== "POST" || event.purpose !== "send") continue;
      let answer: Event | undefined;
      for (const later of runner.slice(index + 1)) {
        if (later.type === "http.request" && later.purpose === "send") break;
        if (later.type === "http.response" && later.status !== 202) {
          answer = later;
          break;
        }
      }
      const latency = ms(answer) - ms(event);
      metrics.requests.push({ latencyMs: Number.isFinite(latency) ? Math.max(0, latency) : Number.NaN, ok: answer?.status === 200 });
      const body = answer?.body as { data?: { routingDecision?: { intent?: string } } } | undefined;
      if (body && typeof body === "object" && body.data?.routingDecision?.intent === "clarification") metrics.clarifications += 1;
      // Calls made while this send was being answered (the old runtime has no request id on its calls).
      const from = ms(event);
      const to = ms(answer);
      const calls = product.filter((item) => item.type === "model.request" && item.source === "real" && ms(item) >= from && ms(item) <= to).length;
      if (calls >= OLD_PATH_CALL_LIMIT) metrics.budgetReached += 1;
    }
  }
  const hitRequests = new Set<string>();
  const reachedRequests = new Set<string>();
  for (const event of product) {
    const shadow = isShadow(event.requestId);
    if (event.type === "model.request") {
      if (event.source === "simulated") metrics.simulatedModelCalls += 1;
      else if (event.source !== "replay") {
        if (shadow) metrics.shadowModelCalls += 1;
        else metrics.realModelCalls += 1;
      }
    }
    if (event.type === "model.response" && event.source === "real" && event.usage) {
      const cost = deepseekCost(String(event.model ?? "deepseek-flash"), event.usage as DeepSeekUsage, String(event.realAt ?? event.at)) ?? 0;
      if (shadow) metrics.shadowCostCny += cost;
      else metrics.costCny += cost;
    }
    if (shadow) continue;
    if (event.type === "clarify.asked" && event.kind !== "entry") metrics.clarifications += 1;
    if (event.type === "budget" && event.what === "model_calls" && event.requestId) {
      if (event.exhausted === true) hitRequests.add(event.requestId);
      if (typeof event.used === "number" && typeof event.limit === "number" && event.used >= event.limit) reachedRequests.add(event.requestId);
    }
  }
  metrics.budgetHits += hitRequests.size;
  metrics.budgetReached += reachedRequests.size;
  return metrics;
}

function readEvents(file: string): Event[] {
  if (!fs.existsSync(file)) return [];
  const events: Event[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as Event);
    } catch {
      // a cut line at the end of an aborted case
    }
  }
  return events;
}

export function readRunMetrics(runDir: string): RunMetrics {
  const casesDir = path.join(runDir, "cases");
  const cases: Record<string, CaseMetrics> = {};
  for (const caseId of fs.existsSync(casesDir) ? fs.readdirSync(casesDir).sort() : []) {
    const dir = path.join(casesDir, caseId);
    if (!fs.statSync(dir).isDirectory()) continue;
    const caseFile = path.join(dir, "case.yaml");
    const testCase = fs.existsSync(caseFile) ? (yaml.load(fs.readFileSync(caseFile, "utf8")) as { hard?: unknown[] }) : null;
    cases[caseId] = caseMetrics(caseId, testCase, readEvents(path.join(dir, "trace.jsonl")));
  }
  return { cases, runId: path.basename(runDir) };
}

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export interface SideSummary {
  runId: string;
  cases: number;
  requests: number;
  successful: number;
  costCny: number;
  costPerSuccessfulCny: number | null;
  shadowCostCny: number;
  shadowModelCalls: number;
  realModelCalls: number;
  simulatedModelCalls: number;
  paths: Record<PathKind, { requests: number; p50Ms: number | null; p95Ms: number | null }>;
  clarifications: number;
  clarificationsPerCase: number;
  budgetHits: number;
  budgetReached: number;
  budgetHitRate: number | null;
  budgetReachedRate: number | null;
}

export function summarize(run: RunMetrics, caseIds: readonly string[]): SideSummary {
  const cases = caseIds.map((id) => run.cases[id]).filter(Boolean);
  const requests = cases.flatMap((item) => item.requests);
  const successful = requests.filter((item) => item.ok).length;
  const costCny = cases.reduce((sum, item) => sum + item.costCny, 0);
  const paths = {} as SideSummary["paths"];
  for (const kind of ["query", "mixed_write", "memory"] as PathKind[]) {
    const latencies = cases.filter((item) => item.path === kind).flatMap((item) => item.requests.filter((request) => request.ok).map((request) => request.latencyMs));
    paths[kind] = { p50Ms: percentile(latencies, 50), p95Ms: percentile(latencies, 95), requests: latencies.length };
  }
  const clarifications = cases.reduce((sum, item) => sum + item.clarifications, 0);
  const budgetHits = cases.reduce((sum, item) => sum + item.budgetHits, 0);
  const budgetReached = cases.reduce((sum, item) => sum + item.budgetReached, 0);
  return {
    budgetHitRate: requests.length ? budgetHits / requests.length : null,
    budgetHits,
    budgetReached,
    budgetReachedRate: requests.length ? budgetReached / requests.length : null,
    cases: cases.length,
    clarifications,
    clarificationsPerCase: cases.length ? clarifications / cases.length : 0,
    costCny,
    costPerSuccessfulCny: successful ? costCny / successful : null,
    paths,
    realModelCalls: cases.reduce((sum, item) => sum + item.realModelCalls, 0),
    requests: requests.length,
    runId: run.runId,
    shadowCostCny: cases.reduce((sum, item) => sum + item.shadowCostCny, 0),
    shadowModelCalls: cases.reduce((sum, item) => sum + item.shadowModelCalls, 0),
    simulatedModelCalls: cases.reduce((sum, item) => sum + item.simulatedModelCalls, 0),
    successful,
  };
}

export interface Comparison {
  baseline: SideSummary;
  run: SideSummary;
  common: string[];
  onlyBaseline: string[];
  onlyRun: string[];
}

export function compareRuns(run: RunMetrics, baseline: RunMetrics): Comparison {
  const common = Object.keys(run.cases).filter((id) => baseline.cases[id]).sort();
  return {
    baseline: summarize(baseline, common),
    common,
    onlyBaseline: Object.keys(baseline.cases).filter((id) => !run.cases[id]).sort(),
    onlyRun: Object.keys(run.cases).filter((id) => !baseline.cases[id]).sort(),
    run: summarize(run, common),
  };
}

const yuan = (value: number | null) => (value === null ? "—" : value.toFixed(4));
const sec = (value: number | null) => (value === null ? "—" : (value / 1000).toFixed(1));
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

export function comparisonMarkdown(comparison: Comparison): string {
  const { baseline: b, run: r } = comparison;
  const row = (label: string, left: string, right: string) => `| ${label} | ${left} | ${right} |`;
  return [
    `# 与基线的对比：${r.runId} 对 ${b.runId}`,
    "",
    `只比两次都跑过的 ${comparison.common.length} 例（基线独有 ${comparison.onlyBaseline.length} 例、本次独有 ${comparison.onlyRun.length} 例不计入，名单在 JSON 里）。`,
    "",
    "| 指标 | 基线 | 本次 |",
    "|---|---|---|",
    row("委托数（成功）", `${b.requests}（${b.successful}）`, `${r.requests}（${r.successful}）`),
    row("真实调用费用（元）", yuan(b.costCny), yuan(r.costCny)),
    row("每次成功请求的费用（元）", yuan(b.costPerSuccessfulCny), yuan(r.costPerSuccessfulCny)),
    row("主模型真实调用次数", String(b.realModelCalls), String(r.realModelCalls)),
    row("影子通路：调用次数 / 费用（元，单列，不计入上面）", `${b.shadowModelCalls} / ${yuan(b.shadowCostCny)}`, `${r.shadowModelCalls} / ${yuan(r.shadowCostCny)}`),
    row("模拟调用次数（单列）", String(b.simulatedModelCalls), String(r.simulatedModelCalls)),
    ...(["query", "mixed_write", "memory"] as PathKind[]).map((kind) => row(`${{ memory: "记忆", mixed_write: "混合写入", query: "查询" }[kind]}：p50 / p95（秒，成功委托 n）`, `${sec(b.paths[kind].p50Ms)} / ${sec(b.paths[kind].p95Ms)}（${b.paths[kind].requests}）`, `${sec(r.paths[kind].p50Ms)} / ${sec(r.paths[kind].p95Ms)}（${r.paths[kind].requests}）`)),
    row("追问轮数（合计 / 每例平均）", `${b.clarifications} / ${b.clarificationsPerCase.toFixed(2)}`, `${r.clarifications} / ${r.clarificationsPerCase.toFixed(2)}`),
    row("调用上限：被拒（命中率）", `${b.budgetHits}（${pct(b.budgetHitRate)}，旧通路不记录）`, `${r.budgetHits}（${pct(r.budgetHitRate)}）`),
    row("调用上限：用满（比例）", `${b.budgetReached}（${pct(b.budgetReachedRate)}，按满 3 次调用计）`, `${r.budgetReached}（${pct(r.budgetReachedRate)}）`),
    "",
    "口径：委托＝新入口一次 entry.accepted 到 entry.finished（含排队），旧通路一次发送到 200（含 202 轮询）；成功＝完成或等用户（新）、HTTP 200（旧）；路径按用例分：MEM 区为记忆，期望出卡或写入的为混合写入，其余为查询；费用只算真实主模型调用，按 tests/agent-eval/lib/costs.ts 的价格表；影子（shadow: 开头的委托）和模拟调用单列。",
  ].join("\n");
}
