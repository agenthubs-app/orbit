/**
 * AG21a R38 (independent suite, final run): a question about a company (「我给白鹭印务报的价是多少」) found the people at that
 * company and stopped with "which person" without reading anything; the notes about the company were never read. In a read,
 * a clue found only as a company now reads that company's people together and searches the notes for the company's words.
 * (A write still asks which person: propose's own lookup is unchanged.)
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTOR, contact, fnWorld, json, memo, runFn } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

function world() {
  const base = fnWorld();
  base.records.push(
    contact(ACTOR, "contact:sn", "石楠", { organization: "白鹭印务", role: "客户经理" }),
    contact(ACTOR, "contact:jl", "季朗", { organization: "白鹭印务", role: "采购" }),
    memo(ACTOR, "note:quote", "给白鹭印务报价：样书印刷每本 38 元，五百本起印。", "2026-11-08T02:00:00.000Z", [], { title: "白鹭报价" }),
    memo(ACTOR, "note:sn", "石楠说预算要到月底才定。", "2026-11-12T02:00:00.000Z", ["contact:sn"], { title: "石楠电话" }),
    memo("user:b", "note:b-quote", "乙给白鹭印务报价每本 30 元。", "2026-11-09T02:00:00.000Z", []),
  );
  return base;
}

const answerWith = (text: string, seen: { materials: string }) => (call: ModelCall) => { seen.materials = call.user; return json({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text }] }); };

for (const [language, message, clue, text] of [
  ["zh", "我给白鹭印务报的价是多少？", "白鹭印务", "报价"],
  ["zh", "白鹭那边的报价我是怎么给的？", "白鹭那边", "报价"],
  ["ja", "白鹭印务への見積もりはいくらだった？", "白鹭印务", undefined],
] as const) {
  test(`${language} 「${message}」: the company's people and the notes naming it are read; no question which person`, async () => {
    const seen = { materials: "" };
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: clue }], ...(text ? { readFilter: { text } } : {}), requiredCapabilities: ["contact.read", "memo.read"], sourceQuote: message }], { answer: answerWith(language === "ja" ? "1冊38元でした。" : "每本 38 元，五百本起印。", seen), language, world: world() });
    assert.ok(!run.events.some((event) => event.type === "resolve.ambiguous_person"), run.result.text);
    assert.doesNotMatch(run.result.text, /哪一位|哪位|どちらの/u, run.result.text);
    assert.match(seen.materials, /每本 38 元/u, "the note about the company, linked to nobody, is read");
    assert.match(seen.materials, /石楠/u);
    assert.match(seen.materials, /季朗/u);
    assert.doesNotMatch(seen.materials, /乙给白鹭/u, "never another account's");
    assert.ok(run.events.some((event) => event.type === "resolve.company_people_read"));
  });
}

test("a name of two people (not a company) is still asked about", async () => {
  const base = world();
  base.records.push(contact(ACTOR, "contact:sn2", "石楠", { organization: "柏舟设计", role: "设计师" }));
  const message = "石楠最近说了什么？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: "石楠" }], requiredCapabilities: ["contact.read", "memo.read"], sourceQuote: message }], { world: base });
  assert.ok(run.events.some((event) => event.type === "resolve.ambiguous_person"));
});
