/**
 * agent-design AG12-4 (设计稿 §5.1 "改内容…只生成新版本，走普通消息或点选"; PLANNER 易错边界 7): while an import card of this
 * conversation waits for the click, the user's words about its rows ("第一行的王强不是同一个人，也新建", "Create row 1
 * too") change those rows' decisions. Code reads the row numbers and the decision (import-preview.ts rowOverridesIn) and
 * the card is frozen again as the next revision — no model call, nothing written; the earlier revision can no longer be
 * confirmed. The request that showed the card shows the new revision too (card-document.ts).
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { cardIntentOf, type CardOperationIntent } from "../../agent/runtime/card-operations";
import { agentCardPreview } from "../../agent/runtime/card-view";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { cardLocale } from "../../agent/runtime/todo-operations";
import { CONTACT_WORDS } from "../domains/contact/copy";
import { rowOverridesIn, type ImportPreview } from "../domains/contact/import-preview";
import { CONTACT_IMPORT, type ContactImportIntent } from "../domains/contact/types";
import { emitTrace } from "../observability/trace";
import { cardLineOf } from "../propose/copy";
import type { AgentEntryExecuteResult } from "./service";
import type { AgentEntryStore } from "./store";
import { refreshCardInDocument } from "./card-document";

export async function reviseImportByWords(input: { runtime: AgentRuntimeService; store: AgentEntryStore | null; actorId: string; sessionId: string; message: string; now: () => string }): Promise<AgentEntryExecuteResult | null> {
  const overrides = rowOverridesIn(input.message);
  if (!overrides || !input.runtime.reviseCard) return null;
  const waiting = await input.runtime.listActions({ status: "awaiting_confirmation", workflowKey: "agent_v1_card" }).catch(() => []);
  const card = [...waiting]
    .filter((action) => action.origin?.kind === "conversation" && action.origin.conversationId === input.sessionId && action.operations.some((op) => op.capability === CONTACT_IMPORT))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!card) return null;
  const intents = card.operations.map((op) => cardIntentOf(op, card.operations)).filter((intent): intent is CardOperationIntent => intent !== null)
    .map((intent) => (intent.capability === CONTACT_IMPORT ? { ...intent, overrides: { ...(intent as ContactImportIntent).overrides, ...overrides } } : intent));
  const before = agentCardPreview(card, await input.runtime.getRun(card.runId), input.now());
  const countsOf = (ops: readonly { capability?: string; shown?: unknown }[]) => ((ops.find((item) => item.capability === CONTACT_IMPORT)?.shown ?? {}) as { counts?: ImportPreview["counts"] }).counts ?? { create: 0, duplicate: 0, skip: 0 };
  const beforeCounts = countsOf(card.operations);
  const rowsOf = (ops: readonly { capability?: string; shown?: unknown }[]) => ((ops.find((item) => item.capability === CONTACT_IMPORT)?.shown ?? {}) as { rows?: { row: number; outcome: string }[] }).rows ?? [];
  // AG21b (R27): a row the words name that already has that decision is not "changed": said so; with nothing else to change,
  // the card is not revised at all.
  const rowsBefore = rowsOf(card.operations);
  const already = Object.keys(overrides).map(Number).filter((row) => rowsBefore.find((item) => item.row === row)?.outcome === overrides[String(row)]).sort((left, right) => left - right);
  const alreadyLine = (language: ReturnType<typeof cardLocale>) => (["create", "skip"] as const).map((decision) => {
    const rows = already.filter((row) => overrides[String(row)] === decision);
    return rows.length ? CONTACT_WORDS.importRowsAlready(language, rows, decision) : "";
  }).filter(Boolean).join("\n");
  if (already.length && already.length === Object.keys(overrides).length) {
    const language = cardLocale(card.locale);
    const cardLine = cardLineOf(before, language);
    emitTrace({ cardId: card.actionId, rows: already, type: "contact.import_rows_already" });
    return {
      actionPreview: before,
      cardLine,
      partResults: [{ operationId: before.operations[0]?.operationId, partId: "p1", reason: "card_unchanged", route: "propose_write", sourceQuote: input.message, status: "awaiting_confirmation" }],
      sourceRefs: [],
      status: "completed",
      text: `${alreadyLine(language)}\n\n${cardLine}`,
    };
  }
  const revised = await input.runtime.reviseCard({ actionId: card.actionId, intents });
  if (!revised || revised.outcome !== "revised") return null;
  const action = await input.runtime.getAction(card.actionId);
  if (!action) return null;
  const preview: AgentActionPreviewContract = agentCardPreview(action, await input.runtime.getRun(action.runId), input.now());
  if (input.store) await refreshCardInDocument({ actorId: input.actorId, now: input.now(), previous: before, store: input.store, updated: preview, keepText: true }).catch(() => false);
  const language = cardLocale(action.locale);
  const counts = countsOf(action.operations);
  const rows = Object.keys(overrides).map(Number).sort((left, right) => left - right);
  // AG20b (TRIAGE R12): a row the words name that the card could not change (no such row, or a row without a name) is said
  // so; the reply never says a row changed when the card did not.
  const rowsAfter = rowsOf(action.operations);
  const stuck = rows.filter((row) => rowsAfter.find((item) => item.row === row)?.outcome !== overrides[String(row)]);
  const changed = rows.filter((row) => !stuck.includes(row) && !already.includes(row));
  const revisedLead = !changed.length ? "" : changed.every((row) => overrides[String(row)] === "skip") ? CONTACT_WORDS.importRevisedSkip(language, changed, beforeCounts, counts) : CONTACT_WORDS.importRevised(language, changed, beforeCounts, counts);
  const lead = [revisedLead, already.length ? alreadyLine(language) : "", stuck.length ? CONTACT_WORDS.importRowsUnchanged(language, stuck) : ""].filter(Boolean).join("\n");
  if (stuck.length) emitTrace({ cardId: card.actionId, rows: stuck, type: "contact.import_rows_unchanged" });
  const cardLine = cardLineOf(preview, language);
  emitTrace({ cardId: card.actionId, overrides, revision: preview.revision, type: "contact.import_revised" });
  return {
    actionPreview: preview,
    cardLine,
    partResults: [{ operationId: preview.operations[0]?.operationId, partId: "p1", reason: "card_revised", route: "propose_write", sourceQuote: input.message, status: "awaiting_confirmation" }],
    sourceRefs: [],
    status: "completed",
    text: `${lead}\n\n${cardLine}`,
  };
}
