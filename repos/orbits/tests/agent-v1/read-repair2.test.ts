import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { isPronounClue } from "../../features/agent-v1/route/decide";
import { understandSystemPrompt } from "../../features/agent-v1/understand/prompt";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { contact, memo, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG05 run-02 repair round 2 (coordinator, after judging 77d1865ad):
 * 1. AE-AMB-006: a read-only "how is it going with <person>" keeps §3.11 row 3 — code's sentence on how
 *    it was understood first, and the other readings as entries — now that the reading is really read.
 * 2. AE-AMB-012: "帮我看看给他的修订报价那条待办" — 他 is the person named earlier in the same message; the
 *    to-do is found. A not-found sentence never says the person is missing unless the lookup ran and found no one.
 * 3. AE-SCL-007: the coverage footnote counts the records actually read and given to the answer.
 */

const ACTOR = "actor:a";

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  return base;
}

test("the first layer's prompt keeps rule 8 for 'how is it going with <person>' next to the read rule", () => {
  assert.match(understandSystemPrompt(), /how things are going with a person[^.]*multiple_readings \(rule 8\)/u);
});

test("the first layer's prompt never leaves out order for a part about the first time, also when 'now' is its own part (AE-SCL-007 dev2)", () => {
  assert.match(understandSystemPrompt(), /a part that asks about the first time or the earliest always gives "order": "oldest"/u);
});

test("a read-only part with several readings: code's 'understood as' sentence first, the other readings as entries, then the answer", async () => {
  const base = world();
  base.records.push(contact(ACTOR, "contact:c41", "山本直子", { organization: "山手出版" }), memo(ACTOR, "note:m38", "山本さんと打ち合わせ。原稿は12月5日までに送ると約束した。", "2026-11-09T06:00:00.000Z", ["contact:c41"]));
  const message = "@山本直子 さん、最近どんな感じだったっけ？";
  const model = deepseekStub([
    (call) => json({ parts: [part({ clarity: "multiple_readings", dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "contact", referenceId: /(r\d) contact 山本直子/u.exec(call.user)![1], text: "@山本直子" }], readings: [
      { capabilities: ["view.recentInteraction"], deliverable: "summary", label: "最近のやり取り" },
      { capabilities: ["view.context"], deliverable: "summary", label: "情報とやり取り" },
      { capabilities: ["view.recentInteraction", "todo.read"], deliverable: "summary", label: "やり取りと未完了" },
    ], requiredCapabilities: ["view.recentInteraction", "view.context", "todo.read"], sourceQuote: "@山本直子 さん、最近どんな感じだったっけ？" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [2], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "11月9日に打ち合わせ、原稿は12月5日までに送る約束です。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base), references: [{ id: "contact:c41", name: "山本直子", type: "contact" }] });
  const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "ja", references: [{ id: "contact:c41", type: "contact" }] }));
  assert.match(result.text, /^「山本直子さんとの最近のやり取りと、まだ終わっていないことを見る」という意味で受け取りました。/u);
  assert.match(result.text, /原稿は12月5日/u);
  const entries = result.clarifications.find((set) => set.kind === "entry");
  assert.ok(entries && entries.options.length >= 1 && entries.options.length <= 2, "the other readings are offered as entries");
});

test("他 is the person named earlier in the same message: the to-do is found (AE-AMB-012)", async () => {
  const records = recordAccessOf(world());
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const model = deepseekStub([
    json({ parts: [
      part({ clarity: "statement", deliverable: "change", localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["memo.create"], sourceQuote: "小林今天又来电话催报价了。" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "他" }, { entity: "todo", text: "给他的修订报价那条待办" }], readFilter: { text: "修订报价" }, requiredCapabilities: ["todo.read", "contact.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天。" }),
    ], plainChat: false }),
    (call) => json({ segments: [{ cites: [], partId: "p1", text: "催得很紧。" }, { cites: [{ sentenceIds: [3], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p2", text: "排在 11 月 18 日（周三）。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.sourceRefs, ["todo:task:t42"]);
  assert.match(result.text, /11 月 18 日/u);
  assert.doesNotMatch(result.text, /没有找到你说的这位/u);
});

test("a pronoun nothing resolves, with words to search by: the search runs, no claim that the person is missing", async () => {
  const records = recordAccessOf(world());
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "他" }, { entity: "todo", text: "修订报价那条待办" }], requiredCapabilities: ["todo.read"], sourceQuote: "他的修订报价那条待办排在哪天" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [3], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p1", text: "11 月 18 日。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records, messages: [{ createdAt: "2026-11-15T09:59:00.000Z", role: "user", text: "你好" }, { createdAt: "2026-11-15T09:59:10.000Z", role: "assistant", text: "你好" }] });
  const result = await runAgentGraph(kit.deps, kit.input("他的修订报价那条待办排在哪天？"));
  assert.deepEqual(result.sourceRefs, ["todo:task:t42"]);
  assert.doesNotMatch(result.text, /没有找到你说的这位/u);

  const bare = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "他" }], requiredCapabilities: ["memo.read"], sourceQuote: "他上次说了什么" })], plainChat: false })]);
  const kit2 = graphKit(bare.fetchImplementation, { records: recordAccessOf(world()), messages: [{ createdAt: "2026-11-15T09:59:00.000Z", role: "user", text: "你好" }, { createdAt: "2026-11-15T09:59:10.000Z", role: "assistant", text: "你好" }] });
  const unknown = await runAgentGraph(kit2.deps, kit2.input("他上次说了什么？"));
  assert.doesNotMatch(unknown.text, /没有找到你说的这位/u, "the lookup never ran: it does not say the person is missing");
  assert.match(unknown.text, /不确定/u);
});

test("then and now: the coverage footnote counts the records read and given to the answer (AE-SCL-007)", async () => {
  const base = world();
  for (let index = 0; index < 120; index += 1) base.records.push(memo(ACTOR, `note:t${String(index).padStart(3, "0")}`, `第 ${index} 次见面。`, new Date(Date.UTC(2024, 5, 1 + index * 6)).toISOString(), ["contact:c17"]));
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "contact", text: "小林健" }], readFilter: { order: "both" }, requiredCapabilities: ["memo.read"], sourceQuote: "第一次见面时小林健在哪家公司，现在在哪家" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base) });
  const result = await runAgentGraph(kit.deps, kit.input("第一次见面时小林健在哪家公司，现在在哪家？"));
  const coverage = result.partResults[0].coverage ?? [];
  assert.deepEqual(coverage.map((item) => [item.kind, item.seen, item.total]), [["memo", 20, 122]]);
  assert.match(result.text, /共122条，这次看了其中20条/u);
});

test("a pronoun clue with the little word around it (给他的, 彼に, 跟她) is still a pronoun; a name is not (AE-AMB-012 dev3)", async () => {
  for (const text of ["给他的", "彼に", "跟她", "对他"]) assert.equal(isPronounClue(text), true, text);
  for (const text of ["给小林的", "小林", "山本さんに"]) assert.equal(isPronounClue(text), false, text);

  const records = recordAccessOf(world());
  const message = "小林今天又来电话催报价了。帮我看看给他的修订报价那条待办排在哪天。";
  const model = deepseekStub([
    json({ parts: [
      part({ clarity: "statement", dataSources: ["turn_material"], localId: "p1", objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: [], sourceQuote: "小林今天又来电话催报价了。" }),
      part({ dataSources: ["orbit_records"], localId: "p2", objectClues: [{ entity: "contact", text: "给他的" }, { entity: "todo", text: "修订报价那条待办" }], readFilter: { text: "修订报价" }, requiredCapabilities: ["todo.read"], sourceQuote: "帮我看看给他的修订报价那条待办排在哪天。" }),
    ], plainChat: false }),
    (call) => json({ segments: [{ cites: [], partId: "p1", text: "催得很紧。" }, { cites: [{ sentenceIds: [3], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p2", text: "排在 11 月 18 日（周三）。" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input(message));
  assert.deepEqual(result.sourceRefs, ["todo:task:t42"]);
  assert.doesNotMatch(result.text, /没有找到你说的这位/u);
});
