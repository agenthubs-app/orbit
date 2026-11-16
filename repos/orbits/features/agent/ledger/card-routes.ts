/**
 * agent-design AG02 — the HTTP side of cards (设计稿附录 D「逻辑接口对应到现有路由」):
 *
 *   GET  /api/agent/ledger/[id]             → readCard: the current revision and per-item state
 *   POST /api/agent/ledger/[id]/transition  → handleCardDecision, for cards with an origin (and
 *                                              for any body that carries the new decision fields)
 *   POST /api/agent/ledger/[id]/regenerate  → handleCardRegenerate: re-issue an expired card
 *
 * Routes only authenticate and map these results onto responses; the runtime decides.
 */
import { agentCardDecisionInputSchema } from "../../../shared/api-schema/agent-v1";
import type { AgentActionPreviewContract, AgentCardDecisionResultContract } from "../../../shared/contract/agent-v1";
import type { AgentActionRecord } from "../runtime/contract";
import { agentCardPreview } from "../runtime/card-view";
import type { AgentRuntimeService } from "../runtime/service";

export interface CardHttpResult {
  status: number;
  body: Record<string, unknown>;
}

const DECISION_FIELDS = ["revision", "payloadHash", "clientDecisionId", "operationId"] as const;

/** A body that speaks the new decision shape, or a transition only the new shape has. */
export function isCardDecisionBody(body: Record<string, unknown>): boolean {
  return DECISION_FIELDS.some((field) => field in body) || body.transition === "mark_done" || body.transition === "abandon";
}

/** New cards (with an origin) take only the new shape; the old route path never decides them. */
export function takesCardDecisions(action: AgentActionRecord | null, body: Record<string, unknown>): boolean {
  return Boolean(action?.origin) || isCardDecisionBody(body);
}

function failureBody(code: string, message: string, reason: string, data?: Record<string, unknown>): Record<string, unknown> {
  return { error: { code, context: { reason }, message, reason }, success: false, ...(data ? { data } : {}) };
}

async function preview(runtime: AgentRuntimeService, actionId: string, now: string): Promise<AgentActionPreviewContract | null> {
  const action = await runtime.getAction(actionId);
  if (!action) return null;
  return agentCardPreview(action, await runtime.getRun(action.runId), now);
}

export async function readCard(input: { runtime: AgentRuntimeService; actionId: string; now?: () => string }): Promise<CardHttpResult> {
  const now = input.now?.() ?? new Date().toISOString();
  const card = await preview(input.runtime, input.actionId, now);
  if (!card) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  return { body: { data: { card }, success: true }, status: 200 };
}

const SETTLING = new Set(["approved", "executing"]);

export async function handleCardDecision(input: {
  runtime: AgentRuntimeService;
  actionId: string;
  body: Record<string, unknown>;
  /** live: execute an accepted confirm or retry right away, as the old confirm did. */
  processNow: boolean;
  workerId: string;
  actorLabel?: string;
  now?: () => string;
  /** How long a click that lost the race waits for the winner's execution to settle. */
  settleMs?: number;
}): Promise<CardHttpResult> {
  const now = () => input.now?.() ?? new Date().toISOString();
  const action = await input.runtime.getAction(input.actionId);
  if (!action) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const parsed = agentCardDecisionInputSchema.safeParse(input.body);
  if (!parsed.success) {
    return { body: failureBody("VALIDATION_ERROR", "This card takes button decisions only: transition, revision, payloadHash and clientDecisionId (operationId for an item under review).", "DECISION_FIELDS_REQUIRED"), status: 400 };
  }
  if (!action.origin || !input.runtime.decideAction) {
    return { body: failureBody("VALIDATION_ERROR", "This entry predates button decisions; use the ledger transitions.", "LEGACY_CARD"), status: 400 };
  }
  const decision = await input.runtime.decideAction({
    actionId: input.actionId,
    actorLabel: input.actorLabel,
    clientDecisionId: parsed.data.clientDecisionId,
    decision: parsed.data.transition,
    payloadHash: parsed.data.payloadHash,
    revision: parsed.data.revision,
    ...(parsed.data.operationId ? { operationId: parsed.data.operationId } : {}),
  });
  if (!decision) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const executes = decision.accepted && !decision.replayed && (decision.decision === "confirm" || decision.decision === "retry" || decision.decision === "mark_done");
  if (input.processNow && executes) {
    await input.runtime.processOutbox({ actionId: input.actionId, limit: 20, workerId: input.workerId });
  }
  if (decision.outcome === "already_decided" || decision.replayed) {
    // The click that lost (or a resend) shows the same result as the one that won.
    const deadline = Date.now() + (input.settleMs ?? 5_000);
    for (;;) {
      const current = await input.runtime.getAction(input.actionId);
      if (!current || !SETTLING.has(current.status) || Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const card = await preview(input.runtime, input.actionId, now());
  const data = { card, decision: decision as AgentCardDecisionResultContract };
  if (decision.outcome === "refused") {
    return { body: failureBody("CONFLICT", decision.message, decision.reason ?? "CARD_REFUSED", data), status: 409 };
  }
  return { body: { data, success: true }, status: 200 };
}

/** AG06: POST /api/agent/ledger/[id]/edit — take one item off a waiting card (revision, payloadHash, removeOperationId). */
export async function handleCardEdit(input: { runtime: AgentRuntimeService; actionId: string; body: Record<string, unknown>; now?: () => string }): Promise<CardHttpResult> {
  if (!input.runtime.editCard) return { body: failureBody("SERVICE_UNAVAILABLE", "Cards cannot be edited here.", "UNSUPPORTED"), status: 503 };
  const action = await input.runtime.getAction(input.actionId);
  if (!action?.origin) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const { revision, payloadHash, removeOperationId } = input.body;
  if (!Number.isInteger(revision) || typeof payloadHash !== "string" || typeof removeOperationId !== "string" || !payloadHash || !removeOperationId) {
    return { body: failureBody("VALIDATION_ERROR", "Taking an item off a card needs revision, payloadHash and removeOperationId.", "EDIT_FIELDS_REQUIRED"), status: 400 };
  }
  const result = await input.runtime.editCard({ actionId: input.actionId, payloadHash, removeOperationId, revision: revision as number });
  if (!result) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const card = await preview(input.runtime, input.actionId, input.now?.() ?? new Date().toISOString());
  if (result.outcome === "refused") return { body: failureBody("CONFLICT", result.message, result.reason ?? "CARD_REFUSED", { card, edit: result }), status: 409 };
  return { body: { data: { card, edit: result }, success: true }, status: 200 };
}

export async function handleCardRegenerate(input: { runtime: AgentRuntimeService; actionId: string; now?: () => string }): Promise<CardHttpResult> {
  if (!input.runtime.regenerateCard) return { body: failureBody("SERVICE_UNAVAILABLE", "Cards cannot be regenerated here.", "UNSUPPORTED"), status: 503 };
  const action = await input.runtime.getAction(input.actionId);
  if (!action?.origin) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const result = await input.runtime.regenerateCard({ actionId: input.actionId });
  if (!result) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const card = await preview(input.runtime, input.actionId, input.now?.() ?? new Date().toISOString());
  if (result.outcome === "refused") return { body: failureBody("CONFLICT", result.message, result.reason ?? "CARD_NOT_EXPIRED", { card, regeneration: result }), status: 409 };
  return { body: { data: { card, regeneration: result }, success: true }, status: 200 };
}
