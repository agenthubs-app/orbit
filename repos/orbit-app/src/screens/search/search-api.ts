// R30 全局搜索（App /search；search/DESIGN.md §3.1）：GET /api/search/global，回答经同步来的 schema 宽松读取。
// 失败变成一个小原因（429 → rate_limited，只提示一次、不自动重试）。读接口带 `platform=app`（示例世界与 live 都按端给 href）。不调 AI。
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type { GlobalSearchResponse } from "../../api/contract/global-search";
import { globalSearchResponseSchema } from "../../api/schema/global-search";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { read, type EventsResult } from "../events/v2/events-api";
import { globalSearchPath, type SearchFilter } from "./search-model";

export type { SearchFilter };
export type SearchResult = EventsResult<GlobalSearchResponse>;

export interface SearchApi {
  search(input: { query: string; filter: SearchFilter; semantic: boolean; limit?: number }): Promise<SearchResult>;
}

export function createSearchApi(client: OrbitApiClient): SearchApi {
  return { search: (input) => read(client.get<unknown>(globalSearchPath(input)), globalSearchResponseSchema as ZodType<GlobalSearchResponse>) };
}

export function useSearchApi(): SearchApi {
  const client = useOrbitApiClient();
  return useMemo(() => createSearchApi(client), [client]);
}
