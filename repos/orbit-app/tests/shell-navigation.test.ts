import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isTabPageHref, openMainTab, poppableLevels, resetStackTo, TAB_PAGE_PATHS, trackRootNavigationState } from "../src/components/shell-navigation";
import { MAIN_TAB_PATHS } from "../src/view-models/app-navigation";

// R05 review M1: a tab page always ends up alone at the bottom of the stack.
const root = new URL("..", import.meta.url).pathname;
const stack = (...routes: { state?: unknown }[]) => ({ type: "stack", index: routes.length - 1, routes });

test("counts the stacks on the focused path that still have pages to pop", () => {
  assert.equal(poppableLevels(undefined), 0);
  assert.equal(poppableLevels(stack({})), 0, "one tab page alone");
  assert.equal(poppableLevels(stack({}, {})), 1, "home with Task pushed on top");
  assert.equal(poppableLevels(stack({ state: stack({}, {}) })), 1, "(app) group with a detail page");
  assert.equal(poppableLevels(stack({}, { state: stack({}, {}) })), 2, "a tab page, then the (app) group with two pages");
});

test("opening a tab page pops every level first, then replaces", () => {
  const calls: string[] = [];
  const router = { dismissAll: () => calls.push("dismissAll"), replace: (href: never) => calls.push("replace " + String(href)) };
  trackRootNavigationState(stack({}, { state: stack({}, {}) }));
  openMainTab(router, "/home");
  assert.deepEqual(calls, ["dismissAll", "dismissAll", "replace /home"]);
  calls.length = 0;
  trackRootNavigationState(stack({}));
  openMainTab(router, "/task?seg=todo");
  assert.deepEqual(calls, ["replace /task?seg=todo"]);
  trackRootNavigationState(undefined);
});

test("the shell's tab-page list is the navigation model's", () => {
  assert.deepEqual([...TAB_PAGE_PATHS].sort(), Object.values(MAIN_TAB_PATHS).sort());
  assert.equal(isTabPageHref("/task?seg=todo"), true);
  assert.equal(isTabPageHref("/tasks/1"), false);
});

test("every way into a tab page goes through openMainTab", () => {
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  assert.match(read("src/components/OrbitTabBar.tsx"), /openMainTab\(router, MAIN_TAB_PATHS\[tab\.id\]\)/u, "tab bar");
  assert.match(read("app/_layout.tsx"), /trackRootNavigationState\(useRootNavigationState\(\)\)/u, "the root layout mirrors the root state, signed in or out");
  assert.match(read("src/screens/home/HomeDashboardScreen.tsx"), /if \(isTabPageHref\(href\)\) openMainTab\(router, href\)/u, "home shortcuts");
  assert.match(read("src/components/OrbitNotificationsCoordinator.tsx"), /openMainTab\(router, href\)/u, "notifications");
  assert.match(read("src/components/LegacyTaskRedirect.tsx"), /openMainTab\(router, target\)/u, "old Task addresses pushed by old screens");
  assert.match(read("app/followups.tsx"), /withOrbitPrivateRoute\(LegacyTaskRedirect\)/u, "/followups");
});

// O2: an auth change (sign-in, sign-up, onboarding done, sign-out, session ended) leaves the new
// root page alone in the stack: no back to login, to pre-sign-in pages or to the previous account's pages.
test("resetStackTo pops every level, then replaces, so the target is the only page", () => {
  const calls: string[] = [];
  const router = { dismissAll: () => calls.push("dismissAll"), replace: (href: never) => calls.push("replace " + String(href)) };
  // Signed in as A: home, a note detail, then settings — then sign out.
  trackRootNavigationState(stack({}, {}, { state: stack({}, {}) }));
  resetStackTo(router, "/account/login");
  assert.deepEqual(calls, ["dismissAll", "dismissAll", "replace /account/login"]);
  trackRootNavigationState(undefined);
});

test("every auth change resets the stack instead of replacing one page", () => {
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  const auth = read("src/screens/profile/AccountAuthScreen.tsx");
  assert.equal((auth.match(/resetStackTo\(router, /gu) ?? []).length, 3, "password sign-in, sign-up, Google");
  assert.doesNotMatch(auth, /router\.replace\([^)]*nextHrefForAccountAuthSubmit\(\{\s*mode(?!: "forgot")/u, "no plain replace after signing in");
  const provider = read("src/api/AuthSessionProvider.tsx");
  assert.equal((provider.match(/resetStackTo\(router, "\/account\/login"\)/gu) ?? []).length, 2, "session rejected; offline window over");
  assert.doesNotMatch(provider, /router\.replace\("\/account\/login"/u);
  for (const file of ["src/screens/me/AccountSettingsScreen.tsx", "src/screens/profile/AccountScreen.tsx", "src/screens/account-rights/PendingScreen.tsx"]) {
    assert.match(read(file), /resetStackTo\(router, "\/account\/login"\)/u, file + " signs out to login as the only page");
  }
  const onboarding = read("src/screens/profile/onboarding/ProfileOnboardingScreen.tsx");
  assert.match(onboarding, /if \(isTabPageHref\(href\)\) openMainTab\(router, href\);/u, "onboarding done: Home is the only page");
  assert.doesNotMatch(onboarding, /\.replace\(destination/u);
  assert.match(read("src/screens/public/WelcomeScreen.tsx"), /openMainTab\(router, "\/home"\)/u, "Google from the welcome page");
});
