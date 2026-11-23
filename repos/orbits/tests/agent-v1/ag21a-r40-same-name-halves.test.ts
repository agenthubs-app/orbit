/**
 * AG21a R40 (independent suite, final run): 「把 @季朗 的待办和 @季朗 的笔记对一下」 with each @ bound to a different contact read
 * both people's to-dos and both people's notes, and the answer treated them as one person. Each object clue now belongs to
 * the reference that governs its half of the sentence and is read for that person only; the materials of same-name people
 * carry their company, so the answer can tell them apart.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { governedSubjects } from "../../features/agent-v1/graph/nodes/resolve";
import { ACTOR, contact, fnWorld, json, memo, runFn, todo } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:jl1", "季朗", { organization: "白鹭印务", role: "客户经理" }),
    contact(ACTOR, "contact:jl2", "季朗", { organization: "柏舟设计", role: "项目经理" }),
    todo(ACTOR, "task:jl1", "把纸张报价发给季朗", { plannedDate: "2026-11-18", relatedContactId: "contact:jl1", source: "manual" }),
    todo(ACTOR, "task:jl2", "验收柏舟的初稿", { plannedDate: "2026-11-19", relatedContactId: "contact:jl2", source: "manual" }),
    memo(ACTOR, "note:jl1", "季朗说纸张下月涨价一成。", "2026-11-10T02:00:00.000Z", ["contact:jl1"], { title: "白鹭纸价" }),
    memo(ACTOR, "note:jl2", "季朗说初稿推迟到下周三。", "2026-11-11T02:00:00.000Z", ["contact:jl2"], { title: "柏舟初稿" }),
  );
  return base;
}

const REFERENCES = [{ id: "contact:jl1", name: "季朗", type: "contact" }, { id: "contact:jl2", name: "季朗", type: "contact" }];

test("each record clue goes with the person named last before it", () => {
  const refs = [
    { entity: "contact", quote: [1, 4], recordId: "contact:jl1" },
    { entity: "todo", quote: [6, 8], recordId: null },
    { entity: "contact", quote: [9, 12], recordId: "contact:jl2" },
    { entity: "memo", quote: [14, 16], recordId: null },
  ] as never;
  const contacts = [{ id: "contact:jl1" }, { id: "contact:jl2" }];
  assert.deepEqual([...governedSubjects({ refs }, contacts)], [["todo", ["contact:jl1"]], ["memo", ["contact:jl2"]]]);
  // A clue before any person cannot be placed: nothing is restricted.
  assert.equal(governedSubjects({ refs: [{ entity: "memo", quote: [0, 1], recordId: null }, ...(refs as unknown as unknown[])] as never }, contacts).size, 0);
  // One person: nothing to place.
  assert.equal(governedSubjects({ refs }, [{ id: "contact:jl1" }]).size, 0);
});

for (const [language, message, todoWord, noteWord] of [
  ["zh", "把 @季朗 的待办和 @季朗 的笔记对一下", "待办", "笔记"],
  ["en", "Compare @季朗's to-dos with @季朗's notes", "to-dos", "notes"],
] as const) {
  test(`${language}: the to-dos are the first 季朗's, the notes the second's; the materials tell them apart by company`, async () => {
    let materials = "";
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "comparison", objectClues: [{ entity: "contact", referenceId: "r1", text: "@季朗" }, { entity: "todo", text: todoWord }, { entity: "contact", referenceId: "r2", text: "@季朗" }, { entity: "memo", text: noteWord }], requiredCapabilities: ["todo.read", "memo.read"], sourceQuote: message }], {
      answer: (call: ModelCall) => { materials = call.user; return json({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text: language === "en" ? "Two different people." : "这是两位不同的季朗。" }] }); },
      language,
      references: REFERENCES,
      world: world(),
    });
    assert.match(materials, /把纸张报价发给季朗/u, "the first 季朗's to-do");
    assert.match(materials, /初稿推迟到下周三/u, "the second 季朗's note");
    assert.doesNotMatch(materials, /验收柏舟的初稿/u, "not the second 季朗's to-do");
    assert.doesNotMatch(materials, /纸张下月涨价/u, "not the first 季朗's note");
    assert.match(materials, /季朗（白鹭印务）/u);
    assert.match(materials, /季朗（柏舟设计）/u);
    assert.ok(run.events.some((event) => event.type === "resolve.clues_governed"));
  });
}
