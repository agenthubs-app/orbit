type UnknownRecord = Record<string, unknown>;

export type PermissionCardTone = "blocked" | "denied" | "pending" | "ready" | "todo";

export interface PermissionCardView {
  actionLabel: string;
  evidence: string[];
  id: string;
  reason: string;
  requiredFor: string;
  stageLabel: string;
  statusLabel: string;
  title: string;
  tone: PermissionCardTone;
}

export interface PermissionStatesView {
  canRequestCalendar: boolean;
  emptyText: string;
  nextAction: string;
  permissions: PermissionCardView[];
  summary: string;
  title: string;
}

export interface CalendarPermissionRequestView {
  detail: string;
  evidenceIds: string[];
  nextAction: string;
  requestId: string;
  statusLabel: string;
  title: string;
}

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

function listField(record: UnknownRecord, fieldName: string): unknown[] {
  const value = record[fieldName];
  return Array.isArray(value) ? value : [];
}

function envelopeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data;
  }

  return data.success === true && "data" in data ? data.data : data;
}

function capabilityTitle(value: string): string {
  switch (value) {
    case "business-card-scan":
      return "名片扫描";
    case "calendar":
      return "日历";
    case "camera":
      return "相机";
    case "chat-analysis":
      return "聊天分析";
    case "contacts":
      return "联系人";
    case "email":
      return "邮件";
    case "event-data":
      return "活动数据";
    case "notifications":
      return "通知";
    default:
      return value || "权限";
  }
}

function statusLabel(value: string): string {
  switch (value) {
    case "authorized":
      return "已可用";
    case "available_after_camera":
      return "等相机权限";
    case "denied":
      return "已拒绝";
    case "not_requested":
      return "待确认";
    case "pending":
      return "待复核";
    default:
      return "待确认";
  }
}

function stageLabel(value: string): string {
  switch (value) {
    case "blocked-by-dependency":
      return "等前置权限";
    case "not-started":
      return "未开始";
    case "ready":
      return "已准备";
    case "staged-review":
      return "待复核";
    default:
      return "未开始";
  }
}

function permissionTone(status: string, stage: string): PermissionCardTone {
  if (status === "authorized") {
    return "ready";
  }

  if (status === "denied") {
    return "denied";
  }

  if (status === "pending" || stage === "staged-review") {
    return "pending";
  }

  if (status === "available_after_camera" || stage === "blocked-by-dependency") {
    return "blocked";
  }

  return "todo";
}

function actionLabel(capability: string, status: string): string {
  if (capability === "calendar" && status === "pending") {
    return "复核日历请求";
  }

  switch (capability) {
    case "business-card-scan":
      return "先处理相机权限";
    case "calendar":
      return "申请日历复核";
    case "camera":
      return "复核相机权限";
    case "chat-analysis":
      return "复核聊天分析";
    case "contacts":
      return "使用联系人资料";
    case "email":
      return "复核邮件上下文";
    case "event-data":
      return "使用活动数据";
    case "notifications":
      return "使用提醒队列";
    default:
      return "查看权限";
  }
}

function requiredForText(capability: string, value: string): string {
  switch (capability) {
    case "business-card-scan":
      return "名片 OCR 复核。";
    case "calendar":
      return "活动准备、会议上下文和跟进时间判断。";
    case "camera":
      return "名片拍摄。";
    case "chat-analysis":
      return "聊天总结和写作辅助。";
    case "contacts":
      return "导入联系人、合并复核和关系搜索。";
    case "email":
      return "邮件线索和跟进上下文。";
    case "event-data":
      return "活动参会者、目标和会前准备。";
    case "notifications":
      return "跟进提醒和行动队列提示。";
    default:
      return value.trim() || "关系工作。";
  }
}

function reasonText(capability: string, status: string): string {
  if (capability === "business-card-scan") {
    return "名片扫描要等相机权限确认后才能继续。";
  }

  if (status === "authorized") {
    switch (capability) {
      case "contacts":
        return "联系人资料已经可以用于关系工作。";
      case "calendar":
        return "日历上下文已经可以用于活动准备。";
      case "event-data":
        return "活动数据已经可以用于会前准备。";
      case "notifications":
        return "提醒会先留在应用内，不会直接发出。";
      default:
        return "这项能力已经可以使用。";
    }
  }

  if (status === "pending") {
    return capability === "calendar"
      ? "日历访问正在等你确认。"
      : "这项权限正在等你复核。";
  }

  if (status === "denied") {
    return "这项权限已被拒绝，需要重新确认后再继续。";
  }

  return "这项能力还没开始确认。";
}

function evidenceLabel(value: string): string {
  switch (value) {
    case "Calendar staging review":
      return "日历复核";
    case "Camera access deferred":
      return "相机权限";
    case "Chat analysis deferred":
      return "聊天分析";
    case "Email context deferred":
      return "邮件上下文";
    case "Event data import rehearsal":
      return "活动数据";
    case "Manual contacts setup":
      return "手动联系人设置";
    case "Notification sandbox":
      return "提醒队列";
    default:
      return value || "来源";
  }
}

function evidenceExcerpt(capability: string, value: string): string {
  switch (capability) {
    case "business-card-scan":
    case "camera":
      return "名片拍摄需要先确认相机访问。";
    case "calendar":
      return "活动准备可以先复核日历访问意图。";
    case "chat-analysis":
      return "聊天总结需要先确认分析权限。";
    case "contacts":
      return "已导入的关系资料可以用于联系人列表。";
    case "email":
      return "邮件上下文需要先确认后再使用。";
    case "event-data":
      return "活动参会者数据带有来源记录。";
    case "notifications":
      return "跟进提醒先留在应用内。";
    default:
      return value.trim();
  }
}

function evidenceView(permission: UnknownRecord, capability: string): string[] {
  return listField(permission, "evidence")
    .filter(isRecord)
    .map((record) => {
      const label = evidenceLabel(stringField(record, "sourceLabel"));
      const excerpt = evidenceExcerpt(capability, stringField(record, "excerpt"));
      return `${label}：${excerpt}`;
    })
    .filter(Boolean);
}

function permissionCard(permission: UnknownRecord): PermissionCardView {
  const capability = stringField(permission, "capability");
  const status = stringField(permission, "status", "not_requested");
  const stage = stringField(permission, "authorizationStage", "not-started");

  return {
    actionLabel: actionLabel(capability, status),
    evidence: evidenceView(permission, capability),
    id: capability || stringField(permission, "label", "permission"),
    reason: reasonText(capability, status),
    requiredFor: requiredForText(capability, stringField(permission, "requiredFor")),
    stageLabel: stageLabel(stage),
    statusLabel: statusLabel(status),
    title: capabilityTitle(capability),
    tone: permissionTone(status, stage)
  };
}

function summaryFor(cards: readonly PermissionCardView[]): string {
  if (cards.length === 0) {
    return "0 项权限需要处理";
  }

  const ready = cards.filter((card) => card.tone === "ready").length;
  const pending = cards.filter((card) => card.tone === "pending").length;
  const blocked = cards.filter((card) => card.tone === "blocked").length;
  const denied = cards.filter((card) => card.tone === "denied").length;
  const todo = cards.filter((card) => card.tone === "todo").length;
  const parts = [
    ready ? `${ready} 项可用` : "",
    pending ? `${pending} 项待复核` : "",
    todo ? `${todo} 项待确认` : "",
    blocked ? `${blocked} 项等前置权限` : "",
    denied ? `${denied} 项已拒绝` : ""
  ].filter(Boolean);

  return parts.join(" · ");
}

function nextActionFor(cards: readonly PermissionCardView[]): string {
  if (cards.length === 0) {
    return "先从活动准备、跟进或名片录入里选择一个要继续的任务。";
  }

  if (cards.some((card) => card.tone === "pending")) {
    return "先处理待复核的权限，再继续活动准备或跟进。";
  }

  if (cards.some((card) => card.tone === "blocked")) {
    return "先处理被前置权限挡住的能力。";
  }

  if (cards.some((card) => card.tone === "todo")) {
    return "先确认要开启的权限，再继续当前任务。";
  }

  return "权限已经就绪，可以继续当前任务。";
}

export function permissionStatesToView(data: unknown): PermissionStatesView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const cards = listField(record, "permissions")
    .filter(isRecord)
    .map(permissionCard);

  return {
    canRequestCalendar:
      !cards.some((card) => card.id === "calendar") ||
      cards.some((card) => card.id === "calendar" && card.tone !== "ready"),
    emptyText: cards.length === 0 ? "还没有需要处理的权限。" : "",
    nextAction: nextActionFor(cards),
    permissions: cards,
    summary: summaryFor(cards),
    title: "权限中心"
  };
}

export function buildCalendarPermissionRequest(input: {
  intent?: string | null;
} = {}): { intent: string } {
  const intent = input.intent?.trim();

  return {
    intent: intent || "connect-event-calendar"
  };
}

function evidenceIdsFromRequest(request: UnknownRecord): string[] {
  return listField(request, "evidenceIds").filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

export function calendarPermissionRequestToView(
  data: unknown
): CalendarPermissionRequestView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const request = isRecord(record.request) ? record.request : {};
  const permission = isRecord(record.permission) ? record.permission : {};
  const capability = stringField(permission, "capability", "calendar");

  return {
    detail: requiredForText(capability, stringField(permission, "requiredFor")),
    evidenceIds: evidenceIdsFromRequest(request),
    nextAction: "留在 Orbit 里复核，不会打开系统日历或外部账号授权。",
    requestId: stringField(request, "id", "permission-request:calendar"),
    statusLabel: statusLabel(stringField(request, "status", "pending")),
    title: "日历权限待复核"
  };
}
