/**
 * AG21c R48: the reason on each picked card was the judgment's level ("部分相关", "the record fits directly",
 * 「记录里看不出和这个主题直接相关」), and when every candidate was "insufficient" the top three were still presented as picks
 * labelled "nothing relates" — even when the card itself showed the industry that fits. The reason names the field of the
 * record that matched, taken by code; a level word is never a reason. When nothing fits at all the lead says so and the
 * list is the natural order. Invented names and sentences (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { fieldReasonOf, sharesTopicWords } from "../../features/agent-v1/graph/nodes/functions";
import { graded } from "./judgment-kit";
import { ACTOR, contact, runFn } from "./functions-kit";

const LEVEL = /部分相关|记录直接对得上|看不出和这个主题|partly related|fits directly|nothing in the record ties|一部関連|直接合って|直接の関係は読み取れません/u;
const listed = (events: Record<string, unknown>[]) => ((events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[]);
const whys = (result: { blocks?: unknown }) => JSON.stringify(result.blocks ?? []).match(/"why":"[^"]*"/gu) ?? [];

function world() {
  return {
    events: [],
    records: [
      contact(ACTOR, "contact:r1", "钟", { customTags: ["行业:出版"], organization: "萤火童书", role: "编辑" }),
      contact(ACTOR, "contact:r2", "Ilse Varga", { customTags: ["行业:出版"], organization: "Varga Press", role: "Editor" }),
      contact(ACTOR, "contact:r3", "相馬透", { customTags: ["行业:物流"], organization: "北星運輸", role: "所長" }),
      contact(ACTOR, "contact:r4", "Tomas Reyes", { organization: "Reyes Kilnworks", role: "Kiln designer" }),
    ],
  };
}

test("the words: a field shares the topic's words in any script", () => {
  assert.ok(sharesTopicWords("绘本出版", "出版"));
  assert.ok(sharesTopicWords("絵本の出版", "出版"));
  assert.ok(sharesTopicWords("picture-book publishing", "publishing"));
  assert.ok(sharesTopicWords("kilns", "Kiln designer"));
  assert.ok(!sharesTopicWords("绘本出版", "物流"));
  assert.equal(fieldReasonOf({ company: "萤火童书", industry: "出版", kind: "contact", role: "编辑", tags: [] }, "绘本出版", "zh"), "行业：出版");
  assert.equal(fieldReasonOf({ company: "Varga Press", industry: "出版", kind: "contact", role: "Editor", tags: [] }, "picture-book publishing", "en"), "industry: publishing");
  assert.equal(fieldReasonOf({ company: "北星運輸", industry: "物流", kind: "contact", role: "所長", tags: [] }, "絵本の出版", "ja"), null);
  assert.equal(fieldReasonOf({ kind: "event", title: "冬の陶芸市", topics: "陶芸、器" }, "陶芸", "ja"), "テーマ：陶芸");
});

for (const [language, message, basis] of [
  ["zh", "挑三位最适合聊绘本出版的。", "绘本出版"],
  ["ja", "絵本の出版について話すのに一番合う人を3人選んで。", "絵本の出版"],
  ["en", "Pick the three people best to talk with about picture-book publishing.", "picture-book publishing"],
] as const) {
  test(`${language}: every level "insufficient" — the reason still names the industry that fits; no level words`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis, count: 3 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.9, 0.05, 0.05), language, memories: [], world: world() as never });
    assert.doesNotMatch(run.result.text, LEVEL, run.result.text);
    assert.doesNotMatch(JSON.stringify(run.result.blocks ?? []), LEVEL);
    const reasons = whys(run.result);
    assert.ok(reasons.some((why) => /出版|publishing/u.test(why)), `a reason names the industry: ${reasons.join(" | ")}`);
  });
}

test("nothing fits at all: the lead says no record relates, the list is the natural order", async () => {
  const message = "挑两位最适合聊航天遥感的。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "航天遥感", count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judge: () => graded(0.9, 0.05, 0.05), memories: [], world: world() as never });
  assert.match(run.result.text, /记录里没有和「航天遥感」相关的/u, run.result.text);
  assert.doesNotMatch(run.result.text, /按「航天遥感」这个主题挑了/u);
  assert.doesNotMatch(run.result.text, LEVEL);
  assert.ok(run.events.some((event) => event.type === "functions.topic_none_fits"));
  assert.equal(listed(run.events).length, 2);
});
