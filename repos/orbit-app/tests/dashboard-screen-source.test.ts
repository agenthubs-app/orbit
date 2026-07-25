import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "dashboard", "DashboardScreen.tsx"),
  "utf8"
);

test("dashboard screen can safely recompute opportunity reminders through the web API", () => {
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /dashboardOpportunitiesRecomputePath/u);
  assert.match(screenSource, /dashboardOpportunitiesRecomputeToView/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*dashboardOpportunitiesRecomputePath\(\)/u);
  assert.match(screenSource, /recomputeDashboardOpportunities/u);
  assert.match(screenSource, /opportunitiesState\.refresh\(\)/u);
  assert.match(screenSource, /"重新计算机会"/u);
  assert.doesNotMatch(screenSource, /发送通知|写入任务|创建任务/u);
});

test("dashboard screen reads and runs the web provenance audit boundary", () => {
  assert.match(screenSource, /dashboardProvenanceAuditPath/u);
  assert.match(screenSource, /dashboardProvenanceAuditRunPath/u);
  assert.match(screenSource, /dashboardAuditToView/u);
  assert.match(screenSource, /dashboardAuditRunToView/u);
  assert.match(screenSource, /auditState\.refresh\(\)/u);
  assert.match(screenSource, /"运行来源审计"/u);
  assert.match(screenSource, /"来源一致性审计"/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*dashboardProvenanceAuditRunPath\(\)/u
  );
  assert.doesNotMatch(screenSource, /合规报告已生成|写入生产审计/u);
});
