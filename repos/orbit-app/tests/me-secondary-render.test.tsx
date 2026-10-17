import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
test("R18a integrations render truthful connected/preparing states without unsupported sync history", async () => {
  const module = await import("../src/screens/me/AccountIntegrationsContent").catch(() => null); assert.ok(module);
  const html = renderToHtml(createElement(module.AccountIntegrationsContent, { t: createTranslator("ja"), records: [{ provider: "gmail", status: "active", healthStatus: "healthy" }, { provider: "google_calendar", status: "pending", healthStatus: "not_checked" }], busy: false, onConnect: () => {}, onDisconnect: () => {} }));
  for (const text of ["接続済み", "接続する", "件名・相手・日時", "メール本文・添付ファイル", "Google 連絡先", "準備中"]) assert.ok(html.includes(text), text);
  for (const text of ["同期の履歴", "最終同期", "下書きを Gmail", "知らせる"]) assert.ok(!html.includes(text));
});
test("R18a iOrbit has only actual memory sources and capability-gated semantic preference", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent").catch(() => null); assert.ok(module);
  for (const available of [false,true]) {
    const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), goal: null, bio: "紹介", memories: [{ memoryId: "m1", source: "manual", content: "memo", createdAt: "2026-10-01" }, { memoryId: "m2", source: "conversation", content: "chat", createdAt: "2026-10-01" }], semanticAvailable: available, semanticOn: true, busy: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onDelete: () => {}, onSemantic: () => {} }));
    assert.equal(html.includes("意味検索"), available); assert.ok(html.includes("iOrbit との会話")); assert.ok(html.includes("メモ")); assert.ok(!html.includes("面談メモ"));
  }
});
test("R18a failed memory reads are not presented as a successful empty list", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent");
  const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), goal: undefined, bio: "紹介", memories: null, semanticAvailable: false, semanticOn: true, busy: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onDelete: () => {}, onSemantic: () => {} }));
  assert.ok(!html.includes("覚えていることはまだありません"));
});
test("R18a offline iOrbit disables remote memory deletion but keeps the device search preference usable", async () => {
  const module = await import("../src/screens/me/AccountIorbitContent");
  const html = renderToHtml(createElement(module.AccountIorbitContent, { t: createTranslator("ja"), goal: undefined, bio: "紹介", memories: [{ memoryId: "m1", source: "manual", content: "memo", createdAt: "2026-10-01" }], semanticAvailable: true, semanticOn: true, busy: false, offline: true, canSave: false, aiAvailable: false, onGoal: () => {}, onBio: () => {}, onGenerate: () => {}, onSave: () => {}, onDelete: () => {}, onSemantic: () => {} }));
  const button = html.match(/<button[^>]+aria-label="削除"[^>]*>/)?.[0];
  assert.ok(button?.includes('aria-disabled="true"'), button);
  const toggle = html.match(/<[^>]+role="switch"[^>]*>/)?.[0];
  assert.ok(toggle && !toggle.includes('aria-disabled="true"'), toggle);
});
