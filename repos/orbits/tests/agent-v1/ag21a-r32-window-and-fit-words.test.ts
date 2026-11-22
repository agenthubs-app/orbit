/**
 * AG21a R32 and the coordinator's decision 1 (independent suite, final run):
 * (a) words the first layer already turned into the read window (「这两周」「这几天」) stayed in the sentence topic when they
 *     were not on a word list: the judgment ranked by 「这两周」, the lead said so, the list was cut to three;
 * (b) a vague fit word as the first layer's basis (「适合我」) became the topic, counted as the user's own standard (saved
 *     entries never applied) and cut the list to three;
 * (c) 「这次晚上的也算上」 (lifting a saved rule this once) became a preference for evenings and a topic.
 * Decision 1: 可以去 / 值得去 / 适合我 / worth going / 行ける / おすすめ ask for a recommendation — saved preferences apply when
 * the user gave no standard of their own — decided from the words, however the first layer tagged them.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { asksForRecommendation, liftedIn, realTopicOf } from "../../features/agent-v1/functions/basis";
import { withoutWindowWords } from "../../features/agent-v1/understand/read-window";
import { runFn, type TestMemory } from "./functions-kit";

const MM1: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", id: "MM1", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } };
const MM2: TestMemory = { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", id: "MM2" };

const of = (events: Record<string, unknown>[], type: string) => events.filter((event) => event.type === type);
const listed = (events: Record<string, unknown>[]) => (of(events, "fn.rank").at(-1)?.listed ?? []) as string[];
const recalled = (events: Record<string, unknown>[]) => [...new Set(of(events, "memory.recall").filter((event) => event.scope !== "every_task").flatMap((event) => (event.memories ?? []) as string[]))].sort();
const TWO_WEEKS = { from: "2026-11-15", to: "2026-11-28" };

test("the words: a window stretch and vague fit words are no topic; a lift names what it lifts", () => {
  assert.equal(withoutWindowWords("这两周有什么展"), "有什么展");
  assert.equal(withoutWindowWords("这几天的摄影活动"), "的摄影活动");
  assert.equal(realTopicOf(withoutWindowWords("这两周")), "");
  for (const words of ["适合我", "可以去的", "私に合う", "行けそう", "おすすめ", "for me", "worth going"]) assert.equal(realTopicOf(words), "", words);
  assert.equal(realTopicOf("适合我的摄影活动"), "摄影");
  for (const words of ["最近有哪些活动适合我？", "这周末有什么可以去的？", "Any events worth going to?", "今週末行けるイベントある？", "おすすめのイベントは？"]) assert.ok(asksForRecommendation(words), words);
  for (const words of ["接下来有哪些活动？", "把接下来的活动都列出来", "What events are coming up?"]) assert.ok(!asksForRecommendation(words), words);
  assert.deepEqual(liftedIn("推荐几场这周末的活动，这次晚上的也算上。"), { clause: "这次晚上的也算上", words: "晚上的" });
  assert.equal(liftedIn("推荐几场这周末的活动"), null);
});

for (const [language, message] of [
  ["zh", "这两周有哪些活动可以去？"],
  ["zh", "这几天有什么活动可以看？"],
  ["en", "Any events worth going to in the next two weeks?"],
] as const) {
  test(`${language} 「${message}」 with nothing saved: no ranking by the window words, the whole list of what is coming up`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: message.match(/这两周|这几天|next two weeks/u)![0] }, readFilter: TWO_WEEKS, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { language, memories: [] });
    assert.equal(run.judgeCalls.length, 0, "nothing is judged against 「这两周」");
    assert.doesNotMatch(run.result.text, /按「这两周」|按「这几天」|这个主题|"next two weeks"/u, run.result.text);
    assert.ok(listed(run.events).length >= 5, `not cut to three: ${listed(run.events).join(", ")}`);
  });
}

test("「这两周有哪些活动可以去？」 with saved preferences: a recommendation, ranked by them (the evening event is left out)", async () => {
  const message = "这两周有哪些活动可以去？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: TWO_WEEKS, requiredCapabilities: ["event.read"], sourceQuote: message }], { memories: [MM1, MM2] });
  assert.deepEqual(recalled(run.events), ["MM1", "MM2"]);
  assert.ok(!listed(run.events).includes("event:event:e104"), "the saved 「不要晚上的」 removes 设计师之夜 (19:00)");
  assert.equal(of(run.events, "functions.memory_not_a_basis").length, 0);
});

for (const [language, message, basis] of [
  ["zh", "最近有哪些活动适合我？", "适合我"],
  ["ja", "最近、私に合うイベントある？", "私に合う"],
  ["en", "Which upcoming events are a good fit for me?", "for me"],
] as const) {
  test(`${language} 「${message}」 with the basis 「${basis}」: never the topic; saved preferences apply (decision 1)`, async () => {
    const understood = [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }];
    const run = await runFn(message, understood, { language, memories: [MM1, MM2] });
    assert.deepEqual(recalled(run.events), ["MM1", "MM2"], "the vague fit word is no standard of the user's own");
    assert.ok(!run.judgeCalls.some((call) => JSON.stringify(call).includes(basis)), "nothing is judged against the fit word");
    // With nothing saved: the plain list of what is coming up, not three picked by 「适合我」.
    const bare = await runFn(message, understood, { language, memories: [] });
    assert.equal(bare.judgeCalls.length, 0);
    assert.ok(listed(bare.events).length >= 5, listed(bare.events).join(", "));
  });
}

test("「推荐几场这周末的活动，这次晚上的也算上。」: only the saved evening rule is lifted, this once; no evening preference, no topic", async () => {
  const message = "推荐几场这周末的活动，这次晚上的也算上。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", readFilter: { from: "2026-11-21", to: "2026-11-22" }, rank: {}, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { memories: [MM1, MM2] });
  assert.ok(listed(run.events).includes("event:event:e104"), `the evening event is back this time: ${listed(run.events).join(", ")}`);
  assert.equal(run.judgeCalls.length, 0, "「这次 也算上」 is no topic to judge by");
  assert.ok(run.events.some((event) => event.type === "functions.saved_rule_lifted_this_turn"));
  const chips = (run.result.memoryUse ?? []) as { memoryId: string; kind?: string }[];
  assert.ok(chips.some((chip) => chip.memoryId === "MM2"), "the lifted rule is named as set aside this once");
  const hard = of(run.events, "functions.hard_conditions").at(-1)?.time as { part: string | null }[] | undefined;
  assert.ok(!(hard ?? []).some((item) => item.part === "evening"), "no preference for evenings is added");
});
