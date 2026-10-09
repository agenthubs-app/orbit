import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Appearance } from "react-native";

import {
  APPEARANCE_STORAGE_KEY,
  getAppearanceChoice,
  loadAppearancePreference,
  resetAppearanceForTests,
  setAppearanceChoice,
} from "../src/design/appearance";
import { AppearanceOptions } from "../src/screens/settings/AppearanceOptions";
import { renderToHtml, renderedText } from "./helpers/render";

// R01 / SC-R01-06: the App follows the system until the person picks light or
// dark in Settings; the choice is applied through Appearance.setColorScheme and
// remembered on the device. The render harness maps react-native to
// react-native-web, which has no setColorScheme; give it one to observe.
(Appearance as { setColorScheme?: (scheme: string) => void }).setColorScheme ??= () => undefined;
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("with nothing stored the App follows the system", async (t) => {
  resetAppearanceForTests();
  const applied = t.mock.method(Appearance, "setColorScheme", () => undefined);
  await loadAppearancePreference(memoryStorage());
  assert.equal(getAppearanceChoice(), "system");
  assert.deepEqual(applied.mock.calls.map((call) => call.arguments[0]), ["unspecified"]);
});

test("a stored choice is restored and applied at start-up; junk falls back to system", async (t) => {
  resetAppearanceForTests();
  const applied = t.mock.method(Appearance, "setColorScheme", () => undefined);
  await loadAppearancePreference(memoryStorage({ [APPEARANCE_STORAGE_KEY]: "dark" }));
  assert.equal(getAppearanceChoice(), "dark");
  await loadAppearancePreference(memoryStorage({ [APPEARANCE_STORAGE_KEY]: "sepia" }));
  assert.equal(getAppearanceChoice(), "system");
  assert.deepEqual(applied.mock.calls.map((call) => call.arguments[0]), ["dark", "unspecified"]);
});

test("picking light, dark or automatic applies it and remembers it", async (t) => {
  resetAppearanceForTests();
  const applied = t.mock.method(Appearance, "setColorScheme", () => undefined);
  const storage = memoryStorage();
  await loadAppearancePreference(storage);
  await setAppearanceChoice("light");
  assert.equal(storage.values.get(APPEARANCE_STORAGE_KEY), "light");
  await setAppearanceChoice("dark");
  await setAppearanceChoice("system");
  assert.equal(storage.values.get(APPEARANCE_STORAGE_KEY), "system");
  assert.deepEqual(applied.mock.calls.map((call) => call.arguments[0]), ["unspecified", "light", "dark", "unspecified"]);
});

test("a failed write still switches the screen for this session", async (t) => {
  resetAppearanceForTests();
  t.mock.method(Appearance, "setColorScheme", () => undefined);
  await loadAppearancePreference({ getItem: async () => null, setItem: async () => { throw new Error("disk full"); } });
  await setAppearanceChoice("dark");
  assert.equal(getAppearanceChoice(), "dark");
});

test("Settings shows automatic, light and dark as one choice with the current one selected", async (t) => {
  resetAppearanceForTests();
  t.mock.method(Appearance, "setColorScheme", () => undefined);
  await loadAppearancePreference(memoryStorage({ [APPEARANCE_STORAGE_KEY]: "dark" }));
  const view = <AppearanceOptions />;
  const html = renderToHtml(view);
  assert.match(html, /role="radiogroup"/u);
  assert.equal((html.match(/role="radio"/gu) ?? []).length, 3);
  assert.equal((html.match(/aria-checked="true"/gu) ?? []).length, 1);
  // Fallback locale is Chinese in the render harness.
  const text = renderedText(view);
  for (const label of ["跟随系统", "浅色", "深色"]) assert.ok(text.includes(label), `missing ${label}: ${text}`);
});
