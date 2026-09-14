import assert from "node:assert/strict";
import test from "node:test";

import {
  languageFromDeviceLocales,
  resolveEffectiveLanguage,
} from "../src/i18n/locale-core";
import { createTranslator, messageKeys } from "../src/i18n/messages";
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { zh } from "../src/i18n/zh";

test("device locale resolution uses the first supported language and a documented fallback", () => {
  assert.equal(languageFromDeviceLocales([{ languageCode: "ja", languageTag: "ja-JP" }]), "ja");
  assert.equal(languageFromDeviceLocales([{ languageCode: "fr", languageTag: "fr-FR" }, { languageCode: "en", languageTag: "en-US" }]), "en");
  assert.equal(languageFromDeviceLocales([{ languageCode: "zh", languageTag: "zh-Hant-TW" }]), "zh");
  assert.equal(languageFromDeviceLocales([{ languageCode: null, languageTag: "fr-FR" }]), "zh");
  assert.equal(languageFromDeviceLocales([]), "zh");
});

test("manual account language wins while system mode follows each device", () => {
  assert.deepEqual(resolveEffectiveLanguage({
    deviceLanguage: "en",
    preference: { mode: "system", language: null, updatedAt: null },
  }), { language: "en", source: "device" });
  assert.deepEqual(resolveEffectiveLanguage({
    deviceLanguage: "en",
    preference: { mode: "manual", language: "ja", updatedAt: "2026-09-15T00:00:00.000Z" },
  }), { language: "ja", source: "account" });
});

test("all dictionaries contain exactly the same stable keys", () => {
  const expected = [...messageKeys].sort();
  assert.deepEqual(Object.keys(zh).sort(), expected);
  assert.deepEqual(Object.keys(ja).sort(), expected);
  assert.deepEqual(Object.keys(en).sort(), expected);
});

test("translator interpolates Orbit chrome but leaves arbitrary business text literal", () => {
  const t = createTranslator("en");
  assert.equal(t("common.openNamed", { name: "株式会社 星野 / 星野工作室" }), "Open 株式会社 星野 / 星野工作室");
  assert.equal(t.literal("Live performance with generated music from a local provider."), "Live performance with generated music from a local provider.");
});
