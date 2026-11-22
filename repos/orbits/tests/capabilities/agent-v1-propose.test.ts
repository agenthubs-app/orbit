import assert from "node:assert/strict";
import test from "node:test";

import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { runAgentGraph, resumeAgentGraph } from "../../features/agent-v1/graph/build";
import { ledgerCardAccess } from "../../features/agent-v1/graph/executor";
import { resolveSaidDate } from "../../features/agent-v1/propose/dates";
import { contactKindOf, memoBodyOf } from "../../features/agent-v1/propose/resolve";
import { replyLanguageOf } from "../../features/agent-v1/route/handoff-copy";
import { isTypedAgreement, runWithConfirmBoundary } from "../../features/agent-v1/entry/confirm-boundary";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "../agent-v1/graph-kit";
import { contact, memo, smallWorld, todo } from "../agent-v1/read-kit";


/**
 * agent-design AG06-1/2 (设计稿 §1, §3.2, §3.11): the second layer through the graph, with a stub model.
 * One answer, one card, two items; the card's words are code's, frozen, dates with weekdays worked out from
 * asOf in Asia/Tokyo; a person of two names is asked about once for every part; only the to-do unclear →
 * the answer is delivered and only the to-do is asked about; "改到周五" with a planned date and a due time →
 * which field; nothing matching → said, never a new to-do. A model approval flag never reaches the card.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z"; // Sunday 10:00 in Tokyo
const SENTENCE = "查上次和小林聊了什么，把报价待办改到周五，再记下他今天来过电话。";

function world(extra: (records: ReturnType<typeof smallWorld>["records"]) => void = () => {}) {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  for (const record of base.records) if (record.userId === ACTOR && record.collection === "contacts") (record.payload as Record<string, unknown>).accountId = ACTOR;
  for (const record of base.records) if (record.userId === ACTOR && record.collection === "notes") ((record.payload as { note: Record<string, unknown> }).note).accountId = ACTOR;
  for (const record of base.records) if (record.userId === ACTOR && record.collection === "notes") ((record.payload as { note: Record<string, unknown> }).note).ownerUserId = ACTOR;
  extra(base.records);
  return base;
}

/** A ledger over memory whose card reader reads the same world as the graph. */
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

const understandXL = json({
  language: "zh",
  parts: [
    part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "查上次和小林聊了什么" }),
    part({ deliverable: "change", localId: "p2", objectClues: [{ entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把报价待办改到周五" }),
    part({ deliverable: "change", localId: "p3", objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["memo.create"], sourceQuote: "再记下他今天来过电话" }),
  ],
  plainChat: false,
});
const proposeXL = (extra: Record<string, unknown> = {}) => json({
  operations: [
    { dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p2", relations: [{ clue: "小林", entity: "contact", role: "about" }], selector: { clues: ["报价待办"] }, verb: "update", ...extra },
    { channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "他今天来过电话" }], localId: "w2", partId: "p3", relations: [{ clue: "他", entity: "contact", role: "actual_contact" }], verb: "create", ...extra },
  ],
  ...extra,
});
const answerXL = (call: ModelCall) => {
  const handle = /(s\d+) — memo "和小林聊了报价初稿/u.exec(call.user)?.[1] ?? "s1";
  return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handle }], partId: "p1", text: "11 月 12 日聊了报价初稿，小林希望把实施费单列。" }] });
};
const byNode = (replies: Record<string, (call: ModelCall) => string>) => (call: ModelCall) => {
  const reply = replies[call.node ?? ""];
  if (!reply) throw new Error(`unexpected model call in ${call.node}`);
  return reply(call);
};

test("小林: one answer, one card of two items — count sentence, values before and after, weekdays; three model calls; nothing written", async () => {
  const records = recordAccessOf(world());
  const cards = cardsOver(records);
  const model = deepseekStub(byNode({ answer: answerXL, propose: () => proposeXL(), understand: () => understandXL }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input(SENTENCE));
  assert.equal(model.calls.length, 3, "understand, propose, answer");
  assert.ok(result.actionPreview, "one card");
  const card = result.actionPreview!;
  assert.equal(card.title, "修改1项，新增1项");
  assert.deepEqual(card.operations.map((op) => op.capability), ["todo.update", "memo.create"]);
  assert.equal(card.operations[0].text, "待办「给小林发修订报价」：计划日 11月18日（周三） → 11月20日（周五）");
  assert.deepEqual(card.operations[0].after, { plannedDate: "2026-11-20" });
  // AG21c R55: the title drops the relative day (it is the date field).
  assert.match(card.operations[1].text, /^新增往来笔记「小林健来过电话」：实际往来对象 小林健，11月15日（周日），对方来电$/u);
  assert.deepEqual((card.operations[1].after as Record<string, unknown>).interaction, { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-15", precision: "day" });
  assert.match(result.text, /实施费单列/u, "the answer comes first");
  assert.ok(result.text.indexOf("实施费单列") < result.text.indexOf("确认卡（修改1项，新增1项）"), "then the card line");
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.status]), [["p1", "answered"], ["p2", "awaiting_confirmation"], ["p3", "awaiting_confirmation"]]);
  assert.equal(result.partResults.find((item) => item.partId === "p2")?.operationId, card.operations[0].operationId);
});

test("two people named 小林: one question for all three parts, no answer and no card before the pick; then all three go on", async () => {
  const records = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c18", "小林美咲", { organization: "青叶设计", role: "设计师" }))));
  const cards = cardsOver(records);
  const model = deepseekStub(byNode({ answer: answerXL, propose: () => proposeXL(), understand: () => understandXL }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(SENTENCE);
  const first = await runAgentGraph(kit.deps, input);
  assert.equal(first.clarifications.length, 1, "asked once");
  assert.deepEqual(first.clarifications[0].options.map((option) => option.label), ["小林健（北辰软件 · 销售总监）", "小林美咲（青叶设计 · 设计师）"]);
  assert.equal(first.actionPreview, null, "no card before the person is picked");
  assert.doesNotMatch(first.text, /实施费/u, "no answer before the person is picked");
  const option = first.clarifications[0].options.find((item) => item.ref?.id === "contact:c17")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: option.optionId });
  assert.match(resumed.text, /实施费单列/u);
  assert.deepEqual(resumed.actionPreview?.operations.map((op) => op.capability), ["todo.update", "memo.create"]);
  assert.deepEqual(((resumed.actionPreview!.operations[1].after as Record<string, unknown>).interaction as { actualContactIds: string[] }).actualContactIds, ["contact:c17"]);
  assert.ok(model.calls.length <= 4);
});

test("stab1 shape: the memo part depends on the read and the to-do part names nobody — still no card before the person is picked", async () => {
  const records = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c18", "小林美咲", { organization: "青叶设计", role: "设计师" }))));
  const cards = cardsOver(records);
  const understand = json({
    language: "zh",
    parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "查上次和小林聊了什么" }),
      part({ deliverable: "change", localId: "p2", objectClues: [{ entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把报价待办改到周五" }),
      part({ deliverable: "change", dependsOn: ["p1"], localId: "p3", objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["memo.create"], sourceQuote: "再记下他今天来过电话" }),
    ],
    plainChat: false,
  });
  const propose = json({ operations: [
    { dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p2", selector: { clues: ["报价待办"] }, verb: "update" },
    { channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "他今天来过电话" }], localId: "w2", partId: "p3", relations: [{ clue: "他", entity: "contact", role: "actual_contact" }], verb: "create" },
  ] });
  const model = deepseekStub(byNode({ answer: answerXL, propose: () => propose, understand: () => understand }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(SENTENCE);
  const first = await runAgentGraph(kit.deps, input);
  assert.equal(first.actionPreview, null, "no card while the person is being asked");
  assert.equal(first.clarifications.length, 1);
  assert.doesNotMatch(first.text, /要等/u, "no 'has to wait' line for the parts that go on with the question");
  const option = first.clarifications[0].options.find((item) => item.ref?.id === "contact:c17")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: option.optionId });
  assert.deepEqual(resumed.actionPreview?.operations.map((op) => op.capability), ["todo.update", "memo.create"]);
  assert.match(resumed.text, /实施费单列/u);
});

test("stab1 shape (AE-XL-011): \"log that Emily called me\" tagged attendance.create still becomes an interaction memo; other writes stay not done", async () => {
  const records = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c40", "Emily Carter", { organization: "Harbor Analytics" }))));
  const cards = cardsOver(records);
  const message = "Log that Emily called me today. She said she's moving to the Tokyo office in January.";
  const model = deepseekStub(byNode({
    answer: () => json({ segments: [{ partId: "p2", text: "That's a big move." }] }),
    propose: (call) => {
      assert.match(call.user, /capabilities: [^)]*memo\.create/u, "the second layer may make it a memo (AG13: among the event writes)");
      return json({ operations: [{ channel: "phone", dateText: "today", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "Emily called me today. She said she's moving to the Tokyo office in January." }], localId: "w1", partId: "p1", relations: [{ clue: "Emily", entity: "contact", role: "actual_contact" }], verb: "create" }] });
    },
    understand: () => json({ language: "en", parts: [
      part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: "Emily" }], requiredCapabilities: ["contact.read", "attendance.create"], sourceQuote: "Log that Emily called me today." }),
      part({ clarity: "statement", localId: "p2", sourceQuote: "She said she's moving to the Tokyo office in January." }),
    ], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
  assert.deepEqual(result.actionPreview?.operations.map((op) => op.capability), ["memo.create"]);
  // AG21c R55: the title drops the relative day (it is the date field).
  assert.match(result.actionPreview!.operations[0].text, /^New interaction note "Emily called me": with Emily Carter, Sun, Nov 15, they called$/u);
});

test("two quote to-dos: the answer is delivered, only the to-do is asked; the pick is honoured", async () => {
  const records = recordAccessOf(world((list) => list.push(todo(ACTOR, "task:t43", "报价单内部审批", { plannedDate: "2026-11-17", relatedContactId: "contact:c17" }))));
  const cards = cardsOver(records);
  const model = deepseekStub(byNode({ answer: answerXL, propose: () => proposeXL(), understand: () => understandXL }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(SENTENCE);
  const first = await runAgentGraph(kit.deps, input);
  assert.match(first.text, /实施费单列/u, "the answer is delivered");
  assert.equal(first.clarifications.length, 1);
  assert.equal(first.clarifications[0].partId, "p2");
  assert.deepEqual(first.clarifications[0].options.map((option) => option.ref?.id).sort(), ["task:t42", "task:t43"]);
  assert.equal(first.actionPreview, null);
  const t43 = first.clarifications[0].options.find((option) => option.ref?.id === "task:t43")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: t43.optionId });
  assert.equal(resumed.actionPreview?.operations.length, 2);
  assert.equal(resumed.actionPreview?.operations[0].text, "待办「报价单内部审批」：计划日 11月17日（周二） → 11月20日（周五）");
});

test("a planned date and a due time and words that name neither: ask which; the field picked is the only one changed", async () => {
  const records = recordAccessOf(world((list) => {
    const t42 = list.find((record) => record.id === "task:t42")!;
    (t42.payload as { task: Record<string, unknown> }).task.dueAt = "2026-11-25T09:00:00.000Z";
  }));
  const cards = cardsOver(records);
  const message = "小林那条发修订报价的待办，改到周五。";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "about" }], selector: { clues: ["发修订报价的待办"] }, verb: "update" }] }),
    understand: () => json({ language: "zh", parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }, { entity: "todo", text: "发修订报价的待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "小林那条发修订报价的待办，改到周五" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(message);
  const first = await runAgentGraph(kit.deps, input);
  assert.deepEqual(first.clarifications[0].options.map((option) => [option.optionId, option.label]), [["plannedDate", "改计划日期（现在是11月18日（周三））"], ["dueAt", "改截止时间（现在是11月25日（周三） 18:00）"]]);
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: "plannedDate" });
  assert.deepEqual(resumed.actionPreview?.operations[0].after, { plannedDate: "2026-11-20" });
});

test("改 with no matching to-do: said, no card, never a new to-do", async () => {
  const records = recordAccessOf(world());
  const cards = cardsOver(records);
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ dateText: "周五", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "about" }], selector: { clues: ["给小林寄合同那条待办"] }, verb: "update" }] }),
    understand: () => json({ parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "给小林寄合同那条待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "把给小林寄合同那条待办改到周五" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input("把给小林寄合同那条待办改到周五。"));
  assert.equal(result.actionPreview, null);
  // AG06 repair 1: the words match none of 小林's to-dos, so his are offered ("可以问是不是指这一条"); never a new to-do.
  assert.match(result.text, /没有找到「给小林寄合同」这样的待办，所以还没有改。是指「给小林发修订报价」/u);
  assert.doesNotMatch(result.text, /新建|已改/u);
  assert.deepEqual(result.partResults.map((item) => item.status), ["awaiting_clarification"]);
});

test("a model approval flag and account id in the propose output are stripped before the card; neither reaches the card or the ledger", async () => {
  const records = recordAccessOf(world());
  const cards = cardsOver(records);
  const trace = captureTrace();
  try {
    const model = deepseekStub(byNode({ answer: answerXL, propose: () => proposeXL({ accountId: "user_agent_eval_b", approved: true }), understand: () => understandXL }));
    const kit = graphKit(model.fetchImplementation, { now: NOW, records });
    kit.deps.cards = cards.access;
    const result = await runAgentGraph(kit.deps, kit.input(SENTENCE));
    const rejected = trace.events.find((event) => event.type === "model.approval_claims_rejected" && event.where === "propose");
    assert.ok(rejected, "the claims are reported");
    assert.ok((rejected!.found as string[]).includes("$.approved") && (rejected!.found as string[]).some((path) => path.endsWith(".accountId")));
    const stored = await cards.runtime.getAction(result.actionPreview!.actionId);
    const serialized = JSON.stringify(stored);
    assert.doesNotMatch(serialized, /"approved"|user_agent_eval_b|"accountId"/u, "the ledger card carries neither");
    assert.equal(stored?.status, "awaiting_confirmation");
    assert.equal(stored?.approvedAt, undefined);
  } finally {
    trace.restore();
  }
});

test("先…成功了再…: the second item waits for the first on the card", async () => {
  const records = recordAccessOf(world());
  const cards = cardsOver(records);
  const message = "先记下小林今天来过电话；这条记成功了，再把报价待办改到周五。";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [
      { channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "小林今天来过电话" }], localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "actual_contact" }], verb: "create" },
      { dateText: "周五", dependsOn: [], entity: "todo", localId: "w2", partId: "p2", selector: { clues: ["报价待办"] }, verb: "update" },
    ] }),
    understand: () => json({ parts: [
      part({ deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "先记下小林今天来过电话" }),
      part({ deliverable: "change", dependsOn: ["p1"], localId: "p2", objectClues: [{ entity: "todo", text: "报价待办" }], requiredCapabilities: ["todo.update"], sourceQuote: "这条记成功了，再把报价待办改到周五" }),
    ], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input(message));
  const ops = result.actionPreview!.operations;
  assert.deepEqual(ops.map((op) => op.capability), ["memo.create", "todo.update"]);
  assert.deepEqual(ops[1].dependsOn, [ops[0].operationId]);
  assert.match(ops[1].text, /第1项成功后才执行/u);
});

test("a person only mentioned is linked, never the actual contact; the body is the user's words", async () => {
  const records = recordAccessOf(world((list) => list.push(contact(ACTOR, "contact:c21", "小陈"))));
  const cards = cardsOver(records);
  const message = "记一下：小林今天来电话了，说小陈还在审合同。";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ channel: "phone", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "小林今天来电话了，说小陈还在审合同" }], localId: "w1", partId: "p1", relations: [{ clue: "小林", entity: "contact", role: "actual_contact" }, { clue: "小陈", entity: "contact", role: "mentioned" }], verb: "create" }] }),
    understand: () => json({ parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "记一下：小林今天来电话了，说小陈还在审合同。" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input(message));
  const after = result.actionPreview!.operations[0].after as { body: string; contactIds: string[]; interaction: { actualContactIds: string[] } };
  assert.equal(after.body, "小林今天来电话了，说小陈还在审合同");
  assert.deepEqual(after.contactIds.sort(), ["contact:c17", "contact:c21"]);
  assert.deepEqual(after.interaction.actualContactIds, ["contact:c17"]);
});

test("dates in words are worked out by code from asOf in Asia/Tokyo (zh, ja, en)", () => {
  const at = (text: string) => resolveSaidDate(text, NOW, "Asia/Tokyo");
  assert.deepEqual(at("周五"), { day: "2026-11-20" });
  assert.deepEqual(at("金曜日"), { day: "2026-11-20" });
  assert.deepEqual(at("Thursday"), { day: "2026-11-19" });
  assert.deepEqual(at("今天"), { day: "2026-11-15" });
  assert.deepEqual(at("today"), { day: "2026-11-15" });
  assert.deepEqual(at("明日"), { day: "2026-11-16" });
  assert.deepEqual(at("11 月 30 日"), { day: "2026-11-30" });
  assert.deepEqual(at("November 30"), { day: "2026-11-30" });
  assert.deepEqual(at("11月19日の18時"), { day: "2026-11-19", time: "18:00" });
  assert.deepEqual(at("下周三"), { day: "2026-11-18" }, "weeks start on Monday: on Sunday 11-15 next week begins on 11-16");
  assert.deepEqual(resolveSaidDate("周五", "2026-11-14T16:00:00.000Z", "Asia/Tokyo"), { day: "2026-11-20" }, "UTC Saturday 16:00 is Sunday in Tokyo");
  assert.equal(at("改一下"), null);
});

test("the kind of contact is read from the user's words where they say it; the body drops only the instruction", () => {
  assert.deepEqual(contactKindOf("他今天来过电话"), { channel: "phone", direction: "incoming" });
  assert.deepEqual(contactKindOf("Emily called me today."), { channel: "phone", direction: "incoming" });
  assert.deepEqual(contactKindOf("今日山本さんから電話があった"), { channel: "phone", direction: "incoming" });
  assert.deepEqual(contactKindOf("我给小林打了电话"), { channel: "phone", direction: "outgoing" });
  assert.equal(memoBodyOf("记一下：张伟今天来过电话。"), "张伟今天来过电话");
  assert.equal(memoBodyOf("Log that Emily called me today."), "Emily called me today");
});

test("reply language: the first layer's report, checked against the text (zh, ja, en); a report that does not fit falls back", () => {
  assert.deepEqual(replyLanguageOf("明日予定確認", "ja", "ja"), { language: "ja", source: "locale" }, "AG06 repair 1: kanji only — the locale decides, not the report");
  assert.equal(replyLanguageOf("明日予定確認", undefined, "ja").language, "ja", "AG06 repair 1: Han-only text without a report follows the locale");
  const mixed = "帮我查一下山本さん那边的原稿我答应哪天交，还有 Emily 说要 by Friday 发给我的那个是什么东西。";
  assert.deepEqual(replyLanguageOf(mixed, "zh", "zh"), { language: "zh", source: "reported" });
  assert.equal(replyLanguageOf(mixed, "ja", "zh").source, "rule", "a Chinese sentence with さん is not taken as Japanese");
  assert.equal(replyLanguageOf("山本さんと前回何を話したか確認して、原稿を送るToDoを金曜日に変更して。", "zh", "ja").language, "ja", "Japanese prose reported as Chinese: rejected, the rule gives Japanese");
  assert.deepEqual(replyLanguageOf("Log that Emily called me today.", "en", "en"), { language: "en", source: "reported" });
  assert.equal(replyLanguageOf("Log that Emily called me today.", "zh", "en").language, "en", "English reported as Chinese: rejected");
  assert.equal(replyLanguageOf("查一下 Emily 的待办", "en", "zh").language, "zh", "a Chinese sentence with one English name is not English");
});

test("typed agreement after a closed card: code's sentence only, no model call, nothing proceeds", async () => {
  assert.equal(isTypedAgreement("やっぱりさっきの内容で進めてください。OKです。"), true);
  assert.equal(isTypedAgreement("确认一下明天有什么安排"), false, "asking to check something is not agreement");
  assert.equal(isTypedAgreement("go ahead with that"), true);
  const closed = { actionId: "action:closed", origin: { conversationId: "session:a", kind: "conversation" as const, requestId: "r0" }, status: "rejected" as const, updatedAt: NOW };
  const runtime = { getAction: async () => null, getRun: async () => null, listActionPage: async (input: { status?: string }) => ({ actions: input.status ? [] : [closed], nextCursor: undefined }) } as never;
  let ran = 0;
  const result = await runWithConfirmBoundary({ now: () => NOW, runtime }, { locale: "ja", message: "やっぱりさっきの内容で進めてください。OKです。", requestId: "r1", run: async () => { ran += 1; return { reply: "この内容で進めます。", sourceRefs: [] }; }, sessionId: "session:a" });
  assert.equal(ran, 0, "the model is not asked");
  assert.equal(result.modelCalled, false);
  assert.match(result.text, /^先ほどのカードは却下済みのため、実行できません。/u);
  assert.doesNotMatch(result.text, /進めます/u);
});

test("two people of the full name, only a memo: ask with company and role, only the two of that name; the card names the one picked with it", async () => {
  const records = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:lc01", "张伟", { organization: "曜石半导体", role: "工艺整合总监" }));
    list.push(contact(ACTOR, "contact:lc02", "张伟", { organization: "岚图机器人", role: "人力资源总监" }));
    list.push(contact(ACTOR, "contact:lc03", "张伟东", { organization: "别家" }));
    list.push(contact(ACTOR, "contact:lc04", "张薇", { organization: "别家" }));
  }));
  const cards = cardsOver(records);
  const message = "记一下：张伟今天来过电话。";
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ channel: "phone", dateText: "今天", dependsOn: [], direction: "incoming", entity: "memo", fields: [{ name: "body", valueText: "张伟今天来过电话" }], localId: "w1", partId: "p1", relations: [{ clue: "张伟", entity: "contact", role: "actual_contact" }], verb: "create" }] }),
    understand: () => json({ parts: [part({ deliverable: "change", objectClues: [{ entity: "contact", text: "张伟" }], requiredCapabilities: ["memo.create"], sourceQuote: "记一下：张伟今天来过电话。" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const input = kit.input(message);
  const first = await runAgentGraph(kit.deps, input);
  assert.equal(first.actionPreview, null, "no card before the person is picked");
  assert.deepEqual(first.clarifications[0].options.map((option) => option.label).sort(), ["张伟（岚图机器人 · 人力资源总监）", "张伟（曜石半导体 · 工艺整合总监）"]);
  const pick = first.clarifications[0].options.find((option) => option.ref?.id === "contact:lc02")!;
  const resumed = await resumeAgentGraph(kit.deps, input, { clarificationId: first.clarifications[0].clarificationId, kind: "select", optionId: pick.optionId });
  assert.match(resumed.actionPreview!.operations[0].text, /实际往来对象 张伟（岚图机器人 · 人力资源总监）/u);
  assert.deepEqual(((resumed.actionPreview!.operations[0].after as Record<string, unknown>).interaction as { actualContactIds: string[] }).actualContactIds, ["contact:lc02"]);
});

test("a title that holds the person's name is found by its own words (\"约山本吃饭\"), among the person's to-dos", async () => {
  const records = recordAccessOf(world((list) => {
    list.push(contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版" }));
    list.push(todo(ACTOR, "task:t47", "约山本吃饭", { relatedContactId: "contact:c41" }));
  }));
  const cards = cardsOver(records);
  const model = deepseekStub(byNode({
    propose: () => json({ operations: [{ dateText: "11 月 21 日", dependsOn: [], entity: "todo", localId: "w1", partId: "p1", relations: [{ clue: "山本", entity: "contact", role: "about" }], selector: { clues: ["约山本吃饭"] }, verb: "update" }] }),
    understand: () => json({ parts: [part({ deliverable: "change", objectClues: [{ entity: "todo", text: "约山本吃饭" }], requiredCapabilities: ["todo.update"], sourceQuote: "把约山本吃饭这条待办的计划日定在 11 月 21 日" })], plainChat: false }),
  }));
  const kit = graphKit(model.fetchImplementation, { now: NOW, records });
  kit.deps.cards = cards.access;
  const result = await runAgentGraph(kit.deps, kit.input("把约山本吃饭这条待办的计划日定在 11 月 21 日。"));
  assert.equal(result.actionPreview?.operations[0].text, "待办「约山本吃饭」：计划日 未设 → 11月21日（周六）");
});
