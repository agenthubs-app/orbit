import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { languageFromDeviceLocales, resolveEffectiveLanguage } from "../src/i18n/locale-core";
import { renderedText } from "./helpers/render";

// R03 contract E / RD-11 (SC-R03-05): a device language that is not zh / ja / en
// falls back to Japanese, and so does a screen rendered without a locale provider.
// A user who picked a language by hand keeps it.
test("an unsupported device language falls back to Japanese", () => {
  assert.equal(languageFromDeviceLocales([{ languageCode: "fr", languageTag: "fr-FR" }]), "ja");
  assert.equal(languageFromDeviceLocales([{ languageCode: null, languageTag: "de-DE" }]), "ja");
  assert.equal(languageFromDeviceLocales([]), "ja");
  // the first supported language in the device list still wins
  assert.equal(languageFromDeviceLocales([{ languageCode: "fr" }, { languageCode: "en" }]), "en");
  assert.equal(languageFromDeviceLocales([{ languageCode: "zh", languageTag: "zh-Hans-CN" }]), "zh");
});

test("a manual choice survives a French device", () => {
  const device = languageFromDeviceLocales([{ languageCode: "fr" }]);
  assert.deepEqual(resolveEffectiveLanguage({ deviceLanguage: device, preference: { mode: "manual", language: "zh", updatedAt: "2026-10-01T00:00:00.000Z" } }), { language: "zh", source: "account" });
  assert.deepEqual(resolveEffectiveLanguage({ deviceLanguage: device, preference: { mode: "system", language: null, updatedAt: null } }), { language: "ja", source: "device" });
});

test("without a provider the screen language is Japanese", async () => {
  // This test checks the product default, so it clears the legacy test seam
  // (src/i18n/locale-core.ts) before the context module is loaded.
  const seam = globalThis as { __ORBIT_LEGACY_TEST_LANGUAGE__?: string };
  delete seam.__ORBIT_LEGACY_TEST_LANGUAGE__;
  const { useOrbitLocale } = await import("../src/i18n/OrbitLocaleContext");
  function Probe() {
    const locale = useOrbitLocale();
    return React.createElement("span", null, `${locale.language}|${locale.t("nav.home")}`);
  }
  const [language] = renderedText(React.createElement(Probe)).split("|");
  assert.equal(language, "ja");
});
