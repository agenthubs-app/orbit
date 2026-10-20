import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveInitialRouteHref } from "../src/view-models/initial-route";
import { isPrivateMobileRoute, mobileLoginHref } from "../src/view-models/mobile-route-access";
import { normalizedNext } from "../src/view-models/account-auth";

test("home is private and login returns to the same route", () => {
  const href = resolveInitialRouteHref("/app/home");
  assert.equal(href, "/home");
  assert.equal(isPrivateMobileRoute(href), true);
  const next = new URL(mobileLoginHref(href, {}), "https://orbit.invalid").searchParams.get("next")!;
  assert.equal(normalizedNext(next), "/home");
});

test("legacy dashboard keeps its private boundary and redirects to HomeWidgetsScreen", () => {
  const source = readFileSync(new URL("../app/dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /withOrbitPrivateRoute\(DashboardRedirect\)/u);
  assert.match(source, /<Redirect href="\/home" \/>/u);
  assert.doesNotMatch(source, /DashboardScreen/u);
});
