/**
 * AG06 repair 1 (AE-XL-006): a card is frozen again (an item taken off, content changed at the click, regenerated):
 * the request's result document follows it — its card and the card line in its answer, both from the new preview.
 * The line is code's (propose/copy.ts cardLineOf), so the old one is found exactly and replaced; the rest of the
 * answer is left as delivered. A document without that line keeps its text and only shows the new card.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { cardLocale } from "../../agent/runtime/todo-operations";
import { emitTrace } from "../observability/trace";
import { cardLineOf } from "../propose/copy";
import { replaceInBlocks } from "../answer/blocks";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { configuredAgentEntryStore } from "./configured-store";
import type { AgentEntryStore } from "./store";

export async function refreshCardInDocument(input: { store: AgentEntryStore; actorId: string; now: string; updated: AgentActionPreviewContract; previous?: AgentActionPreviewContract | null; locale?: string; keepText?: boolean }): Promise<boolean> {
  const requestId = input.updated.origin?.kind === "conversation" ? input.updated.origin.requestId : null;
  if (!requestId) return false;
  const record = await input.store.get(input.actorId, requestId);
  if (!record || record.document.actionPreview?.actionId !== input.updated.actionId) return false;
  const previous = input.previous ?? record.document.actionPreview;
  // AG07 (AG07-2): a decision on one client changes the card's state without a new revision; the document follows it
  // too, so the other client reading the document (or the channel) sees the same state.
  const sameState = previous.status === input.updated.status && previous.operations.map((op) => op.status).join() === input.updated.operations.map((op) => op.status).join();
  if (previous.revision === input.updated.revision && previous.payloadHash === input.updated.payloadHash && sameState) return false;
  const answer = record.document.answer;
  const languages = input.locale ? [cardLocale(input.locale)] : (["zh", "ja", "en"] as const);
  let text = answer?.text ?? null;
  let cardLine: string | undefined;
  let oldCardLine: string | undefined;
  // AG21c (R54): a revision asked for in words is shown in its own new turn; the turn that was delivered keeps its text
  // (what it said then), and only its card follows the new revision.
  for (const language of input.keepText ? [] : languages) {
    const oldLine = cardLineOf(previous, language);
    if (text && text.includes(oldLine)) {
      oldCardLine = oldLine;
      cardLine = cardLineOf(input.updated, language);
      text = text.replace(oldLine, cardLine);
      break;
    }
  }
  const status = record.document.status === "waiting_user" ? "waiting_user" : "completed";
  const amended = await input.store.amend({
    actorId: input.actorId,
    amendment: {
      actionPreview: input.updated,
      // AG07: the answer's card line follows the new revision, so clients that show the card still find it.
      // AG19 repair round 1: the blocks follow the text — the old card line is replaced in both, never in one only.
      ...(answer && text !== null ? { answer: { ...answer, text, ...(cardLine ? { cardLine } : {}), ...(answer.blocks && cardLine && oldCardLine ? { blocks: replaceInBlocks(answer.blocks, oldCardLine, cardLine) } : {}) } } : {}),
      clarifications: record.document.clarifications ?? [],
      // A part whose item was taken off the card no longer waits for it.
      partResults: record.document.partResults.map((item) => (item.status === "awaiting_confirmation" && item.operationId && !input.updated.operations.some((op) => op.operationId === item.operationId) ? { ...item, operationId: undefined, reason: "removed_from_card", status: "unfinished" as const } : item)),
      status,
    },
    now: input.now,
    requestId,
  });
  emitTrace({ cardId: input.updated.actionId, requestId, revision: input.updated.revision, textChanged: text !== (answer?.text ?? null), type: "request.card_refreshed" });
  return Boolean(amended);
}

/** The routes' hook: the request's document in this process's entry store follows its card. */
export function conversationCardHook(mode: FeatureMode, actorId: string | null): ((card: AgentActionPreviewContract) => Promise<void>) | undefined {
  if (!actorId) return undefined;
  return async (card) => {
    const store = configuredAgentEntryStore(mode);
    if (store) await refreshCardInDocument({ actorId, now: new Date().toISOString(), store, updated: card });
  };
}
