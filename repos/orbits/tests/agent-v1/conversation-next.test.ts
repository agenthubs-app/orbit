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
// No clarity: the engine's own reading of the references (r10 lets the first layer's clarity decide too, see the last test).
const part = (quote: string, refs: HintPart["refs"], slots: HintPart["slots"] = {}, clarity?: HintPart["clarity"]): HintPart => ({ ...(clarity ? { clarity } : {}), continues: null, quote, refs, slots });
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
  assert.deepEqual(nextOf(short, tanaka, shortHint), ["go"], "the first two characters (round 2)");
  assert.deepEqual(nextOf(short, { "C-contact:tanaka": { name: "田中浩", type: "contact" }, "C-contact:tanaka2": { name: "田中美咲", type: "contact" } }, shortHint), ["ask"], "two 田中, none bound: ask");
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

test("round 2: a CJK name kept without a space is known by its first two characters too (小林 → 小林健); two such still ask", () => {
  const message = "记一下：小林今天来电话了。";
  const hint = [part(message, [{ id: null, kind: "contact", said: "小林" }], { kind: "memo", verb: "create" })];
  assert.deepEqual(nextOf(message, { "C-contact:lin": { name: "小林健", type: "contact" } }, hint), ["go"]);
  assert.deepEqual(nextOf(message, { "C-contact:lin": { name: "小林健", type: "contact" }, "C-contact:lin2": { name: "小林诚", type: "contact" } }, hint), ["ask"]);
});

test("round 2: a bound title with a pointer after it is known by the title (给小林寄合同那条待办 → 给小林寄合同)", () => {
  assert.deepEqual(formsOf([{ labId: "T-task:c", words: "给小林寄合同那条待办" }, { labId: "T-task:q", words: "「给小林发修订报价（第二版）」这条待办" }, { labId: "C-contact:x", words: "他那条" }]), { "T-task:c": ["给小林寄合同"], "T-task:q": ["给小林发修订报价（第二版）"] });
  const message = "把给小林寄合同那条待办改到周五。";
  const hint = [part(message, [{ id: null, kind: "todo", said: "给小林寄合同那条待办" }], { kind: "todo", verb: "update" })];
  assert.deepEqual(nextOf(message, { "T-task:c": { name: "寄合同给小林健", type: "todo" } }, hint, { bound: [{ labId: "T-task:c", words: "给小林寄合同那条待办" }] }), ["go"]);
});

test("round 2: R27 (pronoun on) counts for ask / go — the one person of the latest turn binds 他, then the part goes", () => {
  const names = { "C-contact:lin": { name: "小林健", type: "contact" } };
  const log = appendTurn(null, { agent: reply(1, { mentions: ["C-contact:lin"] }), requestId: "r1", user: { at: at(0), hint: null, text: "查上次和小林健聊了什么" } }, names);
  const message = "再记下他今天来过电话";
  const hint = [part(message, [{ id: null, kind: "contact", said: "他" }], { kind: "memo", verb: "create" })];
  const run = (bind?: boolean) => runAskGo(log, names, { at: at(5), gone: [], hint: { parts: hint }, message }, false, {}, "Asia/Tokyo", bind ? (result) => ({ ...result, parts: result.parts.map((item) => ({ ...item, refs: item.refs.map((ref) => (ref.outcome === "ask" && ref.candidates?.length === 1 ? { id: ref.candidates[0], outcome: "bound" as const, said: ref.said } : ref)) })) }) : undefined).parts.map((item) => item.next);
  assert.deepEqual(run(), ["ask"], "the engine alone asks (no gender known)");
  assert.deepEqual(run(true), ["go"]);
});

test("r10: the first layer's clarity is evidence — clear lifts an ask that only came from the engine's own reading, missing_one always asks", () => {
  const pointer = "那篇笔记帮我整理一下。";
  const refs: HintPart["refs"] = [{ id: null, kind: "memo", said: "那篇笔记" }];
  assert.deepEqual(nextOf(pointer, {}, [part(pointer, refs, { kind: "memo", verb: "read" })]), ["ask"], "own reading: nothing to point at");
  assert.deepEqual(nextOf(pointer, {}, [part(pointer, refs, { kind: "memo", verb: "read" }, "clear")]), ["go"], "the first layer read it as clear");
  const tanaka = { "C-contact:tanaka": { name: "田中浩", type: "contact" } };
  const message = "把田中浩的职位改成采购部长。";
  const bound = [part(message, [{ id: null, kind: "contact", said: "田中浩" }], { kind: "contact", verb: "update" }, "missing_one")];
  assert.deepEqual(nextOf(message, tanaka, bound), ["ask"], "the first layer misses one value: ask even with the reference bound");
});

test("r11 through the bridge: an「@」pick of a whole title on a read goes although the first layer saw several readings; a write with several readings still asks; two notes of one title, one picked, go", async () => {
  const { hintPartOf } = await import("../../features/agent-v1/conversation/bridge");
  assert.equal(hintPartOf({ clarity: "multiple_readings", objectClues: [], requiredCapabilities: ["memo.read"], sourceQuote: "x" } as never, null).clarity, "none", "several readings is the lab's none");
  const note = { "M-note:c1": { name: "竞品笔记 A", type: "memo" } };
  const message = "@竞品笔记 A 帮我看看";
  const pick = [{ id: "M-note:c1", kind: "memo" as const, said: "@竞品笔记 A" }];
  const bound = [{ labId: "M-note:c1", words: "@竞品笔记 A" }];
  assert.deepEqual(nextOf(message, note, [part(message, pick, { kind: "memo", verb: "read" }, "none")], { bound }), ["go"], "an exact pick on a read");
  assert.deepEqual(nextOf(message, note, [part(message, pick, { kind: "memo", verb: "read" }, "missing_one")], { bound }), ["ask"], "missing one value still asks");
  const write = "@竞品笔记 A 删掉";
  assert.deepEqual(nextOf(write, note, [part(write, [{ ...pick[0] }], { kind: "memo", verb: "delete" }, "none")], { bound }), ["ask"], "a write with several readings asks");
  const two = { "M-note:d1": { name: "选品方向", type: "memo" }, "M-note:d2": { name: "选品方向", type: "memo" } };
  const asked = "那 @选品方向 这一篇呢？";
  const picked = [part(asked, [{ id: "M-note:d2", kind: "memo", said: "@选品方向" }], { kind: "memo", verb: "read" })];
  assert.deepEqual(nextOf(asked, two, picked, { bound: [{ labId: "M-note:d2", words: "@选品方向" }] }), ["go"], "the picker told them apart");
  const unpicked = "那 选品方向 这一篇呢？";
  assert.deepEqual(nextOf(unpicked, two, [part(unpicked, [{ id: null, kind: "memo", said: "选品方向" }], { kind: "memo", verb: "read" })]), ["ask"], "without a pick two notes of one title still ask");
});
