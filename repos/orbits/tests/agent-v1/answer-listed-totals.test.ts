import assert from "node:assert/strict";
import { test } from "node:test";

import { listedCountNote, withListedTotals } from "../../features/agent-v1/answer/counts";
import { runFn } from "./functions-kit";
import { json, type ModelCall } from "./graph-kit";

/**
 * Production 2026-11-23 (test account): 「我有哪些还没完成的待办？」 — basis 「按你的20条记录回答」 and 20 cards under the model's
 * 「你有16条待办都还没完成，其中4条已过期。」. 16 passed the unsourced-count rule (a number some date of the records holds); a
 * total the answer states for a kind of record is the number of that kind's records it lists (or the read's own total).
 */

test("a stated total of to-dos that contradicts the cards is code's number; the sentence stays", () => {
  const todo = { listed: 20 };
  assert.deepEqual(withListedTotals("你有16条待办都还没完成，其中4条已过期。", { todo }), { changed: [{ from: 16, kind: "todo", to: 20 }], text: "你有20条待办都还没完成，其中4条已过期。" });
  assert.equal(withListedTotals("目前你一共有 16 项还没完成的待办：", { todo }).text, "目前你一共有 20 项还没完成的待办：");
  assert.equal(withListedTotals("还没完成的待办一共有16条。", { todo }).text, "还没完成的待办一共有20条。");
  assert.equal(withListedTotals("未完了のタスクは16件です。うち4件は期限切れです。", { todo }).text, "未完了のタスクは20件です。うち4件は期限切れです。");
  assert.equal(withListedTotals("全部で16件のタスクがあります。", { todo }).text, "全部で20件のタスクがあります。");
  assert.equal(withListedTotals("You have 16 open to-dos, 4 of them overdue.", { todo }).text, "You have 20 open to-dos, 4 of them overdue.");
  assert.equal(withListedTotals("You have twelve tasks that are still open.", { todo }).text, "You have 20 tasks that are still open.");
  // Other kinds, each against its own count.
  assert.equal(withListedTotals("你有 3 个日程，2 篇笔记。", { schedule: { listed: 2 } }).text, "你有 2 个日程，2 篇笔记。");
  assert.equal(withListedTotals("找到的笔记共有5篇。", { memo: { listed: 3 } }).text, "找到的笔记共有5篇。");
  assert.equal(withListedTotals("笔记共有5篇。", { memo: { listed: 3 } }).text, "笔记共有3篇。");
});

test("a right total, the read's own total and a subgroup stay as written", () => {
  const todo = { also: [64], listed: 20 };
  for (const text of [
    "你有20条待办都还没完成，其中4条已过期。",
    "你一共有64项还没完成的待办，这里是最近的20项。",
    // A subgroup of the listed ones: not a total.
    "其中有3条待办和田中有关。",
    "你有3条待办和田中有关。",
    "本周有5项待办要处理。",
    "うち3件のタスクは期限切れです。",
    "You have 3 to-dos about Tanaka.",
    "3 of them are overdue.",
  ]) assert.deepEqual(withListedTotals(text, { todo }), { changed: [], text }, text);
  // A kind not listed is not checked.
  assert.deepEqual(withListedTotals("你有16条待办。", { memo: { listed: 2 } }).changed, []);
});

test("the answer step is told the counts it may state", () => {
  assert.equal(listedCountNote([{ kind: "todo", late: 4, read: 20, total: null }]), "Code's count of the records read for this item: 20 to-dos (4 of them past their deadline or planned day). If you say how many there are, use these numbers.");
  assert.equal(listedCountNote([{ kind: "todo", late: 0, read: 20, total: 64 }, { kind: "memo", late: 0, read: 3, total: null }]), "Code's count of the records read for this item: 20 to-dos (of 64 in all); 3 notes. If you say how many there are, use these numbers.");
  assert.equal(listedCountNote([{ kind: "memo", late: 0, read: 1, total: null }]), null);
});

test("in the graph: 「你有 14 条待办都还没完成」 above 4 cards is delivered with 4; the prompt carries code's count", async () => {
  const message = "我有哪些还没完成的待办？";
  let prompt = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "todo", text: "待办" }], readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    answer: (call: ModelCall) => {
      prompt = call.user;
      return json({ segments: [{ body: ["建议先跟进田中的分期方案，再回复他的询价。"], cites: [...call.user.matchAll(/(s\d+) — to-do/gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), lead: "你有14条待办都还没完成，其中2条已过期。", partId: "p1" }] });
    },
  });
  assert.match(prompt, /Code's count of the records read for this item: 4 to-dos \(2 of them past their deadline or planned day\)/u);
  assert.doesNotMatch(run.result.text, /14条待办/u, run.result.text);
  assert.match(run.result.text, /你有4条待办都还没完成/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "answer.listed_total_corrected"));
});
