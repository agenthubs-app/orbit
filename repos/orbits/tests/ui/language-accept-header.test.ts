import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  negotiateOrbitLanguage,
  normalizeOrbitLanguage,
  resolveRequestOrbitLanguage,
  withOrbitLanguageHref,
} from "../../app/(app)/app/orbit-language-core";

// R03 contract E / RD-11 (SC-R03-05): with no ?lang and no cookie the Web follows
// the browser's Accept-Language among zh / ja / en and falls back to Japanese.
// A stored cookie (the user's own choice) always wins. Japanese is the default
// language, so it is the one that needs no ?lang in a URL.
// These tests check the product default, so they clear the legacy test seam.
delete process.env.ORBIT_LEGACY_TEST_LANGUAGE;
test("Accept-Language picks the best supported language by q-value, else Japanese", () => {
  assert.equal(negotiateOrbitLanguage("fr-FR,fr;q=0.9"), "ja");
  assert.equal(negotiateOrbitLanguage(""), "ja");
  assert.equal(negotiateOrbitLanguage(null), "ja");
  assert.equal(negotiateOrbitLanguage("fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"), "en");
  assert.equal(negotiateOrbitLanguage("zh-CN,zh;q=0.9,ja;q=0.8"), "zh");
  assert.equal(negotiateOrbitLanguage("en;q=0.5,ja;q=0.9"), "ja");
  assert.equal(negotiateOrbitLanguage("zh-TW"), "zh");
  assert.equal(negotiateOrbitLanguage("*"), "ja");
  assert.equal(negotiateOrbitLanguage("en;q=0"), "ja");
});

test("request language: ?lang header, then the user's cookie, then Accept-Language", () => {
  assert.equal(resolveRequestOrbitLanguage({ header: "en", cookie: "zh", acceptLanguage: "ja" }), "en");
  assert.equal(resolveRequestOrbitLanguage({ header: null, cookie: "zh", acceptLanguage: "fr" }), "zh");
  assert.equal(resolveRequestOrbitLanguage({ header: null, cookie: undefined, acceptLanguage: "fr" }), "ja");
  assert.equal(resolveRequestOrbitLanguage({ header: null, cookie: "bogus", acceptLanguage: "en-GB" }), "en");
  assert.equal(normalizeOrbitLanguage(undefined), "ja");
});

test("a production build ignores the legacy test seam", () => {
  const env = process.env as Record<string, string | undefined>;
  const [nodeEnv, seam] = [env.NODE_ENV, env.ORBIT_LEGACY_TEST_LANGUAGE];
  env.NODE_ENV = "production";
  env.ORBIT_LEGACY_TEST_LANGUAGE = "zh";
  assert.equal(normalizeOrbitLanguage(undefined), "ja");
  env.NODE_ENV = nodeEnv;
  if (seam === undefined) delete env.ORBIT_LEGACY_TEST_LANGUAGE; else env.ORBIT_LEGACY_TEST_LANGUAGE = seam;
});

test("Japanese URLs carry no ?lang; zh and en carry it", () => {
  assert.equal(withOrbitLanguageHref("/app/home?lang=en", "ja"), "/app/home");
  assert.equal(withOrbitLanguageHref("/app/home", "zh"), "/app/home?lang=zh");
  assert.equal(withOrbitLanguageHref("/app/home#x", "en"), "/app/home?lang=en#x");
});

test("server components and both layouts resolve the language the same way (no first-paint flash)", () => {
  for (const file of ["app/layout.tsx", "app/(app)/app/layout.tsx", "app/page.tsx", "app/(app)/app/orbit-language-server.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /resolveRequestOrbitLanguage\(/, `${file} must use resolveRequestOrbitLanguage`);
    assert.match(source, /accept-language/, `${file} must pass Accept-Language`);
  }
});
