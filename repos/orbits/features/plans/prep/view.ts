/**
 * R37a 主页「先做的事」的读出（`plans.analysis.home` → `PlanHomeView`）。单独成文件，让 v2 概要读取不依赖生成服务。
 */
import { PLAN_PREP_INITIAL_CARDS_LIMIT } from "../../ai-quota/constants";
import type { PlanHomeView } from "../../../shared/contract/plan-v2";
import type { PlanV2Row } from "../v2/types";
import { PLAN_HOME_LIMITS, type StoredPlanHome } from "./types";

function isStoredHome(value: unknown): value is StoredPlanHome {
  const home = value as StoredPlanHome | null;
  return Boolean(home && home.version === 1 && Array.isArray(home.actions) && typeof home.state === "string");
}

export function storedHomeOf(plan: Pick<PlanV2Row, "analysis">): StoredPlanHome | null {
  const home = (plan.analysis as { home?: unknown }).home;
  return isStoredHome(home) ? home : null;
}

const PENDING_VIEW: PlanHomeView = { actions: [], lead: null, state: "pending" };

/** 契约读出形状（去掉内部字段）。v3 计划还没有 `home` → pending（界面骨架 + 轮询，读路由同时补生成）；v2 计划 → undefined。 */
export function planHomeView(plan: Pick<PlanV2Row, "analysis">): PlanHomeView | undefined {
  if (plan.analysis.schemaVersion !== 3) return undefined;
  const home = storedHomeOf(plan);
  if (!home) return PENDING_VIEW;
  return {
    actions: home.actions.map(({ doneAt: _doneAt, regenerations: _regenerations, lastRegenerateKey: _key, ...action }) => action),
    lead: home.lead,
    state: home.state,
  };
}

/** 读路由用：这份计划要不要在 `after()` 里补生成。 */
export function planHomeNeedsWork(plan: Pick<PlanV2Row, "analysis" | "status">, now: Date): boolean {
  if (plan.status !== "active" || plan.analysis.schemaVersion !== 3) return false;
  const home = storedHomeOf(plan);
  if (!home) return true;
  if (home.state === "pending" || home.state === "failed") return now.getTime() - Date.parse(home.updatedAt) > PLAN_HOME_LIMITS.pendingStaleMs;
  return home.actions.length === 0 && home.initialCalls < PLAN_PREP_INITIAL_CARDS_LIMIT;
}

