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

function tree(props: { offline?: boolean; staleDay?: boolean; decisionSample?: boolean; more?: boolean; snooze?: boolean; decisionSource?: "task_suggestion" | "plan_pending" | "agent_action" } = {}) {
  const value: OrbitLocaleContextValue = {
    choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null },
    retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja"),
  };
  return createElement(OrbitLocaleContext.Provider, { value }, createElement(TodoSections, {
    page: { ...page, decisions: { ...page.decisions, next: props.more ? { task_suggestion: "cursor" } : {}, items: page.decisions.items.map(item => {
      const actions = props.snooze ? [...item.actions, "snooze" as const] : item.actions;
      const source = props.decisionSource ?? item.source;
      const changed = { ...item, key: `${source}:${item.sourceId}`, source, actions };
      if (props.decisionSample !== false) return changed;
      const { sample: _sample, ...withoutSample } = item;
      return { ...withoutSample, key: changed.key, source, actions };
    }) } },
    offline: props.offline ?? false, staleDay: props.staleDay ?? false, busy: false, mirroredTaskIds: new Set(["t1"]),
    onRefresh() {}, onMore() {}, canOpen: () => true, canOpenFollowup: item => item.kind === "task", canDefer: () => true, onOpen() {}, onOpenFollowup() {}, onComplete() {}, onDefer() {}, onDecide() {},
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
  assert.ok(html.includes("このフォローの詳細は今は開けません"));
  assert.equal((html.match(/aria-disabled="true"/gu) ?? []).length >= 2, true);
});

test("only a live non-sample suggestion offers source-native decision controls", () => {
  const live = renderToHtml(tree({ decisionSample: false }));
  assert.ok(live.includes("採用"));
  assert.ok(live.includes("見送る"));
  const sample = renderToHtml(tree());
  assert.ok((sample.match(/aria-disabled="true"/gu) ?? []).length >= 4);
  const offline = renderToHtml(tree({ decisionSample: false, offline: true }));
  assert.equal(offline.includes("採用"), false);
  assert.equal(offline.includes("見送る"), false);
});

test("an owned plain follow-up opens its canonical task detail, while lifecycle identity stays closed", () => {
  const html = renderToHtml(tree());
  assert.match(html, /aria-label="山本さんへ返信"/u);
  assert.doesNotMatch(html, /aria-label="次の段階を決める"/u);
});

test("a source cursor offers See all only while online and current", () => {
  assert.ok(renderedText(tree({ more: true })).includes("すべて"));
  assert.equal(renderedText(tree({ more: true, offline: true })).includes("すべて"), false);
  assert.equal(renderedText(tree({ more: true, staleDay: true })).includes("すべて"), false);
  assert.equal(renderedText(tree()).includes("すべて"), false);
});

test("a live suggestion exposes Tomorrow only when the source allows snooze", () => {
  assert.ok(renderedText(tree({ decisionSample: false, snooze: true })).includes("明日"));
  assert.equal(renderedText(tree({ decisionSample: false })).includes("明日"), false);
  assert.equal(renderedText(tree({ decisionSample: false, snooze: true, offline: true })).includes("明日"), false);
});

test("plan and agent decisions expose their source-native accept/dismiss controls", () => {
  assert.ok(renderedText(tree({ decisionSample: false, decisionSource: "plan_pending" })).includes("採用"));
  assert.ok(renderedText(tree({ decisionSample: false, decisionSource: "agent_action" })).includes("見送る"));
});
