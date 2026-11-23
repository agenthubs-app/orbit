/**
 * AG21a R44 (independent suite, final run): the read's text filter was the first layer's phrase searched as one piece, so a
 * note holding the same words apart ("Corvid Analytics 的年度订阅" for "Corvid 的订阅") was not found and the answer said the
 * records hold nothing. The phrase's distinctive words are now required all together, in any order and distance; only when
 * no record holds them all is the rarest word used alone. "Only my notes" and the other narrowings stay.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { searchTokensOf } from "../../features/agent-v1/graph/nodes/resolve";
import { ACTOR, fnWorld, json, memo, runFn } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

function world() {
  const base = fnWorld();
  base.records.push(
    memo(ACTOR, "note:corvid", "和 Corvid Analytics 谈了年度订阅，报价每年 48 万日元，下月续约。", "2026-11-11T02:00:00.000Z", [], { title: "Corvid 续约" }),
    memo(ACTOR, "note:corvid-team", "Corvid 那边换了对接人，新的是 Mina。", "2026-11-12T02:00:00.000Z", [], { title: "Corvid 对接人" }),
    memo(ACTOR, "note:other-sub", "杂志订阅到期了，要不要续。", "2026-11-13T02:00:00.000Z", [], { title: "杂志" }),
    memo("user:b", "note:b-corvid", "乙的笔记：Corvid 的订阅打八折。", "2026-11-13T02:00:00.000Z", []),
  );
  return base;
}

let materials = "";
const citeAll = (text: string) => (call: ModelCall) => { materials = call.user; return json({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text }] }); };

test("the distinctive words of a phrase, each on its own", () => {
  assert.deepEqual(searchTokensOf("Corvid 的订阅"), ["corvid", "订阅"]);
  assert.deepEqual(searchTokensOf("Corvid订阅"), ["corvid", "订阅"]);
  assert.deepEqual(searchTokensOf("白鹭印务 报价单"), ["白鹭印务", "报价单"]);
  assert.deepEqual(searchTokensOf("Corvidのサブスク"), ["corvid", "サブスク"]);
  assert.deepEqual(searchTokensOf("Corvid subscription"), ["corvid subscription"].flatMap((item) => item.split(" ")));
  assert.deepEqual(searchTokensOf("年度订阅"), ["年度订阅"], "one piece: searched whole only");
});

for (const [language, message, phrase] of [
  ["zh", "我笔记里 Corvid 的订阅是怎么谈的？", "Corvid 的订阅"],
  ["ja", "メモにある Corvid の年度订阅はどうなった？", "Corvid の年度订阅"],
] as const) {
  test(`${language}: 「${phrase}」 finds the note that holds the words apart; the note holding only one word is not given`, async () => {
    materials = "";
    const at = message.indexOf(phrase);
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", readFilter: { text: phrase }, requiredCapabilities: ["memo.read"], sourceQuote: message }], { answer: citeAll(language === "ja" ? "年48万円で来月更新。" : "年度订阅每年 48 万日元，下月续约。"), language, world: world() });
    assert.ok(at >= 0);
    assert.doesNotMatch(run.result.text, /没有找到|找不到|nothing about this|見つかりません/u, run.result.text);
    assert.match(materials, /48 万日元/u);
    assert.doesNotMatch(materials, /换了对接人|杂志订阅|乙的笔记/u, "only the note holding every word; never another account's");
    assert.ok(run.events.some((event) => event.type === "resolve.text_all_words"));
  });
}

test("no note holds all the words: the rarest word alone, said as such", async () => {
  materials = "";
  const message = "Corvid 的退款怎么说？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", readFilter: { text: "Corvid 的退款" }, requiredCapabilities: ["memo.read"], sourceQuote: message }], { answer: citeAll("没有提到退款，只有续约和对接人的记录。"), world: world() });
  assert.match(materials, /Corvid/u);
  assert.match(materials, /holds all of "corvid", "退款"/u);
  assert.ok(run.events.some((event) => event.type === "resolve.text_rarest_word" && event.word === "corvid"));
});
