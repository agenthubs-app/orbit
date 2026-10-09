import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { messageKeys } from "../src/i18n/messages";
import { zh } from "../src/i18n/zh";

// R03 (SC-R03-03): the three dictionaries were split by key prefix into
// src/i18n/<locale>/<domain>.ts. The split moved files only: every key and
// every value is byte-for-byte what it was before (hashes of the pre-split
// dictionaries, sorted by key; full snapshot in the R03 evidence folder).
const PRE_SPLIT = {
  en: { keys: 2253, sha256: "638192bfe5212904fda21acae16138ff871d36cf9830e936d628550c922b9d39" },
  ja: { keys: 2253, sha256: "455cbfa064751171a70c086194eadfdef8bbbf45fb49f644f0e1fd6242db8d7a" },
  zh: { keys: 2253, sha256: "197cb41cc98085886fb83c331bf2304579644c71e7de1260c1a9a48276dd05af" },
};
const dictionaries = { en, ja, zh } as const;
// Domains added after the split (R03 contract D): not part of the pre-split pins.
const ADDED_SINCE_SPLIT = new Set(["shell", "session"]);
const preSplitPart = (dictionary: Record<string, string>) => Object.fromEntries(Object.entries(dictionary).filter(([key]) => !ADDED_SINCE_SPLIT.has(key.split(".")[0]!)));
const i18nRoot = new URL("../src/i18n/", import.meta.url).pathname;

function digest(dictionary: Record<string, string>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(dictionary).sort(([a], [b]) => (a < b ? -1 : 1)))).digest("hex");
}

test("the split dictionaries carry exactly the pre-split keys and values", () => {
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
