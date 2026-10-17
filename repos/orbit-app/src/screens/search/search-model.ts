// R30 全局搜索（App /search）的纯规则：类型 chip、空结果判定、最近搜索、时序常量。页面在 GlobalSearchScreen.tsx。
import type { GlobalSearchResponse, GlobalSearchType } from "../../api/contract/global-search";

export type SearchFilter = "all" | GlobalSearchType;

export const APP_RECENT_SEARCHES_KEY = "orbit.search.recent";
export const APP_RECENT_SEARCHES_MAX = 5;
/** 意味検索的用户偏好（DESIGN §2.1：设置里关掉后送 0）。"off" = 关；只存这台设备。设置页开关界面归 R18（交接表 R30-06）。 */
export const APP_SEMANTIC_PREFERENCE_KEY = "orbit.search.semantic";
export const APP_SEARCH_DEBOUNCE_MS = 250;
/** 「検索中…」只在 300ms 还没回答时出现（b12 #498 注）。 */
export const APP_SEARCHING_DELAY_MS = 300;

export function appSearchFilters(types: readonly GlobalSearchType[] | undefined): SearchFilter[] {
  // A1：live 没有对话服务（R21 前）时不画「会話」chip。
  const base: SearchFilter[] = ["all", "people", "events"];
  return types?.includes("conversations") ? [...base, "conversations"] : base;
}

/** 空结果。すべて / 人：有查询、没有人也没有对话（活动命中只喂「イベントで探す」）；单类型イベント / 会話（A5）：那一组没有命中。 */
export function isAppEmptyResult(result: GlobalSearchResponse | null, filter: SearchFilter = "all"): boolean {
  if (!result || !result.query.trim()) return false;
  if (filter === "events") return result.events.items.length === 0;
  if (filter === "conversations") return !(result.conversations?.items.length);
  return result.people.items.length === 0 && !(result.conversations?.items.length);
}

export function rememberAppSearch(recent: readonly string[], query: string): string[] {
  const text = query.trim();
  if (!text) return [...recent];
  return [text, ...recent.filter((item) => item !== text)].slice(0, APP_RECENT_SEARCHES_MAX);
}


/** `semantic`: true → 1, false → 0 (the user turned it off), undefined → not sent (the account has no semantic search). */
export function globalSearchPath(input: { query: string; filter: SearchFilter; semantic?: boolean | undefined; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("q", input.query.trim());
  if (input.filter !== "all") params.set("types", input.filter);
  if (input.semantic !== undefined) params.set("semantic", input.semantic ? "1" : "0");
  if (input.limit) params.set("limit", String(input.limit));
  params.set("platform", "app");
  return `/api/search/global?${params.toString()}`;
}

/** 「「半導体商社の人に会うには？」」→ the question itself (the server quotes it for display; DESIGN §4.5 prefills it). */
export function alternativePrompt(detail: string): string {
  return detail.trim().replace(/^[「“"]/u, "").replace(/[」”"]$/u, "").trim();
}
