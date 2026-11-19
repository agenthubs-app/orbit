import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import React from "react";

import { insertReference, reconcileBindings, referencesForSend, removeBinding, type ReferenceBinding } from "../src/api/compute/agent-references";
import type { AgentReferenceSearchResultContract } from "../src/api/contract/agent-v1";
import { renderedText, renderToHtml } from "./helpers/render";

/**
 * agent-design AG11-1/AG11-3 (获批视觉稿 D1–D8), the App side: the 「添加上下文」 picker lists six kinds grouped with their
 * badges; offline it lists only the phone's contacts and says the other five need the network, and asks nothing; picked
 * records go with the message with their places; × keeps the words without the @; a removed record is not in the draft
 * journal any more, so a restored draft does not bring it back; a record that cannot be opened shows 「打不开了」.
 */

const searches: string[] = [];
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const rows = [
  { card: { displayName: "王强", id: "contact:c47", organization: "启航软件", role: "运营" }, detail: null, id: "contact:c47", search: {}, tags: [] },
  { card: { displayName: "王强", id: "contact:c46", organization: "青松物流", role: "运营经理" }, detail: null, id: "contact:c46", search: {}, tags: [] },
  { card: { displayName: "田中浩", id: "contact:c30", organization: "东和商事", role: "采购主管" }, detail: null, id: "contact:c30", search: {}, tags: [] },
];
loader._load = (name, ...args) => {
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({ get: async (path: string) => { searches.push(path); return { success: false }; }, post: async () => ({ success: false }) }) };
  if (name.endsWith("/hooks/useApiResource")) return { useApiResource: () => ({ kind: "loading", refresh() {} }) };
  if (name.endsWith("/api/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ ready: true, signedIn: true, actorId: "reader" }) };
  if (name.endsWith("/hooks/useLocalContacts")) return { useLocalContacts: () => ({ available: true, freshness: { offline: true, readable: true }, rows }) };
  return originalLoad(name, ...args);
};
const picker = require("../src/screens/ai/ContactMentionPicker") as typeof import("../src/screens/ai/ContactMentionPicker");
const chips = require("../src/screens/ai/ContactReferenceChip") as typeof import("../src/screens/ai/ContactReferenceChip");
loader._load = originalLoad;

const RESULT: AgentReferenceSearchResultContract = {
  groups: [
    { items: [{ detail: { company: "启航软件", role: "运营" }, id: "contact:c47", name: "王强", type: "contact" }, { detail: { company: "青松物流", role: "运营经理" }, id: "contact:c46", name: "王强", type: "contact" }], more: false, type: "contact" },
    { items: [{ detail: { date: "2026-11-13T03:00:00.000Z", people: ["王强"] }, id: "note:m61", name: "客户访谈", type: "memo" }], more: false, type: "memo" },
    { items: [{ detail: { date: "2026-11-20T09:00:00.000Z", dateKind: "due" }, id: "task:t9", name: "给王强回电话", type: "todo" }], more: false, type: "todo" },
    { items: [{ detail: { date: "2026-11-19T03:00:00.000Z" }, id: "personal:s11", name: "和田中午餐", type: "schedule" }], more: false, type: "schedule" },
    { items: [{ detail: { date: "2026-11-19T10:00:00.000Z" }, eventKind: "platform", id: "event:e103", name: "SaaS 定价研讨会", type: "event" }], more: false, type: "event" },
    { items: [{ detail: { date: "2026-11-08" }, id: "attendance:a1", name: "大学同学聚会", type: "attendance" }], more: false, type: "attendance" },
  ],
  query: "",
};

test("online: six kinds grouped; offline: only the phone's contacts, never a request", () => {
  const online = picker.pickerGroups({ offline: false, pickedKeys: new Set(["contact:contact:c47"]), query: "王强", result: RESULT, rows: rows as never });
  assert.deepEqual(online.map((group) => group.type), ["contact", "memo", "todo", "schedule", "event", "attendance"]);
  assert.deepEqual(online[0]!.items.map((item) => item.id), ["contact:c46"], "an already picked record is left out");
  const offline = picker.pickerGroups({ offline: true, pickedKeys: new Set(), query: "王强", result: RESULT, rows: rows as never });
  assert.deepEqual(offline.map((group) => [group.type, group.items.map((item) => [item.id, item.detail.company, item.detail.role])]), [["contact", [["contact:c47", "启航软件", "运营"], ["contact:c46", "青松物流", "运营经理"]]]]);
});

test("offline picker shows the phone's contacts and the one-line note; it asks the server nothing (D8)", () => {
  const text = renderedText(<picker.ContactMentionPicker mode={{ kind: "plus" }} query="王强" onQuery={() => undefined} onPick={() => undefined} onDone={() => undefined} onClose={() => undefined} pickedKeys={new Set()} offline />);
  assert.match(text, /添加上下文/u);
  assert.match(text, /没联网 · 只能选手机里的联系人/u);
  assert.match(text, /王强 启航软件 · 运营 联系人/u);
  assert.match(text, /王强 青松物流 · 运营经理 联系人/u);
  assert.match(text, /笔记、待办、日程、活动和我去过的，联网后才能搜。/u);
  assert.match(text, /完成（0）/u);
  assert.doesNotMatch(text, /田中浩/u, "only the contacts that match");
  assert.deepEqual(searches, []);
});

test("chips carry the kind; same names a short hint; a record that cannot be opened says so (D1, D7)", () => {
  const memo: ReferenceBinding = { end: 5, hint: "田中浩", id: "note:m37", name: "客户访谈", start: 0, type: "memo" };
  assert.match(renderedText(<chips.ReferenceChip binding={memo} showHint onRemove={() => undefined} />), /笔记 客户访谈 田中浩 ×/u);
  assert.match(renderedText(<chips.ReferenceChip binding={memo} showHint={false} onRemove={() => undefined} />), /笔记 客户访谈 ×/u);
  assert.match(renderedText(<chips.ReferenceChip binding={{ ...memo, gone: true }} showHint onRemove={() => undefined} />), /笔记 客户访谈 打不开了 ×/u);
  assert.match(renderedText(<chips.ReferenceChip binding={{ end: 7, hint: "11月8日", id: "attendance:a1", name: "大学同学聚会", start: 0, type: "attendance" }} showHint onRemove={() => undefined} />), /我去过 大学同学聚会 11月8日 ×/u);
});

test("the screen keeps the marks in the draft journal and sends them with their places; × and edits drop them (AG11-3)", () => {
  const source = readFileSync(new URL("../src/screens/ai/AiConversationScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /useJournalState\(journal, "referenceBindings", \[\]\)/u, "the marks are restored with the draft journal");
  assert.match(source, /referencesForSend\(draftValue\.current, bindingsRef\.current\)/u);
  assert.match(source, /references: \[\.\.\.selectedReferences, \.\.\.marked\]/u);
  assert.match(source, /reconcileBindings\(draftValue\.current, value, bindingsRef\.current\)/u);
  assert.match(source, /icon="plus" accessibilityLabel=\{locale\.t\("aiMention\.add"\)\}/u, "「＋」 opens 「添加上下文」 (D5)");
  // The journal is what a restored draft reads: a removed record is gone from it.
  const journal: { referenceBindings?: ReferenceBinding[] } = {};
  let state = insertReference("@王", 0, 2, [], { id: "contact:c46", name: "王强", type: "contact" });
  journal.referenceBindings = state.bindings;
  state = { ...state, ...insertReference(`${state.text}和 `, state.text.length + 2, state.text.length + 2, state.bindings, { id: "event:e103", name: "SaaS 定价研讨会", type: "event", eventKind: "platform" }) };
  journal.referenceBindings = state.bindings;
  const removed = removeBinding(state.text, state.bindings, state.bindings[0]!);
  journal.referenceBindings = removed.bindings;
  assert.equal(removed.text, "王强 和 @SaaS 定价研讨会 ");
  assert.deepEqual(journal.referenceBindings.map((binding) => binding.id), ["event:e103"], "a restored draft does not bring the removed one back");
  const sent = referencesForSend(removed.text, journal.referenceBindings);
  assert.deepEqual(sent.references, [{ end: 16, eventKind: "platform", id: "event:e103", start: 5, type: "event" }]);
  assert.deepEqual(reconcileBindings(removed.text, removed.text.replace("定价", "价"), journal.referenceBindings), [], "editing the words of a mark drops it");
});

test("the picked 「@名字」 is tinted inside the composer; an edited mark goes back to plain text (D1, D2)", () => {
  const text = "@和田中午餐 和 @SaaS 定价研讨会 是同一天吗？";
  const bindings: ReferenceBinding[] = [
    { end: 6, id: "personal:s11", name: "和田中午餐", start: 0, type: "schedule" },
    { end: 20, eventKind: "platform", id: "event:e103", name: "SaaS 定价研讨会", start: 9, type: "event" },
  ];
  const tinted = /r-color-\w+ r-fontWeight-/u; // react-native-web renders the style as atomic classes
  const marksOf = (html: string) => [...html.matchAll(/<[^>]*data-testid="reference-mark-([^"]+)"[^>]*>([^<]*)</gu)].map((match) => [match[1], match[2], tinted.test(match[0])]);
  const html = renderToHtml(<chips.MarkedDraft text={text} bindings={bindings} />);
  assert.deepEqual(marksOf(html), [["schedule:personal:s11", "@和田中午餐", true], ["event:event:e103", "@SaaS 定价研讨会", true]]);
  assert.equal(renderedText(<chips.MarkedDraft text={text} bindings={bindings} />).replace(/\s+/gu, ""), text.replace(/\s+/gu, ""));
  // D2: one character of 「@和田中午餐」 deleted — that mark is plain text again, the other stays tinted.
  const edited = text.replace("和田中午餐", "和田中午");
  const kept = reconcileBindings(text, edited, bindings);
  assert.deepEqual(marksOf(renderToHtml(<chips.MarkedDraft text={edited} bindings={kept} />)).map((mark) => mark[0]), ["event:event:e103"]);
  // D7: a record that cannot be opened is struck through.
  assert.match(renderToHtml(<chips.MarkedDraft text={text} bindings={[{ ...bindings[0]!, gone: true }]} />), /r-textDecorationLine-/u);
  const source = readFileSync(new URL("../src/screens/ai/AiConversationScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /\{tintMarks \? <MarkedDraft text=\{draftMessage\} bindings=\{shownBindings\} \/> : null\}<\/TextInput>/u, "the composer's TextInput holds the tinted runs");
});
