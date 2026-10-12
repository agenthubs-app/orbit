import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { PixelRatio } from "react-native";

import { renderedText, renderToHtml } from "./helpers/render";

// R03 review M3: the skeleton (navigation shell, back bar, the language chain used
// above the locale provider) checked in the product default, Japanese. The legacy
// test seam (src/i18n/locale-core.ts) is cleared before any i18n module loads.
delete (globalThis as { __ORBIT_LEGACY_TEST_LANGUAGE__?: string }).__ORBIT_LEGACY_TEST_LANGUAGE__;
const router = { canGoBack: false, path: "/settings/language" };
const resolve = (Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string })._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "expo-router" ? new URL("./helpers/stubs/expo-router-shell.js", import.meta.url).pathname : request, ...rest);
};
(globalThis as { __shellRouter?: typeof router }).__shellRouter = router;

const load = async () => ({
  ...(await import("../src/components/OrbitTabBar")),
  ...(await import("../src/components/AppScreen")),
  ...(await import("../src/components/AppErrorBoundary")),
  ...(await import("../src/i18n/locale-core")),
  ...(await import("../src/i18n/standard-copy")),
  ...(await import("../src/i18n/messages")),
});

test("without a provider the tab bar speaks Japanese", async () => {
  const { OrbitTabBar } = await load();
  const text = renderedText(<OrbitTabBar active="contacts" />);
  for (const label of ["ホーム", "人脈", "iOrbit", "イベント", "Task"]) assert.ok(text.includes(label), label);
});

// R05 rework: the back control is the kit's round ‹ button (icon only), so the
// parent's name lives in its accessible label at every text size.
test("the round back button names the parent in its accessible label at any text size", async (t) => {
  const { AppScreen } = await load();
  for (const scale of [1, 2]) {
    t.mock.method(PixelRatio, "getFontScale", () => scale);
    const html = renderToHtml(<AppScreen title="言語"><></></AppScreen>);
    assert.match(html, /aria-label="[^"]*設定[^"]*"/u);
    assert.doesNotMatch(renderedText(<AppScreen title="言語"><></></AppScreen>), /設定|戻る/u);
  }
});

test("code above the provider follows the published language, Japanese until one is published", async () => {
  const { AppErrorScreen, currentStandardCopy, currentTranslator, publishOrbitLanguage, currentOrbitLanguage } = await load();
  assert.equal(currentOrbitLanguage(), "ja");
  assert.equal(currentStandardCopy().error.screenFailed, "この画面を表示できませんでした");
  assert.match(renderedText(<AppErrorScreen error={new Error("")} onRetry={() => undefined} />), /この画面を表示できませんでした.*再試行/);
  publishOrbitLanguage("en");
  assert.equal(currentTranslator()("shell.noErrorDetails"), "No more details.");
  assert.match(renderedText(<AppErrorScreen error={new Error("")} onRetry={() => undefined} />), /Couldn.{1,6}t show this screen/);
  publishOrbitLanguage("ja");
});
