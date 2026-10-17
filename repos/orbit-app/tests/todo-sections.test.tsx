import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import type { TodoPageContract } from "../src/api/contract/todo-page";
import { TodoSections } from "../src/screens/todo/TodoSections";
import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import { renderToHtml, renderedText } from "./helpers/render";

const page: TodoPageContract = {
  date: "2026-10-18", timeZone: "Asia/Tokyo", asOf: "2026-10-18T00:00:00Z",
  counts: { decisions: 1, nextMoves: 0, followups: 2, overdue: 1 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [{ key: "task_suggestion:s1", source: "task_suggestion", sourceId: "s1", titlePreview: "提案を確認", createdAt: "2026-10-17T00:00:00Z", actions: ["accept", "dismiss"], sample: true }], next: {} },
  nextMoves: { items: [], next: {} },
  followups: { items: [
    { key: "task:t1", source: "task", sourceId: "t1", taskId: "t1", titlePreview: "山本さんへ返信", createdAt: "2026-10-17T00:00:00Z", kind: "task", status: "open", overdue: true, deferralCount: 2 },
    { key: "relationship_task:l1", source: "relationship_task", sourceId: "l1", taskId: "l1", titlePreview: "次の段階を決める", createdAt: "2026-10-17T00:00:00Z", kind: "lifecycle", status: "open", overdue: false },
  ], next: {} },
  sources: { task_suggestion: "ok", task: "ok", relationship_task: "ok", completion_question: "not_implemented" },
};

function tree(props: { offline?: boolean; staleDay?: boolean } = {}) {
  const value: OrbitLocaleContextValue = {
    choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null },
    retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja"),
  };
  return createElement(OrbitLocaleContext.Provider, { value }, createElement(TodoSections, {
    page, offline: props.offline ?? false, staleDay: props.staleDay ?? false, mirroredTaskIds: new Set(["t1"]),
    onRefresh() {}, onOpen() {}, onComplete() {}, onDefer() {},
  }));
}

test("To-do first page renders three sections, sample and overdue rows without false zero counts", () => {
  const text = renderedText(tree());
  for (const label of ["判断待ち", "今日の一手", "フォロー", "提案を確認", "山本さんへ返信", "次の段階を決める", "サンプル", "期限超過"]) {
    assert.ok(text.includes(label), label);
  }
  assert.ok(text.includes("1件以上"), "partial decision total is a lower bound");
  assert.ok(text.includes("件数を確認できません"), "zero from unavailable sources is unknown");
});

test("offline stale page makes follow-up controls read-only and labels the last-seen data", () => {
  const html = renderToHtml(tree({ offline: true, staleDay: true }));
  assert.ok(html.includes("以前の情報"));
  assert.ok(html.includes("オフライン"));
  assert.ok(html.includes("次の段階を決める"));
  assert.equal((html.match(/aria-disabled="true"/gu) ?? []).length >= 2, true);
});
