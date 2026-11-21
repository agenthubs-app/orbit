/**
 * AG21c R52 (wording and layout) and R53 (notes that should not be there), the parts done by code:
 * - the same paragraph or sentence twice in one answer is said once (blocks and text alike);
 * - a stored status ("open") and "这部分记录里" are said in the cards' words; the topic check that did not finish is said in
 *   the user's words, never "判断没有及时回应" / "the matching step";
 * - a part left unfinished whose words another part of the same turn answered is not listed as "not done".
 * Invented sentences (zh, ja, en).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { withoutInternalWords } from "../../features/agent-v1/answer/list-or-text";
import { answeredElsewhere, withoutRepeatedParagraphs } from "../../features/agent-v1/graph/nodes/deliver";
import { ACTOR, contact, runFn } from "./functions-kit";

test("R52: a repeated paragraph goes; a sentence said twice in one paragraph is said once", () => {
  const blocks: AnswerBlock[] = [
    { text: "下周三之前要把样稿寄给岑。", type: "paragraph" },
    { items: [], shown: 0, type: "records" } as never,
    { text: "下周三之前要把样稿寄给岑。", type: "paragraph" },
    { text: "Mara confirmed the venue. Mara confirmed the venue. The date is still open.", type: "paragraph" },
    { text: "会場は確定しました。会場は確定しました。", type: "paragraph" },
  ];
  const out = withoutRepeatedParagraphs(blocks);
  assert.equal(out.length, 4);
  assert.equal((out[2] as { text: string }).text, "Mara confirmed the venue. The date is still open.");
  assert.equal((out[3] as { text: string }).text, "会場は確定しました。");
});

test("R52: stored status words are said as the cards say them", () => {
  assert.equal(withoutInternalWords("这条待办状态为 open，计划日是周三。", "zh"), "这条待办还没完成，计划日是周三。");
  assert.equal(withoutInternalWords("这部分记录里没有写截止时间。", "zh"), "记录里没有写截止时间。");
  assert.equal(withoutInternalWords("このタスクはステータスが open のままです。", "ja"), "このタスクは未完了。");
  assert.equal(withoutInternalWords("The to-do has status \"open\".", "en"), "The to-do is not done yet.");
  assert.equal(withoutInternalWords("You have one to-do with status open.", "en"), "You have one to-do that is not done yet.");
});

test("R53: a not-done part whose words another part answered", () => {
  const answered = { localId: "p1", quote: [0, 20] as [number, number], status: "answered" as const };
  assert.ok(answeredElsewhere({ localId: "p2", quote: [5, 12], status: "failed" }, [answered]));
  assert.ok(!answeredElsewhere({ localId: "p2", quote: [15, 30], status: "failed" }, [answered]), "words beyond the answered part");
  assert.ok(!answeredElsewhere({ localId: "p2", quote: [5, 12], status: "declined" as never }, [answered]), "a refusal is still said");
});

test("R52: a topic check that did not finish is said without internal words", async () => {
  const world = { events: [], records: [contact(ACTOR, "contact:v1", "郁", { organization: "竹纸工坊", role: "造纸师" }), contact(ACTOR, "contact:v2", "Ines Calder", { organization: "Calder Bindery", role: "Binder" })] };
  const message = "挑一位最适合聊手工造纸的。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "手工造纸", count: 1 }, requiredCapabilities: ["contact.read", "fn.rank"], sourceQuote: message }], { judgeOptions: { hang: true }, memories: [], world: world as never });
  assert.doesNotMatch(run.result.text, /判断没有及时回应|判断暂时不可用|这一步的判断/u, run.result.text);
});
