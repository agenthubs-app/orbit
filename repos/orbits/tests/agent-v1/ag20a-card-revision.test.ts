import assert from "node:assert/strict";
import { test } from "node:test";

import { reviseCardByWords } from "../../features/agent-v1/entry/card-revision";
import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createCardKit, decide, type CardKit } from "../services/agent-ledger-card-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { byNode } from "./functions-kit";

/**
 * agent-design AG20a R1 (设计稿 §5.1, §5.2, §3.10; independent suite TP-WRT-010, TP-EVT-003 turn 2): a card waiting for the
 * click is changed by a message — an item dropped, a value changed, this time or the series — as a new revision by code
 * (no model). The earlier revision can never be confirmed after that; the revised card lists exactly what will be written;
 * nothing is written before the click. Data here is this sprint's own.
 */

const SESSION = "session:r1";

async function freezeIn(kit: CardKit, intents: Parameters<NonNullable<CardKit["runtime"]["freezeCard"]>>[0]["intents"], requestId = "req:r1") {
  const frozen = await kit.runtime.freezeCard!({ actionId: `card:${requestId}`, intents, locale: "zh", origin: { conversationId: SESSION, kind: "conversation", requestId } });
  return frozen.action!;
}

const revise = (kit: CardKit, message: string, extra: Partial<Parameters<typeof reviseCardByWords>[0]> = {}) => reviseCardByWords({ actorId: "actor:r1", message, now: kit.now, runtime: kit.runtime, sessionId: SESSION, store: null, timeZone: "Asia/Tokyo", ...extra });

const TWO_TODOS = [
  { capability: "todo.create" as const, set: { plannedDate: "2026-11-19", title: "订展台搭建公司" } },
  { capability: "todo.create" as const, set: { plannedDate: "2026-11-20", title: "整理音响设备清单" } },
];

test("R1: 'X那项不要了' drops that item — revision 2 lists only the rest; revision 1 can no longer be confirmed; only the rest is written after the click", async () => {
  const kit = createCardKit();
  const card = await freezeIn(kit, TWO_TODOS);
  assert.equal(card.operations.length, 2);
  const result = await revise(kit, "设备清单那项不要了");
  assert.ok(result, "the words are about the card");
  assert.equal(result!.actionPreview!.revision, 2);
  assert.deepEqual(result!.actionPreview!.operations.map((op) => op.text), ["新增待办「订展台搭建公司」，计划日 11月19日（周四）"]);
  assert.match(result!.text, /已从卡上去掉「整理音响设备清单」。卡片从「新增2项」更新为「新增1项」/u);
  assert.equal(kit.executorCalls.length, 0, "nothing is executed by a message");
  assert.equal((await kit.listTasks()).length, 0, "nothing is written before the click");
  const stale = await decide(kit, card, "confirm", "d:old");
  assert.equal(stale?.reason, "CARD_REVISION_CHANGED", "the old revision with both items is refused");
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.equal((await kit.listTasks()).length, 0, "still nothing written");
  const fresh = (await kit.runtime.getAction(card.actionId))!;
  const accepted = await decide(kit, fresh, "confirm", "d:new");
  assert.equal(accepted?.accepted, true);
  await kit.runtime.processOutbox({ actionId: card.actionId });
  assert.deepEqual((await kit.listTasks()).map((task) => task.title), ["订展台搭建公司"], "exactly what the revised card listed");
});

test("R1: other ways to name the item; words that name none of it, or another request, leave the card alone", async () => {
  const kit = createCardKit();
  const card = await freezeIn(kit, TWO_TODOS);
  // "那项不要了" with two items: which one — the card is not changed.
  const which = await revise(kit, "那项不要了");
  assert.match(which!.text, /你说的是哪一项？卡上有「订展台搭建公司」、「整理音响设备清单」。卡片还没有改。/u);
  assert.equal((await kit.runtime.getAction(card.actionId))!.revision ?? 1, 1);
  // Not about the card: left to the graph.
  for (const message of ["今天天气怎么样", "帮我新建一条待办：给王强回电话", "不用了，谢谢", "把李薇从联系人里删掉"]) assert.equal(await revise(kit, message), null, message);
  assert.equal((await kit.runtime.getAction(card.actionId))!.revision ?? 1, 1);
  // By its place on the card.
  const second = await revise(kit, "第一项先不加了");
  assert.deepEqual(second!.actionPreview!.operations.map((op) => op.text), ["新增待办「整理音响设备清单」，计划日 11月20日（周五）"]);
  // AE-XL-016: taking the last item off calls the card off — it is rejected as its reject button does, nothing written.
  const last = await revise(kit, "整理音响设备清单这项也不要了");
  assert.equal(last!.text, "好，这条先不建了。");
  assert.equal((await kit.runtime.getAction(card.actionId))!.status, "rejected");
  assert.equal((await kit.listTasks()).length, 0);
  // Another conversation's card is never touched.
  assert.equal(await reviseCardByWords({ actorId: "actor:r1", message: "第一项先不加了", now: kit.now, runtime: kit.runtime, sessionId: "session:other", store: null, timeZone: "Asia/Tokyo" }), null);
});

test("R1: English and Japanese words drop an item too", async () => {
  const kit = createCardKit();
  await freezeIn(kit, [{ capability: "todo.create", set: { title: "Book the booth crew" } }, { capability: "todo.create", set: { title: "Sort the audio gear list" } }]);
  const english = await revise(kit, "Drop the audio gear one");
  assert.equal(english!.actionPreview!.operations.length, 1);
  const kitJa = createCardKit();
  await freezeIn(kitJa, [{ capability: "todo.create", set: { title: "会場の下見" } }, { capability: "todo.create", set: { title: "機材リストの整理" } }]);
  const japanese = await revise(kitJa, "機材リストのほうはいらない");
  assert.equal(japanese!.actionPreview!.operations.length, 1);
});

test("R1: 'X改到周五' changes the value on the card as the next revision; a deadline word changes the deadline", async () => {
  const kit = createCardKit();
  const card = await freezeIn(kit, TWO_TODOS);
  const moved = await revise(kit, "设备清单那项改到下周二");
  assert.equal(moved!.actionPreview!.revision, 2);
  assert.match(moved!.actionPreview!.operations[1].text, /整理音响设备清单」，计划日 11月17日（周二）/u);
  assert.match(moved!.actionPreview!.operations[0].text, /11月19日/u, "the other item is as it was");
  assert.equal((await decide(kit, card, "confirm", "d:stale"))?.reason, "CARD_REVISION_CHANGED");
  // One dated item: the words need not name it.
  const one = createCardKit();
  await freezeIn(one, [{ capability: "todo.create", set: { plannedDate: "2026-11-19", title: "寄回签好的合同" } }]);
  const due = await revise(one, "截止改成周五中午");
  assert.match(due!.actionPreview!.operations[0].text, /截止 11月20日（周五） 12:00/u);
  // Two dated items and no name: ask, do not guess.
  const two = createCardKit();
  await freezeIn(two, TWO_TODOS);
  const unsure = await revise(two, "改到周五吧");
  assert.match(unsure!.text, /你说的是哪一项？/u);
});

test("R1: 就这一次 / 整个系列 on a repeating schedule item — the card already saying so is left alone; the other scope is a new revision", async () => {
  const kit = createCardKit();
  const series = { endsAt: "2026-11-04T00:00:00.000Z", recurrence: "weekly", startsAt: "2026-11-03T23:30:00.000Z", timeZone: "Asia/Tokyo" };
  const card = await freezeIn(kit, [{ capability: "schedule.update", set: { endsAt: "2026-11-18T00:00:00.000Z", occurrenceDate: "2026-11-18", scope: "this_occurrence", startsAt: "2026-11-17T23:30:00.000Z" }, shown: { before: { endsAt: "2026-11-17T23:00:00.000Z", startsAt: "2026-11-17T22:30:00.000Z" }, repeats: "weekly", timeZone: "Asia/Tokyo", title: "晨会" }, targetId: "schedule:standup" } as never]);
  const deps = { readSchedule: async () => series };
  const same = await revise(kit, "就这一次", deps);
  assert.match(same!.text, /卡上的「晨会」已经是「只改这一次（11月18日（周三））」了/u);
  assert.equal((await kit.runtime.getAction(card.actionId))!.revision ?? 1, 1);
  const whole = await revise(kit, "不对，整个系列都改", deps);
  assert.equal(whole!.actionPreview!.revision, 2);
  const op = (await kit.runtime.getAction(card.actionId))!.operations[0];
  assert.equal((op.payload as { scope?: string }).scope, "series");
  assert.equal((op.payload as { patch: { startsAt: string } }).patch.startsAt, "2026-11-03T23:30:00.000Z", "the series keeps its first day, at the new time");
});

test("R1 through the entry: turn 2 '设备清单那项不要了' revises the turn-1 card without a model call; a click on the old revision writes nothing", async () => {
  const kit = createCardKit();
  const message1 = "帮我新建两条待办：订展台搭建公司，整理音响设备清单。";
  const understood = json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [], requiredCapabilities: ["todo.create"], sourceQuote: message1 })], plainChat: false });
  const proposed = json({ operations: [
    { dependsOn: [], entity: "todo", fields: [{ name: "title", valueText: "订展台搭建公司" }], localId: "w1", partId: "p1", verb: "create" },
    { dependsOn: [], entity: "todo", fields: [{ name: "title", valueText: "整理音响设备清单" }], localId: "w2", partId: "p1", verb: "create" },
  ] });
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
  assert.equal(first.actionPreview?.operations.length, 2, JSON.stringify(first.answer));
  const shown = (await kit.runtime.getAction(first.actionPreview!.actionId))!;
  const second = await send("设备清单那项不要了", 2);
  assert.equal(model.calls.length, 2, "no model call for the revision");
  assert.equal(second.actionPreview?.revision, 2);
  assert.deepEqual(second.actionPreview?.operations.map((op) => op.text), ["新增待办「订展台搭建公司」"]);
  const earlier = (await getRequestResult(deps, { actorId: "actor:a", requestId: first.requestId }))!;
  assert.equal(earlier.actionPreview?.revision, 2, "the turn that showed the card shows the new revision");
  assert.equal((await decide(kit, shown, "confirm", "d:old"))?.reason, "CARD_REVISION_CHANGED");
  await kit.runtime.processOutbox({ actionId: shown.actionId });
  assert.equal((await kit.listTasks()).length, 0, "the click on the old revision wrote nothing");
});
