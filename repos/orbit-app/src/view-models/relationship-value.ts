export interface RelationshipValueReadyFactorView {
  label: string;
  pointsLabel: string;
}

export type RelationshipValueCardView =
  | {
      evidenceLines: string[];
      factors: RelationshipValueReadyFactorView[];
      kind: "ready";
      nextAction: string;
      priorityLabel: string;
      safetyText: string;
      scoreLabel: string;
      summary: string;
    }
  | {
      body: string;
      kind: "empty" | "pending";
      nextAction: string;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  fieldName: string
): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function firstString(values: readonly string[]): string | null {
  return values.find((value) => value.trim().length > 0)?.trim() ?? null;
}

function contactRecord(data: unknown): UnknownRecord {
  if (!isRecord(data)) {
    return {};
  }

  return isRecord(data.contact) ? data.contact : data;
}

function connectionRecords(data: unknown): UnknownRecord[] {
  if (!isRecord(data)) {
    return [];
  }

  return listField(data, "connections").filter(isRecord);
}

export function relationshipConnectionIdForContact(
  contactPayload: unknown,
  connectionsPayload: unknown,
  fallbackContactId: string
): string | null {
  const contact = contactRecord(contactPayload);
  const nestedConnection = isRecord(contact.connection) ? contact.connection : {};
  const directId = firstString([
    stringField(contact, "connectionId"),
    stringField(contact, "relationshipConnectionId"),
    stringField(contact, "primaryConnectionId"),
    stringField(nestedConnection, "id")
  ]);

  if (directId) {
    return directId;
  }

  const contactId = stringField(contact, "id", fallbackContactId).trim();

  if (!contactId) {
    return null;
  }

  const connection = connectionRecords(connectionsPayload).find(
    (item) => stringField(item, "contactId") === contactId
  );

  return connection ? stringField(connection, "id") || null : null;
}

function relationshipValueTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    community_bridge: "社群连接",
    event_follow_up: "活动跟进",
    low_context: "背景补充",
    strategic_intro: "战略引荐"
  };

  return labels[value] ?? "关系判断";
}

function priorityLabel(value: string): string {
  const labels: Record<string, string> = {
    critical: "优先处理",
    high: "高优先级",
    low: "低优先级",
    medium: "中优先级"
  };

  return labels[value] ?? "待判断";
}

function factorLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "clear operator-introduction fit": "适合做运营方引荐",
    "selected evidence confirms business context": "证据能说明业务背景",
    "suggested action remains time-sensitive": "下一步有时间窗口",
    "time-sensitive follow-up path": "跟进窗口还开着"
  };

  return labels[normalized] ?? value.trim();
}

function evidenceLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "climate founders dinner": "气候创始人晚宴",
    "follow-up path identified": "已确认跟进路径",
    "partner review email context": "合作方复盘邮件线索",
    "storage pilot note": "储能试点记录"
  };

  return labels[normalized] ?? value.trim();
}

function contributionLabel(value: string): string {
  const labels: Record<string, string> = {
    business_context: "业务背景",
    decision_window: "决策窗口",
    follow_up_urgency: "跟进窗口",
    met_at_event: "活动见过"
  };

  return labels[value] ?? "来源证据";
}

function actionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "send the storage pilot operator introduction": "发一条储能试点运营方引荐",
    "use the selected evidence before sending the introduction": "先用选中的证据复核引荐"
  };

  return (labels[normalized] ?? value.trim()) || "先复核证据";
}

function dueWindowLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    "before friday partner review": "周五合作方复盘前"
  };

  return labels[normalized] ?? value.trim();
}

function confidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    high: "把握较高",
    low: "把握较低",
    medium: "把握中等"
  };

  return labels[value] ?? "";
}

function readySummary(assessment: UnknownRecord): string {
  const name = stringField(assessment, "contactDisplayName", "这位联系人");
  const valueType = relationshipValueTypeLabel(
    stringField(assessment, "relationshipValueType")
  );
  const score = isRecord(assessment.priorityScore)
    ? numberField(assessment.priorityScore, "value")
    : null;
  const highPriority = score === null || score >= 70;

  return highPriority
    ? `${name} 适合优先跟进。当前证据支持${valueType}。`
    : `${name} 可以先低频维护。当前证据更适合${valueType}。`;
}

function readyFactors(priorityScore: UnknownRecord): RelationshipValueReadyFactorView[] {
  return listField(priorityScore, "factors")
    .filter(isRecord)
    .slice(0, 3)
    .map((factor) => ({
      label: factorLabel(stringField(factor, "label", "评分因子")),
      pointsLabel: `+${numberField(factor, "points") ?? 0}`
    }));
}

function readyEvidence(rationale: UnknownRecord): string[] {
  return listField(rationale, "evidence")
    .filter(isRecord)
    .slice(0, 3)
    .map((evidence) => {
      const contribution = contributionLabel(stringField(evidence, "contribution"));
      const label = evidenceLabel(stringField(evidence, "label", "来源记录"));

      return `${contribution}：${label}`;
    });
}

function readyNextAction(assessment: UnknownRecord, fallback: string): string {
  const action = isRecord(assessment.suggestedNextAction)
    ? assessment.suggestedNextAction
    : {};
  const segments = [
    actionLabel(stringField(action, "label", fallback)),
    dueWindowLabel(stringField(action, "dueWindow")),
    confidenceLabel(stringField(action, "confidence"))
  ].filter(Boolean);

  return segments.length > 0 ? segments.join(" · ") : "先复核证据，再决定下一步。";
}

export function relationshipValueToView(data: unknown): RelationshipValueCardView {
  const record = isRecord(data) ? data : {};
  const state = stringField(record, "state");

  if (state === "pending") {
    return {
      body: "关系价值还在复核。现在先看来源证据，不急着推进。",
      kind: "pending",
      nextAction: "等证据复核完成。"
    };
  }

  const assessment = isRecord(record.assessment) ? record.assessment : null;

  if (!assessment || state === "empty") {
    return {
      body: "这条关系还没有足够证据。先补来源，再判断是否值得投入时间。",
      kind: "empty",
      nextAction: "先补一条来源证据。"
    };
  }

  const priorityScore = isRecord(assessment.priorityScore)
    ? assessment.priorityScore
    : {};
  const rationale = isRecord(assessment.rationale) ? assessment.rationale : {};
  const score = numberField(priorityScore, "value") ?? 0;

  return {
    evidenceLines: readyEvidence(rationale),
    factors: readyFactors(priorityScore),
    kind: "ready",
    nextAction: readyNextAction(assessment, stringField(record, "nextAction")),
    priorityLabel: priorityLabel(stringField(priorityScore, "band")),
    safetyText: "只读分析，未发送消息。",
    scoreLabel: `${score} 分`,
    summary: readySummary(assessment)
  };
}

export function relationshipValueStateIsEmpty(data: unknown): boolean {
  return relationshipValueToView(data).kind !== "ready";
}
