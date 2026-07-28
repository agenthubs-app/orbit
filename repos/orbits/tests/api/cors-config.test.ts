import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

interface NextHeaderRule {
  source: string;
  headers: Array<{
    key: string;
    value: string;
  }>;
}

interface OrbitNextConfig {
  headers?: () => Promise<NextHeaderRule[]>;
}

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js") as OrbitNextConfig;

test("API routes expose CORS headers for Expo web clients", async () => {
  assert.equal(typeof nextConfig.headers, "function");

  const headerRules = await nextConfig.headers();
  const apiRule = headerRules.find((rule) => rule.source === "/api/:path*");

  assert.ok(apiRule);

  const headerMap = new Map(
    apiRule.headers.map((header) => [header.key, header.value]),
  );

  assert.equal(headerMap.get("Access-Control-Allow-Origin"), "*");
  assert.match(
    headerMap.get("Access-Control-Allow-Methods") ?? "",
    /\bOPTIONS\b/,
  );
  assert.match(headerMap.get("Access-Control-Allow-Methods") ?? "", /\bGET\b/);
  assert.match(
    headerMap.get("Access-Control-Allow-Methods") ?? "",
    /\bPOST\b/,
  );
  assert.match(
    headerMap.get("Access-Control-Allow-Headers") ?? "",
    /\bContent-Type\b/,
  );
  assert.equal(headerMap.has("Access-Control-Allow-Credentials"), false);
});

test("API routes enable browser credentials only for an explicit Expo origin", async () => {
  const previousOrigin = process.env.ORBIT_API_CORS_ORIGIN;
  process.env.ORBIT_API_CORS_ORIGIN = "http://localhost:8081";
  delete require.cache[require.resolve("../../next.config.js")];

  try {
    const credentialedConfig = require("../../next.config.js") as OrbitNextConfig;
    const headerRules = await credentialedConfig.headers?.();
    const apiRule = headerRules?.find((rule) => rule.source === "/api/:path*");
    const headerMap = new Map(
      apiRule?.headers.map((header) => [header.key, header.value]) ?? [],
    );

    assert.equal(
      headerMap.get("Access-Control-Allow-Origin"),
      "http://localhost:8081",
    );
    assert.equal(headerMap.get("Access-Control-Allow-Credentials"), "true");
  } finally {
    if (previousOrigin === undefined) {
      delete process.env.ORBIT_API_CORS_ORIGIN;
    } else {
      process.env.ORBIT_API_CORS_ORIGIN = previousOrigin;
    }
    delete require.cache[require.resolve("../../next.config.js")];
  }
});
