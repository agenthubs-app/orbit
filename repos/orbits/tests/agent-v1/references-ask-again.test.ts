import assert from "node:assert/strict";
import test from "node:test";

import { asksAgainAbout } from "../../features/agent-v1/references/marks";
import { referenceAuthorizer } from "../../features/agent-v1/graph/executor";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { A, memo, smallWorld } from "./read-kit";

/**
 * agent-design AG11 (AE-SCL-021, 验收 AG11-2): after 「@选品方向 这篇里我定的三个方向是什么？」, the message 「那 @选品方向 这一篇呢？」
 * with another note picked asks the same question about that note. Code carries the question; the part reads the picked
 * note and answers it — it is not read as "some other aspect" (a summary or the follow-ups) of the note.
 */

const at = (message: string, words: string, from = 0): [number, number] => {
  const start = message.indexOf(words, from);
  return [start, start + words.length];
};

test("only the picked record and 'what about it' asks again", () => {
  const zh = "那 @选品方向 这一篇呢？";
  assert.equal(asksAgainAbout(zh, [at(zh, "@选品方向")]), true);
  const ja = "じゃあ @選品方向 は？";
  assert.equal(asksAgainAbout(ja, [at(ja, "@選品方向")]), true);
  const en = "What about @選品方向?";
  assert.equal(asksAgainAbout(en, [at(en, "@選品方向")]), true);
  const two = "@王强 和 @田中浩 呢？";
  assert.equal(asksAgainAbout(two, [at(two, "@王强"), at(two, "@田中浩")]), true);
  const own = "那 @选品方向 这一篇写了什么？";
  assert.equal(asksAgainAbout(own, [at(own, "@选品方向")]), false, "a question of its own is not a repeat");
  assert.equal(asksAgainAbout("那这一篇呢？", []), false, "nothing picked: not this rule");
});

test("「那 @X 呢？」 reads the picked note and answers the previous question about it, not a summary or follow-ups", async () => {
  const world = smallWorld();
  const ACTOR = "actor:a";
  for (const record of world.records) if (record.userId === A) record.userId = ACTOR;
  world.records.push(
    memo(ACTOR, "note:rm13", "秋季的选品方向：玻璃器、北欧风餐具、花器。", "2026-05-10T03:00:00.000Z", [], { title: "选品方向" }),
    memo(ACTOR, "note:rm12", "春季的选品方向：柴烧器物、茶道具、金缮修复过的旧器。想多看相关的展和工作坊。", "2026-11-02T03:00:00.000Z", [], { title: "选品方向" }),
  );
  const records = recordAccessOf(world);
  const message = "那 @选品方向 这一篇呢？";
  const [start, end] = at(message, "@选品方向");
  const model = deepseekStub([
    () => json({ parts: [part({
      clarity: "multiple_readings",
      dataSources: ["orbit_records"],
      deliverable: "summary",
      objectClues: [{ entity: "memo", referenceId: "r1", text: "@选品方向" }],
      readings: [{ capabilities: ["memo.read", "fn.summarize"], deliverable: "summary", label: "要点" }, { capabilities: ["memo.read", "fn.extractFollowUps"], deliverable: "list", label: "其他事项" }],
      requiredCapabilities: ["memo.read", "fn.summarize", "fn.extractFollowUps"],
      sourceQuote: message,
    })], plainChat: false }),
    (call) => {
      assert.match(call.user, /previous question again, about the record they picked now: "@选品方向 这篇里我定的三个方向是什么？"/u);
      assert.match(call.user, /柴烧器物/u);
      assert.doesNotMatch(call.user.slice(call.user.indexOf("Materials:")), /玻璃器/u, "the earlier note is not a material");
      const handle = /(s\d+) — memo/u.exec(call.user)![1];
      return json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: handle }], partId: "p1", text: "这一篇定的是柴烧器物、茶道具、金缮修复过的旧器。" }] });
    },
  ]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ role: "user", text: "@选品方向 这篇里我定的三个方向是什么？" }, { recordRefs: ["memo:note:rm13"], role: "assistant", text: "你定的三个方向是：玻璃器、北欧风餐具、花器。" }], records });
  kit.deps.authorizeReferences = referenceAuthorizer(records);
  const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ end, id: "note:rm12", start, type: "memo" }] }));
  assert.deepEqual(result.partResults.map((item) => [item.partId, item.status]), [["p1", "answered"]], JSON.stringify({ parts: result.partResults, text: result.text, calls: model.calls.map((call) => call.user.slice(-1500)) }));
  assert.deepEqual(result.sourceRefs, ["memo:note:rm12"]);
  assert.match(result.text, /柴烧器物、茶道具、金缮修复过的旧器/u);
  assert.doesNotMatch(result.text, /我按|仅供考虑/u, "no guessed reading, no follow-up extraction");
});
