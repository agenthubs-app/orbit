import {
  contactsToSummaries,
  type ContactSummary
} from "./contacts";

export type ContactPipelineStageId = "to_contact" | "in_progress" | "partnered";

export type ContactPipelineRelationshipStage = "active" | "needs_follow_up";

export interface ContactPipelineMetricView {
  label: string;
  value: string;
}

export interface ContactPipelineCardView {
  detail: string;
  id: string;
  name: string;
  nextAction: string;
  relationship: string;
  stageAction: ContactPipelineStageActionView | null;
  valueLabels: string[];
  valueScoreLabel: string | null;
}

export interface ContactPipelineStageActionView {
  connectionId: string;
  label: string;
  nextRelationshipStage: ContactPipelineRelationshipStage;
  pendingLabel: string;
  successMessage: string;
}

export interface ContactPipelineStageView {
  contacts: ContactPipelineCardView[];
  count: number;
  detail: string;
  id: ContactPipelineStageId;
  label: string;
}

export interface ContactIntroCandidateView {
  contactId: string;
  detail: string;
  id: string;
  name: string;
  nextAction: string;
  reason: string;
  sourceLabel: string;
  strengthLabel: string;
}

export interface ContactIntroReadinessView {
  apiGap: string;
  candidates: ContactIntroCandidateView[];
  summary: string;
  title: string;
}

export interface ContactPipelineView {
  introReadiness: ContactIntroReadinessView;
  metrics: ContactPipelineMetricView[];
  stages: ContactPipelineStageView[];
  summary: string;
  title: string;
}

interface ContactPipelineInput {
  connectionsPayload: unknown;
  contactsPayload: unknown;
}

type UnknownRecord = Record<string, unknown>;

const STAGES: Array<{
  detail: string;
  id: ContactPipelineStageId;
  label: string;
}> = [
  {
    detail: "需要先发起或重新确认下一步。",
    id: "to_contact",
    label: "待联系"
  },
  {
    detail: "已经有明确交流或合作线索。",
    id: "in_progress",
    label: "在推进"
  },
  {
    detail: "已经形成合作或稳定互助。",
    id: "partnered",
    label: "已合作"
  }
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function listFromPayload(value: unknown, fieldName: string): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  return listField(value, fieldName).filter(isRecord);
}

function stringField(
  record: UnknownRecord,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(record: UnknownRecord, fieldName: string): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contactDetail(contact: ContactSummary): string {
  const organization = contact.organization === "Independent" ? "" : contact.organization;
  return [organization, contact.role].filter(Boolean).join(" · ") || "关系信息待补充";
}

function rawValueScore(contact: UnknownRecord): number | null {
  const value = contact.value;
  return isRecord(value) ? numberField(value, "score") : null;
}

function valueScoreLabel(contact: ContactSummary, rawContact: UnknownRecord): string | null {
  const score = contact.valueScore ?? rawValueScore(rawContact);
  return score === null ? null : `${score}分`;
}

function connectionRecords(data: unknown): UnknownRecord[] {
  return listFromPayload(data, "connections");
}

function connectionsByContactId(data: unknown): Map<string, UnknownRecord> {
  const map = new Map<string, UnknownRecord>();

  for (const connection of connectionRecords(data)) {
    const contactId = stringField(connection, "contactId");
    if (contactId && !map.has(contactId)) {
      map.set(contactId, connection);
    }
  }

  return map;
}

function stageFromToken(value: string): ContactPipelineStageId | null {
  const normalized = value.trim().toLowerCase();

  if (["partnered", "partner", "合作", "已合作"].includes(normalized)) {
    return "partnered";
  }

  if (
    [
      "captured",
      "needs_follow_up",
      "reviewing",
      "to_contact",
      "待复核",
      "待跟进",
      "待联系"
    ].includes(normalized)
  ) {
    return "to_contact";
  }

  if (
    [
      "active",
      "dormant",
      "in_progress",
      "nurture",
      "nurtured",
      "weak",
      "培养中",
      "推进中",
      "在推进"
    ].includes(normalized)
  ) {
    return "in_progress";
  }

  return null;
}

function pipelineStageId(
  contact: ContactSummary,
  rawContact: UnknownRecord,
  connection?: UnknownRecord
): ContactPipelineStageId {
  return (
    stageFromToken(stringField(rawContact, "pipelineStatus")) ??
    stageFromToken(stringField(rawContact, "status")) ??
    stageFromToken(connection ? stringField(connection, "relationshipStage") : "") ??
    stageFromToken(contact.status) ??
    "in_progress"
  );
}

function sourceLabel(connection?: UnknownRecord): string {
  if (!connection) {
    return "联系人记录";
  }

  const source = listField(connection, "sourceLinks").filter(isRecord)[0];
  const label = source ? stringField(source, "label") : "";
  const type = source ? stringField(source, "type") : "";

  if (type === "referral" || /^warm referral for /iu.test(label)) {
    return "朋友介绍";
  }

  if (type === "qr_scan" || type === "event_import" || /^direct qr scan for /iu.test(label)) {
    return "二维码记录";
  }

  if (type === "manual") {
    return "关系证据";
  }

  return "联系人记录";
}

function hasReferralSource(connection?: UnknownRecord): boolean {
  if (!connection) {
    return false;
  }

  const source = listField(connection, "sourceLinks").filter(isRecord)[0];
  const label = source ? stringField(source, "label") : "";
  const type = source ? stringField(source, "type") : "";
  return type === "referral" || /^warm referral for /iu.test(label);
}

function strengthScore(connection?: UnknownRecord): number | null {
  return connection ? numberField(connection, "strengthScore") : null;
}

function introReason(contact: ContactSummary, connection?: UnknownRecord): string {
  if (contact.valueLabels.includes("引荐路径")) {
    return "有明确的引荐路径，适合先整理双方需求。";
  }

  if (hasReferralSource(connection)) {
    return "来自朋友介绍，适合先整理双方需求。";
  }

  return "关系背景清楚，可以先确认是否适合牵线。";
}

function introCandidate(
  contact: ContactSummary,
  connection?: UnknownRecord
): ContactIntroCandidateView {
  const score = strengthScore(connection);

  return {
    contactId: contact.id,
    detail: contactDetail(contact),
    id: contact.id,
    name: contact.name,
    nextAction: "先确认双方需求，再写一段引荐词。",
    reason: introReason(contact, connection),
    sourceLabel: sourceLabel(connection),
    strengthLabel: score === null ? "关系待评分" : `${score}分`
  };
}

function contactCard(
  contact: ContactSummary,
  rawContact: UnknownRecord,
  connection?: UnknownRecord
): ContactPipelineCardView {
  return {
    detail: contactDetail(contact),
    id: contact.id,
    name: contact.name,
    nextAction: contact.nextAction,
    relationship: contact.relationship,
    stageAction: stageAction(contact, rawContact, connection),
    valueLabels: contact.valueLabels,
    valueScoreLabel: valueScoreLabel(contact, rawContact)
  };
}

function stageAction(
  contact: ContactSummary,
  rawContact: UnknownRecord,
  connection?: UnknownRecord
): ContactPipelineStageActionView | null {
  const connectionId = connection ? stringField(connection, "id") : "";

  if (!connectionId) {
    return null;
  }

  const stage = pipelineStageId(contact, rawContact, connection);

  if (stage === "to_contact") {
    return {
      connectionId,
      label: "开始推进",
      nextRelationshipStage: "active",
      pendingLabel: "推进中",
      successMessage: `已把 ${contact.name} 放入在推进。`
    };
  }

  if (stage === "in_progress") {
    return {
      connectionId,
      label: "放回待联系",
      nextRelationshipStage: "needs_follow_up",
      pendingLabel: "更新中",
      successMessage: `已把 ${contact.name} 放回待联系。`
    };
  }

  return null;
}

export function contactsPipelineToView({
  connectionsPayload,
  contactsPayload
}: ContactPipelineInput): ContactPipelineView {
  const contacts = contactsToSummaries(contactsPayload);
  const rawContacts = listFromPayload(contactsPayload, "contacts");
  const connectionByContactId = connectionsByContactId(connectionsPayload);
  const grouped = new Map<ContactPipelineStageId, ContactPipelineCardView[]>(
    STAGES.map((stage) => [stage.id, []])
  );
  const introCandidates: ContactIntroCandidateView[] = [];

  contacts.forEach((contact, index) => {
    const rawContact = rawContacts[index] ?? {};
    const connection = connectionByContactId.get(contact.id);
    const stage = pipelineStageId(contact, rawContact, connection);

    grouped.get(stage)?.push(contactCard(contact, rawContact, connection));

    if (contact.valueLabels.includes("引荐路径") || hasReferralSource(connection)) {
      introCandidates.push(introCandidate(contact, connection));
    }
  });

  introCandidates.sort((left, right) => {
    const leftScore = Number.parseInt(left.strengthLabel, 10) || 0;
    const rightScore = Number.parseInt(right.strengthLabel, 10) || 0;
    return rightScore - leftScore;
  });

  const toContactCount = grouped.get("to_contact")?.length ?? 0;
  const inProgressCount = grouped.get("in_progress")?.length ?? 0;

  return {
    introReadiness: {
      apiGap: "引荐记录需要后端列表 API。",
      candidates: introCandidates.slice(0, 5),
      summary:
        introCandidates.length > 0
          ? `${introCandidates.length} 位联系人适合先准备引荐。`
          : "还没有适合发起引荐的候选。",
      title: "引荐准备"
    },
    metrics: [
      { label: "联系人", value: String(contacts.length) },
      { label: "待联系", value: String(toContactCount) },
      { label: "在推进", value: String(inProgressCount) },
      { label: "可引荐", value: String(introCandidates.length) }
    ],
    stages: STAGES.map((stage) => {
      const stageContacts = grouped.get(stage.id) ?? [];

      return {
        contacts: stageContacts,
        count: stageContacts.length,
        detail: stage.detail,
        id: stage.id,
        label: stage.label
      };
    }),
    summary:
      contacts.length > 0
        ? `${contacts.length} 位联系人，先处理待联系和可引荐的人。`
        : "还没有联系人进入管线。",
    title: "跟进管线"
  };
}
