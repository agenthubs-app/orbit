import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact, memo, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG05-1/3 through the graph: a read part is compiled by code (no extra model call), read
 * in the account, answered from numbered sentences with citations that code checks, and delivered with
 * source refs that open. One read is two model calls (understand, answer); a repair stays within four.
 */

const ACTOR = "actor:a";

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  return base;
}

const handleOf = (user: string, pattern: RegExp) => pattern.exec(user)![1];

test("上次和小林聊了什么: no structured interaction, so the latest note answers, cited, said to come from the notes", async () => {
  const message = "上次和小林聊了什么？";
  const records = recordAccessOf(world());
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "上次和小林聊了什么" })], plainChat: false }),
    (call) => {
      assert.match(call.user, /\[RECORDS\]/u);
      assert.match(call.user, /No interaction with 小林健 is recorded/u);
      const m31 = handleOf(call.user, /(s\d+) — memo "和小林聊了报价初稿。小林", written 2026-11-12/u);
      assert.ok(call.user.indexOf("2026-11-12") < call.user.indexOf("2026-11-10"), "newest first");
      return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: m31 }], partId: "p1", text: "11 月 12 日聊了报价初稿，小林希望把实施费单列。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.equal(model.calls.length, 2, "understand and answer only: the read is compiled by code");
  assert.deepEqual(result.sourceRefs, ["memo:note:m31"]);
  assert.match(result.text, /实施费单列/u);
  // AG07 (coordinator note): the basis line says it comes from the notes, so the footnote is not repeated in the text.
  assert.equal(result.basis?.text, "按你11月12日记的笔记回答");
  assert.doesNotMatch(result.text, /出自你的笔记/u);
  assert.deepEqual(result.partResults.map((item) => item.status), ["answered"]);
  assert.equal(records.source.reads.some((id) => id === "note:mb1" || id === "contact:cb1"), false);
});

test("the last interaction counts the structured one: 11 月 15 日 comes first", async () => {
  const base = world();
  base.records.push(memo(ACTOR, "note:m41", "早上和小林在车站碰到，约了下周对报价。", "2026-11-15T00:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-15", precision: "day" } }));
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["view.recentInteraction"], sourceQuote: "我和小林最近一次互动是哪天" })], plainChat: false }),
    (call) => {
      assert.match(call.user, /Recorded interactions with 小林健, newest first/u);
      assert.match(call.user, /records an actual meeting \(mutual\) with 小林健 on 2026-11-15/u);
      assert.doesNotMatch(call.user, /报价初稿/u, "with a real interaction, old notes are not given");
      const m41 = handleOf(call.user, /(s\d+) — memo/u);
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: m41 }], partId: "p1", text: "最近一次是 11 月 15 日，早上在车站碰到。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base) });
  const result = await runAgentGraph(kit.deps, kit.input("我和小林最近一次互动是哪天？当时说了什么？"));
  assert.deepEqual(result.sourceRefs, ["memo:note:m41"]);
});

test("an invalid citation gets the one repair; still invalid, the records part is not delivered", async () => {
  const message = "上次和小林聊了什么？";
  const understand = json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read"], sourceQuote: "上次和小林聊了什么" })], plainChat: false });
  const wrong = json({ segments: [{ cites: [{ sentenceIds: [9], sourceRef: "s99" }], partId: "p1", text: "小林上次要求降价。" }] });
  const trace = captureTrace();
  try {
    const fixed = deepseekStub([understand, wrong, (call) => {
      assert.match(call.user, /not one of the materials/u, "the repair is told what was wrong");
      const handle = handleOf(call.user, /(s\d+) — memo "和小林聊了报价初稿/u);
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "聊了报价初稿。" }] });
    }]);
    const kit = graphKit(fixed.fetchImplementation, { records: recordAccessOf(world()) });
    const repaired = await runAgentGraph(kit.deps, kit.input(message));
    assert.equal(fixed.calls.length, 3);
    assert.deepEqual(repaired.sourceRefs, ["memo:note:m31"]);
    assert.doesNotMatch(repaired.text, /降价/u);

    const stubborn = deepseekStub([understand, wrong, wrong]);
    const kit2 = graphKit(stubborn.fetchImplementation, { records: recordAccessOf(world()) });
    const failed = await runAgentGraph(kit2.deps, kit2.input(message));
    assert.equal(stubborn.calls.length, 3, "one repair only");
    assert.ok(failed.state.budget.used <= 4);
    assert.doesNotMatch(failed.text, /降价/u, "nothing without a valid source is delivered");
    assert.deepEqual(failed.partResults.map((item) => [item.status, item.reason]), [["unfinished", "unverified"]]);
    assert.deepEqual(failed.sourceRefs, []);
    assert.ok(trace.events.some((event) => event.type === "answer.citations_rejected"));
  } finally {
    trace.restore();
  }
});

test("read, then the permission is withdrawn: the second turn reads again, says it cannot, repeats nothing", async () => {
  const base = world();
  const records = recordAccessOf(base);
  const turn1 = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "田中" }], readFilter: { text: "客户访谈" }, requiredCapabilities: ["memo.read"], sourceQuote: "田中在客户访谈里最在意什么" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handleOf(call.user, /(s\d+) — memo "客户访谈"/u) }], partId: "p1", text: "田中最在意交付周期。" }] }),
  ]);
  const kit = graphKit(turn1.fetchImplementation, { records });
  const first = await runAgentGraph(kit.deps, kit.input("田中在客户访谈里最在意什么？"));
  assert.deepEqual(first.sourceRefs, ["memo:note:m37"]);
  const stored = await kit.sessionState.get(ACTOR, "session:a");
  assert.ok(stored?.lastMentioned.some((item) => item.id === "note:m37"), "the cited note is the memo mentioned last");

  records.denied.add("note:m37");
  const turn2 = deepseekStub([(call) => {
    assert.doesNotMatch(call.user, /交付周期/u, "the earlier answer's content is not shown again");
    assert.match(call.user, /(r\d) memo \(cannot be opened now\)/u);
    const closed = handleOf(call.user, /(r\d) memo \(cannot be opened now\)/u);
    return json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: closed, text: "刚才的要点" }], requiredCapabilities: ["memo.read"], sourceQuote: "把刚才的要点再说一遍" })], plainChat: false });
  }]);
  kit.deps.fetchImplementation = turn2.fetchImplementation;
  const messages = [{ createdAt: "2026-11-15T09:59:00.000Z", role: "user" as const, text: "田中在客户访谈里最在意什么？" }, { createdAt: "2026-11-15T09:59:10.000Z", recordRefs: first.sourceRefs, role: "assistant" as const, text: first.text }];
  kit.deps.loadMessages = async () => messages;
  const second = await runAgentGraph(kit.deps, kit.input("把刚才的要点再说一遍。"));
  assert.equal(turn2.calls.length, 1, "nothing to answer from: no answer call");
  assert.deepEqual(second.partResults.map((item) => [item.status, item.gaps]), [["unfinished", ["unreadable"]]]);
  assert.match(second.text, /之前用过的那条记录现在读不到了/u);
  assert.doesNotMatch(second.text, /交付周期|分两期|月底前/u);
  assert.deepEqual(second.sourceRefs, []);
});

test("Japanese reads go through the same path (AG01 found the old query schema refused ja): open to-dos, tomorrow's schedule", async () => {
  const records = recordAccessOf(world());
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: "まだ終わっていないタスクを一覧にしてください" })], plainChat: false }),
    (call) => {
      assert.match(call.user, /Title: 給小林發修訂報價|Title: 给小林发修订报价/u);
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handleOf(call.user, /(s\d+) — to-do/u) }], partId: "p1", text: "未完了のタスクは「给小林发修订报价」です。" }] });
    },
    json({ parts: [part({ dataSources: ["orbit_records"], readFilter: { from: "2026-11-16", to: "2026-11-16" }, requiredCapabilities: ["schedule.read"], sourceQuote: "明日の予定を教えてください" })], plainChat: false }),
    (call) => {
      assert.match(call.user, /Title: 团队周会/u);
      assert.match(call.user, /Starts: 2026-11-16 \(Mon\) 10:00/u);
      return json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: handleOf(call.user, /(s\d+) — personal schedule item/u) }], partId: "p1", text: "11月16日（月）10:00 からチーム定例があります。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const todos = await runAgentGraph(kit.deps, kit.input("まだ終わっていないタスクを一覧にしてください。", { locale: "ja" }));
  assert.equal(todos.state.language, "ja");
  assert.deepEqual(todos.sourceRefs, ["todo:task:t42"]);
  const tomorrow = await runAgentGraph(kit.deps, kit.input("すみません、やっぱり明日の予定を教えてください。", { locale: "ja" }));
  assert.deepEqual(tomorrow.sourceRefs, ["schedule:personal:s10"]);
  assert.match(tomorrow.text, /チーム定例/u);
});

test("a later part of the same message that names no one reads the same person, narrowed the same way", async () => {
  const base = world();
  base.records.push(
    contact(ACTOR, "contact:lc08", "鈴木健太", { organization: "東都精機" }),
    contact(ACTOR, "contact:lc09", "鈴木健", { organization: "相模メカトロ" }),
    todo(ACTOR, "task:lt01", "鈴木健太さんに面接日程の候補を送る", { dueAt: "2026-11-10T09:00:00.000Z", relatedContactId: "contact:lc08" }),
    todo(ACTOR, "task:lt04", "鈴木健太さんに候補者リストを送る", { relatedContactId: "contact:lc08", status: "completed" }),
    todo(ACTOR, "task:lt05", "鈴木健さんにフォーマットを送る", { dueAt: "2026-11-11T09:00:00.000Z", relatedContactId: "contact:lc09" }),
  );
  const records = recordAccessOf(base);
  const message = "東都精機の鈴木健太さん関連で、まだ終わっていないToDoは全部で何件ありますか。期限を過ぎているものがあれば挙げてください。";
  const model = deepseekStub([
    json({ parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "東都精機の鈴木健太さん" }], readFilter: { status: "open" }, requiredCapabilities: ["todo.read", "contact.read"], sourceQuote: "東都精機の鈴木健太さん関連で、まだ終わっていないToDoは全部で何件ありますか。" }),
      part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p2", objectClues: [{ entity: "todo", text: "期限を過ぎているもの" }], requiredCapabilities: ["todo.read"], sourceQuote: "期限を過ぎているものがあれば挙げてください。" }),
    ], plainChat: false }),
    (call) => {
      assert.doesNotMatch(call.user, /鈴木健さんにフォーマット/u, "the other 鈴木's to-do is not read");
      assert.doesNotMatch(call.user, /候補者リスト/u, "nor a completed one");
      assert.match(call.user, /overdue/u);
      const handles = [...call.user.matchAll(/(s\d+) — to-do/gu)].map((match) => match[1]);
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handles[0] }], partId: "p1", text: "1 件です。" }, { cites: [{ sentenceIds: [1, 4], sourceRef: handles[handles.length - 1] }], partId: "p2", text: "面接日程の候補を送る（11月10日期限）。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.deepEqual(result.sourceRefs, ["todo:task:lt01"]);
  for (const id of ["task:lt04", "task:lt05"]) assert.equal(records.source.reads.includes(id), false, id);
});

test("a topic word and 'the first time' read the person's notes by the word, oldest first (not the last interaction)", async () => {
  const base = world();
  base.records.push(
    memo(ACTOR, "note:old-glaze", "灰釉の湯呑みは春の薪窯まで待ってほしいとのこと。", "2025-12-08T05:00:00.000Z", ["contact:c17"]),
    memo(ACTOR, "note:new-glaze", "灰釉の汤吞样品到了。", "2026-03-18T05:00:00.000Z", ["contact:c17"]),
    memo(ACTOR, "note:call", "电话聊了运费。", "2026-11-13T05:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-13", precision: "day" } }),
  );
  const message = "小林さんと灰釉の話を最初にしたのはいつでしたか。そのとき彼は何と言っていましたか。";
  const model = deepseekStub([
    json({ parts: [
      part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林さん" }], readFilter: { order: "oldest", text: "灰釉" }, requiredCapabilities: ["contact.read", "memo.read", "view.timeline"], sourceQuote: "小林さんと灰釉の話を最初にしたのはいつでしたか。" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "彼" }], requiredCapabilities: ["memo.read", "view.timeline"], sourceQuote: "そのとき彼は何と言っていましたか。" }),
    ], plainChat: false }),
    (call) => {
      assert.doesNotMatch(call.user, /运费/u, "the last interaction is not what a topic search reads");
      const first = handleOf(call.user, /(s\d+) — memo "灰釉の湯呑みは春の薪窯/u);
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: first }], partId: "p1", text: "2025年12月8日です。" }, { cites: [{ sentenceIds: [1], sourceRef: first }], partId: "p2", text: "春の薪窯まで待ってほしいとのことでした。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base) });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja" }));
  assert.deepEqual(result.sourceRefs, ["memo:note:old-glaze"]);
});

test("words that match none of the person's notes: their notes are read without them, and the model is told so", async () => {
  const base = world();
  base.records.push(memo(ACTOR, "note:first", "Met him at a trade show. He is an engineer at Kestrel.", "2024-06-18T05:00:00.000Z", ["contact:c17"]), memo(ACTOR, "note:now", "He started at Northwind on October 1.", "2026-10-21T05:00:00.000Z", ["contact:c17"]));
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "contact", text: "小林健" }], readFilter: { order: "both", text: "working" }, requiredCapabilities: ["contact.read", "view.timeline"], sourceQuote: "Where was 小林健 working when I first met him, and where is he now?" })], plainChat: false }),
    (call) => {
      assert.match(call.user, /No note of theirs contains "working"/u);
      const first = handleOf(call.user, /(s\d+) — memo "Met him at a"/u);
      const now = handleOf(call.user, /(s\d+) — memo "He started a"/u);
      return json({ segments: [{ cites: [{ sentenceIds: [2], sourceRef: first }, { sentenceIds: [1], sourceRef: now }], partId: "p1", text: "Kestrel then, Northwind now." }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base) });
  const result = await runAgentGraph(kit.deps, kit.input("Where was 小林健 working when I first met him, and where is he now?", { locale: "en" }));
  assert.deepEqual([...result.sourceRefs].sort(), ["memo:note:first", "memo:note:now"]);
});

test("the checkpoint keeps refs, versions and gaps of a read, never the record's words", async () => {
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read"], sourceQuote: "上次和小林聊了什么" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handleOf(call.user, /(s\d+) — memo "和小林聊了报价初稿/u) }], partId: "p1", text: "聊了报价初稿。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
  const input = kit.input("上次和小林聊了什么？");
  await runAgentGraph(kit.deps, input);
  const tuple = await kit.checkpointer.getTuple({ configurable: { thread_id: input.requestId } });
  const stored = JSON.stringify(tuple?.checkpoint ?? {});
  assert.ok(stored.includes("memo:note:m31"), "the ref is kept");
  for (const words of ["报价初稿", "实施费", "小林健", "上次和小林"]) assert.equal(stored.includes(words), false, words);
});

test("two people of the name, the company tells them apart; without it, ask which (no guess)", async () => {
  const base = world();
  base.records.push(contact(ACTOR, "contact:z1", "张伟", { organization: "曜石半导体" }), contact(ACTOR, "contact:z2", "张伟", { organization: "岚图机器人" }));
  base.records.push(memo(ACTOR, "note:z1", "张伟来电：最快 1 月 5 日到岗。", "2026-11-09T10:00:00.000Z", ["contact:z1"]), memo(ACTOR, "note:z2", "岚图希望不晚于 12 月 15 日。", "2026-11-12T10:00:00.000Z", ["contact:z2"]));
  const named = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "曜石半导体的张伟" }], requiredCapabilities: ["memo.read"], sourceQuote: "曜石半导体的张伟上次说最快什么时候能到岗" })], plainChat: false }),
    (call) => {
      assert.doesNotMatch(call.user, /12 月 15 日/u, "the other 张伟 is not read");
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handleOf(call.user, /(s\d+) — memo/u) }], partId: "p1", text: "最快 1 月 5 日到岗。" }] });
    },
  ]);
  const kit = graphKit(named.fetchImplementation, { records: recordAccessOf(base) });
  const one = await runAgentGraph(kit.deps, kit.input("曜石半导体的张伟上次说最快什么时候能到岗？"));
  assert.deepEqual(one.sourceRefs, ["memo:note:z1"]);

  const bare = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "张伟" }], requiredCapabilities: ["memo.read"], sourceQuote: "张伟上次说了什么" })], plainChat: false })]);
  const kit2 = graphKit(bare.fetchImplementation, { records: recordAccessOf(base) });
  const two = await runAgentGraph(kit2.deps, kit2.input("张伟上次说了什么？"));
  assert.equal(bare.calls.length, 1);
  assert.equal(two.status, "waiting_user");
  assert.deepEqual(two.partResults.map((item) => item.status), ["awaiting_clarification"]);
  assert.deepEqual(two.clarifications[0].options.map((option) => option.ref?.id).sort(), ["contact:z1", "contact:z2"]);
});
