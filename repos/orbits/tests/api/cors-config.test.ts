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
});
