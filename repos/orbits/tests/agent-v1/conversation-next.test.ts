/**
 * The engine's ask / go as the bridge reads it (ORBIT_AGENT_CONVERSATION_NEXT, conversation/bridge.ts runAskGo).
 * Stage A/B and fix3 (2026-11-23): the engine wanted to ask on ~230 turns the agent answered right. In the lab the World
 * is the whole account and the hint names references only; in the agent the World holds only the records the talk named,
 * and the first layer's clues include picks written with「@」, the title of the record being made, and words that describe
 * a set. Each case below is one of those causes; the last ones check the engine still asks where it should.
 * Names and records are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { appendTurn, formsOf, nextHintOf, runAskGo, type ConversationLog } from "../../features/agent-v1/conversation/bridge";
import type { AgentReply, HintPart } from "../../features/agent-v1/conversation/types";

const START = Date.parse("2026-11-21T14:00:00+09:00");
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();
const reply = (minutes: number, extra: Partial<AgentReply> = {}): AgentReply => ({ at: at(minutes), done: [], listed: [], mentions: [], text: "", ...extra });
const part = (quote: string, refs: HintPart["refs"], slots: HintPart["slots"] = {}): HintPart => ({ clarity: "clear", continues: null, quote, refs, slots });
type Names = Record<string, { type: string; name: string }>;
const nextOf = (message: string, names: Names, hint: HintPart[] | null, options: { log?: ConversationLog | null; plainChat?: boolean; bound?: { labId: string; words: string }[] } = {}) =>
  runAskGo(options.log ?? null, names, { at: at(5), gone: [], hint: hint ? { parts: hint } : null, message }, Boolean(options.plainChat), formsOf(options.bound ?? [])).parts.map((item) => item.next);

test("a pick written with「@」 is the record the user picked: the words without the mark; a pick still visible is never asked about", () => {
  const event = { "E-evt_saas": { name: "SaaS 定价研讨会", type: "event" } };
  const message = "把 @SaaS 定价研讨会 的开始时间改成晚上八点。";
  assert.deepEqual(nextOf(message, event, [part(message, [{ id: "E-evt_saas", kind: "event", said: "@SaaS 定价研讨会" }], { kind: "event", verb: "update" })]), ["go"]);
  // a note without a title: the composer's label is not the stored name; the agent bound the label to it
  const note = { "M-note:n10": { name: "11 月 10 日小林给我打电话，说小陈在审核。", type: "memo" } };
  const asked = "@11 月 10 日笔记 帮我整理一下。";
  const hint = [part(asked, [{ id: "M-note:n10", kind: "memo", said: "@11 月 10 日笔记" }], { kind: "memo", verb: "read" })];
  assert.deepEqual(nextOf(asked, note, hint), ["go"], "the pick is exact: the World only lacks the label");
  const pointer = "那篇笔记帮我整理一下。";
  assert.deepEqual(nextOf(pointer, note, [part(pointer, [{ id: null, kind: "memo", said: "那篇笔记" }], { kind: "memo", verb: "read" })]), ["ask"], "a pointer without a pick, nothing in the talk: ask");
  assert.deepEqual(runAskGo(null, note, { at: at(5), gone: ["M-note:n10"], hint: { parts: hint }, message: asked }, false).parts.map((item) => item.next), ["ask"], "a pick deleted since is no excuse");
  assert.equal(nextHintOf({ parts: [part(asked, [{ id: "M-note:n10", kind: "memo", said: "@11 月 10 日笔记" }])] })!.parts[0].refs![0].said, "11 月 10 日笔记");
});

test("the record a create part makes is not a reference; a person the new record links still is", () => {
  const message = "新建一条待办，标题叫「交停车费」，计划日 11 月 17 日。";
  assert.deepEqual(nextOf(message, {}, [part(message, [{ id: null, kind: "todo", said: "「交停车费」" }], { kind: "todo", verb: "create" })]), ["go"]);
  const linked = "加一条待办「给王强回电话」，关联王强";
  const hint = nextHintOf({ parts: [part(linked, [{ id: null, kind: "todo", said: "「给王强回电话」" }, { id: null, kind: "contact", said: "王强" }], { kind: "todo", verb: "create" })] })!;
  assert.deepEqual(hint.parts[0].refs!.map((ref) => ref.said), ["王强"]);
});

test("words that describe a set (a kind word, no pointer) are no reference: 下周的活动, 某位人脉, my contacts, 公開されているイベント", () => {
  for (const [message, said, kind] of [
    ["给我推荐几场下周的活动", "下周的活动", "event"],
    ["回看与某位人脉的讨论", "某位人脉", "contact"],
    ["From my contacts based in Singapore, pick the three best fits.", "my contacts", "contact"],
    ["公開されているイベントを、開始時間が早い順に並べてください。", "公開されているイベント", "event"],
    ["11 月 21 日和 22 日的活动里，挑两场。", "11 月 21 日和 22 日的活动", "event"],
  ] as const) {
    assert.deepEqual(nextHintOf({ parts: [part(message, [{ id: null, kind, said }])] })!.parts[0].refs, [], said);
    assert.deepEqual(nextOf(message, {}, [part(message, [{ id: null, kind, said }], { kind, verb: "read" })]), ["go"], said);
  }
  // a pointer, a quoted title or an ordinal keeps the words a reference
  for (const said of ["给小林发修订报价这条待办", "「约山本吃饭」这条待办", "那三份竞品笔记", "第二条", "the to-do about the samples"]) {
    assert.equal(nextHintOf({ parts: [part(said, [{ id: null, kind: "todo", said }])] })!.parts[0].refs!.length, 1, said);
  }
});

test("the World has what the store gave this turn: a name said for the first time binds, two people of that name still ask", () => {
  const message = "把田中浩的职位改成采购部长。";
  const hint = [part(message, [{ id: null, kind: "contact", said: "田中浩" }], { kind: "contact", verb: "update" })];
  assert.deepEqual(nextOf(message, {}, hint), ["ask"], "names only: nothing to point at (the over-asking)");
  const tanaka = { "C-contact:tanaka": { name: "田中浩", type: "contact" } };
  assert.deepEqual(nextOf(message, tanaka, hint), ["go"]);
  // a family name alone (the store keeps 田中浩 without a space): the words the agent bound are a form of the contact
  const short = "田中上次说了什么？";
  const shortHint = [part(short, [{ id: null, kind: "contact", said: "田中" }], { kind: "memo", verb: "read" })];
  assert.deepEqual(nextOf(short, tanaka, shortHint), ["ask"]);
  assert.deepEqual(nextOf(short, tanaka, shortHint, { bound: [{ labId: "C-contact:tanaka", words: "田中" }] }), ["go"]);
  // a pronoun or a pointer the agent bound is never a form: the engine reads it from the talk
  assert.deepEqual(formsOf([{ labId: "C-contact:tanaka", words: "他" }, { labId: "T-task:x", words: "那条待办" }, { labId: "C-contact:tanaka", words: "田中" }]), { "C-contact:tanaka": ["田中"] });
  const two = { "C-contact:lin1": { name: "小林健", type: "contact" }, "C-contact:lin2": { name: "小林诚", type: "contact" } };
  const asked = "上次和小林聊了什么？";
  assert.deepEqual(nextOf(asked, two, [part(asked, [{ id: null, kind: "contact", said: "小林" }], { kind: "memo", verb: "read" })]), ["ask"]);
});

test("words the engine finds by itself where the first layer saw no reference, pointing at nothing, are no reason to ask", () => {
  assert.deepEqual(nextOf("What should I handle first today?", {}, null, { plainChat: true }), ["go"]);
  const message = "第一次给潜在客户写邮件，开头怎么写好？";
  assert.deepEqual(nextOf(message, {}, [part(message, [])]), ["go"]);
  // no first-layer reading at all (it failed): the engine's own reading stands
  assert.deepEqual(nextOf("What should I handle first today?", {}, null), ["ask"]);
});

test("still asks where it should: a pointer the first layer reported with nothing in the talk, and a pronoun with two people", () => {
  const message = "那篇笔记里他具体是怎么说的？";
  assert.deepEqual(nextOf(message, {}, [part(message, [{ id: null, kind: "memo", said: "那篇笔记" }], { kind: "memo", verb: "read" })]), ["ask"]);
  const names = { "C-contact:shen": { name: "沈佳怡", type: "contact" }, "C-contact:wang": { name: "王磊", type: "contact" } };
  const log = appendTurn(null, { agent: reply(1, { mentions: ["C-contact:shen", "C-contact:wang"] }), requestId: "r1", user: { at: at(0), hint: null, text: "沈佳怡和王磊最近怎么样？" } }, names);
  const asked = "她的电话是多少？";
  assert.deepEqual(nextOf(asked, names, [part(asked, [{ id: null, kind: "contact", said: "她" }], { kind: "contact", verb: "read" })], { log }), ["ask"]);
});
