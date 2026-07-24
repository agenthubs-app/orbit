export interface ConnectionGraphMetricView {
  label: string;
  value: string;
}

export interface ConnectionStageView {
  count: number;
  id: string;
  label: string;
}

export interface ConnectionPriorityView {
  contactId: string;
  detail: string;
  id: string;
  lastTouchedAt: string;
  name: string;
  nextAction: string;
  organization: string;
  role: string;
  scoreLabel: string;
  sourceLabel: string;
  stageLabel: string;
}

export interface ConnectionGraphView {
  metrics: ConnectionGraphMetricView[];
  nextAction: string;
  priorityConnections: ConnectionPriorityView[];
  stages: ConnectionStageView[];
  summary: string;
  title: string;
}

type UnknownRecord = Record<string, unknown>;

const STAGE_LABELS: Record<string, string> = {
  active: "推进中",
  captured: "已记录",
  needs_follow_up: "待跟进",
  nurture: "长期维护",
  nurtured: "长期维护",
  partnered: "已合作",
  reviewing: "待复核",
  to_contact: "待联系"
};

const STAGE_ORDER = [
  "active",
  "captured",
  "needs_follow_up",
  "nurture",
  "reviewing",
  "nurtured",
  "partnered",
  "to_contact"
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
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

function containsCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
}

function containsImplementationLabel(value: string): boolean {
  return /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|live evidence|live connection|live store|live-store|database|postgres|external network|provider|current-user|workflow|agent use|createdBy)\b/iu.test(
    value
  );
}

function userFacingText(value: string, fallback = ""): string {
  const text = value.trim();

  if (!text || containsImplementationLabel(text) || !containsCjk(text)) {
    return fallback;
  }

  return text;
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

function stageLabel(value: string): string {
  return STAGE_LABELS[value] ?? "已记录";
}

function sourceLabel(item: UnknownRecord): string {
  const sourceLinks = listField(item, "sourceLinks").filter(isRecord);
  const source = sourceLinks[0] ?? {};
  const label = stringField(source, "label");
  const type = stringField(source, "type");

  if (/^direct qr scan for /iu.test(label) || type === "qr_scan" || type === "event_import") {
    return "二维码记录";
  }

  if (/^confirmed offline meeting note for /iu.test(label) || type === "manual") {
    return containsImplementationLabel(label) ? "关系证据" : "线下会议记录";
  }

  if (/^warm referral for /iu.test(label) || type === "referral") {
    return "朋友介绍";
  }

  if (/^business card exchange for /iu.test(label)) {
    return "名片交换";
  }

  return "关系证据";
}

function connectionDetail(item: UnknownRecord): string {
  const name = stringField(item, "displayName", "这位联系人");
  const reason = stringField(item, "connectionReason");

  if (/has a concrete current-user relationship record/iu.test(reason)) {
    return `${name}有可复核的关系背景。`;
  }

  if (/\bmatches\b.+\bthrough\b/iu.test(reason)) {
    return `${name}和当前目标有匹配。`;
  }

  return userFacingText(reason, `${name}有一条可复核的关系连接。`);
}

function nextAction(item: UnknownRecord): string {
  const name = stringField(item, "displayName", "这位联系人");
  const action = stringField(item, "nextAction");
  const reviewMatch = /^review (?:the )?next follow-up for (.+?)\.?$/iu.exec(action);

  if (reviewMatch?.[1]?.trim()) {
    return `跟进${reviewMatch[1].trim()} 的关系进展。`;
  }

  if (/^review .+ with source evidence before agent use\.?$/iu.test(action)) {
    return `跟进${name} 的关系进展。`;
  }

  return userFacingText(action, "先整理关系背景，再安排一次具体跟进。");
}

function evidenceBacked(item: UnknownRecord): boolean {
  return (
    listField(item, "sourceLinks").length > 0 ||
    listField(item, "evidenceTimeline").length > 0
  );
}

function priorityConnection(item: UnknownRecord): ConnectionPriorityView {
  return {
    contactId: stringField(item, "contactId"),
    detail: connectionDetail(item),
    id: stringField(item, "id", "connection"),
    lastTouchedAt: formatDateTime(stringField(item, "lastTouchedAt")),
    name: stringField(item, "displayName", "联系人"),
    nextAction: nextAction(item),
    organization: stringField(item, "organization"),
    role: stringField(item, "role"),
    scoreLabel: `${numberField(item, "strengthScore")}分`,
    sourceLabel: sourceLabel(item),
    stageLabel: stageLabel(stringField(item, "relationshipStage"))
  };
}

function connectionRecords(data: unknown): UnknownRecord[] {
  if (!isRecord(data)) {
    return [];
  }

  return listField(data, "connections").filter(isRecord);
}

export function connectionGraphToView(data: unknown): ConnectionGraphView {
  const record = isRecord(data) ? data : {};
  const connections = connectionRecords(data);
  const total = connections.length;
  const followupCount = connections.filter(
    (item) => stringField(item, "relationshipStage") === "needs_follow_up"
  ).length;
  const strongCount = connections.filter(
    (item) => numberField(item, "strengthScore") >= 70
  ).length;
  const evidenceCount = connections.filter(evidenceBacked).length;
  const stageCounts = new Map<string, number>();

  for (const item of connections) {
    const stage = stringField(item, "relationshipStage", "captured");
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }

  return {
    metrics: [
      { label: "总连接", value: String(total) },
      { label: "待跟进", value: String(followupCount) },
      { label: "强关系", value: String(strongCount) },
      { label: "有证据", value: String(evidenceCount) }
    ],
    nextAction:
      total > 0
        ? userFacingText(
            stringField(record, "nextAction"),
            "先复核关系证据，再推进下一步。"
          )
        : "先补一条联系人来源，再建立关系连接。",
    priorityConnections: [...connections]
      .sort((left, right) => {
        const leftNeedsFollowup =
          stringField(left, "relationshipStage") === "needs_follow_up" ? 1 : 0;
        const rightNeedsFollowup =
          stringField(right, "relationshipStage") === "needs_follow_up" ? 1 : 0;

        return (
          rightNeedsFollowup - leftNeedsFollowup ||
          numberField(right, "strengthScore") - numberField(left, "strengthScore")
        );
      })
      .slice(0, 5)
      .map(priorityConnection),
    stages: [...stageCounts.entries()]
      .sort(
        ([left], [right]) =>
          (STAGE_ORDER.includes(left) ? STAGE_ORDER.indexOf(left) : 999) -
          (STAGE_ORDER.includes(right) ? STAGE_ORDER.indexOf(right) : 999)
      )
      .map(([id, count]) => ({
        count,
        id,
        label: stageLabel(id)
      })),
    summary:
      total > 0
        ? `${total} 段关系连接，先看需要跟进和强度最高的人。`
        : "还没有关系连接。先从联系人或活动记录开始。",
    title: "人脉图谱"
  };
}
