/**
 * R34：没配置搜索（没有 `ORBIT_PLAN_SEARCH=tavily` / `TAVILY_API_KEY` / live 账本）时的实现：直接「本次未能联网核实」。
 * 不记账、不联网、不产生任何来源（DESIGN §3.2「全部失败 → 起草照常进行」的同一路径）。
 */
import type { PlanSearch } from "./types";

export function createDisabledPlanSearch(): PlanSearch {
  return {
    id: "disabled",
    async search() {
      return { failed: 0, queries: 0, sources: [], status: "unavailable" };
    },
  };
}
