export interface DashboardMetricView {
  id: string;
  label: string;
  value: string;
}

export interface DashboardPriorityView {
  action: string;
  contactId: string;
  contactName: string;
  detail: string;
  dueLabel: string;
  organization: string;
  scoreLabel: string;
  title: string;
}

export interface DashboardGapView {
  action: string;
  detail: string;
  id: string;
  label: string;
  severityLabel: string;
}

export interface DashboardIndustryView {
  countLabel: string;
  id: string;
  label: string;
  organizations: string;
  percentage: number;
}

export interface DashboardValueTypeView {
  countLabel: string;
  id: string;
  label: string;
  percentage: number;
}

export interface DashboardStrengthView {
  countLabel: string;
  id: string;
  label: string;
  percentage: number;
  riskLabel: string;
}

export interface DashboardActivityView {
  detail: string;
  id: string;
  label: string;
  time: string;
  typeLabel: string;
}

export interface DashboardView {
  coverageScore: number;
  coverageScoreLabel: string;
  gaps: DashboardGapView[];
  industries: DashboardIndustryView[];
  metrics: DashboardMetricView[];
  nextAction: string;
  priority: DashboardPriorityView | null;
  recentActivity: DashboardActivityView[];
  strengths: DashboardStrengthView[];
  summary: string;
  title: string;
  valueTypes: DashboardValueTypeView[];
}

export interface DashboardViewInput {
  aggregate?: unknown;
  distributions?: unknown;
  gaps?: unknown;
  opportunities?: unknown;
  summary?: unknown;
}

type UnknownRecord = Record<string, unknown>;

const METRIC_LABELS: Record<string, string> = {
  "dormant-contacts": "待唤醒",
  "high-value": "高价值关系",
  "new-contacts": "新增人脉",
  "pending-followups": "待跟进",
  "relationship-assets": "关系资产"
};

const METRIC_ORDER = [
  "relationship-assets",
  "pending-followups",
  "dormant-contacts",
  "high-value",
  "new-contacts"
];

const INDUSTRY_LABELS: Record<string, string> = {
  "Capital and investors": "资本与投资人",
  "Community groups": "社群组织",
  "Food operators": "食品与餐饮",
  "Partner and advisory firms": "合作与顾问机构",
  "Technology companies": "科技公司"
};

const GAP_LABELS: Record<string, string> = {
  "Capital and investors coverage": "资本与投资人覆盖",
  "Investor access coverage": "投资人入口",
  "Strong relationship coverage": "强关系覆盖"
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  commercial_opportunity: "商业机会",
  investor_access: "投资人入口",
  referral_path: "引荐路径",
  strategic_fit: "战略契合"
};

const STRENGTH_LABELS: Record<string, string> = {
  strong: "强关系",
  warm: "温关系",
  weak: "弱关系"
};

const RISK_LABELS: Record<string, string> = {
  high: "需要尽快处理",
  low: "风险较低",
  moderate: "需要留意"
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "高",
  low: "低",
  medium: "中"
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  followup_completed: "完成跟进",
  high_value_added: "高价值关系",
  new_contact: "新增人脉",
  reminder_created: "跟进提醒",
  task_created: "新增任务"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(
  record: UnknownRecord,
  fieldName: string,
  fallback = 0
): number {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function recordInput(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function containsCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|live store|live-store|live storage|live query|live relationship database|shared remote|rule-based|deterministic|analytics|workflow testing|database|postgres|external message|notification|agent workflow|current-user|implementation)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const text = value.trim();

  if (!text) {
    return fallback;
  }

  if (containsImplementationLabel(text)) {
    return fallback;
  }

  if (!containsCjk(text)) {
    return fallback;
  }

  return text;
}

function firstUserFacing(values: string[], fallback: string): string {
  for (const value of values) {
    const text = userFacingText(value);
    if (text) {
      return text;
    }
  }

  return fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${date
    .getHours()
    .toString()
    .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function localizedMetric(
  id: string,
  value: number
): DashboardMetricView {
  return {
    id,
    label: METRIC_LABELS[id] ?? id,
    value: String(value)
  };
}

function fallbackMetricValues(aggregate: UnknownRecord): Record<string, number> {
  const totals = nestedRecord(aggregate, "relationshipAssetTotals");
  const newContacts = nestedRecord(aggregate, "newContacts");
  const pendingFollowups = nestedRecord(aggregate, "pendingFollowups");
  const dormantContacts = nestedRecord(aggregate, "dormantContacts");

  return {
    "dormant-contacts": numberField(dormantContacts, "count"),
    "high-value": numberField(aggregate, "highValueCount"),
    "new-contacts": numberField(newContacts, "count"),
    "pending-followups": numberField(pendingFollowups, "count"),
    "relationship-assets": numberField(totals, "contacts")
  };
}

function dashboardMetrics(
  summary: UnknownRecord,
  aggregate: UnknownRecord
): DashboardMetricView[] {
  const summaryMetrics = listField(summary, "metrics")
    .filter(isRecord)
    .map((item) => ({
      id: stringField(item, "id"),
      value: numberField(item, "value")
    }))
    .filter((item) => METRIC_ORDER.includes(item.id));

  const values =
    summaryMetrics.length > 0
      ? Object.fromEntries(summaryMetrics.map((item) => [item.id, item.value]))
      : fallbackMetricValues(aggregate);

  return METRIC_ORDER.map((id) => localizedMetric(id, values[id] ?? 0));
}

function dueLabel(value: string): string {
  const text = value.trim();

  if (/^due today$/iu.test(text)) {
    return "今日";
  }

  if (/^due tomorrow$/iu.test(text)) {
    return "明日";
  }

  const dueInDays = /^due in (\d+) days?$/iu.exec(text);
  if (dueInDays?.[1]) {
    return `${dueInDays[1]} 天后`;
  }

  const overdue = /^overdue by (\d+) days?$/iu.exec(text);
  if (overdue?.[1]) {
    return `已逾期 ${overdue[1]} 天`;
  }

  return userFacingText(text, "待确认");
}

function priorityTitle(item: UnknownRecord): string {
  const contactName = stringField(item, "contactName", "这位联系人");
  const title = stringField(item, "title");

  if (/^review follow-up for /iu.test(title)) {
    return `跟进${contactName}`;
  }

  return userFacingText(title, `跟进${contactName}`);
}

function priorityDetail(item: UnknownRecord): string {
  const contactName = stringField(item, "contactName", "这位联系人");
  const reason = stringField(item, "reason");

  if (/has a concrete current-user relationship record/iu.test(reason)) {
    return `${contactName}有可复核的关系背景。`;
  }

  if (/is a high-value nurture relationship/iu.test(reason)) {
    return `${contactName}是值得重新推进的高价值关系。`;
  }

  return userFacingText(reason, `${contactName}需要先复核关系背景。`);
}

function priorityAction(value: string): string {
  return userFacingText(value, "先复核关系背景，再决定怎么跟进。");
}

function priorityView(opportunities: UnknownRecord): DashboardPriorityView | null {
  const highPriority = listField(opportunities, "highPriorityOpportunities")
    .filter(isRecord)
    .at(0);
  const dormant = listField(opportunities, "dormantHighValueContacts")
    .filter(isRecord)
    .at(0);
  const item = highPriority ?? dormant;

  if (!item) {
    return null;
  }

  return {
    action: priorityAction(stringField(item, "suggestedAction")),
    contactId: stringField(item, "contactId"),
    contactName: stringField(item, "contactName", "联系人"),
    detail: priorityDetail(item),
    dueLabel: dueLabel(stringField(item, "dueLabel")),
    organization: stringField(item, "organization"),
    scoreLabel: `${numberField(item, "priorityScore", numberField(item, "valueScore"))}分`,
    title: priorityTitle(item)
  };
}

function gapAction(value: string): string {
  return userFacingText(value, "优先补充这一类介绍或活动线索。");
}

function gapLabel(value: string): string {
  return GAP_LABELS[value] ?? userFacingText(value, "待补齐的人脉覆盖");
}

function gapView(item: UnknownRecord): DashboardGapView {
  const currentCount = numberField(item, "currentCount");
  const targetCount = numberField(item, "targetCount");
  const severity = stringField(item, "severity").toLowerCase();

  return {
    action: gapAction(stringField(item, "recommendedAction")),
    detail: `当前 ${currentCount} / 目标 ${targetCount}`,
    id: stringField(item, "gapId", "gap"),
    label: gapLabel(stringField(item, "label")),
    severityLabel: SEVERITY_LABELS[severity] ?? "中"
  };
}

function industryLabel(value: string): string {
  return INDUSTRY_LABELS[value] ?? userFacingText(value, "其他人脉");
}

function industryView(item: UnknownRecord): DashboardIndustryView {
  const organizations = listField(item, "topOrganizations")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, 3);

  return {
    countLabel: `${numberField(item, "contactCount")} 人`,
    id: stringField(item, "bucketId", "industry"),
    label: industryLabel(stringField(item, "label")),
    organizations: organizations.join("、"),
    percentage: numberField(item, "percentage")
  };
}

function valueTypeLabel(item: UnknownRecord): string {
  const valueType = stringField(item, "valueType");
  const label = stringField(item, "label");

  return VALUE_TYPE_LABELS[valueType] ?? VALUE_TYPE_LABELS[label] ?? userFacingText(label, "关系价值");
}

function valueTypeView(item: UnknownRecord): DashboardValueTypeView {
  const valueType = stringField(item, "valueType", stringField(item, "label", "value"));

  return {
    countLabel: `${numberField(item, "relationshipCount")} 段`,
    id: valueType,
    label: valueTypeLabel(item),
    percentage: numberField(item, "percentage")
  };
}

function strengthView(item: UnknownRecord): DashboardStrengthView {
  const strength = stringField(item, "strength", "warm").toLowerCase();
  const risk = stringField(item, "followupRisk").toLowerCase();

  return {
    countLabel: `${numberField(item, "relationshipCount")} 段`,
    id: strength,
    label: STRENGTH_LABELS[strength] ?? "温关系",
    percentage: numberField(item, "percentage"),
    riskLabel: RISK_LABELS[risk] ?? "需要留意"
  };
}

function activityLabel(item: UnknownRecord): string {
  const label = stringField(item, "label");
  const addedMatch = /^(.+?) added to (?:the )?live relationship database$/iu.exec(label);

  if (addedMatch?.[1]?.trim()) {
    return `新增联系人 ${addedMatch[1].trim()}`;
  }

  return userFacingText(label, "关系记录有更新");
}

function sourceDetail(value: string): string {
  if (/^confirmed offline meeting note for /iu.test(value)) {
    return "线下会议记录";
  }

  if (/^direct qr scan for /iu.test(value)) {
    return "二维码记录";
  }

  if (/^warm referral for /iu.test(value)) {
    return "朋友介绍";
  }

  if (/^business card exchange for /iu.test(value)) {
    return "名片交换";
  }

  return userFacingText(value, "关系来源");
}

function activityView(item: UnknownRecord): DashboardActivityView {
  const type = stringField(item, "type");

  return {
    detail: sourceDetail(stringField(item, "sourceLabel")),
    id: stringField(item, "activityId", "activity"),
    label: activityLabel(item),
    time: formatDateTime(stringField(item, "occurredAt")),
    typeLabel: ACTIVITY_TYPE_LABELS[type] ?? "关系更新"
  };
}

function totalMetricValue(metrics: DashboardMetricView[]): number {
  return metrics.reduce((total, metric) => {
    const value = Number.parseInt(metric.value, 10);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function dashboardToView(input: DashboardViewInput): DashboardView {
  const aggregate = recordInput(input.aggregate);
  const summary = recordInput(input.summary);
  const opportunities = recordInput(input.opportunities);
  const gaps = recordInput(input.gaps);
  const distributions = recordInput(input.distributions);
  const metrics = dashboardMetrics(summary, aggregate);
  const hasDashboardContext =
    listField(gaps, "gaps").length > 0 ||
    listField(distributions, "industryDistribution").length > 0 ||
    listField(opportunities, "highPriorityOpportunities").length > 0 ||
    listField(opportunities, "dormantHighValueContacts").length > 0;
  const hasData = totalMetricValue(metrics) > 0 || hasDashboardContext;
  const summaryText = firstUserFacing(
    [
      stringField(summary, "summary"),
      stringField(aggregate, "summary"),
      stringField(gaps, "summary"),
      stringField(opportunities, "summary"),
      stringField(distributions, "summary")
    ],
    hasDashboardContext
      ? "先看关系覆盖，再处理最该推进的跟进。"
      : "关系数据还不完整，先从待跟进开始。"
  );
  const nextAction = firstUserFacing(
    [
      stringField(opportunities, "nextAction"),
      stringField(gaps, "nextAction"),
      stringField(aggregate, "nextAction"),
      stringField(distributions, "nextAction")
    ],
    hasDashboardContext
      ? "先处理最高分的跟进，再补齐覆盖最弱的人脉。"
      : "先补一条联系人或跟进记录。"
  );
  const coverageScore = Math.max(0, Math.min(100, numberField(gaps, "coverageScore")));

  return {
    coverageScore,
    coverageScoreLabel: `覆盖度 ${coverageScore}%`,
    gaps: listField(gaps, "gaps").filter(isRecord).slice(0, 4).map(gapView),
    industries: listField(distributions, "industryDistribution")
      .filter(isRecord)
      .slice(0, 5)
      .map(industryView),
    metrics,
    nextAction,
    priority: priorityView(opportunities),
    recentActivity: listField(aggregate, "recentActivity")
      .filter(isRecord)
      .slice(0, 4)
      .map(activityView),
    strengths: listField(distributions, "relationshipStrengthDistribution")
      .filter(isRecord)
      .slice(0, 3)
      .map(strengthView),
    summary: summaryText,
    title: "关系仪表盘",
    valueTypes: listField(distributions, "valueTypeDistribution")
      .filter(isRecord)
      .slice(0, 4)
      .map(valueTypeView)
  };
}
