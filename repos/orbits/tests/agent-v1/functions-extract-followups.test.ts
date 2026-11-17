import assert from "node:assert/strict";
import test from "node:test";

import { isDeadline } from "../../features/agent-v1/functions/dates";
import { guardOwner } from "../../features/agent-v1/functions/extract";
import { graphKit, recordAccessOf } from "./graph-kit";
import { choice } from "./judgment-kit";
import { fnWorld, NOW, runFn } from "./functions-kit";

/**
 * agent-design AG10-4: the author's own commitment, the other person's and a mere suggestion are kept apart; "までに",
 * "最迟", "by" make a due date, a day to do it a planned date, each kept as its own kind; "我答应了什么" only answers
 * (quoting the memo) and makes no card; "加到待办" makes one, from the commitments the review confirms.
 */

const M38 = { id: "note:m38", name: "山本さん打ち合わせメモ", type: "memo" };
const M39 = { id: "note:m39", name: "Call with Emily", type: "memo" };
const M91 = { id: "note:m91", name: "王强通话", type: "memo" };
const owner = (byKey: Record<string, string>) => (id: string) => {
  const key = id.split("__")[1];
  return byKey[key] ? choice(byKey[key], 0.95) : undefined;
};

test("deadline words make a due date, a plain day a planned date (zh, ja, en)", () => {
  assert.equal(isDeadline("原稿は12月5日までに送ると約束した。", "12月5日までに"), true);
  assert.equal(isDeadline("我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。", "11 月 20 日"), false);
  assert.equal(isDeadline("我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。", "最迟 11 月 25 日"), true);
  assert.equal(isDeadline("我答应 11 月 19 日前把 JD 发给她。", "11 月 19 日前"), true);
  assert.equal(isDeadline("She will send the dashboard spec by Friday.", "by Friday"), true);
  assert.equal(isDeadline("I promised to send her the interview panel list by November 18.", "November 18"), true);
});

test("code's guard on 'me': only considering is a suggestion; no word of a commitment or of the author is doubtful", () => {
  const me = { action: "x", owner: "me" as const, sentenceIds: [1] };
  assert.equal(guardOwner(me, "I should think about whether to join their beta."), "suggestion");
  assert.equal(guardOwner(me, "松本さんには来週あたり連絡しようと思う。"), "suggestion");
  assert.equal(guardOwner(me, "原稿は12月5日までに送ると約束した。"), "me");
  assert.equal(guardOwner(me, "She will send the dashboard spec by Friday."), "doubtful");
});

test("AE-FN-011: '私が約束したことは何ですか' only answers — the commitment quoted, as the author's own — and makes no card", async () => {
  const message = "@山本さん打ち合わせメモ の中で、私が約束したことは何ですか？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@山本さん打ち合わせメモ" }], requiredCapabilities: ["memo.read"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "山本", action: "原稿を山本さんに送る", dueDateText: "12月5日までに", owner: "me", sentenceIds: [2] }] },
    judge: owner({ f1: "me" }),
    language: "ja",
    references: [M38],
  });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /あなたが約束したこと：\n- 原稿を山本さんに送る（期限：12月5日（土）まで） ——原文：「来月の特集について、原稿は12月5日までに送ると約束した。」/u);
  assert.ok(run.events.some((event) => event.type === "fn.extractFollowUps"));
});

test("AE-FN-011 then 'それをToDoに追加してください': one to-do from the same memo — due 12-05 (a deadline, not a planned day), about 山本直子", async () => {
  const world = fnWorld();
  const session = graphKit(fetch, { now: NOW, records: recordAccessOf(world) });
  const first = "@山本さん打ち合わせメモ の中で、私が約束したことは何ですか？";
  const extract = { followUps: [{ aboutClue: "山本", action: "原稿を山本さんに送る", dueDateText: "12月5日までに", owner: "me", sentenceIds: [2] }] };
  await runFn(first, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@山本さん打ち合わせメモ" }], requiredCapabilities: ["memo.read"], sourceQuote: first }], { extract, judge: owner({ f1: "me" }), language: "ja", references: [M38], session, world });
  const second = "それをToDoに追加してください。";
  const run = await runFn(second, [{ deliverable: "change", objectClues: [{ entity: "memo", text: "それ" }, { entity: "todo", text: "ToDo" }], requiredCapabilities: ["todo.create"], sourceQuote: second }], { extract, judge: owner({ f1: "me" }), language: "ja", session, world });
  assert.equal(run.frozen.length, 1);
  const [intent] = run.frozen[0].intents as { capability: string; set: Record<string, unknown> }[];
  assert.equal(intent.capability, "todo.create");
  assert.equal(intent.set.plannedDate, null);
  assert.equal(intent.set.dueAt, "2026-12-05T14:59:00.000Z");
  assert.deepEqual(intent.set.relatedContactIds, ["contact:c41"]);
  assert.equal(intent.set.sourceNoteId, "note:m38");
  const op = run.frozen[0].preview.operations[0] as unknown as { display?: { rows: { label: string; after: string }[] } };
  assert.ok(op.display!.rows.some((row) => row.label === "期限（この日まで）" && row.after === "12月5日（土）"), JSON.stringify(op.display));
});

test("AE-FN-012: the other person's commitment and a suggestion are told apart; the author committed to nothing", async () => {
  const message = "In @Call with Emily, what did I promise to do, and what is Emily supposed to do?";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", referenceId: "r1", text: "@Call with Emily" }, { entity: "contact", text: "Emily" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "Emily", action: "Send the dashboard spec", dueDateText: "by Friday", owner: "other", sentenceIds: [2] }, { action: "Think about whether to join their beta", owner: "me", sentenceIds: [3] }] },
    judge: owner({ f1: "other", f2: "suggestion" }),
    language: "en",
    references: [M39],
  });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /This note has nothing that you yourself committed to do\./u);
  assert.match(run.result.text, /What the other person said they would do:\n- Send the dashboard spec \(deadline as written: by Friday\) — the note says: "She will send the dashboard spec by Friday\."/u);
  assert.match(run.result.text, /Only to consider \(not a commitment\):\n- Think about whether to join their beta/u);
});

test("AE-FN-013: '我答应的事加到待办' — one card, two to-dos: planned 11-20 and due 11-25, both about 王强", async () => {
  const message = "把 @王强通话 里我答应的事加到待办。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@王强通话" }, { entity: "todo", text: "待办" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ aboutClue: "王强", action: "把合同草稿发给王强", owner: "me", plannedDateText: "11 月 20 日", sentenceIds: [2] }, { action: "补齐发票", dueDateText: "11 月 25 日", owner: "me", sentenceIds: [2] }] },
    judge: owner({ f1: "me", f2: "me" }),
    references: [M91],
  });
  assert.equal(run.frozen.length, 1);
  const sets = (run.frozen[0].intents as unknown as { set: Record<string, unknown> }[]).map((intent) => intent.set);
  assert.deepEqual(sets.map((set) => [set.plannedDate, set.dueAt]), [["2026-11-20", null], [null, "2026-11-25T14:59:00.000Z"]], "the model put the deadline as dueDateText without its word; code reads 最迟 in the sentence");
  assert.deepEqual(sets.map((set) => set.relatedContactIds), [["contact:c46"], ["contact:c46"]], "one linked contact: both are about him");
  assert.ok(sets.every((set) => String(set.notes).includes("我答应 11 月 20 日把合同草稿发给他，发票最迟 11 月 25 日补齐。")));
  const previews = run.frozen[0].preview.operations.map((op) => (op as unknown as { preview: string }).preview);
  assert.match(previews[0], /新增待办「把合同草稿发给王强」，计划日 11月20日（周五）/u);
  assert.match(previews[1], /新增待办「补齐发票」，最迟 11月25日（周三）/u);
});

test("a commitment the review does not confirm is listed as doubtful and never put on a card", async () => {
  const message = "把 @王强通话 里我答应的事加到待办。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "change", objectClues: [{ entity: "memo", referenceId: "r1", text: "@王强通话" }], requiredCapabilities: ["memo.read", "fn.extractFollowUps", "todo.create"], sourceQuote: message }], {
    extract: { followUps: [{ action: "把合同草稿发给王强", owner: "me", plannedDateText: "11 月 20 日", sentenceIds: [2] }] },
    judgeOptions: { hang: true },
    references: [M91],
  });
  assert.equal(run.frozen.length, 0);
  assert.match(run.result.text, /可能是你的承诺，但复核没有把握（只列出）/u);
});
