import assert from "node:assert/strict";
import test from "node:test";

import { createConfiguredMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { loadContactsAnalysis } from "../../app/(app)/app/contacts/analysis/contacts-analysis-route-service";

async function payload() {
  const result = await createConfiguredMobileContactsDashboardService("mock").getDashboard({ actorId: "analysis-test" });
  assert.equal(result.success, true);
  if (!result.success) throw new Error("Invalid fixture");
  return structuredClone(result.data);
}

test("analysis uses aggregate totals, not the loaded contact sample", async () => {
  const data = await payload();
  data.aggregate.relationshipAssetTotals.contacts = 78;
  data.aggregate.newContacts.count = 13;
  data.aggregate.highValueCount = 12;
  data.aggregate.pendingFollowups.count = 4;
  data.aggregate.dormantContacts.count = 5;
  data.contacts = null;
  const view = contactsAnalysisToView(data, "zh");
  assert.equal(view.state, "ready");
  if (view.state !== "ready") return;
  assert.deepEqual(view.metrics, { contacts: 78, newContacts: 13, highValue: 12, pendingFollowups: 4, dormant: 5 });
});

test("missing, pending and empty sections are distinct, without synthetic zero scores", async () => {
  const data = await payload();
  data.gaps = null;
  data.profile = null;
  assert.ok(data.distributions);
  data.distributions.state = "pending";
  assert.ok(data.opportunities);
  data.opportunities.state = "empty";
  data.opportunities.highPriorityOpportunities = [];
  const view = contactsAnalysisToView(data, "zh");
  assert.equal(view.state, "ready");
  if (view.state !== "ready") return;
  assert.deepEqual(view.coverage, { state: "unavailable" });
  assert.deepEqual(view.structure, { state: "pending" });
  assert.equal(view.opportunities.state, "empty");
  assert.deepEqual(view.goal, { state: "unavailable" });
});

test("four dimensions preserve server proportions, missing buckets and encoded detail links", async () => {
  const data = await payload();
  assert.ok(data.distributions);
  data.distributions.structureDistributions = {
    industry: [{ bucketId: "technology_internet", label: "旧标签", primaryIndustryId: "technology_internet", contactCount: 21, percentage: 27, evidenceIds: [], missingData: false }],
    location: [{ bucketId: "location:東京/港区", label: "東京/港区", contactCount: 2, percentage: 3, evidenceIds: [], missingData: false }],
    role: [{ bucketId: "role:missing", label: "未填写角色", contactCount: 7, percentage: 9, evidenceIds: [], missingData: true }],
    relationship: [{ bucketId: "strong", label: "强关系", contactCount: 5, percentage: 6, evidenceIds: [], missingData: false }],
  };
  const view = contactsAnalysisToView(data, "en");
  assert.equal(view.state, "ready");
  if (view.state !== "ready" || view.structure.state !== "ready") throw new Error("Missing structure");
  assert.equal(view.structure.data.dimensions.industry[0].label, "Technology & Internet");
  assert.equal(view.structure.data.dimensions.industry[0].percentage, 27);
  assert.equal(view.structure.data.dimensions.location[0].href, "/app/contacts/analysis/location/location%3A%E6%9D%B1%E4%BA%AC%2F%E6%B8%AF%E5%8C%BA");
  assert.equal(view.structure.data.dimensions.role[0].missingData, true);
  assert.equal(view.structure.data.dimensions.relationship[0].count, 5);
});

test("opportunity evidence and steps survive mapping and actions stay on internal routes", async () => {
  const data = await payload();
  assert.ok(data.opportunities);
  data.opportunities.highPriorityOpportunities = [{
    opportunityId: "opp:one", contactId: "contact:one/two", contactName: "林", organization: "CRM:Literal", title: "再联系", priority: "high", priorityScore: 81, currentGoalId: "goal:1", reason: "刚参加同一活动", suggestedAction: "约个时间", dueLabel: "本周", evidenceIds: ["e:1"],
    actionBrief: { ruleVersion: "opportunity-brief-v1", type: "follow_up", title: "聊聊合作", judgment: "有明确下一步", evidence: ["同意继续交流"], steps: ["确认时间", "发送资料"], primaryAction: { kind: "open_contact", label: "打开联系人", contactId: "contact:one/two" }, secondaryAction: { kind: "open_pipeline", label: "查看进展" }, evaluatedAt: data.generatedAt, evidenceIds: ["e:1"], priority: { total: 81, urgency: 1, relationshipValue: 1, goalRelevance: 1, evidenceCompleteness: 1, dormantRisk: 1 } },
  }];
  const view = contactsAnalysisToView(data, "zh");
  if (view.state !== "ready" || view.opportunities.state !== "ready") throw new Error("Missing opportunities");
  assert.deepEqual(view.opportunities.data.actions[0].evidence, ["同意继续交流"]);
  assert.deepEqual(view.opportunities.data.actions[0].steps, ["确认时间", "发送资料"]);
  assert.equal(view.opportunities.data.actions[0].primary.href, "/app/contacts/contact%3Aone%2Ftwo");
  assert.equal(view.opportunities.data.actions[0].secondary?.href, "/app/contacts/pipeline");
});

test("legacy opportunity payloads keep readable source evidence and an explicit contact action", async () => {
  const data = await payload();
  const view = contactsAnalysisToView(data, "zh");
  if (view.state !== "ready" || view.opportunities.state !== "ready") throw new Error("Missing opportunities");
  assert.deepEqual(view.opportunities.data.actions[0].evidence, ["Climate dinner attendee roster", "Maya pilot expansion thread"]);
  assert.equal(view.opportunities.data.actions[0].primary.label, "查看联系人");
  assert.equal(view.opportunities.data.actions[0].primary.href, "/app/contacts/contact%3Amaya-chen");
});

test("invalid payload and pending aggregate never render ready metrics", async () => {
  assert.deepEqual(contactsAnalysisToView({ schemaVersion: 2 }, "zh"), { state: "error" });
  const data = await payload();
  data.aggregate.state = "pending";
  assert.deepEqual(contactsAnalysisToView(data, "zh"), { state: "pending" });
});

test("route rejects a missing actor before any service call", async () => {
  let calls = 0;
  const service = { getDashboard: async () => { calls++; throw new Error("Must not run"); } };
  assert.deepEqual(await loadContactsAnalysis("  ", "zh", service), { state: "error" });
  assert.equal(calls, 0);
});

test("route propagates the authenticated actor and surfaces failures", async () => {
  const data = await payload();
  const calls: string[] = [];
  const view = await loadContactsAnalysis("actor:one", "zh", { getDashboard: async ({ actorId }) => { calls.push(actorId); return { success: true, data }; } });
  assert.equal(view.state, "ready");
  assert.deepEqual(calls, ["actor:one"]);
  assert.deepEqual(await loadContactsAnalysis("actor:one", "zh", { getDashboard: async () => { throw new Error("storage unavailable"); } }), { state: "error" });
  assert.deepEqual(await loadContactsAnalysis("actor:one", "zh", { getDashboard: async () => ({ success: false, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED", section: "aggregate" } }) }), { state: "error" });
});
