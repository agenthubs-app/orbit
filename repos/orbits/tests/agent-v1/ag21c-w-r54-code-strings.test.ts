/**
 * AG21c R54 (W): code-written card and click-reply strings showed internal words, repeated themselves or rewrote an
 * earlier turn. Rules in code, each with its test:
 * - an English import card's rows use ": ", and the item does not repeat the card's count title as its first line;
 * - a revision asked for in words leaves the delivered turn's text as it was (the new revision is in the new turn);
 * - the import receipt counts a row the card left out (no name) as skipped, never failed;
 * - a new to-do's text line names the people the card row names;
 * - the delete plan offers to unlink only the kinds that are actually linked;
 * - the transcript's changed-row line uses the card's label and a shown date, never a field name or an ISO date.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { refreshCardInDocument } from "../../features/agent-v1/entry/card-document";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { cardLineOf } from "../../features/agent-v1/propose/copy";
import { EVENT_WORDS } from "../../features/agent-v1/propose/events-copy";
import { applyApprovedContactImport } from "../../features/agent-v1/domains/contact/apply";
import { prepareContactOperation } from "../../features/agent-v1/domains/contact/prepare";
import { CONTACT_IMPORT } from "../../features/agent-v1/domains/contact/types";
import { todoOperationText } from "../../features/agent/runtime/todo-operations";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { cardText } from "../agent-eval/lib/cards";
import { ACTOR, createCardKit, freeze } from "../services/agent-ledger-card-kit";

test("R54 an English import card: ': ' in its rows; the item opens with what it is, not the count title again", async () => {
  const reader = { actorId: "actor:a", listActive: async () => [] } as never;
  const op = await prepareContactOperation({ actionId: "agact_x", index: 0, intent: { capability: CONTACT_IMPORT, overrides: {}, text: "Name,Company\nIvy Holt,Kestrel Books\n,Nameless Co" } as never, locale: "en", reader, revision: 1 });
  const lines = String(op!.preview).split("\n");
  assert.doesNotMatch(op!.preview, /：/u, op!.preview);
  assert.match(lines[1], /^Row 1 Ivy Holt: New/u, lines[1]);
  assert.doesNotMatch(lines[0], /new, .* skipped/u, "the count title is the card's, not the item's first line");
});

test("R54 a new to-do's text line names the person the card row names", () => {
  const op = { after: { plannedDate: "2026-11-27", relatedContactIds: ["contact:ih"], title: "给Ivy寄样书" }, capability: "todo.create", shown: { names: { "contact:ih": "Ivy Holt" } } };
  assert.match(todoOperationText(op as never, "zh"), /关联人 Ivy Holt/u);
  assert.match(todoOperationText(op as never, "en"), /About Ivy Holt/u);
});

test("R54 the delete plan offers to unlink only the kinds that are linked (no 日程 without a schedule item)", () => {
  const onlyNote = EVENT_WORDS.askDeletePlan("zh", "竹影茶会", ["笔记「茶会记」"], true, ["memo"]);
  assert.doesNotMatch(onlyNote, /日程|待办/u, onlyNote);
  assert.match(onlyNote, /笔记可以只解除和这场活动的关联/u);
  const en = EVENT_WORDS.askDeletePlan("en", "Bamboo tea", ['note "Tea"', 'to-do "Thank-you card"'], false, ["memo", "todo"]);
  assert.match(en, /Notes and to-dos can just be unlinked/u);
  assert.doesNotMatch(en, /schedule/u);
});

test("R54 a revision asked for in words leaves the delivered turn's text as delivered; the card follows", async () => {
  const kit = createCardKit();
  const requestId = "agreq_r54_keep";
  const card = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "给Ivy寄样书" } }]);
  const origin = { conversationId: "session:r54", kind: "conversation" as const, requestId };
  const shown = agentCardPreview({ ...(await kit.runtime.getAction(card.actionId))!, origin }, null, kit.now());
  const store = createMemoryAgentEntryStore();
  const now = kit.now();
  const delivered = `好的。\n\n${cardLineOf(shown, "zh")}`;
  await store.accept({ actorId: ACTOR, clientMessageId: "m1", fingerprint: "f", input: { locale: "zh", message: "…", references: [] }, leaseMs: 60_000, now, requestId, sessionId: "session:r54", workerId: "w" });
  await store.claimNext({ actorId: ACTOR, leaseMs: 60_000, now, sessionId: "session:r54", workerId: "w" });
  await store.finish({ actorId: ACTOR, now, outcome: { actionPreview: shown, answer: { sourceRefs: [], text: delivered }, partResults: [{ partId: "p1", status: "awaiting_confirmation" }], status: "completed" }, requestId, workerId: "w" });
  const revised = { ...shown, operations: shown.operations.map((op) => ({ ...op, text: `${op.text}（改）` })), payloadHash: "changed", revision: shown.revision + 1 };
  assert.equal(await refreshCardInDocument({ actorId: ACTOR, keepText: true, now: kit.now(), previous: shown, store, updated: revised }), true);
  const record = await store.get(ACTOR, requestId);
  assert.equal(record?.document.answer?.text, delivered, "turn 1 says what it said then");
  assert.equal(record?.document.actionPreview?.revision, shown.revision + 1, "its card is the new revision");
});

test("R54 the import receipt counts the nameless row the card left out as skipped, not failed", async () => {
  const batch = (counts: Record<string, number>) => ({ counts, id: "batch:r54", status: "reviewing" });
  const imports = {
    commit: async () => ({ batch: batch({ created: 1, failed: 1, merged: 0, skipped: 0 }) }),
    listRows: async () => ({ nextCursor: null, rows: [{ decision: "create", issues: [], seq: 1 }, { decision: null, issues: ["missing_name"], seq: 2 }] }),
    setDecisions: async () => ({ batch: batch({ created: 0, failed: 0, merged: 0, skipped: 0 }) }),
    upload: async () => ({ batch: batch({ created: 0, failed: 0, merged: 0, skipped: 0 }) }),
  };
  const result = await applyApprovedContactImport({ actorId: "actor:a", imports } as never, { outcomes: { 1: "create", 2: "skip" }, text: "Name,Company\nIvy Holt,Kestrel Books\n,Nameless Co" }, { idempotencyKey: "k" });
  assert.match(result.summary, /"skipped":1/u, result.summary);
  assert.match(result.summary, /"failed":0/u, result.summary);
});

test("R54 the transcript's changed row: the card's label and a shown date, never 'plannedDate' or an ISO date", () => {
  const lines = cardText({ actionId: "agact_y", changes: [{ field: "plannedDate", now: "2026-11-19", operationId: "op1", shownBefore: "2026-11-18" }], operations: [{ display: { change: "update", record: "待办「x」", rows: [{ after: "11月19日", field: "plannedDate", label: "计划日期" }] }, operationId: "op1", status: "pending", text: "x" }], revision: 2, status: "awaiting_confirmation", title: "修改1项" } as never);
  const changed = lines.find((line) => line.includes("变化的行"))!;
  assert.match(changed, /计划日期：卡上原来是「11月18日」，现在是「11月19日」/u, changed);
  assert.doesNotMatch(changed, /plannedDate|2026-11/u);
});
