import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isTabPageHref, openMainTab, poppableLevels, TAB_PAGE_PATHS, trackRootNavigationState } from "../src/components/shell-navigation";
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
  assert.match(read("src/components/OrbitTabBar.tsx"), /trackRootNavigationState\(useRootNavigationState\(\)\)/u, "the shell mirrors the root state");
  assert.match(read("src/screens/home/HomeDashboardScreen.tsx"), /if \(isTabPageHref\(href\)\) openMainTab\(router, href\)/u, "home shortcuts");
  assert.match(read("src/components/OrbitNotificationsCoordinator.tsx"), /openMainTab\(router, href\)/u, "notifications");
  assert.match(read("src/components/LegacyTaskRedirect.tsx"), /openMainTab\(router, target\)/u, "old Task addresses pushed by old screens");
  assert.match(read("src/screens/followups/FollowupsScreen.tsx"), /<LegacyTaskRedirect \/>/u, "/followups");
});
