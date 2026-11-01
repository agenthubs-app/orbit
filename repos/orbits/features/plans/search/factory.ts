/**
 * R34 SC-05：按环境装配 `PlanSearch`（写法照 `features/plans/v2/flow-factory.ts` 的 `configuredPlanFlowAi`）。
 *
 * 环境变量：`ORBIT_PLAN_SEARCH=tavily`（开关）+ `TAVILY_API_KEY`（D-2，用户注册后放本机 `.env.local` 与生产环境变量）。
 * 开关打开、有 key、且有 live 账本（`getConfiguredNetworkAnalysisRuntime()`）→ Tavily；否则 disabled（起草照常、来源为空）。
 * 绝不在 live 下用 mock（mock 只给 mock 模块模式，由 `resolvePlanFlowService` 一侧选）。
 *
 * 注入位置（主会话在 R35 落地后加一行）：`flow-factory.ts` → `createPlanFlowService({ …, search: live ? configuredPlanSearch() : createMockPlanSearch() })`。
 */
import { getConfiguredNetworkAnalysisRuntime } from "../../network-analysis/runtime";
import type { AiQuotaGate } from "../../ai-quota/gate";
import { createDisabledPlanSearch } from "./disabled";
import { createPlanSearchService } from "./service";
import { createTavilySearchProvider } from "./tavily";
import type { PlanSearch } from "./types";

export const PLAN_SEARCH_ENV = "ORBIT_PLAN_SEARCH";
export const TAVILY_API_KEY_ENV = "TAVILY_API_KEY";

export interface ConfiguredPlanSearchOptions {
  /** 测试注入：默认 `getConfiguredNetworkAnalysisRuntime()?.ledger`。 */
  ledger?: () => AiQuotaGate | null;
  /** 测试注入：默认全局 `fetch`。 */
  fetchImplementation?: typeof fetch;
}

export function configuredPlanSearch(env: Record<string, string | undefined> = process.env, options: ConfiguredPlanSearchOptions = {}): PlanSearch {
  if ((env[PLAN_SEARCH_ENV] ?? "").trim().toLowerCase() !== "tavily") return createDisabledPlanSearch();
  const apiKey = env[TAVILY_API_KEY_ENV]?.trim();
  if (!apiKey) return createDisabledPlanSearch();
  const ledger = options.ledger ? options.ledger() : getConfiguredNetworkAnalysisRuntime()?.ledger ?? null;
  if (!ledger) return createDisabledPlanSearch();
  return createPlanSearchService({ ledger, provider: createTavilySearchProvider({ apiKey, fetchImplementation: options.fetchImplementation }) });
}
