import assert from "node:assert/strict";
import { test } from "node:test";

import { clockBoundIn } from "../../features/agent-v1/functions/basis";
import { fnWorld, runFn, type TestMemory } from "./functions-kit";
import { platformEvent } from "./read-kit";

/**
 * Integration (coordinator, 2026-11-21; AG21b's R33 clock rules × AG21a's ranking): with a saved rule 「只推荐 19 点以后开始的」
 * the recommendation must hold the events that start at or after 19:00 and none that start earlier; an event with no start
 * time is not one that fits. Two ways the bound was lost: a clock written with a colon (「19:00 以后」, 「19:00以降」) was no
 * bound, and 「七点」 with the evening said elsewhere in the words was read as 07:00. 「这次早上的也算上」 lifts a saved
 * morning clock rule for this turn; with the rule deleted the next list holds what it left out.
 */

const EVENT_RANK = (quote: string) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 10 }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote });
// One day (11月22日): e123 07:30, e102 09:30, e105 10:00, e121 21:00 — no count, so no question back (decision A).
const DAY_RANK = (quote: string) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", readFilter: { from: "2026-11-22", to: "2026-11-22" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote });
const rule = (content: string, category: TestMemory["category"] = "constraint"): TestMemory => ({ appliesTo: ["event.recommend"], category, content, id: "MC1" });
const listed = (events: Record<string, unknown>[]) => ((events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[]);

function world() {
  const base = fnWorld();
  base.events.push(
    platformEvent("event:e120", "夜の写真講座", "2026-11-20T11:30:00.000Z", "渋谷"), // 20:30 Tokyo
    platformEvent("event:e121", "深夜放映会", "2026-11-22T12:00:00.000Z", "新宿"), // 21:00
    platformEvent("event:e122", "傍晚茶会", "2026-11-20T09:00:00.000Z", "神乐坂"), // 18:00
    platformEvent("event:e123", "晨跑摄影", "2026-11-21T22:30:00.000Z", "代代木"), // 07:30 on the 22nd
  );
  return base;
}
// At or after 19:00: e103 (11/19 19:00), e104 (11/21 19:00), e120 (20:30), e121 (21:00).
const EVENING = ["event:event:e103", "event:event:e104", "event:event:e120", "event:event:e121"];

test("the bound: 「19 点以后」, 「19:00 以后」, 「19:00以降」, 「晚上…七点以后」, 'after 7 pm' are 19:00 on; 「早上八点以前」 before 08:00", () => {
  for (const words of ["只推荐 19 点以后开始的", "只推荐 19:00 以后开始的", "19:00以降に始まるものだけ", "19時以降に始まるものだけ", "推荐晚上的活动，只要七点以后开始的", "only events after 7 pm"]) assert.deepEqual(clockBoundIn(words), { minutes: 19 * 60, side: "from" }, words);
  assert.deepEqual(clockBoundIn("不要早上八点以前开始的"), { minutes: 8 * 60, side: "before" });
});

for (const content of ["只推荐 19 点以后开始的活动", "只推荐 19:00 以后开始的活动", "イベントは19:00以降に始まるものだけ", "推荐晚上的活动，只要七点以后开始的"]) {
  test(`saved 「${content}」: every event from 19:00 on, none earlier, an event with no start time is not counted`, async () => {
    const message = "给我推荐几场活动。";
    const run = await runFn(message, [EVENT_RANK(message)], { memories: [rule(content)], world: world() });
    assert.deepEqual([...listed(run.events)].sort(), EVENING, run.result.text);
    assert.match(run.result.text, /符合条件的一共4场/u, run.result.text);
  });
}

test("「这次早上的也算上」 lifts the saved morning clock rule for this turn: the 07:30 event comes back", async () => {
  const saved = rule("不要早上八点以前开始的活动");
  const message = "给我推荐几场11月22日的活动。";
  const before = await runFn(message, [DAY_RANK(message)], { memories: [saved], world: world() });
  assert.ok(!listed(before.events).includes("event:event:e123"), "the rule leaves 07:30 out");
  const lift = "给我推荐几场11月22日的活动，这次早上的也算上。";
  const run = await runFn(lift, [DAY_RANK(lift)], { memories: [saved], world: world() });
  assert.ok(listed(run.events).includes("event:event:e123"), listed(run.events).join(", "));
  assert.ok(run.events.some((event) => event.type === "functions.saved_rule_lifted_this_turn"));
});

test("with the saved rule deleted, the next list holds what it used to leave out", async () => {
  const message = "给我推荐几场11月22日的活动。";
  const ruled = await runFn(message, [DAY_RANK(message)], { memories: [rule("只推荐 19 点以后开始的活动")], world: world() });
  assert.deepEqual(listed(ruled.events), ["event:event:e121"], "only 21:00 that day");
  const after = await runFn(message, [DAY_RANK(message)], { memories: [], world: world() });
  assert.ok(listed(after.events).includes("event:event:e123") && listed(after.events).includes("event:event:e102"), listed(after.events).join(", "));
});
