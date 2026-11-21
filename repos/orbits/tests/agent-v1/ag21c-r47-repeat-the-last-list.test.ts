/**
 * AG21c R47: "再给我看一次" or "这回把晚上的也加上" right after a list was understood as a new, almost empty part — the period,
 * the kind and the recommendation of the previous turn were gone: the first was refused, the second lifted the saved rule
 * and then asked "by what should I pick". Code keeps the last list request (kind, window, count, its words) and a part
 * that only repeats or adjusts it re-runs it with the adjustment, read fresh (current records and memory). With nothing
 * stored it says so and asks what to list. Invented events and sentences (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { repeatOrAdjust } from "../../features/agent-v1/understand/repeat-list";
import { platformEvent } from "./read-kit";
import { NOW, runFn, type TestMemory } from "./functions-kit";
import { graphKit, recordAccessOf } from "./graph-kit";

const NO_EVENING: TestMemory = { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", id: "MR1" };
const WEEKEND = { from: "2026-11-21", to: "2026-11-22" };
const listed = (events: Record<string, unknown>[]) => ((events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[]);
const EVENING = "event:event:r-night";

function world() {
  return {
    events: [
      platformEvent("event:r-wood", "梨花木工体验", "2026-11-21T02:00:00.000Z", "清澄白河", { description: "主题：木工" }),
      platformEvent("event:r-night", "夜の陶芸教室", "2026-11-21T11:00:00.000Z", "蔵前", { description: "主题：陶芸" }),
      platformEvent("event:r-walk", "Riverside Sketch Walk", "2026-11-22T01:00:00.000Z", "Asakusa", { description: "主题：sketching" }),
      platformEvent("event:r-book", "古书交换会", "2026-11-22T05:00:00.000Z", "神保町", { description: "主题：旧书" }),
    ],
    records: [],
  };
}

const sessionOf = (base: ReturnType<typeof world>) => graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: NOW, records: recordAccessOf(base as never) });
const emptyPart = (message: string) => [{ dataSources: [], deliverable: "answer", requiredCapabilities: [], sourceQuote: message }];

test("the words: only a repeat or an adjustment of the list, nothing of its own", () => {
  for (const words of ["再给我看一次", "再列一遍", "もう一度見せて", "Show me that again", "again please"]) assert.equal(repeatOrAdjust(words), "repeat", words);
  for (const words of ["这回把晚上的也加上", "这次周日的也算上", "今回は夜のも含めて", "This time include the evening ones too"]) assert.equal(repeatOrAdjust(words), "adjust", words);
  for (const words of ["再看一次柏木的笔记", "Show me Ada's notes again", "推荐几场这周末的活动", "谢谢", "再说吧", "再发一次给她"]) assert.equal(repeatOrAdjust(words), null, words);
});

for (const [language, first, again, adjust] of [
  ["zh", "推荐几场这周末的活动", "再给我看一次", "这回把晚上的也加上"],
  ["ja", "今週末のおすすめイベントを教えて", "もう一度見せて", "今回は夜のイベントも含めて"],
  ["en", "Recommend some events this weekend", "Show me that again", "This time include the evening ones too"],
] as const) {
  test(`${language}: 「${again}」 re-runs the list, 「${adjust}」 lifts the rule without asking what to pick by`, async () => {
    const base = world();
    const session = sessionOf(base);
    const one = await runFn(first, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: {}, readFilter: WEEKEND, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: first }], { language, memories: [NO_EVENING], session, world: base as never });
    const shown = listed(one.events);
    assert.ok(shown.length >= 2 && !shown.includes(EVENING), shown.join(", "));
    const two = await runFn(again, emptyPart(again), { language, memories: [NO_EVENING], session, world: base as never });
    assert.ok(two.events.some((event) => event.type === "route.repeats_last_list" && event.stored === true));
    assert.deepEqual(listed(two.events), shown, two.result.text);
    assert.ok(!two.events.some((event) => event.type === "clarify.asked"), two.result.text);
    const three = await runFn(adjust, emptyPart(adjust), { language, memories: [NO_EVENING], session, world: base as never });
    assert.ok(!three.events.some((event) => event.type === "clarify.asked"), `no "by what should I pick": ${three.result.text}`);
    assert.ok(listed(three.events).includes(EVENING), `the evening event is in this time: ${listed(three.events).join(", ")}`);
  });
}

test("read fresh: an entry forgotten since the first list is not used by the repeat", async () => {
  const base = world();
  const session = sessionOf(base);
  const first = "推荐几场这周末的活动";
  await runFn(first, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: {}, readFilter: WEEKEND, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: first }], { memories: [NO_EVENING], session, world: base as never });
  const again = await runFn("再给我看一次", emptyPart("再给我看一次"), { memories: [], session, world: base as never });
  assert.ok(listed(again.events).includes(EVENING), listed(again.events).join(", "));
});

for (const [language, words, said] of [["zh", "再给我看一次", /还没有可以再列一次的列表/u], ["en", "Show me that again", /don't have an earlier list/u]] as const) {
  test(`${language}: nothing stored — said so, and what to list is asked`, async () => {
    const base = world();
    const run = await runFn(words, emptyPart(words), { language, memories: [], session: sessionOf(base), world: base as never });
    assert.match(run.result.text, said, run.result.text);
  });
}
