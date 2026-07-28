import { connectionEvidencePath, connectionProfilePath } from "../api/endpoints";

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

export interface ConnectionEvidenceSourceLinkView {
  detail: string;
  id: string;
  label: string;
}

export interface ConnectionEvidenceTimelineView {
  detail: string;
  excerpt: string;
  id: string;
  title: string;
}

export interface ConnectionEvidenceDetailView {
  connectionId: string;
  connectionLine: string;
  kind: "empty" | "ready";
  nextAction: string;
  safetyText: string;
  sourceLinks: ConnectionEvidenceSourceLinkView[];
  summary: string;
  timeline: ConnectionEvidenceTimelineView[];
  title: string;
}

export interface ConnectionProfileMutualValueView {
  label: string;
  value: string;
}

export interface ConnectionProfilePreviewView {
  context: string;
  kind: "empty" | "ready";
  mutualValues: ConnectionProfileMutualValueView[];
  nextActionDetail: string;
  nextActionDue: string;
  nextActionTitle: string;
  profileLine: string;
  safetyText: string;
  summary: string;
  title: string;
}

export type ConnectionEvidenceAddRequestResult =
  | {
      request: {
        body: {
          contribution: "user_note";
          excerpt: string;
          occurredAt?: string;
          sourceLabel: "iOS 手动补充";
          sourceType: "manual";
          title: string;
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export type ConnectionProfilePreviewRequestResult =
  | {
      request: {
        body: {
          context: string;
          mutualValue: {
            contactReceives: string;
            orbitUserReceives: string;
            valueTypes: ["commercial_opportunity", "knowledge_exchange"];
          };
          nextAction: {
            label: string;
            rationale: string;
          };
          relationshipType: "partner_candidate";
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export interface ConnectionEvidenceAddRequestInput {
  connectionId: string;
  excerpt: string;
  occurredAt?: string | null;
  title: string;
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

const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  community_bridge: "社群连接",
  customer_candidate: "客户候选",
  event_peer: "活动同行",
  mentor_or_advisor: "顾问导师",
  partner_candidate: "合作伙伴"
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  commercial_opportunity: "商业机会",
  knowledge_exchange: "知识交换",
  warm_intro: "可信介绍"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function nestedRecord(
  record: UnknownRecord,
  fieldName: string
): UnknownRecord | null {
  const value = record[fieldName];
  return isRecord(value) ? value : null;
}

function stringListField(record: UnknownRecord, fieldName: string): string[] {
  return listField(record, fieldName).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clean(value: string): string {
  return value.trim();
}

function optionalClean(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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

function relationshipTypeLabel(value: string): string {
  return RELATIONSHIP_TYPE_LABELS[value] ?? "关系画像";
}

function valueTypeLabel(value: string): string {
  return VALUE_TYPE_LABELS[value] ?? value;
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

function contributionLabel(value: string): string {
  switch (value) {
    case "origin":
      return "来源";
    case "context":
      return "背景";
    case "follow_up_signal":
      return "跟进信号";
    case "introduced_by":
      return "引荐";
    case "user_note":
      return "手动记录";
    default:
      return "证据";
  }
}

function contributionTitle(value: string): string {
  switch (value) {
    case "origin":
      return "关系来源";
    case "context":
      return "关系背景";
    case "follow_up_signal":
      return "跟进记录";
    case "introduced_by":
      return "引荐来源";
    case "user_note":
      return "手动记录";
    default:
      return "关系证据";
  }
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

function detailConnection(data: unknown): UnknownRecord | null {
  if (!isRecord(data)) {
    return null;
  }

  const connection = data.connection;
  return isRecord(connection) ? connection : null;
}

function evidenceTimelineRecords(data: UnknownRecord): UnknownRecord[] {
  return listField(data, "evidenceTimeline").filter(isRecord);
}

function sourceLinkRecords(data: UnknownRecord): UnknownRecord[] {
  return listField(data, "sourceLinks").filter(isRecord);
}

function sourceLinkView(link: UnknownRecord): ConnectionEvidenceSourceLinkView {
  return {
    detail: formatDateTime(stringField(link, "capturedAt")),
    id: stringField(link, "evidenceId", stringField(link, "id", "source")),
    label: sourceLabel({ sourceLinks: [link] })
  };
}

function evidenceTimelineView(
  item: UnknownRecord
): ConnectionEvidenceTimelineView {
  const contribution = stringField(item, "contribution");
  const occurredAt = stringField(item, "occurredAt");

  return {
    detail: [contributionLabel(contribution), formatDateTime(occurredAt)]
      .filter(Boolean)
      .join(" · "),
    excerpt: userFacingText(
      stringField(item, "excerpt"),
      "这条证据需要打开原记录复核。"
    ),
    id: stringField(item, "evidenceId", "evidence"),
    title: userFacingText(stringField(item, "title"), contributionTitle(contribution))
  };
}

function connectionLine(connection: UnknownRecord): string {
  const score = numberField(connection, "strengthScore", Number.NaN);
  const parts = [
    stringField(connection, "organization"),
    stringField(connection, "role"),
    Number.isNaN(score) ? "" : `${score}分`
  ];

  return parts.filter(Boolean).join(" · ") || "关系信息待补充";
}

export function connectionEvidenceDetailToView(
  data: unknown
): ConnectionEvidenceDetailView {
  const record = isRecord(data) ? data : {};
  const connection = detailConnection(record);
  const sourceLinks = sourceLinkRecords(record).map(sourceLinkView);
  const timeline = evidenceTimelineRecords(record).map(evidenceTimelineView);

  if (!connection || timeline.length === 0) {
    return {
      connectionId: connection ? stringField(connection, "id") : "",
      connectionLine: "关系信息待补充",
      kind: "empty",
      nextAction: "先补一条联系人来源，再建立关系连接。",
      safetyText: "只读取关系证据，不会外发消息或写入日历。",
      sourceLinks,
      summary: "这条关系还没有可复核的来源。",
      timeline,
      title: "暂无证据链"
    };
  }

  return {
    connectionId: stringField(connection, "id"),
    connectionLine: connectionLine(connection),
    kind: "ready",
    nextAction: userFacingText(
      stringField(record, "nextAction"),
      "先复核关系证据，再推进下一步。"
    ),
    safetyText: "只读取关系证据，不会外发消息或写入日历。",
    sourceLinks,
    summary: `已整理 ${timeline.length} 条证据和 ${sourceLinks.length} 个来源。`,
    timeline,
    title: `${stringField(connection, "displayName", "这位联系人")}的证据链`
  };
}

export function buildConnectionEvidenceAddRequest(
  input: ConnectionEvidenceAddRequestInput
): ConnectionEvidenceAddRequestResult {
  const connectionId = clean(input.connectionId);
  const title = clean(input.title);
  const excerpt = clean(input.excerpt);
  const occurredAt = optionalClean(input.occurredAt);

  if (!connectionId || !excerpt) {
    return {
      error: "需要写清楚证据内容，才能补充到关系里。",
      success: false
    };
  }

  return {
    request: {
      body: {
        contribution: "user_note",
        excerpt,
        ...(occurredAt ? { occurredAt } : {}),
        sourceLabel: "iOS 手动补充",
        sourceType: "manual",
        title: title || "手动补充关系证据"
      },
      endpoint: connectionEvidencePath(connectionId)
    },
    success: true
  };
}

export function buildConnectionProfilePreviewRequest(
  connection: ConnectionPriorityView
): ConnectionProfilePreviewRequestResult {
  const connectionId = clean(connection.id);
  const name = clean(connection.name) || "这位联系人";

  if (!connectionId) {
    return {
      error: "这条关系缺少编号，暂时不能生成画像。",
      success: false
    };
  }

  return {
    request: {
      body: {
        context: `${name}目前适合从关系背景、互惠价值和下一步动作三个维度复核。`,
        mutualValue: {
          contactReceives: `${name}可以获得有明确上下文的资源、介绍或业务线索。`,
          orbitUserReceives: `你可以通过${name}的经验、渠道或需求判断下一步合作机会。`,
          valueTypes: ["commercial_opportunity", "knowledge_exchange"]
        },
        nextAction: {
          label: `复核${name}的下一步跟进`,
          rationale: "先确认双方各自能获得什么，再决定是否发送消息或安排会面。"
        },
        relationshipType: "partner_candidate"
      },
      endpoint: connectionProfilePath(connectionId)
    },
    success: true
  };
}

export function connectionProfileToView(data: unknown): ConnectionProfilePreviewView {
  const record = isRecord(data) ? data : {};
  const profile = nestedRecord(record, "profile");
  const mutualValue = profile ? nestedRecord(profile, "mutualValue") : null;
  const profileNextAction = profile ? nestedRecord(profile, "nextAction") : null;
  const valueTypes = mutualValue ? stringListField(mutualValue, "valueTypes") : [];

  if (!profile) {
    return {
      context: "这条关系还没有足够信息生成画像。",
      kind: "empty",
      mutualValues: [],
      nextActionDetail: "先补一条联系人来源，再建立关系连接。",
      nextActionDue: "",
      nextActionTitle: "继续补充关系背景",
      profileLine: "关系信息待补充",
      safetyText: "只生成关系画像预览，不会外发消息、写入日历或通知。",
      summary: "还没有可复核的关系画像。",
      title: "暂无关系画像"
    };
  }

  const name = stringField(profile, "displayName", "这位联系人");
  const contactReceives = userFacingText(
    stringField(mutualValue ?? {}, "contactReceives"),
    "对方可以获得有明确上下文的资源、介绍或业务线索。"
  );
  const orbitUserReceives = userFacingText(
    stringField(mutualValue ?? {}, "orbitUserReceives"),
    "你可以获得更清晰的合作机会和关系判断。"
  );
  const valueTypeText = valueTypes.map(valueTypeLabel).join("、");

  return {
    context: userFacingText(
      stringField(profile, "context"),
      "这条关系适合从背景、互惠价值和下一步动作三个维度复核。"
    ),
    kind: "ready",
    mutualValues: [
      { label: "对方获得", value: contactReceives },
      { label: "你获得", value: orbitUserReceives },
      { label: "价值类型", value: valueTypeText || "待判断" }
    ],
    nextActionDetail: userFacingText(
      stringField(profileNextAction ?? {}, "rationale"),
      "先确认双方各自能获得什么，再决定是否发送消息或安排会面。"
    ),
    nextActionDue: formatDateTime(stringField(profileNextAction ?? {}, "dueAt")),
    nextActionTitle: userFacingText(
      stringField(profileNextAction ?? {}, "label"),
      `复核${name}的下一步跟进`
    ),
    profileLine: [
      relationshipTypeLabel(stringField(profile, "relationshipType")),
      stageLabel(stringField(profile, "relationshipStage"))
    ]
      .filter(Boolean)
      .join(" · "),
    safetyText: "只生成关系画像预览，不会外发消息、写入日历或通知。",
    summary: userFacingText(
      stringField(record, "summary"),
      "已生成关系画像预览，复核后再使用。"
    ),
    title: `${name}的关系画像`
  };
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
