/**
 * The dispatcher on the product's own services (agent-design AG15): the due index and run history in the configured
 * database, the owner's records through the agent's read adapters, the judgment model, each owner's own card ledger,
 * and the in-app inbox. Used by the maintenance task and by the internal dispatch route; it needs no client and no
 * account in the request.
 */
import { timingSafeEqual } from "node:crypto";

import { configuredRecordAccess } from "../../agent-v1/domains/configured";
import { emitTrace } from "../../agent-v1/observability/trace";
import { createConfiguredInboxRuntime } from "../../notifications/inbox-record-service-factory";
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { createOrbitAgentRuntimeService } from "../runtime/service-factory";
import { dispatchDueAutomations, type AutomationDispatchDeps, type AutomationDispatchSummary } from "./dispatcher";
import { configuredRulePushDeps } from "./push-configured";
import { configuredRuleRecall } from "./recall-seam";
import { runRulePeriod, type RuleCardAccess } from "./run-rule";
import { configuredAutomationStorage } from "./service-factory";

function cardsFor(ownerId: string): RuleCardAccess {
  const runtime = () => createOrbitAgentRuntimeService("live", { actorId: ownerId });
  return {
    async freeze(input) {
      const service = runtime();
      if (!service.freezeCard) return null;
      const frozen = await service.freezeCard(input);
      const action = frozen.action;
      if (!action) return null;
      return { actionId: action.actionId, preview: action.operations.map((operation) => operation.preview).filter(Boolean).join("\n") || action.preview, ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}) };
    },
    async supersede(actionId, by) {
      await runtime().expireCard?.({ actionId, reason: "superseded", ...(by ? { by } : {}) });
    },
  };
}

/** Null when the database is not configured (the maintenance task then reports `skipped`). */
export function configuredAutomationDispatchDeps(now: () => string = () => new Date().toISOString()): AutomationDispatchDeps | null {
  const storage = configuredAutomationStorage("live");
  const records = configuredRecordAccess();
  if (!storage || !records) return null;
  const inbox = createConfiguredInboxRuntime();
  const judgment = { apiKey: process.env.ORBIT_GEMINI_DECISION_API_KEY?.trim() || null };
  const recall = configuredRuleRecall();
  return {
    delivery: {
      inbox: inbox ? (entry) => inbox.service.upsert(entry) : null,
      now,
      storage,
      visible: (ownerId, refs) => records.visible(ownerId, refs),
    },
    now,
    // AG16: the reminder of a task whose own switch is on — the owner's phones and browsers, through Expo and Web Push.
    push: configuredRulePushDeps(storage, now),
    runPeriod: (input) => runRulePeriod({ cards: cardsFor(input.ownerId), judgment, now, recall, records, workspaceId: storage.workspaceId }, input),
    storage,
    timers: {
      async expireCard(ownerId, actionId) {
        const result = await createOrbitAgentRuntimeService("live", { actorId: ownerId }).expireCard?.({ actionId, reason: "timer" });
        return !result ? "missing" : result.outcome;
      },
      async wake(ownerId, entry, data) {
        // One entry record, written by code; whoever set the timer reads it (AG17 connects its own handler here).
        emitTrace({ data: data ?? null, entry, ownerId, type: "timer.wake" });
      },
    },
  };
}

export async function runConfiguredAutomationDispatch(input: { limit?: number; deadline?: number } = {}): Promise<AutomationDispatchSummary | null> {
  const deps = configuredAutomationDispatchDeps();
  return deps ? dispatchDueAutomations(deps, input) : null;
}

/** The maintenance pass's task: scheduled rules, pending deliveries and one-off timers of every account. */
export function createAutomationDispatchMaintenanceTask(): MaintenanceTask {
  return {
    name: "agent_automation_dispatch",
    async run(context) {
      const summary = await runConfiguredAutomationDispatch({ deadline: context.deadline });
      if (!summary) return { skipped: "database_unconfigured" };
      return { ...summary };
    },
  };
}

/**
 * The internal dispatch entry (POST /api/internal/agent/automations): `Authorization: Bearer $CRON_SECRET`, compared in
 * constant time, at least 32 characters; no account in the request, no parameters. The same dispatch the maintenance
 * pass runs.
 */
export async function handleAutomationDispatchRequest(request: Request, run: () => Promise<AutomationDispatchSummary | null> = () => runConfiguredAutomationDispatch(), secret = process.env.CRON_SECRET?.trim()): Promise<Response> {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { headers, status: 401 });
  if (request.headers.get("x-orbit-actor-id") || new URL(request.url).searchParams.size > 0) {
    return Response.json({ error: { code: "DISPATCH_PARAMETERS_FORBIDDEN" } }, { headers, status: 400 });
  }
  try {
    const dispatch = await run();
    if (!dispatch) return Response.json({ error: { code: "DISPATCH_UNAVAILABLE" } }, { headers, status: 503 });
    return Response.json({ data: { dispatch } }, { headers, status: 200 });
  } catch {
    return Response.json({ error: { code: "DISPATCH_UNAVAILABLE" } }, { headers, status: 503 });
  }
}
