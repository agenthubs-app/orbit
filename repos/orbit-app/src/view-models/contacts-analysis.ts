import {
  dashboardToView,
  type DashboardIndustryView,
  type DashboardView,
  type DashboardViewInput
} from "./dashboard";
import type { ContactSummary } from "./contacts";

export interface ContactsAnalysisDiagnosisView {
  detail: string;
  scoreLabel: string;
  statusLabel: string;
}

export interface ContactsAnalysisDimensionView {
  detail: string;
  id: "industry" | "role" | "strength";
  label: string;
  tone: "amber" | "live" | "sky";
  value: string;
}

export type ContactsAnalysisStructureDimensionId =
  | "industry"
  | "location"
  | "role"
  | "relationship";

export interface ContactsAnalysisStructureItemView {
  countLabel: string;
  id: string;
  label: string;
  percentage: number;
}

export interface ContactsAnalysisStructureDimensionView {
  id: ContactsAnalysisStructureDimensionId;
  insight: string;
  items: ContactsAnalysisStructureItemView[];
  label: string;
  summary: string;
  title: string;
}

export interface ContactsAnalysisActivityView {
  detail: string;
  id: "dormant" | "new" | "strong";
  label: string;
  tone: "amber" | "live" | "sky";
  value: string;
}

export interface ContactsAnalysisCoverageSignalView {
  id: "high-value" | "referral" | "strong";
  label: string;
  value: string;
}

export interface ContactsAnalysisCoverageView {
  detail: string;
  score: number;
  scoreLabel: string;
  signals: ContactsAnalysisCoverageSignalView[];
  statusLabel: string;
}

export type ContactsAnalysisBriefActionKind =
  | "open_contact"
  | "open_contacts"
  | "open_pipeline";

export interface ContactsAnalysisBriefActionView {
  contactId: string;
  kind: ContactsAnalysisBriefActionKind;
  label: string;
}

export interface ContactsAnalysisActionBriefView {
  evaluatedAt: string;
  evidence: string[];
  evidenceIds: string[];
  judgment: string;
  primaryAction: ContactsAnalysisBriefActionView;
  priorityScore: number;
  ruleVersion: "opportunity-brief-v1";
  secondaryAction?: ContactsAnalysisBriefActionView;
  steps: string[];
  title: string;
  type: "follow_up" | "coverage_gap" | "relationship_risk" | "referral_path";
}

export interface ContactsAnalysisActionView {
  brief?: ContactsAnalysisActionBriefView;
  contactId: string;
  detail: string;
  id: string;
  statusLabel: string;
  title: string;
  tone: "accent" | "amber" | "sky";
}

export interface ContactsAnalysisHealthView {
  id: "strong" | "warm" | "weak";
  label: string;
  statusLabel: string;
  tone: "amber" | "live" | "sky";
  value: string;
}

export interface ContactsAnalysisView {
  actions: ContactsAnalysisActionView[];
  activity: ContactsAnalysisActivityView[];
  coverage: ContactsAnalysisCoverageView;
  diagnosis: ContactsAnalysisDiagnosisView;
  dimensions: ContactsAnalysisDimensionView[];
  goal: string;
  goalConfigured: boolean;
  health: ContactsAnalysisHealthView[];
  industries: DashboardIndustryView[];
  structureDimensions: ContactsAnalysisStructureDimensionView[];
}

const defaultGoal = "先补充你最近想认识的人或合作方向";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(record: UnknownRecord, field: string): UnknownRecord | null {
  return isRecord(record[field]) ? record[field] : null;
}

function stringField(record: UnknownRecord, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

function stringList(record: UnknownRecord, field: string): string[] {
  const value = record[field];

  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function briefAction(
  value: unknown
): ContactsAnalysisBriefActionView | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = stringField(value, "kind");
  const label = stringField(value, "label");

  if (
    !label ||
    !(kind === "open_contact" || kind === "open_contacts" || kind === "open_pipeline")
  ) {
    return null;
  }

  return {
    contactId: stringField(value, "contactId"),
    kind,
    label
  };
}

function actionBriefFromOpportunities(
  value: unknown
): ContactsAnalysisActionBriefView | undefined {
  const input = isRecord(value) ? value : {};
  const payload = recordField(input, "data") ?? input;
  const opportunities = Array.isArray(payload.highPriorityOpportunities)
    ? payload.highPriorityOpportunities
    : [];
  const opportunity = opportunities.find(isRecord);
  const brief = opportunity ? recordField(opportunity, "actionBrief") : null;

  if (!brief || stringField(brief, "ruleVersion") !== "opportunity-brief-v1") {
    return undefined;
  }

  const type = stringField(brief, "type");
  const title = stringField(brief, "title");
  const judgment = stringField(brief, "judgment");
  const primaryAction = briefAction(brief.primaryAction);
  const priority = recordField(brief, "priority");

  if (
    !title ||
    !judgment ||
    !primaryAction ||
    !(type === "follow_up" ||
      type === "coverage_gap" ||
      type === "relationship_risk" ||
      type === "referral_path")
  ) {
    return undefined;
  }

  const total = priority?.total;
  const secondaryAction = briefAction(brief.secondaryAction);

  return {
    evaluatedAt: stringField(brief, "evaluatedAt"),
    evidence: stringList(brief, "evidence").slice(0, 3),
    evidenceIds: stringList(brief, "evidenceIds"),
    judgment,
    primaryAction,
    priorityScore:
      typeof total === "number" && Number.isFinite(total)
        ? Math.max(0, Math.min(100, Math.round(total)))
        : 0,
    ruleVersion: "opportunity-brief-v1",
    ...(secondaryAction ? { secondaryAction } : {}),
    steps: stringList(brief, "steps").slice(0, 3),
    title,
    type
  };
}

function metricValue(
  metrics: { id: string; value: string }[],
  id: string
): string {
  return metrics.find((metric) => metric.id === id)?.value ?? "0";
}

function countValue(value: string): string {
  return /\d+/u.exec(value)?.[0] ?? "0";
}

function coverageStatus(score: number): string {
  if (score >= 80) {
    return "目标覆盖良好";
  }

  if (score >= 50) {
    return "目标具备基础";
  }

  return "目标覆盖不足";
}

function containsUntranslatedWords(value: string): boolean {
  return /[a-z]{3,}/iu.test(value);
}

function chineseOnly(value: string, fallback: string): string {
  return value.trim() && !containsUntranslatedWords(value)
    ? value.trim()
    : fallback;
}

function localizedGapLabel(value: string): string {
  const translated = value
    .replace(/\s*\bcoverage\b/giu, "覆盖")
    .replace(/\bcapital and investors\b/giu, "资本与投资机构")
    .replace(/\binvestor access\b/giu, "投资人入口")
    .trim();

  return chineseOnly(translated, "待补齐的人脉覆盖");
}

function decisionRolePercentage(contacts: ContactSummary[]): number | null {
  const roles = contacts
    .map((contact) => contact.role.trim())
    .filter((role) => role.length > 0);

  if (roles.length === 0) {
    return null;
  }

  const decisionRoles = roles.filter((role) =>
    /创始|负责人|董事|总监|经理|社长|代表|主管|合伙人|首席|ceo|coo|cfo|cto|founder|owner|president/iu.test(
      role
    )
  ).length;

  return Math.round((decisionRoles / roles.length) * 100);
}

function diagnosisFor(dashboard: DashboardView): string {
  if (dashboard.industries.length === 0) {
    return "行业信息还不完整，先补充联系人领域后再判断结构优势。";
  }

  const sorted = [...dashboard.industries].sort(
    (left, right) => right.percentage - left.percentage
  );
  const strongest = sorted[0];
  const weakest = sorted.at(-1);

  if (!strongest || !weakest) {
    return "行业信息还不完整，先补充联系人领域后再判断结构优势。";
  }

  if (strongest.id === weakest.id) {
    return `${strongest.label}是当前主要领域，继续补充其他领域可降低结构集中。`;
  }

  return `${strongest.label}覆盖较强，但${weakest.label}覆盖仍需补齐。`;
}

function analysisDimensions(
  dashboard: DashboardView,
  contacts: ContactSummary[]
): ContactsAnalysisDimensionView[] {
  const strongestIndustry = [...dashboard.industries].sort(
    (left, right) => right.percentage - left.percentage
  )[0];
  const strong = dashboard.strengths.find((item) => item.id === "strong");
  const rolePercentage = decisionRolePercentage(contacts);

  return [
    {
      detail: strongestIndustry
        ? `${strongestIndustry.label} ${strongestIndustry.percentage}%`
        : "补充联系人行业",
      id: "industry",
      label: "领域分布",
      tone: "live",
      value:
        dashboard.industries.length > 0
          ? `${dashboard.industries.length} 个领域`
          : "待完善"
    },
    {
      detail:
        rolePercentage === null ? "补充联系人职位" : "按现有职位判断",
      id: "role",
      label: "角色层级",
      tone: "sky",
      value:
        rolePercentage === null ? "待完善" : `决策层 ${rolePercentage}%`
    },
    {
      detail: strong?.countLabel ?? "补充关系证据",
      id: "strength",
      label: "关系强度",
      tone: "amber",
      value: strong ? `强关系 ${strong.percentage}%` : "待完善"
    }
  ];
}

function analysisActivity(
  dashboard: DashboardView
): ContactsAnalysisActivityView[] {
  const strong = dashboard.strengths.find((item) => item.id === "strong");

  return [
    {
      detail: "当前周期",
      id: "new",
      label: "新增人脉",
      tone: "live",
      value: metricValue(dashboard.metrics, "new-contacts")
    },
    {
      detail: "关系稳定",
      id: "strong",
      label: "核心关系",
      tone: "sky",
      value: countValue(strong?.countLabel ?? "")
    },
    {
      detail: "需要复联",
      id: "dormant",
      label: "待唤醒",
      tone: "amber",
      value: metricValue(dashboard.metrics, "dormant-contacts")
    }
  ];
}

function countedBreakdown(
  values: string[],
  countSuffix: string
): ContactsAnalysisStructureItemView[] {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    const label = value.trim();

    if (label) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  });

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return [...counts.entries()]
    .map(([label, count], index) => ({
      countLabel: `${count} ${countSuffix}`,
      id: `${index}:${label}`,
      label,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((left, right) => right.percentage - left.percentage);
}

function roleCategory(role: string): string {
  if (
    /创始|董事|社长|代表|合伙人|首席|\bceo\b|\bcoo\b|\bcfo\b|\bcto\b|founder|president/iu.test(
      role
    )
  ) {
    return "创始人与决策者";
  }

  if (/负责人|总监|经理|主管|店长|head|director|manager/iu.test(role)) {
    return "经营管理者";
  }

  return role.trim() ? "专业角色" : "";
}

function serverStructureItems(
  distributions: unknown,
  dimension: ContactsAnalysisStructureDimensionId
): ContactsAnalysisStructureItemView[] | null {
  const payload = isRecord(distributions) ? distributions : {};
  const dimensions = recordField(payload, "structureDistributions");
  if (!dimensions || !Array.isArray(dimensions[dimension])) return null;

  return dimensions[dimension]
    .filter(isRecord)
    .map((item) => ({
      countLabel: `${Math.max(0, Math.round(Number(item.contactCount) || 0))} 人`,
      id: stringField(item, "bucketId"),
      label: stringField(item, "label"),
      percentage: Math.max(0, Math.min(100, Math.round(Number(item.percentage) || 0)))
    }))
    .filter((item) => item.id && item.label);
}

function structureDimensions(
  dashboard: DashboardView,
  contacts: ContactSummary[],
  locations: string[],
  distributions: unknown
): ContactsAnalysisStructureDimensionView[] {
  const industryItems = serverStructureItems(distributions, "industry") ?? dashboard.industries.map((industry) => ({
    countLabel: industry.countLabel,
    id: industry.id,
    label: industry.label,
    percentage: industry.percentage
  }));
  const locationItems = serverStructureItems(distributions, "location") ?? countedBreakdown(locations, "人");
  const roleItems = serverStructureItems(distributions, "role") ?? countedBreakdown(
    contacts.map((contact) => roleCategory(contact.role)),
    "人"
  );
  const relationshipItems = serverStructureItems(distributions, "relationship") ?? dashboard.strengths.map((strength) => ({
    countLabel: strength.countLabel,
    id: strength.id,
    label: strength.label,
    percentage: strength.percentage
  }));
  const topLocation = locationItems[0];
  const topRole = roleItems[0];
  const strong = dashboard.strengths.find((item) => item.id === "strong");
  const weak = dashboard.strengths.find((item) => item.id === "weak");

  return [
    {
      id: "industry",
      insight: diagnosisFor(dashboard),
      items: industryItems,
      label: "行业",
      summary:
        industryItems.length > 0 ? `${industryItems.length} 个领域` : "待完善",
      title: "行业分布"
    },
    {
      id: "location",
      insight: topLocation
        ? topLocation.percentage >= 50
          ? `联系人主要集中在${topLocation.label}，占比 ${topLocation.percentage}%。补充其他地区可降低地域集中。`
          : `联系人分布在 ${locationItems.length} 个地区，${topLocation.label}占比最高。`
        : "地区信息还不完整，补充联系人所在地后才能判断地域覆盖。",
      items: locationItems,
      label: "地区",
      summary:
        locationItems.length > 0 ? `${locationItems.length} 个地区` : "待完善",
      title: "地区分布"
    },
    {
      id: "role",
      insight: topRole
        ? `${topRole.label}占比 ${topRole.percentage}%。结合行业分布，可判断现有人脉是否触达关键角色。`
        : "职位信息还不完整，补充角色后才能判断决策层覆盖。",
      items: roleItems,
      label: "角色",
      summary: roleItems.length > 0 ? `${roleItems.length} 类角色` : "待完善",
      title: "角色构成"
    },
    {
      id: "relationship",
      insight: strong
        ? `强关系占 ${strong.percentage}%${weak ? `，弱关系占 ${weak.percentage}%` : ""}。优先维护关键领域中的弱连接。`
        : "关系证据还不完整，补充互动记录后才能判断关系质量。",
      items: relationshipItems,
      label: "关系",
      summary: strong ? `强关系 ${strong.percentage}%` : "待完善",
      title: "关系质量"
    }
  ];
}

export function contactsAnalysisToView(
  input: DashboardViewInput,
  relationshipGoal: string,
  contacts: ContactSummary[] = [],
  locations: string[] = []
): ContactsAnalysisView {
  const dashboard = dashboardToView(input);
  const goal = relationshipGoal.trim();
  const hasGoal = goal.length > 0;
  const strong = dashboard.strengths.find((item) => item.id === "strong");
  const warm = dashboard.strengths.find((item) => item.id === "warm");
  const weak = dashboard.strengths.find((item) => item.id === "weak");
  const referral = dashboard.valueTypes.find(
    (item) => item.id === "referral_path"
  );
  const actions: ContactsAnalysisActionView[] = [];
  const priorityBrief = actionBriefFromOpportunities(input.opportunities);

  if (dashboard.priority && actions.length < 3) {
    actions.push({
      ...(priorityBrief ? { brief: priorityBrief } : {}),
      contactId: dashboard.priority.contactId,
      detail: chineseOnly(
        dashboard.priority.action,
        dashboard.priority.detail
      ),
      id: `priority:${dashboard.priority.contactId || "contact"}`,
      statusLabel: dashboard.priority.dueLabel,
      title: dashboard.priority.title,
      tone: "accent"
    });
  }

  dashboard.gaps.slice(0, 3 - actions.length).forEach((gap, index) => {
    actions.push({
      contactId: "",
      detail: gap.action,
      id: gap.id,
      statusLabel: gap.severityLabel === "高" ? "关键缺口" : "结构缺口",
      title: `补齐${localizedGapLabel(gap.label)}`,
      tone: index === 0 ? "amber" : "sky"
    });
  });

  if (actions.length === 0) {
    actions.push({
      contactId: "",
      detail: "写清楚最近想认识的人或合作方向，Orbit 才能判断现有人脉能否支持目标。",
      id: "complete-goal",
      statusLabel: "第一步",
      title: "先完善关系目标",
      tone: "accent"
    });
  }

  return {
    actions,
    activity: analysisActivity(dashboard),
    coverage: {
      detail: hasGoal
        ? chineseOnly(
            dashboard.nextAction,
            "先处理最重要的关系行动，再补齐覆盖最弱的人脉。"
          )
        : "设置目标后，Orbit 会判断现有人脉能否支持它。",
      score: hasGoal ? dashboard.coverageScore : 0,
      scoreLabel: hasGoal ? `${dashboard.coverageScore}%` : "--",
      signals: [
        {
          id: "high-value",
          label: "高价值关系",
          value: metricValue(dashboard.metrics, "high-value")
        },
        {
          id: "strong",
          label: "核心关系",
          value: countValue(strong?.countLabel ?? "")
        },
        {
          id: "referral",
          label: "引荐路径",
          value: countValue(referral?.countLabel ?? "")
        }
      ],
      statusLabel: hasGoal
        ? coverageStatus(dashboard.coverageScore)
        : "先设置关系目标"
    },
    diagnosis: {
      detail: diagnosisFor(dashboard),
      scoreLabel: hasGoal ? `${dashboard.coverageScore}%` : "--",
      statusLabel: hasGoal ? "目标匹配" : "结构诊断"
    },
    dimensions: analysisDimensions(dashboard, contacts),
    goal: goal || defaultGoal,
    goalConfigured: hasGoal,
    health: [
      {
        id: "strong",
        label: "核心",
        statusLabel: "稳定",
        tone: "live",
        value: countValue(strong?.countLabel ?? "")
      },
      {
        id: "warm",
        label: "进行",
        statusLabel: "需留意",
        tone: "sky",
        value: countValue(warm?.countLabel ?? "")
      },
      {
        id: "weak",
        label: "外圈",
        statusLabel: "待唤醒",
        tone: "amber",
        value: countValue(weak?.countLabel ?? "")
      }
    ],
    industries: dashboard.industries,
    structureDimensions: structureDimensions(
      dashboard,
      contacts,
      locations,
      input.distributions
    )
  };
}
