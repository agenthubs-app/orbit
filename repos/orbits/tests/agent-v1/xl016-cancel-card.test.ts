import assert from "node:assert/strict";
import { test } from "node:test";

import { reviseCardByWords } from "../../features/agent-v1/entry/card-revision";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { acceptMessage, getRequestResult, listSessionEvents, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createCardKit, decide, type CardKit } from "../services/agent-ledger-card-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { byNode } from "./functions-kit";

/**
 * AE-XL-016 (设计稿 §3.7, §5.1): 「算了先别建」 / 「やっぱりやめとく」 / "never mind, don't create it" while a card waits for the
 * click. The write was dropped, but the card kept waiting for confirmation. Now an explicit cancel of the waiting card's
 * change rejects the card as its reject button does (state rejected, the decision recorded, the turn that showed the card
 * shows it rejected), with a short reply. A cancel that names something else, or 「先等等」 (hold), leaves the card waiting.
 */

const SESSION = "session:xl016";

async function freezeIn(kit: CardKit, intents: Parameters<NonNullable<CardKit["runtime"]["freezeCard"]>>[0]["intents"], requestId = "req:c1", locale = "zh") {
  const frozen = await kit.runtime.freezeCard!({ actionId: `card:${requestId}`, intents, locale, origin: { conversationId: SESSION, kind: "conversation", requestId } });
  return frozen.action!;
}

const revise = (kit: CardKit, message: string) => reviseCardByWords({ actorId: "actor:c", message, now: kit.now, runtime: kit.runtime, sessionId: SESSION, store: null, timeZone: "Asia/Tokyo" });

const ONE_TODO = [{ capability: "todo.create" as const, set: { plannedDate: "2026-11-18", title: "寄样片" } }];

test("XL-016: 「算了先别建」 rejects the waiting card — status rejected, nothing written, a confirm afterwards is refused", async () => {
  const kit = createCardKit();
  const card = await freezeIn(kit, ONE_TODO);
  const result = await revise(kit, "算了先别建。");
  assert.ok(result, "an explicit cancel is about the waiting card");
  assert.equal(result!.text, "好，这条先不建了。");
  assert.equal(result!.actionPreview, undefined, "no card in the cancel turn");
  assert.equal(result!.partResults?.[0]?.status, "answered");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected", "the card no longer waits");
  assert.equal((await decide(kit, card, "confirm", "d:after"))?.reason, "CARD_CLOSED");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.listTasks()).length, 0);
  assert.equal(kit.executorCalls.length, 0);
});

test("XL-016: other explicit cancels (zh, ja, en; a whole card of several items; a non-create card) reject it, in the user's language", async () => {
  const cases: { message: string; locale?: string; intents?: Parameters<typeof freezeIn>[1]; reply: RegExp }[] = [
    { message: "算了，不建了", reply: /^好，这条先不建了。$/u },
    { message: "先别建了吧", reply: /^好，这条先不建了。$/u },
    { message: "这条不要了", reply: /^好，这条先不建了。$/u },
    { message: "算了，寄样片那条别建了", reply: /^好，这条先不建了。$/u },
    { message: "取消吧", reply: /^好，这条先不建了。$/u },
    { locale: "ja", message: "やっぱりやめとく", reply: /^わかりました。今回は作成しません。$/u },
    { locale: "en", message: "never mind, don't create it", reply: /^OK, I won't create it\.$/u },
    { locale: "en", message: "Forget it.", reply: /^OK, I won't create it\.$/u },
    { intents: [...ONE_TODO, { capability: "todo.create" as const, set: { title: "订机票" } }], message: "算了，都不要建了", reply: /^好，这几条先不建了。$/u },
  ];
  for (const item of cases) {
    const kit = createCardKit();
    const card = await freezeIn(kit, item.intents ?? ONE_TODO, "req:c1", item.locale ?? "zh");
    const result = await revise(kit, item.message);
    assert.ok(result, item.message);
    assert.match(result!.text, item.reply, item.message);
    assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected", item.message);
  }
  // A card that changes a to-do: the reply says no change is made.
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freezeIn(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  const result = await revise(kit, "算了，先别改了");
  assert.equal(result!.text, "好，这次先不改了。");
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected");
});

test("XL-016: hold, a cancel that names something else, another request, or a change of an item leave the card waiting", async () => {
  const kit = createCardKit();
  const card = await freezeIn(kit, [...ONE_TODO, { capability: "todo.create" as const, set: { title: "订机票" } }]);
  for (const message of ["先等等", "等一下再建", "算了先别建，回头再说", "ちょっと待って", "hold on", "wait, not yet", "算了，别给王磊建了，给他发个邮件", "取消明天和王磊的会", "不用了，谢谢", "那个会议别建了"]) {
    const result = await revise(kit, message);
    assert.ok(result === null || result.actionPreview, message);
    assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation", message);
  }
  // Naming one item of several takes that item off (as before), the card still waits.
  const dropped = await revise(kit, "订机票那条先别建");
  assert.equal(dropped!.actionPreview!.operations.length, 1);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
});

test("XL-016: 「取消」 / \"cancel it\" on a card that changes an existing record is not read as calling the card off (it may mean the record)", async () => {
  const kit = createCardKit();
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freezeIn(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  for (const message of ["取消", "cancel it", "删掉那条"]) {
    await revise(kit, message);
    assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation", message);
  }
});

test("XL-016 through the entry: turn 2 「算了先别建」 — no model call, the turn-1 card shows rejected as after its reject button, both clients read it", async () => {
  const run = async (second: "words" | "button") => {
    const kit = createCardKit();
    const message1 = "给李薇建一个待办：下周三前寄样片。";
    const understood = json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [], requiredCapabilities: ["todo.create"], sourceQuote: message1 })], plainChat: false });
    const proposed = json({ operations: [{ dependsOn: [], entity: "todo", fields: [{ name: "title", valueText: "寄样片" }], localId: "w1", partId: "p1", verb: "create" }] });
    const model = deepseekStub(byNode({ propose: () => proposed, understand: () => understood }));
    const graph = graphKit(model.fetchImplementation, { records: recordAccessOf({ events: [], records: [] }) });
    const store = createMemoryAgentEntryStore();
    const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...graph.deps, entryStore: store, runtime: kit.runtime }), schedule: (task) => { void task(); }, sessions: null, store };
    const send = async (message: string, n: number) => {
      const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: `m:${n}`, locale: "zh", message, protocolVersion: 3, references: [], sessionId: SESSION } });
      await settleSession("actor:a", SESSION);
      return (await getRequestResult(deps, { actorId: "actor:a", requestId: receipt.requestId }))!;
    };
    const first = await send(message1, 1);
    assert.equal(first.actionPreview?.status, "awaiting_confirmation", JSON.stringify(first.answer));
    const calls = model.calls.length;
    let reply: string | null = null;
    if (second === "words") {
      const cancel = await send("算了先别建。", 2);
      assert.equal(model.calls.length, calls, "no model call for the cancel");
      reply = cancel.answer?.text ?? null;
      assert.equal(cancel.actionPreview, undefined);
    } else {
      const { handleCardDecision } = await import("../../features/agent/ledger/card-routes");
      const { refreshCardInDocument } = await import("../../features/agent-v1/entry/card-document");
      const card = (await kit.runtime.getAction(first.actionPreview!.actionId))!;
      await handleCardDecision({ actionId: card.actionId, body: { clientDecisionId: "click", payloadHash: card.payloadHash, revision: card.revision ?? 1, transition: "reject" }, onCardRevised: async (updated) => { await refreshCardInDocument({ actorId: "actor:a", now: kit.now(), store, updated }); }, processNow: false, runtime: kit.runtime, workerId: "w" });
    }
    const earlier = (await getRequestResult(deps, { actorId: "actor:a", requestId: first.requestId }))!;
    const events = await listSessionEvents(deps, { actorId: "actor:a", afterSeq: 0, sessionId: SESSION });
    return { earlier, events, kit, reply };
  };
  const words = await run("words");
  const button = await run("button");
  assert.equal(words.reply, "好，这条先不建了。");
  assert.equal(words.earlier.actionPreview?.status, "rejected", "the turn that showed the card shows it rejected");
  assert.equal(words.earlier.actionPreview?.status, button.earlier.actionPreview?.status);
  assert.deepEqual(words.earlier.actionPreview?.operations.map((op) => op.status), button.earlier.actionPreview?.operations.map((op) => op.status));
  assert.equal(words.earlier.answer?.text, button.earlier.answer?.text, "the delivered text of turn 1 is the same as after the button");
  assert.equal((await words.kit.listTasks()).length, 0);
  const seen = JSON.stringify(words.events);
  assert.match(seen, /"rejected"/u, "the session channel carries the rejected card to the other client");
});
