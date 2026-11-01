/**
 * R34：起草前的联网搜索（plan-v3/DESIGN.md §2.3 / §2.6 / §3.2）。对外只暴露 `PlanSearch`；
 * 不接进 `flow-service`（R35 留可选依赖，主会话合流时在 `flow-factory.ts` 注入 `configuredPlanSearch()`）。
 *
 * 本文件的接口与 R34 / R35 两份 PLANNER 的「接口」一节逐字段一致，不得改名。
 * 结果里的来源不带 `id`（`Omit<PlanWebSource, "id">`）：编号 `S<n>` 由 R35 的服务层做。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { IndustryIdCode } from "../../../shared/contract/industries";
import type { PlanGoalKind, PlanPremiseRow, PlanWebSource } from "../../../shared/contract/plan-v2";

export interface PlanSearchInput {
  goalKind: PlanGoalKind;
  goalText: string;
  purpose: string | null;
  premise: readonly PlanPremiseRow[];
  industries: readonly IndustryIdCode[];
  language: PlanCopyLanguage;
}

/** 幂等键 = `${ledgerKeyPrefix}#search-${n}`（n 从 1 起，按查询顺序）。 */
export interface PlanSearchContext {
  actorId: string;
  ledgerKeyPrefix: string;
  now: Date;
}

export interface PlanSearchResult {
  /** `unavailable` = 全部失败 / 未配置 / 超时全败（此时 `sources: []`）；`partial` = 有查询失败但有结果。 */
  status: "ok" | "partial" | "unavailable";
  /** 已过滤去重、≤8×3 条上限内；`id` 由 R35 编。 */
  sources: Array<Omit<PlanWebSource, "id">>;
  /** 实际发出的查询数与其中失败的条数。 */
  queries: number;
  failed: number;
}

export interface PlanSearch {
  readonly id: "tavily" | "mock" | "disabled";
  search(input: PlanSearchInput, context: PlanSearchContext): Promise<PlanSearchResult>;
}

/* ---------- 模块内部共用（不在两边 PLANNER 的约定里，R35 不依赖） ---------- */

/** 查询模板的三类，顺序固定：点名 → 规则门槛 → 市场数据（D-5：3 / 3 / 2）。 */
export type PlanSearchQueryKind = "named" | "threshold" | "market";

export interface PlanSearchQuery {
  kind: PlanSearchQueryKind;
  query: string;
}

/** 搜索供应商返回的一条原始结果（Tavily 只取这四个字段）。 */
export interface PlanSearchRawResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

/** 一条查询对应的一次供应商调用；抛错即该条查询失败（不重试）。 */
export interface PlanSearchProvider {
  readonly name: string;
  search(query: string, options: { signal?: AbortSignal }): Promise<PlanSearchRawResult[]>;
}
