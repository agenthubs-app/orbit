import assert from "node:assert/strict";
import test from "node:test";

import { buildFirstLayerContext, type ContextMessage } from "../../features/agent-v1/context/build";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact, memo, todo } from "./read-kit";

/**
 * agent-design AG03-4 (设计稿 §3.10): the first layer sees the latest 10 messages (text only, long
 * answers cut but keeping their record ids), the open items, the list shown last and the record of
 * each kind mentioned last. After more than 60 idle minutes only the open items remain for the
 * model. Record bodies never enter; only this turn's words make parts; checkpoints keep no text.
 */

const NOW = "2026-11-15T10:00:00.000Z";
const minutesBefore = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString();

function conversation(turns: number, lastAt = minutesBefore(5)): ContextMessage[] {
  const out: ContextMessage[] = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    const at = turn === turns ? lastAt : minutesBefore(5 + (turns - turn) * 2);
    out.push({ createdAt: at, role: "user", text: `第 ${turn} 个问题` }, { createdAt: at, role: "assistant", text: `第 ${turn} 个回答` });
  }
  return out;
}

const STATE: AgentSessionState = {
  lastMentioned: [{ id: "contact:c17", name: "小林健", type: "contact" }, { id: "note:m31", name: "11 月 12 日的笔记", type: "memo" }],
  openItems: [],
  sessionId: "session:a",
  shownList: { items: [{ id: "task:t44", name: "回复田中的询价", type: "todo" }, { id: "task:t45", name: "给李薇寄样片", type: "todo" }], shownAt: minutesBefore(3) },
  updatedAt: minutesBefore(3),
};

test("the latest 10 messages only, text only; a long answer is cut and keeps its record ids", () => {
  const messages = conversation(7);
  messages[messages.length - 1] = { createdAt: minutesBefore(5), recordRefs: ["todo:task:t44", "todo:task:t45"], role: "assistant", text: `一共四条，按时间排好了。${"很长的说明".repeat(80)}` };
  const context = buildFirstLayerContext({ messages, now: NOW, references: [], state: STATE });
  assert.equal(context.messages.length, 10);
  assert.equal(context.messages[0].text, "第 3 个问题");
  const last = context.messages[context.messages.length - 1];
  assert.ok(last.text.length <= 161 && last.text.endsWith("…"));
  const ids = last.handles.map((handle) => context.handles.get(handle)!.id);
  assert.deepEqual(ids, ["task:t44", "task:t45"]);
  assert.match(context.promptText, /\[records: r\d, r\d\]/u);
});

test("59 minutes idle: everything is given; 61 minutes: only the open items, the last mentioned stays with code", () => {
  const open = { ...STATE, openItems: [{ createdAt: minutesBefore(61), kind: "alternative" as const, partId: "p2", ref: "alternative:r:p2", requestId: "r", summary: "定期留意", unrelatedMessages: 0 }] };
  const fresh = buildFirstLayerContext({ messages: conversation(3, minutesBefore(59)), now: NOW, references: [], state: open });
  assert.equal(fresh.idle, false);
  assert.equal(fresh.messages.length, 6);
  assert.equal(fresh.lastMentioned.length, 2);
  assert.equal(fresh.shownList.length, 2);
  const idle = buildFirstLayerContext({ messages: conversation(3, minutesBefore(61)), now: NOW, references: [], state: open });
  assert.equal(idle.idle, true);
  assert.deepEqual([idle.messages.length, idle.lastMentioned.length, idle.shownList.length, idle.openItems.length], [0, 0, 0, 1]);
  assert.equal(idle.handles.size, 0, "no record handle to guess with");
  assert.deepEqual(idle.lastMentionedForCode.map((item) => item.name), ["小林健", "11 月 12 日的笔记"]);
  assert.match(idle.promptText, /Do not guess/u);
});

test("the record of each kind mentioned last resolves 他; the shown list resolves 第二个 (handles map back to ids)", async () => {
  const message = "第二个现在是什么状态？他那边呢？";
  const model = deepseekStub([(call) => {
    assert.match(call.user, /1\. r\d todo 回复田中的询价; 2\. (r\d) todo 给李薇寄样片/u);
    const second = /2\. (r\d) todo 给李薇寄样片/u.exec(call.user)![1];
    const him = /(r\d) contact 小林健/u.exec(call.user)![1];
    return json({ parts: [
      part({ localId: "p1", objectClues: [{ entity: "todo", referenceId: second, text: "第二个" }], requiredCapabilities: ["todo.read"], sourceQuote: "第二个现在是什么状态？" }),
      part({ localId: "p2", objectClues: [{ entity: "contact", referenceId: him, text: "他" }], requiredCapabilities: ["contact.read"], sourceQuote: "他那边呢？" }),
    ], plainChat: false });
  }, (call) => {
    // AG05: the bound records are read and answered from (the shown list's second item, the person last mentioned).
    assert.match(call.user, /Title: 给李薇寄样片/u);
    assert.match(call.user, /Name: 小林健/u);
    const todoHandle = /(s\d+) — to-do/u.exec(call.user)![1];
    const contactHandle = /(s\d+) — contact profile/u.exec(call.user)![1];
    return json({ segments: [{ cites: [{ sentenceIds: [2], sourceRef: todoHandle }], partId: "p1", text: "给李薇寄样片还没做完。" }, { cites: [{ sentenceIds: [1], sourceRef: contactHandle }], partId: "p2", text: "小林健那边暂无更新。" }] });
  }]);
  const trace = captureTrace();
  try {
    const records = recordAccessOf({ events: [], records: [todo("actor:a", "task:t44", "回复田中的询价"), todo("actor:a", "task:t45", "给李薇寄样片", { plannedDate: "2026-11-10" }), contact("actor:a", "contact:c17", "小林健"), memo("actor:a", "note:m31", "和小林聊了报价初稿。", "2026-11-12T09:30:00.000Z", ["contact:c17"])] });
    const kit = graphKit(model.fetchImplementation, { messages: conversation(2), records, state: STATE });
    await kit.seeded;
    const result = await runAgentGraph(kit.deps, kit.input(message));
    const handoff = trace.events.find((event) => event.type === "first_layer.handoff") as { parts: { objectClues: { recordId: string }[] }[] };
    assert.deepEqual(handoff.parts.map((item) => item.objectClues[0].recordId), ["task:t45", "contact:c17"]);
    assert.match(result.text, /给李薇寄样片还没做完/u);
    assert.deepEqual(result.sourceRefs, ["todo:task:t45", "contact:contact:c17"]);
  } finally {
    trace.restore();
  }
});

test("record bodies never enter the context: only names and ids from the session state", async () => {
  const body = "小林希望把实施费单列，下周再对一次。";
  const model = deepseekStub([json({ parts: [part({ requiredCapabilities: ["memo.read"], sourceQuote: "那篇笔记里他具体是怎么说的？" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ createdAt: minutesBefore(2), role: "user", text: "上次和小林聊的那篇笔记还在吗？" }, { createdAt: minutesBefore(2), recordRefs: ["memo:note:m31"], role: "assistant", text: "在，是 11 月 12 日那篇，讲的是报价初稿。" }], state: STATE });
  await kit.seeded;
  await runAgentGraph(kit.deps, kit.input("那篇笔记里他具体是怎么说的？"));
  for (const fragment of [body, "实施费单列", "下周再对一次"]) assert.equal(model.calls[0].user.includes(fragment), false);
  assert.match(model.calls[0].user, /r\d memo 11 月 12 日的笔记/u);
});

test("an earlier request is not a part: a quote from an old message is rejected and repaired", async () => {
  const old = "以后每次我提到寄样，你都顺手帮我建一条「确认运费」的待办。";
  const message = "寄陶器样品一般用什么包材比较稳妥？";
  const model = deepseekStub([
    json({ parts: [part({ localId: "p1", sourceQuote: message }), part({ deliverable: "change", localId: "p2", requiredCapabilities: ["todo.create"], sourceQuote: old })], plainChat: false }),
    json({ parts: [part({ sourceQuote: message })], plainChat: true, reply: "用气泡膜加硬纸箱。" }),
  ]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ createdAt: minutesBefore(30), role: "user", text: old }, { createdAt: minutesBefore(30), role: "assistant", text: "这件事我不会自动去做。" }] });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2);
  assert.equal(result.partResults.length, 1);
  assert.equal(result.partResults.some((item) => item.route === "propose_write"), false);
});

test("an unanswered question is shelved after two unrelated messages", async () => {
  const replies = [
    json({ parts: [part({ clarity: "missing_one", deliverable: "change", objectClues: [{ entity: "todo", text: "it" }], requiredCapabilities: ["todo.update"], sourceQuote: "Move it to Friday." })], plainChat: false }),
    json({ parts: [part({ sourceQuote: "what's a polite way to turn down a meeting invite?" })], plainChat: true, reply: "Thank them and decline briefly." }),
    json({ parts: [part({ sourceQuote: "And how early is too early to send a calendar invite?" })], plainChat: true, reply: "More than a month ahead is early." }),
  ];
  const model = deepseekStub(replies);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation);
    const one = await runAgentGraph(kit.deps, kit.input("Move it to Friday.", { locale: "en" }));
    assert.equal(one.partResults[0].status, "awaiting_clarification");
    assert.equal(one.status, "waiting_user");
    assert.equal((await kit.sessionState.get("actor:a", "session:a"))?.openItems.length, 1);
    await runAgentGraph(kit.deps, kit.input("Actually, unrelated: what's a polite way to turn down a meeting invite?", { locale: "en" }));
    assert.equal((await kit.sessionState.get("actor:a", "session:a"))?.openItems[0]?.unrelatedMessages, 1);
    const three = await runAgentGraph(kit.deps, kit.input("And how early is too early to send a calendar invite?", { locale: "en" }));
    assert.equal(three.text, "More than a month ahead is early.");
    assert.equal((await kit.sessionState.get("actor:a", "session:a"))?.openItems.length, 0);
    assert.ok(trace.events.some((event) => event.type === "open_item.shelved"));
  } finally {
    trace.restore();
  }
});

test("checkpoints keep references and progress only: no message text, no context text, no model output", async () => {
  const message = "@田中浩 是东和商事的采购主管吧？";
  const history = "上次和小林聊的那篇笔记还在吗？";
  const modelOutput = json({ parts: [part({ dataSources: ["orbit_records"], goal: "确认田中浩的职位和公司", objectClues: [{ entity: "contact", referenceId: "r1", text: "@田中浩" }], requiredCapabilities: ["contact.read"], sourceQuote: "@田中浩 是东和商事的采购主管吧？" })], plainChat: false });
  const model = deepseekStub([modelOutput]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ createdAt: minutesBefore(2), role: "user", text: history }, { createdAt: minutesBefore(2), role: "assistant", text: "在，是 11 月 12 日那篇。" }], references: [{ id: "contact:c30", name: "田中浩", type: "contact" }], state: STATE });
  await kit.seeded;
  const input = kit.input(message, { references: [{ id: "contact:c30", type: "contact" }] });
  await runAgentGraph(kit.deps, input);
  const checkpoints: unknown[] = [];
  for await (const item of kit.checkpointer.list({ configurable: { thread_id: input.requestId } })) checkpoints.push(item);
  assert.ok(checkpoints.length >= 5, "one checkpoint per step");
  const stored = JSON.stringify(checkpoints, (_key, value) => (value instanceof Uint8Array ? Buffer.from(value).toString("utf8") : value));
  for (const text of [message, "东和商事", history, "确认田中浩的职位和公司", "11 月 12 日那篇", "回复田中的询价", "田中浩"]) assert.equal(stored.includes(text), false, `checkpoint contains "${text}"`);
  assert.ok(stored.includes("contact:c30"), "the reference itself is kept");
});
