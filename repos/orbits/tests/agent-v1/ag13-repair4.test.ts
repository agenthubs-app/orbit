import assert from "node:assert/strict";
import test from "node:test";

import { guardInteraction } from "../../features/agent-v1/functions/extract";
import { groundedAction } from "../../features/agent-v1/functions/extract-followups";
import { questionWordClue, subjectInsideRecord } from "../../features/agent-v1/understand/described-clue";
import { json, runContact } from "./contact-kit";
import { runFn } from "./functions-kit";
import { noul } from "./judgment-kit";

/**
 * agent-design AG13 repair round 4 (judged run-04):
 * - AE-SCL-025 (gate): "明天这场周会关联了哪些人" — "哪些人" came tagged as a contact and Orbit asked which contact.
 * - AE-SCL-018 (AG10/AG12 reruns, gate): the call "中村さんから電話" was classed as between other people because a later
 *   cited sentence reported what was said ("…とのこと"); the extraction also hit the 15 s limit (retried once now).
 * - AE-FN-013 (AG10): a to-do titled 「补齐鲁发票」 — 鲁 is in neither the note nor the message.
 * - AE-FN-009 (AG10): the review timed out and the reply said the note had no interaction to record.
 */

test("AE-SCL-025: a question word is what the question asks for, not a contact; pronouns and names are untouched", () => {
  for (const text of ["哪些人", "谁", "哪位", "誰", "who", "which people"]) assert.equal(questionWordClue({ entity: "contact", text }), true, text);
  for (const text of ["小林", "他", "这位", "那家公司", "Emily"]) assert.equal(questionWordClue({ entity: "contact", text }), false, text);
  assert.equal(questionWordClue({ entity: "event", text: "哪些人" }), false);
  // AE-AMB-009 (round 3) still holds.
  const him = { entity: "contact", text: "他" };
  assert.equal(subjectInsideRecord(him, [him, { entity: "memo", text: "我和他最近聊了什么" }]), false);
});

test("AE-SCL-025 graph: '这场周会关联了哪些人和哪篇笔记' asks no contact question", async () => {
  const message = "明天这场周会关联了哪些人和哪篇笔记？";
  const run = await runContact(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "event", text: "明天这场周会" }, { entity: "contact", text: "哪些人" }, { entity: "memo", text: "哪篇笔记" }], requiredCapabilities: ["event.read", "contact.read", "memo.read"], sourceQuote: message }], [], { answer: () => json({ segments: [] }) });
  assert.ok(run.events.some((event) => event.type === "understand.question_word_clue"));
  assert.doesNotMatch(run.result.text, /哪一位联系人/u, run.result.text);
});

test("AE-SCL-018: a call recorded in its own sentence is the author's, even when a later cited sentence is hearsay", () => {
  const happened = { channel: "phone", contactClue: "中村", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1, 2, 3] } as never;
  assert.equal(guardInteraction(happened, ["11月12日、中村さんから電話。", "新茶試飲会のお礼も伝えた。", "益子陶器市のブースは松本彩さんの隣になるとのこと。"]), "happened");
  assert.equal(guardInteraction(happened, ["森田さんには中村さんが別途連絡済みだそうだ。"]), "between_others", "hearsay alone stays between others");
  assert.equal(guardInteraction(happened, "听小王说田中前天给他打了电话。"), "between_others", "one joined sentence as before");
});

test("AE-SCL-018: an extraction call that fails in a retryable way (timeout, 5xx) is sent once more", async () => {
  const message = "用 @11 月 10 日笔记 更新我和小林的往来。";
  let calls = 0;
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions", "memo.create"], sourceQuote: message }], {
    extractReply: () => {
      calls += 1;
      if (calls === 1) throw new Error("deepseek request timed out after 15000ms.");
      return json({ interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] });
    },
    judge: () => noul(0.95),
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.equal(calls, 2);
  assert.ok(run.events.some((event) => event.type === "functions.extract_retry"));
  assert.equal(run.frozen.length, 1, "the card is made from the second answer");
});

test("AE-FN-013: a to-do title with characters from nowhere falls back to the note's own phrase", () => {
  const note = "[1] 和王强通了电话。\n[2] 我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。";
  const allowed = `王强通话\n${note}\n王强\n把 @王强通话 里我答应的事加到待办。`;
  const cited = "我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。";
  assert.equal(groundedAction("补齐鲁发票", cited, allowed), "发票补齐");
  assert.equal(groundedAction("把合同草稿发给王强", cited, allowed), "把合同草稿发给王强", "a contact's name is allowed");
  assert.equal(groundedAction("Send the draft to Wang", cited, allowed), "Send the draft to Wang", "no CJK characters, nothing to check");
});

test("AE-FN-009: the review timed out — the reply does not say the note has no interaction", async () => {
  const message = "用 @11 月 10 日笔记 更新我和小林的往来。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }, { entity: "contact", text: "小林" }], requiredCapabilities: ["memo.read", "contact.read", "fn.extractInteractions", "memo.create"], sourceQuote: message }], {
    extract: { interactions: [{ channel: "phone", contactClue: "小林", dateText: "11 月 10 日", direction: "incoming", kind: "happened", precision: "day", sentenceIds: [1] }] },
    judge: () => noul(0.95),
    judgeOptions: { hang: true },
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.doesNotMatch(run.result.text, /没有可记的/u, run.result.text);
  assert.match(run.result.text, /复核暂时不可用/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "functions.review_unavailable_said"));
});
