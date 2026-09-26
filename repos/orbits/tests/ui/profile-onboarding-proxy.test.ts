import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { transformSync } from "esbuild";
import { NextRequest } from "next/server";

import {
  isProfileOnboardingNavigationExemptPath,
  profileOnboardingRedirectPath,
  shouldGateProfileOnboardingRequest,
} from "../../app/(app)/app/profile/profile-onboarding-route-policy";

const proxyPath = new URL("../../proxy.ts", import.meta.url);
const requireFromProxy = createRequire(proxyPath);
const onboardingAccessRequest =
  "./app/(app)/app/profile/profile-onboarding-access.server";

type AccessStatus = "complete" | "incomplete" | "unavailable" | "throw";

function loadProxy(
  status?: AccessStatus,
  options: { throwOnHelperLoad?: boolean } = {},
) {
  const compiled = transformSync(readFileSync(proxyPath, "utf8"), {
    loader: "ts",
    format: "cjs",
    supported: { "dynamic-import": false },
  });
  let accessCalls = 0;
  let helperLoads = 0;
  const proxyModule = {
    exports: {} as {
      proxy: (request: NextRequest & { auth: unknown }) =>
        | Response
        | Promise<Response>;
    },
  };
  new Function("require", "module", "exports", compiled.code)(
    (name: string) => {
      if (name === "./auth") {
        return { auth: (callback: unknown) => callback };
      }
      if (status !== undefined && name === onboardingAccessRequest) {
        helperLoads += 1;
        return {
          readProfileOnboardingAccess: async () => {
            accessCalls += 1;
            if (status === "throw") {
              throw new Error("onboarding access failure");
            }
            return { status };
          },
        };
      }
      if (options.throwOnHelperLoad && name === onboardingAccessRequest) {
        helperLoads += 1;
        throw new Error("onboarding access module load failure");
      }
      return requireFromProxy(name);
    },
    proxyModule,
    proxyModule.exports,
  );
  return {
    accessCalls: () => accessCalls,
    helperLoads: () => helperLoads,
    proxy: proxyModule.exports.proxy,
  };
}

function request(
  path: string,
  options: { auth?: unknown; method?: string; headers?: Record<string, string> } = {},
) {
  const nextRequest = new NextRequest(`https://test${path}`, {
    method: options.method,
    headers: options.headers,
  }) as NextRequest & { auth: unknown };
  nextRequest.auth = options.auth === undefined
    ? {
        user: {
          id: "profile:proxy-user",
          email: "proxy@example.test",
          name: "Proxy User",
        },
      }
    : options.auth;
  return nextRequest;
}

test("route policy gates only authenticated app GET/HEAD paths and keeps exact exemptions", () => {
  assert.equal(
    shouldGateProfileOnboardingRequest({
      authenticated: true,
      method: "GET",
      pathname: "/app/home",
    }),
    true,
  );
  assert.equal(
    shouldGateProfileOnboardingRequest({
      authenticated: true,
      method: "HEAD",
      pathname: "/app/events/one/register",
    }),
    true,
  );

  for (const input of [
    { authenticated: false, method: "GET", pathname: "/app/home" },
    { authenticated: true, method: "POST", pathname: "/app/home" },
    { authenticated: true, method: "GET", pathname: "/api/profile" },
    { authenticated: true, method: "GET", pathname: "/_next/static/chunk.js" },
    { authenticated: true, method: "GET", pathname: "/app/profile" },
    { authenticated: true, method: "GET", pathname: "/app/profile/continue" },
    { authenticated: true, method: "GET", pathname: "/app/account/login" },
    { authenticated: true, method: "GET", pathname: "/app/admin/access" },
    { authenticated: true, method: "GET", pathname: "/app/login-admin" },
  ]) {
    assert.equal(shouldGateProfileOnboardingRequest(input), false, JSON.stringify(input));
  }

  assert.equal(
    shouldGateProfileOnboardingRequest({
      authenticated: true,
      method: "GET",
      pathname: "/app/profile/other",
    }),
    true,
  );
  assert.equal(
    shouldGateProfileOnboardingRequest({
      authenticated: true,
      method: "GET",
      pathname: "/app/accountX",
    }),
    true,
  );
  assert.equal(isProfileOnboardingNavigationExemptPath("/app/account/forgot-password"), true);
  assert.equal(isProfileOnboardingNavigationExemptPath("/app/accountX"), false);
  // 新用户引导本身必须豁免，否则门禁会把未完成的用户无限重定向回自己。
  assert.equal(isProfileOnboardingNavigationExemptPath("/app/profile/onboarding"), true);
  assert.equal(isProfileOnboardingNavigationExemptPath("/app/profile/onboardingX"), false);
});

test("gate next preserves business query while removing RSC transport", () => {
  assert.equal(
    profileOnboardingRedirectPath({
      pathname: "/app/events/one/register",
      search: "?lang=ja&tab=one&_rsc=transport&tab=two",
    }),
    "/app/profile/onboarding?next=%2Fapp%2Fevents%2Fone%2Fregister%3Flang%3Dja%26tab%3Done%26tab%3Dtwo",
  );
});

test("signed-in incomplete GET redirects through the real proxy callback", async () => {
  const { proxy, accessCalls } = loadProxy("incomplete");
  const response = await proxy(request("/app/home?from=proxy"));
  assert.equal(response.status, 307);
  assert.equal(accessCalls(), 1);
  assert.equal(
    response.headers.get("location"),
    "https://test/app/profile/onboarding?next=%2Fapp%2Fhome%3Ffrom%3Dproxy",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("HEAD follows the gate while POST/API/asset requests do not load onboarding access", async () => {
  const { proxy, accessCalls, helperLoads } = loadProxy("incomplete");
  const head = await proxy(request("/app/home?from=head", { method: "HEAD" }));
  assert.equal(head.status, 307);

  const post = await proxy(request("/app/home", { method: "POST" }));
  const api = await proxy(request("/api/profile"));
  const asset = await proxy(request("/favicon.ico"));
  assert.equal(post.headers.get("x-middleware-next"), "1");
  assert.equal(api.headers.get("x-middleware-next"), "1");
  assert.equal(asset.headers.get("x-middleware-next"), "1");
  assert.equal(accessCalls(), 1);
  assert.equal(helperLoads(), 1);
});

test("RSC and prefetch headers do not bypass the authenticated page gate", async () => {
  const { proxy, helperLoads, accessCalls } = loadProxy("incomplete");
  const response = await proxy(
    request("/app/events?from=prefetch", {
      headers: { rsc: "1", "next-router-prefetch": "1" },
    }),
  );
  assert.equal(response.status, 307);
  assert.equal(helperLoads(), 1);
  assert.equal(accessCalls(), 1);
});

test("unavailable, helper errors, and dynamic module-load errors fail closed", async () => {
  for (const status of ["unavailable", "throw"] as const) {
    const { proxy, helperLoads, accessCalls } = loadProxy(status);
    const response = await proxy(request("/app/home"));
    assert.equal(response.status, 307, status);
    assert.equal(helperLoads(), 1, status);
    assert.equal(accessCalls(), 1, status);
  }

  const loadedFailure = loadProxy(undefined, { throwOnHelperLoad: true });
  const response = await loadedFailure.proxy(request("/app/home"));
  assert.equal(response.status, 307);
  assert.equal(loadedFailure.helperLoads(), 1);
  assert.equal(loadedFailure.accessCalls(), 0);
});

test("exempt and anonymous public paths keep the callback without loading the gate", async () => {
  const { proxy, helperLoads, accessCalls } = loadProxy("incomplete");
  for (const path of [
    "/app/profile",
    "/app/profile/continue",
    "/app/account/login",
    "/app/admin/access",
    "/app/login-admin",
  ]) {
    const response = await proxy(request(path));
    assert.equal(response.status, 200, path);
  }
  const anonymousPublic = await proxy(request("/app", { auth: null }));
  assert.equal(anonymousPublic.status, 200);
  assert.equal(helperLoads(), 0);
  assert.equal(accessCalls(), 0);
});

test("complete profiles pass and preserve language cookie behavior", async () => {
  const { proxy, accessCalls } = loadProxy("complete");
  const response = await proxy(
    request("/app/home?lang=ja&tab=one", { headers: { "accept-language": "ja" } }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(accessCalls(), 1);
  assert.match(response.headers.get("set-cookie") ?? "", /orbit-lang=ja/);
});

test("missing sessions keep existing private-page login behavior without onboarding access", async () => {
  const { proxy, accessCalls } = loadProxy("incomplete");
  const response = await proxy(
    request("/app/home?from=anonymous", { auth: null }),
  );
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/app\/account\/login/);
  assert.equal(accessCalls(), 0);
});
