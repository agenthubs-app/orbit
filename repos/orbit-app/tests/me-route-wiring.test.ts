import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("R18a my page route replaces the legacy screen while retaining focus/session scope", () => {
  const source = readFileSync("app/(app)/profile.tsx", "utf8");
  assert.match(source, /MyPageScreen/);
  assert.doesNotMatch(source, /screens\/profile\/ProfileScreen/);
  for (const guard of ["useIsFocused", "auth.cookieHeader", "isScopeCurrent", "completionNext"]) assert.ok(source.includes(guard));
});
test("R18a design profile variants cannot leak into production or unrelated destinations", async () => {
  const module = await import("../src/screens/me/account-api");
  assert.equal(module.accountProfilePath("50", false), "/api/profile");
  assert.equal(module.accountProfilePath("50", true), "/api/profile?design=50");
  assert.equal(module.accountProfilePath("99", true), "/api/profile");
  assert.equal(module.accountDestination("/profile/tags?kind=seeking", "/api/profile?design=50"), "/profile/tags?kind=seeking&design=50");
  assert.equal(module.accountDestination("/inbox", "/api/profile?design=50"), "/inbox");
});
