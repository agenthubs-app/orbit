import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;

// Route modules require Expo navigation/auth providers and cannot be rendered
// in the static component harness. This source assertion is limited to the
// route-to-screen wiring; behavior is covered by the rendered component tests.
test("native Today uses the task workspace while All Actions keeps the Agent Ledger", () => {
  const today = readFileSync(join(repoRoot, "app", "today.tsx"), "utf8");
  const allActions = readFileSync(
    join(repoRoot, "app", "contacts", "all-actions.tsx"),
    "utf8"
  );

  assert.match(today, /TodayScreen/u);
  assert.doesNotMatch(today, /TodayAgentLedgerScreen/u);
  assert.doesNotMatch(today, /ScheduleScreen/u);
  assert.match(allActions, /AllActionsAgentLedgerScreen/u);
  assert.doesNotMatch(allActions, /AgentActionsScreen/u);
});
