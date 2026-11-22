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

/**
 * The engine's decisions opened after the port (2026-11-23), each with its own switch ORBIT_AGENT_CONVERSATION_<NAME>
 * (only when ORBIT_AGENT_CONVERSATION is `on`; under shadow they are all shadow, under legacy nothing runs):
 * - world: the engine's World read from the store (conversation/world-read.ts) instead of names only;
 * - pronoun: R27 — a pronoun binds the one person the latest turn that named anyone named (no gender is known: the
 *   engine's own "ask" with that one candidate, not after an idle break);
 * - carry: the merged request's people — a follow-up that goes back to the request before keeps its person, a new
 *   request drops a person the agent carried in without the words naming them;
 * - next: the engine's ask / go.
 * off: not computed; shadow: computed and logged as differences (conversation.shadow), the user gets what legacy gives;
 * on: applied. Under ORBIT_AGENT_EVAL the eval hook's setting `conversation_<name>` overrides the variable.
 */
export type OpenedDecision = "world" | "pronoun" | "carry" | "next";
export type OpenedMode = "off" | "shadow" | "on";
export const OPENED_DECISIONS: readonly OpenedDecision[] = ["world", "pronoun", "carry", "next"];
// Stage B (2026-11-23, eval runs in docs/epics/agent-design/conversation-port.md §5): pronoun on; the others stay shadow.
const OPENED_DEFAULT: Record<OpenedDecision, OpenedMode> = { carry: "shadow", next: "shadow", pronoun: "on", world: "shadow" };

export function openedMode(decision: OpenedDecision, env: Record<string, string | undefined> = process.env): OpenedMode {
  const main = conversationMode(env);
  if (main === "legacy") return "off";
  const override = evalSetting(`conversation_${decision}`);
  const value = (typeof override === "string" ? override : env[`ORBIT_AGENT_CONVERSATION_${decision.toUpperCase()}`])?.trim().toLowerCase();
  const chosen: OpenedMode = value === "off" || value === "shadow" || value === "on" ? value : OPENED_DEFAULT[decision];
  return main === "shadow" && chosen === "on" ? "shadow" : chosen;
}
