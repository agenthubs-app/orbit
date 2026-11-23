import assert from "node:assert/strict";
import { test } from "node:test";

import { asksForNextStep, asksForReasons, eventReason, themesOf } from "../../features/agent-v1/graph/nodes/reasons";
import { runFn } from "./functions-kit";

/**
 * Hotfix part 3 (judges on cdd160127): the Web's suggested questions ask for reasons and for a next step; the code-written
 * lists gave neither. Reasons come from each event's own themes and the user's note that mentions one (the interest note:
 * 摄影, 街拍, 出版), every upcoming event stays listed; the next step is the recorded item that put the person on the list.
 */

test("which words ask for reasons, which for a next step (zh, ja, en)", () => {
  for (const words of ["推荐值得参加的活动并说明原因。", "参加する価値があるイベントを、理由とともに教えて。", "Suggest events worth attending and explain why."]) assert.equal(asksForReasons(words), true, words);
  for (const words of ["告诉我现在该联系谁、原因和下一步。", "今、誰に連絡すべきか、理由と次の一歩を教えて。", "Who should I contact now, why, and what is the next step?"]) assert.equal(asksForNextStep(words), true, words);
  assert.equal(asksForReasons("最近有哪些活动适合我？"), false);
  assert.equal(asksForNextStep("哪些人值得先跟进？"), false);
  assert.deepEqual(themesOf("摄影、街拍"), ["摄影", "街拍"]);
  assert.equal(eventReason("zh", ["设计"], new Map()), "主题是设计", "nothing to link: its theme only");
  assert.equal(eventReason("zh", [], new Map()), null, "no theme: no reason, nothing invented");
});

const EVENTS_IN_TIME = ["event:event:e103", "event:event:e101", "event:event:e104", "event:event:e102", "event:event:e105", "event:event:e107"];

for (const [language, message, basis, photo, design, fit] of [
  ["zh", "推荐值得参加的活动并说明原因。", "值得参加的活动并说明原因", /东京街头摄影展[^\n]*——主题是摄影；你的笔记「兴趣笔记」里写了摄影/u, /设计师之夜[^\n]*——主题是设计(?!；)/u, /这 6 场里有 4 场和你笔记里写的兴趣（[^）]*）对得上，其余也按时间列在里面。/u],
  ["ja", "参加する価値があるイベントを、理由とともに教えて。", "参加する価値があるイベント", /东京街头摄影展[^\n]*——テーマは摄影。メモ「兴趣笔记」に摄影とあります/u, /设计师之夜[^\n]*——テーマは设计(?!。)/u, /6件のうち4件が、メモに書かれた関心/u],
  ["en", "Suggest events worth attending and explain why.", "events worth attending", /东京街头摄影展[^\n]* — about 摄影; your note "兴趣笔记" mentions 摄影/u, /设计师之夜[^\n]* — about 设计(?!;)/u, /4 of the 6 match what your notes mention/u],
] as const) {
  test(`part 3 (${language}): 「${message}」 — every upcoming event by time, each with its reason from its themes and the interest note`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { language });
    const ranked = run.events.filter((event) => event.type === "fn.rank").at(-1) as { listed?: string[] } | undefined;
    assert.deepEqual(ranked?.listed, EVENTS_IN_TIME, "all of them, in time order");
    assert.match(run.result.text, photo, run.result.text);
    assert.match(run.result.text, design);
    assert.match(run.result.text, fit);
    assert.equal(run.judgeCalls.length, 0);
    assert.equal(run.modelCalls.filter((call) => call.node !== "understand").length, 0);
    assert.ok(run.result.sourceRefs.includes("memo:note:m36"), "the note a reason names is attached");
  });
}

for (const [language, message, basis, tanaka, li] of [
  ["zh", "告诉我现在该联系谁、原因和下一步。", "现在该联系谁", /田中浩[^\n]*下一步：「跟进田中的分期方案」/u, /李薇[^\n]*下一步：「给李薇寄样片」/u],
  ["ja", "今、誰に連絡すべきか、理由と次の一歩を教えて。", "今、誰に連絡すべきか", /田中浩[^\n]*次の一歩：「跟进田中的分期方案」/u, /李薇[^\n]*次の一歩：「给李薇寄样片」/u],
  ["en", "Who should I contact now, why, and what is the next step?", "who should I contact now", /田中浩[^\n]*Next step: "跟进田中的分期方案"/u, /李薇[^\n]*Next step: "给李薇寄样片"/u],
] as const) {
  test(`part 3 (${language}): 「${message}」 — each person's line ends with the next step, the recorded item as written`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { language });
    assert.match(run.result.text, tanaka, run.result.text);
    assert.match(run.result.text, li);
    assert.equal(run.judgeCalls.length, 0);
  });
}
