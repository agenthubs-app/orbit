import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
test("R18a settings shows only three effective languages and approved destinations", async () => {
  const module = await import("../src/screens/me/AccountSettingsContent").catch(() => null); assert.ok(module);
  const html = renderToHtml(createElement(module.AccountSettingsContent, { t: createTranslator("ja"), name: "佐藤 健一", email: "sato@example.com", language: "ja", appearance: "system", development: false, permissions: [], onOpen: () => {}, onLanguage: () => {}, onAppearance: () => {}, onSignOut: () => {} }));
  for (const label of ["連携", "iOrbit が使う情報", "日本語", "English", "中文", "ライト", "ダーク", "自動", "ログアウト"]) assert.ok(html.includes(label), label);
  for (const hidden of ["NFC", "ご利用プラン", "端末の言語を使用", "サーバー", "プッシュ通知"]) assert.ok(!html.includes(hidden), hidden);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 6);
});
test("R18a OS permission action requests only undetermined and opens Settings after denial", async () => {
  const module = await import("../src/screens/me/permission-action").catch(() => null); assert.ok(module);
  const calls: string[] = [];
  const adapter = { request: async () => { calls.push("request"); }, openSettings: async () => { calls.push("settings"); } };
  await module.actOnPermission("undetermined", adapter); await module.actOnPermission("denied", adapter); await module.actOnPermission("granted", adapter);
  assert.deepEqual(calls, ["request", "settings", "settings"]);
});
test("R18a secondary placeholder is dynamic and old permissions route redirects", () => {
  const route = readFileSync("app/settings/[section].tsx", "utf8"); assert.match(route, /AccountPreparingScreen/);
  const permissions = readFileSync("app/account/permissions.tsx", "utf8"); assert.match(permissions, /Redirect/); assert.match(permissions, /\/settings/);
  assert.equal(readFileSync("app/settings.tsx", "utf8").includes("screens/me/AccountSettingsScreen"), true);
});
