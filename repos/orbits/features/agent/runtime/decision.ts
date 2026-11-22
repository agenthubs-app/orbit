/**
 * agent-design AG02 — button decisions on a card (设计稿 §5.1, §5.2, 附录 D).
 *
 * `decideAction()` takes only what a click carries: actionId, revision, payloadHash, decision and
 * clientDecisionId (plus operationId for an item that needs review). Typed words and anything a
 * model writes never reach it. Every outcome is decided against the card as stored:
 *
 * - the same clientDecisionId again returns the first result, marked `replayed`;
 * - a stale revision or hash is refused with CARD_REVISION_CHANGED and the latest card;
 * - a card past `expiresAt` becomes `expired` (CARD_EXPIRED), a rejected or canceled one is
 *   CARD_CLOSED; none of them writes business data or outbox events;
 * - a confirm first re-reads what the card showed (values being changed, the name of the record,
 *   the record existing). Anything different issues revision+1 from the current data
 *   (CARD_CONTENT_CHANGED) and executes nothing;
 * - otherwise the approval, its outbox events and the decision record are one conditional,
 *   transactional change (repository.commitCardChange). A click that loses the race reads the
 *   result of the one that won (`already_decided`), it does not fail.
 *
 * Items whose outcome is unknown (`needs_review`) are settled by the same interface: retry (back to
 * pending, same operation key), mark_done (receipt `user_confirmed`, no executor call) or abandon
 * (receipt `abandoned`; items depending on it are skipped).
 */
import type {
  AgentActionDecisionRecord,
  AgentActionOperationPayload,
  AgentActionOrigin,
  AgentActionRecord,
  AgentActionRevisionRecord,
  AgentCardChange,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRunDetail,
} from "./contract";
import { sha256PayloadHash } from "./hash";
import { agentDecisionRecordId, type AgentRuntimeRepository } from "./repository";
import { emitTrace } from "../../agent-v1/observability/trace";
import { agentProposalsPaused, pausedWords, PROPOSALS_PAUSED } from "../../agent-v1/rollout/rollback";
import {
  cardLocale,
  checkTodoTarget,
  type CardLocale,
  type TodoReader,
} from "./todo-operations";
import { buildCardOperationList, cardCountTitle, cardIntentOf, type CardOperationIntent } from "./card-operations";
import { checkContactTarget } from "../../agent-v1/domains/contact/prepare";
import { isContactCapability } from "../../agent-v1/domains/contact/types";

/** At the click and at a recheck: what the card showed against now (to-dos; AG12: contacts). */
async function checkCardTarget(op: AgentActionOperationPayload, reader: TodoReader) {
  return isContactCapability(op.capability) ? checkContactTarget(op, reader.contacts) : checkTodoTarget(op, reader);
}

/** Conversation cards expire after 7 days (设计稿 §5.2). */
export const AGENT_CARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** agent-design AG17 (设计稿 §5.2, §5.4): what an external agent proposed waits 24 hours, then the agent has to propose again. */
export const AGENT_EXTERNAL_CARD_TTL_MS = 24 * 60 * 60 * 1000;

/** How long a card of this origin waits for a decision. */
export function cardTtlMs(origin: AgentActionOrigin | undefined): number {
  return origin?.kind === "connection" ? AGENT_EXTERNAL_CARD_TTL_MS : AGENT_CARD_TTL_MS;
}
const MAX_OUTBOX_ATTEMPTS = 5;

export const AGENT_DECISIONS = ["confirm", "reject", "retry", "mark_done", "abandon"] as const;
export type AgentDecisionKind = (typeof AGENT_DECISIONS)[number];
export const AGENT_REVIEW_DECISIONS: readonly AgentDecisionKind[] = ["retry", "mark_done", "abandon"];

export type AgentDecisionReason =
  | "CARD_REVISION_CHANGED"
  | "CARD_CONTENT_CHANGED"
  | "CARD_EXPIRED"
  | "CARD_CLOSED"
  | "OPERATION_NOT_IN_REVIEW"
  /** AG18 rollback: ORBIT_AGENT_V1_PROPOSALS=paused — nothing is carried out until it is open again. */
  | "PROPOSALS_PAUSED";

export interface AgentDecisionInput {
  actionId: string;
  revision: number;
  payloadHash: string;
  decision: AgentDecisionKind;
  clientDecisionId: string;
  operationId?: string;
  actorLabel?: string;
}

export interface AgentDecisionResult {
  decisionId: string;
  clientDecisionId: string;
  actionId: string;
  decision: AgentDecisionKind;
  operationId?: string;
  /** accepted: a new decision took effect. already_decided: another decision got there first. */
  outcome: "accepted" | "already_decided" | "refused";
  accepted: boolean;
  /** The same clientDecisionId was sent before; this is that first result. */
  replayed: boolean;
  reason?: AgentDecisionReason;
  /** What the user reads, in the card's language. */
  message: string;
  revision: number;
  changes?: readonly AgentCardChange[];
  decidedAt: string;
}

export interface AgentCardDependencies {
  repository: AgentRuntimeRepository;
  reader: TodoReader | null;
  now: () => string;
  /** Called after a committed change so the run's status follows (service.refreshRunStatus). */
  afterChange?: (action: AgentActionRecord) => Promise<void>;
  /** Recomputes a card's status from its items (after mark_done or abandon settles one). */
  refreshAction?: (actionId: string) => Promise<void>;
}

const MESSAGES: Record<CardLocale, {
  confirmed: string;
  rejected: string;
  alreadyDecided: string;
  revisionChanged: string;
  contentChanged: string;
  expired: string;
  /** AG17: an external proposal past its 24 hours; it is not made again in Orbit. */
  expiredExternal: string;
  /** AG17: an external proposal voided because its connection was revoked. */
  canceledExternal: string;
  /** AG15: the next period of the same scheduled task made a new card. */
  superseded: string;
  closedRejected: string;
  closedCanceled: string;
  retry: string;
  markDone: string;
  abandon: string;
  notInReview: string;
  regenerated: string;
}> = {
  en: {
    abandon: "You gave up on this item. Your data was not changed.",
    alreadyDecided: "This card was already decided. This is its latest state.",
    closedCanceled: "This card was canceled; it can no longer be carried out.",
    closedRejected: "This card was rejected; it can no longer be carried out.",
    confirmed: "Confirmed. Carrying it out now.",
    contentChanged: "Something on this card changed. Please look at it again: it now shows the current data and needs another click.",
    expired: "This card was left too long. Generate a new one?",
    canceledExternal: "This proposal is void: the connection that made it was revoked. It can no longer be confirmed.",
    expiredExternal: "This proposal is more than 24 hours old and no longer works. If you still want the change, ask the assistant that proposed it to propose it again.",
    superseded: "A newer card from the same scheduled task took this one's place. Use the newer card.",
    markDone: "Marked as done on your word. Nothing was written again.",
    notInReview: "This item does not need review.",
    regenerated: "The card was made again from the current data. Nothing is done until you click confirm.",
    rejected: "Rejected. Nothing was changed.",
    retry: "Retrying this item. It will not be created twice.",
    revisionChanged: "What this card shows has changed. Please look at it again before confirming.",
  },
  ja: {
    abandon: "この項目は取りやめました。データは変わっていません。",
    alreadyDecided: "このカードはすでに処理されています。最新の状態です。",
    closedCanceled: "このカードは取り消し済みのため、実行できません。",
    closedRejected: "このカードは却下済みのため、実行できません。",
    confirmed: "確認しました。実行しています。",
    contentChanged: "カードの内容に変更があります。もう一度ご確認ください。現在のデータで更新しました。もう一度押すまで実行しません。",
    expired: "このカードは時間が経ちすぎました。作り直しますか？",
    canceledExternal: "この提案は無効になりました。提案した連携が解除されたため、確定できません。",
    expiredExternal: "この提案は 24 時間を過ぎたため、もう使えません。必要な場合は、提案したアシスタントにもう一度提案させてください。",
    superseded: "同じ定期タスクの新しいカードに置き換わりました。新しいカードをお使いください。",
    markDone: "ご判断のとおり完了にしました。もう一度書き込むことはしていません。",
    notInReview: "この項目は確認の必要がありません。",
    regenerated: "現在のデータでカードを作り直しました。確認を押すまで何も実行しません。",
    rejected: "却下しました。何も変更していません。",
    retry: "この項目を再試行します。重複して作成されることはありません。",
    revisionChanged: "カードの内容が変わりました。もう一度内容を見てから確定してください。",
  },
  zh: {
    abandon: "已放弃这一项，数据没有变化。",
    alreadyDecided: "这张卡已经处理过了，下面是它的最新状态。",
    closedCanceled: "这张卡已经取消了，不能再执行。",
    closedRejected: "这张卡已经否决了，不能再执行。",
    confirmed: "已确认，正在执行。",
    contentChanged: "内容有变化，请再看一遍。卡片已按现在的数据更新，再点一次确认才会执行。",
    expired: "这张卡放太久了，要重新生成一张吗？",
    canceledExternal: "这条提议已经作废：提出它的那个连接被撤销了，不能再确认。",
    expiredExternal: "这条提议已经超过 24 小时，失效了。还需要的话，请让提出它的那个助手重新提一次。",
    superseded: "同一条定时任务的下一期出了新卡，这张已经被取代。请用新的那张。",
    markDone: "已按你的判断标为已完成，没有再写一次。",
    notInReview: "这一项现在不需要核对。",
    regenerated: "已按现在的数据重新生成这张卡，点确认之前不会执行。",
    rejected: "已否决，没有做任何修改。",
    retry: "正在重试这一项，不会重复新建。",
    revisionChanged: "卡片的内容有变化，请再看一遍再确认。",
  },
};

export function cardMessages(locale: string | undefined) {
  return MESSAGES[cardLocale(locale)];
}

/** What a canceled card says: a conversation card was stopped; an external proposal was voided with its connection. */
export function canceledMessage(action: Pick<AgentActionRecord, "locale" | "origin">): string {
  const messages = cardMessages(action.locale);
  return action.origin?.kind === "connection" ? messages.canceledExternal : messages.closedCanceled;
}

/** What a card past its time says: a conversation card can be made again; an external proposal has to be proposed again. */
export function expiredMessage(action: Pick<AgentActionRecord, "locale" | "origin">): string {
  const messages = cardMessages(action.locale);
  return action.origin?.kind === "connection" ? messages.expiredExternal : messages.expired;
}

/** The visible and executable content the SHA-256 card hash covers (设计稿 §5.1). */
export function cardHashInput(card: {
  revision: number;
  title: string;
  preview: string;
  operations: readonly AgentActionOperationPayload[];
}): unknown {
  return {
    operations: card.operations.map((op) => ({
      after: op.after ?? null,
      before: op.before ?? null,
      capability: op.capability ?? op.operationType,
      dependsOn: op.dependsOn ?? [],
      // AG07: what the card shows of the item; absent on cards frozen before it, whose hash stays as it was.
      ...(op.display ? { display: op.display } : {}),
      effects: op.effects ?? [],
      executorKey: op.executorKey,
      idempotencyKey: op.idempotencyKey,
      operationId: op.operationId,
      partId: op.partId ?? null,
      payload: op.payload,
      preview: op.preview,
      shown: op.shown ?? null,
      targetRef: op.targetRef ?? null,
    })),
    preview: card.preview,
    revision: card.revision,
    title: card.title,
  };
}

export function cardPayloadHash(card: Parameters<typeof cardHashInput>[0]): string {
  return sha256PayloadHash(cardHashInput(card));
}

/** Expired as of `now`: past expiresAt while still waiting for a decision. */
export function isPastExpiry(action: AgentActionRecord, now: string): boolean {
  return Boolean(action.expiresAt) &&
    (action.status === "awaiting_confirmation" || action.status === "deferred") &&
    Date.parse(now) >= Date.parse(action.expiresAt!);
}

/** The card's status as a reader should see it now (expiry judged from expiresAt, 易错边界 4). */
export function effectiveCardStatus(action: AgentActionRecord, now: string): AgentActionRecord["status"] {
  return isPastExpiry(action, now) ? "expired" : action.status;
}

export type AgentCardOperationStatus = "pending" | "succeeded" | "failed" | "skipped" | "undone" | "needs_review" | "user_confirmed" | "abandoned";

/** Per item: the latest receipt decides; a closed card's items are skipped. */
export function cardOperationStatus(operationId: string, action: AgentActionRecord, detail: AgentRunDetail | null, now?: string): AgentCardOperationStatus {
  const status = now ? effectiveCardStatus(action, now) : action.status;
  if (status === "undone") return "undone";
  const receipts = (detail?.receipts ?? [])
    .filter((receipt) => receipt.actionId === action.actionId && receipt.operationId === operationId)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.createdAt.localeCompare(right.createdAt));
  // A closed card's items never ran, unless their own receipts say otherwise (an abandoned item).
  if ((status === "rejected" || status === "canceled" || status === "expired") && receipts.length === 0) return "skipped";
  if (receipts.some((receipt) => receipt.status === "completed")) return "succeeded";
  const latest = receipts.at(-1);
  if (latest && ["needs_review", "user_confirmed", "abandoned", "skipped", "undone"].includes(latest.status)) return latest.status as AgentCardOperationStatus;
  const outbox = detail?.outbox.find((event) => event.actionId === action.actionId && event.operationId === operationId);
  if (outbox?.status === "dead_letter" || (receipts.length > 0 && receipts.every((receipt) => receipt.status === "failed") && outbox?.status !== "pending" && outbox?.status !== "retry_scheduled")) return "failed";
  return "pending";
}

export interface FrozenCardInput {
  actionId: string;
  origin: AgentActionOrigin;
  locale: string;
  intents: readonly CardOperationIntent[];
}

/**
 * Builds the operations of one revision from intents and the current data. Missing targets are reported.
 * AG06: to-dos and interaction memos (card-operations.ts); an item's dependencies become operation ids.
 */
export async function buildCardOperations(reader: TodoReader | null, input: { actionId: string; revision: number; locale: string; intents: readonly CardOperationIntent[] }): Promise<{ operations: AgentActionOperationPayload[]; missing: string[] }> {
  return buildCardOperationList(reader, input);
}

/** Title (AG06: the count sentence, "修改1项，新增1项"), preview and hash of a revision. */
export function cardTexts(operations: readonly AgentActionOperationPayload[], locale: string, revision: number) {
  const title = cardCountTitle(operations, cardLocale(locale));
  const preview = operations.map((op) => op.preview).join("\n");
  return { payloadHash: cardPayloadHash({ operations, preview, revision, title }), preview, title };
}

function decisionResult(record: AgentActionDecisionRecord, replayed: boolean): AgentDecisionResult {
  return {
    accepted: record.outcome === "accepted",
    actionId: record.actionId,
    ...(record.changes ? { changes: record.changes } : {}),
    clientDecisionId: record.clientDecisionId,
    decidedAt: record.decidedAt,
    decision: record.decision,
    decisionId: record.decisionId,
    message: record.message,
    ...(record.operationId ? { operationId: record.operationId } : {}),
    outcome: record.outcome,
    ...(record.reason ? { reason: record.reason as AgentDecisionReason } : {}),
    replayed,
    revision: record.resultRevision,
  };
}

function requireCardRepository(repository: AgentRuntimeRepository): Required<Pick<AgentRuntimeRepository, "commitCardChange" | "getDecision">> {
  if (!repository.commitCardChange || !repository.getDecision) throw new Error("This Agent runtime repository cannot record card decisions.");
  return { commitCardChange: repository.commitCardChange, getDecision: repository.getDecision };
}

/** A new revision of the card from its intents and the current data (content change or regeneration). */
async function nextRevision(deps: AgentCardDependencies, action: AgentActionRecord, reason: AgentActionRevisionRecord["reason"], now: string, keep?: (op: AgentActionOperationPayload) => boolean, replaced?: readonly CardOperationIntent[]): Promise<AgentActionRecord> {
  const revision = (action.revision ?? 1) + 1;
  // AG06: an edit keeps only some items; a kept item that waited for a removed one no longer waits.
  const kept = keep ? action.operations.filter(keep) : action.operations;
  // AG12: the user changed an item in words (an import row's decision): its new intents.
  const intents = replaced ? [...replaced] : kept.map((op) => cardIntentOf(op, kept)).filter((intent): intent is CardOperationIntent => intent !== null);
  const { operations } = await buildCardOperations(deps.reader, { actionId: action.actionId, intents, locale: action.locale ?? "zh", revision });
  const texts = cardTexts(operations, action.locale ?? "zh", revision);
  const previous: AgentActionRevisionRecord = {
    ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}),
    frozenAt: action.revisions?.length ? action.updatedAt : action.createdAt,
    operations: action.operations,
    payloadHash: action.payloadHash ?? "",
    preview: action.preview,
    reason,
    revision: action.revision ?? 1,
    supersededAt: now,
    title: action.title,
  };
  return {
    ...action,
    contentChanges: undefined,
    expiresAt: reason === "regenerated" ? new Date(Date.parse(now) + cardTtlMs(action.origin)).toISOString() : action.expiresAt,
    expiredAt: undefined,
    operations,
    payloadHash: texts.payloadHash,
    preview: texts.preview,
    revision,
    revisions: [...(action.revisions ?? []), previous],
    selectedOperationIds: undefined,
    status: "awaiting_confirmation",
    title: texts.title,
    updatedAt: now,
  };
}

function emitCard(action: AgentActionRecord, reason: string): void {
  emitTrace({ card: action, cardId: action.actionId, cardKind: "ledger_action", hash: action.payloadHash, reason, revision: action.revision ?? 1, type: "card.frozen", version: action.payloadVersion });
}

/** POST action/decision (设计稿附录 D). */
export async function decideAction(deps: AgentCardDependencies, input: AgentDecisionInput): Promise<AgentDecisionResult | null> {
  const repository = requireCardRepository(deps.repository);
  const previous = await repository.getDecision(input.actionId, input.clientDecisionId);
  if (previous) {
    const replay = decisionResult(previous, true);
    emitTrace({ actionId: input.actionId, cardId: input.actionId, clientDecisionId: input.clientDecisionId, decision: input.decision, outcome: replay.outcome, reason: replay.reason ?? null, replayed: true, type: "card.decision" });
    return replay;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const result = await decideOnce(deps, repository, action, input);
    if (result) return result;
  }
  throw new Error(`Agent action ${input.actionId} kept changing while a decision was being recorded.`);
}

async function decideOnce(
  deps: AgentCardDependencies,
  repository: ReturnType<typeof requireCardRepository>,
  action: AgentActionRecord,
  input: AgentDecisionInput,
): Promise<AgentDecisionResult | null> {
  const now = deps.now();
  const messages = cardMessages(action.locale);
  const revision = action.revision ?? 1;
  const decisionId = agentDecisionRecordId(action.actionId, input.clientDecisionId);
  const record = (outcome: AgentActionDecisionRecord["outcome"], message: string, extra: Partial<AgentActionDecisionRecord> = {}): AgentActionDecisionRecord => ({
    actionId: action.actionId,
    clientDecisionId: input.clientDecisionId,
    decidedAt: now,
    decision: input.decision,
    decisionId,
    message,
    ...(input.operationId ? { operationId: input.operationId } : {}),
    outcome,
    payloadHash: input.payloadHash,
    resultRevision: revision,
    revision: input.revision,
    ...extra,
  });
  /** Records the decision (and the card change, when given) atomically; null means "read again". */
  const commit = async (decision: AgentActionDecisionRecord, change: { next?: AgentActionRecord; outbox?: AgentOutboxEvent[]; receipts?: AgentExecutionReceipt[]; checkCard?: boolean } = {}): Promise<AgentDecisionResult | null> => {
    const committed = await repository.commitCardChange({
      actionId: action.actionId,
      decision,
      ...(change.checkCard === false ? {} : { expect: { revision, statuses: [action.status], updatedAt: action.updatedAt } }),
      ...(change.next ? { next: change.next } : {}),
      ...(change.outbox ? { outbox: change.outbox } : {}),
      ...(change.receipts ? { receipts: change.receipts } : {}),
    });
    if (committed.committed === false) {
      if (committed.existingDecision) return decisionResult(committed.existingDecision, true);
      return null;
    }
    if (change.next) {
      if (input.decision === "mark_done" || input.decision === "abandon") await deps.refreshAction?.(action.actionId);
      else await deps.afterChange?.(change.next);
    }
    const result = decisionResult(decision, false);
    emitTrace({ accepted: result.accepted, actionId: action.actionId, cardId: action.actionId, clientDecisionId: input.clientDecisionId, decision: input.decision, operationId: input.operationId ?? null, outcome: result.outcome, reason: result.reason ?? null, replayed: false, revision: result.revision, type: "card.decision" });
    if (change.next && change.next.status !== action.status) emitTrace({ cardId: action.actionId, from: action.status, revision: change.next.revision ?? 1, to: change.next.status, type: "card.state" });
    return result;
  };
  const refuse = (reason: AgentDecisionReason, message: string, extra: Partial<AgentActionDecisionRecord> = {}) =>
    commit(record("refused", message, { reason, ...extra }), { checkCard: false });

  // Expiry is judged from expiresAt at the click (no timer before AG15).
  if (isPastExpiry(action, now)) {
    const expired: AgentActionRecord = { ...action, expiredAt: now, status: "expired", updatedAt: now };
    return commit(record("refused", expiredMessage(action), { reason: "CARD_EXPIRED" }), { next: expired });
  }
  if (action.status === "expired") return refuse("CARD_EXPIRED", action.expiredReason === "superseded" ? messages.superseded : expiredMessage(action));
  if (action.status === "rejected" || action.status === "canceled") {
    return refuse("CARD_CLOSED", action.status === "rejected" ? messages.closedRejected : canceledMessage(action));
  }
  // AG18 rollback (CMP-005 R1): while proposals are paused nothing runs — not a confirm, a retry or a "mark done";
  // rejecting stays possible (it writes nothing). The card is left as it is for the reconcile list.
  if (agentProposalsPaused() && input.decision !== "reject" && input.decision !== "abandon") {
    return refuse(PROPOSALS_PAUSED, pausedWords(action.locale).click);
  }
  if (input.revision !== revision || input.payloadHash !== action.payloadHash) {
    return refuse("CARD_REVISION_CHANGED", messages.revisionChanged);
  }

  if (input.decision === "confirm" || input.decision === "reject") {
    if (action.status !== "awaiting_confirmation" && action.status !== "deferred") {
      // Another click got there first: report its result, do not fail.
      return commit(record("already_decided", messages.alreadyDecided), { checkCard: false });
    }
    if (input.decision === "reject") {
      const rejected: AgentActionRecord = { ...action, rejectedAt: now, status: "rejected", updatedAt: now };
      return commit(record("accepted", messages.rejected), { next: rejected });
    }
    // Check what the card showed against the data now.
    const changes: AgentCardChange[] = [];
    const versionTokens = new Map<string, string>();
    for (const op of action.operations) {
      if (!deps.reader) break;
      const check = await checkCardTarget(op, deps.reader);
      if (check.versionToken) versionTokens.set(op.operationId, check.versionToken);
      for (const row of check.rows) changes.push({ operationId: op.operationId, ...row });
    }
    if (changes.length) {
      const next = { ...(await nextRevision(deps, action, "content_changed", now)), contentChanges: changes };
      const result = await commit(record("refused", messages.contentChanged, { changes, reason: "CARD_CONTENT_CHANGED", resultRevision: next.revision ?? revision + 1 }), { next });
      if (result && !result.replayed) emitCard(next, "content_changed");
      return result;
    }
    const approved: AgentActionRecord = {
      ...action,
      approvedAt: now,
      approvedBy: input.actorLabel?.trim() || "Orbit user",
      contentChanges: undefined,
      selectedOperationIds: action.operations.map((op) => op.operationId),
      status: "approved",
      updatedAt: now,
    };
    const outbox = action.operations.map((op): AgentOutboxEvent => ({
      actionId: action.actionId,
      attempt: 0,
      availableAt: now,
      compensation: op.compensation,
      createdAt: now,
      executorKey: op.executorKey,
      idempotencyKey: op.idempotencyKey,
      maxAttempts: MAX_OUTBOX_ATTEMPTS,
      operationId: op.operationId,
      outboxId: `outbox:${action.actionId}:${op.operationId}`,
      // An update executes against the version read at this click; the domain re-checks it.
      // AG12: a contact item executes against the contact version read at this click.
      payload: versionTokens.has(op.operationId) ? (isContactCapability(op.capability) ? { ...op.payload, expectedVersion: Number(versionTokens.get(op.operationId)) } : { ...op.payload, expectedUpdatedAt: versionTokens.get(op.operationId) }) : op.payload,
      payloadVersion: op.payloadVersion,
      runId: action.runId,
      status: "pending",
      updatedAt: now,
    }));
    return commit(record("accepted", messages.confirmed), { next: approved, outbox });
  }

  // Review of one item whose outcome is unknown.
  const detail = await deps.repository.getRun(action.runId);
  const operation = action.operations.find((op) => op.operationId === input.operationId);
  const status = operation ? cardOperationStatus(operation.operationId, action, detail) : null;
  if (!operation || status !== "needs_review") {
    return commit(record("refused", messages.notInReview, { reason: "OPERATION_NOT_IN_REVIEW" }), { checkCard: false });
  }
  const event = detail?.outbox.find((item) => item.actionId === action.actionId && item.operationId === operation.operationId);
  if (!event) return commit(record("refused", messages.notInReview, { reason: "OPERATION_NOT_IN_REVIEW" }), { checkCard: false });
  const receipt = (status: AgentExecutionReceipt["status"], summary: string, suffix: string): AgentExecutionReceipt => ({
    actionId: action.actionId,
    createdAt: now,
    executorKey: operation.executorKey,
    idempotencyKey: operation.idempotencyKey,
    operationId: operation.operationId,
    outboxId: event.outboxId,
    receiptId: `receipt:${operation.idempotencyKey}:${suffix}:${now}`,
    resultSummary: summary,
    runId: action.runId,
    status,
    updatedAt: now,
  });
  const nextCard: AgentActionRecord = { ...action, status: "executing", updatedAt: now };
  if (input.decision === "retry") {
    // Back to pending with the original operation key: the domain de-duplicates on it.
    const outbox: AgentOutboxEvent = { ...event, availableAt: now, lastError: undefined, leaseOwner: undefined, leasedAt: undefined, processedAt: undefined, status: "pending", updatedAt: now };
    const result = await commit(record("accepted", messages.retry), { next: { ...nextCard, status: "approved" }, outbox: [outbox] });
    if (result && !result.replayed) emitTrace({ actionId: action.actionId, idempotencyKey: operation.idempotencyKey, operationId: operation.operationId, status: "pending", type: "exec.review", via: "retry" });
    return result;
  }
  if (input.decision === "mark_done") {
    const done = receipt("user_confirmed", "Marked as done by the user; the executor was not called.", "user-confirmed");
    const outbox: AgentOutboxEvent = { ...event, processedAt: now, status: "completed", updatedAt: now };
    const result = await commit(record("accepted", messages.markDone), { next: nextCard, outbox: [outbox], receipts: [done] });
    if (result && !result.replayed) emitTrace({ actionId: action.actionId, executorKey: operation.executorKey, idempotencyKey: operation.idempotencyKey, operationId: operation.operationId, source: "real", status: "user_confirmed", type: "exec.receipt", via: "mark_done" });
    return result;
  }
  // abandon: this item and the items depending on it end here.
  const abandoned = receipt("abandoned", "Abandoned by the user; nothing was written.", "abandoned");
  const dependents = action.operations.filter((op) => op.dependsOn?.includes(operation.operationId));
  const outbox: AgentOutboxEvent[] = [{ ...event, processedAt: now, status: "canceled", updatedAt: now }];
  const receipts: AgentExecutionReceipt[] = [abandoned];
  for (const dependent of dependents) {
    const dependentEvent = detail?.outbox.find((item) => item.actionId === action.actionId && item.operationId === dependent.operationId);
    if (dependentEvent && !["completed", "dead_letter", "canceled"].includes(dependentEvent.status)) {
      outbox.push({ ...dependentEvent, processedAt: now, status: "canceled", updatedAt: now });
      receipts.push({ ...receipt("skipped", `Skipped: ${operation.operationId} was abandoned.`, "skipped"), executorKey: dependent.executorKey, idempotencyKey: dependent.idempotencyKey, operationId: dependent.operationId, outboxId: dependentEvent.outboxId, receiptId: `receipt:${dependent.idempotencyKey}:skipped:${now}` });
    }
  }
  const result = await commit(record("accepted", messages.abandon), { next: nextCard, outbox, receipts });
  if (result && !result.replayed) {
    emitTrace({ actionId: action.actionId, executorKey: operation.executorKey, idempotencyKey: operation.idempotencyKey, operationId: operation.operationId, source: "real", status: "abandoned", type: "exec.receipt", via: "abandon" });
    for (const skipped of receipts.slice(1)) emitTrace({ actionId: action.actionId, operationId: skipped.operationId, source: "real", status: "skipped", type: "exec.receipt", via: "abandon" });
  }
  return result;
}

export interface AgentRegenerateResult {
  outcome: "regenerated" | "refused";
  reason?: "CARD_NOT_EXPIRED" | "CARD_REVISION_CHANGED" | "CARD_EXPIRED";
  message: string;
  revision: number;
}

/**
 * Regenerating an expired card is not a decision: it re-issues the same operation intents from
 * the current data as revision+1 with a fresh expiry, back in awaiting_confirmation; it still
 * needs a click (设计稿 §5.2).
 */
export async function regenerateCard(deps: AgentCardDependencies, input: { actionId: string }): Promise<AgentRegenerateResult | null> {
  const repository = requireCardRepository(deps.repository);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const now = deps.now();
    const messages = cardMessages(action.locale);
    const past = isPastExpiry(action, now);
    if (!past && action.status !== "expired") {
      return { message: messages.revisionChanged, outcome: "refused", reason: "CARD_NOT_EXPIRED", revision: action.revision ?? 1 };
    }
    // AG17 (设计稿 §5.4): an external proposal that ran out is not made again here; the agent proposes again.
    if (action.origin?.kind === "connection") {
      return { message: expiredMessage(action), outcome: "refused", reason: "CARD_EXPIRED", revision: action.revision ?? 1 };
    }
    const next = await nextRevision(deps, action, "regenerated", now);
    const committed = await repository.commitCardChange({ actionId: action.actionId, expect: { revision: action.revision ?? 1, statuses: [action.status], updatedAt: action.updatedAt }, next });
    if (!committed.committed) continue;
    await deps.afterChange?.(next);
    emitCard(next, "regenerated");
    emitTrace({ cardId: action.actionId, from: past ? "expired" : action.status, revision: next.revision ?? 1, to: next.status, type: "card.state", via: "regenerate" });
    return { message: messages.regenerated, outcome: "regenerated", revision: next.revision ?? 1 };
  }
  throw new Error(`Agent action ${input.actionId} kept changing while it was being regenerated.`);
}

export interface AgentExpireCardResult {
  outcome: "expired" | "unchanged";
  revision: number;
}

/**
 * agent-design AG15 (设计稿 §5.2, §5.3; PLANNER 易错边界 9): a card left waiting is closed without a click — by its
 * one-off timer once its expiry has passed (only the revision the timer was set for), or because the next period of the
 * same scheduled task made a new card. It becomes `expired`: never executed, a click on it is refused with
 * CARD_EXPIRED, and regenerating it gives a new revision that still needs a click. Not a decision; no model is called.
 */
export async function expireCard(deps: AgentCardDependencies, input: { actionId: string; revision?: number; reason: "timer" | "superseded"; by?: { actionId: string; firedAt: string } }): Promise<AgentExpireCardResult | null> {
  const repository = requireCardRepository(deps.repository);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const now = deps.now();
    const revision = action.revision ?? 1;
    const waiting = action.status === "awaiting_confirmation" || action.status === "deferred";
    if (!waiting || (input.revision !== undefined && input.revision !== revision)) return { outcome: "unchanged", revision };
    if (input.reason === "timer" && !isPastExpiry(action, now)) return { outcome: "unchanged", revision };
    const next: AgentActionRecord = { ...action, expiredAt: now, status: "expired", updatedAt: now, ...(input.reason === "superseded" ? { expiredReason: "superseded" as const, ...(input.by ? { supersededBy: { actionId: input.by.actionId, firedAt: input.by.firedAt } } : {}) } : {}) };
    const committed = await repository.commitCardChange({ actionId: action.actionId, expect: { revision, statuses: [action.status], updatedAt: action.updatedAt }, next });
    if (!committed.committed) continue;
    await deps.afterChange?.(next);
    emitTrace({ cardId: action.actionId, from: action.status, revision, to: "expired", type: "card.state", via: input.reason === "timer" ? "timer" : "superseded" });
    return { outcome: "expired", revision };
  }
  throw new Error(`Agent action ${input.actionId} kept changing while it was being closed.`);
}

export interface AgentRecheckResult {
  outcome: "revised" | "unchanged" | "refused";
  reason?: "CARD_CLOSED" | "CARD_EXPIRED";
  message: string;
  revision: number;
  changes?: readonly AgentCardChange[];
}

/**
 * agent-design AG07 (设计稿 §7 "同步后按最新数据重出差异", AE-UIX-006): a client that has just synced its own edits asks
 * the server to look at a waiting card again. Not a decision and no business write: the values the card showed are
 * read again (as at a click); when one changed, the card is frozen anew from the current data as revision+1 with the
 * changed rows marked, and still needs a click. Nothing changed: the card stays as it is.
 */
export async function recheckCard(deps: AgentCardDependencies, input: { actionId: string }): Promise<AgentRecheckResult | null> {
  const repository = requireCardRepository(deps.repository);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const now = deps.now();
    const messages = cardMessages(action.locale);
    const revision = action.revision ?? 1;
    if (isPastExpiry(action, now) || action.status === "expired") return { message: messages.expired, outcome: "refused", reason: "CARD_EXPIRED", revision };
    if (action.status !== "awaiting_confirmation" && action.status !== "deferred") return { message: messages.alreadyDecided, outcome: "refused", reason: "CARD_CLOSED", revision };
    const changes: AgentCardChange[] = [];
    for (const op of action.operations) {
      if (!deps.reader) break;
      const check = await checkCardTarget(op, deps.reader);
      for (const row of check.rows) changes.push({ operationId: op.operationId, ...row });
    }
    if (!changes.length) return { message: "", outcome: "unchanged", revision };
    const next = { ...(await nextRevision(deps, action, "content_changed", now)), contentChanges: changes };
    const committed = await repository.commitCardChange({ actionId: action.actionId, expect: { revision, statuses: [action.status], updatedAt: action.updatedAt }, next });
    if (!committed.committed) continue;
    await deps.afterChange?.(next);
    emitCard(next, "content_changed");
    emitTrace({ cardId: action.actionId, from: action.status, revision: next.revision ?? revision + 1, to: next.status, type: "card.state", via: "recheck" });
    return { changes, message: messages.contentChanged, outcome: "revised", revision: next.revision ?? revision + 1 };
  }
  throw new Error(`Agent action ${input.actionId} kept changing while it was being checked again.`);
}

export interface AgentEditCardResult {
  outcome: "edited" | "refused";
  reason?: "CARD_REVISION_CHANGED" | "CARD_CLOSED" | "CARD_EXPIRED" | "OPERATION_NOT_ON_CARD" | "LAST_OPERATION";
  message: string;
  revision: number;
}

const EDIT_MESSAGES: Record<CardLocale, { edited: string; last: string; notOnCard: string }> = {
  en: { edited: "The item was taken off. The card now lists only the rest and still needs your click.", last: "This is the only item on the card; reject the card instead.", notOnCard: "That item is no longer on this card." },
  ja: { edited: "その項目を外しました。カードには残りの項目だけが載っています。確認を押すまで実行しません。", last: "カードに残っている項目はこれだけです。カードごと却下してください。", notOnCard: "その項目は今のカードにありません。" },
  zh: { edited: "已去掉这一项，卡上只剩其余的项，点确认之前不会执行。", last: "卡上只剩这一项了，要不做的话请否决整张卡。", notOnCard: "现在的卡上没有这一项。" },
};

/**
 * agent-design AG06 (设计稿 §5.1 "去掉一项…只生成新版本", 附录 D): taking an item off a card is not a
 * decision. The card must be the version the client saw (revision and hash) and still waiting; the
 * remaining items are frozen again from their intents and the current data as revision+1, the count
 * sentence follows, and the card still needs a click. Nothing is executed or written.
 */
export async function editCard(deps: AgentCardDependencies, input: { actionId: string; revision: number; payloadHash: string; removeOperationId: string }): Promise<AgentEditCardResult | null> {
  const repository = requireCardRepository(deps.repository);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const now = deps.now();
    const locale = cardLocale(action.locale);
    const messages = cardMessages(action.locale);
    const revision = action.revision ?? 1;
    if (isPastExpiry(action, now) || action.status === "expired") return { message: messages.expired, outcome: "refused", reason: "CARD_EXPIRED", revision };
    if (action.status !== "awaiting_confirmation" && action.status !== "deferred") return { message: action.status === "canceled" ? messages.closedCanceled : messages.closedRejected, outcome: "refused", reason: "CARD_CLOSED", revision };
    if (input.revision !== revision || input.payloadHash !== action.payloadHash) return { message: messages.revisionChanged, outcome: "refused", reason: "CARD_REVISION_CHANGED", revision };
    if (!action.operations.some((op) => op.operationId === input.removeOperationId)) return { message: EDIT_MESSAGES[locale].notOnCard, outcome: "refused", reason: "OPERATION_NOT_ON_CARD", revision };
    if (action.operations.length === 1) return { message: EDIT_MESSAGES[locale].last, outcome: "refused", reason: "LAST_OPERATION", revision };
    const next = await nextRevision(deps, action, "edited", now, (op) => op.operationId !== input.removeOperationId);
    const committed = await repository.commitCardChange({ actionId: action.actionId, expect: { revision, statuses: [action.status], updatedAt: action.updatedAt }, next });
    if (!committed.committed) continue;
    await deps.afterChange?.(next);
    emitCard(next, "edited");
    emitTrace({ cardId: action.actionId, removed: input.removeOperationId, revision: next.revision ?? 1, type: "card.edited" });
    return { message: EDIT_MESSAGES[locale].edited, outcome: "edited", revision: next.revision ?? 1 };
  }
  throw new Error(`Agent action ${input.actionId} kept changing while it was being edited.`);
}

export interface AgentReviseCardResult {
  outcome: "revised" | "refused";
  reason?: "CARD_CLOSED" | "CARD_EXPIRED";
  message: string;
  revision: number;
}

/**
 * agent-design AG12 (设计稿 §5.1 "改内容…只生成新版本，走普通消息或点选"): the user changed an item in words — an import
 * row to create after all. Not a decision: the card, still waiting, is frozen again from the new intents and the current
 * data as revision+1; the earlier revision can no longer be confirmed (its revision and hash are stale).
 */
export async function reviseCard(deps: AgentCardDependencies, input: { actionId: string; intents: readonly CardOperationIntent[] }): Promise<AgentReviseCardResult | null> {
  const repository = requireCardRepository(deps.repository);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const action = await deps.repository.getAction(input.actionId);
    if (!action) return null;
    const now = deps.now();
    const messages = cardMessages(action.locale);
    const revision = action.revision ?? 1;
    if (isPastExpiry(action, now) || action.status === "expired") return { message: messages.expired, outcome: "refused", reason: "CARD_EXPIRED", revision };
    if (action.status !== "awaiting_confirmation" && action.status !== "deferred") return { message: messages.alreadyDecided, outcome: "refused", reason: "CARD_CLOSED", revision };
    const next = await nextRevision(deps, action, "edited", now, undefined, input.intents);
    if (!next.operations.length) return { message: messages.revisionChanged, outcome: "refused", reason: "CARD_CLOSED", revision };
    const committed = await repository.commitCardChange({ actionId: action.actionId, expect: { revision, statuses: [action.status], updatedAt: action.updatedAt }, next });
    if (!committed.committed) continue;
    await deps.afterChange?.(next);
    emitCard(next, "edited");
    emitTrace({ cardId: action.actionId, revision: next.revision ?? 1, type: "card.revised", via: "message" });
    return { message: "", outcome: "revised", revision: next.revision ?? 1 };
  }
  throw new Error(`Agent action ${input.actionId} kept changing while it was being revised.`);
}
