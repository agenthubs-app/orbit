/**
 * iOrbit 对话的计量与每日上限（2026-11-27，用户定：先补计量和每人每日上限，作防滥用的保险丝，不是会员额度）。
 *
 * - 一轮对话 = 账本里一次操作（`agent_chat`，user 池，manual）；这一轮里每次模型 HTTP 一条子账（models/usage-meter.ts）。
 *   一次模型都没调（规则直接答、点选续跑）的轮次结算为 released，不计次。
 * - 每人每东京日 `AGENT_CHAT_DAILY_LIMIT` 轮，独立计数，不占用户池 10 次总熔断（ai-quota/ledger.ts）。
 * - 只有账本明确说「今天用完了」才拦：这一轮不调用模型，回一句固定的话（界面语言）。
 *   账本不可用（无库、表未迁移、约束还没有新用途、出错、不是所有者）一律照常对话、不记账，留一条告警日志（fail-open）。
 */
import type { AiQuotaGate } from "../../ai-quota/gate";
import { overLimitNotice, overLimitText, type OverLimitNotice } from "../../ai-quota/over-limit";
import { DEFAULT_ACCOUNT_TIER, type AccountTier } from "../../ai-quota/tiers";
import type { ModelCallUsage, ModelUsageMeter } from "../models/usage-meter";

export type AgentChatRound =
  | { kind: "limited"; notice: OverLimitNotice }
  | { kind: "open"; meter: ModelUsageMeter | null; finish(outcome: "succeeded" | "failed"): Promise<void> };

const UNMETERED: AgentChatRound = { finish: async () => undefined, kind: "open", meter: null };

function warn(event: string, detail: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ event, purpose: "agent_chat", ...detail }));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Opens the round's ledger operation. `selection` (a click that resumes a paused request) gets its own key and is never
 * refused: a click is not a new message, and when it makes no model call it is released and not counted.
 */
export async function openAgentChatRound(gate: AiQuotaGate | null | undefined, input: { actorId: string; requestId: string; selection?: string | null; now: Date; tier?: AccountTier }): Promise<AgentChatRound> {
  if (!gate) return UNMETERED;
  const idempotencyKey = `agent-chat:${input.requestId}${input.selection ? `:select:${input.selection}` : ""}`;
  let operationId: string;
  try {
    const reservation = await gate.reserve({ actorId: input.actorId, idempotencyKey, now: input.now, pool: "user", purpose: "agent_chat", takeover: true, tier: input.tier ?? DEFAULT_ACCOUNT_TIER, trigger: "manual" });
    if (reservation.ok === false) {
      if ((reservation.reason === "daily_limit" || reservation.reason === "monthly_limit") && !input.selection) {
        // 2026-11-27 分档：日上限（两档同）或按档的月上限；提示的数字、恢复时间、能否升级都来自账本与 tiers.ts。
        const notice = overLimitNotice({ cap: reservation.cap ?? null, feature: "agent_chat", period: reservation.reason === "daily_limit" ? "day" : "month", retryOn: reservation.retryOn ?? null, tier: input.tier ?? DEFAULT_ACCOUNT_TIER, used: reservation.used ?? null });
        return { kind: "limited", notice };
      }
      warn("agent_chat_ledger_unavailable", { reason: reservation.reason, ...(reservation.limit ? { limit: reservation.limit } : {}) });
      return UNMETERED;
    }
    if (!reservation.owner) {
      warn("agent_chat_ledger_unavailable", { reason: "not_owner", status: reservation.status });
      return UNMETERED;
    }
    operationId = reservation.operationId;
  } catch (error) {
    warn("agent_chat_ledger_unavailable", { error: errorName(error) });
    return UNMETERED;
  }
  const meter: ModelUsageMeter = {
    async begin(call) {
      try {
        return (await gate.beginCall(operationId, call)).callId;
      } catch (error) {
        warn("agent_chat_ledger_call_unmetered", { error: errorName(error) });
        return null;
      }
    },
    async end(callId, usage: ModelCallUsage | null) {
      if (!callId) return;
      await gate.endCall(callId, usage).catch((error: unknown) => warn("agent_chat_ledger_end_failed", { error: errorName(error) }));
    },
  };
  return {
    async finish(outcome) {
      await gate.finish(operationId, outcome).catch((error: unknown) => warn("agent_chat_ledger_finish_failed", { error: errorName(error) }));
    },
    kind: "open",
    meter,
  };
}

/**
 * 超过上限时这一轮的回答（界面语言；朴素，不带感叹号）：写出轮数和恢复时间，free 档月上限还说明 Pro 的上限
 * （features/ai-quota/over-limit.ts，数字取自 tiers.ts）。
 */
export function agentChatLimitText(locale: string | null | undefined, notice: OverLimitNotice): string {
  return overLimitText(locale === "zh" || locale === "en" || locale === "ja" ? locale : "ja", notice);
}

/** 每日上限的那句（测试与旧调用用）。 */
export function agentChatDailyLimitText(locale: string | null | undefined, cap?: number): string {
  return agentChatLimitText(locale, overLimitNotice({ cap: cap ?? null, feature: "agent_chat", period: "day", tier: DEFAULT_ACCOUNT_TIER }));
}
