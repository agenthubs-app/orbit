import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
    error: "请输入服务器地址。",
    success: false
  });
  assert.deepEqual(validateOrbitApiBaseUrl("ftp://api.orbit.test"), {
    error: "请使用 http:// 或 https:// 开头的服务器地址。",
    success: false
  });
  assert.deepEqual(validateOrbitApiBaseUrl("not a url"), {
    error: "请输入有效的服务器地址。",
    success: false
  });
});

// The default is fixed when the module loads, so each build flavour is read in a fresh process.
function defaultBaseUrlFor(dev: boolean | undefined, configured?: string): string {
  const env = { ...process.env };
  delete env.EXPO_PUBLIC_ORBIT_API_BASE_URL;
  if (configured !== undefined) env.EXPO_PUBLIC_ORBIT_API_BASE_URL = configured;
  const moduleUrl = new URL("../src/api/base-url.ts", import.meta.url).href;
  const setDev = dev === undefined ? "" : `globalThis.__DEV__ = ${dev};`;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `${setDev} const m = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(m.DEFAULT_ORBIT_API_BASE_URL ?? m.default.DEFAULT_ORBIT_API_BASE_URL);`],
  { encoding: "utf8", env }).trim();
}

test("release builds default to the production server; development builds and tests keep localhost", () => {
  assert.equal(defaultBaseUrlFor(false), "https://orbitailink.com");
  assert.equal(defaultBaseUrlFor(true), "http://localhost:3000");
  assert.equal(defaultBaseUrlFor(undefined), "http://localhost:3000");
  assert.equal(defaultBaseUrlFor(false, "https://staging.orbit.test"), "https://staging.orbit.test");
});
