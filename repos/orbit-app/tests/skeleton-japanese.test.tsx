import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { PixelRatio } from "react-native";

import { renderedText } from "./helpers/render";

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

test("the back bar names the parent at 1× and says 戻る at large text sizes", async (t) => {
  const { AppScreen } = await load();
  const screen = () => renderedText(<AppScreen title="言語"><></></AppScreen>);
  t.mock.method(PixelRatio, "getFontScale", () => 1);
  assert.match(screen(), /設定/);
  t.mock.method(PixelRatio, "getFontScale", () => 2);
  assert.match(screen(), /戻る/);
  assert.doesNotMatch(screen(), /設定/);
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
