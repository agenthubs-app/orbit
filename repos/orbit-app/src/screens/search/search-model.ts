// R30 全局搜索（App /search）的纯规则：类型 chip、空结果判定、最近搜索、时序常量。页面在 GlobalSearchScreen.tsx。
import type { GlobalSearchResponse, GlobalSearchType } from "../../api/contract/global-search";

export type SearchFilter = "all" | GlobalSearchType;

export const APP_RECENT_SEARCHES_KEY = "orbit.search.recent";
export const APP_RECENT_SEARCHES_MAX = 5;
export const APP_SEARCH_DEBOUNCE_MS = 250;
/** 「検索中…」只在 300ms 还没回答时出现（b12 #498 注）。 */
export const APP_SEARCHING_DELAY_MS = 300;

export function appSearchFilters(types: readonly GlobalSearchType[] | undefined): SearchFilter[] {
  // A1：live 没有对话服务（R21 前）时不画「会話」chip。
  const base: SearchFilter[] = ["all", "people", "events"];
  return types?.includes("conversations") ? [...base, "conversations"] : base;
}

/** 「一致する人はいません」：有查询、没有人也没有对话（活动命中只喂「イベントで探す」）。 */
export function isAppEmptyResult(result: GlobalSearchResponse | null): boolean {
  return !!result && result.query.trim().length > 0 && result.people.items.length === 0 && !(result.conversations?.items.length);
}

export function rememberAppSearch(recent: readonly string[], query: string): string[] {
  const text = query.trim();
  if (!text) return [...recent];
  return [text, ...recent.filter((item) => item !== text)].slice(0, APP_RECENT_SEARCHES_MAX);
}


export function globalSearchPath(input: { query: string; filter: SearchFilter; semantic: boolean; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("q", input.query.trim());
  if (input.filter !== "all") params.set("types", input.filter);
  if (input.semantic) params.set("semantic", "1");
  if (input.limit) params.set("limit", String(input.limit));
  params.set("platform", "app");
  return `/api/search/global?${params.toString()}`;
}
