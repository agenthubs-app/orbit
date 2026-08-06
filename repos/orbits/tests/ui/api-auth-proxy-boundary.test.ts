import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxySource = readFileSync(
  new URL("../../proxy.ts", import.meta.url),
  "utf8",
);

test("API proxy defaults personal endpoints to authenticated access", () => {
  assert.match(proxySource, /request\.nextUrl\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(proxySource, /!request\.auth\?\.user\?\.id/);
  assert.match(proxySource, /code:\s*"UNAUTHORIZED"/);
  assert.match(proxySource, /status:\s*401/);
  assert.match(proxySource, /matcher:\s*\["\/app\/:path\*",\s*"\/api\/:path\*"\]/);
});

test("API proxy permits data-free CORS preflight before authenticating the real request", () => {
  assert.match(proxySource, /request\.method === "OPTIONS"/);
  assert.match(
    proxySource,
    /request\.nextUrl\.pathname\.startsWith\("\/api\/"\)/,
  );
  assert.match(proxySource, /status:\s*204/);
  assert.match(proxySource, /cache-control/);
});

test("API proxy public allowlist is narrow and explicit", () => {
  assert.match(proxySource, /pathname === "\/api\/health"/);
  assert.match(proxySource, /pathname\.startsWith\("\/api\/auth\/"\)/);
  assert.match(
    proxySource,
    /pathname\.startsWith\("\/api\/events\/public"\)/,
  );
  assert.match(proxySource, /integrations/);
  assert.doesNotMatch(proxySource, /pathname\.startsWith\("\/api\/chat/);
  assert.doesNotMatch(proxySource, /pathname\.startsWith\("\/api\/dashboard/);
  assert.doesNotMatch(proxySource, /pathname\.startsWith\("\/api\/permissions/);
});

test("registration preview allowlist regex matches exactly one anonymous path", () => {
  // 与 proxy.ts 保持同一字面量；这里表驱动验证它不放行任何邻近路径。
  const previewPattern = /^\/api\/events\/[^/]+\/registration\/preview$/u;
  assert.match(
    proxySource,
    /\^\\\/api\\\/events\\\/\[\^\/\]\+\\\/registration\\\/preview\$/,
  );
  const allowed = [
    "/api/events/event_signup_01/registration/preview",
    "/api/events/EVTSIGNUP03/registration/preview",
  ];
  const denied = [
    "/api/events/event_signup_01/registration",
    "/api/events/event_signup_01/registration/preview/",
    "/api/events/event_signup_01/registration/preview/extra",
    "/api/events/a/b/registration/preview",
    "/api/events//registration/preview",
    "/api/eventsX/event_signup_01/registration/preview",
  ];
  for (const path of allowed) {
    assert.equal(previewPattern.test(path), true, `expected allow: ${path}`);
  }
  for (const path of denied) {
    assert.equal(previewPattern.test(path), false, `expected deny: ${path}`);
  }
});
