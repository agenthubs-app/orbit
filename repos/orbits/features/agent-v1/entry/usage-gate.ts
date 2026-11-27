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
import type { ModelCallUsage, ModelUsageMeter } from "../models/usage-meter";

export type AgentChatRound =
  | { kind: "limited"; retryOn: string | null }
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
export async function openAgentChatRound(gate: AiQuotaGate | null | undefined, input: { actorId: string; requestId: string; selection?: string | null; now: Date }): Promise<AgentChatRound> {
  if (!gate) return UNMETERED;
  const idempotencyKey = `agent-chat:${input.requestId}${input.selection ? `:select:${input.selection}` : ""}`;
  let operationId: string;
  try {
    const reservation = await gate.reserve({ actorId: input.actorId, idempotencyKey, now: input.now, pool: "user", purpose: "agent_chat", takeover: true, trigger: "manual" });
    if (reservation.ok === false) {
      if (reservation.reason === "daily_limit" && !input.selection) return { kind: "limited", retryOn: reservation.retryOn ?? null };
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

/** 超过每日上限时这一轮的回答（界面语言；朴素，不带感叹号）。 */
export const AGENT_CHAT_DAILY_LIMIT_TEXT: Readonly<Record<"zh" | "ja" | "en", string>> = {
  en: "You have used up today's conversations. You can continue tomorrow. Everything you already have can still be viewed as usual.",
  ja: "本日の会話回数の上限に達しました。明日また続けられます。これまでの内容はいつもどおりご覧いただけます。",
  zh: "今天的对话次数已经用完，明天可以继续。已有的内容照常可以查看。",
};

export function agentChatDailyLimitText(locale: string | null | undefined): string {
  return locale === "ja" || locale === "en" || locale === "zh" ? AGENT_CHAT_DAILY_LIMIT_TEXT[locale] : AGENT_CHAT_DAILY_LIMIT_TEXT.ja;
}
