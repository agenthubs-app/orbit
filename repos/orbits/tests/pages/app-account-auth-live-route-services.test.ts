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
    assert.ok(!("session" in routeModel));
  }
});
