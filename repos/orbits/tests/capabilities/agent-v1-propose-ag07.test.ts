import assert from "node:assert/strict";
import test from "node:test";

import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "../agent-v1/graph-kit";
import { contact, smallWorld, todo } from "../agent-v1/read-kit";

/**
 * agent-design AG07 gate dev run 1 (AE-UIX-002, AE-UIX-007, AE-UIX-008), as code rules:
 * 1. A Latin-letter name ("Li Wei") that names no contact as written is matched against the contacts' names read
 *    out in pinyin (李薇 → li wei, either order); several of the reading → asked, never guessed.
 * 2. The user's words for a to-do that match none of the person's open to-dos as written:
 *    - written with the title's characters in order, only a few left out ("回复田中询价" → 「回复田中的询价」), and
 *      only one of them fits → that one;
 *    - in another script than the title (English or Japanese words, a Chinese title) and the person has one open
 *      to-do → that one (the words cannot be compared; the card shows the title and still needs a click).
 *    Words in the title's own script that match nothing still ask or say not found (AE-XL-009 unchanged).
 */
const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(
    contact(ACTOR, "contact:c31", "李薇", { organization: "自由职业", role: "摄影师" }),
    todo(ACTOR, "task:t45", "给李薇寄样片", { plannedDate: "2026-11-10", relatedContactId: "contact:c31" }),
    todo(ACTOR, "task:t44", "回复田中的询价", { dueAt: "2026-11-17T09:00:00.000Z", relatedContactId: "contact:c30" }),
    todo(ACTOR, "task:t50", "跟进田中的分期方案", { dueAt: "2026-11-14T09:00:00.000Z", relatedContactId: "contact:c30" }),
  );
  return base;
}

function cardsOver(records: ReturnType<typeof recordAccessOf>) {
  const repository = createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:test:agent-actor:actor:a" });
  const reader = {
    async read(taskId: string) {
      const view = (await records.reader.read("todo", records.scope(ACTOR), { id: taskId })).items[0];
      if (!view) return null;
      return { dueAt: (view.fields.dueAt as string) ?? null, plannedDate: (view.fields.plannedDate as string) ?? null, status: String(view.fields.status ?? "open"), title: String(view.fields.title), updatedAt: view.updatedAt };
    },
  };
  const runtime = createAgentRuntimeService({ cardReader: reader, executors: createAgentExecutorRegistry([]), now: () => NOW, repository });
  return ledgerCardAccess(runtime, () => NOW);
}

async function cardFor(message: string, language: "zh" | "ja" | "en", clue: { person: string; todo: string; date: string; field?: string }) {
  const understand = json({ language, parts: [part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: clue.person }, { entity: "todo", text: clue.todo }], requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false });
  const propose = json({ operations: [{ dateText: clue.date, dependsOn: [], entity: "todo", ...(clue.field ? { fields: [{ name: clue.field, valueText: clue.date }] } : {}), localId: "w1", partId: "p1", relations: [{ clue: clue.person, entity: "contact", role: "about" }], selector: { clues: [clue.todo] }, verb: "update" }] });
  const model = deepseekStub((call: ModelCall) => (call.node === "understand" ? understand : call.node === "propose" ? propose : (() => { throw new Error(`unexpected ${call.node}`); })()));
  const records = recordAccessOf(world());
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cardsOver(records);
  return runAgentGraph(kit.deps, kit.input(message, { locale: language }));
}

test("AE-UIX-008 shape: 'Li Wei' is 李薇 read in pinyin; her one open to-do, named in English, is the one changed", async () => {
  const message = "Can you push the to-do about sending Li Wei the sample prints to November 17?";
  const result = await cardFor(message, "en", { date: "November 17", person: "Li Wei", todo: "the to-do about sending Li Wei the sample prints" });
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t45", result.text);
  assert.deepEqual(result.actionPreview?.operations[0].after, { plannedDate: "2026-11-17" });
});

test("AE-UIX-007 shape: Japanese words for a Chinese title, the person's one open to-do → the card", async () => {
  const message = "小林さんの見積もりのToDoは金曜に変更して。";
  const result = await cardFor(message, "ja", { date: "金曜", person: "小林", todo: "見積もりのToDo" });
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t42", result.text);
  assert.deepEqual(result.actionPreview?.operations[0].after, { plannedDate: "2026-11-20" });
});

test("AE-UIX-002 shape: '回复田中询价' is 「回复田中的询价」 with one character left out; the other to-do of 田中 does not fit", async () => {
  const message = "把回复田中询价这条待办的截止时间改到 11 月 18 日下午六点。";
  const result = await cardFor(message, "zh", { date: "11 月 18 日下午六点", person: "田中", todo: "回复田中询价这条待办" });
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t44", result.text);
  assert.deepEqual(Object.keys(result.actionPreview?.operations[0].after ?? {}), ["dueAt"]);
});

test("stab2 (AE-UIX-002): the same words with no person given by the model still find 「回复田中的询价」 by its characters in order", async () => {
  const message = "把回复田中询价这条待办的截止时间改到 11 月 18 日下午六点。";
  const understand = json({ language: "zh", parts: [part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "todo", text: "回复田中询价这条待办" }], requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false });
  const propose = json({ operations: [{ dateText: "11 月 18 日下午六点", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [], selector: { clues: ["回复田中询价这条待办"] }, verb: "update" }] });
  const model = deepseekStub((call: ModelCall) => (call.node === "understand" ? understand : propose));
  const records = recordAccessOf(world());
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cardsOver(records);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "zh" }));
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t44", result.text);
});

test("gate (AE-XL-005): the first layer says 'missing_one' for 把报价待办改到周五; the to-do is named and the day said, so code finds it and freezes the card", async () => {
  const message = "把报价待办改到周五";
  const understand = json({ language: "zh", parts: [part({ clarity: "missing_one", deliverable: "change", localId: "p1", objectClues: [{ entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: message })], plainChat: false });
  const propose = json({ operations: [{ dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [], selector: { clues: ["报价待办"] }, verb: "update" }] });
  const model = deepseekStub((call: ModelCall) => (call.node === "understand" ? understand : propose));
  const records = recordAccessOf(world());
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cardsOver(records);
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "zh" }));
  assert.equal(result.actionPreview?.operations[0].target?.id, "task:t42", result.text);
  const vague = deepseekStub([json({ language: "zh", parts: [part({ clarity: "missing_one", deliverable: "change", localId: "p1", objectClues: [{ entity: "todo", text: "那条待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把那条待办改一下" })], plainChat: false })]);
  const kit2 = graphKit(vague.fetchImplementation, { now: NOW, records });
  kit2.deps.cards = cardsOver(records);
  const asked = await runAgentGraph(kit2.deps, kit2.input("把那条待办改一下", { locale: "zh" }));
  assert.equal(asked.actionPreview, null, "no day said and no own words: still asked");
});

test("AE-XL-009 unchanged: Chinese words that fit none of the person's Chinese to-dos still do not pick one", async () => {
  const message = "把给小林寄合同那条待办改到周五。";
  const result = await cardFor(message, "zh", { date: "周五", person: "小林", todo: "给小林寄合同那条待办" });
  assert.equal(result.actionPreview, null);
  assert.match(result.text, /没有找到/u);
});
