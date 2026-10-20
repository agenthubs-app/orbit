import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;

// Route modules require Expo navigation/auth providers and cannot be rendered
// in the static component harness. This source assertion is limited to the
// route-to-screen wiring; behavior is covered by the rendered component tests.
test("native Today and the legacy All Actions entry use Task redirects", () => {
  const today = readFileSync(join(repoRoot, "app", "today.tsx"), "utf8");
  const allActions = readFileSync(
    join(repoRoot, "app", "contacts", "all-actions.tsx"),
    "utf8"
  );

  // R20a: /today opens the Task page's To-do segment; the old TodayScreen is retired.
  assert.match(today, /LegacyTaskRedirect/u);
  assert.doesNotMatch(today, /TodayAgentLedgerScreen/u);
  assert.doesNotMatch(today, /ScheduleScreen/u);
  assert.match(allActions, /LegacyTaskRedirect/u);
  assert.doesNotMatch(allActions, /AllActionsAgentLedgerScreen/u);
  assert.doesNotMatch(allActions, /AgentActionsScreen/u);
});

test("agent actions compatibility route preserves private access through the Task redirect", () => {
  const route = readFileSync(
    join(repoRoot, "app", "agent", "actions.tsx"),
    "utf8"
  );

  assert.match(route, /LegacyTaskRedirect/u);
  assert.doesNotMatch(route, /AllActionsAgentLedgerScreen/u);
  assert.match(route, /withOrbitPrivateRoute/u);
  assert.doesNotMatch(route, /AgentActionsScreen/u);
});

test("profile continuation route checks the server flow before its private redirect", () => {
  const route = readFileSync(
    join(repoRoot, "app", "profile", "continue.tsx"),
    "utf8"
  );

  assert.match(route, /profileContinuationHref/u);
  assert.match(route, /useLocalSearchParams/u);
  assert.match(route, /Redirect/u);
  assert.match(route, /withOrbitPrivateRoute/u);
  assert.match(route, /readOnboardingProfile/u);
  assert.match(route, /readProfileOnboardingProgress/u);
  assert.doesNotMatch(route, /ProfileScreen|AgentActionsScreen/u);
});
