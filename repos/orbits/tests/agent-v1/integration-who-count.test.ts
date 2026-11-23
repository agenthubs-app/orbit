import assert from "node:assert/strict";
import { test } from "node:test";

import { runFn } from "./functions-kit";

/**
 * Integration after AG21a/AG21b (AE-ANS-029 in AG21b's run): the first layer read a count of 1 from the singular "who" in
 * "Who should I contact now, why, and what is the next step?" and the follow-up ranking listed one person (C31 missing).
 * A singular "who" is no count: the ranking shows its usual first few. A number in the words, or 「一个人／一人だけ／just one」,
 * still caps it.
 */

const listed = (events: Record<string, unknown>[]) => ((events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[]);

for (const [language, message, basis] of [
  ["en", "Who should I contact now, why, and what is the next step?", "who should I contact now"],
  ["zh", "告诉我现在该联系谁、原因和下一步。", "现在该联系谁"],
  ["ja", "今、誰に連絡すべきか、理由と次の一歩を教えて。", "今、誰に連絡すべきか"],
] as const) {
  test(`AE-ANS-029 shape (${language}): 「${message}」 with the first layer's count 1 — the usual first few, not one`, async () => {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis, count: 1 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { language });
    assert.ok(listed(run.events).length >= 2, `${listed(run.events).join(", ")}\n${run.result.text}`);
    assert.ok(run.events.some((event) => event.type === "functions.who_is_no_count"));
  });
}

test("an explicit one still caps it: 「只要一个人」 / 'just one person' / 「一人だけ」, and a number in the words", async () => {
  for (const [language, message] of [["zh", "现在该先联系谁？只要一个人。"], ["en", "Who should I contact now? Just one person."], ["ja", "今、誰に連絡すべき？一人だけ教えて。"]] as const) {
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 1 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { language });
    assert.equal(listed(run.events).length, 1, `${language}: ${run.result.text}`);
  }
  const two = "现在该联系谁？挑两个人。";
  const run = await runFn(two, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 2 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: two }]);
  assert.equal(listed(run.events).length, 2, run.result.text);
});
