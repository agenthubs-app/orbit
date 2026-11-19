import assert from "node:assert/strict";
import { test } from "node:test";

import { createGraphExecutor } from "../../features/agent-v1/graph/executor";
import { personPronounInReply } from "../../features/agent-v1/graph/nodes/resolve";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createCardKit } from "../services/agent-ledger-card-kit";
import { deepseekStub, graphKit, json, part, recordAccessOf, type Reply } from "./graph-kit";
import { smallWorld } from "./read-kit";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { judgmentAccess, outboundJudge, toolsStub, webAccess } from "./web-kit";

/**
 * agent-design AG11 run-02 repair round (judged regressions of the AG11 reruns).
 *
 * AE-AMB-009 (AG04): after 「帮我处理一下小林那件事。」 was asked about, the typed answer 「先看看我和他最近聊了什么就行。」 came
 * with the clue 「我和他」 (not 「他」) and was looked up as a name — 「我不确定你说的是哪一位联系人」. In a turn that answers an
 * open clarification, a person pronoun (with the user's own 「我和／我跟」 around it) is the clarification's person.
 */

test("a person pronoun with the user's own words around it is still the pronoun", () => {
  for (const said of ["他", "我和他", "我跟她", "她和我", "TA", "对方", "我和对方", "彼と私", "me and him", "her"]) assert.equal(personPronounInReply(said), true, said);
  for (const said of ["小林", "我和小林", "我", "那篇笔记", "他的笔记"]) assert.equal(personPronounInReply(said), false, said);
});

function entryKit(replies: Reply[]) {
  const model = deepseekStub(replies);
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  for (const record of world.records) if (record.collection === "notes") (record.payload.note as Record<string, unknown>).accountId = record.userId;
  const records = recordAccessOf(world);
  const kit = graphKit(model.fetchImplementation, { records });
  const store = createMemoryAgentEntryStore();
  const cards = createCardKit();
  const deps: AgentEntryDependencies = { execute: createGraphExecutor("mock", { ...kit.deps, entryStore: store, runtime: cards.runtime }), schedule: (task) => { void task(); }, sessions: null, store };
  return { deps, kit, model, records };
}

test("AE-AMB-009: the typed answer's 「我和他」 is the person the question was about (小林), not a name to look up", async () => {
  const ask = json({ parts: [part({ clarity: "multiple_readings", objectClues: [{ entity: "contact", text: "小林" }], readings: [{ capabilities: ["contact.read"], deliverable: "answer", label: "查小林的资料" }, { capabilities: ["todo.update"], deliverable: "change", label: "改小林相关的待办" }], requiredCapabilities: ["contact.read"], sourceQuote: "帮我处理一下小林那件事" })], plainChat: false });
  const reply = json({ parts: [part({ continues: { kind: "clarification", ref: "o1" }, dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "contact", text: "我和他" }], requiredCapabilities: ["view.recentInteraction", "memo.read"], sourceQuote: "先看看我和他最近聊了什么就行" })], plainChat: false });
  const answer: Reply = (call) => {
    assert.match(call.user, /小林健/u, "小林's records are the materials");
    const handle = /(s\d+) — memo/u.exec(call.user)![1];
    return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "最近一次是聊报价初稿。" }] });
  };
  const { deps, model, records } = entryKit([ask, reply, answer]);
  const send = async (message: string, n: number) => {
    const { receipt } = await acceptMessage(deps, { actorId: "actor:a", body: { clientMessageId: `m:${n}`, locale: "zh", message, protocolVersion: 3, references: [], sessionId: "session:amb9" } });
    await settleSession("actor:a", "session:amb9");
    return receipt.requestId;
  };
  await send("帮我处理一下小林那件事。", 1);
  const two = await send("先看看我和他最近聊了什么就行。", 2);
  const doc = (await getRequestResult(deps, { actorId: "actor:a", requestId: two }))!;
  assert.doesNotMatch(doc.answer!.text, /哪一位/u, JSON.stringify(doc.answer));
  assert.match(doc.answer!.text, /报价初稿/u);
  assert.equal(model.calls.length, 3);
  assert.ok(records.source.reads.some((id) => id.startsWith("note:m3")), "小林's notes were read");
});

/**
 * AE-CTX-005 (AG08): turn 2 thanked and asked about an e-mail; the reply opened 「まずはカードの確定をお待ちしています。」 about the
 * card of turn 1. With no card in this turn, a sentence about confirming a card is not delivered — 確定 counts as 確認 does.
 */
test("AE-CTX-005: a sentence about confirming the earlier card is dropped from a turn that shows no card", async () => {
  const { stripCardTalk } = await import("../../features/agent-v1/entry/approval-claims");
  const text = "ありがとうございます。まずはカードの確定をお待ちしています。\n初めての編集者さんへのメールは、標準的なビジネスメールで十分です。";
  const out = stripCardTalk(text);
  assert.deepEqual(out.dropped, ["まずはカードの確定をお待ちしています。"]);
  assert.equal(out.text, "ありがとうございます。\n初めての編集者さんへのメールは、標準的なビジネスメールで十分です。");
});

/**
 * AE-WEB-001 (AG09): 「…<url> ，这位导演的代表作和现任职务是什么？」 split into two web parts — the first holds the URL and reads
 * it; the second (「和现任职务是什么？」) asks about the same page and was told "no public name". It is answered from that page.
 */
test("AE-WEB-001: a second web part about the same page is answered from it — one fetch, no 'no public name'", async () => {
  const message = "这是是枝真纪的官方简介： https://toto-film.example.test/directors/koreeda-maki ，这位导演的代表作和现任职务是什么？";
  const model = deepseekStub((call) => {
    if (call.node === "understand") return json({ parts: [
      part({ dataSources: ["turn_material", "public_web"], localId: "p1", requiredCapabilities: ["web.fetch"], sourceQuote: "这是是枝真纪的官方简介： https://toto-film.example.test/directors/koreeda-maki ，这位导演的代表作" }),
      part({ dataSources: ["turn_material", "public_web"], localId: "p2", requiredCapabilities: ["web.fetch"], sourceQuote: "和现任职务是什么？" }),
    ], plainChat: false });
    if (call.node === "answer") {
      assert.match(call.user, /- p2 \[/u, "the role part is an item to answer");
      const page = /(w\d+) — public web page/u.exec(call.user)![1];
      return json({ segments: [
        { cites: [{ sentenceIds: [2], sourceRef: page }], partId: "p1", text: "代表作是《夏之庭》（2019）和《北行列车》（2023）。" },
        { cites: [{ sentenceIds: [3], sourceRef: page }], partId: "p2", text: "现任东都映画创作总监（2025 年 4 月起）。" },
      ] });
    }
    throw new Error(`unexpected model call in ${call.node}`);
  });
  const tools = toolsStub();
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(smallWorld()) });
  kit.deps.web = webAccess(tools);
  kit.deps.judgment = judgmentAccess(outboundJudge(0.03).fetchImplementation);
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(tools.calls.map((call) => call.kind), ["fetch"], "one fetch for both parts");
  assert.match(result.text, /创作总监/u);
  assert.doesNotMatch(result.text, /没有联网查|公开使用的名称/u);
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.status]), [["p1", "answered"], ["p2", "answered"]]);
});

/**
 * AE-RD-009 (AG10 rerun run-02): 「田中在客户访谈里最在意什么？」 was tagged as an event (and «我去过») of 田中 — and answered "finding
 * events by conditions is not in this version". A meeting or interview with a named person is in the user's notes about them.
 */
test("AE-RD-009: an 'event' of a named person is read from that person's notes by its words, not refused as an event search", async () => {
  const message = "田中在客户访谈里最在意什么？";
  const world = smallWorld();
  for (const record of world.records) if (record.userId === "user:a") record.userId = "actor:a";
  for (const record of world.records) if (record.collection === "notes") (record.payload.note as Record<string, unknown>).accountId = record.userId;
  const records = recordAccessOf(world);
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "田中" }, { entity: "event", text: "客户访谈" }, { entity: "attendance", text: "客户访谈" }], readFilter: { order: "newest", text: "客户访谈" }, requiredCapabilities: ["event.read", "attendance.read"], sourceQuote: message })], plainChat: false }),
    (call) => {
      const memo = /(s\d+) — memo "客户访谈"/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: memo }], partId: "p1", text: "田中最在意交付周期。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.doesNotMatch(result.text, /活动目录|还不能这样找/u);
  assert.deepEqual(result.sourceRefs, ["memo:note:m37"]);
});

/**
 * AE-JDG-007 (AG08): 「要是把给小林发修订报价那条待办改到周五，会不会来不及？」 — the to-do described before 「那条待办」 was taken as
 * 「要是把给小林发修订报价」, so the entry read 「把「要是把给小林发修订报价」改到周五」 and its words did not match T42. The conditional
 * lead-in and its 把 are not the record's words; the record's own words (「给小林发修订报价」) stay.
 */
test("AE-JDG-007: the conditional lead-in is not part of the described to-do, and the entry names the to-do by its own words", async () => {
  const { describedObjectSpan } = await import("../../features/agent-v1/understand/described-clue");
  const { entryLabel } = await import("../../features/agent-v1/clarify/options");
  const words = (message: string, clue: string) => {
    const at = message.indexOf(clue);
    const span = describedObjectSpan(message, [at, at + clue.length], [0, message.length], clue);
    return span ? message.slice(span[0], span[1]) : null;
  };
  const message = "要是把给小林发修订报价那条待办改到周五，会不会来不及？";
  assert.equal(words(message, "那条待办"), "给小林发修订报价");
  assert.equal(words("如果将约山本吃饭这条待办挪到下周呢？", "这条待办"), "约山本吃饭");
  assert.equal(words("把约山本吃饭这条待办改到周五。", "这条待办"), "约山本吃饭", "the lead-ins without a condition are as before");
  assert.equal(words("帮我看看约山本吃饭这条待办。", "这条待办"), "约山本吃饭");
  assert.equal(entryLabel({ date: "周五", kind: "reschedule" } as never, "zh", words(message, "那条待办"), "todo"), "把「给小林发修订报价」改到周五");
});
