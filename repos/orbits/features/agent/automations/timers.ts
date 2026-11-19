/**
 * One-off timers (agent-design AG15; 设计稿 §5.3 "一次性定时器", §5.2 卡片过期; PLANNER 易错边界 9).
 *
 * Kept in the same store as the recurring rules (the due index, kind "timer"): the same fields, no repetition. A timer
 * fires once and is then removed. Firing writes one record through code and never calls a model:
 * - `card_expiry`: a card left waiting past its expiry becomes `expired` (never executed; a click is refused with
 *   CARD_EXPIRED; regenerating gives a new revision that still needs a click). A regenerated card moves its timer.
 * - `wake`: only writes the entry the caller names (AG17's external one-off wake goes through here).
 */
import type { AutomationStorage, DueIndexWriter, DueItem } from "./due-index";

export type AgentTimerPayload =
  | { type: "card_expiry"; actionId: string }
  | { type: "wake"; entry: string; data?: Record<string, unknown> };

export interface AgentTimerInput {
  ownerId: string;
  /** Unique per owner; setting the same key again moves the timer. */
  key: string;
  fireAt: string;
  payload: AgentTimerPayload;
}

export const cardExpiryTimerKey = (actionId: string) => `card-expiry:${actionId}`;

/** Sets (or moves) a one-off timer. Usable inside a transaction (`due`) or on its own (`storage.direct.due`). */
export async function scheduleAgentTimer(due: DueIndexWriter, input: AgentTimerInput, now: string): Promise<void> {
  if (!input.ownerId.trim() || !input.key.trim()) throw new Error("A timer needs an owner and a key.");
  if (!Number.isFinite(Date.parse(input.fireAt))) throw new Error("A timer needs a valid time to fire at.");
  await due.put({ definition: input.payload as unknown as Record<string, unknown>, key: input.key, kind: "timer", nextRunAt: new Date(input.fireAt).toISOString(), ownerId: input.ownerId, status: "active", updatedAt: now, version: 1 });
}

export async function cancelAgentTimer(due: DueIndexWriter, ownerId: string, key: string): Promise<void> {
  await due.remove({ key, kind: "timer", ownerId });
}

/** Sets the timer that closes a card at its expiry (called when a card is frozen or regenerated). */
export async function scheduleCardExpiry(storage: AutomationStorage, input: { ownerId: string; actionId: string; expiresAt: string }, now: string): Promise<void> {
  await scheduleAgentTimer(storage.direct.due, { fireAt: input.expiresAt, key: cardExpiryTimerKey(input.actionId), ownerId: input.ownerId, payload: { actionId: input.actionId, type: "card_expiry" } }, now);
}

export interface AgentTimerHandlers {
  /** Marks the owner's card expired when it is still waiting past its expiry; returns what happened. */
  expireCard(ownerId: string, actionId: string): Promise<"expired" | "unchanged" | "missing">;
  /** Writes the one entry a wake names. */
  wake?(ownerId: string, entry: string, data: Record<string, unknown> | undefined): Promise<void>;
}

export type AgentTimerOutcome = "card_expired" | "card_unchanged" | "card_missing" | "woke" | "unknown";

/** Fires a claimed timer: one record written by code, no model. The caller removes the row afterwards. */
export async function fireAgentTimer(item: DueItem, handlers: AgentTimerHandlers): Promise<AgentTimerOutcome> {
  const payload = item.definition as unknown as AgentTimerPayload;
  if (payload?.type === "card_expiry" && typeof payload.actionId === "string") {
    const outcome = await handlers.expireCard(item.ownerId, payload.actionId);
    return outcome === "expired" ? "card_expired" : outcome === "missing" ? "card_missing" : "card_unchanged";
  }
  if (payload?.type === "wake" && typeof payload.entry === "string" && handlers.wake) {
    await handlers.wake(item.ownerId, payload.entry, payload.data);
    return "woke";
  }
  return "unknown";
}
