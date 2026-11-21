/**
 * agent-design AG15 (设计稿 §5.2, §5.3; PLANNER 易错边界 9): every card that starts waiting gets a one-off timer at its
 * expiry — 7 days for a conversation card and for a scheduled task's card alike. The timer lives in the due index with
 * the rules; when it fires, the dispatcher marks the card expired. A regenerated card has a new expiry, so its timer is
 * moved. If the timer cannot be set the card is still made: a click past the expiry is refused anyway (decision.ts
 * judges expiry at the click), and the failure is traced.
 */
import { emitTrace } from "../../agent-v1/observability/trace";
import type { AgentActionRecord } from "../runtime/contract";
import type { AgentRuntimeService } from "../runtime/service";
import type { AutomationStorage } from "./due-index";
import { scheduleCardExpiry } from "./timers";

export function withCardExpiryTimers(runtime: AgentRuntimeService, input: { ownerId: string; storage: AutomationStorage; now?: () => string }): AgentRuntimeService {
  const now = input.now ?? (() => new Date().toISOString());
  const setTimer = async (action: AgentActionRecord | null | undefined) => {
    if (!action?.expiresAt || (action.status !== "awaiting_confirmation" && action.status !== "deferred")) return;
    try {
      await scheduleCardExpiry(input.storage, { actionId: action.actionId, expiresAt: action.expiresAt, ownerId: input.ownerId }, now());
      emitTrace({ cardId: action.actionId, fireAt: action.expiresAt, type: "timer.set", what: "card_expiry" });
    } catch (error) {
      emitTrace({ cardId: action.actionId, error: error instanceof Error ? error.message : String(error), type: "timer.set_failed", what: "card_expiry" });
    }
  };
  return {
    ...runtime,
    ...(runtime.freezeCard
      ? {
          freezeCard: async (frozen) => {
            const result = await runtime.freezeCard!(frozen);
            if (result.created) await setTimer(result.action);
            return result;
          },
        } satisfies Pick<AgentRuntimeService, "freezeCard">
      : {}),
    ...(runtime.regenerateCard
      ? {
          regenerateCard: async (regenerated) => {
            const result = await runtime.regenerateCard!(regenerated);
            if (result?.outcome === "regenerated") await setTimer(await runtime.getAction(regenerated.actionId));
            return result;
          },
        } satisfies Pick<AgentRuntimeService, "regenerateCard">
      : {}),
  };
}
