import assert from "node:assert/strict";
import { test } from "node:test";

import { reviseCardByWords, type CardRevisionDeps } from "../../features/agent-v1/entry/card-revision";
import { isTypedAgreement, runWithConfirmBoundary } from "../../features/agent-v1/entry/confirm-boundary";
import { rememberRevisedRecords } from "../../features/agent-v1/graph/executor";
import { createMemoryAgentSessionStateStore, emptySessionState } from "../../features/agent-v1/context/session-state";
import { createCardKit, decide, type CardKit } from "../services/agent-ledger-card-kit";

/**
 * AE-XL-014 / AE-XL-015 (设计稿 §3.7, §3.10, §5.1): what the conversation says about the card still waiting for the click.
 *
 * - XL-014: 「不是这条，是给李薇寄样片那条」 right after a card that moves 「给小林发修订报价」 to Friday is a correction of the card's
 *   object. It used to reach the graph as a new statement (the intent review found no write verb), so the card stayed on the
 *   wrong to-do. Now code gives the card its next revision with the other to-do and the same change, and the to-do and its
 *   person become the records mentioned last (the next 「她」 is 李薇).
 * - XL-015: 「好，就按刚才那条建吧」 while the card waits only agrees in words. It used to reach the answer model (it read as if
 *   done, no pointer to the card). Now code answers with the reminder and shows the waiting card; no model, no decision.
 */

const SESSION = "session:xl";

async function freezeIn(kit: CardKit, intents: Parameters<NonNullable<CardKit["runtime"]["freezeCard"]>>[0]["intents"], requestId = "req:xl1") {
  const frozen = await kit.runtime.freezeCard!({ actionId: `card:${requestId}`, intents, locale: "zh", origin: { conversationId: SESSION, kind: "conversation", requestId } });
  return frozen.action!;
}

/** The to-dos whose title holds the words, with the person each is about (as the executor reads them from the records). */
function findTodosIn(kit: CardKit, people: Record<string, { id: string; name: string }> = {}): NonNullable<CardRevisionDeps["findTodos"]> {
  return async (words) => (await kit.listTasks()).filter((task) => task.status === "open" && task.title.includes(words)).map((task) => ({ id: task.id, people: people[task.title] ? [people[task.title]] : [], title: task.title }));
}

const revise = (kit: CardKit, message: string, extra: Partial<CardRevisionDeps> = {}) => reviseCardByWords({ actorId: "actor:xl", message, now: kit.now, runtime: kit.runtime, sessionId: SESSION, store: null, timeZone: "Asia/Tokyo", findTodos: findTodosIn(kit), ...extra });

test("XL-014: 「不是这条，是X那条」 moves the card's change to the to-do X — revision 2, same new date, the old revision cannot be confirmed", async () => {
  const kit = createCardKit();
  const wrong = await kit.todo("给小林发修订报价", "2026-11-18");
  const meant = await kit.todo("给李薇寄样片", "2026-11-12");
  const card = await freezeIn(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: wrong.id }]);
  const lead = { id: "contact:liwei", name: "李薇" };
  const result = await revise(kit, "不是这条，是给李薇寄样片那条。", { findTodos: findTodosIn(kit, { 给李薇寄样片: lead }) });
  assert.ok(result, "a correction of the card's object is about the card");
  assert.equal(result!.actionPreview!.revision, 2);
  assert.deepEqual(result!.actionPreview!.operations.map((op) => [op.capability, (op as unknown as { target?: { id: string } }).target?.id, op.after]), [["todo.update", meant.id, { plannedDate: "2026-11-20" }]]);
  assert.match(result!.text, /「给李薇寄样片」/u);
  assert.match(result!.text, /「给小林发修订报价」/u);
  assert.match(result!.text, /点卡上的「确认以上1项」/u);
  assert.deepEqual(result!.mentioned?.map((item) => [item.type, item.id, item.name]), [["todo", meant.id, "给李薇寄样片"], ["contact", "contact:liwei", "李薇"]]);
  assert.equal((await decide(kit, card, "confirm", "d:old"))?.reason, "CARD_REVISION_CHANGED", "the revision on the wrong to-do is refused");
  assert.equal(kit.executorCalls.length, 0);
});

test("XL-014: other forms of the correction (zh, ja, en); none found or several found is said, the card left alone; other words are not a correction", async () => {
  const kit = createCardKit();
  const wrong = await kit.todo("给小林发修订报价", "2026-11-18");
  await kit.todo("给李薇寄样片", "2026-11-12");
  await kit.todo("送り状を発送", "2026-11-12");
  await kit.todo("Send the deck to Emily", "2026-11-12");
  await kit.todo("回复王强的报价", "2026-11-12");
  await kit.todo("回复田中的报价", "2026-11-12");
  await freezeIn(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: wrong.id }]);
  const none = await revise(kit, "不是这个，是给王磊订机票那个");
  assert.match(none!.text, /没有找到「给王磊订机票」/u);
  assert.equal((await kit.runtime.getAction("card:req:xl1"))!.revision ?? 1, 1);
  const two = await revise(kit, "不是这条，是报价那条");
  assert.match(two!.text, /「回复王强的报价」/u);
  assert.match(two!.text, /卡片还没有改/u);
  for (const message of ["把给李薇寄样片那条也改到周五", "李薇是摄影师", "不是这条", "这条不是我的"]) assert.equal(await revise(kit, message), null, message);
  const ja = await revise(kit, "それじゃなくて、送り状を発送の方");
  assert.match(ja!.actionPreview!.operations[0].text, /送り状を発送/u);
  const en = await revise(kit, "not that one, the Send the deck to Emily one");
  assert.match(en!.actionPreview!.operations[0].text, /Send the deck to Emily/u);
});

test("XL-014: the records the correction named become the ones mentioned last (the next 「她」 is that person)", async () => {
  const store = createMemoryAgentSessionStateStore();
  const before = emptySessionState(SESSION, "2026-11-15T01:00:00.000Z");
  before.lastMentioned = [{ at: "2026-11-15T01:00:00.000Z", id: "task:wrong", name: "给小林发修订报价", type: "todo" }];
  await store.put("actor:xl", before);
  await rememberRevisedRecords(store, "actor:xl", SESSION, [{ id: "task:meant", name: "给李薇寄样片", type: "todo" }, { id: "contact:liwei", name: "李薇", type: "contact" }], "2026-11-15T01:00:05.000Z");
  const after = await store.get("actor:xl", SESSION);
  assert.deepEqual(after!.lastMentioned.map((item) => [item.type, item.id]), [["contact", "contact:liwei"], ["todo", "task:meant"]]);
});

test("XL-015: 「好，就按刚才那条建吧」 while the card waits — the reminder and the waiting card, no model call, no decision", async () => {
  assert.equal(isTypedAgreement("好，就按刚才那条建吧。"), true);
  assert.equal(isTypedAgreement("就按刚才那条建，但改到周四"), false);
  assert.equal(isTypedAgreement("好，帮我建个待办"), false);
  assert.equal(isTypedAgreement("确认一下明天有什么安排"), false);
  const kit = createCardKit();
  const card = await freezeIn(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-20", title: "回复他的报价" } }]);
  let modelCalls = 0;
  const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: "好，就按刚才那条建吧。", requestId: "req:xl3", run: async () => { modelCalls += 1; return { reply: "这条待办按「周五前回复田中浩的报价」来立即可", sourceRefs: [] }; }, sessionId: SESSION });
  assert.equal(modelCalls, 0);
  assert.equal(result.modelCalled, false);
  assert.equal(result.actionPreview?.actionId, card.actionId, "the waiting card is shown again");
  assert.match(result.text, /卡片还在等你确认[\s\S]*请点卡上的「确认以上1项」/u);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
  assert.equal((await kit.listTasks()).length, 0);
});
