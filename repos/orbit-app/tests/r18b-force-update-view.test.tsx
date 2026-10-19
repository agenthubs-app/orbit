import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { createTranslator } from "../src/i18n/messages";
import { ForceUpdateContent } from "../src/screens/public/ForceUpdateContent";
import { forceUpdateRouteTarget, validAppStoreUrl } from "../src/view-models/force-update-view";
import { renderToHtml, renderedText } from "./helpers/render";

test("only a real apps.apple.com listing is an upgrade destination", () => {
  assert.equal(validAppStoreUrl("https://apps.apple.com/jp/app/orbit/id123456789"), "https://apps.apple.com/jp/app/orbit/id123456789");
  for (const value of [undefined, "", "https://apps.apple.com.evil.test/app/id123", "javascript:alert(1)", "https://apps.apple.com/search?term=orbit"]) {
    assert.equal(validAppStoreUrl(value), null);
  }
});

test("force-update route cannot silently fall through to home while enforcement is active", () => {
  assert.equal(forceUpdateRouteTarget({ kind: "force-update", latestAppVersion: "1.6.0" }, true), null);
  assert.equal(forceUpdateRouteTarget({ kind: "maintenance" }, true), "/maintenance");
  assert.equal(forceUpdateRouteTarget({ kind: "allow", diagnostic: "policy-unavailable" }, false), "/");
  assert.equal(forceUpdateRouteTarget({ kind: "allow" }, true), "/home");
});

test("unconfigured store action is visibly unavailable without claiming an update exists", () => {
  const element = <ForceUpdateContent t={createTranslator("ja")} storeUrl={null} onUpdate={() => undefined} />;
  const text = renderedText(element);
  const html = renderToHtml(element);
  assert.match(text, /アップデートが必要です/);
  assert.match(text, /ストアで更新/);
  assert.match(text, /App Store のリンクを準備中です/);
  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(text, /更新履歴|データは必ず/);
});

test("a validated store listing enables the action without an unavailable message", () => {
  const element = <ForceUpdateContent t={createTranslator("ja")} storeUrl="https://apps.apple.com/jp/app/orbit/id123456789" onUpdate={() => undefined} />;
  const html = renderToHtml(element);
  assert.doesNotMatch(html, /aria-disabled="true"/);
  assert.doesNotMatch(renderedText(element), /App Store のリンクを準備中です/);
});
