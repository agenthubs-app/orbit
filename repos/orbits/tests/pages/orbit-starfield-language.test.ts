import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveStarfieldCanonicalLanguage,
  resolveStarfieldLanguage,
  starfieldLocationHref,
  starfieldNavigationHref,
  starfieldPresentationLanguage,
} from "../../app/(app)/app/orbit-starfield-language";

test("starfield language resolution migrates legacy state behind the product preference", () => {
  assert.equal(resolveStarfieldLanguage("en", "zh", "zh", "zh"), "en");
  assert.equal(resolveStarfieldLanguage(null, "en", "zh", "zh"), "en");
  assert.equal(resolveStarfieldLanguage(null, null, "en", "zh"), "en");
  assert.equal(resolveStarfieldLanguage(null, null, null, "en"), "en");
  assert.equal(resolveStarfieldLanguage(null, null, null, null), "zh");
});

test("Japanese remains canonical while starfield copy uses its documented English fallback", () => {
  assert.equal(
    resolveStarfieldCanonicalLanguage("ja", "en", "zh", "zh", "zh"),
    "ja",
  );
  assert.equal(resolveStarfieldLanguage("ja", "zh", "zh", "zh"), "en");
  assert.equal(starfieldPresentationLanguage("ja"), "en");
});

test("query language has precedence over stale client and cookie preferences", () => {
  assert.equal(
    resolveStarfieldCanonicalLanguage("ja", "en", "zh", "en", "zh"),
    "ja",
  );
  assert.equal(
    resolveStarfieldCanonicalLanguage("invalid", "en", "zh", "zh"),
    "en",
  );
});

test("starfield navigation preserves canonical language, query values, and fragments", () => {
  assert.equal(
    starfieldNavigationHref("/app/events?tag=a&tag=b#upcoming", "ja"),
    "/app/events?tag=a&tag=b&lang=ja#upcoming",
  );
  assert.equal(
    starfieldNavigationHref(
      "/app/account/login?next=%2Fapp%2Fhome&lang=en#form",
      "ja",
    ),
    "/app/account/login?next=%2Fapp%2Fhome&lang=ja#form",
  );
  assert.equal(
    starfieldNavigationHref("/app/events?lang=ja#upcoming", "zh"),
    "/app/events#upcoming",
  );
  assert.equal(
    starfieldNavigationHref("https://example.com/?lang=en", "ja"),
    "https://example.com/?lang=en",
  );
});

test("language changes synchronize the current URL without losing duplicate query values or fragments", () => {
  assert.equal(
    starfieldLocationHref(
      "/app",
      "?tag=a&tag=b&lang=ja",
      "#relationship-map",
      "zh",
    ),
    "/app?tag=a&tag=b#relationship-map",
  );
  assert.equal(
    starfieldLocationHref(
      "/",
      "?tag=a&tag=b&lang=zh",
      "#relationship-map",
      "ja",
    ),
    "/?tag=a&tag=b&lang=ja#relationship-map",
  );
});

test("desktop and mobile starfields share the canonical language boundary", () => {
  for (const variant of ["desktop", "mobile"]) {
    const source = readFileSync(
      new URL(
        `../../app/(app)/app/orbit-starfield-${variant}-logic.ts`,
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(source, /initializeStarfieldLanguage\(host\)/u);
    assert.match(source, /persistStarfieldLanguage\(LANG\)/u);
    assert.match(
      source,
      /host\.setAttribute\('data-orbit-language',LANG\)/u,
    );
    assert.doesNotMatch(source, /localStorage\.setItem\('iorbit_lang'/u);
  }
});
