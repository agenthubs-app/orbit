import {
  contactsToSummaries,
  type ContactSummary
} from "./contacts";
import { contactInvitationPath } from "../api/endpoints";

export type ContactPipelineStageId =
  | "to_contact"
  | "in_progress"
  | "nurture"
  | "archived"
  | "partnered";

export type ContactPipelineRelationshipStage =
  | "active"
  | "needs_follow_up"
  | "nurture"
  | "archived";

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
  stageActions: ContactPipelineStageActionView[];
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

export interface ContactInvitationView {
  body: string;
  boundaryText: string;
  canConfirm: boolean;
  id: string;
  nextAction: string;
  recipientLine: string;
  safetyText: string;
  statusLabel: string;
  subject: string;
  title: string;
}

export type ContactInvitationPrepareRequestResult =
  | {
      request: {
        body: {
          contactId: string;
          recipientEmail: string;
          recipientName: string;
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

export type ContactInvitationConfirmRequestResult =
  | {
      request: {
        body: {
          body: string;
          confirmed: true;
          invitationId: string;
          subject: string;
        };
        endpoint: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

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
    detail: "适合低频维护，先保留关系温度。",
    id: "nurture",
    label: "长期维护"
  },
  {
    detail: "当前不用继续推进，可后续恢复。",
    id: "archived",
    label: "暂不跟进"
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

function clean(value: string): string {
  return value.trim();
}

function normalizedEmail(value: string): string {
  return clean(value).toLowerCase();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
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
      "in_progress",
      "培养中",
      "推进中",
      "在推进"
    ].includes(normalized)
  ) {
    return "in_progress";
  }

  if (["dormant", "nurture", "nurtured", "weak", "长期维护"].includes(normalized)) {
    return "nurture";
  }

  if (["archived", "archive", "已归档", "暂不跟进"].includes(normalized)) {
    return "archived";
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
    stageFromToken(connection ? stringField(connection, "relationshipStage") : "") ??
    stageFromToken(stringField(rawContact, "status")) ??
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

export function buildContactInvitationPrepareRequest(input: {
  contactId: string;
  recipientEmail: string;
  recipientName: string;
}): ContactInvitationPrepareRequestResult {
  const contactId = clean(input.contactId);
  const recipientName = clean(input.recipientName);
  const recipientEmail = normalizedEmail(input.recipientEmail);

  if (!contactId || !recipientName || !validEmail(recipientEmail)) {
    return {
      error: "需要联系人、姓名和有效邮箱，才能准备邀请。",
      success: false
    };
  }

  return {
    request: {
      body: {
        contactId,
        recipientEmail,
        recipientName
      },
      endpoint: contactInvitationPath()
    },
    success: true
  };
}

export function buildContactInvitationConfirmRequest(input: {
  body: string;
  invitationId: string;
  subject: string;
}): ContactInvitationConfirmRequestResult {
  const invitationId = clean(input.invitationId);
  const subject = clean(input.subject);
  const body = clean(input.body);

  if (!invitationId || !subject || !body) {
    return {
      error: "需要邀请 ID、主题和正文，才能确认邀请。",
      success: false
    };
  }

  return {
    request: {
      body: {
        body,
        confirmed: true,
        invitationId,
        subject
      },
      endpoint: contactInvitationPath()
    },
    success: true
  };
}

function invitationNextAction(status: string, value: string): string {
  if (status === "ready_for_delivery") {
    return "等邮件投递配置完成后，再决定是否发送。";
  }

  if (/review and edit/iu.test(value) || /confirm it separately/iu.test(value)) {
    return "复核主题和正文，确认后只会进入待投递。";
  }

  return value.trim() || "复核主题和正文，确认后只会进入待投递。";
}

export function contactInvitationToView(payload: unknown): ContactInvitationView {
  const record = isRecord(payload) ? payload : {};
  const status = stringField(record, "status");
  const ready = status === "ready_for_delivery";
  const externalSendRequested = record.externalSendRequested === true;
  const emailProviderRequested = record.emailProviderRequested === true;
  const messageSent = record.messageSent === true;

  return {
    body: stringField(record, "body"),
    boundaryText: `externalSendRequested=${String(
      externalSendRequested
    )} · emailProviderRequested=${String(
      emailProviderRequested
    )} · messageSent=${String(messageSent)}`,
    canConfirm: !ready,
    id: stringField(record, "invitationId"),
    nextAction: invitationNextAction(status, stringField(record, "nextAction")),
    recipientLine: [
      stringField(record, "recipientName", "待确认联系人"),
      stringField(record, "recipientEmail")
    ]
      .filter(Boolean)
      .join(" · "),
    safetyText: ready
      ? "当前只是待投递记录，没有发送邮件。"
      : "确认后也不会发送邮件，只会把邀请标记为待投递。",
    statusLabel: ready ? "待投递" : "草稿待确认",
    subject: stringField(record, "subject"),
    title: ready ? "邀请已确认" : "邀请草稿"
  };
}

function contactCard(
  contact: ContactSummary,
  rawContact: UnknownRecord,
  connection?: UnknownRecord
): ContactPipelineCardView {
  const actions = stageActions(contact, rawContact, connection);

  return {
    detail: contactDetail(contact),
    id: contact.id,
    name: contact.name,
    nextAction: contact.nextAction,
    relationship: contact.relationship,
    stageAction: actions[0] ?? null,
    stageActions: actions,
    valueLabels: contact.valueLabels,
    valueScoreLabel: valueScoreLabel(contact, rawContact)
  };
}

function buildStageAction({
  connectionId,
  label,
  name,
  nextRelationshipStage,
  pendingLabel,
  successMessage
}: {
  connectionId: string;
  label: string;
  name: string;
  nextRelationshipStage: ContactPipelineRelationshipStage;
  pendingLabel: string;
  successMessage: (name: string) => string;
}): ContactPipelineStageActionView {
  return {
    connectionId,
    label,
    nextRelationshipStage,
    pendingLabel,
    successMessage: successMessage(name)
  };
}

function stageActions(
  contact: ContactSummary,
  rawContact: UnknownRecord,
  connection?: UnknownRecord
): ContactPipelineStageActionView[] {
  const connectionId = connection ? stringField(connection, "id") : "";

  if (!connectionId) {
    return [];
  }

  const stage = pipelineStageId(contact, rawContact, connection);
  const action = (
    label: string,
    nextRelationshipStage: ContactPipelineRelationshipStage,
    pendingLabel: string,
    successMessage: (name: string) => string
  ) =>
    buildStageAction({
      connectionId,
      label,
      name: contact.name,
      nextRelationshipStage,
      pendingLabel,
      successMessage
    });

  if (stage === "to_contact") {
    return [
      action("开始推进", "active", "推进中", (name) => `已把 ${name} 放入在推进。`),
      action(
        "暂不跟进",
        "archived",
        "归档中",
        (name) => `已把 ${name} 标记为暂不跟进。`
      )
    ];
  }

  if (stage === "in_progress") {
    return [
      action(
        "放回待联系",
        "needs_follow_up",
        "更新中",
        (name) => `已把 ${name} 放回待联系。`
      ),
      action(
        "转长期维护",
        "nurture",
        "转入中",
        (name) => `已把 ${name} 转入长期维护。`
      )
    ];
  }

  if (stage === "nurture") {
    return [
      action("开始推进", "active", "推进中", (name) => `已把 ${name} 放入在推进。`),
      action(
        "暂不跟进",
        "archived",
        "归档中",
        (name) => `已把 ${name} 标记为暂不跟进。`
      )
    ];
  }

  if (stage === "archived") {
    return [
      action(
        "恢复待联系",
        "needs_follow_up",
        "恢复中",
        (name) => `已把 ${name} 恢复到待联系。`
      )
    ];
  }

  return [
    action("放回在推进", "active", "更新中", (name) => `已把 ${name} 放回在推进。`)
  ];
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
      apiGap: "本次只准备引荐草稿，真正发送前还会再确认。",
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
