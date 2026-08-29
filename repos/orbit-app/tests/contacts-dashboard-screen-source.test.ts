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

test("contacts analysis leads with the relationship goal and actionable evidence", () => {
  assert.match(screenSource, /title="人脉分析"/u);
  assert.match(screenSource, /contactsAnalysisToView/u);
  assert.match(screenSource, /GoalBar/u);
  assert.match(screenSource, /GoalCoverageCard/u);
  assert.match(screenSource, /RecommendedActionsCard/u);
  assert.match(screenSource, /RelationshipHealthCard/u);
  assert.match(screenSource, /"查看突破路径" : "设置关系目标"/u);
  assert.match(screenSource, /onOpenSignal/u);
  assert.match(screenSource, /value: "strategic_fit"/u);
  assert.match(screenSource, /value: "referral_path"/u);
  assert.match(screenSource, /accessibilityLabel=\{primaryActionLabel\}/u);
  assert.match(screenSource, /accessibilityLabel=\{`\$\{action\.title\}/u);
  assert.doesNotMatch(screenSource, /title="人脉表盘"/u);
  assert.doesNotMatch(screenSource, /title="人脉星图"/u);
});

test("contacts analysis option one exposes focused overview structure and opportunity views", () => {
  const overviewStart = screenSource.indexOf('analysisSegment === "overview"');
  const structureStart = screenSource.indexOf('analysisSegment === "structure"');
  const opportunityStart = screenSource.indexOf('analysisSegment === "opportunity"');
  const overviewSource = screenSource.slice(overviewStart, structureStart);
  const structureSource = screenSource.slice(structureStart, opportunityStart);

  assert.match(screenSource, /AnalysisSegmentedControl/u);
  assert.match(screenSource, /"概览"/u);
  assert.match(screenSource, /"结构"/u);
  assert.match(screenSource, /"机会"/u);
  assert.match(screenSource, /AnalysisDiagnosisCard/u);
  assert.match(screenSource, /AnalysisSnapshotCard/u);
  assert.match(screenSource, /StructureDimensionControl/u);
  assert.match(screenSource, /StructureBreakdownCard/u);
  assert.match(screenSource, /StructureDistributionRows/u);
  assert.match(screenSource, /StructureAnalysisView/u);
  assert.match(screenSource, /OpportunityAnalysisView/u);
  assert.match(screenSource, /结构摘要/u);
  assert.match(screenSource, /选择维度查看构成/u);
  assert.match(screenSource, /关键机会/u);
  assert.match(overviewSource, /AnalysisSnapshotCard/u);
  assert.doesNotMatch(overviewSource, /NetworkStructureCard/u);
  assert.match(structureSource, /StructureAnalysisView/u);
  assert.doesNotMatch(structureSource, /RecommendedActionsCard/u);
  assert.match(screenSource, /accessibilityState=\{\{ selected/u);
  assert.match(
    screenSource,
    /accessibilityLabel=\{`\$\{segment\.label\}分析`\}[\s\S]{0,120}accessibilityRole="button"/u
  );
  assert.match(screenSource, /structureItemVisual\(dimension\.id, item\.label, index\)/u);
  assert.match(screenSource, /餐饮\|食品/u);
  assert.match(screenSource, /dimension === "location"/u);
  assert.match(screenSource, /icon: "location-outline"/u);
  assert.match(screenSource, /icon: "diamond-outline"/u);
  assert.match(screenSource, /icon: "heart-outline"/u);
  assert.match(screenSource, /<Text numberOfLines=\{2\} style=\{styles\.structureItemLabel\}>/u);
});

test("opportunity actions open a structured action brief before contact details", () => {
  assert.match(screenSource, /selectedAction/u);
  assert.match(screenSource, /OpportunityActionBriefSheet/u);
  assert.match(screenSource, /visible=\{selectedAction !== null\}/u);
  assert.match(screenSource, /为什么现在/u);
  assert.match(screenSource, /判断依据/u);
  assert.match(screenSource, /建议步骤/u);
  assert.match(screenSource, /accessibilityLabel="关闭行动简报"/u);
  assert.match(screenSource, /accessibilityLabel=\{brief\.secondaryAction\.label\}/u);
  assert.match(screenSource, /accessibilityLabel=\{brief\.primaryAction\.label\}/u);
  assert.match(screenSource, /onRequestClose/u);
  assert.match(screenSource, /action\.brief/u);
});
