import assert from "node:assert/strict";
import test from "node:test";

import { filterPublicFaq } from "../../app/(app)/app/orbit-2026/auth-public/public-faq-search";

const entries = [
  { id: "send", question: "メールは自動で送信されますか？", answer: "送信はあなたが行います。", searchKeywords: ["draft", "下書き"] },
  { id: "gmail", question: "Gmail 連携で読むのは？", answer: "件名と日時を読みます。", searchKeywords: ["metadata"] },
  { id: "card", question: "名刺を修正できますか？", answer: "人脈から編集できます。", searchKeywords: ["scan"] },
] as const;

test("empty FAQ search preserves the full local list and its order", () => {
  assert.deepEqual(filterPublicFaq(entries, "  "), entries);
});

test("FAQ search matches question, answer, and keywords without a network source", () => {
  assert.deepEqual(filterPublicFaq(entries, " 名刺 ").map((entry) => entry.id), ["card"]);
  assert.deepEqual(filterPublicFaq(entries, "日時").map((entry) => entry.id), ["gmail"]);
  assert.deepEqual(filterPublicFaq(entries, " DRAFT ").map((entry) => entry.id), ["send"]);
});

test("FAQ search returns an empty list when no local item matches", () => {
  assert.deepEqual(filterPublicFaq(entries, "領収書"), []);
});
