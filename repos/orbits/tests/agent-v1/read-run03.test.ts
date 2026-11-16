import assert from "node:assert/strict";
import test from "node:test";

import { groundedAnswerSystemPrompt } from "../../features/agent-v1/answer/prompt";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { coverEverySentence } from "../../features/agent-v1/understand/cover";
import { understandSystemPrompt } from "../../features/agent-v1/understand/prompt";
import type { UnderstandOutput } from "../../features/agent-v1/understand/schema";
import { validateUnderstandOutput } from "../../features/agent-v1/understand/validate";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { memo, smallWorld } from "./read-kit";

/**
 * agent-design AG05 run-03 (coordinator, after run-02 failed):
 * 1. AE-SCL-007 dev6: a part about how a person stands NOW reads their newest notes next to the interaction
 *    view, so a newer note wins over an older interaction; "last time" reads exactly what it read before.
 * 2. AE-AMB-012 (AG04 rerun): every sentence of the current message lands in some part — a sentence the
 *    first layer left out becomes a statement part made by code.
 * 3. (optional) a statement is acknowledged plainly, without telling the user that nothing was saved.
 */

const ACTOR = "actor:a";

/** 小林健: the profile says 北辰软件; the last interaction (a call on 11/13) says nothing about it; a plain note of 11/14 says he moved. */
function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(
    memo(ACTOR, "note:call", "电话聊了运费。", "2026-11-13T05:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-13", precision: "day" } }),
    memo(ACTOR, "note:moved", "小林说他已经离开北辰软件，11 月起在青木科技做销售总监。", "2026-11-14T05:00:00.000Z", ["contact:c17"]),
  );
  return base;
}

test("the first layer's prompt has readFilter.current for a person's situation now", () => {
  assert.match(understandSystemPrompt(), /"current": true \(how the person stands now/u);
});

test("readFilter.current is kept when true and dropped otherwise", () => {
  const message = "小林现在在哪家公司？";
  const input = { handles: new Set<string>(), message, openItemRefs: new Set<string>() };
  const kept = validateUnderstandOutput({ parts: [part({ dataSources: ["orbit_records"], readFilter: { current: true }, requiredCapabilities: ["contact.read"], sourceQuote: message })], plainChat: false }, input);
  assert.equal(kept.ok, true);
  if (kept.ok === true) assert.deepEqual(kept.output.parts[0].readFilter, { current: true });
  const dropped = validateUnderstandOutput({ parts: [part({ dataSources: ["orbit_records"], readFilter: { current: "yes" }, requiredCapabilities: ["contact.read"], sourceQuote: message })], plainChat: false }, input);
  assert.equal(dropped.ok, true);
  if (dropped.ok === true) {
    assert.equal(dropped.output.parts[0].readFilter, undefined);
    assert.ok(dropped.dropped.some((item) => item.includes("readFilter.current")));
  }
});

for (const capabilities of [["contact.read", "view.recentInteraction"], ["contact.read", "memo.read", "view.recentInteraction"]]) {
  test(`'where is he now' (${capabilities.join(", ")}): the newest notes are read next to the interaction view, and the newer one is what the answer gets`, async () => {
    let seen = "";
    const model = deepseekStub([
      json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林健" }], readFilter: { current: true, order: "newest" }, requiredCapabilities: capabilities, sourceQuote: "小林健现在在哪家公司" })], plainChat: false }),
      (call) => {
        seen = call.user;
        return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo "小林说他已经离开/u.exec(call.user)![1] }], partId: "p1", text: "他 11 月起在青木科技做销售总监。" }] });
      },
    ]);
    const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
    const result = await runAgentGraph(kit.deps, kit.input("小林健现在在哪家公司？"));
    assert.match(seen, /青木科技/u, "the newer plain note is read");
    assert.match(seen, /电话聊了运费/u, "the interaction view is still read");
    assert.match(seen, /how the person stands now[^\n]*newer/u, "the answer step is told the newer record wins");
    assert.deepEqual(result.sourceRefs, ["memo:note:moved"]);
  });
}

test("'the last time' (no current) reads what it read before: the interaction, not the newer plain note", async () => {
  let seen = "";
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林健" }], requiredCapabilities: ["contact.read", "memo.read", "view.recentInteraction"], sourceQuote: "上次和小林健聊了什么" })], plainChat: false }),
    (call) => {
      seen = call.user;
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo "电话聊了运费/u.exec(call.user)![1] }], partId: "p1", text: "聊了运费。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
  await runAgentGraph(kit.deps, kit.input("上次和小林健聊了什么？"));
  assert.match(seen, /电话聊了运费/u);
  assert.doesNotMatch(seen, /青木科技/u);
});

const out = (parts: Record<string, unknown>[], plainChat = false) => ({ parts, plainChat }) as unknown as UnderstandOutput;

test("a sentence the first layer left out becomes a statement part made by code, in message order", () => {
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const covered = coverEverySentence(out([part({ dataSources: ["orbit_records"], localId: "p1", requiredCapabilities: ["todo.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天" })]), message);
  assert.deepEqual(covered.added, ["小林今天又来电话催报价了"]);
  assert.deepEqual(covered.output.parts.map((item) => item.sourceQuote), ["小林今天又来电话催报价了", "帮我看看给他的修订报价那条待办排在哪天"]);
  const added = covered.output.parts[0];
  assert.equal(added.clarity, "statement");
  assert.deepEqual(added.requiredCapabilities, []);
  assert.equal(added.localId, "p2", "a fresh id; the model's ids are kept");
  assert.ok(message.includes(added.sourceQuote), "the quote is the user's own words");
});

test("covered sentences, a half-covered sentence, punctuation and plain chat add nothing", () => {
  const message = "Where was Tomás when I first met him, and where is he now?";
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "Where was Tomás when I first met him" }), part({ localId: "p2", sourceQuote: "where is he now?" })]), message).added, []);
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "Where was Tomás when I first met him" })]), message).added, [], "a sentence a part covers in part is covered");
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "谢谢" })]), "谢谢！！").added, []);
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "你好" })], true), "你好。今天天气不错。").added, [], "plain chat answers the whole message");
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "He left. She stayed" })]), "He left. She stayed.").added, []);
  assert.deepEqual(coverEverySentence(out([part({ sourceQuote: "She stayed" })]), "He left. She stayed.").added, ["He left"]);
});

test("AE-AMB-012 shape: the first layer gives only the read part; the statement still gets an answered part and no card", async () => {
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", text: "小林" }, { entity: "todo", text: "修订报价那条待办" }], readFilter: { text: "修订报价" }, requiredCapabilities: ["contact.read", "todo.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天" })], plainChat: false }),
    (call) => {
      const statement = /- (p\d+) \[DISCUSSION\]: "小林今天又来电话催报价了"/u.exec(call.user)![1];
      return json({ segments: [{ cites: [], partId: statement, text: "又催了一次。" }, { cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p1", text: "排在 11 月 18 日（周三）。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(world()) });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  const statement = result.partResults.find((item) => item.sourceQuote === "小林今天又来电话催报价了");
  assert.ok(statement, "a part holds the statement");
  assert.equal(statement!.status, "answered");
  assert.notEqual(statement!.route, "propose_write");
  assert.deepEqual(result.sourceRefs, ["todo:task:t42"]);
  assert.match(result.text, /11 月 18 日/u);
});

test("the answer prompt acknowledges a statement plainly, without saying that nothing was saved", () => {
  assert.match(groundedAnswerSystemPrompt("zh"), /acknowledge it in a few plain words[^.]*do not tell the user that nothing was saved/u);
});
