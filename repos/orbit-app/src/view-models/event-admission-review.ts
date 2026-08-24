export type EventAdmissionReviewViewName = "pending" | "processed";
export type EventAdmissionDecision = "approve" | "reject";
export type EventAdmissionStatus =
  | "admitted"
  | "pending_review"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

export interface EventAdmissionReviewItemView {
  actorId: string;
  applicationVersion: number;
  displayName: string;
  status: EventAdmissionStatus;
  statusLabel: string;
  submittedLabel: string;
}

export interface EventAdmissionReviewListView {
  items: EventAdmissionReviewItemView[];
  nextCursor: string | null;
  total: number;
  view: EventAdmissionReviewViewName;
}

export interface EventAdmissionApplicationView {
  actorId: string;
  applicationVersion: number;
  decidedLabel: string | null;
  decisionActorId: string | null;
  displayName: string;
  eventId: string;
  interviewResponses: Array<{
    answer: string;
    prompt: string;
    responseId: string;
  }>;
  profileFields: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  status: EventAdmissionStatus;
  statusLabel: string;
  submittedLabel: string;
}

const statuses = [
  "admitted",
  "pending_review",
  "rejected",
  "waitlisted",
  "withdrawn"
] as const satisfies readonly EventAdmissionStatus[];

const statusLabels: Record<EventAdmissionStatus, string> = {
  admitted: "已批准",
  pending_review: "待审核",
  rejected: "已拒绝",
  waitlisted: "候补",
  withdrawn: "已撤回"
};

const profileFields = [
  ["positioning", "身份定位"],
  ["industry", "所在行业"],
  ["targetAttendees", "希望认识的人"],
  ["valueOffered", "我能提供"],
  ["desiredOutcome", "本次目标"],
  ["energyStyle", "交流方式"],
  ["experienceHighlight", "代表经历"],
  ["followUpPreference", "后续偏好"]
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStatus(value: unknown): value is EventAdmissionStatus {
  return typeof value === "string" && statuses.includes(value as EventAdmissionStatus);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function reviewItemToView(value: unknown): EventAdmissionReviewItemView | null {
  if (
    !isRecord(value) ||
    typeof value.actorId !== "string" ||
    !value.actorId.trim() ||
    typeof value.applicationVersion !== "number" ||
    !Number.isSafeInteger(value.applicationVersion) ||
    value.applicationVersion < 1 ||
    !isNullableString(value.displayName) ||
    !isStatus(value.status) ||
    typeof value.submittedAt !== "string"
  ) {
    return null;
  }

  return {
    actorId: value.actorId,
    applicationVersion: value.applicationVersion,
    displayName: value.displayName?.trim() || value.actorId,
    status: value.status,
    statusLabel: statusLabels[value.status],
    submittedLabel: formatTime(value.submittedAt)
  };
}

export function eventAdmissionReviewListToView(
  payload: unknown
): EventAdmissionReviewListView {
  if (!isRecord(payload)) {
    return { items: [], nextCursor: null, total: 0, view: "pending" };
  }

  const view = payload.view === "processed" ? "processed" : "pending";
  const items = Array.isArray(payload.items)
    ? payload.items
        .map(reviewItemToView)
        .filter((item): item is EventAdmissionReviewItemView => item !== null)
    : [];

  return {
    items,
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
    total:
      typeof payload.total === "number" && Number.isSafeInteger(payload.total)
        ? Math.max(0, payload.total)
        : items.length,
    view
  };
}

export function eventAdmissionApplicationToView(
  payload: unknown
): EventAdmissionApplicationView | null {
  if (
    !isRecord(payload) ||
    typeof payload.actorId !== "string" ||
    typeof payload.applicationVersion !== "number" ||
    !Number.isSafeInteger(payload.applicationVersion) ||
    payload.applicationVersion < 1 ||
    typeof payload.eventId !== "string" ||
    !isStatus(payload.status) ||
    typeof payload.submittedAt !== "string" ||
    !isNullableString(payload.decidedAt) ||
    !isNullableString(payload.decisionActorId) ||
    !isRecord(payload.profilePayload) ||
    !isRecord(payload.profilePayload.answers)
  ) {
    return null;
  }

  const snapshot = payload.profilePayload;
  const answers = snapshot.answers as Record<string, unknown>;
  const responses = Array.isArray(snapshot.interviewResponses)
    ? snapshot.interviewResponses.flatMap((response) => {
        if (!isRecord(response) || !isRecord(response.answer)) {
          return [];
        }
        const answer = response.answer.displayText;
        const question = isRecord(response.question) ? response.question.prompt : null;
        if (
          typeof answer !== "string" ||
          typeof response.responseId !== "string"
        ) {
          return [];
        }
        return [{
          answer,
          prompt: typeof question === "string" ? question : "补充回答",
          responseId: response.responseId
        }];
      })
    : [];

  return {
    actorId: payload.actorId,
    applicationVersion: payload.applicationVersion,
    decidedLabel: payload.decidedAt ? formatTime(payload.decidedAt) : null,
    decisionActorId: payload.decisionActorId,
    displayName:
      typeof snapshot.displayName === "string" && snapshot.displayName.trim()
        ? snapshot.displayName.trim()
        : payload.actorId,
    eventId: payload.eventId,
    interviewResponses: responses,
    profileFields: profileFields.map(([key, label]) => ({
      key,
      label,
      value:
        typeof answers[key] === "string" && answers[key].trim()
          ? answers[key].trim()
          : "未填写"
    })),
    status: payload.status,
    statusLabel: statusLabels[payload.status],
    submittedLabel: formatTime(payload.submittedAt)
  };
}

export function buildEventAdmissionDecisionBody(
  application: Pick<EventAdmissionApplicationView, "applicationVersion">,
  decision: EventAdmissionDecision
) {
  return {
    decision,
    expectedApplicationVersion: application.applicationVersion
  };
}
