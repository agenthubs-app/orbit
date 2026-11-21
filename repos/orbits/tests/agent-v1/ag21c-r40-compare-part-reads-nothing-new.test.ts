/**
 * AG21c R40: 「把 @X 的报价待办和 @X 的样书笔记对一下」 with two people of the same name came as three parts; the third
 * (「对一下」) inherited the subject of the first part only, read that person's newest note (a record nobody asked for) and
 * the answer described the two people as one. A part that only compares or combines earlier parts reads nothing new: it
 * answers from those parts' records, with every person they read, each named with their company. Invented names (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { combinesEarlierParts } from "../../features/agent-v1/graph/nodes/resolve";
import { ACTOR, contact, json, memo, runFn, todo } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

function world() {
  return {
    events: [],
    records: [
      contact(ACTOR, "contact:y1", "岑", { organization: "雁回纸业", role: "客户经理" }),
      contact(ACTOR, "contact:y2", "岑", { organization: "松间设计", role: "美术指导" }),
      todo(ACTOR, "task:y1", "给岑发纸样报价", { plannedDate: "2026-11-18", relatedContactId: "contact:y1", source: "manual" }),
      memo(ACTOR, "note:y2", "岑说样书封面改成米白。", "2026-11-11T02:00:00.000Z", ["contact:y2"], { title: "样书封面" }),
      // The first 岑's newest note: nobody asked for it.
      memo(ACTOR, "note:y1-new", "岑提到自己下月换到另一家纸厂。", "2026-11-14T02:00:00.000Z", ["contact:y1"], { title: "岑近况" }),
    ],
  };
}

const REFERENCES = [{ id: "contact:y1", name: "岑", type: "contact" }, { id: "contact:y2", name: "岑", type: "contact" }];

test("the words: only comparing or combining", () => {
  for (const words of ["对一下", "，然后对照一下。", "比较一下", "照らし合わせて", "and compare them", "Compare the two side by side."]) assert.ok(combinesEarlierParts(words), words);
  for (const words of ["对一下她的报价", "Compare her notes with last month's", "比较一下两个展会的票价"]) assert.ok(!combinesEarlierParts(words), words);
});

for (const [language, message, first, second, third] of [
  ["zh", "把 @岑 的报价待办和 @岑 的样书笔记对一下", "@岑 的报价待办", "@岑 的样书笔记", "对一下"],
  ["en", "Take @岑's quote to-do and @岑's sample-book note, and compare them", "@岑's quote to-do", "@岑's sample-book note", "and compare them"],
] as const) {
  test(`${language}: the comparing part answers from the two halves' records, both people named apart`, async () => {
    const materials = new Map<string, string>();
    const at = (words: string) => message.indexOf(words);
    const run = await runFn(message, [
      { dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", referenceId: "r1", text: "@岑" }, { entity: "todo", text: language === "en" ? "quote to-do" : "报价待办" }], requiredCapabilities: ["todo.read"], sourceQuote: first },
      { dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", referenceId: "r2", text: "@岑" }, { entity: "memo", text: language === "en" ? "sample-book note" : "样书笔记" }], requiredCapabilities: ["memo.read"], sourceQuote: second },
      { dataSources: ["orbit_records"], deliverable: "comparison", dependsOn: ["p1", "p2"], objectClues: [], requiredCapabilities: ["memo.read"], sourceQuote: third },
    ], {
      answer: (call: ModelCall) => {
        const blocks = call.user.split(/(?=\n?Part p\d)/u);
        for (const block of blocks) { const id = /Part (p\d)/u.exec(block)?.[1]; if (id) materials.set(id, block); }
        materials.set("all", call.user);
        const handles = [...call.user.matchAll(/(s\d+) — /gu)].map((match) => match[1]);
        return json({ segments: ["p1", "p2", "p3"].map((partId) => ({ cites: handles.slice(0, 1).map((sourceRef) => ({ sentenceIds: [1], sourceRef })), partId, text: "x" })) });
      },
      language,
      references: REFERENCES,
      world: world() as never,
    });
    assert.ok(run.events.some((event) => event.type === "resolve.combines_earlier_parts"), "the third part combines the first two");
    assert.ok(!run.events.some((event) => event.type === "resolve.subject_inherited" && event.partId === "p3"), "no single subject inherited");
    const all = materials.get("all") ?? "";
    assert.doesNotMatch(all, /下月换到另一家纸厂/u, "the first person's newest note, asked by nobody, is not read in");
    assert.match(all, /岑（雁回纸业）/u);
    assert.match(all, /岑（松间设计）/u);
  });
}
