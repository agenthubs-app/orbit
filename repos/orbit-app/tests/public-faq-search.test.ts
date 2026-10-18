import assert from "node:assert/strict";
import test from "node:test";

import { filterPublicFaq } from "../src/view-models/public-faq-search";

const entries = [
  { id: "send", question: "メールは自動で送信されますか？", answer: "送信はあなたが行います。", searchKeywords: ["draft", "下書き"] },
  { id: "gmail", question: "Gmail 連携で読むのは？", answer: "件名と日時を読みます。", searchKeywords: ["metadata"] },
  { id: "card", question: "名刺を修正できますか？", answer: "人脈から編集できます。", searchKeywords: ["scan"] },
] as const;

test("empty App FAQ search preserves the local items and order", () => {
  assert.deepEqual(filterPublicFaq(entries, "  "), entries);
});

test("App FAQ search matches local questions, answers, and keywords", () => {
  assert.deepEqual(filterPublicFaq(entries, " 名刺 ").map((entry) => entry.id), ["card"]);
  assert.deepEqual(filterPublicFaq(entries, "日時").map((entry) => entry.id), ["gmail"]);
  assert.deepEqual(filterPublicFaq(entries, " DRAFT ").map((entry) => entry.id), ["send"]);
});

test("App FAQ search returns no result for an absent local topic", () => {
  assert.deepEqual(filterPublicFaq(entries, "領収書"), []);
});
