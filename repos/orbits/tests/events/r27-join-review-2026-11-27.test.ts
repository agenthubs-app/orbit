/**
 * 2026-11-27 用户反馈「问了 5 题还缺、再追问观感很差」：确认页不因缺项拦报名；「追加 / 追加する」是可选入口，只问点的那一项；
 * 「質問に戻る」（会问第 6 题）去掉；答题必须选一个或写一点才能「次へ」（服务端也拒绝空回答）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";
import { eventJoinNextInputObject, eventJoinSubmitInputObject } from "../../shared/api-schema/event-join";

const flow = readFileSync("app/(app)/app/orbit-2026/events/RegisterFlow.tsx", "utf8");

test("review: the apply button is never disabled for missing items (only while busy / the intro is being written)", () => {
  const applyButtons = flow.match(/<button[^>]*onClick=\{\(\) => void apply\(\)\}[^>]*>/g) ?? [];
  assert.equal(applyButtons.length, 2, "desktop + phone");
  for (const button of applyButtons) assert.match(button, /disabled=\{busy \|\| draft === "running"\}/);
  assert.doesNotMatch(flow, /backToQuestions/, "no 「質問に戻る」 (it would ask a 6th question)");
});

test("review: every 「追加 / 追加する」 asks exactly that item (focus), core items first", () => {
  assert.match(flow, /data-join-add=\{item\.key\} onClick=\{\(\) => void askMore\(item\.key\)\}/);
  assert.match(flow, /data-join-fill=\{firstMissing\.key\} onClick=\{\(\) => void askMore\(firstMissing\.key\)\}/);
  assert.match(flow, /const firstMissing = missing\.find\(\(item\) => item\.key === "target" \|\| item\.key === "offer"\) \?\? missing\[0\]/);
  assert.doesNotMatch(flow, /askMore\(\)/, "no 「one more question」 without an item");
});

test("the missing line does not urge: it only says how many are blank", () => {
  assert.deepEqual(eventsJourneyCopy.readyMissing, { en: "{n} left blank", ja: "{n}項目が未入力", kind: "label", zh: "{n}项未填" });
});

test("an answer is required to go on: 次へ stays disabled with nothing picked or typed; the server refuses a blank answer", () => {
  const nextButtons = flow.match(/<button[^>]*onClick=\{\(\) => void submitAnswer\(\)\}[^>]*>/g) ?? [];
  assert.equal(nextButtons.length, 2);
  for (const button of nextButtons) assert.match(button, /disabled=\{busy \|\| \(!selected\.length && !free\.trim\(\)\)\}/);
  assert.match(flow, /const value = \[\.\.\.selected, free\.trim\(\)\]\.filter\(Boolean\)\.join\(" · "\);\n\s+if \(!value\) return;/);
  const blank = { answer: "   ", field: "targetAttendees", prompt: "?", questionToken: "t" };
  assert.equal(eventJoinNextInputObject.safeParse({ answers: [blank] }).success, false);
  assert.equal(eventJoinSubmitInputObject.safeParse({ answers: [blank], idempotencyKey: "k" }).success, false);
});
