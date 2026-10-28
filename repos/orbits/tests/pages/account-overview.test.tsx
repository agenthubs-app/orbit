/**
 * 設定 › アカウント 総覧 (b12 W-R18c-S11, 2026-10-29): the menu item opens an overview — ログイン情報, データ,
 * then アカウントの削除 at the bottom — and only its danger-ghost entry opens the deletion flow, now at
 * /app/settings/account/delete.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountOverviewPage } from "../../app/(app)/app/orbit-2026/account-rights/AccountOverviewPage";
import { accountSectionFor } from "../../app/(app)/app/orbit-2026/account/AccountLayout";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

const render = () => renderToStaticMarkup(createElement(OrbitLanguageProvider, { initialLanguage: "ja", children: createElement(AccountOverviewPage) }));

test("the account menu item opens the overview: sign-in, data, and deletion last, not the deletion list", () => {
  const html = render();
  const order = ["ログイン情報", "データ", "アカウントの削除"].map((label) => html.search(new RegExp(`<h2[^>]*>${label}</h2>`, "u")));
  assert.ok(order.every((at) => at > 0), "all three cards");
  assert.ok(order[0]! < order[1]! && order[1]! < order[2]!, "deletion is the last card");
  assert.match(html, /href="\/app\/settings\/account\/delete"[^>]*>アカウントを削除…/u);
  assert.match(html, /href="\/app\/settings\/exports"/u);
  assert.doesNotMatch(html, /削除されるもの|本人確認へ/u, "the deletion list is its own page");
  assert.match(html, /aria-current="page" href="\/app\/settings\/account"/u, "アカウント is selected in the menu");
  assert.match(html, /role="progressbar"/u, "the sign-in row is bones until the profile and the sign-in method are in");
});

test("the deletion flow lives under the account section and returns to it", () => {
  assert.equal(accountSectionFor("/app/settings/account/delete"), "account");
  assert.equal(accountSectionFor("/app/settings/account"), "account");
  const route = readFileSync("app/(app)/app/settings/account/delete/page.tsx", "utf8");
  assert.match(route, /<AccountDeletionPage \/>/u);
  const deletion = readFileSync("app/(app)/app/orbit-2026/account-rights/AccountDeletionPage.tsx", "utf8");
  assert.match(deletion, /callbackUrl: "\/app\/settings\/account\/delete"/u, "Google re-auth comes back to the flow");
  assert.match(deletion, /href="\/app\/settings\/account">/u, "やめる goes back to the overview");
  const appearance = readFileSync("app/(app)/app/orbit-2026/account/AppearanceSettings.tsx", "utf8");
  assert.match(appearance, /href="\/app\/settings\/account\/delete"/u);
});
