/**
 * The due-time dispatcher (agent-design AG15; 设计稿 §5.3; PLANNER 易错边界 2/3/4/7/9).
 *
 * One dispatcher for every account, run by the maintenance pass (about every 10 minutes) and by the internal dispatch
 * route. It claims due rows from the index — rule periods, pending deliveries, one-off timers — and handles each under
 * its own owner:
 * - a rule's period is computed once: its history record's id is workspace + owner + rule + version + planned time; a
 *   retry with the same key finds the record and only goes on to delivery;
 * - after an interruption only the latest due period is run; the number passed over is written on that run;
 * - the run record, its pending delivery and the rule's next period are one transaction;
 * - a period that keeps failing is tried three times, then written to the history as failed;
 * - the rule record itself is never rewritten by a run (its next period lives in the index).
 */
import { emitTrace, runWithTraceContext } from "../../agent-v1/observability/trace";
import {
  agentAutomationLocalDay,
  agentAutomationNotify,
  agentAutomationScheduleTimeZone,
  latestDueAgentRulePeriod,
  nextAgentRulePeriod,
  type AgentAutomation,
} from "./contract";
import { deliverRun, type RuleDeliveryDeps } from "./delivery";
import type { AutomationStorage, DueItem } from "./due-index";
import { pushRun, type RulePushDeps } from "./push";
import type { RulePeriodResult } from "./run-rule";
import { automationRunId, createAutomationRunStore, runIdOfPushDueKey, toldRefsOf, type AgentAutomationRunRecord } from "./runs";
import { fireAgentTimer, type AgentTimerHandlers } from "./timers";

export const DISPATCH_LEASE_MS = 5 * 60_000;
export const DISPATCH_PERIOD_ATTEMPTS = 3;
const TIMER_ATTEMPTS = 5;

export interface AutomationDispatchDeps {
  storage: AutomationStorage;
  /** Computes one period of a rule under its owner's authorization (run-rule.ts). */
  runPeriod(input: { automation: AgentAutomation; ownerId: string; scheduledAt: string; told: ReadonlySet<string>; previousCardId: string | null }): Promise<RulePeriodResult>;
  delivery: RuleDeliveryDeps;
  /** AG16: the reminder of a task whose switch is on. Not given: no device and no channel (a wanted reminder is recorded as not arrived). */
  push?: RulePushDeps;
  timers: AgentTimerHandlers;
  now(): string;
  leaseId?(): string;
}

export interface AutomationDispatchSummary {
  claimed: number;
  periods: number;
  delivered: number;
  noMatch: number;
  undelivered: number;
  needsAttention: number;
  failed: number;
  skippedPeriods: number;
  /** Waiting deliveries taken up in this pass; of them, how many were sent and how many cancelled (not sent). */
  deliveriesRetried: number;
  deliveriesSent?: number;
  deliveriesCancelled?: number;
  timersFired: number;
  /** AG16: reminder rounds run in this pass, and how many of them ended with the reminder delivered. */
  pushRounds?: number;
  pushesDelivered?: number;
}

const emptySummary = (): AutomationDispatchSummary => ({ claimed: 0, delivered: 0, deliveriesCancelled: 0, deliveriesRetried: 0, deliveriesSent: 0, failed: 0, needsAttention: 0, noMatch: 0, periods: 0, pushRounds: 0, pushesDelivered: 0, skippedPeriods: 0, timersFired: 0, undelivered: 0 });

/**
 * AG16: one round of a run's reminder. Called right after its result reached the inbox, and for the reminder's own row
 * of the due index (a retry, a receipt check, or the safety row). A reminder that fails never fails the pass, the run
 * or the task: the result is in the inbox already.
 */
async function pushRound(deps: AutomationDispatchDeps, ownerId: string, runId: string, summary: AutomationDispatchSummary): Promise<void> {
  const push: RulePushDeps = deps.push ?? { channel: null, devices: () => null, now: deps.now, storage: deps.storage };
  try {
    summary.pushRounds = (summary.pushRounds ?? 0) + 1;
    if ((await pushRun(push, { ownerId, runId })) === "delivered") summary.pushesDelivered = (summary.pushesDelivered ?? 0) + 1;
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), runId, type: "error", where: "automation.push" });
  }
}

export async function dispatchDueAutomations(deps: AutomationDispatchDeps, input: { limit?: number; deadline?: number } = {}): Promise<AutomationDispatchSummary> {
  const summary = emptySummary();
  const batch = Math.min(Math.max(1, input.limit ?? 20), 100);
  // A pass handles what was due when it started and what that makes due at once; it never loops on its own retries.
  const seen = new Set<string>();
  for (let round = 0; round < 50; round += 1) {
    if (input.deadline !== undefined && Date.now() >= input.deadline) break;
    const now = deps.now();
    const leaseId = deps.leaseId?.() ?? crypto.randomUUID();
    const claimed = (await deps.storage.claimDue({ leaseId, leaseMs: DISPATCH_LEASE_MS, limit: batch, now })).filter((item) => !seen.has(JSON.stringify([item.ownerId, item.kind, item.key])));
    if (!claimed.length) break;
    summary.claimed += claimed.length;
    for (const item of claimed) {
      seen.add(JSON.stringify([item.ownerId, item.kind, item.key]));
      try {
        if (item.kind === "rule") await runRuleItem(deps, item, leaseId, now, summary);
        else if (item.kind === "delivery") {
          const pushOf = runIdOfPushDueKey(item.key);
          if (pushOf) {
            // AG16: the reminder's own row — only the reminder; the result is not delivered or worked out again.
            await pushRound(deps, item.ownerId, pushOf, summary);
            continue;
          }
          summary.deliveriesRetried += 1;
          const state = await deliverRun(deps.delivery, { ownerId: item.ownerId, runId: item.key });
          if (state === "delivered") {
            summary.delivered += 1;
            summary.deliveriesSent = (summary.deliveriesSent ?? 0) + 1;
            await pushRound(deps, item.ownerId, item.key, summary);
          } else if (state === "cancelled") summary.deliveriesCancelled = (summary.deliveriesCancelled ?? 0) + 1;
        } else await fireTimerItem(deps, item, now, summary);
      } catch (error) {
        // One row's failure never stops the pass; the row stays leased and is taken again when the lease ends.
        emitTrace({ error: error instanceof Error ? error.message : String(error), item: { key: item.key, kind: item.kind }, type: "error", where: "automation.dispatch" });
        summary.failed += 1;
      }
    }
    if (claimed.length < batch) break;
  }
  return summary;
}

async function fireTimerItem(deps: AutomationDispatchDeps, item: DueItem, now: string, summary: AutomationDispatchSummary): Promise<void> {
  try {
    const outcome = await fireAgentTimer(item, deps.timers);
    emitTrace({ key: item.key, outcome, type: "timer.fired" });
    summary.timersFired += 1;
    await deps.storage.direct.due.remove(item);
  } catch (error) {
    const attempts = Number((item.definition as { attempts?: number }).attempts ?? 0) + 1;
    emitTrace({ attempts, error: error instanceof Error ? error.message : String(error), key: item.key, type: "timer.failed" });
    if (attempts >= TIMER_ATTEMPTS) await deps.storage.direct.due.remove(item);
    else await deps.storage.direct.due.put({ ...item, definition: { ...item.definition, attempts }, nextRunAt: new Date(Date.parse(now) + 10 * 60_000).toISOString(), updatedAt: now });
  }
}

async function runRuleItem(deps: AutomationDispatchDeps, item: DueItem, leaseId: string, now: string, summary: AutomationDispatchSummary): Promise<void> {
  const { storage } = deps;
  const automation = item.definition as unknown as AgentAutomation & { dispatchAttempts?: number };
  const ref = { key: item.key, kind: "rule" as const, ownerId: item.ownerId };
  if (automation.trigger?.kind !== "schedule" || !item.nextRunAt) {
    await storage.direct.due.settle(ref, leaseId, { nextRunAt: null, updatedAt: now });
    return;
  }
  const schedule = automation.trigger.schedule;
  const validUntil = automation.rule?.validUntil ?? null;
  const due = latestDueAgentRulePeriod(schedule, validUntil, item.nextRunAt, now);
  if (!due) {
    // Past its last valid day (or not due after all): nothing more to run.
    await storage.direct.due.settle(ref, leaseId, { nextRunAt: nextAgentRulePeriod(schedule, validUntil, now), updatedAt: now });
    return;
  }
  const runId = automationRunId({ automationId: automation.automationId, ownerId: item.ownerId, scheduledAt: due.scheduledAt, version: item.version, workspaceId: storage.workspaceId });
  const runs = createAutomationRunStore(storage.direct.store, storage.workspaceId);
  let run = await runs.get(item.ownerId, runId);
  const next = nextAgentRulePeriod(schedule, validUntil, due.scheduledAt);
  if (!run) {
    // AG16: a version made by changing the reminder switch alone keeps what earlier versions told (rule.toldFromVersion).
    const toldFrom = Math.min(item.version, Number(automation.rule?.toldFromVersion ?? item.version));
    const history = (await runs.list(item.ownerId, automation.automationId, 200)).filter((earlier) => earlier.version >= toldFrom && earlier.version <= item.version);
    let result: RulePeriodResult;
    try {
      result = await runWithTraceContext({ requestId: `rule-run:${runId}` }, () => deps.runPeriod({
        automation,
        ownerId: item.ownerId,
        previousCardId: history.find((earlier) => earlier.cardId)?.cardId ?? null,
        scheduledAt: due.scheduledAt,
        told: toldRefsOf(history),
      }));
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error), items: [], outcome: "failed", text: "" };
    }
    if (result.outcome === "failed") {
      const attempts = Number(automation.dispatchAttempts ?? 0) + 1;
      emitTrace({ attempts, automationId: automation.automationId, error: result.error ?? null, scheduledAt: due.scheduledAt, type: "rule.period_failed" });
      if (attempts < DISPATCH_PERIOD_ATTEMPTS) {
        // Tried again at the next pass, with the same period key.
        await storage.direct.due.put({ ...item, definition: { ...automation, dispatchAttempts: attempts } as unknown as Record<string, unknown>, updatedAt: now });
        return;
      }
    }
    // A note that cannot be read is said once per rule version; later periods only write the history line.
    const saidBefore = result.outcome === "needs_attention" && history.some((earlier) => earlier.outcome === "needs_attention" && earlier.attention?.reference?.id === result.attention?.reference?.id && earlier.delivery.inbox.state !== "cancelled");
    const pending = result.outcome === "computed" || (result.outcome === "needs_attention" && !saidBefore);
    const notify = agentAutomationNotify(automation);
    const record: AgentAutomationRunRecord = {
      automationId: automation.automationId,
      computeAttempts: Number(automation.dispatchAttempts ?? 0) + 1,
      computedAt: now,
      delivery: {
        inbox: { attempts: 0, state: pending ? "pending" : "none" },
        // AG16 sends; here it is only recorded that this rule version asked for a push.
        push: { attempts: 0, state: pending && notify.push && result.outcome === "computed" ? "pending" : "not_requested" },
      },
      items: result.items,
      // The language the result was written in (a saved reply-language rule can differ from the task's): the run keeps it,
      // and the reminder that announces the result speaks it (coordinator's decision 6, 2026-11-20).
      locale: result.language ?? automation.rule?.locale ?? "zh",
      notify,
      outcome: result.outcome === "computed" ? "undelivered" : result.outcome,
      ownerId: item.ownerId,
      runId,
      scheduledAt: due.scheduledAt,
      skipped: due.skipped,
      ...(due.skippedAt.length ? { skippedDays: due.skippedAt.map((instant) => agentAutomationLocalDay(instant, agentAutomationScheduleTimeZone(schedule))) } : {}),
      text: result.text,
      title: automation.title,
      version: item.version,
      ...(result.attention ? { attention: result.attention } : {}),
      ...(result.cardId ? { cardId: result.cardId } : {}),
      ...(result.cardExpiresAt ? { cardExpiresAt: result.cardExpiresAt } : {}),
      ...(result.coverage ? { coverage: result.coverage } : {}),
      ...(result.detail ? { detail: result.detail } : {}),
      ...(result.error ? { error: result.error.slice(0, 500) } : {}),
    };
    // The result, what is still to be delivered, and the rule's next period: one transaction.
    const inserted = await storage.transaction(async (tx) => {
      const stored = await createAutomationRunStore(tx.store, storage.workspaceId).insert(record);
      if (stored && pending) await tx.due.put({ definition: { automationId: automation.automationId, version: item.version }, key: runId, kind: "delivery", nextRunAt: now, ownerId: item.ownerId, status: "active", updatedAt: now, version: item.version });
      // The next period starts with a clean count of tries.
      if (automation.dispatchAttempts) {
        const { dispatchAttempts: _tries, ...clean } = automation;
        await tx.due.put({ definition: clean as unknown as Record<string, unknown>, key: item.key, kind: "rule", nextRunAt: next, ownerId: item.ownerId, status: item.status, updatedAt: now, version: item.version });
      } else await tx.due.settle(ref, leaseId, { nextRunAt: next, updatedAt: now });
      return stored;
    });
    // Another dispatcher computed this period first: its record stands; this result is dropped.
    run = inserted ?? (await runs.get(item.ownerId, runId));
    if (!run) return;
    if (inserted) {
      summary.periods += 1;
      summary.skippedPeriods += due.skipped;
      emitTrace({ automationId: automation.automationId, listed: record.items.map((entry) => entry.ref), outcome: record.outcome, ownerId: item.ownerId, runId, scheduledAt: due.scheduledAt, skipped: due.skipped, type: "rule.run", version: item.version });
    }
  } else {
    // Computed before (a retry with the same key): no reading, no model — only the schedule moves on.
    await storage.direct.due.settle(ref, leaseId, { nextRunAt: next, updatedAt: now });
  }
  let outcome = run.outcome;
  if (run.delivery.inbox.state === "pending") {
    const state = await deliverRun(deps.delivery, { ownerId: item.ownerId, runId });
    if (state === "delivered" && outcome === "undelivered") outcome = "delivered";
    // AG16: the result is in the inbox; a task whose reminder is on gets its one reminder now.
    if (state === "delivered" && run.delivery.push.state === "pending") await pushRound(deps, item.ownerId, runId, summary);
  }
  if (outcome === "delivered") summary.delivered += 1;
  else if (outcome === "no_match") summary.noMatch += 1;
  else if (outcome === "undelivered") summary.undelivered += 1;
  else if (outcome === "needs_attention") summary.needsAttention += 1;
  else summary.failed += 1;
}
