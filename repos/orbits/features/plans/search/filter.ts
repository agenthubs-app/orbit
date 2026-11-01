/**
 * R34 SC-02：搜索结果的过滤与去重（plan-v3/DESIGN.md §3.2「过滤」）。
 *
 * - 只留 https；去掉社交平台个人页（x / twitter / facebook / instagram / threads 整站、linkedin 的 `/in/`、note.com 的用户页）；
 *   去掉广告 / 追踪页（`utm_*`、`gclid` / `fbclid`、affiliate 参数，路径段 ad / ads / affiliate / sponsored / promo，`ad.` / `ads.` 子域）；
 * - 同 host 去重：按完整 host（`www.meti.go.jp` ≠ `www.jpo.go.jp`），只留分数最高一条，同分留先到的；
 * - `snippet` ≤300 字（按字符数，不按字节）；输出带 `fetchedAt`（ISO）与 `query`，不带 `id`（R35 编号）。
 * 只在网页来源之间去重，不和业界现状库比（PLANNER 事实 6）。
 */
import type { PlanWebSource } from "../../../shared/contract/plan-v2";
import type { PlanSearchRawResult } from "./types";

export const PLAN_SEARCH_SNIPPET_MAX = 300;
/** 一份计划最多 8 次查询 × 每次 3 条。 */
export const PLAN_SEARCH_SOURCES_MAX = 24;

export interface PlanSearchQueryResults {
  query: string;
  results: readonly PlanSearchRawResult[];
}

export type PlanSearchSource = Omit<PlanWebSource, "id">;

/** 整站视为个人页 / 社交平台的 host（含子域）。 */
const SOCIAL_HOSTS = ["x.com", "twitter.com", "facebook.com", "instagram.com", "threads.net"];
const AD_PATH_SEGMENTS = new Set(["ad", "ads", "advert", "advertisement", "advertising", "affiliate", "affiliates", "sponsored", "promo"]);
const AD_QUERY_PARAMS = ["gclid", "fbclid", "yclid", "msclkid", "affiliate", "affiliate_id", "aff_id", "aff", "ref_aff"];

function hostMatches(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

/** 拒绝原因；null = 合规。导出给测试与日志用。 */
export function rejectSearchUrl(input: string): "invalid" | "not_https" | "social" | "ad" | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:") return "not_https";
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  if (SOCIAL_HOSTS.some((root) => hostMatches(host, root))) return "social";
  if (hostMatches(host, "linkedin.com") && segments[0] === "in") return "social";
  if (hostMatches(host, "note.com") && segments.length === 1) return "social";
  if (host.startsWith("ad.") || host.startsWith("ads.")) return "ad";
  if (segments.some((segment) => AD_PATH_SEGMENTS.has(segment.toLowerCase()))) return "ad";
  for (const key of url.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || AD_QUERY_PARAMS.includes(lower)) return "ad";
  }
  return null;
}

function clipSnippet(content: string): string {
  const compact = content.replace(/\s+/gu, " ").trim();
  const chars = Array.from(compact);
  return chars.length > PLAN_SEARCH_SNIPPET_MAX ? chars.slice(0, PLAN_SEARCH_SNIPPET_MAX).join("").trim() : compact;
}

export function filterSearchResults(raw: readonly PlanSearchQueryResults[], options: { now: Date }): PlanSearchSource[] {
  const fetchedAt = options.now.toISOString();
  const byHost = new Map<string, { source: PlanSearchSource; score: number; order: number }>();
  let order = 0;
  for (const { query, results } of raw) {
    for (const result of results) {
      if (rejectSearchUrl(result.url) !== null) continue;
      const host = new URL(result.url).hostname.toLowerCase();
      const score = Number.isFinite(result.score) ? result.score : 0;
      const current = byHost.get(host);
      if (current && current.score >= score) continue;
      const title = result.title.replace(/\s+/gu, " ").trim() || host;
      byHost.set(host, { order: current?.order ?? order++, score, source: { fetchedAt, kind: "web", query, snippet: clipSnippet(result.content), title, url: result.url } });
    }
  }
  return Array.from(byHost.values())
    .sort((left, right) => left.order - right.order)
    .slice(0, PLAN_SEARCH_SOURCES_MAX)
    .map((entry) => entry.source);
}
