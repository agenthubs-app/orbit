import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrowserApiBaseUrl } from "../src/api/browser-api-origin";

test("browser API defaults to the page origin", () => {
  assert.deepEqual(
    resolveBrowserApiBaseUrl({ browserOrigin: "https://demo.orbit.test" }),
    { success: true, value: "https://demo.orbit.test" }
  );
});

test("browser API accepts an explicit same-origin override", () => {
  assert.deepEqual(
    resolveBrowserApiBaseUrl({
      browserOrigin: "https://demo.orbit.test",
      configuredBaseUrl: " https://demo.orbit.test/ "
    }),
    { success: true, value: "https://demo.orbit.test" }
  );
});

test("browser API rejects invalid or cross-origin production overrides", () => {
  for (const configuredBaseUrl of [
    "",
    "not-a-url",
    "http://localhost:3000",
    "https://api.orbit.test/path"
  ]) {
    const result = resolveBrowserApiBaseUrl({
      browserOrigin: "https://demo.orbit.test",
      configuredBaseUrl
    });

    assert.equal(result.success, false, configuredBaseUrl);
  }
});

test("browser API fails visibly when no browser origin is available", () => {
  const result = resolveBrowserApiBaseUrl({ browserOrigin: undefined });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /网站地址/u);
  }
});

test("the Web base URL module can load during static rendering without localhost fallback", async () => {
  const module = await import("../src/api/base-url.web");

  assert.equal(module.DEFAULT_ORBIT_API_BASE_URL, "");
});
