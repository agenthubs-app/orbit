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

export interface DashboardOpportunitiesRecomputeView {
  detail: string;
  nextAction: string;
  statusLabel: string;
  title: string;
}

export interface DashboardAuditCollectionView {
  countLabel: string;
  evidenceLabel: string;
  id: string;
  label: string;
  statusLabel: string;
}

export interface DashboardAuditFindingView {
  detail: string;
  evidenceLabel: string;
  id: string;
  remediation: string;
  severityLabel: string;
  title: string;
}

export interface DashboardAuditView {
  collections: DashboardAuditCollectionView[];
  coverageLabel: string;
  findings: DashboardAuditFindingView[];
  nextAction: string;
  safetyText: string;
  statusLabel: string;
  summary: string;
  title: string;
}

export interface DashboardAuditRunView {
  detail: string;
  nextAction: string;
  statusLabel: string;
  title: string;
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

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  agent_action: "Agent 动作",
  chat_summary: "聊天摘要",
  connection: "关系",
  contact: "联系人",
  evidence: "证据",
  recommendation: "推荐",
  task: "任务"
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

function booleanField(
  record: UnknownRecord,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
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

function evidenceCountLabel(record: UnknownRecord): string {
  return `证据 ${listField(record, "evidenceIds").length} 条`;
}

function auditEntityLabel(value: string): string {
  return AUDIT_ENTITY_LABELS[value] ?? userFacingText(value, "来源记录");
}

function auditCollectionView(
  item: UnknownRecord
): DashboardAuditCollectionView {
  const entityKind = stringField(item, "entityKind", "source");
  const sourceConsistent = booleanField(item, "sourceConsistent");
  const provenanceComplete = booleanField(item, "provenanceComplete");

  return {
    countLabel: `${numberField(item, "auditedCount")} 条`,
    evidenceLabel: evidenceCountLabel(item),
    id: entityKind,
    label: auditEntityLabel(entityKind),
    statusLabel: sourceConsistent && provenanceComplete ? "来源完整" : "需要复核"
  };
}

function auditFindingTitle(item: UnknownRecord): string {
  const entityKind = stringField(item, "entityKind");
  const title = stringField(item, "title");

  if (entityKind === "agent_action" || /agent action/iu.test(title)) {
    return "Agent 动作缺少确认来源";
  }

  if (entityKind === "recommendation" || /recommendation/iu.test(title)) {
    return "推荐缺少来源证据";
  }

  if (entityKind === "task" || /task/iu.test(title)) {
    return "任务来源需要刷新";
  }

  return userFacingText(title, "来源问题待复核");
}

function auditFindingRemediation(item: UnknownRecord): string {
  const remediation = stringField(item, "remediation");

  if (/confirmation guard|live execution/iu.test(remediation)) {
    return "先阻止对外动作，补齐确认来源记录。";
  }

  if (/attach|evidence/iu.test(remediation)) {
    return "先补齐证据来源，再展示给用户。";
  }

  if (/refresh/iu.test(remediation)) {
    return "先刷新这条记录的来源引用。";
  }

  return userFacingText(remediation, "先补齐来源证据，再继续下一步。");
}

function auditFindingView(item: UnknownRecord): DashboardAuditFindingView {
  const severity = stringField(item, "severity").toLowerCase();

  return {
    detail: userFacingText(
      stringField(item, "detail"),
      "这条来源问题需要先复核，确认后再继续。"
    ),
    evidenceLabel: evidenceCountLabel(item),
    id: stringField(item, "findingId", "audit-finding"),
    remediation: auditFindingRemediation(item),
    severityLabel: SEVERITY_LABELS[severity] ?? "中",
    title: auditFindingTitle(item)
  };
}

function auditSafetyText(provenance: UnknownRecord): string {
  const complianceReportingExecuted = booleanField(
    provenance,
    "complianceReportingExecuted"
  );
  const productionAuditStorageWriteExecuted = booleanField(
    provenance,
    "productionAuditStorageWriteExecuted"
  );

  if (complianceReportingExecuted || productionAuditStorageWriteExecuted) {
    return "这次审计可能触发了外部报告或生产存储，请先复核。";
  }

  return "没有生成合规报告，也没有写入生产审计存储。";
}

export function dashboardAuditToView(payload: unknown): DashboardAuditView {
  const envelope = recordInput(payload);
  const record = isRecord(envelope.data) ? envelope.data : envelope;
  const collections = listField(record, "auditedCollections")
    .filter(isRecord)
    .map(auditCollectionView);
  const findings = listField(record, "findings")
    .filter(isRecord)
    .map(auditFindingView);
  const activeFindingCount =
    numberField(record, "activeFindingCount", findings.length);
  const auditedCount = collections.reduce((total, collection) => {
    const count = Number.parseInt(collection.countLabel, 10);
    return total + (Number.isFinite(count) ? count : 0);
  }, 0);
  const provenance = nestedRecord(record, "provenance");
  const hasFindings = activeFindingCount > 0 || findings.length > 0;

  return {
    collections,
    coverageLabel:
      auditedCount > 0 ? `${auditedCount} 条记录已检查` : "等待来源审计",
    findings,
    nextAction: hasFindings
      ? "先处理高风险来源问题，再允许对外动作继续。"
      : "保持来源链完整，再继续机会提醒和 Agent 动作。",
    safetyText: auditSafetyText(provenance),
    statusLabel:
      activeFindingCount > 0 ? `${activeFindingCount} 个问题` : "来源正常",
    summary:
      collections.length > 0
        ? "已检查联系人、关系、证据和 AI 动作的来源链。"
        : "还没有可展示的来源审计记录。",
    title: "来源一致性审计"
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

export function dashboardOpportunitiesRecomputeToView(
  payload: unknown
): DashboardOpportunitiesRecomputeView {
  const envelope = recordInput(payload);
  const record = isRecord(envelope.data) ? envelope.data : envelope;
  const state = stringField(record, "state", "success");
  const evaluatedContacts = Math.max(
    0,
    numberField(record, "evaluatedContacts")
  );
  const generatedOpportunityCount = Math.max(
    0,
    numberField(record, "generatedOpportunityCount")
  );

  if (state === "pending") {
    return {
      detail: "机会提醒还在等待来源复核。",
      nextAction: "稍后刷新仪表盘，再决定是否重新计算。",
      statusLabel: "等待复核",
      title: "暂未重新计算"
    };
  }

  if (state === "empty") {
    return {
      detail: "当前没有可重算的联系人或目标。",
      nextAction: "先补充联系人、跟进记录或当前目标。",
      statusLabel: "没有可更新项",
      title: "机会提醒没有变化"
    };
  }

  return {
    detail: `检查了 ${evaluatedContacts} 位联系人，更新 ${generatedOpportunityCount} 条机会。`,
    nextAction: "已重新排序机会提醒，没有发送通知或写入任务。",
    statusLabel: "已重新计算",
    title: "机会提醒已更新"
  };
}

export function dashboardAuditRunToView(
  payload: unknown
): DashboardAuditRunView {
  const envelope = recordInput(payload);
  const record = isRecord(envelope.data) ? envelope.data : envelope;
  const state = stringField(record, "state", "success");
  const evaluatedRecordCount = Math.max(
    0,
    numberField(record, "evaluatedRecordCount")
  );
  const activeFindingCount = Math.max(
    0,
    numberField(record, "activeFindingCount")
  );
  const complianceReportPersisted = booleanField(
    record,
    "complianceReportPersisted"
  );
  const productionAuditStorageWritten = booleanField(
    record,
    "productionAuditStorageWritten"
  );

  if (state === "pending") {
    return {
      detail: "来源审计还在等待本地复核完成。",
      nextAction: "先保持结果可见，不触发外部报告或生产审计写入。",
      statusLabel: "等待审计",
      title: "来源审计待完成"
    };
  }

  if (state === "empty") {
    return {
      detail: "还没有来源记录可供审计。",
      nextAction: "先补联系人、关系或活动来源，再运行审计。",
      statusLabel: "暂无记录",
      title: "来源审计无记录"
    };
  }

  return {
    detail: `检查了 ${evaluatedRecordCount} 条记录，发现 ${activeFindingCount} 个来源问题。`,
    nextAction:
      complianceReportPersisted || productionAuditStorageWritten
        ? "这次审计可能触发了外部报告或生产存储，请先复核。"
        : "审计结果只用于复核，不会生成合规报告或写入生产审计库。",
    statusLabel: "已运行",
    title: "来源审计已更新"
  };
}
