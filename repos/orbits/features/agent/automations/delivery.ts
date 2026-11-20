/**
 * Delivering a run's result to the in-app inbox (agent-design AG15; 设计稿 §5.3; PLANNER 易错边界 4/5/6).
 *
 * The result and "still to deliver" are stored together when the period is computed (runs.ts and a `delivery` row of
 * the due index). Delivering reads only that stored result: a retry writes the inbox entry again from it — no record is
 * read for content and no model is called. Before every attempt the server looks again at the rule (still there, not
 * paused, the same version) and at the notes it references (still readable by the owner); if not, the delivery is
 * called off and the period stays "worked out, not sent". The inbox entry's key is made from the rule, its version, the
 * period and the kind of entry, so a replay never makes a second entry. Nothing here pushes: `notify.push` is only
 * recorded on the run for AG16.
 */
import type { InboxNotificationDTO } from "../../../shared/contract/inbox-notifications";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import { emitTrace, takeEvalFault } from "../../agent-v1/observability/trace";
import type { AgentAutomation } from "./contract";
import type { AutomationStorage } from "./due-index";
import { createAutomationRunStore, pushCalledOff, pushDueKeyOf, type AgentAutomationRunRecord } from "./runs";
import { runInboxTitle } from "./task-view";

/** AG16: how long after the inbox delivery the reminder's own row comes due if the pass did not send it at once. */
const PUSH_ROW_DELAY_MS = 5 * 60_000;

export type RuleInboxWriter = (entry: InboxNotificationUpsert) => Promise<Pick<InboxNotificationDTO, "id">>;

export interface RuleDeliveryDeps {
  storage: AutomationStorage;
  /** The inbox's own producer write (idempotent by actor and semantic key); null: no inbox is configured. */
  inbox: RuleInboxWriter | null;
  /** Which of these typed refs ("memo:<id>") the owner may still read now. Ids only. */
  visible?(ownerId: string, refs: readonly string[]): Promise<Set<string>>;
  now(): string;
}

const REASON_LIMIT = 4_000;

/** The inbox entry of a run, built from the stored run only. */
export function inboxEntryOf(run: AgentAutomationRunRecord): InboxNotificationUpsert {
  const scheduledAt = new Date(run.scheduledAt).toISOString();
  const text = run.text.length > REASON_LIMIT ? `${run.text.slice(0, REASON_LIMIT - 1)}…` : run.text;
  const excerpt = (run.text.split("\n").find((line) => line.trim()) ?? run.title).slice(0, 300);
  const object = { id: run.automationId, name: run.title.slice(0, 200) };
  if (run.cardId) {
    return {
      actions: ["read"],
      actorId: run.ownerId,
      ...(run.cardExpiresAt ? { expiresAt: run.cardExpiresAt } : {}),
      kind: "suggestion",
      object,
      occurredAt: run.computedAt,
      origin: "automation",
      reason: text,
      semanticKey: `agent-rule-card:${run.cardId}`,
      sources: [{ excerpt, objectId: run.automationId, occurredAt: scheduledAt, readAt: run.computedAt, sourceId: run.cardId, sourceKind: "agent_card", sourceRevision: `rule:v${run.version}:${scheduledAt}` }],
      target: { href: null, id: run.cardId, kind: "card", status: "available" },
      title: runInboxTitle(run),
    };
  }
  const attention = run.outcome === "needs_attention" && run.attention;
  return {
    actions: ["read", "dismiss"],
    actorId: run.ownerId,
    kind: "update",
    object,
    occurredAt: run.computedAt,
    origin: "automation",
    reason: text,
    // One entry per rule version, period and kind; a note that cannot be read is said once per version, not every period.
    semanticKey: attention ? `agent-rule-attention:${run.automationId}:v${run.version}:${attention.reference?.id ?? attention.reason}` : `agent-rule-result:${run.automationId}:v${run.version}:${scheduledAt}`,
    sources: [{ excerpt, objectId: run.automationId, occurredAt: scheduledAt, readAt: run.computedAt, sourceId: run.runId, sourceKind: "automation_result", sourceRevision: `v${run.version}` }],
    target: { href: null, id: run.automationId, kind: "automation", status: "available" },
    title: runInboxTitle(run),
  };
}

/** 5 min, 10, 20 … up to 6 hours between attempts (a pass runs about every 10 minutes). */
export function deliveryBackoffMs(attempts: number): number {
  return Math.min(5 * 60_000 * 2 ** Math.max(0, attempts - 1), 6 * 3_600_000);
}

export type RuleDeliveryState = "delivered" | "pending" | "cancelled" | "none";

/**
 * One delivery attempt of a run. Returns the run's delivery state afterwards. Never recomputes the result.
 */
export async function deliverRun(deps: RuleDeliveryDeps, ref: { ownerId: string; runId: string }): Promise<RuleDeliveryState> {
  const { storage } = deps;
  const dueRef = { key: ref.runId, kind: "delivery" as const, ownerId: ref.ownerId };
  const runs = createAutomationRunStore(storage.direct.store, storage.workspaceId);
  const run = await runs.get(ref.ownerId, ref.runId);
  if (!run || run.delivery.inbox.state !== "pending") {
    await storage.direct.due.remove(dueRef);
    return run?.delivery.inbox.state ?? "none";
  }
  const now = deps.now();
  const finish = async (next: AgentAutomationRunRecord, again: string | null) => storage.transaction(async (tx) => {
    await createAutomationRunStore(tx.store, storage.workspaceId).save(next);
    if (again) await tx.due.put({ definition: { automationId: run.automationId, version: run.version }, key: ref.runId, kind: "delivery", nextRunAt: again, ownerId: ref.ownerId, status: "active", updatedAt: now, version: run.version });
    else await tx.due.remove(dueRef);
    // AG16: the result is in the inbox and its reminder is still to go out — the reminder's row is written in the same
    // transaction, so a pass that dies right here does not lose it (the dispatcher sends at once; this row is the net).
    if (next.delivery.inbox.state === "delivered" && next.delivery.push.state === "pending") {
      await tx.due.put({ definition: { automationId: run.automationId, channel: "push", version: run.version }, key: pushDueKeyOf(ref.runId), kind: "delivery", nextRunAt: new Date(Date.parse(now) + PUSH_ROW_DELAY_MS).toISOString(), ownerId: ref.ownerId, status: "active", updatedAt: now, version: run.version });
    }
  });

  // Looked at again before every send: the rule's state and owner, and the owner's right to read what it references.
  const ruleRow = await storage.direct.due.get({ key: run.automationId, kind: "rule", ownerId: ref.ownerId });
  let cancel: NonNullable<AgentAutomationRunRecord["delivery"]["inbox"]["cancelReason"]> | null = !ruleRow ? "rule_removed" : ruleRow.status === "paused" ? "rule_paused" : ruleRow.version !== run.version ? "rule_changed" : null;
  if (!cancel && run.outcome !== "needs_attention" && deps.visible) {
    const references = ((ruleRow!.definition as unknown as AgentAutomation).rule?.references ?? []).map((reference) => `${reference.type}:${reference.id}`);
    if (references.length) {
      // A permission check by id only (does the owner still have this note?): no content is read and nothing is computed.
      emitTrace({ automationId: run.automationId, note: "before sending: the rule's state and the owner's right to the referenced notes are checked again, by id only; no record content is read and no model is called", references, runId: run.runId, type: "delivery.recheck" });
      const visible = await deps.visible(ref.ownerId, references);
      if (references.some((reference) => !visible.has(reference))) cancel = "reference_unreadable";
    }
  }
  if (cancel) {
    // AG16: a reminder that was waiting for this result is called off with it.
    await finish({ ...run, delivery: { inbox: { ...run.delivery.inbox, cancelReason: cancel, lastAttemptAt: now, state: "cancelled" }, push: pushCalledOff(run.delivery.push, now) } }, null);
    emitTrace({ automationId: run.automationId, outcome: "cancelled", reason: cancel, runId: run.runId, scheduledAt: run.scheduledAt, type: "notify.inbox" });
    return "cancelled";
  }

  const attempts = run.delivery.inbox.attempts + 1;
  try {
    if (takeEvalFault("notify.inbox")) throw new Error("agent-eval simulated failure (notify.inbox)");
    if (!deps.inbox) throw new Error("The in-app inbox is not configured.");
    const written = await deps.inbox(inboxEntryOf(run));
    await finish({
      ...run,
      delivery: { ...run.delivery, inbox: { attempts, deliveredAt: now, inboxId: written.id, lastAttemptAt: now, state: "delivered" } },
      outcome: run.outcome === "undelivered" ? "delivered" : run.outcome,
    }, null);
    emitTrace({ attempts, automationId: run.automationId, inboxId: written.id, items: run.items.map((item) => item.ref), outcome: "written", runId: run.runId, scheduledAt: run.scheduledAt, type: "notify.inbox", ...(run.cardId ? { cardId: run.cardId } : {}) });
    return "delivered";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ ...run, delivery: { ...run.delivery, inbox: { ...run.delivery.inbox, attempts, lastAttemptAt: now, lastError: message.slice(0, 500), state: "pending" } } }, new Date(Date.parse(now) + deliveryBackoffMs(attempts)).toISOString());
    emitTrace({ attempts, automationId: run.automationId, error: message, outcome: "failed", runId: run.runId, scheduledAt: run.scheduledAt, type: "notify.inbox" });
    return "pending";
  }
}
