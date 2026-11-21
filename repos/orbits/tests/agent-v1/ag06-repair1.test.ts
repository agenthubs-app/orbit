import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph, resumeAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { proposableOf } from "../../features/agent-v1/graph/nodes/propose";
import { refreshCardInDocument } from "../../features/agent-v1/entry/card-document";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { cardLineOf } from "../../features/agent-v1/propose/copy";
import { replyLanguageOf } from "../../features/agent-v1/route/handoff-copy";
import { agentCardPreview } from "../../features/agent/runtime/card-view";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG06 repair round 1: the six defects of run-01's judging, each with its test first.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

function world(extra: (records: ReturnType<typeof smallWorld>["records"]) => void = () => {}) {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  extra(base.records);
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
  return { access: ledgerCardAccess(runtime, () => NOW), runtime };
}

const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

test("1 AE-SCL-008: 'まだ終わっていないToDo' with no status from the first layer reads and counts only the open ones", async () => {
  const records = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:suzuki", "鈴木健太", { organization: "東都精機" }));
    list.push(todo(ACTOR, "task:s1", "見積もりを送る", { relatedContactId: "contact:suzuki" }));
    list.push(todo(ACTOR, "task:s2", "図面を確認", { relatedContactId: "contact:suzuki" }));
    list.push(todo(ACTOR, "task:s3", "請求書を出す", { completedAt: "2026-11-01T00:00:00.000Z", relatedContactId: "contact:suzuki", status: "completed" }));
  }));
  let materials = "";
  const model = deepseekStub(byNode({
    answer: (call) => {
      materials = call.user;
      return json({ segments: [{ cites: [], partId: "p1", text: "2件です。" }] });
    },
    understand: () => json({ language: "ja", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "鈴木健太さん" }], requiredCapabilities: ["todo.read"], sourceQuote: "鈴木健太さん関連で、まだ終わっていないToDoは全部で何件ありますか。" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  const result = await runAgentGraph(kit.deps, kit.input("鈴木健太さん関連で、まだ終わっていないToDoは全部で何件ありますか。", { locale: "ja" }));
  assert.doesNotMatch(materials, /請求書を出す/u, "the finished to-do is not read");
  const coverage = result.partResults[0].coverage?.find((item) => item.kind === "todo");
  assert.equal(coverage?.total, 2, "the total counts what the read reads: the open ones");
});

test("2 AE-AMB-001 / AE-UND-015: kanji-only text is decided by the session or the locale, never by the model's guess alone (zh, ja, en)", () => {
  assert.equal(replyLanguageOf("小林", "ja", "zh").language, "zh", "a Chinese user's bare name is answered in Chinese");
  assert.equal(replyLanguageOf("明日予定確認", "ja", "ja").language, "ja");
  assert.equal(replyLanguageOf("明日予定確認", "zh", "ja").language, "ja", "the locale decides, not the report");
  assert.equal(replyLanguageOf("小林", "zh", "en").language, "en", "an English-locale user's bare kanji name: English");
  assert.equal(replyLanguageOf("小林", "ja", "zh", ["小林さんの予定を教えて"]).language, "ja", "the session's earlier Japanese messages decide before the locale");
  assert.equal(replyLanguageOf("小林", "zh", "ja", ["上次和小林聊了什么"]).language, "zh");
  assert.equal(replyLanguageOf("明日予定確認", "ja", "ja", ["What is on tomorrow?"]).language, "en", "an English session");
  // Not ambiguous: the report is checked against the text as before.
  assert.equal(replyLanguageOf("上次和小林聊了什么？", "zh", "ja").language, "zh");
});

test("3 AE-XL-003: a contact on a card is named by the contact's name, never by the pronoun, also after a resume", async () => {
  const records = recordAccessOf(world((list) => list.push(todo(ACTOR, "task:t43", "报价单内部审批", { plannedDate: "2026-11-17", relatedContactId: "contact:c17" }))));
  const cards = cardsOver(records);
  const sentence = "查上次和小林聊了什么，把报价待办改到周五，再记下他今天来过电话。";
  const model = deepseekStub(byNode({
    answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo "和小林聊了报价初稿/u.exec(call.user)?.[1] ?? "s1" }], partId: "p1", text: "聊了报价初稿。" }] }),
    propose: () => json({ operations: [
      { dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p2", selector: { clues: ["报价待办"] }, verb: "update" },
      { channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "他今天来过电话" }], localId: "w2", partId: "p3", relations: [{ clue: "他", entity: "contact", role: "actual_contact" }], verb: "create" },
    ] }),
    understand: () => json({ language: "zh", parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "查上次和小林聊了什么" }),
      part({ deliverable: "change", localId: "p2", objectClues: [{ entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把报价待办改到周五" }),
      part({ deliverable: "change", localId: "p3", objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["memo.create"], sourceQuote: "再记下他今天来过电话" }),
    ], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(sentence);
  const first = await runAgentGraph(kit.deps, input);
  const t43 = first.clarifications[0].options.find((option) => option.ref?.id === "task:t43")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: t43.optionId });
  const memo = resumed.actionPreview!.operations.find((op) => op.capability === "memo.create")!;
  assert.match(memo.text, /实际往来对象 小林健，/u);
  assert.doesNotMatch(memo.text, /实际往来对象 他/u);
  // AG21c R55 (supersedes the AG06 wording): the title drops the relative day (it is the date field) and the body names the
  // contact instead of the pronoun; otherwise the body is the user's words.
  assert.match(memo.text, /^新增往来笔记「小林健来过电话」/u, "the title on the card names the person too");
  assert.equal((memo.after as { body: string }).body, "小林健今天来过电话", "the user's words, the pronoun replaced by the name");
});

test("4 AE-XL-006: after an item is taken off the card, the result document's card description follows the new version", async () => {
  const store = createMemoryAgentEntryStore();
  const records = recordAccessOf(world());
  const cards = cardsOver(records);
  const intents = [
    { capability: "todo.update" as const, partId: "p2", set: { plannedDate: "2026-11-20" }, targetId: "task:t42" },
    { capability: "memo.create" as const, partId: "p3", set: { body: "他今天来过电话", contactIds: ["contact:c17"], interaction: { actualContactIds: ["contact:c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-15", precision: "day" as const }, names: { "contact:c17": "小林健" }, title: "他今天来过电话" } },
  ];
  const requestId = "agreq_ag06r1";
  await store.accept({ actorId: ACTOR, clientMessageId: "m1", fingerprint: "f", input: { locale: "zh", message: "…", references: [] }, leaseMs: 60_000, now: NOW, requestId, sessionId: "session:a", workerId: "w" });
  await store.claimNext({ actorId: ACTOR, leaseMs: 60_000, now: NOW, sessionId: "session:a", workerId: "w" });
  const before = await cards.access.freeze({ intents, locale: "zh", requestId, sessionId: "session:a" });
  const oldLine = cardLineOf(before!, "zh");
  const finished = await store.finish({ actorId: ACTOR, now: NOW, outcome: { actionPreview: before!, answer: { sourceRefs: [], text: `聊了报价初稿。\n\n${oldLine}` }, partResults: [{ operationId: before!.operations[0].operationId, partId: "p2", status: "awaiting_confirmation" }, { operationId: before!.operations[1].operationId, partId: "p3", status: "awaiting_confirmation" }], status: "completed" }, requestId, workerId: "w" });
  assert.equal(finished.delivered, true);
  const record = { requestId };
  const action = (await cards.runtime.getAction(before!.actionId))!;
  await cards.runtime.editCard!({ actionId: action.actionId, payloadHash: action.payloadHash!, removeOperationId: action.operations[1].operationId, revision: 1 });
  const edited = (await cards.runtime.getAction(action.actionId))!;
  const preview = agentCardPreview(edited, await cards.runtime.getRun(edited.runId), NOW);
  await refreshCardInDocument({ actorId: ACTOR, now: NOW, previous: before!, store, updated: preview });
  const document = (await store.get(ACTOR, record.requestId))!.document;
  assert.equal(document.actionPreview?.revision, 2);
  assert.match(document.answer!.text, /确认卡（修改1项）/u);
  assert.doesNotMatch(document.answer!.text, /新增往来笔记/u, "the removed item is no longer described");
  assert.match(document.answer!.text, /^聊了报价初稿。/u, "the rest of the answer stays");
  assert.deepEqual(document.partResults.map((item) => [item.partId, item.status, item.reason ?? null]), [["p2", "awaiting_confirmation", null], ["p3", "unfinished", "removed_from_card"]], "the part taken off the card no longer waits for it");
});

test("5 AE-CTX-005: a to-do word with no time of day is not swallowed by schedule.create; the person's to-do is offered when the words do not match its title", async () => {
  assert.deepEqual(proposableOf({ capabilities: [], refs: [] } as never, "x"), [], "guard: nothing to propose without a write");
  const toDoPart = { capabilities: ["todo.read", "schedule.create"], refs: [] } as never;
  assert.deepEqual(proposableOf(toDoPart, "山本さんとの食事のToDo、11月20日（金）に予定を入れておいて。").sort(), ["todo.create", "todo.update"]);
  // AG13: schedule items can be written now; a time of day and no to-do word is a schedule entry (never a to-do).
  const scheduled = proposableOf(toDoPart, "11月20日の14時に山本さんとの食事の予定を入れておいて。");
  assert.ok(scheduled.includes("schedule.create") && !scheduled.includes("todo.create"), "a time of day and no to-do word: a schedule entry");
  const records = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版" }));
    list.push(todo(ACTOR, "task:t47", "约山本吃饭", { relatedContactId: "contact:c41" }));
  }));
  const cards = cardsOver(records);
  const message = "山本さんとの食事のToDo、11月20日（金）に予定を入れておいて。";
  const model = deepseekStub(byNode({
    propose: (call) => {
      assert.match(call.user, /todo\.update/u);
      return json({ operations: [{ dateText: "11月20日（金）", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "山本さん", entity: "contact", role: "about" }], selector: { clues: ["山本さんとの食事のToDo"] }, verb: "update" }] });
    },
    understand: () => json({ language: "ja", parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "山本さん" }, { entity: "todo", text: "山本さんとの食事のToDo" }], requiredCapabilities: ["todo.read", "schedule.create"], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(message, { locale: "ja" });
  // AG07 (AE-UIX-007): Japanese words, a Chinese title, the person's one open to-do → it is the card's (still a click).
  const only = await runAgentGraph(kit.deps, input);
  assert.doesNotMatch(only.text, /今はまだ|このバージョンでは/u, "not answered as not doable yet");
  assert.equal(only.actionPreview?.operations[0].target?.id, "task:t47");
  assert.deepEqual(only.actionPreview?.operations[0].after, { plannedDate: "2026-11-20" });
  // With two open to-dos of the person, neither matching the words: offered, not guessed (AG06 repair 1).
  const two = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版" }));
    list.push(todo(ACTOR, "task:t47", "约山本吃饭", { relatedContactId: "contact:c41" }));
    list.push(todo(ACTOR, "task:t48", "给山本寄稿件", { relatedContactId: "contact:c41" }));
  }));
  const kit2 = graphKit(model.fetchImplementation, { now: NOW, records: two });
  kit2.deps.cards = cardsOver(two).access;
  const input2 = kit2.input(message, { locale: "ja" });
  const first = await runAgentGraph(kit2.deps, input2);
  assert.deepEqual(first.clarifications[0]?.options.map((option) => option.ref?.id).sort(), ["task:t47", "task:t48"], "the person's to-dos are offered, not guessed");
  assert.equal(first.clarifications[0]?.options[0].capability, "todo.update", "the option leads to the to-do change, not to the unsupported schedule entry");
  const pick = first.clarifications[0].options.find((option) => option.ref?.id === "task:t47")!;
  const resumed = await resumeAgentGraph(kit2.deps, input2, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: pick.optionId });
  assert.deepEqual(resumed.actionPreview?.operations[0].after, { plannedDate: "2026-11-20" });
});

test("6 AE-XL-010: a nickname no contact is named by is never said not to exist; a partial match is offered", async () => {
  const nickname = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c21", "陈一鸣", { organization: "北辰软件", role: "法务" }))));
  const ask = deepseekStub(byNode({ understand: () => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小陈" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "我最近一次和小陈直接联系是什么时候？" })], plainChat: false }) }));
  const one = graphKit(ask.fetchImplementation, { now: NOW, records: nickname });
  const asked = await runAgentGraph(one.deps, one.input("我最近一次和小陈直接联系是什么时候？"));
  assert.doesNotMatch(asked.text, /没有找到/u);
  assert.deepEqual(asked.clarifications[0]?.options.map((option) => option.ref?.id), ["contact:c21"], "陈一鸣 is offered");
  const none = deepseekStub(byNode({ understand: () => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小周" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "我最近一次和小周直接联系是什么时候？" })], plainChat: false }) }));
  const two = graphKit(none.fetchImplementation, { now: NOW, records: recordAccessOf(world()) });
  const unknown = await runAgentGraph(two.deps, two.input("我最近一次和小周直接联系是什么时候？"));
  assert.doesNotMatch(unknown.text, /没有找到|不在你的联系人/u, "never 'not found' for a person");
  assert.match(unknown.text, /不确定你说的是哪一位/u);
});

test("1c AE-SCL-007 final3: \"when I first met him\" with no order from the first layer reads the oldest notes (zh, ja, en words)", async () => {
  const base = world((list) => {
    for (let day = 1; day <= 12; day += 1) list.push({ collection: "notes", id: `note:t${day}`, payload: { note: { accountId: ACTOR, body: `Note ${day} about Tomás.${day === 1 ? " He works at Halden Robotics." : ""}`, contactIds: ["contact:tomas"], createdAt: `2026-10-${String(day).padStart(2, "0")}T01:00:00.000Z`, eventIds: [], id: `note:t${day}`, ownerUserId: ACTOR, title: `Note ${day}`, updatedAt: `2026-10-${String(day).padStart(2, "0")}T01:00:00.000Z`, version: 1 } }, searchText: `Note ${day}`, userId: ACTOR, workspaceId: "workspace:test" });
    list.push(contact(ACTOR, "contact:tomas", "Tomás Rivera", { organization: "Northwind Automation" }));
  });
  let materials = "";
  const message = "Where was Tomás Rivera working when I first met him?";
  const model = deepseekStub(byNode({
    answer: (call) => {
      materials = call.user;
      return json({ segments: [{ cites: [], partId: "p1", text: "Halden Robotics." }] });
    },
    understand: () => json({ language: "en", parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "Tomás Rivera" }], requiredCapabilities: ["contact.read", "view.timeline"], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(base) });
  await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.match(materials, /Halden Robotics/u, "the first note is read although the first layer gave no order");
});

test("1b AE-SCL-008 dev3: search words that only name the person or their company (\"東都精機\") do not narrow the person's to-dos", async () => {
  const records = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:suzuki", "鈴木健太", { organization: "東都精機" }));
    list.push(todo(ACTOR, "task:s1", "見積もりを送る", { relatedContactId: "contact:suzuki" }));
    list.push(todo(ACTOR, "task:s2", "東都精機の求人票を更新する", { relatedContactId: "contact:suzuki" }));
  }));
  let materials = "";
  const message = "東都精機の鈴木健太さん関連で、まだ終わっていないToDoは全部で何件ありますか。";
  const model = deepseekStub(byNode({
    answer: (call) => {
      materials = call.user;
      return json({ segments: [{ cites: [], partId: "p1", text: "2件です。" }] });
    },
    understand: () => json({ language: "ja", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "contact", text: "東都精機の鈴木健太さん" }, { entity: "todo", text: "ToDo" }], readFilter: { status: "open", text: "東都精機" }, requiredCapabilities: ["contact.read", "todo.read"], sourceQuote: message })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.match(materials, /見積もりを送る/u, "a to-do without the company's name in its title is read too");
  assert.equal(result.partResults[0].coverage?.find((item) => item.kind === "todo")?.total, 2);
});
