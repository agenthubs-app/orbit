import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { messageKeys } from "../src/i18n/messages";
import { zh } from "../src/i18n/zh";

// R03 (SC-R03-03): pin only the keys present before the domain split.
// Later sprints add keys to both new and original domains; those additions
// still pass the locale parity and single-domain checks below.
const PRE_SPLIT = {
  // In every locale R20b (notes.bodyPlaceholder) and R28 (onboarding.goalsPick) later updated 2 original values; the key set is still R03's.
  en: { keys: 2253, sha256: "1059f89b1e15cc9c8323e0e3c5280fbaca0609b46702b62b538ec9f40af167af" },
  // 36 original ja values were updated by later copy work; the key set is still R03's.
  ja: { keys: 2253, sha256: "2ada766df1659a712efbdbbbb1c01f9636b5eaad756704abbc453e3f1187677d" },
  zh: { keys: 2253, sha256: "33b17293ac42ba6c84bd327860b7ef65bd33b1fe3e49839027402680f912ac9e" },
};
const dictionaries = { en, ja, zh } as const;
// Captured from 4cb76ad8c, excluding the post-split shell/session domains.
const preSplitKeys = JSON.parse(readFileSync(new URL("./fixtures/r03-presplit-keys.json", import.meta.url), "utf8")) as string[];
const preSplitPart = (dictionary: Record<string, string>) => Object.fromEntries(preSplitKeys.filter((key) => key in dictionary).map((key) => [key, dictionary[key]!]));
const i18nRoot = new URL("../src/i18n/", import.meta.url).pathname;

function digest(dictionary: Record<string, string>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(dictionary).sort(([a], [b]) => (a < b ? -1 : 1)))).digest("hex");
}

test("the original split key set retains its current approved copy snapshot", () => {
  for (const [locale, expected] of Object.entries(PRE_SPLIT)) {
    const dictionary = preSplitPart(dictionaries[locale as keyof typeof dictionaries] as Record<string, string>);
    assert.equal(Object.keys(dictionary).length, expected.keys, `${locale} key count`);
    assert.equal(digest(dictionary), expected.sha256, `${locale} content changed during the split`);
  }
});

test("each locale is a folder of one file per key prefix; each key lives in exactly one file", () => {
  for (const locale of ["en", "ja", "zh"]) {
    assert.equal(existsSync(join(i18nRoot, `${locale}.ts`)), false, `src/i18n/${locale}.ts should be split into src/i18n/${locale}/`);
    const files = readdirSync(join(i18nRoot, locale)).filter((name) => name !== "index.ts");
    const seen = new Map<string, string>();
    for (const file of files) {
      const prefix = file.replace(/\.ts$/, "");
      const keys = [...readFileSync(join(i18nRoot, locale, file), "utf8").matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]!);
      assert.ok(keys.length > 0, `${locale}/${file} is empty`);
      for (const key of keys) {
        assert.equal(key.split(".")[0], prefix, `${key} belongs in ${key.split(".")[0]}.ts, not ${file}`);
        assert.ok(!seen.has(key), `${key} appears in ${seen.get(key)} and ${file}`);
        seen.set(key, file);
      }
    }
    assert.equal(seen.size, Object.keys(dictionaries[locale as keyof typeof dictionaries]).length, `${locale}: keys found in domain files`);
  }
});

test("no value is empty and all three locales share one key set", () => {
  const keys = [...messageKeys].sort();
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys, `${locale} keys`);
    for (const [key, value] of Object.entries(dictionary)) assert.ok(value.trim().length > 0, `${locale} ${key} is empty`);
  }
});
