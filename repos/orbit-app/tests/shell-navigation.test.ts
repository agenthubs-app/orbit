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
  // Password sign-in has two: pending deletion, and the landing after the mustChangePassword check.
  assert.equal((auth.match(/resetStackTo\(router, /gu) ?? []).length, 4, "password sign-in (×2), sign-up, Google");
  assert.equal((read("src/screens/profile/ChangePasswordScreen.tsx").match(/resetStackTo\(router, /gu) ?? []).length, 2, "after the change (signed in again or back to login); skip");
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

test("a tap opens a tab page at once; a swipe slides it in from its side; other pages keep their slide", async () => {
  const { isTabPageRoute, rootStackScreenOptions, swipeToMainTab } = await import("../src/components/shell-navigation");
  assert.equal(isTabPageRoute({ name: "home" }), true);
  assert.equal(isTabPageRoute({ name: "task", params: { seg: "todo" } }), true);
  assert.equal(isTabPageRoute({ name: "(app)", params: { screen: "contacts" } }), true);
  assert.equal(isTabPageRoute({ name: "(app)", params: { screen: "events", params: {} } }), true);
  assert.equal(isTabPageRoute({ name: "(app)", params: { screen: "ai" } }), false, "iOrbit opens as a pushed page");
  assert.equal(isTabPageRoute({ name: "contacts/[id]", params: { id: "1" } }), false);
  assert.deepEqual(rootStackScreenOptions({ key: "settings-1", name: "settings" }), {});
  assert.deepEqual(rootStackScreenOptions({ key: "home-1", name: "home" }), { animation: "none" }, "tapped");

  const router = { dismissAll: () => undefined, replace: (_href: never) => undefined };
  trackRootNavigationState(stack({}));
  swipeToMainTab(router, "/home", "next");
  assert.deepEqual(rootStackScreenOptions({ key: "home-1", name: "home" }), { animation: "none" }, "a page already shown keeps its options");
  assert.deepEqual(rootStackScreenOptions({ key: "contacts-1", name: "(app)", params: { screen: "contacts" } }), { animation: "default" }, "next slides in from the right");
  assert.deepEqual(rootStackScreenOptions({ key: "contacts-1", name: "(app)", params: { screen: "contacts" } }), { animation: "default" }, "kept for that page");
  swipeToMainTab(router, "/contacts", "prev");
  assert.deepEqual(rootStackScreenOptions({ key: "home-2", name: "home" }), { animation: "slide_from_left" });
  assert.deepEqual(rootStackScreenOptions({ key: "events-1", name: "(app)", params: { screen: "events" } }), { animation: "none" }, "the swipe is used once");
});

test("swipes move along the bar order and stop at its ends", async () => {
  const { adjacentTabPath, swipeDirection, swipeToMainTab } = await import("../src/components/shell-navigation");
  assert.equal(adjacentTabPath("/home", "next"), "/contacts");
  assert.equal(adjacentTabPath("/contacts", "next"), "/events", "iOrbit is not a tab page");
  assert.equal(adjacentTabPath("/events?tab=going", "prev"), "/contacts");
  assert.equal(adjacentTabPath("/task", "prev"), "/events");
  assert.equal(adjacentTabPath("/home", "prev"), null);
  assert.equal(adjacentTabPath("/task", "next"), null);
  const calls: string[] = [];
  trackRootNavigationState(stack({}));
  swipeToMainTab({ replace: (href: never) => calls.push(String(href)) }, "/task", "next");
  assert.deepEqual(calls, [], "nothing past the last tab");
  assert.equal(swipeDirection(-80, 0), "next");
  assert.equal(swipeDirection(-20, -900), "next", "a quick flick");
  assert.equal(swipeDirection(70, 0), "prev");
  assert.equal(swipeDirection(30, 100), null, "too short and slow");
  assert.equal(swipeDirection(20, -900), null, "flick against the drag");
});
