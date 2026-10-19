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

function tree(props: { offline?: boolean; staleDay?: boolean; decisionSample?: boolean; more?: boolean; snooze?: boolean; nextMove?: boolean; sentPrompt?: boolean; orphaned?: boolean; lifecycleOpen?: boolean; decisionSource?: "task_suggestion" | "plan_pending" | "agent_action"; focusedEntryId?: string; secondDecision?: boolean } = {}) {
  const value: OrbitLocaleContextValue = {
    choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null },
    retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja"),
  };
  return createElement(OrbitLocaleContext.Provider, { value }, createElement(TodoSections, {
    page: { ...page, nextMoves: props.nextMove ? { items: [{ key: "agent_signal:signal-1", source: "agent_signal", sourceId: "signal-1", titlePreview: "連絡の案", createdAt: "2026-10-18T00:00:00Z", draftAvailable: false, contactId: "contact-1" }], next: {} } : page.nextMoves,
      decisions: { ...page.decisions, next: props.more ? { task_suggestion: "cursor" } : {}, items: page.decisions.items.map(item => {
      const actions = props.snooze ? [...item.actions, "snooze" as const] : item.actions;
      const source = props.decisionSource ?? item.source;
      const changed = { ...item, key: `${source}:${item.sourceId}`, source, actions };
      if (props.decisionSample !== false) return changed;
      const { sample: _sample, ...withoutSample } = item;
      return { ...withoutSample, key: changed.key, source, actions };
    }).concat(props.secondDecision ? [{ key: "agent_action:action:one", source: "agent_action" as const, sourceId: "action:one", titlePreview: "対象の判断", createdAt: "2026-10-17T00:00:00Z", actions: ["accept" as const] }] : []) } },
    focusedEntryId: props.focusedEntryId,
    offline: props.offline ?? false, staleDay: props.staleDay ?? false, busy: false, mirroredTaskIds: new Set(["t1"]),
    onRefresh() {}, onMore() {}, canOpen: () => true, canOpenFollowup: item => item.kind === "task" || Boolean(props.lifecycleOpen), canDefer: () => true, onOpen() {}, onOpenFollowup() {}, onComplete() {}, onDefer() {}, onDecide() {},
    handoffFor: () => props.sentPrompt ? { sourceId: "signal-1", handedOffAt: "2026-10-18T00:00:00Z" } : null,
    orphanedHandoffs: props.orphaned ? [{ sourceId: "signal-1", handedOffAt: "2026-10-18T00:00:00Z", confirmation: {
      contactId: "contact-1", taskId: null, idempotencyKey: "ios:sent:one", observedAt: "2026-10-18T00:00:00Z", taskCompleted: false,
    } }] : [],
    onSentYes() {}, onSentNotYet() {},
  }));
}

test("a returned handoff asks if the message was sent beside the original signal", () => {
  assert.ok(renderedText(tree({ nextMove: true, sentPrompt: true })).includes("送りましたか？"));
  assert.ok(!renderedText(tree({ nextMove: true })).includes("送りましたか？"));
  const offline = renderToHtml(tree({ nextMove: true, sentPrompt: true, offline: true }));
  assert.ok(offline.includes("送りましたか？"), "the pending question stays visible without network");
  assert.match(offline, /<[^>]+(?=[^>]*aria-label="はい")(?=[^>]*aria-disabled="true")[^>]*>/u);
});

test("a legacy Agent entry is positioned first in 判断待ち", () => {
  const html = renderToHtml(tree({ focusedEntryId: "action:one", secondDecision: true }));
  assert.ok(html.indexOf("対象の判断") < html.indexOf("提案を確認"));
});

test("a vanished signal still exposes its unfinished encounter retry without an invented signal row", () => {
  const live = renderToHtml(tree({ orphaned: true }));
  assert.ok(live.includes("記録がまだ完了していません"));
  assert.ok(live.includes("記録をもう一度試す"));
  assert.equal(live.includes("送りましたか？"), false);
  const offline = renderToHtml(tree({ orphaned: true, offline: true }));
  assert.ok(offline.includes("記録がまだ完了していません"));
  assert.match(offline, /<[^>]+(?=[^>]*aria-label="記録をもう一度試す")(?=[^>]*aria-disabled="true")[^>]*>/u);
});

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

test("a resolvable lifecycle row exposes its detail control only on a current online page", () => {
  const live = renderToHtml(tree({ lifecycleOpen: true }));
  assert.match(live, /aria-label="次の段階を決める"/u);
  assert.doesNotMatch(live, /このフォローの詳細は今は開けません/u);
  for (const html of [renderToHtml(tree({ lifecycleOpen: true, offline: true })), renderToHtml(tree({ lifecycleOpen: true, staleDay: true }))]) {
    assert.doesNotMatch(html, /aria-label="次の段階を決める"/u);
  }
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

test("agent action Later is shown only for its own snooze capability", () => {
  assert.ok(renderedText(tree({ decisionSample: false, decisionSource: "agent_action", snooze: true })).includes("あとで"));
  assert.equal(renderedText(tree({ decisionSample: false, decisionSource: "plan_pending", snooze: true })).includes("あとで"), false);
});

test("a next move with unavailable AI still offers a manual-only draft, including offline", () => {
  const html = renderToHtml(tree({ nextMove: true }));
  assert.ok(html.includes("下書きは今は利用できません"));
  assert.ok(html.includes("手書きする"));
  assert.ok(renderToHtml(tree({ nextMove: true, offline: true })).includes("手書きする"));
});
