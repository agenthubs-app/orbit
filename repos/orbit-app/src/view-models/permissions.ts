import { createTranslator, type OrbitTranslator } from "../i18n/messages";

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

function capabilityTitle(value: string, t: OrbitTranslator): string {
  switch (value) {
    case "business-card-scan":
      return t("permissions.capabilityBusinessCard");
    case "calendar":
      return t("permissions.capabilityCalendar");
    case "camera":
      return t("permissions.capabilityCamera");
    case "chat-analysis":
      return t("permissions.capabilityChat");
    case "contacts":
      return t("permissions.capabilityContacts");
    case "email":
      return t("permissions.capabilityEmail");
    case "event-data":
      return t("permissions.capabilityEvent");
    case "notifications":
      return t("permissions.capabilityNotifications");
    default:
      return value ? t.literal(value) : t("permissions.capabilityDefault");
  }
}

function statusLabel(value: string, t: OrbitTranslator): string {
  switch (value) {
    case "authorized":
      return t("permissions.statusAuthorized");
    case "available_after_camera":
      return t("permissions.statusAfterCamera");
    case "denied":
      return t("permissions.statusDenied");
    case "not_requested":
      return t("permissions.statusNotRequested");
    case "pending":
      return t("permissions.statusPending");
    default:
      return t("permissions.statusNotRequested");
  }
}

function stageLabel(value: string, t: OrbitTranslator): string {
  switch (value) {
    case "blocked-by-dependency":
      return t("permissions.stageBlocked");
    case "not-started":
      return t("permissions.stageNotStarted");
    case "ready":
      return t("permissions.stageReady");
    case "staged-review":
      return t("permissions.stageReview");
    default:
      return t("permissions.stageNotStarted");
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

function actionLabel(capability: string, status: string, t: OrbitTranslator): string {
  if (capability === "calendar" && status === "pending") {
    return t("permissions.actionReviewCalendar");
  }

  switch (capability) {
    case "business-card-scan":
      return t("permissions.actionCameraFirst");
    case "calendar":
      return t("permissions.requestCalendar");
    case "camera":
      return t("permissions.actionReviewCamera");
    case "chat-analysis":
      return t("permissions.actionReviewChat");
    case "contacts":
      return t("permissions.actionUseContacts");
    case "email":
      return t("permissions.actionReviewEmail");
    case "event-data":
      return t("permissions.actionUseEvent");
    case "notifications":
      return t("permissions.actionUseNotifications");
    default:
      return t("permissions.actionView");
  }
}

function requiredForText(capability: string, value: string, t: OrbitTranslator): string {
  switch (capability) {
    case "business-card-scan":
      return t("permissions.requiredBusinessCard");
    case "calendar":
      return t("permissions.requiredCalendar");
    case "camera":
      return t("permissions.requiredCamera");
    case "chat-analysis":
      return t("permissions.requiredChat");
    case "contacts":
      return t("permissions.requiredContacts");
    case "email":
      return t("permissions.requiredEmail");
    case "event-data":
      return t("permissions.requiredEvent");
    case "notifications":
      return t("permissions.requiredNotifications");
    default:
      return value.trim() ? t.literal(value.trim()) : t("permissions.requiredDefault");
  }
}

function reasonText(capability: string, status: string, t: OrbitTranslator): string {
  if (capability === "business-card-scan") {
    return t("permissions.reasonBusinessCard");
  }

  if (status === "authorized") {
    switch (capability) {
      case "contacts":
        return t("permissions.reasonAuthorizedContacts");
      case "calendar":
        return t("permissions.reasonAuthorizedCalendar");
      case "event-data":
        return t("permissions.reasonAuthorizedEvent");
      case "notifications":
        return t("permissions.reasonAuthorizedNotifications");
      default:
        return t("permissions.reasonAuthorized");
    }
  }

  if (status === "pending") {
    return capability === "calendar"
      ? t("permissions.reasonPendingCalendar")
      : t("permissions.reasonPending");
  }

  if (status === "denied") {
    return t("permissions.reasonDenied");
  }

  return t("permissions.reasonNotStarted");
}

function evidenceLabel(value: string, t: OrbitTranslator): string {
  switch (value) {
    case "Calendar staging review":
      return t("permissions.evidenceCalendar");
    case "Camera access deferred":
      return t("permissions.evidenceCamera");
    case "Chat analysis deferred":
      return t("permissions.evidenceChat");
    case "Email context deferred":
      return t("permissions.evidenceEmail");
    case "Event data import rehearsal":
      return t("permissions.evidenceEvent");
    case "Manual contacts setup":
      return t("permissions.evidenceContacts");
    case "Notification sandbox":
      return t("permissions.evidenceNotifications");
    default:
      return value ? t.literal(value) : t("permissions.evidenceDefault");
  }
}

function evidenceExcerpt(capability: string, value: string, t: OrbitTranslator): string {
  switch (capability) {
    case "business-card-scan":
    case "camera":
      return t("permissions.excerptCamera");
    case "calendar":
      return t("permissions.excerptCalendar");
    case "chat-analysis":
      return t("permissions.excerptChat");
    case "contacts":
      return t("permissions.excerptContacts");
    case "email":
      return t("permissions.excerptEmail");
    case "event-data":
      return t("permissions.excerptEvent");
    case "notifications":
      return t("permissions.excerptNotifications");
    default:
      return t.literal(value.trim());
  }
}

function evidenceView(permission: UnknownRecord, capability: string, t: OrbitTranslator): string[] {
  return listField(permission, "evidence")
    .filter(isRecord)
    .map((record) => {
      const label = evidenceLabel(stringField(record, "sourceLabel"), t);
      const excerpt = evidenceExcerpt(capability, stringField(record, "excerpt"), t);
      return t("permissions.evidencePair", { label, excerpt });
    })
    .filter(Boolean);
}

function permissionCard(permission: UnknownRecord, t: OrbitTranslator): PermissionCardView {
  const capability = stringField(permission, "capability");
  const status = stringField(permission, "status", "not_requested");
  const stage = stringField(permission, "authorizationStage", "not-started");

  return {
    actionLabel: actionLabel(capability, status, t),
    evidence: evidenceView(permission, capability, t),
    id: capability || stringField(permission, "label", "permission"),
    reason: reasonText(capability, status, t),
    requiredFor: requiredForText(capability, stringField(permission, "requiredFor"), t),
    stageLabel: stageLabel(stage, t),
    statusLabel: statusLabel(status, t),
    title: capabilityTitle(capability, t),
    tone: permissionTone(status, stage)
  };
}

function summaryFor(cards: readonly PermissionCardView[], t: OrbitTranslator): string {
  if (cards.length === 0) {
    return t("permissions.summaryNone");
  }

  const ready = cards.filter((card) => card.tone === "ready").length;
  const pending = cards.filter((card) => card.tone === "pending").length;
  const blocked = cards.filter((card) => card.tone === "blocked").length;
  const denied = cards.filter((card) => card.tone === "denied").length;
  const todo = cards.filter((card) => card.tone === "todo").length;
  const parts = [
    ready ? t("permissions.summaryReady", { count: ready }) : "",
    pending ? t("permissions.summaryPending", { count: pending }) : "",
    todo ? t("permissions.summaryTodo", { count: todo }) : "",
    blocked ? t("permissions.summaryBlocked", { count: blocked }) : "",
    denied ? t("permissions.summaryDenied", { count: denied }) : ""
  ].filter(Boolean);

  return parts.join(" · ");
}

function nextActionFor(cards: readonly PermissionCardView[], t: OrbitTranslator): string {
  if (cards.length === 0) {
    return t("permissions.nextNone");
  }

  if (cards.some((card) => card.tone === "pending")) {
    return t("permissions.nextPending");
  }

  if (cards.some((card) => card.tone === "blocked")) {
    return t("permissions.nextBlocked");
  }

  if (cards.some((card) => card.tone === "todo")) {
    return t("permissions.nextTodo");
  }

  return t("permissions.nextReady");
}

export function permissionStatesToView(
  data: unknown,
  t: OrbitTranslator = createTranslator("zh"),
): PermissionStatesView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const cards = listField(record, "permissions")
    .filter(isRecord)
    .map((permission) => permissionCard(permission, t));

  return {
    canRequestCalendar:
      !cards.some((card) => card.id === "calendar") ||
      cards.some((card) => card.id === "calendar" && card.tone !== "ready"),
    emptyText: cards.length === 0 ? t("permissions.empty") : "",
    nextAction: nextActionFor(cards, t),
    permissions: cards,
    summary: summaryFor(cards, t),
    title: t("permissions.title")
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
  data: unknown,
  t: OrbitTranslator = createTranslator("zh"),
): CalendarPermissionRequestView {
  const payload = envelopeData(data);
  const record = isRecord(payload) ? payload : {};
  const request = isRecord(record.request) ? record.request : {};
  const permission = isRecord(record.permission) ? record.permission : {};
  const capability = stringField(permission, "capability", "calendar");

  return {
    detail: requiredForText(capability, stringField(permission, "requiredFor"), t),
    evidenceIds: evidenceIdsFromRequest(request),
    nextAction: t("permissions.calendarReviewNext"),
    requestId: stringField(request, "id", "permission-request:calendar"),
    statusLabel: statusLabel(stringField(request, "status", "pending"), t),
    title: t("permissions.calendarReviewTitle")
  };
}
