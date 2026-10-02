import assert from "node:assert/strict";
import test from "node:test";

import { createConfiguredMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { loadContactsAnalysis } from "../../app/(app)/app/contacts/analysis/contacts-analysis-route-service";
import { networkDebugPayload, networkEmptyPayload, networkPendingPayload, networkUnavailablePayload } from "../fixtures/network-debug-payload";

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

test("persisted analysis keeps its own generated time and version instead of the response assembly time", async () => {
  const data = await payload();
  const currentVersion = "a".repeat(64);
  const reportVersion = "b".repeat(64);
  data.generatedAt = "2026-09-15T15:00:00.000Z";
  data.analysis = {
    current: { analysisVersion: "contacts.analysis@1", sourceDataVersion: currentVersion },
    report: {
      analysisVersion: "contacts.analysis@1",
      body: "东京制造业联系人覆盖不足。",
      generatedAt: "2026-09-14T08:30:00.000Z",
      messageId: "message:analysis",
      sessionId: "session:analysis",
      sourceDataVersion: reportVersion,
    },
    stale: true,
  };
  const view = contactsAnalysisToView(data, "zh");
  assert.equal(view.state, "ready");
  if (view.state !== "ready" || view.analysis.state !== "ready") throw new Error("Missing analysis report");
  assert.deepEqual(view.analysis.current, { analysisVersion: "contacts.analysis@1", sourceDataVersion: currentVersion });
  assert.equal(view.analysis.report?.generatedAt, "2026-09-14T08:30:00.000Z");
  assert.equal(view.analysis.report?.body, "东京制造业联系人覆盖不足。");
  assert.equal(view.analysis.stale, true);
});

test("missing analysis is unavailable while an available provider can truthfully report no prior run", async () => {
  const data = await payload();
  data.analysis = undefined;
  let view = contactsAnalysisToView(data, "zh");
  assert.equal(view.state, "ready");
  if (view.state !== "ready") return;
  assert.deepEqual(view.analysis, { state: "unavailable" });

  data.analysis = {
    current: { analysisVersion: "contacts.analysis@1", sourceDataVersion: "c".repeat(64) },
    report: null,
    stale: false,
  };
  view = contactsAnalysisToView(data, "zh");
  if (view.state !== "ready" || view.analysis.state !== "ready") throw new Error("Missing current analysis version");
  assert.equal(view.analysis.report, null);
  assert.equal(view.analysis.stale, false);
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

test("opportunity actions keep only user data and internal routes; backend sentences stay out", async () => {
  const data = await payload();
  assert.ok(data.opportunities);
  data.opportunities.highPriorityOpportunities = [{
    opportunityId: "opp:one", contactId: "contact:one/two", contactName: "林", organization: "CRM:Literal", title: "再联系", priority: "high", priorityScore: 81, currentGoalId: "goal:1", reason: "刚参加同一活动", suggestedAction: "约个时间", dueLabel: "本周", evidenceIds: ["e:1"],
    actionBrief: { ruleVersion: "opportunity-brief-v1", type: "follow_up", title: "聊聊合作", judgment: "有明确下一步", evidence: ["同意继续交流"], steps: ["确认时间", "发送资料"], primaryAction: { kind: "open_contact", label: "打开联系人", contactId: "contact:one/two" }, secondaryAction: { kind: "open_pipeline", label: "查看进展" }, evaluatedAt: data.generatedAt, evidenceIds: ["e:1"], priority: { total: 81, urgency: 1, relationshipValue: 1, goalRelevance: 1, evidenceCompleteness: 1, dormantRisk: 1 } },
  }];
  const view = contactsAnalysisToView(data, "zh");
  if (view.state !== "ready" || view.opportunities.state !== "ready") throw new Error("Missing opportunities");
  const action = view.opportunities.data.actions[0];
  assert.equal(action.title, "再联系");
  assert.equal(action.judgment, "");
  assert.equal(action.dueLabel, "");
  assert.equal("evidence" in action, false);
  assert.equal("steps" in action, false);
  assert.deepEqual(action.primary, { label: "查看联系人", href: "/app/contacts/contact%3Aone%2Ftwo" });
  assert.deepEqual(action.secondary, { label: "查看关系管线", href: "/app/contacts/pipeline" });
});

test("legacy opportunity payloads get an explicit bilingual contact action", async () => {
  const data = await payload();
  const view = contactsAnalysisToView(data, "en");
  if (view.state !== "ready" || view.opportunities.state !== "ready") throw new Error("Missing opportunities");
  assert.equal(view.opportunities.data.actions[0].primary.label, "View contact");
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

// ---- W0043：白名单（后端句子字段不进视图）、空态与失败分开、双语模板 ----

const BACKEND_SENTENCES = (data: ReturnType<typeof networkDebugPayload>) => [
  data.aggregate.summary, data.aggregate.nextAction,
  ...data.aggregate.recentActivity.filter((item) => item.type !== "followup_due").flatMap((item) => [item.label, item.sourceLabel]),
  ...data.aggregate.recentActivity.map((item) => item.sourceLabel),
  data.distributions!.summary, data.gaps!.summary, data.opportunities!.summary,
  ...data.gaps!.gaps.flatMap((gap) => [gap.label, gap.recommendedAction]),
  ...data.opportunities!.highPriorityOpportunities.flatMap((item) => [item.reason, item.suggestedAction, item.dueLabel, item.actionBrief?.judgment ?? "", ...(item.actionBrief?.steps ?? []), ...(item.actionBrief?.evidence ?? [])]),
  ...data.opportunities!.dormantHighValueContacts.flatMap((item) => [item.reason, item.suggestedAction, item.lastTouchpointLabel]),
].filter((sentence) => sentence.trim());

for (const language of ["zh", "en"] as const) {
  test(`SC-W0043-02 (${language}): no backend sentence field reaches the view; sentences without real content are empty strings`, () => {
    const data = networkDebugPayload();
    const view = contactsAnalysisToView(data, language);
    if (view.state !== "ready" || view.structure.state !== "ready" || view.coverage.state !== "ready" || view.opportunities.state !== "ready") throw new Error("Missing sections");
    assert.equal(view.summary, "");
    assert.equal(view.structure.data.summary, "");
    assert.equal(view.coverage.data.summary, "");
    assert.equal(view.opportunities.data.summary, "");
    const serialized = JSON.stringify(view);
    for (const sentence of BACKEND_SENTENCES(data)) assert.equal(serialized.includes(sentence), false, `view carries backend sentence: ${sentence}`);
    assert.equal(serialized.includes("173"), false);
    for (const action of view.opportunities.data.actions) {
      const source = data.opportunities!.highPriorityOpportunities.find((item) => item.opportunityId === action.id)!;
      assert.notEqual(action.judgment, source.reason || "\u0000");
      assert.notEqual(action.judgment, source.actionBrief?.judgment ?? "\u0000");
      assert.equal(action.judgment, "");
    }
    assert.deepEqual(view.opportunities.data.dormant.map((item) => ({ name: item.name, organization: item.organization, reason: item.reason })), [{ name: "周杰", organization: "北辰资本", reason: "" }]);
  });
}

test("SC-W0043-03: due labels, bucket names and activity follow the bilingual closed sets", () => {
  const data = networkDebugPayload();
  const zh = contactsAnalysisToView(data, "zh");
  const en = contactsAnalysisToView(data, "en");
  if (zh.state !== "ready" || en.state !== "ready" || zh.opportunities.state !== "ready" || en.opportunities.state !== "ready" || zh.structure.state !== "ready" || en.structure.state !== "ready") throw new Error("Missing sections");
  assert.deepEqual(zh.opportunities.data.actions.map((a) => a.dueLabel), ["今天到期或已逾期", "明天到期", "5 天后到期", "未设截止", ""]);
  assert.deepEqual(en.opportunities.data.actions.map((a) => a.dueLabel), ["Today or overdue", "Tomorrow", "In 5 days", "No deadline", ""]);
  assert.deepEqual(en.opportunities.data.actions.map((a) => a.title), ["给王敏发提案资料", "约李雷喝咖啡", "跟赵敏确认展会", "问钱多报价", "回复孙立"]);
  assert.deepEqual(en.structure.data.dimensions.industry.map((b) => b.label), ["Manufacturing & Supply Chain", "Unclassified"]);
  assert.deepEqual(en.structure.data.dimensions.location.map((b) => b.label), ["Tokyo", "深圳南山", "Location missing"]);
  assert.deepEqual(en.structure.data.dimensions.role.map((b) => b.label), ["Decision makers", "Business development", "Professional advisors", "Operations & specialists", "Role missing"]);
  assert.deepEqual(en.structure.data.dimensions.relationship.map((b) => b.label), ["Strong ties", "Keep in touch", "To reconnect"]);
  assert.deepEqual(zh.structure.data.dimensions.role.map((b) => b.label), ["经营决策者", "业务拓展", "专业顾问", "运营与专业角色", "角色待完善"]);
  assert.deepEqual(en.activity.map((a) => ({ label: a.label, source: a.source, contactId: a.contactId })), [
    { label: "New contact", source: "Contact", contactId: "contact:wang-min" },
    { label: "New contact", source: "Contact", contactId: "contact:not-in-list" },
    { label: "给王敏发提案资料", source: "Follow-up", contactId: undefined },
  ]);
  assert.deepEqual(zh.activity.map((a) => [a.label, a.source]), [["新增联系人", "联系人"], ["新增联系人", "联系人"], ["给王敏发提案资料", "跟进"]]);
});

test("SC-W0043-01: empty sections stay empty (with data), failed sections are unavailable, pending aggregate is pending", () => {
  const empty = contactsAnalysisToView(networkEmptyPayload(), "zh");
  if (empty.state !== "ready") throw new Error("Empty payload must still be ready");
  assert.equal(empty.structure.state, "empty");
  assert.equal(empty.coverage.state, "empty");
  assert.equal(empty.opportunities.state, "empty");
  assert.equal(empty.goal.state, "empty");
  if (empty.goal.state === "empty") assert.equal(empty.goal.data.text, "");
  const failed = contactsAnalysisToView(networkUnavailablePayload(), "zh");
  if (failed.state !== "ready") throw new Error("Unavailable payload must still be ready");
  assert.deepEqual([failed.structure, failed.coverage, failed.opportunities, failed.goal], [{ state: "unavailable" }, { state: "unavailable" }, { state: "unavailable" }, { state: "unavailable" }]);
  assert.deepEqual(contactsAnalysisToView(networkPendingPayload(), "zh"), { state: "pending" });
  assert.deepEqual(contactsAnalysisToView({ schemaVersion: 1 }, "en"), { state: "error" });
});

test("W0047 SC-04: Web relationship health reads relationshipTierDistribution, never the App's strength distribution", () => {
  const view = contactsAnalysisToView(networkDebugPayload(), "zh");
  if (view.state !== "ready" || view.structure.state !== "ready") throw new Error("Missing structure");
  assert.deepEqual(view.structure.data.health, [
    { id: "new", count: 6, percentage: 67 },
    { id: "active", count: 2, percentage: 22 },
    { id: "dormant", count: 1, percentage: 11 },
  ]);
  // 旧响应（没有新增字段）：健康分布为空，不退回 relationshipStrengthDistribution。
  const legacy = networkDebugPayload() as { distributions: Record<string, unknown> };
  delete legacy.distributions.relationshipTierDistribution;
  const legacyView = contactsAnalysisToView(legacy, "zh");
  if (legacyView.state !== "ready" || legacyView.structure.state !== "ready") throw new Error("Missing structure");
  assert.deepEqual(legacyView.structure.data.health, []);
});
