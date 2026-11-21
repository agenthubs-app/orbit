/**
 * AG21c R53: a day with nothing in it was answered with the generic 「在你的 Orbit 记录里没有找到相关的内容」. An empty result
 * says what kind of record is empty, and for which day. Invented records (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { emptyDayLine } from "../../features/agent-v1/answer/empty-kinds-copy";
import { ACTOR, contact, runFn } from "./functions-kit";

test("the line: the day and the kinds", () => {
  assert.equal(emptyDayLine("zh", "2026-11-15", "2026-11-15", ["todo", "schedule"]), "今天没有待办或日程。");
  assert.equal(emptyDayLine("ja", "2026-11-18", "2026-11-15", ["schedule"]), "11月18日の予定はありません。");
  assert.equal(emptyDayLine("en", "2026-11-18", "2026-11-15", ["todo", "schedule"]), "Nov 18 has no to-dos or schedule items in your Orbit records.");
});

for (const [language, message, said] of [
  ["zh", "11月18日有什么待办和日程？", /11月18日没有待办或日程/u],
  ["ja", "11月18日のToDoと予定は？", /11月18日のToDoや予定はありません/u],
  ["en", "What's on my to-dos and schedule for Nov 18?", /Nov 18 has no to-dos or schedule items/u],
] as const) {
  test(`${language}: 「${message}」 with nothing that day says so by kind`, async () => {
    const world = { events: [], records: [contact(ACTOR, "contact:e1", "Oriel Banks")] };
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-11-18", to: "2026-11-18" }, requiredCapabilities: ["todo.read", "schedule.read"], sourceQuote: message }], { language, memories: [], world: world as never });
    assert.match(run.result.text, said, run.result.text);
    assert.doesNotMatch(run.result.text, /没有找到相关的内容|見つかりませんでした|found nothing related/u);
  });
}
