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
  // UX 2026-10-26 (Task tab copy: plain labels for the schedule links, the to-do detail and the calendar "+N") updated more original values in all three.
  // UX 2026-10-26 (onboarding: plain industry labels, a date picker for the birthday, no forced break in the zh step 5 title) updated more.
  // QA-A 2026-10-26 (iOrbit record cards: plain "saved" footnotes instead of "written and read back") updated more.
  // QA-D 2026-10-26 (ja start guide / onboarding leads, export, resume and suggestion copy; plain completion hint) updated more.
  en: { keys: 2253, sha256: "86aa7e591a864ee70be4dde8a6c2056bcf9bde5ab2533129c7033affa1d956ff" },
  // 36 original ja values were updated by later copy work; the key set is still R03's.
  ja: { keys: 2253, sha256: "63c67b82365444f28d62cf911b2b2c5ee6a031452d4987fa2da93604f4e5b864" },
  zh: { keys: 2253, sha256: "cadac1d9d2a8b81b0073fac1d6582d34e7731201afc2b5b7b2ba101527a96665" },
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
