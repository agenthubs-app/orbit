import assert from "node:assert/strict";
import test from "node:test";
import { requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// LF9: the Task › プラン segment reads through page copies (summary and intakes shared with Home and the AI tab).
// Offline the saved answers are shown with 「截至」 instead of 「离线时无法查看」; online a copy saved within
// PLAN_COPY_FRESH_MS is used without a request.
const summary = { current: { goal: "LF9 シリーズA", goalKind: "launch", planId: "plan_lf9", score: { overflow: 0, remainingToFull: 60, segments: [], skipped: 0, talked: 0, todayDelta: 0, total: 40 } }, goals: [] };
const intakes = { activeGoalLimit: 2, activeGoals: 1, intakes: [], newGoalsLeftThisMonth: 9 };
const PLAN_READS = ["/api/agent/plans/v2/summary", "/api/agent/plans/intakes", "/api/agent/plans/v2/plan_lf9", "/api/agent/plans/legacy"];

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => { harness = await startOfflinePageHarness([{ name: "plan", importPath: "./src/screens/plan/PlanSegment", exportName: "PlanSegment" }]); });
test.after(async () => { await harness?.close(); });

test("offline: the saved summary is shown with 截至, not the blank offline card", async (t) => {
  const page = await harness.open(t, { screen: "plan", online: false, copies: {
    "home-plan-summary|main": { data: summary, syncedAt: "2026-10-20T01:00:00.000Z" },
    "plan-intakes|main": { data: intakes, syncedAt: "2026-10-20T01:00:00.000Z" },
  } });
  await page.getByText(/截至/u).first().waitFor({ timeout: 3000 });
  await page.getByText("LF9 シリーズA").first().waitFor({ timeout: 3000 });
  assert.equal(await page.getByText("离线时无法查看").count(), 0);
});

test("online: copies saved within the window are used without a request", async (t) => {
  const now = new Date().toISOString();
  const page = await harness.open(t, { screen: "plan", copies: {
    "home-plan-summary|main": { data: { current: null, goals: [] }, syncedAt: now },
    "plan-intakes|main": { data: intakes, syncedAt: now },
    "plan-legacy|main": { data: { plans: [] }, syncedAt: now },
  } });
  await page.waitForTimeout(800);
  const requests = await requestsOf(page);
  for (const path of PLAN_READS) assert.equal(requests.some((request) => request.includes(`:${path}`)), false, `${path} came from its fresh copy`);
});
