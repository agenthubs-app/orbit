/**
 * agent-design AG02 — the confirmation boundary of the new entry (设计稿 §3.7, §5.1; PLANNER 易错边界 2).
 *
 * - The entry never writes a to-do directly and never stores or confirms an entity draft: an
 *   explicit "new to-do" (the model's followups.createTask request or its task draft) becomes a
 *   card in the action ledger, one card per request, its owner the authenticated actor.
 * - Typed words never decide a card. A bare "好的" / "确认" / "OKです" while a card of this
 *   conversation waits is answered with a fixed reminder (press the button on the card); the model
 *   is not asked and no decision is recorded. Inside a longer message the reminder is appended.
 * - Approval flags and account ids a model writes into its output are stripped and reported as a
 *   `model.approval_claims_rejected` event; ownership comes only from the server's authentication.
 * - Records of other kinds (note, schedule, event, contact drafts) get no card in this sprint;
 *   a fixed sentence says so.
 */
import { agentProposalsPaused, pausedWords } from "../rollout/rollback";
import { createHash } from "node:crypto";

import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { agentCardPreview } from "../../agent/runtime/card-view";
import type { AgentActionRecord } from "../../agent/runtime/contract";
import { effectiveCardStatus } from "../../agent/runtime/decision";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { cardLocale, TODO_CREATE, type CardLocale, type TodoOperationIntent } from "../../agent/runtime/todo-operations";
import type { AgentNaturalLanguageActionRequest } from "../../agent/natural-language-actions/contract";
import { readEntityDraftIntent } from "../../orbit-ai/entity-drafts/contract";
import { emitTrace } from "../observability/trace";
import { cardConfirmLabel, cardConfirmLabelFor } from "../propose/copy";
import { rejectModelApprovalClaims } from "./approval-claims";

/** The ledger id of the card a conversation request produces: one card per request. */
export function conversationCardId(requestId: string): string {
  return `action:agent-v1:${createHash("sha256").update(requestId).digest("hex").slice(0, 32)}`;
}

const BARE_CONFIRMATION = [
  /^(ok|okay|yes|yep|sure|go|do it|go ahead|confirm(ed)?|please do)[.!]?$/iu,
  /^(はい|ok|ＯＫ|お願いします|お願い|いいです|いいよ|それで|それでお願いします|確認|了解|承知しました)(です|します)?[。.!！]?$/iu,
  /^(好|好的|好啊|行|可以|嗯|确定|确认|没问题|就这样|同意|对)[吧啊的了]?[。.!！]?$/u,
];
const CONFIRMATION_WORD = /(确认|好的|可以|没问题|就这样|進めて|お願いします|OK|ＯＫ|\bok\b|\byes\b|go ahead|confirm)/iu;

/** A typed message that only says yes (readEntityDraftIntent plus the other two languages). */
export function isBareTypedConfirmation(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 40) return false;
  return readEntityDraftIntent(text) !== null || BARE_CONFIRMATION.some((pattern) => pattern.test(text));
}

/** "照刚才的来", "やっぱりさっきの内容で進めてください", "go ahead with that": a sentence that only says to carry on. */
const PROCEED = [
  /^(那|那就|好)?(还是|就|也)?(按|照)(刚才|之前|上面|上一张|原来)的?(内容|那样|那个|卡)?(来|做|办|进行|执行|改)(吧|了|就行)?$/u,
  /^(那|那就)?(就这么办|就这样办|继续|执行|做吧|执行吧|继续吧|改吧|建吧)(吧)?$/u,
  /^(やっぱり|やはり)?(さっき|先ほど|前|元)の(内容|件|まま|とおり|通り)で(進めて|お願い|やって)(ください|します|下さい)?$/u,
  /^(やっぱり|やはり)?(それで|そのまま)?(進めて|実行して)(ください|下さい)?$/u,
  /^(ok,?\s*)?(please\s+)?(go ahead|proceed|do it|carry on|go on)(\s+with\s+(that|it|the (earlier|previous|last) (one|card|change)))?(,?\s*please)?$/iu,
];

/**
 * AG06 (AE-BND-008): a message that only agrees in words — every sentence a bare yes or a "carry on with
 * that". Used when the conversation's latest card is closed: code answers it alone, with the sentence that
 * the card can no longer be carried out; no model writes a reply that could say it will proceed.
 */
export function isTypedAgreement(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 80) return false;
  const sentences = text.split(/[。.!！?？\n]+/u).map((sentence) => sentence.trim().replace(/[，,、\s]+$/u, "")).filter(Boolean);
  return sentences.length > 0 && sentences.every((sentence) => isBareTypedConfirmation(sentence) || PROCEED.some((pattern) => pattern.test(sentence)));
}

export function mentionsConfirmation(message: string): boolean {
  return CONFIRMATION_WORD.test(message);
}

const TEXTS: Record<CardLocale, { reminder: (label: string) => string; card: (summary: string, label: string) => string; unsupported: (kind: string) => string; kinds: Record<string, string>; closed: Record<"rejected" | "canceled" | "expired", string> }> = {
  en: {
    card: (summary, label) => `Confirmation card: ${summary}. Nothing happens until you press "${label}" on the card.`,
    closed: {
      canceled: "The earlier card was canceled and can no longer be carried out. If you still want this change, say it again and Orbit will offer a new card.",
      expired: "The earlier card was left too long and has expired; it can no longer be carried out. Regenerate it on the card, or say it again.",
      rejected: "The earlier card was rejected and can no longer be carried out. If you still want this change, say it again and Orbit will offer a new card.",
    },
    kinds: { contact: "contacts", event: "events", note: "notes", schedule: "schedule items" },
    reminder: (label) => `The card is still waiting for you. A typed reply does not carry out any change; press "${label}" on the card.`,
    unsupported: (kind) => `Orbit cannot save ${kind} from here yet; nothing was saved.`,
  },
  ja: {
    card: (summary, label) => `確認カード：${summary}。カードの「${label}」を押すまで実行しません。`,
    closed: {
      canceled: "先ほどのカードは取り消し済みのため、実行できません。同じ内容で進める場合は、もう一度お伝えください。新しいカードをお出しします。",
      expired: "先ほどのカードは時間が経って無効になったため、実行できません。カードで作り直すか、もう一度お伝えください。",
      rejected: "先ほどのカードは却下済みのため、実行できません。同じ内容で進める場合は、もう一度お伝えください。新しいカードをお出しします。",
    },
    kinds: { contact: "連絡先", event: "イベント", note: "メモ", schedule: "予定" },
    reminder: (label) => `カードはまだ確認待ちです。メッセージで返信しても変更は実行されません。カードの「${label}」を押してください。`,
    unsupported: (kind) => `${kind}はここではまだ保存できません。何も保存していません。`,
  },
  zh: {
    card: (summary, label) => `确认卡：${summary}。点卡上的「${label}」后才会执行。`,
    closed: {
      canceled: "上一张卡已经取消了，不能再执行。如果还要这样改，请再说一次，我会出一张新卡。",
      expired: "上一张卡放太久已经失效，不能再执行。可以在卡上点重新生成，或者再说一次。",
      rejected: "上一张卡已经否决了，不能再执行。如果还要这样改，请再说一次，我会出一张新卡。",
    },
    kinds: { contact: "联系人", event: "活动", note: "笔记", schedule: "日程" },
    reminder: (label) => `卡片还在等你确认。打字回复不会执行任何修改，请点卡上的「${label}」。`,
    unsupported: (kind) => `这类记录（${kind}）现在还不能在这里保存，什么都没有保存。`,
  },
};

/** The card is named by its confirm button's own label (shared copy), for a card with `count` items. */
export function typedConfirmationReminder(locale: string, count: number): string {
  return TEXTS[cardLocale(locale)].reminder(cardConfirmLabel(cardLocale(locale), count));
}

export function cardLine(preview: AgentActionPreviewContract, locale: string): string {
  return TEXTS[cardLocale(locale)].card(preview.operations.map((op) => op.text).join(cardLocale(locale) === "en" ? "; " : "；"), cardConfirmLabelFor(cardLocale(locale), preview.operations));
}

export { rejectModelApprovalClaims, stripApprovalClaims } from "./approval-claims";

export interface EntityDraftLike {
  kind: string;
  fields: Readonly<Record<string, unknown>>;
}

/** The to-do intents an explicit command produced, and the record kinds this sprint cannot card. */
export function todoIntentsFrom(input: { actionRequests?: readonly AgentNaturalLanguageActionRequest[]; entityDraft?: EntityDraftLike | null }): { intents: TodoOperationIntent[]; unsupportedKinds: string[] } {
  const intents: TodoOperationIntent[] = [];
  const unsupportedKinds: string[] = [];
  for (const request of input.actionRequests ?? []) {
    if (request.capabilityId !== "followups.createTask") continue;
    intents.push({ capability: TODO_CREATE, set: { title: request.arguments.title, ...(request.arguments.dueAt ? { dueAt: request.arguments.dueAt } : {}) } });
  }
  const draft = input.entityDraft;
  if (draft) {
    if (draft.kind === "task" && !intents.length) {
      const field = (key: string) => (typeof draft.fields[key] === "string" && String(draft.fields[key]).trim() ? String(draft.fields[key]).trim() : undefined);
      const title = field("title");
      const plannedDate = field("plannedDate");
      const dueAt = field("dueAt");
      if (title) {
        intents.push({
          capability: TODO_CREATE,
          set: {
            title,
            ...(plannedDate && /^\d{4}-\d{2}-\d{2}$/u.test(plannedDate) ? { plannedDate } : {}),
            ...(dueAt && Number.isFinite(Date.parse(dueAt)) ? { dueAt: new Date(dueAt).toISOString() } : {}),
          },
        });
      }
    } else if (draft.kind !== "task") unsupportedKinds.push(draft.kind);
  }
  return { intents, unsupportedKinds };
}

/** The conversation's most recent card that can no longer be carried out, if it is the latest card. */
export async function latestClosedConversationCard(runtime: Pick<AgentRuntimeService, "listActionPage">, sessionId: string, now: string): Promise<{ action: AgentActionRecord; status: "rejected" | "canceled" | "expired" } | null> {
  const page = await runtime.listActionPage({ limit: 50 });
  const latest = page.actions
    .filter((action) => action.origin?.kind === "conversation" && action.origin.conversationId === sessionId)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .at(-1);
  if (!latest) return null;
  const status = effectiveCardStatus(latest, now);
  return status === "rejected" || status === "canceled" || status === "expired" ? { action: latest, status } : null;
}

/** Cards of this conversation still waiting for a decision (expiry judged from expiresAt). */
export async function openConversationCards(runtime: Pick<AgentRuntimeService, "listActionPage">, sessionId: string, now: string): Promise<AgentActionRecord[]> {
  const open: AgentActionRecord[] = [];
  for (const status of ["awaiting_confirmation", "deferred"] as const) {
    const page = await runtime.listActionPage({ limit: 50, status });
    for (const action of page.actions) {
      if (action.origin?.kind === "conversation" && action.origin.conversationId === sessionId && ["awaiting_confirmation", "deferred"].includes(effectiveCardStatus(action, now))) open.push(action);
    }
  }
  return open;
}

export interface LegacyTurn {
  reply: string;
  /** AG06: the turn's reply already shows its card (the graph wrote the card line from the frozen preview). */
  cardShown?: boolean;
  extraText?: string;
  sourceRefs: readonly string[];
  actionRequests?: readonly AgentNaturalLanguageActionRequest[];
  entityDraft?: EntityDraftLike | null;
}

export interface ConfirmBoundaryResult {
  text: string;
  sourceRefs: readonly string[];
  actionPreview?: AgentActionPreviewContract;
  /** False when the turn was answered without asking the model (a bare typed confirmation). */
  modelCalled: boolean;
}

/**
 * One turn of the new entry with the boundary applied. `run` asks the existing runtime; its write
 * proposals are turned into at most one ledger card here, never applied.
 */
export async function runWithConfirmBoundary(
  deps: { runtime: AgentRuntimeService; now?: () => string },
  input: { requestId: string; sessionId: string; locale: string; message: string; run: () => Promise<LegacyTurn> },
): Promise<ConfirmBoundaryResult> {
  const now = () => deps.now?.() ?? new Date().toISOString();
  const locale = cardLocale(input.locale);
  const open = await openConversationCards(deps.runtime, input.sessionId, now()).catch(() => []);
  if (open.length && isBareTypedConfirmation(input.message)) {
    const latest = open.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1)!;
    emitTrace({ cardIds: open.map((card) => card.actionId), decided: false, message: input.message, type: "entry.typed_confirmation" });
    return {
      actionPreview: agentCardPreview(latest, await deps.runtime.getRun(latest.runId), now()),
      modelCalled: false,
      sourceRefs: [],
      // AG18 rollback: while proposals are paused the button would not run it either; say so (CMP-005 R2).
      text: agentProposalsPaused() ? pausedWords(locale).typedConfirm : typedConfirmationReminder(locale, latest.operations?.length ?? 1),
    };
  }
  // AG06 (AE-BND-008): agreeing in words while the latest card is closed: code's sentence only, no model call.
  if (!open.length && isTypedAgreement(input.message)) {
    const closedCard = await latestClosedConversationCard(deps.runtime, input.sessionId, now()).catch(() => null);
    if (closedCard) {
      emitTrace({ cardId: closedCard.action.actionId, decided: false, message: input.message, status: closedCard.status, type: "entry.typed_confirmation" });
      return { modelCalled: false, sourceRefs: [], text: TEXTS[locale].closed[closedCard.status] };
    }
  }
  const turn = await input.run();
  const proposals = rejectModelApprovalClaims({ actionRequests: turn.actionRequests ?? [], entityDraft: turn.entityDraft ?? null }, "entry.proposals");
  const { intents, unsupportedKinds } = todoIntentsFrom(proposals);
  const cardId = conversationCardId(input.requestId);
  let card: AgentActionRecord | null = null;
  if (intents.length && deps.runtime.freezeCard) {
    const frozen = await deps.runtime.freezeCard({ actionId: cardId, intents, locale, origin: { conversationId: input.sessionId, kind: "conversation", requestId: input.requestId } });
    card = frozen.action;
  } else {
    // A card of this request may already exist (prepared before the turn ran): show it.
    card = await deps.runtime.getAction(cardId);
  }
  const actionPreview = card ? agentCardPreview(card, await deps.runtime.getRun(card.runId), now()) : undefined;
  const words = TEXTS[locale];
  // Agreeing in words to a card that is already closed: say, in code, that it cannot run any more.
  const closed = !open.length && !actionPreview && mentionsConfirmation(input.message)
    ? await latestClosedConversationCard(deps.runtime, input.sessionId, now()).catch(() => null)
    : null;
  if (closed) emitTrace({ cardId: closed.action.actionId, decided: false, message: input.message, status: closed.status, type: "entry.typed_confirmation" });
  const lines = [
    turn.reply,
    turn.extraText ?? "",
    actionPreview && !turn.cardShown ? cardLine(actionPreview, locale) : "",
    ...unsupportedKinds.map((kind) => words.unsupported(words.kinds[kind] ?? kind)),
    open.length && !actionPreview && mentionsConfirmation(input.message) ? words.reminder(open.at(-1)?.operations?.length ? cardConfirmLabelFor(locale, open.at(-1)!.operations as readonly { capability: string }[]) : cardConfirmLabel(locale, 1)) : "",
    closed ? words.closed[closed.status] : "",
  ].filter((line) => line.trim());
  if (unsupportedKinds.length) emitTrace({ kinds: unsupportedKinds, type: "entry.proposal_without_card" });
  return { ...(actionPreview ? { actionPreview } : {}), modelCalled: true, sourceRefs: turn.sourceRefs, text: lines.join("\n\n") };
}
