/**
 * AG21c R33 (W): a saved "do not" rule written with a verb negation ("20時以降のイベントは入れない", "不推荐周日的", "never …")
 * was read as "only that time" — the answer listed exactly what the user had ruled out. One negation reader now serves this
 * turn's words and saved entries (functions/negation.ts); a double negation asks for that time only; words whose direction
 * cannot be read are never a hard condition and are named as unclear. Sentences and names are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { meetsTime, timePreferenceIn, weekdaysNamedIn } from "../../features/agent-v1/functions/basis";
import { polarityOf } from "../../features/agent-v1/functions/negation";
import { readMemoryWords } from "../../features/agent-v1/domains/memory/words";
import { timePreferenceOfEntry } from "../../features/agent-v1/domains/memory/turn";
import { runFn } from "./functions-kit";

test("R33 one negation reader: verb negations in zh, ja, en; double negations; unclear words", () => {
  for (const words of ["20時以降のイベントは入れない", "夜の部は見せないで", "週末は行かない", "不推荐周日的", "周日的不去", "晚上的不看", "don't suggest Sunday events", "never on weekday evenings", "skip anything after 8 pm", "不要晚上的", "週末は除いて"]) assert.equal(polarityOf(words), "exclude", words);
  for (const words of ["除了周末都不要", "週末以外は入れない", "nothing except weekends", "只要周末的", "週末だけ", "weekends only"]) assert.equal(polarityOf(words), "only", words);
  for (const words of ["优先周末上午", "できれば午前中", "prefer weekend mornings", "不错的周末活动"]) assert.equal(polarityOf(words), "prefer", words);
  for (const words of ["不限周末", "只要不是晚上的就行", "not only weekends"]) assert.equal(polarityOf(words), "unclear", words);
});

test("R33 a time named by a single day of the week is that day; the saved entry's own words decide the direction", () => {
  assert.deepEqual(weekdaysNamedIn("不推荐周日的"), [0]);
  assert.deepEqual(weekdaysNamedIn("周一到周三"), [1, 2, 3]);
  assert.deepEqual(weekdaysNamedIn("日曜と水曜"), [0, 3]);
  assert.deepEqual(weekdaysNamedIn("no Fridays"), [5]);
  const sunday = timePreferenceIn("不推荐周日的", "memory")!;
  assert.deepEqual([sunday.exclude, sunday.hard, sunday.weekdays], [true, true, [0]]);
  assert.equal(meetsTime(sunday, "2026-11-22T01:00:00.000Z", "Asia/Tokyo"), true, "Sunday 10:00 in Tokyo is the Sunday the rule leaves out");
  const late = timePreferenceIn("20時以降のイベントは入れない", "memory")!;
  assert.deepEqual([late.exclude, late.hard, late.clock], [true, true, { minutes: 1200, side: "from" }]);
  // An entry an older reader stored as "only evenings" is read from its own words: evenings are left out.
  const stored = timePreferenceOfEntry({ category: "constraint", content: "推荐活动时晚上的一律不去", structured: { dayPart: "evening", strength: "only" } })!;
  assert.deepEqual([stored.exclude, stored.hard, stored.part], [true, true, "evening"]);
  assert.equal(readMemoryWords("イベントは夜のものは入れない").structured?.strength, "avoid");
  assert.equal(readMemoryWords("推荐活动不限周末").structured?.strength, undefined, "no direction stored for unclear words");
  const unclear = timePreferenceOfEntry({ category: "constraint", content: "推荐活动不限周末", structured: null })!;
  assert.deepEqual([unclear.unclear, unclear.hard, unclear.exclude], [true, false, false]);
});

const EVENT_RANK = (quote: string) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 3 }, readFilter: { from: "2026-11-21", to: "2026-11-22" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote });
const listedOf = (events: Record<string, unknown>[]) => (events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[];
// The world's events of Sat 21 and Sun 22 November (Tokyo): Sat 10:00, Sat 19:00, Sun 09:30, Sun 10:00.
const SATURDAY = ["event:event:e101", "event:event:e104"];
const SUNDAY = ["event:event:e102", "event:event:e105"];
const LATE = ["event:event:e104"];

test("R33 guard: for each saved rule, the listed results never hold what its words exclude (zh, ja, en)", async () => {
  const rules: { content: string; never: string[] }[] = [
    { content: "推荐活动时不推荐周日的", never: SUNDAY },
    { content: "推荐活动时周日的不去", never: SUNDAY },
    { content: "イベントは19時以降に始まるものは入れない", never: LATE },
    { content: "Never recommend events on Sundays", never: SUNDAY },
    { content: "推荐活动时除了周日都不要", never: SATURDAY },
    { content: "イベントは日曜以外は入れない", never: SATURDAY },
  ];
  const message = "21号和22号有哪些活动值得去？挑三场。";
  for (const rule of rules) {
    const run = await runFn(message, [EVENT_RANK(message)], { memories: [{ category: "constraint", content: rule.content, id: "MR1" }] });
    const listed = listedOf(run.events);
    assert.ok(listed.length > 0, `${rule.content}: something is listed`);
    for (const ref of rule.never) assert.ok(!listed.includes(ref), `${rule.content}: ${ref} is what the rule leaves out — listed ${listed.join(",")}`);
  }
});

test("R33 a saved rule whose direction cannot be read takes nothing away and is named as unclear", async () => {
  const message = "21号和22号有哪些活动值得去？挑三场。";
  const run = await runFn(message, [EVENT_RANK(message)], { memories: [{ category: "constraint", content: "推荐活动时不限周末", id: "MR2" }, { category: "preference", content: "推荐活动时优先上午的", id: "MR3" }] });
  assert.equal(listedOf(run.events).length, 3, run.result.text);
  assert.ok(run.result.memoryUse?.some((chip: { text: string }) => /看不出/u.test(chip.text)), JSON.stringify(run.result.memoryUse));
});
