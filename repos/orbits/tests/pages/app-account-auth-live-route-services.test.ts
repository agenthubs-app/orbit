import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/account auth pages use the real NextAuth session as their entry guard", () => {
  const pageSources = [
    source("app/(app)/app/account/login/page.tsx"),
    source("app/(app)/app/account/signup/page.tsx"),
    source("app/(app)/app/account/forgot-password/page.tsx"),
  ];

  for (const pageSource of pageSources) {
    assert.match(pageSource, /const session = await auth\(\)/);
    assert.match(pageSource, /session\?\.user\?\.id/);
    assert.match(pageSource, /redirect\(normalizeOrbitAuthReturnPath/);
    assert.match(pageSource, /loadAppAccountAuthRouteViewModel/);
    assert.match(pageSource, /OrbitRealAccountAuth/);
  }
});

test("app account auth loader returns form copy without consulting mock account sessions", async () => {
  const loaderSource = source(
    "app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model.ts",
  );
  assert.doesNotMatch(loaderSource, /createAccountSessionService/);
  assert.doesNotMatch(loaderSource, /AccountSessionPayload/);

  const { loadAppAccountAuthRouteViewModel } = await import(
    "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
  );
  const routeModel = await loadAppAccountAuthRouteViewModel({
    authMode: "signup",
    mode: "live",
    searchParams: { scenario: "signed-out" },
  });

  assert.equal(routeModel.state, "success");
  if (routeModel.state === "success") {
    assert.equal(routeModel.auth.mode, "signup");
    assert.equal(routeModel.auth.title, "创建你的 Orbit 账号");
    assert.equal(routeModel.auth.defaultNext, "/app/home");
    assert.ok(!("session" in routeModel));
  }
});

test("account auth loader preserves one canonical safe return path across login signup and recovery", async () => {
  const { loadAppAccountAuthRouteViewModel } = await import(
    "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
  );

  for (const authMode of ["login", "signup", "forgot"] as const) {
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode,
      searchParams: { next: "/app/agent?q=follow-up" },
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.defaultNext, "/app/agent?q=follow-up");
    }
  }

  for (const unsafeNext of [
    "/home",
    "/app/account/login",
    "https://evil.example/steal",
  ]) {
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode: "login",
      searchParams: { next: unsafeNext },
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.defaultNext, "/app/home");
    }
  }
});

test("client account auth normalizes the hydrated next query with the shared auth boundary", () => {
  const accountAuthSource = source(
    "app/(app)/app/account/orbit-real-account-auth.tsx",
  );

  assert.match(
    accountAuthSource,
    /normalizeOrbitAuthReturnPath\(rawNext,\s*defaultNext\)/,
  );
  assert.doesNotMatch(
    accountAuthSource,
    /rawNext\.startsWith\("\/"\)\s*\?\s*rawNext/,
  );
});

test("forgot password submits a recovery request and announces acceptance separately from delivery", () => {
  const accountAuthSource = source(
    "app/(app)/app/account/orbit-real-account-auth.tsx",
  );

  assert.match(
    accountAuthSource,
    /\/api\/auth\/password-reset\/request/,
  );
  assert.match(accountAuthSource, /Request accepted\./);
  assert.match(accountAuthSource, /role="status"/);
  assert.match(accountAuthSource, /role="alert"/);
  assert.doesNotMatch(accountAuthSource, /setForgotStep/);
  assert.doesNotMatch(accountAuthSource, /orbit-auth-code/);
  assert.doesNotMatch(accountAuthSource, /orbit-auth-new-password/);
});
