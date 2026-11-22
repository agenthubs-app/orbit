import { evalSetting } from "../observability/trace";

/**
 * ORBIT_AGENT_CONVERSATION — the multi-turn understanding engine (conversation lab r07, conversation/impl):
 * - legacy: today's behaviour exactly; the engine never runs and nothing new is kept in the session state;
 * - shadow (default): today's behaviour for the user; the engine runs beside it on every turn and the differences
 *   (references, follow-up class, merged request, ask / go, shelved questions) are logged (conversation.shadow);
 * - on: the engine's decisions drive the agent where they are wired (conversation/apply.ts).
 * Under ORBIT_AGENT_EVAL the eval hook's setting `conversation` overrides the variable (unit tests use it).
 */
export type ConversationMode = "legacy" | "shadow" | "on";

export function conversationMode(env: Record<string, string | undefined> = process.env): ConversationMode {
  const override = evalSetting("conversation");
  const value = (typeof override === "string" ? override : env.ORBIT_AGENT_CONVERSATION)?.trim().toLowerCase();
  return value === "legacy" || value === "on" ? value : "shadow";
}

/** The engine's time budget per turn (ms). It is synchronous: inputs are capped, and a run over budget is discarded. */
export function conversationBudgetMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ORBIT_AGENT_CONVERSATION_BUDGET_MS);
  return Number.isFinite(value) && value >= 10 && value <= 5000 ? value : 400;
}
