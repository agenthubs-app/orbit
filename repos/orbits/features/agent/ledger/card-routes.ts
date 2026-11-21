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
import { isProposalsPausedError, pausedWords, PROPOSALS_PAUSED } from "../../agent-v1/rollout/rollback";

/** AG18 rollback: a call that would make a new revision of a card is refused while proposals are paused. */
async function pausedOr<T>(action: AgentActionRecord, run: () => Promise<T>): Promise<T | CardHttpResult> {
  try {
    return await run();
  } catch (error) {
    if (!isProposalsPausedError(error)) throw error;
    return { body: failureBody("CONFLICT", pausedWords(action.locale).click, PROPOSALS_PAUSED), status: 409 };
  }
}

const isHttpResult = (value: unknown): value is CardHttpResult => typeof value === "object" && value !== null && "status" in value && "body" in value;

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

/** AG06 repair 1: called when a card got a new revision (edited, content changed, regenerated) with its new preview. */
export type CardRevisedHook = (card: AgentActionPreviewContract) => Promise<void>;

/**
 * The card changed (a new revision) or may have changed state (a decision): the hook brings the request's document
 * up to date (AG07: it compares state as well as revision, and does nothing when nothing changed).
 */
async function notifyRevised(hook: CardRevisedHook | undefined, _before: number, card: AgentActionPreviewContract | null): Promise<void> {
  if (!hook || !card) return;
  await hook(card).catch(() => undefined);
}

const RECEIPT_WORDS: Record<"zh" | "ja" | "en", Record<string, string> & { lead: string; join: string }> = {
  en: { abandoned: "given up", failed: "could not be done (it will not be retried)", join: "; ", lead: "Result: ", needs_review: "outcome unknown, please check it", pending: "not done yet (it will be retried)", skipped: "skipped, because the item it waits for did not succeed", succeeded: "done", user_confirmed: "marked done by you" },
  ja: { abandoned: "取りやめ", failed: "完了できませんでした（自動では再試行しません）", join: "、", lead: "結果：", needs_review: "結果が不明です。ご確認ください", pending: "まだ完了していません（再試行します）", skipped: "先に行う項目が完了しなかったため、実行していません", succeeded: "完了", user_confirmed: "ご判断で完了扱い" },
  zh: { abandoned: "已放弃", failed: "没能完成（不会自动重试）", join: "；", lead: "执行结果：", needs_review: "结果不确定，请你核对", pending: "还没完成（会再试）", skipped: "因为它要等的那一项没成功，没有执行", succeeded: "已完成", user_confirmed: "已按你的判断标为完成" },
};

/** One sentence, item by item, from the card's own receipts (never "all done" when one failed). */
export function receiptSummary(card: AgentActionPreviewContract, locale: string | undefined): string {
  const words = RECEIPT_WORDS[locale === "ja" || locale === "en" ? locale : "zh"];
  const items = card.operations.map((op, index) => {
    const state = words[op.status] ?? op.status;
    // AG13: an item that was not done says why when the server knows (a private event kept because something links to it).
    const why = op.outcome ? (locale === "en" ? ` — ${op.outcome.replace(/[.]$/u, "")}` : `（${op.outcome.replace(/[。]$/u, "")}）`) : "";
    return locale === "en" ? `item ${index + 1} ${state}${why}` : locale === "ja" ? `${index + 1} 件目は${state}${why}` : `第 ${index + 1} 项${state}${why}`;
  });
  return `${words.lead}${items.join(words.join)}${locale === "en" ? "." : "。"}`;
}

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
  onCardRevised?: CardRevisedHook;
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
  await notifyRevised(input.onCardRevised, action.revision ?? 1, card);
  // AG06 (设计稿 §5.2 "Todo 已修改，Memo 保存失败"): after an execution, code says item by item how it went.
  const summary = input.processNow && executes && card ? receiptSummary(card, action.locale) : "";
  const data = { card, decision: (summary ? { ...decision, message: `${decision.message} ${summary}` } : decision) as AgentCardDecisionResultContract };
  if (decision.outcome === "refused") {
    return { body: failureBody("CONFLICT", decision.message, decision.reason ?? "CARD_REFUSED", data), status: 409 };
  }
  return { body: { data, success: true }, status: 200 };
}

/** AG06: POST /api/agent/ledger/[id]/edit — take one item off a waiting card (revision, payloadHash, removeOperationId). */
export async function handleCardEdit(input: { runtime: AgentRuntimeService; actionId: string; body: Record<string, unknown>; now?: () => string; onCardRevised?: CardRevisedHook }): Promise<CardHttpResult> {
  if (!input.runtime.editCard) return { body: failureBody("SERVICE_UNAVAILABLE", "Cards cannot be edited here.", "UNSUPPORTED"), status: 503 };
  const action = await input.runtime.getAction(input.actionId);
  if (!action?.origin) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const { revision, payloadHash, removeOperationId } = input.body;
  if (!Number.isInteger(revision) || typeof payloadHash !== "string" || typeof removeOperationId !== "string" || !payloadHash || !removeOperationId) {
    return { body: failureBody("VALIDATION_ERROR", "Taking an item off a card needs revision, payloadHash and removeOperationId.", "EDIT_FIELDS_REQUIRED"), status: 400 };
  }
  const result = await pausedOr(action, () => input.runtime.editCard!({ actionId: input.actionId, payloadHash, removeOperationId, revision: revision as number }));
  if (isHttpResult(result)) return result;
  if (!result) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const card = await preview(input.runtime, input.actionId, input.now?.() ?? new Date().toISOString());
  await notifyRevised(input.onCardRevised, action.revision ?? 1, card);
  if (result.outcome === "refused") return { body: failureBody("CONFLICT", result.message, result.reason ?? "CARD_REFUSED", { card, edit: result }), status: 409 };
  return { body: { data: { card, edit: result }, success: true }, status: 200 };
}

/**
 * AG07 (设计稿 §7): after a client synced its own edits, the card is looked at again. Not a decision: a value the card
 * showed that changed re-freezes it as revision+1 (with the changed rows), which still needs a click; nothing is written.
 */
export async function handleCardRecheck(input: { runtime: AgentRuntimeService; actionId: string; now?: () => string; onCardRevised?: CardRevisedHook }): Promise<CardHttpResult> {
  if (!input.runtime.recheckCard) return { body: failureBody("SERVICE_UNAVAILABLE", "Cards cannot be checked again here.", "UNSUPPORTED"), status: 503 };
  const action = await input.runtime.getAction(input.actionId);
  if (!action?.origin) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const result = await pausedOr(action, () => input.runtime.recheckCard!({ actionId: input.actionId }));
  if (isHttpResult(result)) return result;
  if (!result) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const card = await preview(input.runtime, input.actionId, input.now?.() ?? new Date().toISOString());
  await notifyRevised(input.onCardRevised, action.revision ?? 1, card);
  // A closed or expired card is not an error here: the client shows its latest state.
  return { body: { data: { card, recheck: result }, success: true }, status: 200 };
}

export async function handleCardRegenerate(input: { runtime: AgentRuntimeService; actionId: string; now?: () => string; onCardRevised?: CardRevisedHook }): Promise<CardHttpResult> {
  if (!input.runtime.regenerateCard) return { body: failureBody("SERVICE_UNAVAILABLE", "Cards cannot be regenerated here.", "UNSUPPORTED"), status: 503 };
  const action = await input.runtime.getAction(input.actionId);
  if (!action?.origin) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const result = await pausedOr(action, () => input.runtime.regenerateCard!({ actionId: input.actionId }));
  if (isHttpResult(result)) return result;
  if (!result) return { body: failureBody("NOT_FOUND", "No card matches that id.", "CARD_NOT_FOUND"), status: 404 };
  const card = await preview(input.runtime, input.actionId, input.now?.() ?? new Date().toISOString());
  await notifyRevised(input.onCardRevised, action.revision ?? 1, card);
  if (result.outcome === "refused") return { body: failureBody("CONFLICT", result.message, result.reason ?? "CARD_NOT_EXPIRED", { card, regeneration: result }), status: 409 };
  return { body: { data: { card, regeneration: result }, success: true }, status: 200 };
}
