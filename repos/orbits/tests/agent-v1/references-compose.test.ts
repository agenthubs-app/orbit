import assert from "node:assert/strict";
import test from "node:test";

import { agentSendInputSchema } from "../../shared/api-schema/agent-v1";
import { atTriggerOf, insertReference, markedSegments, reconcileBindings, referenceChipHint, referenceDetailLine, referencesForSend, removeBinding, sameNamedKeys, type ReferenceBinding } from "../../shared/compute/agent-references";

/**
 * agent-design AG11-1/AG11-3 (视觉稿 D1、D2、D6): what both composers do with a picked record — insert 「@名字 」 where the @
 * was typed, move the marks with the edits, drop a mark whose words were edited, keep the words but drop the @ when the
 * chip is removed, and send the positions of the marks that still hold in the trimmed message. Typed 「@名字」 that was
 * never picked is plain text.
 */

const memo = (id: string, name = "客户访谈") => ({ id, name, type: "memo" as const });

test("insert at the @, then a second one; the positions are what the server checks", () => {
  let state = { bindings: [] as ReferenceBinding[], caret: 0, text: "根据 @客户" };
  const trigger = atTriggerOf(state.text, state.text.length, state.bindings)!;
  assert.deepEqual(trigger, { query: "客户", start: 3 });
  state = insertReference(state.text, trigger.start, state.text.length, state.bindings, memo("note:m37"));
  assert.equal(state.text, "根据 @客户访谈 ");
  state = { ...state, text: `${state.text}和 ` };
  state = insertReference(state.text, state.text.length, state.text.length, state.bindings, memo("note:m61"));
  const sent = referencesForSend(`  ${state.text}这两篇里各自最在意什么？`, state.bindings.map((binding) => ({ ...binding, end: binding.end + 2, start: binding.start + 2 })));
  assert.equal(sent.message, "根据 @客户访谈 和 @客户访谈 这两篇里各自最在意什么？");
  assert.deepEqual(sent.references.map((item) => [item.id, sent.message.slice(item.start, item.end)]), [["note:m37", "@客户访谈"], ["note:m61", "@客户访谈"]]);
  assert.equal(agentSendInputSchema.safeParse({ clientMessageId: "m", locale: "zh", message: sent.message, protocolVersion: 3, references: sent.references, sessionId: "s" }).success, true);
});

test("edits move the marks; an edit inside a mark drops it; typed @ that was never picked is not a mark", () => {
  const text = "根据 @客户访谈，帮我给 @田中浩 的 @回复田中的询价 提个修改建议";
  const bindings: ReferenceBinding[] = [
    { ...memo("note:m37"), end: 8, start: 3 },
    { end: 17, id: "contact:c30", name: "田中浩", start: 13, type: "contact" },
    { end: 28, id: "task:t44", name: "回复田中的询价", start: 20, type: "todo" },
  ];
  assert.deepEqual(bindings.map((binding) => text.slice(binding.start, binding.end)), ["@客户访谈", "@田中浩", "@回复田中的询价"]);
  // Typing before all marks moves them.
  const before = `请${text}`;
  assert.deepEqual(reconcileBindings(text, before, bindings).map((binding) => before.slice(binding.start, binding.end)), ["@客户访谈", "@田中浩", "@回复田中的询价"]);
  // Deleting one character of 「@客户访谈」 drops that mark only (视觉稿第 4 组).
  const cut = text.replace("@客户访谈", "@客户访");
  assert.deepEqual(reconcileBindings(text, cut, bindings).map((binding) => binding.id), ["contact:c30", "task:t44"]);
  // A typed 「@小林」 makes no mark.
  assert.deepEqual(referencesForSend("问问 @小林 的近况", []).references, []);
});

test("removing a chip keeps the words without the @ and stops sending it (D2)", () => {
  const text = "根据 @客户访谈，帮我给 @田中浩 的 @回复田中的询价 提个修改建议";
  const bindings: ReferenceBinding[] = [
    { ...memo("note:m37"), end: 8, start: 3 },
    { end: 17, id: "contact:c30", name: "田中浩", start: 13, type: "contact" },
    { end: 28, id: "task:t44", name: "回复田中的询价", start: 20, type: "todo" },
  ];
  const out = removeBinding(text, bindings, bindings[1]);
  assert.equal(out.text, "根据 @客户访谈，帮我给 田中浩 的 @回复田中的询价 提个修改建议");
  const sent = referencesForSend(out.text, out.bindings);
  assert.deepEqual(sent.references.map((item) => [item.id, sent.message.slice(item.start, item.end)]), [["note:m37", "@客户访谈"], ["task:t44", "@回复田中的询价"]]);
  assert.deepEqual(markedSegments(out.text, out.bindings).filter((segment) => segment.binding).map((segment) => segment.text), ["@客户访谈", "@回复田中的询价"]);
});

test("the @ opens the picker only at a word start and outside marks", () => {
  assert.equal(atTriggerOf("mail@x", 6, []), null);
  assert.deepEqual(atTriggerOf("@", 1, []), { query: "", start: 0 });
  assert.equal(atTriggerOf("@王 强", 4, []), null);
  assert.equal(atTriggerOf("@客户访谈", 5, [{ end: 5, start: 0 }]), null);
});

test("the line that tells same names apart, in three languages", () => {
  assert.equal(referenceDetailLine({ detail: { company: "启航软件", role: "运营" }, type: "contact" }, "zh"), "启航软件 · 运营");
  assert.equal(referenceDetailLine({ detail: { date: "2026-11-13T08:00:00.000Z", dateKind: "written", people: ["王强"] }, type: "memo" }, "zh"), "王强 · 11月13日（周五）");
  assert.equal(referenceDetailLine({ detail: { date: "2026-11-20T09:00:00.000Z", dateKind: "due" }, type: "todo" }, "ja"), "期限 11月20日（金）");
  assert.equal(referenceDetailLine({ detail: { date: "2026-11-24T05:00:00.000Z", dateKind: "at" }, type: "schedule" }, "en"), "Tue, Nov 24, 14:00");
  assert.equal(referenceDetailLine({ detail: { date: "2026-11-27T10:00:00.000Z", dateKind: "at", place: "涩谷" }, type: "event" }, "zh"), "11月27日（周五）19:00 · 涩谷");
  assert.equal(referenceDetailLine({ detail: { date: "2026-11-08", dateKind: "on" }, type: "attendance" }, "zh"), "11月8日");
  assert.equal(referenceChipHint({ detail: { date: "2026-11-19T03:00:00.000Z" }, type: "schedule" }, "zh"), "11月19日");
  assert.deepEqual([...sameNamedKeys([memo("a"), memo("b"), { id: "c", name: "田中浩", type: "contact" }])], ["memo:客户访谈"]);
});
