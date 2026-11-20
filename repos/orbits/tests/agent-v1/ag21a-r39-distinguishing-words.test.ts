/**
 * AG21a R39 (independent suite, final run): for a clue like 「季朗（柏舟那个）」 the person search removed the whole clue from
 * the sentence before looking for a company word, so the words that tell the two 季朗 apart went with it and Orbit asked
 * which one. Only the name is taken out now; the clue's bracketed or trailing words stay for the company test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { findContacts } from "../../features/agent-v1/graph/nodes/resolve";
import { ACTOR, contact, fnWorld, memo, runFn } from "./functions-kit";
import { recordAccessOf } from "./graph-kit";

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:jl1", "季朗", { organization: "白鹭印务", role: "客户经理" }),
    contact(ACTOR, "contact:jl2", "季朗", { organization: "柏舟设计", role: "项目经理" }),
    contact(ACTOR, "contact:xl1", "小林健二", { organization: "小林设计", role: "设计师" }),
    memo(ACTOR, "note:jl2", "季朗说柏舟那边下周交初稿。", "2026-11-12T03:00:00.000Z", ["contact:jl2"], { title: "柏舟进度" }),
  );
  return base;
}

test("the words inside the clue that name the company tell the two people of the name apart", async () => {
  const records = recordAccessOf(world());
  const scope = records.scope(ACTOR);
  for (const [clue, message] of [["季朗（柏舟那个）", "季朗（柏舟那个）最近在忙什么？"], ["季朗(柏舟的)", "季朗(柏舟的)下周交什么？"], ["柏舟的季朗", "柏舟的季朗下周交什么？"]] as const) {
    const { matches } = await findContacts(records, scope, clue, message, message);
    assert.deepEqual(matches.map((match) => match.id), ["contact:jl2"], clue);
  }
  // No distinguishing word: still both (the caller asks which one).
  const both = await findContacts(records, scope, "季朗", "季朗最近在忙什么？", "季朗最近在忙什么？");
  assert.deepEqual(both.matches.map((match) => match.id).sort(), ["contact:jl1", "contact:jl2"]);
});

test("a person's own name is still no company word (小林健二 does not name 小林设计)", async () => {
  const both = world();
  both.records.push(contact(ACTOR, "contact:xl2", "小林健二", { organization: "北辰软件", role: "销售" }));
  const records = recordAccessOf(both);
  const { matches } = await findContacts(records, records.scope(ACTOR), "小林健二", "小林健二最近怎么样？", "小林健二最近怎么样？");
  assert.equal(matches.length, 2, "the name 小林健二 does not pick 小林设计's one");
});

test("in a turn: 「季朗（柏舟那个）最近在忙什么？」 reads the 柏舟 季朗's notes, no question which one", async () => {
  const message = "季朗（柏舟那个）最近在忙什么？";
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: "季朗（柏舟那个）" }], requiredCapabilities: ["contact.read", "memo.read"], sourceQuote: message }], {
    answer: (call) => { materials = call.user; return JSON.stringify({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text: "柏舟那边下周交初稿。" }] }); },
    world: world(),
  });
  assert.doesNotMatch(run.result.text, /哪一位|哪位/u, run.result.text);
  assert.match(materials, /下周交初稿/u);
  assert.ok(!run.events.some((event) => event.type === "resolve.ambiguous_person"));
});
