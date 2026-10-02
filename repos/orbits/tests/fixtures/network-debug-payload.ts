/**
 * W0043：按真实后端输出构造的 `/api/mobile/contacts-dashboard` 返回（schemaVersion 1），含全部已知调试句。
 * 句子原样取自：`features/dashboard/storage/dashboard-summary-postgres-reader.ts`（aggregate／activity）、
 * `shared/compute/dashboard-distribution.ts`（分布与缺口）、`shared/compute/dashboard-opportunity.ts`（机会、dueLabel、沉睡）、
 * `features/connections/live-service.ts`（connection.summary 进 reason）。
 *
 * - `networkDebugPayload()`：各区块 success，调试句齐全（SC-02／03）。
 * - `networkEmptyPayload()`：夹具 A，各区块 `state: "empty"`（SC-01）。
 * - `networkUnavailablePayload()`：夹具 B，可选区块为 null 并列入 unavailableSections（SC-01）。
 * - `networkPendingPayload()`：夹具 C，aggregate pending（SC-01）。
 */
import type { MobileContactsDashboardPayload } from "../../shared/api-schema/mobile-contacts-dashboard";

export const DEBUG_INDUSTRY_LABEL = "制造与供应链";
/** 后端编造的沉睡天数（`45 + index * 14`）；界面上绝不能出现。 */
export const FAKE_LAST_TOUCHPOINT_DAYS = 173;

/** SC-02 禁用片段（不区分大小写）。`<行业名> coverage` 按夹具拼出。 */
export const FORBIDDEN_FRAGMENTS: readonly string[] = [
  "live relationship database",
  "Live contact source",
  "Live task source",
  "Live opportunity source",
  "source-backed",
  "aggregate",
  "deterministic",
  "Rule-based",
  "Seed or import",
  "Review live context",
  "context refresh",
  "nurture relationship",
  "live connection store",
  "Investor access coverage",
  "Strong relationship coverage",
  `${DEBUG_INDUSTRY_LABEL} coverage`,
  "No due date",
  "Due today",
  "Due tomorrow",
  "Due in",
  "Due soon",
  "days since last",
];

/** 返回 html 里出现的禁用片段与编造数字（空数组 = 通过）。只看可见文本，去掉标签与属性。 */
export function forbiddenHits(html: string): string[] {
  const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"");
  const lower = text.toLowerCase();
  const hits = FORBIDDEN_FRAGMENTS.filter((fragment) => lower.includes(fragment.toLowerCase()));
  if (new RegExp(`(^|\\D)${FAKE_LAST_TOUCHPOINT_DAYS}(\\D|$)`).test(text)) hits.push(String(FAKE_LAST_TOUCHPOINT_DAYS));
  return hits;
}

const GENERATED_AT = "2026-10-01T03:00:00.000Z";
const provenance = { databaseReadExecuted: true, collectedAt: GENERATED_AT, sourceIds: ["source:live"] };

function bucket(bucketId: string, label: string, contactCount: number, percentage: number, extra: Record<string, unknown> = {}) {
  return { bucketId, label, contactCount, percentage, evidenceIds: [`evidence:${bucketId}`], missingData: bucketId.endsWith("_unknown") || bucketId === "unclassified", ...extra };
}

export function networkDebugPayload(): MobileContactsDashboardPayload {
  return {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    analysis: null,
    aggregate: {
      state: "success",
      relationshipAssetTotals: { contacts: 9, connections: 9, evidenceBackedRelationships: 9, eventsRepresented: 1 },
      newContacts: { count: 2, windowLabel: "Last 7 days", contacts: [] },
      highValueCount: 3,
      highValueRelationships: [],
      pendingFollowups: { count: 1, tasks: [] },
      dormantContacts: { count: 2, contacts: [] },
      recentActivity: [
        { activityId: "activity:dashboard:contact:contact:wang-min", type: "new_contact", label: "王敏 added to the live relationship database", occurredAt: "2026-09-30T03:00:00.000Z", sourceLabel: "Live contact source", evidenceIds: ["evidence:contact:wang-min"] },
        { activityId: "activity:dashboard:contact:contact:not-in-list", type: "new_contact", label: "Hidden Person added to the live relationship database", occurredAt: "2026-09-29T03:00:00.000Z", sourceLabel: "Live contact source", evidenceIds: ["evidence:contact:not-in-list"] },
        { activityId: "activity:dashboard:task:task:send-deck", type: "followup_due", label: "给王敏发提案资料", occurredAt: "2026-09-28T03:00:00.000Z", sourceLabel: "Live task source", evidenceIds: ["evidence:task:send-deck"] },
      ],
      summary: "Rule-based summary of the live dashboard aggregate.",
      nextAction: "Use the source-backed live dashboard aggregate for agent workflow testing.",
      provenance,
    },
    summary: {
      state: "success",
      metrics: [{ id: "relationship-assets", label: "Relationship assets", value: 9, evidenceIds: [] }],
      recentActivity: [],
      summary: "Live dashboard aggregate was computed from shared remote relationship records.",
      nextAction: "Use the source-backed live dashboard aggregate for agent workflow testing.",
    },
    opportunities: {
      state: "success",
      highPriorityOpportunities: [
        {
          opportunityId: "opportunity:task:send-deck", contactId: "contact:wang-min", contactName: "王敏", organization: "东方制造",
          title: "给王敏发提案资料", priority: "high", priorityScore: 88, currentGoalId: "goal:1",
          reason: "王敏 is available from the live connection store.",
          suggestedAction: "Review live context and nurture relationship before follow-up.",
          dueLabel: "Due today", evidenceIds: ["evidence:task:send-deck"],
          sourceRefs: [{ id: "source:live-opportunity", label: "Live opportunity source" }],
          actionBrief: {
            ruleVersion: "opportunity-brief-v1", type: "follow_up", title: "给王敏发提案资料",
            judgment: "有一个已逾期的跟进任务，建议今天处理。", evidence: ["Live task source"], steps: ["Review live context"],
            primaryAction: { kind: "open_contact", label: "打开联系人", contactId: "contact:wang-min" },
            secondaryAction: { kind: "open_pipeline", label: "查看进展" },
            evaluatedAt: GENERATED_AT, evidenceIds: ["evidence:task:send-deck"],
            priority: { total: 88, urgency: 1, relationshipValue: 1, goalRelevance: 1, evidenceCompleteness: 1, dormantRisk: 0 },
          },
        },
        { opportunityId: "opportunity:task:intro", contactId: "contact:li-lei", contactName: "李雷", organization: "", title: "约李雷喝咖啡", priority: "medium", priorityScore: 70, currentGoalId: "", reason: "李雷 is available from the live connection store.", suggestedAction: "Send a lightweight context refresh about pricing.", dueLabel: "Due tomorrow", evidenceIds: [] },
        { opportunityId: "opportunity:task:later", contactId: "contact:zhao", contactName: "赵敏", organization: "", title: "跟赵敏确认展会", priority: "medium", priorityScore: 60, currentGoalId: "", reason: "", suggestedAction: "", dueLabel: "Due in 5 days", evidenceIds: [] },
        { opportunityId: "opportunity:task:none", contactId: "contact:qian", contactName: "钱多", organization: "", title: "问钱多报价", priority: "medium", priorityScore: 55, currentGoalId: "", reason: "", suggestedAction: "", dueLabel: "No due date", evidenceIds: [] },
        { opportunityId: "opportunity:task:soon", contactId: "contact:sun", contactName: "孙立", organization: "", title: "回复孙立", priority: "medium", priorityScore: 50, currentGoalId: "", reason: "", suggestedAction: "", dueLabel: "Due soon", evidenceIds: [] },
      ],
      dormantHighValueContacts: [
        {
          contactId: "contact:zhou", contactName: "周杰", organization: "北辰资本", valueType: "commercial_opportunity", valueScore: 90,
          lastTouchpointDays: FAKE_LAST_TOUCHPOINT_DAYS, lastTouchpointLabel: `${FAKE_LAST_TOUCHPOINT_DAYS} days since last live source-backed touchpoint`,
          reason: "周杰 is a high-value nurture relationship without a current open opportunity.",
          suggestedAction: "Send a lightweight context refresh about review evidence before follow-up.", evidenceIds: [],
        },
      ],
      currentGoalMatches: [],
      suggestedContactReasons: [],
      summary: "Live opportunity reminder analytics ranked open tasks and dormant high-value relationships from shared live storage.",
      nextAction: "Seed or import source-backed contacts before showing opportunities.",
    },
    gaps: {
      state: "success",
      coverageScore: 33,
      gaps: [
        { gapId: "gap:manufacturing_supply_chain", label: `${DEBUG_INDUSTRY_LABEL} coverage`, gapType: "industry_underrepresented", severity: "high", currentCount: 1, targetCount: 3, recommendedAction: "Prioritize sourced introductions that expand this underrepresented relationship segment.", evidenceIds: [] },
        { gapId: "gap:investor-access", label: "Investor access coverage", gapType: "value_type_underrepresented", severity: "medium", currentCount: 0, targetCount: 2, recommendedAction: "Use warm referrals and event recommendations to add more investor access paths.", evidenceIds: [] },
        { gapId: "gap:strong-relationships", label: "Strong relationship coverage", gapType: "strength_underrepresented", severity: "low", currentCount: 1, targetCount: 3, recommendedAction: "Move warm relationships with clear business context into explicit follow-up tasks.", evidenceIds: [] },
      ],
      summary: "Live network gap analysis compares generated relationship coverage against deterministic target thresholds.",
      nextAction: "Seed or import source-backed contacts before showing network gaps.",
    },
    distributions: {
      state: "success",
      industryDistribution: [],
      valueTypeDistribution: [],
      relationshipStrengthDistribution: [
        { strength: "strong", relationshipCount: 1, percentage: 11, followupRisk: "low", evidenceIds: [] },
        { strength: "warm", relationshipCount: 3, percentage: 33, followupRisk: "moderate", evidenceIds: [] },
        { strength: "weak", relationshipCount: 5, percentage: 56, followupRisk: "high", evidenceIds: [] },
      ],
      structureDistributions: {
        industry: [
          bucket("manufacturing_supply_chain", DEBUG_INDUSTRY_LABEL, 1, 11, { primaryIndustryId: "manufacturing_supply_chain" }),
          bucket("unclassified", "未分类", 8, 89),
        ],
        location: [
          bucket("location_tokyo", "东京", 4, 44),
          bucket("location_%E6%B7%B1%E5%9C%B3", "深圳南山", 2, 22),
          bucket("location_unknown", "地区待完善", 3, 34),
        ],
        role: [
          bucket("role_decision_maker", "经营决策者", 2, 22),
          bucket("role_business_growth", "业务拓展", 1, 11),
          bucket("role_professional_advisor", "专业顾问", 1, 11),
          bucket("role_operations", "运营与专业角色", 1, 11),
          bucket("role_unknown", "角色待完善", 4, 45),
        ],
        relationship: [
          bucket("strong", "强关系", 1, 11),
          bucket("warm", "保持联系", 3, 33),
          bucket("weak", "待重新联系", 5, 56),
        ],
      },
      summary: "Live network distribution analytics grouped source-backed contacts and relationships from shared live storage.",
      nextAction: "Seed or import source-backed contacts before showing distribution analytics.",
    },
    profile: {
      state: "success",
      profile: {
        id: "profile:1", displayName: "测试用户", headline: "", organization: "", role: "", homeMarket: "", relationshipGoal: "认识三位制造业采购负责人",
        targetRelationshipTypes: [], preferredFollowUpWindow: "", preferredLanguage: "zh", preferredIntroChannels: [], updatedAt: GENERATED_AT,
      },
      completeness: { score: 80, status: "ready", completedFields: [], missingFields: [], nextBestField: null },
      editor: { canSave: true, lastSavedAt: null, dirtyFields: [], validationMessages: [] },
      nextAction: "Seed or import source-backed contacts before showing profile.",
    },
    contacts: null,
    unavailableSections: ["contacts"],
  } as MobileContactsDashboardPayload;
}

/** 夹具 A：只有少量联系人、各分析区块都返回 empty（后端没有可分析的内容，不是失败）。 */
export function networkEmptyPayload(): MobileContactsDashboardPayload {
  const data = networkDebugPayload();
  data.aggregate.state = "empty";
  data.aggregate.recentActivity = [];
  data.aggregate.summary = "The live dashboard aggregate returned no relationship rows.";
  if (data.summary) data.summary.state = "empty";
  data.opportunities = { ...data.opportunities!, state: "empty", highPriorityOpportunities: [], dormantHighValueContacts: [], summary: "No live relationships are available for opportunity analytics." };
  data.gaps = { ...data.gaps!, state: "empty", coverageScore: 0, gaps: [], summary: "No live relationships are available for network gap analysis." };
  data.distributions = {
    ...data.distributions!, state: "empty", relationshipStrengthDistribution: [],
    structureDistributions: { industry: [], location: [], role: [], relationship: [] },
    summary: "No live relationships are available for network distribution analytics.",
  };
  data.profile = { ...data.profile!, state: "empty", profile: null };
  return data;
}

/** 夹具 B：可选区块读取失败（null 并列入 unavailableSections）。 */
export function networkUnavailablePayload(): MobileContactsDashboardPayload {
  const data = networkDebugPayload();
  data.opportunities = null;
  data.gaps = null;
  data.distributions = null;
  data.profile = null;
  data.unavailableSections = ["opportunities", "gaps", "distributions", "profile", "contacts"];
  return data;
}

/** 夹具 C：聚合仍在生成。 */
export function networkPendingPayload(): MobileContactsDashboardPayload {
  const data = networkDebugPayload();
  data.aggregate.state = "pending";
  data.aggregate.summary = "The live dashboard aggregate is waiting for relationship record review.";
  return data;
}
