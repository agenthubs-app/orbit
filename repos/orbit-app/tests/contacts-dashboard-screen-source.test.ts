import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactsDashboardScreen.tsx"),
  "utf8"
);

test("contacts dashboard screen can safely recompute opportunity reminders through the web API", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /dashboardOpportunitiesRecomputePath/u);
  assert.match(screenSource, /dashboardOpportunitiesRecomputeToView/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*dashboardOpportunitiesRecomputePath\(\)/u);
  assert.match(screenSource, /recomputeContactDashboardOpportunities/u);
  assert.match(screenSource, /opportunitiesState\.refresh\(\)/u);
  assert.match(screenSource, /"重新计算机会"/u);
  assert.doesNotMatch(screenSource, /发送通知|写入任务|创建任务/u);
});

test("contacts dashboard screen can edit the relationship goal through the profile API", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.profile/u);
  assert.match(screenSource, /profileToSummary/u);
  assert.match(screenSource, /profileSummaryToEditDraft/u);
  assert.match(screenSource, /buildProfileUpdateRequest/u);
  assert.match(screenSource, /relationshipGoalDraft/u);
  assert.match(screenSource, /saveContactDashboardGoal/u);
  assert.match(screenSource, /client\.put<unknown>\(\s*ORBIT_API_ENDPOINTS\.profile/u);
  assert.match(screenSource, /profileState\.refresh\(\)/u);
  assert.match(screenSource, /"关系目标"/u);
  assert.match(screenSource, /"保存目标"/u);
});

test("contacts dashboard overview metrics drill down into filtered contacts", () => {
  assert.match(screenSource, /openContactsDrilldown/u);
  assert.match(screenSource, /ContactsDashboardOverviewFilter/u);
  assert.match(screenSource, /overviewFilterFor/u);
  assert.match(screenSource, /<OverviewGrid[\s\S]*onOpenFilter=\{openContactsDrilldown\}/u);
  assert.match(screenSource, /router\.push\(\{\s*pathname: "\/contacts\/list"/u);
  assert.match(screenSource, /status: filter\.status/u);
  assert.match(screenSource, />查看</u);
});
