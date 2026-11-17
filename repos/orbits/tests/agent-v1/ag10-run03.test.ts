import assert from "node:assert/strict";
import test from "node:test";

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
