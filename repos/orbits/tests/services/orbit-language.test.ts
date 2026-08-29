import assert from "node:assert/strict";
import test from "node:test";

import {
  ORBIT_LANGUAGES,
  parseOrbitLanguage,
  resolveOrbitLanguage,
} from "../../shared/i18n/orbit-language";

test("orbit language contract exposes the supported languages", () => {
  assert.deepEqual(ORBIT_LANGUAGES, ["zh", "en", "ja"]);
});

test("request language wins over the stored account preference", () => {
  assert.equal(
    resolveOrbitLanguage({
      requestLanguage: "ja",
      preferredLanguage: "zh",
    }),
    "ja",
  );
});

test("invalid request language falls back to the stored preference", () => {
  assert.equal(
    resolveOrbitLanguage({
      requestLanguage: "xx",
      preferredLanguage: "en",
    }),
    "en",
  );
});

test("missing and invalid values use the explicit or product fallback", () => {
  assert.equal(resolveOrbitLanguage({}), "zh");
  assert.equal(resolveOrbitLanguage({ fallbackLanguage: "ja" }), "ja");
  assert.equal(parseOrbitLanguage("JA"), null);
  assert.equal(parseOrbitLanguage(null), null);
});
