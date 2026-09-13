import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialRouteHref } from "../src/view-models/initial-route";
import { isPrivateMobileRoute, mobileLoginHref } from "../src/view-models/mobile-route-access";
import { normalizedNext } from "../src/view-models/account-auth";

// The actual route is mounted and exercised in home-dashboard-interactions.
// Here check its startup/login contract rather than an obsolete source string.
test("home is a private dashboard and login returns to the same route", () => {
  const href = resolveInitialRouteHref("/app/home");
  assert.equal(href, "/home");
  assert.equal(isPrivateMobileRoute(href), true);
  const next = new URL(mobileLoginHref(href, {}), "https://orbit.invalid").searchParams.get("next")!;
  assert.equal(normalizedNext(next), "/home");
});
