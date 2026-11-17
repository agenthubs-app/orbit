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
