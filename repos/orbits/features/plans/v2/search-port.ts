/**
 * R35：起草前联网搜索的「端口」——`flow-service` 只认这个结构类型，不 import R34 的 `features/plans/search/**`。
 * 字段与 R34 / R35 两份 PLANNER 的「搜索依赖」一节逐字段相同（`features/plans/search/types.ts` 的 `PlanSearch*`），不得改名；
 * 主会话合流时在 `flow-factory.ts` 把 `configuredPlanSearch()` 作为 `createPlanFlowService({ search })` 传进来。
 *
 * 缺省 / 返回 `unavailable` / 抛错 → 来源只有业界现状库，并在 `risks` 追加一条 `unverified`「本次未能联网核实」；搜索绝不阻塞起草。
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

/** `ledgerKeyPrefix` = 初版的账本键（`draft:<intakeId>:<premiseVersion>[#attempt]`）；搜索端的幂等键 = `${prefix}#search-${n}`。 */
export interface PlanSearchContext {
  actorId: string;
  ledgerKeyPrefix: string;
  now: Date;
}

export interface PlanSearchResult {
  status: "ok" | "partial" | "unavailable";
  /** 已过滤去重；`id`（`S<n>`）由 `flow-service` 接在业界现状库来源之后编。 */
  sources: Array<Omit<PlanWebSource, "id">>;
  queries: number;
  failed: number;
}

export type PlanSearchLike = { search(input: PlanSearchInput, context: PlanSearchContext): Promise<PlanSearchResult> };
