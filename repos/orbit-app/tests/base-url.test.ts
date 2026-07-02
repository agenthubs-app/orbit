import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOrbitApiBaseUrl,
  validateOrbitApiBaseUrl
} from "../src/api/base-url";

test("normalizeOrbitApiBaseUrl trims whitespace and trailing slashes", () => {
  assert.equal(
    normalizeOrbitApiBaseUrl("  https://api.orbit.test/// "),
    "https://api.orbit.test"
  );
});

test("validateOrbitApiBaseUrl accepts HTTP localhost and HTTPS remote URLs", () => {
  assert.deepEqual(validateOrbitApiBaseUrl("http://localhost:3000"), {
    success: true,
    value: "http://localhost:3000"
  });
  assert.deepEqual(validateOrbitApiBaseUrl("https://api.orbit.test/"), {
    success: true,
    value: "https://api.orbit.test"
  });
});

test("validateOrbitApiBaseUrl rejects empty values and unsupported protocols", () => {
  assert.deepEqual(validateOrbitApiBaseUrl(" "), {
    error: "Enter a server address.",
    success: false
  });
  assert.deepEqual(validateOrbitApiBaseUrl("ftp://api.orbit.test"), {
    error: "Use an http:// or https:// server address.",
    success: false
  });
  assert.deepEqual(validateOrbitApiBaseUrl("not a url"), {
    error: "Enter a valid server address.",
    success: false
  });
});
