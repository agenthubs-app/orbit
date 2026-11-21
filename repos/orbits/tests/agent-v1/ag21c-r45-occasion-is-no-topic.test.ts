/**
 * AG21c R45: an occasion or deadline clause plus the request's own verb ("展会前想见", "before the trade fair I want to meet")
 * became the ranking topic: the request counted as the user's own standard, saved entries for picking people were never
 * read, the judgment ranked by the clause and the lead said 「按「展会前想见」这个主题挑了」. A time anchor is a deadline and the
 * request's verb is the pick itself: neither is a topic. What is left decides; nothing left — the saved entries apply.
 * Invented sentences and names (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { realTopicOf, withoutOccasionWords } from "../../features/agent-v1/functions/basis";
import { graded } from "./judgment-kit";
import { ACTOR, contact, runFn, type TestMemory } from "./functions-kit";

const PICK_RULE: TestMemory = { appliesTo: ["contact.recommend"], category: "preference", content: "挑联系人时优先最近有往来的", id: "MQ1" };
const recalled = (events: Record<string, unknown>[]) => [...new Set(events.filter((event) => event.type === "memory.recall" && event.scope !== "every_task").flatMap((event) => (event.memories ?? []) as string[]))];

function world() {
  return {
    events: [],
    records: [
      contact(ACTOR, "contact:q1", "柏木遥", { organization: "青砂陶房", role: "陶艺师" }),
      contact(ACTOR, "contact:q2", "范", { organization: "鹿鸣包装", role: "设计主管" }),
      contact(ACTOR, "contact:q3", "Owen Pratt", { organization: "Pratt Kilnworks", role: "Founder" }),
      contact(ACTOR, "contact:q4", "宮下凛", { organization: "灯台印刷", role: "営業" }),
    ],
  };
}

test("the words: time anchors and the request's own verb are no topic; the occasion's subject stays", () => {
  for (const words of ["展会前想见", "月底之前想联系", "下个月展会之前想认识", "出差前要见", "展示会の前に会っておきたい", "月末までに会いたい", "before the trade fair I want to meet", "by the end of the month", "ahead of the expo, to meet"]) assert.equal(realTopicOf(words), "", words);
  assert.equal(realTopicOf("陶艺展前想见"), "陶艺");
  assert.equal(realTopicOf("before the ceramics fair"), "ceramics");
  assert.match(realTopicOf("for the ceramics fair"), /ceramics/u);
  assert.equal(realTopicOf("做包装设计的"), "做包装设计");
  // Words that only contain an anchor character are left alone.
  assert.equal(withoutOccasionWords("发展前景"), "发展前景");
});

for (const [language, message, basis] of [
  ["zh", "展会前想见几位朋友，帮我挑两位最值得见的。", "展会前想见"],
  ["zh", "月底之前想联系几个人，帮我挑两位。", "月底之前想联系"],
  ["ja", "展示会の前に会っておきたい人を2人選んで。", "展示会の前に会っておきたい"],
  ["en", "Before the trade fair I want to meet a few people. Pick the two most worth meeting.", "Before the trade fair I want to meet"],
] as const) {
  test(`${language} 「${message}」 with the basis 「${basis}」: no topic, the saved entry for picking people applies`, async () => {
    const understood = [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis, count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }];
    const run = await runFn(message, understood, { judge: () => graded(0.1, 0.2, 0.7), language, memories: [PICK_RULE], world: world() as never });
    assert.deepEqual(recalled(run.events), ["MQ1"], "a pick with no standard of its own uses the saved entries");
    assert.ok(!run.judgeCalls.some((call) => JSON.stringify(call).includes(basis)), "nothing is judged against the clause");
    assert.doesNotMatch(run.result.text, new RegExp(`「${basis}」|"${basis}"|这个主题`, "u"), run.result.text);
  });
}

test("an occasion with a real subject keeps the subject as the topic", async () => {
  const message = "陶艺展前想见几位朋友，帮我挑两位。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "陶艺展前想见", count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.1, 0.2, 0.7), memories: [PICK_RULE], world: world() as never });
  assert.ok(run.judgeCalls.some((call) => JSON.stringify(call).includes("陶艺")), "陶艺 is judged");
  assert.ok(!run.judgeCalls.some((call) => JSON.stringify(call).includes("展前想见")));
});
