import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
const MEMORY = (over: Record<string, unknown>) => ({ appliesTo: ["event.recommend"], category: "preference", content: "memo", createdAt: "2026-10-01T00:00:00.000Z", memoryId: "m1", revision: 1, source: "manual", sourceMessageRef: null, status: "active", structured: null, updatedAt: "2026-10-01T00:00:00.000Z", validFrom: null, validUntil: null, ...over }) as never;
const LIST = (memories: unknown[]) => ({ memories, ruleLimit: 20, settings: { allowConversationLearning: true, enabled: true, updatedAt: "" } }) as never;
test("R18a integrations render truthful connected/preparing states without unsupported sync history", async () => {
  const module = await import("../src/screens/me/AccountIntegrationsContent").catch(() => null); assert.ok(module);
  const html = renderToHtml(createElement(module.AccountIntegrationsContent, { t: createTranslator("ja"), records: [{ provider: "gmail", status: "active", healthStatus: "healthy" }, { provider: "google_calendar", status: "pending", healthStatus: "not_checked" }], busy: false, onConnect: () => {}, onDisconnect: () => {} }));
  for (const text of ["接続済み", "接続する", "件名・相手・日時", "メール本文・添付ファイル", "Google 連絡先", "準備中"]) assert.ok(html.includes(text), text);
  for (const text of ["同期の履歴", "最終同期", "下書きを Gmail", "知らせる"]) assert.ok(!html.includes(text));
});
// AG14 (approved draft board 6, D7–D9): two switches, the groups with 「使う場面」, a row opens the sheet (no delete button
// on the row); the source and the date of saving are not shown any more (D8).
test("AG14 iOrbit memory: switches, groups, 使う場面 on each row, no per-row delete; semantic preference still capability-gated", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent").catch(() => null); assert.ok(module);
  for (const available of [false,true]) {
    const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), language: "ja", goal: null, bio: "紹介", memories: LIST([MEMORY({ content: "週末の午前を優先" }), MEMORY({ appliesTo: ["all"], category: "constraint", content: "時刻は 24 時間表記", memoryId: "m2", source: "conversation" })]), semanticAvailable: available, semanticOn: true, busy: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onSemantic: () => {} }));
    assert.equal(html.includes("意味検索"), available);
    for (const text of ["iOrbit が覚えていること", "回答で参考にする", "会話から新しく覚える（先に確認します）", "いつも守ること", "場合に応じて参考にすること", "使う場面：イベントをおすすめするとき", "使う場面：すべての回答"]) assert.ok(html.includes(text), text);
    assert.ok(!html.includes("iOrbit との会話"), "D8: no source");
    assert.equal(html.match(/aria-label="削除"/g), null, "D9: no delete button on the rows");
  }
  const empty = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("zh"), language: "zh", goal: null, bio: "", memories: LIST([]), semanticAvailable: false, semanticOn: true, busy: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onSemantic: () => {} }));
  assert.ok(empty.includes("还没有记住任何事"));
});
test("R18a failed memory reads are not presented as a successful empty list", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent");
  const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), goal: undefined, bio: "紹介", memories: null, semanticAvailable: false, semanticOn: true, busy: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onSemantic: () => {} }));
  assert.ok(!html.includes("覚えていることはまだありません"));
  assert.ok(!html.includes("まだ何も覚えていません"));
});
// AG14 (board 7, App offline): the last list, read only — the line says so, the rows, 「追加する」 and the two memory switches
// cannot be pressed; the device's own search preference stays usable.
test("R18a offline iOrbit disables remote memory changes but keeps the device search preference usable", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent");
  const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), language: "ja", goal: undefined, bio: "紹介", memories: LIST([MEMORY({})]), semanticAvailable: true, semanticOn: true, busy: false, offline: true, canSave: false, aiAvailable: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onSemantic: () => {} }));
  assert.ok(html.includes("オフラインのため表示のみです。接続してから変更してください。"));
  const row = html.match(/<[^>]+aria-label="memo"[^>]*>/)?.[0];
  assert.ok(row?.includes('aria-disabled="true"'), row);
  const toggles = html.match(/<[^>]+role="switch"[^>]*>/g) ?? [];
  assert.equal(toggles.length, 3);
  assert.ok(toggles.slice(0, 2).every((toggle) => toggle.includes('aria-disabled="true"')), "the memory switches");
  assert.ok(!toggles[2].includes('aria-disabled="true"'), toggles[2]);
});
