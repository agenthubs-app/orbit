import assert from "node:assert/strict";
import { test } from "node:test";

import { reviseCardByWords } from "../../features/agent-v1/entry/card-revision";
import { resolvePartIntents } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { ACTOR, ctxOf, partOf } from "./ag20b-kit";
import { recordAccessOf } from "./graph-kit";
import { contact, todo } from "./read-kit";

/**
 * Three defects seen in AE-XL-018..021 runs:
 *
 * 1. a card revision whose card summary does not change says what changed (the item and its new value), never "X → X";
 * 2. 「把A和B这两条待办都改到周五」: one part, two to-do changes — each is found by its own words (never both clues at once), a
 *    pick answers only the change it was asked for, and the same record is never twice on a card;
 * 3. 「周五给王强回电话，下周三订会议室」 read as one part: the person named in one clause is not linked to the other clause's to-do.
 */

const span = (message: string, words: string, from = 0): [number, number] => {
  const at = message.indexOf(words, from);
  assert.ok(at >= 0, `"${words}" in the message`);
  return [at, at + words.length];
};

// ---- 1 ----

test("defect 1: 「王强那条改到下周二」 on a card of two new to-dos says which item got which day, never 「新增2项」→「新增2项」", async () => {
  const kit = createCardKit();
  const frozen = await kit.runtime.freezeCard!({
    actionId: "card:req:fix3",
    intents: [
      { capability: "todo.create", set: { plannedDate: "2026-11-20", relatedContactIds: ["contact:wq"], title: "给王强回电话" }, shown: { names: { "contact:wq": "王强" } } },
      { capability: "todo.create", set: { plannedDate: "2026-11-18", title: "订会议室" } },
    ] as never,
    locale: "zh",
    origin: { conversationId: "session:fix3", kind: "conversation", requestId: "req:fix3" },
  });
  assert.ok(frozen.action, JSON.stringify(frozen));
  const result = await reviseCardByWords({ actorId: "actor:fix3", message: "王强那条改到下周二。", now: kit.now, runtime: kit.runtime, sessionId: "session:fix3", store: null, timeZone: "Asia/Tokyo" });
  assert.ok(result, "the words are about the card");
  const lead = result!.text.split("\n")[0];
  assert.doesNotMatch(lead, /从「([^」]+)」更新为「\1」/u, lead);
  assert.match(lead, /「给王强回电话」/u);
  assert.match(lead, /11月17日（周二）/u, lead);
  const ops = (await kit.runtime.getAction("card:req:fix3"))!.operations.map((op) => op.preview);
  assert.match(ops[0], /11月17日（周二）/u);
  assert.match(ops[1], /11月18日（周三）/u);
});

test("defect 1: when the summary does change (an item taken off), the reply still says from → to", async () => {
  const kit = createCardKit();
  await kit.runtime.freezeCard!({
    actionId: "card:req:fix3b",
    intents: [
      { capability: "todo.create", set: { plannedDate: "2026-11-20", title: "给王强回电话" } },
      { capability: "todo.create", set: { plannedDate: "2026-11-18", title: "订会议室" } },
    ] as never,
    locale: "zh",
    origin: { conversationId: "session:fix3b", kind: "conversation", requestId: "req:fix3b" },
  });
  const result = await reviseCardByWords({ actorId: "actor:fix3", message: "订会议室那条不要了", now: kit.now, runtime: kit.runtime, sessionId: "session:fix3b", store: null, timeZone: "Asia/Tokyo" });
  assert.match(result!.text, /从「新增2项」更新为「新增1项」/u);
});

// ---- 2 ----

function twoTodoWorld() {
  return { events: [], records: [
    todo(ACTOR, "task:xiaolin", "给小林发修订报价", { plannedDate: "2026-11-18" }),
    todo(ACTOR, "task:liwei", "给李薇寄样片", { plannedDate: "2026-11-10" }),
    todo(ACTOR, "task:other", "整理展会照片", { plannedDate: "2026-11-19" }),
  ] };
}

function bothMessage() {
  const message = "把给小林发修订报价和给李薇寄样片这两条待办都改到周五。";
  const a = span(message, "给小林发修订报价");
  const b = span(message, "给李薇寄样片");
  const intents: StoredIntent[] = [
    { capability: "todo.update", date: span(message, "周五"), localId: "w1", relations: [], selector: [a] },
    { capability: "todo.update", date: span(message, "周五"), localId: "w2", relations: [], selector: [b] },
  ];
  const part = partOf(message, message, { refs: [{ entity: "todo", quote: a, recordId: null }, { entity: "todo", quote: b, recordId: null }] });
  return { intents, message, part };
}

const targets = (outcome: Awaited<ReturnType<typeof resolvePartIntents>>) => (outcome.kind === "ready" ? outcome.ops.map((op) => (op as { targetId?: string }).targetId) : []);

test("defect 2: two existing to-dos named in one change are each found by their own words — one card, one item per to-do", async () => {
  const { intents, message, part } = bothMessage();
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(twoTodoWorld()), message), part, { intents, picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.deepEqual(targets(outcome), ["task:xiaolin", "task:liwei"]);
  assert.ok(outcome.kind === "ready" && outcome.ops.every((op) => (op as { set?: { plannedDate?: string } }).set?.plannedDate === "2026-11-20"));
});

test("defect 2: a pick answers only the change it was asked about; the other keeps its own record (never the same to-do twice)", async () => {
  const { intents, message, part } = bothMessage();
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(twoTodoWorld()), message), part, { intents, picks: { todo: "task:liwei" } });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.deepEqual(targets(outcome), ["task:xiaolin", "task:liwei"]);
});

test("defect 2: a name that fits several to-dos asks about that one only (its own candidates); the other is not in the question", async () => {
  const world = twoTodoWorld();
  world.records.push(todo(ACTOR, "task:expo2", "整理展会报价单", { plannedDate: "2026-11-21" }));
  const message = "把整理展会那条和给李薇寄样片这两条待办都改到周五。";
  const a = span(message, "整理展会那条");
  const b = span(message, "给李薇寄样片");
  const intents: StoredIntent[] = [
    { capability: "todo.update", date: span(message, "周五"), localId: "w1", relations: [], selector: [a] },
    { capability: "todo.update", date: span(message, "周五"), localId: "w2", relations: [], selector: [b] },
  ];
  const part = partOf(message, message, { refs: [{ entity: "todo", quote: a, recordId: null }, { entity: "todo", quote: b, recordId: null }] });
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(world), message), part, { intents, picks: {} });
  assert.equal(outcome.kind, "ask", JSON.stringify(outcome));
  const ids = outcome.kind === "ask" && "candidates" in outcome.question ? outcome.question.candidates.map((item) => item.id).sort() : [];
  assert.deepEqual(ids, ["task:expo2", "task:other"]);
  // The answer picks one of them: the card has both to-dos, each once.
  const answered = await resolvePartIntents(ctxOf(recordAccessOf(world), message), part, { intents, picks: { todo: "task:expo2" } });
  assert.deepEqual(targets(answered), ["task:expo2", "task:liwei"]);
});

test("defect 2: two changes that land on the same to-do are one item on the card (never the same record twice)", async () => {
  const message = "把给李薇寄样片改到周五，给李薇寄样片那条也改到周五。";
  const intents: StoredIntent[] = [
    { capability: "todo.update", date: span(message, "周五"), localId: "w1", relations: [], selector: [span(message, "给李薇寄样片")] },
    { capability: "todo.update", date: span(message, "周五", 12), localId: "w2", relations: [], selector: [span(message, "给李薇寄样片那条")] },
  ];
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(twoTodoWorld()), message), partOf(message, message), { intents, picks: {} });
  assert.deepEqual(targets(outcome), ["task:liwei"]);
});

// ---- 3 ----

function wangWorld() {
  return { events: [], records: [contact(ACTOR, "contact:wq", "王强", { organization: "青木商事" })] };
}

const people = (outcome: Awaited<ReturnType<typeof resolvePartIntents>>) => (outcome.kind === "ready" ? outcome.ops.map((op) => ((op as { set?: { relatedContactIds?: string[] } }).set?.relatedContactIds ?? [])) : []);

test("defect 3: one part of two new to-dos — 王强 of 「周五给王强回电话」 is not linked to 「下周三订会议室」", async () => {
  const message = "帮我新建两条待办：周五给王强回电话，下周三订会议室。";
  const wang = span(message, "王强");
  const part = partOf(message, message, { capabilities: ["todo.create"], refs: [{ entity: "contact", quote: wang, recordId: null }] });
  // As the second layer gave it (AE-XL-018 failing runs): the first to-do relates to 王强, the second gives no relation.
  const withRelation: StoredIntent[] = [
    { capability: "todo.create", date: span(message, "周五"), localId: "w1", relations: [{ quote: wang, role: "about" }], selector: [], title: span(message, "给王强回电话") },
    { capability: "todo.create", date: span(message, "下周三"), localId: "w2", relations: [], selector: [], title: span(message, "订会议室") },
  ];
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(wangWorld()), message), part, { intents: withRelation, picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.deepEqual(people(outcome), [["contact:wq"], []]);
  // Neither gives a relation: the first layer's person goes to the to-do whose clause names him.
  const none = withRelation.map((intent) => ({ ...intent, relations: [] }));
  const second = await resolvePartIntents(ctxOf(recordAccessOf(wangWorld()), message), part, { intents: none, picks: {} });
  assert.deepEqual(people(second), [["contact:wq"], []]);
});

test("defect 3: a person said for the whole message (outside either clause) still goes with each to-do", async () => {
  const message = "给王强建两条待办：周五回电话，下周三发报价。";
  const wang = span(message, "王强");
  const part = partOf(message, message, { capabilities: ["todo.create"], refs: [{ entity: "contact", quote: wang, recordId: null }] });
  const intents: StoredIntent[] = [
    { capability: "todo.create", date: span(message, "周五"), localId: "w1", relations: [], selector: [], title: span(message, "回电话") },
    { capability: "todo.create", date: span(message, "下周三"), localId: "w2", relations: [], selector: [], title: span(message, "发报价") },
  ];
  const outcome = await resolvePartIntents(ctxOf(recordAccessOf(wangWorld()), message), part, { intents, picks: {} });
  assert.deepEqual(people(outcome), [["contact:wq"], ["contact:wq"]]);
});

test("defect 3: the first layer's prompt says two clauses with their own action and time are two parts, the person staying in its clause", async () => {
  const { understandSystemPrompt, UNDERSTAND_PROMPT_VERSION } = await import("../../features/agent-v1/understand/prompt");
  const prompt = understandSystemPrompt();
  assert.match(prompt, /each with its own action and its own day or time, are two parts/u);
  assert.match(prompt, /a person named in one clause is an objectClue of that part only/u);
  assert.equal(UNDERSTAND_PROMPT_VERSION, "understand@ag09.2");
});
