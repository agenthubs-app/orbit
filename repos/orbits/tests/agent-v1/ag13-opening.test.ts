import assert from "node:assert/strict";
import test from "node:test";

import { statusClaimsIn, withoutUnsupportedStatus } from "../../features/agent-v1/answer/claims";
import { profileLine } from "../../features/agent-v1/answer/profile-check";
import { timeWordClue } from "../../features/agent-v1/understand/described-clue";
import { ACTOR, contactWorld, json, runContact } from "./contact-kit";
import { memo } from "./read-kit";
import { runFn } from "./functions-kit";

/**
 * agent-design AG13 opening items (AG12 coordinator review), all in code:
 * 1. AE-SCL-004: organization and title both flagged outdated → one value, "拾野选物店店长" (ja/en equivalents).
 * 2. AE-FN-008: a sentence saying something is still to do / done / cancelled needs a record read this turn that supports it.
 * 3. AE-RD-003: a contact clue that is only a word of time ("当时") is not a contact; the part takes the object of the part before.
 * (4, eval isolation, is tests/agent-eval/drain.test.ts.)
 */

test("1 organization and title both outdated: one joined value (zh, ja, en)", () => {
  const contact = { at: null, handle: "s1", header: "contact profile", kind: "contact", partId: "p1", profile: { organization: "拾野选物店", role: "店长", updatedAt: "2026-09-01T00:00:00.000Z" }, ref: "contact:contact:c9", sentences: [], version: "1" } as never;
  const source = { at: "2026-11-05T01:00:00.000Z", handle: "s2", header: "memo", kind: "memo", partId: "p1", ref: "memo:note:n9", sentences: [], version: "1" } as never;
  const both = [
    { contact, field: "organization", newValue: "彤云茶室", profileValue: "拾野选物店", source },
    { contact, field: "role", newValue: "老板", profileValue: "店长", source },
  ] as never;
  assert.match(profileLine("zh", both, "Asia/Tokyo")!, /写的还是「拾野选物店店长」，/u);
  assert.match(profileLine("ja", both, "Asia/Tokyo")!, /まだ「拾野选物店の店长」とあり/u);
  assert.match(profileLine("en", both, "Asia/Tokyo")!, /still says "店长 at 拾野选物店", which/u);
});

test("2 status words: claims are found in zh / ja / en; plain mentions are not claims", () => {
  assert.deepEqual(statusClaimsIn("也就是说，11月13日要给小林发报价这件事还待办。"), ["open"]);
  assert.deepEqual(statusClaimsIn("报价已经完成了。"), ["done"]);
  assert.deepEqual(statusClaimsIn("那场饭局取消了。"), ["cancelled"]);
  assert.deepEqual(statusClaimsIn("見積の送付はまだ済んでいない。"), ["open"]);
  assert.deepEqual(statusClaimsIn("見積は送付済みです。"), ["done"]);
  assert.deepEqual(statusClaimsIn("The quote is still pending."), ["open"]);
  assert.deepEqual(statusClaimsIn("The quote has been sent and is done."), ["done"]);
  assert.deepEqual(statusClaimsIn("The dinner was cancelled."), ["cancelled"]);
  assert.deepEqual(statusClaimsIn("你答应11月13日给小林发报价。"), []);
  assert.deepEqual(statusClaimsIn("你有 3 条待办。"), []);
});

test("2 a status no read record supports is not delivered; a supported one stays", () => {
  const memoOnly = ["11 月 10 日小林给我打电话，说小陈在审核。", "我答应 11 月 13 日给小林发报价。"];
  const text = "11月10日的笔记记了两件事：小林打来电话，说小陈在审核；你答应11月13日给小林发报价。也就是说，11月13日要给小林发报价这件事还待办。";
  const out = withoutUnsupportedStatus(text, memoOnly);
  assert.equal(out.text, "11月10日的笔记记了两件事：小林打来电话，说小陈在审核；你答应11月13日给小林发报价。");
  assert.equal(out.dropped.length, 1);
  // A to-do read this turn with its status field supports it.
  assert.equal(withoutUnsupportedStatus("给小林发报价这条还没完成。", ["Title: 给小林发报价", "Status: open"]).dropped.length, 0);
  assert.equal(withoutUnsupportedStatus("给李薇寄样片已经完成了。", ["Title: 给李薇寄样片", "Status: completed (completed 2026-11-10 (Tue) 18:00)"]).dropped.length, 0);
  assert.equal(withoutUnsupportedStatus("给李薇寄样片已经完成了。", ["Title: 给李薇寄样片", "Status: open"]).dropped.length, 1, "the record says open, not done");
  // ja / en
  assert.equal(withoutUnsupportedStatus("小林さんへの見積はまだ済んでいない。", ["11月13日に見積を送ると約束した。"]).text, "");
  assert.equal(withoutUnsupportedStatus("You promised a quote. That is still pending.", ["I promised to send Kobayashi a quote on Nov 13."]).text, "You promised a quote.");
});

test("2 graph: the summary of a note that states no status does not say the promise is still to do", async () => {
  const message = "@11 月 10 日笔记 帮我整理一下。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "summary", objectClues: [{ entity: "memo", referenceId: "r1", text: "@11 月 10 日笔记" }], requiredCapabilities: ["memo.read", "fn.summarize"], sourceQuote: message }], {
    answer: (call) => json({ segments: [{ cites: [{ sentenceIds: [1, 2], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "这篇笔记记了：小林给你打来电话，说小陈在审核；你答应给小林发报价。也就是说，给小林发报价这件事还待办。" }] }),
    references: [{ id: "note:m32", name: "11 月 10 日笔记", type: "memo" }],
  });
  assert.doesNotMatch(run.result.text, /还待办/u, run.result.text);
  assert.match(run.result.text, /小陈在审核/u);
  assert.ok(run.events.some((event) => event.type === "answer.unsupported_status_dropped"));
});

test("3 a contact clue that is only a word of time names nobody (zh, ja, en); names and pronouns are not time words", () => {
  for (const text of ["当时", "那时", "那时候", "今天", "昨天", "その時", "あの時", "then", "that time", "at the time"]) assert.equal(timeWordClue({ entity: "contact", text }), true, text);
  for (const text of ["小林", "他", "彼女", "Emily", "她"]) assert.equal(timeWordClue({ entity: "contact", text }), false, text);
  assert.equal(timeWordClue({ entity: "memo", text: "当时" }), false, "only contact clues");
});

test("3 graph: 'when did I last talk to 小林? what was said then?' — the second part reads 小林, no contact question", async () => {
  const world = contactWorld((records) => records.push(memo(ACTOR, "note:m41", "早上和小林在车站碰到，约了下周对报价。", "2026-11-15T00:00:00.000Z", ["contact:c17"])));
  const message = "我和小林最近一次互动是哪天？当时说了什么？";
  const run = await runContact(message, [
    { dataSources: ["orbit_records"], objectClues: [{ entity: "contact", text: "小林" }], requiredCapabilities: ["contact.read", "view.recentInteraction"], sourceQuote: "我和小林最近一次互动是哪天？" },
    { dataSources: ["orbit_records"], dependsOn: ["p1"], objectClues: [{ entity: "contact", text: "当时" }], requiredCapabilities: ["memo.read"], sourceQuote: "当时说了什么？" },
  ], [], {
    answer: (call) => {
      const ref = /(s\d+) — memo/u.exec(call.user)?.[1] ?? "s1";
      return json({ segments: [
        { cites: [{ sentenceIds: [1], sourceRef: ref }], partId: "p1", text: "最近一次是 11 月 15 日。" },
        { cites: [{ sentenceIds: [1], sourceRef: ref }], partId: "p2", text: "你们在车站碰到，约了下周对报价。" },
      ] });
    },
    world,
  });
  assert.doesNotMatch(run.result.text, /哪一位联系人|哪位联系人/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "understand.time_word_clue"));
  assert.ok(run.events.some((event) => event.type === "understand.time_word_clue_attached" && event.from === "p1"));
});
