// R23: how a plan endpoint's failure envelope maps to the UI (UI-SPEC「常见错误原因 → 界面」).
// Pure (no React) so the rules are testable on their own.
import type { PlanAiLimitKind } from "../../api/contract/plan-v2";
import { isNotImplemented } from "../../api/compute/not-implemented";
import type { ApiResult } from "../../api/types";

export type PlanFailure =
  | { kind: "network" }
  | { kind: "notImplemented" }
  | { kind: "aiFailed" }
  | { kind: "aiBusy" }
  | { kind: "aiLimit"; limit: PlanAiLimitKind; retryOn: string | null }
  | { kind: "goalMonthlyLimit" }
  | { kind: "goalLimit" }
  | { kind: "stale" }
  /** R25: this month's 見直し are used up (`retryOn` = the next Tokyo month start). */
  | { kind: "reviewLimit"; retryOn: string | null }
  /** R25: the goal was already achieved (score frozen; no review / edit). */
  | { kind: "achieved" }
  | { kind: "used"; reason: string }
  | { kind: "other"; reason: string | null; message: string };

export type PlanResult<T> = { ok: true; data: T; status: number } | { ok: false; failure: PlanFailure };

/** Maps an error envelope to the UI's cases. */
export function planFailureOf(result: Extract<ApiResult<unknown>, { success: false }>): PlanFailure {
  if (result.status === 0 && result.error.code === "ORBIT_APP_NETWORK_ERROR") return { kind: "network" };
  if (isNotImplemented(result)) return { kind: "notImplemented" };
  const reason = result.error.context?.reason ?? null;
  switch (reason) {
    case "AI_FAILED": return { kind: "aiFailed" };
    case "AI_BUSY": return { kind: "aiBusy" };
    case "AI_LIMIT": return { kind: "aiLimit", limit: result.error.context?.limit === "monthly" ? "monthly" : "daily", retryOn: result.error.context?.retryOn ?? null };
    case "GOAL_MONTHLY_LIMIT": return { kind: "goalMonthlyLimit" };
    case "PLAN_GOAL_LIMIT": return { kind: "goalLimit" };
    case "STALE": return { kind: "stale" };
    case "REVIEW_LIMIT": return { kind: "reviewLimit", retryOn: result.error.context?.retryOn ?? null };
    case "PLAN_ACHIEVED": return { kind: "achieved" };
    case "FIX_LIMIT":
    case "MANUAL_EDIT_USED":
    case "LADDER_LIMIT":
    case "DRAFT_CLOSED":
    case "BACKGROUND_LOCKED":
      return { kind: "used", reason };
    default: return { kind: "other", message: result.error.message, reason };
  }
}
