import assert from "node:assert/strict";
import test from "node:test";

import { exactCountsIn, withoutPartialCounts } from "../../features/agent-v1/answer/counts";
import { optionsFor } from "../../features/agent-v1/clarify/options";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { bareNameOf } from "../../features/agent-v1/graph/nodes/understand";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact } from "./read-kit";

/**
 * agent-design AG10 run-03 (coordinator, after the run-02 judging), each a code rule:
 *   1. AE-AMB-001: "小林" alone gets the directions named for 小林 even when the first layer gave no person clue — a message
 *      that is only a name of one of the user's contacts names that person (the first layer gave the clue in 10 runs in a
 *      row and left it out at 5c02515; the option builder was never changed).
 *   2. AE-RD-005: a partial read does not say "only … this once" in its split forms (只记到…这一次, 只有…那一条, …だけ…一回,
 *      only … once).
 */

const NOW = "2026-11-15T01:00:00.000Z";

test("AE-AMB-001: the option builder names 小林 in all three directions", () => {
  const options = optionsFor({ language: "zh", object: { kind: "contact", name: null, text: "小林" }, purpose: "directions" });
  assert.deepEqual(options.map((option) => [option.label, option.capability]), [
    ["看和小林最近的往来", "view.recentInteraction"],
    ["记一笔关于小林的事", "memo.create"],
    ["给小林设个提醒", "todo.create"],
  ]);
});

const bare = (message: string, language: "zh" | "ja" | "en") =>
  deepseekStub(() => json({ language, parts: [part({ capabilities: [], clarity: "none", dataSources: ["turn_material"], objectClues: [], requiredCapabilities: [], sourceQuote: message })], plainChat: false }));

test("AE-AMB-001: '小林' alone, no person clue from the first layer — the named directions, and nothing is looked up", async () => {
  const kit = graphKit(bare("小林", "zh").fetchImplementation, { now: NOW, records: recordAccessOf({ events: [], records: [contact("actor:a", "contact:c17", "小林健")] }) });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input("小林"));
    const options = result.clarifications.flatMap((set) => set.options.map((option) => [option.label, option.capability]));
    assert.deepEqual(options, [
      ["看和小林最近的往来", "view.recentInteraction"],
      ["记一笔关于小林的事", "memo.create"],
      ["给小林设个提醒", "todo.create"],
    ]);
    // R1: nothing about 小林 is looked up (no_private_reads).
    assert.equal(trace.events.filter((event) => event.type === "read.query" || event.type === "read.result").length, 0);
  } finally {
    trace.restore();
  }
});

test("AE-AMB-001: which bare words read as a name (words only, nothing looked up)", () => {
  for (const name of ["小林", "小林さん", "王芳", "田中", "老周", "Emily", "Emily Chen"]) assert.equal(bareNameOf(name), name, name);
  assert.equal(bareNameOf("小林。"), "小林");
  for (const word of ["明天", "谢谢", "你好", "高兴", "報告", "Hello", "Thanks", "tomorrow", "帮我看看这个"]) assert.equal(bareNameOf(word), null, word);
});

test("AE-AMB-001: a bare word that is not a name keeps the generic directions", async () => {
  const kit = graphKit(bare("明天", "zh").fetchImplementation, { now: NOW, records: recordAccessOf({ events: [], records: [contact("actor:a", "contact:c17", "小林健")] }) });
  const trace = captureTrace();
  try {
    const result = await runAgentGraph(kit.deps, kit.input("明天"));
    const labels = result.clarifications.flatMap((set) => set.options.map((option) => option.label));
    assert.deepEqual(labels, ["查我的资料", "记一笔", "设个提醒"]);
  } finally {
    trace.restore();
  }
});

test("AE-RD-005: split 'only … once' forms are exact counts (zh, ja, en); 'not only' and '不只' are not", () => {
  assert.deepEqual(exactCountsIn("这个月只记到 11 月 10 日这一次：小林健给你打电话。"), [1]);
  assert.deepEqual(exactCountsIn("只有 11 月 10 日那一条。"), [1]);
  assert.deepEqual(exactCountsIn("今月の記録は11月10日だけで、一回です。"), [1]);
  assert.deepEqual(exactCountsIn("You only spoke on Nov 10, once."), [1]);
  assert.deepEqual(exactCountsIn("You only have one call this month, on Nov 10."), [1]);
  assert.deepEqual(exactCountsIn("他不只一次提到报价。"), []);
  assert.deepEqual(exactCountsIn("Not only did he call once, he also wrote."), []);
});

test("AE-RD-005: a partial read neutralizes the split forms; the content stays", () => {
  const lead = withoutPartialCounts("这个月只记到 11 月 10 日这一次：小林健给你打电话，说小陈在审核；你答应 11 月 13 日给小林发报价。", "zh", new Set());
  assert.equal(lead.text, "读得到的记录里：小林健给你打电话，说小陈在审核；你答应 11 月 13 日给小林发报价。");
  const plain = withoutPartialCounts("这个月只有 11 月 10 日那一条。", "zh", new Set());
  assert.doesNotMatch(plain.text, /只|一条/u);
  assert.match(plain.text, /11 月 10 日/u);
  assert.equal(exactCountsIn(withoutPartialCounts("今月の記録は11月10日だけで、一回です。電話がありました。", "ja", new Set()).text).length, 0);
  assert.equal(withoutPartialCounts("You only spoke on Nov 10, once. He called about the quote.", "en", new Set()).text, "He called about the quote.");
  // A total the read itself gave stays.
  assert.match(withoutPartialCounts("只有 11 月 10 日那一条。", "zh", new Set([1])).text, /只有 11 月 10 日那一条/u);
});

test("AE-CTX-005: a sentence with a stray script (Cyrillic, Arabic, Thai …) that no material holds is not delivered", async () => {
  const { withoutStrayScripts } = await import("../../features/agent-v1/answer/claims");
  const said = "どういたしまして。初めての編集者さんへのメールは、少し丁寧めで十分です。ポイントは「 кратко? 」——失礼しました、以下です。\n- 件名で用件を伝える";
  const cleaned = withoutStrayScripts(said, "初めてやり取りする編集者さんへのメール");
  assert.equal(cleaned.text, "どういたしまして。初めての編集者さんへのメールは、少し丁寧めで十分です。\n- 件名で用件を伝える");
  assert.equal(cleaned.dropped.length, 1);
  assert.equal(withoutStrayScripts("Keep it short. مرحبا is how to open. Sign with your name.", "").text, "Keep it short. Sign with your name.");
  assert.equal(withoutStrayScripts("小林说 สวัสดี 之后就挂了。报价周三发。", "").text, "报价周三发。");
  // Words a record or page holds, or the user wrote, stay.
  assert.equal(withoutStrayScripts("笔记里记着他的俄文名 Иван Петров。", "note: Иван Петров, 出版社").dropped.length, 0);
  assert.equal(withoutStrayScripts("名片上写的是 김민수。", "card: 김민수").dropped.length, 0);
  assert.equal(withoutStrayScripts("没有别的文字。Plain English, 日本語も。", "").dropped.length, 0);
});

test("AE-FN-009 R3: an extraction that fails over a memo already holding that interaction says it is recorded there; with none, the plain failure line", async () => {
  const { fnWorld, runFn } = await import("./functions-kit");
  const message = "再用 @11 月 10 日笔记 更新一次我和小林的往来。";
  const understood = [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions", "memo.update"], sourceQuote: message }];
  const references = [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }];
  const world = fnWorld();
  const m32 = world.records.find((record) => record.id === "note:m32")!;
  (m32.payload as { note: Record<string, unknown> }).note.interaction = { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-10", precision: "day" };
  // The extraction's model output is unusable twice (as a timeout leaves it): the extraction fails.
  const failed = await runFn(message, understood, { extract: "not an extraction", references, world });
  assert.match(failed.result.text, /已经记在笔记「11 月 10 日笔记」上/u);
  assert.match(failed.result.text, /小林健/u);
  assert.match(failed.result.text, /这次没能再整理/u);
  assert.ok(failed.result.sourceRefs.includes("memo:note:m32"), "the note can be opened");
  const plain = await runFn(message, understood, { extract: "not an extraction", references });
  assert.match(plain.result.text, /这次没能整理这篇笔记，什么都没有改/u);
  assert.doesNotMatch(plain.result.text, /已经记在/u);
});

test("AE-SCL-018: one sentence split into two parts (往来 / 答应的事) over the same memo is extracted once and said once", async () => {
  const { runFn } = await import("./functions-kit");
  const { noul } = await import("./judgment-kit");
  const message = "@11 月 10 日笔记 里实际有过的往来和我答应的事，帮我整理一下。";
  const clue = { entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" };
  const run = await runFn(message, [
    { dataSources: ["orbit_records"], deliverable: "list", objectClues: [clue], requiredCapabilities: ["memo.read", "fn.extractInteractions"], sourceQuote: message },
    { dataSources: ["orbit_records"], deliverable: "list", objectClues: [clue], requiredCapabilities: ["memo.read", "fn.extractFollowUps"], sourceQuote: message },
  ], {
    extract: { followUps: [], interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.equal(run.modelCalls.filter((call) => call.node === "functions").length, 1, "one extraction for the sentence");
  const text = run.result.text;
  const heading = text.split("\n")[0];
  assert.ok(heading.trim(), "a heading line");
  assert.equal(text.split("\n").filter((line) => line === heading).length, 1, `the block is said once:\n${text}`);
  assert.equal(run.events.filter((event) => event.type === "fn.extractInteractions").length, 1);
  assert.ok(run.result.state.parts.every((part) => part.status === "answered"), "both parts are answered");
});

test("run-03 gate (AE-FN-011): 'それをToDoに追加して' bound to the memo under another entity name is still the memo's commitments as to-dos", async () => {
  const { fnWorld, NOW: FN_NOW, runFn } = await import("./functions-kit");
  const { choice } = await import("./judgment-kit");
  const world = fnWorld();
  const session = graphKit(fetch, { now: FN_NOW, records: recordAccessOf(world) });
  const M38 = { id: "note:m38", name: "山本さんの打ち合わせメモ", type: "memo" };
  const owner = (id: string) => (id.split("__")[1] === "f1" ? choice("me", 0.95) : undefined);
  const first = "@山本さん打ち合わせメモ の中で、私が約束したことは何ですか？";
  const extract = { followUps: [{ aboutClue: "山本", action: "原稿を山本さんに送る", dueDateText: "12月5日までに", owner: "me", sentenceIds: [2] }] };
  await runFn(first, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@山本さん打ち合わせメモ" }], requiredCapabilities: ["memo.read"], sourceQuote: first }], { extract, judge: owner, language: "ja", references: [M38], session, world });
  const second = "それをToDoに追加してください。";
  // As the gate's first layer gave it: "それ" bound to the memo's handle but called a to-do, and "それ" also as a person.
  const run = await runFn(second, [{ deliverable: "change", objectClues: [{ entity: "todo", referenceId: "r1", text: "それ" }, { entity: "contact", text: "それ" }], requiredCapabilities: ["todo.create"], sourceQuote: second }], { extract, judge: owner, language: "ja", session, world });
  assert.equal(run.frozen.length, 1, run.result.text);
  const [intent] = run.frozen[0].intents as { capability: string; set: Record<string, unknown> }[];
  assert.equal(intent.capability, "todo.create");
  assert.equal(intent.set.sourceNoteId, "note:m38");
});

test("run-03 gate (AE-SCL-017): formal follow-ups ranked with no to-do read from the first layer (a note read and an extraction instead) are still the to-do ranking", async () => {
  const { fnWorld, runFn } = await import("./functions-kit");
  const message = "列出已经过期、或者 11 月 22 日之前到期的正式跟进，过期最久的排前面，只要前三条。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", objectClues: [], rank: { count: 3, direction: "asc", orderBy: "dueAt" }, readFilter: { to: "2026-11-22" }, requiredCapabilities: ["memo.read", "fn.extractFollowUps", "fn.rank"], sourceQuote: message }], { world: fnWorld() });
  const ranks = run.events.filter((event) => event.type === "fn.rank");
  assert.equal(ranks.length, 1, run.result.text);
  assert.ok((ranks[0].listed as string[]).every((ref) => ref.startsWith("todo:")), JSON.stringify(ranks[0].listed));
});
