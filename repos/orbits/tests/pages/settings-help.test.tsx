/**
 * 設定 › ヘルプ (b7 #57): the help center inside the settings frame. It used to redirect to the public /help,
 * which dropped the shell, and Back landed on the redirect again so settings could not be reached.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SettingsHelpPage from "../../app/(app)/app/settings/help/page";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

test("settings help renders the help center in the settings frame, with no redirect", () => {
  const source = readFileSync("app/(app)/app/settings/help/page.tsx", "utf8");
  assert.doesNotMatch(source, /redirect\(/u);
  const html = renderToStaticMarkup(createElement(OrbitLanguageProvider, { initialLanguage: "ja", children: createElement(SettingsHelpPage) }));
  assert.match(html, /data-account-section="help"/u);
  assert.match(html, /aria-current="page" href="\/app\/settings\/help"/u, "ヘルプ is selected in the menu");
  assert.match(html, /<h1>ヘルプセンター<\/h1>/u);
  assert.match(html, /type="search"/u);
  assert.match(html, /よくある質問/u);
});
