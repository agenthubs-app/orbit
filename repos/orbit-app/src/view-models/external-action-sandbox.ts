import {
  confirmationApprovePath,
  confirmationRejectPath
} from "../api/endpoints";

export interface ExternalActionSandboxActionView {
  actionTypeLabel: string;
  canConfirmSend: boolean;
  confirmationId: string;
  confirmationLabel: string;
  id: string;
  requestedEffect: string;
  suppressedEffect: string;
  targetLabel: string;
}

export interface ExternalActionSandboxAuditView {
  actionTypeLabel: string;
  actorLabel: string;
  contextLines: string[];
  evidenceLabel: string;
  id: string;
  providerLabel: string;
  resultLabel: string;
  safetyText: string;
  targetLabel: string;
  timestampLabel: string;
  title: string;
}

export interface ExternalActionSandboxView {
  actions: ExternalActionSandboxActionView[];
  auditRecords: ExternalActionSandboxAuditView[];
  emptyText: string;
  nextAction: string;
  summary: string;
  title: string;
}

export interface ExternalActionNoOpView {
  detail: string;
  message: string;
  title: string;
}

export type ExternalActionConfirmationDecision = "approve" | "reject";

export interface ExternalActionConfirmationDecisionView {
  detail: string;
  message: string;
  title: string;
}

export interface ExternalActionSendMessageRequest {
  actionId: string;
  actorLabel: "移动端用户";
  targetLabel: string;
}

export type ExternalActionConfirmationDecisionRequestResult =
  | {
      request: {
        body: {
          actorLabel: "移动端用户";
        };
        path: string;
      };
      success: true;
    }
  | {
      error: string;
      success: false;
    };

type UnknownRecord = Record<string, unknown>;

const ACTION_TYPE_LABELS: Record<string, string> = {
  "create-calendar-event": "创建日程",
  create_calendar_event: "创建日程",
  deliver_notification: "发送提醒",
  "send-message": "发送消息",
  "update-profile": "更新资料",
  send_message: "发送消息"
};

const PROVIDER_LABELS: Record<string, string> = {
  calendar_provider: "日程",
  message_provider: "消息",
  notification_provider: "提醒"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordInput(value: unknown): UnknownRecord {
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

function booleanField(
  record: UnknownRecord,
  fieldName: string,
  fallback = false
): boolean {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : fallback;
}

function recordField(record: UnknownRecord, fieldName: string): UnknownRecord {
  const value = record[fieldName];
  return isRecord(value) ? value : {};
}

function listField(record: UnknownRecord, fieldName: string): UnknownRecord[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringListField(record: UnknownRecord, fieldName: string): string[] {
  const value = record[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string => typeof item === "string" && item.trim() !== ""
    )
    .map((item) => item.trim());
}

function actionTypeLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? ACTION_TYPE_LABELS[
    actionType.replace(/-/gu, "_")
  ] ?? "对外动作";
}

function providerLabel(providerKind: string): string {
  return PROVIDER_LABELS[providerKind] ?? "对外动作";
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "时间待确认";
  }

  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short"
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayByEnglish: Record<string, string> = {
    Fri: "周五",
    Mon: "周一",
    Sat: "周六",
    Sun: "周日",
    Thu: "周四",
    Tue: "周二",
    Wed: "周三"
  };
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return `${partValue("month")}月${partValue("day")}日 ${
    weekdayByEnglish[partValue("weekday")] ?? ""
  } ${time}`.trim();
}

function auditContextLines(record: UnknownRecord, targetLabel: string): string[] {
  const context = recordField(record, "relationshipContext");
  const contactLabel = stringField(context, "contactLabel", targetLabel);
  const eventLabel = stringField(context, "eventLabel");
  const rationale = stringField(context, "followupRationale");
  const origin = stringField(context, "connectionOrigin");
  const lines = [`对象：${contactLabel}`];

  if (eventLabel) {
    lines.push(`场景：${eventLabel}`);
  }

  if (rationale) {
    lines.push(`理由：${rationale}`);
  }

  if (lines.length < 3 && origin) {
    lines.push(`关系：${origin}`);
  }

  return lines.slice(0, 3);
}

function evidenceLabel(record: UnknownRecord): string {
  const context = recordField(record, "relationshipContext");
  const evidenceCount =
    stringListField(record, "evidenceIds").length ||
    stringListField(context, "sourceContextIds").length;

  return evidenceCount > 0 ? `${evidenceCount} 条依据` : "依据待补";
}

function requestedEffectText(
  actionType: string,
  targetLabel: string
): string {
  if (actionType === "send_message") {
    return `准备向 ${targetLabel} 发送消息。`;
  }

  if (actionType === "create_calendar_event") {
    return `准备为 ${targetLabel} 创建日程。`;
  }

  if (actionType === "deliver_notification") {
    return `准备提醒你处理 ${targetLabel}。`;
  }

  return `准备复核 ${targetLabel} 的对外动作。`;
}

function sandboxActionView(
  record: UnknownRecord,
  index: number
): ExternalActionSandboxActionView {
  const actionType = stringField(record, "actionType");
  const targetLabel = stringField(record, "targetLabel", "联系人");

  return {
    actionTypeLabel: actionTypeLabel(actionType),
    canConfirmSend: actionType === "send_message",
    confirmationId: stringField(record, "confirmationId"),
    confirmationLabel: booleanField(record, "confirmationRequired", true)
      ? "需要确认"
      : "仅记录",
    id: stringField(record, "actionId", `external-action-${index + 1}`),
    requestedEffect: requestedEffectText(actionType, targetLabel),
    suppressedEffect: "不会向外发出，只留下确认记录。",
    targetLabel
  };
}

function auditView(
  record: UnknownRecord,
  index: number
): ExternalActionSandboxAuditView {
  const actionType = stringField(record, "actionType");
  const executed = booleanField(record, "sideEffectExecuted", false);
  const targetLabel = stringField(record, "targetLabel", "联系人");
  const label = actionTypeLabel(actionType);

  return {
    actionTypeLabel: label,
    actorLabel: "移动端用户",
    contextLines: auditContextLines(record, targetLabel),
    evidenceLabel: evidenceLabel(record),
    id: stringField(record, "auditId", `external-action-audit-${index + 1}`),
    providerLabel: providerLabel(stringField(record, "providerKind")),
    resultLabel: executed ? "需要复核" : "未执行对外动作",
    safetyText: executed
      ? "记录显示可能已经对外执行，请复核来源。"
      : "只记录确认，没有执行对外动作。",
    targetLabel,
    timestampLabel: formatDateTime(stringField(record, "recordedAt")),
    title: `${label} · ${targetLabel}`
  };
}

export function externalActionSandboxToView(
  payload: unknown
): ExternalActionSandboxView {
  const record = recordInput(payload);
  const actions = listField(record, "actions").map(sandboxActionView);
  const auditRecords = listField(record, "auditRecords").map(auditView);

  return {
    actions,
    auditRecords,
    emptyText: actions.length || auditRecords.length
      ? ""
      : "还没有进入沙盒的对外动作。",
    nextAction: actions.length
      ? "这里先跑沙盒确认，不会向外发出消息。"
      : "先确认一条 Agent 建议，再看对外动作审计。",
    summary: actions.length || auditRecords.length
      ? `${actions.length} 个待确认动作 · ${auditRecords.length} 条确认记录`
      : "暂无确认记录",
    title: "对外动作确认"
  };
}

export function externalActionNoOpToView(
  payload: unknown
): ExternalActionNoOpView {
  const record = recordInput(payload);
  const actionType = stringField(record, "actionType");
  const targetLabel = stringField(record, "targetLabel", "联系人");

  return {
    detail: `${targetLabel} · ${actionTypeLabel(actionType)}`,
    message: "已记录沙盒确认。没有调用邮件、短信或消息服务。",
    title: "沙盒确认完成"
  };
}

export function externalActionConfirmationDecisionToView(
  payload: unknown
): ExternalActionConfirmationDecisionView {
  const rootRecord = recordInput(payload);
  const record = isRecord(rootRecord.data) ? rootRecord.data : rootRecord;
  const decision = recordField(record, "decision");
  const requirement = recordField(record, "requirement");
  const action = recordField(requirement, "action");
  const status = stringField(record, "state", stringField(decision, "status"));
  const targetLabel = stringField(action, "targetLabel", "联系人");
  const actionLabel = actionTypeLabel(stringField(action, "kind"));

  if (status === "rejected") {
    return {
      detail: `${targetLabel} · ${actionLabel}`,
      message: "这条对外动作仍留在复核边界内。",
      title: "已记录拒绝"
    };
  }

  return {
    detail: `${targetLabel} · ${actionLabel}`,
    message: "只记录这次决定，没有执行对外动作。",
    title: "已记录批准"
  };
}

export function buildExternalActionSendMessageRequest(
  action: Pick<ExternalActionSandboxActionView, "id" | "targetLabel">
): ExternalActionSendMessageRequest {
  return {
    actionId: action.id,
    actorLabel: "移动端用户",
    targetLabel: action.targetLabel
  };
}

export function buildExternalActionConfirmationDecisionRequest(
  action: Pick<
    ExternalActionSandboxActionView,
    "confirmationId" | "id" | "targetLabel"
  >,
  decision: ExternalActionConfirmationDecision
): ExternalActionConfirmationDecisionRequestResult {
  const confirmationId = action.confirmationId.trim();

  if (!confirmationId) {
    return {
      error: "这条确认缺少编号，暂时不能处理。",
      success: false
    };
  }

  return {
    request: {
      body: { actorLabel: "移动端用户" },
      path: decision === "approve"
        ? confirmationApprovePath(confirmationId)
        : confirmationRejectPath(confirmationId)
    },
    success: true
  };
}
